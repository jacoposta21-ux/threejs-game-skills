import * as THREE from 'three';

/**
 * The Backyard course, described entirely in track coordinates:
 *   s — distance along the centre line (world units)
 *   d — signed lateral offset, positive to the racer's right
 * Height, surface type, obstacles, AI gates and checkpoints are all functions
 * of (s, d), so physics, AI, rendering and race logic share one source of truth.
 */

export type Surface = 'grass' | 'dirt' | 'mud' | 'stone' | 'leaves' | 'wood' | 'water' | 'rough';

export interface SurfaceDef {
  /** Rolling resistance coefficient (multiplied by gravity). */
  roll: number;
  /** Steering grip multiplier. */
  grip: number;
  /** Crawl speed multiplier. */
  crawl: number;
  color: number;
  label: string;
}

export const SURFACES: Record<Surface, SurfaceDef> = {
  grass: { roll: 0.034, grip: 1.0, crawl: 1.0, color: 0x7cc152, label: 'Grass' },
  dirt: { roll: 0.027, grip: 1.0, crawl: 1.0, color: 0xb98a5a, label: 'Dirt' },
  mud: { roll: 0.13, grip: 0.8, crawl: 0.6, color: 0x6b4a2e, label: 'Mud' },
  stone: { roll: 0.011, grip: 1.1, crawl: 1.0, color: 0xa9adb3, label: 'Stone' },
  leaves: { roll: 0.015, grip: 0.55, crawl: 0.9, color: 0xd98a2b, label: 'Wet leaves' },
  wood: { roll: 0.02, grip: 0.95, crawl: 1.0, color: 0xc9995c, label: 'Wood' },
  water: { roll: 0.2, grip: 0.7, crawl: 0.5, color: 0x4aa6d8, label: 'Water' },
  rough: { roll: 0.12, grip: 0.8, crawl: 0.75, color: 0x4f9a3a, label: 'Tall grass' },
};

type Key = [number, number];

function keyed(keys: Key[], s: number): number {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    if (s <= keys[i][0]) {
      const [s0, v0] = keys[i - 1];
      const [s1, v1] = keys[i];
      return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0);
    }
  }
  return keys[keys.length - 1][1];
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const e = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
}

/** Height feature added on top of the base profile. */
interface Feature {
  s0: number;
  s1: number;
  water?: boolean;
  h(s: number, d: number): number;
}

interface Patch {
  s0: number;
  s1: number;
  d0: number;
  d1: number;
  surface: Surface;
  ellipse?: boolean;
}

export interface Obstacle {
  kind: 'root' | 'pebble' | 'mushroom' | 'post' | 'rail' | 'stump';
  a: THREE.Vector3;
  b: THREE.Vector3;
  r: number;
  bounce: number;
  s: number;
  d: number;
  /** Half-extent in d that AI should steer clear of (0 = AI ignores, handled by gates). */
  avoid: number;
}

/** A lateral window the AI should pass through between s0 and s1. */
export interface Gate {
  s0: number;
  s1: number;
  d0: number;
  d1: number;
  group?: string;
  option?: string;
}

export interface RootSpec {
  s: number;
  d0: number;
  d1: number;
  r: number;
  /** s offset of the d1 end relative to the d0 end (lets roots run diagonally / along the track). */
  skew: number;
}

/** Curvature layout: [length, total turn in degrees (+ = right)]. */
const LAYOUT: Key[] = [
  [150, 0], // 1 · Starting Hill            0 –  150
  [50, 0], //  2 · Leaf Slide             150 –  550
  [120, 75],
  [40, 0],
  [130, -95],
  [60, 0],
  [60, 0], //  3 · Root Maze              550 –  960
  [150, 80],
  [70, 0],
  [90, -40],
  [40, 0],
  [300, 0], // 4 · The Big Drop           960 – 1260
  [150, 70], // 5 · Final Sprint         1260 – 1960
  [30, 0],
  [120, -90],
  [30, 0],
  [100, 60],
  [270, 0],
];

