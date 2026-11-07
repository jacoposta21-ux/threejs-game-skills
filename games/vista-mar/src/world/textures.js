import * as THREE from 'three';
import { createRng } from '../utils/random.js';

// Procedural canvas textures. Everything the city needs is drawn here so the game
// has no texture downloads. Each texture is created once and cached.

const cache = new Map();
let maxAniso = 8;
export function setMaxAnisotropy(a) { maxAniso = a; }

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

function speckle(ctx, w, h, rng, n, colors, size = [1, 2], alpha = [0.05, 0.25]) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = rng.range(alpha[0], alpha[1]);
    ctx.fillStyle = rng.pick(colors);
    const s = rng.range(size[0], size[1]);
    ctx.fillRect(rng.next() * w, rng.next() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

function asphaltBase(ctx, w, h, rng, base = '#3a3c40') {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, rng, w * h * 0.08, ['#202124', '#56585c', '#4a4c50', '#2c2d30'], [1, 2.5]);
  // patches & tar seams
  for (let i = 0; i < 6; i++) {
    ctx.globalAlpha = rng.range(0.06, 0.14);
    ctx.fillStyle = rng.chance(0.5) ? '#1d1e21' : '#55575a';
    ctx.fillRect(rng.next() * w, rng.next() * h, rng.range(20, 90), rng.range(20, 90));
  }
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#1a1a1c';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    let x = rng.next() * w, y = rng.next() * h;
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += rng.range(-14, 14); y += rng.range(-14, 14); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Road texture: u spans the full carriageway width, v repeats every `len` metres. */
export function roadTexture(widthM, { lanesEachWay = 2, oneWay = false, lanes = 3 } = {}) {
  return cached(`road-${widthM}-${lanesEachWay}-${oneWay}-${lanes}`, () => {
    const W = 512, H = 512; // H covers 12 m of road length
    const [c, ctx] = canvas(W, H);
    const rng = createRng(widthM * 31 + lanes);
    asphaltBase(ctx, W, H, rng);
    const px = W / widthM;
    // tyre-wear darker bands
    const laneCount = oneWay ? lanes : lanesEachWay * 2;
    const laneW = (widthM - 1) / laneCount;
    for (let l = 0; l < laneCount; l++) {
      const cx = (0.5 + laneW * (l + 0.5)) * px;
      for (const off of [-0.8, 0.8]) {
        const g = ctx.createLinearGradient(cx + off * px - 12, 0, cx + off * px + 12, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(15,15,18,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(cx + off * px - 12, 0, 24, H);
      }
    }
    const paint = (x, w, color, dashed) => {
      ctx.fillStyle = color;
      if (!dashed) { ctx.fillRect(x - w / 2, 0, w, H); return; }
      const seg = H / 4; // 3 m dash, 3 m gap pattern
      for (let y = 0; y < H; y += seg * 2) ctx.fillRect(x - w / 2, y + seg * 0.5, w, seg);
    };
    const lw = 0.15 * px;
    const white = 'rgba(232,232,226,0.92)';
    const yellow = 'rgba(236,190,60,0.95)';
    paint(0.35 * px, lw, white, false);
    paint(W - 0.35 * px, lw, white, false);
    if (oneWay) {
      for (let l = 1; l < laneCount; l++) paint((0.5 + laneW * l) * px, lw, white, true);
    } else {
      const mid = W / 2;
      paint(mid - lw * 1.2, lw, yellow, false);
      paint(mid + lw * 1.2, lw, yellow, false);
      for (let l = 1; l < lanesEachWay; l++) {
        paint((0.5 + laneW * l) * px, lw, white, true);
        paint(W - (0.5 + laneW * l) * px, lw, white, true);
      }
    }
    // paint wear
    speckle(ctx, W, H, rng, 2500, ['#3a3c40', '#2e2f33'], [1, 3], [0.2, 0.5]);
    const t = tex(c);
    t.userData = { lengthM: 12 };
    return t;
  });
}

export function intersectionTexture() {
  return cached('intersection', () => {
    const S = 512;
    const [c, ctx] = canvas(S, S);
    const rng = createRng(77);
    asphaltBase(ctx, S, S, rng);
    ctx.fillStyle = 'rgba(232,232,226,0.9)';
    const band = S * 0.13, stripe = S * 0.03;
    for (let i = S * 0.16; i < S * 0.84; i += stripe * 2) {
      ctx.fillRect(i, 4, stripe, band);
      ctx.fillRect(i, S - band - 4, stripe, band);
      ctx.fillRect(4, i, band, stripe);
      ctx.fillRect(S - band - 4, i, band, stripe);
    }
    speckle(ctx, S, S, rng, 2500, ['#3a3c40', '#2e2f33'], [1, 3], [0.2, 0.5]);
    return tex(c, { repeat: false });
  });
}

export function sidewalkTexture() {
  return cached('sidewalk', () => {
    const S = 256; // 3 m
    const [c, ctx] = canvas(S, S);
    const rng = createRng(5);
    ctx.fillStyle = '#b9b3a8';
    ctx.fillRect(0, 0, S, S);
    const n = 2, cell = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = `hsl(38, ${8 + rng.range(-2, 3)}%, ${68 + rng.range(-4, 4)}%)`;
      ctx.fillRect(i * cell + 1.5, j * cell + 1.5, cell - 3, cell - 3);
    }
    speckle(ctx, S, S, rng, 5000, ['#8d877c', '#d4cfc6', '#9e988c'], [1, 2]);
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 4; i++) { ctx.fillStyle = '#5b554c'; ctx.beginPath(); ctx.arc(rng.next() * S, rng.next() * S, rng.range(3, 10), 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    return tex(c);
  });
}

export function plazaTexture() {
  return cached('plaza', () => {
    const S = 256; // 4 m
    const [c, ctx] = canvas(S, S);
    const rng = createRng(9);
    ctx.fillStyle = '#a89f92';
    ctx.fillRect(0, 0, S, S);
    const cell = S / 8;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const off = j % 2 ? cell / 2 : 0;
      ctx.fillStyle = `hsl(${30 + rng.range(-6, 6)}, ${14 + rng.range(-4, 4)}%, ${62 + rng.range(-7, 7)}%)`;
      ctx.fillRect(((i * cell + off) % S) + 1, j * cell + 1, cell - 2, cell - 2);
    }
    speckle(ctx, S, S, rng, 3000, ['#7c7468', '#c9c1b4'], [1, 2]);
    return tex(c);
  });
}

export function grassTexture() {
  return cached('grass', () => {
    const S = 256; // 6 m
    const [c, ctx] = canvas(S, S);
    const rng = createRng(13);
    ctx.fillStyle = '#4f7a35';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 30; i++) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = rng.pick(['#6b9443', '#3d6328', '#5d8a3a', '#7c9a4c']);
      ctx.beginPath(); ctx.arc(rng.next() * S, rng.next() * S, rng.range(15, 50), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 9000; i++) {
      ctx.strokeStyle = rng.pick(['#2f5220', '#7aa34e', '#5a8838', '#93b562', '#406b2b']);
      ctx.globalAlpha = rng.range(0.25, 0.7);
      const x = rng.next() * S, y = rng.next() * S;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng.range(-1.5, 1.5), y - rng.range(2, 5)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return tex(c);
  });
}

export function sandTexture() {
  return cached('sand', () => {
    const S = 256; // 8 m
    const [c, ctx] = canvas(S, S);
    const rng = createRng(21);
    ctx.fillStyle = '#e2cfa4';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) {
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = rng.pick(['#d6bf8e', '#efdfb8', '#cdb27c']);
      ctx.beginPath(); ctx.ellipse(rng.next() * S, rng.next() * S, rng.range(20, 60), rng.range(6, 18), rng.range(0, 3), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    speckle(ctx, S, S, rng, 14000, ['#b89c68', '#f6ead0', '#c9ae78', '#a58a5a'], [0.8, 1.6], [0.2, 0.6]);
    return tex(c);
  });
}

export function parkingTexture() {
  return cached('parking', () => {
    const S = 512; // 20 m square
    const [c, ctx] = canvas(S, S);
    const rng = createRng(31);
    asphaltBase(ctx, S, S, rng, '#45474b');
    ctx.fillStyle = 'rgba(235,235,230,0.85)';
    const px = S / 20;
    for (let x = 0; x <= 20; x += 2.6) {
      ctx.fillRect(x * px, 0, 0.12 * px, 5.2 * px);
      ctx.fillRect(x * px, S - 5.2 * px, 0.12 * px, 5.2 * px);
    }
    return tex(c);
  });
}

export function concreteTexture(tint = '#9a958c', seed = 41) {
  return cached(`concrete-${tint}`, () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    const rng = createRng(seed);
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, rng, 9000, ['#6f6a62', '#b8b3aa', '#87827a'], [1, 2.5], [0.05, 0.25]);
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#5c5850';
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(0, (i * S) / 4); ctx.lineTo(S, (i * S) / 4); ctx.stroke(); }
    ctx.globalAlpha = 1;
    return tex(c);
  });
}

