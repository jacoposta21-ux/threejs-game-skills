import { CELL, Cell, type MapData } from './types.ts';

const SQRT2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

export function isDrivable(t: number): boolean {
  return t === Cell.ROAD || t === Cell.SIDEWALK || t === Cell.PLAZA || t === Cell.QUAY;
}

/**
 * Grid pathfinder over the 2 m cell grid (8-connected, no corner cutting).
 * All buffers are preallocated so repeated queries do not allocate.
 */
export class PathGrid {
  readonly cols: number;
  readonly rows: number;
  readonly pass: Uint8Array;
  private g: Float32Array;
  private parent: Int32Array;
  private closed: Uint8Array;
  private heap: Int32Array;
  private heapF: Float32Array;
  private heapSize = 0;
  private stamp: Uint32Array;
  private curStamp = 1;

  /** extra traversal cost per cell (guidance mode keeps routes away from walls) */
  private extra: Float32Array;

  constructor(map: Pick<MapData, 'cols' | 'rows' | 'cells'>, wallPenalty = 0) {
    this.cols = map.cols;
    this.rows = map.rows;
    const n = map.cols * map.rows;
    this.pass = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.pass[i] = isDrivable(map.cells[i]) ? 1 : 0;
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.heap = new Int32Array(n * 4 + 16);
    this.heapF = new Float32Array(n * 4 + 16);
    this.stamp = new Uint32Array(n);
    this.extra = new Float32Array(n);
    if (wallPenalty > 0)
      for (let z = 0; z < this.rows; z++)
        for (let x = 0; x < this.cols; x++) {
          let near = 0;
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              const zz = z + dz;
              if (xx < 0 || zz < 0 || xx >= this.cols || zz >= this.rows || !this.pass[zz * this.cols + xx]) near = 1;
            }
          this.extra[z * this.cols + x] = near * wallPenalty + (map.cells[z * this.cols + x] === 2 ? wallPenalty * 0.5 : 0);
        }
  }

  cellOf(x: number, z: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL)));
    const cz = Math.min(this.rows - 1, Math.max(0, Math.floor(z / CELL)));
    return cz * this.cols + cx;
  }

  /** nearest passable cell to the given cell (spiral search) */
  nearestPassable(idx: number): number {
    if (this.pass[idx]) return idx;
    const cx = idx % this.cols;
    const cz = (idx / this.cols) | 0;
    for (let r = 1; r < 12; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= this.cols || z >= this.rows) continue;
          const j = z * this.cols + x;
          if (this.pass[j]) return j;
        }
      }
    }
    return idx;
  }

  private reset() {
    this.curStamp++;
    if (this.curStamp === 0xffffffff) {
      this.stamp.fill(0);
      this.curStamp = 1;
    }
    this.heapSize = 0;
  }
  private touch(i: number) {
    if (this.stamp[i] !== this.curStamp) {
      this.stamp[i] = this.curStamp;
      this.g[i] = Infinity;
      this.parent[i] = -1;
      this.closed[i] = 0;
    }
  }
  private push(i: number, f: number) {
    let k = this.heapSize++;
    const h = this.heap;
    const hf = this.heapF;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= f) break;
      h[k] = h[p];
      hf[k] = hf[p];
      k = p;
    }
    h[k] = i;
    hf[k] = f;
  }
  private pop(): number {
    const h = this.heap;
    const hf = this.heapF;
    const top = h[0];
    const n = --this.heapSize;
    const li = h[n];
    const lf = hf[n];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= n) break;
      if (c + 1 < n && hf[c + 1] < hf[c]) c++;
      if (hf[c] >= lf) break;
      h[k] = h[c];
      hf[k] = hf[c];
      k = c;
    }
    h[k] = li;
    hf[k] = lf;
    return top;
  }

  /**
   * A* from start to goal cell. Returns path length in metres (Infinity if unreachable).
   * If outPath is given it is filled with cell indices start..goal.
   */
  astar(start: number, goal: number, outPath?: number[]): number {
    this.reset();
    const cols = this.cols;
    const gx = goal % cols;
    const gz = (goal / cols) | 0;
    this.touch(start);
    this.g[start] = 0;
    this.push(start, 0);
    while (this.heapSize > 0) {
      const cur = this.pop();
      if (this.closed[cur]) continue;
      this.closed[cur] = 1;
      if (cur === goal) break;
      const cx = cur % cols;
      const cz = (cur / cols) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d];
        const nz = cz + DZ[d];
        if (nx < 0 || nz < 0 || nx >= cols || nz >= this.rows) continue;
        const ni = nz * cols + nx;
        if (!this.pass[ni]) continue;
        if (d >= 4 && (!this.pass[cz * cols + nx] || !this.pass[nz * cols + cx])) continue;
        this.touch(ni);
        if (this.closed[ni]) continue;
        const ng = this.g[cur] + (d >= 4 ? SQRT2 : 1) + this.extra[ni];
        if (ng < this.g[ni]) {
          this.g[ni] = ng;
          this.parent[ni] = cur;
          const ddx = Math.abs(nx - gx);
          const ddz = Math.abs(nz - gz);
          const h = Math.max(ddx, ddz) + (SQRT2 - 1) * Math.min(ddx, ddz);
          this.push(ni, ng + h);
        }
      }
    }
    this.touch(goal);
    const dist = this.g[goal];
    if (outPath) {
      outPath.length = 0;
      if (dist < Infinity) {
        let c = goal;
        while (c !== -1) {
          outPath.push(c);
          c = this.parent[c];
        }
        outPath.reverse();
      }
    }
    return dist * CELL;
  }
}

/** Shortest open tour start -> all goals (any order). Returns length and visiting order. */
export function bestTour(dist: number[][]): { length: number; order: number[] } {
  // dist[0] is start; indices 1..k are goals.
  const k = dist.length - 1;
  const idx = Array.from({ length: k }, (_, i) => i + 1);
  let best = Infinity;
  let bestOrder: number[] = idx.slice();
  const perm = (arr: number[], l: number) => {
    if (l === arr.length) {
      let len = dist[0][arr[0]];
      for (let i = 1; i < arr.length; i++) len += dist[arr[i - 1]][arr[i]];
      if (len < best) {
        best = len;
        bestOrder = arr.slice();
      }
      return;
    }
    for (let i = l; i < arr.length; i++) {
      [arr[l], arr[i]] = [arr[i], arr[l]];
      perm(arr, l + 1);
      [arr[l], arr[i]] = [arr[i], arr[l]];
    }
  };
  perm(idx, 0);
  return { length: best, order: bestOrder };
}
