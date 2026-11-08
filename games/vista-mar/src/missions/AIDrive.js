import { route } from '../systems/RoadGraph.js';
import { clamp } from '../utils/random.js';

// Street-following driver for mission cars (couriers, escaping bosses).
// Keeps a cached route over the road graph and steers toward the next point.
export function aiDrive(v, target, maxSpeed, dt, st) {
  st.pathTimer = (st.pathTimer ?? 0) - dt;
  if (!st.path || !st.path.length || (st.pathTimer <= 0 && st.stuckRoute)) {
    st.path = route({ x: v.pos.x, z: v.pos.z }, target).slice(1);
    st.pathTimer = 8;
    st.stuckRoute = false;
    // never turn back for a corner that is already behind us
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    while (st.path.length > 1) {
      const q = st.path[0], dx = q.x - v.pos.x, dz = q.z - v.pos.z;
      if (dx * fx + dz * fz < 0 && Math.hypot(dx, dz) < 40) st.path.shift(); else break;
    }
  }
  while (st.path.length > 1 && Math.hypot(st.path[0].x - v.pos.x, st.path[0].z - v.pos.z) < 10) st.path.shift();
  const wp = st.path[0] || target;
  const dist = Math.hypot(target.x - v.pos.x, target.z - v.pos.z);
  const want = Math.atan2(wp.x - v.pos.x, wp.z - v.pos.z);
  let diff = want - v.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  let steer = clamp(-diff * 2.4, -1, 1);
  const cap = Math.min(maxSpeed, dist < 25 ? Math.max(3, dist * 0.5) : maxSpeed, Math.abs(diff) > 0.6 ? 9 : maxSpeed);
  let throttle = Math.abs(v.speed) < cap ? 1 : v.speed > cap + 3 ? -0.5 : 0;
  // stuck: back up for a second
  if (st.reverse > 0) { st.reverse -= dt; throttle = -1; steer = -steer; }
  else if (throttle > 0 && Math.abs(v.speed) < 0.8) { st.stuck = (st.stuck || 0) + dt; if (st.stuck > 1.5) { st.stuck = 0; st.reverse = 1.1; st.stuckRoute = true; } }
  else st.stuck = 0;
  if (dist < 6) { throttle = Math.abs(v.speed) > 0.5 ? -1 : 0; steer = 0; }
  v.update(dt, { throttle, steer, handbrake: dist < 6 });
  return dist;
}
