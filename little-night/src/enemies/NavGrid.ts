import * as THREE from 'three';
import type { CollisionWorld } from '../physics/CollisionWorld';

export interface NavArea {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Grid A* for THE HUSH. Rebuilt when doors open or furniture moves. */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;
  private version = -1;

  constructor(
    readonly minX: number,
    readonly minZ: number,
    maxX: number,
    maxZ: number,
    readonly cell = 0.25,
    readonly areas: NavArea[] = [],
  ) {
    this.cols = Math.ceil((maxX - minX) / cell);
    this.rows = Math.ceil((maxZ - minZ) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  rebuildIfNeeded(world: CollisionWorld, radius = 0.26): boolean {
    if (world.layoutVersion === this.version) return false;
    this.version = world.layoutVersion;
    this.blocked.fill(0);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.minX + (c + 0.5) * this.cell;
        const z = this.minZ + (r + 0.5) * this.cell;
        if (this.areas.length && !this.areas.some((a) => x > a.minX && x < a.maxX && z > a.minZ && z < a.maxZ)) {
          this.blocked[r * this.cols + c] = 1;
        }
      }
    }
    for (const col of world.colliders) {
      if (!col.enabled || !col.navBlock) continue;
      const c0 = Math.max(0, Math.floor((col.min.x - radius - this.minX) / this.cell));
      const c1 = Math.min(this.cols - 1, Math.floor((col.max.x + radius - this.minX) / this.cell));
      const r0 = Math.max(0, Math.floor((col.min.z - radius - this.minZ) / this.cell));
      const r1 = Math.min(this.rows - 1, Math.floor((col.max.z + radius - this.minZ) / this.cell));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = this.minX + (c + 0.5) * this.cell;
          const z = this.minZ + (r + 0.5) * this.cell;
          const cx = THREE.MathUtils.clamp(x, col.min.x, col.max.x);
          const cz = THREE.MathUtils.clamp(z, col.min.z, col.max.z);
          if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) this.blocked[r * this.cols + c] = 1;
        }
      }
    }
    return true;
  }

  private cellOf(x: number, z: number): [number, number] {
    return [Math.floor((x - this.minX) / this.cell), Math.floor((z - this.minZ) / this.cell)];
  }

  private free(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.blocked[r * this.cols + c] === 0;
  }

  isWalkable(p: THREE.Vector3): boolean {
    const [c, r] = this.cellOf(p.x, p.z);
    return this.free(c, r);
  }

  nearestFree(p: THREE.Vector3, maxRing = 12): THREE.Vector3 | null {
    const [c0, r0] = this.cellOf(p.x, p.z);
    if (this.free(c0, r0)) return this.center(c0, r0);
    for (let ring = 1; ring <= maxRing; ring++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          if (!this.free(c0 + dc, r0 + dr)) continue;
          const d = dc * dc + dr * dr;
          if (d < bestD) {
            bestD = d;
            best = [c0 + dc, r0 + dr];
          }
        }
      }
      if (best) return this.center(best[0], best[1]);
    }
    return null;
  }

  private center(c: number, r: number): THREE.Vector3 {
    return new THREE.Vector3(this.minX + (c + 0.5) * this.cell, 0, this.minZ + (r + 0.5) * this.cell);
  }

  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    const start = this.nearestFree(from);
    const goal = this.nearestFree(to);
    if (!start || !goal) return null;
    const [sc, sr] = this.cellOf(start.x, start.z);
    const [gc, gr] = this.cellOf(goal.x, goal.z);
    const n = this.cols * this.rows;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open: number[] = [];
    const f = new Float32Array(n).fill(Infinity);
    const si = sr * this.cols + sc;
    const gi = gr * this.cols + gc;
    g[si] = 0;
    f[si] = this.h(sc, sr, gc, gr);
    open.push(si);
    let iterations = 0;
    while (open.length && iterations++ < 6000) {
      // small grids: linear min is fine
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open.splice(bi, 1);
      if (cur === gi) break;
      closed[cur] = 1;
      const cc = cur % this.cols;
      const cr = (cur / this.cols) | 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = cc + dc;
          const nr = cr + dr;
          if (!this.free(nc, nr)) continue;
          if (dr && dc && (!this.free(cc + dc, cr) || !this.free(cc, cr + dr))) continue;
          const ni = nr * this.cols + nc;
          if (closed[ni]) continue;
          const cost = g[cur] + (dr && dc ? 1.414 : 1);
          if (cost < g[ni]) {
            g[ni] = cost;
            came[ni] = cur;
            f[ni] = cost + this.h(nc, nr, gc, gr);
            if (!open.includes(ni)) open.push(ni);
          }
        }
      }
    }
    if (came[gi] === -1 && gi !== si) return null;
    const cells: number[] = [];
    for (let i = gi; i !== -1; i = came[i]) {
      cells.push(i);
      if (i === si) break;
    }
    cells.reverse();
    const pts = cells.map((i) => this.center(i % this.cols, (i / this.cols) | 0));
    return this.smooth(pts);
  }

  private h(c: number, r: number, gc: number, gr: number): number {
    const dx = Math.abs(c - gc);
    const dr = Math.abs(r - gr);
    return dx + dr + (1.414 - 2) * Math.min(dx, dr);
  }

  /** String-pulling via grid line checks. */
  private smooth(pts: THREE.Vector3[]): THREE.Vector3[] {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this.clearLine(pts[anchor], pts[i])) {
        out.push(pts[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  clearLine(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const d = a.distanceTo(b);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const [c, r] = this.cellOf(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (!this.free(c, r)) return false;
    }
    return true;
  }
}
