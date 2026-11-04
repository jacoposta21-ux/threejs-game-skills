import Phaser from 'phaser';
import { Ctx, blob, dabs, limb, linear, paintSheet, paintTexture, radial, rgba, rng } from './paint';

const OUT = '#07090c';
const TAU = Math.PI * 2;

function p2(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void) {
  paintTexture(scene, key, w * 2, h * 2, (c) => {
    c.scale(2, 2);
    draw(c);
  });
}

export function buildChapter3(scene: Phaser.Scene) {
  if (scene.textures.exists('ombra')) return;
  const r = rng(303);
  // block that exists only in the PAST: warm golden Keeper masonry
  p2(scene, 'eco-past', 32, 32, (c) => {
    c.fillStyle = OUT; c.fillRect(0, 0, 32, 32);
    c.fillStyle = linear(c, 0, 0, 0, 32, [[0, '#ffe2a0'], [0.5, '#c8963c'], [1, '#7a5620']]);
    c.fillRect(1.5, 1.5, 29, 29);
    dabs(c, 3, 3, 26, 26, 10, ['#fff0c8', '#a87a30'], 1, 3, 0.4, r);
    c.strokeStyle = 'rgba(60,40,10,0.6)'; c.lineWidth = 1;
    c.strokeRect(4.5, 4.5, 23, 23);
    c.strokeStyle = 'rgba(255,250,220,0.9)'; c.lineWidth = 1.4;
    c.beginPath(); c.arc(16, 16, 5, 0, TAU); c.moveTo(16, 8); c.lineTo(16, 24); c.stroke();
  });
  // block that exists only in the PRESENT: shadow-rot roots and rubble
  p2(scene, 'eco-present', 32, 32, (c) => {
    c.fillStyle = OUT; c.fillRect(0, 0, 32, 32);
    c.fillStyle = linear(c, 0, 0, 0, 32, [[0, '#4a3a6a'], [1, '#1a1228']]);
    c.fillRect(1.5, 1.5, 29, 29);
    c.strokeStyle = '#8a5ad0'; c.lineWidth = 2.2;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(r() * 32, 0); c.bezierCurveTo(r() * 32, 10, r() * 32, 22, r() * 32, 32); c.stroke(); }
    c.fillStyle = 'rgba(200,160,255,0.7)';
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(4 + r() * 24, 4 + r() * 24, 1.5, 0, TAU); c.fill(); }
  });
  // vine bud (grows a climbable vine when hit by a charged blast)
  p2(scene, 'vinebud', 28, 20, (c) => {
    c.fillStyle = radial(c, 14, 10, 14, [[0, 'rgba(160,255,200,0.6)'], [1, 'rgba(120,255,180,0)']]); c.fillRect(0, 0, 28, 20);
    c.fillStyle = OUT; c.beginPath(); c.ellipse(14, 14, 10, 7, 0, 0, TAU); c.fill();
    c.fillStyle = '#2f8f4f'; c.beginPath(); c.ellipse(14, 14, 8, 5.5, 0, 0, TAU); c.fill();
    c.fillStyle = '#9ff5c8'; c.beginPath(); c.moveTo(10, 12); c.quadraticCurveTo(14, 2, 18, 12); c.fill();
  });
  // lantern (unlit / lit)
  paintSheet(scene, 'lantern', 48, 96, 2, 2, (c, i) => {
    c.scale(2, 2);
    if (i) { c.fillStyle = radial(c, 12, 14, 16, [[0, 'rgba(255,250,220,1)'], [0.35, 'rgba(255,210,122,0.8)'], [1, 'rgba(255,190,90,0)']]); c.fillRect(0, 0, 24, 30); }
    c.fillStyle = OUT; c.fillRect(10, 20, 4, 28); c.fillRect(5, 44, 14, 4);
    c.fillStyle = '#8a7a50'; c.fillRect(11, 20, 2, 26);
    c.fillStyle = OUT; c.beginPath(); c.moveTo(4, 8); c.lineTo(20, 8); c.lineTo(18, 22); c.lineTo(6, 22); c.closePath(); c.fill();
    c.fillStyle = i ? '#ffe9a8' : '#2a2a34'; c.beginPath(); c.moveTo(6.5, 10); c.lineTo(17.5, 10); c.lineTo(16, 20); c.lineTo(8, 20); c.closePath(); c.fill();
    c.fillStyle = '#c9a050'; c.fillRect(3, 6, 18, 3); c.beginPath(); c.moveTo(6, 6); c.lineTo(12, 1); c.lineTo(18, 6); c.fill();
  });
  // updraft spore mote
  paintTexture(scene, 'spore', 12, 12, (c) => {
    c.fillStyle = radial(c, 6, 6, 6, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(0, 0, 12, 12);
  });
  // Mimic mushroom: frames 0-1 disguised (breathing), 2-3 jaws open
  paintSheet(scene, 'mimic', 96, 76, 4, 4, (c, i) => {
    c.scale(2, 2);
    const open = i >= 2 ? (i === 2 ? 0.6 : 1) : 0;
    const breathe = i === 1 ? 1 : 0;
    c.fillStyle = radial(c, 24, 20, 30, [[0, 'rgba(255,122,217,0.45)'], [1, 'rgba(255,122,217,0)']]);
    c.fillRect(0, 0, 48, 38);
    c.fillStyle = OUT; c.fillRect(18, 22, 12, 16);
    c.fillStyle = '#e8d7c0'; c.fillRect(19.5, 22, 9, 16);
    // lower jaw (stem side) when open
    if (open) {
      c.fillStyle = '#5a1030';
      c.beginPath(); c.ellipse(24, 22, 20, 6 + open * 6, 0, 0, Math.PI); c.fill();
      c.fillStyle = '#fff0e0';
      for (let k = 0; k < 7; k++) { const x = 8 + k * 5.4; c.beginPath(); c.moveTo(x, 22); c.lineTo(x + 2.4, 22 + 4 + open * 3); c.lineTo(x + 4.8, 22); c.fill(); }
    }
    // cap lifts when opening
    c.save();
    c.translate(24, 21);
    c.rotate(-open * 0.35);
    c.translate(-24, -21 - open * 6 - breathe * 0.8);
    c.fillStyle = OUT;
    c.beginPath(); c.ellipse(24, 21, 25, 14 + breathe, 0, Math.PI, TAU); c.lineTo(49, 23); c.lineTo(-1, 23); c.fill();
    c.fillStyle = linear(c, 0, 7, 0, 22, [[0, '#ff9ae6'], [1, '#a3307a']]);
    c.beginPath(); c.ellipse(24, 21, 23, 12 + breathe, 0, Math.PI, TAU); c.fill();
    c.fillStyle = 'rgba(255,240,250,0.85)';
    for (const [x, y, rr] of [[14, 15, 2.5], [26, 12, 3], [35, 16, 2]]) { c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill(); }
    if (open) {
      c.fillStyle = '#fff0e0';
      for (let k = 0; k < 7; k++) { const x = 8 + k * 5.4; c.beginPath(); c.moveTo(x, 22); c.lineTo(x + 2.4, 18 - open * 2); c.lineTo(x + 4.8, 22); c.fill(); }
      // eyes under the cap
      for (const x of [16, 32]) { c.fillStyle = radial(c, x, 20, 4, [[0, '#ffffff'], [0.4, '#ff3f97'], [1, 'rgba(255,63,151,0)']]); c.beginPath(); c.arc(x, 20, 4, 0, TAU); c.fill(); }
    } else {
      c.strokeStyle = 'rgba(80,10,40,0.7)'; c.lineWidth = 1.2;
      for (const x of [16, 32]) { c.beginPath(); c.moveTo(x - 2.5, 19); c.lineTo(x + 2.5, 19); c.stroke(); }
    }
    c.restore();
  });
  // L'Ombra Prima: 0-5 drifting, 6-7 lunge/scream
  paintSheet(scene, 'ombra', 360, 320, 8, 4, (c, i) => drawOmbra(c, i < 6 ? i / 6 : 0.4, i >= 6 ? (i - 5) / 2 : 0));
  const anim = (key: string, tex: string, a: number, n: number, fps: number, rep: number) =>
    scene.anims.create({ key, frames: Array.from({ length: n }, (_, k) => ({ key: tex, frame: a + k })), frameRate: fps, repeat: rep });
  anim('mimic-idle', 'mimic', 0, 2, 2, -1);
  anim('mimic-bite', 'mimic', 2, 2, 12, 0);
  anim('ombra-drift', 'ombra', 0, 6, 8, -1);
  anim('ombra-lunge', 'ombra', 6, 2, 8, 0);
}

