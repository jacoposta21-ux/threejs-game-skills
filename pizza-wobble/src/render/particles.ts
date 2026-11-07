/** Pooled GPU point particles (dust, sparks, steam, splash, confetti). No per-frame allocation. */
import { AdditiveBlending, BufferAttribute, BufferGeometry, NormalBlending, Points, ShaderMaterial, type Texture } from 'three';

export interface EmitOpts {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  spread?: number;
  life?: number;
  size?: number;
  color?: number;
  gravity?: number;
  drag?: number;
  count?: number;
  grow?: number;
}

export class ParticlePool {
  readonly points: Points;
  private max: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private age: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private grow: Float32Array;
  private baseSize: Float32Array;
  private next = 0;
  private geo: BufferGeometry;

  constructor(max: number, tex: Texture, additive: boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max).fill(1e9);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new BufferAttribute(this.col, 3));
    this.geo.setAttribute('size', new BufferAttribute(this.size, 1));
    this.geo.setAttribute('alpha', new BufferAttribute(this.alpha, 1));
    const mat = new ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float scale;
        void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t=texture2D(map, gl_PointCoord); if (t.a*vA < 0.01) discard; gl_FragColor=vec4(vC*t.rgb, t.a*vA); }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setScale(viewportHeight: number) {
    (this.points.material as ShaderMaterial).uniforms.scale.value = viewportHeight * 0.9;
  }

  emit(o: EmitOpts) {
    const n = o.count ?? 1;
    const spread = o.spread ?? 0.5;
    const r = ((o.color ?? 0xffffff) >> 16) & 255;
    const g = ((o.color ?? 0xffffff) >> 8) & 255;
    const b = (o.color ?? 0xffffff) & 255;
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      this.pos[i * 3] = o.x;
      this.pos[i * 3 + 1] = o.y;
      this.pos[i * 3 + 2] = o.z;
      this.vel[i * 3] = (o.vx ?? 0) + (Math.random() - 0.5) * spread * 2;
      this.vel[i * 3 + 1] = (o.vy ?? 0) + (Math.random() - 0.5) * spread * 2;
      this.vel[i * 3 + 2] = (o.vz ?? 0) + (Math.random() - 0.5) * spread * 2;
      this.col[i * 3] = r / 255;
      this.col[i * 3 + 1] = g / 255;
      this.col[i * 3 + 2] = b / 255;
      this.baseSize[i] = (o.size ?? 0.3) * (0.7 + Math.random() * 0.6);
      this.life[i] = (o.life ?? 1) * (0.7 + Math.random() * 0.6);
      this.age[i] = 0;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 0.5;
      this.grow[i] = o.grow ?? 0;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          this.size[i] = 0;
        }
        continue;
      }
      this.age[i] += dt;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.age[i] / this.life[i];
      this.alpha[i] = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      this.size[i] = this.baseSize[i] * (1 + this.grow[i] * t);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }

  clear() {
    this.age.fill(1e9);
    this.alpha.fill(0);
  }
}
