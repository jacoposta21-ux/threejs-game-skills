import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { getDef } from '../track/catalog';
import { getBuild } from '../track/PieceRegistry';
import { pieceMatrix } from '../track/Track';
import type { ColliderSpec, MoverDef, PieceData, ZoneDef } from '../track/types';

export const GRAVITY = 20;
export const MARBLE_R = 0.25;
export const DT = 1 / 120;
export const MAX_SPEED = 32;

let ready: Promise<void> | null = null;
export function initPhysics(): Promise<void> {
  if (!ready) ready = RAPIER.init();
  return ready;
}

export interface MoverInstance {
  pieceId: number;
  def: MoverDef;
  body: RAPIER.RigidBody;
  matrix: THREE.Matrix4;
  state: { pos: THREE.Vector3; quat: THREE.Quaternion };
  worldPos: THREE.Vector3;
  worldQuat: THREE.Quaternion;
}

export interface ZoneInstance {
  id: number;
  pieceId: number;
  zone: ZoneDef;
  inv: THREE.Matrix4;
  rot: THREE.Quaternion;
  matrix: THREE.Matrix4;
  aabb: THREE.Box3;
  /** World-space direction for boost/kick. */
  dir?: THREE.Vector3;
  /** World-space target for launch. */
  target?: THREE.Vector3;
}

export interface ZoneEvent {
  marble: number;
  zone: ZoneInstance;
}

const _v = new THREE.Vector3();
const _l = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Weld vertices by quantised position and drop degenerate triangles. */
export function weldMesh(positions: number[], indices: number[], quant = 1000): { vertices: Float32Array; indices: Uint32Array } {
  const map = new Map<string, number>();
  const verts: number[] = [];
  const remap = new Uint32Array(positions.length / 3);
  for (let i = 0; i < positions.length / 3; i += 1) {
    const x = Math.round(positions[i * 3] * quant);
    const y = Math.round(positions[i * 3 + 1] * quant);
    const z = Math.round(positions[i * 3 + 2] * quant);
    const k = `${x},${y},${z}`;
    let idx = map.get(k);
    if (idx === undefined) {
      idx = verts.length / 3;
      verts.push(x / quant, y / quant, z / quant);
      map.set(k, idx);
    }
    remap[i] = idx;
  }
  const out: number[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < indices.length; i += 3) {
    const a = remap[indices[i]];
    const b = remap[indices[i + 1]];
    const c = remap[indices[i + 2]];
    if (a === b || b === c || a === c) continue;
    const ax = verts[a * 3];
    const ay = verts[a * 3 + 1];
    const az = verts[a * 3 + 2];
    const ux = verts[b * 3] - ax;
    const uy = verts[b * 3 + 1] - ay;
    const uz = verts[b * 3 + 2] - az;
    const vx = verts[c * 3] - ax;
    const vy = verts[c * 3 + 1] - ay;
    const vz = verts[c * 3 + 2] - az;
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-10) continue;
    const key = [a, b, c].sort((p, q) => p - q).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a, b, c);
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(out) };
}

export interface PhysicsOptions {
  platformHalf?: number;
  /** Merge all static track geometry into one welded trimesh (seam-free). */
  mergeStatic?: boolean;
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly movers: MoverInstance[] = [];
  readonly zones: ZoneInstance[] = [];
  readonly marbles: RAPIER.RigidBody[] = [];
  time = 0;
  gateOpen = 0;
  gateTarget = 0;
  staticTriangles = 0;
  meshMode: 'merged' | 'per-piece' | 'plain' = 'merged';
  private marbleInside: Set<number>[] = [];

  constructor(pieces: PieceData[], opts: PhysicsOptions = {}) {
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = DT;
    this.world.integrationParameters.numSolverIterations = 6;
    this.buildPlatform(opts.platformHalf ?? 48);
    this.buildTrack(pieces, opts.mergeStatic ?? true);
  }