/** Downhill slope in degrees keyed by s. */
const SLOPE: Key[] = [
  [0, 0],
  [21, 0],
  [46, 7.5],
  [150, 9],
  [200, 10],
  [320, 8],
  [450, 9],
  [550, 6],
  [600, 4.5],
  [656, 3],
  [672, -2.6],
  [698, -2.6],
  [716, 4],
  [860, 6],
  [960, 3.5],
  [1000, 2],
  [1022, 22],
  [1034, 30],
  [1080, 30],
  [1096, 12],
  [1122, 12],
  [1130, 22],
  [1218, 20],
  [1262, 6.5],
  [1300, 5.5],
  [1640, 5],
  [1700, 3.5],
  [1800, 2.5],
  [1860, 1],
  [1900, 0],
  [1960, -4],
];

const HALF_WIDTH: Key[] = [
  [0, 9],
  [150, 9.5],
  [360, 10],
  [550, 10.5],
  [620, 12],
  [770, 12],
  [900, 9],
  [918, 4.2],
  [960, 4.2],
  [978, 9],
  [1122, 9.5],
  [1137, 13],
  [1240, 12],
  [1280, 9.5],
  [1700, 9.5],
  [1740, 10.5],
  [1960, 10.5],
];

const BANK_GAIN: Key[] = [
  [0, 6],
  [1240, 6],
  [1270, 19],
  [1690, 19],
  [1720, 4],
];

const BERM: Key[] = [
  [0, 1.0],
  [140, 1.9],
  [900, 1.9],
  [915, 0.2],
  [962, 0.2],
  [980, 2.2],
  [1122, 2.2],
  [1132, 2.8],
  [1250, 2.6],
  [1270, 3.4],
  [1700, 3.4],
  [1730, 2.0],
  [1960, 2.0],
];

export const TRACK_EDGE = 22;
export const START_S = 22;
export const GRID_S = 14;
export const FINISH_S = 1862;

export const SECTIONS = [
  { name: 'Starting Hill', s0: 0, s1: 150 },
  { name: 'Leaf Slide', s0: 150, s1: 550 },
  { name: 'Root Maze', s0: 550, s1: 960 },
  { name: 'The Big Drop', s0: 960, s1: 1260 },
  { name: 'Final Sprint', s0: 1260, s1: 1960 },
];

export const CHECKPOINTS = [150, 330, 550, 760, 965, 1260, 1425, 1575, 1700];

/** Leaf shortcut strip (inside of the big left-hander). */
export const LEAF_SHORTCUT = { s0: 394, s1: 478, d: -13.9, half: 2.2 };
export const BRIDGE = { s0: 920, s1: 958 };
export const KICKER = { s0: 1090, s1: 1122, height: 5.2 };
/** Places where the course splits around a divider; `d` is the divider's lateral position. */
export const SPLITS = [
  { group: 'leaf', s0: 398, s1: 478, d: -11.9, left: 'risky', right: 'safe' },
  { group: 'maze', s0: 648, s1: 745, d: 2.65, left: 'safe', right: 'risky' },
];
export const SMALL_JUMP = { s0: 300, s1: 314, height: 1.5 };

export class Track {
  readonly n: number;
  readonly length: number;
  private readonly px: Float32Array;
  private readonly pz: Float32Array;
  private readonly phi: Float32Array;
  private readonly kappa: Float32Array;
  private readonly base: Float32Array;
  private readonly features: Feature[] = [];
  private readonly patches: Patch[] = [];
  readonly obstacles: Obstacle[] = [];
  readonly roots: RootSpec[] = [];
  readonly gates: Gate[] = [];
  private readonly buckets: Obstacle[][] = [];

