import * as THREE from 'three';
import { PLAYER, POWERUPS } from './Config.js';
import { angleDiff } from './ObstacleModel.js';

// Energy collectibles (instanced shards) and the three power-ups. Each power-up
// has a distinctive silhouette so it reads at speed: BOOST = double chevron,
// SHIELD = hexagonal emblem, MAGNET = horseshoe. Timers for active power-ups
// live here too.

const RP = PLAYER.orbitRadius;
const PICK_RADIUS = 0.95; // world units around the sphere
const MAGNET_RANGE = 26;

function makeChevron(mat) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.32, -0.18);
  shape.lineTo(0, 0.14);
  shape.lineTo(0.32, -0.18);
  shape.lineTo(0.32, 0.02);
  shape.lineTo(0, 0.34);
  shape.lineTo(-0.32, 0.02);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }).translate(0, -0.1, -0.05);
  const a = new THREE.Mesh(geo, mat);
  const b = new THREE.Mesh(geo, mat);
  a.position.y = 0.16;
  b.position.y = -0.16;
  g.add(a, b);
  return g;
}

function makeHex(mat) {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 4, 6), mat);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.24);
  shape.quadraticCurveTo(0.22, 0.2, 0.2, 0.02);
  shape.quadraticCurveTo(0.16, -0.16, 0, -0.26);
  shape.quadraticCurveTo(-0.16, -0.16, -0.2, 0.02);
  shape.quadraticCurveTo(-0.22, 0.2, 0, 0.24);
  const inner = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }).translate(0, 0, -0.05), mat);
  g.add(outer, inner);
  return g;
}

function makeMagnet(mat, tipMat) {
  const g = new THREE.Group();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.085, 8, 20, Math.PI), mat);
  arc.rotation.z = 0;
  const legGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.24, 8);
  const l1 = new THREE.Mesh(legGeo, mat);
  const l2 = new THREE.Mesh(legGeo, mat);
  l1.position.set(-0.24, -0.12, 0);
  l2.position.set(0.24, -0.12, 0);
  const tipGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.1, 8);
  const t1 = new THREE.Mesh(tipGeo, tipMat);
  const t2 = new THREE.Mesh(tipGeo, tipMat);
  t1.position.set(-0.24, -0.29, 0);
  t2.position.set(0.24, -0.29, 0);
  g.add(arc, l1, l2, t1, t2);
  g.position.y = 0.06;
  return g;
}

