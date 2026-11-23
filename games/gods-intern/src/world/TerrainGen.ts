import { CONFIG } from '../core/Config';
import { hash2 } from '../core/Rng';

/**
 * Deterministic island heightfield. Pure data (no Three.js) so the simulation,
 * pathfinding, tests and renderer all read the exact same surface.
 *
 * Authored layout (world units, island centred on origin, -Z is north):
 *   - Mountain massif in the north, cliffs along the north-west coast
 *   - Lake in the north-east highlands
 *   - River from the mountain foot down past the main village to the south sea
 *   - Three flattened settlement sites (south village, east meadow, west meadow)
 */

export interface SettlementSite {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  height: number;
  populated: boolean;
}

export interface LakeInfo {
  x: number;
  z: number;
  radius: number;
  level: number;
}

export interface RiverInfo {
  points: number[]; // flattened x,z
  levels: number[]; // water surface height per point
  widths: number[];
}

export const WATER_NONE = 0;
export const WATER_SEA = 1;
export const WATER_LAKE = 2;
export const WATER_RIVER = 3;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}

export function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 131);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): { d: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return { d: Math.hypot(px - cx, pz - cz), t };
}

export class TerrainData {
  readonly size = CONFIG.world.size;
  readonly segments = CONFIG.world.segments;
  readonly verts = CONFIG.world.segments + 1;
  readonly step = CONFIG.world.size / CONFIG.world.segments;
  readonly half = CONFIG.world.size / 2;
  readonly heights: Float32Array;
  readonly water: Uint8Array;
  readonly sites: SettlementSite[];
  readonly lake: LakeInfo;
  readonly river: RiverInfo;
  /** Walkable points beside fresh water that villagers can drink from. */
  readonly drinkPoints: number[] = [];
  /** v0.3: wooden bridges over the river (the river splits the island in two). */
  readonly bridges: Array<{ x0: number; z0: number; x1: number; z1: number; halfWidth: number; deck: number }> = [];

