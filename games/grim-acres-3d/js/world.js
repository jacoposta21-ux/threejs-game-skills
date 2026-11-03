// Tile world: builds Mildew Hollow from js/data/map.js. Outdoors and every interior live in ONE grid
// (interiors are packed below the outdoor map) so collision and A* work everywhere; doors are
// portal edges between the two.
import { MAP } from './data/map.js';
import { RNG, hash2 } from './rng.js';

export const TILE = 16;
export const T = {
  VOID: 0, GRASS: 1, PATH: 2, STONE: 3, WATER: 4, BRIDGE: 5, FIELD: 6,
  FLOOR: 7, WALL: 8, SAND: 9, FLOWERS: 10, MAT: 11, FENCE: 12,
};
const SOLID_GROUND = new Set([T.VOID, T.WATER, T.WALL, T.FENCE]);

export class World {
  constructor() {
    this.w = MAP.width;
    this.outH = MAP.height;
    this.areas = [];
    this.areaById = {};
    this.objects = [];
    this.portals = new Map(); // tile index -> { kind:'door'|'exit', to:{x,y}, building }
    this.locations = {};
    this.lights = [];         // static night lights {x,y,r} in px
    this.buildings = [];
    this.searchables = {};    // key "areaId:kind" -> object
    this._layoutInteriors();
    this.ground = new Uint8Array(this.w * this.h);
    this.areaGrid = new Uint8Array(this.w * this.h).fill(255);
    this.objGrid = new Int32Array(this.w * this.h).fill(-1);
    this.solid = new Uint8Array(this.w * this.h);
    this._build();
    this.recomputeSolid();
  }

  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  tile(x, y) { return this.inBounds(x, y) ? this.ground[this.idx(x, y)] : T.VOID; }
  setTile(x, y, t) { if (this.inBounds(x, y)) this.ground[this.idx(x, y)] = t; }
  isSolid(x, y) { return !this.inBounds(x, y) || this.solid[this.idx(x, y)] === 1; }
  areaAt(x, y) { if (!this.inBounds(x, y)) return null; const a = this.areaGrid[this.idx(x, y)]; return a === 255 ? null : this.areas[a]; }
  objectAt(x, y) { if (!this.inBounds(x, y)) return null; const i = this.objGrid[this.idx(x, y)]; return i >= 0 ? this.objects[i] : null; }
  portalAt(x, y) { return this.inBounds(x, y) ? this.portals.get(this.idx(x, y)) || null : null; }

  // ---------- building ----------
  _layoutInteriors() {
    // Pack interior rooms in rows below the outdoor map.
    const defs = [];
    for (const [id, d] of Object.entries(MAP.interiors)) defs.push({ id, ...d });
    for (const b of MAP.buildings) {
      if (b.owner) defs.push({ id: b.interior, ...MAP.houseTemplate, items: [...MAP.houseTemplate.items, ...(MAP.houseExtras[b.owner] || [])], wall: MAP.houseWalls[b.owner], owner: b.owner });
    }
    let x = 1, y = this.outH + 2, rowH = 0;
    for (const d of defs) {
      if (x + d.w > this.w - 1) { x = 1; y += rowH + 2; rowH = 0; }
      d.ox = x; d.oy = y;
      x += d.w + 2;
      rowH = Math.max(rowH, d.h);
    }
    this.h = y + rowH + 1;
    this._interiorDefs = defs;
  }

