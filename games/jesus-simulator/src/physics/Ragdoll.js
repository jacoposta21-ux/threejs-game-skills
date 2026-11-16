import * as THREE from 'three';

const MAX_ACTIVE = 8;
// ragdoll parts never collide with other ragdoll parts (overlapping limbs would explode apart)
const RAGDOLL_GROUPS = (0x0002 << 16) | (0xffff & ~0x0002);
const mA = new THREE.Matrix4();
const mB = new THREE.Matrix4();
const mInv = new THREE.Matrix4();
const vA = new THREE.Vector3();
const qA = new THREE.Quaternion();
const sA = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

/**
 * Rapier ragdolls for CharacterKit rigs. Each rigid part (hips, torso, head,
 * two arms, two legs) becomes a dynamic box joined to its parent with a
 * spherical joint at the part's pivot. Ragdoll parts don't collide with each
 * other (limbs overlap at rest), only with the world, props and characters.
 *
 * While a ragdoll is active the rig parts are re-parented to a scene-level
 * container and driven straight from the physics bodies; `release()` puts the
 * hierarchy back exactly as CharacterKit built it.
 */
export class RagdollSystem {
  constructor(physics, scene) {
    this.physics = physics;
    this.R = physics.RAPIER;
    this.container = new THREE.Group();
    this.container.name = 'ragdolls';
    scene.add(this.container);
    this.active = [];
    this.spawned = 0;
  }

  get available() {
    return this.active.length < MAX_ACTIVE;
  }

  /**
   * @param rig CharacterKit rig
   * @param v {x,y,z} launch velocity
   * @param opts { spin, owner }
   */
  spawn(rig, v, opts = {}) {
    if (!this.available || !rig.ragdollParts) return null;
    const R = this.R;
    const world = this.physics.world;
    rig.group.updateMatrixWorld(true);
    const parts = [];
    const byName = {};
    for (const p of rig.ragdollParts) {
      const wm = p.obj.matrixWorld.clone();
      wm.decompose(vA, qA, sA);
      const scale = sA.x;
      const center = new THREE.Vector3(...p.center).applyMatrix4(wm);
      const desc = R.RigidBodyDesc.dynamic()
        .setTranslation(center.x, center.y, center.z)
        .setRotation({ x: qA.x, y: qA.y, z: qA.z, w: qA.w })
        .setLinearDamping(0.15)
        .setAngularDamping(1.6)
        .setCcdEnabled(p.name === 'hips' || p.name === 'torso');
      const body = world.createRigidBody(desc);
      const [hx, hy, hz] = p.half;
      const col = world.createCollider(
        R.ColliderDesc.cuboid(hx * scale * 0.95, hy * scale * 0.95, hz * scale * 0.95).setDensity(110).setFriction(0.85).setRestitution(0.08).setCollisionGroups(RAGDOLL_GROUPS),
        body,
      );
      const jitter = () => (Math.random() - 0.5) * 0.8;
      body.setLinvel({ x: v.x + jitter(), y: v.y + jitter() * 0.5, z: v.z + jitter() }, true);
      const spin = opts.spin ?? 3;
      body.setAngvel({ x: (Math.random() - 0.5) * spin, y: (Math.random() - 0.5) * spin * 0.5, z: (Math.random() - 0.5) * spin }, true);
      // offset: part matrix relative to its body pose
      mA.compose(center, qA, ONE);
      const offset = mInv.copy(mA).invert().multiply(wm).clone();
      const part = { def: p, body, collider: col, offset, pivotWorld: new THREE.Vector3().setFromMatrixPosition(wm) };
      parts.push(part);
      byName[p.name] = part;
    }
    const joints = [];
    for (const part of parts) {
      const parent = part.def.parent && byName[part.def.parent];
      if (!parent) continue;
      const anchor1 = this.toLocal(parent.body, part.pivotWorld);
      const anchor2 = this.toLocal(part.body, part.pivotWorld);
      const joint = world.createImpulseJoint(R.JointData.spherical(anchor1, anchor2), parent.body, part.body, true);
      joint.setContactsEnabled(false);
      joints.push(joint);
    }
    // detach the parts so physics owns their world transforms
    for (const name of ['armL', 'armR', 'head', 'legL', 'legR', 'torso', 'hips']) this.container.attach(byName[name].def.obj);
    const rd = { rig, parts, byName, joints, t: 0, still: 0, owner: opts.owner || null, done: false };
    this.active.push(rd);
    this.spawned += 1;
    return rd;
  }

