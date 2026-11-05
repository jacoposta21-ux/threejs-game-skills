import * as THREE from 'three';
import { createSeededRandom } from '../utils/random';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number) => void;

const cache = new Map<string, THREE.Texture>();
let anisotropy = 4;

export function setTextureAnisotropy(value: number): void {
  anisotropy = value;
}

export function canvasTexture(key: string, w: number, h: number, draw: Draw, options: { repeat?: [number, number]; color?: boolean } = {}): THREE.Texture {
  const cacheKey = `${key}|${options.repeat?.join(',') ?? ''}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const base = cache.get(`${key}|base`);
  let texture: THREE.Texture;
  if (base) {
    texture = base.clone();
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    draw(ctx, w, h, createSeededRandom(hash(key)));
    texture = new THREE.CanvasTexture(canvas);
    cache.set(`${key}|base`, texture);
  }
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  if (options.repeat) texture.repeat.set(options.repeat[0], options.repeat[1]);
  texture.colorSpace = options.color === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  cache.set(cacheKey, texture);
  return texture;
}

export function clearTextureCache(): void {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

/** Floor boards with grain, gaps and wear. */
export function woodPlanks(base: string, repeat: [number, number], boards = 6): THREE.Texture {
  return canvasTexture(`planks-${base}-${boards}`, 512, 512, (ctx, w, h, rng) => {
    const bw = w / boards;
    for (let i = 0; i < boards; i++) {
      const offset = rng() * h;
      for (let seg = -1; seg < 2; seg++) {
        const y0 = offset + seg * h * 0.62;
        ctx.fillStyle = shade(base, (rng() - 0.5) * 0.08);
        ctx.fillRect(i * bw, y0, bw, h * 0.62);
        // grain
        for (let g = 0; g < 26; g++) {
          ctx.strokeStyle = `rgba(30,16,8,${0.05 + rng() * 0.09})`;
          ctx.lineWidth = 0.6 + rng() * 1.6;
          ctx.beginPath();
          const x = i * bw + rng() * bw;
          ctx.moveTo(x, y0);
          ctx.bezierCurveTo(x + (rng() - 0.5) * 8, y0 + h * 0.2, x + (rng() - 0.5) * 8, y0 + h * 0.4, x + (rng() - 0.5) * 6, y0 + h * 0.62);
          ctx.stroke();
        }
        // knots
        if (rng() > 0.6) {
          const kx = i * bw + bw * (0.3 + rng() * 0.4);
          const ky = y0 + rng() * h * 0.5;
          for (let r = 7; r > 1; r -= 2) {
            ctx.strokeStyle = 'rgba(40,20,8,0.25)';
            ctx.beginPath();
            ctx.ellipse(kx, ky, r * 0.7, r * 1.6, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.fillStyle = 'rgba(10,5,2,0.7)';
        ctx.fillRect(i * bw, y0, bw, 2);
      }
      ctx.fillStyle = 'rgba(8,4,2,0.75)';
      ctx.fillRect(i * bw, 0, 2.5, h);
    }
    // scuffs
    for (let s = 0; s < 40; s++) {
      ctx.fillStyle = `rgba(255,240,220,${rng() * 0.03})`;
      ctx.fillRect(rng() * w, rng() * h, 20 + rng() * 60, 1 + rng() * 2);
    }
  }, { repeat });
}

/** Furniture wood grain (long continuous). */
export function woodGrain(base: string, repeat: [number, number] = [1, 1]): THREE.Texture {
  return canvasTexture(`grain-${base}`, 256, 256, (ctx, w, h, rng) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let g = 0; g < 70; g++) {
      ctx.strokeStyle = `rgba(25,12,5,${0.04 + rng() * 0.1})`;
      ctx.lineWidth = 0.5 + rng() * 1.8;
      ctx.beginPath();
      const y = rng() * h;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + (rng() - 0.5) * 10, w * 0.6, y + (rng() - 0.5) * 10, w, y + (rng() - 0.5) * 6);
      ctx.stroke();
    }
    for (let s = 0; s < 20; s++) {
      ctx.fillStyle = `rgba(255,230,200,${rng() * 0.04})`;
      ctx.fillRect(rng() * w, rng() * h, rng() * 40, 1);
    }
  }, { repeat });
}

export type WallpaperStyle = 'moons' | 'stripes' | 'damask' | 'boards';

export function wallpaper(style: WallpaperStyle, a: string, b: string, repeat: [number, number]): THREE.Texture {
  return canvasTexture(`wall-${style}-${a}-${b}`, 512, 512, (ctx, w, h, rng) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    if (style === 'moons') {
      // Hand-printed crescent moons and tiny stars on soft vertical bands.
      for (let x = 0; x < w; x += 64) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(x, 0, 32, h);
      }
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const x = col * 64 + (row % 2) * 32 + 16;
          const y = row * 64 + 20;
          ctx.fillStyle = b;
          if ((row + col) % 3 === 0) {
            ctx.beginPath();
            ctx.arc(x, y, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = a;
            ctx.beginPath();
            ctx.arc(x + 4, y - 3, 8, 0, Math.PI * 2);
            ctx.fill();
          } else {
            star(ctx, x, y, 4.5, b);
          }
        }
      }
    } else if (style === 'stripes') {
      for (let x = 0; x < w; x += 42) {
        ctx.fillStyle = b;
        ctx.fillRect(x, 0, 14, h);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x + 20, 0, 3, h);
      }
    } else if (style === 'damask') {
      ctx.strokeStyle = b;
      ctx.lineWidth = 2;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          const cx = col * 128 + (row % 2) * 64 + 64;
          const cy = row * 128 + 64;
          ctx.beginPath();
          ctx.ellipse(cx, cy, 22, 40, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx, cy - 50);
          ctx.quadraticCurveTo(cx + 30, cy, cx, cy + 50);
          ctx.quadraticCurveTo(cx - 30, cy, cx, cy - 50);
          ctx.stroke();
        }
      }
    } else {
      // vertical tongue-and-groove boards
      for (let x = 0; x < w; x += 64) {
        ctx.fillStyle = shade(a, (rng() - 0.5) * 0.06);
        ctx.fillRect(x, 0, 64, h);
        ctx.fillStyle = b;
        ctx.fillRect(x, 0, 3, h);
        for (let g = 0; g < 10; g++) {
          ctx.strokeStyle = `rgba(20,10,4,${0.05 + rng() * 0.07})`;
          ctx.beginPath();
          const gx = x + rng() * 64;
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx + (rng() - 0.5) * 6, h);
          ctx.stroke();
        }
      }
    }
    // age stains near the floor and random blotches
    const grad = ctx.createLinearGradient(0, h * 0.7, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(20,12,6,0.18)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    for (let s = 0; s < 12; s++) {
      ctx.fillStyle = `rgba(30,20,10,${rng() * 0.05})`;
      ctx.beginPath();
      ctx.arc(rng() * w, rng() * h, 10 + rng() * 40, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repeat });
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

export function tiles(a: string, b: string, grout: string, repeat: [number, number], checker = true): THREE.Texture {
  return canvasTexture(`tiles-${a}-${b}-${checker}`, 256, 256, (ctx, w, h, rng) => {
    const n = 4;
    const s = w / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const col = checker && (x + y) % 2 === 1 ? b : a;
        ctx.fillStyle = shade(col, (rng() - 0.5) * 0.04);
        ctx.fillRect(x * s, y * s, s, s);
        const g = ctx.createLinearGradient(x * s, y * s, x * s + s, y * s + s);
        g.addColorStop(0, 'rgba(255,255,255,0.06)');
        g.addColorStop(1, 'rgba(0,0,0,0.06)');
        ctx.fillStyle = g;
        ctx.fillRect(x * s, y * s, s, s);
        if (rng() > 0.85) {
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.moveTo(x * s + rng() * s, y * s);
          ctx.lineTo(x * s + rng() * s, y * s + s);
          ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = grout;
    ctx.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s, 0);
      ctx.lineTo(i * s, h);
      ctx.moveTo(0, i * s);
      ctx.lineTo(w, i * s);
      ctx.stroke();
    }
  }, { repeat });
}

export function fabricStripes(a: string, b: string, repeat: [number, number], stars = false): THREE.Texture {
  return canvasTexture(`fabric-${a}-${b}-${stars}`, 128, 128, (ctx, w, h, rng) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b;
    for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 12);
    if (stars) {
      for (let i = 0; i < 6; i++) star(ctx, rng() * w, rng() * h, 5, '#f2d18b');
    }
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rng() * 0.06})`;
      ctx.fillRect(rng() * w, rng() * h, 1, 2);
    }
  }, { repeat });
}

