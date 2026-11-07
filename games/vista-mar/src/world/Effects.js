import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { terrainHeight } from './Layout.js';

// Phase 5 polish: wind sway for vegetation, car paint, seagulls, sun flare,
// skid marks and the colour-grade post pass.

export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

/**
 * Bends instanced vegetation with height (quadratic falloff), phase-shifted per
 * instance position. Patches the colour material and returns a matching depth
 * material so shadows sway too.
 */
export function addWind(materials, { height = 9, amp = 0.35, freq = 1.3 } = {}) {
  const patch = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #endif
        float hk = clamp(position.y / ${height.toFixed(2)}, 0.0, 1.5);
        float bend = hk * hk * ${amp.toFixed(3)} * uWind;
        float ph = ip.x * 0.13 + ip.z * 0.17;
        transformed.x += (sin(uTime * ${freq.toFixed(2)} + ph) * 0.7 + sin(uTime * ${(freq * 2.7).toFixed(2)} + ph * 3.1) * 0.25) * bend;
        transformed.z += cos(uTime * ${(freq * 0.8).toFixed(2)} + ph * 1.7) * bend * 0.6;
      }`);
  };
  for (const m of materials) {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (s, r) => { if (prev) prev(s, r); patch(s); };
    m.customProgramCacheKey = () => `wind-${height}-${amp}-${freq}`;
    m.needsUpdate = true;
  }
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = patch;
  depth.customProgramCacheKey = () => `winddepth-${height}-${amp}-${freq}`;
  return depth;
}

/** Glossy clear-coated car paint that picks up the sky reflections. */
export function carPaint(src) {
  const m = new THREE.MeshPhysicalMaterial({
    map: src.map, color: src.color.clone(), roughness: 0.32, metalness: 0.35,
    clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2,
  });
  if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
  m.name = src.name;
  return m;
}

// ---------------------------------------------------------------- seagulls
export class Seagulls {
  constructor(scene, count = 26) {
    const shape = new THREE.BufferGeometry();
    // a flat "M" silhouette: two wings angled up from the body
    const v = [
      0, 0, 0.25, -0.55, 0.12, -0.05, 0, 0, -0.2,
      0, 0, 0.25, 0, 0, -0.2, 0.55, 0.12, -0.05,
      -0.55, 0.12, -0.05, -1.0, -0.02, -0.18, -0.5, 0.1, -0.15,
      0.55, 0.12, -0.05, 0.5, 0.1, -0.15, 1.0, -0.02, -0.18,
    ];
    shape.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    shape.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(shape, new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.8, side: THREE.DoubleSide }), count);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.birds = [];
    for (let i = 0; i < count; i++) {
      const flock = i % 3;
      this.birds.push({
        cx: 440 + flock * 35 + Math.random() * 20, cz: -250 + flock * 220 + Math.random() * 40,
        r: 18 + Math.random() * 22, h: 16 + Math.random() * 14, speed: (0.25 + Math.random() * 0.2) * (Math.random() < 0.5 ? 1 : -1),
        a: Math.random() * Math.PI * 2, flap: Math.random() * 10, s: 0.8 + Math.random() * 0.4,
      });
    }
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.p = new THREE.Vector3(); this.sc = new THREE.Vector3();
  }

  update(dt) {
    this.birds.forEach((b, i) => {
      b.a += b.speed * dt;
      b.flap += dt * (6 + Math.sin(b.a * 3) * 3);
      const glide = Math.sin(b.a * 2.3) > 0.4;
      const f = glide ? 0.25 : Math.sin(b.flap);
      this.p.set(b.cx + Math.cos(b.a) * b.r, b.h + Math.sin(b.a * 1.7) * 2, b.cz + Math.sin(b.a) * b.r);
      const heading = Math.atan2(-Math.sin(b.a) * Math.sign(b.speed), Math.cos(b.a) * Math.sign(b.speed));
      this.e.set(0, heading, -Math.sign(b.speed) * 0.35);
      this.q.setFromEuler(this.e);
      this.sc.set(b.s, b.s * (0.4 + f * 0.9), b.s);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.sc));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- sun flare
function flareTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (kind === 'core') { g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.15, 'rgba(255,230,180,0.8)'); g.addColorStop(1, 'rgba(255,180,120,0)'); }
  else { g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.25)'); g.addColorStop(0.85, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SunFlare {
  constructor(scene) {
    this.light = new THREE.Object3D();
    const core = flareTexture('core'), ring = flareTexture('ring');
    this.flare = new Lensflare();
    this.flare.addElement(new LensflareElement(core, 420, 0, new THREE.Color(1, 0.85, 0.7)));
    this.flare.addElement(new LensflareElement(ring, 70, 0.6, new THREE.Color(1, 0.6, 0.4)));
    this.flare.addElement(new LensflareElement(ring, 120, 0.75, new THREE.Color(0.6, 0.8, 1)));
    this.flare.addElement(new LensflareElement(ring, 60, 0.9, new THREE.Color(1, 0.5, 0.8)));
    this.light.add(this.flare);
    scene.add(this.light);
  }

  update(camera, sunDir) {
    const up = sunDir.y > 0.0 && sunDir.y < 0.45;
    this.flare.visible = up;
    this.light.position.copy(camera.position).addScaledVector(sunDir, 2500);
  }
}

// ---------------------------------------------------------------- skid marks
export class SkidMarks {
  constructor(scene, max = 600) {
    const geo = new THREE.PlaneGeometry(0.32, 1).rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x0b0b0b, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.max = max;
    this.next = 0;
    this.last = new Map();
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
    this.up = new THREE.Vector3(0, 1, 0);
  }

  /** Lay a mark segment from the wheel's previous position to its current one. */
  add(key, x, z) {
    const prev = this.last.get(key);
    this.last.set(key, { x, z });
    if (!prev) return;
    const dx = x - prev.x, dz = z - prev.z, len = Math.hypot(dx, dz);
    if (len < 0.05 || len > 3) return;
    this.p.set((x + prev.x) / 2, terrainHeight(x, z) + 0.025, (z + prev.z) / 2);
    this.q.setFromAxisAngle(this.up, Math.atan2(dx, dz));
    this.s.set(1, 1, len);
    this.mesh.setMatrixAt(this.next, this.m.compose(this.p, this.q, this.s));
    this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.max(this.mesh.count, this.next === 0 ? this.max : this.next);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  lift(key) {
    this.last.delete(key);
  }
}

// ---------------------------------------------------------------- colour grade
export function createGradePass() {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uNight: { value: 0 },
      uGolden: { value: 0 },
      uVignette: { value: 0.32 },
      uSat: { value: 1.08 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uNight; uniform float uGolden; uniform float uVignette; uniform float uSat;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 col = c.rgb;
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        // saturation + gentle S-curve contrast
        col = mix(vec3(l), col, uSat + uGolden * 0.08);
        col = mix(col, col * col * (3.0 - 2.0 * col), 0.18);
        // split toning: teal shadows, warm highlights (stronger at golden hour), cool magenta nights
        vec3 shadowTint = mix(vec3(0.0, 0.025, 0.04), vec3(0.03, 0.0, 0.06), uNight);
        vec3 highTint = mix(vec3(0.03, 0.015, -0.01), vec3(0.06, 0.025, -0.02), uGolden);
        col += shadowTint * (1.0 - l) + highTint * l;
        // vignette
        vec2 d = vUv - 0.5;
        col *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
      }`,
  });
}
