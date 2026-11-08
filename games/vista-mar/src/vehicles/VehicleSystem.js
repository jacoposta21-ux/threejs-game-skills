import * as THREE from 'three';
import { Vehicle } from './Vehicle.js';
import { Aircraft } from './Aircraft.js';
import { VEHICLE_TYPES, VEHICLE_SPAWNS } from './VehicleTypes.js';
import { radialGlowTexture } from '../world/textures.js';
import { SkidMarks } from '../world/Effects.js';

// Owns every drivable vehicle: spawning, per-frame physics, pedestrian push-out,
// nearest-vehicle queries, damage smoke, and the player's headlight beam.
export class VehicleSystem {
  constructor(game, assets) {
    this.game = game;
    this.assets = assets;
    this.dynamic = [];
    this.hornAt = -10;
    this.scene = game.scene;
    this.collision = game.collision;
    this.vehicles = [];
    this.night = 0;
    for (const sp of VEHICLE_SPAWNS) {
      const spec = VEHICLE_TYPES[sp.type];
      const gltf = assets[spec.asset];
      if (!gltf) continue;
      const free = this.findFreeSpot(sp);
      this.vehicles.push(new Vehicle(this, spec, gltf, free));
    }

    // aircraft parked at Vista Mar Airport (north of the city)
    this.aircraft = [
      new Aircraft(this, 'heli', { x: 160, z: -548, h: Math.PI }, 0x2a6fd6),
      new Aircraft(this, 'plane', { x: -405, z: -657, h: Math.PI / 2 }, 0xd94f3d),
    ];
    for (const a of this.aircraft) { a.stolenStars = 2; this.vehicles.push(a); }

    // one shared pair of headlight spots, attached to whichever car the player drives
    this.beam = new THREE.SpotLight(0xfff1d6, 0, 70, 0.5, 0.55, 1.4);
    this.beamTarget = new THREE.Object3D();
    this.beam.target = this.beamTarget;
    this.beam.castShadow = false;
    this.scene.add(this.beam, this.beamTarget);

    // damage smoke (pooled sprites)
    this.smokeMat = new THREE.SpriteMaterial({ map: radialGlowTexture(), color: 0x6b6b6b, transparent: true, depthWrite: false, opacity: 0.5 });
    this.smoke = [];
    for (let i = 0; i < 60; i++) {
      const s = new THREE.Sprite(this.smokeMat.clone());
      s.visible = false;
      this.scene.add(s);
      this.smoke.push({ s, life: 0, vy: 0 });
    }
    this.smokeIdx = 0;
    this.skids = new SkidMarks(this.scene);
    this.skidId = 0;
  }

  findFreeSpot(sp) {
    for (let k = 0; k < 20; k++) {
      const x = sp.x + Math.sin(sp.h) * k * 3, z = sp.z + Math.cos(sp.h) * k * 3;
      if (!this.collision.blockedCircle(x, z, 1.4)) return { ...sp, x, z };
    }
    return sp;
  }

