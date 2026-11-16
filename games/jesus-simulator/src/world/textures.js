import * as THREE from 'three';
import { createRng } from '../core/rng.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function speckle(ctx, size, rng, count, alpha, light = 255, dark = 0) {
  for (let i = 0; i < count; i += 1) {
    const v = rng() < 0.5 ? light : dark;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rng()})`;
    const s = 1 + rng() * 2;
    ctx.fillRect(rng() * size, rng() * size, s, s);
  }
}

/** Light limestone ashlar: irregular courses, soft mortar, chalky speckle. Tiles every 2 m. */
export function limestoneTexture() {
  const size = 256;
  const [c, ctx] = canvas(size);
  const rng = createRng(11);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const rows = 6;
  const rowH = size / rows;
  for (let r = 0; r < rows; r += 1) {
    let x = -rng() * 40;
    while (x < size) {
      const w = 34 + rng() * 46;
      const shade = 225 + Math.floor(rng() * 30);
      ctx.fillStyle = `rgb(${shade},${shade - 3},${shade - 10})`;
      ctx.fillRect(x + 1.5, r * rowH + 1.5, w - 3, rowH - 3);
      // wrap horizontally so the texture tiles
      if (x + w > size) ctx.fillRect(x - size + 1.5, r * rowH + 1.5, w - 3, rowH - 3);
      x += w;
    }
  }
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(190,175,150,0.25)';
  for (let r = 0; r <= rows; r += 1) ctx.fillRect(0, r * rowH - 1.5, size, 3);
  ctx.globalCompositeOperation = 'source-over';
  speckle(ctx, size, rng, 2600, 0.18, 255, 120);
  return finish(c);
}

/** Warm wood planks with grain. Tiles every 1 m. */
export function woodTexture() {
  const size = 128;
  const [c, ctx] = canvas(size);
  const rng = createRng(23);
  const planks = 4;
  for (let p = 0; p < planks; p += 1) {
    const shade = 200 + Math.floor(rng() * 50);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, (p * size) / planks, size, size / planks);
    for (let g = 0; g < 9; g += 1) {
      ctx.strokeStyle = `rgba(90,60,30,${0.12 + rng() * 0.15})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const y = (p * size) / planks + rng() * (size / planks);
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.08 + g) * 1.6);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(60,35,15,0.45)';
    ctx.fillRect(0, (p * size) / planks, size, 1.5);
  }
  return finish(c);
}

/** Soft woven-cloth stripes for awnings, rugs and sashes (tinted by vertex colour). */
export function clothTexture() {
  const size = 128;
  const [c, ctx] = canvas(size);
  const rng = createRng(5);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,248,230,0.9)';
  for (let i = 0; i < 4; i += 1) ctx.fillRect(i * 32 + 18, 0, 10, size);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 4; i += 1) ctx.fillRect(i * 32, 0, 4, size);
  speckle(ctx, size, rng, 600, 0.12, 255, 60);
  return finish(c);
}

/** Greyscale high-frequency detail used to break up the terrain splat at close range. */
export function detailTexture() {
  const size = 256;
  const [c, ctx] = canvas(size);
  const rng = createRng(77);
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i += 1) {
    const v = Math.floor(80 + rng() * 120);
    ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
    const s = 1 + rng() * 3;
    ctx.fillRect(rng() * size, rng() * size, s, s);
  }
  for (let i = 0; i < 90; i += 1) {
    const v = Math.floor(70 + rng() * 60);
    ctx.fillStyle = `rgba(${v},${v},${v},0.25)`;
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, 2 + rng() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, { srgb: false });
}
