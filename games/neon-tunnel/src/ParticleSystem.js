import * as THREE from 'three';
import { TUNNEL } from './Config.js';

// GPU point-sprite particles. One pooled Points object handles every burst
// (sparks, explosions, pickups, near misses, power-up rings) with zero
// allocation after construction. Dust and speed streaks are separate,
// fixed-size buffers that scroll with the tunnel and wrap around.

const particleVertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 96.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFragment = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    float a = core * core * vAlpha;
    gl_FragColor = vec4(vColor * (0.8 + core * 1.8), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class ParticleSystem {
  constructor(scene, max = 2200) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.locked = new Uint8Array(max);
    this.cursor = 0;
    this.budget = 1;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 400 } };
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: particleVertex, fragmentShader: particleFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  setScale(bufferHeight, fovDeg) {
    this.uniforms.uScale.value = bufferHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  spawn(x, y, z, vx, vy, vz, color, size, life, drag = 1.5, locked = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.colors[i * 3] = color.r;
    this.colors[i * 3 + 1] = color.g;
    this.colors[i * 3 + 2] = color.b;
    this.baseSize[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.locked[i] = locked;
  }

  /** Spherical burst. */
  burst(pos, color, count, speed, size, life, opts = {}) {
    const n = Math.max(1, Math.round(count * this.budget));
    const drag = opts.drag ?? 2.2;
    const locked = opts.locked ?? 1;
    const forward = opts.forward ?? 0;
    for (let k = 0; k < n; k += 1) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const v = speed * (0.35 + Math.random() * 0.65);
      this.spawn(pos.x, pos.y, pos.z, s * Math.cos(th) * v, s * Math.sin(th) * v, u * v + forward, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), drag, locked);
    }
  }

  /** Ring burst in the plane perpendicular to the tunnel axis. */
  ring(pos, color, count, speed, size, life) {
    const n = Math.max(1, Math.round(count * this.budget));
    for (let k = 0; k < n; k += 1) {
      const th = (k / n) * Math.PI * 2;
      this.spawn(pos.x, pos.y, pos.z, Math.cos(th) * speed, Math.sin(th) * speed, 0, color, size, life, 1.2, 1);
    }
  }

  clear() {
    this.life.fill(0);
    this.alphas.fill(0);
  }

  update(dt, scroll) {
    const p = this.positions;
    const v = this.vel;
    for (let i = 0; i < this.max; i += 1) {
      if (this.life[i] <= 0) {
        if (this.alphas[i] !== 0) {
          this.alphas[i] = 0;
          this.sizes[i] = 0;
        }
        continue;
      }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      const damp = Math.exp(-this.drag[i] * dt);
      v[i * 3] *= damp;
      v[i * 3 + 1] *= damp;
      v[i * 3 + 2] *= damp;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt + (this.locked[i] ? scroll : 0);
      // keep sparks inside the tunnel
      const rr = p[i * 3] * p[i * 3] + p[i * 3 + 1] * p[i * 3 + 1];
      if (rr > 35.4) {
        const k = 5.95 / Math.sqrt(rr);
        p[i * 3] *= k;
        p[i * 3 + 1] *= k;
        v[i * 3] *= -0.3;
        v[i * 3 + 1] *= -0.3;
      }
      this.alphas[i] = t;
      this.sizes[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    const g = this.points.geometry.attributes;
    g.position.needsUpdate = true;
    g.aColor.needsUpdate = true;
    g.aSize.needsUpdate = true;
    g.aAlpha.needsUpdate = true;
  }
}

const dustVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uScale;
  uniform float uTime;
  varying float vTw;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vTw = 0.45 + 0.55 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 40.0);
    gl_PointSize = clamp((0.05 + aSeed * 0.09) * uScale / max(0.1, -mv.z), 0.0, 24.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const dustFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vTw;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d) * vTw;
    gl_FragColor = vec4(uColor * 1.4, a * 0.8);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const NEAR_Z = 14;
const FAR_Z = -TUNNEL.length + 16;

export class Dust {
  constructor(scene, count) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.sqrt(Math.random()) * 5.0;
      this.pos[i * 3] = Math.cos(a) * r;
      this.pos[i * 3 + 1] = Math.sin(a) * r;
      this.pos[i * 3 + 2] = FAR_Z + Math.random() * (NEAR_Z - FAR_Z);
      seeds[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.uniforms = { uScale: { value: 400 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(0x6fe9ff) } };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: dustVertex, fragmentShader: dustFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.targetColor = new THREE.Color(0x6fe9ff);
  }

  setColor(hex) {
    this.targetColor.set(hex);
  }

  update(dt, scroll, time) {
    this.uniforms.uTime.value = time;
    this.uniforms.uColor.value.lerp(this.targetColor, 1 - Math.exp(-dt * 1.5));
    const span = NEAR_Z - FAR_Z;
    for (let i = 0; i < this.count; i += 1) {
      let z = this.pos[i * 3 + 2] + scroll * (0.85 + (i % 7) * 0.03);
      if (z > NEAR_Z) z -= span;
      this.pos[i * 3 + 2] = z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

export class SpeedStreaks {
  constructor(scene, count) {
    this.count = count;
    this.pos = new Float32Array(count * 6);
    this.heads = new Float32Array(count * 3);
    const colors = new Float32Array(count * 6);
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = 3.2 + Math.random() * 2.6;
      this.heads[i * 3] = Math.cos(a) * r;
      this.heads[i * 3 + 1] = Math.sin(a) * r;
      this.heads[i * 3 + 2] = FAR_Z * 0.6 + Math.random() * (NEAR_Z - FAR_Z * 0.6);
      const bright = 0.6 + Math.random() * 0.8;
      colors[i * 6] = bright;
      colors[i * 6 + 1] = bright;
      colors[i * 6 + 2] = bright;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  setTint(vec3) {
    this.material.color.setRGB(0.4 + vec3.x * 0.4, 0.4 + vec3.y * 0.4, 0.4 + vec3.z * 0.4);
  }

  update(dt, scroll, speed, boost) {
    const span = NEAR_Z - FAR_Z * 0.6;
    const len = speed * 0.05 * (1 + boost * 1.6);
    this.material.opacity = Math.min(0.9, Math.max(0, (speed - 30) / 55) * 0.55 + boost * 0.45);
    for (let i = 0; i < this.count; i += 1) {
      let z = this.heads[i * 3 + 2] + scroll * 1.25;
      if (z > NEAR_Z) z -= span;
      this.heads[i * 3 + 2] = z;
      const x = this.heads[i * 3];
      const y = this.heads[i * 3 + 1];
      this.pos[i * 6] = x;
      this.pos[i * 6 + 1] = y;
      this.pos[i * 6 + 2] = z;
      this.pos[i * 6 + 3] = x;
      this.pos[i * 6 + 4] = y;
      this.pos[i * 6 + 5] = z - len;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
