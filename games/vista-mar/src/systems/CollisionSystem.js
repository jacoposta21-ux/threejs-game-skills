// Static-world collision: axis-aligned boxes (with a top height) and vertical
// cylinders, bucketed in a uniform spatial hash. Supports character push-out,
// standing on low tops, and camera ray casts.
const CELL = 16;

export class CollisionSystem {
  constructor() {
    this.boxes = [];
    this.circles = [];
    this.grid = new Map();
    this.stamp = 1;
    this.big = []; // huge boundary boxes kept out of the grid
  }

  key(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }

  insert(entry, x0, z0, x1, z1) {
    const ix0 = Math.floor(x0 / CELL), ix1 = Math.floor(x1 / CELL);
    const iz0 = Math.floor(z0 / CELL), iz1 = Math.floor(z1 / CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const k = this.key(ix, iz);
      let list = this.grid.get(k);
      if (!list) { list = []; this.grid.set(k, list); }
      list.push(entry);
    }
  }

  addBox(x0, z0, x1, z1, top, kind = 'solid') {
    const e = { t: 0, x0, z0, x1, z1, top, kind, s: 0 };
    if ((x1 - x0) * (z1 - z0) > 400000) { this.big.push(e); return e; }
    this.boxes.push(e);
    this.insert(e, x0, z0, x1, z1);
    return e;
  }

  addCircle(x, z, r, top = 99, kind = 'pole') {
    const e = { t: 1, x, z, r, top, kind, s: 0 };
    this.circles.push(e);
    this.insert(e, x - r, z - r, x + r, z + r);
    return e;
  }

  query(x0, z0, x1, z1, out) {
    out.length = 0;
    const st = ++this.stamp;
    const ix0 = Math.floor(x0 / CELL), ix1 = Math.floor(x1 / CELL);
    const iz0 = Math.floor(z0 / CELL), iz1 = Math.floor(z1 / CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const list = this.grid.get(this.key(ix, iz));
      if (!list) continue;
      for (const e of list) if (e.s !== st) { e.s = st; out.push(e); }
    }
    for (const e of this.big) out.push(e);
    return out;
  }

  /** True when a circle at (x,z) overlaps a solid (optionally only given kinds). */
  blockedCircle(x, z, r, kinds = null) {
    const list = this.query(x - r, z - r, x + r, z + r, this._tmp || (this._tmp = []));
    for (const e of list) {
      if (kinds && !kinds.includes(e.kind)) continue;
      if (e.t === 0) {
        const cx = Math.max(e.x0, Math.min(x, e.x1)), cz = Math.max(e.z0, Math.min(z, e.z1));
        if ((cx - x) ** 2 + (cz - z) ** 2 < r * r) return true;
      } else if ((e.x - x) ** 2 + (e.z - z) ** 2 < (e.r + r) ** 2) return true;
    }
    return false;
  }

  /**
   * Pushes a character circle out of solids whose top is above its step height.
   * Returns { x, z, ground, hit } where ground is the highest standable top under it.
   */
  resolveCharacter(x, z, r, feetY, stepH, baseGround, height = 1.8) {
    const list = this.query(x - r - 1, z - r - 1, x + r + 1, z + r + 1, this._tmp2 || (this._tmp2 = []));
    let ground = baseGround;
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const e of list) {
        if (e.t === 0) {
          const cx = Math.max(e.x0, Math.min(x, e.x1)), cz = Math.max(e.z0, Math.min(z, e.z1));
          const dx = x - cx, dz = z - cz;
          const d2 = dx * dx + dz * dz;
          const inside = x > e.x0 && x < e.x1 && z > e.z0 && z < e.z1;
          if (d2 >= r * r && !inside) continue;
          if (e.top <= feetY + stepH) {
            // standable: only counts as ground when the centre is over it
            if (x >= e.x0 - r * 0.3 && x <= e.x1 + r * 0.3 && z >= e.z0 - r * 0.3 && z <= e.z1 + r * 0.3) ground = Math.max(ground, e.top);
            continue;
          }
          if (feetY > e.top - 0.05) continue;
          if (inside) {
            // push out along the shortest axis
            const pl = x - e.x0, pr = e.x1 - x, pb = z - e.z0, pf = e.z1 - z;
            const m = Math.min(pl, pr, pb, pf);
            if (m === pl) x = e.x0 - r; else if (m === pr) x = e.x1 + r; else if (m === pb) z = e.z0 - r; else z = e.z1 + r;
          } else {
            const d = Math.sqrt(d2) || 1e-6;
            x = cx + (dx / d) * r;
            z = cz + (dz / d) * r;
          }
          hit = moved = true;
        } else {
          const dx = x - e.x, dz = z - e.z;
          const rr = e.r + r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          if (e.top <= feetY + stepH) { ground = Math.max(ground, e.top); continue; }
          const d = Math.sqrt(d2) || 1e-6;
          x = e.x + (dx / d) * rr;
          z = e.z + (dz / d) * rr;
          hit = moved = true;
        }
      }
      if (!moved) break;
    }
    void height;
    return { x, z, ground, hit };
  }

  /** Ray (segment) cast against boxes (as 3D slabs from y=0 to top). Returns t in [0,1]. */
  raycast(ax, ay, az, bx, by, bz) {
    const list = this.query(Math.min(ax, bx) - 1, Math.min(az, bz) - 1, Math.max(ax, bx) + 1, Math.max(az, bz) + 1, this._tmp3 || (this._tmp3 = []));
    let best = 1;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    for (const e of list) {
      if (e.t !== 0 || e.kind === 'bound' || e.top < 2.5) continue;
      let t0 = 0, t1 = best;
      const slabs = [[ax, dx, e.x0, e.x1], [ay, dy, -1, e.top], [az, dz, e.z0, e.z1]];
      let ok = true;
      for (const [o, d, mn, mx] of slabs) {
        if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { ok = false; break; } continue; }
        let ta = (mn - o) / d, tb = (mx - o) / d;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < best) best = t0;
    }
    return best;
  }
}