  update(dt, driven) {
    this.night = this.game.world.night;
    const cam = this.game.camera.position, pl = this.game.player.pos;
    for (const v of [...this.vehicles]) {
      // far vehicles are not drawn; abandoned ones are recycled (GTA-style streaming)
      const dc = Math.hypot(v.pos.x - cam.x, v.pos.z - cam.z);
      v.root.visible = v === driven || dc < 230;
      if (v.owned && v !== driven) {
        // the garage car drives itself home once you leave it far away
        const s = v.spawn;
        if (Math.hypot(v.pos.x - pl.x, v.pos.z - pl.z) > 260 && Math.hypot(s.x - pl.x, s.z - pl.z) > 200 && Math.hypot(v.pos.x - s.x, v.pos.z - s.z) > 1) { v.reset(); if (v.wrecked) v.repair(); }
      }
      if (v !== driven && !v.police && !v.missionVehicle) {
        const dp = Math.hypot(v.pos.x - pl.x, v.pos.z - pl.z);
        if (dp > 260) {
          if (v.dynamic) { this.removeVehicle(v); continue; }
          const s = v.spawn;
          if (Math.hypot(v.pos.x - s.x, v.pos.z - s.z) > 1 || v.health < 100) {
            const sd = Math.hypot(s.x - pl.x, s.z - pl.z);
            if (sd > 200) v.reset(); // the car you left behind is gone; its parking spot gets a fresh one
          }
        }
      }
      if (v === driven || v.aiDriven) continue;
      if (!v.root.visible && v.vel.lengthSq() < 0.01) continue;
      v.idle(dt);
    }
    // skid marks + tyre smoke from sliding or hard-braking cars
    for (const v of this.vehicles) {
      if (!v.skidKey) v.skidKey = `v${this.skidId++}`;
      const sp = Math.abs(v.speed);
      const sliding = (v.slip > 3.2 && sp > 4) || (v.braking && sp > 11 && (v.driver || v.police));
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = -fz, rz = fx;
      for (const side of [-1, 1]) {
        const key = v.skidKey + side;
        if (!sliding) { this.skids.lift(key); continue; }
        const wx = v.pos.x - fx * v.halfL * 0.62 + rx * side * v.halfW * 0.78;
        const wz = v.pos.z - fz * v.halfL * 0.62 + rz * side * v.halfW * 0.78;
        this.skids.add(key, wx, wz);
        if (v.slip > 5 && Math.random() < dt * 10) {
          const p = this.smoke[this.smokeIdx++ % this.smoke.length];
          p.s.position.set(wx, v.pos.y + 0.3, wz);
          p.s.visible = true; p.life = 0.8; p.vy = 0.6;
          p.s.material.color.setHex(0xd8d8d8);
        }
      }
    }
    // smoke from damaged cars
    for (const v of this.vehicles) {
      if (v.health > 40) continue;
      v.smokeTimer -= dt;
      if (v.smokeTimer <= 0) {
        v.smokeTimer = v.wrecked ? 0.05 : v.health < 20 ? 0.09 : 0.2;
        const p = this.smoke[this.smokeIdx++ % this.smoke.length];
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        p.s.position.set(v.pos.x + fx * v.halfL * 0.7, v.pos.y + v.height * 0.8, v.pos.z + fz * v.halfL * 0.7);
        p.s.visible = true;
        p.life = 1;
        p.vy = 1.2 + Math.random();
        p.s.material.color.setHex(v.wrecked ? 0x222222 : 0x777777);
      }
    }
    for (const p of this.smoke) {
      if (!p.s.visible) continue;
      p.life -= dt * 0.55;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.s.position.y += p.vy * dt;
      p.s.position.x += 0.4 * dt;
      const sc = 1 + (1 - p.life) * 3;
      p.s.scale.set(sc, sc, sc);
      p.s.material.opacity = p.life * 0.45;
    }
    // headlight beam on the driven car
    if (driven && driven.headlights) {
      const fx = Math.sin(driven.heading), fz = Math.cos(driven.heading);
      this.beam.position.set(driven.pos.x + fx * driven.halfL, driven.pos.y + 0.9, driven.pos.z + fz * driven.halfL);
      this.beamTarget.position.set(driven.pos.x + fx * 30, driven.pos.y - 1, driven.pos.z + fz * 30);
      this.beamTarget.updateMatrixWorld();
      this.beam.intensity = 40 + this.night * 260;
    } else this.beam.intensity = 0;
  }

  /** Creates a physical vehicle from a traffic model key (crash or carjack). */
  spawnDynamic(modelKey, x, z, heading) {
    const typeFor = { sedan: 'sedan', suv: 'suv', taxi: 'taxi', sports: 'sports', hatch: 'sedan', van: 'delivery' };
    const assetFor = { hatch: 'hatch', van: 'van' };
    const base = VEHICLE_TYPES[typeFor[modelKey] || 'sedan'];
    const spec = { ...base, asset: assetFor[modelKey] || base.asset, label: modelKey === 'hatch' ? 'Hatchback' : modelKey === 'van' ? 'Minivan' : base.label, maxSpeed: modelKey === 'van' ? 38 : base.maxSpeed };
    const gltf = this.assets[spec.asset];
    if (!gltf) return null;
    // keep the number of extra physical cars bounded
    if (this.dynamic.length >= 6) {
      const p = this.game.player.pos;
      const far = this.dynamic.filter((v) => !v.driver).sort((a, b) => Math.hypot(b.pos.x - p.x, b.pos.z - p.z) - Math.hypot(a.pos.x - p.x, a.pos.z - p.z))[0];
      if (far) this.removeVehicle(far);
    }
    const v = new Vehicle(this, spec, gltf, { x, z, h: heading });
    v.dynamic = true;
    this.vehicles.push(v);
    this.dynamic.push(v);
    return v;
  }

