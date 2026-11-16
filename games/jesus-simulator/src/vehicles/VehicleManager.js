import * as THREE from 'three';
import { buildQuadruped, buildCart, buildChariot } from './mounts.js';
import { terrainHeight, waterDepth, inPlayArea, CIRCUIT, padHeight } from '../world/layout.js';
import { clamp, damp, wrapAngle } from '../core/rng.js';

/**
 * Rideable animals and vehicles: donkeys, horses, carts, chariots and a camel.
 *
 * Each vehicle is a kinematic Rapier body with a cuboid collider. Parked
 * vehicles just sit there (and block like any obstacle). The ridden one is
 * moved by Rapier's character controller with an arcade model: W/S set the
 * gait, A/D steer, Shift gallops, Space hops (animals), F dismounts.
 *
 * Gameplay state (who rides what, laps) lives here and in PlayerState; the
 * meshes only mirror it, so a networked build could replicate vehicle poses.
 */
export const KINDS = {
  donkey: { label: 'Donkey', trot: 5.4, gallop: 8.6, reverse: 1.6, accel: 7, brake: 14, turn: 2.7, half: [0.42, 0.66, 0.95], wheels: false, jump: 6.2, cam: 2.2, verb: 'Ride', scale: 1.22 },
  horse: { label: 'Horse', trot: 8, gallop: 15, reverse: 2, accel: 9, brake: 16, turn: 2.35, half: [0.4, 0.7, 1.05], wheels: false, jump: 7.4, cam: 2.4, verb: 'Ride' },
  camel: { label: 'Camel', trot: 6, gallop: 11, reverse: 1.6, accel: 6, brake: 12, turn: 2.0, half: [0.42, 0.9, 1.05], wheels: false, jump: 0, cam: 2.8, verb: 'Ride' },
  cart: { label: 'Donkey cart', trot: 4.8, gallop: 7.6, reverse: 1.8, accel: 5, brake: 12, turn: 1.7, half: [0.8, 0.6, 1.95], wheels: true, jump: 0, cam: 2.6, verb: 'Drive', offsetZ: -0.15 },
  chariot: { label: 'Chariot', trot: 9.5, gallop: 17.5, reverse: 2.2, accel: 10, brake: 18, turn: 2.0, half: [0.95, 0.65, 2.0], wheels: true, jump: 0, cam: 3.2, verb: 'Steal', offsetZ: 0.45 },
};

const HIT_COOLDOWN = 0.9;
const RETURN_AFTER = 75;
const VISIBLE = 140;
const SHADOW = 45;
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');

export class VehicleManager {
  constructor({ scene, physics, bus, rng, sites }) {
    this.scene = scene;
    this.physics = physics;
    this.R = physics.RAPIER;
    this.bus = bus;
    this.rng = rng;
    this.sites = sites;
    this.list = [];
    this.byId = new Map();
    this.byHandle = new Map();
    this.ridden = null;
    this.time = 0;
    this.hitCd = new Map();
    this.lap = { active: false, t0: 0, quads: new Set(), outT: 0, lastSide: null };
    this.lapTime = 0;
    this.controller = physics.world.createCharacterController(0.05);
    const c = this.controller;
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setMaxSlopeClimbAngle((42 * Math.PI) / 180);
    c.setMinSlopeSlideAngle((50 * Math.PI) / 180);
    c.enableAutostep(0.5, 0.25, false);
    c.enableSnapToGround(0.6);
    c.setSlideEnabled(true);
    c.setApplyImpulsesToDynamicBodies(true);
    c.setCharacterMass(400);
  }

