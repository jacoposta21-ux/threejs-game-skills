import * as THREE from 'three';
import { clamp, damp, wrapAngle } from '../core/rng.js';
import { terrainHeight, inPlayArea, waterDepth } from '../world/layout.js';

export const MOVE = {
  walkSpeed: 4.6,
  sprintSpeed: 8.2,
  groundAccel: 46,
  groundDecel: 38,
  airAccel: 14,
  gravity: 26,
  jumpVelocity: 9.4,
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
  turnRate: 14,
  radius: 0.36,
  halfHeight: 0.54,
};

const FOOT_OFFSET = MOVE.halfHeight + MOVE.radius;

/**
 * Kinematic Rapier character: smooth acceleration, sprint, coyote-time jump,
 * slopes and steps via Rapier's KinematicCharacterController. Reads intents,
 * writes PlayerState. Runs at the fixed physics rate.
 */
export class PlayerController {
  constructor(physics, state, bus) {
    this.physics = physics;
    this.state = state;
    this.bus = bus;
    const p = state.position;
    this.char = physics.createCharacter({ x: p.x, y: p.y + FOOT_OFFSET, z: p.z, radius: MOVE.radius, halfHeight: MOVE.halfHeight });
    this.velocity = new THREE.Vector3();
    this.coyote = 0;
    this.buffer = 0;
    this.airTime = 0;
    this.prev = new THREE.Vector3().copy(p);
    this.renderPosition = new THREE.Vector3().copy(p);
    this.desired = { x: 0, y: 0, z: 0 };
    this.boundaryCooldown = 0;
    this.landed = 0;
    this.stepDistance = 0;
  }

  get collider() {
    return this.char.collider;
  }

  teleport(x, y, z, yaw = this.state.yaw) {
    const gy = Math.max(y, terrainHeight(x, z));
    this.char.body.setTranslation({ x, y: gy + FOOT_OFFSET + 0.05, z }, true);
    this.char.body.setNextKinematicTranslation({ x, y: gy + FOOT_OFFSET + 0.05, z });
    this.state.position.set(x, gy + 0.05, z);
    this.prev.copy(this.state.position);
    this.renderPosition.copy(this.state.position);
    this.velocity.set(0, 0, 0);
    this.state.yaw = yaw;
  }

