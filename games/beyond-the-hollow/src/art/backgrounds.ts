import Phaser from 'phaser';
import { Ctx, blob, dabs, linear, mix, paintTexture, radial, rgba, rng } from './paint';
import { THEMES, ThemeKey, ThemeDef } from './themes';

export const BG_W = 1024;
export const BG_H = 640;

/** Draw a shape at x and its wrapped copies so the layer tiles seamlessly. */
function wrap(x: number, w: number, f: (x: number) => void) {
  f(x);
  if (x - w < 0) f(x + BG_W);
  if (x + w > BG_W) f(x - BG_W);
}

function ceilingFringe(ctx: Ctx, color: string, depth: number, r: () => number, count = 26) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, BG_W, depth * 0.35);
  for (let i = 0; i < count; i++) {
    const x = r() * BG_W, w = 20 + r() * 70, h = depth * (0.4 + r() * 0.9);
    wrap(x, w, (xx) => {
      ctx.beginPath();
      ctx.moveTo(xx - w / 2, 0);
      ctx.quadraticCurveTo(xx - w * 0.15, h * 0.6, xx + (r() - 0.5) * 6, h);
      ctx.quadraticCurveTo(xx + w * 0.15, h * 0.6, xx + w / 2, 0);
      ctx.fill();
    });
  }
}

function groundFringe(ctx: Ctx, color: string, base: number, amp: number, r: () => number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, BG_H);
  const n = 32;
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) pts.push(i === n ? pts[0] : base + (r() - 0.5) * amp);
  for (let i = 0; i <= n; i++) ctx.lineTo((i / n) * BG_W, pts[i]);
  ctx.lineTo(BG_W, BG_H);
  ctx.closePath();
  ctx.fill();
}

function stalagmite(ctx: Ctx, x: number, baseY: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, baseY);
  ctx.quadraticCurveTo(x - w * 0.2, baseY - h * 0.6, x, baseY - h);
  ctx.quadraticCurveTo(x + w * 0.2, baseY - h * 0.6, x + w / 2, baseY);
  ctx.fill();
}

function mushroom(ctx: Ctx, x: number, baseY: number, h: number, capW: number, stem: string, cap: string, glow: string, r: () => number) {
  const lean = (r() - 0.5) * 0.4 * h;
  ctx.strokeStyle = stem;
  ctx.lineCap = 'round';
  ctx.lineWidth = capW * 0.13;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + lean * 0.2, baseY - h * 0.5, x + lean, baseY - h);
  ctx.stroke();
  const cx = x + lean, cy = baseY - h;
  // glow underside
  ctx.fillStyle = radial(ctx, cx, cy + capW * 0.12, capW * 0.9, [[0, rgba(glow, 0.55)], [1, rgba(glow, 0)]]);
  ctx.beginPath();
  ctx.ellipse(cx, cy + capW * 0.15, capW * 0.9, capW * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.ellipse(cx, cy, capW / 2, capW * 0.26, 0, Math.PI, Math.PI * 2);
  ctx.quadraticCurveTo(cx, cy + capW * 0.12, cx - capW / 2, cy);
  ctx.fill();
  ctx.strokeStyle = rgba(glow, 0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - capW / 2 + 4, cy + 1);
  ctx.quadraticCurveTo(cx, cy + capW * 0.1, cx + capW / 2 - 4, cy + 1);
  ctx.stroke();
  // spots
  ctx.fillStyle = rgba(glow, 0.5);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(cx + (r() - 0.5) * capW * 0.7, cy - r() * capW * 0.18, 2 + r() * capW * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
}

function crystal(ctx: Ctx, x: number, baseY: number, h: number, color: string, glow: string, r: () => number) {
  ctx.fillStyle = radial(ctx, x, baseY - h * 0.5, h, [[0, rgba(glow, 0.35)], [1, rgba(glow, 0)]]);
  ctx.beginPath();
  ctx.arc(x, baseY - h * 0.5, h, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const a = (r() - 0.5) * 0.9, hh = h * (0.4 + r() * 0.6), w = h * 0.14;
    ctx.save();
    ctx.translate(x + (r() - 0.5) * h * 0.3, baseY);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.lineTo(-w, -hh * 0.8);
    ctx.lineTo(0, -hh);
    ctx.lineTo(w, -hh * 0.8);
    ctx.lineTo(w, 0);
    ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.25);
    ctx.beginPath();
    ctx.moveTo(-w, -hh * 0.8);
    ctx.lineTo(0, -hh);
    ctx.lineTo(0, 0);
    ctx.lineTo(-w, 0);
    ctx.fill();
    ctx.restore();
  }
}

