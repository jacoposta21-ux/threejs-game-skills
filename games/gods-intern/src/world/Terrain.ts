import * as THREE from 'three';
import { CONFIG } from '../core/Config';
import type { BuildingData, CloudData } from '../core/types';
import { fbm, type TerrainData, WATER_LAKE, WATER_NONE, WATER_RIVER, WATER_SEA } from './TerrainGen';

const MAX_CLOUDS = 6;

const C = {
  seabed: new THREE.Color(0xc9b98a),
  sand: new THREE.Color(0xf1dca2),
  sandWet: new THREE.Color(0xd8c08a),
  grass: new THREE.Color(0x8cc152),
  grassLight: new THREE.Color(0xb3d867),
  meadow: new THREE.Color(0xc9dd6a),
  forest: new THREE.Color(0x5f9e45),
  highland: new THREE.Color(0x7fa65a),
  rock: new THREE.Color(0x9a8f86),
  rockDark: new THREE.Color(0x7d736e),
  cliff: new THREE.Color(0xb59c86),
  snow: new THREE.Color(0xf4f1ea),
  dirt: new THREE.Color(0xc99b62),
  plaza: new THREE.Color(0xd8b27a),
  riverbed: new THREE.Color(0x8fa38a),
};

export interface TerrainUniforms {
  uCursor: { value: THREE.Vector4 };
  uCursorColor: { value: THREE.Color };
  uClouds: { value: THREE.Vector4[] };
  uTime: { value: number };
}

/**
 * Faceted low-poly terrain mesh (non-indexed, one color per triangle).
 * A material patch projects the power targeting ring and rain-cloud shadows
 * directly onto the ground, so they hug hills instead of clipping through them.
 */
export class TerrainMesh {
  readonly mesh: THREE.Mesh;
  readonly uniforms: TerrainUniforms;
  private readonly baseColors: Float32Array;
  private readonly colors: THREE.BufferAttribute;
  private readonly triCell: Uint16Array;
  private wetTimer = 0;

  /**
   * @param centers village plazas (v0.3: one per village)
   * @param roads   flat [ax, az, bx, bz, ...] segments of inter-village roads (from real A* routes)
   */
  constructor(private readonly terrain: TerrainData, buildings: BuildingData[], centers: Array<{ id: string; x: number; z: number }>, roads: number[] = []) {
    const seg = terrain.segments;
    const triCount = seg * seg * 2;
    const positions = new Float32Array(triCount * 9);
    this.baseColors = new Float32Array(triCount * 9);
    this.triCell = new Uint16Array(triCount);
    this.paths = [...this.pathSegments(buildings, centers), ...roads];
    this.centers = centers;
    this.positions = positions;
    this.fillQuads(0, 0, seg - 1, seg - 1);
    const geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(positions, 3);
    geometry.setAttribute('position', this.posAttr);
    this.colors = new THREE.BufferAttribute(this.baseColors.slice(), 3);
    this.colors.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('color', this.colors);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    this.uniforms = {
      uCursor: { value: new THREE.Vector4(0, 0, 0, 0) },
      uCursorColor: { value: new THREE.Color(0x7fd1ff) },
      uClouds: { value: Array.from({ length: MAX_CLOUDS }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uTime: { value: 0 },
    };
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vWorldPos;
uniform vec4 uCursor;
uniform vec3 uCursorColor;
uniform vec4 uClouds[${MAX_CLOUDS}];
uniform float uTime;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
float shade = 0.0;
for (int i = 0; i < ${MAX_CLOUDS}; i++) {
  vec4 c = uClouds[i];
  if (c.z <= 0.0) continue;
  float d = distance(vWorldPos.xz, c.xy);
  shade = max(shade, (1.0 - smoothstep(c.z * 0.55, c.z * 1.05, d)) * c.w);
}
diffuseColor.rgb *= 1.0 - 0.42 * shade;`,
        )
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
if (uCursor.w > 0.0) {
  vec2 dv = vWorldPos.xz - uCursor.xy;
  float d = length(dv);
  float r = uCursor.z;
  float ring = smoothstep(r - 0.32, r - 0.08, d) * (1.0 - smoothstep(r - 0.02, r + 0.22, d));
  float ang = atan(dv.y, dv.x);
  float dash = step(0.35, fract(ang * 3.8197 + uTime * 0.35));
  float fill = (1.0 - smoothstep(r * 0.2, r, d)) * 0.16 + (1.0 - smoothstep(0.0, 0.35, d)) * 0.5;
  float a = clamp(ring * (0.55 + 0.45 * dash) + fill, 0.0, 1.0) * uCursor.w;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uCursorColor, a);
}`,
        );
    };
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
  }

