import Phaser from 'phaser';
import { Ctx, dabs, linear, mix, paintTexture, rgba, rng } from './paint';
import { THEMES, ThemeKey } from './themes';

export const T = 32;
export const TILE_ONEWAY = 32;
export const TILE_LADDER = 33;
export const TILE_SPIKE = 34;
export const TILE_WATER = 35;
export const TILE_WATER_TOP = 36;
export const TILE_SPIKE_DOWN = 37;
export const TILE_ACID = 38;
export const TILE_ACID_TOP = 39;
export const TILE_BACK = 40; // back wall variants 40..47

/** Tileable value noise with period p on both axes (lattice units). */
function tileNoise(seed: number) {
  const r = rng(seed);
  const g = new Float32Array(64 * 64);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const s = (t: number) => t * t * (3 - 2 * t);
  const at = (x: number, y: number, p: number) => g[(((y % p) + p) % p) * 64 + (((x % p) + p) % p)];
  const n = (x: number, y: number, p: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = at(xi, yi, p), b = at(xi + 1, yi, p), c = at(xi, yi + 1, p), d = at(xi + 1, yi + 1, p);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  // px in [0,32)
  return (px: number, py: number) => (n(px / 8, py / 8, 4) * 0.55 + n(px / 4, py / 4, 8) * 0.3 + n(px / 2, py / 2, 16) * 0.15);
}

function drawSolid(ctx: Ctx, th: ReturnType<typeof getTheme>, mask: number, variant: number, nz: (x: number, y: number) => number) {
  const r = rng(mask * 31 + variant * 977 + 3);
  const [dark, midc, light] = th.rock;
  const img = ctx.createImageData(T, T);
  const D = img.data;
  const cd = hexA(dark), cm = hexA(midc);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const v = nz(x, y);
      const k = Math.min(1, Math.max(0, (v - 0.3) * 1.6));
      const i = (y * T + x) * 4;
      D[i] = cd[0] + (cm[0] - cd[0]) * k;
      D[i + 1] = cd[1] + (cm[1] - cd[1]) * k;
      D[i + 2] = cd[2] + (cm[2] - cd[2]) * k;
      D[i + 3] = 255;
    }
  { const m = ctx.getTransform(); ctx.putImageData(img, m.e, m.f); }
  const up = !(mask & 1), right = !(mask & 2), down = !(mask & 4), left = !(mask & 8);
  // painterly variation dabs (kept off the edges so neighbors blend)
  dabs(ctx, 5, 5, 22, 22, 6, [light, dark, midc], 1.5, 4, 0.25, r);
  if (th.topStyle === 'grate') {
    // station: concrete panels + rebar
    ctx.strokeStyle = rgba('#000000', 0.25);
    ctx.lineWidth = 1;
    if (variant) {
      ctx.beginPath();
      ctx.moveTo(0, 16.5);
      ctx.lineTo(32, 16.5);
      ctx.stroke();
    }
    ctx.fillStyle = rgba('#8a5a3a', 0.25);
    ctx.fillRect(4 + r() * 20, 6 + r() * 20, 2, 2);
  } else if (variant) {
    // cracks / fossils / embedded stones
    ctx.strokeStyle = rgba(dark, 0.8);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let x = 8 + r() * 16, y = 8 + r() * 6;
    ctx.moveTo(x, y);
    for (let i = 0; i < 3; i++) {
      x += (r() - 0.5) * 10;
      y += 3 + r() * 4;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = rgba(light, 0.35);
    ctx.beginPath();
    ctx.ellipse(10 + r() * 12, 14 + r() * 10, 3, 2, r(), 0, Math.PI * 2);
    ctx.fill();
  }
  // edge shading
  if (left) {
    ctx.fillStyle = linear(ctx, 0, 0, 10, 0, [[0, rgba(light, 0.35)], [1, rgba(light, 0)]]);
    ctx.fillRect(0, 0, 10, T);
  }
  if (right) {
    ctx.fillStyle = linear(ctx, T, 0, T - 10, 0, [[0, rgba('#000000', 0.45)], [1, 'rgba(0,0,0,0)']]);
    ctx.fillRect(T - 10, 0, 10, T);
  }
  if (down) {
    ctx.fillStyle = linear(ctx, 0, T, 0, T - 12, [[0, rgba('#000000', 0.55)], [1, 'rgba(0,0,0,0)']]);
    ctx.fillRect(0, T - 12, T, 12);
  }
  // organic silhouette: carve corners & ragged exposed sides
  ctx.globalCompositeOperation = 'destination-out';
  const carve = th.topStyle === 'grate' ? 3 : 9;
  if (up && left) roundCorner(ctx, 0, 0, carve, 1, 1);
  if (up && right) roundCorner(ctx, T, 0, carve, -1, 1);
  if (down && left) roundCorner(ctx, 0, T, carve, 1, -1);
  if (down && right) roundCorner(ctx, T, T, carve, -1, -1);
  if (th.topStyle !== 'grate') {
    if (left) for (let y = 4; y < T - 4; y += 7) bite(ctx, 0, y + r() * 3, 1.5 + r() * 2.5);
    if (right) for (let y = 4; y < T - 4; y += 7) bite(ctx, T, y + r() * 3, 1.5 + r() * 2.5);
    if (down) for (let x = 4; x < T - 4; x += 7) bite(ctx, x + r() * 3, T, 1.5 + r() * 3);
  }
  ctx.globalCompositeOperation = 'source-over';
  // outline on exposed edges
  ctx.strokeStyle = rgba('#000000', 0.6);
  ctx.lineWidth = 1.5;
  if (up) drawTop(ctx, th, left, right, r);
  if (down && th.topStyle === 'grate') {
    ctx.fillStyle = rgba('#000000', 0.5);
    ctx.fillRect(0, T - 2, T, 2);
  }
  if (down && th.topStyle !== 'grate') {
    // hanging roots / drips under ceilings
    ctx.strokeStyle = rgba(th.top[0], 0.55);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) {
      const x = 6 + r() * 20;
      ctx.beginPath();
      ctx.moveTo(x, T - 3);
      ctx.quadraticCurveTo(x + 3, T + 2, x - 1, T);
      ctx.stroke();
    }
  }
}

