import * as THREE from 'three';
import { createSeededRandom } from '../utils/random';

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [canvas, ctx];
}

/** Draw a shape at all wrap-around offsets so the texture tiles seamlessly. */
function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void): void {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      const px = x + ox;
      const py = y + oy;
      if (px > -r && px < size + r && py > -r && py < size + r) draw(px, py);
    }
  }
}

function grey(v: number): string {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${c},${c},${c})`;
}

/**
 * Ground detail atlas, one pattern per channel:
 *   R — organic grain shared by every surface
 *   G — cobbles (stone path)
 *   B — leaf litter (wet leaves)
 */
export function createGroundDetail(): THREE.CanvasTexture {
  const size = 512;
  const rng = createSeededRandom(77);
  const [grain, g] = makeCanvas(size);
  g.fillStyle = grey(0.5);
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 2 + rng() * rng() * 22;
    g.fillStyle = `rgba(${rng() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rng() * 0.08})`;
    wrapped(size, x, y, r, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, r, r * (0.4 + rng() * 0.6), rng() * Math.PI, 0, Math.PI * 2);
      g.fill();
    });
  }

  const [cobble, c] = makeCanvas(size);
  c.fillStyle = grey(0.28);
  c.fillRect(0, 0, size, size);
  const cell = size / 7;
  for (let gy = 0; gy < 7; gy += 1) {
    for (let gx = 0; gx < 7; gx += 1) {
      const x = (gx + 0.5 + (rng() - 0.5) * 0.35 + (gy % 2) * 0.5) * cell;
      const y = (gy + 0.5 + (rng() - 0.5) * 0.35) * cell;
      const rx = cell * (0.4 + rng() * 0.1);
      const ry = cell * (0.36 + rng() * 0.1);
      const rot = rng() * Math.PI;
      const tone = 0.62 + rng() * 0.36;
      wrapped(size, x, y, cell, (px, py) => {
        const grad = c.createRadialGradient(px - rx * 0.25, py - ry * 0.25, 2, px, py, rx * 1.1);
        grad.addColorStop(0, grey(tone + 0.08));
        grad.addColorStop(0.75, grey(tone - 0.05));
        grad.addColorStop(1, grey(tone - 0.22));
        c.fillStyle = grad;
        c.beginPath();
        c.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2);
        c.fill();
      });
    }
  }

  const [leaves, l] = makeCanvas(size);
  l.fillStyle = grey(0.32);
  l.fillRect(0, 0, size, size);
  for (let i = 0; i < 420; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 20 + rng() * 26;
    const rot = rng() * Math.PI * 2;
    const tone = 0.3 + rng() * 0.7;
    wrapped(size, x, y, len, (px, py) => {
      l.save();
      l.translate(px, py);
      l.rotate(rot);
      l.fillStyle = grey(tone);
      l.beginPath();
      l.moveTo(-len, 0);
      l.quadraticCurveTo(0, -len * 0.55, len, 0);
      l.quadraticCurveTo(0, len * 0.55, -len, 0);
      l.fill();
      l.strokeStyle = grey(tone - 0.2);
      l.lineWidth = 1.5;
      l.beginPath();
      l.moveTo(-len, 0);
      l.lineTo(len, 0);
      l.stroke();
      l.restore();
    });
  }

  const [out, o] = makeCanvas(size);
  const a = g.getImageData(0, 0, size, size).data;
  const b = c.getImageData(0, 0, size, size).data;
  const d = l.getImageData(0, 0, size, size).data;
  const img = o.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = a[i];
    img.data[i + 1] = b[i];
    img.data[i + 2] = d[i];
    img.data[i + 3] = 255;
  }
  o.putImageData(img, 0, 0);
  void grain;
  void cobble;
  void leaves;
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createWoodTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256);
  const rng = createSeededRandom(5);
  ctx.fillStyle = '#d9b27c';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i += 1) {
    const y = rng() * 256;
    ctx.strokeStyle = `rgba(${rng() > 0.5 ? '120,78,40' : '255,236,200'},${0.08 + rng() * 0.18})`;
    ctx.lineWidth = 1 + rng() * 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y + (rng() - 0.5) * 14, 170, y + (rng() - 0.5) * 14, 256, y);
    ctx.stroke();
  }
  for (let i = 0; i < 4; i += 1) {
    const x = rng() * 256;
    const y = rng() * 256;
    ctx.strokeStyle = 'rgba(110,70,36,0.5)';
    ctx.lineWidth = 2;
    for (let r = 3; r < 12; r += 3) {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createBarkTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256);
  const rng = createSeededRandom(9);
  ctx.fillStyle = '#7a5334';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i += 1) {
    const x = rng() * 256;
    ctx.strokeStyle = `rgba(${rng() > 0.55 ? '48,28,16' : '170,124,82'},${0.15 + rng() * 0.3})`;
    ctx.lineWidth = 1 + rng() * 5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (rng() - 0.5) * 26, 90, x + (rng() - 0.5) * 26, 170, x, 256);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRippleTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256);
  const rng = createSeededRandom(21);
  ctx.fillStyle = '#58bdf0';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 46; i += 1) {
    const x = rng() * 256;
    const y = rng() * 256;
    const r = 10 + rng() * 26;
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + rng() * 0.3})`;
    ctx.lineWidth = 1.5 + rng() * 2.5;
    wrapped(256, x, y, r * 2, (px, py) => {
      ctx.beginPath();
      ctx.ellipse(px, py, r * 1.7, r * 0.7, 0, rng() * 2, rng() * 2 + 2.6);
      ctx.stroke();
    });
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCheckerTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      ctx.fillStyle = (x + y) % 2 ? '#1f2430' : '#ffffff';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

export function createBannerTexture(text: string, bg: string, fg: string, checker = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 192);
  if (checker) {
    for (let x = 0; x < 64; x += 1) {
      for (let y = 0; y < 2; y += 1) {
        ctx.fillStyle = (x + y) % 2 ? '#1f2430' : '#ffffff';
        ctx.fillRect(x * 16, y * 16, 16, 16);
        ctx.fillRect(x * 16, 160 + y * 16, 16, 16);
      }
    }
  }
  ctx.font = '900 112px "Lilita One", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.strokeText(text, 512, 100);
  ctx.fillStyle = fg;
  ctx.fillText(text, 512, 100);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createSoftSprite(inner: string, outer: string): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128);
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createNameTag(name: string, color: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.font = '900 34px "Fredoka", "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(244, ctx.measureText(name).width + 36);
  ctx.fillStyle = 'rgba(20,28,20,0.62)';
  ctx.beginPath();
  ctx.roundRect(128 - w / 2, 8, w, 48, 24);
  ctx.fill();
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.beginPath();
  ctx.arc(128 - w / 2 + 20, 32, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, 128 + 10, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Tiling chevrons for boost pads (points along +V). */
export function createChevronTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const grad = ctx.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(255,120,20,0.0)');
  grad.addColorStop(0.12, 'rgba(255,140,30,0.85)');
  grad.addColorStop(0.5, 'rgba(255,190,40,0.9)');
  grad.addColorStop(0.88, 'rgba(255,140,30,0.85)');
  grad.addColorStop(1, 'rgba(255,120,20,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#fffbe0';
  ctx.lineWidth = 16;
  ctx.lineJoin = 'miter';
  for (const y of [-64, 0, 64, 128]) {
    ctx.beginPath();
    ctx.moveTo(24, y + 16);
    ctx.lineTo(64, y + 56);
    ctx.lineTo(104, y + 16);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
