import * as THREE from 'three';
import { MIRACLES } from '../game/miracles.js';
import { terrainHeight, lakeDistance, waterDepth } from '../world/layout.js';

const tmpV = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

/** Per-miracle targeting rules. */
const RULES = {
  'miracle.divine-push': { targeting: 'cone', range: 7.5 },
  'miracle.multiplication': { targeting: 'object', range: 12, accepts: (t) => (t.kind === 'prop' || t.kind === 'copy') && (t.type === 'bread' || t.type === 'fish'), hint: 'Aim at bread or fish' },
  'miracle.water-to-wine': { targeting: 'object', range: 10, accepts: (t) => t.kind === 'water' || (t.kind === 'prop' && t.type === 'pot' && !t.ref.wine), hint: 'Aim at the well, the trough or a clay jar' },
  'miracle.walk-on-water': { targeting: 'self' },
  'miracle.healing-touch': { targeting: 'object', range: 4.5, accepts: (t) => t.kind === 'npc', hint: 'Get close to someone in need' },
  'miracle.holy-levitation': { targeting: 'object', range: 14, accepts: (t) => t.kind === 'npc' || t.kind === 'copy' || (t.kind === 'prop' && t.type !== 'fruit'), hint: 'Aim at a person or an object' },
};

/**
 * Owns every miracle: unlocks, cooldowns, targeting, casting and ongoing
 * effects. Publishes `miracle:cast` / `miracle:reveal` / `miracle:end` on the bus.
 */
export class MiracleManager {
  constructor({ bus, effects, audio, npcs, romans, props, world, player, state, model, camera, rng }) {
    Object.assign(this, { bus, effects, audio, npcs, romans, props, world, player, state, model, camera, rng });
    this.cooldowns = new Map();
    this.time = 0;
    this.water = null; // active walk-on-water
    this.lift = null; // active levitation
    this.lastWitness = new Map();
    this.marker = this.createMarker();
    this.byId = new Map(MIRACLES.map((m) => [m.id, m]));
    this.levels = {}; // Blessings (Phase 6): 0..2 per miracle
  }