  constructor(readonly seed: number) {
    const n = this.verts * this.verts;
    this.heights = new Float32Array(n);
    this.water = new Uint8Array(n);

    this.sites = [
      { id: 'v1', name: 'Puddleton', x: -12, z: 22, radius: 19, height: 0, populated: true },
      // v0.3: the two former empty meadows are now populated. Positions are unchanged
      // so terrain and older saves stay compatible.
      { id: 'v2', name: 'Drizzleville', x: 36, z: 14, radius: 13, height: 0, populated: true },
      { id: 'v3', name: 'Rockbottom', x: -40, z: -4, radius: 13, height: 0, populated: true },
    ];
    this.lake = { x: 30, z: -20, radius: 10, level: 0 };
    const riverPath = [24, -12, 17, -3, 11, 7, 10, 17, 12, 28, 15, 42, 18, 56, 20, 72];
    this.river = { points: riverPath, levels: [], widths: [] };

    for (const site of this.sites) site.height = Math.min(4.2, Math.max(2.4, this.rawHeight(site.x, site.z)));
    this.lake.level = Math.min(6.5, Math.max(4.2, this.rawHeight(this.lake.x, this.lake.z) - 0.5));

    // Monotonic river surface levels: running min of the raw ground minus a bank margin.
    let level = Infinity;
    const pts = riverPath.length / 2;
    for (let i = 0; i < pts; i++) {
      const x = riverPath[i * 2];
      const z = riverPath[i * 2 + 1];
      const ground = this.rawHeightWithSites(x, z);
      level = Math.min(level, i === 0 ? this.lake.level : ground - 0.7);
      this.river.levels.push(Math.max(0.05, level));
      this.river.widths.push(1.8 + (i / (pts - 1)) * 1.6);
    }

    for (let iz = 0; iz < this.verts; iz++) {
      for (let ix = 0; ix < this.verts; ix++) {
        const x = -this.half + ix * this.step;
        const z = -this.half + iz * this.step;
        const index = iz * this.verts + ix;
        let h = this.rawHeightWithSites(x, z);
        let water = WATER_NONE;

        // Lake bowl with a raised rim.
        const dl = Math.hypot(x - this.lake.x, z - this.lake.z) / this.lake.radius;
        if (dl < 1.45) {
          if (dl < 1) {
            const bowl = this.lake.level - 0.4 - 1.8 * (1 - dl * dl);
            h = Math.min(h, bowl);
            water = WATER_LAKE;
          } else {
            const rim = this.lake.level + 0.35 + (dl - 1) * 2;
            h = lerp(Math.max(h, this.lake.level + 0.35), h, smoothstep(1, 1.45, dl)) ;
            h = Math.max(Math.min(h, rim + 3), this.lake.level + 0.3);
          }
        }

        // River channel.
        const r = this.riverQuery(x, z);
        if (r.d < r.width * 2.4) {
          const channel = r.level - 0.85 * Math.max(0, 1 - (r.d / r.width) ** 2);
          if (r.d < r.width) {
            h = Math.min(h, channel);
            water = WATER_RIVER;
          } else {
            const bank = lerp(r.level + 0.25, h, smoothstep(r.width, r.width * 2.4, r.d));
            h = Math.min(h, bank);
          }
        }

        if (water === WATER_NONE && h < CONFIG.world.seaLevel + 0.12) water = WATER_SEA;
        if (water === WATER_RIVER && r.level <= 0.12) water = WATER_SEA;
        this.heights[index] = h;
        this.water[index] = water;
      }
    }

    // The Drizzleville bridge: east–west across the river, between Puddleton and Drizzleville.
    {
      const z = 14;
      const x0 = 3.5;
      const x1 = 17.5;
      const deck = Math.max(this.heightAt(x0, z), this.heightAt(x1, z), this.riverQuery(10.4, z).level + 0.7) + 0.12;
      this.bridges.push({ x0, z0: z, x1, z1: z, halfWidth: 1.3, deck });
    }

    // Drinking spots: land vertices next to river/lake water, sampled sparsely.
    for (let iz = 2; iz < this.verts - 2; iz += 3) {
      for (let ix = 2; ix < this.verts - 2; ix += 3) {
        const index = iz * this.verts + ix;
        if (this.water[index] !== WATER_NONE || this.heights[index] < 0.6) continue;
        const near =
          this.water[index + 2] === WATER_RIVER ||
          this.water[index - 2] === WATER_RIVER ||
          this.water[index + this.verts * 2] === WATER_RIVER ||
          this.water[index - this.verts * 2] === WATER_RIVER ||
          this.water[index + 2] === WATER_LAKE ||
          this.water[index - 2] === WATER_LAKE;
        if (near) this.drinkPoints.push(-this.half + ix * this.step, -this.half + iz * this.step);
      }
    }
  }

