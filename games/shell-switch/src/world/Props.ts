import * as THREE from 'three';
import type { KitBuilder } from './GeoBuilder';
import type { CollisionWorld } from './Collision';
import { PALETTE as P } from './Materials';

/** Reusable static prop kit. Everything merges into the district's kit. */
export class Props {
  constructor(
    readonly k: KitBuilder,
    readonly col: CollisionWorld,
  ) {}

  tree(x: number, z: number, s = 1, variant = 0): void {
    const w = this.k.world;
    const trunk = variant % 2 ? '#8a5a3c' : '#7d5130';
    w.cyl(x, 0, z, 0.14 * s, 0.22 * s, 1.4 * s, trunk, 6);
    const greens = ['#5aa652', '#7cc56b', '#4f9a5a', '#8fd17a'];
    if (variant === 2) {
      // Conifer.
      for (let i = 0; i < 3; i += 1) w.cone(x, 1.0 * s + i * 0.8 * s, z, (1.3 - i * 0.32) * s, 1.3 * s, greens[(i + variant) % 4], 7);
    } else {
      w.add(new THREE.IcosahedronGeometry(1.25 * s, 0), greens[variant % 4], { x, y: 2.3 * s, z, sy: 0.9 });
      w.add(new THREE.IcosahedronGeometry(0.8 * s, 0), greens[(variant + 1) % 4], { x: x + 0.6 * s, y: 2.9 * s, z: z - 0.2 * s });
      w.add(new THREE.IcosahedronGeometry(0.7 * s, 0), greens[(variant + 2) % 4], { x: x - 0.55 * s, y: 2.7 * s, z: z + 0.35 * s });
    }
    this.col.box(x, 0, z, 0.5 * s, 2, 0.5 * s);
  }

  bush(x: number, z: number, s = 1, color = '#6bbb5e'): void {
    this.k.world.add(new THREE.IcosahedronGeometry(0.6 * s, 0), color, { x, y: 0.4 * s, z, sy: 0.75 });
    this.k.world.add(new THREE.IcosahedronGeometry(0.4 * s, 0), '#8fd17a', { x: x + 0.35 * s, y: 0.5 * s, z: z + 0.1 });
  }

  flowers(x: number, z: number, w: number, d: number, seed = 0): void {
    const k = this.k.world;
    k.block(x, 0, z, w, 0.35, d, '#8a5a3c');
    k.block(x, 0.35, z, w - 0.15, 0.06, d - 0.15, '#5aa652');
    const cols = ['#ff6fb5', '#ffe27a', '#ffffff', '#ff7b6b', '#b79cf0'];
    let i = seed;
    for (let fx = -w / 2 + 0.3; fx < w / 2 - 0.2; fx += 0.45) {
      for (let fz = -d / 2 + 0.3; fz < d / 2 - 0.2; fz += 0.45) {
        i += 1;
        k.sphere(x + fx, 0.5, z + fz, 0.12, cols[i % cols.length], 5, 4);
      }
    }
    this.col.box(x, 0, z, w, 0.45, d);
  }

  lamp(x: number, z: number, h = 3.6, color = '#2d3a6b'): void {
    const k = this.k;
    k.metal.cyl(x, 0, z, 0.08, 0.12, h, color, 6);
    k.metal.cyl(x, 0, z, 0.2, 0.22, 0.25, color, 8);
    k.metal.cyl(x, h, z, 0.2, 0.12, 0.12, color, 8);
    k.glow.sphere(x, h + 0.3, z, 0.24, '#fff0b8', 8, 6);
    k.metal.cone(x, h + 0.5, z, 0.26, 0.22, color, 8);
    this.col.box(x, 0, z, 0.3, h, 0.3);
  }

  bench(x: number, z: number, ry = 0, color = P.wood): void {
    const w = this.k.world;
    w.push({ x, z, ry });
    w.block(0, 0.42, 0, 1.8, 0.1, 0.5, color);
    w.block(0, 0.6, -0.24, 1.8, 0.45, 0.08, color);
    for (const sx of [-0.75, 0.75]) {
      w.block(sx, 0, 0, 0.08, 0.42, 0.45, '#2a2238');
      w.block(sx, 0.5, -0.24, 0.08, 0.5, 0.06, '#2a2238');
    }
    w.pop();
    const along = Math.abs(Math.sin(ry)) > 0.5;
    this.col.box(x, 0, z, along ? 0.6 : 1.9, 0.52, along ? 1.9 : 0.6);
  }

  bin(x: number, z: number, color = '#4fb06a'): void {
    this.k.world.cyl(x, 0, z, 0.3, 0.26, 0.8, color, 8);
    this.k.world.cyl(x, 0.8, z, 0.33, 0.33, 0.08, '#2a2238', 8);
    this.col.box(x, 0, z, 0.6, 0.88, 0.6);
  }

