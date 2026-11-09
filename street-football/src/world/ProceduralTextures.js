import * as THREE from 'three';
import { COURT } from '../config.js';

// All environment textures are generated at load time from seeded noise, so
// the game ships with no third-party texture files and loads fast.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

/** Tileable value-noise fBm into a Float32Array (0..1). */
export function fbm(w, h, rng, { octaves = 5, base = 8, gain = 0.5 } = {}) {
  const out = new Float32Array(w * h);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o += 1) {
    const cells = base << o;
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i += 1) grid[i] = rng();
    for (let y = 0; y < h; y += 1) {
      const gy = (y / h) * cells;
      const y0 = Math.floor(gy);
      const ty = gy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % cells) * cells;
      const r1 = ((y0 + 1) % cells) * cells;
      for (let x = 0; x < w; x += 1) {
        const gx = (x / w) * cells;
        const x0 = Math.floor(gx);
        const tx = gx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % cells;
        const c1 = (x0 + 1) % cells;
        const a = grid[r0 + c0] + (grid[r0 + c1] - grid[r0 + c0]) * sx;
        const b = grid[r1 + c0] + (grid[r1 + c1] - grid[r1 + c0]) * sx;
        out[y * w + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i += 1) out[i] /= total;
  return out;
}

function toTexture(c, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = aniso;
  return t;
}

function noiseCanvas(w, h, rng, colorA, colorB, opts) {
  const n = fbm(w, h, rng, opts);
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  const a = new THREE.Color(colorA);
  const b = new THREE.Color(colorB);
  for (let i = 0; i < n.length; i += 1) {
    const t = n[i];
    const grain = (rng() - 0.5) * 0.06;
    img.data[i * 4] = Math.max(0, Math.min(255, (a.r + (b.r - a.r) * t + grain) * 255));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, (a.g + (b.g - a.g) * t + grain) * 255));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, (a.b + (b.b - a.b) * t + grain) * 255));
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return [c, g, n];
}

function crack(g, rng, x, y, len, width, color) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  let a = rng() * Math.PI * 2;
  for (let i = 0; i < len; i += 1) {
    a += (rng() - 0.5) * 0.9;
    x += Math.cos(a) * 6;
    y += Math.sin(a) * 6;
    g.lineTo(x, y);
    if (rng() < 0.06) crack(g, rng, x, y, len * 0.35, width * 0.6, color);
  }
  g.stroke();
}

/**
 * The whole playing surface as one unique texture (court + run-off), with
 * painted lines, a faded centre emblem, repairs, cracks and scuffs.
 * Returns { map, roughnessMap, size: [w, d] } in metres.
 */