function lightShafts(ctx: Ctx, color: string, r: () => number, n: number, alpha: number) {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = r() * BG_W, w = 40 + r() * 120, sk = (r() - 0.3) * 200;
    wrap(x, w + Math.abs(sk), (xx) => {
      ctx.fillStyle = linear(ctx, 0, 0, 0, BG_H, [[0, rgba(color, alpha)], [1, rgba(color, 0)]]);
      ctx.beginPath();
      ctx.moveTo(xx, 0);
      ctx.lineTo(xx + w, 0);
      ctx.lineTo(xx + w + sk, BG_H);
      ctx.lineTo(xx + sk, BG_H);
      ctx.fill();
    });
  }
  ctx.globalCompositeOperation = 'source-over';
}

function glows(ctx: Ctx, color: string, r: () => number, n: number, size: number, alpha: number, ymin = 0, ymax = BG_H) {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = r() * BG_W, y = ymin + r() * (ymax - ymin), s = size * (0.3 + r());
    wrap(x, s, (xx) => {
      ctx.fillStyle = radial(ctx, xx, y, s, [[0, rgba(color, alpha)], [1, rgba(color, 0)]]);
      ctx.fillRect(xx - s, y - s, s * 2, s * 2);
    });
  }
  ctx.globalCompositeOperation = 'source-over';
}

function layerSky(ctx: Ctx, th: ThemeDef, r: () => number) {
  ctx.fillStyle = linear(ctx, 0, 0, 0, BG_H, [[0, th.sky[0]], [0.55, th.sky[1]], [1, th.sky[2]]]);
  ctx.fillRect(0, 0, BG_W, BG_H);
  glows(ctx, th.accent, r, 5, 260, 0.1, 150, 520);
  glows(ctx, th.accent2, r, 3, 200, 0.07, 100, 500);
  dabs(ctx, 0, 0, BG_W, BG_H, 260, [th.sky[1], th.sky[2], th.far], 10, 60, 0.08, r);
  // tiny distant motes
  ctx.fillStyle = rgba('#ffffff', 0.5);
  for (let i = 0; i < 80; i++) {
    ctx.globalAlpha = 0.15 + r() * 0.4;
    ctx.fillRect(r() * BG_W, r() * BG_H, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
}

function stationLayer(ctx: Ctx, th: ThemeDef, depth: number, r: () => number) {
  const col = [th.far, th.mid, th.near][depth];
  const base = [470, 520, 590][depth];
  ceilingFringe(ctx, col, [120, 90, 70][depth], r, 18);
  if (depth === 0) {
    // distant ruined towers and gantries
    for (let i = 0; i < 9; i++) {
      const x = r() * BG_W, w = 30 + r() * 60, h = 120 + r() * 220;
      wrap(x, w, (xx) => {
        ctx.fillStyle = col;
        ctx.fillRect(xx - w / 2, base - h, w, h + 200);
        ctx.fillStyle = rgba(th.accent, 0.5);
        for (let k = 0; k < 6; k++) if (r() < 0.4) ctx.fillRect(xx - w / 2 + 4 + r() * (w - 10), base - h + 10 + r() * h * 0.8, 4, 3);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xx, base - h);
        ctx.lineTo(xx + (r() - 0.5) * 10, base - h - 40 - r() * 40);
        ctx.stroke();
      });
    }
  } else {
    // pipes, tanks, girders
    for (let i = 0; i < (depth === 1 ? 6 : 4); i++) {
      const x = r() * BG_W, w = 60 + r() * 90, h = 100 + r() * 140;
      wrap(x, w, (xx) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.roundRect(xx - w / 2, base - h, w, h + 100, w * 0.25);
        ctx.fill();
        ctx.fillStyle = rgba('#ffffff', 0.04 + depth * 0.01);
        ctx.fillRect(xx - w / 2 + 6, base - h + 10, 6, h);
        ctx.fillStyle = col;
        ctx.fillRect(xx - w / 2 - 8, base - h * 0.6, w + 16, 8);
      });
    }
    ctx.strokeStyle = col;
    for (let i = 0; i < 5; i++) {
      const y = 80 + r() * 300;
      ctx.lineWidth = 6 + depth * 6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(BG_W * 0.3, y + 40, BG_W * 0.6, y - 40, BG_W, y);
      ctx.stroke();
    }
    // hanging cables
    ctx.lineWidth = 2 + depth;
    for (let i = 0; i < 8; i++) {
      const x = r() * BG_W, sag = 40 + r() * 90, w = 80 + r() * 160;
      wrap(x, w, (xx) => {
        ctx.beginPath();
        ctx.moveTo(xx, 40);
        ctx.quadraticCurveTo(xx + w / 2, 40 + sag * 2, xx + w, 40);
        ctx.stroke();
      });
    }
  }
  groundFringe(ctx, col, base, 30, r);
}

