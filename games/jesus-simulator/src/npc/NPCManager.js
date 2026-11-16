import * as THREE from 'three';
import { buildCharacter, CharacterAnimator } from './CharacterKit.js';
import { NavGraph } from './NavGraph.js';
import { NAMED, generateVillagers, villagerRoutine, merchantRoutine } from './roster.js';
import { BARKS } from './dialogue.js';
import { Animals } from './Animals.js';
import { terrainHeight, PLAZA } from '../world/layout.js';
import { clamp, damp, wrapAngle } from '../core/rng.js';

const NIGHT_START = 0.86;
const EVENING_START = 0.78;
const KCC_RANGE = 42;
const ANIM_FULL_RANGE = 48;
const VISIBLE_RANGE = 125;
const SHADOW_RANGE = 30;

/**
 * Owns every villager: spawning, routines, navigation, collision, reactions
 * and level of detail. Gameplay talks to it through intents/events only.
 * NPC states: routine (travel/act) with temporary overrides
 * (talk-player, chat, greet, startle, bumped, stumble, angry, cheer, tag).
 */
export class NPCManager {
  constructor({ scene, physics, bus, rng, anchors }) {
    this.scene = scene;
    this.physics = physics;
    this.bus = bus;
    this.rng = rng;
    this.anchors = anchors;
    this.npcs = [];
    this.byHandle = new Map();
    this.byId = new Map();
    this.time = 0;
    this.clock = 0.2;
    this.scanTimer = 0;
    this.bubbleSerial = 0;
    this.seats = [];
    this.tmp = new THREE.Vector3();
    this.flags = {};
  }

  build() {
    const R = this.physics.RAPIER;
    const nav = new NavGraph(this.physics);
    this.nav = nav;
    // seeds: plaza rings + market aisle
    const seeds = [];
    for (let i = 0; i < 8; i += 1) seeds.push([Math.cos((i / 8) * Math.PI * 2) * 4.3, Math.sin((i / 8) * Math.PI * 2) * 4.3]);
    for (let i = 0; i < 12; i += 1) seeds.push([Math.cos((i / 12) * Math.PI * 2 + 0.2) * 11.8, Math.sin((i / 12) * Math.PI * 2 + 0.2) * 11.8]);
    for (let x = -18; x <= 18; x += 3) seeds.push([x, -27]);
    seeds.push([-19, -20], [19, -20], [-19, -34], [19, -34], [0, -16.5]);
    nav.build(seeds);

    // seats: two per bench
    for (const b of this.anchors.benches) {
      for (const side of [-0.55, 0.55]) {
        const ax = Math.cos(b.yaw);
        const az = -Math.sin(b.yaw);
        this.seats.push({ x: b.x + ax * side, z: b.z + az * side, y: b.y, yaw: b.yaw, approach: b.approach, taken: null });
      }
    }

    // people
    const villagers = generateVillagers(this.rng);
    const defs = [...NAMED, ...villagers];
    const doors = this.anchors.doors.filter((d) => d.kind === 'house');
    const usedDoors = new Set();
    const nearestDoor = (x, z) => {
      let best = null;
      let bestD = Infinity;
      for (const d of doors) {
        if (usedDoors.has(d)) continue;
        const dd = Math.hypot(d.x - x, d.z - z);
        if (dd < bestD) { bestD = dd; best = d; }
      }
      usedDoors.add(best);
      return best;
    };
    const workshop = this.anchors.spots.workshopYard;
    const homeHints = { workshop: [workshop.x, workshop.z], east: [40, 2], west: [-46, 2] };
    let shared = null;
    for (const def of defs) {
      let home;
      if (def.home === 'workshop' && shared) home = shared;
      else if (def.home && homeHints[def.home]) home = nearestDoor(...homeHints[def.home]);
      else if (def.stall !== undefined) { const s = this.anchors.stalls[def.stall]; home = nearestDoor(s.front.x, s.front.z + (s.front.z < -27 ? -14 : 14)); }
      else if (def.kid) home = nearestDoor(6, 18);
      else if (def.id === 'npc.ezra') home = nearestDoor(36, 14);
      else home = nearestDoor(this.rng.range(-45, 45), this.rng.range(-45, 45));
      if (def.home === 'workshop' && !shared) shared = home;
      this.spawn(def, home);
    }

    // register graph anchors for everything the routines can target
    const reg = (key, p) => { if (p && !nav.anchorIds.has(key)) nav.addAnchor(key, p); };
    for (const [name, p] of Object.entries(this.anchors.spots)) reg(`spot:${name}`, p);
    this.anchors.stalls.forEach((s, k) => { reg(`stallSide:${k}`, s.side); reg(`stallFront:${k}`, s.front); });
    this.anchors.benches.forEach((b, i) => reg(`benchApproach:${i}`, b.approach));
    this.doorPool = doors.filter((d) => Math.hypot(d.x, d.z) < 50).slice(0, 14);
    for (const d of new Set([...this.npcs.map((n) => n.home), ...this.doorPool])) if (d) reg(this.doorKey(d), d);
    for (const n of this.npcs) {
      for (const block of Object.values(n.routine)) {
        for (const step of block) if (step.go?.startsWith('point:')) { const [x, z] = step.go.slice(6).split(',').map(Number); reg(step.go, { x, z, y: terrainHeight(x, z) }); }
      }
    }

    // character controller shared by all nearby NPCs
    const kcc = this.physics.world.createCharacterController(0.03);
    kcc.setMaxSlopeClimbAngle((48 * Math.PI) / 180);
    kcc.enableAutostep(0.4, 0.15, false);
    kcc.enableSnapToGround(0.4);
    kcc.setSlideEnabled(true);
    kcc.setApplyImpulsesToDynamicBodies(true);
    kcc.setCharacterMass(55);
    this.kcc = kcc;
    this.R = R;

    this.animals = new Animals(this.scene, this.rng, this.bus);
    this.animals.build(this.anchors.doors);

    this.bindEvents();
  }

