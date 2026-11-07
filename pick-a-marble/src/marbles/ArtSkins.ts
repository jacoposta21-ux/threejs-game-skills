/**
 * Illustrated marble skins, painted per pixel in sphere space.
 *
 * Every painter receives the unit direction on the marble surface, so seams,
 * faces and patterns are laid out on the real sphere and never pinch at the
 * poles. The same painter feeds the 3D texture (equirectangular, matching
 * THREE.SphereGeometry UVs) and the shaded UI preview.
 */

export type RGB = [number, number, number];
type Painter = (x: number, y: number, z: number) => RGB;

export interface ArtSkinDef {
  id: string;
  name: string;
  theme: 'Sport' | 'Animals' | 'Food' | 'Space' | 'Faces' | 'Fun';
  price: number;
  level?: number;
  /** Material response. */
  finish: 'gloss' | 'satin' | 'matte' | 'metal' | 'glow';
  paint: Painter;
}

/* ------------------------------------------------------------- helpers */

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const ss = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 1 inside a band of half-width w around 0, soft edge. */
const line = (dist: number, w: number, soft = 0.006): number => 1 - ss(w - soft, w + soft, Math.abs(dist));

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number): number => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

function fbm(x: number, y: number, z: number, oct = 4): number {
  let a = 0.5;
  let s = 0;
  let f = 1;
  for (let i = 0; i < oct; i += 1) {
    s += a * noise3(x * f, y * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

/** Angle-like distance between unit vectors. */
const ang = (x: number, y: number, z: number, c: number[]): number => Math.acos(Math.min(1, Math.max(-1, x * c[0] + y * c[1] + z * c[2])));
const norm = (v: number[]): number[] => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Elliptical spot on the front hemisphere using tangent-plane coords (x right, y up). */
const spot = (x: number, y: number, z: number, cx: number, cy: number, rx: number, ry: number): number => {
  if (z < 0.2) return 0;
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return 1 - ss(0.85, 1.0, Math.sqrt(dx * dx + dy * dy));
};

/** Latitude/longitude helpers. */
const lat = (y: number): number => Math.asin(Math.max(-1, Math.min(1, y)));
const lon = (x: number, z: number): number => Math.atan2(z, x);

/* ------------------------------------------------- geometry for balls */

const PHI = (1 + Math.sqrt(5)) / 2;
const ICOSA = [
  [0, 1, PHI],
  [0, -1, PHI],
  [0, 1, -PHI],
  [0, -1, -PHI],
  [1, PHI, 0],
  [-1, PHI, 0],
  [1, -PHI, 0],
  [-1, -PHI, 0],
  [PHI, 0, 1],
  [-PHI, 0, 1],
  [PHI, 0, -1],
  [-PHI, 0, -1],
].map(norm);
const DODECA: number[][] = [];
for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) DODECA.push(norm([a, b, c]));
for (const a of [-1, 1])
  for (const b of [-1, 1]) {
    DODECA.push(norm([0, a / PHI, b * PHI]));
    DODECA.push(norm([a / PHI, b * PHI, 0]));
    DODECA.push(norm([a * PHI, 0, b / PHI]));
  }
const SOCCER_CENTERS = [...ICOSA.map((c) => ({ c, pent: true })), ...DODECA.map((c) => ({ c, pent: false }))];

/** Tennis/baseball style seam: a closed wave around the sphere. */
const seamDist = (x: number, y: number, z: number): number => lat(y) - 0.62 * Math.sin(2 * lon(x, z));

/* ------------------------------------------------------------ painters */

const soccer: Painter = (x, y, z) => {
  let b1 = -2;
  let b2 = -2;
  let pent = false;
  for (const s of SOCCER_CENTERS) {
    const d = x * s.c[0] + y * s.c[1] + z * s.c[2];
    if (d > b1) {
      b2 = b1;
      b1 = d;
      pent = s.pent;
    } else if (d > b2) b2 = d;
  }
  const seam = line(b1 - b2, 0.012, 0.006);
  const panel = pent ? hex('#1d1f2b') : hex('#f7f7f2');
  const dome = 0.82 + 0.18 * ss(0.86, 1, b1);
  return mix(shade(panel, dome), hex('#3b3d4a'), seam * 0.85);
};

const basketball: Painter = (x, y, z) => {
  const pebble = noise3(x * 90, y * 90, z * 90);
  let c = mix(hex('#c9561c'), hex('#ee8a3c'), 0.45 + 0.35 * fbm(x * 3, y * 3, z * 3));
  c = shade(c, 0.88 + 0.18 * pebble);
  const s = Math.max(line(y, 0.022), line(x, 0.022), line(Math.abs(z) - 0.66, 0.022));
  return mix(c, hex('#1a1210'), s);
};

const tennis: Painter = (x, y, z) => {
  const fuzz = fbm(x * 40, y * 40, z * 40, 3);
  const c = mix(hex('#b9d530'), hex('#e8f56a'), fuzz);
  return mix(c, hex('#f4f6ea'), line(seamDist(x, y, z), 0.07, 0.03));
};

const baseball: Painter = (x, y, z) => {
  const leather = mix(hex('#efe9dc'), hex('#fffdf6'), fbm(x * 8, y * 8, z * 8));
  const d = seamDist(x, y, z);
  const along = lon(x, z) * 26;
  const stitch = Math.max(line(d - 0.08, 0.03), line(d + 0.08, 0.03)) * line(((along % 1) + 1) % 1 - 0.5, 0.26, 0.06);
  const seam = line(d, 0.016) * 0.45;
  return mix(mix(leather, hex('#b9b2a2'), seam), hex('#d2232a'), stitch);
};

const eightBall: Painter = (x, y, z) => {
  const base = mix(hex('#07070b'), hex('#202230'), 0.3 + 0.4 * fbm(x * 2, y * 2, z * 2));
  if (z < 0.6) return base;
  const r = Math.hypot(x, y);
  if (r > 0.42) return base;
  const disc = 1 - ss(0.39, 0.42, r);
  const ring = (cy: number, rad: number): number => line(Math.hypot(x, y - cy) - rad, 0.022, 0.008);
  const eight = Math.max(ring(0.075, 0.06), ring(-0.07, 0.075));
  return mix(base, mix(hex('#fbfbf6'), hex('#0b0b10'), eight), disc);
};

const tiger: Painter = (x0, y0, z) => {
  let x = x0;
  let y = y0;
  const belly = ss(-0.35, -0.75, y);
  const fur = mix(hex('#e9781c'), hex('#ffb04a'), fbm(x * 5, y * 5, z * 5));
  let c = mix(fur, hex('#fff4e2'), belly);
  const warp = fbm(x * 3 + 7, y * 3, z * 3) * 3.2;
  const stripe = Math.sin(lon(x, z) * 9 + warp + y * 1.5);
  const width = 0.72 + belly * 0.22;
  c = mix(c, hex('#140c08'), ss(width, width + 0.05, stripe) * (1 - belly * 0.6));
  // face: eyes and nose on the front (feature coords scaled up)
  ({ x, y } = { x: x / 1.45, y: y / 1.45 });
  const eyeL = spot(x, y, z, -0.22, 0.2, 0.09, 0.06);
  const eyeR = spot(x, y, z, 0.22, 0.2, 0.09, 0.06);
  c = mix(c, hex('#f6d23c'), Math.max(eyeL, eyeR));
  c = mix(c, hex('#0b0b0b'), Math.max(spot(x, y, z, -0.22, 0.2, 0.025, 0.05), spot(x, y, z, 0.22, 0.2, 0.025, 0.05)));
  c = mix(c, hex('#fff4e2'), spot(x, y, z, 0, -0.12, 0.2, 0.15));
  c = mix(c, hex('#d9707a'), spot(x, y, z, 0, -0.02, 0.06, 0.04));
  return c;
};

const panda: Painter = (x0, y0, z) => {
  let x = x0;
  let y = y0;
  let c = mix(hex('#f3f3ef'), hex('#ffffff'), fbm(x * 6, y * 6, z * 6));
  // ears and shoulder band
  const ear = Math.max(ang(x, y, z, norm([-0.45, 0.85, 0.35])) < 0.24 ? 1 : 0, ang(x, y, z, norm([0.45, 0.85, 0.35])) < 0.24 ? 1 : 0);
  const band = ss(-0.25, -0.35, y) * ss(0.4, 0.1, Math.abs(z + 0.1)) ;
  c = mix(c, hex('#18181c'), Math.max(ear, band));
  // eye patches tilted (feature coords scaled up)
  ({ x, y } = { x: x / 1.4, y: y / 1.4 });
  const patch = (sx: number): number => {
    if (z < 0.3) return 0;
    const dx = x - sx * 0.2;
    const dy = y - 0.1;
    const rx = dx * Math.cos(sx * 0.6) + dy * Math.sin(sx * 0.6);
    const ry = -dx * Math.sin(sx * 0.6) + dy * Math.cos(sx * 0.6);
    return 1 - ss(0.85, 1, Math.hypot(rx / 0.1, ry / 0.15));
  };
  c = mix(c, hex('#18181c'), Math.max(patch(-1), patch(1)));
  c = mix(c, hex('#ffffff'), Math.max(spot(x, y, z, -0.19, 0.13, 0.035, 0.035), spot(x, y, z, 0.19, 0.13, 0.035, 0.035)));
  c = mix(c, hex('#18181c'), spot(x, y, z, 0, -0.08, 0.06, 0.04));
  return c;
};

const ladybugSpots = [
  [0.5, 0.35, -0.3],
  [-0.5, 0.35, -0.3],
  [0.6, -0.3, -0.2],
  [-0.6, -0.3, -0.2],
  [0.3, 0.1, -0.9],
  [-0.3, 0.1, -0.9],
  [0.35, -0.6, -0.6],
  [-0.35, -0.6, -0.6],
  [0, 0.9, -0.3],
].map(norm);
const ladybug: Painter = (x, y, z) => {
  let c = mix(hex('#c4141b'), hex('#ff3b30'), 0.4 + 0.5 * fbm(x * 3, y * 3, z * 3));
  if (z > 0.86) {
    c = mix(c, hex('#121214'), ss(0.86, 0.89, z));
    c = mix(c, hex('#ffffff'), Math.max(spot(x, y, z, -0.15, 0.1, 0.06, 0.06), spot(x, y, z, 0.15, 0.1, 0.06, 0.06)));
  }
  c = mix(c, hex('#121214'), line(x, 0.022) * (z < 0.86 ? 1 : 0));
  for (const s of ladybugSpots) c = mix(c, hex('#121214'), 1 - ss(0.18, 0.2, ang(x, y, z, s)));
  return c;
};

const bee: Painter = (x, y, z) => {
  const fuzz = fbm(x * 30, y * 30, z * 30, 3);
  const band = Math.sin(z * 9.5 + 0.6);
  let c = mix(hex('#f5b40a'), hex('#ffd84a'), fuzz);
  c = mix(c, hex('#17120c'), ss(0.25, 0.4, band));
  // head
  c = mix(c, hex('#17120c'), ss(0.9, 0.92, z));
  // wings on top
  const wing = Math.max(1 - ss(0.3, 0.34, ang(x, y, z, norm([0.4, 0.9, -0.1]))), 1 - ss(0.3, 0.34, ang(x, y, z, norm([-0.4, 0.9, -0.1]))));
  c = mix(c, hex('#e9f6ff'), wing * 0.85);
  c = mix(c, hex('#ffffff'), Math.max(spot(x, y, z, -0.12, 0.1, 0.05, 0.05), spot(x, y, z, 0.12, 0.1, 0.05, 0.05)) * (z > 0.92 ? 1 : 0));
  return shade(c, 0.9 + 0.1 * fuzz);
};

const watermelon: Painter = (x, y, z) => {
  const t = lon(x, z) * 8 + fbm(x * 4, y * 4, z * 4) * 2.4 + Math.sin(y * 6) * 0.3;
  const stripe = 0.5 + 0.5 * Math.sin(t);
  let c = mix(hex('#3e8f2d'), hex('#a7d46b'), ss(0.35, 0.65, stripe));
  c = shade(c, 0.85 + 0.2 * fbm(x * 18, y * 18, z * 18, 2));
  return mix(c, hex('#e9f2c2'), ss(0.92, 0.98, Math.abs(y)) * 0.6);
};

const donut: Painter = (x, y, z) => {
  const edge = 0.05 + (fbm(x * 5, y * 5, z * 5) - 0.5) * 0.55 + Math.sin(lon(x, z) * 9) * 0.06;
  const glazed = ss(edge - 0.02, edge + 0.02, y);
  const dough = mix(hex('#b36a2a'), hex('#e5a960'), 0.4 + 0.6 * fbm(x * 9, y * 9, z * 9));
  let c = mix(dough, mix(hex('#ff7eb6'), hex('#ffb3d2'), fbm(x * 3, y * 3, z * 3)), glazed);
  if (glazed > 0.5) {
    const sx = x * 14;
    const sy = y * 14;
    const sz = z * 14;
    const h = hash3(Math.floor(sx), Math.floor(sy), Math.floor(sz));
    if (h > 0.62) {
      const fx = sx - Math.floor(sx) - 0.5;
      const fy = sy - Math.floor(sy) - 0.5;
      const fz = sz - Math.floor(sz) - 0.5;
      const a = h * 9;
      const along = fx * Math.cos(a) + fy * Math.sin(a) + fz * 0.3;
      const across = -fx * Math.sin(a) + fy * Math.cos(a);
      if (Math.abs(along) < 0.32 && Math.abs(across) < 0.08) {
        const cols = ['#ffffff', '#3a86ff', '#ffd60a', '#06d6a0', '#8338ec', '#ff5d8f'];
        c = hex(cols[Math.floor(h * 1000) % cols.length]);
      }
    }
  }
  return c;
};

const strawberry: Painter = (x, y, z) => {
  let c = mix(hex('#b8101d'), hex('#ff3a3a'), 0.35 + 0.6 * fbm(x * 3, y * 3 + 2, z * 3));
  c = mix(c, hex('#ff8f7a'), ss(-0.2, -0.95, y) * 0.35);
  // seeds on a jittered lattice
  const s = 11;
  const gx = Math.floor(x * s);
  const gy = Math.floor(y * s);
  const gz = Math.floor(z * s);
  const h = hash3(gx, gy, gz);
  const cx = (gx + 0.25 + 0.5 * h) / s;
  const cy = (gy + 0.25 + 0.5 * hash3(gy, gz, gx)) / s;
  const cz = (gz + 0.25 + 0.5 * hash3(gz, gx, gy)) / s;
  const d = Math.hypot(x - cx, y - cy, z - cz);
  c = mix(c, hex('#f7d34a'), 1 - ss(0.016, 0.026, d));
  c = mix(c, hex('#7a0a12'), (1 - ss(0.026, 0.045, d)) * ss(0.016, 0.026, d) * 0.5);
  // leafy cap
  const leaf = 0.78 - 0.1 * Math.abs(Math.sin(lon(x, z) * 3.5));
  c = mix(c, mix(hex('#2f8f2a'), hex('#5fc44c'), fbm(x * 9, y * 9, z * 9)), ss(leaf - 0.02, leaf + 0.02, y));
  return c;
};

const craters = Array.from({ length: 26 }, (_, i) => ({ c: norm([hash3(i, 1, 7) - 0.5, hash3(i, 2, 7) - 0.5, hash3(i, 3, 7) - 0.5]), r: 0.08 + hash3(i, 4, 7) * 0.22 }));
const moon: Painter = (x, y, z) => {
  let k = 0.55 + 0.3 * fbm(x * 4, y * 4, z * 4) + 0.1 * fbm(x * 30, y * 30, z * 30, 2);
  const maria = ss(0.52, 0.6, fbm(x * 1.6 + 3, y * 1.6, z * 1.6));
  k -= maria * 0.18;
  for (const cr of craters) {
    const a = ang(x, y, z, cr.c) / cr.r;
    if (a < 1.25) k += a < 0.85 ? -0.12 * (1 - a) : 0.14 * line(a - 1, 0.12, 0.08);
  }
  return mix(hex('#3d3f47'), hex('#e7e6df'), k);
};

const jupiter: Painter = (x, y, z) => {
  const turb = fbm(x * 6, y * 3, z * 6) * 0.35;
  const t = y * 7 + turb * 3;
  const bands = ['#efe1c4', '#c99a6b', '#f4eadb', '#a8673e', '#e6c79b', '#b7835a', '#f2e6cf'].map(hex);
  const f = ((t % bands.length) + bands.length) % bands.length;
  const i = Math.floor(f);
  let c = mix(bands[i], bands[(i + 1) % bands.length], ss(0.35, 0.65, f - i));
  // great red spot
  const spotC = norm([0.6, -0.28, 0.75]);
  const dx = (x - spotC[0]) / 0.22;
  const dy = (y - spotC[1]) / 0.11;
  const dz = (z - spotC[2]) / 0.22;
  const e = Math.hypot(dx, dy, dz);
  c = mix(c, mix(hex('#b8462a'), hex('#e0835a'), e), 1 - ss(0.8, 1, e));
  return c;
};

const sun: Painter = (x, y, z) => {
  const n = fbm(x * 5, y * 5, z * 5, 5);
  const cells = Math.abs(noise3(x * 16, y * 16, z * 16) - 0.5) * 2;
  const k = Math.min(1, n * 1.1 + (1 - cells) * 0.25);
  return mix(mix(hex('#c42f05'), hex('#ff8a00'), k), hex('#fff3a0'), ss(0.62, 0.9, k));
};

const neptune: Painter = (x, y, z) => {
  const t = y * 4 + fbm(x * 3, y * 6, z * 3) * 1.4;
  const c = mix(hex('#1a3fa8'), hex('#4f9cf0'), 0.5 + 0.5 * Math.sin(t * 2));
  return mix(c, hex('#dbeaff'), line(y - 0.35 - fbm(x * 8, 0, z * 8) * 0.08, 0.02, 0.02) * 0.7);
};

const smiley: Painter = (X, Y, z) => {
  const x = X / 1.55;
  const y = Y / 1.55;
  let c = mix(hex('#ffc400'), hex('#ffe066'), 0.5 + 0.4 * y);
  c = mix(c, hex('#2a1a05'), Math.max(spot(x, y, z, -0.18, 0.16, 0.06, 0.11), spot(x, y, z, 0.18, 0.16, 0.06, 0.11)));
  if (z > 0.4 && y < 0.02) c = mix(c, hex('#2a1a05'), line(Math.hypot(x, (y - 0.12) * 1.15) - 0.36, 0.035) * ss(0.1, 0.0, y));
  c = mix(c, hex('#ff7b6b'), Math.max(spot(x, y, z, -0.38, -0.08, 0.08, 0.05), spot(x, y, z, 0.38, -0.08, 0.08, 0.05)) * 0.6);
  return c;
};

const cool: Painter = (X, Y, z) => {
  const x = X / 1.55;
  const y = Y / 1.55;
  let c = mix(hex('#ffb300'), hex('#ffe066'), 0.5 + 0.4 * y);
  if (z > 0.3) {
    const lens = Math.max(spot(x, y, z, -0.2, 0.15, 0.17, 0.1), spot(x, y, z, 0.2, 0.15, 0.17, 0.1));
    const bridge = line(y - 0.2, 0.025) * line(x, 0.3);
    c = mix(c, hex('#0d0d14'), Math.max(lens, bridge));
    c = mix(c, hex('#6f7cff'), lens * ss(0.0, 0.2, y - 0.12 + x * 0.3) * 0.35);
    if (y < 0) c = mix(c, hex('#3a1d05'), line(Math.hypot(x - 0.06, (y - 0.02) * 1.3) - 0.3, 0.03) * ss(-0.05, -0.12, y) * ss(-0.32, -0.05, x));
  }
  return c;
};

const alien: Painter = (X, Y, z) => {
  const x = X / 1.55;
  const y = Y / 1.55;
  let c = mix(hex('#2fbf4f'), hex('#8ef06a'), 0.4 + 0.5 * fbm(x * 3, y * 3, z * 3));
  if (z > 0.3) {
    const eye = (sx: number): number => {
      const dx = x - sx * 0.22;
      const dy = y - 0.08;
      const rx = dx * Math.cos(sx * 0.5) + dy * Math.sin(sx * 0.5);
      const ry = -dx * Math.sin(sx * 0.5) + dy * Math.cos(sx * 0.5);
      return 1 - ss(0.85, 1, Math.hypot(rx / 0.16, ry / 0.09));
    };
    const e = Math.max(eye(-1), eye(1));
    c = mix(c, hex('#06070c'), e);
    c = mix(c, hex('#ffffff'), Math.max(spot(x, y, z, -0.26, 0.13, 0.03, 0.03), spot(x, y, z, 0.18, 0.13, 0.03, 0.03)) * e);
    c = mix(c, hex('#145f26'), line(Math.hypot(x, y + 0.08) - 0.12, 0.015) * ss(-0.12, -0.2, y));
  }
  return c;
};

const eyeball: Painter = (x, y, z) => {
  let c = mix(hex('#f4f1ec'), hex('#ffffff'), fbm(x * 5, y * 5, z * 5));
  // veins
  const v = Math.abs(fbm(x * 7, y * 7, z * 7, 4) - 0.5);
  c = mix(c, hex('#d23b3b'), (1 - ss(0.0, 0.02, v)) * ss(0.4, -0.3, z) * 0.85);
  const a = ang(x, y, z, [0, 0, 1]);
  const iris = 1 - ss(0.5, 0.53, a);
  const radial = 0.5 + 0.5 * Math.sin(Math.atan2(y, x) * 36 + fbm(x * 9, y * 9, 0) * 6);
  c = mix(c, mix(hex('#1f6fd1'), hex('#7cc8ff'), radial * (a / 0.5)), iris);
  c = mix(c, hex('#0b2a55'), line(a - 0.5, 0.025, 0.02) * 0.8);
  c = mix(c, hex('#050507'), 1 - ss(0.19, 0.21, a));
  c = mix(c, hex('#ffffff'), 1 - ss(0.04, 0.06, ang(x, y, z, norm([-0.12, 0.14, 1]))));
  return c;
};

const pumpkin: Painter = (x0, y0, z) => {
  let x = x0;
  let y = y0;
  const rib = Math.abs(Math.cos(lon(x, z) * 5));
  let c = mix(hex('#c9520c'), hex('#ff9a2e'), rib * 0.8 + 0.2 * fbm(x * 6, y * 6, z * 6));
  c = shade(c, 0.75 + 0.25 * rib);
  c = mix(c, hex('#4c7a23'), ss(0.9, 0.93, y));
  if (z > 0.3) {
    x /= 1.5;
    y /= 1.5;
    const tri = (cx: number): number => {
      const dx = Math.abs(x - cx);
      const dy = y - 0.12;
      return dy > -0.06 && dy < 0.1 && dx < 0.09 - dy * 0.9 ? 1 : 0;
    };
    const mouth = y < -0.05 && y > -0.3 && Math.abs(x) < 0.33 ? (y + 0.18 - 0.08 * Math.cos(x * 9) > 0 ? 0 : 1) * (y > -0.28 + Math.abs(x) * 0.3 ? 1 : 0) : 0;
    c = mix(c, hex('#ffd34d'), Math.max(tri(-0.2), tri(0.2), mouth));
  }
  return c;
};

const disco: Painter = (x, y, z) => {
  const la = lat(y);
  const rows = 26;
  const r = Math.floor(((la + Math.PI / 2) / Math.PI) * rows);
  const cols = Math.max(4, Math.round(rows * 2 * Math.cos(((r + 0.5) / rows) * Math.PI - Math.PI / 2)));
  const lo = (lon(x, z) + Math.PI) / (Math.PI * 2);
  const cIdx = Math.floor(lo * cols);
  const fr = ((la + Math.PI / 2) / Math.PI) * rows - r;
  const fc = lo * cols - cIdx;
  const gap = Math.min(fr, 1 - fr, fc, 1 - fc) < 0.08 ? 1 : 0;
  const h = hash3(r, cIdx, 3);
  const tile = mix(hex('#8d93a3'), hex('#ffffff'), h);
  return mix(h > 0.93 ? mix(tile, hex('#b7c9ff'), 0.6) : tile, hex('#2a2c35'), gap);
};

const galaxyRings: Painter = (x, y, z) => {
  // "Saturn": banded body with a painted ring shadow band
  const t = y * 5 + fbm(x * 3, y * 4, z * 3) * 0.6;
  let c = mix(hex('#d9b77c'), hex('#f5e2b8'), 0.5 + 0.5 * Math.sin(t * 2.2));
  c = mix(c, hex('#8f6e3e'), line(y + 0.08 * x, 0.05, 0.03) * 0.6);
  return c;
};

/* ------------------------------------------------------------ registry */

export const ART_SKINS: ArtSkinDef[] = [
  { id: 'art_soccer', name: 'Golazo', theme: 'Sport', price: 0, finish: 'satin', paint: soccer },
  { id: 'art_basket', name: 'Slam Dunk', theme: 'Sport', price: 140, finish: 'matte', paint: basketball },
  { id: 'art_tennis', name: 'Ace', theme: 'Sport', price: 140, finish: 'matte', paint: tennis },
  { id: 'art_baseball', name: 'Home Run', theme: 'Sport', price: 160, finish: 'satin', paint: baseball },
  { id: 'art_eight', name: 'Eight Ball', theme: 'Sport', price: 220, level: 2, finish: 'gloss', paint: eightBall },
  { id: 'art_tiger', name: 'Tiger', theme: 'Animals', price: 260, level: 3, finish: 'satin', paint: tiger },
  { id: 'art_panda', name: 'Panda', theme: 'Animals', price: 240, level: 2, finish: 'satin', paint: panda },
  { id: 'art_ladybug', name: 'Ladybug', theme: 'Animals', price: 180, finish: 'gloss', paint: ladybug },
  { id: 'art_bee', name: 'Buzz', theme: 'Animals', price: 200, finish: 'satin', paint: bee },
  { id: 'art_watermelon', name: 'Watermelon', theme: 'Food', price: 0, finish: 'gloss', paint: watermelon },
  { id: 'art_donut', name: 'Sprinkles', theme: 'Food', price: 200, finish: 'gloss', paint: donut },
  { id: 'art_strawberry', name: 'Strawberry', theme: 'Food', price: 200, finish: 'gloss', paint: strawberry },
  { id: 'art_moon', name: 'Moon', theme: 'Space', price: 220, finish: 'matte', paint: moon },
  { id: 'art_jupiter', name: 'Jupiter', theme: 'Space', price: 280, level: 3, finish: 'satin', paint: jupiter },
  { id: 'art_saturn', name: 'Ringed Giant', theme: 'Space', price: 260, level: 3, finish: 'satin', paint: galaxyRings },
  { id: 'art_neptune', name: 'Neptune', theme: 'Space', price: 240, level: 2, finish: 'gloss', paint: neptune },
  { id: 'art_sun', name: 'Supernova', theme: 'Space', price: 450, level: 5, finish: 'glow', paint: sun },
  { id: 'art_smiley', name: 'Sunny Smile', theme: 'Faces', price: 0, finish: 'gloss', paint: smiley },
  { id: 'art_cool', name: 'Too Cool', theme: 'Faces', price: 220, level: 2, finish: 'gloss', paint: cool },
  { id: 'art_alien', name: 'Zorp', theme: 'Faces', price: 260, level: 3, finish: 'gloss', paint: alien },
  { id: 'art_eyeball', name: 'Eyeball', theme: 'Fun', price: 300, level: 4, finish: 'gloss', paint: eyeball },
  { id: 'art_pumpkin', name: 'Jack', theme: 'Fun', price: 260, level: 3, finish: 'satin', paint: pumpkin },
  { id: 'art_disco', name: 'Disco Ball', theme: 'Fun', price: 420, level: 5, finish: 'metal', paint: disco },
];

export const ART_MAP = new Map(ART_SKINS.map((s) => [s.id, s]));

/* -------------------------------------------------------------- render */

/** Equirectangular texture matching THREE.SphereGeometry UVs (row 0 = north pole). */
export function paintTexture(def: ArtSkinDef, w = 768, h = 384): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(w, h);
  for (let r = 0; r < h; r += 1) {
    const th = ((r + 0.5) / h) * Math.PI;
    const st = Math.sin(th);
    const y = Math.cos(th);
    for (let c = 0; c < w; c += 1) {
      const ph = ((c + 0.5) / w) * Math.PI * 2;
      const x = -Math.cos(ph) * st;
      const z = Math.sin(ph) * st;
      const col = def.paint(x, y, z);
      const o = (r * w + c) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Shaded sphere preview (front view) for menus and cards. */
export function paintPreview(def: ArtSkinDef, size = 96): string {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  const L = norm([-0.45, 0.55, 0.7]);
  // turn the marble slightly so faces read and seams show
  const ry = 0.35;
  const rx = -0.2;
  for (let py = 0; py < size; py += 1)
    for (let px = 0; px < size; px += 1) {
      const nx = ((px + 0.5) / size) * 2 - 1;
      const ny = 1 - ((py + 0.5) / size) * 2;
      const rr = nx * nx + ny * ny;
      const o = (py * size + px) * 4;
      if (rr > 1) {
        img.data[o + 3] = 0;
        continue;
      }
      const nz = Math.sqrt(1 - rr);
      // rotate view normal into skin space
      let x = nx * Math.cos(ry) + nz * Math.sin(ry);
      let z = -nx * Math.sin(ry) + nz * Math.cos(ry);
      let y = ny;
      const y2 = y * Math.cos(rx) - z * Math.sin(rx);
      z = y * Math.sin(rx) + z * Math.cos(rx);
      y = y2;
      x = x * 1;
      const col = def.paint(x, y, z);
      const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const glow = def.finish === 'glow';
      const k = glow ? 1 : 0.38 + 0.72 * diff;
      const hx = nx - L[0] * 0.6;
      const hy = ny - L[1] * 0.6;
      const spec = def.finish === 'matte' ? 0 : Math.pow(Math.max(0, 1 - Math.hypot(hx + 0.18, hy - 0.22) * 2.4), 3) * (def.finish === 'metal' ? 0.9 : 0.75);
      const rim = Math.pow(1 - nz, 3) * 0.25;
      const edge = 1 - ss(0.96, 1, Math.sqrt(rr));
      img.data[o] = Math.min(255, col[0] * k + 255 * (spec + rim * 0.4));
      img.data[o + 1] = Math.min(255, col[1] * k + 255 * (spec + rim * 0.45));
      img.data[o + 2] = Math.min(255, col[2] * k + 255 * (spec + rim * 0.6));
      img.data[o + 3] = 255 * edge;
    }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}