export function quilt(colors: string[], repeat: [number, number]): THREE.Texture {
  return canvasTexture(`quilt-${colors.join('')}`, 256, 256, (ctx, w, _h, rng) => {
    const n = 4;
    const s = w / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
        ctx.fillRect(x * s, y * s, s, s);
        if (rng() > 0.5) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          for (let d = 0; d < s; d += 10) ctx.fillRect(x * s + d, y * s, 3, s);
        } else {
          ctx.fillStyle = 'rgba(255,240,200,0.22)';
          star(ctx, x * s + s / 2, y * s + s / 2, s * 0.22, 'rgba(255,236,190,0.35)');
        }
        ctx.strokeStyle = 'rgba(255,245,220,0.5)';
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x * s + 3, y * s + 3, s - 6, s - 6);
        ctx.setLineDash([]);
      }
    }
  }, { repeat });
}

export function rug(a: string, b: string, c: string): THREE.Texture {
  return canvasTexture(`rug-${a}-${b}-${c}`, 512, 512, (ctx, w, h, rng) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    // Braided rug: many thin twisted rings in close tones.
    const tones = [a, b, a, c, a, b];
    for (let i = 0; i < 22; i++) {
      const col = tones[i % tones.length];
      const r = w * 0.48 - i * 10;
      if (r < 8) break;
      for (let k = 0; k < 90; k++) {
        const t0 = (k / 90) * Math.PI * 2;
        ctx.strokeStyle = shade(col, ((k % 2) - 0.5) * 0.08);
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, r, r, 0, t0, t0 + (Math.PI * 2) / 90 + 0.01);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 12; i++) {
      const a2 = (i / 12) * Math.PI * 2;
      star(ctx, w / 2 + Math.cos(a2) * 95, h / 2 + Math.sin(a2) * 95, 9, c);
    }
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(${rng() > 0.5 ? '255,255,255' : '0,0,0'},${rng() * 0.07})`;
      ctx.fillRect(rng() * w, rng() * h, 1, 2);
    }
  });
}

export function noiseRoughness(key: string, low: number, high: number, repeat: [number, number] = [1, 1]): THREE.Texture {
  return canvasTexture(`rough-${key}-${low}-${high}`, 128, 128, (ctx, w, h, rng) => {
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = Math.floor((low + (high - low) * rng()) * 255);
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat, color: false });
}

/** Child's crayon drawing on paper. */
export function crayonDrawing(kind: 'family' | 'firefly' | 'house' | 'storm' | 'grandpa'): THREE.Texture {
  return canvasTexture(`drawing-${kind}`, 256, 256, (ctx, w, h, rng) => {
    ctx.fillStyle = '#efe6cf';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120,100,60,0.08)';
    for (let i = 0; i < 300; i++) ctx.fillRect(rng() * w, rng() * h, 2, 2);
    const wobble = (x: number, y: number) => [x + (rng() - 0.5) * 3, y + (rng() - 0.5) * 3] as const;
    const line = (pts: [number, number][], color: string, width = 4) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const [wx, wy] = wobble(x, y);
        if (i === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      });
      ctx.stroke();
    };
    const circle = (x: number, y: number, r: number, color: string, fill = false) => {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(x, y, r * (0.9 + rng() * 0.2), r, 0, 0, Math.PI * 2);
      if (fill) ctx.fill();
      else ctx.stroke();
    };
    const person = (x: number, y: number, s: number, color: string) => {
      circle(x, y, 14 * s, color);
      line([[x, y + 14 * s], [x, y + 55 * s]], color);
      line([[x - 22 * s, y + 30 * s], [x + 22 * s, y + 30 * s]], color);
      line([[x, y + 55 * s], [x - 15 * s, y + 85 * s]], color);
      line([[x, y + 55 * s], [x + 15 * s, y + 85 * s]], color);
    };
    if (kind === 'family') {
      line([[10, 220], [246, 222]], '#5f8f3e', 6);
      person(70, 90, 1.3, '#3a4f9a');
      person(140, 130, 0.8, '#c0392b');
      circle(210, 50, 22, '#f2c230', true);
    } else if (kind === 'grandpa') {
      person(90, 80, 1.4, '#6b4a2b');
      line([[70, 80], [110, 80]], '#222', 3);
      circle(78, 74, 7, '#222');
      circle(102, 74, 7, '#222');
      person(170, 140, 0.75, '#c0392b');
      circle(190, 105, 9, '#f2a630', true);
      line([[186, 98], [178, 90]], '#7a5a2a', 2);
      line([[194, 98], [202, 90]], '#7a5a2a', 2);
    } else if (kind === 'firefly') {
      circle(128, 120, 50, '#f2a630', true);
      circle(128, 120, 30, '#ffe08a', true);
      line([[95, 80], [55, 40], [40, 90], [95, 95]], '#6f88b5', 4);
      line([[160, 80], [200, 40], [215, 90], [160, 95]], '#6f88b5', 4);
      line([[118, 70], [105, 30]], '#5a3a1a', 3);
      line([[138, 70], [150, 30]], '#5a3a1a', 3);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        line([[128 + Math.cos(a) * 62, 120 + Math.sin(a) * 62], [128 + Math.cos(a) * 85, 120 + Math.sin(a) * 85]], '#f2c230', 3);
      }
    } else if (kind === 'house') {
      line([[50, 220], [50, 110], [128, 50], [206, 110], [206, 220], [50, 220]], '#7a3b2e', 5);
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(110, 70, 36, 26);
      line([[110, 70], [146, 70], [146, 96], [110, 96], [110, 70]], '#333', 3);
      line([[90, 220], [90, 170], [120, 170], [120, 220]], '#333', 4);
      person(175, 150, 0.6, '#c0392b');
    } else {
      // storm: dark cloud with lightning and a tall dark scribble
      ctx.fillStyle = '#4b4f63';
      for (let i = 0; i < 6; i++) circle(50 + i * 30, 50 + (i % 2) * 10, 26, '#4b4f63', true);
      line([[120, 70], [100, 120], [130, 118], [105, 175]], '#f2c230', 6);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 3;
      for (let i = 0; i < 70; i++) {
        ctx.beginPath();
        ctx.moveTo(195 + (rng() - 0.5) * 18, 100 + rng() * 130);
        ctx.lineTo(195 + (rng() - 0.5) * 18, 100 + rng() * 130);
        ctx.stroke();
      }
      circle(195, 92, 12, '#111', true);
      line([[195, 92], [210, 72]], '#111', 3);
    }
  });
}

/** Letter/number for toy blocks. */
export function blockFace(label: string, bg: string, fg: string): THREE.Texture {
  return canvasTexture(`block-${label}-${bg}-${fg}`, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = fg;
    ctx.font = 'bold 80px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, h / 2 + 4);
  });
}

/** Paper note with handwriting lines. */
export function notePaper(seedKey: string, tint = '#efe3c4'): THREE.Texture {
  return canvasTexture(`note-${seedKey}`, 128, 160, (ctx, w, h, rng) => {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(40,40,90,0.55)';
    ctx.lineWidth = 1.4;
    for (let y = 22; y < h - 18; y += 12) {
      ctx.beginPath();
      let x = 12;
      ctx.moveTo(x, y);
      while (x < w - 14 - rng() * 30) {
        x += 3 + rng() * 5;
        ctx.lineTo(x, y + (rng() - 0.5) * 3);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,80,30,0.12)';
    ctx.beginPath();
    ctx.arc(w * 0.7, h * 0.8, 18, 0, Math.PI * 2);
    ctx.fill();
  });
}

export type GlyphKind = 'moon' | 'star' | 'bird' | 'flower' | 'key' | 'heart' | 'firefly' | 'arrow' | 'perch';
export const DIAL_GLYPHS: GlyphKind[] = ['moon', 'star', 'bird', 'flower', 'key', 'heart'];

/** White-on-transparent glyph, used for glow chalk and dials. */
export function glyph(kind: GlyphKind): THREE.Texture {
  return canvasTexture(`glyph-${kind}`, 128, 128, (ctx, w, h, rng) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.translate((rng() - 0.5) * 2, (rng() - 0.5) * 2);
    ctx.beginPath();
    switch (kind) {
      case 'moon':
        ctx.arc(cx, cy, 36, Math.PI * 0.3, Math.PI * 1.7);
        ctx.quadraticCurveTo(cx - 6, cy, cx + 36 * Math.cos(Math.PI * 0.3), cy + 36 * Math.sin(Math.PI * 0.3));
        ctx.stroke();
        break;
      case 'star':
        for (let i = 0; i <= 10; i++) {
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          const r = i % 2 === 0 ? 40 : 17;
          ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ctx.stroke();
        break;
      case 'bird':
        ctx.moveTo(cx - 42, cy);
        ctx.quadraticCurveTo(cx - 20, cy - 30, cx, cy + 4);
        ctx.quadraticCurveTo(cx + 20, cy - 30, cx + 42, cy);
        ctx.stroke();
        break;
      case 'flower':
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          ctx.moveTo(cx + Math.cos(a) * 30 + 12, cy + Math.sin(a) * 30);
          ctx.arc(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, 12, 0, Math.PI * 2);
        }
        ctx.moveTo(cx + 9, cy);
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'key':
        ctx.arc(cx - 22, cy, 16, 0, Math.PI * 2);
        ctx.moveTo(cx - 6, cy);
        ctx.lineTo(cx + 40, cy);
        ctx.moveTo(cx + 26, cy);
        ctx.lineTo(cx + 26, cy + 16);
        ctx.moveTo(cx + 36, cy);
        ctx.lineTo(cx + 36, cy + 12);
        ctx.stroke();
        break;
      case 'heart':
        ctx.moveTo(cx, cy + 34);
        ctx.bezierCurveTo(cx - 56, cy - 6, cx - 24, cy - 46, cx, cy - 16);
        ctx.bezierCurveTo(cx + 24, cy - 46, cx + 56, cy - 6, cx, cy + 34);
        ctx.stroke();
        break;
      case 'firefly':
        ctx.ellipse(cx, cy + 8, 14, 22, 0, 0, Math.PI * 2);
        ctx.moveTo(cx - 10, cy - 6);
        ctx.quadraticCurveTo(cx - 44, cy - 34, cx - 30, cy + 2);
        ctx.moveTo(cx + 10, cy - 6);
        ctx.quadraticCurveTo(cx + 44, cy - 34, cx + 30, cy + 2);
        ctx.moveTo(cx - 4, cy - 14);
        ctx.lineTo(cx - 12, cy - 38);
        ctx.moveTo(cx + 4, cy - 14);
        ctx.lineTo(cx + 12, cy - 38);
        ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.moveTo(cx + Math.cos(a) * 50, cy + 8 + Math.sin(a) * 50);
          ctx.lineTo(cx + Math.cos(a) * 58, cy + 8 + Math.sin(a) * 58);
        }
        ctx.stroke();
        break;
      case 'arrow':
        ctx.moveTo(cx - 40, cy);
        ctx.lineTo(cx + 36, cy);
        ctx.moveTo(cx + 14, cy - 20);
        ctx.lineTo(cx + 38, cy);
        ctx.lineTo(cx + 14, cy + 20);
        ctx.stroke();
        break;
      case 'perch':
        ctx.moveTo(cx - 30, cy + 30);
        ctx.lineTo(cx + 30, cy + 30);
        ctx.moveTo(cx, cy + 30);
        ctx.lineTo(cx, cy - 4);
        ctx.moveTo(cx + 14, cy - 18);
        ctx.arc(cx, cy - 18, 14, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * 22, cy - 18 + Math.sin(a) * 22);
          ctx.lineTo(cx + Math.cos(a) * 30, cy - 18 + Math.sin(a) * 30);
          ctx.stroke();
        }
        break;
    }
    ctx.restore();
  });
}

/** Radial soft sprite for glows, dust and light pools. */
export function softDot(): THREE.Texture {
  return canvasTexture('softdot', 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Faded photograph in a frame (silhouettes of a family). */
export function photo(kind: 'grandpa' | 'house' | 'child'): THREE.Texture {
  return canvasTexture(`photo-${kind}`, 128, 160, (ctx, w, h, rng) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#b9a585');
    g.addColorStop(1, '#6d5a42');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(40,28,18,0.85)';
    if (kind === 'grandpa') {
      ctx.beginPath();
      ctx.ellipse(64, 60, 22, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(28, 86, 72, 80);
      ctx.fillStyle = 'rgba(230,210,170,0.6)';
      ctx.beginPath();
      ctx.arc(56, 58, 5, 0, Math.PI * 2);
      ctx.arc(72, 58, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,200,90,0.9)';
      ctx.beginPath();
      ctx.arc(96, 110, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'house') {
      ctx.beginPath();
      ctx.moveTo(20, 140);
      ctx.lineTo(20, 70);
      ctx.lineTo(64, 34);
      ctx.lineTo(108, 70);
      ctx.lineTo(108, 140);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,220,140,0.7)';
      ctx.fillRect(56, 50, 16, 12);
    } else {
      ctx.beginPath();
      ctx.ellipse(50, 70, 26, 30, 0, 0, Math.PI * 2);
      ctx.ellipse(86, 100, 14, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(24, 98, 52, 60);
      ctx.fillRect(74, 114, 24, 46);
    }
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rng() * 0.08})`;
      ctx.fillRect(rng() * w, rng() * h, 1, 1);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.strokeRect(6, 6, w - 12, h - 12);
  });
}
