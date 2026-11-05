import * as THREE from 'three';
import type { CollisionWorld, ColliderOptions } from '../physics/CollisionWorld';
import type { Surface } from '../core/types';
import { softDot } from '../art/Textures';

/** Box whose UVs are in meters, so tiling textures stay consistent at any size. */
export function worldBox(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[face][0], uv.getY(i) * dims[face][1]);
    }
  }
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export interface Opening {
  from: number;
  to: number;
  bottom: number;
  top: number;
}

export interface WallSpec {
  /** 'x': wall runs along X at fixed z. 'z': runs along Z at fixed x. */
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  height: number;
  thickness?: number;
  openings?: Opening[];
  /** Which side faces the room (+1/-1) for trim placement. */
  inside: 1 | -1;
}

const crownMat = new THREE.MeshBasicMaterial({ color: '#0a0b0e' });

export class Builder {
  constructor(
    readonly root: THREE.Object3D,
    readonly world: CollisionWorld,
  ) {}

  add<T extends THREE.Object3D>(o: T): T {
    this.root.add(o);
    return o;
  }

  collide(x: number, y: number, z: number, w: number, h: number, d: number, opts: ColliderOptions = {}) {
    return this.world.addBox(x, y, z, w, h, d, opts);
  }

  /** Solid furniture block: visual is separate; this adds a standable/climbable collider. */
  solid(x: number, y: number, z: number, w: number, h: number, d: number, surface: Surface = 'wood', climbable = false, opts: ColliderOptions = {}) {
    return this.world.addBox(x, y, z, w, h, d, { surface, climbable, ...opts });
  }

  floor(minX: number, maxX: number, minZ: number, maxZ: number, material: THREE.Material, surface: Surface, y = 0): THREE.Mesh {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const m = worldBox(w, 0.1, d, material, (minX + maxX) / 2, y - 0.1, (minZ + maxZ) / 2);
    m.castShadow = false;
    this.add(m);
    this.world.addBox((minX + maxX) / 2, y - 0.5, (minZ + maxZ) / 2, w, 0.5, d, { surface, occluder: false, navBlock: false, solid: false });
    return m;
  }

  ceiling(minX: number, maxX: number, minZ: number, maxZ: number, y: number, material: THREE.Material): THREE.Mesh {
    const m = worldBox(maxX - minX + 0.3, 0.3, maxZ - minZ + 0.3, material, (minX + maxX) / 2, y, (minZ + maxZ) / 2);
    m.receiveShadow = false;
    this.add(m);
    return m;
  }

  wall(spec: WallSpec, material: THREE.Material, trim?: THREE.Material): void {
    const t = spec.thickness ?? 0.14;
    const openings = [...(spec.openings ?? [])].sort((a, b) => a.from - b.from);
    const pieces: { a: number; b: number; y0: number; y1: number }[] = [];
    let cursor = spec.from;
    for (const o of openings) {
      if (o.from > cursor) pieces.push({ a: cursor, b: o.from, y0: 0, y1: spec.height });
      if (o.bottom > 0) pieces.push({ a: o.from, b: o.to, y0: 0, y1: o.bottom });
      if (o.top < spec.height) pieces.push({ a: o.from, b: o.to, y0: o.top, y1: spec.height });
      cursor = o.to;
    }
    if (cursor < spec.to) pieces.push({ a: cursor, b: spec.to, y0: 0, y1: spec.height });
    for (const p of pieces) {
      const len = p.b - p.a;
      const h = p.y1 - p.y0;
      const mid = (p.a + p.b) / 2;
      const [x, z, w, d] = spec.axis === 'x' ? [mid, spec.at, len, t] : [spec.at, mid, t, len];
      // Visuals overlap the ceiling slab so moonlight can't leak through the seam.
      const vh = p.y1 >= spec.height ? h + 0.25 : h;
      const mesh = worldBox(w, vh, d, material, x, p.y0, z);
      this.add(mesh);
      this.world.addBox(x, p.y0, z, w, h, d, { walkable: false, occluder: true, surface: 'wood' });
    }
    if (trim) {
      // Baseboard on the room side, broken at floor openings.
      const bh = 0.14;
      const off = (t / 2 + 0.012) * spec.inside;
      let c = spec.from;
      const floorOpenings = openings.filter((o) => o.bottom <= 0.01);
      for (const o of [...floorOpenings, { from: spec.to, to: spec.to, bottom: 0, top: 0 }]) {
        if (o.from > c + 0.01) {
          const len = o.from - c;
          const mid = (c + o.from) / 2;
          const [x, z, w, d] = spec.axis === 'x' ? [mid, spec.at + off, len, 0.024] : [spec.at + off, mid, 0.024, len];
          const b = worldBox(w, bh, d, trim, x, 0, z);
          b.castShadow = false;
          this.add(b);
          // Crown molding.
          // Unlit dark crown band: hides the bright seam where wall meets ceiling.
          const cm = worldBox(w + 0.02, 0.1, d + 0.03, crownMat, x, spec.height - 0.1, z);
          cm.castShadow = false;
          this.add(cm);
        }
        c = o.to;
      }
    }
  }

