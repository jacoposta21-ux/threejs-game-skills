import { LINES } from '../world/Layout.js';

// The street grid as a graph of intersections. Used for the minimap GPS route
// and for police cars that need to reach the player around buildings.
const N = LINES.length;

export function nearestIntersection(x, z) {
  let bi = 0, bj = 0, bd = Infinity;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const d = (LINES[i] - x) ** 2 + (LINES[j] - z) ** 2;
    if (d < bd) { bd = d; bi = i; bj = j; }
  }
  return { i: bi, j: bj };
}

/** Nearest point on any road centre line (snaps a position onto the grid). */
export function snapToRoad(x, z) {
  const cx = Math.max(LINES[0], Math.min(LINES[N - 1], x));
  const cz = Math.max(LINES[0], Math.min(LINES[N - 1], z));
  let best = { x: cx, z: cz }, bd = Infinity;
  for (const L of LINES) {
    const dv = Math.abs(x - L) + Math.abs(z - cz); // north-south road at x = L
    if (dv < bd) { bd = dv; best = { x: L, z: cz }; }
    const dh = Math.abs(z - L) + Math.abs(x - cx); // east-west road at z = L
    if (dh < bd) { bd = dh; best = { x: cx, z: L }; }
  }
  return best;
}

/** Shortest intersection path between two grid nodes (BFS on the 4-neighbour grid). */
export function gridPath(a, b) {
  const key = (i, j) => i * N + j;
  const prev = new Map([[key(a.i, a.j), null]]);
  const q = [a];
  while (q.length) {
    const c = q.shift();
    if (c.i === b.i && c.j === b.j) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = c.i + di, nj = c.j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const k = key(ni, nj);
      if (prev.has(k)) continue;
      prev.set(k, c);
      q.push({ i: ni, j: nj });
    }
  }
  const out = [];
  let c = b;
  while (c) { out.unshift(c); c = prev.get(key(c.i, c.j)); }
  // straighten: keep only turning points
  const pts = out.map((n) => ({ x: LINES[n.i], z: LINES[n.j] }));
  return pts.filter((p, k) => k === 0 || k === pts.length - 1 || !((pts[k - 1].x === p.x && pts[k + 1].x === p.x) || (pts[k - 1].z === p.z && pts[k + 1].z === p.z)));
}

/** Route polyline from a world position to a world position along the streets. */
export function route(from, to) {
  if (Math.hypot(from.x - to.x, from.z - to.z) < 40) return [{ x: from.x, z: from.z }, { x: to.x, z: to.z }];
  const s = snapToRoad(from.x, from.z), e = snapToRoad(to.x, to.z);
  const a = nearestIntersection(s.x, s.z), b = nearestIntersection(e.x, e.z);
  const mid = gridPath(a, b);
  return [{ x: from.x, z: from.z }, s, ...mid, e, { x: to.x, z: to.z }];
}