function forestLayer(ctx: Ctx, th: ThemeDef, depth: number, r: () => number) {
  const col = [th.far, th.mid, th.near][depth];
  const base = [480, 530, 600][depth];
  ceilingFringe(ctx, col, [90, 70, 60][depth], r, 20);
  // hanging vines with glow beads
  for (let i = 0; i < 14; i++) {
    const x = r() * BG_W, len = 60 + r() * 220;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2 + depth;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + 20, len / 2, x + (r() - 0.5) * 30, len);
    ctx.stroke();
    ctx.fillStyle = rgba(r() < 0.5 ? th.accent : th.accent2, 0.6 - depth * 0.1);
    ctx.beginPath();
    ctx.arc(x + (r() - 0.5) * 30, len, 2.5 + depth, 0, Math.PI * 2);
    ctx.fill();
  }
  const n = [10, 6, 4][depth];
  for (let i = 0; i < n; i++) {
    const x = r() * BG_W, h = [180, 240, 300][depth] * (0.5 + r() * 0.7), cw = [100, 160, 220][depth] * (0.6 + r() * 0.6);
    const glow = r() < 0.6 ? th.accent : th.accent2;
    wrap(x, cw, (xx) => mushroom(ctx, xx, base + 20, h, cw, col, mix(col, glow, 0.18 - depth * 0.04), glow, r));
  }
  groundFringe(ctx, col, base, 24, r);
  glows(ctx, th.accent, r, 14 - depth * 3, 12, 0.6, 100, base);
}

function cavernLayer(ctx: Ctx, th: ThemeDef, depth: number, r: () => number) {
  const col = [th.far, th.mid, th.near][depth];
  const base = [470, 530, 600][depth];
  ceilingFringe(ctx, col, [170, 140, 120][depth], r, 30);
  for (let i = 0; i < [12, 8, 6][depth]; i++) {
    const x = r() * BG_W, w = 30 + r() * 80, h = 80 + r() * 260;
    wrap(x, w, (xx) => stalagmite(ctx, xx, base + 30, w, h, col));
  }
  if (depth < 2) {
    for (let i = 0; i < 5; i++) {
      const x = r() * BG_W;
      wrap(x, 60, (xx) => crystal(ctx, xx, base + 10 - r() * 40, 40 + r() * 60, mix(col, th.accent, 0.5), r() < 0.5 ? th.accent : th.accent2, r));
    }
  }
  // rock arch
  if (depth === 1) {
    const x = r() * BG_W;
    wrap(x, 260, (xx) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 60;
      ctx.beginPath();
      ctx.arc(xx, base + 60, 230, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    });
  }
  groundFringe(ctx, col, base, 40, r);
}

function oceanLayer(ctx: Ctx, th: ThemeDef, depth: number, r: () => number) {
  const col = [th.far, th.mid, th.near][depth];
  if (depth === 0) {
    // distant sea horizon with shimmering reflections
    const hy = 400;
    ctx.fillStyle = linear(ctx, 0, hy, 0, BG_H, [[0, mix(th.sky[2], '#9ff', 0.2)], [1, th.sky[1]]]);
    ctx.fillRect(0, hy, BG_W, BG_H - hy);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 160; i++) {
      const y = hy + 4 + Math.pow(r(), 1.6) * 230;
      ctx.fillStyle = rgba(th.accent, 0.05 + r() * 0.12);
      ctx.fillRect(r() * BG_W, y, 10 + r() * 40, 1.5);
    }
    ctx.globalCompositeOperation = 'source-over';
    ceilingFringe(ctx, col, 160, r, 24);
    for (let i = 0; i < 4; i++) {
      const x = r() * BG_W, h = 120 + r() * 140, w = 40 + r() * 60;
      wrap(x, w * 2, (xx) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(xx - w, hy + 2);
        ctx.quadraticCurveTo(xx - w * 0.3, hy - h, xx, hy - h);
        ctx.quadraticCurveTo(xx + w * 0.4, hy - h * 0.8, xx + w * 1.2, hy + 2);
        ctx.fill();
      });
    }
    lightShafts(ctx, th.accent, r, 5, 0.06);
    return;
  }
  const base = [0, 520, 600][depth];
  ceilingFringe(ctx, col, [0, 110, 90][depth], r, 20);
  // kelp strands & coral fans
  for (let i = 0; i < (depth === 1 ? 18 : 10); i++) {
    const x = r() * BG_W, h = 120 + r() * 260;
    ctx.strokeStyle = col;
    ctx.lineWidth = 4 + depth * 3;
    ctx.beginPath();
    ctx.moveTo(x, base + 40);
    ctx.bezierCurveTo(x + 30, base - h * 0.3, x - 30, base - h * 0.6, x + (r() - 0.5) * 40, base - h);
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const x = r() * BG_W, s = 40 + r() * 60;
    wrap(x, s, (xx) => {
      ctx.fillStyle = col;
      blob(ctx, xx, base - s * 0.3, s, r, 10, 0.5);
      ctx.fill();
    });
  }
  groundFringe(ctx, col, base, 30, r);
  glows(ctx, th.accent2, r, 10, 10, 0.5, 200, base);
}