  _addArea(a) {
    a.index = this.areas.length;
    this.areas.push(a);
    this.areaById[a.id] = a;
    for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) this.areaGrid[this.idx(x, y)] = a.index;
    return a;
  }

  addObject(o) {
    o.index = this.objects.length;
    o.w = o.w || 1; o.h = o.h || 1;
    this.objects.push(o);
    if (!o.flat) {
      for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) {
        if (this.inBounds(x, y)) this.objGrid[this.idx(x, y)] = o.index;
      }
    }
    return o;
  }

  removeObject(o) {
    if (!o || o.removed) return;
    o.removed = true;
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) {
      if (this.inBounds(x, y) && this.objGrid[this.idx(x, y)] === o.index) this.objGrid[this.idx(x, y)] = -1;
    }
    this.recomputeSolid();
  }

  recomputeSolid() {
    for (let i = 0; i < this.solid.length; i++) {
      let s = SOLID_GROUND.has(this.ground[i]) ? 1 : 0;
      const oi = this.objGrid[i];
      if (oi >= 0) {
        const o = this.objects[oi];
        if (!o.removed && o.solid !== false) s = 1;
      }
      if (this.portals.has(i)) s = 0; // doors and mats are always passable (locks are checked for the player only)
      this.solid[i] = s;
    }
  }

  _rect(r, t) {
    const [x0, y0, w, h] = r;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.setTile(x, y, t);
  }

  _build() {
    const W = this.w, H = this.outH;
    const reserved = new Uint8Array(W * H);
    const reserve = (x0, y0, w, h, pad = 0) => {
      for (let y = y0 - pad; y < y0 + h + pad; y++) for (let x = x0 - pad; x < x0 + w + pad; x++) {
        if (x >= 0 && y >= 0 && x < W && y < H) reserved[y * W + x] = 1;
      }
    };

    this._addArea({ id: 'outdoor', x: 0, y: 0, w: W, h: H, outdoor: true });
    this._rect([0, 0, W, H], T.GRASS);

    // River with sand banks
    const rv = MAP.river;
    for (let y = 0; y < H; y++) {
      for (let x = rv.x; x < rv.x + rv.w; x++) this.setTile(x, y, T.WATER);
      if (y >= 2 && y < H - 2) { this.setTile(rv.x - 1, y, T.SAND); this.setTile(rv.x + rv.w, y, T.SAND); }
    }
    reserve(rv.x - 1, 0, rv.w + 2, H, 1);
    this._rect(MAP.bridge, T.BRIDGE);

    // Plaza and paths
    this._rect(MAP.plaza, T.STONE);
    reserve(...MAP.plaza, 1);
    for (const p of MAP.paths) { this._rect(p, T.PATH); reserve(...p, 1); }

    // Flower beds (walkable decoration)
    for (const f of MAP.flowers) { this._rect(f, T.FLOWERS); reserve(...f, 1); }

    // Field: fence on the border, soil inside, gate gap on the top edge
    const [fx, fy, fw, fh] = MAP.field.rect;
    for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) {
      const edge = x === fx || y === fy || x === fx + fw - 1 || y === fy + fh - 1;
      this.setTile(x, y, edge ? T.FENCE : T.FIELD);
    }
    for (const gx of MAP.field.gate) this.setTile(gx, fy, T.PATH);
    reserve(fx, fy, fw, fh, 1);
    this.field = { x: fx + 1, y: fy + 1, w: fw - 2, h: fh - 2 };

    // Farm yard stays mostly clear
    reserve(2, 2, 22, 9);

    // Interiors first (buildings link to them)
    for (const d of this._interiorDefs) this._buildInterior(d);

    // Buildings
    for (const b of MAP.buildings) {
      const doorX = b.x + b.door, doorY = b.y + b.h - 1;
      const o = this.addObject({ kind: 'building', x: b.x, y: b.y, w: b.w, h: b.h, def: b, id: b.id });
      this.buildings.push(o);
      const inner = this.areaById[b.interior];
      inner.building = b.id;
      inner.lock = b.lock || null;
      // door tile -> just inside the mat; mat -> just below the door
      this.portals.set(this.idx(doorX, doorY), { kind: 'door', to: { x: inner.mat.x, y: inner.mat.y - 1 }, building: b.id, area: inner.id, lock: b.lock || null });
      this.portals.set(this.idx(inner.mat.x, inner.mat.y), { kind: 'exit', to: { x: doorX, y: doorY + 1 }, building: b.id, area: 'outdoor' });
      inner.door = { x: doorX, y: doorY };
      reserve(b.x, b.y, b.w, b.h, 1);
      reserve(doorX, doorY + 1, 1, 2);
    }

    // Props
    for (const p of MAP.objects) {
      const o = this.addObject({ ...p, solid: !p.flat });
      if (p.light) this.lights.push({ x: p.x * TILE + 8, y: p.y * TILE + 2, r: 46, obj: o });
      reserve(p.x, p.y, o.w, o.h, 1);
    }
    for (const [id, l] of Object.entries(MAP.locations)) {
      this.locations[id] = { x: l.x, y: l.y, face: l.face, area: 'outdoor' };
      reserve(l.x, l.y, 1, 1, 1);
    }

    // Trees: dense border, light scatter elsewhere, a small wood south of the field.
    const rng = new RNG(1337);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (this.tile(x, y) !== T.GRASS) continue;
      const border = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
      if (border) {
        if ((x + y) % 2 === 0 || rng.chance(0.5)) this._tree(x, y, rng);
        continue;
      }
      if (reserved[y * W + x]) continue;
      const inWood = x < 27 && y > 30;
      const p = inWood ? 0.32 : 0.07;
      if (rng.chance(p)) this._tree(x, y, rng);
      else if (rng.chance(0.04)) this.addObject({ kind: rng.chance(0.5) ? 'bush' : 'rock', x, y, solid: true });
    }
  }

  _tree(x, y, rng) {
    const variant = rng.int(0, 3);
    this.addObject({ kind: 'tree', x, y, variant, solid: true });
  }

  _buildInterior(d) {
    const area = this._addArea({ id: d.id, x: d.ox, y: d.oy, w: d.w, h: d.h, outdoor: false, wall: d.wall, floor: d.floor, owner: d.owner || null });
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      const wall = y < 2 || x === 0 || x === d.w - 1 || y === d.h - 1;
      this.setTile(d.ox + x, d.oy + y, wall ? T.WALL : T.FLOOR);
    }
    const mx = d.ox + Math.floor(d.w / 2), my = d.oy + d.h - 1;
    this.setTile(mx, my, T.MAT);
    area.mat = { x: mx, y: my };
    for (const [kind, rx, ry, opts] of d.items) {
      const f = MAP.furniture[kind];
      const o = this.addObject({
        kind, x: d.ox + rx, y: d.oy + ry, w: f.w, h: f.h, flat: !!f.flat, solid: !f.flat,
        area: d.id, owner: d.owner || null, ...(opts || {}),
      });
      const searchable = opts && opts.search !== undefined ? opts.search : f.search;
      o.search = !!searchable;
      if (o.search) {
        o.key = `${d.id}:${kind}`;
        this.searchables[o.key] = o;
      }
    }
    for (const [id, l] of Object.entries(d.locs || {})) {
      this.locations[`${d.id}.${id}`] = { x: d.ox + l.x, y: d.oy + l.y, face: l.face, area: d.id };
    }
    // a small light so rooms are never pitch black at night
    this.lights.push({ x: (d.ox + d.w / 2) * TILE, y: (d.oy + 3) * TILE, r: 90, indoor: true, area: d.id });
  }

  // Resolve a schedule location id for a villager into a tile + facing.
  resolveLocation(locId, homeArea) {
    if (locId === 'home') return this.locations[`${homeArea}.home`];
    return this.locations[locId] || null;
  }

  // Open outdoor tile near (x,y), used to place gnome statues without blocking roads.
  findOpenTile(x, y, avoid = new Set()) {
    const good = (tx, ty) => {
      const t = this.tile(tx, ty);
      if (![T.GRASS, T.STONE, T.SAND, T.FLOWERS].includes(t)) return false;
      if (this.isSolid(tx, ty) || this.portalAt(tx, ty) || avoid.has(this.idx(tx, ty))) return false;
      const a = this.areaAt(tx, ty);
      if (!a || !a.outdoor) return false;
      // keep all 4 neighbours walkable so we never seal off a corridor
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.isSolid(tx + dx, ty + dy)) return false;
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (this.isSolid(tx + dx, ty + dy)) return false;
      return true;
    };
    for (let r = 0; r < 12; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (good(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
    return { x, y };
  }

  // Deterministic per-tile variant for art.
  variant(x, y, n) { return Math.floor(hash2(x, y, 7) * n); }
}