  /** Painted frame around a doorway or window opening. */
  frame(axis: 'x' | 'z', at: number, from: number, to: number, bottom: number, top: number, inside: 1 | -1, material: THREE.Material, depth = 0.18): void {
    const w = 0.07;
    const mk = (a: number, b: number, y0: number, y1: number) => {
      const len = b - a;
      const mid = (a + b) / 2;
      const [x, z, sx, sz] = axis === 'x' ? [mid, at, len, depth] : [at, mid, depth, len];
      const m = worldBox(sx, y1 - y0, sz, material, x, y0, z);
      m.castShadow = false;
      this.add(m);
    };
    mk(from - w, from, bottom, top + w);
    mk(to, to + w, bottom, top + w);
    mk(from - w, to + w, top, top + w);
    if (bottom > 0) mk(from - w - 0.03, to + w + 0.03, bottom - 0.04, bottom);
    void inside;
  }
}

/* ----------------------------- storm window ---------------------------- */

export const stormUniforms = {
  uTime: { value: 0 },
  uFlash: { value: 0 },
};

export function stormWindowMaterial(sky: string, horizon: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...stormUniforms,
      uSky: { value: new THREE.Color(sky) },
      uHorizon: { value: new THREE.Color(horizon) },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uFlash; uniform vec3 uSky, uHorizon; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 uv = vUv;
        // glass droplets warp the view
        vec2 cell = floor(uv * vec2(18.0, 10.0));
        float drop = h(cell);
        vec2 local = fract(uv * vec2(18.0, 10.0)) - 0.5;
        float slide = fract(drop * 7.0 - uTime * (0.05 + drop * 0.15));
        local.y += slide - 0.5;
        float d = smoothstep(0.18, 0.0, length(local * vec2(1.0, 0.6))) * step(0.72, drop);
        uv += local * d * 0.05;
        vec3 col = mix(uHorizon, uSky, smoothstep(0.1, 0.9, uv.y));
        // clouds
        float c = n(uv * vec2(3.0, 2.0) + vec2(uTime * 0.02, 0.0)) * 0.6 + n(uv * 7.0 - uTime * 0.03) * 0.4;
        col = mix(col, col * 1.6 + 0.02, smoothstep(0.45, 0.8, c) * smoothstep(0.3, 0.9, uv.y));
        // tree silhouettes swaying
        float sway = sin(uTime * 0.8 + uv.y * 3.0) * 0.015 * uv.y;
        float trees = n(vec2((uv.x + sway) * 9.0, 0.0)) * 0.35 + 0.18 + n(vec2((uv.x + sway) * 31.0, 1.0)) * 0.08;
        float branch = smoothstep(0.02, 0.0, abs(fract((uv.x + sway) * 4.0 + uv.y * 1.5) - 0.5) - 0.47) * step(uv.y, 0.75) * step(0.3, uv.y);
        float tree = max(step(uv.y, trees), branch * 0.8);
        col = mix(col, vec3(0.01, 0.012, 0.02), tree);
        // rain streaks
        float r = h(vec2(floor(uv.x * 160.0), 0.0));
        float streak = step(0.93, fract(uv.y * 3.0 + uTime * (2.0 + r * 2.0) + r * 10.0)) * step(0.6, r);
        col += vec3(0.08, 0.1, 0.13) * streak;
        col += vec3(0.7, 0.75, 0.95) * uFlash * (0.6 + 0.4 * (1.0 - tree));
        col += vec3(0.25, 0.3, 0.4) * d;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/** Additive light shaft (fake volumetric); fades when seen edge-on so it never becomes a line. */
export function lightShaft(width: number, length: number, color: string, opacity = 0.11): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vFacing;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vFacing = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying float vFacing;
      void main() {
        float along = smoothstep(0.0, 0.25, vUv.y) * (0.35 + 0.65 * vUv.y);
        float side = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
        float a = along * side * smoothstep(0.15, 0.6, vFacing) * uOpacity;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
  });
  const geo = new THREE.PlaneGeometry(width, length);
  geo.translate(0, -length / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.userData.baseOpacity = opacity;
  m.userData.shaft = true;
  return m;
}

/** Drifting dust motes in a volume. */
export function dustMotes(count: number, min: THREE.Vector3, max: THREE.Vector3, color = '#cfd8ff'): THREE.Points {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = THREE.MathUtils.lerp(min.x, max.x, Math.random());
    pos[i * 3 + 1] = THREE.MathUtils.lerp(min.y, max.y, Math.random());
    pos[i * 3 + 2] = THREE.MathUtils.lerp(min.z, max.z, Math.random());
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: softDot(), color, size: 0.011, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.userData = { min, max };
  pts.frustumCulled = false;
  return pts;
}

export function animateDust(points: THREE.Points, time: number, dt: number): void {
  const p = points.geometry.attributes.position as THREE.BufferAttribute;
  const { min, max } = points.userData as { min: THREE.Vector3; max: THREE.Vector3 };
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) + Math.sin(time * 0.3 + i) * 0.02 * dt;
    let y = p.getY(i) - 0.012 * dt + Math.sin(time * 0.7 + i * 1.7) * 0.01 * dt;
    if (y < min.y) y = max.y;
    if (x < min.x) x = max.x;
    if (x > max.x) x = min.x;
    p.setXY(i, x, y);
  }
  p.needsUpdate = true;
}

export interface Zone {
  id: string;
  min: THREE.Vector3;
  max: THREE.Vector3;
  once?: boolean;
  fired?: boolean;
  enabled?: () => boolean;
  onEnter: () => void;
}

export function inZone(z: Zone, p: THREE.Vector3): boolean {
  return p.x > z.min.x && p.x < z.max.x && p.y > z.min.y - 0.05 && p.y < z.max.y && p.z > z.min.z && p.z < z.max.z;
}

export function v3(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}
