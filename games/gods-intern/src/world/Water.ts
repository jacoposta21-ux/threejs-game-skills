import * as THREE from 'three';
import type { TerrainData } from './TerrainGen';

const HEIGHT_MIN = -8;
const HEIGHT_RANGE = 16;

const vertex = /* glsl */ `
uniform float uTime;
uniform float uWave;
varying vec3 vWorld;
varying float vBaseY;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vBaseY = world.y;
  float w = sin(world.x * 0.18 + uTime * 1.1) * 0.5 + sin(world.z * 0.23 - uTime * 0.9) * 0.35
          + sin((world.x + world.z) * 0.41 + uTime * 1.7) * 0.15;
  world.y += w * uWave;
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fragment = /* glsl */ `
uniform sampler2D uHeight;
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSky;
uniform float uHalf;
uniform float uDepthScale;
varying vec3 vWorld;
varying float vBaseY;
#include <fog_pars_fragment>
void main() {
  vec2 uv = (vWorld.xz + uHalf) / (uHalf * 2.0);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float ground = texture2D(uHeight, clamp(uv, 0.0, 1.0)).r * ${HEIGHT_RANGE.toFixed(1)} + ${HEIGHT_MIN.toFixed(1)};
  ground = mix(-30.0, ground, inside);
  float depth = max(0.0, vBaseY - ground);
  float shallow = 1.0 - smoothstep(0.0, uDepthScale, depth);
  vec3 col = mix(uDeep, uShallow, shallow);
  // Faceted normal from screen derivatives for the low-poly look.
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  float diff = clamp(dot(n, normalize(uSunDir)), 0.0, 1.0);
  col *= 0.72 + 0.38 * diff;
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 h = normalize(normalize(uSunDir) + viewDir);
  float spec = pow(clamp(dot(n, h), 0.0, 1.0), 60.0) * 0.55;
  float fres = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 3.0);
  col = mix(col, uSky, fres * 0.35);
  // Animated foam bands at the shoreline.
  float band = sin(depth * 9.0 - uTime * 2.2) * 0.5 + 0.5;
  float foam = (1.0 - smoothstep(0.0, 0.45, depth)) * (0.55 + 0.45 * band);
  foam += (1.0 - smoothstep(0.25, 0.9, depth)) * step(0.82, band) * 0.5;
  col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.85);
  col += uSunColor * spec;
  float alpha = mix(0.92, 0.72, shallow);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Ocean, lake and river surfaces sharing one depth-aware stylized shader. */
export class Water {
  readonly group = new THREE.Group();
  readonly materials: THREE.ShaderMaterial[] = [];
  private readonly heightTexture: THREE.DataTexture;

  constructor(terrain: TerrainData) {
    const n = terrain.verts;
    const data = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      const v = Math.max(0, Math.min(1, (terrain.heights[i] - HEIGHT_MIN) / HEIGHT_RANGE));
      data[i * 4] = Math.round(v * 255);
      data[i * 4 + 3] = 255;
    }
    this.heightTexture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
    this.heightTexture.magFilter = THREE.LinearFilter;
    this.heightTexture.minFilter = THREE.LinearFilter;
    this.heightTexture.needsUpdate = true;

    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 180, 180).rotateX(-Math.PI / 2), this.makeMaterial(terrain, 0.32, 3.2, 0x1d5f8a, 0x4fd1c5));
    ocean.renderOrder = 1;
    this.group.add(ocean);

    const lake = terrain.lake;
    const lakeGeo = new THREE.CircleGeometry(lake.radius * 1.12, 40, 0, Math.PI * 2).rotateX(-Math.PI / 2);
    lakeGeo.translate(lake.x, lake.level, lake.z);
    const lakeMesh = new THREE.Mesh(lakeGeo, this.makeMaterial(terrain, 0.06, 1.6, 0x2a7fa3, 0x6fe3d6));
    lakeMesh.renderOrder = 1;
    this.group.add(lakeMesh);

    const river = new THREE.Mesh(this.riverGeometry(terrain), this.makeMaterial(terrain, 0.05, 0.9, 0x2f86a8, 0x7ae6dc));
    river.renderOrder = 1;
    this.group.add(river);
  }

  private makeMaterial(terrain: TerrainData, wave: number, depthScale: number, deep: number, shallow: number): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uWave: { value: wave },
          uHeight: { value: null },
          uDeep: { value: new THREE.Color(deep) },
          uShallow: { value: new THREE.Color(shallow) },
          uFoam: { value: new THREE.Color(0xf4fbff) },
          uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
          uSunColor: { value: new THREE.Color(0xfff3d6) },
          uSky: { value: new THREE.Color(0xa8d8ff) },
          uHalf: { value: terrain.half },
          uDepthScale: { value: depthScale },
        },
      ]),
    });
    mat.uniforms.uHeight.value = this.heightTexture;
    this.materials.push(mat);
    return mat;
  }

  private riverGeometry(terrain: TerrainData): THREE.BufferGeometry {
    const p = terrain.river.points;
    const levels = terrain.river.levels;
    const widths = terrain.river.widths;
    const positions: number[] = [];
    const indices: number[] = [];
    const samples: Array<{ x: number; z: number; y: number; w: number; dx: number; dz: number }> = [];
    const count = p.length / 2;
    for (let i = 0; i < count - 1; i++) {
      const steps = 8;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = p[i * 2] + (p[i * 2 + 2] - p[i * 2]) * t;
        const z = p[i * 2 + 1] + (p[i * 2 + 3] - p[i * 2 + 1]) * t;
        const dx = p[i * 2 + 2] - p[i * 2];
        const dz = p[i * 2 + 3] - p[i * 2 + 1];
        samples.push({ x, z, y: levels[i] + (levels[i + 1] - levels[i]) * t, w: widths[i] + (widths[i + 1] - widths[i]) * t, dx, dz });
      }
    }
    samples.forEach((s, i) => {
      const len = Math.hypot(s.dx, s.dz) || 1;
      const nx = -s.dz / len;
      const nz = s.dx / len;
      const w = s.w * 1.35;
      positions.push(s.x + nx * w, s.y, s.z + nz * w, s.x - nx * w, s.y, s.z - nz * w);
      if (i < samples.length - 1) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    return g;
  }

  update(time: number, sunDir: THREE.Vector3, sunColor: THREE.Color, sky: THREE.Color, night: number): void {
    for (const m of this.materials) {
      m.uniforms.uTime.value = time;
      m.uniforms.uSunDir.value.copy(sunDir);
      m.uniforms.uSunColor.value.copy(sunColor).multiplyScalar(1 - night * 0.6);
      m.uniforms.uSky.value.copy(sky);
    }
  }
}
