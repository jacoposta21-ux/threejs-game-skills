import { CONFIG } from '../core/Config';
import type { BuildingData } from '../core/types';
import type { TerrainData } from '../world/TerrainGen';

/**
 * A* over a 2-unit walk grid. Water, steep slopes and building footprints are
 * blocked. Paths are simplified with a line-of-sight pass so villagers walk in
 * natural straight segments instead of grid zig-zags.
 */
export class Pathfinding {
  readonly cell = 2;
  readonly dim: number;
  private readonly half: number;
  private readonly terrainBlocked: Uint8Array;
  private readonly blocked: Uint8Array;
  private readonly g: Float32Array;
  private readonly f: Float32Array;
  private readonly parent: Int32Array;
  private readonly stamp: Uint32Array;
  private readonly closed: Uint32Array;
  private search = 1;
  private readonly heap: number[] = [];

  constructor(terrain: TerrainData) {
    this.dim = Math.ceil(CONFIG.world.size / this.cell);
    this.half = CONFIG.world.size / 2;
    const n = this.dim * this.dim;
    this.terrainBlocked = new Uint8Array(n);
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    for (let cz = 0; cz < this.dim; cz++) {
      for (let cx = 0; cx < this.dim; cx++) {
        const x = -this.half + (cx + 0.5) * this.cell;
        const z = -this.half + (cz + 0.5) * this.cell;
        const ok = terrain.isLand(x, z) && terrain.slopeAt(x, z) < 1.15;
        this.terrainBlocked[cz * this.dim + cx] = ok ? 0 : 1;
      }
    }
    this.blocked.set(this.terrainBlocked);
  }

  rebuildObstacles(buildings: BuildingData[]): void {
    this.blocked.set(this.terrainBlocked);
    for (const b of buildings) {
      if (b.destroyed || b.type === 'farm') continue; // fields are walkable
      const r = b.footprint * 0.85;
      for (let cz = 0; cz < this.dim; cz++) {
        const z = -this.half + (cz + 0.5) * this.cell;
        if (Math.abs(z - b.z) > r + this.cell) continue;
        for (let cx = 0; cx < this.dim; cx++) {
          const x = -this.half + (cx + 0.5) * this.cell;
          if (Math.hypot(x - b.x, z - b.z) < r) this.blocked[cz * this.dim + cx] = 1;
        }
      }
    }
  }

  private toCell(x: number, z: number): number {
    const cx = Math.min(this.dim - 1, Math.max(0, Math.floor((x + this.half) / this.cell)));
    const cz = Math.min(this.dim - 1, Math.max(0, Math.floor((z + this.half) / this.cell)));
    return cz * this.dim + cx;
  }

  isWalkable(x: number, z: number): boolean {
    if (Math.abs(x) >= this.half || Math.abs(z) >= this.half) return false;
    return this.blocked[this.toCell(x, z)] === 0;
  }

  /** Nearest walkable point, searching outward in rings. */
  nearestWalkable(x: number, z: number): { x: number; z: number } | null {
    if (this.isWalkable(x, z)) return { x, z };
    for (let r = 1; r < 12; r++) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * r * this.cell * 0.75;
        const pz = z + Math.sin(a) * r * this.cell * 0.75;
        if (this.isWalkable(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  }

  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!this.isWalkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /**
   * Returns a flattened [x, z, ...] path excluding the start, or null when no
   * route exists. Goals inside obstacles are snapped to the nearest walkable cell.
   */
  findPath(sx: number, sz: number, tx: number, tz: number, maxExpansions = 3500): number[] | null {
    const goalPoint = this.nearestWalkable(tx, tz);
    if (!goalPoint) return null;
    if (this.lineOfSight(sx, sz, goalPoint.x, goalPoint.z)) return [goalPoint.x, goalPoint.z];
    const start = this.toCell(sx, sz);
    const goal = this.toCell(goalPoint.x, goalPoint.z);
    const dim = this.dim;
    const id = ++this.search;
    const heap = this.heap;
    heap.length = 0;
    const gx = goal % dim;
    const gz = Math.floor(goal / dim);
    const h = (c: number) => {
      const dx = Math.abs((c % dim) - gx);
      const dz = Math.abs(Math.floor(c / dim) - gz);
      return Math.max(dx, dz) + 0.41421 * Math.min(dx, dz);
    };
    this.stamp[start] = id;
    this.g[start] = 0;
    this.f[start] = h(start);
    this.parent[start] = -1;
    this.push(start);
    let expansions = 0;
    let found = false;
    while (heap.length && expansions < maxExpansions) {
      const current = this.pop();
      if (this.closed[current] === id) continue;
      this.closed[current] = id;
      expansions++;
      if (current === goal) {
        found = true;
        break;
      }
      const cx = current % dim;
      const cz = Math.floor(current / dim);
      for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oz) continue;
          const nx = cx + ox;
          const nz = cz + oz;
          if (nx < 0 || nz < 0 || nx >= dim || nz >= dim) continue;
          const next = nz * dim + nx;
          if (this.blocked[next] && next !== goal) continue;
          if (ox && oz && (this.blocked[cz * dim + nx] || this.blocked[nz * dim + cx])) continue;
          const cost = this.g[current] + (ox && oz ? 1.41421 : 1);
          if (this.stamp[next] === id && cost >= this.g[next]) continue;
          this.stamp[next] = id;
          this.g[next] = cost;
          this.f[next] = cost + h(next);
          this.parent[next] = current;
          this.push(next);
        }
      }
    }
    if (!found) return null;

    const cells: number[] = [];
    for (let c = goal; c !== -1 && c !== start; c = this.parent[c]) cells.push(c);
    cells.reverse();
    const raw: number[] = [];
    for (const c of cells) {
      raw.push(-this.half + ((c % dim) + 0.5) * this.cell, -this.half + (Math.floor(c / dim) + 0.5) * this.cell);
    }
    raw[raw.length - 2] = goalPoint.x;
    raw[raw.length - 1] = goalPoint.z;

    // Line-of-sight simplification.
    const out: number[] = [];
    let ax = sx;
    let az = sz;
    let i = 0;
    const count = raw.length / 2;
    while (i < count) {
      let j = count - 1;
      while (j > i && !this.lineOfSight(ax, az, raw[j * 2], raw[j * 2 + 1])) j--;
      out.push(raw[j * 2], raw[j * 2 + 1]);
      ax = raw[j * 2];
      az = raw[j * 2 + 1];
      i = j + 1;
    }
    return out;
  }

  private push(node: number): void {
    const heap = this.heap;
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[heap[p]] <= this.f[heap[i]]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  }

  private pop(): number {
    const heap = this.heap;
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && this.f[heap[l]] < this.f[heap[m]]) m = l;
        if (r < heap.length && this.f[heap[r]] < this.f[heap[m]]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  }
}