  /** Rebuilds a saved car (the player's garage car). */
  spawnFromSpec(spec, spot) {
    const gltf = this.assets[spec.asset];
    if (!gltf) return null;
    const v = new Vehicle(this, { ...spec }, gltf, { x: spot.x, z: spot.z, h: spot.h });
    this.vehicles.push(v);
    return v;
  }

  spawnPolice(x, z, heading) {
    const spec = VEHICLE_TYPES.police;
    const gltf = this.assets[spec.asset];
    if (!gltf) return null;
    const v = new Vehicle(this, spec, gltf, { x, z, h: heading });
    v.police = true;
    v.aiDriven = true;
    v.headlights = true;
    this.vehicles.push(v);
    return v;
  }

  removePolice(v) {
    if (v.driver) return;
    this.scene.remove(v.root);
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
  }

  spawnMissionVehicle(type, x, z, heading) {
    if (type === 'heli' || type === 'plane') {
      const a = new Aircraft(this, type, { x, z, h: heading }, type === 'heli' ? 0x1b1b1f : 0xd94f3d);
      a.missionVehicle = true;
      this.vehicles.push(a);
      return a;
    }
    const spec = VEHICLE_TYPES[type];
    const v = new Vehicle(this, spec, this.assets[spec.asset], { x, z, h: heading });
    v.missionVehicle = true;
    this.vehicles.push(v);
    return v;
  }

  removeMission(v) {
    this.scene.remove(v.root);
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
  }

  removeVehicle(v) {
    this.scene.remove(v.root);
    this.vehicles.splice(this.vehicles.indexOf(v), 1);
    this.dynamic.splice(this.dynamic.indexOf(v), 1);
  }

  nearest(pos, maxDist = 3.5) {
    let best = null, bd = maxDist;
    for (const v of this.vehicles) {
      // distance to the car's outline, not its centre
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const dx = pos.x - v.pos.x, dz = pos.z - v.pos.z;
      const lf = dx * fx + dz * fz, lr = dx * -fz + dz * fx;
      const ef = Math.max(0, Math.abs(lf) - v.halfL), er = Math.max(0, Math.abs(lr) - v.halfW);
      const d = Math.hypot(ef, er);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  /** Push a pedestrian circle out of every vehicle; returns adjusted {x,z}. */
  pushPedestrian(x, z, r, skip = null) {
    for (const v of this.vehicles) {
      if (v === skip) continue;
      if (Math.abs(v.pos.x - x) > 8 || Math.abs(v.pos.z - z) > 8) continue;
      const p = v.pushCircle(x, z, r);
      if (p) { x = p.x; z = p.z; }
    }
    return { x, z };
  }

  onVehicleImpact(v, impact) {
    if (v.driver) {
      if (impact > 13) this.game.damagePlayer((impact - 13) * 1.6);
      this.game.audio.crash(Math.min(1, impact / 18));
      this.game.camera3p.kick(Math.min(0.35, impact * 0.02));
      this.game.camera3p.shake = Math.min(1, impact / 15);
    }
  }

  onWrecked(v) {
    if (v.driver) this.game.hud.toast('VEHICLE WRECKED', 'The engine is dead. Press F to get out.', '');
  }

  reset() {
    for (const v of [...this.dynamic]) this.removeVehicle(v);
    for (const v of [...this.vehicles]) if (v.missionVehicle && !v.owned) this.removeMission(v);
    for (const v of this.vehicles) v.reset();
  }

  markers(playerPos) {
    const out = [];
    for (const v of this.vehicles) {
      if (v.driver || v.police) continue;
      if (Math.abs(v.pos.x - playerPos.x) > 220 || Math.abs(v.pos.z - playerPos.z) > 220) continue;
      out.push({ x: v.pos.x, z: v.pos.z, color: v.spec.siren ? '#4f7cff' : '#7fd8ff', shape: 'car', size: 5 });
    }
    return out;
  }
}