  toLocal(body, worldPoint) {
    const t = body.translation();
    const r = body.rotation();
    mB.compose(vA.set(t.x, t.y, t.z), qA.set(r.x, r.y, r.z, r.w), ONE).invert();
    const p = worldPoint.clone().applyMatrix4(mB);
    return { x: p.x, y: p.y, z: p.z };
  }

  /** Extra shove for an airborne ragdoll (pushed again mid-flight). */
  impulse(rd, v) {
    for (const p of rd.parts) {
      const lv = p.body.linvel();
      p.body.setLinvel({ x: lv.x + v.x, y: lv.y + v.y, z: lv.z + v.z }, true);
    }
    rd.t = Math.min(rd.t, 0.5);
    rd.still = 0;
  }

  /** Fixed step: settle detection. A ragdoll is done once it has rested for a moment. */
  fixedUpdate(dt) {
    for (const rd of this.active) {
      rd.t += dt;
      const hips = rd.byName.hips.body;
      const lv = hips.linvel();
      const sp = Math.hypot(lv.x, lv.y, lv.z);
      if (rd.t > 1.1 && sp < 0.6) rd.still += dt;
      else rd.still = Math.max(0, rd.still - dt * 0.5);
      const tr = hips.translation();
      if (tr.y < -12) rd.still = 99; // fell out of the world
      rd.done = rd.still > 0.45 || rd.t > 5.5;
    }
  }

  /** Per frame: drive the rig parts from their bodies. */
  sync() {
    for (const rd of this.active) {
      for (const p of rd.parts) {
        const t = p.body.translation();
        const r = p.body.rotation();
        mA.compose(vA.set(t.x, t.y, t.z), qA.set(r.x, r.y, r.z, r.w), ONE).multiply(p.offset);
        mA.decompose(p.def.obj.position, p.def.obj.quaternion, p.def.obj.scale);
      }
    }
  }

  /** Where the character should stand up: hips position + facing. */
  restPose(rd) {
    const t = rd.byName.hips.body.translation();
    const r = rd.byName.torso.body.rotation();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(qA.set(r.x, r.y, r.z, r.w));
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(qA);
    // lying down: torso "up" is horizontal; face the way the head points
    const yaw = Math.abs(up.y) < 0.7 ? Math.atan2(up.x, up.z) : Math.atan2(fwd.x, fwd.z);
    return { x: t.x, y: t.y, z: t.z, yaw, faceDown: fwd.y < -0.5 };
  }

  /** Remove the bodies and restore the rig hierarchy. */
  release(rd) {
    const world = this.physics.world;
    for (const p of rd.parts) world.removeRigidBody(p.body);
    for (const name of ['hips', 'torso', 'legL', 'legR', 'head', 'armL', 'armR']) {
      const def = rd.byName[name].def;
      def.rest.parent.add(def.obj);
      def.obj.position.copy(def.rest.position);
      def.obj.quaternion.identity();
      def.obj.scale.copy(def.rest.scale);
    }
    this.active = this.active.filter((x) => x !== rd);
  }

  releaseAll() {
    for (const rd of [...this.active]) this.release(rd);
  }

  stats() {
    return { active: this.active.length, spawned: this.spawned, bodies: this.active.length * 7 };
  }
}
