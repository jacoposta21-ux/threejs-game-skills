import { ROADS, PLAY_RADIUS, terrainHeight } from '../world/layout.js';

/**
 * Waypoint graph for NPC navigation. Nodes come from the road network, the
 * square, the market aisle and every NPC anchor (doors, stalls, benches...).
 * Edges are only kept when a capsule-sized shape cast between the two points
 * is clear of static architecture, so paths never cut through buildings.
 */
export class NavGraph {
  constructor(physics) {
    this.physics = physics;
    this.nodes = [];
    this.anchorIds = new Map();
    this.unreachable = [];
    const R = physics.RAPIER;
    this.ball = new R.Ball(0.34);
    this.rot = { x: 0, y: 0, z: 0, w: 1 };
    this.casts = 0;
    this.blockerFilter = (collider) => {
      const type = collider.shape.type;
      if (type === R.ShapeType.TriMesh) return false;
      const body = collider.parent();
      return !body || body.isFixed();
    };
  }

  addNode(x, z, y = terrainHeight(x, z), tag = null) {
    const node = { id: this.nodes.length, x, y, z, edges: [], tag };
    this.nodes.push(node);
    return node;
  }

  clear(a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const ay = a.y + 0.95;
    const by = b.y + 0.95;
    const dy = by - ay;
    const len = Math.hypot(dx, dy, dz);
    this.casts += 1;
    const hit = this.physics.world.castShape(
      { x: a.x, y: ay, z: a.z }, this.rot, { x: dx / len, y: dy / len, z: dz / len }, this.ball,
      0, len, true, undefined, undefined, undefined, undefined, this.blockerFilter,
    );
    return !hit;
  }

  /** True when a standing capsule at p would overlap static architecture. */
  blocked(x, z) {
    const y = terrainHeight(x, z) + 0.95;
    this.casts += 1;
    return !!this.physics.world.castShape({ x, y, z }, this.rot, { x: 0, y: 1, z: 0 }, this.ball, 0, 0.001, true, undefined, undefined, undefined, undefined, this.blockerFilter);
  }

  link(a, b) {
    if (a === b || a.edges.some((e) => e.to === b.id)) return;
    const cost = Math.hypot(a.x - b.x, a.z - b.z);
    a.edges.push({ to: b.id, cost });
    b.edges.push({ to: a.id, cost });
  }

  /** Build from roads + extra seeds, then densify with visibility-checked links. */
  build(extraSeeds = []) {
    for (const road of ROADS) {
      let prev = null;
      for (let i = 0; i < road.points.length - 1; i += 1) {
        const [ax, az] = road.points[i];
        const [bx, bz] = road.points[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.round(len / 5));
        for (let s = i === 0 ? 0 : 1; s <= steps; s += 1) {
          const x = ax + ((bx - ax) * s) / steps;
          const z = az + ((bz - az) * s) / steps;
          if (Math.hypot(x, z) > PLAY_RADIUS - 4 || this.blocked(x, z)) { prev = null; continue; }
          const n = this.addNode(x, z);
          if (prev && this.clear(prev, n)) this.link(prev, n);
          prev = n;
        }
      }
    }
    for (const [x, z] of extraSeeds) if (!this.blocked(x, z)) this.addNode(x, z);
    // densify: link visible neighbours within 8 m
    const base = this.nodes.slice();
    for (let i = 0; i < base.length; i += 1) {
      for (let j = i + 1; j < base.length; j += 1) {
        const a = base[i];
        const b = base[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > 8 || d < 0.5) continue;
        if (a.edges.some((e) => e.to === b.id)) continue;
        if (this.clear(a, b)) this.link(a, b);
      }
    }
  }

  /** Register an anchor point as a node linked to its visible neighbours. */
  addAnchor(key, p) {
    const n = this.addNode(p.x, p.z, p.y ?? terrainHeight(p.x, p.z), key);
    const near = this.nodes
      .filter((o) => o !== n && !o.tag?.startsWith?.('anchor-only'))
      .map((o) => ({ o, d: Math.hypot(o.x - n.x, o.z - n.z) }))
      .filter((e) => e.d < 22)
      .sort((a, b) => a.d - b.d);
    let linked = 0;
    for (const { o } of near) {
      if (linked >= 3) break;
      if (this.clear(n, o)) {
        this.link(n, o);
        linked += 1;
      }
    }
    if (!linked) this.unreachable.push(key);
    this.anchorIds.set(key, n.id);
    return n;
  }

  nearestNode(p, requireClear = true) {
    const ranked = this.nodes
      .map((o) => ({ o, d: Math.hypot(o.x - p.x, o.z - p.z) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < Math.min(6, ranked.length); i += 1) {
      const { o } = ranked[i];
      if (o.edges.length === 0) continue;
      if (!requireClear || this.clear({ x: p.x, y: p.y ?? terrainHeight(p.x, p.z), z: p.z }, o)) return o;
    }
    return ranked.find((r) => r.o.edges.length)?.o ?? null;
  }

  /** A* from a world point to a node id. Returns an array of {x,y,z}. */
  path(from, goalId) {
    const start = this.nearestNode(from);
    const goal = this.nodes[goalId];
    if (!start || !goal) return null;
    const open = new Set([start.id]);
    const came = new Map();
    const g = new Map([[start.id, 0]]);
    const f = new Map([[start.id, Math.hypot(start.x - goal.x, start.z - goal.z)]]);
    let guard = 0;
    while (open.size && guard < 4000) {
      guard += 1;
      let current = null;
      let best = Infinity;
      for (const id of open) {
        const v = f.get(id);
        if (v < best) { best = v; current = id; }
      }
      if (current === goal.id) {
        const out = [];
        let c = current;
        while (c !== undefined) {
          const n = this.nodes[c];
          out.unshift({ x: n.x, y: n.y, z: n.z });
          c = came.get(c);
        }
        return out;
      }
      open.delete(current);
      const node = this.nodes[current];
      for (const e of node.edges) {
        const tentative = g.get(current) + e.cost;
        if (tentative < (g.get(e.to) ?? Infinity)) {
          came.set(e.to, current);
          g.set(e.to, tentative);
          const n = this.nodes[e.to];
          f.set(e.to, tentative + Math.hypot(n.x - goal.x, n.z - goal.z));
          open.add(e.to);
        }
      }
    }
    return null;
  }

  stats() {
    let edges = 0;
    for (const n of this.nodes) edges += n.edges.length;
    return { nodes: this.nodes.length, edges: edges / 2, casts: this.casts, unreachable: this.unreachable.length };
  }
}
