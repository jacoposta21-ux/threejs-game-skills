// Field state: tilled plots, crops and debris. Keys are world tile indices.
import { CROPS, DEBRIS } from './data/crops.js';
import { T } from './world.js';
import { MAP } from './data/map.js';

const REVERT_DAYS = 3; // empty, dry tilled soil turns back into field after this many nights

export class Farm {
  constructor(world) {
    this.world = world;
    this.plots = new Map();  // key -> { w: watered, c: cropId|null, g: growth days, dry: nights empty+dry }
    this.debris = new Map(); // key -> debris type
  }

  key(x, y) { return this.world.idx(x, y); }
  plot(x, y) { return this.plots.get(this.key(x, y)) || null; }
  debrisAt(x, y) { return this.debris.get(this.key(x, y)) || null; }
  isField(x, y) { return this.world.tile(x, y) === T.FIELD; }

  scatterDebris(rng) {
    const f = this.world.field;
    const [cx, cy, cw, ch] = MAP.field.cleared; // pre-cleared patch by the gate
    const pool = [];
    for (const [k, d] of Object.entries(DEBRIS)) for (let i = 0; i < d.weight; i++) pool.push(k);
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
      if (x >= cx && x < cx + cw && y >= cy && y < cy + ch) continue;
      if (rng.chance(0.42)) this.debris.set(this.key(x, y), rng.pick(pool));
    }
  }

  canTill(x, y) { return this.isField(x, y) && !this.plot(x, y) && !this.debrisAt(x, y); }
  till(x, y) { if (!this.canTill(x, y)) return false; this.plots.set(this.key(x, y), { w: false, c: null, g: 0, dry: 0 }); return true; }

  canWater(x, y) { const p = this.plot(x, y); return !!p && !p.w; }
  water(x, y) { const p = this.plot(x, y); if (!p || p.w) return false; p.w = true; return true; }

  canPlant(x, y) { const p = this.plot(x, y); return !!p && !p.c; }
  plant(x, y, cropId) { const p = this.plot(x, y); if (!p || p.c) return false; p.c = cropId; p.g = 0; p.dry = 0; return true; }

  isMature(p) { return !!(p && p.c && p.g >= CROPS[p.c].days); }
  harvest(x, y) {
    const p = this.plot(x, y);
    if (!this.isMature(p)) return null;
    const crop = CROPS[p.c];
    if (crop.regrow) p.g = crop.days - crop.regrow; // stays planted and fruits again
    else { p.c = null; p.g = 0; }
    return crop.produce;
  }

  clearDebris(x, y) { const k = this.key(x, y); const d = this.debris.get(k); if (!d) return null; this.debris.delete(k); return d; }

  stage(p) {
    const c = CROPS[p.c];
    if (p.g >= c.days) return c.stages - 1;
    return Math.min(c.stages - 2, Math.floor((p.g * (c.stages - 1)) / c.days));
  }

  // Overnight: watered crops grow, then everything dries out.
  nightly() {
    let grown = 0;
    for (const [k, p] of this.plots) {
      if (p.c) {
        if (p.w && p.g < CROPS[p.c].days) { p.g++; grown++; }
      } else if (!p.w) {
        p.dry++;
        if (p.dry >= REVERT_DAYS) { this.plots.delete(k); continue; }
      } else p.dry = 0;
      p.w = false;
    }
    return grown;
  }

  rain() { for (const p of this.plots.values()) p.w = true; }

  toJSON() {
    return {
      plots: [...this.plots].map(([k, p]) => [k, p.w ? 1 : 0, p.c, p.g, p.dry]),
      debris: [...this.debris],
    };
  }

  load(o) {
    this.plots.clear(); this.debris.clear();
    for (const [k, w, c, g, dry] of o.plots || []) this.plots.set(k, { w: !!w, c: c && CROPS[c] ? c : null, g, dry });
    for (const [k, d] of o.debris || []) if (DEBRIS[d]) this.debris.set(k, d);
  }
}
