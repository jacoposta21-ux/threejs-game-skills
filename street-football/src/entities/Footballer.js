import * as THREE from 'three';
import { AnimationController } from '../animation/AnimationController.js';
import { GROUP, groups } from '../physics/PhysicsWorld.js';
import { PLAYER } from '../config.js';

const CAPSULE_HALF = 0.55;

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
    this.extraYaw = 0;
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
    this.holder.position.y = this.lift;
    this.anim.setSpeed(this.speed);
    this.anim.update(dt);
  }

  dispose(scene) {
    scene.remove(this.holder);
    this.anim.stopAll();
    this.physics.world.removeRigidBody(this.body);
  }
}
