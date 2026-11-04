import * as THREE from 'three';

export type ParticleShape = 'puff' | 'star' | 'spark' | 'note' | 'heart' | 'drop' | 'confetti' | 'ring' | 'zzz' | 'bolt';
const SHAPES: ParticleShape[] = ['puff', 'star', 'spark', 'note', 'heart', 'drop', 'confetti', 'ring', 'zzz', 'bolt'];
const MAX = 1400;

function atlas(): THREE.CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S * 4;
  c.height = S * 4;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  const cell = (i: number) => [(i % 4) * S, Math.floor(i / 4) * S] as const;
  // puff
  {
    const [x, y] = cell(0);
    const grd = g.createRadialGradient(x + 32, y + 32, 2, x + 32, y + 32, 30);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.75)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x, y, S, S);
    g.fillStyle = '#ffffff';
  }
  // star
  {
    const [x, y] = cell(1);
    g.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 11 : 28;
      g.lineTo(x + 32 + Math.cos(a) * r, y + 32 + Math.sin(a) * r);
    }
    g.fill();
  }
  // spark (4-point)
  {
    const [x, y] = cell(2);
    g.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? 6 : 30;
      g.lineTo(x + 32 + Math.cos(a) * r, y + 32 + Math.sin(a) * r);
    }
    g.fill();
  }
  // note
  {
    const [x, y] = cell(3);
    g.beginPath();
    g.ellipse(x + 24, y + 46, 12, 9, -0.4, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x + 32, y + 10, 6, 38);
    g.beginPath();
    g.moveTo(x + 38, y + 10);
    g.quadraticCurveTo(x + 56, y + 18, x + 52, y + 34);
    g.lineTo(x + 38, y + 22);
    g.fill();
  }
  // heart
  {
    const [x, y] = cell(4);
    g.beginPath();
    g.moveTo(x + 32, y + 54);
    g.bezierCurveTo(x + 2, y + 32, x + 10, y + 6, x + 32, y + 20);
    g.bezierCurveTo(x + 54, y + 6, x + 62, y + 32, x + 32, y + 54);
    g.fill();
  }
  // drop
  {
    const [x, y] = cell(5);
    g.beginPath();
    g.moveTo(x + 32, y + 6);
    g.quadraticCurveTo(x + 52, y + 36, x + 32, y + 56);
    g.quadraticCurveTo(x + 12, y + 36, x + 32, y + 6);
    g.fill();
  }
  // confetti
  {
    const [x, y] = cell(6);
    g.fillRect(x + 18, y + 24, 28, 16);
  }
  // ring
  {
    const [x, y] = cell(7);
    g.lineWidth = 6;
    g.beginPath();
    g.arc(x + 32, y + 32, 24, 0, Math.PI * 2);
    g.stroke();
  }
  // zzz
  {
    const [x, y] = cell(8);
    g.font = '900 40px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('z', x + 32, y + 34);
  }
  // bolt
  {
    const [x, y] = cell(9);
    g.beginPath();
    g.moveTo(x + 36, y + 4);
    g.lineTo(x + 14, y + 36);
    g.lineTo(x + 30, y + 36);
    g.lineTo(x + 24, y + 60);
    g.lineTo(x + 50, y + 26);
    g.lineTo(x + 34, y + 26);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface P {
  life: number;
  max: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  grow: number;
  gravity: number;
  drag: number;
  r: number;
  g: number;
  b: number;
  shape: number;
  spin: number;
  rot: number;
}

export interface BurstOpts {
  count?: number;
  color?: THREE.ColorRepresentation | THREE.ColorRepresentation[];
  speed?: number;
  up?: number;
  size?: number;
  grow?: number;
  life?: number;
  gravity?: number;
  spread?: number;
  drag?: number;
}

/** One Points draw call for every puff, star, note and spark in the game. */
export class Vfx {
  readonly points: THREE.Points;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 4);
  private readonly siz = new Float32Array(MAX);
  private readonly shp = new Float32Array(MAX * 2);
  private readonly ps: P[] = [];
  private readonly tmpC = new THREE.Color();
  rng: () => number = Math.random;
  /** Callers can scale density (low quality). */
  density = 1;

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('shape', new THREE.BufferAttribute(this.shp, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas() }, scale: { value: 600 } },
      vertexShader: `
        attribute vec4 color; attribute float size; attribute vec2 shape;
        varying vec4 vColor; varying vec2 vShape; uniform float scale;
        void main(){
          vColor = color; vShape = shape;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec4 vColor; varying vec2 vShape;
        void main(){
          vec2 p = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) - 0.5;
          float c = cos(vShape.y), s = sin(vShape.y);
          p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + 0.5;
          float idx = vShape.x;
          vec2 cell = vec2(mod(idx, 4.0), 3.0 - floor(idx / 4.0));
          vec4 t = texture2D(map, (cell + clamp(p, 0.02, 0.98)) / 4.0);
          if (t.a * vColor.a < 0.03) discard;
          gl_FragColor = vec4(vColor.rgb * t.rgb, t.a * vColor.a);
        }`,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  setScale(pxHeight: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = pxHeight * 0.9;
  }

  spawn(shape: ParticleShape, x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.ColorRepresentation, size: number, life: number, gravity = 0, grow = 0, drag = 1.5): void {
    if (this.ps.length >= MAX) this.ps.shift();
    this.tmpC.set(color);
    this.ps.push({
      life,
      max: life,
      x,
      y,
      z,
      vx,
      vy,
      vz,
      size,
      grow,
      gravity,
      drag,
      r: this.tmpC.r,
      g: this.tmpC.g,
      b: this.tmpC.b,
      shape: SHAPES.indexOf(shape),
      spin: (this.rng() - 0.5) * 6,
      rot: this.rng() * 6.28,
    });
  }

  burst(shape: ParticleShape, x: number, y: number, z: number, o: BurstOpts = {}): void {
    const n = Math.max(1, Math.round((o.count ?? 12) * this.density));
    const colors = Array.isArray(o.color) ? o.color : [o.color ?? '#ffffff'];
    const sp = o.speed ?? 3;
    for (let i = 0; i < n; i += 1) {
      const a = this.rng() * Math.PI * 2;
      const e = (this.rng() - 0.3) * (o.spread ?? 1);
      const s = sp * (0.5 + this.rng() * 0.6);
      this.spawn(
        shape,
        x,
        y,
        z,
        Math.cos(a) * s,
        (o.up ?? 2) + e * s,
        Math.sin(a) * s,
        colors[i % colors.length],
        (o.size ?? 0.35) * (0.7 + this.rng() * 0.6),
        (o.life ?? 0.8) * (0.7 + this.rng() * 0.6),
        o.gravity ?? 0,
        o.grow ?? 0,
        o.drag ?? 2,
      );
    }
  }

  ring(x: number, y: number, z: number, color: THREE.ColorRepresentation, size = 2, life = 0.5): void {
    this.spawn('ring', x, y, z, 0, 0, 0, color, 0.2, life, 0, size / life, 0);
  }

  /** Short electric arc from a to b. */
  arc(a: THREE.Vector3, b: THREE.Vector3, color: THREE.ColorRepresentation = '#9fe8ff'): void {
    const n = 10;
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const j = Math.sin(t * Math.PI) * 0.35;
      this.spawn(
        'spark',
        a.x + (b.x - a.x) * t + (this.rng() - 0.5) * j,
        a.y + (b.y - a.y) * t + (this.rng() - 0.5) * j,
        a.z + (b.z - a.z) * t + (this.rng() - 0.5) * j,
        0,
        0,
        0,
        color,
        0.32,
        0.18 + this.rng() * 0.1,
      );
    }
  }

  update(dt: number): void {
    const ps = this.ps;
    let w = 0;
    for (let i = 0; i < ps.length; i += 1) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size += p.grow * dt;
      p.rot += p.spin * dt;
      ps[w++] = p;
    }
    ps.length = w;
    for (let i = 0; i < w; i += 1) {
      const p = ps[i];
      const t = p.life / p.max;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.col[i * 4] = p.r;
      this.col[i * 4 + 1] = p.g;
      this.col[i * 4 + 2] = p.b;
      this.col[i * 4 + 3] = Math.min(1, t * 2.5);
      this.siz[i] = p.size * (t < 0.2 ? t / 0.2 : 1) + (1 - t) * p.size * 0.15;
      this.shp[i * 2] = p.shape;
      this.shp[i * 2 + 1] = p.shape === 3 || p.shape === 8 ? 0 : p.rot;
    }
    this.geo.setDrawRange(0, w);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.shape as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.ps.length = 0;
    this.geo.setDrawRange(0, 0);
  }

  get count(): number {
    return this.ps.length;
  }
}
