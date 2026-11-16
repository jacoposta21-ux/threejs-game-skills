import * as THREE from 'three';
import { buildCharacter, CharacterAnimator } from '../npc/CharacterKit.js';
import { findStandSpot } from '../npc/NPCManager.js';
import { BARKS } from '../npc/dialogue.js';
import { terrainHeight, waterDepth, inRestrictedZone, CHECKPOINT } from '../world/layout.js';
import { clamp, damp, wrapAngle } from '../core/rng.js';
import { GARRISON, RESERVE, ROUTES, RESERVE_BY_STARS, SIGHT, SPEED, soldierLook } from './legion.js';
import { RomanAttention } from './RomanAttention.js';

const KCC_RANGE = 55;
const VISIBLE_RANGE = 125;
const SHADOW_RANGE = 30;
const PERCEIVE_EVERY = 0.12;
const GRAB_RANGE = 1.35;
const ROMAN = BARKS.roman;
const DOWN_MODES = new Set(['down', 'lifted', 'getup']);
const BLIND_MODES = new Set(['down', 'lifted', 'getup', 'friendly', 'distracted', 'talk']);

/**
 * The Roman garrison: patrols, posts, perception (view cone + line of sight),
 * the Roman Attention wanted level, pursuit, search, arrests, reinforcements
 * and ragdolls. Gameplay talks to it through bus events and a small API
 * (push / beginLevitate / heal / crime); it never touches the player directly
 * — an arrest is announced with `roman:arrest` and GameSession handles it.
 *
 * Soldier modes: duty (patrol or post), investigate, pursue, search, return,
 * down (ragdoll), getup, lifted, distracted (wine), friendly (healed), talk, hidden (reserve).
 */
export class RomanManager {
  constructor({ scene, physics, bus, rng, npcs, anchors, ragdolls }) {
    Object.assign(this, { scene, physics, bus, rng, npcs, anchors, ragdolls });
    this.soldiers = [];
    this.byId = new Map();
    this.byHandle = new Map();
    this.attention = new RomanAttention();
    this.time = 0;
    this.grab = 0;
    this.hunt = { x: 0, z: 0, y: 0, t: -99, seen: false };
    this.trespass = { t: 0, warned: false, warnedAt: -99 };
    this.reserveTimer = 0;
    this.crowdTimer = 0;
    this.lastBread = -99;
    this.arrestPending = false;
    this.disabled = false;
    this.bubbleSerial = 0;
    this.R = physics.RAPIER;
    this.losFilter = (c) => {
      if (c.shape.type === this.R.ShapeType.Cylinder) return false; // trunks and posts don't hide you
      const b = c.parent();
      return !b || b.isFixed();
    };
  }

  build() {
    const nav = this.npcs.nav;
    this.nav = nav;
    const posts = this.anchors.romanPosts;
    // navigation anchors: the gate first so the compound links through it
    const reg = (key, p) => { if (!nav.anchorIds.has(key)) nav.addAnchor(key, { x: p.x, y: p.y ?? terrainHeight(p.x, p.z), z: p.z }); return nav.anchorIds.get(key); };
    reg('roman:gateOutside', posts.gateOutside);
    reg('roman:gateInside', posts.gateInside);
    reg('roman:yard', { x: 12.5, z: -103.5 });
    reg('roman:yard2', { x: 17, z: -109.5 });
    // the fort (Phase 5): gate first, then the yard
    if (posts.outGateOutside) {
      reg('roman:outGateOutside', posts.outGateOutside);
      reg('roman:outGateInside', posts.outGateInside);
      reg('roman:outYard1', { x: 30, z: -178 });
      reg('roman:outYard2', { x: 38, z: -174 });
      reg('roman:outYard3', { x: 40, z: -184 });
    }
    for (const [name, p] of Object.entries(posts)) if (p.yaw !== undefined && !p.elevated) reg(`roman:post:${name}`, p);
    this.routes = {};
    for (const [key, r] of Object.entries(ROUTES)) {
      this.routes[key] = r.points.map(([x, z], i) => ({ x, z, y: terrainHeight(x, z), node: reg(`roman:route:${key}:${i}`, { x, z }) }));
    }
    const kcc = this.npcs.kcc;
    this.kcc = kcc;
    GARRISON.forEach((def, i) => this.spawn(def, i));
    // reserves are only built when a hunt first needs them
    this.reserveQueue = RESERVE.map((def, i) => ({ def, index: GARRISON.length + i }));
    this.bindEvents();
    this.resetDuty(true);
  }

  spawn(def, i) {
    const look = soldierLook(i, def.look || {});
    const rig = buildCharacter({ ...look, carry: [] });
    const scale = look.scale || 1;
    const radius = 0.31;
    const half = 0.56 * scale;
    const body = this.physics.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
    const collider = this.physics.world.createCollider(this.R.ColliderDesc.capsule(half, radius).setFriction(0), body);
    const s = {
      id: def.id, def: { ...def, dialogue: def.dialogue || 'soldier', voice: def.voice, look }, name: def.name, role: def.role,
      rig, anim: new CharacterAnimator(rig, 40 + i), body, collider, radius, half, scale, owner: this, soldier: true,
      pos: new THREE.Vector3(), prev: new THREE.Vector3(), render: new THREE.Vector3(),
      yaw: 0, vx: 0, vz: 0, vy: 0, grounded: true, speed: 0,
      mode: 'duty', modeT: 0, post: def.post ? this.anchors.romanPosts[def.post] : null, route: def.route || null, routeIdx: 0, routeDir: 1,
      waitT: 0, path: null, pathIdx: 0, goal: null, repathT: 0, directT: 0, directOk: false,
      sees: false, seeT: 0, perceiveT: (i % 6) * 0.02, lookYaw: 0, sweepT: this.rng() * 10,
      bubble: null, exprHold: null, barkCd: 4 + this.rng() * 10, greetCd: this.rng() * 8,
      reserve: !!def.reserve, hidden: false, ragdoll: null, injured: null, modeTimer: 0, target: null,
      action: 'none', actionTime: 0, lod: 'near', shadows: true, distP: 999, distC: 999, frameSkip: i % 3,
      progressT: 0, progressPos: new THREE.Vector3(), sidestep: null, grabbing: false, forgave: false, mouthT: 0, animAcc: 0,
    };
    rig.group.position.set(0, -50, 0);
    this.scene.add(rig.group);
    this.soldiers.push(s);
    this.byId.set(s.id, s);
    this.byHandle.set(collider.handle, s);
    return s;
  }