  constructor() {
    this.length = LAYOUT.reduce((sum, seg) => sum + seg[0], 0);
    this.n = Math.round(this.length);
    const n = this.n;

    // Raw curvature per unit, then two box-filter passes for clothoid-like transitions.
    let raw = new Float32Array(n + 1);
    let cursor = 0;
    for (const [len, turn] of LAYOUT) {
      const k = (turn * Math.PI) / 180 / len;
      for (let i = 0; i < len; i += 1) raw[cursor + i] = k;
      cursor += len;
    }
    for (let pass = 0; pass < 2; pass += 1) {
      const out = new Float32Array(n + 1);
      const half = 13;
      for (let i = 0; i <= n; i += 1) {
        let sum = 0;
        for (let j = -half; j <= half; j += 1) sum += raw[Math.min(n, Math.max(0, i + j))];
        out[i] = sum / (half * 2 + 1);
      }
      raw = out;
    }
    this.kappa = raw;

    this.px = new Float32Array(n + 1);
    this.pz = new Float32Array(n + 1);
    this.phi = new Float32Array(n + 1);
    this.base = new Float32Array(n + 1);
    for (let i = 1; i <= n; i += 1) {
      this.phi[i] = this.phi[i - 1] + this.kappa[i - 1];
      const mid = (this.phi[i] + this.phi[i - 1]) * 0.5;
      this.px[i] = this.px[i - 1] + Math.sin(mid);
      this.pz[i] = this.pz[i - 1] - Math.cos(mid);
      const slope = (keyed(SLOPE, i - 0.5) * Math.PI) / 180;
      this.base[i] = this.base[i - 1] - Math.tan(slope);
    }

    this.buildFeatures();
    this.buildObstacles();
  }

  // ---------------------------------------------------------------- frame

  private sample(arr: Float32Array, s: number): number {
    const c = Math.min(this.n - 0.001, Math.max(0, s));
    const i = Math.floor(c);
    const t = c - i;
    return arr[i] + (arr[i + 1] - arr[i]) * t;
  }

  heading(s: number): number {
    return this.sample(this.phi, s);
  }

  curvature(s: number): number {
    return this.sample(this.kappa, s);
  }

  halfWidth(s: number): number {
    return keyed(HALF_WIDTH, s);
  }

  /** Downhill slope (radians, positive = descending) of the base profile. */
  slope(s: number): number {
    return -(this.sample(this.base, s + 1) - this.sample(this.base, s - 1)) / 2;
  }

  toWorld(s: number, d: number, out: THREE.Vector3): THREE.Vector3 {
    const phi = this.heading(s);
    // Beyond the ends, extend straight.
    const over = s > this.n ? s - this.n : s < 0 ? s : 0;
    out.set(
      this.sample(this.px, s) + Math.cos(phi) * d + Math.sin(phi) * over,
      this.height(s, d),
      this.sample(this.pz, s) + Math.sin(phi) * d - Math.cos(phi) * over,
    );
    return out;
  }

