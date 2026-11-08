import * as THREE from 'three';
import { terrainHeight } from '../world/Layout.js';
import { clamp, damp, lerp } from '../utils/random.js';
import { carPaint } from '../world/Effects.js';

// One drivable vehicle: CC0 Kenney model with separate wheels, arcade physics
// (bicycle-model steering, longitudinal engine/brake/reverse, lateral grip with
// handbrake drift), suspension approximation from terrain + load transfer,
// static collision with 3 body circles, damage, head/brake/reverse lights.

const _v = new THREE.Vector3();

export class Vehicle {
  constructor(system, spec, gltf, spawn) {
    this.system = system;
    this.spec = spec;
    this.spawn = spawn;
    this.root = new THREE.Group();
    this.root.name = `Vehicle:${spec.label}`;
    this.body = new THREE.Group(); // pitch/roll for suspension
    this.root.add(this.body);

    // --- model: normalise to real width, centre on the ground
    const model = gltf.scene.clone(true);
    model.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(model);
    const s = spec.width / (bb.max.x - bb.min.x);
    model.scale.setScalar(s);
    model.position.set(-(bb.min.x + bb.max.x) / 2 * s, -bb.min.y * s, -(bb.min.z + bb.max.z) / 2 * s);
    this.materials = [];
    this.wheels = [];
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.material = carPaint(o.material);
        this.materials.push(o.material);
      }
      if (/^wheel-(front|back)-(left|right)$/.test(o.name)) {
        this.wheels.push({ node: o, front: o.name.includes('front'), baseRot: o.rotation.clone() });
      }
    });
    this.body.add(model);
    this.model = model;
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    this.size = size;
    this.halfW = size.x / 2;
    this.halfL = size.z / 2;
    this.height = size.y;
    this.wheelRadius = 0.3 * s;

    this.buildLights();

    // --- state
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2(); // world x,z velocity
    this.heading = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.throttle = 0;
    this.braking = false;
    this.reversing = false;
    this.handbrake = false;
    this.health = 100;
    this.wrecked = false;
    this.driver = null;
    this.headlights = false;
    this.siren = false;
    this.sirenPhase = 0;
    this.wheelSpin = 0;
    this.pitch = 0; this.roll = 0;
    this.bodyY = 0;
    this.speed = 0; // signed forward speed
    this.slip = 0;
    this.smokeTimer = 0;
    this.lastImpact = -1;
    this.reset();
    system.scene.add(this.root);
  }

  buildLights() {
    // every lamp of the car lives in ONE vertex-coloured mesh (one draw call);
    // each lamp group exposes `emissiveIntensity` and rewrites its own vertex colours
    const w = this.halfW, l = this.halfL, h = this.height;
    const pos = [], groups = [];
    const box = (cx, cy, cz, sx, sy, sz) => {
      const g = new THREE.BoxGeometry(sx, sy, sz).translate(cx, cy, cz).toNonIndexed();
      const start = pos.length / 3;
      pos.push(...g.attributes.position.array);
      return { start, count: g.attributes.position.count };
    };
    const group = (hex, init, boxes) => {
      const grp = { color: new THREE.Color(hex), ranges: boxes, value: -1 };
      groups.push(grp);
      const self = this;
      const api = { get emissiveIntensity() { return grp.value; }, set emissiveIntensity(v) { if (Math.abs(v - grp.value) > 0.01) { grp.value = v; self.paintLamp(grp); } } };
      grp.init = init;
      return api;
    };
    const fy = h * 0.36, ry = h * 0.42;
    this.headMat = group(0xfff4dd, 0.15, [box(w * 0.62, fy, l - 0.02, 0.34, 0.14, 0.06), box(-w * 0.62, fy, l - 0.02, 0.34, 0.14, 0.06)]);
    this.tailMat = group(0xff2a1a, 0.25, [box(w * 0.66, ry, -l + 0.02, 0.34, 0.14, 0.06), box(-w * 0.66, ry, -l + 0.02, 0.34, 0.14, 0.06)]);
    this.reverseMat = group(0xffffff, 0.02, [box(w * 0.3, ry, -l + 0.02, 0.2, 0.1, 0.06)]);
    if (this.spec.siren) {
      this.sirenRed = group(0xff1a1a, 0.15, [box(0.3, h + 0.1, -0.15, 0.55, 0.16, 0.3)]);
      this.sirenBlue = group(0x1a4dff, 0.15, [box(-0.3, h + 0.1, -0.15, 0.55, 0.16, 0.3)]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
    this.lampMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    this.body.add(this.lampMesh);
    this.lampGroups = groups;
    for (const g of groups) { g.value = g.init; this.paintLamp(g); }
  }

  paintLamp(grp) {
    const col = this.lampMesh.geometry.attributes.color;
    const k = Math.max(0.05, grp.value);
    for (const r of grp.ranges) for (let i = r.start; i < r.start + r.count; i++) col.setXYZ(i, grp.color.r * k, grp.color.g * k, grp.color.b * k);
    col.needsUpdate = true;
  }

  reset() {
    const sp = this.spawn;
    this.pos.set(sp.x, terrainHeight(sp.x, sp.z), sp.z);
    this.heading = sp.h;
    this.vel.set(0, 0);
    this.yawRate = 0;
    this.health = 100;
    this.wrecked = false;
    this.siren = false;
    this.fuel = 55 + Math.random() * 45;
    this.locked = !!this.lockable;
    for (const m of this.materials) m.color.setScalar(1);
    this.syncTransform();
  }

  get forward() { return _v.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  /** Driver inputs: throttle -1..1 (S = brake/reverse), steer -1..1 (D = +1 right), handbrake bool. */
  update(dt, input) {
    const sp = this.spec;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx; // right vector
    let vf = this.vel.x * fx + this.vel.y * fz;
    let vr = this.vel.x * rx + this.vel.y * rz;

    // fuel: only the player's car burns it; an empty tank kills the engine
    if (this.driver && this.driver === this.system.game.player && input.throttle) {
      const before = this.fuel;
      this.fuel = Math.max(0, this.fuel - Math.abs(input.throttle) * (0.1 + Math.abs(this.speed) / this.spec.maxSpeed * 0.28) * dt);
      if (before > 15 && this.fuel <= 15) this.system.game.hud.toast('LOW FUEL', 'Find a gas station (⛽ on the map).', 'alert');
      if (before > 0 && this.fuel <= 0) this.system.game.hud.toast('OUT OF GAS', 'The engine died. Push on or find another car.', 'alert');
    }
    const thr = this.wrecked || (this.fuel <= 0 && this.driver === this.system.game.player) ? 0 : input.throttle;
    this.braking = false;
    this.reversing = false;
    if (thr > 0) {
      if (vf < -0.5) { vf = Math.min(0, vf + sp.brake * dt); this.braking = true; }
      else vf += sp.accel * thr * dt * Math.max(0.08, 1 - (vf / sp.maxSpeed) ** 2);
    } else if (thr < 0) {
      if (vf > 0.5) { vf = Math.max(0, vf - sp.brake * dt * -thr); this.braking = true; }
      else { vf -= sp.accel * 0.6 * -thr * dt; vf = Math.max(vf, -sp.reverse); this.reversing = vf < -0.3; }
    }
    // rolling resistance + air drag
    const roll = (thr === 0 ? 1.6 : 0.4) + Math.abs(vf) * sp.drag * 0.25;
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), roll * dt);
    if (input.handbrake) { vf -= Math.sign(vf) * Math.min(Math.abs(vf), 7 * dt); this.braking = true; }

    // steering: less lock at speed, smoothed
    const speedK = clamp(Math.abs(vf) / sp.maxSpeed, 0, 1);
    const targetSteer = input.steer * sp.steer * (1 - speedK * 0.55);
    this.steer = damp(this.steer, targetSteer, 9, dt);
    let targetYaw = (-this.steer * vf) / sp.wheelbase;
    // tyres can only deliver so much lateral acceleration: cap the yaw rate at speed
    const latMax = sp.grip * 1.75 * (input.handbrake ? 2.3 : 1);
    const yawCap = latMax / Math.max(4, Math.abs(vf));
    targetYaw = clamp(targetYaw, -yawCap, yawCap);
    if (input.handbrake && Math.abs(vf) > 4) targetYaw *= 1.35;
    this.yawRate = damp(this.yawRate, targetYaw, input.handbrake ? 5 : 7, dt);

    // lateral grip: velocity stays in world space while the body rotates, so the
    // sideways component that appears is bled off by tyre grip (low grip = drift)
    const grip = input.handbrake ? sp.driftGrip : sp.grip * (1 - speedK * 0.35);
    vr *= Math.exp(-grip * dt);
    this.slip = Math.abs(vr);
    this.vel.set(fx * vf + rx * vr, fz * vf + rz * vr);
    this.speed = vf;
    this.heading += this.yawRate * dt;

    // integrate
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    this.collide(dt, ox, oz);
    this.suspension(dt, vf, vr, thr);
    this.animateParts(dt, vf, input);
    this.syncTransform();
  }

  /** Coasting update for unoccupied vehicles (handbrake engaged). */
  idle(dt) {
    if (this.vel.lengthSq() < 0.0004 && Math.abs(this.yawRate) < 0.001) {
      this.animateParts(dt, 0, { steer: 0 });
      return;
    }
    this.update(dt, { throttle: 0, steer: 0, handbrake: true });
  }

  circles() {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const r = this.halfW * 0.95;
    const off = this.halfL - r;
    return [
      { x: this.pos.x + fx * off, z: this.pos.z + fz * off, r, k: 1 },
      { x: this.pos.x, z: this.pos.z, r, k: 0 },
      { x: this.pos.x - fx * off, z: this.pos.z - fz * off, r, k: -1 },
    ];
  }

  collide(dt, ox, oz) {
    const col = this.system.collision;
    let px = 0, pz = 0, hitK = 0, hits = 0;
    for (const c of this.circles()) {
      const res = col.resolveCharacter(c.x, c.z, c.r, this.pos.y, 0.35, 0, 1.5);
      const dx = res.x - c.x, dz = res.z - c.z;
      if (res.hit && (Math.abs(dx) > 1e-5 || Math.abs(dz) > 1e-5)) {
        if (Math.abs(dx) > Math.abs(px)) px = dx;
        if (Math.abs(dz) > Math.abs(pz)) pz = dz;
        hitK += c.k; hits++;
      }
    }
    // other vehicles
    for (const o of this.system.vehicles) {
      if (o === this) continue;
      const d = Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
      if (d > this.halfL + o.halfL + 1) continue;
      for (const a of this.circles()) for (const b of o.circles()) {
        const dx = a.x - b.x, dz = a.z - b.z, dd = Math.hypot(dx, dz), rr = a.r + b.r;
        if (dd < rr && dd > 1e-4) {
          const push = (rr - dd) * 0.5;
          px += (dx / dd) * push; pz += (dz / dd) * push;
          // transfer some momentum to the other car
          const rel = this.vel.x * (-dx / dd) + this.vel.y * (-dz / dd);
          if (rel > 4 && this.driver && o.police) this.system.game.events.emit('policeHit', o);
          if (rel > 0) { o.vel.x += (-dx / dd) * rel * 0.5 * (this.spec.mass / o.spec.mass); o.vel.y += (-dz / dd) * rel * 0.5 * (this.spec.mass / o.spec.mass); o.yawRate += (Math.random() - 0.5) * rel * 0.08; }
          hitK += a.k; hits++;
        }
      }
    }
    // traffic cars: a real hit turns them into physical vehicles, a nudge just pushes us
    const tr = this.system.game.traffic;
    if (tr) {
      for (const c of [...tr.cars]) {
        if (Math.abs(c.x - this.pos.x) > 8 || Math.abs(c.z - this.pos.z) > 8) continue;
        let hit = false;
        for (const a of this.circles()) for (const b of tr.carCircles(c)) {
          const dx = a.x - b.x, dz = a.z - b.z, dd = Math.hypot(dx, dz), rr = a.r + b.r;
          if (dd < rr && dd > 1e-4 && !hit) {
            hit = true;
            const rel = Math.hypot(this.vel.x - Math.sin(c.heading) * c.speed, this.vel.y - Math.cos(c.heading) * c.speed);
            if (rel > 3) {
              const k = (this.spec.mass / 1500) * 0.6;
              tr.toVehicle(c, { x: -dx / dd * rel * k, z: -dz / dd * rel * k });
              if (this.driver) this.system.game.events.emit('trafficCrash', c);
            }
            px += (dx / dd) * (rr - dd); pz += (dz / dd) * (rr - dd);
            hitK += a.k; hits++;
          }
        }
      }
    }
    if (this.system.game.npcs && Math.hypot(this.vel.x, this.vel.y) > 0.5) this.system.game.npcs.vehicleSweep(this);
    // an AI or runaway car hitting the player on foot
    const pl = this.system.game.player;
    if (!this.driver && pl && !pl.vehicle && !this.system.game.interior && Math.hypot(this.vel.x, this.vel.y) > 1) {
      const hitP = this.pushCircle(pl.pos.x, pl.pos.z, 0.4);
      if (hitP) pl.hitByVehicle(this, Math.hypot(this.vel.x, this.vel.y), hitP);
    }
    if (!hits) return;
    this.pos.x += px; this.pos.z += pz;
    const n = Math.hypot(px, pz);
    if (n < 1e-6) return;
    const nx = px / n, nz = pz / n;
    const vn = this.vel.x * nx + this.vel.y * nz;
    if (vn < 0) {
      const e = 0.25;
      this.vel.x -= (1 + e) * vn * nx;
      this.vel.y -= (1 + e) * vn * nz;
      // scrub some tangential speed too
      this.vel.multiplyScalar(0.92);
      const impact = -vn;
      this.yawRate += clamp(hitK, -1, 1) * impact * 0.06 * (Math.random() < 0.5 ? -1 : 1);
      this.onImpact(impact);
    }
    void dt; void ox; void oz;
  }

  onImpact(impact) {
    const now = this.system.game.playTime;
    if (impact > 2.5 && now - this.lastImpact > 0.18) {
      this.lastImpact = now;
      const dmg = (impact - 2.5) * (impact > 12 ? 2.4 : 1.8) * (1500 / this.spec.mass) ** 0.3 * (this.armored ? 0.45 : 1);
      this.health = Math.max(0, this.health - dmg);
      const k = 1 - this.health / 100;
      for (const m of this.materials) m.color.setScalar(lerp(1, 0.42, k));
      this.system.onVehicleImpact(this, impact);
      if (this.health <= 0 && !this.wrecked) {
        this.wrecked = true;
        this.system.onWrecked(this);
      }
    }
  }

  suspension(dt, vf, vr, thr) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    const L = this.halfL * 0.75, W = this.halfW * 0.8;
    const hF = terrainHeight(this.pos.x + fx * L, this.pos.z + fz * L);
    const hB = terrainHeight(this.pos.x - fx * L, this.pos.z - fz * L);
    const hR = terrainHeight(this.pos.x + rx * W, this.pos.z + rz * W);
    const hLft = terrainHeight(this.pos.x - rx * W, this.pos.z - rz * W);
    const groundY = Math.max((hF + hB + hR + hLft) / 4, Math.min(hF, hB, hR, hLft));
    this.pos.y = damp(this.pos.y, groundY, 14, dt);
    const terrainPitch = Math.atan2(hB - hF, L * 2);
    const terrainRoll = Math.atan2(hLft - hR, W * 2);
    // load transfer: nose dips under braking, squats on throttle, body rolls out of turns
    const accelPitch = this.braking ? 0.045 : thr > 0 ? -0.03 * thr : 0;
    const lateral = this.yawRate * vf;
    this.pitch = damp(this.pitch, terrainPitch + accelPitch, 6, dt);
    this.roll = damp(this.roll, terrainRoll + clamp(lateral * 0.006, -0.07, 0.07), 6, dt);
    this.bodyY = damp(this.bodyY, Math.min(0.06, Math.abs(vr) * 0.005), 6, dt);
  }

  animateParts(dt, vf, input) {
    this.wheelSpin += (vf / Math.max(0.1, this.wheelRadius)) * dt;
    for (const w of this.wheels) {
      w.node.rotation.set(w.baseRot.x + this.wheelSpin, w.baseRot.y + (w.front ? -this.steer * 1.0 : 0), w.baseRot.z);
    }
    void input;
    // lights
    const night = this.system.night;
    const on = this.driver ? this.headlights : false;
    this.headMat.emissiveIntensity = on ? 3.2 : 0.15;
    this.tailMat.emissiveIntensity = this.braking && this.driver ? 3.5 : on ? 1.1 : 0.25;
    this.reverseMat.emissiveIntensity = this.reversing ? 3 : 0;
    void night;
    if (this.spec.siren) {
      this.sirenPhase += dt * 9;
      const a = this.siren ? (Math.sin(this.sirenPhase) > 0 ? 5 : 0.2) : 0.15;
      const b = this.siren ? (Math.sin(this.sirenPhase) > 0 ? 0.2 : 5) : 0.15;
      this.sirenRed.emissiveIntensity = a;
      this.sirenBlue.emissiveIntensity = b;
    }
  }

  syncTransform() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.heading, 0);
    this.body.rotation.set(this.pitch, 0, this.roll);
    this.body.position.y = this.bodyY;
  }

  /** Pushes a circle (pedestrian) out of this vehicle's oriented box. */
  pushCircle(x, z, r) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const lf = dx * fx + dz * fz, lr = dx * rx + dz * rz;
    const hl = this.halfL, hw = this.halfW;
    const cf = clamp(lf, -hl, hl), cr = clamp(lr, -hw, hw);
    let ef = lf - cf, er = lr - cr;
    let d = Math.hypot(ef, er);
    if (d >= r) return null;
    if (d < 1e-5) {
      // centre inside: push out along the shallowest side
      const pf = hl - Math.abs(lf), pr = hw - Math.abs(lr);
      if (pf < pr) { ef = Math.sign(lf) || 1; er = 0; d = 1; return this.local(this.pos.x, this.pos.z, Math.sign(lf) * (hl + r), lr, fx, fz, rx, rz); }
      return this.local(this.pos.x, this.pos.z, lf, (Math.sign(lr) || 1) * (hw + r), fx, fz, rx, rz);
    }
    const k = r / d;
    return this.local(this.pos.x, this.pos.z, cf + ef * k, cr + er * k, fx, fz, rx, rz);
  }

  local(px, pz, f, r, fx, fz, rx, rz) {
    return { x: px + fx * f + rx * r, z: pz + fz * f + rz * r };
  }

  /** World position of the driver-side door (left side, +x local = left when facing +z). */
  doorPoint(side = 1) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    const off = (this.halfW + 0.7) * side;
    return { x: this.pos.x - rx * off + fx * 0.2, z: this.pos.z - rz * off + fz * 0.2 };
  }

  repair() {
    this.health = 100;
    this.wrecked = false;
    this.exploded = false;
    for (const m of this.materials) m.color.setScalar(1);
  }

  respray() {
    const h = Math.random();
    for (const m of this.materials) m.color.setHSL(h, 0.35, 0.82);
  }

  get kmh() {
    return Math.abs(this.speed) * 3.6;
  }
}
