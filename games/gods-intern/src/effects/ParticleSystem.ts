import * as THREE from 'three';

const vertex = /* glsl */ `
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
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const fragment = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
uniform float uSoft;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = (1.0 - smoothstep(uSoft, 0.5, d)) * vAlpha;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;

export interface EmitOptions {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  spread?: number;
  life: number;
  size: number;
  sizeEnd?: number;
  color: THREE.ColorRepresentation;
  colorEnd?: THREE.ColorRepresentation;
  alpha?: number;
  gravity?: number;
  drag?: number;
}

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

/**
 * Fixed-capacity pooled particle system rendered as one THREE.Points draw.
 * No allocation per particle: emit() writes into typed arrays in a ring.
 */
export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly cap: number;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly c0: Float32Array;
  private readonly c1: Float32Array;
  private readonly a0: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private cursor = 0;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  /** Global multiplier set by graphics quality (0.4 low … 1 high). */
  density = 1;
  active = 0;

  constructor(capacity: number, additive: boolean, soft = 0.15) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.c0 = new Float32Array(capacity * 3);
    this.c1 = new Float32Array(capacity * 3);
    this.a0 = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 }, uSoft: { value: soft } },
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 11;
  }

  setViewportHeight(px: number): void {
    this.material.uniforms.uScale.value = px * 0.9;
  }

  emit(o: EmitOptions, count = 1): void {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.cap;
      const sp = o.spread ?? 0;
      this.pos[i * 3] = o.x + (Math.random() - 0.5) * sp;
      this.pos[i * 3 + 1] = o.y + (Math.random() - 0.5) * sp * 0.5;
      this.pos[i * 3 + 2] = o.z + (Math.random() - 0.5) * sp;
      this.vel[i * 3] = (o.vx ?? 0) * (0.6 + Math.random() * 0.8);
      this.vel[i * 3 + 1] = (o.vy ?? 0) * (0.6 + Math.random() * 0.8);
      this.vel[i * 3 + 2] = (o.vz ?? 0) * (0.6 + Math.random() * 0.8);
      this.life[i] = o.life * (0.7 + Math.random() * 0.6);
      this.maxLife[i] = this.life[i];
      this.size0[i] = o.size;
      this.size1[i] = o.sizeEnd ?? o.size;
      tmpA.set(o.color);
      tmpB.set(o.colorEnd ?? o.color);
      this.c0[i * 3] = tmpA.r;
      this.c0[i * 3 + 1] = tmpA.g;
      this.c0[i * 3 + 2] = tmpA.b;
      this.c1[i * 3] = tmpB.r;
      this.c1[i * 3 + 1] = tmpB.g;
      this.c1[i * 3 + 2] = tmpB.b;
      this.a0[i] = o.alpha ?? 1;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 0;
    }
  }

  /** Emit with a random velocity cone; convenience for bursts. */
  burst(o: EmitOptions, count: number, speed: number): void {
    const n = Math.max(1, Math.round(count * this.density));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      this.emit({ ...o, vx: Math.cos(a) * speed * (1 - up * 0.5), vy: (o.vy ?? 0) + up * speed, vz: Math.sin(a) * speed * (1 - up * 0.5) });
    }
  }

  update(dt: number): void {
    let active = 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          this.size[i] = 0;
        }
        continue;
      }
      active++;
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const d = 1 - this.drag[i] * dt;
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      // Fast fade-in, slow fade-out.
      this.alpha[i] = this.a0[i] * Math.min(1, t * 8) * (1 - t * t);
      this.col[i * 3] = this.c0[i * 3] + (this.c1[i * 3] - this.c0[i * 3]) * t;
      this.col[i * 3 + 1] = this.c0[i * 3 + 1] + (this.c1[i * 3 + 1] - this.c0[i * 3 + 1]) * t;
      this.col[i * 3 + 2] = this.c0[i * 3 + 2] + (this.c1[i * 3 + 2] - this.c0[i * 3 + 2]) * t;
    }
    this.active = active;
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) this.geometry.getAttribute(name).needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
  }
}