function heartLayer(ctx: Ctx, th: ThemeDef, depth: number, r: () => number) {
  const col = [th.far, th.mid, th.near][depth];
  const base = [480, 530, 600][depth];
  if (depth === 0) {
    // the distant Heart: an immense glowing organ
    const cx = BG_W * 0.5, cy = 300;
    ctx.fillStyle = radial(ctx, cx, cy, 300, [[0, rgba(th.accent2, 0.35)], [0.4, rgba(th.accent, 0.18)], [1, rgba(th.accent, 0)]]);
    ctx.fillRect(0, 0, BG_W, BG_H);
    ctx.fillStyle = mix(col, th.accent, 0.25);
    blob(ctx, cx, cy, 120, r, 12, 0.3);
    ctx.fill();
    ctx.strokeStyle = mix(col, th.accent, 0.4);
    for (let i = 0; i < 12; i++) {
      ctx.lineWidth = 3 + r() * 8;
      const a = r() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 100, cy + Math.sin(a) * 100);
      ctx.bezierCurveTo(cx + Math.cos(a) * 250, cy + Math.sin(a) * 180, cx + Math.cos(a + 0.5) * 400, cy + Math.sin(a + 0.5) * 300, cx + Math.cos(a + 0.3) * 700, cy + Math.sin(a + 0.3) * 400);
      ctx.stroke();
    }
  }
  ceilingFringe(ctx, col, [100, 80, 60][depth], r, 20);
  // ribs
  for (let i = 0; i < [6, 5, 3][depth]; i++) {
    const x = r() * BG_W, h = 200 + r() * 200, w = 30 + depth * 20;
    wrap(x, h * 0.6, (xx) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(xx, base + 60);
      ctx.quadraticCurveTo(xx + h * 0.5, base - h * 0.5, xx + h * 0.15, base - h);
      ctx.stroke();
    });
  }
  // veins
  ctx.strokeStyle = rgba(th.accent, 0.25 - depth * 0.05);
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    let x = r() * BG_W, y = r() * BG_H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 80;
      y += (r() - 0.3) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  groundFringe(ctx, col, base, 34, r);
  glows(ctx, th.accent2, r, 8, 12, 0.5, 150, base);
}