export function createCourtTextures(rng) {
  const sizeX = COURT.halfLength * 2 + 4;
  const sizeZ = COURT.halfWidth * 2 + 4;
  const W = 2048;
  const H = Math.round((W * sizeZ) / sizeX);
  const px = W / sizeX;
  const toPx = (x, z) => [(x + sizeX / 2) * px, (z + sizeZ / 2) * px];

  // Base concrete: low-res fBm upscaled, then fine grain on top.
  const [base] = noiseCanvas(512, Math.round(512 * (H / W)), rng, '#c4c0b8', '#9a958c', { octaves: 6, base: 4 });
  const [c, g] = canvas(W, H);
  g.imageSmoothingEnabled = true;
  g.drawImage(base, 0, 0, W, H);
  // Expansion joints / slab seams every 3 m.
  g.strokeStyle = 'rgba(40,36,30,0.45)';
  g.lineWidth = 2;
  for (let x = -sizeX / 2; x <= sizeX / 2; x += 3) {
    const [sx] = toPx(x, 0);
    g.beginPath();
    g.moveTo(sx, 0);
    g.lineTo(sx + (rng() - 0.5) * 3, H);
    g.stroke();
  }
  for (let z = -sizeZ / 2; z <= sizeZ / 2; z += 3) {
    const [, sz] = toPx(0, z);
    g.beginPath();
    g.moveTo(0, sz);
    g.lineTo(W, sz + (rng() - 0.5) * 3);
    g.stroke();
  }
  // Patch repairs (darker, smoother concrete squares).
  for (let i = 0; i < 9; i += 1) {
    const w = 60 + rng() * 160;
    const h = 40 + rng() * 120;
    const x = rng() * (W - w);
    const y = rng() * (H - h);
    g.fillStyle = `rgba(${90 + rng() * 20},${86 + rng() * 15},${80 + rng() * 10},0.55)`;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(30,28,25,0.4)';
    g.lineWidth = 2;
    g.strokeRect(x, y, w, h);
  }
  // Stains, water marks, rubber scuffs.
  for (let i = 0; i < 140; i += 1) {
    const r = 6 + rng() * 60;
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    const dark = rng() < 0.8;
    grd.addColorStop(0, dark ? `rgba(30,26,22,${0.08 + rng() * 0.18})` : `rgba(220,214,200,${0.05 + rng() * 0.12})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.translate(rng() * W, rng() * H);
    g.scale(1, 0.4 + rng() * 0.8);
    g.rotate(rng() * Math.PI);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  for (let i = 0; i < 22; i += 1) crack(g, rng, rng() * W, rng() * H, 12 + rng() * 30, 1 + rng() * 1.6, 'rgba(25,22,18,0.65)');

  // Faded painted centre emblem: a sun-star roundel.
  const [cx, cz] = toPx(0, 0);
  g.save();
  g.translate(cx, cz);
  g.globalAlpha = 0.28;
  g.fillStyle = '#1f8a4c';
  g.beginPath();
  g.arc(0, 0, COURT.centerCircleRadius * px * 0.8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f6c915';
  g.beginPath();
  for (let i = 0; i < 16; i += 1) {
    const r = (i % 2 ? 0.38 : 0.7) * COURT.centerCircleRadius * px;
    const a = (i / 16) * Math.PI * 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.fill();
  g.globalAlpha = 0.4;
  g.fillStyle = '#1d4fa3';
  g.beginPath();
  g.arc(0, 0, COURT.centerCircleRadius * px * 0.3, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // Painted lines: white, chipped.
  const lineW = 0.09 * px;
  g.strokeStyle = 'rgba(238,234,222,0.92)';
  g.lineWidth = lineW;
  const L = COURT.halfLength;
  const Wd = COURT.halfWidth;
  const rect = (x0, z0, x1, z1) => {
    const [a, b] = toPx(x0, z0);
    const [c2, d] = toPx(x1, z1);
    g.strokeRect(a, b, c2 - a, d - b);
  };
  rect(-L + 0.05, -Wd + 0.05, L - 0.05, Wd - 0.05);
  {
    const [a, b] = toPx(0, -Wd);
    const [, d] = toPx(0, Wd);
    g.beginPath();
    g.moveTo(a, b);
    g.lineTo(a, d);
    g.stroke();
    g.beginPath();
    g.arc(cx, cz, COURT.centerCircleRadius * px, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(238,234,222,0.92)';
    g.beginPath();
    g.arc(cx, cz, 0.16 * px, 0, Math.PI * 2);
    g.fill();
  }
  for (const s of [-1, 1]) {
    // Semi-circular street-court penalty area.
    const [gx, gz] = toPx(s * L, 0);
    g.beginPath();
    g.arc(gx, gz, COURT.penaltyDepth * px, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2);
    g.stroke();
    const [psx, psz] = toPx(s * (L - 3), 0);
    g.beginPath();
    g.arc(psx, psz, 0.12 * px, 0, Math.PI * 2);
    g.fill();
  }
  // Chip the paint: punch random holes of concrete back through the lines.
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < 9000; i += 1) {
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * H);
    const r = 1 + Math.floor(rng() * 3);
    for (let yy = -r; yy <= r; yy += 1) {
      for (let xx = -r; xx <= r; xx += 1) {
        const k = ((y + yy) * W + (x + xx)) * 4;
        if (k < 0 || k >= d.length) continue;
        if (d[k] > 200 && d[k + 1] > 195) {
          d[k] *= 0.62;
          d[k + 1] *= 0.6;
          d[k + 2] *= 0.58;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);

  // Roughness: paint is slightly smoother; worn centre and patches are polished.
  const [rc, rg] = canvas(512, Math.round(512 * (H / W)));
  rg.drawImage(c, 0, 0, rc.width, rc.height);
  const rimg = rg.getImageData(0, 0, rc.width, rc.height);
  for (let i = 0; i < rimg.data.length; i += 4) {
    const lum = (rimg.data[i] + rimg.data[i + 1] + rimg.data[i + 2]) / 3;
    const v = lum > 200 ? 150 : 210 + (rng() - 0.5) * 30 - (lum - 120) * 0.25;
    rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.max(80, Math.min(255, v));
  }
  rg.putImageData(rimg, 0, 0);

  const map = toTexture(c, { aniso: 8 });
  const roughnessMap = toTexture(rc, { srgb: false });
  return { map, roughnessMap, size: [sizeX, sizeZ] };
}

export function createAsphaltTexture(rng) {
  const [c, g] = noiseCanvas(512, 512, rng, '#4a4744', '#2e2c2a', { octaves: 6, base: 4 });
  for (let i = 0; i < 2400; i += 1) {
    g.fillStyle = `rgba(${150 + rng() * 80},${140 + rng() * 70},${130 + rng() * 60},${0.15 + rng() * 0.25})`;
    g.fillRect(rng() * 512, rng() * 512, 1 + rng() * 1.5, 1 + rng() * 1.5);
  }
  for (let i = 0; i < 6; i += 1) crack(g, rng, rng() * 512, rng() * 512, 20, 1.4, 'rgba(15,14,13,0.7)');
  return toTexture(c, { repeat: true });
}

/** Neutral plaster/render; tinted per building through vertex colours. */
export function createPlasterTexture(rng) {
  const [c, g] = noiseCanvas(512, 512, rng, '#f2ede4', '#c9c0b2', { octaves: 6, base: 4 });
  // Damp streaks from window sills and roof edges.
  for (let i = 0; i < 26; i += 1) {
    const x = rng() * 512;
    const grd = g.createLinearGradient(0, 0, 0, 120 + rng() * 200);
    grd.addColorStop(0, `rgba(70,60,50,${0.12 + rng() * 0.15})`);
    grd.addColorStop(1, 'rgba(70,60,50,0)');
    g.fillStyle = grd;
    g.fillRect(x, rng() * 300, 4 + rng() * 14, 330);
  }
  // Exposed brick where the render has fallen off.
  for (let i = 0; i < 5; i += 1) {
    const bx = rng() * 420;
    const by = rng() * 420;
    const bw = 40 + rng() * 60;
    const bh = 30 + rng() * 40;
    g.save();
    g.beginPath();
    g.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, rng(), 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#8f4a32';
    g.fillRect(bx, by, bw, bh);
    g.strokeStyle = 'rgba(210,200,185,0.8)';
    g.lineWidth = 1.5;
    for (let y = by; y < by + bh; y += 7) {
      g.beginPath();
      g.moveTo(bx, y);
      g.lineTo(bx + bw, y);
      g.stroke();
      for (let x = bx + ((y / 7) % 2) * 8; x < bx + bw; x += 16) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 7);
        g.stroke();
      }
    }
    g.restore();
  }
  return toTexture(c, { repeat: true });
}

/** Unfinished hollow-brick walls (tijolo baiano) — the signature favela surface. */
export function createBrickTexture(rng) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#b9a891';
  g.fillRect(0, 0, 512, 512);
  const bw = 64;
  const bh = 32;
  for (let row = 0; row < 512 / bh; row += 1) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < 512 / bw + 1; col += 1) {
      const x = col * bw + off;
      const y = row * bh;
      const t = rng();
      g.fillStyle = `rgb(${165 + t * 40},${82 + t * 25},${52 + t * 18})`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(x + 2, y + bh - 7, bw - 4, 5);
      // hollow-brick face grooves
      g.fillStyle = 'rgba(60,25,15,0.18)';
      g.fillRect(x + 8, y + 12, bw - 16, 2);
    }
  }
  const [n] = noiseCanvas(128, 128, rng, '#ffffff', '#6b6055', { octaves: 4, base: 4 });
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.35;
  g.drawImage(n, 0, 0, 512, 512);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return toTexture(c, { repeat: true });
}

/** Chain-link diamond mesh with alpha. */
export function createChainLinkTexture() {
  const [c, g] = canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#cfd3d2';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 32);
  g.lineTo(32, 0);
  g.lineTo(64, 32);
  g.lineTo(32, 64);
  g.closePath();
  g.stroke();
  g.strokeStyle = 'rgba(80,85,85,0.9)';
  g.lineWidth = 1;
  g.stroke();
  const t = toTexture(c, { repeat: true, aniso: 4 });
  return t;
}

export function createNetTexture() {
  const [c, g] = canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#f4f3ee';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 60, 60);
  const t = toTexture(c, { repeat: true, aniso: 4 });
  return t;
}

const ADS = [
  { text: 'AÇAÍ DO ZÉ', bg: '#5b1f6e', fg: '#f6c915' },
  { text: 'BORRACHARIA 24H', bg: '#f6c915', fg: '#141414' },
  { text: 'PADARIA ESTRELA', bg: '#c8102e', fg: '#ffffff' },
  { text: 'SUCO TROPICAL', bg: '#1f8a4c', fg: '#fff6d0' },
  { text: 'BAR DO TONHO', bg: '#1d4fa3', fg: '#f6c915' },
  { text: 'RUA 10 • FUTEBOL', bg: '#141414', fg: '#ff5a1f' },
];

/** Kickboard banner atlas: 6 rows of fictional local businesses, weathered. */
export function createBoardTexture(rng) {
  const W = 1024;
  const H = 1024;
  const [c, g] = canvas(W, H);
  const rowH = H / ADS.length;
  ADS.forEach((ad, i) => {
    const y = i * rowH;
    g.fillStyle = ad.bg;
    g.fillRect(0, y, W, rowH);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, y, W, rowH * 0.12);
    g.font = `900 ${Math.round(rowH * 0.58)}px "Arial Black", Impact, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = ad.fg;
    g.fillText(ad.text, W / 2, y + rowH * 0.54, W * 0.9);
    // Bolts at the panel joins.
    g.fillStyle = 'rgba(30,30,30,0.6)';
    for (const bx of [12, W - 12]) for (const by of [y + 12, y + rowH - 12]) g.fillRect(bx - 3, by - 3, 6, 6);
  });
  // Weathering: scuffs from ball impacts, rust, fading.
  for (let i = 0; i < 700; i += 1) {
    g.fillStyle = rng() < 0.5 ? `rgba(40,30,20,${rng() * 0.18})` : `rgba(240,235,225,${rng() * 0.12})`;
    g.beginPath();
    g.arc(rng() * W, rng() * H, 2 + rng() * 14, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 40; i += 1) {
    const x = rng() * W;
    const y = rng() * H;
    const grd = g.createLinearGradient(x, y, x, y + 60);
    grd.addColorStop(0, 'rgba(120,60,20,0.35)');
    grd.addColorStop(1, 'rgba(120,60,20,0)');
    g.fillStyle = grd;
    g.fillRect(x, y, 3 + rng() * 4, 60);
  }
  const t = toTexture(c);
  t.userData = { rows: ADS.length };
  return t;
}

const TAGS = ['CRAQUE', 'RUA', 'VILA', 'GOL!', 'ZN', '10', 'FÉ', 'PAZ', 'MORRO'];
const PALETTE = ['#ff5a1f', '#f6c915', '#1f8a4c', '#1d9bf0', '#e8338b', '#7b3fe4', '#00c2a8', '#ffffff'];

/** Graffiti mural: bubble lettering with outlines, highlights, drips and background shapes. */
export function createMuralTexture(rng, word) {
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W, H);
  // Painted background wall colour block.
  const bg = rng.pick(['#2a6f97', '#7b2d26', '#3b8b5a', '#d98e04', '#5a3d7a', '#c44536']);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // Background shapes: sun burst, waves, or leaves.
  const motif = Math.floor(rng() * 3);
  g.globalAlpha = 0.5;
  if (motif === 0) {
    g.fillStyle = '#f6c915';
    g.beginPath();
    g.arc(W * 0.78, H * 0.3, 110, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ff5a1f';
    g.lineWidth = 14;
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      g.beginPath();
      g.moveTo(W * 0.78 + Math.cos(a) * 130, H * 0.3 + Math.sin(a) * 130);
      g.lineTo(W * 0.78 + Math.cos(a) * 200, H * 0.3 + Math.sin(a) * 200);
      g.stroke();
    }
  } else if (motif === 1) {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 18;
    for (let k = 0; k < 4; k += 1) {
      g.beginPath();
      for (let x = 0; x <= W; x += 20) g.lineTo(x, H * (0.62 + k * 0.1) + Math.sin(x / 70 + k) * 20);
      g.stroke();
    }
  } else {
    for (let i = 0; i < 9; i += 1) {
      g.fillStyle = rng.pick(['#1f8a4c', '#00c2a8', '#9bd26b']);
      g.save();
      g.translate(rng() * W, rng() * H);
      g.rotate(rng() * Math.PI);
      g.beginPath();
      g.ellipse(0, 0, 120, 34, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  g.globalAlpha = 1;
  // Main piece.
  const text = word ?? rng.pick(TAGS);
  const fill = rng.pick(PALETTE);
  let outline = rng.pick(PALETTE);
  if (outline === fill) outline = '#141414';
  const size = Math.min(300, (W * 1.5) / Math.max(3, text.length));
  g.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(W / 2, H * 0.52);
  g.rotate(-0.06);
  g.lineJoin = 'round';
  g.lineWidth = 46;
  g.strokeStyle = '#141414';
  g.strokeText(text, 8, 10);
  g.lineWidth = 28;
  g.strokeStyle = outline;
  g.strokeText(text, 0, 0);
  const grd = g.createLinearGradient(0, -size / 2, 0, size / 2);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.25, fill);
  grd.addColorStop(1, fill);
  g.fillStyle = grd;
  g.fillText(text, 0, 0);
  g.restore();
  // Drips.
  for (let i = 0; i < 26; i += 1) {
    const x = W * 0.12 + rng() * W * 0.76;
    const y = H * 0.68 + rng() * 40;
    g.fillStyle = rng() < 0.5 ? fill : outline;
    g.fillRect(x, y, 4 + rng() * 4, 20 + rng() * 90);
  }
  // Tags over the top.
  g.font = 'italic 700 42px "Brush Script MT", cursive, sans-serif';
  for (let i = 0; i < 5; i += 1) {
    g.fillStyle = rng.pick(['#141414', '#ffffff', '#e8338b']);
    g.save();
    g.translate(rng() * W, rng() * H);
    g.rotate((rng() - 0.5) * 0.6);
    g.fillText(rng.pick(TAGS).toLowerCase(), 0, 0);
    g.restore();
  }
  // Weathering.
  const [n] = noiseCanvas(128, 64, rng, '#ffffff', '#8a8378', { octaves: 4, base: 4 });
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.45;
  g.drawImage(n, 0, 0, W, H);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return toTexture(c);
}

/** Crowd sprite atlas: 8 seated/standing fans with varied shirts and skin tones. */
export function createCrowdAtlas(rng) {
  const W = 1024;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const skins = ['#8d5524', '#c68642', '#e0ac69', '#5c3317', '#f1c27d', '#3d2314'];
  const shirts = ['#f6c915', '#1f8a4c', '#c8102e', '#1d4fa3', '#ffffff', '#ff5a1f', '#141414', '#e8338b'];
  for (let i = 0; i < 8; i += 1) {
    const x0 = i * 128 + 64;
    const skin = rng.pick(skins);
    const shirt = shirts[i % shirts.length];
    const armsUp = i % 3 === 0;
    // legs
    g.fillStyle = rng.pick(['#2b3a55', '#3a3a3a', '#5c4a32']);
    g.fillRect(x0 - 20, 170, 16, 80);
    g.fillRect(x0 + 4, 170, 16, 80);
    // torso
    g.fillStyle = shirt;
    g.beginPath();
    g.moveTo(x0 - 30, 90);
    g.quadraticCurveTo(x0, 80, x0 + 30, 90);
    g.lineTo(x0 + 26, 178);
    g.lineTo(x0 - 26, 178);
    g.closePath();
    g.fill();
    // arms
    g.strokeStyle = skin;
    g.lineWidth = 12;
    g.lineCap = 'round';
    g.beginPath();
    if (armsUp) {
      g.moveTo(x0 - 26, 96);
      g.lineTo(x0 - 44, 40);
      g.moveTo(x0 + 26, 96);
      g.lineTo(x0 + 44, 40);
    } else {
      g.moveTo(x0 - 28, 96);
      g.lineTo(x0 - 36, 160);
      g.moveTo(x0 + 28, 96);
      g.lineTo(x0 + 36, 160);
    }
    g.stroke();
    // head + hair
    g.fillStyle = skin;
    g.beginPath();
    g.arc(x0, 62, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1b120c';
    g.beginPath();
    g.arc(x0, 56, 21, Math.PI, Math.PI * 2);
    g.fill();
    if (i % 4 === 1) {
      g.fillStyle = shirt;
      g.fillRect(x0 - 24, 40, 48, 10); // cap
    }
  }
  const t = toTexture(c, { aniso: 4 });
  return t;
}
