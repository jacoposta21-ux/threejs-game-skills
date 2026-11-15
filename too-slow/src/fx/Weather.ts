import * as THREE from 'three';

/** Snowfall or drifting dust in a box that follows the camera. Cheap: one Points draw. */
export class Weather {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly seed: Float32Array;
  private kind: 'snow' | 'dust' | null = null;
  private static readonly COUNT = 700;
  private static readonly BOX = 46;

  constructor() {
    const n = Weather.COUNT;
    this.pos = new Float32Array(n * 3);
    this.seed = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      this.pos.set([(Math.random() - 0.5) * Weather.BOX, Math.random() * Weather.BOX * 0.6, (Math.random() - 0.5) * Weather.BOX], i * 3);
      this.seed[i] = Math.random() * 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  setKind(kind: 'snow' | 'dust' | undefined): void {
    this.kind = kind ?? null;
    this.points.visible = !!kind;
    const mat = this.points.material as THREE.PointsMaterial;
    if (kind === 'dust') {
      mat.color.set(0xfff0c8);
      mat.size = 0.12;
      mat.opacity = 0.55;
    } else {
      mat.color.set(0xffffff);
      mat.size = 0.24;
      mat.opacity = 0.9;
    }
  }

  update(dt: number, time: number, camera: THREE.Camera): void {
    if (!this.kind) return;
    const B = Weather.BOX;
    const half = B / 2;
    const p = this.pos;
    const fall = this.kind === 'snow' ? 2.2 : 0.25;
    const drift = this.kind === 'snow' ? 0.8 : 2.4;
    const c = camera.position;
    for (let i = 0; i < Weather.COUNT; i += 1) {
      const k = i * 3;
      const s = this.seed[i];
      p[k] += (Math.sin(time * 0.7 + s) * drift + (this.kind === 'dust' ? 1.5 : 0)) * dt;
      p[k + 1] -= fall * (0.7 + (s % 1) * 0.6) * dt;
      p[k + 2] += Math.cos(time * 0.5 + s * 1.3) * drift * dt;
      // Wrap into a box around the camera.
      const wx = ((((p[k] - c.x + half) % B) + B) % B) - half;
      const wy = ((((p[k + 1] - c.y + 6) % (B * 0.6)) + B * 0.6) % (B * 0.6)) - 6;
      const wz = ((((p[k + 2] - c.z + half) % B) + B) % B) - half;
      p[k] = c.x + wx;
      p[k + 1] = c.y + wy;
      p[k + 2] = c.z + wz;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
