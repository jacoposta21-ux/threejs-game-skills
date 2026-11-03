import Phaser from 'phaser';
import { Ctx, dabs, limb, linear, paintSheet, paintTexture, radial, rgba, rng } from './paint';
import { THEMES, ThemeKey } from './themes';

const OUT = '#07090c';
const TAU = Math.PI * 2;

function p2(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void) {
  paintTexture(scene, key, w * 2, h * 2, (c) => {
    c.scale(2, 2);
    draw(c);
  });
}

/** Theme-dependent props for Chapter II mechanics. */
export function buildChapter2ThemeProps(scene: Phaser.Scene, key: ThemeKey) {
  if (scene.textures.exists(`crack-${key}`)) return;
  const th = THEMES[key];
  const r = rng(key.length * 77);
  // breakable wall block
  p2(scene, `crack-${key}`, 32, 32, (c) => {
    if (key === 'ice') {
      c.fillStyle = 'rgba(150,120,230,0.75)';
      c.fillRect(0, 0, 32, 32);
      c.fillStyle = linear(c, 0, 0, 32, 32, [[0, 'rgba(200,255,250,0.6)'], [0.5, 'rgba(208,122,255,0.15)'], [1, 'rgba(60,40,140,0.5)']]);
      c.fillRect(0, 0, 32, 32);
    } else {
      c.fillStyle = th.rock[1];
      c.fillRect(0, 0, 32, 32);
      dabs(c, 2, 2, 28, 28, 14, [th.rock[0], th.rock[2]], 1.5, 4, 0.5, r);
      if (key === 'foundry') {
        c.fillStyle = '#7ff5e0';
        for (const [x, y] of [[4, 4], [28, 4], [4, 28], [28, 28]]) c.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    c.strokeStyle = key === 'ice' ? 'rgba(255,255,255,0.9)' : OUT;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(16, 0); c.lineTo(13, 10); c.lineTo(19, 15); c.lineTo(12, 24); c.lineTo(15, 32);
    c.moveTo(19, 15); c.lineTo(30, 18);
    c.moveTo(13, 10); c.lineTo(2, 8);
    c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.strokeRect(0.5, 0.5, 31, 31);
  });
  // moving platform (3 tiles)
  p2(scene, `mover-${key}`, 96, 18, (c) => {
    const [p1, p2c] = th.platform;
    c.fillStyle = OUT;
    c.fillRect(0, 0, 96, 16);
    c.fillStyle = linear(c, 0, 0, 0, 14, [[0, p1], [1, p2c]]);
    c.fillRect(1.5, 1.5, 93, 12);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(2, 2, 92, 2);
    if (key === 'ruins') {
      c.fillStyle = th.accent;
      for (let x = 12; x < 96; x += 24) { c.beginPath(); c.arc(x, 8, 2.5, 0, TAU); c.fill(); }
    } else {
      c.fillStyle = '#2a2e34';
      for (let x = 6; x < 96; x += 14) c.fillRect(x, 6, 8, 4);
      c.fillStyle = '#7ff5e0';
      c.fillRect(2, 13, 92, 2);
    }
  });
}

export function buildChapter2Common(scene: Phaser.Scene) {
  if (scene.textures.exists('warden')) return;
  // conveyor belt strip (tileable horizontally, chevrons point right)
  paintTexture(scene, 'belt', 32, 12, (c) => {
    c.fillStyle = '#10121a';
    c.fillRect(0, 0, 32, 12);
    c.fillStyle = '#2e3446';
    c.fillRect(0, 1, 32, 8);
    c.fillStyle = '#7ff5e0';
    for (const x of [4, 20]) {
      c.beginPath(); c.moveTo(x, 2); c.lineTo(x + 6, 5); c.lineTo(x, 8); c.lineTo(x + 3, 5); c.fill();
    }
    c.fillStyle = '#0a0b0e';
    c.fillRect(0, 9, 32, 3);
  });
  // crusher head & shaft
  p2(scene, 'crusher', 32, 40, (c) => {
    c.fillStyle = OUT; c.fillRect(0, 0, 32, 40);
    c.fillStyle = linear(c, 0, 0, 32, 0, [[0, '#33384a'], [0.5, '#6a7088'], [1, '#262a38']]);
    c.fillRect(2, 2, 28, 34);
    c.fillStyle = 'rgba(127,245,224,0.85)';
    c.save(); c.beginPath(); c.rect(2, 26, 28, 10); c.clip();
    for (let x = -10; x < 40; x += 8) { c.beginPath(); c.moveTo(x, 36); c.lineTo(x + 4, 36); c.lineTo(x + 14, 26); c.lineTo(x + 10, 26); c.fill(); }
    c.restore();
    c.fillStyle = '#d8d0e8';
    for (let x = 4; x < 30; x += 6) { c.beginPath(); c.moveTo(x, 36); c.lineTo(x + 3, 40); c.lineTo(x + 6, 36); c.fill(); }
  });
  paintTexture(scene, 'shaft', 16, 32, (c) => {
    c.fillStyle = OUT; c.fillRect(2, 0, 12, 32);
    c.fillStyle = linear(c, 2, 0, 14, 0, [[0, '#5a5e66'], [0.5, '#b0b4bc'], [1, '#4a4e56']]);
    c.fillRect(4, 0, 8, 32);
  });
  // pendulum blade
  p2(scene, 'blade', 48, 26, (c) => {
    c.fillStyle = OUT;
    c.beginPath(); c.moveTo(24, 0); c.quadraticCurveTo(48, 6, 46, 24); c.quadraticCurveTo(24, 14, 2, 24); c.quadraticCurveTo(0, 6, 24, 0); c.fill();
    c.fillStyle = linear(c, 0, 0, 0, 24, [[0, '#4a4460'], [0.6, '#b8b0d0'], [1, '#c8fff4']]);
    c.beginPath(); c.moveTo(24, 2); c.quadraticCurveTo(45, 7, 44, 21); c.quadraticCurveTo(24, 12, 4, 21); c.quadraticCurveTo(3, 7, 24, 2); c.fill();
    c.fillStyle = OUT; c.beginPath(); c.arc(24, 6, 3, 0, TAU); c.fill();
  });
  // bomb dropped by the Warden
  p2(scene, 'bomb', 16, 16, (c) => {
    c.fillStyle = OUT; c.beginPath(); c.arc(8, 8, 7, 0, TAU); c.fill();
    c.fillStyle = '#5a5e66'; c.beginPath(); c.arc(8, 8, 5.5, 0, TAU); c.fill();
    c.fillStyle = radial(c, 8, 8, 4, [[0, '#ffffff'], [0.4, '#d07aff'], [1, 'rgba(160,60,255,0)']]);
    c.beginPath(); c.arc(8, 8, 3.5, 0, TAU); c.fill();
  });
  // sentry drone (4 frames: rotor spin)
  paintSheet(scene, 'drone', 96, 72, 4, 4, (c, i) => {
    const cx = 48, cy = 38;
    c.fillStyle = radial(c, cx, cy + 22, 26, [[0, 'rgba(127,245,224,0.5)'], [1, 'rgba(127,245,224,0)']]);
    c.fillRect(0, 30, 96, 42);
    // rotor arms
    for (const s of [-1, 1]) {
      limb(c, cx + s * 14, cy - 6, cx + s * 34, cy - 14, 4, '#3a3448', OUT, 1.5);
      const w = [26, 14, 4, 14][i];
      c.fillStyle = 'rgba(160,255,240,0.5)';
      c.beginPath(); c.ellipse(cx + s * 34, cy - 17, w, 3, 0, 0, TAU); c.fill();
      c.fillStyle = OUT; c.fillRect(cx + s * 34 - 2, cy - 19, 4, 4);
    }
    // hull
    c.fillStyle = OUT; c.beginPath(); c.ellipse(cx, cy, 22, 17, 0, 0, TAU); c.fill();
    c.fillStyle = linear(c, cx, cy - 16, cx, cy + 16, [[0, '#8a8098'], [0.5, '#4a4460'], [1, '#1a1626']]);
    c.beginPath(); c.ellipse(cx, cy, 19.5, 14.5, 0, 0, TAU); c.fill();
    c.fillStyle = '#2f8f6f'; c.fillRect(cx - 18, cy - 2, 36, 3);
    c.fillStyle = OUT; c.beginPath(); c.arc(cx + 6, cy, 9, 0, TAU); c.fill();
    c.fillStyle = radial(c, cx + 7, cy - 1, 8, [[0, '#ffffff'], [0.35, '#7ff5e0'], [1, '#104a40']]);
    c.beginPath(); c.arc(cx + 6, cy, 7, 0, TAU); c.fill();
    // gun barrel
    c.fillStyle = OUT; c.fillRect(cx - 4, cy + 12, 8, 10);
    c.fillStyle = '#6a6480'; c.fillRect(cx - 2.5, cy + 12, 5, 9);
  });
  // ---- the Iron Warden: 8 frames (0-3 hover, 4-5 charging eye, 6-7 core open)
  paintSheet(scene, 'warden', 360, 300, 8, 4, (c, i) => drawWarden(c, i));
  const anim = (key: string, tex: string, a: number, n: number, fps: number, rep: number) =>
    scene.anims.create({ key, frames: Array.from({ length: n }, (_, k) => ({ key: tex, frame: a + k })), frameRate: fps, repeat: rep });
  anim('drone-fly', 'drone', 0, 4, 24, -1);
  anim('warden-hover', 'warden', 0, 4, 10, -1);
  anim('warden-charge', 'warden', 4, 2, 8, -1);
  anim('warden-open', 'warden', 6, 2, 6, 0);
}

function drawWarden(c: Ctx, i: number) {
  const r = rng(31);
  const cx = 180, cy = 130;
  const flick = [0.8, 1, 0.7, 0.95][i % 4];
  const charging = i === 4 || i === 5;
  const open = i >= 6 ? (i === 6 ? 0.6 : 1) : 0;
  // thruster flames
  for (const s of [-1, 1]) {
    const x = cx + s * 70;
    c.fillStyle = radial(c, x, cy + 120, 60 * flick, [[0, 'rgba(230,255,250,0.95)'], [0.3, 'rgba(127,245,224,0.6)'], [1, 'rgba(127,245,224,0)']]);
    c.beginPath(); c.ellipse(x, cy + 125, 30 * flick, 70 * flick, 0, 0, TAU); c.fill();
    c.fillStyle = OUT; c.fillRect(x - 18, cy + 70, 36, 34);
    c.fillStyle = '#4a4460'; c.fillRect(x - 15, cy + 72, 30, 28);
  }
  // arms with claws
  for (const s of [-1, 1]) {
    const sx = cx + s * 105, sy = cy + 10;
    const ex = sx + s * 30, ey = sy + 60 + (i % 2) * 3;
    const hx = ex - s * 6, hy = ey + 55;
    limb(c, sx, sy, ex, ey, 18, '#4a4460', OUT, 3);
    limb(c, ex, ey, hx, hy, 14, '#5a5470', OUT, 3);
    c.fillStyle = '#2f8f6f';
    c.beginPath(); c.arc(ex, ey, 9, 0, TAU); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 5;
    for (const k of [-1, 0, 1]) { c.beginPath(); c.moveTo(hx, hy); c.quadraticCurveTo(hx + k * 14, hy + 14, hx + k * 8, hy + 28); c.stroke(); }
    c.strokeStyle = '#c8bede'; c.lineWidth = 2.5;
    for (const k of [-1, 0, 1]) { c.beginPath(); c.moveTo(hx, hy); c.quadraticCurveTo(hx + k * 14, hy + 14, hx + k * 8, hy + 28); c.stroke(); }
  }
  // hull dome
  c.fillStyle = OUT;
  c.beginPath(); c.ellipse(cx, cy, 128, 92, 0, 0, TAU); c.fill();
  c.fillStyle = linear(c, cx, cy - 90, cx, cy + 90, [[0, '#7a7090'], [0.45, '#3a3448'], [1, '#14101c']]);
  c.beginPath(); c.ellipse(cx, cy, 123, 87, 0, 0, TAU); c.fill();
  // brass bands & rivets
  c.strokeStyle = '#7ff5e0'; c.lineWidth = 4;
  c.beginPath(); c.ellipse(cx, cy, 104, 70, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  c.beginPath(); c.moveTo(cx - 118, cy + 18); c.lineTo(cx + 118, cy + 18); c.stroke();
  c.fillStyle = '#d8fff6';
  for (let k = 0; k < 14; k++) { const a = Math.PI * (1.08 + k * 0.06); c.beginPath(); c.arc(cx + Math.cos(a) * 104, cy + Math.sin(a) * 70, 2.5, 0, TAU); c.fill(); }
  // grime
  dabs(c, cx - 110, cy - 70, 220, 140, 50, ['#1e1a2a', '#5a5470', '#2f8f6f', '#3a6a4a'], 2, 8, 0.35, r);
  // armour shutters over the eye (slide apart when open)
  const eyeR = 38;
  c.fillStyle = radial(c, cx, cy - 6, eyeR * (1.6 + open * 0.6), [[0, charging || open ? '#ffffff' : '#c8fff4'], [0.3, charging ? '#d07aff' : open ? '#7ff5e0' : '#2fbf90'], [1, 'rgba(20,80,70,0)']]);
  c.beginPath(); c.arc(cx, cy - 6, eyeR * (1.6 + open * 0.6), 0, TAU); c.fill();
  c.fillStyle = OUT; c.beginPath(); c.arc(cx, cy - 6, eyeR + 4, 0, TAU); c.fill();
  c.fillStyle = radial(c, cx, cy - 6, eyeR, [[0, '#ffffff'], [0.25, charging ? '#e0a0ff' : open ? '#d8fff6' : '#7ff5e0'], [0.8, charging ? '#5a1a8a' : '#145a50'], [1, '#06120f']]);
  c.beginPath(); c.arc(cx, cy - 6, eyeR, 0, TAU); c.fill();
  c.fillStyle = OUT; c.beginPath(); c.ellipse(cx, cy - 6, 6 + open * 6, 22, 0, 0, TAU); c.fill();
  const shut = (1 - open) * eyeR * 0.7;
  if (shut > 1) {
    c.fillStyle = OUT;
    c.fillRect(cx - eyeR - 6, cy - 6 - eyeR - 4, eyeR * 2 + 12, shut + 4);
    c.fillRect(cx - eyeR - 6, cy - 6 + eyeR - shut, eyeR * 2 + 12, shut + 4);
    c.fillStyle = '#5a5470';
    c.fillRect(cx - eyeR - 4, cy - 6 - eyeR - 2, eyeR * 2 + 8, shut);
    c.fillRect(cx - eyeR - 4, cy - 6 + eyeR - shut + 2, eyeR * 2 + 8, shut);
  }
  if (open) {
    // vents glowing at the sides when the core is exposed
    for (const s of [-1, 1]) {
      c.fillStyle = radial(c, cx + s * 80, cy + 30, 26, [[0, 'rgba(230,255,250,0.95)'], [1, 'rgba(127,245,224,0)']]);
      c.beginPath(); c.arc(cx + s * 80, cy + 30, 26, 0, TAU); c.fill();
    }
  }
  // moss and glow-caps growing on the ancient stone
  c.fillStyle = '#2f8f6f';
  for (let k = 0; k < 9; k++) { const a = Math.PI * (1.12 + k * 0.095); c.beginPath(); c.ellipse(cx + Math.cos(a) * 118, cy + Math.sin(a) * 82, 12, 5, a + Math.PI / 2, 0, TAU); c.fill(); }
  for (const [dx, h, col] of [[-50, 26, '#d04aa8'], [-30, 16, '#2fbf90'], [44, 22, '#a04ad0']] as const) {
    const x = cx + dx, y = cy - 84 + Math.abs(dx) * 0.25;
    c.fillStyle = '#e8dcc8'; c.fillRect(x - 2, y - h, 4, h);
    c.fillStyle = radial(c, x, y - h, 22, [[0, rgba(col, 0.7)], [1, rgba(col, 0)]]); c.fillRect(x - 22, y - h - 22, 44, 44);
    c.fillStyle = col; c.beginPath(); c.ellipse(x, y - h, 12, 7, 0, Math.PI, TAU); c.fill();
  }
  // antenna
  c.strokeStyle = OUT; c.lineWidth = 4;
  c.beginPath(); c.moveTo(cx, cy - 86); c.lineTo(cx + 10, cy - 118); c.stroke();
  c.fillStyle = charging ? '#d07aff' : '#7ff5e0';
  c.beginPath(); c.arc(cx + 10, cy - 120, 5, 0, TAU); c.fill();
  void rgba;
}
