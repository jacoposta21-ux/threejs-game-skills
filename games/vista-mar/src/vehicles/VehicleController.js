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
      const seat = new THREE.Vector3(v.halfW * 0.36, 0.12, -0.15);
      v.body.add(p.rig.root);
      p.rig.root.position.copy(seat);
      p.rig.root.rotation.set(0, 0, 0);
      const k = Math.min(1, (v.height * 0.62) / 1.25); // crouch smaller drivers into toy-scale cabins
      p.rig.root.scale.setScalar(k);
      p.rig.play('Driving_Loop', { fade: 0.15 });
    } else {
      p.group.visible = false;
    }
    this.game.audio.door();
    this.game.audio.engineStart(v.spec);
    this.game.camera3p.enterVehicle(v);
    this.game.hud.toast(v.spec.label.toUpperCase(), 'W/S drive · A/D steer · Space handbrake · L lights · H horn · F exit');
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
    p.pos.set(door.x, terrainHeight(door.x, door.z), door.z);
    p.vel.set(0, 0, 0);
    p.heading = v.heading + Math.PI / 2;
    p.group.position.copy(p.pos);
    this.game.audio.door();
    this.game.audio.engineStop();
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
