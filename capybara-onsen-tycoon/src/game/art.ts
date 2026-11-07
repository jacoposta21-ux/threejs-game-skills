/**
 * All graphics are drawn in code with Canvas 2D at startup and registered as
 * Phaser textures (no external assets). Sprite textures are drawn at R× the
 * logical size for crisp scaling; display them with scale 1/R (see ART_SCALE).
 */
import Phaser from 'phaser';

export const R = 2;
export const ART_SCALE = 1 / R;

/** Water colour per level (index 0 = level 1). */
export const WATER = [
  0x7fd8d0, 0x6cc9b4, 0xa8d86a, 0x5cb8e0, 0xf4a6c4, 0xffd36b, 0x8fa2f0, 0x9ccc78, 0xff9f6b, 0xc49be8, 0x5d7fd6, 0xf2c14e,
];

export const PALETTE = {
  cream: 0xfff4e0,
  creamDark: 0xf3e2c4,
  wood: 0x8a5a38,
  woodLight: 0xc48a57,
  woodDark: 0x5e3b22,
  sage: 0x7fae7a,
  sageDark: 0x5d8a5a,
  cherry: 0xe98aa8,
  cherryDark: 0xc4627f,
  orange: 0xf0a35e,
  orangeDark: 0xc97a37,
  gold: 0xf5c84c,
  text: 0x5a3a26,
  disabled: 0xc9bfb1,
  teal: 0x5fc4c0,
};

const hex = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const mix = (a: number, b: number, t: number) => {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
};
export const lighten = (c: number, t: number) => mix(c, 0xffffff, t);
export const darken = (c: number, t: number) => mix(c, 0x000000, t);

type Ctx = CanvasRenderingContext2D;

/** Draws a cached canvas texture once (no-op if the key exists). Returns the key. */
export function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, res = R): string {
  if (!scene.textures.exists(key)) make(scene, key, w, h, draw, res);
  return key;
}

