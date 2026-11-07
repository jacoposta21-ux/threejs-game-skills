/**
 * The physical pizza pile: real Rapier rigid bodies resting on a kinematic rack.
 * No three.js rendering here so it can be simulated headless in tests.
 */
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { BOX, rackFriction, rackLip } from '../game/rules.ts';
import { GROUPS } from './groups.ts';

type R = typeof RAPIER_NS;

export const RACK = { halfW: 0.21, halfD: 0.21, plate: 0.012 } as const;

export interface PizzaBox {
  id: number;
  body: RAPIER_NS.RigidBody;
  collider: RAPIER_NS.Collider;
  alive: boolean;
  heat: number;
  /** local offset in the rack frame, refreshed by update() */
  local: Vector3;
}

const _v = new Vector3();
const _q = new Quaternion();
const _qi = new Quaternion();
const _p = new Vector3();

export class PizzaPile {
  readonly rapier: R;
  readonly world: RAPIER_NS.World;
  readonly rack: RAPIER_NS.RigidBody;
  boxes: PizzaBox[] = [];
  private rackColliders: RAPIER_NS.Collider[] = [];
  private nextId = 1;
  level = 0;

  constructor(rapier: R, world: RAPIER_NS.World, rackBody: RAPIER_NS.RigidBody, rackLevel: number) {
    this.rapier = rapier;
    this.world = world;
    this.rack = rackBody;
    this.setRackLevel(rackLevel);
  }

  /** (Re)build the rack plate and containment lips for an upgrade level. */
  setRackLevel(level: number) {
    this.level = level;
    for (const c of this.rackColliders) this.world.removeCollider(c, false);
    this.rackColliders = [];
    const { ColliderDesc } = this.rapier;
    const fr = rackFriction(level);
    const lip = rackLip(level);
    const plate = ColliderDesc.cuboid(RACK.halfW, RACK.plate / 2, RACK.halfD)
      .setTranslation(0, -RACK.plate / 2, 0)
      .setFriction(fr)
      .setRestitution(0)
      .setCollisionGroups(GROUPS.rack);
    this.rackColliders.push(this.world.createCollider(plate, this.rack));
    const t = 0.01;
    const walls: [number, number, number, number][] = [
      [RACK.halfW + t / 2, 0, t / 2, RACK.halfD + t],
      [-RACK.halfW - t / 2, 0, t / 2, RACK.halfD + t],
      [0, RACK.halfD + t / 2, RACK.halfW + t, t / 2],
      [0, -RACK.halfD - t / 2, RACK.halfW + t, t / 2],
    ];
    for (const [x, z, hx, hz] of walls) {
      const d = ColliderDesc.cuboid(hx, lip / 2, hz)
        .setTranslation(x, lip / 2, z)
        .setFriction(fr)
        .setCollisionGroups(GROUPS.rack);
      this.rackColliders.push(this.world.createCollider(d, this.rack));
    }
    for (const b of this.boxes) b.collider.setFriction(fr);
  }

  get aliveCount(): number {
    let n = 0;
    for (const b of this.boxes) if (b.alive) n++;
    return n;
  }

  private rackPose(pos: Vector3, rot: Quaternion) {
    const t = this.rack.translation();
    const r = this.rack.rotation();
    pos.set(t.x, t.y, t.z);
    rot.set(r.x, r.y, r.z, r.w);
  }