  createMarker() {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.9, depthTest: false, fog: false }));
    m.renderOrder = 10;
    m.visible = false;
    this.world.scene.add(m);
    return m;
  }

  isUnlocked(id) {
    return this.state.unlockedMiracles.includes(id);
  }

  unlock(id, announce = true) {
    if (this.isUnlocked(id)) return false;
    this.state.unlockedMiracles.push(id);
    if (announce) this.bus.emit('miracle:reveal', { entityId: this.state.id, miracleId: id, miracle: this.byId.get(id) });
    return true;
  }

  level(id) {
    return this.levels[id] || 0;
  }

  /** Targeting range, widened by Blessings for Push and Levitation. */
  rangeOf(id) {
    const base = RULES[id].range;
    if (id === 'miracle.divine-push') return base * (1 + 0.25 * this.level(id));
    if (id === 'miracle.holy-levitation') return base + 4 * this.level(id);
    return base;
  }

  cooldownLeft(id) {
    return Math.max(0, (this.cooldowns.get(id) || 0) - this.time);
  }

  // ---------------------------------------------------------------- targeting
  candidates() {
    const list = [...this.props.targetables(), ...this.npcs.targetables(), ...(this.romans ? this.romans.targetables() : [])];
    for (const w of this.world.waterTargets) list.push({ kind: 'water', type: 'water', ref: w, id: w.id, x: w.x, y: w.y, z: w.z, name: w.name, radius: w.radius });
    return list;
  }

  findTarget(id) {
    const rule = RULES[id];
    if (!rule || rule.targeting !== 'object') return null;
    const p = this.state.position;
    const cam = this.camera.position;
    this.camera.getWorldDirection(tmpDir);
    let best = null;
    let bestScore = Infinity;
    let near = null;
    let nearScore = Infinity;
    for (const c of this.candidates()) {
      if (!rule.accepts(c)) continue;
      const dp = Math.hypot(c.x - p.x, c.z - p.z);
      if (dp > this.rangeOf(id)) continue;
      // ray test from the camera through the crosshair
      tmpV.set(c.x - cam.x, c.y - cam.y, c.z - cam.z);
      const along = tmpV.dot(tmpDir);
      if (along > 0.5) {
        const perp = Math.sqrt(Math.max(0, tmpV.lengthSq() - along * along));
        const allow = (c.radius || (c.kind === 'npc' ? 0.7 : 0.45)) + along * 0.05;
        if (perp < allow && perp / allow + along * 0.01 < bestScore) { bestScore = perp / allow + along * 0.01; best = c; }
      }
      // fallback: close and roughly in front of Jesus
      const ang = Math.abs(wrap(Math.atan2(c.x - p.x, c.z - p.z) - this.state.yaw));
      const edge = dp - (c.radius || 0);
      if (edge < 3.5 && ang < 1.1 && edge + ang < nearScore) { nearScore = edge + ang; near = c; }
    }
    return best || near;
  }

  /** HUD description of the current target for the selected miracle. */
  describe(id, target) {
    const rule = RULES[id];
    if (!this.isUnlocked(id)) return null;
    if (rule.targeting === 'cone') return 'Push everything in front of you';
    if (rule.targeting === 'self') {
      if (this.water) return `Walking on water · ${Math.ceil(this.water.t)}s`;
      return lakeDistance(this.state.position.x, this.state.position.z) < 1.3 ? 'Step onto the lake' : 'Find open water (the lake shore, east)';
    }
    if (this.lift) return 'Release to set it down gently';
    if (!target) return rule.hint;
    const label = target.kind === 'npc' ? `${target.name}${target.ref.injured ? ` (${target.ref.injured.label})` : ''}` : target.name || target.type;
    const verb = { 'miracle.multiplication': 'Multiply', 'miracle.water-to-wine': 'Turn to wine', 'miracle.healing-touch': 'Heal', 'miracle.holy-levitation': 'Lift' }[id];
    return `${verb}: ${label}`;
  }

  // ---------------------------------------------------------------- casting
  tryCast(id) {
    const m = this.byId.get(id);
    if (!this.isUnlocked(id)) return { ok: false, reason: `${m.name} has not yet been revealed to you.` };
    if (this.cooldownLeft(id) > 0) return { ok: false, reason: 'cooldown', quiet: true };
    const rule = RULES[id];
    let target = null;
    if (rule.targeting === 'object') {
      target = this.findTarget(id);
      if (!target) return { ok: false, reason: rule.hint };
    }
    const fn = {
      'miracle.divine-push': () => this.castPush(),
      'miracle.multiplication': () => this.castMultiply(target),
      'miracle.water-to-wine': () => this.castWine(target),
      'miracle.walk-on-water': () => this.castWaterWalk(),
      'miracle.healing-touch': () => this.castHeal(target),
      'miracle.holy-levitation': () => this.castLevitate(target),
    }[id];
    const res = fn();
    if (!res.ok) return res;
    this.cooldowns.set(id, this.time + (res.cooldown ?? m.cooldown) * (1 - 0.2 * this.level(id)));
    this.bus.emit('miracle:cast', { entityId: this.state.id, miracleId: id, targetId: target?.id ?? null, x: this.state.position.x, z: this.state.position.z, ...res.event });
    return res;
  }

  face(x, z) {
    this.state.yaw = Math.atan2(x - this.state.position.x, z - this.state.position.z);
  }

  witness(kind, x, z, radius, extra) {
    const now = this.time;
    if (now - (this.lastWitness.get(kind) || -99) < (extra?.minGap ?? 0)) return 0;
    this.lastWitness.set(kind, now);
    return this.npcs.witness(kind, x, z, radius, extra);
  }

  castPush() {
    const p = this.state.position;
    this.camera.getWorldDirection(tmpDir);
    tmpDir.y = 0;
    tmpDir.normalize();
    const dx = tmpDir.x;
    const dz = tmpDir.z;
    this.state.yaw = Math.atan2(dx, dz);
    this.model.cast('push', 0.55);
    const range = this.rangeOf('miracle.divine-push');
    const half = 0.8;
    let knocked = 0;
    let hitProps = 0;
    const pushed = new Set();
    for (const npc of this.npcs.npcs) {
      if (npc.hidden) continue;
      const ox = npc.pos.x - p.x;
      const oz = npc.pos.z - p.z;
      const d = Math.hypot(ox, oz);
      if (d > range || d < 0.01) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (ox * dx + oz * dz) / d)));
      if (ang > half) continue;
      const strength = (1 - d / range) * (1 - (ang / half) * 0.4);
      if (this.npcs.push(npc, ox / d, oz / d, strength) === 'stumble') knocked += 1;
      pushed.add(npc);
    }
    let soldiers = 0;
    for (const s of this.romans && !this.romans.disabled ? this.romans.soldiers : []) {
      if (s.hidden) continue;
      const ox = s.pos.x - p.x;
      const oz = s.pos.z - p.z;
      const d = Math.hypot(ox, oz);
      if (d > range || d < 0.01) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (ox * dx + oz * dz) / d)));
      if (ang > half) continue;
      const strength = (1 - d / range) * (1 - (ang / half) * 0.4);
      if (this.romans.push(s, ox / d, oz / d, strength) !== 'none') soldiers += 1;
    }
    for (const t of this.props.targetables()) {
      const ox = t.x - p.x;
      const oz = t.z - p.z;
      const d = Math.hypot(ox, oz);
      if (d > range || d < 0.01) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (ox * dx + oz * dz) / d)));
      if (ang > half) continue;
      const strength = (1 - d / range) * (1 - (ang / half) * 0.4);
      const body = t.ref.body;
      if (body.isKinematic()) continue;
      const mass = body.mass();
      body.applyImpulse({ x: (ox / d) * mass * (4 + 9 * strength), y: mass * (1.5 + 3.5 * strength), z: (oz / d) * mass * (4 + 9 * strength) }, true);
      body.applyTorqueImpulse({ x: (this.rng() - 0.5) * mass * 0.6, y: 0, z: (this.rng() - 0.5) * mass * 0.6 }, true);
      hitProps += 1;
    }
    for (const a of this.npcs.animals.list) {
      const ox = a.x - p.x;
      const oz = a.z - p.z;
      const d = Math.hypot(ox, oz);
      if (d > range || d < 0.01) continue;
      a.vx += (ox / d) * 7 * (1 - d / range);
      a.vz += (oz / d) * 7 * (1 - d / range);
      a.flee = 1.5;
    }
    this.effects.spray({ x: p.x + dx * 0.8, y: p.y + 1.2, z: p.z + dz * 0.8, dirX: dx, dirZ: dz, count: 70, color: '#fff2c0', speed: 11, spreadAngle: half, life: 0.55, size: 0.4 });
    this.effects.ring({ x: p.x, y: p.y + 0.1, z: p.z, color: '#ffe7a0', from: 0.4, to: 6, life: 0.5, opacity: 0.7 });
    this.effects.burst({ x: p.x + dx * 1.5, y: p.y + 0.2, z: p.z + dz * 1.5, count: 25, color: '#d8c39a', speed: 3, up: 0.6, spread: 1.4, life: 0.8, gravity: -3, size: 0.45 });
    this.audio.push?.();
    // bystanders react (the pushed ones are already tumbling and are skipped)
    if (knocked + pushed.size > 0) this.npcs.witness('push', p.x + dx * 3, p.z + dz * 3, 12);
    return { ok: true, event: { knocked, pushed: pushed.size, soldiers, props: hitProps }, chaos: knocked * 0.6 + pushed.size * 0.2 + soldiers * 0.8 + hitProps * 0.1 };
  }

  castMultiply(target) {
    this.face(target.x, target.z);
    this.model.cast('bless', 0.45);
    const kind = target.type;
    const copies = [];
    for (let i = 0; i < 2 + this.level('miracle.multiplication'); i += 1) {
      const c = this.props.spawnCopy(kind, target.x, target.y, target.z, this.props.simTime ?? 0);
      if (c) copies.push(c);
    }
    this.effects.burst({ x: target.x, y: target.y + 0.3, z: target.z, count: 22, color: '#fff1a8', color2: '#ffc94a', speed: 2.2, up: 1, life: 0.9, gravity: -1, size: 0.22, radius: 0.3 });
    this.effects.ring({ x: target.x, y: target.y + 0.05, z: target.z, color: '#ffd36b', from: 0.1, to: 1.2, life: 0.45 });
    this.audio.multiply?.();
    if (copies.length) this.witness('bread', target.x, target.z, 12, { copy: copies[0], copies, minGap: 2 });
    // crowding: lots of copies near the same spot clogs the street
    let crowd = 0;
    for (const c of this.props.copies) {
      const t = c.body.translation();
      if (Math.hypot(t.x - target.x, t.z - target.z) < 8) crowd += 1;
    }
    return { ok: true, event: { kind, copies: copies.length, crowd }, chaos: crowd > 25 ? 0.3 : 0 };
  }

  castWine(target) {
    this.face(target.x, target.z);
    this.model.cast('bless', 0.8);
    let first = true;
    if (target.kind === 'water') {
      const w = target.ref;
      first = w.target < 0.5;
      w.target = 1;
      w.wineUntil = this.time + 120 * (1 + this.level('miracle.water-to-wine'));
    } else {
      target.ref.wine = true;
      this.props.setTint(target.ref, '#6b1030');
    }
    for (let i = 0; i < 3; i += 1) {
      this.effects.burst({ x: target.x, y: target.y + 0.1 + i * 0.3, z: target.z, count: 18, color: '#c2185b', color2: '#7b1fa2', speed: 1.4, up: 1.2, life: 1.2, gravity: -0.5, size: 0.3, radius: 0.6 });
    }
    this.effects.burst({ x: target.x, y: target.y + 0.5, z: target.z, count: 20, color: '#ffe9a8', speed: 1.8, up: 1.5, life: 1.4, gravity: 0.2, size: 0.18, radius: 0.5 });
    this.effects.ring({ x: target.x, y: target.y + 0.05, z: target.z, color: '#ff5c8a', from: 0.3, to: 2.6, life: 0.9 });
    this.audio.wine?.();
    const witnesses = this.witness('wine', target.x, target.z, 16);
    return { ok: true, event: { target: target.id, witnesses, tx: target.x, tz: target.z }, faith: first ? 2 + Math.min(2, witnesses * 0.5) : 0.5 };
  }

  castWaterWalk() {
    const p = this.state.position;
    if (this.water) return { ok: false, reason: 'You are already walking on water.' };
    if (lakeDistance(p.x, p.z) > 1.3) return { ok: false, reason: 'There is no open water here. Try the Shore of Galilee (east).' };
    const duration = 25 * (1 + 0.5 * this.level('miracle.walk-on-water'));
    this.water = { t: duration, witnessed: false, warned: false };
    // standing in the shallows or under the surface: rise up onto the water first
    if (p.y < 0.02 && waterDepth(p.x, p.z) > 0.05) this.player.teleport(p.x, 0.06, p.z, this.state.yaw);
    this.world.setWaterWalkable(true);
    this.player.walkOnWater = true;
    this.model.hold('water');
    this.effects.burst({ x: p.x, y: p.y + 0.2, z: p.z, count: 40, color: '#e9f6ff', color2: '#ffe08a', speed: 2, up: 0.8, life: 1.2, gravity: -0.5, size: 0.3, radius: 0.6 });
    this.effects.ring({ x: p.x, y: Math.max(p.y, 0) + 0.05, z: p.z, color: '#bfe8ff', from: 0.3, to: 4, life: 1 });
    this.audio.waterWalk?.();
    return { ok: true, event: { duration } };
  }

  endWaterWalk(reason) {
    const st = this.state;
    this.water = null;
    this.world.setWaterWalkable(false);
    this.player.walkOnWater = false;
    this.model.hold(null);
    const depth = waterDepth(st.position.x, st.position.z);
    if (depth > 1.1) {
      // sank: splash and wash up on the dock
      this.effects.burst({ x: st.position.x, y: 0.1, z: st.position.z, count: 50, color: '#d4f1ff', speed: 4, up: 1.5, life: 1, gravity: -9, size: 0.35, radius: 0.5 });
      this.effects.ring({ x: st.position.x, y: 0.05, z: st.position.z, color: '#ffffff', from: 0.3, to: 3, life: 0.8 });
      this.audio.splash?.(1);
      const d = this.world.shore.dock;
      this.player.teleport(d.x - 9, d.deckY + 0.1, d.z, -Math.PI / 2);
      this.bus.emit('miracle:end', { miracleId: 'miracle.walk-on-water', reason: 'sank' });
      return;
    }
    this.bus.emit('miracle:end', { miracleId: 'miracle.walk-on-water', reason });
  }

  castHeal(target) {
    const npc = target.ref;
    this.face(npc.pos.x, npc.pos.z);
    this.model.cast('touch', 1);
    const was = npc.injured;
    const healed = (target.owner || this.npcs).heal(npc);
    const y = npc.pos.y;
    this.effects.burst({ x: npc.pos.x, y: y + 0.2, z: npc.pos.z, count: healed ? 70 : 20, color: '#fff3b0', color2: '#ffc94a', speed: 1.6, up: 1.8, life: 1.8, gravity: 0.6, size: 0.28, radius: 0.5 });
    this.effects.ring({ x: npc.pos.x, y: y + 0.08, z: npc.pos.z, color: '#ffe08a', from: 0.2, to: 2, life: 1.2 });
    if (healed) this.effects.ring({ x: npc.pos.x, y: y + 0.08, z: npc.pos.z, color: '#ffffff', from: 0.1, to: 1.2, life: 0.8 });
    this.audio.heal?.(healed);
    let witnesses = 0;
    if (healed) witnesses = this.witness('heal', npc.pos.x, npc.pos.z, 14);
    // second Blessing: the light spreads to everyone hurting nearby
    let more = 0;
    if (this.level('miracle.healing-touch') >= 2) {
      for (const other of this.npcs.npcs) {
        if (other === npc || !other.injured || other.hidden || other.ragdoll) continue;
        if (Math.hypot(other.pos.x - npc.pos.x, other.pos.z - npc.pos.z) > 4.5) continue;
        if (this.npcs.heal(other)) {
          more += 1;
          this.effects.burst({ x: other.pos.x, y: other.pos.y + 0.2, z: other.pos.z, count: 30, color: '#fff3b0', speed: 1.4, up: 1.6, life: 1.4, gravity: 0.6, size: 0.24, radius: 0.4 });
          this.bus.emit('npc:healed', { entityId: other.id, by: 'blessing' });
        }
      }
    }
    return { ok: true, event: { healed, npc: npc.id, more }, faith: (healed ? (was.kind === 'chronic' ? 5 : 3) : 0) + more * 2, cooldown: healed ? undefined : 1 };
  }

  castLevitate(target) {
    if (this.lift) return { ok: false, reason: 'Already lifting something.', quiet: true };
    this.model.hold('levitate');
    const cam = this.camera.position;
    const dist = Math.hypot(target.x - cam.x, target.y - cam.y, target.z - cam.z);
    const start = { x: target.x, y: target.y, z: target.z };
    if (target.kind === 'npc') {
      (target.owner || this.npcs).beginLevitate(target.ref);
      start.y = target.ref.pos.y;
    } else this.props.setHeld(target.ref, true);
    this.lift = { target, start, dist, t: 0, releasing: 0, pos: { ...start } };
    this.face(target.x, target.z);
    this.audio.levitate?.(true);
    this.witness('levitate', target.x, target.z, 14, { minGap: 3 });
    this.effects.ring({ x: start.x, y: terrainHeight(start.x, start.z) + 0.05, z: start.z, color: '#ffe8a0', from: 0.3, to: 1.6, life: 0.8 });
    return { ok: true, event: { target: target.id, kind: target.kind, soldier: !!target.soldier }, chaos: target.kind === 'npc' ? 0.5 : 0, cooldown: 0.3 };
  }

  releaseLift() {
    if (this.lift && !this.lift.releasing) this.lift.releasing = 0.001;
  }

  updateLift(dt, held) {
    const L = this.lift;
    L.t += dt;
    if (!held || L.t > 7) this.releaseLift();
    const isNpc = L.target.kind === 'npc';
    const ground = terrainHeight(L.pos.x, L.pos.z);
    let x = L.pos.x;
    let z = L.pos.z;
    let y;
    if (!L.releasing) {
      // follow the crosshair a little, stay within 4 m of where it started
      this.camera.getWorldDirection(tmpDir);
      const cam = this.camera.position;
      let tx = cam.x + tmpDir.x * L.dist;
      let tz = cam.z + tmpDir.z * L.dist;
      const ox = tx - L.start.x;
      const oz = tz - L.start.z;
      const od = Math.hypot(ox, oz);
      if (od > 4) { tx = L.start.x + (ox / od) * 4; tz = L.start.z + (oz / od) * 4; }
      x += (tx - x) * Math.min(1, dt * 3);
      z += (tz - z) * Math.min(1, dt * 3);
      const rise = Math.min(1, L.t / 0.8);
      const baseY = Math.max(L.start.y, ground + (isNpc ? 0 : 0.3));
      y = baseY + (ground + 2.5 - baseY) * (1 - (1 - rise) * (1 - rise)) + Math.sin(L.t * 2.5) * 0.08;
      if (Math.random() < 0.5) this.effects.burst({ x, y: y + (isNpc ? 1 : 0), z, count: 2, color: '#ffe9a8', speed: 0.4, up: 0.5, life: 0.9, gravity: 0.3, size: 0.18, radius: 0.5 });
    } else {
      L.releasing += dt;
      y = L.pos.y + ((ground + (isNpc ? 0 : 0.45)) - L.pos.y) * Math.min(1, dt * 4);
      const done = L.releasing > 0.9 || y - ground < (isNpc ? 0.05 : 0.55);
      if (done) {
        if (isNpc) (L.target.owner || this.npcs).endLevitate(L.target.ref);
        else {
          L.target.ref.body.setNextKinematicTranslation({ x, y, z });
          this.props.setHeld(L.target.ref, false);
        }
        this.lift = null;
        this.model.hold(this.water ? 'water' : null);
        this.audio.levitate?.(false);
        this.bus.emit('miracle:end', { miracleId: 'miracle.holy-levitation', reason: 'released' });
        this.cooldowns.set('miracle.holy-levitation', this.time + this.byId.get('miracle.holy-levitation').cooldown);
        return;
      }
    }
    L.pos = { x, y, z };
    if (isNpc) (L.target.owner || this.npcs).holdAt(L.target.ref, x, y, z);
    else {
      const body = L.target.ref.body;
      body.setNextKinematicTranslation({ x, y, z });
      const r = Math.sin(L.t * 1.3) * 0.4;
      body.setNextKinematicRotation({ x: 0, y: Math.sin(r / 2), z: 0, w: Math.cos(r / 2) });
    }
  }

  /** Per fixed step. */
  fixedUpdate(dt, input) {
    this.time += dt;
    if (this.lift) this.updateLift(dt, input.castHeld);
    if (this.water) {
      const w = this.water;
      w.t -= dt;
      const st = this.state;
      if (st.onWater && !w.witnessed) {
        w.witnessed = true;
        const n = this.witness('water', st.position.x, st.position.z, 45);
        this.bus.emit('miracle:witnessed', { miracleId: 'miracle.walk-on-water', witnesses: n });
      }
      if (w.t < 4 && !w.warned) { w.warned = true; this.bus.emit('miracle:fading', { miracleId: 'miracle.walk-on-water' }); }
      if (w.t <= 0) this.endWaterWalk('expired');
    }
    for (const w of this.world.waterTargets) {
      if (w.target > 0.5 && this.time > w.wineUntil) {
        w.target = 0;
        this.bus.emit('wine:faded', { targetId: w.id, name: w.name });
      }
    }
  }

  /** Per frame: target marker. */
  update(dt, selectedId, active) {
    const target = active && !this.lift ? this.findTarget(selectedId) : null;
    this.current = target;
    if (target) {
      const h = target.kind === 'npc' ? 1.5 : 0.7;
      this.marker.visible = true;
      this.marker.position.set(target.x, target.y + h + Math.sin(this.time * 4) * 0.08, target.z);
      this.marker.rotation.y += dt * 3;
    } else this.marker.visible = false;
    return target;
  }

  reset() {
    if (this.water) this.endWaterWalk('reset');
    if (this.lift) {
      if (this.lift.target.kind === 'npc') (this.lift.target.owner || this.npcs).endLevitate(this.lift.target.ref);
      else this.props.setHeld(this.lift.target.ref, false);
      this.lift = null;
    }
    this.model.hold(null);
    this.cooldowns.clear();
    for (const w of this.world.waterTargets) { w.target = 0; w.wine = 0; }
  }

  stats() {
    return {
      cooldowns: Object.fromEntries([...this.cooldowns.keys()].map((k) => [k, +this.cooldownLeft(k).toFixed(2)])),
      water: this.water ? +this.water.t.toFixed(1) : null,
      lifting: this.lift ? this.lift.target.id : null,
      wine: this.world.waterTargets.filter((w) => w.target > 0.5).map((w) => w.id),
    };
  }
}

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