export function roofTexture() {
  return cached('roof', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    const rng = createRng(51);
    ctx.fillStyle = '#5e5d5a';
    ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, rng, 20000, ['#3d3c3a', '#7b7a76', '#4c4b48', '#8a8984'], [1, 2], [0.3, 0.7]);
    ctx.globalAlpha = 0.25; ctx.strokeStyle = '#2f2e2c'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, S); ctx.stroke(); }
    ctx.globalAlpha = 1;
    return tex(c);
  });
}

export function tileRoofTexture() {
  return cached('tileroof', () => {
    const S = 256; // 3 m
    const [c, ctx] = canvas(S, S);
    const rng = createRng(61);
    ctx.fillStyle = '#a24e30';
    ctx.fillRect(0, 0, S, S);
    const rows = 12, cols = 10;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const x = (k + (r % 2) * 0.5) * (S / cols), y = r * (S / rows);
      const g = ctx.createLinearGradient(0, y, 0, y + S / rows);
      const h = 14 + rng.range(-4, 4), l = 42 + rng.range(-6, 6);
      g.addColorStop(0, `hsl(${h},55%,${l + 8}%)`); g.addColorStop(1, `hsl(${h},55%,${l - 10}%)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x % S, y + S / rows / 2, S / cols / 2 - 1, S / rows / 2 + 1, 0, 0, 7); ctx.fill();
    }
    return tex(c);
  });
}

export function corrugatedTexture(base = '#8d9396', seed = 71) {
  return cached(`corr-${base}`, () => {
    const S = 256; // 6 m wide, 6 m tall
    const [c, ctx] = canvas(S, S);
    const rng = createRng(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 6) {
      const g = ctx.createLinearGradient(x, 0, x + 6, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.5, 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0.18)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 6, S);
    }
    for (let i = 0; i < 25; i++) {
      ctx.globalAlpha = rng.range(0.05, 0.15);
      ctx.fillStyle = '#6b4a2f';
      ctx.fillRect(rng.next() * S, rng.next() * S, rng.range(2, 8), rng.range(20, 80));
    }
    ctx.globalAlpha = 1;
    return tex(c);
  });
}

// ---------------------------------------------------------------------------
// Facades: colour map, emissive (lit windows at night) and an ORM-style map
// (G = roughness, B = metalness) so glass reflects the sky and walls stay matte.
// One texture tile = `bays` window bays x `floors` floors.
// ---------------------------------------------------------------------------
export const FACADE_STYLES = {
  glassTeal: { wall: '#7d8f93', glass: ['#2d5560', '#36646e', '#24474f'], frame: '#c9d3d4', bays: 8, floors: 8, winW: 0.9, winH: 0.82, curtain: true, bayM: 3, floorM: 3.6 },
  glassBlue: { wall: '#6c7a8c', glass: ['#2b4568', '#33507a', '#203858'], frame: '#aab4c2', bays: 8, floors: 8, winW: 0.92, winH: 0.8, curtain: true, bayM: 3, floorM: 3.6 },
  glassGold: { wall: '#8b7e66', glass: ['#5a4b2f', '#6b5a38', '#4b3e26'], frame: '#d6c8a6', bays: 8, floors: 8, winW: 0.9, winH: 0.84, curtain: true, bayM: 3, floorM: 3.6 },
  office: { wall: '#cfc6b5', glass: ['#3c4a52', '#45545c', '#33404a'], frame: '#a49b8b', bays: 8, floors: 8, winW: 0.6, winH: 0.55, bayM: 3, floorM: 3.6 },
  officeDark: { wall: '#5f6066', glass: ['#2a3238', '#323b42', '#22292e'], frame: '#8a8b90', bays: 8, floors: 8, winW: 0.7, winH: 0.6, bayM: 3, floorM: 3.6 },
  decoPink: { wall: '#efc3c4', glass: ['#3e5a66', '#47656f', '#36505b'], frame: '#ffffff', bays: 6, floors: 6, winW: 0.55, winH: 0.5, bands: '#ffffff', bayM: 3, floorM: 3.3 },
  decoMint: { wall: '#bfe3d3', glass: ['#3e5a66', '#47656f', '#36505b'], frame: '#ffffff', bays: 6, floors: 6, winW: 0.55, winH: 0.5, bands: '#ffffff', bayM: 3, floorM: 3.3 },
  decoWhite: { wall: '#f1ede4', glass: ['#3d5866', '#456270', '#33505d'], frame: '#9cd3d8', bays: 6, floors: 6, winW: 0.55, winH: 0.5, bands: '#8fd0d6', bayM: 3, floorM: 3.3 },
  decoLilac: { wall: '#d6c7e6', glass: ['#3e5a66', '#47656f', '#36505b'], frame: '#ffffff', bays: 6, floors: 6, winW: 0.55, winH: 0.5, bands: '#ffffff', bayM: 3, floorM: 3.3 },
  stuccoPeach: { wall: '#e9c39c', glass: ['#43545c', '#4b5d66', '#3a4a52'], frame: '#f7efe3', bays: 6, floors: 6, winW: 0.45, winH: 0.5, balcony: true, bayM: 3.2, floorM: 3.1 },
  stuccoYellow: { wall: '#ecd796', glass: ['#43545c', '#4b5d66', '#3a4a52'], frame: '#ffffff', bays: 6, floors: 6, winW: 0.45, winH: 0.5, balcony: true, bayM: 3.2, floorM: 3.1 },
  stuccoWhite: { wall: '#ece6db', glass: ['#43545c', '#4b5d66', '#3a4a52'], frame: '#c08e6a', bays: 6, floors: 6, winW: 0.45, winH: 0.5, balcony: true, bayM: 3.2, floorM: 3.1 },
  brick: { wall: '#9a5a44', glass: ['#3a4247', '#424b50', '#30383c'], frame: '#d9cfc2', bays: 6, floors: 6, winW: 0.5, winH: 0.55, brick: true, bayM: 3, floorM: 3.4 },
  house: { wall: '#f0e2c8', glass: ['#43545c', '#4b5d66', '#3a4a52'], frame: '#ffffff', bays: 4, floors: 2, winW: 0.4, winH: 0.45, bayM: 3, floorM: 3 },
};

export function facadeMaterialMaps(styleName) {
  return cached(`facade-${styleName}`, () => {
    const st = FACADE_STYLES[styleName];
    const S = 512;
    const [c, ctx] = canvas(S, S);
    const [ce, ectx] = canvas(S, S);
    const [co, octx] = canvas(S, S);
    const rng = createRng(styleName.length * 97 + styleName.charCodeAt(0));
    const bw = S / st.bays, fh = S / st.floors;
    // wall
    ctx.fillStyle = st.wall;
    ctx.fillRect(0, 0, S, S);
    if (st.brick) {
      for (let y = 0; y < S; y += 6) for (let x = (y / 6) % 2 ? -6 : 0; x < S; x += 12) {
        ctx.fillStyle = `hsl(14, ${35 + rng.range(-6, 6)}%, ${38 + rng.range(-6, 6)}%)`;
        ctx.fillRect(x + 0.5, y + 0.5, 11, 5);
      }
    }
    speckle(ctx, S, S, rng, 6000, ['rgba(0,0,0,0.6)', 'rgba(255,255,255,0.6)'], [1, 2], [0.03, 0.08]);
    ectx.fillStyle = '#000'; ectx.fillRect(0, 0, S, S);
    octx.fillStyle = 'rgb(0, 225, 0)'; octx.fillRect(0, 0, S, S); // matte wall
    if (st.curtain) {
      // full glass with mullions and spandrels
      for (let f = 0; f < st.floors; f++) {
        ctx.fillStyle = st.frame; ctx.fillRect(0, f * fh, S, fh * 0.12);
        octx.fillStyle = 'rgb(0,150,40)'; octx.fillRect(0, f * fh, S, fh * 0.12);
      }
    }
    if (st.bands) {
      for (let f = 0; f < st.floors; f++) {
        ctx.fillStyle = st.bands; ctx.fillRect(0, f * fh + fh * 0.86, S, fh * 0.08);
      }
    }
    for (let f = 0; f < st.floors; f++) {
      for (let b = 0; b < st.bays; b++) {
        const ww = bw * st.winW, wh = fh * st.winH;
        const x = b * bw + (bw - ww) / 2;
        const y = f * fh + (st.curtain ? fh * 0.14 : (fh - wh) * 0.45);
        // frame
        ctx.fillStyle = st.frame;
        ctx.fillRect(x - 2, y - 2, ww + 4, wh + 4);
        // glass with sky-ish gradient
        const g = ctx.createLinearGradient(x, y, x + ww * 0.3, y + wh);
        const gc = rng.pick(st.glass);
        g.addColorStop(0, gc); g.addColorStop(1, shade(gc, -12));
        ctx.fillStyle = g;
        ctx.fillRect(x, y, ww, wh);
        // blinds / curtains on some windows
        if (rng.chance(0.35)) {
          ctx.fillStyle = rng.pick(['rgba(230,225,210,0.55)', 'rgba(200,190,170,0.5)', 'rgba(120,130,140,0.4)']);
          ctx.fillRect(x, y, ww, wh * rng.range(0.2, 0.7));
        }
        // mullion
        ctx.fillStyle = st.frame;
        if (!st.curtain) ctx.fillRect(x + ww / 2 - 1, y, 2, wh);
        else ctx.fillRect(x + ww - 1, y, 2, wh);
        if (st.balcony) {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillRect(x - 6, y + wh * 0.62, ww + 12, 3);
          ctx.fillStyle = 'rgba(60,70,80,0.45)';
          for (let k = x - 6; k < x + ww + 6; k += 4) ctx.fillRect(k, y + wh * 0.62, 1, wh * 0.38);
        }
        // roughness/metal: glass is smooth and slightly metallic
        octx.fillStyle = 'rgb(0, 30, 150)';
        octx.fillRect(x, y, ww, wh);
        // night lights: ~45% of windows lit, warm or cool
        if (rng.chance(0.45)) {
          const warm = rng.chance(0.75);
          const l = rng.range(0.55, 1);
          ectx.fillStyle = warm ? `rgba(255,${(200 * l) | 0},${(120 * l) | 0},${l})` : `rgba(${(190 * l) | 0},${(220 * l) | 0},255,${l})`;
          ectx.fillRect(x + 1, y + 1, ww - 2, wh - 2);
          if (rng.chance(0.4)) { ectx.fillStyle = 'rgba(0,0,0,0.6)'; ectx.fillRect(x + 1, y + 1, ww - 2, wh * rng.range(0.2, 0.6)); }
        }
      }
    }
    // dirt streaks
    for (let i = 0; i < 40; i++) {
      ctx.globalAlpha = rng.range(0.02, 0.06);
      ctx.fillStyle = '#2b2620';
      ctx.fillRect(rng.next() * S, rng.next() * S, rng.range(1, 4), rng.range(20, 120));
    }
    ctx.globalAlpha = 1;
    const map = tex(c);
    const emissiveMap = tex(ce);
    const ormMap = tex(co, { srgb: false });
    return { map, emissiveMap, ormMap, tileW: st.bays * st.bayM, tileH: st.floors * st.floorM, style: st };
  });
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

/** Ground-floor shop fronts: 4 shops per tile, 24 m wide x 4.5 m tall. */
export function shopfrontMaps() {
  return cached('shopfront', () => {
    const W = 1024, H = 192;
    const [c, ctx] = canvas(W, H);
    const [ce, ectx] = canvas(W, H);
    const [co, octx] = canvas(W, H);
    const rng = createRng(404);
    ctx.fillStyle = '#d8d0c2'; ctx.fillRect(0, 0, W, H);
    ectx.fillStyle = '#000'; ectx.fillRect(0, 0, W, H);
    octx.fillStyle = 'rgb(0,220,0)'; octx.fillRect(0, 0, W, H);
    const shopW = W / 4;
    const signs = ['#c0392b', '#16a085', '#2c3e50', '#8e44ad', '#d35400', '#27ae60', '#2980b9', '#f39c12'];
    for (let s = 0; s < 4; s++) {
      const x0 = s * shopW;
      ctx.fillStyle = rng.pick(['#e4dccd', '#cfc4b0', '#bfb6a8', '#efe8dc']);
      ctx.fillRect(x0, 0, shopW, H);
      // sign band
      const sc = rng.pick(signs);
      ctx.fillStyle = sc; ctx.fillRect(x0 + 10, 8, shopW - 20, 34);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      const name = rng.pick(['CAFÉ', 'MARKET', 'BOUTIQUE', 'PHARMACY', 'DELI', 'SURF SHOP', 'BAKERY', 'TACOS', 'BOOKS', 'SALON', 'GELATO', 'RECORDS']);
      ctx.fillText(name, x0 + shopW / 2, 33);
      ectx.fillStyle = sc; ectx.globalAlpha = 0.9; ectx.fillRect(x0 + 10, 8, shopW - 20, 34); ectx.globalAlpha = 1;
      ectx.fillStyle = '#fff'; ectx.font = 'bold 22px Arial'; ectx.textAlign = 'center'; ectx.fillText(name, x0 + shopW / 2, 33);
      // display windows
      const g = ctx.createLinearGradient(0, 50, 0, H);
      g.addColorStop(0, '#5f7880'); g.addColorStop(1, '#2d3b40');
      ctx.fillStyle = g;
      ctx.fillRect(x0 + 14, 52, shopW * 0.58, H - 60);
      ctx.fillRect(x0 + shopW * 0.58 + 50, 52, shopW * 0.42 - 64, H - 60);
      // goods silhouettes
      for (let k = 0; k < 8; k++) {
        ctx.fillStyle = rng.pick(['#c9a66b', '#a85d5d', '#6b8fa8', '#e0d6c3', '#8aa86b']);
        ctx.globalAlpha = 0.5;
        ctx.fillRect(x0 + 20 + rng.next() * shopW * 0.5, H - 30 - rng.next() * 50, rng.range(8, 20), rng.range(10, 40));
      }
      ctx.globalAlpha = 1;
      // door
      ctx.fillStyle = '#3a2f28'; ctx.fillRect(x0 + shopW * 0.58 + 18, 52, 30, H - 52);
      ctx.fillStyle = '#7fa1ad'; ctx.fillRect(x0 + shopW * 0.58 + 22, 58, 22, H - 70);
      // frames
      ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 3;
      ctx.strokeRect(x0 + 14, 52, shopW * 0.58, H - 60);
      // emissive interior at night
      ectx.fillStyle = 'rgba(255,214,150,0.85)';
      ectx.fillRect(x0 + 14, 52, shopW * 0.58, H - 60);
      ectx.fillRect(x0 + shopW * 0.58 + 50, 52, shopW * 0.42 - 64, H - 60);
      octx.fillStyle = 'rgb(0,30,120)';
      octx.fillRect(x0 + 14, 52, shopW * 0.58, H - 60);
      octx.fillRect(x0 + shopW * 0.58 + 50, 52, shopW * 0.42 - 64, H - 60);
    }
    return { map: tex(c), emissiveMap: tex(ce), ormMap: tex(co, { srgb: false }), tileW: 24, tileH: 4.5 };
  });
}

/** Neon sign atlas: 4 columns x 8 rows of 512x128 slots. */
export const NEON_SIGNS = [
  { text: 'FLAMINGO', color: '#ff4fa3' }, { text: 'VELVET', color: '#b05cff' }, { text: 'STARLITE', color: '#4fd8ff' },
  { text: 'MANGO LOUNGE', color: '#ffb347' }, { text: 'PULSE', color: '#3dff9a' }, { text: 'TIKI BAR', color: '#ffd23f' },
  { text: 'NEON ROOM', color: '#ff3c3c' }, { text: 'LA PALOMA', color: '#ff7ad9' }, { text: 'CASA SOL', color: '#ffa53c' },
  { text: 'HOTEL MARISOL', color: '#7ef0ff' }, { text: 'OCEAN VIEW', color: '#6dd6ff' }, { text: 'CORAL INN', color: '#ff8a6d' },
  { text: 'BAR 24', color: '#ff4f4f' }, { text: 'PIZZA', color: '#ffde4f' }, { text: 'DINER', color: '#4fe3ff' },
  { text: 'LIQUOR', color: '#ff5fd2' }, { text: 'MOTEL', color: '#ff4040' }, { text: 'GELATO', color: '#9dffb0' },
  { text: 'CINEMA', color: '#ffe066' }, { text: 'CLUB 88', color: '#c06bff' }, { text: 'SUNSET', color: '#ff9d4f' },
  { text: 'PALMS', color: '#5dffb1' }, { text: 'BLUE MOON', color: '#5d8bff' }, { text: 'OPEN', color: '#ff3d6e' },
  { text: 'THE GRAND', color: '#ffd27a' }, { text: 'HOTEL ALMA', color: '#ff86c8' }, { text: 'SEA BREEZE', color: '#7ff6e0' },
  { text: 'VISTA MAR', color: '#ff5ea8' }, { text: 'DISCO', color: '#ff66ff' }, { text: 'TATTOO', color: '#ff6b3d' },
  { text: 'CAFÉ CUBA', color: '#ffc14f' }, { text: 'GAS', color: '#ffffff' },
];

export function neonAtlas() {
  return cached('neon', () => {
    const SW = 512, SH = 128, cols = 4, rows = 8;
    const [c, ctx] = canvas(SW * cols, SH * rows);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    NEON_SIGNS.forEach((s, i) => {
      const x = (i % cols) * SW, y = Math.floor(i / cols) * SH;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, SW, SH); ctx.clip();
      const size = Math.min(78, (SW * 0.86) / (s.text.length * 0.62));
      ctx.font = `italic 700 ${size}px "Brush Script MT", "Segoe Script", Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = s.color; ctx.shadowBlur = 24;
      ctx.strokeStyle = s.color; ctx.lineWidth = 7;
      ctx.strokeText(s.text, x + SW / 2, y + SH / 2);
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffffff';
      ctx.strokeText(s.text, x + SW / 2, y + SH / 2);
      // outline frame tube
      ctx.shadowBlur = 16; ctx.strokeStyle = s.color; ctx.lineWidth = 4;
      ctx.strokeRect(x + 10, y + 10, SW - 20, SH - 20);
      ctx.restore();
    });
    const t = tex(c, { repeat: false });
    t.userData = { cols, rows };
    return t;
  });
}