function drawOmbra(c: Ctx, t: number, lunge: number) {
  const r = rng(77 + Math.floor(t * 6));
  const cx = 180, cy = 150;
  // smoky mass
  for (let i = 0; i < 46; i++) {
    const a = r() * TAU, d = r() * 110;
    const x = cx + Math.cos(a) * d * 1.2, y = cy + Math.sin(a) * d * 0.8 + 20;
    c.fillStyle = `rgba(${14 + r() * 20},${6 + r() * 6},${28 + r() * 24},${0.55 + r() * 0.35})`;
    blob(c, x + Math.sin(t * TAU + i) * 6, y, 30 + r() * 34, r, 8, 0.5);
    c.fill();
  }
  // tendrils
  c.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    const a = Math.PI * 0.1 + (k / 8) * Math.PI * 0.8;
    const len = 120 + r() * 50 + lunge * 40;
    c.strokeStyle = 'rgba(16,8,30,0.9)';
    c.lineWidth = 10 - k % 3 * 2;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * 60, cy + 40);
    c.bezierCurveTo(cx + Math.cos(a) * 110 + Math.sin(t * TAU + k) * 20, cy + 90, cx + Math.cos(a) * 130, cy + 140 + Math.sin(t * TAU * 2 + k) * 10, cx + Math.cos(a) * (60 + len * 0.6), cy + 40 + len);
    c.stroke();
  }
  // claws reaching forward when lunging
  for (const s of [-1, 1]) {
    const sx = cx + s * 70, sy = cy + 10;
    const hx = sx + s * 50 + lunge * 40, hy = sy + 70 - lunge * 40;
    limb(c, sx, sy, hx, hy, 12, '#140a24', '#050308', 3);
    c.strokeStyle = '#e8e0f0'; c.lineWidth = 3;
    for (let f = -1; f <= 1; f++) { c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + f * 9 + s * lunge * 10, hy + 22); c.stroke(); }
  }
  // crown of horns
  c.fillStyle = '#0a0612';
  for (let k = 0; k < 7; k++) {
    const x = cx - 75 + k * 25, h = 40 + Math.abs(3 - k) * -8 + 30;
    c.beginPath(); c.moveTo(x - 10, cy - 50); c.quadraticCurveTo(x - 6, cy - 50 - h, x + (k - 3) * 6, cy - 60 - h); c.quadraticCurveTo(x + 4, cy - 50 - h * 0.5, x + 10, cy - 50); c.fill();
  }
  // many eyes
  const eyes = [[-40, -12, 9], [40, -12, 9], [0, -30, 12], [-70, 10, 6], [70, 10, 6], [-20, 20, 5], [22, 22, 5]];
  for (const [ex, ey, er] of eyes) {
    c.fillStyle = radial(c, cx + ex, cy + ey, er * 2.4, [[0, 'rgba(255,255,255,1)'], [0.35, lunge ? '#ff5aa8' : '#c87aff'], [1, 'rgba(120,40,200,0)']]);
    c.beginPath(); c.arc(cx + ex, cy + ey, er * 2.4, 0, TAU); c.fill();
    c.fillStyle = '#050308'; c.beginPath(); c.ellipse(cx + ex, cy + ey, er * 0.25, er * 0.8, 0, 0, TAU); c.fill();
  }
  void rgba;
}
