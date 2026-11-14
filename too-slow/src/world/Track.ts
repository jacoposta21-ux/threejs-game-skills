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

export type Key = [number, number];

export function keyed(keys: Key[], s: number): number {
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

export interface Jump {
  s0: number;
  s1: number;
  height: number;
}

export interface LeafBridge {
  s0: number;
  s1: number;
  d: number;
  half: number;
  side: number;
}

/** A dash panel: rolling or sliding over it gives an instant burst of speed. */
export interface BoostPad {
  s0: number;
  s1: number;
  d: number;
  half: number;
}

export interface Split {
  group: string;
  s0: number;
  s1: number;
  d: number;
  left: string;
  right: string;
}

export interface Landmark {
  kind: 'can' | 'trowel' | 'hose' | 'rake' | 'pot' | 'potTipped' | 'trunk';
  s: number;
  d: number;
  /** End of the span for long props (hose). */
  s1?: number;
}

export interface Theme {
  skyTop: number;
  skyHorizon: number;
  skyGround: number;
  fog: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  verge: number;
  farA: number;
  farB: number;
  grassTints: number[];
  /** Glowing fireflies instead of butterflies. */
  fireflies?: boolean;
}

export interface Section {
  name: string;
  s0: number;
  s1: number;
}

/** Everything that makes one course: shape, profile, rules, look, and a build script for its features. */
export interface TrackDef {
  id: string;
  name: string;
  blurb: string;
  /** Curvature layout: [length, total turn in degrees (+ = right)]. */
  layout: Key[];
  /** Downhill slope in degrees keyed by s. */
  slope: Key[];
  halfWidth: Key[];
  bankGain: Key[];
  berm: Key[];
  startS: number;
  gridS: number;
  finishS: number;
  sections: Section[];
  checkpoints: number[];
  theme: Theme;
  landmarks: Landmark[];
  /** Picket fence behind the start and along one side up to `s1`. */
  fence?: { side: number; s1: number };
  /** Index into the built jumps of the signature jump (AI tricks, air hint). */
  mainJump: number;
  baseSurface(s: number, ad: number): Surface;
  build(b: Track): void;
}

export const TRACK_EDGE = 22;

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
  private readonly bermCuts: { s0: number; s1: number; side: number }[] = [];
  private readonly deferred: (() => void)[] = [];
  readonly obstacles: Obstacle[] = [];
  readonly roots: RootSpec[] = [];
  readonly gates: Gate[] = [];
  readonly jumps: Jump[] = [];
  readonly bridges: { s0: number; s1: number }[] = [];
  readonly leafBridges: LeafBridge[] = [];
  readonly pads: BoostPad[] = [];
  readonly splits: Split[] = [];
  /** s positions of item-box rows. */
  readonly itemRows: number[] = [];
  private readonly buckets: Obstacle[][] = [];

  constructor(readonly def: TrackDef) {
    this.length = def.layout.reduce((sum, seg) => sum + seg[0], 0);
    this.n = Math.round(this.length);
    const n = this.n;

    // Raw curvature per unit, then two box-filter passes for clothoid-like transitions.
    let raw = new Float32Array(n + 1);
    let cursor = 0;
    for (const [len, turn] of def.layout) {
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
      const slope = (keyed(def.slope, i - 0.5) * Math.PI) / 180;
      this.base[i] = this.base[i - 1] - Math.tan(slope);
    }

    def.build(this);
    // Arch legs at the start and finish lines.
    for (const s of [def.startS, def.finishS]) {
      const half = this.halfWidth(s) + 0.9;
      this.add('post', s, -half, 0.75, 0.4, 0, 6);
      this.add('post', s, half, 0.75, 0.4, 0, 6);
    }
    // Obstacles are placed last so they sit on the finished ground.
    for (const fn of this.deferred) fn();
    this.deferred.length = 0;
    this.gates.sort((g0, g1) => g0.s0 - g1.s0);

    const bucketCount = Math.ceil(this.length / 8) + 2;
    for (let i = 0; i < bucketCount; i += 1) this.buckets.push([]);
    for (const o of this.obstacles) {
      const lo = Math.max(0, Math.floor((o.s - 12) / 8));
      const hi = Math.min(bucketCount - 1, Math.floor((o.s + 12) / 8));
      for (let i = lo; i <= hi; i += 1) this.buckets[i].push(o);
    }
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
    return keyed(this.def.halfWidth, s);
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
    let b = keyed(this.def.berm, s);
    // The bank opens up where a leaf-bridge shortcut leaves the course.
    for (const c of this.bermCuts) {
      if (c.side === side) b *= 1 - smoothstep(c.s0, c.s0 + 16, s) * (1 - smoothstep(c.s1 - 16, c.s1, s));
    }
    return b;
  }

  height(s: number, d: number, skipWater = false): number {
    const hw = this.halfWidth(s);
    const ad = Math.abs(d);
    let h = this.sample(this.base, s);
    if (s > this.n) h += (s - this.n) * 0.07;

    const lim = hw + 5;
    h += -keyed(this.def.bankGain, s) * this.curvature(s) * Math.min(lim, Math.max(-lim, d));

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
    return this.def.baseSurface(s, ad);
  }

  /** The boost pad under (s, d), if any. */
  padAt(s: number, d: number): BoostPad | null {
    for (const p of this.pads) {
      if (s >= p.s0 && s <= p.s1 && Math.abs(d - p.d) <= p.half) return p;
    }
    return null;
  }

  obstaclesNear(s: number): Obstacle[] {
    const i = Math.min(this.buckets.length - 1, Math.max(0, Math.floor(s / 8)));
    return this.buckets[i];
  }

  // ------------------------------------------------- builder API (used by TrackDef.build)

  ramp(s0: number, s1: number, height: number, d0 = -99, d1 = 99): void {
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
  }

  /** Gentle approach, sharp drop-off: a natural launch ramp. */
  hump(sc: number, width: number, height: number, d0: number, d1: number): void {
    this.features.push({
      s0: sc - width * 2.5,
      s1: sc + width * 1.2,
      h: (s, d) => {
        if (d < d0 || d > d1) return 0;
        const edge = Math.min(1, Math.min(d - d0, d1 - d) / 1.2);
        const x = s - sc;
        const g = x < 0 ? Math.exp(-(x * x) / (width * width)) : Math.exp(-(x * x) / (width * width * 0.12));
        return height * g * edge;
      },
    });
  }

  basin(s0: number, s1: number, d0: number, d1: number, depth: number, surface: Surface = 'water'): void {
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
  }

  patch(s0: number, s1: number, d0: number, d1: number, surface: Surface, ellipse = false): void {
    this.patches.push({ s0, s1, d0, d1, surface, ellipse });
  }

  gate(s0: number, s1: number, d0: number, d1: number, group?: string, option?: string): void {
    this.gates.push({ s0, s1, d0, d1, group, option });
  }

  split(group: string, s0: number, s1: number, d: number, left: string, right: string): void {
    this.splits.push({ group, s0, s1, d, left, right });
  }

  itemRow(...s: number[]): void {
    this.itemRows.push(...s);
  }

  pad(s: number, d: number, length = 8, half = 1.7): void {
    this.pads.push({ s0: s, s1: s + length, d, half });
  }

  /** Wooden kicker across the course. */
  jump(s0: number, s1: number, height: number): void {
    this.ramp(s0, s1, height);
    this.patches.push({ s0: s0 - 1, s1, d0: -14, d1: 14, surface: 'wood' });
    this.jumps.push({ s0, s1, height });
  }

  add(kind: Obstacle['kind'], s: number, d: number, r: number, bounce: number, avoid: number, height = 0): void {
    this.deferred.push(() => {
      const a = this.toWorld(s, d, new THREE.Vector3());
      const b = a.clone();
      a.y += r * 0.55;
      b.y = a.y + height;
      this.obstacles.push({ kind, a, b, r, bounce, s, d, avoid });
    });
  }

  /** Root lying across the track from d0 to d1. */
  root(s: number, d0: number, d1: number, r: number, skew = 0): void {
    this.roots.push({ s, d0, d1, r, skew });
    this.deferred.push(() => {
      const pieces = Math.max(1, Math.round(Math.abs(d1 - d0) / 4));
      for (let i = 0; i < pieces; i += 1) {
        const t0 = i / pieces;
        const t1 = (i + 1) / pieces;
        const a = this.toWorld(s + skew * t0, d0 + (d1 - d0) * t0, new THREE.Vector3());
        const b = this.toWorld(s + skew * t1, d0 + (d1 - d0) * t1, new THREE.Vector3());
        a.y += r * 0.35;
        b.y += r * 0.35;
        this.obstacles.push({ kind: 'root', a, b, r, bounce: 0.35, s: s + skew * (t0 + t1) * 0.5, d: d0 + (d1 - d0) * (t0 + t1) * 0.5, avoid: 0 });
      }
    });
  }

  /** Narrow plank bridge over a stream: water both sides, low rails, an AI gate to funnel onto it. */
  bridge(s0: number, s1: number): void {
    this.basin(s0 - 4, s1 + 4, -24, -4.4, 1.5);
    this.basin(s0 - 4, s1 + 4, 4.4, 24, 1.5);
    this.features.push({
      s0,
      s1,
      h: (s, d) => (Math.abs(d) < 4.4 ? 0.7 * Math.sin(((s - s0) / (s1 - s0)) * Math.PI) : 0),
    });
    this.patches.push({ s0: s0 - 5, s1: s1 + 4, d0: -4.4, d1: 4.4, surface: 'wood' });
    this.gates.push({ s0: s0 - 18, s1: s1 + 10, d0: -2.3, d1: 2.3 });
    this.bridges.push({ s0, s1 });
    this.deferred.push(() => {
      for (const side of [-1, 1]) {
        for (let s = s0; s < s1; s += 9.5) {
          const a = this.toWorld(s, side * 4.1, new THREE.Vector3());
          const b = this.toWorld(Math.min(s1, s + 9.5), side * 4.1, new THREE.Vector3());
          a.y += 0.75;
          b.y += 0.75;
          this.obstacles.push({ kind: 'rail', a, b, r: 0.32, bounce: 0.4, s: s + 4.7, d: side * 4.1, avoid: 0 });
        }
      }
    });
    for (const side of [-1, 1]) {
      this.add('post', s0 - 0.5, side * 4.3, 0.55, 0.4, 0, 2.2);
      this.add('post', s1 + 0.5, side * 4.3, 0.55, 0.4, 0, 2.2);
    }
  }

  /**
   * Leaf-bridge shortcut over a stream on the inside of a bend. `side` is -1 (left) or +1 (right).
   * It is an optional, riskier AI route.
   */
  leafBridge(s0: number, s1: number, side: number): void {
    const lf: LeafBridge = { s0, s1, d: side * 13.9, half: 2.2, side };
    const group = `leaf${this.leafBridges.length}`;
    this.leafBridges.push(lf);
    const lo = (a: number, b: number) => Math.min(side * a, side * b);
    const hi = (a: number, b: number) => Math.max(side * a, side * b);
    this.basin(s0 - 10, s1 + 8, lo(10.4, 21.5), hi(10.4, 21.5), 0.9);
    this.features.push({
      s0: s0 - 6,
      s1: s1 + 6,
      h: (s, d) => {
        const lat = 1 - smoothstep(lf.half - 0.4, lf.half + 0.9, Math.abs(d - lf.d));
        const lon = smoothstep(s0 - 6, s0, s) * (1 - smoothstep(s1, s1 + 6, s));
        return 1.05 * lat * lon;
      },
    });
    this.patches.push({ s0: s0 - 5, s1: s1 + 5, d0: lf.d - lf.half, d1: lf.d + lf.half, surface: 'leaves' });
    // Dry leafy aprons leading on and off the bridge.
    this.patches.push({ s0: s0 - 38, s1: s0 + 2, d0: lo(9, 16), d1: hi(9, 16), surface: 'leaves' });
    this.patches.push({ s0: s1 - 4, s1: s1 + 32, d0: lo(9, 16), d1: hi(9, 16), surface: 'leaves' });
    this.bermCuts.push({ s0: s0 - 44, s1: s1 + 36, side });
    this.gates.push({ s0: s0 - 4, s1: s1 + 4, d0: lf.d - 0.8, d1: lf.d + 0.8, group, option: 'risky' });
    this.gates.push({ s0: s0 - 4, s1: s1 + 4, d0: lo(7.5, -8.5), d1: hi(7.5, -8.5), group, option: 'safe' });
    this.gates.push({ s0: s0 - 46, s1: s0 - 5, d0: lo(6, 9.2), d1: hi(6, 9.2), group, option: 'risky' });
    if (side < 0) this.split(group, s0 + 4, s1, side * 11.9, 'risky', 'safe');
    else this.split(group, s0 + 4, s1, side * 11.9, 'safe', 'risky');
  }
}

// ------------------------------------------------------------------ current course
// These are live bindings: `loadTrack` swaps them, and every importer sees the new course.

import { TRACKS } from './tracks';

export let track: Track = new Track(TRACKS[0]);
export let START_S = track.def.startS;
export let GRID_S = track.def.gridS;
export let FINISH_S = track.def.finishS;
export let SECTIONS: Section[] = track.def.sections;
export let CHECKPOINTS: number[] = track.def.checkpoints;
export let SPLITS: Split[] = track.splits;
/** The course's signature jump. */
export let KICKER: Jump = track.jumps[track.def.mainJump];

const built = new Map<string, Track>([[track.def.id, track]]);

export function loadTrack(id: string): Track {
  const def = TRACKS.find((t) => t.id === id) ?? TRACKS[0];
  let next = built.get(def.id);
  if (!next) {
    next = new Track(def);
    built.set(def.id, next);
  }
  track = next;
  START_S = def.startS;
  GRID_S = def.gridS;
  FINISH_S = def.finishS;
  SECTIONS = def.sections;
  CHECKPOINTS = def.checkpoints;
  SPLITS = next.splits;
  KICKER = next.jumps[def.mainJump];
  return next;
}
