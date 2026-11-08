import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight, WATER_LEVEL } from '../world/Layout.js';
import { clamp, damp, dampAngle } from '../utils/random.js';

// Flyable aircraft with the same outward interface as Vehicle (so the driver
// controller, camera, HUD and collisions treat them alike):
//  - Helicopter: W/S tilt forward/back, A/D yaw, Space climb, Shift descend.
//  - Plane: W/S throttle, A/D bank/steer, Space pull up, Shift push down.
// Procedural low-poly models, merged per material (a handful of draw calls).

const FLIGHT_BOX = 1400; // beyond the city limits only while airborne
const CEILING = 340;

const _m = new THREE.Matrix4();

function paintMat(color) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
}
const GLASS = new THREE.MeshStandardMaterial({ color: 0x1b2a38, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.6 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.6, metalness: 0.4 });
const LIGHT = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.5, metalness: 0.2 });

function part(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.clone();
  _m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(_m);
  return g.index ? g.toNonIndexed() : g;
}

function mesh(parts, mat) {
  const m = new THREE.Mesh(mergeGeometries(parts.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; })), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, s = 12) => new THREE.CylinderGeometry(r0, r1, h, s);
const sph = (r) => new THREE.SphereGeometry(r, 14, 10);

export class Aircraft {
  constructor(system, kind, spawn, color = 0x2a6fd6) {
    this.system = system;
    this.kind = kind;
    this.isAircraft = true;
    this.spawn = spawn;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.paint = paintMat(color);
    this.baseColor = color;
    this.materials = [];
    if (kind === 'heli') this.buildHeli();
    else this.buildPlane();
    this.root.name = `Aircraft:${this.spec.label}`;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.vy = 0;
    this.heading = 0; this.pitch = 0; this.roll = 0; this.yawRate = 0;
    this.speed = 0; this.slip = 0; this.braking = false; this.reversing = false;
    this.headlights = false; this.siren = false; this.health = 100; this.wrecked = false;
    this.driver = null; this.rpm = 0; this.power = 0; this.smokeTimer = 0; this.steer = 0;
    this.reset();
    system.scene.add(this.root);
  }