  private buildPlatform(half: number): void {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(half, 0.5, half).setTranslation(0, -0.5, 0).setFriction(0.9).setRestitution(0.1), body);
  }

  private buildTrack(pieces: PieceData[], merge: boolean): void {
    const fixed = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const allPos: number[] = [];
    const allIdx: number[] = [];
    const perPiece: { pos: number[]; idx: number[] }[] = [];
    let zoneId = 0;
    for (const pd of pieces) {
      const def = getDef(pd.t);
      const build = getBuild(pd.t, !!pd.m);
      const m = pieceMatrix(pd);
      const rot = new THREE.Quaternion().setFromRotationMatrix(m);
      const pos: number[] = [];
      const idx: number[] = [];
      for (const s of build.surfaces) {
        const base = pos.length / 3;
        for (let i = 0; i < s.positions.length; i += 3) {
          _v.set(s.positions[i], s.positions[i + 1], s.positions[i + 2]).applyMatrix4(m);
          pos.push(_v.x, _v.y, _v.z);
        }
        for (const i of s.indices) idx.push(i + base);
      }
      if (pos.length) {
        perPiece.push({ pos, idx });
        const base = allPos.length / 3;
        allPos.push(...pos);
        for (const i of idx) allIdx.push(i + base);
      }
      for (const c of build.colliders) this.addCollider(fixed, c, m, rot);
      if (def.decor) continue;
      for (const mover of build.movers) {
        const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
        for (const c of mover.colliders) this.addCollider(body, c, new THREE.Matrix4(), new THREE.Quaternion(), true);
        const inst: MoverInstance = {
          pieceId: pd.id,
          def: mover,
          body,
          matrix: m,
          state: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() },
          worldPos: new THREE.Vector3(),
          worldQuat: new THREE.Quaternion(),
        };
        this.movers.push(inst);
        this.poseMover(inst, true);
      }
      for (const z of build.zones) {
        const corners: THREE.Vector3[] = [];
        for (const x of [z.min.x, z.max.x]) for (const y of [z.min.y, z.max.y]) for (const zz of [z.min.z, z.max.z]) corners.push(new THREE.Vector3(x, y, zz).applyMatrix4(m));
        const inst: ZoneInstance = {
          id: zoneId++,
          pieceId: pd.id,
          zone: z,
          matrix: m,
          inv: m.clone().invert(),
          rot,
          aabb: new THREE.Box3().setFromPoints(corners),
        };
        const e = z.effect;
        if (e.type === 'boost' || e.type === 'kick') inst.dir = e.dir.clone().applyQuaternion(rot).normalize();
        if (e.type === 'launch') inst.target = e.target.clone().applyMatrix4(m);
        this.zones.push(inst);
      }
    }
    const flagsFull =
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED | RAPIER.TriMeshFlags.MERGE_DUPLICATE_VERTICES | RAPIER.TriMeshFlags.DELETE_DEGENERATE_TRIANGLES | RAPIER.TriMeshFlags.DELETE_DUPLICATE_TRIANGLES;
    const make = (pos: number[], idx: number[], flags?: number): boolean => {
      const w = weldMesh(pos, idx);
      if (!w.indices.length) return true;
      try {
        const desc = flags !== undefined ? RAPIER.ColliderDesc.trimesh(w.vertices, w.indices, flags) : RAPIER.ColliderDesc.trimesh(w.vertices, w.indices);
        if (!desc) return false;
        desc.setFriction(0.55).setRestitution(0.0);
        this.world.createCollider(desc, fixed);
        this.staticTriangles += w.indices.length / 3;
        return true;
      } catch {
        return false;
      }
    };
    if (merge && allIdx.length && make(allPos, allIdx, flagsFull)) {
      this.meshMode = 'merged';
      return;
    }
    this.meshMode = 'per-piece';
    for (const p of perPiece) {
      if (!make(p.pos, p.idx, flagsFull)) {
        this.meshMode = 'plain';
        make(p.pos, p.idx);
      }
    }
  }

  private addCollider(body: RAPIER.RigidBody, c: ColliderSpec, m: THREE.Matrix4, rot: THREE.Quaternion, local = false): void {
    let desc: RAPIER.ColliderDesc | null = null;
    let center = new THREE.Vector3();
    const q = rot.clone();
    switch (c.type) {
      case 'cuboid':
        desc = RAPIER.ColliderDesc.cuboid(c.half.x, c.half.y, c.half.z);
        center = c.center.clone();
        if (c.rotY) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rotY));
        if (c.rotZ) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), c.rotZ));
        if (c.restitution !== undefined) desc.setRestitution(c.restitution);
        break;
      case 'ball':
        desc = RAPIER.ColliderDesc.ball(c.radius);
        center = c.center.clone();
        break;
      case 'cylinder':
        desc = RAPIER.ColliderDesc.cylinder(c.halfHeight, c.radius);
        center = c.center.clone();
        break;
      case 'hull': {
        const pts = new Float32Array(c.points.length);
        for (let i = 0; i < c.points.length; i += 3) {
          _v.set(c.points[i], c.points[i + 1], c.points[i + 2]);
          if (!local) _v.applyMatrix4(m);
          pts[i] = _v.x;
          pts[i + 1] = _v.y;
          pts[i + 2] = _v.z;
        }
        desc = RAPIER.ColliderDesc.convexHull(pts);
        if (desc) desc.setFriction(0.5).setRestitution(0.2);
        if (desc) this.world.createCollider(desc, body);
        return;
      }
    }
    if (!desc) return;
    if (!local) center.applyMatrix4(m);
    desc.setTranslation(center.x, center.y, center.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setFriction(0.5);
    if (c.type !== 'cuboid' || c.restitution === undefined) desc.setRestitution(0.3);
    this.world.createCollider(desc, body);
  }

  private poseMover(inst: MoverInstance, teleport: boolean): void {
    inst.def.motion(this.time, inst.state, inst.def.gate ? this.gateOpen : 1);
    inst.worldPos.copy(inst.state.pos).applyMatrix4(inst.matrix);
    _q.setFromRotationMatrix(inst.matrix);
    inst.worldQuat.copy(_q).multiply(inst.state.quat);
    const t = { x: inst.worldPos.x, y: inst.worldPos.y, z: inst.worldPos.z };
    const r = { x: inst.worldQuat.x, y: inst.worldQuat.y, z: inst.worldQuat.z, w: inst.worldQuat.w };
    if (teleport) {
      inst.body.setTranslation(t, true);
      inst.body.setRotation(r, true);
    } else {
      inst.body.setNextKinematicTranslation(t);
      inst.body.setNextKinematicRotation(r);
    }
  }

  addMarble(pos: THREE.Vector3): RAPIER.RigidBody {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setLinearDamping(0.03)
        .setAngularDamping(0.18)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    this.world.createCollider(RAPIER.ColliderDesc.ball(MARBLE_R).setDensity(1).setFriction(0.4).setRestitution(0.45), body);
    this.marbles.push(body);
    this.marbleInside.push(new Set());
    return body;
  }

  /** Advance one fixed step. Zone events are reported through the callback. */
  step(onZone?: (e: ZoneEvent) => void, frozen = false): void {
    // gate animation
    const gateSpeed = 3;
    if (this.gateOpen !== this.gateTarget) {
      const d = this.gateTarget - this.gateOpen;
      this.gateOpen += Math.sign(d) * Math.min(Math.abs(d), gateSpeed * DT);
    }
    this.time += DT;
    for (const m of this.movers) this.poseMover(m, false);
    if (!frozen) this.applyZones(onZone);
    this.world.step();
    // speed clamp
    for (const b of this.marbles) {
      const v = b.linvel();
      const s2 = v.x * v.x + v.y * v.y + v.z * v.z;
      if (s2 > MAX_SPEED * MAX_SPEED) {
        const k = MAX_SPEED / Math.sqrt(s2);
        b.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
      }
    }
  }

  private applyZones(onZone?: (e: ZoneEvent) => void): void {
    for (let i = 0; i < this.marbles.length; i += 1) {
      const body = this.marbles[i];
      if (!body.isEnabled()) continue;
      const t = body.translation();
      _v.set(t.x, t.y, t.z);
      const inside = this.marbleInside[i];
      for (const z of this.zones) {
        let isIn = false;
        if (z.aabb.containsPoint(_v)) {
          _l.copy(_v).applyMatrix4(z.inv);
          isIn = _l.x >= z.zone.min.x && _l.x <= z.zone.max.x && _l.y >= z.zone.min.y && _l.y <= z.zone.max.y && _l.z >= z.zone.min.z && _l.z <= z.zone.max.z;
        }
        const was = inside.has(z.id);
        if (isIn && !was) {
          inside.add(z.id);
          this.enterZone(i, body, z);
          onZone?.({ marble: i, zone: z });
        } else if (!isIn && was) inside.delete(z.id);
        if (isIn && z.zone.effect.type === 'drag') {
          const v = body.linvel();
          const k = 1 - z.zone.effect.k * DT;
          body.setLinvel({ x: v.x * k, y: v.y, z: v.z * k }, true);
        }
        if (isIn && z.zone.effect.type === 'sustain') {
          const v = body.linvel();
          const sp = Math.hypot(v.x, v.y, v.z);
          const min = z.zone.effect.speed;
          if (sp < min && sp > 0.5) {
            const k = Math.min(min / sp, 1 + 3 * DT);
            body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
          }
        }
        if (isIn && z.zone.effect.type === 'boost' && z.dir) {
          const v = body.linvel();
          const along = v.x * z.dir.x + v.y * z.dir.y + v.z * z.dir.z;
          if (along < z.zone.effect.speed) {
            const dv = Math.min(z.zone.effect.accel * DT, z.zone.effect.speed - along);
            body.setLinvel({ x: v.x + z.dir.x * dv, y: v.y + z.dir.y * dv, z: v.z + z.dir.z * dv }, true);
            this.matchSpin(body);
          }
        }
      }
    }
  }

  private enterZone(i: number, body: RAPIER.RigidBody, z: ZoneInstance): void {
    const e = z.zone.effect;
    if (e.type === 'kick' && z.dir) {
      const v = body.linvel();
      const along = v.x * z.dir.x + v.y * z.dir.y + v.z * z.dir.z;
      if (along < e.speed) {
        const dv = e.speed - along;
        body.setLinvel({ x: v.x + z.dir.x * dv, y: v.y + z.dir.y * dv, z: v.z + z.dir.z * dv }, true);
        this.matchSpin(body);
      }
    } else if (e.type === 'launch' && z.target) {
      const p = body.translation();
      const T = e.time;
      // small deterministic spread so marbles do not stack on one landing point
      const spread = Math.sin((i + 1) * 12.9898 + this.time * 78.233) * 0.35;
      const tx = z.target.x;
      const ty = z.target.y;
      const tz = z.target.z;
      const vx = (tx - p.x) / T;
      const vy = (ty - p.y + 0.5 * GRAVITY * T * T) / T;
      const vz = (tz - p.z) / T;
      const side = new THREE.Vector3(vz, 0, -vx).normalize().multiplyScalar(spread);
      body.setLinvel({ x: vx + side.x, y: vy, z: vz + side.z }, true);
    }
  }

  /** Set angular velocity to pure rolling on a horizontal floor so impulses don't skid away energy. */
  matchSpin(body: RAPIER.RigidBody): void {
    const v = body.linvel();
    // ω = (n × v) / r with n = +Y
    body.setAngvel({ x: v.z / MARBLE_R, y: 0, z: -v.x / MARBLE_R }, true);
  }

  openGate(): void {
    this.gateTarget = 1;
  }

  closeGate(): void {
    this.gateTarget = 0;
    this.gateOpen = 0;
    for (const m of this.movers) if (m.def.gate) this.poseMover(m, true);
  }

  resetInside(i: number): void {
    this.marbleInside[i]?.clear();
  }

  dispose(): void {
    this.world.free();
  }
}