  private createBox(localY: number, jitter = 0): PizzaBox {
    const { RigidBodyDesc, ColliderDesc } = this.rapier;
    this.rackPose(_p, _q);
    _v.set((Math.random() - 0.5) * jitter, localY, (Math.random() - 0.5) * jitter).applyQuaternion(_q).add(_p);
    const lv = this.rack.linvel();
    const body = this.world.createRigidBody(
      RigidBodyDesc.dynamic()
        .setTranslation(_v.x, _v.y, _v.z)
        .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
        .setLinvel(lv.x, lv.y, lv.z)
        .setLinearDamping(0.05)
        .setAngularDamping(0.6)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    const collider = this.world.createCollider(
      ColliderDesc.cuboid(BOX.w / 2, BOX.h / 2, BOX.d / 2)
        .setMass(BOX.mass)
        .setFriction(rackFriction(this.level))
        .setRestitution(0.02)
        .setCollisionGroups(GROUPS.box),
      body,
    );
    return { id: this.nextId++, body, collider, alive: true, heat: 100, local: new Vector3() };
  }

  /** Stack n boxes on the rack. */
  build(n: number) {
    this.clear();
    for (let i = 0; i < n; i++) this.boxes.push(this.createBox(BOX.h / 2 + i * (BOX.h + 0.0005) + 0.001));
  }

  clear() {
    for (const b of this.boxes) this.world.removeRigidBody(b.body);
    this.boxes = [];
  }

  /** Put a recovered box back on top of the pile. */
  pushTop(heat: number): PizzaBox {
    let top = -Infinity;
    for (const b of this.boxes) if (b.alive) top = Math.max(top, b.local.y);
    const y = top === -Infinity ? BOX.h / 2 + 0.001 : top + BOX.h + 0.004;
    const b = this.createBox(y);
    b.heat = heat;
    this.boxes.push(b);
    return b;
  }

  /** Alive boxes sorted top-first (by height in the rack frame). */
  topFirst(out: PizzaBox[]): PizzaBox[] {
    out.length = 0;
    for (const b of this.boxes) if (b.alive) out.push(b);
    out.sort((a, b) => b.local.y - a.local.y);
    return out;
  }

  /** Remove a box from the simulation (delivered). */
  remove(box: PizzaBox) {
    box.alive = false;
    this.world.removeRigidBody(box.body);
    const i = this.boxes.indexOf(box);
    if (i >= 0) this.boxes.splice(i, 1);
  }

  /**
   * Refresh rack-local offsets and detect lost boxes: touching the ground or farther than
   * 0.5 m from the rack. Lost boxes stay simulated (they tumble) but are flagged !alive.
   */
  update(groundAt: (x: number, z: number) => number, lostOut: PizzaBox[]): PizzaBox[] {
    lostOut.length = 0;
    this.rackPose(_p, _q);
    _qi.copy(_q).invert();
    for (const b of this.boxes) {
      if (!b.alive) continue;
      const t = b.body.translation();
      b.local.set(t.x - _p.x, t.y - _p.y, t.z - _p.z).applyQuaternion(_qi);
      const horiz = Math.hypot(b.local.x, b.local.z);
      const onGround = t.y - groundAt(t.x, t.z) < BOX.h * 0.5 + 0.03;
      if (horiz > 0.5 || b.local.y < -0.12 || onGround) {
        b.alive = false;
        lostOut.push(b);
      }
    }
    return lostOut;
  }

  /** Max horizontal overhang of any alive box relative to the box below it (near-fall metric). */
  instability(): number {
    let worst = 0;
    const alive = this.boxes.filter((b) => b.alive);
    alive.sort((a, b) => a.local.y - b.local.y);
    for (let i = 0; i < alive.length; i++) {
      const below = i === 0 ? null : alive[i - 1];
      const dx = alive[i].local.x - (below ? below.local.x : 0);
      const dz = alive[i].local.z - (below ? below.local.z : 0);
      worst = Math.max(worst, Math.hypot(dx, dz));
    }
    return worst;
  }

  /** Move the whole pile rigidly with the rack (respawn). */
  teleport(fromPos: Vector3, fromRot: Quaternion, toPos: Vector3, toRot: Quaternion) {
    _qi.copy(fromRot).invert();
    for (const b of this.boxes) {
      if (!b.alive) continue;
      const t = b.body.translation();
      const r = b.body.rotation();
      _v.set(t.x, t.y, t.z).sub(fromPos).applyQuaternion(_qi).applyQuaternion(toRot).add(toPos);
      _q.set(r.x, r.y, r.z, r.w).premultiply(_qi).premultiply(toRot);
      b.body.setTranslation({ x: _v.x, y: _v.y, z: _v.z }, true);
      b.body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
      b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }
}