  build() {
    const s = this.sites;
    const defs = [
      { id: 'vehicle.donkey.joseph', kind: 'donkey', name: "Joseph's donkey", spot: { x: -19, z: 7, yaw: 2.0 } },
      { id: 'vehicle.donkey.farm', kind: 'donkey', name: 'Farm donkey', spot: s.farm.donkey },
      { id: 'vehicle.cart.farm', kind: 'cart', name: 'Donkey cart', spot: s.farm.cart },
      { id: 'vehicle.horse.farm', kind: 'horse', name: 'Old mare', spot: s.farm.horse },
      { id: 'vehicle.cart.hamlet', kind: 'cart', name: 'Fish cart', spot: s.hamlet.cart },
      { id: 'vehicle.horse.legion.1', kind: 'horse', species: 'legionHorse', name: 'Legion horse', roman: true, spot: s.outpost.horse1 },
      { id: 'vehicle.horse.legion.2', kind: 'horse', species: 'legionHorse', name: 'Legion horse', roman: true, spot: s.outpost.horse2 },
      { id: 'vehicle.chariot.1', kind: 'chariot', name: 'Roman chariot', roman: true, spot: s.outpost.chariot1 },
      { id: 'vehicle.chariot.2', kind: 'chariot', name: 'Roman chariot', roman: true, spot: s.outpost.chariot2 },
      { id: 'vehicle.camel.camp', kind: 'camel', name: 'Camel', spot: s.camp.camel },
    ];
    for (const d of defs) this.spawn(d);
  }

