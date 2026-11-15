import * as THREE from 'three';

/**
 * A closed circuit, described entirely in track coordinates:
 *   s — distance along the centre line (world units)
 *   d — signed lateral offset, positive to the racer's right
 * Height, surface type, obstacles, AI gates and checkpoints are all functions
 * of (s, d), so physics, AI, rendering and race logic share one source of truth.
 */

export type Surface = 'grass' | 'dirt' | 'mud' | 'stone' | 'leaves' | 'wood' | 'water' | 'rough' | 'sand' | 'packed' | 'ice' | 'snow';

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
  sand: { roll: 0.045, grip: 0.82, crawl: 0.8, color: 0xead49a, label: 'Loose sand' },
  packed: { roll: 0.02, grip: 1.0, crawl: 1.0, color: 0xcfa76a, label: 'Packed sand' },
  ice: { roll: 0.005, grip: 0.34, crawl: 0.7, color: 0xbfe6f5, label: 'Ice' },
  snow: { roll: 0.085, grip: 0.9, crawl: 0.55, color: 0xf2f6fa, label: 'Snow' },
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
  kind: 'root' | 'pebble' | 'mushroom' | 'post' | 'rail' | 'stump' | 'cactus' | 'snowball' | 'icicle';
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

export type CritterKind = 'ants' | 'pillbug' | 'beetle' | 'grasshopper';

/** A moving insect hazard on the course. */
export interface CritterSpec {
  kind: CritterKind;
  s: number;
  /** Seconds offset so identical critters move out of step. */
  phase: number;
  /** Ants: number in the column. */
  count: number;
}

export interface Landmark {
  kind: 'can' | 'trowel' | 'hose' | 'rake' | 'pot' | 'potTipped' | 'trunk' | 'bucket' | 'spade' | 'pumpkin' | 'snowman' | 'lantern';
  s: number;
  d: number;
  /** End of the span for long props (hose). */
  s1?: number;
}

export type Flora = 'garden' | 'veggie' | 'pond' | 'sand' | 'snow' | 'glow';

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
  flora: Flora;
  /** Glowing fireflies instead of butterflies. */
  fireflies?: boolean;
  /** Falling snow / drifting sand motes. */
  weather?: 'snow' | 'dust';
  /** Night track: bright emissive props get a bloom pass. */
  bloom?: boolean;
}

export interface Section {
  name: string;
  s0: number;
  s1: number;
}

/** Everything that makes one circuit: shape, profile, rules, look, and a build script for its features. */
export interface TrackDef {
  id: string;
  name: string;
  blurb: string;
  /** Closed centripetal Catmull-Rom control points (x, z). Point 0 is s = 0 on the start plateau. */
  points: [number, number][];
  laps: number;
  /** Downhill slope in degrees keyed by s, from the plateau (s = 0) to the launcher. */
  slope: Key[];
  halfWidth: Key[];
  bankGain: Key[];
  berm: Key[];
  /** Start / finish line. The grid sits just behind it on the plateau. */
  startS: number;
  /** The Boing Mushroom: at the bottom of each lap it throws everyone back up to the plateau. */
  launchS: number;
  /** Where the throw lands, measured from s = 0 on the plateau. */
  landS: number;
  sections: Section[];
  checkpoints: number[];
  theme: Theme;
  landmarks: Landmark[];
  /** Picket fence along one side, between two s positions. */
  fence?: { side: number; s0: number; s1: number };
  /** Index into the built jumps of the signature jump (air hint), -1 for none. */
  mainJump: number;
  baseSurface(s: number, ad: number): Surface;
  build(b: Track): void;
}

export const TRACK_EDGE = 22;
export const GRAVITY = 28;
const BLEND0 = 24;
const BLEND1 = 46;

export interface Cannon {
  launchS: number;
  landS: number;
  /** Flight time, horizontal speed along the launch heading, vertical launch speed. */
  time: number;
  vh: number;
  vy: number;
  heading: number;
}

export class Track {
  readonly n: number;
  readonly length: number;
  private readonly px: Float32Array;
  private readonly pz: Float32Array;
  private readonly phi: Float32Array;
  private readonly kappa: Float32Array;
  private readonly base: Float32Array;
  /** Coarse centre-line samples (x, z, height) for the terrain field between parts of the circuit. */
  private readonly fieldPts: Float32Array;
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
  readonly critters: CritterSpec[] = [];
  /** s positions of item-box rows. */
  readonly itemRows: number[] = [];
  readonly cannon: Cannon;
  readonly bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  private readonly buckets: Obstacle[][] = [];

