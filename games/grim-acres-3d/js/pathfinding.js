// A* on the tile grid, 4-directional, with door portals as extra edges.
// Returns an array of {x,y} tiles from start (exclusive) to goal (inclusive), or null.
// Consecutive nodes that are not adjacent are portal jumps (the walker teleports).

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n, f) {
    const a = this.a; a.push([f, n]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[1];
  }
}

export function findPath(world, sx, sy, gx, gy) {
  if (sx === gx && sy === gy) return [];
  const W = world.w;
  const start = sy * W + sx, goal = gy * W + gx;
  const goalArea = world.areaGrid[goal];
  const g = new Map([[start, 0]]);
  const came = new Map();
  const open = new Heap();
  // Manhattan distance only means something inside the same area; across areas fall back to 0.
  const h = (i) => (world.areaGrid[i] === goalArea ? Math.abs((i % W) - gx) + Math.abs(((i / W) | 0) - gy) : 0);
  open.push(start, h(start));
  const closed = new Set();
  let guard = 0;
  while (open.size && guard++ < 20000) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed.has(cur)) continue;
    closed.add(cur);
    const cx = cur % W, cy = (cur / W) | 0;
    const nbrs = [];
    if (cx > 0) nbrs.push(cur - 1);
    if (cx < W - 1) nbrs.push(cur + 1);
    if (cy > 0) nbrs.push(cur - W);
    if (cy < world.h - 1) nbrs.push(cur + W);
    const portal = world.portals.get(cur);
    if (portal) nbrs.push(portal.to.y * W + portal.to.x);
    for (const n of nbrs) {
      if (world.solid[n] && n !== goal) continue;
      const ng = g.get(cur) + 1;
      if (ng < (g.has(n) ? g.get(n) : Infinity)) {
        g.set(n, ng);
        came.set(n, cur);
        open.push(n, ng + h(n));
      }
    }
  }
  if (!came.has(goal)) return null;
  const out = [];
  for (let n = goal; n !== start; n = came.get(n)) out.push({ x: n % W, y: (n / W) | 0 });
  return out.reverse();
}
