import * as THREE from 'three';
import { AnimationController } from '../animation/AnimationController.js';
import { GROUP, groups } from '../physics/PhysicsWorld.js';
import { PLAYER } from '../config.js';
import { TrickIK } from '../skills/TrickIK.js';

const CAPSULE_HALF = 0.55;
/** Fraction of a dribble-touch swing at which the boot meets the ball. */
export const TOUCH_U = 0.65;

const _pq = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _iq = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _fp = new THREE.Vector3();
const _to = new THREE.Vector3();

/**
 * Shared body for every footballer: a dressed skinned character, a kinematic
 * capsule the ball can hit, heading/speed state, and render interpolation.
 * Controllers (human or AI) decide where it goes; this class only moves it.
 */
export class Footballer {
  constructor({ lib, physics, scene, look, tag }) {
    this.lib = lib;
    this.physics = physics;
    this.look = look;
    this.name = look.name;
    this.team = look.teamId;
    this.character = lib.createCharacter(look);
    this.holder = this.character.holder;
    this.holder.name = `footballer-${look.name}`;
    scene.add(this.holder);
    this.anim = new AnimationController(lib, this.character.root);

    const { body, collider } = physics.createKinematicCapsule(0, 0, CAPSULE_HALF, PLAYER.radius, { type: 'player', who: this });
    this.body = body;
    this.collider = collider;
    this.ghost = false;

    this.position = new THREE.Vector3();
    this.prevPosition = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.heading = 0;
    this.prevHeading = 0;
    this.speed = 0;
    this.roll = 0; // whole-body roll (keeper dives)
    this.lift = 0;
    this.pitch = 0; // whole-body backward tip (bicycle kick)
    this.extraYaw = 0;
    this.legPulse = null; // procedural touch / trap on one leg, layered over the clips
    // Foot-driven skill moves: measured once on the standing pose.
    this.anim.update(0);
    this.trickIK = new TrickIK(this);
    this.trickAnim = null; // { def, side, u } while a foot-driven trick plays
    this.ballRef = null; // set by the game: the ball's rendered position
    this.reach = null; // { target: Vector3, w: 0..1 } both arms stretch toward a world point (keeper saves)
    this.reachW = 0;
  }

  /** Stretch both arms toward a world point, blended by weight (applied after the clips). */
  applyReach(dt) {
    const want = this.reach ? this.reach.w : 0;
    this.reachW += (want - this.reachW) * (1 - Math.exp(-dt * 16));
    if (this.reachW < 0.02 || !this.reachTarget) return;
    const bones = this.character.bones;
    this.holder.updateMatrixWorld(true);
    for (const side of ['l', 'r']) {
      const upper = bones.get(`upperarm_${side}`);
      const lower = bones.get(`lowerarm_${side}`);
      const hand = bones.get(`hand_${side}`);
      if (!upper || !lower || !hand) continue;
      const aim = (bone, tip) => {
        bone.getWorldPosition(_fp);
        tip.getWorldPosition(_axis).sub(_fp).normalize();
        _to.copy(this.reachTarget).sub(_fp).normalize();
        _dq.setFromUnitVectors(_axis, _to);
        _dq.slerp(_iq.identity(), 1 - this.reachW);
        bone.parent.getWorldQuaternion(_pq);
        _dq.premultiply(_iq.copy(_pq).invert()).multiply(_pq);
        bone.quaternion.premultiply(_dq);
        bone.updateWorldMatrix(false, true);
      };
      aim(upper, lower);
      aim(lower, hand);
    }
  }

  /** World position of a hand ('l' | 'r') as of the last rendered pose. */
  handWorld(side, out = new THREE.Vector3()) {
    return this.character.bones.get(`hand_${side}`).getWorldPosition(out);
  }

  /**
   * Swing one leg through a ball touch on top of whatever clip is playing.
   * kind 'touch': cock the knee then drive the foot through (laces / inside).
   * kind 'trap': lift the foot and sole the ball.
   */
  kickLeg(side, { kind = 'touch', dur = 0.26, amp = 0.6 } = {}) {
    this.legPulse = { side, kind, dur, amp, t: 0 };
  }

  /** World position of a foot bone ('l' | 'r') as of the last rendered pose. */
  footWorld(side, out = new THREE.Vector3()) {
    const b = this.character.bones.get(`ball_${side}`) ?? this.character.bones.get(`foot_${side}`);
    if (!b) return this.footPoint(out, 0.3);
    return b.getWorldPosition(out);
  }

  /** The foot further behind along the facing: the one about to swing through. */
  rearFoot() {
    const f = this.facing(_axis);
    const l = this.footWorld('l', _fp).sub(this.holder.position).dot(f);
    const r = this.footWorld('r', _fp).sub(this.holder.position).dot(f);
    return l < r ? 'l' : 'r';
  }