  constructor(readonly def: TrackDef) {
    const curve = new THREE.CatmullRomCurve3(
      def.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'centripetal',
    );
    this.n = Math.round(curve.getLength());
    this.length = this.n;
    const n = this.n;
    const pts = curve.getSpacedPoints(n);
    this.px = new Float32Array(n + 1);
    this.pz = new Float32Array(n + 1);
    for (let i = 0; i <= n; i += 1) {
      this.px[i] = pts[i].x;
      this.pz[i] = pts[i].z;
    }
    this.px[n] = this.px[0];
    this.pz[n] = this.pz[0];

    // Heading from the curve, unwrapped so it rises (or falls) by exactly one turn round the lap.
    const phi = new Float64Array(n + 1);
    for (let i = 0; i <= n; i += 1) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      phi[i] = Math.atan2(this.px[b] - this.px[a], -(this.pz[b] - this.pz[a]));
      if (i > 0) {
        while (phi[i] - phi[i - 1] > Math.PI) phi[i] -= Math.PI * 2;
        while (phi[i] - phi[i - 1] < -Math.PI) phi[i] += Math.PI * 2;
      }
    }
    this.phi = Float32Array.from(phi);

    // Curvature, smoothed round the loop for clothoid-like transitions.
    let k = new Float64Array(n + 1);
    for (let i = 0; i < n; i += 1) k[i] = phi[i + 1] - phi[i];
    for (let pass = 0; pass < 2; pass += 1) {
      const out = new Float64Array(n + 1);
      for (let i = 0; i < n; i += 1) {
        let sum = 0;
        for (let j = -13; j <= 13; j += 1) sum += k[(i + j + n) % n];
        out[i] = sum / 27;
      }
      k = out;
    }
    k[n] = k[0];
    this.kappa = Float32Array.from(k);

    // Height: integrate the downhill profile to the launcher, then shape the ramp under the throw.
    this.base = new Float32Array(n + 1);
    const ls = Math.round(def.launchS);
    for (let i = 1; i <= ls; i += 1) {
      const slope = (keyed(def.slope, i - 0.5) * Math.PI) / 180;
      this.base[i] = this.base[i - 1] - Math.tan(slope);
    }
    const ha = this.base[ls];
    const rise = Math.max(1, -ha);
    const time = THREE.MathUtils.clamp(1.32 * Math.sqrt((2 * rise) / GRAVITY), 2, 3.8);
    const span = n - ls + def.landS;
    const vh = span / time;
    const vy = (rise + 0.5 * GRAVITY * time * time) / time;
    this.cannon = { launchS: ls, landS: def.landS, time, vh, vy, heading: this.phi[ls] };
    for (let i = ls + 1; i <= n; i += 1) {
      const tt = ((i - ls) / span) * time;
      const arc = ha + vy * tt - 0.5 * GRAVITY * tt * tt;
      const clear = 4 * smoothstep(0, 16, i - ls);
      this.base[i] = Math.min(arc - clear, 0);
    }
    this.base[n] = this.base[0];

    const field: number[] = [];
    for (let i = 0; i < n; i += 6) field.push(this.px[i], this.pz[i], this.base[i]);
    this.fieldPts = Float32Array.from(field);
    const b = this.bounds;
    b.minX = b.minZ = Infinity;
    b.maxX = b.maxZ = -Infinity;
    for (let i = 0; i <= n; i += 1) {
      b.minX = Math.min(b.minX, this.px[i]);
      b.maxX = Math.max(b.maxX, this.px[i]);
      b.minZ = Math.min(b.minZ, this.pz[i]);
      b.maxZ = Math.max(b.maxZ, this.pz[i]);
    }

    def.build(this);
    // Arch legs at the start / finish line.
    const half = this.halfWidth(def.startS) + 0.9;
    this.add('post', def.startS, -half, 0.75, 0.4, 0, 6);
    this.add('post', def.startS, half, 0.75, 0.4, 0, 6);
    // Obstacles are placed last so they sit on the finished ground.
    for (const fn of this.deferred) fn();
    this.deferred.length = 0;
    this.gates.sort((g0, g1) => g0.s0 - g1.s0);