  doorKey(d) {
    return `door:${d.x.toFixed(1)},${d.z.toFixed(1)}`;
  }

  spawn(def, home) {
    const rig = buildCharacter({ ...def.look, carry: def.look.carry || [] });
    const scale = def.look.scale || 1;
    const radius = def.kid ? 0.22 : 0.3;
    const half = def.kid ? 0.32 : 0.55 * scale;
    const start = home ? { x: home.x, z: home.z } : { x: 0, z: 8 };
    if (def.stall !== undefined) Object.assign(start, this.anchors.stalls[def.stall].stand);
    if (def.kid) Object.assign(start, { x: this.rng.range(-8, 8), z: this.rng.range(5, 10) });
    // never spawn inside another villager (shared homes)
    if (def.stall === undefined) {
      for (let k = 0; k < 8 && this.npcs.some((o) => Math.hypot(o.pos.x - start.x, o.pos.z - start.z) < 0.9); k += 1) {
        start.x += this.rng.range(-1, 1);
        start.z += this.rng.range(-1, 1);
      }
    }
    const y = terrainHeight(start.x, start.z);
    const body = this.physics.world.createRigidBody(this.physics.RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, y + half + radius, start.z));
    const collider = this.physics.world.createCollider(this.physics.RAPIER.ColliderDesc.capsule(half, radius).setFriction(0), body);
    const routine = def.routine || (def.stall !== undefined ? merchantRoutine(def.stall) : def.kid ? { day: [], evening: [{ go: 'door', act: 'idle', dur: [20, 30] }] } : villagerRoutine(this.rng));
    const npc = {
      id: def.id, def, name: def.name, role: def.role, rig, anim: new CharacterAnimator(rig, this.npcs.length),
      body, collider, radius, half, home, routine,
      pos: new THREE.Vector3(start.x, y, start.z), prev: new THREE.Vector3(start.x, y, start.z), render: new THREE.Vector3(),
      yaw: start.yaw ?? this.rng() * 6.28, vx: 0, vz: 0, vy: 0, grounded: true, speed: 0,
      walkSpeed: def.kid ? 3.3 : 1.25 + this.rng() * 0.45,
      block: null, stepIndex: -1, step: null, phase: 'none', actTimer: 0, path: null, pathIdx: 0,
      anchored: null, override: null, carry: null, hidden: false, seat: null,
      bubble: null, greetCd: this.rng() * 10, chatCd: 5 + this.rng() * 20, bumpCd: 0, excitedCd: 5,
      lookYaw: 0, progressT: 0, progressPos: new THREE.Vector3(start.x, y, start.z), stuck: 0, sidestep: null,
      distP: 999, distC: 999, lod: 'near', animAcc: 0, frameSkip: this.npcs.length % 3, expr: 'neutral', mouthT: 0,
      tag: def.kid ? { it: def.id === 'npc.sami', target: null, pause: 0 } : null,
    };
    rig.group.position.copy(npc.pos);
    rig.group.rotation.y = npc.yaw;
    this.scene.add(rig.group);
    this.npcs.push(npc);
    this.byHandle.set(collider.handle, npc);
    this.byId.set(npc.id, npc);
    return npc;
  }

  bindEvents() {
    this.bus.on('player:contact', ({ handle, speed }) => {
      const npc = this.byHandle.get(handle);
      if (!npc || npc.bumpCd > 0 || npc.hidden) return;
      npc.bumpCd = 2.5;
      if (npc.override?.type === 'talk-player') return;
      if (speed > 6.2) {
        this.setOverride(npc, 'stumble', 2.6);
        this.say(npc, this.pickLine(BARKS.knocked), 2.2, 'angry');
        this.bus.emit('npc:knocked', { entityId: npc.id, by: 'player.local' });
      } else {
        this.setOverride(npc, 'bumped', 1.1);
        this.say(npc, this.pickLine(BARKS.bumped), 1.8, 'angry');
      }
    });
    const react = (x, z, radius, fn) => {
      for (const npc of this.npcs) {
        if (npc.hidden || npc.override?.type === 'talk-player' || npc.override?.type === 'stumble') continue;
        if (Math.hypot(npc.pos.x - x, npc.pos.z - z) < radius) fn(npc);
      }
    };
    this.bus.on('prop:broken', ({ x, z, owner }) => {
      this.flags['pots.broken'] = true;
      react(x, z, 14, (npc) => {
        if (npc.id === owner || (owner && npc.def.stall === 3)) {
          this.setOverride(npc, 'angry', 2.5, { lookAt: { x, z } });
          this.say(npc, this.pickLine(BARKS.potBroken), 2.5, 'angry');
        } else if (this.rng() < 0.6) {
          this.setOverride(npc, 'startle', 1.2, { lookAt: { x, z } });
          if (this.rng() < 0.5) this.say(npc, this.pickLine(BARKS.startle), 1.6, 'surprised');
          else npc.exprHold = { expr: 'surprised', t: 1.2 };
        }
      });
    });
    this.bus.on('prop:disturbed', ({ x, z, type }) => {
      react(x, z, 7, (npc) => {
        if (npc.override || this.rng() > 0.45) return;
        this.setOverride(npc, type === 'fruit' ? 'look' : 'startle', 0.9, { lookAt: { x, z } });
        npc.exprHold = { expr: 'surprised', t: 1 };
      });
    });
  }

  // ---------------------------------------------------------------- helpers
  pickLine(list) {
    return list[Math.floor(this.rng() * list.length)];
  }

  say(npc, text, seconds = 2.2, expr = null) {
    npc.bubble = { text, t: seconds, id: (this.bubbleSerial += 1) };
    if (expr) npc.exprHold = { expr, t: seconds };
    this.bus.emit('npc:bark', { entityId: npc.id, voice: npc.def.voice || 1, x: npc.pos.x, z: npc.pos.z, length: text.length });
  }

  setOverride(npc, type, duration, extra = {}) {
    if (npc.override?.type === 'talk-player') return;
    npc.override = { type, t: duration, age: 0, ...extra };
    if (type === 'stumble' || type === 'bumped') this.leaveAnchor(npc, true);
  }

  isNight() {
    return this.clock >= NIGHT_START;
  }

  blockFor(npc) {
    if (this.clock >= NIGHT_START || this.clock < 0.015) return 'night';
    return this.clock >= EVENING_START ? 'evening' : 'day';
  }

  /** Resolve a routine target into a graph goal + final point. */
  resolve(npc, go) {
    const nav = this.nav;
    if (go === 'door' || go === 'door:any') {
      const d = go === 'door' ? npc.home : this.doorPool[Math.floor(this.rng() * this.doorPool.length)];
      if (!d) return null;
      return { node: nav.anchorIds.get(this.doorKey(d)), final: { x: d.x, y: d.y, z: d.z, yaw: d.yaw + Math.PI } };
    }
    const [kind, arg] = [go.slice(0, go.indexOf(':')), go.slice(go.indexOf(':') + 1)];
    if (kind === 'spot') {
      const s = this.anchors.spots[arg];
      if (!s) return null;
      return { node: nav.anchorIds.get(go), final: { ...s }, anchored: arg === 'workbench' };
    }
    if (kind === 'stall') {
      const s = this.anchors.stalls[Number(arg)];
      return { node: nav.anchorIds.get(`stallSide:${arg}`), final: { ...s.stand }, anchored: true, approach: s.side };
    }
    if (kind === 'stallFront') {
      const k = Number(arg) % this.anchors.stalls.length;
      const s = this.anchors.stalls[k];
      const j = (this.rng() - 0.5) * 1.6;
      return { node: nav.anchorIds.get(`stallFront:${k}`), final: { x: s.front.x + Math.cos(s.front.yaw) * j, y: s.front.y, z: s.front.z - Math.sin(s.front.yaw) * j, yaw: s.front.yaw } };
    }
    if (kind === 'bench') {
      const seats = this.seats;
      let i = Number(arg) % seats.length;
      for (let k = 0; k < seats.length && seats[i].taken && seats[i].taken !== npc; k += 1) i = (i + 1) % seats.length;
      const seat = seats[i];
      if (seat.taken && seat.taken !== npc) return null;
      const bi = Math.floor(i / 2);
      return { node: nav.anchorIds.get(`benchApproach:${bi}`), final: { x: seat.x, y: seat.y, z: seat.z, yaw: seat.yaw }, anchored: true, approach: seat.approach, seat };
    }
    if (kind === 'point') {
      const [x, z] = arg.split(',').map(Number);
      return { node: nav.anchorIds.get(go), final: { x, y: terrainHeight(x, z), z, yaw: null } };
    }
    if (kind === 'wander') {
      const [cx, cz, r] = arg.split(',').map(Number);
      for (let k = 0; k < 6; k += 1) {
        const a = this.rng() * Math.PI * 2;
        const rr = r * (0.4 + this.rng() * 0.6);
        const x = cx + Math.cos(a) * rr;
        const z = cz + Math.sin(a) * rr;
        const near = nav.nearestNode({ x, z, y: terrainHeight(x, z) });
        if (near) return { node: near.id, final: { x, y: terrainHeight(x, z), z, yaw: null } };
      }
    }
    return null;
  }

  leaveAnchor(npc, instant = false) {
    if (!npc.anchored) return;
    const a = npc.anchored;
    if (a.seat) a.seat.taken = null;
    if (a.approach) {
      if (instant) this.place(npc, a.approach.x, terrainHeight(a.approach.x, a.approach.z), a.approach.z);
      else npc.exitTo = { x: a.approach.x, y: terrainHeight(a.approach.x, a.approach.z), z: a.approach.z };
    }
    npc.anchored = null;
  }

  place(npc, x, y, z) {
    npc.pos.set(x, y, z);
    npc.prev.copy(npc.pos);
    npc.body.setNextKinematicTranslation({ x, y: y + npc.half + npc.radius, z });
    npc.body.setTranslation({ x, y: y + npc.half + npc.radius, z }, true);
  }

  startStep(npc) {
    const block = npc.routine[npc.block] || [];
    if (!block.length) { npc.step = null; return; }
    npc.stepIndex = (npc.stepIndex + 1) % block.length;
    const step = block[npc.stepIndex];
    npc.step = step;
    npc.carry = step.carry ?? (npc.carryAfterPending || null);
    npc.carryAfterPending = null;
    this.travelTo(npc, step);
  }

  travelTo(npc, step) {
    const target = this.resolve(npc, step.go);
    if (!target || target.node === undefined) {
      npc.phase = 'act';
      npc.actTimer = 3;
      return;
    }
    if (step.teleportIfHidden && npc.distP > 45) this.place(npc, target.final.x, target.final.y, target.final.z);
    // already there (e.g. a merchant who spawned behind the counter): arrive in place
    if (Math.hypot(target.final.x - npc.pos.x, target.final.z - npc.pos.z) < 0.35) {
      if (target.seat) target.seat.taken = npc;
      npc.target = target;
      npc.path = null;
      this.arrive(npc);
      return;
    }
    if (npc.anchored) this.leaveAnchor(npc);
    const path = this.nav.path(npc.pos, target.node) || [];
    if (npc.exitTo) { path.unshift({ ...npc.exitTo, direct: true }); npc.exitTo = null; }
    path.push({ ...target.final, direct: !!target.anchored, final: true });
    npc.path = path;
    npc.pathIdx = 0;
    npc.target = target;
    npc.phase = 'travel';
    npc.progressT = 0;
    npc.progressPos.copy(npc.pos);
    if (target.seat) target.seat.taken = npc;
  }

  arrive(npc) {
    const t = npc.target;
    npc.phase = 'act';
    const [a, b] = npc.step?.dur || [4, 8];
    npc.actTimer = a + this.rng() * (b - a);
    if (t?.final?.yaw !== null && t?.final?.yaw !== undefined) npc.faceYaw = t.final.yaw;
    if (t?.anchored) npc.anchored = { approach: t.approach || null, seat: t.seat || null };
    if (npc.step?.say && this.rng() < 0.7) {
      const pool = npc.step.say === 'sell' ? [BARKS.sell[this.anchors.stalls[npc.def.stall]?.goods] || 'Best prices!'] : BARKS[npc.step.say];
      if (pool) this.say(npc, this.pickLine(pool), 2.4);
    }
    // going home at night: step inside
    if (npc.block === 'night' && npc.step?.go === 'door') this.hide(npc, true);
  }

  hide(npc, hidden) {
    if (npc.hidden === hidden) return;
    npc.hidden = hidden;
    npc.rig.group.visible = !hidden;
    npc.collider.setEnabled(!hidden);
    if (!hidden && npc.home) this.place(npc, npc.home.x, npc.home.y, npc.home.z);
  }

  // ---------------------------------------------------------------- simulation
  fixedUpdate(dt, ctx) {
    this.time += dt;
    this.clock = ctx.clock;
    const player = ctx.playerPos;
    this.scanTimer -= dt;
    const scan = this.scanTimer <= 0;
    if (scan) this.scanTimer = 0.25;

    for (const npc of this.npcs) {
      npc.prev.copy(npc.pos);
      npc.distP = Math.hypot(npc.pos.x - player.x, npc.pos.z - player.z);
      npc.greetCd -= dt; npc.chatCd -= dt; npc.bumpCd -= dt; npc.excitedCd -= dt;
      if (npc.bubble) { npc.bubble.t -= dt; if (npc.bubble.t <= 0) npc.bubble = null; }
      if (npc.exprHold) { npc.exprHold.t -= dt; if (npc.exprHold.t <= 0) npc.exprHold = null; }

      // routine block switching (day / evening / night)
      const block = this.blockFor(npc);
      if (block !== npc.block) {
        npc.block = block;
        npc.stepIndex = -1;
        if (block === 'night') {
          this.leaveAnchor(npc);
          npc.override = null;
          npc.step = { go: 'door', act: 'idle', dur: [9999, 9999] };
          this.travelTo(npc, npc.step);
          npc.walkBoost = 1.5;
        } else {
          if (npc.hidden) this.hide(npc, false);
          npc.walkBoost = 1;
          npc.step = null;
        }
      }
      if (npc.hidden) continue;

      let vx = 0;
      let vz = 0;
      let speed = 0;
      let action = 'none';
      const o = npc.override;

      if (o) {
        o.t -= dt;
        o.age += dt;
        action = { 'talk-player': 'talk', chat: 'talk', greet: 'wave', bumped: 'look', angry: 'angry', startle: 'startle', stumble: 'stumble', cheer: 'cheer', look: 'look' }[o.type] || 'none';
        if (o.type === 'talk-player') { npc.faceYaw = Math.atan2(player.x - npc.pos.x, player.z - npc.pos.z); action = npc.speaking ? 'talk' : 'none'; }
        if (o.lookAt) npc.faceYaw = Math.atan2(o.lookAt.x - npc.pos.x, o.lookAt.z - npc.pos.z);
        if (o.type === 'bumped' && o.age < 0.4) {
          // step away from the player
          const dx = npc.pos.x - player.x;
          const dz = npc.pos.z - player.z;
          const d = Math.hypot(dx, dz) || 1;
          vx = (dx / d) * 1.8; vz = (dz / d) * 1.8; speed = 1.8;
        }
        if (o.type === 'cheer' && o.chase && npc.distP > 1.9) {
          const dx = player.x - npc.pos.x; const dz = player.z - npc.pos.z; const d = Math.hypot(dx, dz) || 1;
          vx = (dx / d) * 3.4; vz = (dz / d) * 3.4; speed = 3.4; action = 'none';
        } else if (o.type === 'cheer') npc.faceYaw = Math.atan2(player.x - npc.pos.x, player.z - npc.pos.z);
        if (o.t <= 0 && o.type !== 'talk-player') {
          npc.override = null;
          if (npc.phase === 'travel' && npc.path) this.travelTo(npc, npc.step); // re-path after interruption
        }
      } else if (npc.tag && npc.block !== 'night' && npc.block !== 'evening') {
        ({ vx, vz, speed } = this.updateKid(npc, dt, player));
      } else {
        if (!npc.step || npc.phase === 'none') this.startStep(npc);
        if (npc.phase === 'travel') ({ vx, vz, speed } = this.follow(npc, dt));
        else if (npc.phase === 'act') {
          action = npc.step?.act && npc.step.act !== 'idle' ? npc.step.act : 'none';
          npc.actTimer -= dt;
          if (npc.actTimer <= 0 && npc.block !== 'night') {
            if (npc.step?.carryAfter) npc.carryAfterPending = npc.step.carryAfter;
            npc.phase = 'none';
          }
        }
      }

      // social scans (cheap, staggered)
      if (scan && !npc.override) this.socialScan(npc, player, ctx);

      this.move(npc, dt, vx, vz, speed, ctx);
      npc.action = action;
      npc.actionTime = o ? o.age : 0;
    }

    if (scan) this.chatScan();
    const amos = this.byId.get('npc.amos');
    this.animals.update(dt, {
      player: { x: player.x, z: player.z, speed: ctx.playerSpeed },
      shepherd: amos && !amos.hidden ? { x: amos.pos.x, z: amos.pos.z, yaw: amos.yaw } : null,
      flags: ctx.flags,
    });
  }

  updateKid(npc, dt, player) {
    const tag = npc.tag;
    const other = this.npcs.find((n) => n.tag && n !== npc);
    // excited by Yeshua
    if (npc.distP < 9 && npc.excitedCd <= 0) {
      npc.excitedCd = 45;
      this.setOverride(npc, 'cheer', 4.5, { chase: true });
      this.say(npc, this.pickLine(BARKS.greetKid), 2.4, 'smile');
      return { vx: 0, vz: 0, speed: 0 };
    }
    if (tag.pause > 0) { tag.pause -= dt; return { vx: 0, vz: 0, speed: 0 }; }
    let tx;
    let tz;
    if (tag.it && other) {
      tx = other.pos.x; tz = other.pos.z;
      if (Math.hypot(tx - npc.pos.x, tz - npc.pos.z) < 0.9 && !other.override) {
        tag.it = false; other.tag.it = true; other.tag.pause = 1.6; tag.target = null;
        this.say(npc, 'Tag! You\'re it!', 1.6, 'smile');
        this.say(other, 'No fair!', 1.4, 'surprised');
      }
    } else {
      if (!tag.target || Math.hypot(tag.target.x - npc.pos.x, tag.target.z - npc.pos.z) < 1) {
        const a = this.rng() * Math.PI * 2;
        const r = 6 + this.rng() * 5;
        tag.target = { x: PLAZA.x + Math.cos(a) * r, z: PLAZA.z + 6 + Math.sin(a) * r * 0.8 };
      }
      tx = tag.target.x; tz = tag.target.z;
    }
    const dx = tx - npc.pos.x;
    const dz = tz - npc.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const sp = tag.it ? 3.1 : 3.5;
    return { vx: (dx / d) * sp, vz: (dz / d) * sp, speed: sp };
  }

  socialScan(npc, player, ctx) {
    if (npc.anchored && npc.step?.act === 'sit' && npc.distP > 4) return;
    // notice and greet Yeshua
    if (npc.distP < 5.5 && npc.greetCd <= 0 && !npc.tag) {
      const toP = Math.atan2(player.x - npc.pos.x, player.z - npc.pos.z);
      if (Math.abs(wrapAngle(toP - npc.yaw)) < 1.9) {
        npc.greetCd = 40 + this.rng() * 30;
        const chaosy = ctx.chaos >= 8 && this.rng() < 0.5;
        if (!npc.anchored) this.setOverride(npc, chaosy ? 'look' : 'greet', 1.6, { lookAt: { x: player.x, z: player.z } });
        this.say(npc, chaosy ? this.pickLine(['Oh no, it\'s him.', 'Mind the pots!', 'Here comes trouble.']) : this.pickLine(BARKS.greet), 2, chaosy ? 'surprised' : 'smile');
      }
    }
  }

  chatScan() {
    const walkers = this.npcs.filter((n) => !n.hidden && !n.override && !n.tag && n.phase === 'travel' && n.chatCd <= 0 && n.distP < 60);
    for (let i = 0; i < walkers.length; i += 1) {
      for (let j = i + 1; j < walkers.length; j += 1) {
        const a = walkers[i];
        const b = walkers[j];
        if (a.override || b.override) continue;
        if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 2.6 || this.rng() > 0.4) continue;
        const pair = this.pickLine(BARKS.chat);
        a.chatCd = b.chatCd = 50 + this.rng() * 40;
        this.setOverride(a, 'chat', 4.5, { lookAt: { x: b.pos.x, z: b.pos.z } });
        this.setOverride(b, 'chat', 4.5, { lookAt: { x: a.pos.x, z: a.pos.z } });
        this.say(a, pair[0], 2);
        b.pendingLine = { text: pair[1], delay: 1.9 };
        this.bus.emit('npc:chat', { a: a.id, b: b.id });
      }
    }
  }

  follow(npc, dt) {
    const pt = npc.path?.[npc.pathIdx];
    if (!pt) { this.arrive(npc); return { vx: 0, vz: 0, speed: 0 }; }
    const dx = pt.x - npc.pos.x;
    const dz = pt.z - npc.pos.z;
    const d = Math.hypot(dx, dz);
    const last = npc.pathIdx === npc.path.length - 1;
    if (d < (last || pt.direct ? 0.12 : 0.7)) {
      npc.pathIdx += 1;
      if (npc.pathIdx >= npc.path.length) { this.arrive(npc); return { vx: 0, vz: 0, speed: 0 }; }
      return this.follow(npc, dt);
    }
    let sp = npc.walkSpeed * (npc.walkBoost || 1);
    if (last || pt.direct) sp = Math.min(sp, Math.max(0.6, d * 2.5));
    npc.directMove = !!pt.direct;
    // stuck detection (only for collision-driven movement)
    npc.progressT += dt;
    if (npc.progressT > 2) {
      const moved = npc.pos.distanceTo(npc.progressPos);
      npc.progressT = 0;
      npc.progressPos.copy(npc.pos);
      if (moved < 0.35 && !pt.direct) {
        npc.stuck += 1;
        if (npc.stuck >= 2 && (npc.distP > 22 || npc.stuck >= 4)) {
          this.place(npc, pt.x, pt.y ?? terrainHeight(pt.x, pt.z), pt.z);
          npc.stuck = 0;
          this.bus.emit('npc:unstuck', { entityId: npc.id });
        } else {
          const a = this.rng() < 0.5 ? 1 : -1;
          npc.sidestep = { x: -dz / (d || 1) * a, z: dx / (d || 1) * a, t: 0.8 };
        }
      } else npc.stuck = 0;
    }
    let vx = (dx / d) * sp;
    let vz = (dz / d) * sp;
    if (npc.sidestep) {
      npc.sidestep.t -= dt;
      vx += npc.sidestep.x * 1.4;
      vz += npc.sidestep.z * 1.4;
      if (npc.sidestep.t <= 0) npc.sidestep = null;
    }
    return { vx, vz, speed: sp };
  }

  move(npc, dt, vx, vz, speed, ctx) {
    // separation from other villagers and the player (polite walking)
    if (speed > 0 && !npc.directMove) {
      for (const o of this.npcs) {
        if (o === npc || o.hidden) continue;
        const dx = npc.pos.x - o.pos.x;
        const dz = npc.pos.z - o.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1.1 && d2 > 0.0001) { const d = Math.sqrt(d2); vx += (dx / d) * (1.05 - d) * 2; vz += (dz / d) * (1.05 - d) * 2; }
      }
      const px = npc.pos.x - ctx.playerPos.x;
      const pz = npc.pos.z - ctx.playerPos.z;
      const pd = Math.hypot(px, pz);
      if (pd < 1.4 && pd > 0.01) { vx += (px / pd) * (1.4 - pd) * 2.2; vz += (pz / pd) * (1.4 - pd) * 2.2; }
    }
    const k = damp(speed > 0 ? 8 : 12, dt);
    npc.vx += (vx - npc.vx) * k;
    npc.vz += (vz - npc.vz) * k;
    const hs = Math.hypot(npc.vx, npc.vz);
    npc.speed = hs;

    // facing
    let faceTarget = null;
    if (hs > 0.25) faceTarget = Math.atan2(npc.vx, npc.vz);
    else if (npc.faceYaw !== undefined && npc.faceYaw !== null) faceTarget = npc.faceYaw;
    if (faceTarget !== null) npc.yaw += wrapAngle(faceTarget - npc.yaw) * damp(8, dt);
    if (hs > 0.25 && npc.phase === 'travel') npc.faceYaw = null;

    if (npc.anchored && hs < 0.05) {
      npc.lod = npc.distP < KCC_RANGE ? 'near' : 'far';
      return; // pinned in place (stall, bench, workbench)
    }
    const direct = npc.directMove || npc.distP > KCC_RANGE;
    if (direct) {
      // cheap path following: no collision, follow terrain / anchor height
      npc.pos.x += npc.vx * dt;
      npc.pos.z += npc.vz * dt;
      const pt = npc.path?.[npc.pathIdx];
      const gy = terrainHeight(npc.pos.x, npc.pos.z);
      npc.pos.y = pt?.direct && pt.y !== undefined ? npc.pos.y + (pt.y - npc.pos.y) * damp(6, dt) : gy;
      npc.body.setNextKinematicTranslation({ x: npc.pos.x, y: npc.pos.y + npc.half + npc.radius, z: npc.pos.z });
      npc.lod = 'far';
      npc.vy = 0;
      return;
    }
    npc.lod = 'near';
    // interpenetrating capsules can't resolve through the controller: nudge apart directly
    for (const o of this.npcs) {
      if (o === npc || o.hidden || o.anchored) continue;
      const dx = npc.pos.x - o.pos.x;
      const dz = npc.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      const min = (npc.radius + o.radius) * 0.9;
      if (d < min) {
        const nx = d > 0.001 ? dx / d : 1;
        const nz = d > 0.001 ? dz / d : 0;
        npc.pos.x += nx * (min - d + 0.02);
        npc.pos.z += nz * (min - d + 0.02);
        npc.body.setTranslation({ x: npc.pos.x, y: npc.pos.y + npc.half + npc.radius, z: npc.pos.z }, true);
      }
    }
    npc.vy = npc.grounded ? -1.2 : Math.max(-20, npc.vy - 22 * dt);
    const desired = { x: npc.vx * dt, y: npc.vy * dt, z: npc.vz * dt };
    this.kcc.computeColliderMovement(npc.collider, desired, this.R.QueryFilterFlags.EXCLUDE_SENSORS);
    const m = this.kcc.computedMovement();
    npc.grounded = this.kcc.computedGrounded();
    const t = npc.body.translation();
    npc.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    npc.pos.set(t.x + m.x, t.y + m.y - npc.half - npc.radius, t.z + m.z);
    if (npc.pos.y < -10) this.place(npc, npc.home?.x ?? 0, terrainHeight(npc.home?.x ?? 0, npc.home?.z ?? 8), npc.home?.z ?? 8);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, alpha, ctx) {
    const cam = ctx.cameraPos;
    const player = ctx.playerPos;
    for (const npc of this.npcs) {
      if (npc.pendingLine) {
        npc.pendingLine.delay -= dt;
        if (npc.pendingLine.delay <= 0) { this.say(npc, npc.pendingLine.text, 2); npc.pendingLine = null; }
      }
      if (npc.hidden) continue;
      npc.render.lerpVectors(npc.prev, npc.pos, clamp(alpha, 0, 1));
      const g = npc.rig.group;
      g.position.copy(npc.render);
      g.rotation.y = npc.yaw;
      if (npc.anchored && npc.step?.act === 'sit') g.position.y = npc.render.y + 0.08;
      npc.distC = Math.hypot(npc.render.x - cam.x, npc.render.z - cam.z);
      g.visible = npc.distC < VISIBLE_RANGE;
      if (!g.visible) continue;
      const shadows = npc.distC < SHADOW_RANGE;
      if (shadows !== npc.shadows) { npc.shadows = shadows; npc.rig.setShadows(shadows); }
      // carried items
      for (const [type, mesh] of Object.entries(npc.rig.carry)) mesh.visible = npc.carry === type;
      // head tracking toward Yeshua
      let look = 0;
      if (npc.distP < 7 || npc.override?.type === 'talk-player') {
        const rel = wrapAngle(Math.atan2(player.x - npc.render.x, player.z - npc.render.z) - npc.yaw);
        if (Math.abs(rel) < 1.6) look = rel;
      }
      // expressions, with mouth flap while a bubble is showing
      let expr = npc.exprHold?.expr || (npc.distP < 4 ? 'smile' : 'neutral');
      if (npc.action === 'stumble') expr = 'surprised';
      if (npc.anchored && npc.step?.act === 'sit' && this.isNight()) expr = 'sleepy';
      if (npc.bubble || (npc.override?.type === 'talk-player' && npc.speaking)) {
        npc.mouthT += dt;
        if (Math.sin(npc.mouthT * 18) > 0) expr = 'talk';
      }
      npc.rig.setExpression(expr);
      // animation LOD
      npc.animAcc += dt;
      const near = npc.distC < ANIM_FULL_RANGE;
      if (near || (this.frameIndex = (this.frameIndex || 0) + 1) % 3 === npc.frameSkip) {
        npc.anim.update(npc.animAcc, {
          speed: npc.speed, grounded: true, action: npc.action, actionTime: npc.actionTime, lookYaw: look,
          carryHead: npc.carry === 'jar', carrySide: npc.carry === 'basket' || npc.carry === 'plank',
        });
        npc.animAcc = 0;
      }
    }
    this.animals.setShadows(cam);
  }

  // ---------------------------------------------------------------- player interaction
  findTalkTarget(pos, yaw) {
    let best = null;
    let bestScore = Infinity;
    for (const npc of this.npcs) {
      if (npc.hidden || npc.override?.type === 'stumble') continue;
      const d = Math.hypot(npc.pos.x - pos.x, npc.pos.z - pos.z);
      if (d > 2.8) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(npc.pos.x - pos.x, npc.pos.z - pos.z) - yaw));
      const score = d + ang * 0.8;
      if (score < bestScore) { bestScore = score; best = npc; }
    }
    return best;
  }

  beginTalk(npc) {
    npc.override = { type: 'talk-player', t: Infinity, age: 0 };
    npc.speaking = true;
    npc.bubble = null;
  }

  endTalk(npc) {
    if (npc.override?.type === 'talk-player') {
      npc.override = { type: 'greet', t: 1.2, age: 0 };
      npc.greetCd = 30;
    }
    npc.speaking = false;
    if (npc.phase === 'travel' && npc.step) this.travelTo(npc, npc.step);
  }

  /** Visible speech bubbles / name tags for the UI (world positions). */
  bubbles(talkTarget) {
    const out = [];
    for (const npc of this.npcs) {
      if (npc.hidden || !npc.rig.group.visible || npc.distC > 26) continue;
      const h = (npc.def.look.scale || 1) * (npc.def.kid ? 1.75 : 2.35) + 0.1;
      if (npc.bubble) out.push({ id: npc.id, kind: 'bark', text: npc.bubble.text, x: npc.render.x, y: npc.render.y + h, z: npc.render.z, d: npc.distC });
      else if (npc === talkTarget) out.push({ id: npc.id, kind: 'name', text: npc.name, sub: npc.role, x: npc.render.x, y: npc.render.y + h, z: npc.render.z, d: npc.distC });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, 5);
  }

  minimapDots() {
    return this.npcs.filter((n) => !n.hidden).map((n) => ({ x: n.render.x || n.pos.x, z: n.render.z || n.pos.z, named: !n.def.generic }));
  }

  reset(flags) {
    this.flags = flags;
    for (const s of this.seats) s.taken = null;
    for (const npc of this.npcs) {
      npc.override = null;
      npc.anchored = null;
      npc.block = null;
      npc.step = null;
      npc.phase = 'none';
      npc.bubble = null;
      if (npc.hidden) this.hide(npc, false);
    }
    this.animals.reset();
    if (flags['sheep.returned'] && this.animals.stray) {
      Object.assign(this.animals.stray, { joined: true, following: false, slot: 6, x: -60, z: 0 });
    }
  }

  stats() {
    let near = 0;
    let visible = 0;
    let hidden = 0;
    const states = {};
    for (const n of this.npcs) {
      if (n.hidden) { hidden += 1; continue; }
      if (n.lod === 'near') near += 1;
      if (n.rig.group.visible) visible += 1;
      const k = n.override?.type || n.phase;
      states[k] = (states[k] || 0) + 1;
    }
    return { count: this.npcs.length, near, visible, hidden, states, nav: this.nav.stats(), animals: this.animals.list.length };
  }
}