  private paths: number[] = [];
  private centers: Array<{ id: string; x: number; z: number }> = [];
  private positions!: Float32Array;
  private posAttr!: THREE.BufferAttribute;

  /** Write positions, base colors and cell ids for a range of quads (inclusive). */
  private fillQuads(qx0: number, qz0: number, qx1: number, qz1: number): void {
    const terrain = this.terrain;
    const seg = terrain.segments;
    const v = terrain.verts;
    const h = terrain.heights;
    const color = new THREE.Color();
    for (let iz = qz0; iz <= qz1; iz++) {
      for (let ix = qx0; ix <= qx1; ix++) {
        let t = (iz * seg + ix) * 2;
        const i00 = iz * v + ix;
        const i10 = i00 + 1;
        const i01 = i00 + v;
        const i11 = i01 + 1;
        const x0 = -terrain.half + ix * terrain.step;
        const z0 = -terrain.half + iz * terrain.step;
        const x1 = x0 + terrain.step;
        const z1 = z0 + terrain.step;
        // Alternate the diagonal for a less gridded facet pattern.
        const flip = (ix + iz) % 2 === 0;
        const tris = flip
          ? [
              [x0, h[i00], z0, x0, h[i01], z1, x1, h[i10], z0],
              [x1, h[i10], z0, x0, h[i01], z1, x1, h[i11], z1],
            ]
          : [
              [x0, h[i00], z0, x0, h[i01], z1, x1, h[i11], z1],
              [x0, h[i00], z0, x1, h[i11], z1, x1, h[i10], z0],
            ];
        for (const tri of tris) {
          this.positions.set(tri, t * 9);
          const cx = (tri[0] + tri[3] + tri[6]) / 3;
          const cy = (tri[1] + tri[4] + tri[7]) / 3;
          const cz = (tri[2] + tri[5] + tri[8]) / 3;
          // Classify by the whole quad's relief so both triangles agree (no checkerboard).
          const quadRelief = Math.max(h[i00], h[i10], h[i01], h[i11]) - Math.min(h[i00], h[i10], h[i01], h[i11]);
          this.colorFor(cx, cy, cz, quadRelief * 0.85, this.paths, this.centers, color);
          for (let k = 0; k < 3; k++) {
            this.baseColors[t * 9 + k * 3] = color.r;
            this.baseColors[t * 9 + k * 3 + 1] = color.g;
            this.baseColors[t * 9 + k * 3 + 2] = color.b;
          }
          const n = CONFIG.cells.count;
          const ccx = Math.min(n - 1, Math.max(0, Math.floor((cx + terrain.half) / CONFIG.cells.size)));
          const ccz = Math.min(n - 1, Math.max(0, Math.floor((cz + terrain.half) / CONFIG.cells.size)));
          this.triCell[t] = ccz * n + ccx;
          t++;
        }
      }
    }
  }

  /** v0.4: rebuild the mesh inside a world-space box after the heightfield changed (Terraform, craters). */
  updateRegion(x0: number, z0: number, x1: number, z1: number): void {
    const terrain = this.terrain;
    const seg = terrain.segments;
    const q = (w: number) => Math.min(seg - 1, Math.max(0, Math.floor((w + terrain.half) / terrain.step)));
    this.fillQuads(q(x0) - 1 < 0 ? 0 : q(x0) - 1, q(z0) - 1 < 0 ? 0 : q(z0) - 1, Math.min(seg - 1, q(x1) + 1), Math.min(seg - 1, q(z1) + 1));
    this.posAttr.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    (this.colors.array as Float32Array).set(this.baseColors);
    this.colors.needsUpdate = true;
    this.wetTimer = 0;
  }

  /** Straight dirt paths from each building door to its village plaza. */
  private pathSegments(buildings: BuildingData[], centers: Array<{ id: string; x: number; z: number }>): number[] {
    const segs: number[] = [];
    for (const b of buildings) {
      if (b.type === 'well') continue;
      const c = centers.find((v) => v.id === b.villageId) ?? centers[0];
      segs.push(c.x, c.z, b.x, b.z);
    }
    return segs;
  }

