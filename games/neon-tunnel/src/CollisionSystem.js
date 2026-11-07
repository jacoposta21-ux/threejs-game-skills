import { PLAYER, SCORE } from './Config.js';
import { PLAYER_HALF_ANGLE, clearance, rotationAt } from './ObstacleModel.js';

// Swept sphere-vs-arc collision in tunnel space. Obstacles are thin slabs along
// the tunnel axis; the sphere sweeps from prevDistance to distance each frame,
// so even a 30 fps frame at boost speed cannot tunnel through a laser. The
// sphere's real cross-section is used: near the slab edges its angular width
// shrinks like a real sphere's would.

const SAMPLES = 4;

export class CollisionSystem {
  /**
   * @returns the first obstacle hit this frame, or null.
   * Calls onNearMiss(obstacle, clearanceWorld) when a row is passed cleanly
   * with less than SCORE.nearMissDistance of clearance.
   */
  check(obstacles, prevDistance, distance, prevAngle, angle, onNearMiss) {
    const r = PLAYER.radius;
    const rp = PLAYER.orbitRadius;
    const span = Math.max(1e-6, distance - prevDistance);
    let hit = null;
    for (let i = 0; i < obstacles.length; i += 1) {
      const o = obstacles[i];
      if (o.passed || o.smashed) continue;
      const reach = o.hd + r;
      const lo = o.s - reach;
      const hi = o.s + reach;
      if (distance < lo) continue;
      if (prevDistance <= hi) {
        const a0 = Math.max(prevDistance, lo);
        const a1 = Math.min(distance, hi);
        for (let k = 0; k <= SAMPLES; k += 1) {
          const sd = a0 + ((a1 - a0) * k) / SAMPLES;
          const f = (sd - prevDistance) / span;
          const pa = prevAngle + (angle - prevAngle) * f;
          const dz = o.s - sd;
          const offset = Math.max(0, Math.abs(dz) - o.hd);
          const halfChord = Math.sqrt(Math.max(0, r * r - offset * offset));
          const effHalf = Math.asin(Math.min(1, halfChord / rp));
          const c = clearance(o, rotationAt(o, dz), pa) + PLAYER_HALF_ANGLE - effHalf;
          if (c < o.minClear) o.minClear = c;
          if (c < 0 && !hit) {
            hit = o;
            break;
          }
        }
      }
      if (distance > hi) {
        o.passed = true;
        if (hit !== o && o.minClear >= 0 && o.minClear * rp < SCORE.nearMissDistance) onNearMiss(o, o.minClear * rp);
      }
    }
    return hit;
  }
}