  spawn(def) {
    const k = KINDS[def.kind];
    let model;
    if (def.kind === 'cart') model = buildCart();
    else if (def.kind === 'chariot') model = buildChariot();
    else {
      const q = buildQuadruped(def.kind, def.species || def.kind);
      model = { group: q.group, animals: [q], wheels: [], seat: { x: 0, y: q.seatY, z: 0.02 }, standing: false };
    }
    model.group.name = def.id;
    if (k.scale) {
      model.group.scale.setScalar(k.scale);
      model.seat = { x: model.seat.x * k.scale, y: model.seat.y * k.scale, z: model.seat.z * k.scale };
      model.wheelR = (model.wheelR || 1) * k.scale;
    }
    this.scene.add(model.group);
    const [hx, hy, hz] = k.half;
    const body = this.physics.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -60, 0));
    const collider = this.physics.world.createCollider(
      this.R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(0, 0, k.offsetZ || 0).setFriction(0.2),
      body,
    );
    const v = {
      id: def.id, kind: def.kind, k, name: def.name, roman: !!def.roman, def, model, body, collider,
      pos: new THREE.Vector3(), prev: new THREE.Vector3(), render: new THREE.Vector3(),
      yaw: 0, prevYaw: 0, renderYaw: 0, speed: 0, vy: 0, grounded: true, pitch: 0, roll: 0,
      phase: this.rng() * 10, idleT: this.rng() * 8, wheelAngle: 0, unattended: 0, stepAcc: 0,
      home: { ...def.spot }, shadows: true, stolen: false,
    };
    this.list.push(v);
    this.byId.set(v.id, v);
    this.byHandle.set(collider.handle, v);
    this.place(v, def.spot.x, def.spot.z, def.spot.yaw);
    return v;
  }

  rideHeight(v) {
    return v.k.half[1] + 0.02;
  }

  place(v, x, z, yaw, y = terrainHeight(x, z)) {
    v.pos.set(x, y, z);
    v.prev.copy(v.pos);
    v.render.copy(v.pos);
    v.yaw = yaw;
    v.prevYaw = yaw;
    v.renderYaw = yaw;
    v.speed = 0;
    v.vy = 0;
    const t = { x, y: y + this.rideHeight(v), z };
    tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    v.body.setTranslation(t, true);
    v.body.setRotation(tmpQ, true);
    v.body.setNextKinematicTranslation(t);
    v.body.setNextKinematicRotation(tmpQ);
  }

  // ---------------------------------------------------------------- mounting
  /** Nearest vehicle the player could get on (within reach of its body). */
  findMountTarget(pos) {
    let best = null;
    let bestD = 3.0;
    for (const v of this.list) {
      if (v === this.ridden) continue;
      // distance to the vehicle's footprint box
      const dx = pos.x - v.pos.x;
      const dz = pos.z - v.pos.z;
      const c = Math.cos(v.yaw);
      const s = Math.sin(v.yaw);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c - (v.k.offsetZ || 0);
      const ox = Math.max(0, Math.abs(lx) - v.k.half[0]);
      const oz = Math.max(0, Math.abs(lz) - v.k.half[2]);
      const d = Math.hypot(ox, oz);
      if (d < bestD && Math.abs(pos.y - v.pos.y) < 2.5) { bestD = d; best = v; }
    }
    return best;
  }

  promptFor(v) {
    if (v.roman) return `Steal the ${this.displayName(v)}`;
    return `${v.k.verb} ${this.displayName(v, true)}`;
  }

  /** "the farm donkey" / "Joseph's donkey" / "the Roman chariot". */
  displayName(v, article = true) {
    if (v.name.startsWith('Joseph')) return v.name;
    const n = v.name.replace(/^Roman /, 'Roman ').replace(/^Legion /, 'legion ');
    const lower = n.charAt(0) === 'R' && n.startsWith('Roman') ? n : n.toLowerCase();
    return article ? `the ${lower}` : lower;
  }

  mount(v, player, state) {
    if (this.ridden) return false;
    this.ridden = v;
    v.unattended = 0;
    v.speed = 0;
    player.collider.setEnabled(false);
    state.mode = 'mounted';
    state.mount = { id: v.id, kind: v.kind, roman: v.roman, name: v.name };
    state.stats.rides = (state.stats.rides || 0) + 1;
    if (v.roman && !v.stolen) {
      v.stolen = true;
      if (v.kind === 'chariot') state.stats.chariotsStolen = (state.stats.chariotsStolen || 0) + 1;
    }
    this.seatPlayer(v, player, state, true);
    this.bus.emit('vehicle:enter', { entityId: state.id, vehicleId: v.id, kind: v.kind, roman: v.roman, x: v.pos.x, z: v.pos.z });
    return true;
  }

  /** Get off: to the left, else right, else behind. Returns false if nowhere is free. */
  dismount(player, state, { force = false, reason = 'player' } = {}) {
    const v = this.ridden;
    if (!v) return false;
    const c = Math.cos(v.yaw);
    const s = Math.sin(v.yaw);
    const side = v.k.half[0] + 0.75;
    const back = v.k.half[2] + 0.8 - (v.k.offsetZ || 0);
    const candidates = [[side, 0], [-side, 0], [side, -0.8], [-side, 0.8], [0, -back], [0, back + 1.2]];
    let spot = null;
    for (const [lx, lz] of candidates) {
      const x = v.pos.x + lx * c + lz * s;
      const z = v.pos.z - lx * s + lz * c;
      if (!inPlayArea(x, z) || waterDepth(x, z) > 1.1) continue;
      if (!this.blocked(x, z, Math.max(v.pos.y, terrainHeight(x, z)))) { spot = { x, z }; break; }
    }
    if (!spot) {
      if (!force) return false;
      spot = { x: v.pos.x, z: v.pos.z };
    }
    this.ridden = null;
    v.speed = 0;
    this.lap.active = false;
    player.collider.setEnabled(true);
    player.teleport(spot.x, Math.max(v.pos.y, terrainHeight(spot.x, spot.z)), spot.z, v.yaw);
    state.mode = 'on-foot';
    state.mount = null;
    this.bus.emit('vehicle:exit', { entityId: state.id, vehicleId: v.id, kind: v.kind, reason });
    return true;
  }

  blocked(x, z, y) {
    const R = this.R;
    this.ball ||= new R.Capsule(0.5, 0.36);
    const hit = this.physics.world.intersectionWithShape(
      { x, y: y + 0.95, z }, { x: 0, y: 0, z: 0, w: 1 }, this.ball, undefined, undefined, undefined, undefined,
      (col) => col.shape.type !== R.ShapeType.TriMesh && !this.byHandle.has(col.handle),
    );
    return !!hit;
  }

  seatPlayer(v, player, state, snap = false) {
    const seat = v.model.seat;
    const c = Math.cos(v.yaw);
    const s = Math.sin(v.yaw);
    const x = v.pos.x + seat.z * s + seat.x * c;
    const z = v.pos.z + seat.z * c - seat.x * s;
    const y = v.pos.y + seat.y - (v.model.standing ? 0 : 0.95);
    if (snap) player.prev.set(x, y, z);
    else player.prev.copy(state.position);
    state.position.set(x, y, z);
    state.yaw = v.yaw;
    state.velocity.set(Math.sin(v.yaw) * v.speed, v.vy, Math.cos(v.yaw) * v.speed);
    state.speed = Math.abs(v.speed);
    state.grounded = v.grounded;
    state.sprinting = false;
    const b = player.char.body;
    b.setNextKinematicTranslation({ x, y: y + 0.9, z });
    if (snap) {
      b.setTranslation({ x, y: y + 0.9, z }, true);
      player.renderPosition.copy(state.position);
    }
  }

  // ---------------------------------------------------------------- simulation
  /**
   * @param intent player intent (moveX/moveY/sprint/jump)
   */
  fixedUpdate(dt, intent, player, state) {
    this.time += dt;
    for (const [h, t] of this.hitCd) if (t < this.time) this.hitCd.delete(h);
    for (const v of this.list) {
      v.prev.copy(v.pos);
      v.prevYaw = v.yaw;
      if (v !== this.ridden) {
        // a parked ride left far from home eventually wanders back (out of sight)
        const away = Math.hypot(v.pos.x - v.home.x, v.pos.z - v.home.z) > 4;
        const far = Math.hypot(v.pos.x - state.position.x, v.pos.z - state.position.z) > 70 && Math.hypot(v.home.x - state.position.x, v.home.z - state.position.z) > 70;
        v.unattended = away && far ? v.unattended + dt : 0;
        if (v.unattended > RETURN_AFTER) {
          this.place(v, v.home.x, v.home.z, v.home.yaw);
          v.unattended = 0;
          v.stolen = false;
          this.bus.emit('vehicle:returned', { vehicleId: v.id, kind: v.kind });
        }
        continue;
      }
      this.drive(v, dt, intent || {});
      this.seatPlayer(v, player, state);
      state.stats.ridden = (state.stats.ridden || 0) + Math.hypot(v.pos.x - v.prev.x, v.pos.z - v.prev.z);
      this.updateLap(v, dt, state);
    }
  }

  drive(v, dt, intent) {
    const k = v.k;
    const iy = intent.moveY || 0;
    const ix = intent.moveX || 0;
    let target = 0;
    let rate = k.accel;
    if (iy > 0.1) target = (intent.sprint ? k.gallop : k.trot) * iy;
    else if (iy < -0.1) {
      if (v.speed > 0.4) { target = 0; rate = k.brake; } else target = -k.reverse;
    } else rate = k.brake * 0.35;
    if (v.speed > target && v.speed > 0) rate = Math.max(rate, iy > 0.1 ? k.brake * 0.4 : rate);
    const dv = target - v.speed;
    v.speed += Math.sign(dv) * Math.min(Math.abs(dv), rate * dt);

    // steering: animals can turn on the spot, wheels need a little speed
    const sp = Math.abs(v.speed);
    let turn = k.turn * (1 - 0.42 * clamp(sp / k.gallop, 0, 1));
    if (k.wheels) turn *= clamp(sp / 1.6, 0, 1);
    else turn *= sp < 0.3 ? 0.6 : 1;
    v.yaw = wrapAngle(v.yaw - ix * turn * dt * (v.speed < -0.1 ? -1 : 1));

    // water and the edge of the world stop the ride
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    const reach = k.half[2] + 0.6;
    const dir = v.speed >= 0 ? 1 : -1;
    const ax = v.pos.x + fx * reach * dir;
    const az = v.pos.z + fz * reach * dir;
    if (waterDepth(ax, az) > 0.75 && v.speed * dir > 0) {
      v.speed *= 0.5;
      if (Math.abs(v.speed) < 0.5) v.speed = 0;
      if (!this.waterCd || this.waterCd < this.time) {
        this.waterCd = this.time + 4;
        this.bus.emit('vehicle:refuse', { vehicleId: v.id, kind: v.kind, reason: 'water' });
      }
    }
    if (!inPlayArea(ax, az) && v.speed * dir > 0) {
      v.speed = 0;
      if (!this.edgeCd || this.edgeCd < this.time) {
        this.edgeCd = this.time + 4;
        this.bus.emit('player:boundary', { entityId: 'player.local' });
      }
    }

    // hop
    if (intent.jump && v.grounded && k.jump > 0) {
      v.vy = k.jump;
      this.bus.emit('vehicle:jump', { vehicleId: v.id, kind: v.kind });
    }
    v.vy -= 24 * dt;
    if (v.grounded && v.vy < 0) v.vy = -2;

    const desired = { x: fx * v.speed * dt, y: v.vy * dt, z: fz * v.speed * dt };
    const c = this.controller;
    tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, v.yaw);
    c.computeColliderMovement(v.collider, desired, this.R.QueryFilterFlags.EXCLUDE_SENSORS);
    const move = c.computedMovement();
    const t = v.body.translation();
    const nx = t.x + move.x;
    const ny = t.y + move.y;
    const nz = t.z + move.z;
    v.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    v.body.setNextKinematicRotation(tmpQ);
    const wasGrounded = v.grounded;
    v.grounded = c.computedGrounded();
    if (v.grounded && !wasGrounded && v.vy < -5) this.bus.emit('vehicle:land', { vehicleId: v.id });
    // blocked: speed follows what actually happened (no stored-up velocity)
    const want = Math.hypot(desired.x, desired.z);
    const got = Math.hypot(move.x, move.z);
    if (want > 0.002 && got < want * 0.5) v.speed *= 0.6;

    // collisions: people get knocked, props get shoved
    for (let i = 0, n = c.numComputedCollisions(); i < n; i += 1) {
      const hit = c.computedCollision(i);
      const other = hit?.collider;
      if (!other || this.hitCd.has(other.handle)) continue;
      const body = other.parent();
      if (!body) continue;
      if (body.isKinematic() && !this.byHandle.has(other.handle)) {
        this.hitCd.set(other.handle, this.time + HIT_COOLDOWN);
        this.bus.emit('vehicle:hit', { vehicleId: v.id, kind: v.kind, handle: other.handle, speed: sp, dirX: fx * dir, dirZ: fz * dir, x: v.pos.x, z: v.pos.z });
      } else if (body.isDynamic() && sp > 1.5) {
        this.hitCd.set(other.handle, this.time + 0.3);
        const m = body.mass();
        body.applyImpulse({ x: fx * dir * sp * m * 0.6, y: sp * m * 0.25, z: fz * dir * sp * m * 0.6 }, true);
        this.bus.emit('vehicle:bump-prop', { vehicleId: v.id, handle: other.handle, speed: sp });
      }
    }

    v.pos.set(nx, ny - this.rideHeight(v), nz);
    // keep the visual feet on the ground on soft slopes
    const ground = terrainHeight(nx, nz);
    if (v.grounded && Math.abs(v.pos.y - ground) < 0.35) v.pos.y = Math.max(v.pos.y, ground - 0.05);
    if (v.pos.y < -15) {
      this.place(v, v.home.x, v.home.z, v.home.yaw);
    }
    // gait sounds
    v.stepAcc += Math.abs(v.speed) * dt;
    const stride = v.speed > k.trot + 1 ? 1.6 : 1.0;
    if (v.stepAcc > stride && v.grounded) {
      v.stepAcc = 0;
      this.bus.emit('vehicle:step', { vehicleId: v.id, kind: v.kind, gallop: Math.abs(v.speed) > k.trot + 1, wheels: k.wheels });
    }
  }

  // ---------------------------------------------------------------- the circus
  updateLap(v, dt, state) {
    const C = CIRCUIT;
    const L = this.lap;
    const dx = v.pos.x - C.x;
    const dz = v.pos.z - C.z;
    const outer = Math.hypot(dx / (C.rx + 1.4), dz / (C.rz + 1.4));
    const inner = Math.hypot(dx / C.innerRx, dz / C.innerRz);
    const onTrack = outer < 1.05 && inner > 0.85;
    if (L.active) L.outT = onTrack ? 0 : L.outT + dt;
    if (L.active && L.outT > 4) {
      L.active = false;
      this.bus.emit('circuit:abort', { entityId: state.id });
    }
    if (!onTrack) { L.lastSide = null; return; }
    // quadrant visits
    const q = (dx >= 0 ? 1 : 0) + (dz >= 0 ? 2 : 0);
    if (L.active) L.quads.add(q);
    // the start line: x = C.x on the south (+z) straight
    const side = dx >= 0 ? 1 : -1;
    if (dz > 0 && L.lastSide !== null && side !== L.lastSide) {
      const now = this.time;
      if (L.active && L.quads.size >= 4 && now - L.t0 > 4) {
        const time = now - L.t0;
        const best = state.stats.bestLap || 0;
        const record = !best || time < best;
        if (record) state.stats.bestLap = Math.round(time * 100) / 100;
        state.stats.laps = (state.stats.laps || 0) + 1;
        this.bus.emit('circuit:lap', { entityId: state.id, time, record, best: state.stats.bestLap, kind: v.kind, laps: state.stats.laps });
      } else if (!L.active) this.bus.emit('circuit:start', { entityId: state.id, kind: v.kind });
      L.active = true;
      L.t0 = now;
      L.quads = new Set([q]);
      L.outT = 0;
    }
    L.lastSide = side;
    this.lapTime = L.active ? this.time - L.t0 : 0;
  }

  // ---------------------------------------------------------------- visuals
  update(dt, alpha, cameraPos) {
    for (const v of this.list) {
      const a = clamp(alpha, 0, 1);
      v.render.lerpVectors(v.prev, v.pos, a);
      v.renderYaw = v.prevYaw + wrapAngle(v.yaw - v.prevYaw) * a;
      const g = v.model.group;
      const d = Math.hypot(v.render.x - cameraPos.x, v.render.z - cameraPos.z);
      g.visible = d < VISIBLE;
      if (!g.visible) continue;
      const shadows = d < SHADOW;
      if (shadows !== v.shadows) {
        v.shadows = shadows;
        g.traverse((o) => { if (o.isMesh) o.castShadow = shadows; });
      }
      // follow the slope: pitch from the ground ahead/behind, roll from the sides
      const c = Math.cos(v.renderYaw);
      const s = Math.sin(v.renderYaw);
      const L = v.k.half[2];
      const W = v.k.half[0];
      const hf = terrainHeight(v.render.x + s * L, v.render.z + c * L);
      const hb = terrainHeight(v.render.x - s * L, v.render.z - c * L);
      const hl = terrainHeight(v.render.x + c * W, v.render.z - s * W);
      const hr = terrainHeight(v.render.x - c * W, v.render.z + s * W);
      const onPad = Math.abs(v.render.y - (hf + hb) / 2) < 0.4;
      const tp = onPad ? -Math.atan2(hf - hb, L * 2) : 0;
      const tr = onPad ? Math.atan2(hl - hr, W * 2) * 0.6 : 0;
      v.pitch += (clamp(tp, -0.45, 0.45) - v.pitch) * damp(8, dt);
      v.roll += (clamp(tr, -0.25, 0.25) - v.roll) * damp(8, dt);
      g.position.copy(v.render);
      tmpE.set(v.pitch, v.renderYaw, v.roll, 'YXZ');
      g.quaternion.setFromEuler(tmpE);
      this.animate(v, dt);
    }
  }

  animate(v, dt) {
    const sp = Math.abs(v.speed);
    const riding = v === this.ridden;
    v.phase += dt * (sp > 0.2 ? 2.2 + sp * 0.9 : 0);
    v.idleT += dt;
    const gallop = sp > v.k.trot + 1;
    const amp = clamp(0.12 + sp * 0.07, 0, gallop ? 0.85 : 0.55) * (sp > 0.2 ? 1 : 0);
    for (const a of v.model.animals) {
      const ph = v.phase + (a.group.position.x > 0 ? 0.6 : 0);
      const [fl, fr, bl, br] = a.legs;
      if (gallop) {
        fl.rotation.x = Math.sin(ph) * amp;
        fr.rotation.x = Math.sin(ph + 0.5) * amp;
        bl.rotation.x = Math.sin(ph + Math.PI) * amp;
        br.rotation.x = Math.sin(ph + Math.PI + 0.5) * amp;
      } else {
        fl.rotation.x = Math.sin(ph) * amp;
        br.rotation.x = Math.sin(ph) * amp;
        fr.rotation.x = Math.sin(ph + Math.PI) * amp;
        bl.rotation.x = Math.sin(ph + Math.PI) * amp;
      }
      const bob = sp > 0.2 ? Math.abs(Math.sin(ph)) * (gallop ? 0.09 : 0.04) : 0;
      a.root.position.y = bob;
      a.root.rotation.x = gallop ? Math.sin(ph * 2) * 0.05 : 0;
      // head: nods with the gait; grazes when parked and nobody's near
      let headX = sp > 0.2 ? Math.sin(ph * 2) * 0.08 * (gallop ? 1.6 : 1) : 0;
      if (!riding && sp < 0.1) {
        const cyc = (v.idleT % 11) / 11;
        headX = cyc > 0.55 && cyc < 0.85 ? 0.95 * Math.sin(((cyc - 0.55) / 0.3) * Math.PI) : Math.sin(v.idleT * 0.7) * 0.05;
      }
      a.head.rotation.x += (headX - a.head.rotation.x) * damp(6, dt);
      a.tail.rotation.z = Math.sin(v.idleT * 2.3 + a.group.position.x) * (sp > 0.2 ? 0.08 : 0.25);
      a.tail.rotation.x = -0.35 - (gallop ? 0.5 : sp * 0.03);
    }
    if (v.model.wheels.length) {
      v.wheelAngle += (v.speed * dt) / v.model.wheelR;
      for (const w of v.model.wheels) w.rotation.x = v.wheelAngle;
      if (v.model.car) v.model.car.rotation.x = sp > 1 ? Math.sin(v.phase * 1.7) * 0.012 : 0;
    }
  }

  /** Rider transform for the Jesus model (feet origin on the seat). */
  riderPose(v) {
    return { x: v.render.x, y: v.render.y, z: v.render.z, yaw: v.renderYaw, pitch: v.pitch, roll: v.roll, seat: v.model.seat, standing: !!v.model.standing };
  }

  minimapDots() {
    const out = [];
    for (const v of this.list) if (v !== this.ridden) out.push({ x: v.pos.x, z: v.pos.z, color: v.roman ? '#c0281e' : '#8a5c34', kind: 'vehicle' });
    return out;
  }

  reset() {
    this.ridden = null;
    this.lap.active = false;
    for (const v of this.list) {
      v.stolen = false;
      v.unattended = 0;
      this.place(v, v.home.x, v.home.z, v.home.yaw);
    }
  }

  stats() {
    return {
      count: this.list.length,
      ridden: this.ridden ? { id: this.ridden.id, kind: this.ridden.kind, speed: Math.round(this.ridden.speed * 100) / 100, yaw: this.ridden.yaw, x: this.ridden.pos.x, y: this.ridden.pos.y, z: this.ridden.pos.z, grounded: this.ridden.grounded } : null,
      lap: { active: this.lap.active, time: this.lapTime, quads: this.lap.quads.size },
      vehicles: this.list.map((v) => ({ id: v.id, kind: v.kind, x: Math.round(v.pos.x * 10) / 10, z: Math.round(v.pos.z * 10) / 10, roman: v.roman, stolen: v.stolen })),
    };
  }
}

export { padHeight };
