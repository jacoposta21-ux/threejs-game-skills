/**
 * Arcade scooter: speed/heading model + Rapier character controller for wall collisions,
 * analytic vertical motion (bumps, ramps, jumps) and a spring-mounted rack whose sway
 * drives the physical pile. Rendering reads the poses; nothing here depends on the DOM.
 */
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { Euler, Quaternion, Vector3 } from 'three';
import { GROUPS } from './groups.ts';

type R = typeof RAPIER_NS;

export interface ScooterInput {
  throttle: number; // 0..1
  brake: number; // 0..1 (brake, then reverse when stopped)
  steer: number; // -1 (right) .. 1 (left)
  handbrake: boolean;
}

export interface ScooterTuning {
  maxSpeed: number;
  accel: number;
  brake: number;
  hardBrake: number;
  reverseMax: number;
  bumpScale: number; // suspension: scales bump/impact inputs
}

export const DEFAULT_TUNING: ScooterTuning = {
  maxSpeed: 14,
  accel: 4.2,
  brake: 4.4,
  hardBrake: 8,
  reverseMax: 4,
  bumpScale: 1,
};

/** Rack mount point in the scooter frame (scooter faces +z). */
export const RACK_OFFSET = new Vector3(0, 0.82, -0.6);
const WHEELBASE = 1.25;
const GRAVITY = 9.81;

export interface ScooterEvents {
  impact: number; // horizontal collision speed lost (m/s)
  impactCar: boolean;
  landing: number; // vertical landing speed (m/s)
  bump: number; // vertical acceleration spike magnitude (m/s^2)
}

const _e = new Euler(0, 0, 0, 'YXZ');
const _q = new Quaternion();
const _qs = new Quaternion();
const _v = new Vector3();

export class Scooter {
  readonly rapier: R;
  readonly world: RAPIER_NS.World;
  readonly chassis: RAPIER_NS.RigidBody;
  readonly chassisCollider: RAPIER_NS.Collider;
  readonly rack: RAPIER_NS.RigidBody;
  readonly controller: RAPIER_NS.KinematicCharacterController;
  tuning: ScooterTuning = { ...DEFAULT_TUNING };

  // state
  x = 0;
  z = 0;
  y = 0;
  vy = 0;
  heading = 0;
  speed = 0;
  steerSmoothed = 0;
  lean = 0;
  pitch = 0;
  airborne = false;
  latAccel = 0;
  longAccel = 0;
  vertAccel = 0;
  swayP = 0;
  swayPv = 0;
  swayR = 0;
  swayRv = 0;
  private prevGroundY = 0;
  private prevVy = 0;
  wheelSpin = 0;

  // kinematic targets for sub-stepping
  readonly rackPrevPos = new Vector3();
  readonly rackPrevRot = new Quaternion();
  readonly rackPos = new Vector3();
  readonly rackRot = new Quaternion();
  readonly bodyPos = new Vector3();
  readonly bodyRot = new Quaternion();
  private bodyPrevPos = new Vector3();
  private bodyPrevRot = new Quaternion();
  private lerpPos = new Vector3();
  private lerpRot = new Quaternion();

  readonly events: ScooterEvents = { impact: 0, impactCar: false, landing: 0, bump: 0 };
  carColliderHandles = new Set<number>();

  constructor(rapier: R, world: RAPIER_NS.World) {
    this.rapier = rapier;
    this.world = world;
    const { RigidBodyDesc, ColliderDesc } = rapier;
    this.chassis = world.createRigidBody(RigidBodyDesc.kinematicPositionBased());
    this.chassisCollider = world.createCollider(
      ColliderDesc.cuboid(0.32, 0.35, 0.85).setTranslation(0, 0.6, 0).setCollisionGroups(GROUPS.chassis),
      this.chassis,
    );
    this.rack = world.createRigidBody(RigidBodyDesc.kinematicPositionBased());
    this.controller = world.createCharacterController(0.03);
    this.controller.setSlideEnabled(true);
    this.controller.setApplyImpulsesToDynamicBodies(false);
    this.controller.disableAutostep();
    this.controller.disableSnapToGround();
    this.controller.setMaxSlopeClimbAngle(Math.PI / 2);
  }