export { rr as roundRectPath, hex as cssColor };

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void, res = R): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * res);
  canvas.height = Math.ceil(h * res);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(res, res);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  scene.textures.addCanvas(key, canvas);
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function fillStroke(ctx: Ctx, fill: string | CanvasGradient, stroke?: string, lw = 2.5): void {
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ capybara

const CAPY_W = 110;
const CAPY_H = 120;
/** capy-texture y of the waterline (used as origin) */
export const CAPY_ORIGIN_Y = 92 / CAPY_H;

interface Fur {
  light: number;
  base: number;
  dark: number;
  muzzle: number;
  line: number;
}
const FUR: Fur = { light: 0xc08a5a, base: 0xa36d43, dark: 0x8a5634, muzzle: 0xd3a57a, line: 0x5e3b22 };
const GOLD_FUR: Fur = { light: 0xffe58a, base: 0xf5c24a, dark: 0xd99a22, muzzle: 0xfff0b8, line: 0x9a6512 };

function drawCapy(ctx: Ctx, fur: Fur): void {
  const line = hex(fur.line);
  // shoulders
  ell(ctx, 55, 106, 42, 24);
  fillStroke(ctx, hex(fur.base), line);
  // ears
  for (const x of [30, 80]) {
    ell(ctx, x, 43, 8.5, 8);
    fillStroke(ctx, hex(fur.dark), line);
    ell(ctx, x, 44, 4, 4);
    ctx.fillStyle = hex(darken(fur.dark, 0.25));
    ctx.fill();
  }
  // head (boxy loaf)
  const g = ctx.createLinearGradient(0, 38, 0, 98);
  g.addColorStop(0, hex(fur.light));
  g.addColorStop(1, hex(fur.base));
  rr(ctx, 22, 38, 66, 60, 27);
  fillStroke(ctx, g, line);
  // top highlight
  ell(ctx, 48, 48, 14, 5, -0.15);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();
  // blush
  for (const x of [33, 77]) {
    ell(ctx, x, 76, 7, 4.5);
    ctx.fillStyle = 'rgba(242,140,140,0.45)';
    ctx.fill();
  }
  // muzzle
  ell(ctx, 55, 82, 21, 13);
  ctx.fillStyle = hex(fur.muzzle);
  ctx.fill();
  // sleepy eyes
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  for (const x of [41, 69]) {
    ctx.beginPath();
    ctx.arc(x, 59, 5.5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
  // nose
  rr(ctx, 45, 72, 20, 9, 4.5);
  ctx.fillStyle = hex(darken(fur.line, 0.1));
  ctx.fill();
  ell(ctx, 50, 74.5, 2.3, 1.4);
  ell(ctx, 60, 74.5, 2.3, 1.4);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
  // mouth
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(49, 86);
  ctx.quadraticCurveTo(52, 89, 55, 86);
  ctx.quadraticCurveTo(58, 89, 61, 86);
  ctx.stroke();
}

function drawAccessory(ctx: Ctx, level: number): void {
  const line = '#5e3b22';
  switch (level) {
    case 1: {
      // folded towel
      ctx.save();
      ctx.translate(55, 34);
      ctx.rotate(-0.08);
      rr(ctx, -20, -9, 40, 18, 6);
      fillStroke(ctx, '#ffffff', '#9fb7c9', 2.5);
      ctx.strokeStyle = '#7fc6e8';
      ctx.lineWidth = 2.5;
      for (const y of [-3, 3]) {
        ctx.beginPath();
        ctx.moveTo(-18, y);
        ctx.lineTo(18, y);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 2: {
      // leaf
      ctx.save();
      ctx.translate(62, 30);
      ctx.rotate(0.5);
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.quadraticCurveTo(0, -14, 16, 0);
      ctx.quadraticCurveTo(0, 14, -16, 0);
      fillStroke(ctx, '#7cc25a', '#3f7a2e', 2.5);
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(14, 0);
      ctx.strokeStyle = '#3f7a2e';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(-24, 4);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 3: {
      // yuzu fruit
      ell(ctx, 55, 28, 13, 12);
      const g = ctx.createRadialGradient(51, 24, 2, 55, 28, 14);
      g.addColorStop(0, '#fff3a0');
      g.addColorStop(1, '#f2b81f');
      fillStroke(ctx, g, '#b57e12', 2.5);
      ctx.beginPath();
      ctx.moveTo(55, 16);
      ctx.quadraticCurveTo(64, 8, 70, 13);
      ctx.quadraticCurveTo(63, 18, 55, 16);
      fillStroke(ctx, '#6fbf4a', '#3f7a2e', 1.8);
      for (const [x, y] of [[50, 30], [58, 24], [60, 33]]) {
        ell(ctx, x, y, 1.1, 1.1);
        ctx.fillStyle = 'rgba(180,120,10,0.5)';
        ctx.fill();
      }
      break;
    }
    case 4: {
      // round glasses
      ctx.strokeStyle = '#3b2a20';
      ctx.lineWidth = 3;
      for (const x of [41, 69]) {
        ell(ctx, x, 59, 10, 10);
        ctx.fillStyle = 'rgba(200,235,255,0.35)';
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(51, 58);
      ctx.quadraticCurveTo(55, 55, 59, 58);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(36, 54);
      ctx.lineTo(39, 52);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case 5: {
      // cherry blossom behind the ear
      ctx.save();
      ctx.translate(80, 38);
      for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.rotate((i / 5) * Math.PI * 2);
        ell(ctx, 0, -8, 5.5, 8);
        fillStroke(ctx, '#ffc4d6', '#d9729a', 1.6);
        ctx.restore();
      }
      ell(ctx, 0, 0, 3.5, 3.5);
      ctx.fillStyle = '#f7d25c';
      ctx.fill();
      ctx.restore();
      break;
    }
    case 6: {
      // rubber duck
      ell(ctx, 55, 31, 15, 10);
      fillStroke(ctx, '#ffd43b', '#c79a12', 2.5);
      ell(ctx, 61, 19, 8, 8);
      fillStroke(ctx, '#ffd43b', '#c79a12', 2.5);
      ctx.beginPath();
      ctx.moveTo(68, 18);
      ctx.quadraticCurveTo(76, 19, 69, 23);
      fillStroke(ctx, '#ff8c3b', '#c4601a', 1.5);
      ell(ctx, 63, 17, 1.6, 1.6);
      ctx.fillStyle = '#2c1d12';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(46, 29);
      ctx.quadraticCurveTo(52, 34, 58, 29);
      ctx.strokeStyle = '#e0b020';
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case 7: {
      // headband with tails
      ctx.beginPath();
      ctx.moveTo(23, 47);
      ctx.quadraticCurveTo(55, 41, 87, 47);
      ctx.lineTo(87, 54);
      ctx.quadraticCurveTo(55, 48, 23, 54);
      ctx.closePath();
      fillStroke(ctx, '#ffffff', '#c9b9a8', 2);
      ell(ctx, 55, 47.5, 4.5, 3.5);
      ctx.fillStyle = '#e94b4b';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(86, 49);
      ctx.quadraticCurveTo(98, 44, 104, 50);
      ctx.moveTo(86, 52);
      ctx.quadraticCurveTo(97, 56, 102, 60);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.stroke();
      break;
    }
    case 8: {
      // matcha teacup with steam
      ctx.beginPath();
      ctx.moveTo(42, 22);
      ctx.lineTo(68, 22);
      ctx.lineTo(64, 38);
      ctx.quadraticCurveTo(55, 41, 46, 38);
      ctx.closePath();
      fillStroke(ctx, '#e9e2d0', '#8a7a62', 2.2);
      ell(ctx, 55, 22, 13, 3.5);
      fillStroke(ctx, '#7fae4a', '#8a7a62', 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      for (const x of [50, 58]) {
        ctx.beginPath();
        ctx.moveTo(x, 16);
        ctx.quadraticCurveTo(x - 4, 11, x, 7);
        ctx.quadraticCurveTo(x + 4, 3, x, 0);
        ctx.stroke();
      }
      break;
    }
    case 9: {
      // headphones
      ctx.beginPath();
      ctx.arc(55, 62, 35, Math.PI * 1.08, Math.PI * 1.92);
      ctx.strokeStyle = '#3d2b4a';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = '#ff7ab0';
      ctx.lineWidth = 3;
      ctx.stroke();
      for (const x of [21, 89]) {
        rr(ctx, x - 7, 50, 14, 22, 6);
        fillStroke(ctx, '#ff7ab0', '#3d2b4a', 2.5);
      }
      break;
    }
    case 10: {
      // straw hat
      ell(ctx, 55, 38, 40, 9);
      fillStroke(ctx, '#f0d48a', '#a8843a', 2.5);
      ctx.beginPath();
      ctx.moveTo(36, 37);
      ctx.quadraticCurveTo(38, 14, 55, 14);
      ctx.quadraticCurveTo(72, 14, 74, 37);
      ctx.closePath();
      fillStroke(ctx, '#f5dc96', '#a8843a', 2.5);
      ctx.beginPath();
      ctx.moveTo(37, 31);
      ctx.quadraticCurveTo(55, 35, 73, 31);
      ctx.lineTo(74, 36);
      ctx.quadraticCurveTo(55, 40, 36, 36);
      ctx.closePath();
      ctx.fillStyle = '#e25b4b';
      ctx.fill();
      break;
    }
    case 11: {
      // sunglasses + crescent moon clip
      ctx.fillStyle = '#2a2140';
      for (const x of [41, 69]) {
        rr(ctx, x - 11, 52, 22, 13, 6);
        ctx.fill();
      }
      ctx.fillRect(50, 55, 10, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(34, 55, 6, 2);
      ctx.fillRect(62, 55, 6, 2);
      ctx.save();
      ctx.translate(76, 34);
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.arc(5, -3, 8.5, 0, Math.PI * 2, true);
      ctx.fillStyle = '#ffe680';
      ctx.fill('evenodd');
      ctx.restore();
      break;
    }
    case 12: {
      // crown
      ctx.beginPath();
      ctx.moveTo(35, 40);
      ctx.lineTo(33, 16);
      ctx.lineTo(44, 27);
      ctx.lineTo(55, 10);
      ctx.lineTo(66, 27);
      ctx.lineTo(77, 16);
      ctx.lineTo(75, 40);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 10, 0, 40);
      g.addColorStop(0, '#fff2a8');
      g.addColorStop(1, '#f0b429');
      fillStroke(ctx, g, '#a8700f', 2.5);
      for (const [x, y, c] of [[55, 32, '#e94b6b'], [43, 34, '#4bb3e9'], [67, 34, '#5fd17a']] as const) {
        ell(ctx, x, y, 3.2, 3.2);
        ctx.fillStyle = c;
        ctx.fill();
      }
      for (const [x, y] of [[33, 16], [55, 10], [77, 16]]) {
        ell(ctx, x, y, 3, 3);
        ctx.fillStyle = '#fff7d0';
        ctx.fill();
      }
      break;
    }
  }
  void line;
}

// ------------------------------------------------------------------ pool

const POOL_W = 140;
const POOL_H = 110;
const PCX = 70;
const PCY = 58;

function woodRing(ctx: Ctx): CanvasGradient {
  const g = ctx.createLinearGradient(0, PCY - 38, 0, PCY + 38);
  g.addColorStop(0, '#c99260');
  g.addColorStop(1, '#8f5d39');
  return g;
}

function drawPoolBack(ctx: Ctx, water: number): void {
  // drop shadow
  ell(ctx, PCX, PCY + 8, 64, 36);
  ctx.fillStyle = 'rgba(70,40,20,0.18)';
  ctx.fill();
  // stones/wood rim
  ell(ctx, PCX, PCY, 64, 36);
  fillStroke(ctx, woodRing(ctx), '#5e3b22', 3);
  // plank seams
  ctx.strokeStyle = 'rgba(94,59,34,0.45)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(PCX + Math.cos(a) * 54, PCY + Math.sin(a) * 27);
    ctx.lineTo(PCX + Math.cos(a) * 63, PCY + Math.sin(a) * 35);
    ctx.stroke();
  }
  // water
  ell(ctx, PCX, PCY, 54, 27);
  const g = ctx.createRadialGradient(PCX - 10, PCY - 8, 4, PCX, PCY, 58);
  g.addColorStop(0, hex(lighten(water, 0.45)));
  g.addColorStop(0.6, hex(water));
  g.addColorStop(1, hex(darken(water, 0.18)));
  fillStroke(ctx, g, hex(darken(water, 0.3)), 2);
  // inner rim shadow
  ctx.save();
  ell(ctx, PCX, PCY, 54, 27);
  ctx.clip();
  ell(ctx, PCX, PCY - 18, 60, 22);
  ctx.strokeStyle = 'rgba(40,30,20,0.18)';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();
  // shine
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(PCX - 22, PCY - 9, 14, 4, -0.1, Math.PI * 1.1, Math.PI * 1.7);
  ctx.stroke();
}

function drawPoolFront(ctx: Ctx, water: number): void {
  // lower half of the water (covers the capybara below the waterline)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, PCY + 2, POOL_W, POOL_H);
  ctx.clip();
  ell(ctx, PCX, PCY, 54, 27);
  const g = ctx.createLinearGradient(0, PCY, 0, PCY + 27);
  g.addColorStop(0, hex(lighten(water, 0.15), 0.92));
  g.addColorStop(1, hex(darken(water, 0.12), 0.97));
  ctx.fillStyle = g;
  ctx.fill();
  // front rim
  ctx.beginPath();
  ctx.ellipse(PCX, PCY, 64, 36, 0, 0, Math.PI);
  ctx.ellipse(PCX, PCY, 54, 27, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = woodRing(ctx);
  ctx.fill();
  ctx.strokeStyle = '#5e3b22';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(PCX, PCY, 64, 36, 0, 0, Math.PI);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = hex(darken(water, 0.3));
  ctx.beginPath();
  ctx.ellipse(PCX, PCY, 54, 27, 0, 0, Math.PI);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(94,59,34,0.45)';
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 7; i++) {
    const a = (i / 14) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(PCX + Math.cos(a) * 54, PCY + Math.sin(a) * 27);
    ctx.lineTo(PCX + Math.cos(a) * 63, PCY + Math.sin(a) * 35);
    ctx.stroke();
  }
  ctx.restore();
  // ripple around the capybara
  ell(ctx, PCX, PCY + 3, 30, 7);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ------------------------------------------------------------------ misc sprites

function drawSlot(ctx: Ctx): void {
  rr(ctx, 3, 3, 134, 110, 22);
  ctx.fillStyle = 'rgba(120,80,45,0.28)';
  ctx.fill();
  rr(ctx, 6, 6, 128, 104, 20);
  const g = ctx.createLinearGradient(0, 6, 0, 110);
  g.addColorStop(0, 'rgba(255,248,232,0.55)');
  g.addColorStop(1, 'rgba(240,222,190,0.55)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  rr(ctx, 14, 14, 112, 88, 16);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGlow(ctx: Ctx): void {
  ctx.shadowColor = 'rgba(255,230,120,1)';
  ctx.shadowBlur = 14;
  ctx.strokeStyle = 'rgba(255,240,170,1)';
  ctx.lineWidth = 6;
  rr(ctx, 10, 10, 140, 116, 24);
  ctx.stroke();
}

function drawSteam(ctx: Ctx): void {
  const g = ctx.createRadialGradient(24, 24, 2, 24, 24, 24);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 48, 48);
}

function drawDrop(ctx: Ctx): void {
  ell(ctx, 8, 8, 7, 7);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ell(ctx, 6, 5.5, 2.2, 1.6);
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fill();
}

function drawCoin(ctx: Ctx): void {
  ell(ctx, 20, 21, 17, 17);
  ctx.fillStyle = '#c98d1c';
  ctx.fill();
  ell(ctx, 20, 19, 17, 17);
  const g = ctx.createRadialGradient(15, 13, 2, 20, 19, 18);
  g.addColorStop(0, '#fff3a8');
  g.addColorStop(1, '#f2b829');
  fillStroke(ctx, g, '#b07812', 2);
  ell(ctx, 20, 19, 11.5, 11.5);
  ctx.strokeStyle = 'rgba(176,120,18,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // little hot-spring wave mark
  ctx.strokeStyle = '#b07812';
  ctx.lineWidth = 2;
  for (const x of [15, 20, 25]) {
    ctx.beginPath();
    ctx.moveTo(x, 24);
    ctx.quadraticCurveTo(x - 3, 19, x, 16);
    ctx.quadraticCurveTo(x + 3, 13, x, 10);
    ctx.stroke();
  }
}

function drawSparkle(ctx: Ctx): void {
  ctx.translate(16, 16);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? 15 : 4;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

function drawShadow(ctx: Ctx): void {
  const g = ctx.createRadialGradient(65, 22, 4, 65, 22, 64);
  g.addColorStop(0, 'rgba(60,35,15,0.4)');
  g.addColorStop(1, 'rgba(60,35,15,0)');
  ctx.save();
  ctx.scale(1, 0.34);
  ctx.translate(0, 22 / 0.34 - 22);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 130, 130);
  ctx.restore();
}

function drawRays(ctx: Ctx): void {
  ctx.translate(200, 200);
  for (let i = 0; i < 16; i++) {
    ctx.rotate(Math.PI / 8);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-24, -200);
    ctx.lineTo(24, -200);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? 'rgba(255,236,170,0.55)' : 'rgba(255,214,140,0.4)';
    ctx.fill();
  }
  const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 200);
  g.addColorStop(0, 'rgba(255,250,230,1)');
  g.addColorStop(1, 'rgba(255,250,230,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-200, -200, 400, 400);
}

function drawTube(ctx: Ctx): void {
  // swim ring for the golden guest
  ell(ctx, 60, 26, 56, 22);
  ctx.fillStyle = '#ff6b6b';
  ctx.fill();
  ctx.save();
  ell(ctx, 60, 26, 56, 22);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  for (const a of [0.6, 1.6, 2.6]) {
    ctx.beginPath();
    ctx.moveTo(60, 26);
    ctx.arc(60, 26, 70, a, a + 0.45);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ell(ctx, 60, 22, 34, 11);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.strokeStyle = '#a8343a';
  ctx.lineWidth = 2.5;
  ell(ctx, 60, 26, 56, 22);
  ctx.stroke();
  ell(ctx, 60, 20, 30, 9);
  ctx.fillStyle = 'rgba(120,40,40,0.35)';
  ctx.fill();
}

// ------------------------------------------------------------------ icons

function drawIcon(ctx: Ctx, kind: string): void {
  const s = 64;
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#5a3a26';
  switch (kind) {
    case 'book': {
      rr(ctx, 10, 12, 44, 42, 6);
      fillStroke(ctx, '#e98aa8', '#5a3a26', 4);
      rr(ctx, 16, 12, 32, 36, 3);
      ctx.fillStyle = '#fff4e0';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(32, 14);
      ctx.lineTo(32, 46);
      ctx.strokeStyle = '#c4627f';
      ctx.lineWidth = 3;
      ctx.stroke();
      ell(ctx, 24, 28, 5, 4);
      ctx.fillStyle = '#a36d43';
      ctx.fill();
      ell(ctx, 40, 28, 5, 4);
      ctx.fill();
      break;
    }
    case 'sound':
    case 'mute': {
      ctx.beginPath();
      ctx.moveTo(10, 26);
      ctx.lineTo(20, 26);
      ctx.lineTo(32, 14);
      ctx.lineTo(32, 50);
      ctx.lineTo(20, 38);
      ctx.lineTo(10, 38);
      ctx.closePath();
      fillStroke(ctx, '#fff4e0', '#5a3a26', 4);
      if (kind === 'sound') {
        for (const r of [10, 18]) {
          ctx.beginPath();
          ctx.arc(34, 32, r, -0.8, 0.8);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = '#d9534f';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(40, 22);
        ctx.lineTo(56, 42);
        ctx.moveTo(56, 22);
        ctx.lineTo(40, 42);
        ctx.stroke();
      }
      break;
    }
    case 'video': {
      rr(ctx, 6, 18, 36, 28, 7);
      fillStroke(ctx, '#ffffff', '#5a3a26', 4);
      ctx.beginPath();
      ctx.moveTo(42, 28);
      ctx.lineTo(58, 19);
      ctx.lineTo(58, 45);
      ctx.lineTo(42, 36);
      ctx.closePath();
      fillStroke(ctx, '#ffffff', '#5a3a26', 4);
      ctx.beginPath();
      ctx.moveTo(19, 25);
      ctx.lineTo(31, 32);
      ctx.lineTo(19, 39);
      ctx.closePath();
      ctx.fillStyle = '#e98aa8';
      ctx.fill();
      break;
    }
    case 'shovel': {
      ctx.save();
      ctx.translate(32, 32);
      ctx.rotate(0.7);
      rr(ctx, -4, -30, 8, 34, 3);
      fillStroke(ctx, '#c48a57', '#5a3a26', 3);
      rr(ctx, -9, -32, 18, 7, 3);
      fillStroke(ctx, '#c48a57', '#5a3a26', 3);
      ctx.beginPath();
      ctx.moveTo(-12, 4);
      ctx.lineTo(12, 4);
      ctx.lineTo(10, 20);
      ctx.quadraticCurveTo(0, 32, -10, 20);
      ctx.closePath();
      fillStroke(ctx, '#b9c3c9', '#5a3a26', 3);
      ctx.restore();
      break;
    }
    case 'flame': {
      ctx.beginPath();
      ctx.moveTo(32, 6);
      ctx.bezierCurveTo(48, 22, 54, 34, 48, 46);
      ctx.bezierCurveTo(42, 58, 22, 58, 16, 46);
      ctx.bezierCurveTo(10, 34, 20, 24, 24, 16);
      ctx.bezierCurveTo(26, 26, 30, 28, 32, 6);
      fillStroke(ctx, '#ff8a4c', '#a8471c', 3.5);
      ctx.beginPath();
      ctx.moveTo(32, 28);
      ctx.bezierCurveTo(42, 38, 42, 52, 32, 52);
      ctx.bezierCurveTo(22, 52, 24, 40, 32, 28);
      ctx.fillStyle = '#ffd36b';
      ctx.fill();
      break;
    }
    case 'moon': {
      ctx.beginPath();
      ctx.arc(30, 32, 22, 0, Math.PI * 2);
      ctx.arc(42, 24, 18, 0, Math.PI * 2, true);
      ctx.fillStyle = '#ffe07a';
      ctx.fill('evenodd');
      ctx.fillStyle = '#5a3a26';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('z', 44, 46);
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('z', 52, 36);
      break;
    }
    case 'close': {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(18, 18);
      ctx.lineTo(46, 46);
      ctx.moveTo(46, 18);
      ctx.lineTo(18, 46);
      ctx.stroke();
      break;
    }
  }
  void s;
}

// ------------------------------------------------------------------ decorations

export interface DecoDef {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  sway?: number;
}

/** Placement of the 12 unlockable decorations (index 0 = level 1). */
export const DECOS: DecoDef[] = [
  { key: 'deco_1', x: 838, y: 108, w: 64, h: 120, depth: 6, sway: 0.08 }, // paper lantern
  { key: 'deco_2', x: 838, y: 455, w: 90, h: 280, depth: 4, sway: 0.02 }, // bamboo
  { key: 'deco_3', x: 96, y: 676, w: 70, h: 96, depth: 4 }, // stone lantern
  { key: 'deco_4', x: 330, y: 682, w: 230, h: 80, depth: 3 }, // bridge
  { key: 'deco_5', x: 520, y: 48, w: 210, h: 110, depth: 3, sway: 0.015 }, // cherry blossoms
  { key: 'deco_6', x: 640, y: 680, w: 210, h: 70, depth: 3 }, // koi pond
  { key: 'deco_7', x: 860, y: 54, w: 120, h: 100, depth: 2 }, // torii
  { key: 'deco_8', x: 700, y: 64, w: 260, h: 110, depth: 1 }, // mountain
  { key: 'deco_9', x: 985, y: 58, w: 110, h: 110, depth: 2, sway: 0.02 }, // maple
  { key: 'deco_10', x: 720, y: 14, w: 560, h: 40, depth: 5 }, // festival lights
  { key: 'deco_11', x: 470, y: 44, w: 70, h: 70, depth: 0 }, // moon
  { key: 'deco_12', x: 620, y: 40, w: 120, h: 80, depth: 0 }, // fireworks
];

function drawDeco(ctx: Ctx, i: number, w: number, h: number): void {
  const line = '#5e3b22';
  switch (i) {
    case 0: {
      // hanging paper lantern
      ctx.strokeStyle = line;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, 26);
      ctx.stroke();
      rr(ctx, w / 2 - 12, 24, 24, 8, 3);
      fillStroke(ctx, '#3b2a20');
      ell(ctx, w / 2, 62, 26, 32);
      const g = ctx.createRadialGradient(w / 2 - 6, 54, 4, w / 2, 62, 32);
      g.addColorStop(0, '#fff1c4');
      g.addColorStop(1, '#ff7a5c');
      fillStroke(ctx, g, '#a8402c', 2.5);
      ctx.strokeStyle = 'rgba(168,64,44,0.5)';
      ctx.lineWidth = 1.5;
      for (const ry of [12, 22]) {
        ctx.beginPath();
        ctx.ellipse(w / 2, 62, 26, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      rr(ctx, w / 2 - 12, 92, 24, 8, 3);
      fillStroke(ctx, '#3b2a20');
      ctx.strokeStyle = '#e94b4b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w / 2, 100);
      ctx.lineTo(w / 2, 116);
      ctx.stroke();
      break;
    }
    case 1: {
      // bamboo grove
      const stalks = [[18, 0, '#8fc46a'], [44, 30, '#7ab65a'], [68, 12, '#9ccf78']] as const;
      for (const [x, top, c] of stalks) {
        rr(ctx, x - 7, top, 14, h - top, 6);
        fillStroke(ctx, c, '#4d7a35', 2);
        ctx.strokeStyle = '#4d7a35';
        ctx.lineWidth = 2;
        for (let y = top + 40; y < h; y += 48) {
          ctx.beginPath();
          ctx.moveTo(x - 7, y);
          ctx.lineTo(x + 7, y);
          ctx.stroke();
        }
        for (let y = top + 30; y < h - 60; y += 96) {
          ctx.save();
          ctx.translate(x + 6, y);
          ctx.rotate(-0.5);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(14, -10, 30, -2);
          ctx.quadraticCurveTo(14, 4, 0, 0);
          fillStroke(ctx, '#7ab65a', '#4d7a35', 1.5);
          ctx.restore();
        }
      }
      break;
    }
    case 2: {
      // stone lantern
      ctx.fillStyle = '#9a9a92';
      ctx.strokeStyle = '#5f5f58';
      ctx.lineWidth = 2.5;
      rr(ctx, 14, h - 16, w - 28, 14, 4);
      fillStroke(ctx, '#a8a89e', '#5f5f58');
      rr(ctx, w / 2 - 8, h - 44, 16, 30, 3);
      fillStroke(ctx, '#a8a89e', '#5f5f58');
      rr(ctx, 16, h - 72, w - 32, 30, 5);
      fillStroke(ctx, '#b4b4aa', '#5f5f58');
      rr(ctx, w / 2 - 9, h - 66, 18, 18, 3);
      ctx.fillStyle = '#ffd36b';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(4, h - 70);
      ctx.lineTo(w / 2, h - 94);
      ctx.lineTo(w - 4, h - 70);
      ctx.closePath();
      fillStroke(ctx, '#a0a096', '#5f5f58');
      break;
    }
    case 3: {
      // red arched bridge
      ctx.beginPath();
      ctx.moveTo(6, h - 10);
      ctx.quadraticCurveTo(w / 2, 4, w - 6, h - 10);
      ctx.lineTo(w - 6, h - 2);
      ctx.quadraticCurveTo(w / 2, 18, 6, h - 2);
      ctx.closePath();
      fillStroke(ctx, '#d9534f', '#8a2e2a', 2.5);
      ctx.strokeStyle = '#8a2e2a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(10, h - 30);
      ctx.quadraticCurveTo(w / 2, -12, w - 10, h - 30);
      ctx.stroke();
      ctx.lineWidth = 3;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const x = 10 + t * (w - 20);
        const yTop = (1 - t) * (1 - t) * (h - 30) + 2 * (1 - t) * t * -12 + t * t * (h - 30);
        const yBase = (1 - t) * (1 - t) * (h - 10) + 2 * (1 - t) * t * 4 + t * t * (h - 10);
        ctx.beginPath();
        ctx.moveTo(x, yTop);
        ctx.lineTo(x, yBase);
        ctx.stroke();
      }
      break;
    }
    case 4: {
      // cherry blossom branch hanging from the top
      ctx.strokeStyle = '#6b4430';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.quadraticCurveTo(90, 30, w, 14);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(70, 22);
      ctx.quadraticCurveTo(100, 60, 120, 80);
      ctx.moveTo(140, 22);
      ctx.quadraticCurveTo(160, 50, 150, 76);
      ctx.stroke();
      const blobs = [[40, 20, 22], [80, 34, 26], [118, 70, 22], [150, 66, 20], [176, 24, 24], [110, 18, 20], [20, 12, 16]];
      for (const [x, y, r] of blobs) {
        ell(ctx, x, y, r, r * 0.8);
        ctx.fillStyle = '#ffc4d6';
        ctx.fill();
        ell(ctx, x - r * 0.25, y - r * 0.25, r * 0.55, r * 0.45);
        ctx.fillStyle = '#ffe1ea';
        ctx.fill();
      }
      for (let k = 0; k < 14; k++) {
        const x = 10 + ((k * 37) % (w - 20));
        const y = 20 + ((k * 23) % 70);
        ell(ctx, x, y, 3, 2.2, k);
        ctx.fillStyle = '#e98aa8';
        ctx.fill();
      }
      break;
    }
    case 5: {
      // koi pond
      ell(ctx, w / 2, h / 2, w / 2 - 4, h / 2 - 4);
      fillStroke(ctx, '#9a9a92', '#6f6f68', 2.5);
      ell(ctx, w / 2, h / 2, w / 2 - 12, h / 2 - 11);
      const g = ctx.createRadialGradient(w / 2 - 20, h / 2 - 8, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, '#8fe0e8');
      g.addColorStop(1, '#3f9fb0');
      ctx.fillStyle = g;
      ctx.fill();
      for (const [x, y, rot, c] of [[70, 34, 0.3, '#ff8c42'], [130, 40, -2.6, '#ffffff'], [110, 26, 3.4, '#ff6b4a']] as const) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ell(ctx, 0, 0, 13, 5.5);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-11, 0);
        ctx.lineTo(-20, -6);
        ctx.lineTo(-20, 6);
        ctx.closePath();
        ctx.fill();
        ell(ctx, 3, -1, 4, 2.5);
        ctx.fillStyle = c === '#ffffff' ? '#ff6b4a' : '#ffffff';
        ctx.fill();
        ctx.restore();
      }
      for (const [x, y] of [[40, 22], [160, 50]]) {
        ell(ctx, x, y, 12, 6);
        ctx.fillStyle = '#6fbf5a';
        ctx.fill();
      }
      break;
    }
    case 6: {
      // torii gate
      ctx.fillStyle = '#e04b3a';
      ctx.strokeStyle = '#7a2218';
      ctx.lineWidth = 2.5;
      rr(ctx, 22, 24, 12, h - 24, 3);
      fillStroke(ctx, '#e04b3a', '#7a2218');
      rr(ctx, w - 34, 24, 12, h - 24, 3);
      fillStroke(ctx, '#e04b3a', '#7a2218');
      rr(ctx, 12, 34, w - 24, 9, 3);
      fillStroke(ctx, '#e04b3a', '#7a2218');
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.quadraticCurveTo(w / 2, 22, w, 10);
      ctx.lineTo(w - 6, 22);
      ctx.quadraticCurveTo(w / 2, 30, 6, 22);
      ctx.closePath();
      fillStroke(ctx, '#3b2a20', '#1f1510');
      rr(ctx, 6, 20, w - 12, 8, 3);
      fillStroke(ctx, '#e04b3a', '#7a2218');
      break;
    }
    case 7: {
      // snowy mountain
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(w * 0.42, 8);
      ctx.quadraticCurveTo(w * 0.5, 0, w * 0.58, 8);
      ctx.lineTo(w, h);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#8ea6c8');
      g.addColorStop(1, '#b8cbe0');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w * 0.3, 40);
      ctx.lineTo(w * 0.42, 8);
      ctx.quadraticCurveTo(w * 0.5, 0, w * 0.58, 8);
      ctx.lineTo(w * 0.7, 40);
      for (let k = 0; k < 6; k++) ctx.lineTo(w * 0.7 - (k + 1) * (w * 0.4 / 6), k % 2 ? 40 : 30);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    }
    case 8: {
      // maple tree
      rr(ctx, w / 2 - 7, h - 50, 14, 50, 4);
      fillStroke(ctx, '#7a4a2c', '#4a2c18', 2);
      for (const [x, y, r, c] of [[w / 2, 40, 34, '#e8643c'], [w / 2 - 26, 56, 24, '#f08a3c'], [w / 2 + 26, 56, 24, '#d9483a'], [w / 2, 22, 22, '#f5a03c']] as const) {
        ell(ctx, x, y, r, r * 0.85);
        ctx.fillStyle = c;
        ctx.fill();
      }
      break;
    }
    case 9: {
      // festival lights garland
      ctx.strokeStyle = '#5e3b22';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 6);
      for (let k = 0; k < 4; k++) ctx.quadraticCurveTo((k + 0.5) * (w / 4), 30, (k + 1) * (w / 4), 6);
      ctx.stroke();
      const cols = ['#ff7a5c', '#ffd36b', '#7fd8d0', '#e98aa8', '#9ccc78'];
      for (let k = 0; k < 24; k++) {
        const seg = Math.floor(k / 6);
        const t = (k % 6) / 6 + 1 / 12;
        const x0 = seg * (w / 4);
        const x = x0 + t * (w / 4);
        const y = (1 - t) * (1 - t) * 6 + 2 * (1 - t) * t * 30 + t * t * 6 + 7;
        ell(ctx, x, y, 6, 7.5);
        fillStroke(ctx, cols[k % cols.length], 'rgba(90,58,38,0.6)', 1.5);
      }
      break;
    }
    case 10: {
      // full moon
      const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,250,220,1)');
      g.addColorStop(0.55, 'rgba(255,240,180,1)');
      g.addColorStop(0.7, 'rgba(255,240,180,0.35)');
      g.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (const [x, y, r] of [[30, 30, 4], [42, 40, 3], [36, 44, 2]]) {
        ell(ctx, x, y, r, r);
        ctx.fillStyle = 'rgba(230,210,150,0.8)';
        ctx.fill();
      }
      break;
    }
    case 11: {
      // golden fireworks
      for (const [cx, cy, r, c] of [[40, 36, 30, '#ffd36b'], [90, 30, 24, '#ff9fb8'], [70, 58, 18, '#fff1a8']] as const) {
        ctx.strokeStyle = c;
        ctx.lineWidth = 3;
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r * 0.35, cy + Math.sin(a) * r * 0.35);
          ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          ctx.stroke();
          ell(ctx, cx + Math.cos(a) * (r + 3), cy + Math.sin(a) * (r + 3), 2.2, 2.2);
          ctx.fillStyle = c;
          ctx.fill();
        }
      }
      break;
    }
  }
}

// ------------------------------------------------------------------ background

function drawBackground(ctx: Ctx, w: number, h: number): void {
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, 200);
  sky.addColorStop(0, '#ffe2c2');
  sky.addColorStop(1, '#fff3df');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const sun = ctx.createRadialGradient(560, 30, 10, 560, 30, 380);
  sun.addColorStop(0, 'rgba(255,255,240,0.9)');
  sun.addColorStop(1, 'rgba(255,255,240,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, 300);
  // distant hills
  const hills = (base: number, amp: number, color: string, phase: number) => {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, base + Math.sin(x / 140 + phase) * amp + Math.sin(x / 57 + phase * 2) * amp * 0.3);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  hills(96, 14, '#cfdcb8', 0.5);
  hills(112, 10, '#b5cc98', 2.1);
  // garden ground
  const grass = ctx.createLinearGradient(0, 110, 0, h);
  grass.addColorStop(0, '#a9c98a');
  grass.addColorStop(1, '#8db66f');
  ctx.fillStyle = grass;
  ctx.fillRect(0, 118, w, h - 118);
  // grass tufts & pebbles
  for (let i = 0; i < 70; i++) {
    const x = (i * 197.3) % w;
    const y = 130 + ((i * 89.7) % (h - 140));
    ctx.strokeStyle = 'rgba(80,120,60,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 3, y - 7);
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + 5, y - 8);
    ctx.stroke();
  }
  // stepping-stone path along the bottom (golden guest walks here)
  for (let i = 0; i < 13; i++) {
    const x = 30 + i * 100 + (i % 2) * 18;
    ell(ctx, x, 700 + (i % 3) * 3, 34, 11);
    ctx.fillStyle = 'rgba(190,180,160,0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,110,95,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // wooden deck under the grid
  ctx.save();
  ctx.shadowColor = 'rgba(70,40,20,0.35)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  rr(ctx, 30, 104, 780, 534, 26);
  ctx.fillStyle = '#d9a86c';
  ctx.fill();
  ctx.restore();
  ctx.save();
  rr(ctx, 30, 104, 780, 534, 26);
  ctx.clip();
  for (let y = 104, k = 0; y < 640; y += 34, k++) {
    ctx.fillStyle = k % 2 ? '#d6a467' : '#dcae73';
    ctx.fillRect(30, y, 780, 34);
    ctx.strokeStyle = 'rgba(120,75,40,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(810, y);
    ctx.stroke();
    const off = (k * 173) % 260;
    for (let x = 30 + off; x < 810; x += 260) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 34);
      ctx.stroke();
    }
  }
  ctx.restore();
  rr(ctx, 30, 104, 780, 534, 26);
  ctx.strokeStyle = '#8a5a38';
  ctx.lineWidth = 5;
  ctx.stroke();
}

// ------------------------------------------------------------------ public

export function generateArt(scene: Phaser.Scene): void {
  make(scene, 'bg', 1280, 720, (c) => drawBackground(c, 1280, 720), 1.5);
  make(scene, 'slot', 140, 116, drawSlot);
  make(scene, 'glow', 160, 136, drawGlow);
  make(scene, 'steam', 48, 48, drawSteam);
  make(scene, 'drop', 16, 16, drawDrop);
  make(scene, 'coin', 40, 42, drawCoin);
  make(scene, 'sparkle', 32, 32, drawSparkle);
  make(scene, 'shadow', 130, 44, drawShadow);
  make(scene, 'rays', 400, 400, drawRays, 1);
  make(scene, 'tube', 120, 52, drawTube);
  make(scene, 'capy', CAPY_W, CAPY_H, (c) => drawCapy(c, FUR));
  make(scene, 'capy_gold', CAPY_W, CAPY_H, (c) => drawCapy(c, GOLD_FUR));
  for (let L = 1; L <= 12; L++) {
    make(scene, `acc_${L}`, CAPY_W, CAPY_H, (c) => drawAccessory(c, L));
    make(scene, `pool_back_${L}`, POOL_W, POOL_H, (c) => drawPoolBack(c, WATER[L - 1]));
    make(scene, `pool_front_${L}`, POOL_W, POOL_H, (c) => drawPoolFront(c, WATER[L - 1]));
  }
  for (const k of ['book', 'sound', 'mute', 'video', 'shovel', 'flame', 'moon', 'close']) make(scene, `icon_${k}`, 64, 64, (c) => drawIcon(c, k));
  DECOS.forEach((d, i) => make(scene, d.key, d.w, d.h, (c) => drawDeco(c, i, d.w, d.h)));
}
