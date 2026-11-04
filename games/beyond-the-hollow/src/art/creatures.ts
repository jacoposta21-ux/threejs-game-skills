import Phaser from 'phaser';
import { Ctx, blob, limb, linear, paintSheet, radial, rng } from './paint';

const OUT = '#07080c';
const TAU = Math.PI * 2;

function anim(scene: Phaser.Scene, key: string, tex: string, start: number, count: number, fps: number, repeat: number) {
  scene.anims.create({ key, frames: Array.from({ length: count }, (_, k) => ({ key: tex, frame: start + k })), frameRate: fps, repeat });
}

// ------------------------------------------------------------------- PIP
function drawPip(ctx: Ctx, t: number) {
  const cx = 32, cy = 34;
  ctx.fillStyle = radial(ctx, cx, cy + 6, 30, [[0, 'rgba(255,230,140,0.55)'], [0.5, 'rgba(255,200,90,0.15)'], [1, 'rgba(255,200,90,0)']]);
  ctx.fillRect(0, 0, 64, 64);
  // wings (two pairs) flapping
  const wa = Math.sin(t * TAU) * 0.9;
  for (const [ox, len, ph] of [[-2, 22, 0], [3, 18, 0.6]] as const) {
    ctx.save();
    ctx.translate(cx + ox, cy - 6);
    ctx.rotate(-0.6 - wa * (ph ? 0.8 : 1));
    ctx.fillStyle = 'rgba(190,235,255,0.42)';
    ctx.strokeStyle = 'rgba(220,250,255,0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(-len / 2, 0, len / 2, 5.5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-len + 3, 0);
    ctx.stroke();
    ctx.restore();
  }
  // abdomen: glass bulb with filament
  ctx.fillStyle = OUT;
  ctx.beginPath();
  ctx.ellipse(cx - 8, cy + 6, 11, 9, -0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = radial(ctx, cx - 9, cy + 7, 11, [[0, '#fffbe0'], [0.35, '#ffe27a'], [1, '#d18a1e']]);
  ctx.beginPath();
  ctx.ellipse(cx - 8, cy + 6, 9, 7.2, -0.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,60,0,0.6)';
  ctx.lineWidth = 1;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.ellipse(cx - 8 + i * 4, cy + 6 - i * 2.2, 1.2, 6, -0.5, 0, TAU);
    ctx.stroke();
  }
  // brass thorax
  ctx.fillStyle = OUT;
  ctx.beginPath();
  ctx.ellipse(cx + 3, cy, 8, 7, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = linear(ctx, cx - 3, cy - 6, cx + 6, cy + 6, [[0, '#f2cf7d'], [0.5, '#b6813b'], [1, '#6c4520']]);
  ctx.beginPath();
  ctx.ellipse(cx + 3, cy, 6.3, 5.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffe9b0';
  ctx.fillRect(cx + 0, cy - 4, 4, 1.5);
  // head with lens eye
  ctx.fillStyle = OUT;
  ctx.beginPath();
  ctx.arc(cx + 12, cy - 3, 6.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#9c6a30';
  ctx.beginPath();
  ctx.arc(cx + 12, cy - 3, 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = radial(ctx, cx + 14, cy - 4, 4, [[0, '#ffffff'], [0.4, '#7fe9ff'], [1, '#1b6c8a']]);
  ctx.beginPath();
  ctx.arc(cx + 14, cy - 3.5, 3.4, 0, TAU);
  ctx.fill();
  // antennae
  ctx.strokeStyle = '#2a1c10';
  ctx.lineWidth = 1.4;
  for (const d of [0, 4]) {
    ctx.beginPath();
    ctx.moveTo(cx + 11 + d * 0.5, cy - 8);
    ctx.quadraticCurveTo(cx + 15 + d, cy - 16, cx + 20 + d, cy - 17 + d * 0.5);
    ctx.stroke();
    ctx.fillStyle = '#ffd36b';
    ctx.beginPath();
    ctx.arc(cx + 20 + d, cy - 17 + d * 0.5, 1.8, 0, TAU);
    ctx.fill();
  }
  // tiny legs
  ctx.strokeStyle = '#2a1c10';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 3, cy + 5);
    ctx.lineTo(cx + i * 3 - 2, cy + 11 + Math.sin(t * TAU + i) * 1.2);
    ctx.stroke();
  }
}

// ------------------------------------------------------------------- CRAWLER
function drawCrawler(ctx: Ctx, t: number, pounce: number) {
  const r = rng(7);
  const bx = 46, by = 40 - pounce * 4;
  // legs (behind body)
  for (let i = 0; i < 4; i++) {
    const lx = bx - 22 + i * 14;
    const ph = t * TAU + i * 1.6;
    const lift = Math.max(0, Math.sin(ph)) * 6 * (1 - pounce);
    const reach = Math.cos(ph) * 6 * (1 - pounce) + pounce * (i < 2 ? -10 : 10);
    const kx = lx + reach * 0.4 - 3, ky = by - 14 - lift;
    const fx = lx + reach - 6 + (i < 2 ? -4 : 4), fy = 60 - lift - pounce * 6;
    limb(ctx, lx, by - 2, kx, ky, 3.6, '#2a1f3c', OUT, 1.6);
    limb(ctx, kx, ky, fx, fy, 2.8, '#3a2c52', OUT, 1.5);
  }
  // body: segmented carapace plates
  for (let i = 0; i < 4; i++) {
    const sx = bx - 20 + i * 12, sy = by + Math.sin(t * TAU + i) * 0.8;
    ctx.fillStyle = OUT;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 12, 10 - i * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = linear(ctx, sx, sy - 10, sx, sy + 8, [[0, '#5a4a84'], [0.45, '#2a1f40'], [1, '#120c1e']]);
    ctx.beginPath();
    ctx.ellipse(sx, sy, 10, 8 - i * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,25,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy + 3, 7, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  // spines
  ctx.fillStyle = '#3a2c56';
  for (let i = 0; i < 5; i++) {
    const sx = bx - 24 + i * 10;
    ctx.beginPath();
    ctx.moveTo(sx - 3, by - 7);
    ctx.lineTo(sx - 5 - r() * 3, by - 14 - r() * 3);
    ctx.lineTo(sx + 2, by - 8);
    ctx.fill();
  }
  // head + mandibles
  const hx = bx + 26, hy = by + 2;
  ctx.fillStyle = OUT;
  ctx.beginPath();
  ctx.ellipse(hx, hy, 11, 9, 0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = linear(ctx, hx, hy - 8, hx, hy + 8, [[0, '#4a3c70'], [1, '#160f24']]);
  ctx.beginPath();
  ctx.ellipse(hx, hy, 9, 7, 0.2, 0, TAU);
  ctx.fill();
  const mo = 0.3 + Math.sin(t * TAU * 2) * 0.2 + pounce * 0.5;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hx + 7, hy - 2);
  ctx.quadraticCurveTo(hx + 15, hy - 6 - mo * 6, hx + 17, hy + 1);
  ctx.moveTo(hx + 7, hy + 4);
  ctx.quadraticCurveTo(hx + 15, hy + 8 + mo * 6, hx + 17, hy + 2);
  ctx.stroke();
  // glowing eyes
  for (const [ex, ey] of [[hx + 3, hy - 3], [hx + 7, hy - 1], [hx + 4, hy + 2]]) {
    ctx.fillStyle = radial(ctx, ex, ey, 5, [[0, '#ffd6ec'], [0.4, '#ff3f97'], [1, 'rgba(255,63,151,0)']]);
    ctx.beginPath();
    ctx.arc(ex, ey, 5, 0, TAU);
    ctx.fill();
  }
}

// ------------------------------------------------------------------- STALKER
function drawStalker(ctx: Ctx, t: number, lunge: number) {
  const r = rng(11 + Math.floor(t * 6));
  const cx = 64, top = 30;
  // smoky body
  for (let i = 0; i < 26; i++) {
    const y = top + 30 + i * 5;
    const w = 18 + Math.sin(i * 0.5) * 4 + i * 0.6;
    const sway = Math.sin(t * TAU + i * 0.4) * (2 + i * 0.25);
    ctx.fillStyle = `rgba(${10 + i},${6},${18 + i},${0.9 - i * 0.028})`;
    blob(ctx, cx + sway, y, w, r, 8, 0.5);
    ctx.fill();
  }
  // wisps
  ctx.strokeStyle = 'rgba(30,14,44,0.7)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const sx = cx - 22 + i * 9;
    ctx.beginPath();
    ctx.moveTo(sx, 150);
    ctx.bezierCurveTo(sx + Math.sin(t * TAU + i) * 10, 165, sx - 8 + i, 175, sx + Math.cos(t * TAU + i) * 12, 190);
    ctx.stroke();
  }
  // arms
  const reach = lunge * 26;
  for (const side of [-1, 1]) {
    const sx = cx + side * 14, sy = top + 46;
    const ex = sx + side * 10 + reach * 0.6, ey = sy + 30 - lunge * 18 + Math.sin(t * TAU + side) * 3;
    const hx = ex + side * 4 + reach, hy = ey + 32 - lunge * 26;
    limb(ctx, sx, sy, ex, ey, 6, '#1a0f26', '#050308', 2);
    limb(ctx, ex, ey, hx, hy, 4.5, '#1a0f26', '#050308', 2);
    ctx.strokeStyle = '#d8cfc2';
    ctx.lineWidth = 1.6;
    for (let f = -1; f <= 1; f++) {
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + f * 4 + reach * 0.15, hy + 10);
      ctx.stroke();
    }
  }
  // mask head
  ctx.fillStyle = '#050308';
  ctx.beginPath();
  ctx.ellipse(cx + lunge * 6, top + 24, 15, 21, 0.05, 0, TAU);
  ctx.fill();
  ctx.fillStyle = linear(ctx, cx - 10, top + 6, cx + 10, top + 44, [[0, '#efe6d8'], [1, '#8d8377']]);
  ctx.beginPath();
  ctx.ellipse(cx + lunge * 6, top + 24, 12, 18, 0.05, 0, TAU);
  ctx.fill();
  // hollow eyes with faint glow
  for (const s of [-1, 1]) {
    const ex = cx + lunge * 6 + s * 5, ey = top + 20;
    ctx.fillStyle = '#0b0610';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 3.6, 6, s * 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = radial(ctx, ex, ey + 1, 4, [[0, 'rgba(255,240,230,0.95)'], [1, 'rgba(255,90,90,0)']]);
    ctx.beginPath();
    ctx.arc(ex, ey + 1, 2.2 + lunge, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(40,30,30,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx + lunge * 6 - 4, top + 34);
  ctx.quadraticCurveTo(cx + lunge * 6, top + 37 + lunge * 4, cx + lunge * 6 + 4, top + 34);
  ctx.stroke();
}

// ------------------------------------------------------------------- BURROWER
function drawBurrower(ctx: Ctx, t: number, open: number, lean: number) {
  const base = 172;
  const segs = 9;
  const pts: [number, number][] = [];
  for (let i = 0; i <= segs; i++) {
    const k = i / segs;
    pts.push([64 + Math.sin(t * TAU + k * 2.5) * 6 * k + lean * k * k * 26, base - k * 130]);
  }
  for (let i = 0; i < segs; i++) {
    const [x, y] = pts[i];
    const w = 24 - i * 0.9;
    ctx.fillStyle = OUT;
    ctx.beginPath();
    ctx.ellipse(x, y, w + 2.5, 13, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = linear(ctx, x - w, y, x + w, y, [[0, '#3c2533'], [0.45, '#8d5c78'], [0.7, '#b7839f'], [1, '#4b2c3e']]);
    ctx.beginPath();
    ctx.ellipse(x, y, w, 11, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x - w * 0.6, y - 9, w * 0.7, 2);
    // bioluminescent spots
    ctx.fillStyle = radial(ctx, x + 8, y, 4, [[0, '#c9fff6'], [1, 'rgba(80,240,220,0)']]);
    ctx.beginPath();
    ctx.arc(x + 8, y, 4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 10, y + 2, 3, 0, TAU);
    ctx.fill();
  }
  // head with petal jaws
  const [hx, hy] = pts[segs];
  ctx.fillStyle = radial(ctx, hx, hy - 4, 18, [[0, '#ffd27a'], [0.4, '#ff7a2c'], [1, '#5b1a10']]);
  ctx.beginPath();
  ctx.arc(hx, hy - 4, 15, 0, TAU);
  ctx.fill();
  for (let p = 0; p < 4; p++) {
    const a = -Math.PI / 2 + (p - 1.5) * (0.55 + open * 0.45);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = OUT;
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.quadraticCurveTo(-13, -26 - open * 8, 0, -34 - open * 10);
    ctx.quadraticCurveTo(13, -26 - open * 8, 11, 0);
    ctx.fill();
    ctx.fillStyle = linear(ctx, 0, 0, 0, -34, [[0, '#6d3c55'], [1, '#d8a0b8']]);
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.quadraticCurveTo(-10, -24 - open * 8, 0, -31 - open * 10);
    ctx.quadraticCurveTo(10, -24 - open * 8, 8, -2);
    ctx.fill();
    ctx.fillStyle = '#f4ead8';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(-5 + k * 4, -4);
      ctx.lineTo(-3 + k * 4, -11);
      ctx.lineTo(-1 + k * 4, -4);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------- GUARDIAN
interface GPal { plate: string; plateHi: string; skin: string; moss: string; core: string; coreHi: string; eye: string }
const GUARD_PAL: Record<string, GPal> = {
  guardian: { plate: '#3e5a60', plateHi: '#8fb5b0', skin: '#1d2b30', moss: '#e7d6b0', core: '#53e8ff', coreHi: '#e6ffff', eye: '#9ff6ff' },
  heartguard: { plate: '#5a2c35', plateHi: '#d79b8c', skin: '#22121a', moss: '#efe0cc', core: '#ff4d5e', coreHi: '#fff0e0', eye: '#ffcf6e' },
  keeper: { plate: '#6a5a3a', plateHi: '#f0d090', skin: '#1a1a24', moss: '#9ff5c8', core: '#ffd27a', coreHi: '#fffbe8', eye: '#ffe9a8' },
};

function drawGuardian(ctx: Ctx, pal: GPal, t: number, mode: 'walk' | 'slam' | 'roar', k: number, coreOpen: number) {
  const r = rng(5);
  const W = 320;
  let rear = 0, headDrop = 0, mouth = 0.1;
  if (mode === 'slam') { rear = k < 0.5 ? k * 2 : (1 - k) * 2 * 1.0; headDrop = k > 0.5 ? (k - 0.5) * 30 : 0; }
  if (mode === 'roar') { mouth = 0.6 + k * 0.4; rear = 0.25; }
  const bodyX = 150, bodyY = 140 - rear * 34;
  const tilt = -rear * 0.28;
  // legs
  const legs = [[-70, 1], [-40, 0], [40, 1], [70, 0]] as const;
  for (const [ox, far] of legs) {
    const ph = t * TAU + (ox < 0 ? 0 : Math.PI) + far * Math.PI;
    const step = mode === 'walk' ? Math.sin(ph) * 14 : 0;
    const lift = mode === 'walk' ? Math.max(0, Math.cos(ph)) * 10 : ox > 0 ? rear * 40 : 0;
    const hx = bodyX + ox * Math.cos(tilt), hy = bodyY + ox * Math.sin(tilt) + 12;
    const fx = hx + step, fy = 228 - lift;
    const kx = (hx + fx) / 2 + (ox > 0 ? 10 : -10), ky = (hy + fy) / 2;
    const col = far ? pal.skin : '#2b3a3c';
    limb(ctx, hx, hy, kx, ky, 26, far ? '#121a1c' : col, OUT, 3);
    limb(ctx, kx, ky, fx, fy, 22, far ? '#121a1c' : col, OUT, 3);
    ctx.fillStyle = OUT;
    ctx.beginPath();
    ctx.ellipse(fx + 6, fy + 2, 18, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = pal.moss;
    for (let c = 0; c < 3; c++) {
      ctx.beginPath();
      ctx.moveTo(fx + 8 + c * 6, fy + 2);
      ctx.lineTo(fx + 14 + c * 6, fy + 9);
      ctx.lineTo(fx + 6 + c * 6, fy + 6);
      ctx.fill();
    }
  }
  ctx.save();
  ctx.translate(bodyX, bodyY);
  ctx.rotate(tilt);
  // body mass
  ctx.fillStyle = OUT;
  ctx.beginPath();
  ctx.ellipse(0, 0, 102, 58, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = linear(ctx, 0, -55, 0, 55, [[0, '#33464a'], [1, pal.skin]]);
  ctx.beginPath();
  ctx.ellipse(0, 0, 98, 54, 0, 0, TAU);
  ctx.fill();
  // core (chest), visible through plates when open
  const cr = 16 + coreOpen * 6;
  ctx.fillStyle = radial(ctx, 58, 14, cr * 2.2, [[0, pal.coreHi], [0.3, pal.core], [1, 'rgba(0,0,0,0)']]);
  ctx.beginPath();
  ctx.arc(58, 14, cr * 2.2, 0, TAU);
  ctx.fill();
  // armor plates (shift aside when core open)
  for (let i = 0; i < 6; i++) {
    const px = -80 + i * 30, py = -26 - Math.sin((i / 5) * Math.PI) * 18;
    const shift = i >= 4 ? coreOpen * -16 : 0;
    ctx.save();
    ctx.translate(px, py + shift);
    ctx.rotate(-0.25 + i * 0.1);
    ctx.fillStyle = OUT;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 24, 0, Math.PI, TAU);
    ctx.lineTo(30, 6);
    ctx.lineTo(-30, 6);
    ctx.fill();
    ctx.fillStyle = linear(ctx, 0, -24, 0, 6, [[0, pal.plateHi], [0.6, pal.plate], [1, '#1b2224']]);
    ctx.beginPath();
    ctx.ellipse(0, 0, 27, 21, 0, Math.PI, TAU);
    ctx.lineTo(27, 3);
    ctx.lineTo(-27, 3);
    ctx.fill();
    // barnacles / bone growths
    ctx.fillStyle = pal.moss;
    for (let b = 0; b < 4; b++) {
      ctx.beginPath();
      ctx.arc(-16 + r() * 32, -8 - r() * 10, 2 + r() * 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  // chest plates covering core
  if (coreOpen < 0.95) {
    ctx.globalAlpha = 1 - coreOpen;
    ctx.fillStyle = OUT;
    ctx.beginPath();
    ctx.ellipse(58, 14, 26, 22, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = linear(ctx, 40, -4, 70, 34, [[0, pal.plateHi], [1, pal.plate]]);
    ctx.beginPath();
    ctx.ellipse(58, 14, 23, 19, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 14);
    ctx.lineTo(78, 14);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // head
  const hx = 104, hy = 2 + headDrop - rear * 10;
  ctx.fillStyle = OUT;
  ctx.beginPath();
  ctx.ellipse(hx, hy, 34, 26, 0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = linear(ctx, hx, hy - 24, hx, hy + 24, [[0, pal.plateHi], [0.5, pal.plate], [1, pal.skin]]);
  ctx.beginPath();
  ctx.ellipse(hx, hy, 31, 23, 0.2, 0, TAU);
  ctx.fill();
  // jaw
  ctx.fillStyle = OUT;
  ctx.beginPath();
  ctx.moveTo(hx - 6, hy + 10);
  ctx.lineTo(hx + 38, hy + 8 + mouth * 22);
  ctx.lineTo(hx + 10, hy + 24 + mouth * 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.moss;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(hx + 8 + i * 7, hy + 10 + mouth * 4);
    ctx.lineTo(hx + 11 + i * 7, hy + 20 + mouth * 8);
    ctx.lineTo(hx + 14 + i * 7, hy + 10 + mouth * 4);
    ctx.fill();
  }
  // horns
  ctx.fillStyle = pal.moss;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3;
  for (const [ox, len] of [[-8, 46], [10, 36]]) {
    ctx.beginPath();
    ctx.moveTo(hx + ox - 8, hy - 16);
    ctx.quadraticCurveTo(hx + ox - 30, hy - 20 - len, hx + ox - 50, hy - len + 6);
    ctx.quadraticCurveTo(hx + ox - 22, hy - 26 - len * 0.4, hx + ox + 6, hy - 18);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }
  // eyes
  for (const [ex, ey] of [[hx + 14, hy - 6], [hx + 24, hy - 2]]) {
    ctx.fillStyle = radial(ctx, ex, ey, 9, [[0, '#ffffff'], [0.35, pal.eye], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath();
    ctx.arc(ex, ey, 9, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function buildCreatures(scene: Phaser.Scene) {
  paintSheet(scene, 'pip', 64, 64, 4, 4, (ctx, i) => drawPip(ctx, i / 4));
  anim(scene, 'pip-fly', 'pip', 0, 4, 22, -1);

  paintSheet(scene, 'crawler', 96, 64, 8, 8, (ctx, i) => (i < 6 ? drawCrawler(ctx, i / 6, 0) : drawCrawler(ctx, 0.2, i === 6 ? 0.6 : 1)));
  anim(scene, 'crawler-walk', 'crawler', 0, 6, 16, -1);
  anim(scene, 'crawler-pounce', 'crawler', 6, 2, 10, 0);

  paintSheet(scene, 'stalker', 128, 192, 9, 9, (ctx, i) => (i < 6 ? drawStalker(ctx, i / 6, 0) : drawStalker(ctx, 0.3, (i - 5) / 3)));
  anim(scene, 'stalker-drift', 'stalker', 0, 6, 8, -1);
  anim(scene, 'stalker-lunge', 'stalker', 6, 3, 12, 0);

  paintSheet(scene, 'burrower', 128, 176, 7, 7, (ctx, i) => (i < 4 ? drawBurrower(ctx, i / 4, 0.1 + Math.sin((i / 4) * TAU) * 0.08, 0) : drawBurrower(ctx, 0.1, (i - 3) / 3, (i - 3) / 3)));
  anim(scene, 'burrower-idle', 'burrower', 0, 4, 7, -1);
  anim(scene, 'burrower-bite', 'burrower', 4, 3, 14, 0);

  for (const key of ['guardian', 'heartguard', 'keeper']) {
    const pal = GUARD_PAL[key];
    paintSheet(scene, key, 320, 240, 14, 7, (ctx, i) => {
      if (i < 6) drawGuardian(ctx, pal, i / 6, 'walk', 0, 0);
      else if (i < 10) drawGuardian(ctx, pal, 0, 'slam', (i - 6) / 3, 0);
      else if (i < 12) drawGuardian(ctx, pal, 0, 'roar', i - 10, 0);
      else drawGuardian(ctx, pal, 0, 'walk', 0, i === 12 ? 0.6 : 1);
    });
    anim(scene, key + '-walk', key, 0, 6, 8, -1);
    anim(scene, key + '-slam', key, 6, 4, 8, 0);
    anim(scene, key + '-roar', key, 10, 2, 4, 0);
    anim(scene, key + '-open', key, 12, 2, 8, 0);
  }
}