  /** Place the scooter instantly (also used for respawn). */
  place(x: number, z: number, heading: number, groundY: number) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.y = groundY;
    this.prevGroundY = groundY;
    this.vy = 0;
    this.prevVy = 0;
    this.speed = 0;
    this.lean = 0;
    this.swayP = this.swayPv = this.swayR = this.swayRv = 0;
    this.airborne = false;
    this.computePoses(0);
    this.bodyPrevPos.copy(this.bodyPos);
    this.bodyPrevRot.copy(this.bodyRot);
    this.rackPrevPos.copy(this.rackPos);
    this.rackPrevRot.copy(this.rackRot);
    this.chassis.setTranslation({ x: this.bodyPos.x, y: this.bodyPos.y, z: this.bodyPos.z }, true);
    this.chassis.setRotation(this.bodyRot, true);
    this.rack.setTranslation({ x: this.rackPos.x, y: this.rackPos.y, z: this.rackPos.z }, true);
    this.rack.setRotation(this.rackRot, true);
  }

  /** Wheel-contact ground height with suspension filtering of the high-frequency part. */
  private wheelGround(ground: (x: number, z: number) => number, cobble: (x: number, z: number) => number): number {
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const hf = ground(this.x + fx * WHEELBASE * 0.5, this.z + fz * WHEELBASE * 0.5);
    const hb = ground(this.x - fx * WHEELBASE * 0.5, this.z - fz * WHEELBASE * 0.5);
    // smooth: wider average along the heading
    const s1 = ground(this.x + fx * 2.2, this.z + fz * 2.2);
    const s2 = ground(this.x - fx * 2.2, this.z - fz * 2.2);
    const raw = (hf + hb) * 0.5 + cobble(this.x, this.z);
    const smooth = (hf + hb + s1 + s2) * 0.25;
    this.pitch = Math.atan2(hb - hf, WHEELBASE);
    return smooth + (raw - smooth) * this.tuning.bumpScale;
  }

  /**
   * Advance the arcade model by dt (one fixed tick). Sets kinematic targets; the caller
   * then sub-steps the world calling applyKinematic(t) before each world.step().
   */
  step(dt: number, input: ScooterInput, ground: (x: number, z: number) => number, cobble: (x: number, z: number) => number, steerMul = 1) {
    const ev = this.events;
    ev.impact = 0;
    ev.impactCar = false;
    ev.landing = 0;
    ev.bump = 0;
    const T = this.tuning;
    const prevSpeed = this.speed;

    // longitudinal
    if (!this.airborne) {
      if (input.handbrake) {
        this.speed = moveToward(this.speed, 0, T.hardBrake * dt);
      } else if (input.throttle > 0.01) {
        if (this.speed < 0) this.speed = moveToward(this.speed, 0, T.brake * dt);
        else {
          const k = 1 - Math.pow(Math.max(0, this.speed) / T.maxSpeed, 2) * 0.85;
          this.speed = Math.min(T.maxSpeed, this.speed + T.accel * input.throttle * Math.max(0.15, k) * dt);
        }
      } else if (input.brake > 0.01) {
        if (this.speed > 0.2) this.speed = moveToward(this.speed, 0, T.brake * input.brake * dt);
        else this.speed = Math.max(-T.reverseMax, this.speed - 3 * input.brake * dt);
      } else {
        this.speed = moveToward(this.speed, 0, 1.1 * dt); // rolling drag
      }
      // gravity on slopes
      this.speed += Math.sin(this.pitch) * GRAVITY * 0.35 * dt;
      if (this.speed > T.maxSpeed) this.speed = moveToward(this.speed, T.maxSpeed, 3 * dt);
    }

    // steering: yaw rate limited by speed so lateral accel stays arcade-friendly
    this.steerSmoothed += (input.steer - this.steerSmoothed) * Math.min(1, dt * 4.5);
    const v = this.speed;
    const absV = Math.abs(v);
    const maxYaw = absV < 0.3 ? 0 : Math.min(2.2, 6.2 / Math.max(absV, 1)) * Math.min(1, absV / 2.5);
    const yawRate = this.steerSmoothed * maxYaw * Math.sign(v || 1) * steerMul * (this.airborne ? 0.3 : 1);
    this.heading += yawRate * dt;
    this.latAccel = yawRate * v;
    this.longAccel = (this.speed - prevSpeed) / dt;

    // horizontal move with collisions
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const dx = fx * v * dt;
    const dz = fz * v * dt;
    this.controller.computeColliderMovement(this.chassisCollider, { x: dx, y: 0, z: dz }, this.rapier.QueryFilterFlags.EXCLUDE_SENSORS, GROUPS.chassis);
    const mv = this.controller.computedMovement();
    const want = Math.hypot(dx, dz);
    const got = Math.hypot(mv.x, mv.z);
    if (want > 1e-5 && got < want - 1e-4) {
      const lost = (want - got) / dt;
      if (lost > 1.2) {
        ev.impact = lost;
        for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
          const c = this.controller.computedCollision(i);
          if (c?.collider && this.carColliderHandles.has(c.collider.handle)) ev.impactCar = true;
        }
      }
      // keep the along-wall component, lose a bit more on hard hits
      const along = (mv.x * fx + mv.z * fz) / dt;
      this.speed = Math.sign(v) * Math.max(0, Math.abs(along)) * (lost > 3 ? 0.6 : 0.95);
      this.longAccel = (this.speed - prevSpeed) / dt;
    }
    this.x += mv.x;
    this.z += mv.z;
    this.wheelSpin += (v * dt) / 0.2;

    // vertical: follow ground, go ballistic when the ground drops faster than gravity
    const gy = this.wheelGround(ground, cobble);
    const groundVy = (gy - this.prevGroundY) / dt;
    this.prevGroundY = gy;
    const prevVy = this.vy;
    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= gy) {
        ev.landing = Math.max(0, groundVy - this.vy) * this.tuning.bumpScale;
        this.y = gy;
        this.vy = groundVy;
        this.airborne = false;
        this.swayPv += ev.landing * 0.9;
      }
    } else {
      const needAccel = (groundVy - this.prevVy) / dt;
      if (needAccel < -GRAVITY * 1.05 && absV > 3) {
        this.airborne = true;
        this.vy = this.prevVy - GRAVITY * dt;
        this.y += this.vy * dt;
      } else {
        this.y = gy;
        this.vy = groundVy;
      }
    }
    this.vertAccel = (this.vy - prevVy) / dt;
    ev.bump = Math.abs(this.vertAccel);
    this.prevVy = this.vy;

    // lean into turns (only ~45% of the physical lean, so turns load the pile a bit)
    const physLean = Math.atan2(this.latAccel, GRAVITY);
    const targetLean = clamp(physLean * 0.62 + this.steerSmoothed * 0.08 * Math.min(1, absV / 4), -0.6, 0.6);
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 9);

    // rack sway: damped spring driven by accelerations (pitch from longitudinal, roll from lateral)
    const w = 2 * Math.PI * 2.1;
    const zeta = 0.22;
    const k = w * w;
    const c = 2 * zeta * w;
    this.swayPv += (-k * this.swayP - c * this.swayPv - 1.3 * this.longAccel) * dt;
    this.swayP += this.swayPv * dt;
    this.swayRv += (-k * this.swayR - c * this.swayRv + 1.0 * this.latAccel) * dt;
    this.swayR += this.swayRv * dt;
    this.swayP = clamp(this.swayP, -0.16, 0.16);
    this.swayR = clamp(this.swayR, -0.16, 0.16);

    if (ev.impact > 0) {
      const kick = Math.min(ev.impact, 12) * this.tuning.bumpScale;
      this.swayPv += kick * 0.35 * Math.sign(prevSpeed || 1);
      this.swayRv += (Math.random() - 0.5) * kick * 0.4;
      if (!this.airborne && kick > 3) {
        this.airborne = true;
        this.vy = kick * 0.12;
      }
    }

    this.bodyPrevPos.copy(this.bodyPos);
    this.bodyPrevRot.copy(this.bodyRot);
    this.rackPrevPos.copy(this.rackPos);
    this.rackPrevRot.copy(this.rackRot);
    this.computePoses(dt);
  }

  private computePoses(_dt: number) {
    // body: yaw, slope pitch, lean roll. Leaning left (positive steer) tilts top toward +x.
    _e.set(this.pitch, this.heading, -this.lean, 'YXZ');
    this.bodyRot.setFromEuler(_e);
    this.bodyPos.set(this.x, this.y, this.z);
    // rack = body * offset * sway
    _v.copy(RACK_OFFSET).applyQuaternion(this.bodyRot);
    this.rackPos.copy(this.bodyPos).add(_v);
    _e.set(this.swayP, 0, -this.swayR, 'YXZ');
    _qs.setFromEuler(_e);
    this.rackRot.copy(this.bodyRot).multiply(_qs);
  }

  /** Set kinematic targets interpolated between the previous and new tick poses. */
  applyKinematic(t: number) {
    this.lerpPos.lerpVectors(this.bodyPrevPos, this.bodyPos, t);
    this.lerpRot.slerpQuaternions(this.bodyPrevRot, this.bodyRot, t);
    this.chassis.setNextKinematicTranslation(this.lerpPos);
    this.chassis.setNextKinematicRotation(this.lerpRot);
    this.lerpPos.lerpVectors(this.rackPrevPos, this.rackPos, t);
    this.lerpRot.slerpQuaternions(this.rackPrevRot, this.rackRot, t);
    this.rack.setNextKinematicTranslation(this.lerpPos);
    this.rack.setNextKinematicRotation(this.lerpRot);
  }

  get forwardX() {
    return Math.sin(this.heading);
  }
  get forwardZ() {
    return Math.cos(this.heading);
  }
}

export function moveToward(v: number, target: number, maxDelta: number): number {
  if (v < target) return Math.min(target, v + maxDelta);
  return Math.max(target, v - maxDelta);
}
export function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
// quaternion scratch kept module-local to avoid per-frame allocation
void _q;
