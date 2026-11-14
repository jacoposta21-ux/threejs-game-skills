import * as THREE from 'three';

/**
 * Pooled effects: one Points cloud for every burst in the game, ribbon trails
 * for slime and boost, and camera-space speed streaks. No allocation at runtime.
 */

const MAX_PARTICLES = 900;

export class Particles {
  readonly points: THREE.Points;
  private readonly pos = new Float32Array(MAX_PARTICLES * 3);
  private readonly col = new Float32Array(MAX_PARTICLES * 4);
  private readonly size = new Float32Array(MAX_PARTICLES);
  private readonly vel = new Float32Array(MAX_PARTICLES * 3);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private readonly gravity = new Float32Array(MAX_PARTICLES);
  private readonly baseSize = new Float32Array(MAX_PARTICLES);
  private cursor = 0;
  private readonly geo = new THREE.BufferGeometry();

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `
        attribute vec4 aColor; attribute float aSize; varying vec4 vColor; uniform float uScale;
        void main(){
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec4 vColor;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          float a = smoothstep(0.5, 0.28, d);
          float hi = smoothstep(0.3, 0.0, length(p + vec2(0.1, 0.12)));
          gl_FragColor = vec4(vColor.rgb + hi * 0.25, vColor.a * a);
          if (gl_FragColor.a < 0.01) discard;
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setViewportHeight(h: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h * 0.9;
  }

  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.Color,
    size: number,
    life: number,
    gravity: number,
    alpha = 1,
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([color.r, color.g, color.b, alpha], i * 4);
    this.size[i] = size;
    this.baseSize[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.gravity[i] = gravity;
  }

  /** Radial burst helper. */
  burst(p: THREE.Vector3, count: number, color: THREE.Color, speed: number, size: number, life: number, gravity: number, up = 1, rnd: () => number = Math.random): void {
    for (let i = 0; i < count; i += 1) {
      const a = rnd() * Math.PI * 2;
      const r = speed * (0.4 + rnd() * 0.6);
      this.emit(p.x, p.y, p.z, Math.cos(a) * r, (0.3 + rnd() * 0.9) * speed * up, Math.sin(a) * r, color, size * (0.6 + rnd() * 0.8), life * (0.6 + rnd() * 0.6), gravity);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      if (k <= 0) {
        this.size[i] = 0;
        this.col[i * 4 + 3] = 0;
        continue;
      }
      this.vel[i * 3 + 1] -= this.gravity[i] * dt;
      const drag = 1 - Math.min(1, dt * 1.2);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * k);
      this.col[i * 4 + 3] = Math.min(1, k * 2.2);
    }
    this.geo.attributes.position.needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.size.fill(0);
    this.col.fill(0);
  }
}

const SEGMENTS = 44;

/** Ribbon trail laid along the ground (slime) or through the air (boost). */
export class Trail {
  readonly mesh: THREE.Mesh;
  private readonly pos = new Float32Array(SEGMENTS * 2 * 3);
  private readonly col = new Float32Array(SEGMENTS * 2 * 4);
  private readonly age = new Float32Array(SEGMENTS).fill(99);
  private head = 0;
  private count = 0;
  private readonly last = new THREE.Vector3(1e9, 0, 0);
  private readonly geo = new THREE.BufferGeometry();
  private readonly side = new THREE.Vector3();

  constructor(
    private readonly color: THREE.Color,
    private readonly width: number,
    private readonly lifetime: number,
    additive: boolean,
    private readonly spacing = 0.45,
  ) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const idx: number[] = [];
    for (let i = 0; i < SEGMENTS - 1; i += 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      fog: true,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** Feed the emitter position; `active` false lets the ribbon fade out and breaks the strip. */
  update(dt: number, p: THREE.Vector3, normal: THREE.Vector3, dirX: number, dirZ: number, active: boolean): void {
    for (let i = 0; i < SEGMENTS; i += 1) this.age[i] += dt;
    if (active && p.distanceToSquared(this.last) > this.spacing * this.spacing) {
      this.last.copy(p);
      // Shift the strip back by one segment (cheap: 44 segments).
      this.pos.copyWithin(6, 0, (SEGMENTS - 1) * 6);
      this.age.copyWithin(1, 0, SEGMENTS - 1);
      this.side.set(dirX, 0, dirZ).cross(normal).normalize().multiplyScalar(this.width * 0.5);
      this.pos.set([p.x - this.side.x, p.y - this.side.y, p.z - this.side.z, p.x + this.side.x, p.y + this.side.y, p.z + this.side.z], 0);
      this.age[0] = 0;
      this.count = Math.min(SEGMENTS, this.count + 1);
    } else if (!active) {
      this.last.set(1e9, 0, 0);
      // Age the head out so a new strip never bridges back to the old one.
      if (this.age[0] < this.lifetime) this.age[0] = Math.max(this.age[0], this.lifetime * 0.999);
    }
    let alive = false;
    for (let i = 0; i < SEGMENTS; i += 1) {
      const k = i < this.count ? Math.max(0, 1 - this.age[i] / this.lifetime) : 0;
      if (k > 0) alive = true;
      const a = k * Math.min(1, (SEGMENTS - i) / 6);
      for (const o of [0, 4]) {
        this.col[i * 8 + o] = this.color.r;
        this.col[i * 8 + o + 1] = this.color.g;
        this.col[i * 8 + o + 2] = this.color.b;
        this.col[i * 8 + o + 3] = a;
      }
    }
    this.mesh.visible = alive;
    if (alive) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
    void this.head;
  }

  clear(): void {
    this.age.fill(99);
    this.count = 0;
    this.last.set(1e9, 0, 0);
    this.mesh.visible = false;
  }
}

const STREAKS = 46;

/** Camera-space speed streaks: thin quads rushing past the edges of the view. */
export class SpeedLines {
  readonly mesh: THREE.InstancedMesh;
  private readonly z = new Float32Array(STREAKS);
  private readonly ang = new Float32Array(STREAKS);
  private readonly rad = new Float32Array(STREAKS);
  private readonly dummy = new THREE.Object3D();
  private intensity = 0;

  constructor(rnd: () => number) {
    const geo = new THREE.PlaneGeometry(0.035, 1);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, STREAKS);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    for (let i = 0; i < STREAKS; i += 1) {
      this.z[i] = -2 - rnd() * 26;
      this.ang[i] = rnd() * Math.PI * 2;
      this.rad[i] = 2.6 + rnd() * 3.6;
    }
  }

  update(dt: number, camera: THREE.Camera, factor: number, boosting: boolean): void {
    const target = THREE.MathUtils.clamp((factor - 0.38) / 0.5, 0, 1) + (boosting ? 0.5 : 0);
    this.intensity += (Math.min(1, target) - this.intensity) * Math.min(1, dt * 4);
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = this.intensity * 0.34;
    this.mesh.visible = this.intensity > 0.02;
    if (!this.mesh.visible) return;
    this.mesh.position.copy(camera.position);
    this.mesh.quaternion.copy(camera.quaternion);
    const rush = (30 + factor * 70) * dt;
    for (let i = 0; i < STREAKS; i += 1) {
      this.z[i] += rush;
      if (this.z[i] > 1) this.z[i] = -26 - (i % 5);
      this.dummy.position.set(Math.cos(this.ang[i]) * this.rad[i], Math.sin(this.ang[i]) * this.rad[i] * 0.62, this.z[i]);
      this.dummy.rotation.set(0, 0, this.ang[i] + Math.PI / 2);
      this.dummy.scale.set(1, 1, 2.5 + this.intensity * 5);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