function iceLayer(ctx: Ctx, th: ThemeDef, depth: number, r: () => number) {
  const col = [th.far, th.mid, th.near][depth];
  const base = [460, 520, 600][depth];
  if (depth === 0) {
    // aurora ribbons across the cavern sky
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const y0 = 90 + k * 50;
      for (let x = 0; x < BG_W; x += 4) {
        const y = y0 + Math.sin(x * 0.006 + k) * 40 + Math.sin(x * 0.017) * 12;
        ctx.fillStyle = linear(ctx, 0, y - 60, 0, y + 20, [[0, rgba(k === 1 ? th.accent2 : th.accent, 0)], [0.7, rgba(k === 1 ? th.accent2 : th.accent, 0.12)], [1, rgba(th.accent, 0)]]);
        ctx.fillRect(x, y - 60, 4, 80);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ceilingFringe(ctx, col, [130, 100, 80][depth], r, 34);
  // glacier spires & frozen columns
  for (let i = 0; i < [9, 7, 5][depth]; i++) {
    const x = r() * BG_W, w = 30 + r() * 70, h = 120 + r() * 240;
    wrap(x, w, (xx) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(xx - w / 2, base + 40);
      ctx.lineTo(xx - w * 0.3, base - h * 0.7);
      ctx.lineTo(xx + (r() - 0.5) * 10, base - h);
      ctx.lineTo(xx + w * 0.35, base - h * 0.6);
      ctx.lineTo(xx + w / 2, base + 40);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.06 + depth * 0.02);
      ctx.beginPath();
      ctx.moveTo(xx - w * 0.3, base - h * 0.7);
      ctx.lineTo(xx, base - h);
      ctx.lineTo(xx, base + 40);
      ctx.lineTo(xx - w * 0.4, base + 40);
      ctx.fill();
    });
  }
  if (depth === 2) {
    // old mine scaffolding
    ctx.strokeStyle = col;
    ctx.lineWidth = 8;
    for (let i = 0; i < 3; i++) {
      const x = r() * BG_W;
      wrap(x, 120, (xx) => {
        ctx.beginPath();
        ctx.moveTo(xx, base + 20); ctx.lineTo(xx, base - 200);
        ctx.moveTo(xx + 100, base + 20); ctx.lineTo(xx + 100, base - 200);
        ctx.moveTo(xx, base - 200); ctx.lineTo(xx + 100, base - 200);
        ctx.moveTo(xx, base - 100); ctx.lineTo(xx + 100, base - 200);
        ctx.stroke();
      });
    }
  }
  if (depth > 0) for (let i = 0; i < 3; i++) { const x = r() * BG_W, cw = [0, 120, 170][depth] * (0.6 + r() * 0.5); const glow = r() < 0.5 ? th.accent : th.accent2; wrap(x, cw, (xx) => mushroom(ctx, xx, base + 20, cw * 1.2, cw, col, mix(col, glow, 0.15), glow, r)); }
  groundFringe(ctx, col, base, 30, r);
  glows(ctx, th.accent, r, 10 - depth * 3, 10, 0.5, 120, base);
}

function foundryLayer(ctx: Ctx, th: ThemeDef, depth: number, r: () => number) {
  const col = [th.far, th.mid, th.near][depth];
  const base = [470, 530, 600][depth];
  if (depth === 0) {
    // molten river glow far below
    ctx.fillStyle = linear(ctx, 0, 380, 0, BG_H, [[0, rgba(th.accent2, 0)], [0.7, rgba(th.accent, 0.35)], [1, rgba('#ffe0a0', 0.6)]]);
    ctx.fillRect(0, 380, BG_W, BG_H - 380);
  }
  ceilingFringe(ctx, col, [90, 70, 60][depth], r, 14);
  const gear = (x: number, y: number, R: number) => {
    ctx.fillStyle = col;
    const teeth = Math.round(R / 6);
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2, rr = i % 2 ? R : R * 0.86;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(x, y, R * 0.25, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * R * 0.55, y + Math.sin(a) * R * 0.55, R * 0.14, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
  };
  for (let i = 0; i < [6, 4, 3][depth]; i++) {
    const x = r() * BG_W, R = [70, 100, 130][depth] * (0.6 + r() * 0.6);
    wrap(x, R, (xx) => gear(xx, 120 + r() * 300, R));
  }
  // chimneys / pistons
  for (let i = 0; i < [7, 4, 3][depth]; i++) {
    const x = r() * BG_W, w = 30 + r() * 40, h = 150 + r() * 220;
    wrap(x, w, (xx) => {
      ctx.fillStyle = col;
      ctx.fillRect(xx - w / 2, base - h, w, h + 100);
      ctx.fillRect(xx - w / 2 - 6, base - h, w + 12, 12);
      if (depth === 0) {
        ctx.fillStyle = rgba(th.accent, 0.5);
        ctx.fillRect(xx - 3, base - h + 30, 6, 6);
      }
    });
  }
  ctx.strokeStyle = col;
  ctx.lineWidth = 3 + depth * 2;
  for (let i = 0; i < 6; i++) {
    const x = r() * BG_W, len = 80 + r() * 200;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, len); ctx.stroke();
  }
  if (depth > 0) for (let i = 0; i < 2; i++) { const x = r() * BG_W, cw = [0, 110, 160][depth] * (0.6 + r() * 0.5); const glow = r() < 0.5 ? th.accent : '#d07aff'; wrap(x, cw, (xx) => mushroom(ctx, xx, base + 20, cw * 1.1, cw, col, mix(col, glow, 0.15), glow, r)); }
  groundFringe(ctx, col, base, 20, r);
  glows(ctx, th.accent, r, 12 - depth * 3, 8, 0.6, 200, base);
}

