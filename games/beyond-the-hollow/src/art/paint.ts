import Phaser from 'phaser';

export type Ctx = CanvasRenderingContext2D;

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Periodic value noise (wraps every `period` units on x) for tileable backgrounds. */
export function makeNoise(seed: number, period = 256) {
  const r = rng(seed);
  const N = 256;
  const g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x: number, y: number) => g[(((y % N) + N) % N) * N + (((x % period) + period) % period) % N];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x: number, y: number, oct = 4) => {
    let s = 0, amp = 0.5, f = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      s += noise(x * f, y * f) * amp;
      tot += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / tot;
  };
}

export function hex(c: string) {
  const v = parseInt(c.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function mix(a: string, b: string, t: number) {
  const A = hex(a), B = hex(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}

export function rgba(c: string, a: number) {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Create (or replace) a Phaser canvas texture and run a painter on it. */
export function paintTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx, w: number, h: number) => void) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  draw(ctx, w, h);
  tex.refresh();
  return tex;
}

/** Paint a sprite sheet by calling draw(ctx, index) per frame with ctx translated to the cell. */
export function paintSheet(scene: Phaser.Scene, key: string, fw: number, fh: number, count: number, cols: number, draw: (ctx: Ctx, i: number) => void) {
  const rows = Math.ceil(count / cols);
  const tex = paintTexture(scene, key, fw * cols, fh * rows, (ctx) => {
    for (let i = 0; i < count; i++) {
      ctx.save();
      ctx.translate((i % cols) * fw, Math.floor(i / cols) * fh);
      ctx.beginPath();
      ctx.rect(0, 0, fw, fh);
      ctx.clip();
      draw(ctx, i);
      ctx.restore();
    }
  });
  for (let i = 0; i < count; i++) tex.add(i, 0, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
  return tex;
}

/** Thick round-capped stroke with dark outline: our "cut-out painted" limb primitive. */
export function limb(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, w: number, color: string, outline = '#0a0d12', ow = 3) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = w + ow * 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function blob(ctx: Ctx, cx: number, cy: number, r: number, rand: () => number, points = 9, jag = 0.25) {
  ctx.beginPath();
  const pts: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (1 - jag / 2 + rand() * jag);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  for (let i = 0; i < points; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % points];
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(p0[0], p0[1], mx, my);
  }
  const p0 = pts[0], p1 = pts[1];
  ctx.quadraticCurveTo(p0[0], p0[1], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2);
  ctx.closePath();
}

export function radial(ctx: Ctx, x: number, y: number, r: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** Scatter soft painterly dabs across a region (used to give flat fills a hand-painted texture). */
export function dabs(ctx: Ctx, x: number, y: number, w: number, h: number, n: number, colors: string[], rmin: number, rmax: number, alpha: number, rand: () => number) {
  for (let i = 0; i < n; i++) {
    const px = x + rand() * w, py = y + rand() * h;
    const r = rmin + rand() * (rmax - rmin);
    ctx.globalAlpha = alpha * (0.4 + rand() * 0.6);
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * (0.4 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
