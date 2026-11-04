import Phaser from 'phaser';
import { Ctx, blob, linear, paintSheet, paintTexture, radial, rng } from './paint';
import { buildIlse } from './elias';

const OUT = '#07090c';
const TAU = Math.PI * 2;

function p2(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void) {
  paintTexture(scene, key, w * 2, h * 2, (c) => {
    c.scale(2, 2);
    draw(c);
  });
}

export function buildChapter4(scene: Phaser.Scene) {
  if (scene.textures.exists('heartshadow')) return;
  buildIlse(scene);
  // light-thread anchor node, and its shadow-infected twin
  for (const [key, a, b] of [['node', '#fff6d0', '#ffd27a'], ['node-dark', '#f0d8ff', '#9a4ae0']] as const) {
    p2(scene, key, 28, 28, (c) => {
      c.fillStyle = radial(c, 14, 14, 14, [[0, a], [0.35, b], [1, 'rgba(0,0,0,0)']]);
      c.fillRect(0, 0, 28, 28);
      c.strokeStyle = OUT; c.lineWidth = 3;
      c.beginPath(); c.arc(14, 14, 8, 0, TAU); c.stroke();
      c.strokeStyle = b; c.lineWidth = 1.6;
      c.beginPath(); c.arc(14, 14, 8, 0, TAU); c.stroke();
      for (let k = 0; k < 4; k++) { const ang = k * Math.PI / 2 + Math.PI / 4; c.beginPath(); c.moveTo(14 + Math.cos(ang) * 9, 14 + Math.sin(ang) * 9); c.lineTo(14 + Math.cos(ang) * 13, 14 + Math.sin(ang) * 13); c.stroke(); }
    });
  }
  // golden seed mote (Pip collects these in the final fight)
  p2(scene, 'mote', 20, 20, (c) => {
    c.fillStyle = radial(c, 10, 10, 10, [[0, '#ffffff'], [0.3, '#ffe9a0'], [1, 'rgba(255,200,90,0)']]);
    c.beginPath(); c.arc(10, 10, 10, 0, TAU); c.fill();
    c.fillStyle = '#fff6d8'; c.beginPath(); c.moveTo(10, 3); c.lineTo(12, 10); c.lineTo(10, 17); c.lineTo(8, 10); c.fill();
  });
  // Lucimante: a jellyfish of sap-light, drawn to Pip
  paintSheet(scene, 'jelly', 96, 112, 4, 4, (c, i) => {
    c.scale(2, 2);
    const t = i / 4;
    const squash = Math.sin(t * TAU) * 2;
    c.fillStyle = radial(c, 24, 20, 26, [[0, 'rgba(160,255,240,0.45)'], [1, 'rgba(120,255,230,0)']]);
    c.fillRect(0, 0, 48, 56);
    c.strokeStyle = 'rgba(200,255,250,0.75)'; c.lineWidth = 1.4;
    for (let k = 0; k < 6; k++) {
      const x = 12 + k * 5;
      c.beginPath(); c.moveTo(x, 22);
      c.bezierCurveTo(x + Math.sin(t * TAU + k) * 4, 32, x - Math.sin(t * TAU + k) * 4, 42, x + Math.sin(t * TAU + k * 2) * 3, 54);
      c.stroke();
    }
    c.fillStyle = OUT; c.beginPath(); c.ellipse(24, 18, 17 + squash, 13 - squash * 0.6, 0, Math.PI, TAU); c.lineTo(41 + squash, 22); c.lineTo(7 - squash, 22); c.fill();
    c.fillStyle = linear(c, 0, 6, 0, 22, [[0, 'rgba(230,255,252,0.95)'], [1, 'rgba(90,220,210,0.85)']]);
    c.beginPath(); c.ellipse(24, 18, 15 + squash, 11 - squash * 0.6, 0, Math.PI, TAU); c.lineTo(39 + squash, 21); c.lineTo(9 - squash, 21); c.fill();
    c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(24, 14, 4, 0, TAU); c.fill();
  });
  // Il Cuore d'Ombra: the Seed strangled by the First Shadow. 0-3 pulse, 4-5 core torn open
  paintSheet(scene, 'heartshadow', 380, 380, 6, 3, (c, i) => drawHeart(c, i < 4 ? i / 4 : 0.2, i >= 4 ? (i === 4 ? 0.6 : 1) : 0));
  const anim = (key: string, tex: string, a: number, n: number, fps: number, rep: number) =>
    scene.anims.create({ key, frames: Array.from({ length: n }, (_, k) => ({ key: tex, frame: a + k })), frameRate: fps, repeat: rep });
  anim('jelly-swim', 'jelly', 0, 4, 6, -1);
  anim('heart-pulse', 'heartshadow', 0, 4, 5, -1);
  anim('heart-open', 'heartshadow', 4, 2, 6, 0);
}