  private colorFor(x: number, y: number, z: number, relief: number, paths: number[], centers: Array<{ x: number; z: number }>, out: THREE.Color): void {
    const terrain = this.terrain;
    const water = terrain.waterAt(x, z);
    const slope = relief / terrain.step;
    const n = fbm(x * 0.08, z * 0.08, terrain.seed + 5, 2);
    const n2 = fbm(x * 0.03 + 9, z * 0.03, terrain.seed + 9, 2);
    if (water === WATER_SEA) {
      out.copy(C.seabed).lerp(C.sandWet, Math.max(0, Math.min(1, (y + 3) / 3)));
      return;
    }
    if (water === WATER_LAKE || water === WATER_RIVER) {
      out.copy(C.riverbed).offsetHSL(0, 0, n * 0.04);
      return;
    }
    if (y < 1.25) {
      out.copy(C.sand).lerp(C.sandWet, Math.max(0, 1 - y / 0.6) * 0.6).offsetHSL(0, 0, n * 0.03);
      if (slope > 0.9) out.lerp(C.cliff, 0.5);
      return;
    }
    if (slope > 1.25 || (y > 15 && slope > 0.7)) {
      out.copy(slope > 1.8 ? C.rockDark : C.rock).offsetHSL(0, 0, n * 0.06);
      if (y < 6) out.lerp(C.cliff, 0.45);
      return;
    }
    if (y > 20.5) {
      out.copy(C.snow).lerp(C.rock, Math.max(0, Math.min(0.5, slope)));
      return;
    }
    // Grass family.
    const forestN = fbm(x * 0.045 + 11, z * 0.045 - 4, terrain.seed + 77, 3);
    out.copy(C.grass);
    if (forestN > -0.06) out.lerp(C.forest, Math.min(1, (forestN + 0.06) * 4));
    else out.lerp(C.meadow, Math.min(0.7, -forestN * 3) * (0.5 + n2 * 0.5));
    if (y > 11) out.lerp(C.highland, Math.min(1, (y - 11) / 6));
    if (y > 15.5) out.lerp(C.rock, Math.min(1, (y - 15.5) / 5));
    out.offsetHSL(n * 0.015, 0, n * 0.05);
    if (y < 1.8) out.lerp(C.sand, (1.8 - y) / 0.55 * 0.5);

    // Village plaza and dirt paths.
    for (const center of centers) {
      const dc = Math.hypot(x - center.x, z - center.z);
      if (dc < 4.2) out.lerp(C.plaza, 0.85 * (1 - dc / 6));
    }
    for (let i = 0; i < paths.length; i += 4) {
      // Cheap bounding reject before the exact segment distance.
      if (x < Math.min(paths[i], paths[i + 2]) - 1.5 || x > Math.max(paths[i], paths[i + 2]) + 1.5 || z < Math.min(paths[i + 1], paths[i + 3]) - 1.5 || z > Math.max(paths[i + 1], paths[i + 3]) + 1.5) continue;
      const d = distSeg(x, z, paths[i], paths[i + 1], paths[i + 2], paths[i + 3]);
      if (d < 1.05) {
        out.lerp(C.dirt, 0.75 * (1 - d / 1.3));
        break;
      }
    }
    void WATER_NONE;
  }

  /** Re-tint ground by soil moisture and flooding (throttled). */
  updateWetness(moisture: number[], flood: number[], dt: number): void {
    this.wetTimer -= dt;
    if (this.wetTimer > 0) return;
    this.wetTimer = 0.25;
    const col = this.colors.array as Float32Array;
    const base = this.baseColors;
    const triCount = this.triCell.length;
    for (let t = 0; t < triCount; t++) {
      const cell = this.triCell[t];
      const wet = Math.max(0, Math.min(1, (moisture[cell] - 0.35) / 0.65));
      const f = Math.min(1, flood[cell]);
      const darken = 1 - wet * 0.28 - f * 0.1;
      const blue = f * 0.12;
      const o = t * 9;
      for (let k = 0; k < 9; k += 3) {
        col[o + k] = base[o + k] * darken * (1 - blue);
        col[o + k + 1] = base[o + k + 1] * darken * (1 - blue * 0.5);
        col[o + k + 2] = Math.min(1, base[o + k + 2] * darken + blue * 0.35);
      }
    }
    this.colors.needsUpdate = true;
  }

  setCursor(x: number, z: number, radius: number, color: THREE.ColorRepresentation, active: boolean): void {
    this.uniforms.uCursor.value.set(x, z, radius, active ? 1 : 0);
    this.uniforms.uCursorColor.value.set(color);
  }

  setClouds(clouds: CloudData[]): void {
    const arr = this.uniforms.uClouds.value;
    for (let i = 0; i < MAX_CLOUDS; i++) {
      const c = clouds[i];
      if (c) {
        const life = Math.min(1, (c.duration - c.timeLeft) / 0.8, c.timeLeft / 0.8);
        arr[i].set(c.x, c.z, c.radius, Math.max(0, life));
      } else arr[i].set(0, 0, 0, 0);
    }
  }
}

function distSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
