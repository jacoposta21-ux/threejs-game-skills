/** Palette and procedurally painted canvas textures (no image files). */
import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

export const PAL = {
  facades: [0xdba351, 0xc96a43, 0xdc9c8e, 0xf2c761, 0xf0dfbd, 0xe8b386, 0xe38f6c, 0xe7c27f],
  shutter: 0x6f9a72,
  shutterDark: 0x55805a,
  cream: 0xf3e6c8,
  stone: 0xe6d6b8,
  roof: 0xbc4f33,
  roofDark: 0x9c3d27,
  cobble: 0xc4ad98,
  slab: 0xd8ccb8,
  plaza: 0xdcc8a4,
  asphalt: 0x8a807a,
  grass: 0x8fae5a,
  garden: 0x7ea04d,
  water: 0x22b2b5,
  sky: 0x58a8e6,
  horizon: 0xf6b77e,
  scooter: 0xe2232a,
  door: 0x7a4a2c,
  glass: 0x2e3f52,
  iron: 0x2f3b33,
  white: 0xffffff,
  quay: 0xb9ab97,
};

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Ground atlas, 2x2 tiles of 256 px: 0 cobbles (sampietrini), 1 stone slabs, 2 asphalt, 3 grass.
 * Light, near-white detail so vertex colours carry the palette.
 */
export function groundAtlas(): Texture {
  const [c, g] = canvas(512, 512);
  const r = rand(7);
  // cobbles
  g.fillStyle = '#a39383';
  g.fillRect(0, 0, 256, 256);
  const n = 8;
  const s = 256 / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n + 1; x++) {
      const ox = (y % 2) * s * 0.5;
      const v = 212 + Math.floor(r() * 40);
      g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
      const px = x * s - ox + 2;
      const py = y * s + 2;
      g.beginPath();
      g.roundRect(px, py, s - 4, s - 4, 7);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.roundRect(px + 3, py + 3, s - 12, (s - 4) * 0.35, 5);
      g.fill();
    }
  // slabs
  g.fillStyle = '#a9a39a';
  g.fillRect(256, 0, 256, 256);
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      const v = 225 + Math.floor(r() * 25);
      g.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
      g.fillRect(256 + x * 128 + 3, y * 128 + 3, 122, 122);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(120,110,100,${0.05 + r() * 0.08})`;
        g.fillRect(256 + x * 128 + r() * 120, y * 128 + r() * 120, 2 + r() * 4, 2 + r() * 4);
      }
    }
  // asphalt
  g.fillStyle = '#d8d6d4';
  g.fillRect(0, 256, 256, 256);
  for (let k = 0; k < 2500; k++) {
    const v = 150 + Math.floor(r() * 105);
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(r() * 256, 256 + r() * 256, 2, 2);
  }
  // grass
  g.fillStyle = '#d6e0c4';
  g.fillRect(256, 256, 256, 256);
  for (let k = 0; k < 900; k++) {
    const v = r();
    g.strokeStyle = `rgba(${90 + v * 80},${140 + v * 60},${60 + v * 40},0.55)`;
    g.lineWidth = 2;
    const x = 256 + r() * 256;
    const y = 256 + r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 6, y - 6 - r() * 6);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = LinearMipmapLinearFilter;
  return t;
}

/** Terracotta coppi rows, tiles along U, rows along V (1 unit = 1 m). */
export function roofTexture(): Texture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#c9b8a8';
  g.fillRect(0, 0, 128, 128);
  const cols = 5;
  const rows = 4;
  const w = 128 / cols;
  const h = 128 / rows;
  const r = rand(3);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const v = 0.86 + r() * 0.16;
      const grd = g.createLinearGradient(x * w, 0, x * w + w, 0);
      grd.addColorStop(0, `rgb(${170 * v},${170 * v},${170 * v})`);
      grd.addColorStop(0.5, `rgb(${255 * v},${250 * v},${245 * v})`);
      grd.addColorStop(1, `rgb(${160 * v},${158 * v},${155 * v})`);
      g.fillStyle = grd;
      g.beginPath();
      g.roundRect(x * w + 1, y * h + 2, w - 2, h - 2, [w / 2, w / 2, 3, 3]);
      g.fill();
    }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Pizza box lid with an invented logo. */
export function boxLidTexture(): Texture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#fbf7ef';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#e8ded0';
  g.lineWidth = 6;
  g.strokeRect(10, 10, 236, 236);
  g.fillStyle = '#d7262c';
  g.beginPath();
  g.arc(128, 118, 74, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fbf7ef';
  g.beginPath();
  g.arc(128, 118, 60, 0, Math.PI * 2);
  g.fill();
  // wobble swirl
  g.strokeStyle = '#d7262c';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const x = 84 + i * 2.2;
    const y = 118 + Math.sin(i * 0.45) * 14;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.fillStyle = '#d7262c';
  g.font = 'bold 30px Fredoka, sans-serif';
  g.textAlign = 'center';
  g.fillText('WOBBLE', 128, 228);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function pizzaTexture(): Texture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#e0a458';
  g.beginPath();
  g.arc(64, 64, 63, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d9412b';
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.fill();
  const r = rand(11);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = '#fff4d6';
    g.beginPath();
    g.arc(30 + r() * 68, 30 + r() * 68, 6 + r() * 6, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 6; i++) {
    g.fillStyle = '#3f8a3a';
    g.beginPath();
    g.ellipse(30 + r() * 68, 30 + r() * 68, 6, 3, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function signTexture(text: string, bg = '#1f5c3a', fg = '#fbf3df'): Texture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(0, 0, 512, 128, 22);
  g.fill();
  g.strokeStyle = '#f2c761';
  g.lineWidth = 8;
  g.beginPath();
  g.roundRect(10, 10, 492, 108, 16);
  g.stroke();
  g.fillStyle = fg;
  g.font = 'bold 62px Fredoka, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Soft round sprite for particles. */
export function softDot(): Texture {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** Vertical gradient used for delivery beams. */
export function beamTexture(): Texture {
  const [c, g] = canvas(4, 128);
  const grd = g.createLinearGradient(0, 128, 0, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  return new CanvasTexture(c);
}

/** Cardboard side: cream with a red band so the stack reads at a glance. */
export function boxSideTexture(): Texture {
  const [c, g] = canvas(128, 32);
  g.fillStyle = '#f6efe2';
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#d7262c';
  g.fillRect(0, 11, 128, 10);
  g.fillStyle = '#e9dcc6';
  g.fillRect(0, 0, 128, 2);
  g.fillRect(0, 30, 128, 2);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