  hydrant(x: number, z: number): void {
    const w = this.k.world;
    w.cyl(x, 0, z, 0.15, 0.18, 0.55, '#e2473f', 7);
    w.sphere(x, 0.6, z, 0.16, '#e2473f', 7, 5);
    w.cyl(x, 0.3, z, 0.07, 0.07, 0.45, '#e2473f', 6, { rz: Math.PI / 2 });
    this.col.box(x, 0, z, 0.4, 0.7, 0.4);
  }

  crateDecor(x: number, z: number, s = 1, color = P.wood, y = 0, collide = true): void {
    const w = this.k.world;
    w.block(x, y, z, s, s, s, color);
    w.block(x, y + s * 0.08, z, s * 1.02, s * 0.1, s * 1.02, '#7d5130');
    w.block(x, y + s * 0.82, z, s * 1.02, s * 0.1, s * 1.02, '#7d5130');
    if (collide) this.col.box(x, y, z, s, s, s);
  }

  suitcase(x: number, y: number, z: number, color: string, ry = 0): void {
    const w = this.k.world;
    w.push({ x, y, z, ry });
    w.block(0, 0, 0, 0.8, 0.55, 0.3, color);
    w.block(0, 0.55, 0, 0.3, 0.08, 0.08, '#2a2238');
    w.block(-0.2, 0, 0.16, 0.12, 0.55, 0.02, '#f2c14e');
    w.pop();
  }

  /** Building facade block with window grid, door and awning. */
  building(x: number, z: number, w: number, d: number, h: number, color: string, opts: { roof?: string; face?: 'n' | 's' | 'e' | 'w'; awning?: string; windows?: boolean; trim?: string; collide?: boolean } = {}): void {
    const k = this.k;
    const roof = opts.roof ?? P.brickDark;
    const trim = opts.trim ?? P.cream;
    k.world.block(x, 0, z, w, h, d, color);
    k.world.block(x, h, z, w + 0.3, 0.3, d + 0.3, trim);
    k.world.block(x, h + 0.3, z, w * 0.6, 0.8, d * 0.5, roof);
    // Rooftop details.
    k.world.block(x + w * 0.2, h + 0.3, z - d * 0.15, 0.8, 0.8, 0.8, '#a99c86');
    k.metal.cyl(x - w * 0.25, h + 0.3, z + d * 0.2, 0.25, 0.25, 0.9, '#d0d0d8', 8);
    if (opts.windows !== false) {
      const faces: ('n' | 's' | 'e' | 'w')[] = opts.face ? [opts.face] : ['n', 's', 'e', 'w'];
      for (const f of faces) this.windowGrid(x, z, w, d, h, f);
    }
    if (opts.awning && opts.face) {
      const [ox, oz, ry, len] = faceInfo(x, z, w, d, opts.face);
      k.world.push({ x: ox, z: oz, ry });
      for (let i = 0; i < 6; i += 1) {
        const sx = -len * 0.4 + (i / 5) * len * 0.8;
        k.world.add(new THREE.BoxGeometry(len * 0.8 / 6, 0.06, 1.1), i % 2 ? opts.awning : '#ffffff', { x: sx, y: 2.6, z: 0.5, rx: 0.35 });
      }
      k.world.block(0, 0, 0.03, 1.2, 2.1, 0.08, '#5a3a20');
      k.glow.box(0, 1.6, 0.08, 0.7, 0.5, 0.02, '#ffe7a8');
      k.world.pop();
    }
    if (opts.collide !== false) this.col.box(x, 0, z, w, h, d, 'none', true);
  }