function roundCorner(ctx: Ctx, cx: number, cy: number, r: number, sx: number, sy: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + sx * r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + sy * r);
  ctx.closePath();
  ctx.fill();
}

function bite(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawTop(ctx: Ctx, th: ReturnType<typeof getTheme>, left: boolean, right: boolean, r: () => number) {
  const [a, b, c] = th.top;
  const x0 = left ? (th.topStyle === 'grate' ? 2 : 5) : 0, x1 = right ? (th.topStyle === 'grate' ? 30 : 27) : 32;
  switch (th.topStyle) {
    case 'grate': {
      ctx.fillStyle = '#0b0e12';
      ctx.fillRect(x0, 0, x1 - x0, 7);
      ctx.fillStyle = linear(ctx, 0, 0, 0, 6, [[0, '#9aa5ad'], [1, a]]);
      ctx.fillRect(x0, 0, x1 - x0, 5);
      ctx.fillStyle = '#1a1f24';
      for (let x = x0 + 2; x < x1 - 1; x += 4) ctx.fillRect(x, 1, 2, 3);
      ctx.fillStyle = rgba(b, 0.7);
      ctx.fillRect(x0 + r() * 20, 5, 6 + r() * 6, 2);
      ctx.fillStyle = rgba(c, 0.5);
      ctx.fillRect(x0 + r() * 22, 6, 3, 3);
      break;
    }
    case 'moss':
    case 'barnacle':
    case 'flesh':
    case 'crystal': {
      // thick organic surface band with bumpy top edge
      ctx.fillStyle = linear(ctx, 0, 0, 0, 12, [[0, b], [0.6, a], [1, rgba(a, 0)]]);
      ctx.beginPath();
      ctx.moveTo(x0, 12);
      for (let x = x0; x <= x1; x += 4) ctx.lineTo(x, 1.5 + Math.sin(x * 0.8 + r()) * 1.2);
      ctx.lineTo(x1, 12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(c, 0.8);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += 4) ctx.lineTo(x, 1.5 + Math.sin(x * 0.8) * 1.0);
      ctx.stroke();
      if (th.topStyle === 'moss') {
        ctx.strokeStyle = b;
        ctx.lineWidth = 1.3;
        for (let i = 0; i < 6; i++) {
          const x = x0 + 2 + r() * (x1 - x0 - 4);
          ctx.beginPath();
          ctx.moveTo(x, 4);
          ctx.lineTo(x + (r() - 0.5) * 3, -0.5 + r() * 2);
          ctx.stroke();
        }
      } else if (th.topStyle === 'barnacle') {
        for (let i = 0; i < 3; i++) {
          const x = x0 + 3 + r() * (x1 - x0 - 6);
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(x, 4, 2 + r() * 1.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = a;
          ctx.beginPath();
          ctx.arc(x, 4, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (th.topStyle === 'crystal') {
        for (let i = 0; i < 2; i++) {
          const x = x0 + 4 + r() * (x1 - x0 - 8);
          ctx.fillStyle = rgba(c, 0.9);
          ctx.beginPath();
          ctx.moveTo(x - 2, 5);
          ctx.lineTo(x, 0);
          ctx.lineTo(x + 2, 5);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = rgba(c, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, 7);
        ctx.bezierCurveTo(x0 + 8, 4, x0 + 16, 10, x1, 6);
        ctx.stroke();
      }
      break;
    }
  }
}

function hexA(c: string) {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const getTheme = (k: ThemeKey) => THEMES[k];

export function buildTileset(scene: Phaser.Scene, key: ThemeKey) {
  const th = getTheme(key);
  const nz = tileNoise(key.length * 17 + 5);
  const texKey = 'tiles-' + key;
  const raw = document.createElement('canvas');
  raw.width = 16 * T;
  raw.height = 3 * T;
  ((ctx: Ctx) => {
    for (let v = 0; v < 2; v++)
      for (let m = 0; m < 16; m++) {
        ctx.save();
        ctx.translate(m * T, v * T);
        drawSolid(ctx, th, m, v, nz);
        ctx.restore();
      }
    const sp = (i: number, f: (c: Ctx) => void) => {
      ctx.save();
      ctx.translate((i - 32) * T, 2 * T);
      f(ctx);
      ctx.restore();
    };
    const r = rng(99);
    // one-way platform
    sp(TILE_ONEWAY, (c) => {
      const [p1, p2] = th.platform;
      c.fillStyle = '#07090c';
      c.fillRect(0, 0, T, 10);
      c.fillStyle = linear(c, 0, 0, 0, 9, [[0, mix(p1, '#ffffff', 0.25)], [1, p2]]);
      c.fillRect(0, 1, T, 7);
      if (th.topStyle === 'grate') {
        c.fillStyle = '#11161b';
        for (let x = 2; x < T; x += 5) c.fillRect(x, 2, 2, 4);
        c.strokeStyle = '#2c343b';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(4, 9);
        c.lineTo(16, 20);
        c.lineTo(28, 9);
        c.stroke();
      } else {
        c.fillStyle = rgba(th.top[1], 0.8);
        c.fillRect(0, 0, T, 2);
        c.strokeStyle = rgba(p2, 0.9);
        c.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
          const x = 4 + r() * 24;
          c.beginPath();
          c.moveTo(x, 8);
          c.quadraticCurveTo(x + 2, 14, x - 1, 18 + r() * 6);
          c.stroke();
        }
      }
    });
    // ladder
    sp(TILE_LADDER, (c) => {
      if (th.ladder === 'metal') {
        c.fillStyle = '#07090c';
        c.fillRect(5, 0, 5, T);
        c.fillRect(22, 0, 5, T);
        c.fillStyle = '#7d8890';
        c.fillRect(6, 0, 3, T);
        c.fillRect(23, 0, 3, T);
        for (let y = 4; y < T; y += 10) {
          c.fillStyle = '#07090c';
          c.fillRect(6, y - 1, 20, 5);
          c.fillStyle = '#a3adb4';
          c.fillRect(7, y, 18, 2.5);
        }
      } else {
        c.strokeStyle = '#0a0a0a';
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(8, 0);
        c.quadraticCurveTo(6, 16, 8, 32);
        c.moveTo(24, 0);
        c.quadraticCurveTo(26, 16, 24, 32);
        c.stroke();
        c.strokeStyle = '#7a5a3a';
        c.lineWidth = 3;
        c.stroke();
        for (let y = 5; y < T; y += 11) {
          c.strokeStyle = '#0a0a0a';
          c.lineWidth = 5;
          c.beginPath();
          c.moveTo(7, y);
          c.lineTo(25, y + 2);
          c.stroke();
          c.strokeStyle = '#b58a52';
          c.lineWidth = 3;
          c.stroke();
        }
        c.fillStyle = rgba(th.top[1], 0.9);
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.ellipse(6 + r() * 20, r() * 32, 3, 1.5, r(), 0, Math.PI * 2);
          c.fill();
        }
      }
    });
    const spikes = (c: Ctx, flip: boolean) => {
      if (flip) {
        c.translate(0, T);
        c.scale(1, -1);
      }
      const [s1, s2] = th.spike;
      for (let i = 0; i < 4; i++) {
        const x = 4 + i * 8, h = 18 + r() * 10;
        c.fillStyle = '#05060a';
        c.beginPath();
        c.moveTo(x - 5.5, T);
        c.lineTo(x + (r() - 0.5) * 3, T - h - 2);
        c.lineTo(x + 5.5, T);
        c.fill();
        c.fillStyle = linear(c, x, T - h, x, T, [[0, s1], [1, s2]]);
        c.beginPath();
        c.moveTo(x - 4, T);
        c.lineTo(x, T - h);
        c.lineTo(x + 4, T);
        c.fill();
      }
    };
    sp(TILE_SPIKE, (c) => spikes(c, false));
    sp(TILE_SPIKE_DOWN, (c) => spikes(c, true));
    const water = (c: Ctx, top: boolean, cols: [string, string], glow: number) => {
      c.fillStyle = rgba(cols[0], 0.5 + glow * 0.1);
      c.fillRect(0, top ? 6 : 0, T, top ? T - 6 : T);
      if (top) {
        c.fillStyle = rgba(cols[1], 0.85);
        c.beginPath();
        c.moveTo(0, 6);
        c.quadraticCurveTo(8, 4, 16, 6);
        c.quadraticCurveTo(24, 8, 32, 6);
        c.lineTo(32, 8.5);
        c.quadraticCurveTo(24, 10.5, 16, 8.5);
        c.quadraticCurveTo(8, 6.5, 0, 8.5);
        c.fill();
        c.fillStyle = linear(c, 0, 8, 0, T, [[0, rgba(cols[1], 0.25)], [1, rgba(cols[1], 0)]]);
        c.fillRect(0, 8, T, T - 8);
      } else {
        c.fillStyle = rgba(cols[1], 0.06);
        c.fillRect(4 + r() * 10, 4 + r() * 20, 10, 2);
      }
    };
    sp(TILE_WATER, (c) => water(c, false, th.water, 0));
    sp(TILE_WATER_TOP, (c) => water(c, true, th.water, 0));
    sp(TILE_ACID, (c) => water(c, false, ['#7fd23a', '#efff9a'], 2));
    sp(TILE_ACID_TOP, (c) => water(c, true, ['#7fd23a', '#efff9a'], 2));
    // back wall tiles (row 2, indices 40..47) — darker, desaturated interior walls
    for (let i = 0; i < 8; i++) {
      sp(TILE_BACK + i, (c) => {
        const img = c.createImageData(T, T);
        const D = img.data;
        for (let y = 0; y < T; y++)
          for (let x = 0; x < T; x++) {
            const v = nz((x + i * 7) % 32, (y + i * 13) % 32);
            const j = (y * T + x) * 4;
            const base = hexA(th.rock[0]);
            D[j] = base[0] * (0.55 + v * 0.5);
            D[j + 1] = base[1] * (0.55 + v * 0.5);
            D[j + 2] = base[2] * (0.6 + v * 0.5);
            D[j + 3] = 255;
          }
        { const m = c.getTransform(); c.putImageData(img, m.e, m.f); }
        if (th.topStyle === 'grate') {
          c.strokeStyle = 'rgba(0,0,0,0.35)';
          c.lineWidth = 1;
          c.strokeRect(0.5, 0.5, T - 1, T - 1);
          if (i % 3 === 0) {
            c.fillStyle = 'rgba(120,130,140,0.12)';
            c.fillRect(6, 6, 20, 20);
          }
          if (i === 5) {
            c.fillStyle = 'rgba(255,190,100,0.08)';
            c.fillRect(2, 14, 28, 3);
          }
        } else if (i % 2) {
          c.strokeStyle = 'rgba(0,0,0,0.3)';
          c.beginPath();
          c.moveTo(r() * 32, 0);
          c.lineTo(r() * 32, 32);
          c.stroke();
        }
      });
    }
  })(raw.getContext('2d')!);
  // extrude each tile by PAD px so bilinear filtering under camera zoom never samples a neighbour (no seams)
  const cols = 16, rows = 3, cell = T + PAD * 2;
  paintTexture(scene, texKey, cols * cell, rows * cell, (ctx) => {
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const sx = i * T, sy = j * T, dx = i * cell + PAD, dy = j * cell + PAD;
        ctx.drawImage(raw, sx, sy, T, 1, dx, dy - PAD, T, PAD);
        ctx.drawImage(raw, sx, sy + T - 1, T, 1, dx, dy + T, T, PAD);
        ctx.drawImage(raw, sx, sy, 1, T, dx - PAD, dy, PAD, T);
        ctx.drawImage(raw, sx + T - 1, sy, 1, T, dx + T, dy, PAD, T);
        ctx.drawImage(raw, sx, sy, T, T, dx, dy, T, T);
      }
  });
  return texKey;
}

export const PAD = 2;