  fixedUpdate(dt, intent, cameraYaw) {
    const st = this.state;
    this.prev.copy(st.position);

    // camera-relative wish direction
    let ix = intent.moveX;
    let iy = intent.moveY;
    const len = Math.hypot(ix, iy);
    if (len > 1) {
      ix /= len;
      iy /= len;
    }
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    const rx = Math.cos(cameraYaw);
    const rz = -Math.sin(cameraYaw);
    let wx = fx * iy + rx * ix;
    let wz = fz * iy + rz * ix;

    // soft world boundary: probe a step ahead; if it leaves the play area, cancel the outward part
    const p = st.position;
    if (len > 0.05 && !inPlayArea(p.x + wx * 2, p.z + wz * 2)) {
      const d = Math.hypot(p.x, p.z) || 1;
      const nx = p.x / d;
      const nz = p.z / d;
      const outward = wx * nx + wz * nz;
      if (outward > 0) {
        wx -= nx * outward;
        wz -= nz * outward;
      }
      if (!inPlayArea(p.x, p.z)) {
        wx -= nx * 0.8;
        wz -= nz * 0.8;
      }
      if (this.boundaryCooldown <= 0) {
        this.bus.emit('player:boundary', { entityId: st.id });
        this.boundaryCooldown = 4;
      }
    }
    this.boundaryCooldown -= dt;

    // wading: water slows you down; deep water pushes you back unless you walk on it
    const depth = waterDepth(p.x, p.z);
    st.waterDepth = depth;
    st.onWater = !!this.walkOnWater && depth > 0.05 && p.y > -0.2;
    let waterSlow = 1;
    if (!this.walkOnWater && depth > 0.25) {
      waterSlow = depth > 0.9 ? 0.45 : 0.7;
      if (depth > 1.3 && len > 0.05) {
        const ahead = waterDepth(p.x + wx * 1.5, p.z + wz * 1.5);
        if (ahead >= depth) {
          // can't wade deeper: cancel the motion and, past chest height, drift back toward shore
          wx = 0;
          wz = 0;
          if (depth > 1.5) {
            const sx = waterDepth(p.x - 1, p.z) < depth ? -1 : waterDepth(p.x + 1, p.z) < depth ? 1 : 0;
            const sz = waterDepth(p.x, p.z - 1) < depth ? -1 : waterDepth(p.x, p.z + 1) < depth ? 1 : 0;
            wx = sx * 0.6;
            wz = sz * 0.6;
          }
          if (this.deepCooldown <= 0) {
            this.bus.emit('player:deep-water', { entityId: st.id });
            this.deepCooldown = 5;
          }
        }
      }
    }
    this.deepCooldown = (this.deepCooldown || 0) - dt;

    const sprint = intent.sprint && iy > -0.2 && !intent.aim;
    const maxSpeed = (sprint ? MOVE.sprintSpeed : MOVE.walkSpeed) * (intent.aim ? 0.6 : 1) * waterSlow * (this.speedScale ?? 1);
    const tx = wx * maxSpeed;
    const tz = wz * maxSpeed;
    const grounded = st.grounded;
    const accel = grounded ? (len > 0.05 ? MOVE.groundAccel : MOVE.groundDecel) : MOVE.airAccel;
    const v = this.velocity;
    const dx = tx - v.x;
    const dz = tz - v.z;
    const dl = Math.hypot(dx, dz);
    const stepA = accel * dt;
    if (dl <= stepA) {
      v.x = tx;
      v.z = tz;
    } else {
      v.x += (dx / dl) * stepA;
      v.z += (dz / dl) * stepA;
    }

    // jump with coyote time + input buffer
    if (intent.jump) this.buffer = MOVE.jumpBuffer;
    this.buffer -= dt;
    this.coyote = grounded ? MOVE.coyoteTime : this.coyote - dt;
    if (this.buffer > 0 && this.coyote > 0) {
      v.y = MOVE.jumpVelocity;
      this.buffer = 0;
      this.coyote = 0;
      st.stats.jumps += 1;
      this.bus.emit('player:jump', { entityId: st.id });
    }
    // variable jump height
    if (v.y > 0 && !intent.jumpHeld) v.y -= MOVE.gravity * dt * 0.8;
    v.y -= MOVE.gravity * dt;
    if (grounded && v.y < 0) v.y = -1.5;
    v.y = Math.max(v.y, -40);

    this.desired.x = v.x * dt;
    this.desired.y = v.y * dt;
    this.desired.z = v.z * dt;
    const c = this.char;
    c.controller.computeColliderMovement(c.collider, this.desired, this.physics.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const move = c.controller.computedMovement();
    const t = c.body.translation();
    c.body.setNextKinematicTranslation({ x: t.x + move.x, y: t.y + move.y, z: t.z + move.z });

    const wasGrounded = st.grounded;
    st.grounded = c.controller.computedGrounded();
    // blocked horizontally -> drop stored velocity so we don't "stick" then shoot off
    // Remove velocity pushing into steep obstacles (walls, props) so it isn't
    // stored up; walkable slopes keep full speed so stairs/ramps climb smoothly.
    const impactSpeed = Math.hypot(v.x, v.z);
    for (let i = 0, n = c.controller.numComputedCollisions(); i < n; i += 1) {
      const hit = c.controller.computedCollision(i);
      const nrm = hit?.normal1;
      if (!nrm) continue;
      // bumping into another character (kinematic capsule): let the NPC layer react
      const other = hit.collider;
      if (other && other.parent()?.isKinematic()) this.bus.emit('player:contact', { entityId: st.id, handle: other.handle, speed: impactSpeed });
      if (nrm.y < 0.45 && nrm.y > -0.45) {
        const hl = Math.hypot(nrm.x, nrm.z) || 1;
        const nx = nrm.x / hl;
        const nz = nrm.z / hl;
        const into = v.x * nx + v.z * nz;
        if (into < 0) {
          v.x -= nx * into;
          v.z -= nz * into;
        }
      } else if (nrm.y < -0.45 && v.y > 0) {
        v.y = 0; // bumped head
      }
    }
    if (st.grounded && !wasGrounded) {
      const impact = this.airTime;
      if (impact > 0.18) {
        this.landed = impact;
        this.bus.emit('player:land', { entityId: st.id, airTime: impact });
      }
      this.airTime = 0;
    }
    if (!st.grounded) this.airTime += dt;

    st.position.set(t.x + move.x, t.y + move.y - FOOT_OFFSET, t.z + move.z);
    const hs = Math.hypot(v.x, v.z);
    st.speed = hs;
    st.sprinting = sprint && hs > MOVE.walkSpeed + 0.5;
    st.velocity.copy(v);

    // facing: movement direction, or camera direction while aiming
    let targetYaw = st.yaw;
    if (intent.aim) targetYaw = cameraYaw + Math.PI;
    else if (hs > 0.4) targetYaw = Math.atan2(v.x, v.z);
    st.yaw += wrapAngle(targetYaw - st.yaw) * damp(MOVE.turnRate, dt);

    const moved = Math.hypot(move.x, move.z);
    st.stats.distance += moved;
    if (st.grounded) this.stepDistance += moved;
    if (this.stepDistance > (st.sprinting ? 1.25 : 0.95)) {
      this.stepDistance = 0;
      this.bus.emit('player:footstep', { entityId: st.id, sprint: st.sprinting });
    }
    if (moved > 0.0001) this.bus.emit('player:move', { entityId: st.id, x: st.position.x, y: st.position.y, z: st.position.z, yaw: st.yaw });

    if (st.position.y < -15) {
      this.teleport(0, 5, 8);
      this.bus.emit('player:respawn', { entityId: st.id, reason: 'fell' });
    }
  }

  interpolate(alpha) {
    this.renderPosition.lerpVectors(this.prev, this.state.position, clamp(alpha, 0, 1));
    return this.renderPosition;
  }
}
