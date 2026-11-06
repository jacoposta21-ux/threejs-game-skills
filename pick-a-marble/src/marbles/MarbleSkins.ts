import * as THREE from 'three';

export type SkinKind = 'solid' | 'metal' | 'glass' | 'neon' | 'pattern' | 'gradient' | 'special';

export interface MarbleSkin {
  id: string;
  name: string;
  kind: SkinKind;
  colors: string[];
  /** Coin price in the collection. 0 = owned from the start. */
  price: number;
  /** Extra requirement: player level, or a challenge reward. */
  level?: number;
  challenge?: string;
  pattern?: 'swirl' | 'stripes' | 'dots' | 'cateye' | 'galaxy' | 'lava' | 'rainbow' | 'earth' | 'checker';
}

export const KIND_LABEL: Record<SkinKind, string> = {
  solid: 'Solid',
  metal: 'Metallic',
  glass: 'Glass',
  neon: 'Neon',
  pattern: 'Pattern',
  gradient: 'Gradient',
  special: 'Special',
};

export const SKINS: MarbleSkin[] = [
  { id: 'ruby', name: 'Ruby', kind: 'solid', colors: ['#e63946'], price: 0 },
  { id: 'ocean', name: 'Ocean', kind: 'solid', colors: ['#1d77d6'], price: 0 },
  { id: 'lime', name: 'Lime', kind: 'solid', colors: ['#6fd16b'], price: 0 },
  { id: 'sunny', name: 'Sunny', kind: 'solid', colors: ['#ffd60a'], price: 0 },
  { id: 'grape', name: 'Grape', kind: 'solid', colors: ['#7b2cbf'], price: 0 },
  { id: 'tangerine', name: 'Tangerine', kind: 'solid', colors: ['#ff7f11'], price: 0 },
  { id: 'bubblegum', name: 'Bubblegum', kind: 'solid', colors: ['#ff7eb6'], price: 0 },
  { id: 'snow', name: 'Snowball', kind: 'solid', colors: ['#f4f6fb'], price: 0 },
  { id: 'coal', name: 'Coal', kind: 'solid', colors: ['#2a2a33'], price: 0 },
  { id: 'teal', name: 'Teal', kind: 'solid', colors: ['#14b8a6'], price: 0 },
  { id: 'cherry_stripe', name: 'Candy Cane', kind: 'pattern', colors: ['#ffffff', '#e63946'], price: 0, pattern: 'stripes' },
  { id: 'cateye_blue', name: "Cat's Eye", kind: 'pattern', colors: ['#bfe9ff', '#1d77d6'], price: 0, pattern: 'cateye' },
  { id: 'silver', name: 'Silver Bullet', kind: 'metal', colors: ['#d7dde6'], price: 120 },
  { id: 'copper', name: 'Copper', kind: 'metal', colors: ['#c8743d'], price: 120 },
  { id: 'chrome_blue', name: 'Chrome Blue', kind: 'metal', colors: ['#4c8dff'], price: 160 },
  { id: 'gold', name: 'Golden Champ', kind: 'metal', colors: ['#ffc83d'], price: 0, challenge: 'c8' },
  { id: 'aqua_glass', name: 'Aqua Glass', kind: 'glass', colors: ['#7fe7ff', '#00a6d6'], price: 140 },
  { id: 'rose_glass', name: 'Rose Glass', kind: 'glass', colors: ['#ffb3c7', '#ff3d7f'], price: 140 },
  { id: 'crystal', name: 'Crystal', kind: 'glass', colors: ['#ffffff', '#c9d6ff'], price: 180, level: 3 },
  { id: 'neon_pink', name: 'Neon Pink', kind: 'neon', colors: ['#ff2bd6'], price: 200, level: 2 },
  { id: 'neon_green', name: 'Neon Lime', kind: 'neon', colors: ['#3dff6e'], price: 200, level: 2 },
  { id: 'neon_cyan', name: 'Neon Cyan', kind: 'neon', colors: ['#18f0ff'], price: 200, level: 4 },
  { id: 'swirl', name: 'Swirl', kind: 'pattern', colors: ['#ffbe0b', '#3a86ff'], price: 150, pattern: 'swirl' },
  { id: 'polka', name: 'Polka Dot', kind: 'pattern', colors: ['#ff5d8f', '#ffffff'], price: 150, pattern: 'dots' },
  { id: 'cateye_green', name: 'Jungle Eye', kind: 'pattern', colors: ['#d9ffcf', '#1f9e3a'], price: 160, pattern: 'cateye' },
  { id: 'checkers', name: 'Checkmate', kind: 'pattern', colors: ['#111111', '#ffffff'], price: 0, challenge: 'c5', pattern: 'checker' },
  { id: 'sunset', name: 'Sunset', kind: 'gradient', colors: ['#ff4e50', '#f9d423'], price: 180 },
  { id: 'aurora', name: 'Aurora', kind: 'gradient', colors: ['#00c9a7', '#845ec2'], price: 180, level: 3 },
  { id: 'mintberry', name: 'Mint Berry', kind: 'gradient', colors: ['#7affd0', '#ff4f9a'], price: 180 },
  { id: 'galaxy', name: 'Galaxy', kind: 'special', colors: ['#120c3d', '#7b2cbf', '#ffffff'], price: 400, level: 5, pattern: 'galaxy' },
  { id: 'lava', name: 'Lava Core', kind: 'special', colors: ['#2b0a00', '#ff5400', '#ffd000'], price: 0, challenge: 'c10', pattern: 'lava' },
  { id: 'rainbow', name: 'Rainbow', kind: 'special', colors: ['#ff0000'], price: 500, level: 6, pattern: 'rainbow' },
  { id: 'earth', name: 'Tiny Planet', kind: 'special', colors: ['#1e6fd9', '#3cb043', '#ffffff'], price: 0, challenge: 'c12', pattern: 'earth' },
];