  private riverQuery(x: number, z: number): { d: number; level: number; width: number } {
    const p = this.river.points;
    let best = { d: Infinity, level: 0, width: 2 };
    for (let i = 0; i < p.length / 2 - 1; i++) {
      const { d, t } = distToSegment(x, z, p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]);
      if (d < best.d) {
        best = {
          d,
          level: lerp(this.river.levels[i], this.river.levels[i + 1], t),
          width: lerp(this.river.widths[i], this.river.widths[i + 1], t),
        };
      }
    }
    return best;
  }

  /** Island shape + hills + mountains, before settlements/lake/river edits. */
  rawHeight(x: number, z: number): number {
    const s = this.seed;
    const len = Math.hypot(x, z);
    const angle = Math.atan2(z, x);
    const coast =
      CONFIG.world.islandRadius - 4 +
      9 * fbm(Math.cos(angle) * 1.6 + 10, Math.sin(angle) * 1.6 + 10, s + 7, 3) +
      3 * fbm(Math.cos(angle) * 5 + 3, Math.sin(angle) * 5 + 3, s + 11, 2);
    const d = len / coast;

    // North-west cliffs: a sharper coastal falloff with a raised shoulder.
    const nwx = -0.62;
    const nwz = -0.78;
    const facing = len > 0.001 ? (x * nwx + z * nwz) / len : 0;
    const cliff = smoothstep(0.35, 0.8, facing);
    const softLand = 1 - smoothstep(0.76, 1.04, d);
    const hardLand = 1 - smoothstep(0.93, 0.985, d);
    const land = lerp(softLand, hardLand, cliff);

    const hills = fbm(x * 0.028 + 3.1, z * 0.028 - 1.7, s + 3, 4);
    const detail = fbm(x * 0.11, z * 0.11, s + 19, 2);
    let h = lerp(-7.5, 2.2 + cliff * 3.5, land) + land * (hills * 4.2 + 1.6 + detail * 0.5);

    // Mountain massif with a ridged crown.
    const mdx = x + 8;
    const mdz = z + 38;
    const md2 = mdx * mdx + mdz * mdz;
    const ridge = 1 - Math.abs(fbm(x * 0.07 + 5, z * 0.07 + 5, s + 23, 3));
    h += land * Math.exp(-md2 / (2 * 15 * 15)) * 17 * (0.7 + 0.45 * ridge);
    const m2x = x + 30;
    const m2z = z + 22;
    h += land * Math.exp(-(m2x * m2x + m2z * m2z) / (2 * 10 * 10)) * 9 * (0.75 + 0.4 * ridge);
    // Highland shoulder that holds the lake.
    const lx = x - 30;
    const lz = z + 20;
    h += land * Math.exp(-(lx * lx + lz * lz) / (2 * 17 * 17)) * 3.5;
    return h;
  }

  private rawHeightWithSites(x: number, z: number): number {
    let h = this.rawHeight(x, z);
    for (const site of this.sites) {
      if (site.height === 0) continue;
      const d = Math.hypot(x - site.x, z - site.z);
      const w = 1 - smoothstep(site.radius * 0.7, site.radius * 2.1, d);
      if (w > 0) h = lerp(h, site.height + fbm(x * 0.2, z * 0.2, this.seed + 41, 2) * 0.18, w);
    }
    return h;
  }

  private clampIndex(x: number, z: number): { fx: number; fz: number; ix: number; iz: number } {
    const fx = Math.min(this.segments - 0.0001, Math.max(0, (x + this.half) / this.step));
    const fz = Math.min(this.segments - 0.0001, Math.max(0, (z + this.half) / this.step));
    return { fx, fz, ix: Math.floor(fx), iz: Math.floor(fz) };
  }

  /** Bilinear height. Outside the map returns the sea floor. */
  heightAt(x: number, z: number): number {
    if (Math.abs(x) > this.half || Math.abs(z) > this.half) return -8;
    const { fx, fz, ix, iz } = this.clampIndex(x, z);
    const tx = fx - ix;
    const tz = fz - iz;
    const v = this.verts;
    const a = this.heights[iz * v + ix];
    const b = this.heights[iz * v + ix + 1];
    const c = this.heights[(iz + 1) * v + ix];
    const d = this.heights[(iz + 1) * v + ix + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  waterAt(x: number, z: number): number {
    if (Math.abs(x) > this.half || Math.abs(z) > this.half) return WATER_SEA;
    const { fx, fz } = this.clampIndex(x, z);
    return this.water[Math.round(fz) * this.verts + Math.round(fx)];
  }

  /** Approximate slope magnitude (rise over run). */
  slopeAt(x: number, z: number): number {
    const e = 1;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  /** Surface height a visual object should sit on (water surface when wet). */
  surfaceAt(x: number, z: number): number {
    const h = this.heightAt(x, z);
    const w = this.waterAt(x, z);
    if (w === WATER_SEA) return Math.max(h, CONFIG.world.seaLevel);
    if (w === WATER_LAKE) return Math.max(h, this.lake.level);
    if (w === WATER_RIVER) return Math.max(h, this.riverQuery(x, z).level);
    return h;
  }

  /** The bridge under a point, if any. */
  bridgeAt(x: number, z: number): { deck: number } | null {
    for (const b of this.bridges) {
      const dx = b.x1 - b.x0;
      const dz = b.z1 - b.z0;
      const len2 = dx * dx + dz * dz;
      const t = Math.min(1, Math.max(0, ((x - b.x0) * dx + (z - b.z0) * dz) / len2));
      const d = Math.hypot(x - (b.x0 + dx * t), z - (b.z0 + dz * t));
      if (d <= b.halfWidth && t > 0 && t < 1) return b;
    }
    return null;
  }

  /** Height a walker stands at: the bridge deck over water, otherwise the ground. */
  walkHeightAt(x: number, z: number): number {
    const b = this.bridgeAt(x, z);
    return b ? Math.max(b.deck, this.heightAt(x, z)) : this.heightAt(x, z);
  }

  isLand(x: number, z: number): boolean {
    return this.waterAt(x, z) === WATER_NONE && this.heightAt(x, z) > 0.35;
  }

  riverLevelAt(x: number, z: number): { d: number; level: number; width: number } {
    return this.riverQuery(x, z);
  }
}