  buildHeli() {
    this.spec = { label: 'Skylark H4 Helicopter', asset: 'heli', maxSpeed: 46, mass: 1900, gears: 1, siren: false, width: 2.4 };
    const P = [], G = [], D = [], L = [];
    P.push(part(sph(1), 0, 1.55, 0.4, 0, 0, 0, 1.15, 1.0, 1.9)); // cabin pod
    P.push(part(cyl(0.32, 0.16, 5.2, 10), 0, 1.75, -3.4, Math.PI / 2, 0, 0)); // tail boom
    P.push(part(box(0.12, 1.4, 0.9), 0, 2.25, -5.9, 0.25, 0, 0)); // fin
    P.push(part(box(1.6, 0.08, 0.5), 0, 1.75, -5.2)); // stabiliser
    G.push(part(sph(1), 0, 1.75, 1.2, 0, 0, 0, 0.98, 0.72, 1.15)); // canopy glass
    D.push(part(box(0.9, 0.35, 1.4), 0, 2.65, 0.1)); // engine housing
    D.push(part(cyl(0.12, 0.12, 0.5), 0, 3.0, 0.2)); // mast
    for (const s of [-1, 1]) {
      L.push(part(cyl(0.06, 0.06, 3.4, 8), s * 1.05, 0.12, 0.3, Math.PI / 2, 0, 0)); // skids
      L.push(part(cyl(0.05, 0.05, 0.75, 6), s * 0.85, 0.45, 1.1, 0, 0, s * 0.45));
      L.push(part(cyl(0.05, 0.05, 0.75, 6), s * 0.85, 0.45, -0.5, 0, 0, s * 0.45));
    }
    this.body.add(mesh(P, this.paint), mesh(G, GLASS), mesh(D, DARK), mesh(L, LIGHT));
    // rotors (spin in update)
    this.rotor = new THREE.Mesh(mergeGeometries([part(box(10.5, 0.05, 0.32), 0, 0, 0), part(box(0.32, 0.05, 10.5), 0, 0, 0)]), DARK);
    this.rotor.position.set(0, 3.28, 0.2);
    this.tailRotor = new THREE.Mesh(mergeGeometries([part(box(0.04, 1.6, 0.16), 0, 0, 0), part(box(0.04, 0.16, 1.6), 0, 0, 0)]), DARK);
    this.tailRotor.position.set(0.2, 2.25, -5.9);
    this.body.add(this.rotor, this.tailRotor);
    this.rotorDisc = new THREE.Mesh(new THREE.CircleGeometry(5.3, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0, depthWrite: false }));
    this.rotorDisc.position.copy(this.rotor.position);
    this.body.add(this.rotorDisc);
    this.halfW = 1.3; this.halfL = 3.2; this.height = 3.3;
    this.seat = new THREE.Vector3(0.35, 0.95, 0.9);
    this.seatScale = 0.95;
  }

  buildPlane() {
    this.spec = { label: 'Gull 172 Plane', asset: 'plane', maxSpeed: 72, mass: 1100, gears: 1, siren: false, width: 11 };
    const P = [], G = [], D = [], L = [];
    P.push(part(cyl(0.62, 0.42, 4.2, 14), 0, 1.45, 0.6, Math.PI / 2, 0, 0)); // fuselage front
    P.push(part(cyl(0.42, 0.12, 3.6, 12), 0, 1.6, -3.3, Math.PI / 2 + 0.06, 0, 0)); // tail cone
    P.push(part(sph(0.62), 0, 1.45, 2.7, 0, 0, 0, 1, 1, 0.7)); // nose
    P.push(part(box(11, 0.14, 1.5), 0, 2.15, 0.6)); // high wing
    P.push(part(box(3.4, 0.08, 0.9), 0, 1.7, -4.8)); // tailplane
    P.push(part(box(0.08, 1.4, 1.1), 0, 2.35, -4.9, 0.3, 0, 0)); // fin
    G.push(part(box(1.15, 0.55, 1.5), 0, 1.95, 0.9)); // cabin windows
    D.push(part(cyl(0.12, 0.12, 0.3, 8), 0, 1.45, 3.2, Math.PI / 2, 0, 0)); // spinner
    for (const s of [-1, 1]) {
      L.push(part(cyl(0.04, 0.04, 1.25, 6), s * 0.75, 1.65, 0.75, 0, 0, s * 0.62)); // struts
      D.push(part(cyl(0.26, 0.26, 0.16, 12), s * 1.15, 0.26, 0.2, 0, 0, Math.PI / 2)); // main wheels
      L.push(part(cyl(0.04, 0.04, 1.1, 6), s * 0.8, 0.75, 0.2, 0, 0, s * 0.7));
    }
    D.push(part(cyl(0.2, 0.2, 0.14, 12), 0, 0.2, 2.4, 0, 0, Math.PI / 2)); // nose wheel
    L.push(part(cyl(0.04, 0.04, 1.0, 6), 0, 0.7, 2.4));
    // wing stripes
    L.push(part(box(11.02, 0.15, 0.3), 0, 2.15, 1.25));
    this.body.add(mesh(P, this.paint), mesh(G, GLASS), mesh(D, DARK), mesh(L, LIGHT));
    this.prop = new THREE.Mesh(mergeGeometries([part(box(0.12, 2.1, 0.04), 0, 0, 0)]), DARK);
    this.prop.position.set(0, 1.45, 3.4);
    this.body.add(this.prop);
    this.halfW = 1.4; this.halfL = 3.6; this.height = 2.6;
    this.seat = new THREE.Vector3(0.3, 1.0, 0.75);
    this.seatScale = 0.9;
  }

  // ------------------------------------------------------------ Vehicle-like API
  get kmh() { return Math.hypot(this.vel.x, this.vel.y) * 3.6; }
  get ground() { return Math.max(terrainHeight(this.pos.x, this.pos.z), WATER_LEVEL); }
  get altitude() { return this.pos.y - (this.groundY ?? this.ground); }
  get airborne() { return this.altitude > 0.4; }
  get gear() { return `${Math.max(0, Math.round(this.altitude))}m`; }
  set gear(v) { void v; }

  reset() {
    const sp = this.spawn;
    this.pos.set(sp.x, terrainHeight(sp.x, sp.z), sp.z);
    this.heading = sp.h;
    this.vel.set(0, 0); this.vy = 0; this.pitch = 0; this.roll = 0; this.yawRate = 0;
    this.health = 100; this.wrecked = false; this.exploded = false; this.rpm = 0; this.power = 0;
    this.paint.color.setHex(this.baseColor);
    this.syncTransform();
  }

  repair() { this.health = 100; this.wrecked = false; this.exploded = false; this.paint.color.setHex(this.baseColor); }
  respray() { this.baseColor = new THREE.Color().setHSL(Math.random(), 0.6, 0.45).getHex(); this.paint.color.setHex(this.baseColor); }

  circles() {
    if (this.airborne) return [];
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const r = this.halfW * 0.95, off = this.halfL - r;
    return [
      { x: this.pos.x + fx * off, z: this.pos.z + fz * off, r, k: 1 },
      { x: this.pos.x, z: this.pos.z, r, k: 0 },
      { x: this.pos.x - fx * off, z: this.pos.z - fz * off, r, k: -1 },
    ];
  }

  pushCircle(x, z, r) {
    if (this.airborne) return null;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading), rx = -fz, rz = fx;
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const lf = dx * fx + dz * fz, lr = dx * rx + dz * rz;
    const cf = clamp(lf, -this.halfL, this.halfL), cr = clamp(lr, -this.halfW, this.halfW);
    const ef = lf - cf, er = lr - cr, d = Math.hypot(ef, er);
    if (d >= r) return null;
    if (d < 1e-5) {
      const side = Math.sign(lr) || 1, nr = side * (this.halfW + r);
      return { x: this.pos.x + fx * lf + rx * nr, z: this.pos.z + fz * lf + rz * nr };
    }
    const k = r / d, nf = cf + ef * k, nr = cr + er * k;
    return { x: this.pos.x + fx * nf + rx * nr, z: this.pos.z + fz * nf + rz * nr };
  }

  doorPoint(side = 1) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading), rx = -fz, rz = fx;
    const off = (this.halfW + 0.9) * side;
    return { x: this.pos.x - rx * off + fx * 0.6, z: this.pos.z - rz * off + fz * 0.6 };
  }

  syncTransform() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.heading, 0);
    this.body.rotation.set(this.pitch, 0, this.roll, 'YXZ');
  }

  idle(dt) {
    // unmanned: spin down and fall if left in the air
    this.update(dt, { throttle: 0, steer: 0, up: false, down: false, handbrake: true }, false);
  }

  // ------------------------------------------------------------ flight
  update(dt, input, manned = true) {
    const powered = manned && !this.wrecked;
    this.rpm = damp(this.rpm, powered ? 1 : 0, powered ? 0.9 : 0.35, dt);
    this.groundY = this.ground;
    if (this.kind === 'heli') this.flyHeli(dt, input, powered);
    else this.flyPlane(dt, input, powered);
    // world collision: buildings block below their roofs, roofs are landing pads
    this.collideWorld(dt);
    if (this.pos.y > CEILING) { this.pos.y = CEILING; this.vy = Math.min(0, this.vy); }
    const lim = this.airborne ? FLIGHT_BOX : 1e9;
    this.pos.x = clamp(this.pos.x, -lim, lim); this.pos.z = clamp(this.pos.z, -lim, lim);
    // ground contact
    if (this.pos.y <= this.groundY) {
      const impact = -this.vy;
      this.pos.y = this.groundY;
      if (impact > 7 || (this.kind === 'plane' && Math.abs(this.roll) > 0.5 && impact > 2)) this.damage((impact - 5) * 9 + (this.kind === 'plane' ? Math.abs(this.roll) * 40 : 0));
      if (this.groundY <= WATER_LEVEL + 0.01 && this.kmh > 5) this.damage(100); // ditched in the sea
      this.vy = Math.max(0, this.vy);
    }
    if (this.health <= 0 && !this.wrecked) { this.wrecked = true; this.system.onWrecked(this); }
    if (this.wrecked && !this.airborne && !this.exploded) {
      this.exploded = true;
      const g = this.system.game;
      if (g.combat) g.combat.explode(this.pos.x, this.pos.y + 1, this.pos.z);
    }
    // people underneath (taxiing / landing)
    const g = this.system.game;
    if (!this.airborne && Math.hypot(this.vel.x, this.vel.y) > 2 && g.npcs) g.npcs.vehicleSweep(this);
    this.speed = Math.hypot(this.vel.x, this.vel.y) * Math.sign(this.vel.x * Math.sin(this.heading) + this.vel.y * Math.cos(this.heading) || 1);
    this.animateParts(dt);
    this.syncTransform();
  }

  flyHeli(dt, inp, powered) {
    const lift = this.rpm > 0.85 && powered;
    const climb = (inp.up ? 7.5 : 0) - (inp.down ? 6 : 0);
    const targetVy = lift ? climb : -14;
    this.vy = damp(this.vy, targetVy, lift ? 2.4 : 0.6, dt);
    const flying = this.altitude > 0.3 || this.vy > 0;
    const tPitch = flying ? -inp.throttle * 0.3 : 0;
    this.pitch = damp(this.pitch, tPitch, 3, dt);
    const tYaw = flying || this.rpm > 0.5 ? -inp.steer * 1.25 : 0;
    this.yawRate = damp(this.yawRate, tYaw, 4, dt);
    this.heading += this.yawRate * dt;
    this.roll = damp(this.roll, flying ? clamp(-this.yawRate * 0.12 * (1 + this.kmh / 80), -0.3, 0.3) : 0, 3, dt);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    if (flying) {
      // tilt pushes the helicopter along its nose; air drag bleeds speed
      const acc = -Math.sin(this.pitch) * 30;
      this.vel.x += fx * acc * dt; this.vel.y += fz * acc * dt;
      const k = Math.exp(-0.55 * dt);
      this.vel.x *= k; this.vel.y *= k;
      const sp = Math.hypot(this.vel.x, this.vel.y);
      if (sp > this.spec.maxSpeed) { this.vel.x *= this.spec.maxSpeed / sp; this.vel.y *= this.spec.maxSpeed / sp; }
    } else {
      const k = Math.exp(-6 * dt);
      this.vel.x *= k; this.vel.y *= k;
    }
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
    this.pos.y += this.vy * dt;
  }

  flyPlane(dt, inp, powered) {
    const onGround = this.altitude < 0.15 && this.vy <= 0.01;
    this.power = clamp(this.power + (powered ? inp.throttle * 0.6 * dt : -dt), 0, 1);
    let v = Math.hypot(this.vel.x, this.vel.y) / Math.max(0.2, Math.cos(this.pitch));
    if (onGround && inp.throttle < 0) v = Math.max(0, v - 12 * dt); // wheel brakes
    v += (this.power * 17 * this.rpm - v * v * 0.0028 - (onGround ? 0.8 : 0)) * dt;
    v -= Math.sin(this.pitch) * 9.8 * dt; // climbing costs speed
    v = clamp(v, 0, this.spec.maxSpeed);
    const stall = 30;
    // pitch: Space up / Shift down; only rotate off the ground above take-off speed
    const pIn = (inp.up ? 1 : 0) - (inp.down ? 1 : 0);
    let tPitch = this.pitch + pIn * 0.9 * dt;
    if (onGround) tPitch = v > stall ? Math.max(0, tPitch) : 0;
    if (!onGround && v < stall) tPitch -= (stall - v) * 0.02 * dt * 10; // stall: nose drops
    this.pitch = clamp(tPitch, onGround ? 0 : -0.6, 0.55);
    // A/D: bank in the air (turn rate follows bank), steer the nose wheel on the ground
    if (onGround) {
      this.roll = damp(this.roll, 0, 5, dt);
      this.yawRate = damp(this.yawRate, -inp.steer * 0.9 * Math.min(1, v / 8), 5, dt);
    } else {
      this.roll = clamp(damp(this.roll, inp.steer * 0.8, 1.6, dt), -0.9, 0.9);
      this.yawRate = damp(this.yawRate, -Math.sin(this.roll) * 9.8 / Math.max(15, v) * 1.6, 3, dt);
    }
    this.heading += this.yawRate * dt;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const horiz = v * Math.cos(this.pitch);
    this.vel.set(fx * horiz, fz * horiz);
    // lift keeps us up at speed; below stall we sink
    if (onGround && this.pitch <= 0.02) this.vy = 0;
    else this.vy = damp(this.vy, v * Math.sin(this.pitch) - Math.max(0, stall - v) * 0.6, v > stall ? 4 : 1.2, dt);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
    this.pos.y += this.vy * dt;
    this.braking = onGround && inp.throttle < 0;
  }

  collideWorld(dt) {
    const col = this.system.collision;
    const r = this.kind === 'heli' ? 2.2 : 2.6;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let hit = false, ground = this.groundY;
    for (const k of this.kind === 'heli' ? [0.6, -2.6] : [1.6, -1.2]) {
      const cx = this.pos.x + fx * k, cz = this.pos.z + fz * k;
      const res = col.resolveCharacter(cx, cz, r, this.pos.y, 0.6, this.groundY, 3);
      ground = Math.max(ground, res.ground);
      if (res.hit) {
        const bound = this.pos.y > 25; // the invisible city limits only apply on the ground
        if (!bound || col.blockedCircle(cx, cz, r, ['building', 'tower', 'warehouse', 'house', 'container', 'hangar', 'terminal'])) {
          this.pos.x += res.x - cx; this.pos.z += res.z - cz;
          hit = true;
        }
      }
    }
    // standing on a roof
    if (ground > this.groundY && this.pos.y >= ground - 0.6) this.groundY = ground;
    if (hit) {
      const sp = Math.hypot(this.vel.x, this.vel.y);
      if (sp > 6) this.damage(sp * 2.2);
      this.vel.multiplyScalar(-0.25);
      this.system.game.audio.crash(Math.min(1, sp / 20));
      if (this.driver) this.system.game.camera3p.shake = 1;
    }
    void dt;
  }

  damage(d) {
    if (d <= 0) return;
    this.health = Math.max(0, this.health - d * (this.armored ? 0.45 : 1));
    const k = 1 - this.health / 100;
    this.paint.color.setHex(this.baseColor).multiplyScalar(1 - 0.55 * k);
    if (this.driver) this.system.game.damagePlayer(d * 0.15);
  }

  animateParts(dt) {
    const spin = this.rpm * (this.kind === 'heli' ? 38 : 60) * dt;
    if (this.rotor) { this.rotor.rotation.y += spin; this.tailRotor.rotation.x += spin * 1.7; this.rotorDisc.material.opacity = this.rpm * 0.12; }
    if (this.prop) this.prop.rotation.z += spin;
  }
}