  windowGrid(x: number, z: number, w: number, d: number, h: number, f: 'n' | 's' | 'e' | 'w'): void {
    const [ox, oz, ry, len] = faceInfo(x, z, w, d, f);
    const k = this.k;
    k.glow.push({ x: ox, z: oz, ry });
    k.world.push({ x: ox, z: oz, ry });
    const cols = Math.max(1, Math.floor(len / 2.2));
    const rows = Math.max(1, Math.floor((h - 1.2) / 2.4));
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const sx = -len / 2 + (c + 0.5) * (len / cols);
        const sy = 1.9 + r * 2.4;
        const lit = (c * 7 + r * 3 + Math.floor(x)) % 5 === 0;
        k.glow.box(sx, sy, 0.02, 0.9, 1.1, 0.05, lit ? '#ffe7a8' : '#8fb8d8');
        k.world.box(sx, sy - 0.62, 0.08, 1.1, 0.12, 0.16, '#fbf7ee');
        k.world.box(sx, sy, 0.05, 0.08, 1.1, 0.06, '#fbf7ee');
      }
    }
    k.glow.pop();
    k.world.pop();
  }

  /** Axis-aligned wall from (x0,z0) to (x1,z1). */
  wall(x0: number, z0: number, x1: number, z1: number, h: number, color: string, t = 0.5, trim?: string): void {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const w = Math.abs(x1 - x0) || t;
    const d = Math.abs(z1 - z0) || t;
    this.k.world.block(cx, 0, cz, w, h, d, color);
    if (trim) {
      this.k.world.block(cx, h, cz, w + 0.1, 0.18, d + 0.1, trim);
      this.k.world.block(cx, 0, cz, w + 0.08, 0.3, d + 0.08, trim);
    }
    if (h >= 3) {
      // Wainscot: darker lower panel, chair rail and evenly spaced pilasters give walls scale and craft.
      const dark = '#' + new THREE.Color(color).multiplyScalar(0.8).getHexString();
      const rail = trim ?? '#' + new THREE.Color(color).multiplyScalar(1.12).getHexString();
      const along = w >= d;
      this.k.world.block(cx, 0.3, cz, w + (along ? 0 : 0.06), 0.85, d + (along ? 0.06 : 0), dark);
      this.k.world.block(cx, 1.15, cz, w + (along ? 0 : 0.1), 0.1, d + (along ? 0.1 : 0), rail);
      this.k.world.block(cx, h - 0.55, cz, w + (along ? 0 : 0.08), 0.12, d + (along ? 0.08 : 0), rail);
      const len = along ? w : d;
      const n = Math.floor(len / 4);
      for (let i = 1; i < n; i += 1) {
        const o = -len / 2 + (i * len) / n;
        this.k.world.block(along ? cx + o : cx, 1.25, along ? cz : cz + o, along ? 0.28 : t + 0.12, h - 1.85, along ? t + 0.12 : 0.28, rail);
      }
    }
    this.col.box(cx, 0, cz, w, h + 0.2, d, 'none', h >= 2);
  }

  fence(x0: number, z0: number, x1: number, z1: number, color = '#fbf7ee', h = 1.0): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 0.6));
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      this.k.world.block(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.12, h, 0.12, color);
    }
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const ry = Math.atan2(x1 - x0, z1 - z0);
    this.k.world.add(new THREE.BoxGeometry(0.06, 0.1, len), color, { x: cx, y: h * 0.8, z: cz, ry });
    this.k.world.add(new THREE.BoxGeometry(0.06, 0.1, len), color, { x: cx, y: h * 0.35, z: cz, ry });
    const w = Math.abs(x1 - x0) || 0.3;
    const d = Math.abs(z1 - z0) || 0.3;
    this.col.box(cx, 0, cz, w, h + 0.5, d);
  }

  pillar(x: number, z: number, h: number, color = P.stone, r = 0.45): void {
    this.k.world.cyl(x, 0, z, r * 1.25, r * 1.25, 0.35, color, 10);
    this.k.world.cyl(x, 0.35, z, r, r, h - 0.7, color, 10);
    this.k.world.cyl(x, h - 0.35, z, r * 1.25, r * 1.25, 0.35, color, 10);
    this.col.box(x, 0, z, r * 2.2, h, r * 2.2, 'none', true);
  }

  planter(x: number, z: number, color = '#c8553d'): void {
    this.k.world.cyl(x, 0, z, 0.5, 0.4, 0.6, color, 8);
    this.bush(x, z, 0.8);
    this.col.box(x, 0, z, 1, 0.9, 1);
  }

  table(x: number, z: number, color = '#ffffff', umbrella?: string): void {
    const w = this.k.world;
    w.cyl(x, 0, z, 0.08, 0.2, 0.75, '#5a5770', 6);
    w.cyl(x, 0.75, z, 0.6, 0.6, 0.06, color, 10);
    for (const a of [0, Math.PI]) {
      w.block(x + Math.sin(a) * 0.95, 0, z + Math.cos(a) * 0.95, 0.4, 0.45, 0.4, '#5a5770');
    }
    if (umbrella) {
      w.cyl(x, 0.75, z, 0.03, 0.03, 1.5, '#ffffff', 5);
      w.cone(x, 2.2, z, 1.3, 0.5, umbrella, 8);
    }
    this.col.box(x, 0, z, 1.1, 0.8, 1.1);
  }

  sticker(x: number, y: number, z: number, w: number, h: number, ry: number, color: string): void {
    this.k.glow.add(new THREE.PlaneGeometry(w, h), color, { x, y, z, ry });
  }
}

/** Facade origin, facing yaw and length for a building face. */
export function faceInfo(x: number, z: number, w: number, d: number, f: 'n' | 's' | 'e' | 'w'): [number, number, number, number] {
  switch (f) {
    case 'n':
      return [x, z - d / 2 - 0.01, Math.PI, w];
    case 's':
      return [x, z + d / 2 + 0.01, 0, w];
    case 'e':
      return [x + w / 2 + 0.01, z, Math.PI / 2, d];
    case 'w':
      return [x - w / 2 - 0.01, z, -Math.PI / 2, d];
  }
}