export class PowerUps {
  constructor(scene) {
    this.scene = scene;
    this.energy = [];
    this.tokens = [];
    this.timers = { boost: 0, shield: 0, magnet: 0 };
    this.dummy = new THREE.Object3D();

    this.orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.7, 0.5) });
    this.orbs = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.26, 0), this.orbMat, 260);
    this.orbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.orbs.frustumCulled = false;
    this.orbs.count = 0;
    scene.add(this.orbs);
    this.orbHaloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.9, 0.1), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true });
    this.orbHalos = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.42, 0), this.orbHaloMat, 260);
    this.orbHalos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.orbHalos.frustumCulled = false;
    this.orbHalos.count = 0;
    scene.add(this.orbHalos);

    // power-up token pool: two per type
    this.pool = { boost: [], shield: [], magnet: [] };
    for (const type of Object.keys(this.pool)) {
      const base = new THREE.Color(POWERUPS[type].color);
      for (let i = 0; i < 2; i += 1) {
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(base.r * 3.2, base.g * 3.2, base.b * 3.2) });
        const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(base.r * 2, base.g * 2, base.b * 2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        const tipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) });
        const g = new THREE.Group();
        const icon = type === 'boost' ? makeChevron(mat) : type === 'shield' ? makeHex(mat) : makeMagnet(mat, tipMat);
        icon.scale.setScalar(1.25);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 4, 40), ringMat);
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.02, 4, 40), ringMat);
        const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(base.r * 0.5, base.g * 0.5, base.b * 0.5), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
        g.add(icon, ring, ring2, glow);
        g.userData = { icon, ring, ring2 };
        g.visible = false;
        scene.add(g);
        this.pool[type].push({ group: g, busy: false });
      }
    }
  }

  add(def) {
    if (def.kind === 'energy') {
      this.energy.push({ s: def.s, angle: def.angle, pulled: false });
      return;
    }
    const slot = this.pool[def.type].find((p) => !p.busy);
    if (!slot) return;
    slot.busy = true;
    slot.group.visible = true;
    this.tokens.push({ type: def.type, s: def.s, angle: def.angle, slot });
  }

  clear() {
    this.energy.length = 0;
    for (const t of this.tokens) {
      t.slot.busy = false;
      t.slot.group.visible = false;
    }
    this.tokens.length = 0;
    this.timers.boost = 0;
    this.timers.shield = 0;
    this.timers.magnet = 0;
  }

  activate(type) {
    this.timers[type] = POWERUPS[type].duration;
  }

  isActive(type) {
    return this.timers[type] > 0;
  }

  tickTimers(dt) {
    for (const k of Object.keys(this.timers)) if (this.timers[k] > 0) this.timers[k] = Math.max(0, this.timers[k] - dt);
  }

  /**
   * Moves, renders and collects pickups. `onEnergy(pos)` / `onPowerUp(type,pos)`
   * fire on collection. prevDistance..distance is swept so nothing is skipped
   * at high speed / low frame rate.
   */
  update(dt, prevDistance, distance, time, playerAngle, playerPrevAngle, onEnergy, onPowerUp, collect = true) {
    const magnet = this.timers.magnet > 0;
    const d = this.dummy;
    let n = 0;
    const list = this.energy;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const e = list[i];
      let dz = e.s - distance;
      if (magnet && dz < MAGNET_RANGE && dz > -1) {
        // pull toward the sphere: angle converges fast, distance closes
        const pull = 1 - Math.exp(-dt * 7);
        e.angle += angleDiff(playerAngle, e.angle) * pull;
        e.s -= dz * (1 - Math.exp(-dt * 4));
        e.pulled = true;
        dz = e.s - distance;
      }
      if (collect && e.s <= distance + PICK_RADIUS && e.s >= prevDistance - PICK_RADIUS) {
        // interpolate player angle at the crossing moment
        const span = Math.max(1e-6, distance - prevDistance);
        const f = Math.min(1, Math.max(0, (e.s - prevDistance) / span));
        const pa = playerPrevAngle + (playerAngle - playerPrevAngle) * f;
        if (Math.abs(angleDiff(pa, e.angle)) * RP < PICK_RADIUS || (e.pulled && Math.abs(angleDiff(pa, e.angle)) < 0.5)) {
          onEnergy(Math.sin(e.angle) * RP, -Math.cos(e.angle) * RP, -dz);
          list[i] = list[list.length - 1];
          list.pop();
          continue;
        }
      }
      if (dz < -12) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      if (n < 260) {
        const bob = 1 + 0.12 * Math.sin(time * 6 + e.s);
        d.position.set(Math.sin(e.angle) * RP, -Math.cos(e.angle) * RP, -dz);
        d.rotation.set(time * 2.1 + e.s, time * 3 + e.s * 0.3, 0);
        d.scale.setScalar(bob);
        d.updateMatrix();
        this.orbs.setMatrixAt(n, d.matrix);
        d.rotation.set(-time * 1.4, -time * 2, e.s);
        d.updateMatrix();
        this.orbHalos.setMatrixAt(n, d.matrix);
        n += 1;
      }
    }
    this.orbs.count = n;
    this.orbHalos.count = n;
    this.orbs.instanceMatrix.needsUpdate = true;
    this.orbHalos.instanceMatrix.needsUpdate = true;

    for (let i = this.tokens.length - 1; i >= 0; i -= 1) {
      const t = this.tokens[i];
      const dz = t.s - distance;
      const g = t.slot.group;
      if (collect && t.s <= distance + 1.1 && t.s >= prevDistance - 1.1) {
        const span = Math.max(1e-6, distance - prevDistance);
        const f = Math.min(1, Math.max(0, (t.s - prevDistance) / span));
        const pa = playerPrevAngle + (playerAngle - playerPrevAngle) * f;
        if (Math.abs(angleDiff(pa, t.angle)) * RP < 1.15) {
          onPowerUp(t.type, g.position.clone());
          t.slot.busy = false;
          g.visible = false;
          this.tokens.splice(i, 1);
          continue;
        }
      }
      if (dz < -12) {
        t.slot.busy = false;
        g.visible = false;
        this.tokens.splice(i, 1);
        continue;
      }
      const r = RP - 0.15;
      g.position.set(Math.sin(t.angle) * r, -Math.cos(t.angle) * r, -dz);
      g.rotation.set(0, 0, t.angle);
      const u = g.userData;
      u.icon.rotation.y = time * 2.4;
      u.ring.rotation.x = Math.sin(time * 2) * 0.6;
      u.ring.rotation.y = time * 1.8;
      u.ring2.rotation.x = time * 1.2;
      g.scale.setScalar(1 + 0.08 * Math.sin(time * 7));
    }
  }
}