/** Billboard atlas: original ad artwork for rooftop billboards (2 x 2). */
export function billboardAtlas() {
  return cached('billboards', () => {
    const W = 1024, H = 512;
    const [c, ctx] = canvas(W, H);
    const ads = [
      { bg: ['#ff7e5f', '#feb47b'], title: 'SUNSHINE COLA', sub: 'Taste the coast', fg: '#fff' },
      { bg: ['#2193b0', '#6dd5ed'], title: 'VISTA MAR AIR', sub: 'Fly the bay. Daily.', fg: '#fff' },
      { bg: ['#141e30', '#243b55'], title: 'TURBO FM 98.5', sub: 'Hits after dark', fg: '#ff4fa3' },
      { bg: ['#f857a6', '#ff5858'], title: 'CASA ROSA', sub: 'Resort & Spa', fg: '#fff' },
    ];
    ads.forEach((a, i) => {
      const x = (i % 2) * 512, y = Math.floor(i / 2) * 256;
      const g = ctx.createLinearGradient(x, y, x + 512, y + 256);
      g.addColorStop(0, a.bg[0]); g.addColorStop(1, a.bg[1]);
      ctx.fillStyle = g; ctx.fillRect(x, y, 512, 256);
      // stylised sun / palm graphic
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(x + 420, y + 150, 80, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 412, y + 120, 8, 136);
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.ellipse(x + 416 + Math.cos(k) * 30, y + 118 + Math.sin(k * 2) * 6, 38, 9, k * 1.05, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = a.fg;
      ctx.font = 'bold 54px "Arial Black", Arial';
      ctx.textAlign = 'left';
      ctx.fillText(a.title, x + 28, y + 110);
      ctx.font = 'italic 30px Georgia';
      ctx.fillText(a.sub, x + 30, y + 160);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 6; ctx.strokeRect(x + 6, y + 6, 500, 244);
    });
    return tex(c, { repeat: false });
  });
}

export function radialGlowTexture() {
  return cached('glow', () => {
    const S = 128;
    const [c, ctx] = canvas(S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    return tex(c, { repeat: false });
  });
}

/** Tileable water normal map from integer-frequency sine waves. */
export function waterNormalTexture() {
  return cached('waternormal', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    const img = ctx.createImageData(S, S);
    const rng = createRng(3);
    const waves = [];
    for (let i = 0; i < 14; i++) {
      waves.push({ fx: rng.int(-6, 6), fy: rng.int(1, 7) * (rng.chance(0.5) ? 1 : -1), a: rng.range(0.3, 1) / (1 + i * 0.3), p: rng.range(0, 6.28) });
    }
    const h = (x, y) => waves.reduce((s, w) => s + w.a * Math.sin(((w.fx * x + w.fy * y) / S) * Math.PI * 2 + w.p), 0);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const n = new THREE.Vector3(-dx * 2.2, -dy * 2.2, 1).normalize();
      const i = (y * S + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return tex(c, { srgb: false });
  });
}

export function containerTexture() {
  return cached('container', () => {
    const W = 256, H = 128;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 5) {
      ctx.fillStyle = x % 10 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.0)';
      ctx.fillRect(x, 0, 3, H);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, W, 5); ctx.fillRect(0, H - 5, W, 5); ctx.fillRect(0, 0, 5, H); ctx.fillRect(W - 5, 0, 5, H);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 18px Arial'; ctx.fillText('VMCU 204871', 18, 30);
    return tex(c);
  });
}
