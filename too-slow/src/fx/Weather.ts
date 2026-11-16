import * as THREE from 'three';

function spriteTexture(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d')!);
  return new THREE.CanvasTexture(c);
}

/** A thin vertical streak for rain, a soft dot for snow and dust. */
const STREAK = typeof document !== 'undefined' ? spriteTexture((ctx) => {
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(29, 0, 6, 64);
}) : null;
const DOT = typeof document !== 'undefined' ? spriteTexture((ctx) => {
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
}) : null;

/** Snowfall or drifting dust in a box that follows the camera. Cheap: one Points draw. */
export class Weather {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly seed: Float32Array;
  private kind: 'snow' | 'dust' | 'rain' | null = null;
  /** The track's own weather, restored when the rain stops. */
  private base: 'snow' | 'dust' | null = null;
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
    this.base = kind ?? null;
    this.apply(this.base);
  }

  /** Rain over the track's own weather; 0 brings the track's weather back. */
  setRain(k: number): void {
    const want = k > 0.02 ? 'rain' : this.base;
    if (want !== this.kind) this.apply(want);
    if (want === 'rain') (this.points.material as THREE.PointsMaterial).opacity = 0.25 + k * 0.45;
  }

  private apply(kind: 'snow' | 'dust' | 'rain' | null): void {
    this.kind = kind;
    this.points.visible = !!kind;
    const mat = this.points.material as THREE.PointsMaterial;
    mat.map = kind === 'rain' ? STREAK : DOT;
    mat.needsUpdate = true;
    if (kind === 'rain') {
      mat.color.set(0xdcebff);
      mat.size = 0.7;
    } else if (kind === 'dust') {
      mat.color.set(0xfff0c8);
      mat.size = 0.2;
      mat.opacity = 0.55;
    } else {
      mat.color.set(0xffffff);
      mat.size = 0.34;
      mat.opacity = 0.9;
    }
  }

  update(dt: number, time: number, camera: THREE.Camera): void {
    if (!this.kind) return;
    const B = Weather.BOX;
    const half = B / 2;
    const p = this.pos;
    const fall = this.kind === 'rain' ? 22 : this.kind === 'snow' ? 2.2 : 0.25;
    const drift = this.kind === 'rain' ? 0.3 : this.kind === 'snow' ? 0.8 : 2.4;
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