  // ---------------------------------------------------------------- events
  bindEvents() {
    const bus = this.bus;
    bus.on('npc:knocked', ({ entityId }) => {
      const npc = this.npcs.byId.get(entityId);
      if (npc) this.crime('knock', { x: npc.pos.x, z: npc.pos.z, loud: true });
    });
    bus.on('prop:broken', ({ x, z }) => this.crime('vandal', { x, z, loud: true }));
    bus.on('player:contact', ({ handle, speed }) => {
      const s = this.byHandle.get(handle);
      if (!s || s.hidden || DOWN_MODES.has(s.mode) || (s.bumpCd || 0) > this.time) return;
      s.bumpCd = this.time + 1.8;
      if (s.mode === 'talk') return;
      if (speed > 6.2) {
        this.say(s, this.pick(['Oi! Watch where you\'re running!', 'That\'s a shove, that is!', 'Hands off the legion!']), 2, 'angry');
        this.crime('shove', { victim: s });
      } else {
        this.say(s, this.pick(['Watch it.', 'Mind the armour.', 'Personal space, citizen.', 'Do you mind?']), 1.8, 'angry');
        this.crime('bump', { victim: s });
      }
      if (!this.attention.wanted) this.faceTo(s, this.player.x, this.player.z);
    });
    bus.on('miracle:cast', (e) => this.onMiracle(e));
    // riding into people
    bus.on('vehicle:hit', ({ handle, speed, dirX, dirZ }) => {
      const s = this.byHandle.get(handle);
      if (!s || s.hidden || DOWN_MODES.has(s.mode)) return;
      if (speed > 3.5) this.push(s, dirX, dirZ, clamp((speed - 2) / 9, 0.35, 1));
      else {
        this.say(s, this.pick(['Watch the animal!', 'Oi! Steer that thing!', 'Mind the hooves, citizen.']), 1.8, 'angry');
        this.crime('bump', { victim: s });
      }
    });
    bus.on('npc:trampled', ({ x, z }) => this.crime('trample', { x, z, loud: true }));
  }

  onMiracle(e) {
    const p = this.player;
    if (!p) return;
    if (e.miracleId === 'miracle.divine-push' && e.knocked > 0) this.crime('push', { x: p.x, z: p.z, count: Math.min(2, e.knocked) });
    else if (e.miracleId === 'miracle.multiplication' && e.crowd > 25 && this.time - this.lastBread > 20) {
      if (this.crime('bread', { x: p.x, z: p.z })) this.lastBread = this.time;
    } else if (e.miracleId === 'miracle.holy-levitation') {
      if (e.kind === 'npc' && !e.soldier) this.crime('witchcraft', { x: p.x, z: p.z });
    } else if (e.miracleId === 'miracle.water-to-wine' && e.tx !== undefined) {
      this.distract(e.tx, e.tz);
    } else if (e.miracleId === 'miracle.walk-on-water') {
      this.waterGawk = this.time;
    }
  }

  // ---------------------------------------------------------------- helpers
  pick(list) {
    return list[Math.floor(this.rng() * list.length)];
  }

  say(s, text, seconds = 2.2, expr = null) {
    s.bubble = { text, t: seconds, id: (this.bubbleSerial += 1) };
    if (expr) s.exprHold = { expr, t: seconds };
    s.barkCd = this.time + 3 + this.rng() * 3;
    this.bus.emit('npc:bark', { entityId: s.id, voice: s.def.voice || 0.75, x: s.pos.x, z: s.pos.z, length: text.length });
  }

  faceTo(s, x, z) {
    s.faceYaw = Math.atan2(x - s.pos.x, z - s.pos.z);
  }

  setMode(s, mode, extra = {}) {
    if (s.mode === mode && !extra.force) return;
    s.mode = mode;
    s.modeT = 0;
    s.path = null;
    s.goal = null;
    s.grabbing = false;
    Object.assign(s, extra);
  }

  place(s, x, y, z) {
    s.pos.set(x, y, z);
    s.prev.copy(s.pos);
    s.body.setNextKinematicTranslation({ x, y: y + s.half + s.radius, z });
    s.body.setTranslation({ x, y: y + s.half + s.radius, z }, true);
  }

  hide(s, hidden) {
    s.hidden = hidden;
    s.rig.group.visible = !hidden;
    s.collider.setEnabled(!hidden);
    if (hidden) { s.mode = 'hidden'; s.sees = false; this.place(s, 0, -50, 0); }
  }

  /** Where a soldier belongs when nothing is happening. */
  dutySpot(s) {
    if (s.post) return s.post;
    if (s.route) { const p = this.routes[s.route][s.routeIdx]; return { x: p.x, y: p.y, z: p.z, yaw: null }; }
    if (s.def.follow) { const l = this.byId.get(s.def.follow); return { x: l.pos.x - 1, y: l.pos.y, z: l.pos.z + 1, yaw: l.yaw }; }
    return { ...this.anchors.romanPosts.gateInside, yaw: null };
  }

  /** Put everyone back at their posts / route starts (new game, after an arrest). */
  resetDuty(teleport) {
    this.ragdollsRelease();
    for (const s of this.soldiers) {
      s.injured = null;
      s.forgave = false;
      s.bubble = null;
      s.grabbing = false;
      if (s.reserve) { this.hide(s, true); continue; }
      if (s.hidden) this.hide(s, false);
      if (s.route) { s.routeIdx = 0; s.routeDir = 1; }
      this.setMode(s, 'duty', { force: true });
      if (teleport) {
        let p = this.dutySpot(s);
        if (s.def.follow) { const l = this.byId.get(s.def.follow); const lp = this.dutySpot(l); p = { x: lp.x + 1.2, y: lp.y, z: lp.z + 1.2, yaw: lp.yaw }; }
        this.place(s, p.x, p.y ?? terrainHeight(p.x, p.z), p.z);
        s.yaw = p.yaw ?? 0;
        s.anim.fall = 0;
      }
    }
    if (this.disabled) {
      for (const s of this.soldiers) { s.rig.group.visible = false; s.collider.setEnabled(false); }
    }
    this.attention.reset();
    this.grab = 0;
    this.arrestPending = false;
    this.trespass = { t: 0, warned: false, warnedAt: -99 };
  }

  ragdollsRelease() {
    for (const s of this.soldiers) {
      if (s.ragdoll) {
        this.ragdolls.release(s.ragdoll);
        s.ragdoll = null;
        s.collider.setEnabled(!s.hidden);
      }
    }
  }

  // ---------------------------------------------------------------- perception
  canPerceive(s) {
    return !s.hidden && !s.ragdoll && !BLIND_MODES.has(s.mode) && !this.disabled;
  }

  sightRange(s, ctx) {
    const base = s.def.lookout ? SIGHT.lookoutRange : SIGHT.range;
    return base * (ctx.night ? SIGHT.nightFactor : 1) * (this.attention.wanted ? 1.2 : 1);
  }

  eye(s) {
    return { x: s.pos.x, y: s.pos.y + 1.78 * s.scale, z: s.pos.z };
  }