function drawHeart(c: Ctx, t: number, open: number) {
  const r = rng(91 + Math.floor(t * 4));
  const cx = 190, cy = 190;
  const beat = 1 + Math.sin(t * TAU) * 0.04;
  // the Seed's golden light
  c.fillStyle = radial(c, cx, cy, 170 * beat, [[0, 'rgba(255,250,220,1)'], [0.25, 'rgba(255,215,130,0.85)'], [0.6, 'rgba(255,190,90,0.25)'], [1, 'rgba(255,170,60,0)']]);
  c.beginPath(); c.arc(cx, cy, 170 * beat, 0, TAU); c.fill();
  // seed husk
  c.fillStyle = OUT; c.beginPath(); c.ellipse(cx, cy, 92 * beat, 110 * beat, 0, 0, TAU); c.fill();
  c.fillStyle = linear(c, cx, cy - 110, cx, cy + 110, [[0, '#fff2c8'], [0.5, '#e8b860'], [1, '#8a5a20']]);
  c.beginPath(); c.ellipse(cx, cy, 86 * beat, 104 * beat, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(120,70,20,0.5)'; c.lineWidth = 2;
  for (let k = -2; k <= 2; k++) { c.beginPath(); c.ellipse(cx, cy, 86 * beat - Math.abs(k) * 14, 104 * beat, 0, 0, TAU); c.stroke(); }
  // shadow strangling it (pulls back when the core is torn open)
  const grip = 1 - open * 0.7;
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU + t * 0.4;
    c.strokeStyle = `rgba(${12 + r() * 14},6,${26 + r() * 20},${0.92 * grip + 0.08})`;
    c.lineWidth = 14 + r() * 12;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * 180, cy + Math.sin(a) * 180);
    c.bezierCurveTo(cx + Math.cos(a + 0.6) * 120 * grip + Math.cos(a) * 40, cy + Math.sin(a + 0.6) * 120 * grip, cx + Math.cos(a + 1.2) * 70 * grip, cy + Math.sin(a + 1.2) * 70 * grip, cx + Math.cos(a + 1.6) * 30 * grip, cy + Math.sin(a + 1.6) * 30 * grip);
    c.stroke();
  }
  for (let i = 0; i < 18; i++) { c.fillStyle = `rgba(14,8,28,${0.55 * grip})`; blob(c, cx + (r() - 0.5) * 260, cy + (r() - 0.5) * 260, 20 + r() * 26, r, 8, 0.5); c.fill(); }
  // the Shadow's eyes over the seed
  const eyes = [[-36, -30, 10], [36, -30, 10], [0, -56, 13], [-60, 10, 7], [60, 10, 7]];
  for (const [ex, ey, er] of eyes) {
    c.fillStyle = radial(c, cx + ex, cy + ey, er * 2.2, [[0, '#ffffff'], [0.35, open ? '#ffd27a' : '#c87aff'], [1, 'rgba(120,40,200,0)']]);
    c.beginPath(); c.arc(cx + ex, cy + ey, er * 2.2 * grip + 2, 0, TAU); c.fill();
  }
  // torn-open core
  if (open) {
    c.fillStyle = radial(c, cx, cy + 10, 50 * open, [[0, '#ffffff'], [0.4, '#fff2c0'], [1, 'rgba(255,220,140,0)']]);
    c.beginPath(); c.arc(cx, cy + 10, 50 * open, 0, TAU); c.fill();
  }
}