  applyLegPulse(dt) {
    const lp = this.legPulse;
    if (!lp) return;
    lp.t += dt;
    const u = lp.t / lp.dur;
    if (u >= 1) {
      this.legPulse = null;
      return;
    }
    const bones = this.character.bones;
    const thigh = bones.get(`thigh_${lp.side}`);
    const calf = bones.get(`calf_${lp.side}`);
    const foot = bones.get(`foot_${lp.side}`);
    if (!thigh || !calf) return;
    let hip;
    let knee;
    let ankle = 0;
    if (lp.kind === 'trap') {
      const s = Math.sin(Math.PI * u);
      hip = lp.amp * 0.75 * s;
      knee = -lp.amp * 0.9 * s;
      ankle = lp.amp * 0.6 * s; // toes up: sole on the ball
    } else {
      // Exaggerates the natural swing of the rear leg: the knee folds to clear
      // the ground, then the hip drives and the shin snaps straight with the
      // toe pointed, reaching the ball at u = TOUCH_U, late in the swing.
      const sm = (x) => THREE.MathUtils.smoothstep(x, 0, 1);
      const c = TOUCH_U;
      hip = lp.amp * 0.22 * (u < c ? sm(u / c) : 1 - sm((u - c) / (1 - c)));
      knee = (u < 0.5 ? -lp.amp * 0.6 * Math.sin((Math.PI * u) / 0.5) : 0)
        + (u > 0.45 ? lp.amp * 0.35 * Math.sin((Math.PI * (u - 0.45)) / 0.55) : 0);
      ankle = -lp.amp * 0.5 * Math.sin(Math.PI * u); // toe pointed: laces through the ball
    }
    // Rotations about the character's right axis, applied in each bone's parent space.
    this.holder.updateMatrixWorld(true);
    _axis.set(-1, 0, 0).transformDirection(this.holder.matrixWorld);
    const rot = (bone, angle) => {
      if (!bone || Math.abs(angle) < 1e-4) return;
      bone.parent.getWorldQuaternion(_pq);
      _dq.setFromAxisAngle(_axis, angle);
      _dq.premultiply(_iq.copy(_pq).invert()).multiply(_pq);
      bone.quaternion.premultiply(_dq);
      bone.updateMatrixWorld(true);
    };
    rot(thigh, hip);
    rot(calf, knee);
    rot(foot, ankle);
  }

  facing(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  /** Point in front of the feet where a controlled ball sits. */
  footPoint(out = new THREE.Vector3(), lead = 0.42) {
    return this.facing(out).multiplyScalar(lead).add(this.position);
  }

  setGhost(ghost) {
    if (ghost === this.ghost) return;
    this.ghost = ghost;
    this.collider.setCollisionGroups(
      ghost ? groups(GROUP.PLAYER_GHOST, 0) : groups(GROUP.PLAYER, GROUP.BALL),
    );
  }

  teleport(x, z, heading) {
    this.position.set(x, 0, z);
    this.prevPosition.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.heading = heading;
    this.prevHeading = heading;
    this.roll = 0;
    this.lift = 0;
    this.body.setTranslation({ x, y: CAPSULE_HALF + PLAYER.radius, z }, true);
    this.body.setNextKinematicTranslation({ x, y: CAPSULE_HALF + PLAYER.radius, z });
    this.body.setNextKinematicRotation({ x: 0, y: 0, z: 0, w: 1 });
  }

  beginStep() {
    this.prevPosition.copy(this.position);
    this.prevHeading = this.heading;
  }

  /** Push the kinematic capsule to the current gameplay transform (after controller logic). */
  commitStep() {
    const y = CAPSULE_HALF + PLAYER.radius + this.lift;
    if (Math.abs(this.roll) > 0.01) {
      // Lying capsule for dives: rotate about the facing axis, centre lowered.
      const f = this.facing(new THREE.Vector3());
      const q = new THREE.Quaternion().setFromAxisAngle(f, -this.roll);
      const up = new THREE.Vector3(0, CAPSULE_HALF + PLAYER.radius, 0).applyQuaternion(q);
      this.body.setNextKinematicTranslation({ x: this.position.x + up.x, y: Math.max(0.35, up.y + this.lift), z: this.position.z + up.z });
      this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    } else {
      this.body.setNextKinematicTranslation({ x: this.position.x, y, z: this.position.z });
      this.body.setNextKinematicRotation({ x: 0, y: 0, z: 0, w: 1 });
    }
  }

  /** Render-rate update: interpolate transform and advance animation. */
  syncVisual(alpha, dt) {
    this.holder.position.lerpVectors(this.prevPosition, this.position, alpha);
    let dh = this.heading - this.prevHeading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const h = this.prevHeading + dh * alpha;
    this.holder.rotation.set(0, 0, 0);
    this.holder.rotateY(h + this.extraYaw);
    // Roll about the character's own forward axis (Z in holder space).
    this.holder.rotateZ(-this.roll);
    if (this.pitch) this.holder.rotateX(-this.pitch);
    this.holder.position.y = this.lift;
    this.anim.setSpeed(this.speed);
    this.trickIK.restore();
    this.anim.update(dt);
    if (this.legPulse) this.applyLegPulse(dt);
    const ta = this.trickAnim;
    if (ta && ta.def.ik) {
      if (this.trickIK.active !== ta) this.trickIK.begin(ta);
      this.trickIK.apply(h + this.extraYaw, this.ballRef ?? this.holder.position);
    } else this.trickIK.active = null;
    if (this.reach) (this.reachTarget ??= new THREE.Vector3()).copy(this.reach.target);
    if (this.reach || this.reachW > 0.02) this.applyReach(dt);
  }

  dispose(scene) {
    scene.remove(this.holder);
    this.anim.stopAll();
    this.physics.world.removeRigidBody(this.body);
  }
}