  lineClear(from, x, y, z, s) {
    const dx = x - from.x;
    const dy = y - from.y;
    const dz = z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.05) return true;
    const hit = this.physics.castRay(from.x, from.y, from.z, dx / len, dy / len, dz / len, len - 0.25, s.collider, this.losFilter);
    return hit === null;
  }

  /** View cone + range + line of sight to a point. */
  canSeePoint(s, x, y, z, ctx, rangeScale = 1) {
    if (!this.canPerceive(s)) return false;
    const dx = x - s.pos.x;
    const dz = z - s.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > this.sightRange(s, ctx) * rangeScale) return false;
    const facing = s.yaw + s.lookYaw;
    const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - facing));
    if (ang > SIGHT.fov / 2 && d > SIGHT.peripheral) return false;
    return this.lineClear(this.eye(s), x, y, z, s);
  }

  perceive(s, ctx) {
    const p = ctx.playerPos;
    const was = s.sees;
    s.sees = this.canSeePoint(s, p.x, p.y + 1.25, p.z, ctx) || (this.canPerceive(s) && s.distP < 12 && this.canSeePoint(s, p.x, p.y + 1.75, p.z, ctx));
    // close pursuers hear footsteps even round a corner
    if (!s.sees && this.attention.wanted && s.mode === 'pursue' && s.distP < 3.2 && this.canPerceive(s)) s.sees = true;
    if (s.sees && !was) s.seeT = 0;
  }

  // ---------------------------------------------------------------- crimes
  /**
   * A crime happened at (x,z) (or to `victim`). Witnesses raise Roman
   * Attention; loud crimes nobody saw bring soldiers to investigate.
   * @returns {boolean} witnessed
   */
  crime(type, { x, z, victim = null, loud = false, count = 1 } = {}) {
    if (this.disabled || !this.ctx || !this.ctx.playing || this.arrestPending) return false;
    const ctx = this.ctx;
    const p = ctx.playerPos;
    if (x === undefined) { x = p.x; z = p.z; }
    const witnesses = [];
    if (victim) witnesses.push(victim);
    for (const s of this.soldiers) {
      if (s === victim || !this.canPerceive(s)) continue;
      if (this.canSeePoint(s, x, terrainHeight(x, z) + 1, z, ctx) || this.canSeePoint(s, p.x, p.y + 1.25, p.z, ctx)) witnesses.push(s);
    }
    if (!witnesses.length) {
      if (loud) this.heard(x, z);
      return false;
    }
    const res = this.attention.add(type, count);
    this.markSeen(p);
    for (const s of witnesses) {
      if (DOWN_MODES.has(s.mode)) continue;
      if (s.mode === 'friendly' || s.mode === 'talk' || s.mode === 'distracted') s.mode = 'duty';
      if (this.attention.wanted) this.setMode(s, 'pursue');
      else this.faceTo(s, x, z);
      if (s !== victim && (s.bubble === null || s.bubble.t < 0.5)) this.say(s, this.pick(this.attention.wanted ? ROMAN.spot : ROMAN.witness), 2, 'angry');
    }
    this.bus.emit('roman:crime', { type, label: this.attention.lastCrime, witnesses: witnesses.length, stars: this.attention.stars, heat: this.attention.heat });
    this.onStars(res);
    return true;
  }

  /** Nobody saw it, but someone may have heard it (or a villager calls the guard). */
  heard(x, z) {
    let n = 0;
    for (const s of this.soldiers) {
      if (!this.canPerceive(s) || s.def.lookout || s.mode === 'pursue') continue;
      if (Math.hypot(s.pos.x - x, s.pos.z - z) < 18) { this.investigate(s, x, z); n += 1; }
    }
    if (n || this.rng() > 0.6) return;
    // a villager shouts for the guard
    const caller = this.npcs.npcs.find((v) => !v.hidden && !v.ragdoll && !v.def.kid && Math.hypot(v.pos.x - x, v.pos.z - z) < 12 && v.override?.type !== 'talk-player');
    if (!caller) return;
    this.npcs.say(caller, this.pick(['GUARDS! GUARDS!', 'Somebody call the Romans!', 'Soldiers! Over here!']), 2.4, 'angry');
    for (const s of this.soldiers) {
      if (!this.canPerceive(s) || s.def.lookout || s.post || s.mode === 'pursue') continue;
      if (Math.hypot(s.pos.x - x, s.pos.z - z) < 45) this.investigate(s, x, z);
    }
  }

  investigate(s, x, z) {
    if (s.def.lookout) return;
    this.setMode(s, 'investigate', { target: { x, z } });
    if (!s.bubble) this.say(s, this.pick(['What was that?', 'Trouble?', 'Coming!', 'Hold on…']), 1.8, 'surprised');
  }

  markSeen(p) {
    this.hunt.x = p.x;
    this.hunt.y = p.y;
    this.hunt.z = p.z;
    this.hunt.t = this.time;
  }

  onStars({ before, after }) {
    this.syncState();
    if (after <= before) return;
    const p = this.ctx.playerPos;
    this.bus.emit('roman:wanted', { stars: after, before, crime: this.attention.lastCrime });
    if (after >= 2) {
      // the garrison gets the word: everyone nearby joins the hunt
      for (const s of this.soldiers) {
        if (!this.canPerceive(s) || s.def.lookout || (s.def.centurion && after < 4)) continue;
        if (s.mode === 'pursue') continue;
        if (Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 95) this.setMode(s, 'pursue');
      }
      if (before < 2) {
        const caller = this.nearest((s) => this.canPerceive(s));
        if (caller) this.say(caller, this.pick(ROMAN.horn), 2.2, 'angry');
        this.bus.emit('roman:horn', { stars: after });
      }
    }
  }

  nearest(filter) {
    let best = null;
    for (const s of this.soldiers) if (!s.hidden && filter(s) && (!best || s.distP < best.distP)) best = s;
    return best;
  }

  syncState() {
    if (this.state) this.state.romanAttention = this.attention.stars;
  }

  // ---------------------------------------------------------------- simulation
  /**
   * ctx: { playerPos, playerVel, playerOnWater, night, cameraDir, playing }
   */
  fixedUpdate(dt, ctx) {
    this.ctx = ctx;
    this.player = ctx.playerPos;
    if (this.disabled) return;
    this.time += dt;
    const p = ctx.playerPos;
    for (const s of this.soldiers) {
      s.prev.copy(s.pos);
      if (s.bubble) { s.bubble.t -= dt; if (s.bubble.t <= 0) s.bubble = null; }
      if (s.exprHold) { s.exprHold.t -= dt; if (s.exprHold.t <= 0) s.exprHold = null; }
      if (s.hidden) continue;
      s.distP = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
      if (s.ragdoll) { this.updateRagdoll(s); continue; }
      s.modeT += dt;
      s.perceiveT -= dt;
      if (s.perceiveT <= 0) {
        s.perceiveT = PERCEIVE_EVERY;
        if (ctx.playing) this.perceive(s, ctx);
        else s.sees = false;
      }
      if (s.sees) s.seeT += dt;
      const out = this.think(s, dt, ctx);
      s.action = out.action || 'none';
      s.actionTime = s.mode === 'getup' ? 1.75 + s.modeT : s.modeT;
      if (s.def.lookout) {
        s.pos.copy(s.post);
        s.prev.copy(s.post);
        const face = s.faceYaw ?? s.post.yaw;
        s.yaw += wrapAngle(face - s.yaw) * damp(4, dt);
        continue;
      }
      this.move(s, dt, out.vx || 0, out.vz || 0, out.speed || 0, ctx);
    }
    if (!ctx.playing) return;

    // shared hunt state
    const wanted = this.attention.wanted;
    const seers = this.soldiers.filter((s) => s.sees && this.canPerceive(s));
    if (wanted && seers.length) {
      this.markSeen(p);
      for (const s of this.soldiers) {
        if (!this.canPerceive(s) || s.def.lookout || s.mode === 'pursue') continue;
        if (s.def.centurion && this.attention.stars < 4) continue;
        const range = this.attention.stars >= 2 ? 95 : 28;
        if (s.sees || Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < range) {
          this.setMode(s, 'pursue');
          if (s.sees && (!s.bubble || s.bubble.t < 0.3)) this.say(s, this.pick(ROMAN.spot), 1.8, 'angry');
        }
      }
    }
    // riding a Roman horse or chariot where a legionary can see it
    const mount = ctx.mount;
    if (mount?.roman) {
      if (this.theftFor !== mount.id && seers.length) {
        this.theftFor = mount.id;
        this.crime(mount.kind === 'chariot' ? 'chariot' : 'horsetheft', { victim: seers[0] });
        if (seers[0].bubble === null || seers[0].bubble.t < 0.5) this.say(seers[0], this.pick(['THAT IS LEGION PROPERTY!', 'Stop! Thief! Chariot thief!', 'Bring back that horse!']), 2.4, 'angry');
      }
    } else this.theftFor = null;
    if (this.attention.tick(dt, seers.length > 0) === 'lost') this.onLost();
    this.syncState();

    if (wanted) this.updateReserves(dt, ctx);
    this.updateGrab(dt, ctx);
    this.updateTrespass(dt, ctx, seers);
    this.updateCrowd(dt, ctx);
    if (this.waterGawk && this.time - this.waterGawk < 0.2) {
      for (const s of seers) if (!s.bubble) this.say(s, this.pick(ROMAN.water), 2.6, 'surprised');
    }
  }

  think(s, dt, ctx) {
    const p = ctx.playerPos;
    const stars = this.attention.stars;
    const wanted = stars > 0;
    s.grabbing = false;
    switch (s.mode) {
      case 'duty': return this.duty(s, dt, ctx);
      case 'talk':
        this.faceTo(s, p.x, p.z);
        return { action: s.speaking ? 'talk' : 'guard' };
      case 'friendly':
        if (s.modeT > s.modeTimer) this.setMode(s, 'duty');
        if (s.modeT < 2.2) { this.faceTo(s, p.x, p.z); return { action: 'salute' }; }
        return this.duty(s, dt, ctx);
      case 'getup':
        if (s.modeT > 1.3) {
          this.setMode(s, wanted ? 'pursue' : 'return');
          if (this.rng() < 0.6) this.say(s, this.pick(ROMAN.getup), 2, 'angry');
        }
        return { action: 'stumble' };
      case 'lifted':
        return { action: 'levitate' };
      case 'distracted': {
        const t = s.target;
        if (s.modeT > s.modeTimer) { this.setMode(s, wanted ? 'search' : 'return'); return {}; }
        const d = Math.hypot(t.x - s.pos.x, t.z - s.pos.z);
        if (d > 2.2) return this.goTo(s, t.x, t.z, 3.2, dt, { stop: 2.1 });
        this.faceTo(s, t.x, t.z);
        return { action: 'drink' };
      }
      case 'investigate': {
        const t = s.target;
        if (wanted && s.sees) { this.setMode(s, 'pursue'); return {}; }
        const d = Math.hypot(t.x - s.pos.x, t.z - s.pos.z);
        if (d > 2.4 && s.modeT < 25) return this.goTo(s, t.x, t.z, SPEED.investigate, dt, { stop: 2.2 });
        if (s.modeT > 25 || (s.lookAround = (s.lookAround || 0) + dt) > 3.5) { s.lookAround = 0; this.setMode(s, 'return'); }
        return { action: 'search' };
      }
      case 'pursue': {
        if (!wanted) { this.setMode(s, 'return'); return {}; }
        if (s.def.lookout) {
          if (s.sees) this.faceTo(s, p.x, p.z);
          return { action: s.sees ? 'point' : 'guard' };
        }
        if (s.sees) {
          // close enough to grab?
          const dy = Math.abs(p.y - s.pos.y);
          if (s.distP < GRAB_RANGE && dy < 1.3 && !ctx.playerOnWater) {
            s.grabbing = true;
            this.faceTo(s, p.x, p.z);
            if (!s.bubble && this.rng() < 0.03) this.say(s, this.pick(ROMAN.arrest), 1.5, 'angry');
            return { action: 'grab' };
          }
          // aim a little ahead of where he's running (cut him off)
          const lead = Math.min(1.2, s.distP / 9);
          const tx = p.x + (ctx.playerVel?.x || 0) * lead;
          const tz = p.z + (ctx.playerVel?.z || 0) * lead;
          if (!s.bubble && s.barkCd < this.time && this.rng() < 0.02) this.say(s, this.pick(ROMAN.chase), 1.6, 'angry');
          return { ...this.goTo(s, tx, tz, SPEED.run(stars) * (s.def.centurion ? 0.88 : 1), dt, { chase: true, stop: 0.6 }), action: 'none' };
        }
        const d = Math.hypot(this.hunt.x - s.pos.x, this.hunt.z - s.pos.z);
        if (d < 2.2 || s.modeT > 30) { this.setMode(s, 'search'); return {}; }
        return this.goTo(s, this.hunt.x, this.hunt.z, SPEED.run(stars) * 0.95, dt, { chase: true, stop: 1.5 });
      }
      case 'search': {
        if (!wanted) { this.setMode(s, 'return'); return {}; }
        if (s.sees) { this.setMode(s, 'pursue'); return {}; }
        if (!s.target || s.lookAround > 2.2) {
          s.lookAround = 0;
          const a = this.rng() * Math.PI * 2;
          const r = 4 + this.rng() * 12;
          s.target = { x: this.hunt.x + Math.cos(a) * r, z: this.hunt.z + Math.sin(a) * r };
          s.path = null;
          if (this.rng() < 0.3 && !s.bubble) this.say(s, this.pick(['Where are you?', 'Come out, carpenter!', 'Check behind the houses!', 'He was right here!']), 1.8, 'angry');
        }
        const d = Math.hypot(s.target.x - s.pos.x, s.target.z - s.pos.z);
        if (d > 1.5 && (s.searchLeg = (s.searchLeg || 0) + dt) < 8) return this.goTo(s, s.target.x, s.target.z, 2.8, dt, { stop: 1.2 });
        s.searchLeg = 0;
        s.lookAround = (s.lookAround || 0) + dt;
        return { action: 'search' };
      }
      case 'return': {
        if (s.reserve) {
          if (s.distP > 40 && !this.onCamera(s, ctx)) { this.hide(s, true); return {}; }
          const g = this.anchors.romanPosts.gateInside;
          return this.goTo(s, g.x, g.z, SPEED.patrol * 1.3, dt, { stop: 1 });
        }
        const spot = this.dutySpot(s);
        const d = Math.hypot(spot.x - s.pos.x, spot.z - s.pos.z);
        if (d < 1.2 || s.modeT > 60) {
          if (d > 6 && s.distP > 45) this.place(s, spot.x, spot.y ?? terrainHeight(spot.x, spot.z), spot.z);
          this.setMode(s, 'duty');
          return {};
        }
        return this.goTo(s, spot.x, spot.z, SPEED.patrol * 1.25, dt, { stop: 0.3 });
      }
      default:
        return {};
    }
  }

  /** Patrolling, following the leader, or standing a post. */
  duty(s, dt, ctx) {
    const p = ctx.playerPos;
    if (s.def.lookout && this.attention.wanted && s.sees) {
      // the tower lookout can't chase, but he shouts where you are
      this.faceTo(s, p.x, p.z);
      s.lookYaw += (0 - s.lookYaw) * damp(4, dt);
      if (!s.bubble && s.barkCd < this.time) this.say(s, this.pick(['THERE! By the road!', 'I see him! Over there!', 'He went that way!']), 2, 'angry');
      return { action: 'point' };
    }
    if (s.def.lookout) s.faceYaw = null;
    // idle chatter with a nearby, peaceful Jesus
    if (s.sees && s.distP < 6 && s.greetCd < this.time && !this.attention.wanted && !inRestrictedZone(p.x, p.z)) {
      s.greetCd = this.time + 25 + this.rng() * 20;
      this.say(s, this.pick(ctx.chaos >= 10 ? ['Watching you, Galilean.', 'No funny business.', 'I know about the pots.'] : ROMAN.greet), 2.2, ctx.chaos >= 10 ? 'angry' : null);
      s.lookAtPlayer = 2.5;
    }
    if (s.lookAtPlayer > 0) {
      s.lookAtPlayer -= dt;
      const rel = wrapAngle(Math.atan2(p.x - s.pos.x, p.z - s.pos.z) - s.yaw);
      s.lookYaw += (clamp(rel, -1.1, 1.1) - s.lookYaw) * damp(5, dt);
    } else this.sweep(s, dt);
    if (!s.bubble && s.barkCd < this.time && s.distP < 22 && this.rng() < 0.004) this.say(s, this.pick(ROMAN.idle), 2.2);

    if (s.post) {
      const d = Math.hypot(s.post.x - s.pos.x, s.post.z - s.pos.z);
      if (d > 0.6 && !s.def.lookout) return this.goTo(s, s.post.x, s.post.z, SPEED.patrol, dt, { stop: 0.25 });
      s.faceYaw = s.post.yaw;
      return { action: 'guard' };
    }
    if (s.def.follow) {
      const l = this.byId.get(s.def.follow);
      if (!l || l.hidden || l.mode !== 'duty') return { action: 'guard' };
      // stay behind and to the right of the leader
      const bx = -Math.sin(l.yaw) * 1.4 + Math.cos(l.yaw) * 0.9;
      const bz = -Math.cos(l.yaw) * 1.4 - Math.sin(l.yaw) * 0.9;
      const tx = l.pos.x + bx;
      const tz = l.pos.z + bz;
      const d = Math.hypot(tx - s.pos.x, tz - s.pos.z);
      if (d < 0.5) { s.faceYaw = l.yaw; return { action: l.speed > 0.3 ? 'none' : 'guard' }; }
      return this.goTo(s, tx, tz, Math.min(2.6, SPEED.patrol + d * 0.5), dt, { stop: 0.3, follow: true });
    }
    if (s.route) {
      const route = this.routes[s.route];
      const pt = route[s.routeIdx];
      const d = Math.hypot(pt.x - s.pos.x, pt.z - s.pos.z);
      if (d > 0.7) { s.waitT = 0; return this.goTo(s, pt.x, pt.z, SPEED.patrol, dt, { stop: 0.4 }); }
      if (s.waitT <= 0) s.waitT = 2 + this.rng() * 3;
      s.waitT -= dt;
      if (s.waitT <= 0.01) {
        const loop = ROUTES[s.route].loop;
        if (loop) s.routeIdx = (s.routeIdx + 1) % route.length;
        else {
          if (s.routeIdx + s.routeDir >= route.length || s.routeIdx + s.routeDir < 0) s.routeDir *= -1;
          s.routeIdx += s.routeDir;
        }
        s.waitT = 0;
        s.path = null;
      }
      return { action: 'guard' };
    }
    return { action: 'guard' };
  }

  /** Posted soldiers slowly look left and right (their view cone sweeps). */
  sweep(s, dt) {
    s.sweepT += dt;
    const target = Math.sin(s.sweepT * (s.def.lookout ? 0.35 : 0.5)) * (s.def.lookout ? 0.9 : 0.6);
    s.lookYaw += (target - s.lookYaw) * damp(3, dt);
  }

  onCamera(s, ctx) {
    const dir = ctx.cameraDir;
    if (!dir) return false;
    const dx = s.pos.x - ctx.cameraPos.x;
    const dz = s.pos.z - ctx.cameraPos.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * dir.x + dz * dir.z) / d > 0.35 && d < 90;
  }

  // ---------------------------------------------------------------- navigation
  /**
   * Steer toward (x,z): straight when the way is clear, otherwise along the
   * navigation graph (re-planned every so often while chasing).
   */
  goTo(s, x, z, speed, dt, opts = {}) {
    const dx = x - s.pos.x;
    const dz = z - s.pos.z;
    const dist = Math.hypot(dx, dz);
    const stop = opts.stop ?? 0.4;
    if (dist < stop) return { vx: 0, vz: 0, speed: 0 };
    s.directT -= dt;
    if (s.directT <= 0) {
      s.directT = opts.chase ? 0.3 : 0.8;
      s.directOk = dist < (opts.chase ? 22 : 12) && this.nav.clear({ x: s.pos.x, y: s.pos.y, z: s.pos.z }, { x, y: terrainHeight(x, z), z });
    }
    let tx = x;
    let tz = z;
    if (!s.directOk) {
      s.repathT -= dt;
      const goalMoved = !s.goal || Math.hypot(s.goal.x - x, s.goal.z - z) > (opts.chase ? 3 : 1.5);
      if (!s.path || (goalMoved && s.repathT <= 0) || s.pathIdx >= s.path.length) {
        s.repathT = opts.chase ? 1 : 4;
        const node = this.nav.nearestNode({ x, y: terrainHeight(x, z), z });
        const path = node ? this.nav.path(s.pos, node.id) : null;
        s.path = path ? [...path, { x, z, final: true }] : [{ x, z, final: true }];
        s.pathIdx = 0;
        s.goal = { x, z };
      }
      let pt = s.path[s.pathIdx];
      while (pt && !pt.final && Math.hypot(pt.x - s.pos.x, pt.z - s.pos.z) < 0.9) { s.pathIdx += 1; pt = s.path[s.pathIdx]; }
      if (pt) { tx = pt.x; tz = pt.z; }
    }
    const ex = tx - s.pos.x;
    const ez = tz - s.pos.z;
    const ed = Math.hypot(ex, ez) || 1;
    let sp = speed;
    if (!opts.chase && dist < 1.5) sp = Math.min(sp, Math.max(0.5, dist * 1.6));
    this.unstick(s, dt, sp, ex / ed, ez / ed);
    let vx = (ex / ed) * sp;
    let vz = (ez / ed) * sp;
    if (s.sidestep) {
      s.sidestep.t -= dt;
      vx += s.sidestep.x * 1.8;
      vz += s.sidestep.z * 1.8;
      if (s.sidestep.t <= 0) s.sidestep = null;
    }
    return { vx, vz, speed: sp };
  }

  unstick(s, dt, sp, nx, nz) {
    if (sp < 0.5 || s.lod !== 'near') { s.progressT = 0; return; }
    s.progressT += dt;
    if (s.progressT < 1.6) return;
    const moved = s.pos.distanceTo(s.progressPos);
    s.progressT = 0;
    s.progressPos.copy(s.pos);
    if (moved > 0.4) return;
    s.directOk = false;
    s.directT = 1.5;
    s.path = null;
    const a = this.rng() < 0.5 ? 1 : -1;
    s.sidestep = { x: -nz * a, z: nx * a, t: 0.7 };
  }

  move(s, dt, vx, vz, speed, ctx) {
    // keep a little space from other legionaries
    if (speed > 0) {
      for (const o of this.soldiers) {
        if (o === s || o.hidden || o.ragdoll) continue;
        const dx = s.pos.x - o.pos.x;
        const dz = s.pos.z - o.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1.2 && d2 > 0.0001) { const d = Math.sqrt(d2); vx += (dx / d) * (1.1 - d) * 2.4; vz += (dz / d) * (1.1 - d) * 2.4; }
      }
    }
    if (s.pushV) {
      vx += s.pushV.x; vz += s.pushV.z;
      const decay = Math.max(0, 1 - 4 * dt);
      s.pushV.x *= decay; s.pushV.z *= decay;
      if (Math.hypot(s.pushV.x, s.pushV.z) < 0.1) s.pushV = null;
    }
    const k = damp(speed > 0 ? 9 : 12, dt);
    s.vx += (vx - s.vx) * k;
    s.vz += (vz - s.vz) * k;
    // Romans don't swim: stop at the waterline
    const nx = s.pos.x + s.vx * dt * 6;
    const nz = s.pos.z + s.vz * dt * 6;
    if (waterDepth(nx, nz) > 0.55) {
      s.vx *= 0.1; s.vz *= 0.1;
      if (s.mode === 'pursue' && !s.bubble && this.rng() < 0.05) this.say(s, this.pick(ROMAN.water), 2.4, 'surprised');
    }
    const hs = Math.hypot(s.vx, s.vz);
    s.speed = hs;
    let face = null;
    if (hs > 0.3) face = Math.atan2(s.vx, s.vz);
    else if (s.faceYaw !== undefined && s.faceYaw !== null) face = s.faceYaw;
    if (face !== null) s.yaw += wrapAngle(face - s.yaw) * damp(hs > 3 ? 10 : 7, dt);
    if (hs > 0.3) s.faceYaw = null;
    if (hs > 0.5) s.lookYaw += (0 - s.lookYaw) * damp(6, dt);

    if (s.distP > KCC_RANGE) {
      s.pos.x += s.vx * dt;
      s.pos.z += s.vz * dt;
      s.pos.y = terrainHeight(s.pos.x, s.pos.z);
      s.body.setNextKinematicTranslation({ x: s.pos.x, y: s.pos.y + s.half + s.radius, z: s.pos.z });
      s.lod = 'far';
      return;
    }
    s.lod = 'near';
    s.vy = s.grounded ? -1.2 : Math.max(-20, s.vy - 22 * dt);
    this.kcc.computeColliderMovement(s.collider, { x: s.vx * dt, y: s.vy * dt, z: s.vz * dt }, this.R.QueryFilterFlags.EXCLUDE_SENSORS);
    const m = this.kcc.computedMovement();
    s.grounded = this.kcc.computedGrounded();
    const t = s.body.translation();
    s.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    s.pos.set(t.x + m.x, t.y + m.y - s.half - s.radius, t.z + m.z);
    if (s.pos.y < -10) { const d = this.dutySpot(s); this.place(s, d.x, terrainHeight(d.x, d.z), d.z); }
  }

  // ---------------------------------------------------------------- wanted-level systems
  updateReserves(dt, ctx) {
    const stars = this.attention.stars;
    const want = RESERVE_BY_STARS[stars];
    const active = this.soldiers.filter((s) => s.reserve && !s.hidden).length;
    this.reserveTimer -= dt;
    if (active >= want || this.reserveTimer > 0) return;
    this.reserveTimer = 2.2;
    const spot = this.reinforcementSpot(ctx);
    if (!spot) return;
    let s = this.soldiers.find((o) => o.reserve && o.hidden);
    if (!s) {
      const next = this.reserveQueue.shift();
      if (!next) return;
      s = this.spawn(next.def, next.index);
    }
    this.hide(s, false);
    this.place(s, spot.x, spot.y, spot.z);
    s.yaw = Math.atan2(ctx.playerPos.x - spot.x, ctx.playerPos.z - spot.z);
    this.setMode(s, 'pursue', { force: true });
    s.distP = Math.hypot(spot.x - ctx.playerPos.x, spot.z - ctx.playerPos.z);
    this.bus.emit('roman:reinforcement', { entityId: s.id, x: spot.x, z: spot.z, active: active + 1 });
  }

  /** Out of the camera's view, 28-70 m away, preferably ahead of the runner. */
  reinforcementSpot(ctx) {
    const p = ctx.playerPos;
    const v = ctx.playerVel || { x: 0, z: 0 };
    const vl = Math.hypot(v.x, v.z) || 1;
    let best = null;
    let bestScore = -Infinity;
    for (const n of this.nav.nodes) {
      if (!n.edges.length || n.tag) continue;
      const dx = n.x - p.x;
      const dz = n.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 28 || d > 70) continue;
      const dir = ctx.cameraDir;
      const seen = dir ? (n.x - ctx.cameraPos.x) * dir.x + (n.z - ctx.cameraPos.z) * dir.z > 0.3 * Math.hypot(n.x - ctx.cameraPos.x, n.z - ctx.cameraPos.z) : false;
      if (seen && d < 55) continue;
      const ahead = (dx * v.x + dz * v.z) / (d * vl);
      const score = ahead * 2 - Math.abs(d - 40) / 20 + this.rng() * 0.5 - (seen ? 2 : 0);
      if (score > bestScore) { bestScore = score; best = n; }
    }
    if (!best) {
      const g = this.anchors.romanPosts.gateOutside;
      return { x: g.x, y: g.y, z: g.z };
    }
    return { x: best.x, y: best.y, z: best.z };
  }

  updateGrab(dt, ctx) {
    const grabbers = this.soldiers.filter((s) => s.grabbing && !s.hidden && !s.ragdoll).length;
    if (grabbers && this.attention.wanted && !ctx.playerOnWater) this.grab = Math.min(1, this.grab + dt * (0.85 + 0.25 * (grabbers - 1)));
    else this.grab = Math.max(0, this.grab - dt * 1.1);
    if (this.grab >= 1 && !this.arrestPending) {
      this.arrestPending = true;
      const s = this.nearest((o) => o.grabbing);
      if (s) this.say(s, this.pick(ROMAN.arrest), 2.5, 'angry');
      this.bus.emit('roman:arrest', { by: s?.id ?? null, stars: this.attention.stars, peak: this.attention.peak });
    }
  }

  updateTrespass(dt, ctx, seers) {
    const p = ctx.playerPos;
    const T = this.trespass;
    if (inRestrictedZone(p.x, p.z) && !this.attention.wanted) {
      const seer = seers[0];
      if (!seer) return;
      if (!T.warned || this.time - T.warnedAt > 20) {
        T.warned = true;
        T.warnedAt = this.time;
        T.t = 0;
        this.say(seer, this.pick(ROMAN.warn), 2.6, 'angry');
        this.bus.emit('roman:warning', { entityId: seer.id, reason: 'restricted' });
        for (const s of seers) if (!s.def.lookout && !s.def.centurion && s.mode === 'duty') this.investigate(s, p.x, p.z);
      }
      T.t += dt;
      if (T.t > 4) {
        T.t = 0;
        this.crime('trespass', { victim: seer });
      }
    } else {
      T.t = Math.max(0, T.t - dt * 0.5);
    }
  }

  /** Villagers react to a chase going past them. */
  updateCrowd(dt, ctx) {
    this.crowdTimer -= dt;
    if (this.crowdTimer > 0 || this.attention.stars < 2) return;
    this.crowdTimer = 1.6;
    const p = ctx.playerPos;
    for (const v of this.npcs.npcs) {
      if (v.hidden || v.ragdoll || v.override || Math.hypot(v.pos.x - p.x, v.pos.z - p.z) > 9 || this.rng() > 0.35) continue;
      if (v.def.kid) { this.npcs.setOverride(v, 'cheer', 2, { lookAt: { x: p.x, z: p.z } }); this.npcs.say(v, this.pick(['RUN, YESHUA!', 'Go go go!', 'Faster!']), 1.8, 'smile'); }
      else { this.npcs.setOverride(v, 'startle', 1.4, { lookAt: { x: p.x, z: p.z } }); this.npcs.say(v, this.pick(['The Romans!', 'Not in my shop!', 'Run, boy!', 'Oh dear, oh dear.']), 1.8, 'surprised'); }
      break;
    }
  }

  onLost() {
    for (const s of this.soldiers) {
      if (['pursue', 'search', 'investigate'].includes(s.mode)) {
        this.setMode(s, 'return');
        if (!s.bubble && this.rng() < 0.5) this.say(s, this.pick(ROMAN.lost), 2.4, 'angry');
      }
    }
    this.grab = 0;
    this.syncState();
    this.bus.emit('roman:lost', {});
  }

  // ---------------------------------------------------------------- miracles
  /** Divine Push on a legionary: always a ragdoll, always a crime. */
  push(s, dirX, dirZ, strength) {
    if (s.hidden || s.mode === 'lifted') return 'none';
    const v = { x: dirX * (4.5 + strength * 7.5), y: 3.5 + strength * 3.5, z: dirZ * (4.5 + strength * 7.5) };
    if (s.ragdoll) { this.ragdolls.impulse(s.ragdoll, v); return 'ragdoll'; }
    if (s.def.lookout) { s.lookYaw = 0; this.say(s, 'HEY! Not the tower!', 2, 'angry'); this.crime('assault', { victim: s }); return 'startle'; }
    if (!this.ragdolls.available) {
      s.pushV = { x: v.x * 0.6, z: v.z * 0.6 };
      this.crime('assault', { victim: s });
      return 'stumble';
    }
    s.rig.group.position.copy(s.pos);
    s.rig.group.rotation.y = s.yaw;
    const rd = this.ragdolls.spawn(s.rig, v, { owner: s.id, spin: 4 });
    s.ragdoll = rd;
    s.collider.setEnabled(false);
    this.setMode(s, 'down', { force: true });
    this.say(s, this.pick(ROMAN.flying), 2, 'surprised');
    this.crime('assault', { victim: s });
    this.bus.emit('roman:ragdoll', { entityId: s.id });
    return 'ragdoll';
  }

  updateRagdoll(s) {
    const rd = s.ragdoll;
    const p = this.ragdolls.restPose(rd);
    s.pos.set(p.x, Math.max(terrainHeight(p.x, p.z), p.y - 0.75), p.z);
    s.speed = 0;
    if (!rd.done) return;
    this.ragdolls.release(rd);
    s.ragdoll = null;
    const spot = findStandSpot(this.physics, this.nav, p.x, p.y, p.z);
    this.place(s, spot.x, spot.y, spot.z);
    s.yaw = p.yaw;
    s.collider.setEnabled(true);
    s.anim.fall = 1;
    s.injured = { kind: 'bruised', label: 'bruised' };
    this.setMode(s, 'getup', { force: true });
    this.bus.emit('roman:getup', { entityId: s.id });
  }

  beginLevitate(s) {
    this.setMode(s, 'lifted', { force: true });
    s.pushV = null;
    this.say(s, this.pick(ROMAN.lifted), 2.6, 'surprised');
    this.crime('levitate', { victim: s });
  }

  holdAt(s, x, y, z) {
    s.pos.set(x, y, z);
    s.body.setNextKinematicTranslation({ x, y: y + s.half + s.radius, z });
  }

  endLevitate(s) {
    const spot = findStandSpot(this.physics, this.nav, s.pos.x, s.pos.y + 0.3, s.pos.z);
    this.place(s, spot.x, spot.y, spot.z);
    s.anim.fall = 0.6;
    this.setMode(s, 'getup', { force: true });
  }

  /** Healing Touch on a legionary: he's grateful, and vouches for you once per hunt. */
  heal(s) {
    const was = s.injured;
    s.injured = null;
    this.setMode(s, 'friendly', { force: true, modeTimer: 40 });
    this.say(s, this.pick(ROMAN.healed), 2.8, 'smile');
    if (this.attention.heat > 0 && !s.forgave) {
      s.forgave = true;
      const res = this.attention.forgive(1);
      this.syncState();
      this.bus.emit('roman:forgiven', { entityId: s.id, stars: res.after, before: res.before });
      if (res.after === 0 && res.before > 0) this.onLost();
    }
    return !!was;
  }

  /** Water to Wine nearby: off-duty for a few seconds. */
  distract(x, z) {
    let n = 0;
    for (const s of this.soldiers) {
      if (!this.canPerceive(s) || s.def.lookout || s.def.centurion) continue;
      if (Math.hypot(s.pos.x - x, s.pos.z - z) > 22) continue;
      this.setMode(s, 'distracted', { force: true, target: { x, z }, modeTimer: 9 });
      this.say(s, this.pick(ROMAN.wine), 2.4, 'smile');
      n += 1;
    }
    if (n) this.bus.emit('roman:distracted', { count: n });
    return n;
  }

  /** Living soldiers a miracle can aim at. */
  targetables() {
    if (this.disabled) return [];
    return this.soldiers.filter((s) => !s.hidden && !s.ragdoll && !s.def.lookout).map((s) => ({
      kind: 'npc', type: s.injured ? 'injured' : 'person', ref: s, owner: this, soldier: true, id: s.id, x: s.pos.x, y: s.pos.y + 1.2, z: s.pos.z, name: s.name,
    }));
  }

  // ---------------------------------------------------------------- talking
  findTalkTarget(pos, yaw) {
    if (this.attention.wanted || this.disabled) return null;
    let best = null;
    let bestScore = Infinity;
    for (const s of this.soldiers) {
      if (s.hidden || s.ragdoll || !['duty', 'friendly'].includes(s.mode) || s.def.lookout) continue;
      const d = Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z);
      if (d > 2.8 || Math.abs(s.pos.y - pos.y) > 1.5) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(s.pos.x - pos.x, s.pos.z - pos.z) - yaw));
      const score = d + ang * 0.8;
      if (score < bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  beginTalk(s) {
    s.prevMode = s.mode;
    this.setMode(s, 'talk', { force: true });
    s.speaking = true;
    s.bubble = null;
  }

  endTalk(s) {
    s.speaking = false;
    if (s.mode === 'talk') this.setMode(s, 'duty', { force: true });
    s.greetCd = this.time + 30;
  }

  // ---------------------------------------------------------------- per frame
  update(dt, alpha, ctx) {
    if (this.disabled) return;
    const cam = ctx.cameraPos;
    const p = ctx.playerPos;
    for (const s of this.soldiers) {
      if (s.hidden) continue;
      s.render.lerpVectors(s.prev, s.pos, clamp(alpha, 0, 1));
      s.distC = Math.hypot(s.render.x - cam.x, s.render.z - cam.z);
      if (s.ragdoll) { s.rig.setExpression('surprised'); continue; }
      const g = s.rig.group;
      g.position.copy(s.render);
      g.rotation.y = s.yaw;
      g.visible = s.distC < VISIBLE_RANGE;
      if (!g.visible) continue;
      const shadows = s.distC < SHADOW_RANGE;
      if (shadows !== s.shadows) { s.shadows = shadows; s.rig.setShadows(shadows); }
      // expression
      let expr = s.exprHold?.expr;
      if (!expr) {
        if (s.mode === 'pursue' || s.mode === 'search' || s.grabbing) expr = 'angry';
        else if (s.mode === 'investigate') expr = 'surprised';
        else if (s.mode === 'distracted' || s.mode === 'friendly') expr = 'smile';
        else if (s.def.lookout && ctx.night) expr = 'sleepy';
        else expr = 'neutral';
      }
      if (s.bubble || (s.mode === 'talk' && s.speaking)) {
        s.mouthT += dt;
        if (Math.sin(s.mouthT * 16) > 0) expr = 'talk';
      }
      s.rig.setExpression(expr);
      let look = s.lookYaw;
      if (s.mode === 'talk' || (s.distP < 6 && !['pursue', 'search'].includes(s.mode))) {
        const rel = wrapAngle(Math.atan2(p.x - s.render.x, p.z - s.render.z) - s.yaw);
        if (Math.abs(rel) < 1.6) look = rel;
      }
      s.animAcc += dt;
      if (s.distC < 50 || (this.frameIndex = (this.frameIndex || 0) + 1) % 3 === s.frameSkip) {
        s.anim.update(s.animAcc, { speed: s.speed, grounded: true, action: s.action, actionTime: s.actionTime, lookYaw: look, soldier: !['talk', 'salute', 'drink'].includes(s.action), injured: false });
        s.animAcc = 0;
      }
    }
  }

  bubbles() {
    const out = [];
    if (this.disabled) return out;
    for (const s of this.soldiers) {
      if (s.hidden || s.distC > 30) continue;
      const h = s.scale * 2.5 + 0.35;
      const y = s.render.y + h;
      if (s.bubble) out.push({ id: s.id, kind: 'bark', roman: true, text: s.bubble.text, x: s.render.x, y, z: s.render.z, d: s.distC });
      else if (s.mode === 'pursue' && s.sees) out.push({ id: `${s.id}!`, kind: 'alert', text: '!', x: s.render.x, y, z: s.render.z, d: s.distC });
      else if (s.mode === 'search' || s.mode === 'investigate') out.push({ id: `${s.id}?`, kind: 'alert', text: '?', x: s.render.x, y, z: s.render.z, d: s.distC });
      else if (s === this.talkTarget) out.push({ id: s.id, kind: 'name', text: s.name, sub: s.role, x: s.render.x, y, z: s.render.z, d: s.distC });
    }
    return out;
  }

  minimapDots(night) {
    if (this.disabled) return [];
    return this.soldiers.filter((s) => !s.hidden).map((s) => ({
      x: s.render.x || s.pos.x, z: s.render.z || s.pos.z, soldier: true, yaw: s.yaw + s.lookYaw,
      range: (s.def.lookout ? SIGHT.lookoutRange : SIGHT.range) * (night ? SIGHT.nightFactor : 1) * 0.6, fov: SIGHT.fov / 2,
      alert: ['pursue', 'search'].includes(s.mode),
    }));
  }

  /** Test hook: switch the whole garrison off (earlier-phase regression checks). */
  setActive(on) {
    this.disabled = !on;
    for (const s of this.soldiers) {
      if (s.reserve) continue;
      s.rig.group.visible = on;
      s.collider.setEnabled(on && !s.ragdoll);
    }
    if (!on) { this.ragdollsRelease(); this.attention.reset(); this.syncState(); }
    else this.resetDuty(true);
  }

  reset() {
    this.resetDuty(true);
    this.syncState();
  }

  stats() {
    const modes = {};
    let visible = 0;
    for (const s of this.soldiers) {
      if (s.hidden) continue;
      modes[s.mode] = (modes[s.mode] || 0) + 1;
      if (s.rig.group.visible) visible += 1;
    }
    return {
      count: this.soldiers.length,
      active: this.soldiers.filter((s) => !s.hidden).length,
      reserves: this.soldiers.filter((s) => s.reserve && !s.hidden).length,
      modes,
      visible,
      seeing: this.soldiers.filter((s) => s.sees).length,
      stars: this.attention.stars,
      heat: +this.attention.heat.toFixed(2),
      search: +this.attention.searchProgress.toFixed(2),
      grab: +this.grab.toFixed(2),
      ragdolls: this.soldiers.filter((s) => s.ragdoll).length,
      disabled: this.disabled,
      arrestPending: this.arrestPending,
    };
  }
}

export { CHECKPOINT };
