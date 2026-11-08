import * as THREE from 'three';
import { terrainHeight } from '../world/Layout.js';

// Player <-> vehicle: entering (E), driving input, exiting (F), seating the
// animated character inside the car with the Driving_Loop clip.
export class VehicleController {
  constructor(game) {
    this.game = game;
    this.vehicle = null;
    this.transition = 0;
  }

  get driving() {
    return !!this.vehicle;
  }

  /** Walk to the nearer door, sit down into the seat, then take the wheel. */
  beginEnter(v) {
    const p = this.game.player;
    if (this.vehicle || this.entering || v.driver) return;
    if (v.isAircraft || !p.rig) { this.enter(v); return; }
    const d1 = v.doorPoint(1), d2 = v.doorPoint(-1);
    const col = this.game.collision;
    let door = Math.hypot(d1.x - p.pos.x, d1.z - p.pos.z) <= Math.hypot(d2.x - p.pos.x, d2.z - p.pos.z) ? d1 : d2;
    if (col.blockedCircle(door.x, door.z, 0.3)) door = door === d1 ? d2 : d1;
    this.entering = { v, door, t: 0, phase: 'walk', side: door === d1 ? 1 : -1 };
  }

  updateEntering(dt) {
    const e = this.entering, p = this.game.player, v = e.v;
    e.t += dt;
    if (v.driver || v.wrecked && v.health <= 0 && false) { this.entering = null; return; }
    if (e.phase === 'walk') {
      const dx = e.door.x - p.pos.x, dz = e.door.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.25 || e.t > 2.2) { e.phase = 'sit'; e.t = 0; e.from = p.pos.clone(); }
      else {
        const sp = Math.min(3.2, d * 6);
        p.pos.x += (dx / d) * sp * dt; p.pos.z += (dz / d) * sp * dt;
        p.heading = Math.atan2(dx, dz);
        if (p.rig) { p.rig.play(d > 1 ? 'Jog_Fwd_Loop' : 'Walk_Loop', { fade: 0.15 }); p.rig.update(dt); }
      }
    }
    if (e.phase === 'sit') {
      // turn to face along the car and lower in, sliding toward the seat
      const k = Math.min(1, e.t / 0.55);
      p.heading = v.heading + (e.side > 0 ? Math.PI / 2 : -Math.PI / 2) * (1 - k);
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const seatX = v.pos.x + -fz * v.halfW * 0.36 * -1, seatZ = v.pos.z + fx * v.halfW * 0.36 * -1;
      p.pos.x = e.from.x + (seatX - e.from.x) * k * 0.55;
      p.pos.z = e.from.z + (seatZ - e.from.z) * k * 0.55;
      if (p.rig) { p.rig.play('Sitting_Enter', { fade: 0.12, once: true }); p.rig.update(dt); }
      if (e.t >= 0.55) { this.entering = null; this.enter(v); return; }
    }
    p.group.position.copy(p.pos);
    p.group.rotation.y = p.heading;
    p.speed = 0;
  }

  enter(v) {
    const p = this.game.player;
    if (this.vehicle || v.driver) return;
    this.vehicle = v;
    v.driver = p;
    v.aiDriven = false;
    this.game.events.emit('enterVehicle', v);
    v.headlights = this.game.world.night > 0.35;
    p.vehicle = v;
    p.crouched = false;
    // seat the character: reparent rig into the car body
    if (p.rig) {
      const seat = v.seat ? v.seat.clone() : new THREE.Vector3(v.halfW * 0.36, 0.12, -0.15);
      v.body.add(p.rig.root);
      p.rig.root.position.copy(seat);
      p.rig.root.rotation.set(0, 0, 0);
      const k = v.seatScale || Math.min(1, (v.height * 0.62) / 1.25); // crouch smaller drivers into toy-scale cabins
      p.rig.root.scale.setScalar(k);
      p.rig.play('Driving_Loop', { fade: 0.15 });
      p.rig.playUpper(null, { fade: 0.05 });
    } else {
      p.group.visible = false;
    }
    this.game.audio.door();
    this.game.audio.engineStart(v.spec);
    if (v.lockable) v.locked = false;
    this.game.camera3p.enterVehicle(v);
    if (v.kind === 'heli') this.game.hud.toast(v.spec.label.toUpperCase(), 'Space climb · Shift descend · W/S tilt forward/back · A/D turn · E exit');
    else if (v.kind === 'plane') this.game.hud.toast(v.spec.label.toUpperCase(), 'W throttle up · S throttle down/brake · A/D bank · Space pull up (take off above 110 km/h) · Shift nose down · E exit');
    else this.game.hud.toast(v.spec.label.toUpperCase(), 'W/S drive · A/D steer · Space handbrake · L lights · H horn · E exit');
  }

  exit() {
    const v = this.vehicle;
    if (!v) return;
    const p = this.game.player;
    // pick the driver door, or the other side if blocked
    let door = v.doorPoint(1);
    const col = this.game.collision;
    if (col.blockedCircle(door.x, door.z, 0.4) || this.game.vehicles.pushPedestrian(door.x, door.z, 0.4, v).x !== door.x) {
      const alt = v.doorPoint(-1);
      if (!col.blockedCircle(alt.x, alt.z, 0.4)) door = alt;
    }
    v.driver = null;
    v.siren = false;
    this.vehicle = null;
    p.vehicle = null;
    if (p.rig) {
      p.group.add(p.rig.root);
      p.rig.root.position.set(0, 0, 0);
      p.rig.root.rotation.set(0, 0, 0);
      p.rig.root.scale.setScalar(1);
      p.rig.play('Idle_Loop', { fade: 0.1 });
    }
    p.group.visible = true;
    p.pos.set(door.x, Math.max(terrainHeight(door.x, door.z), v.isAircraft ? v.pos.y : 0), door.z);
    p.vel.set(0, 0, 0);
    p.grounded = !(v.isAircraft && v.airborne);
    p.heading = v.heading + Math.PI / 2;
    p.group.position.copy(p.pos);
    this.game.audio.door();
    this.game.audio.engineStop();
    this.game.audio.rotor(false);
    this.game.camera3p.exitVehicle(v);
  }

  update(dt) {
    const v = this.vehicle;
    const inp = this.game.input;
    if (!v) return;
    let throttle = 0, steer = 0;
    if (inp.down('KeyW')) throttle += 1;
    if (inp.down('KeyS')) throttle -= 1;
    if (inp.down('KeyA')) steer -= 1;
    if (inp.down('KeyD')) steer += 1;
    const handbrake = inp.down('Space');
    if (v.isAircraft) {
      v.update(dt, { throttle, steer, up: inp.down('Space'), down: inp.down('ShiftLeft') || inp.down('ShiftRight') });
      const p = this.game.player;
      p.pos.copy(v.pos); p.heading = v.heading; p.speed = v.kmh / 3.6; p.group.position.copy(v.pos);
      if (p.rig) p.rig.update(dt);
      this.game.audio.rotor(true, v.rpm * (v.kind === 'plane' ? 0.4 + v.power * 0.6 : 0.6 + Math.min(1, v.kmh / 120) * 0.4));
      if (inp.hit('KeyF')) this.exit();
      return;
    }
    if (inp.hit('KeyL')) v.headlights = !v.headlights;
    if (inp.hit('KeyH')) {
      if (v.spec.siren) { v.siren = !v.siren; this.game.audio.setSiren(v.siren); }
      else { this.game.audio.horn(); this.game.vehicles.hornAt = this.game.playTime; }
    }
    v.update(dt, { throttle, steer, handbrake });
    // character follows the car (for minimap, interactions, audio)
    const p = this.game.player;
    p.pos.copy(v.pos);
    p.heading = v.heading;
    p.speed = Math.abs(v.speed);
    p.group.position.copy(v.pos);
    if (p.rig) p.rig.update(dt);
    // stamina recovers while driving
    p.stamina = Math.min(100, p.stamina + 14 * dt);
    this.game.audio.engine(v, throttle, dt);
    if (inp.hit('KeyF')) this.exit();
  }
}
