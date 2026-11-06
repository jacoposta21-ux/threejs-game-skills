import * as THREE from 'three';

interface Particle {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  color: THREE.Color;
  size: number;
  gravity: number;
}

const MAX = 600;
const CONFETTI = 260;

/** Pooled spark particles plus instanced confetti. */
export class Effects {
  readonly root = new THREE.Group();
  private parts: Particle[] = [];
  private points: THREE.Points;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private confetti: THREE.InstancedMesh;
  private conf: { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; life: number }[] = [];
  private _m = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  enabled = true;

  constructor() {
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(MAX * 3), 3);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(MAX * 3), 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(MAX), 1);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    geo.setAttribute('size', this.sizeAttr);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vColor, smoothstep(0.5, 0.0, d));
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < MAX; i += 1)
      this.parts.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, color: new THREE.Color(), size: 0, gravity: 0 });
    const cg = new THREE.PlaneGeometry(0.22, 0.12);
    this.confetti = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONFETTI);
    this.confetti.frustumCulled = false;
    this.confetti.count = 0;
    const palette = ['#ff5d8f', '#ffbe0b', '#3a86ff', '#06d6a0', '#8338ec', '#fb5607', '#ffffff'];
    for (let i = 0; i < CONFETTI; i += 1) {
      this.confetti.setColorAt(i, new THREE.Color(palette[i % palette.length]));
      this.conf.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0 });
    }
    this.root.add(this.points, this.confetti);
  }

  private spawn(pos: THREE.Vector3, vel: THREE.Vector3, color: THREE.ColorRepresentation, life: number, size: number, gravity = 9): void {
    if (!this.enabled) return;
    const p = this.parts.find((q) => !q.alive);
    if (!p) return;
    p.alive = true;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.life = life;
    p.max = life;
    p.color.set(color);
    p.size = size;
    p.gravity = gravity;
  }

  burst(pos: THREE.Vector3, color: THREE.ColorRepresentation, count = 14, speed = 4, size = 0.35): void {
    for (let i = 0; i < count; i += 1) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.spawn(pos, v, color, 0.4 + Math.random() * 0.4, size);
    }
  }

  sparks(pos: THREE.Vector3, strength: number): void {
    const n = Math.min(8, 2 + Math.floor(strength * 6));
    for (let i = 0; i < n; i += 1) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).multiplyScalar(3 + strength * 4);
      this.spawn(pos, v, i % 2 ? '#fff6c2' : '#ffd166', 0.2 + Math.random() * 0.2, 0.18, 6);
    }
  }

  trail(pos: THREE.Vector3, dir: THREE.Vector3, color: THREE.ColorRepresentation): void {
    const v = dir.clone().multiplyScalar(-2).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8));
    this.spawn(pos, v, color, 0.35, 0.3, 0);
  }

  smoke(pos: THREE.Vector3): void {
    for (let i = 0; i < 18; i += 1) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(5);
      this.spawn(pos, v, i % 3 ? '#ffb347' : '#ffffff', 0.5 + Math.random() * 0.4, 0.6, -1);
    }
  }

  celebrate(pos: THREE.Vector3): void {
    if (!this.enabled) return;
    for (let i = 0; i < CONFETTI; i += 1) {
      const c = this.conf[i];
      c.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2));
      c.vel.set((Math.random() - 0.5) * 9, 6 + Math.random() * 9, (Math.random() - 0.5) * 9);
      c.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      c.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      c.life = 3 + Math.random() * 2;
    }
    this.confetti.count = CONFETTI;
    for (let k = 0; k < 4; k += 1) this.burst(pos.clone().add(new THREE.Vector3(0, 2 + k, 0)), ['#ffbe0b', '#ff5d8f', '#3a86ff', '#06d6a0'][k], 24, 7, 0.5);
  }

  clear(): void {
    for (const p of this.parts) p.alive = false;
    this.confetti.count = 0;
  }

  update(dt: number): void {
    let n = 0;
    for (const p of this.parts) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(1 - dt * 1.5);
      p.pos.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      this.posAttr.setXYZ(n, p.pos.x, p.pos.y, p.pos.z);
      this.colAttr.setXYZ(n, p.color.r * k, p.color.g * k, p.color.b * k);
      this.sizeAttr.setX(n, p.size * (0.5 + k * 0.5));
      n += 1;
    }
    this.points.geometry.setDrawRange(0, n);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    if (this.confetti.count > 0) {
      let alive = 0;
      for (let i = 0; i < this.confetti.count; i += 1) {
        const c = this.conf[i];
        c.life -= dt;
        c.vel.y -= 9 * dt;
        c.vel.multiplyScalar(1 - dt * 1.8);
        c.pos.addScaledVector(c.vel, dt);
        c.rot.x += c.spin.x * dt;
        c.rot.y += c.spin.y * dt;
        c.rot.z += c.spin.z * dt;
        const s = c.life > 0 ? 1 : 0;
        if (c.life > 0) alive += 1;
        this._q.setFromEuler(c.rot);
        this._m.compose(c.pos, this._q, new THREE.Vector3(s, s, s));
        this.confetti.setMatrixAt(i, this._m);
      }
      this.confetti.instanceMatrix.needsUpdate = true;
      if (!alive) this.confetti.count = 0;
    }
  }
}
