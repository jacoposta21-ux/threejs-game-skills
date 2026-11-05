import * as THREE from 'three';
import type { Surface } from '../core/types';

export interface Collider {
  id: string;
  min: THREE.Vector3;
  max: THREE.Vector3;
  enabled: boolean;
  /** Blocks the player horizontally. */
  solid: boolean;
  /** Top face can be stood on. */
  walkable: boolean;
  /** Top face can be climbed onto with Space. */
  climbable: boolean;
  /** Blocks THE HUSH's line of sight. */
  occluder: boolean;
  /** Blocks THE HUSH's navigation (defaults from height). */
  navBlock: boolean;
  surface: Surface;
  /** Dynamic colliders (pushables) are skipped when they move themselves. */
  owner?: unknown;
}

export interface ColliderOptions {
  id?: string;
  solid?: boolean;
  walkable?: boolean;
  climbable?: boolean;
  occluder?: boolean;
  navBlock?: boolean;
  surface?: Surface;
  owner?: unknown;
}

let colliderSerial = 0;

export function makeCollider(min: THREE.Vector3, max: THREE.Vector3, options: ColliderOptions = {}): Collider {
  const solid = options.solid ?? true;
  return {
    id: options.id ?? `c${colliderSerial++}`,
    min: min.clone(),
    max: max.clone(),
    enabled: true,
    solid,
    walkable: options.walkable ?? true,
    climbable: options.climbable ?? false,
    occluder: options.occluder ?? (solid && max.y - min.y > 0.5 && min.y < 1.2),
    navBlock: options.navBlock ?? (solid && min.y < 1.75 && max.y > 0.08),
    surface: options.surface ?? 'wood',
    owner: options.owner,
  };
}

export interface GroundHit {
  height: number;
  surface: Surface;
  collider: Collider | null;
}

const tmpDir = new THREE.Vector3();

export class CollisionWorld {
  readonly colliders: Collider[] = [];
  /** Incremented whenever the navigation-relevant layout changes. */
  layoutVersion = 0;

  add(collider: Collider): Collider {
    this.colliders.push(collider);
    this.layoutVersion++;
    return collider;
  }

  /** Convenience: a box centered at (x, y, z) with full size (w, h, d), bottom at y. */
  addBox(x: number, y: number, z: number, w: number, h: number, d: number, options: ColliderOptions = {}): Collider {
    return this.add(
      makeCollider(new THREE.Vector3(x - w / 2, y, z - d / 2), new THREE.Vector3(x + w / 2, y + h, z + d / 2), options),
    );
  }

  remove(collider: Collider): void {
    const index = this.colliders.indexOf(collider);
    if (index >= 0) this.colliders.splice(index, 1);
    this.layoutVersion++;
  }

  clear(): void {
    this.colliders.length = 0;
    this.layoutVersion++;
  }

  markChanged(): void {
    this.layoutVersion++;
  }

  groundAt(x: number, z: number, radius: number, feetY: number, stepUp: number, ignore?: unknown): GroundHit {
    let best: GroundHit = { height: -10, surface: 'wood', collider: null };
    const r = radius * 0.55;
    for (const c of this.colliders) {
      if (!c.enabled || !c.walkable || (ignore && c.owner === ignore)) continue;
      if (x + r < c.min.x || x - r > c.max.x || z + r < c.min.z || z - r > c.max.z) continue;
      const top = c.max.y;
      if (top <= feetY + stepUp + 0.001 && top > best.height) {
        best = { height: top, surface: c.surface, collider: c };
      }
    }
    return best;
  }

  /**
   * Push a vertical cylinder out of solid boxes it overlaps (XZ only).
   * Boxes whose top is within stepUp of the feet are ignored (they are stepped onto).
   */
  resolveCylinder(pos: THREE.Vector3, radius: number, height: number, stepUp: number, ignore?: unknown): boolean {
    let hit = false;
    for (let iteration = 0; iteration < 3; iteration++) {
      let moved = false;
      for (const c of this.colliders) {
        if (!c.enabled || !c.solid || (ignore && c.owner === ignore)) continue;
        if (c.min.y >= pos.y + height - 0.01 || c.max.y <= pos.y + stepUp) continue;
        const cx = THREE.MathUtils.clamp(pos.x, c.min.x, c.max.x);
        const cz = THREE.MathUtils.clamp(pos.z, c.min.z, c.max.z);
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        } else {
          // Center inside the box: push out along the smallest axis.
          const left = pos.x - c.min.x;
          const right = c.max.x - pos.x;
          const back = pos.z - c.min.z;
          const front = c.max.z - pos.z;
          const m = Math.min(left, right, back, front);
          if (m === left) pos.x = c.min.x - radius;
          else if (m === right) pos.x = c.max.x + radius;
          else if (m === back) pos.z = c.min.z - radius;
          else pos.z = c.max.z + radius;
        }
        moved = true;
        hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  isSpaceFree(x: number, z: number, radius: number, feetY: number, height: number, ignore?: unknown): boolean {
    for (const c of this.colliders) {
      if (!c.enabled || !c.solid || (ignore && c.owner === ignore)) continue;
      if (c.min.y >= feetY + height - 0.01 || c.max.y <= feetY + 0.02) continue;
      const cx = THREE.MathUtils.clamp(x, c.min.x, c.max.x);
      const cz = THREE.MathUtils.clamp(z, c.min.z, c.max.z);
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return false;
    }
    return true;
  }

  /** Lowest ceiling above feet at a point (for crouch/stand checks). */
  ceilingAt(x: number, z: number, radius: number, feetY: number): number {
    let ceiling = Infinity;
    for (const c of this.colliders) {
      if (!c.enabled || !c.solid) continue;
      if (c.min.y < feetY + 0.05) continue;
      const cx = THREE.MathUtils.clamp(x, c.min.x, c.max.x);
      const cz = THREE.MathUtils.clamp(z, c.min.z, c.max.z);
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius * 0.7) ceiling = Math.min(ceiling, c.min.y);
    }
    return ceiling;
  }

  boxOverlapsSolid(min: THREE.Vector3, max: THREE.Vector3, ignore?: unknown): Collider | null {
    for (const c of this.colliders) {
      if (!c.enabled || !c.solid || (ignore && c.owner === ignore)) continue;
      if (max.x <= c.min.x || min.x >= c.max.x) continue;
      if (max.y <= c.min.y || min.y >= c.max.y) continue;
      if (max.z <= c.min.z || min.z >= c.max.z) continue;
      return c;
    }
    return null;
  }

  /** Ray vs. boxes (slab test). Returns hit distance or Infinity. */
  raycast(origin: THREE.Vector3, target: THREE.Vector3, filter: (c: Collider) => boolean): number {
    tmpDir.subVectors(target, origin);
    const maxDist = tmpDir.length();
    if (maxDist < 1e-5) return Infinity;
    tmpDir.divideScalar(maxDist);
    let best = Infinity;
    for (const c of this.colliders) {
      if (!c.enabled || !filter(c)) continue;
      const t = rayBox(origin, tmpDir, c.min, c.max);
      if (t >= 0 && t < maxDist && t < best) best = t;
    }
    return best;
  }

  lineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    return this.raycast(from, to, (c) => c.occluder) === Infinity;
  }
}

function rayBox(o: THREE.Vector3, d: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const axis of ['x', 'y', 'z'] as const) {
    const origin = o[axis];
    const dir = d[axis];
    if (Math.abs(dir) < 1e-9) {
      if (origin < min[axis] || origin > max[axis]) return -1;
      continue;
    }
    let t1 = (min[axis] - origin) / dir;
    let t2 = (max[axis] - origin) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}