export const SKIN_MAP = new Map(SKINS.map((s) => [s.id, s]));

export function getSkin(id: string): MarbleSkin {
  return SKIN_MAP.get(id) ?? SKINS[0];
}

/* ------------------------------------------------------------ textures */

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d ctx');
  return [c, ctx];
}

function hashRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function skinTexture(skin: MarbleSkin): THREE.CanvasTexture | null {
  const W = 256;
  const H = 128;
  const [cv, c] = makeCanvas(W, H);
  const rnd = hashRand(skin.id.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const [a, b, d] = skin.colors;
  if (skin.kind === 'gradient') {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  } else if (skin.pattern === 'stripes') {
    c.fillStyle = a;
    c.fillRect(0, 0, W, H);
    c.fillStyle = b;
    for (let i = -8; i < 16; i += 1) {
      c.beginPath();
      c.moveTo(i * 32, 0);
      c.lineTo(i * 32 + 14, 0);
      c.lineTo(i * 32 + 14 + 64, H);
      c.lineTo(i * 32 + 64, H);
      c.fill();
    }
  } else if (skin.pattern === 'dots') {
    c.fillStyle = a;
    c.fillRect(0, 0, W, H);
    c.fillStyle = b;
    for (let y = 8; y < H; y += 24)
      for (let x = (y / 24) % 2 ? 12 : 0; x < W; x += 24) {
        c.beginPath();
        c.ellipse(x, y, 7, 7 * (0.6 + 0.8 * Math.sin((y / H) * Math.PI)), 0, 0, Math.PI * 2);
        c.fill();
      }
  } else if (skin.pattern === 'checker') {
    for (let y = 0; y < 8; y += 1)
      for (let x = 0; x < 16; x += 1) {
        c.fillStyle = (x + y) % 2 ? a : b;
        c.fillRect(x * 16, y * 16, 16, 16);
      }
  } else if (skin.pattern === 'swirl') {
    c.fillStyle = a;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = b;
    c.lineWidth = 10;
    for (let k = 0; k < 4; k += 1) {
      c.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const y = H / 2 + Math.sin((x / W) * Math.PI * 4 + k * 1.6) * (H * 0.35);
        if (x === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  } else if (skin.pattern === 'cateye') {
    c.fillStyle = a;
    c.fillRect(0, 0, W, H);
    c.fillStyle = b;
    for (let i = 0; i < 4; i += 1) {
      const x0 = (i * W) / 4;
      c.beginPath();
      c.moveTo(x0 + 10, H / 2);
      c.quadraticCurveTo(x0 + W / 8, 4, x0 + W / 4 - 10, H / 2);
      c.quadraticCurveTo(x0 + W / 8, H - 4, x0 + 10, H / 2);
      c.fill();
    }
  } else if (skin.pattern === 'galaxy') {
    c.fillStyle = a;
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i += 1) {
      const g = c.createRadialGradient(rnd() * W, rnd() * H, 0, rnd() * W, rnd() * H, 30 + rnd() * 40);
      g.addColorStop(0, `${b}cc`);
      g.addColorStop(1, `${b}00`);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }
    c.fillStyle = d;
    for (let i = 0; i < 160; i += 1) c.fillRect(rnd() * W, rnd() * H, rnd() < 0.1 ? 2 : 1, 1);
  } else if (skin.pattern === 'lava') {
    c.fillStyle = a;
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i += 1) {
      c.strokeStyle = i % 3 ? b : d;
      c.lineWidth = 2 + rnd() * 4;
      c.beginPath();
      let x = rnd() * W;
      let y = rnd() * H;
      c.moveTo(x, y);
      for (let k = 0; k < 6; k += 1) {
        x += (rnd() - 0.5) * 40;
        y += (rnd() - 0.5) * 30;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  } else if (skin.pattern === 'rainbow') {
    const g = c.createLinearGradient(0, 0, W, 0);
    ['#ff0040', '#ff8c00', '#ffe600', '#2bd96b', '#1e90ff', '#8a2be2', '#ff0040'].forEach((col, i) => g.addColorStop(i / 6, col));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  } else if (skin.pattern === 'earth') {
    c.fillStyle = a;
    c.fillRect(0, 0, W, H);
    c.fillStyle = b;
    for (let i = 0; i < 9; i += 1) {
      c.beginPath();
      const x = rnd() * W;
      const y = 20 + rnd() * (H - 40);
      for (let k = 0; k < 10; k += 1) {
        const ang = (k / 10) * Math.PI * 2;
        const r = 10 + rnd() * 18;
        c.lineTo(x + Math.cos(ang) * r * 1.4, y + Math.sin(ang) * r);
      }
      c.fill();
    }
    c.fillStyle = d;
    c.fillRect(0, 0, W, 10);
    c.fillRect(0, H - 10, W, 10);
  } else {
    return null;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

const matCache = new Map<string, THREE.Material>();

export function skinMaterial(skin: MarbleSkin): THREE.Material {
  const hit = matCache.get(skin.id);
  if (hit) return hit;
  const base = new THREE.Color(skin.colors[0]);
  let mat: THREE.Material;
  switch (skin.kind) {
    case 'metal':
      mat = new THREE.MeshPhysicalMaterial({ color: base, metalness: 1, roughness: 0.16, clearcoat: 0.6, envMapIntensity: 1.5 });
      break;
    case 'glass':
      mat = new THREE.MeshPhysicalMaterial({
        color: base,
        metalness: 0,
        roughness: 0.04,
        transparent: true,
        opacity: 0.42,
        clearcoat: 1,
        envMapIntensity: 2.2,
        specularIntensity: 1,
      });
      break;
    case 'neon':
      mat = new THREE.MeshStandardMaterial({ color: base, emissive: base, emissiveIntensity: 1.25, roughness: 0.3 });
      break;
    default: {
      const map = skinTexture(skin);
      const special = skin.kind === 'special';
      const pm = new THREE.MeshPhysicalMaterial({
        color: map ? 0xffffff : base,
        roughness: 0.12,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        emissive: skin.pattern === 'lava' ? new THREE.Color('#ff4400') : skin.pattern === 'galaxy' ? new THREE.Color('#2a0f60') : new THREE.Color(0),
        emissiveIntensity: special ? 0.5 : 0,
      });
      if (map) pm.map = map;
      if (map && (skin.pattern === 'lava' || skin.pattern === 'galaxy')) pm.emissiveMap = map;
      mat = pm;
    }
  }
  matCache.set(skin.id, mat);
  return mat;
}

/** Inner core for glass and cat's-eye marbles. */
export function skinCoreMaterial(skin: MarbleSkin): THREE.Material | null {
  if (skin.kind !== 'glass') return null;
  const key = `${skin.id}-core`;
  const hit = matCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ color: skin.colors[1] ?? skin.colors[0], emissive: skin.colors[1] ?? skin.colors[0], emissiveIntensity: 0.35, roughness: 0.4 });
  matCache.set(key, m);
  return m;
}

/** CSS preview for UI swatches. */
export function skinCss(skin: MarbleSkin): string {
  const [a, b, c] = skin.colors;
  switch (skin.kind) {
    case 'metal':
      return `radial-gradient(circle at 32% 28%, #fff 0 8%, ${a} 30%, #1d1f26 95%)`;
    case 'glass':
      return `radial-gradient(circle at 32% 28%, #fff 0 8%, ${a}aa 30%, ${b} 60%, ${a}66 90%)`;
    case 'neon':
      return `radial-gradient(circle at 35% 30%, #fff 0 10%, ${a} 40%, ${a}88 90%)`;
    case 'gradient':
      return `radial-gradient(circle at 32% 28%, #ffffffcc 0 8%, transparent 22%), linear-gradient(160deg, ${a}, ${b})`;
    case 'pattern':
      if (skin.pattern === 'stripes') return `radial-gradient(circle at 32% 28%, #ffffffcc 0 8%, transparent 22%), repeating-linear-gradient(45deg, ${a} 0 6px, ${b} 6px 12px)`;
      if (skin.pattern === 'dots') return `radial-gradient(circle at 32% 28%, #ffffffcc 0 8%, transparent 22%), radial-gradient(${b} 25%, transparent 27%) 0 0/8px 8px, ${a}`;
      if (skin.pattern === 'checker') return `radial-gradient(circle at 32% 28%, #ffffff99 0 8%, transparent 22%), repeating-conic-gradient(${a} 0 25%, ${b} 0 50%) 0 0/10px 10px`;
      if (skin.pattern === 'cateye') return `radial-gradient(circle at 32% 28%, #fff 0 8%, transparent 22%), radial-gradient(ellipse 18% 46% at 50% 50%, ${b} 90%, transparent 100%), ${a}`;
      return `radial-gradient(circle at 32% 28%, #ffffffcc 0 8%, transparent 22%), conic-gradient(${a}, ${b}, ${a}, ${b}, ${a})`;
    case 'special':
      if (skin.pattern === 'rainbow') return `radial-gradient(circle at 32% 28%, #ffffffcc 0 8%, transparent 22%), conic-gradient(#ff0040, #ff8c00, #ffe600, #2bd96b, #1e90ff, #8a2be2, #ff0040)`;
      if (skin.pattern === 'earth') return `radial-gradient(circle at 32% 28%, #ffffffcc 0 8%, transparent 22%), radial-gradient(circle at 30% 60%, ${b} 18%, transparent 20%), radial-gradient(circle at 70% 35%, ${b} 14%, transparent 16%), ${a}`;
      if (skin.pattern === 'lava') return `radial-gradient(circle at 32% 28%, #ffd000 0 10%, ${b} 35%, ${a} 90%)`;
      return `radial-gradient(circle at 32% 28%, #fff 0 4%, ${b} 25%, ${a} 80%)`;
    default:
      return `radial-gradient(circle at 32% 28%, #ffffffdd 0 8%, ${a} 34%, ${shade(a)} 100%)`;
  }
  void c;
}

function shade(hex: string): string {
  const col = new THREE.Color(hex);
  col.multiplyScalar(0.55);
  return `#${col.getHexString()}`;
}