function ruinsLayer(ctx: Ctx, th: ThemeDef, depth: number, r: () => number) {
  const col = [th.far, th.mid, th.near][depth];
  const base = [470, 530, 600][depth];
  if (depth === 0) {
    // stepped temple silhouette with a glowing doorway
    const cx = BG_W * 0.55;
    ctx.fillStyle = mix(col, th.accent, 0.08);
    for (let k = 0; k < 6; k++) ctx.fillRect(cx - 260 + k * 40, base - 40 - k * 45, 520 - k * 80, 50);
    ctx.fillStyle = radial(ctx, cx, base - 120, 120, [[0, rgba(th.accent, 0.6)], [1, rgba(th.accent, 0)]]);
    ctx.fillRect(cx - 120, base - 240, 240, 240);
    ctx.fillStyle = rgba('#d8fff6', 0.7);
    ctx.fillRect(cx - 14, base - 150, 28, 44);
  }
  ceilingFringe(ctx, col, [90, 70, 60][depth], r, 20);
  // columns, some broken
  for (let i = 0; i < [8, 6, 4][depth]; i++) {
    const x = r() * BG_W, w = [26, 38, 52][depth], h = 160 + r() * 220, broken = r() < 0.45;
    wrap(x, w, (xx) => {
      ctx.fillStyle = col;
      ctx.fillRect(xx - w / 2, base - h, w, h + 100);
      ctx.fillRect(xx - w / 2 - 8, base - 14, w + 16, 14);
      if (!broken) ctx.fillRect(xx - w / 2 - 8, base - h - 12, w + 16, 14);
      else {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.moveTo(xx - w, base - h - 2); ctx.lineTo(xx + w, base - h + 24); ctx.lineTo(xx + w, base - h - 40); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = rgba('#000000', 0.18);
      for (let k = -1; k <= 1; k++) ctx.fillRect(xx + k * w * 0.28 - 1.5, base - h + 10, 3, h - 20);
    });
  }
  // hanging vines
  ctx.strokeStyle = mix(col, '#3a8a5a', 0.35 - depth * 0.08);
  ctx.lineWidth = 2 + depth;
  for (let i = 0; i < 16; i++) {
    const x = r() * BG_W, len = 60 + r() * 220;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 15, len / 2, x + (r() - 0.5) * 20, len); ctx.stroke();
  }
  if (depth > 0) for (let i = 0; i < 3; i++) { const x = r() * BG_W, cw = [0, 120, 180][depth] * (0.6 + r() * 0.5); const glow = r() < 0.5 ? th.accent : th.accent2; wrap(x, cw, (xx) => mushroom(ctx, xx, base + 20, cw * 1.2, cw, col, mix(col, glow, 0.15), glow, r)); }
  groundFringe(ctx, col, base, 24, r);
  glows(ctx, th.accent2, r, 10 - depth * 3, 10, 0.5, 150, base);
}

const LAYERS: Record<ThemeKey, (ctx: Ctx, th: ThemeDef, d: number, r: () => number) => void> = {
  station: stationLayer,
  forest: forestLayer,
  caverns: cavernLayer,
  ocean: oceanLayer,
  heart: heartLayer,
  ice: iceLayer,
  foundry: foundryLayer,
  ruins: ruinsLayer,
};

/** Builds 4 parallax layer textures: bg-<theme>-0 (sky) .. bg-<theme>-3 (nearest). */
export function buildBackgrounds(scene: Phaser.Scene, key: ThemeKey) {
  const th = THEMES[key];
  if (scene.textures.exists(`bg-${key}-3`)) return;
  const r = rng(key.charCodeAt(0) * 131 + key.length);
  paintTexture(scene, `bg-${key}-0`, BG_W, BG_H, (ctx) => layerSky(ctx, th, r));
  for (let d = 0; d < 3; d++) {
    paintTexture(scene, `bg-${key}-${d + 1}`, BG_W, BG_H, (ctx) => {
      LAYERS[key](ctx, th, d, r);
      // atmospheric haze on farther layers
      if (d < 2) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = linear(ctx, 0, 0, 0, BG_H, [[0, rgba(th.fog, 0.0)], [0.7, rgba(th.fog, 0.14 - d * 0.06)], [1, rgba(th.fog, 0.2 - d * 0.08)]]);
        ctx.fillRect(0, 0, BG_W, BG_H);
        ctx.globalCompositeOperation = 'source-over';
      }
    });
  }
}
