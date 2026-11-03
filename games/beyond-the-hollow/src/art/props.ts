import Phaser from 'phaser';
import { Ctx, blob, dabs, limb, linear, paintSheet, paintTexture, radial, rgba, rng } from './paint';
import { THEMES, ThemeKey } from './themes';

/** Props are painted at 2x and displayed at PROP_SCALE so they stay crisp under camera zoom. */
export const PROP_SCALE = 0.5;
const OUT = '#07090c';
const TAU = Math.PI * 2;

function p2(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void) {
  paintTexture(scene, key, w * 2, h * 2, (ctx) => {
    ctx.scale(2, 2);
    draw(ctx);
  });
}
function s2(scene: Phaser.Scene, key: string, w: number, h: number, n: number, draw: (ctx: Ctx, i: number) => void) {
  paintSheet(scene, key, w * 2, h * 2, n, n, (ctx, i) => {
    ctx.scale(2, 2);
    draw(ctx, i);
  });
}

export function buildFx(scene: Phaser.Scene) {
  paintTexture(scene, 'light', 256, 256, (c) => {
    c.fillStyle = radial(c, 128, 128, 128, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.75)'], [0.7, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(0, 0, 256, 256);
  });
  paintTexture(scene, 'glow', 128, 128, (c) => {
    c.fillStyle = radial(c, 64, 64, 64, [[0, 'rgba(255,255,255,0.9)'], [0.25, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(0, 0, 128, 128);
  });
  paintTexture(scene, 'vignette', 256, 256, (c) => {
    c.fillStyle = radial(c, 128, 128, 181, [[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0)'], [0.85, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0.75)']]);
    c.fillRect(0, 0, 256, 256);
  });
  paintTexture(scene, 'dot', 16, 16, (c) => {
    c.fillStyle = radial(c, 8, 8, 8, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(0, 0, 16, 16);
  });
  paintTexture(scene, 'spark', 24, 6, (c) => {
    c.fillStyle = linear(c, 0, 0, 24, 0, [[0, 'rgba(255,255,255,0)'], [0.7, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,1)']]);
    c.beginPath();
    c.ellipse(12, 3, 12, 2.2, 0, 0, TAU);
    c.fill();
  });
  paintTexture(scene, 'smoke', 64, 64, (c) => {
    const r = rng(3);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = radial(c, 22 + r() * 20, 22 + r() * 20, 20, [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
      c.fillRect(0, 0, 64, 64);
    }
  });
  paintTexture(scene, 'fog', 512, 160, (c) => {
    const r = rng(8);
    for (let i = 0; i < 26; i++) {
      const x = 60 + r() * 392, y = 50 + r() * 60, s = 40 + r() * 60;
      c.fillStyle = radial(c, x, y, s, [[0, 'rgba(255,255,255,0.16)'], [1, 'rgba(255,255,255,0)']]);
      c.fillRect(x - s, y - s, s * 2, s * 2);
    }
  });
  paintTexture(scene, 'beam', 96, 512, (c) => {
    c.fillStyle = linear(c, 0, 0, 0, 512, [[0, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    c.beginPath();
    c.moveTo(30, 0);
    c.lineTo(66, 0);
    c.lineTo(96, 512);
    c.lineTo(0, 512);
    c.fill();
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = linear(c, 0, 0, 96, 0, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    c.fillRect(0, 0, 96, 512);
  });
  p2(scene, 'bolt', 40, 14, (c) => {
    c.fillStyle = linear(c, 0, 0, 40, 0, [[0, 'rgba(127,245,224,0)'], [0.6, 'rgba(127,245,224,0.7)'], [1, 'rgba(230,255,252,1)']]);
    c.beginPath();
    c.ellipse(24, 7, 16, 4.5, 0, 0, TAU);
    c.fill();
    c.fillStyle = radial(c, 33, 7, 7, [[0, '#ffffff'], [0.5, 'rgba(160,255,240,0.9)'], [1, 'rgba(127,245,224,0)']]);
    c.beginPath();
    c.arc(33, 7, 7, 0, TAU);
    c.fill();
  });
  p2(scene, 'boltbig', 64, 30, (c) => {
    c.fillStyle = linear(c, 0, 0, 64, 0, [[0, 'rgba(127,245,224,0)'], [0.5, 'rgba(127,245,224,0.6)'], [1, 'rgba(230,255,252,1)']]);
    c.beginPath();
    c.ellipse(36, 15, 28, 9, 0, 0, TAU);
    c.fill();
    c.fillStyle = radial(c, 50, 15, 14, [[0, '#ffffff'], [0.4, 'rgba(200,255,250,0.95)'], [1, 'rgba(127,245,224,0)']]);
    c.beginPath();
    c.arc(50, 15, 14, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(14, 10);
    c.lineTo(26, 13);
    c.lineTo(34, 8);
    c.lineTo(46, 14);
    c.stroke();
  });
  p2(scene, 'spit', 16, 16, (c) => {
    c.fillStyle = radial(c, 8, 8, 8, [[0, '#fff7c0'], [0.4, '#ff8a3a'], [1, 'rgba(255,60,40,0)']]);
    c.beginPath();
    c.arc(8, 8, 8, 0, TAU);
    c.fill();
  });
  p2(scene, 'shock', 64, 30, (c) => {
    c.fillStyle = linear(c, 0, 30, 0, 0, [[0, 'rgba(255,240,200,0.9)'], [1, 'rgba(255,160,90,0)']]);
    c.beginPath();
    c.moveTo(0, 30);
    c.quadraticCurveTo(32, -10, 64, 30);
    c.fill();
  });
  paintTexture(scene, 'ring', 128, 128, (c) => {
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 6;
    c.beginPath();
    c.arc(64, 64, 58, 0, TAU);
    c.stroke();
  });
  paintTexture(scene, 'bubble', 16, 16, (c) => {
    c.strokeStyle = 'rgba(220,255,255,0.8)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(8, 8, 6, 0, TAU);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fillRect(5, 4, 2, 2);
  });
  paintTexture(scene, 'leaf', 12, 8, (c) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(6, 4, 5.5, 2.5, 0.3, 0, TAU);
    c.fill();
  });
  paintTexture(scene, 'shard', 8, 8, (c) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(1, 7);
    c.lineTo(4, 0);
    c.lineTo(7, 6);
    c.fill();
  });
}

export function buildCommonProps(scene: Phaser.Scene) {
  // research crate
  p2(scene, 'crate', 32, 32, (c) => {
    c.fillStyle = OUT;
    c.fillRect(0, 0, 32, 32);
    c.fillStyle = linear(c, 0, 0, 0, 32, [[0, '#8a6a46'], [1, '#4c3622']]);
    c.fillRect(1.5, 1.5, 29, 29);
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.lineWidth = 1;
    for (let y = 8; y < 32; y += 7.5) {
      c.beginPath();
      c.moveTo(2, y);
      c.lineTo(30, y);
      c.stroke();
    }
    c.fillStyle = '#5a646c';
    c.fillRect(1.5, 1.5, 29, 4);
    c.fillRect(1.5, 26.5, 29, 4);
    c.fillRect(1.5, 1.5, 4, 29);
    c.fillRect(26.5, 1.5, 4, 29);
    c.fillStyle = '#a7b0b6';
    for (const [x, y] of [[3.5, 3.5], [28.5, 3.5], [3.5, 28.5], [28.5, 28.5]]) c.fillRect(x - 1, y - 1, 2, 2);
    c.fillStyle = 'rgba(255,200,120,0.75)';
    c.font = 'bold 7px monospace';
    c.fillText('HR-7', 9, 19);
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(6, 6);
    c.lineTo(26, 26);
    c.stroke();
  });
  s2(scene, 'plate', 32, 12, 2, (c, i) => {
    const d = i * 3;
    c.fillStyle = OUT;
    c.fillRect(0, 6, 32, 6);
    c.fillStyle = '#2a3036';
    c.fillRect(1, 7, 30, 5);
    c.fillStyle = OUT;
    c.fillRect(3, 1 + d, 26, 6);
    c.fillStyle = i ? '#7ff5e0' : '#a28a5a';
    c.fillRect(4, 2 + d, 24, 3.5);
    c.fillStyle = i ? 'rgba(127,245,224,0.5)' : 'rgba(255,255,255,0.15)';
    c.fillRect(4, 2 + d, 24, 1);
  });
  // doors: blast door + ancient gate
  p2(scene, 'door-metal', 32, 96, (c) => {
    c.fillStyle = OUT;
    c.fillRect(0, 0, 32, 96);
    c.fillStyle = linear(c, 0, 0, 32, 0, [[0, '#3c454d'], [0.5, '#6d7880'], [1, '#2b3238']]);
    c.fillRect(2, 0, 28, 96);
    for (let y = 8; y < 96; y += 22) {
      c.fillStyle = '#1b2025';
      c.fillRect(2, y, 28, 3);
    }
    c.fillStyle = '#e0a23a';
    for (let y = 78; y < 94; y += 6) {
      c.save();
      c.beginPath();
      c.rect(2, 76, 28, 18);
      c.clip();
      for (let x = -20; x < 40; x += 8) {
        c.beginPath();
        c.moveTo(x, 94);
        c.lineTo(x + 4, 94);
        c.lineTo(x + 18, 76);
        c.lineTo(x + 14, 76);
        c.fill();
      }
      c.restore();
    }
    c.fillStyle = '#ff5a3a';
    c.fillRect(13, 40, 6, 6);
    c.fillStyle = radial(c, 16, 43, 8, [[0, 'rgba(255,120,80,0.8)'], [1, 'rgba(255,90,60,0)']]);
    c.fillRect(8, 35, 16, 16);
  });
  p2(scene, 'door-ancient', 32, 96, (c) => {
    const r = rng(4);
    c.fillStyle = OUT;
    c.beginPath();
    c.roundRect(0, 0, 32, 96, 6);
    c.fill();
    c.fillStyle = linear(c, 0, 0, 32, 96, [[0, '#6c6658'], [1, '#2e2b26']]);
    c.beginPath();
    c.roundRect(2, 2, 28, 92, 5);
    c.fill();
    dabs(c, 2, 2, 28, 92, 40, ['#857e6c', '#3a362f', '#5a6a4a'], 1, 4, 0.5, r);
    c.strokeStyle = 'rgba(127,245,224,0.85)';
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(16, 30, 8, 0, TAU);
    c.moveTo(16, 18);
    c.lineTo(16, 42);
    c.moveTo(8, 60);
    c.lineTo(16, 52);
    c.lineTo(24, 60);
    c.lineTo(16, 68);
    c.closePath();
    c.stroke();
    c.fillStyle = 'rgba(127,245,224,0.25)';
    c.fillRect(15, 70, 2, 20);
  });
  // ancient mechanism pedestal (frames: dormant / awakened)
  s2(scene, 'mech', 32, 48, 2, (c, i) => {
    c.fillStyle = OUT;
    c.beginPath();
    c.moveTo(4, 48);
    c.lineTo(8, 24);
    c.lineTo(24, 24);
    c.lineTo(28, 48);
    c.fill();
    c.fillStyle = linear(c, 0, 24, 0, 48, [[0, '#7a7466'], [1, '#2e2b26']]);
    c.beginPath();
    c.moveTo(6, 47);
    c.lineTo(9.5, 26);
    c.lineTo(22.5, 26);
    c.lineTo(26, 47);
    c.fill();
    c.strokeStyle = i ? '#7ff5e0' : 'rgba(127,245,224,0.25)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(12, 32);
    c.lineTo(16, 40);
    c.lineTo(20, 32);
    c.moveTo(16, 40);
    c.lineTo(16, 45);
    c.stroke();
    // floating rune orb
    const col = i ? '#9ffff0' : '#3c6d6a';
    c.fillStyle = radial(c, 16, 14, 14, [[0, i ? 'rgba(200,255,250,0.9)' : 'rgba(80,140,140,0.3)'], [1, 'rgba(127,245,224,0)']]);
    c.fillRect(0, 0, 32, 30);
    c.fillStyle = OUT;
    c.beginPath();
    c.arc(16, 14, 8, 0, TAU);
    c.fill();
    c.fillStyle = col;
    c.beginPath();
    c.arc(16, 14, 6.3, 0, TAU);
    c.fill();
    c.strokeStyle = OUT;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(16, 9);
    c.lineTo(16, 19);
    c.moveTo(12, 12);
    c.lineTo(20, 16);
    c.stroke();
  });
  // checkpoint beacon (unlit / lit)
  s2(scene, 'beacon', 32, 64, 2, (c, i) => {
    c.fillStyle = OUT;
    c.fillRect(13, 18, 6, 46);
    c.fillStyle = '#5b4a36';
    c.fillRect(14.5, 18, 3, 46);
    c.fillStyle = OUT;
    c.fillRect(8, 60, 16, 4);
    if (i) {
      c.fillStyle = radial(c, 16, 14, 16, [[0, 'rgba(255,240,190,0.95)'], [0.4, 'rgba(255,190,90,0.6)'], [1, 'rgba(255,170,60,0)']]);
      c.fillRect(0, 0, 32, 32);
    }
    c.fillStyle = OUT;
    c.beginPath();
    c.moveTo(8, 8);
    c.lineTo(24, 8);
    c.lineTo(22, 22);
    c.lineTo(10, 22);
    c.closePath();
    c.fill();
    c.fillStyle = i ? '#ffe39a' : '#3a3a34';
    c.beginPath();
    c.moveTo(10.5, 10);
    c.lineTo(21.5, 10);
    c.lineTo(20, 20);
    c.lineTo(12, 20);
    c.closePath();
    c.fill();
    c.fillStyle = '#b5884a';
    c.fillRect(7, 6, 18, 3);
    c.fillRect(9, 21, 14, 2);
  });
  p2(scene, 'lore', 20, 24, (c) => {
    c.fillStyle = OUT;
    c.beginPath();
    c.roundRect(1, 4, 18, 18, 3);
    c.fill();
    c.fillStyle = linear(c, 0, 4, 0, 22, [[0, '#4a5560'], [1, '#232a31']]);
    c.beginPath();
    c.roundRect(2.5, 5.5, 15, 15, 2);
    c.fill();
    c.fillStyle = '#9fe9ff';
    c.fillRect(5, 8, 10, 6);
    c.fillStyle = 'rgba(10,30,40,0.7)';
    c.fillRect(6, 9.5, 8, 1);
    c.fillRect(6, 11.5, 6, 1);
    c.fillStyle = '#ff9a3a';
    c.beginPath();
    c.arc(14, 17.5, 1.5, 0, TAU);
    c.fill();
    c.strokeStyle = OUT;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(14, 4);
    c.lineTo(17, 0);
    c.stroke();
  });
  p2(scene, 'orb', 20, 20, (c) => {
    c.fillStyle = radial(c, 10, 10, 10, [[0, '#fff'], [0.3, '#ff9ab0'], [0.7, 'rgba(255,80,120,0.5)'], [1, 'rgba(255,60,100,0)']]);
    c.beginPath();
    c.arc(10, 10, 10, 0, TAU);
    c.fill();
  });
  p2(scene, 'emitter', 32, 16, (c) => {
    c.fillStyle = OUT;
    c.fillRect(4, 0, 24, 10);
    c.beginPath();
    c.moveTo(10, 10);
    c.lineTo(22, 10);
    c.lineTo(18, 16);
    c.lineTo(14, 16);
    c.fill();
    c.fillStyle = '#58626b';
    c.fillRect(5.5, 1, 21, 7);
    c.fillStyle = '#e0a23a';
    c.fillRect(8, 3, 4, 3);
    c.fillRect(20, 3, 4, 3);
    c.fillStyle = '#bff';
    c.fillRect(15, 12, 2, 3);
  });
  p2(scene, 'stalactite', 22, 48, (c) => {
    c.fillStyle = OUT;
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(6, 24, 11, 48);
    c.quadraticCurveTo(16, 24, 22, 0);
    c.fill();
    c.fillStyle = linear(c, 0, 0, 22, 0, [[0, '#56627a'], [0.5, '#8a9ab8'], [1, '#2b3346']]);
    c.beginPath();
    c.moveTo(2, 0);
    c.quadraticCurveTo(7, 24, 11, 44);
    c.quadraticCurveTo(15, 24, 20, 0);
    c.fill();
  });
  s2(scene, 'bouncer', 48, 34, 2, (c, i) => {
    const sq = i ? 6 : 0;
    c.fillStyle = OUT;
    c.fillRect(19, 18, 10, 16);
    c.fillStyle = '#e8d7c0';
    c.fillRect(20.5, 18, 7, 16);
    c.fillStyle = radial(c, 24, 18, 30, [[0, 'rgba(255,122,217,0.5)'], [1, 'rgba(255,122,217,0)']]);
    c.fillRect(0, 0, 48, 34);
    c.fillStyle = OUT;
    c.beginPath();
    c.ellipse(24, 18 + sq * 0.5, 24 + sq, 13 - sq, 0, Math.PI, TAU);
    c.lineTo(48, 21);
    c.lineTo(0, 21);
    c.fill();
    c.fillStyle = linear(c, 0, 5, 0, 20, [[0, '#ff9ae6'], [1, '#a3307a']]);
    c.beginPath();
    c.ellipse(24, 18 + sq * 0.5, 22 + sq, 11 - sq, 0, Math.PI, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,240,250,0.85)';
    for (const [x, y, rr] of [[14, 13, 2.5], [26, 10, 3], [35, 14, 2]]) {
      c.beginPath();
      c.arc(x, y + sq * 0.6, rr, 0, TAU);
      c.fill();
    }
    c.fillStyle = '#ffd0f0';
    c.fillRect(4, 18 + sq * 0.5, 40, 2);
  });
  p2(scene, 'vent', 32, 14, (c) => {
    const r = rng(6);
    c.fillStyle = OUT;
    blob(c, 16, 10, 14, r, 9, 0.3);
    c.fill();
    c.fillStyle = '#6a4a5a';
    blob(c, 16, 10, 11, r, 9, 0.3);
    c.fill();
    c.fillStyle = '#1a0f16';
    c.beginPath();
    c.ellipse(16, 7, 6, 3, 0, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(200,255,120,0.6)';
    c.beginPath();
    c.ellipse(16, 7, 3, 1.4, 0, 0, TAU);
    c.fill();
  });
  p2(scene, 'ghostplat', 32, 12, (c) => {
    c.fillStyle = 'rgba(160,220,255,0.35)';
    c.fillRect(0, 0, 32, 12);
    c.strokeStyle = 'rgba(210,240,255,0.95)';
    c.lineWidth = 1.5;
    c.strokeRect(1, 1, 30, 10);
    c.beginPath();
    c.moveTo(6, 6);
    c.lineTo(11, 3);
    c.lineTo(16, 8);
    c.lineTo(21, 3);
    c.lineTo(26, 6);
    c.stroke();
  });
  p2(scene, 'mound', 48, 16, (c) => {
    const r = rng(2);
    c.fillStyle = OUT;
    c.beginPath();
    c.ellipse(24, 16, 23, 9, 0, Math.PI, TAU);
    c.fill();
    c.fillStyle = '#5a3c32';
    c.beginPath();
    c.ellipse(24, 16, 20, 7, 0, Math.PI, TAU);
    c.fill();
    dabs(c, 6, 9, 36, 7, 18, ['#7a5642', '#2e1d17', '#8a6a52'], 1, 2.5, 0.8, r);
  });
  p2(scene, 'rift', 64, 112, (c) => {
    c.fillStyle = radial(c, 32, 56, 56, [[0, 'rgba(255,255,255,1)'], [0.15, 'rgba(200,255,250,0.9)'], [0.5, 'rgba(127,245,224,0.35)'], [1, 'rgba(127,245,224,0)']]);
    c.beginPath();
    c.ellipse(32, 56, 30, 54, 0, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.beginPath();
    c.ellipse(32, 56, 6, 36, 0, 0, TAU);
    c.fill();
  });
  // energy shield / web barrier (destroyable by charged shot) — used as "cocoon wall"
  p2(scene, 'cocoon', 32, 96, (c) => {
    const r = rng(12);
    c.fillStyle = 'rgba(220,200,255,0.22)';
    c.beginPath();
    c.ellipse(16, 48, 15, 47, 0, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(235,225,255,0.75)';
    c.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      c.beginPath();
      c.moveTo(2 + r() * 28, r() * 96);
      c.lineTo(2 + r() * 28, r() * 96);
      c.stroke();
    }
  });
}

/** Theme-specific lamps, hide spots, decorations and foreground silhouettes. */
export function buildThemeProps(scene: Phaser.Scene, key: ThemeKey) {
  const th = THEMES[key];
  if (scene.textures.exists(`lamp-${key}`)) return;
  const r = rng(key.length * 991);
  // lamp
  p2(scene, `lamp-${key}`, 24, 40, (c) => {
    if (key === 'station') {
      c.strokeStyle = OUT;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(12, 0);
      c.lineTo(12, 18);
      c.stroke();
      c.fillStyle = radial(c, 12, 26, 14, [[0, 'rgba(255,240,200,1)'], [0.4, 'rgba(255,190,100,0.7)'], [1, 'rgba(255,170,60,0)']]);
      c.fillRect(0, 12, 24, 28);
      c.strokeStyle = '#2b3036';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(6, 18);
      c.lineTo(18, 18);
      c.lineTo(17, 32);
      c.lineTo(7, 32);
      c.closePath();
      c.moveTo(12, 18);
      c.lineTo(12, 32);
      c.moveTo(6.5, 25);
      c.lineTo(17.5, 25);
      c.stroke();
    } else if (key === 'forest') {
      c.fillStyle = '#e8dcc8';
      c.fillRect(10, 24, 4, 16);
      c.fillStyle = radial(c, 12, 22, 14, [[0, 'rgba(200,255,235,0.95)'], [1, 'rgba(94,240,192,0)']]);
      c.fillRect(0, 6, 24, 30);
      c.fillStyle = '#2fbf90';
      c.beginPath();
      c.ellipse(12, 24, 11, 7, 0, Math.PI, TAU);
      c.fill();
      c.fillStyle = '#c8ffe8';
      c.fillRect(2, 23, 20, 2);
    } else if (key === 'caverns') {
      crystalProp(c, 12, 40, 30, '#8fb8ff', '#d8e8ff', r);
    } else if (key === 'ocean') {
      c.fillStyle = radial(c, 12, 22, 14, [[0, 'rgba(220,255,250,1)'], [1, 'rgba(127,255,230,0)']]);
      c.fillRect(0, 6, 24, 34);
      c.strokeStyle = '#7fffe6';
      c.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.moveTo(12, 38);
        c.quadraticCurveTo(12 + (i - 2.5) * 5, 24, 12 + (i - 2.5) * 3, 16 + r() * 4);
        c.stroke();
      }
    } else {
      c.fillStyle = radial(c, 12, 24, 14, [[0, 'rgba(255,240,200,1)'], [0.4, 'rgba(255,120,110,0.8)'], [1, 'rgba(255,90,100,0)']]);
      c.fillRect(0, 8, 24, 32);
      c.fillStyle = OUT;
      c.beginPath();
      c.ellipse(12, 24, 7, 10, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#ffb08a';
      c.beginPath();
      c.ellipse(12, 24, 5, 8, 0, 0, TAU);
      c.fill();
      c.strokeStyle = '#4a1a26';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(12, 0);
      c.quadraticCurveTo(16, 8, 12, 14);
      c.stroke();
    }
  });
  // hide spot
  p2(scene, `hide-${key}`, 48, 64, (c) => {
    if (key === 'station') {
      c.fillStyle = OUT;
      c.fillRect(8, 2, 32, 62);
      c.fillStyle = linear(c, 8, 0, 40, 0, [[0, '#3f4e56'], [1, '#26323a']]);
      c.fillRect(10, 4, 28, 58);
      c.fillStyle = '#1a2228';
      for (let y = 10; y < 22; y += 3) c.fillRect(16, y, 16, 1.5);
      c.fillStyle = '#7d8c94';
      c.fillRect(32, 34, 3, 8);
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.fillRect(12, 4, 3, 58);
    } else {
      // dense foliage: overlapping fronds / kelp / tendrils
      const cols = key === 'forest' ? ['#1e5e4a', '#2f8f6f', '#155040'] : key === 'caverns' ? ['#27334f', '#3b4c72', '#1a2238'] : key === 'ocean' ? ['#0f4a44', '#1f7a6a', '#0a3330'] : ['#5a1a2a', '#8a2c40', '#3a0e1a'];
      for (let i = 0; i < 16; i++) {
        const x = 6 + r() * 36, h = 34 + r() * 30;
        c.strokeStyle = OUT;
        c.lineWidth = 8;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(x, 64);
        c.quadraticCurveTo(x + (r() - 0.5) * 26, 64 - h * 0.6, x + (r() - 0.5) * 20, 64 - h);
        c.stroke();
        c.strokeStyle = cols[i % 3];
        c.lineWidth = 5;
        c.stroke();
      }
      c.fillStyle = rgba(th.accent, 0.6);
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.arc(8 + r() * 32, 10 + r() * 30, 1.6, 0, TAU);
        c.fill();
      }
    }
  });
  // surface decorations (6 variants) drawn on top of floor tiles
  for (let d = 0; d < 6; d++) {
    p2(scene, `decor-${key}-${d}`, 32, 24, (c) => decor(c, key, d, r));
  }
  // ceiling decorations (hanging)
  for (let d = 0; d < 3; d++) {
    p2(scene, `hang-${key}-${d}`, 24, 48, (c) => hanging(c, key, d, r));
  }
  // foreground silhouettes
  for (let d = 0; d < 3; d++) {
    paintTexture(scene, `fg-${key}-${d}`, 220, 420, (c) => foreground(c, key, d, r));
  }
}

function crystalProp(c: Ctx, x: number, base: number, h: number, col: string, hi: string, r: () => number) {
  c.fillStyle = radial(c, x, base - h * 0.5, h * 0.8, [[0, rgba(col, 0.55)], [1, rgba(col, 0)]]);
  c.fillRect(x - h, base - h * 1.4, h * 2, h * 1.4);
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.4 + (r() - 0.5) * 0.2, hh = h * (0.6 + r() * 0.4), w = 3 + r() * 2;
    c.save();
    c.translate(x + (i - 1) * 3, base);
    c.rotate(a);
    c.fillStyle = OUT;
    c.beginPath();
    c.moveTo(-w - 1, 0);
    c.lineTo(-w - 1, -hh * 0.75);
    c.lineTo(0, -hh - 1.5);
    c.lineTo(w + 1, -hh * 0.75);
    c.lineTo(w + 1, 0);
    c.fill();
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(-w, 0);
    c.lineTo(-w, -hh * 0.75);
    c.lineTo(0, -hh);
    c.lineTo(w, -hh * 0.75);
    c.lineTo(w, 0);
    c.fill();
    c.fillStyle = hi;
    c.beginPath();
    c.moveTo(-w, -hh * 0.75);
    c.lineTo(0, -hh);
    c.lineTo(0, 0);
    c.lineTo(-w * 0.4, 0);
    c.fill();
    c.restore();
  }
}

function decor(c: Ctx, key: ThemeKey, d: number, r: () => number) {
  const th = THEMES[key];
  const B = 24;
  if (key === 'station') {
    if (d === 0) { // debris pile
      for (let i = 0; i < 5; i++) {
        c.fillStyle = i % 2 ? '#3a424c' : '#59636b';
        c.fillRect(4 + r() * 20, B - 3 - r() * 6, 4 + r() * 6, 3 + r() * 3);
      }
    } else if (d === 1) { // barrel
      c.fillStyle = OUT; c.fillRect(9, 4, 14, 20);
      c.fillStyle = '#8a4a2a'; c.fillRect(10.5, 5, 11, 19);
      c.fillStyle = '#c0703a'; c.fillRect(10.5, 9, 11, 2); c.fillRect(10.5, 18, 11, 2);
    } else if (d === 2) { // valve pipe
      c.strokeStyle = OUT; c.lineWidth = 7; c.beginPath(); c.moveTo(4, B); c.lineTo(4, 12); c.lineTo(28, 12); c.lineTo(28, B); c.stroke();
      c.strokeStyle = '#5a646c'; c.lineWidth = 4; c.stroke();
      c.fillStyle = '#c03a2a'; c.beginPath(); c.arc(16, 12, 4, 0, TAU); c.fill();
    } else if (d === 3) { // cables
      c.strokeStyle = '#151a1f'; c.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(0, B - 1 - i); c.bezierCurveTo(10, B - 8 - i * 2, 20, B + 2, 32, B - 2 - i); c.stroke(); }
    } else if (d === 4) { // moss creeping into the station
      grass(c, '#3a6a5a', '#5ea888', r);
    } else { // fallen sign
      c.fillStyle = OUT; c.save(); c.translate(16, B - 4); c.rotate(-0.2); c.fillRect(-12, -8, 24, 10); c.fillStyle = '#c99a3a'; c.fillRect(-11, -7, 22, 8); c.fillStyle = OUT; c.font = 'bold 6px monospace'; c.fillText('B-3', -6, -1); c.restore();
    }
  } else if (key === 'forest') {
    if (d < 2) grass(c, '#1f7a5a', '#6ef0b8', r);
    else if (d < 4) { // small glowing mushrooms
      for (let i = 0; i < 3; i++) {
        const x = 6 + i * 9 + r() * 3, h = 6 + r() * 10, cw = 6 + r() * 6;
        c.fillStyle = '#e8dcc8'; c.fillRect(x - 1, B - h, 2.4, h);
        c.fillStyle = radial(c, x, B - h, cw, [[0, rgba(d === 2 ? th.accent : th.accent2, 0.6)], [1, 'rgba(0,0,0,0)']]); c.fillRect(x - cw, B - h - cw, cw * 2, cw * 2);
        c.fillStyle = d === 2 ? '#2fbf90' : '#d04aa8'; c.beginPath(); c.ellipse(x, B - h, cw / 2, cw / 3.2, 0, Math.PI, TAU); c.fill();
      }
    } else if (d === 4) { // fern
      c.strokeStyle = '#2a7a5a'; c.lineWidth = 1.6;
      for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(16, B); c.quadraticCurveTo(16 + (i - 2) * 6, B - 16, 16 + (i - 2) * 9, B - 10 - r() * 8); c.stroke(); }
    } else { // pebbles + glow spores
      c.fillStyle = '#4b3240'; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(5 + r() * 22, B - 2, 2 + r() * 3, 2, 0, 0, TAU); c.fill(); }
      c.fillStyle = th.accent; c.fillRect(10, B - 12, 1.5, 1.5); c.fillRect(20, B - 16, 1.5, 1.5);
    }
  } else if (key === 'caverns') {
    if (d < 3) crystalProp(c, 10 + r() * 12, B, 8 + r() * 12, d === 1 ? '#c48bff' : '#8fb8ff', '#eef4ff', r);
    else if (d === 3) { c.fillStyle = '#283244'; stalag(c, 16, B, 10, 14); }
    else if (d === 4) { // bones
      c.strokeStyle = '#cfc6b4'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(6, B - 2); c.lineTo(22, B - 5); c.stroke();
      c.fillStyle = '#cfc6b4'; c.beginPath(); c.arc(25, B - 6, 3.5, 0, TAU); c.fill(); c.fillStyle = OUT; c.fillRect(24, B - 7, 1.5, 1.5);
    } else grass(c, '#3b4c72', '#7a96c8', r);
  } else if (key === 'ocean') {
    if (d < 2) { // coral fan
      c.strokeStyle = d ? '#ff9ec2' : '#ffb07a'; c.lineWidth = 1.6;
      for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(16, B); c.quadraticCurveTo(16 + (i - 2.5) * 3, B - 10, 16 + (i - 2.5) * 6, B - 14 - r() * 6); c.stroke(); }
    } else if (d < 4) { // kelp
      c.strokeStyle = '#1f7a5a'; c.lineWidth = 3;
      for (let i = 0; i < 2; i++) { const x = 10 + i * 12; c.beginPath(); c.moveTo(x, B); c.bezierCurveTo(x + 6, B - 8, x - 6, B - 14, x + 2, B - 22); c.stroke(); }
    } else if (d === 4) { // shells
      c.fillStyle = '#ffd9c8'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(6 + i * 9, B - 2, 3, Math.PI, TAU); c.fill(); }
    } else { // anemone
      c.fillStyle = radial(c, 16, B - 6, 10, [[0, 'rgba(127,255,230,0.6)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(4, B - 18, 24, 18);
      c.strokeStyle = '#7fffe6'; c.lineWidth = 1.4; for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(16, B); c.lineTo(16 + (i - 3) * 3, B - 8 - r() * 4); c.stroke(); }
    }
  } else {
    if (d < 2) { // tendrils
      c.strokeStyle = d ? '#b8445a' : '#ff7a8a'; c.lineWidth = 2.2;
      for (let i = 0; i < 4; i++) { const x = 5 + i * 7; c.beginPath(); c.moveTo(x, B); c.bezierCurveTo(x + 5, B - 6, x - 5, B - 12, x + 2, B - 16 - r() * 4); c.stroke(); }
    } else if (d < 4) { // pustules
      for (let i = 0; i < 3; i++) { const x = 6 + i * 9; c.fillStyle = radial(c, x, B - 4, 6, [[0, '#ffe0a0'], [0.5, '#ff7a6a'], [1, 'rgba(120,20,40,0)']]); c.beginPath(); c.arc(x, B - 3, 5, Math.PI, TAU); c.fill(); }
    } else if (d === 4) { // bone spurs
      c.fillStyle = '#efe0cc'; for (let i = 0; i < 3; i++) stalag(c, 8 + i * 8, B, 4, 8 + r() * 8);
    } else grass(c, '#8a2c40', '#ff7a8a', r);
  }
}

function grass(c: Ctx, a: string, b: string, r: () => number) {
  for (let i = 0; i < 14; i++) {
    const x = 2 + r() * 28, h = 5 + r() * 14;
    c.strokeStyle = i % 2 ? a : b;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(x, 24);
    c.quadraticCurveTo(x + (r() - 0.5) * 6, 24 - h * 0.5, x + (r() - 0.5) * 8, 24 - h);
    c.stroke();
  }
}

function stalag(c: Ctx, x: number, base: number, w: number, h: number) {
  c.beginPath();
  c.moveTo(x - w / 2, base);
  c.lineTo(x, base - h);
  c.lineTo(x + w / 2, base);
  c.fill();
}

function hanging(c: Ctx, key: ThemeKey, d: number, r: () => number) {
  const th = THEMES[key];
  if (key === 'station') {
    c.strokeStyle = '#151a1f';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(4 + d * 4, 0);
    c.quadraticCurveTo(12, 30 + d * 6, 20 - d * 3, 8 + d * 10);
    c.stroke();
    if (d === 2) { c.fillStyle = '#e0a23a'; c.fillRect(10, 30, 4, 4); }
  } else if (key === 'caverns') {
    c.fillStyle = '#283244';
    c.beginPath();
    c.moveTo(4, 0);
    c.quadraticCurveTo(10, 20 + d * 8, 12, 30 + d * 6);
    c.quadraticCurveTo(14, 20, 20, 0);
    c.fill();
    if (d === 1) { c.fillStyle = rgba(th.accent, 0.8); c.fillRect(11, 26, 2, 4); }
  } else {
    const col = key === 'forest' ? '#2f8f6f' : key === 'ocean' ? '#1f7a6a' : '#8a2c40';
    c.strokeStyle = col;
    c.lineWidth = 2;
    for (let i = 0; i < 2 + d; i++) {
      const x = 4 + r() * 16, len = 18 + r() * 28;
      c.beginPath();
      c.moveTo(x, 0);
      c.quadraticCurveTo(x + 6, len * 0.5, x + (r() - 0.5) * 6, len);
      c.stroke();
      c.fillStyle = rgba(th.accent, 0.8);
      c.beginPath();
      c.arc(x + (r() - 0.5) * 6, len, 1.6, 0, TAU);
      c.fill();
    }
  }
}

function foreground(c: Ctx, key: ThemeKey, d: number, r: () => number) {
  const th = THEMES[key];
  const col = '#030405';
  c.fillStyle = col;
  c.strokeStyle = col;
  if (key === 'station') {
    if (d === 0) { // vertical pipe with bracket
      c.fillRect(70, 0, 46, 420);
      c.fillRect(56, 120, 74, 18);
      c.fillRect(56, 300, 74, 18);
    } else if (d === 1) { // hanging chain + hook
      c.lineWidth = 8;
      c.beginPath(); c.moveTo(110, 0); c.lineTo(110, 260); c.stroke();
      c.lineWidth = 12; c.beginPath(); c.arc(110, 280, 20, Math.PI * 1.5, Math.PI * 0.9, false); c.stroke();
    } else { // stacked crates and a valve wheel
      c.fillRect(40, 300, 140, 120);
      c.fillRect(70, 230, 90, 70);
      c.lineWidth = 10;
      c.beginPath(); c.arc(115, 200, 26, 0, Math.PI * 2); c.stroke();
    }
  } else if (key === 'forest' || key === 'heart') {
    // tall stalks / ribs with leaves
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      c.lineWidth = 14 - i * 3;
      const x = 60 + i * 40;
      c.beginPath();
      c.moveTo(x, 420);
      c.bezierCurveTo(x + 40, 300, x - 40, 160, x + 20 * (r() - 0.5), 20 + i * 40);
      c.stroke();
    }
    if (key === 'forest') { blob(c, 110, 60, 70, r, 10, 0.4); c.fill(); }
  } else if (key === 'caverns') {
    c.beginPath(); c.moveTo(20, 0); c.quadraticCurveTo(100, 260, 110, 420); c.quadraticCurveTo(140, 200, 200, 0); c.fill();
  } else {
    c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      c.lineWidth = 10;
      const x = 40 + i * 40;
      c.beginPath(); c.moveTo(x, 420); c.bezierCurveTo(x + 40, 300, x - 40, 160, x + 20, 0); c.stroke();
    }
  }
  // faint rim light so silhouettes read
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = linear(c, 0, 0, 220, 0, [[0, rgba(th.accent, 0.12)], [0.3, 'rgba(0,0,0,0)']]);
  c.fillRect(0, 0, 220, 420);
  c.globalCompositeOperation = 'source-over';
  void limb;
}