  /**
   * Project a world XZ position to track coordinates. `hint` is the last known
   * segment index (pass -1 for a global search). Returns the new hint.
   */
  project(x: number, z: number, hint: number, out: { s: number; d: number }): number {
    let lo = 0;
    let hi = this.n - 1;
    if (hint >= 0) {
      lo = Math.max(0, hint - 6);
      hi = Math.min(this.n - 1, hint + 6);
    }
    let best = Infinity;
    let bestI = lo;
    let bestT = 0;
    for (let i = lo; i <= hi; i += 1) {
      const ax = this.px[i];
      const az = this.pz[i];
      const bx = this.px[i + 1] - ax;
      const bz = this.pz[i + 1] - az;
      let t = ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz);
      // Let the end segments extend so racers past the last sample still project.
      if (i > 0) t = Math.max(0, t);
      if (i < this.n - 1) t = Math.min(1, t);
      const cx = ax + bx * t - x;
      const cz = az + bz * t - z;
      const dist = cx * cx + cz * cz;
      if (dist < best) {
        best = dist;
        bestI = i;
        bestT = t;
      }
    }
    const s = bestI + bestT;
    const phi = this.heading(s);
    const cx = this.px[bestI] + (this.px[bestI + 1] - this.px[bestI]) * bestT;
    const cz = this.pz[bestI] + (this.pz[bestI + 1] - this.pz[bestI]) * bestT;
    out.s = s;
    out.d = (x - cx) * Math.cos(phi) + (z - cz) * Math.sin(phi);
    return bestI;
  }

  // --------------------------------------------------------------- height

  berm(s: number, side: number): number {
    let b = keyed(BERM, s);
    // The inside of the leaf-slide left-hander opens onto the stream + leaf shortcut.
    if (side < 0) b *= 1 - smoothstep(350, 366, s) * (1 - smoothstep(498, 514, s));
    return b;
  }

  height(s: number, d: number, skipWater = false): number {
    const hw = this.halfWidth(s);
    const ad = Math.abs(d);
    let h = this.sample(this.base, s);
    if (s > this.n) h += (s - this.n) * 0.07;

    const lim = hw + 5;
    h += -keyed(BANK_GAIN, s) * this.curvature(s) * Math.min(lim, Math.max(-lim, d));

    const inner = Math.min(ad, hw);
    h += 0.008 * inner * inner;
    if (ad > hw) {
      const e = ad - hw;
      h += this.berm(s, d < 0 ? -1 : 1) * smoothstep(0, 5, e);
      if (e > 4) h += (noise2(s * 0.09, d * 0.09) - 0.5) * 1.8 * smoothstep(4, 9, e);
      if (ad > TRACK_EDGE) {
        const o = ad - TRACK_EDGE;
        h -= o * 0.3 + o * o * 0.0016;
        h += (noise2(s * 0.03 + 9, d * 0.03) - 0.5) * 14 * smoothstep(0, 30, o);
      }
    }
    for (const f of this.features) {
      if (s < f.s0 || s > f.s1 || (skipWater && f.water)) continue;
      h += f.h(s, d);
    }
    return h;
  }

  /** World-space ground normal. */
  normal(s: number, d: number, out: THREE.Vector3): THREE.Vector3 {
    const e = 0.3;
    const hs = (this.height(s + e, d) - this.height(s - e, d)) / (2 * e);
    const hd = (this.height(s, d + e) - this.height(s, d - e)) / (2 * e);
    const phi = this.heading(s);
    const fx = Math.sin(phi);
    const fz = -Math.cos(phi);
    const rx = Math.cos(phi);
    const rz = Math.sin(phi);
    out.set(-hs * fx - hd * rx, 1, -hs * fz - hd * rz).normalize();
    return out;
  }

  // -------------------------------------------------------------- surface

  surface(s: number, d: number): Surface {
    const hw = this.halfWidth(s);
    const ad = Math.abs(d);
    for (let i = this.patches.length - 1; i >= 0; i -= 1) {
      const p = this.patches[i];
      if (s < p.s0 || s > p.s1 || d < p.d0 || d > p.d1) continue;
      if (p.ellipse) {
        const u = ((s - p.s0) / (p.s1 - p.s0)) * 2 - 1;
        const v = ((d - p.d0) / (p.d1 - p.d0)) * 2 - 1;
        if (u * u + v * v > 1) continue;
      }
      return p.surface;
    }
    if (ad > hw + 3.5) return 'rough';
    if (s < 150) return ad < 5.5 + Math.sin(s * 0.2) * 0.8 ? 'dirt' : 'grass';
    if (s < 550) return 'leaves';
    if (s < 915) return 'grass';
    if (s < 962) return 'wood';
    if (s < KICKER.s0) return 'stone';
    if (s < KICKER.s1) return 'wood';
    if (s < 1262) return 'grass';
    if (s < 1695) return 'stone';
    return ad < 3.6 ? 'stone' : 'grass';
  }

  // ------------------------------------------------------------- features

  private buildFeatures(): void {
    const ramp = (s0: number, s1: number, height: number, d0 = -99, d1 = 99) => {
      this.features.push({
        s0,
        s1,
        h: (s, d) => {
          if (d < d0 || d > d1) return 0;
          const t = (s - s0) / (s1 - s0);
          const edge = Math.min(1, Math.min(d - d0, d1 - d) / 1.5);
          return height * t * t * edge;
        },
      });
    };
    const hump = (sc: number, width: number, height: number, d0: number, d1: number) => {
      this.features.push({
        s0: sc - width * 2.5,
        s1: sc + width * 1.2,
        h: (s, d) => {
          if (d < d0 || d > d1) return 0;
          const edge = Math.min(1, Math.min(d - d0, d1 - d) / 1.2);
          // Gentle approach, sharp drop-off: a natural launch ramp.
          const x = s - sc;
          const g = x < 0 ? Math.exp(-(x * x) / (width * width)) : Math.exp(-(x * x) / (width * width * 0.12));
          return height * g * edge;
        },
      });
    };
    const basin = (s0: number, s1: number, d0: number, d1: number, depth: number, surface: Surface = 'water') => {
      this.features.push({
        s0,
        s1,
        water: surface === 'water',
        h: (s, d) => {
          if (d < d0 || d > d1) return 0;
          const es = Math.min(s - s0, s1 - s) / 4;
          const ed = Math.min(d - d0, d1 - d) / 1.6;
          return -depth * smoothstep(0, 1, Math.min(es, ed));
        },
      });
      this.patches.push({ s0: s0 + 1, s1: s1 - 1, d0: d0 + 0.5, d1: d1 - 0.5, surface });
    };

    // 2 · Leaf Slide: plank hop, then stream + leaf shortcut on the inside of the left-hander.
    ramp(SMALL_JUMP.s0, SMALL_JUMP.s1, SMALL_JUMP.height);
    this.patches.push({ s0: SMALL_JUMP.s0 - 1, s1: SMALL_JUMP.s1, d0: -11, d1: 11, surface: 'wood' });
    basin(384, 486, -21.5, -10.4, 0.9);
    const lf = LEAF_SHORTCUT;
    this.features.push({
      s0: lf.s0 - 6,
      s1: lf.s1 + 6,
      h: (s, d) => {
        const lat = 1 - smoothstep(lf.half - 0.4, lf.half + 0.9, Math.abs(d - lf.d));
        const lon = smoothstep(lf.s0 - 6, lf.s0, s) * (1 - smoothstep(lf.s1, lf.s1 + 6, s));
        return 1.05 * lat * lon;
      },
    });
    this.patches.push({ s0: lf.s0 - 5, s1: lf.s1 + 5, d0: lf.d - lf.half, d1: lf.d + lf.half, surface: 'leaves' });
    // Stepping connection from the main line onto the leaf.
    this.patches.push({ s0: 356, s1: 396, d0: -16, d1: -9, surface: 'leaves' });
    this.patches.push({ s0: 474, s1: 510, d0: -16, d1: -9, surface: 'leaves' });

    // 3 · Root Maze
    this.patches.push({ s0: 640, s1: 745, d0: 4.6, d1: 11.4, surface: 'stone' }); // precise inside lane
    this.patches.push({ s0: 684, s1: 722, d0: -11.5, d1: -4.5, surface: 'mud', ellipse: true });
    hump(738, 3.4, 0.8, 4.6, 11.6);
    hump(786, 5, 1.0, -13, 13);
    this.patches.push({ s0: 858, s1: 892, d0: -9.5, d1: -1.5, surface: 'mud', ellipse: true });
    // Stream under the bridge.
    basin(916, 962, -24, -4.4, 1.5);
    basin(916, 962, 4.4, 24, 1.5);
    this.features.push({
      s0: BRIDGE.s0,
      s1: BRIDGE.s1,
      h: (s, d) => (Math.abs(d) < 4.4 ? 0.7 * Math.sin(((s - BRIDGE.s0) / (BRIDGE.s1 - BRIDGE.s0)) * Math.PI) : 0),
    });

    // 4 · The Big Drop: kicker at the bottom of the plunge, ski-jump landing after.
    ramp(KICKER.s0, KICKER.s1, KICKER.height);
    basin(1222, 1258, 3, 12.5, 0.5, 'mud');

    // 5 · Final Sprint: slippery outside lines, a puddle chicane on the straight.
    this.patches.push({ s0: 1300, s1: 1352, d0: -9.5, d1: -3.5, surface: 'leaves', ellipse: true });
    this.patches.push({ s0: 1470, s1: 1530, d0: 3.5, d1: 9.5, surface: 'leaves', ellipse: true });
    this.patches.push({ s0: 1620, s1: 1666, d0: -9.5, d1: -4, surface: 'leaves', ellipse: true });
    basin(1752, 1782, -10, -1.2, 0.45);
    basin(1800, 1830, 1.2, 10, 0.45, 'mud');
    hump(1728, 4, 0.6, -3.4, 3.4);
  }

  private buildObstacles(): void {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const add = (kind: Obstacle['kind'], s: number, d: number, r: number, bounce: number, avoid: number, height = 0) => {
      this.toWorld(s, d, a);
      b.copy(a);
      a.y += r * 0.55;
      b.y = a.y + height;
      this.obstacles.push({ kind, a: a.clone(), b: b.clone(), r, bounce, s, d, avoid });
    };
    /** Root lying across the track from d0 to d1. */
    const root = (s: number, d0: number, d1: number, r: number, skew = 0) => {
      this.roots.push({ s, d0, d1, r, skew });
      const pieces = Math.max(1, Math.round(Math.abs(d1 - d0) / 4));
      for (let i = 0; i < pieces; i += 1) {
        const t0 = i / pieces;
        const t1 = (i + 1) / pieces;
        this.toWorld(s + skew * t0, d0 + (d1 - d0) * t0, a);
        this.toWorld(s + skew * t1, d0 + (d1 - d0) * t1, b);
        a.y += r * 0.35;
        b.y += r * 0.35;
        this.obstacles.push({
          kind: 'root',
          a: a.clone(),
          b: b.clone(),
          r,
          bounce: 0.35,
          s: s + skew * (t0 + t1) * 0.5,
          d: d0 + (d1 - d0) * (t0 + t1) * 0.5,
          avoid: 0,
        });
      }
    };

    // 1 · Starting Hill
    add('mushroom', 96, -7.2, 1.0, 1.25, 2);
    add('pebble', 118, 6.4, 0.9, 0.5, 1.8);
    add('mushroom', 136, 8.1, 0.9, 1.25, 1.8);

    // 2 · Leaf Slide
    add('pebble', 232, -5.5, 1.0, 0.5, 2);
    add('mushroom', 268, 8.6, 1.1, 1.25, 2);
    add('pebble', 286, 3.2, 0.8, 0.5, 1.8);
    add('mushroom', 352, 7.8, 1.0, 1.25, 2);
    add('pebble', 446, 4.5, 1.0, 0.5, 2);
    add('mushroom', 516, -6.8, 1.1, 1.25, 2);

    // 3 · Root Maze: slalom, then the split around the big divider root.
    root(566, -14, -2.4, 0.75, 5);
    this.gates.push({ s0: 558, s1: 574, d0: -0.4, d1: 10 });
    root(610, 14, 2.4, 0.75, -4);
    this.gates.push({ s0: 600, s1: 614, d0: -10.5, d1: 0.4 });
    // Divider root running along the track between the two lanes.
    for (let s = 650; s < 742; s += 13) root(s, 2.4 + Math.sin(s) * 0.4, 2.9 + Math.sin(s + 13) * 0.4, 1.15, 13);
    this.gates.push({ s0: 632, s1: 745, d0: -10.5, d1: -0.9, group: 'maze', option: 'safe' });
    this.gates.push({ s0: 632, s1: 745, d0: 5.8, d1: 10.4, group: 'maze', option: 'risky' });
    // Inside lane slalom (stone, precise).
    root(664, 13, 8.9, 0.6, 2);
    this.gates.push({ s0: 658, s1: 668, d0: 5.2, d1: 7.4, group: 'maze', option: 'risky' });
    root(694, 4.2, 7.0, 0.6, 2);
    this.gates.push({ s0: 689, s1: 699, d0: 8.6, d1: 10.6, group: 'maze', option: 'risky' });
    root(726, 13, 9.4, 0.6, -2);
    this.gates.push({ s0: 721, s1: 730, d0: 5.2, d1: 8, group: 'maze', option: 'risky' });
    // Outside lane: wide, a couple of mushrooms.
    add('mushroom', 668, -7.5, 1.1, 1.25, 2.2);
    add('mushroom', 742, -3.6, 1.0, 1.25, 2);
    add('stump', 757, 2.7, 1.6, 0.4, 2.8, 2);
    // After the split.
    root(800, 13, 0.6, 0.75, 5);
    this.gates.push({ s0: 792, s1: 808, d0: -9.5, d1: -1.5 });
    root(846, -13, -0.6, 0.75, -4);
    this.gates.push({ s0: 838, s1: 852, d0: 1.5, d1: 9.5 });
    add('pebble', 884, 4.2, 1.0, 0.5, 2);

    // Bridge: low rails + entry posts. Gate funnels the AI on.
    this.gates.push({ s0: 902, s1: 968, d0: -2.3, d1: 2.3 });
    for (const side of [-1, 1]) {
      for (let s = BRIDGE.s0; s < BRIDGE.s1; s += 9.5) {
        this.toWorld(s, side * 4.1, a);
        this.toWorld(Math.min(BRIDGE.s1, s + 9.5), side * 4.1, b);
        a.y += 0.75;
        b.y += 0.75;
        this.obstacles.push({ kind: 'rail', a: a.clone(), b: b.clone(), r: 0.32, bounce: 0.4, s: s + 4.7, d: side * 4.1, avoid: 0 });
      }
      add('post', BRIDGE.s0 - 0.5, side * 4.3, 0.55, 0.4, 0, 2.2);
      add('post', BRIDGE.s1 + 0.5, side * 4.3, 0.55, 0.4, 0, 2.2);
    }

    // 4 · The Big Drop
    add('pebble', 1004, -6.5, 1.1, 0.5, 2.2);
    add('pebble', 1010, 6.8, 1.0, 0.5, 2);

    // 5 · Final Sprint
    add('pebble', 1318, 5.8, 1.0, 0.5, 2);
    add('mushroom', 1388, -1.5, 1.0, 1.25, 2);
    add('pebble', 1462, -5.4, 1.1, 0.5, 2.2);
    add('pebble', 1552, 2.4, 0.9, 0.5, 2);
    add('mushroom', 1600, 6.6, 1.0, 1.25, 2);
    add('pebble', 1712, -6.8, 1.0, 0.5, 2);
    add('mushroom', 1766, 7.2, 1.1, 1.25, 2);
    add('pebble', 1838, -6.2, 1.0, 0.5, 2);
    // Finish arch legs.
    add('post', FINISH_S, -11.4, 0.8, 0.4, 0, 6);
    add('post', FINISH_S, 11.4, 0.8, 0.4, 0, 6);
    add('post', START_S, -10.2, 0.7, 0.4, 0, 6);
    add('post', START_S, 10.2, 0.7, 0.4, 0, 6);

    // Leaf shortcut is an optional AI route.
    const lf = LEAF_SHORTCUT;
    this.gates.push({ s0: lf.s0 - 4, s1: lf.s1 + 4, d0: lf.d - 0.8, d1: lf.d + 0.8, group: 'leaf', option: 'risky' });
    this.gates.push({ s0: lf.s0 - 4, s1: lf.s1 + 4, d0: -7.5, d1: 8.5, group: 'leaf', option: 'safe' });
    this.gates.push({ s0: 348, s1: lf.s0 - 5, d0: -9.2, d1: -6, group: 'leaf', option: 'risky' });
    this.gates.sort((g0, g1) => g0.s0 - g1.s0);

    const bucketCount = Math.ceil(this.length / 8) + 2;
    for (let i = 0; i < bucketCount; i += 1) this.buckets.push([]);
    for (const o of this.obstacles) {
      const lo = Math.max(0, Math.floor((o.s - 12) / 8));
      const hi = Math.min(bucketCount - 1, Math.floor((o.s + 12) / 8));
      for (let i = lo; i <= hi; i += 1) this.buckets[i].push(o);
    }
  }

  obstaclesNear(s: number): Obstacle[] {
    const i = Math.min(this.buckets.length - 1, Math.max(0, Math.floor(s / 8)));
    return this.buckets[i];
  }
}

export const track = new Track();
