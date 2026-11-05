import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glyph, type GlyphKind } from './Textures';

const materialCache = new Map<string, THREE.Material>();
const geometryCache = new Map<string, THREE.BufferGeometry>();

export function mat(key: string, params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const hit = materialCache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...params });
  m.name = key;
  materialCache.set(key, m);
  return m;
}

export function physMat(key: string, params: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial {
  const hit = materialCache.get(key);
  if (hit) return hit as THREE.MeshPhysicalMaterial;
  const m = new THREE.MeshPhysicalMaterial(params);
  m.name = key;
  materialCache.set(key, m);
  return m;
}

export function basicMat(key: string, params: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  const hit = materialCache.get(key);
  if (hit) return hit as THREE.MeshBasicMaterial;
  const m = new THREE.MeshBasicMaterial(params);
  m.name = key;
  materialCache.set(key, m);
  return m;
}

export function clearMaterialCache(): void {
  for (const m of materialCache.values()) m.dispose();
  materialCache.clear();
  for (const g of geometryCache.values()) g.dispose();
  geometryCache.clear();
}

function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  const hit = geometryCache.get(key);
  if (hit) return hit as T;
  const g = make();
  g.userData.shared = true;
  geometryCache.set(key, g);
  return g;
}

export function shadowed<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
    }
  });
  return o;
}

/** Rounded box mesh positioned with its base at y (center x/z). */
export function rbox(w: number, h: number, d: number, material: THREE.Material, radius = 0.02, x = 0, y = 0, z = 0): THREE.Mesh {
  const r = Math.min(radius, w / 2.1, h / 2.1, d / 2.1);
  const g = geo(`rb${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`, () => new RoundedBoxGeometry(w, h, d, 2, r));
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const g = geo(`b${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`, () => new THREE.BoxGeometry(w, h, d));
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cyl(rTop: number, rBottom: number, h: number, material: THREE.Material, segments = 16, x = 0, y = 0, z = 0): THREE.Mesh {
  const g = geo(`c${rTop}|${rBottom}|${h}|${segments}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, segments));
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function sphere(r: number, material: THREE.Material, segments = 16, x = 0, y = 0, z = 0): THREE.Mesh {
  const g = geo(`s${r}|${segments}`, () => new THREE.SphereGeometry(r, segments, Math.max(8, Math.floor(segments * 0.75))));
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function torus(r: number, tube: number, material: THREE.Material, arc = Math.PI * 2): THREE.Mesh {
  const g = geo(`t${r}|${tube}|${arc}`, () => new THREE.TorusGeometry(r, tube, 8, 24, arc));
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  return m;
}

export function plane(w: number, h: number, material: THREE.Material): THREE.Mesh {
  const g = geo(`p${w}|${h}`, () => new THREE.PlaneGeometry(w, h));
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  return m;
}

export function lathe(key: string, points: [number, number][], material: THREE.Material, segments = 20): THREE.Mesh {
  const g = geo(`l${key}`, () => new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments));
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function tube(key: string, points: THREE.Vector3[], radius: number, material: THREE.Material, segments = 24): THREE.Mesh {
  const g = geo(`tube${key}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 6, false));
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  return m;
}

/* ------------------------------------------------------------------ */
/* Shared LUMO light uniforms: glow chalk reads these to reveal itself. */
/* ------------------------------------------------------------------ */

export const lumoUniforms = {
  uLumoPos: { value: new THREE.Vector3(0, -100, 0) },
  uLumoRadius: { value: 0 },
  uTime: { value: 0 },
  uProjector: { value: 0 },
};

/** Grandpa's glow chalk: invisible until LUMO's light is near. */
export function glowChalkMaterial(kind: GlyphKind, color = new THREE.Color('#9fe8ff')): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      ...lumoUniforms,
      uMap: { value: glyph(kind) },
      uColor: { value: color },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform vec3 uLumoPos;
      uniform float uLumoRadius;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        float a = texture2D(uMap, vUv).a;
        float d = distance(vWorld, uLumoPos);
        float reveal = 1.0 - smoothstep(uLumoRadius * 0.55, uLumoRadius, d);
        float shimmer = 0.85 + 0.15 * sin(uTime * 3.0 + vWorld.x * 7.0 + vWorld.y * 5.0);
        float alpha = a * reveal * shimmer;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor * alpha * 1.6, alpha);
      }
    `,
  });
}

/** Projected symbol (magic lantern): visible when uProjector > 0. */
export function projectedGlyphMaterial(kind: GlyphKind): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...lumoUniforms, uMap: { value: glyph(kind) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uProjector; uniform float uTime; varying vec2 vUv;
      void main(){
        float a = texture2D(uMap, vUv).a;
        float halo = smoothstep(0.75, 0.0, distance(vUv, vec2(0.5))) * 0.35;
        float flick = 0.9 + 0.1 * sin(uTime * 17.0) * sin(uTime * 5.3);
        vec3 col = vec3(1.0, 0.78, 0.42) * (a * 1.4 + halo) * flick;
        float alpha = (a + halo) * uProjector;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(col * uProjector, alpha);
      }
    `,
  });
}