    const bucketCount = Math.ceil(this.length / 8);
    for (let i = 0; i < bucketCount; i += 1) this.buckets.push([]);
    for (const o of this.obstacles) {
      for (let k2 = -2; k2 <= 2; k2 += 1) {
        const idx = (Math.floor(this.wrap(o.s) / 8) + k2 + bucketCount) % bucketCount;
        if (!this.buckets[idx].includes(o)) this.buckets[idx].push(o);
      }
    }
  }

  // ---------------------------------------------------------------- frame

  /** s folded into [0, length). */
  wrap(s: number): number {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  /** Signed distance along the course from b to a, the short way round. */
  rel(a: number, b: number): number {
    const L = this.length;
    let d = (a - b) % L;
    if (d >= L / 2) d -= L;
    if (d < -L / 2) d += L;
    return d;
  }

  private sample(arr: Float32Array, s: number): number {
    const c = this.wrap(s);
    const i = Math.min(this.n - 1, Math.floor(c));
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
    return keyed(this.def.halfWidth, this.wrap(s));
  }

  /** Downhill slope (radians, positive = descending) of the base profile. */
  slope(s: number): number {
    return -(this.sample(this.base, s + 1) - this.sample(this.base, s - 1)) / 2;
  }

  centreHeight(s: number): number {
    return this.sample(this.base, s);
  }

  toWorld(s: number, d: number, out: THREE.Vector3): THREE.Vector3 {
    const phi = this.heading(s);
    out.set(this.sample(this.px, s) + Math.cos(phi) * d, this.height(s, d), this.sample(this.pz, s) + Math.sin(phi) * d);
    return out;
  }

  /**
   * Project a world XZ position to track coordinates. `hint` is the last known
   * segment index (pass -1 for a global search). Returns the new hint.
   */
  project(x: number, z: number, hint: number, out: { s: number; d: number }): number {
    const n = this.n;
    let best = Infinity;
    let bestI = 0;
    let bestT = 0;
    const test = (i: number) => {
      const ax = this.px[i];
      const az = this.pz[i];
      const bx = this.px[i + 1] - ax;
      const bz = this.pz[i + 1] - az;
      let t = ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz);
      t = Math.max(0, Math.min(1, t));
      const cx = ax + bx * t - x;
      const cz = az + bz * t - z;
      const dist = cx * cx + cz * cz;
      if (dist < best) {
        best = dist;
        bestI = i;
        bestT = t;
      }
    };
    if (hint >= 0) {
      for (let k = -6; k <= 6; k += 1) test((hint + k + n) % n);
    } else {
      for (let i = 0; i < n; i += 5) test(i);
      const c = bestI;
      for (let k = -6; k <= 6; k += 1) test((c + k + n) % n);
    }
    const s = this.wrap(bestI + bestT);
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

  /** Smooth terrain between the parts of the circuit: inverse-distance blend of nearby centre heights, plus hills. */
  field(x: number, z: number): number {
    const f = this.fieldPts;
    let sw = 0;
    let sh = 0;
    let near = Infinity;
    for (let i = 0; i < f.length; i += 3) {
      const dx = f[i] - x;
      const dz = f[i + 1] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < near) near = d2;
      const w = 1 / ((d2 + 900) * Math.sqrt(d2 + 900));
      sw += w;
      sh += w * f[i + 2];
    }
    const dist = Math.sqrt(near);
    return sh / sw + (noise2(x * 0.018, z * 0.018) - 0.5) * 18 * smoothstep(40, 150, dist) + smoothstep(30, 200, dist) * 6;
  }

  private trackHeight(s: number, d: number): number {
    const hw = this.halfWidth(s);
    const ad = Math.abs(d);
    let h = this.sample(this.base, s);
    const lim = hw + 5;
    h += -keyed(this.def.bankGain, s) * this.curvature(s) * Math.min(lim, Math.max(-lim, d));
    const inner = Math.min(ad, hw);
    h += 0.008 * inner * inner;
    if (ad > hw) {
      const e = ad - hw;
      h += this.berm(s, d < 0 ? -1 : 1) * smoothstep(0, 5, e);
      if (e > 4) h += (noise2(s * 0.09, d * 0.09) - 0.5) * 1.8 * smoothstep(4, 9, e);
    }
    for (const f of this.features) {
      if (s < f.s0 || s > f.s1) continue;
      h += f.h(s, d);
    }
    return h;
  }

  height(s: number, d: number, skipWater = false): number {
    s = this.wrap(s);
    const ad = Math.abs(d);
    let h: number;
    if (skipWater) {
      // Water sheet level: the ground without the basins dug into it.
      let dug = 0;
      for (const f of this.features) if (f.water && s >= f.s0 && s <= f.s1) dug += f.h(s, d);
      h = this.trackHeight(s, d) - dug;
    } else h = this.trackHeight(s, d);
    if (ad <= BLEND0) return h;
    const phi = this.heading(s);
    const x = this.sample(this.px, s) + Math.cos(phi) * d;
    const z = this.sample(this.pz, s) + Math.sin(phi) * d;
    return h + (this.field(x, z) - h) * smoothstep(BLEND0, BLEND1, ad);
  }

  /** Ground height anywhere in the world (terrain mesh, far props). */
  groundAt(x: number, z: number, scratch = { s: 0, d: 0 }): number {
    this.project(x, z, -1, scratch);
    if (Math.abs(scratch.d) < BLEND1) return this.height(scratch.s, scratch.d);
    return this.field(x, z);
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
    s = this.wrap(s);
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
    if (ad > hw + 3.5) return this.def.theme.flora === 'sand' ? 'sand' : this.def.theme.flora === 'snow' ? 'snow' : 'rough';
    return this.def.baseSurface(s, ad);
  }

  /** The boost pad under (s, d), if any. */
  padAt(s: number, d: number): BoostPad | null {
    s = this.wrap(s);
    for (const p of this.pads) {
      if (s >= p.s0 && s <= p.s1 && Math.abs(d - p.d) <= p.half) return p;
    }
    return null;
  }

  obstaclesNear(s: number): Obstacle[] {
    const i = Math.floor(this.wrap(s) / 8) % this.buckets.length;
    return this.buckets[i];
  }

  // ------------------------------------------------- builder API (used by TrackDef.build)

  itemRow(...s: number[]): void {
    this.itemRows.push(...s);
  }

  pad(s: number, d: number, length = 8, half = 1.7): void {
    this.pads.push({ s0: s, s1: s + length, d, half });
  }

  /** A run of pads in a row (a "pad chain"), optionally weaving side to side. */
  padChain(s: number, count: number, gap: number, d: number, weave = 0): void {
    for (let i = 0; i < count; i += 1) this.pad(s + i * gap, d + (i % 2 ? weave : -weave));
  }

  critter(kind: CritterKind, s: number, phase = 0, count = 12): void {
    this.critters.push({ kind, s, phase, count });
  }

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

  /** Wooden kicker across the course. */
  jump(s0: number, s1: number, height: number, surface: Surface = 'wood'): void {
    this.ramp(s0, s1, height);
    this.patches.push({ s0: s0 - 1, s1, d0: -14, d1: 14, surface });
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
  bridge(s0: number, s1: number, surface: Surface = 'wood'): void {
    this.basin(s0 - 4, s1 + 4, -24, -4.4, 1.5);
    this.basin(s0 - 4, s1 + 4, 4.4, 24, 1.5);
    this.features.push({
      s0,
      s1,
      h: (s, d) => (Math.abs(d) < 4.4 ? 0.7 * Math.sin(((s - s0) / (s1 - s0)) * Math.PI) : 0),
    });
    this.patches.push({ s0: s0 - 5, s1: s1 + 4, d0: -4.4, d1: 4.4, surface });
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
export let SECTIONS: Section[] = track.def.sections;
export let CHECKPOINTS: number[] = track.def.checkpoints;
export let SPLITS: Split[] = track.splits;
/** The course's signature jump (may be undefined). */
export let KICKER: Jump | undefined = track.jumps[track.def.mainJump];

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
  SECTIONS = def.sections;
  CHECKPOINTS = def.checkpoints;
  SPLITS = next.splits;
  KICKER = next.jumps[def.mainJump];
  return next;
}
