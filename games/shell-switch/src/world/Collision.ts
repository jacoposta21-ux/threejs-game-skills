import * as THREE from 'three';

/** What may pass through a collider. */
export type PassRule = 'none' | 'ghost' | 'small' | 'ghostOrSmall';

export interface Collider {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  enabled: boolean;
  pass: PassRule;
  /** Optional tag for gameplay lookups (e.g. 'crate:3'). */
  tag?: string;
  /** Blocks the camera (tall walls). */
  camera?: boolean;
}

export interface MoverInfo {
  radius: number;
  height: number;
  small: boolean;
  phasing: boolean;
  /** Ignore this collider (e.g. the crate being carried). */
  ignore?: Collider | null;
}

const CELL = 8;
const GRAVITY = 24;

export interface MoveResult {
  grounded: boolean;
  hitWall: boolean;
  groundY: number;
}

export class CollisionWorld {
  private readonly grid = new Map<number, Collider[]>();
  /** Movable colliders (crates, doors) are checked every query. */
  readonly dynamic: Collider[] = [];
  private readonly scratch: Collider[] = [];
  private stamp = 0;
  private readonly stamps = new WeakMap<Collider, number>();
  /** World bounds (outer fence). */
  bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };

  private key(cx: number, cz: number): number {
    return (cx + 512) * 4096 + (cz + 512);
  }

  addStatic(c: Collider): Collider {
    const x0 = Math.floor(c.minX / CELL);
    const x1 = Math.floor(c.maxX / CELL);
    const z0 = Math.floor(c.minZ / CELL);
    const z1 = Math.floor(c.maxZ / CELL);
    for (let x = x0; x <= x1; x += 1) {
      for (let z = z0; z <= z1; z += 1) {
        const k = this.key(x, z);
        let list = this.grid.get(k);
        if (!list) {
          list = [];
          this.grid.set(k, list);
        }
        list.push(c);
      }
    }
    return c;
  }

  addDynamic(c: Collider): Collider {
    this.dynamic.push(c);
    return c;
  }

  /** Convenience: static box from center/size, bottom at y. */
  box(cx: number, y: number, cz: number, w: number, h: number, d: number, pass: PassRule = 'none', camera = false): Collider {
    return this.addStatic({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minY: y,
      maxY: y + h,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      enabled: true,
      pass,
      camera,
    });
  }

  query(minX: number, maxX: number, minZ: number, maxZ: number): Collider[] {
    const out = this.scratch;
    out.length = 0;
    this.stamp += 1;
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x += 1) {
      for (let z = z0; z <= z1; z += 1) {
        const list = this.grid.get(this.key(x, z));
        if (!list) continue;
        for (const c of list) {
          if (this.stamps.get(c) === this.stamp) continue;
          this.stamps.set(c, this.stamp);
          if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
          out.push(c);
        }
      }
    }
    for (const c of this.dynamic) {
      if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
      out.push(c);
    }
    return out;
  }

  private blocks(c: Collider, m: MoverInfo): boolean {
    if (!c.enabled || c === m.ignore) return false;
    switch (c.pass) {
      case 'none':
        return true;
      case 'ghost':
        return !m.phasing;
      case 'small':
        return !m.small;
      case 'ghostOrSmall':
        return !m.phasing && !m.small;
    }
  }

  /** Highest walkable surface under the circle at or below feetY + step. */
  groundHeight(x: number, z: number, r: number, feetY: number, step: number, m: MoverInfo): number {
    let ground = 0;
    const rr = r * 0.7;
    const list = this.query(x - rr, x + rr, z - rr, z + rr);
    for (const c of list) {
      if (!this.blocks(c, m)) continue;
      if (c.maxY > feetY + step + 0.001) continue;
      if (x + rr < c.minX || x - rr > c.maxX || z + rr < c.minZ || z - rr > c.maxZ) continue;
      if (c.maxY > ground) ground = c.maxY;
    }
    return ground;
  }

  /**
   * Kinematic character move: horizontal slide with step-up, then gravity.
   * pos is the feet position. vel.y is integrated here.
   */
  move(pos: THREE.Vector3, vel: THREE.Vector3, dt: number, m: MoverInfo, gravityScale = 1, step = 0.4): MoveResult {
    let hitWall = false;
    const prevY = pos.y;
    // Sub-step horizontal motion so fast hosts cannot tunnel thin walls.
    const dist = Math.hypot(vel.x, vel.z) * dt;
    const steps = Math.max(1, Math.ceil(dist / (m.radius * 0.8)));
    for (let s = 0; s < steps; s += 1) {
      pos.x += (vel.x * dt) / steps;
      pos.z += (vel.z * dt) / steps;
      if (this.resolveHorizontal(pos, m, step)) hitWall = true;
    }
    pos.x = Math.min(this.bounds.maxX - m.radius, Math.max(this.bounds.minX + m.radius, pos.x));
    pos.z = Math.min(this.bounds.maxZ - m.radius, Math.max(this.bounds.minZ + m.radius, pos.z));

    // Vertical.
    vel.y -= GRAVITY * gravityScale * dt;
    pos.y += vel.y * dt;
    if (vel.y > 0) {
      // Ceiling check.
      const list = this.query(pos.x - m.radius, pos.x + m.radius, pos.z - m.radius, pos.z + m.radius);
      for (const c of list) {
        if (!this.blocks(c, m)) continue;
        if (!this.circleOverlaps(pos.x, pos.z, m.radius * 0.8, c)) continue;
        const head = pos.y + m.height;
        if (c.minY > prevY + m.height - 0.05 && head > c.minY) {
          pos.y = c.minY - m.height;
          vel.y = 0;
        }
      }
    }
    const groundY = this.groundHeight(pos.x, pos.z, m.radius, Math.max(prevY, pos.y), step, m);
    let grounded = false;
    if (pos.y <= groundY) {
      pos.y = groundY;
      if (vel.y < 0) vel.y = 0;
      grounded = true;
    } else if (vel.y <= 0 && pos.y - groundY < 0.06) {
      pos.y = groundY;
      vel.y = 0;
      grounded = true;
    }
    return { grounded, hitWall, groundY };
  }

  private circleOverlaps(x: number, z: number, r: number, c: Collider): boolean {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    return dx * dx + dz * dz < r * r;
  }

  resolveHorizontal(pos: THREE.Vector3, m: MoverInfo, step: number): boolean {
    const r = m.radius;
    let hit = false;
    const list = this.query(pos.x - r, pos.x + r, pos.z - r, pos.z + r);
    for (const c of list) {
      if (!this.blocks(c, m)) continue;
      if (c.maxY <= pos.y + step) continue;
      if (c.minY >= pos.y + m.height) continue;
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      let dx = pos.x - cx;
      let dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = r - d;
        dx /= d;
        dz /= d;
        pos.x += dx * push;
        pos.z += dz * push;
      } else {
        // Center inside the box: push out along the shallowest axis.
        const left = pos.x - c.minX;
        const right = c.maxX - pos.x;
        const back = pos.z - c.minZ;
        const front = c.maxZ - pos.z;
        const mn = Math.min(left, right, back, front);
        if (mn === left) pos.x = c.minX - r;
        else if (mn === right) pos.x = c.maxX + r;
        else if (mn === back) pos.z = c.minZ - r;
        else pos.z = c.maxZ + r;
      }
    }
    return hit;
  }

  /** True when a solid (non-pass) collider overlaps the cylinder. */
  overlapsSolid(x: number, y: number, z: number, m: MoverInfo): boolean {
    const r = m.radius;
    const list = this.query(x - r, x + r, z - r, z + r);
    for (const c of list) {
      if (!this.blocks(c, m)) continue;
      if (c.maxY <= y + 0.05 || c.minY >= y + m.height) continue;
      if (this.circleOverlaps(x, z, r * 0.95, c)) return true;
    }
    return false;
  }

  /** 2D line-of-sight check at eye height against tall colliders. */
  lineOfSight(ax: number, az: number, bx: number, bz: number, eyeY: number): boolean {
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minZ = Math.min(az, bz);
    const maxZ = Math.max(az, bz);
    const list = this.query(minX, maxX, minZ, maxZ);
    for (const c of list) {
      if (!c.enabled || c.pass === 'small') continue;
      if (c.maxY < eyeY || c.minY > eyeY) continue;
      if (segmentHitsRect(ax, az, bx, bz, c)) return false;
    }
    return true;
  }

  /** Camera ray: returns the fraction [0,1] along a→b of the first hit. */
  raycastCamera(a: THREE.Vector3, b: THREE.Vector3): number {
    const minX = Math.min(a.x, b.x) - 0.3;
    const maxX = Math.max(a.x, b.x) + 0.3;
    const minZ = Math.min(a.z, b.z) - 0.3;
    const maxZ = Math.max(a.z, b.z) + 0.3;
    const list = this.query(minX, maxX, minZ, maxZ);
    let best = 1;
    for (const c of list) {
      if (!c.enabled || !c.camera) continue;
      const t = rayBox(a, b, c, 0.25);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }
}

function segmentHitsRect(ax: number, az: number, bx: number, bz: number, c: Collider): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const p = [-dx, dx, -dz, dz];
  const q = [ax - c.minX, c.maxX - ax, az - c.minZ, c.maxZ - az];
  for (let i = 0; i < 4; i += 1) {
    if (Math.abs(p[i]) < 1e-9) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 < t1 && t0 < 0.98 && t1 > 0.02;
}

function rayBox(a: THREE.Vector3, b: THREE.Vector3, c: Collider, pad: number): number {
  let tmin = 0;
  let tmax = 1;
  const o = [a.x, a.y, a.z];
  const d = [b.x - a.x, b.y - a.y, b.z - a.z];
  const mn = [c.minX - pad, c.minY - pad, c.minZ - pad];
  const mx = [c.maxX + pad, c.maxY + pad, c.maxZ + pad];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return -1;
    } else {
      let t1 = (mn[i] - o[i]) / d[i];
      let t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
  }
  // Ray starting inside the padded box (hugging a wall): ignore it.
  return tmin <= 0 ? -1 : tmin;
}
