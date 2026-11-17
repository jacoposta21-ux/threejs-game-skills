import { MISSIONS } from './missions.js';

/**
 * Mission state machine (pure data + bus events, no scene). Each mission is
 * 'available' → 'active' (step index, progress) → 'done'. Steps advance from
 * bus events (talk, miracle casts, counted events) and from a per-frame
 * position check (reach / ride). Emits:
 *   mission:accepted, mission:step, mission:progress, mission:done
 *
 * The `world` adapter answers questions the data can't: where is an NPC or a
 * ride, is the player riding, is he on the water.
 */
export class MissionManager {
  constructor(bus, world) {
    this.bus = bus;
    this.world = world;
    this.defs = MISSIONS;
    this.byId = new Map(MISSIONS.map((m) => [m.id, m]));
    this.reset();
    this.bindEvents();
  }

  reset(saved = null) {
    this.state = {};
    for (const m of this.defs) this.state[m.id] = { status: 'available', step: 0, progress: 0 };
    this.tracked = null;
    if (saved && typeof saved === 'object') {
      for (const [id, s] of Object.entries(saved.missions || saved)) {
        const def = this.byId.get(id);
        if (!def || !s || typeof s !== 'object') continue;
        const status = ['available', 'active', 'done'].includes(s.status) ? s.status : 'available';
        const step = Math.max(0, Math.min(def.steps.length - 1, Math.floor(Number(s.step) || 0)));
        this.state[id] = { status, step, progress: Math.max(0, Math.floor(Number(s.progress) || 0)) };
      }
      if (saved.tracked && this.state[saved.tracked]?.status === 'active') this.tracked = saved.tracked;
    }
    if (!this.tracked) this.tracked = this.active()[0]?.id ?? null;
  }

  serialize() {
    return { missions: JSON.parse(JSON.stringify(this.state)), tracked: this.tracked };
  }

  active() {
    return this.defs.filter((m) => this.state[m.id].status === 'active');
  }

  done() {
    return this.defs.filter((m) => this.state[m.id].status === 'done');
  }

  isAvailable(id) {
    return this.state[id]?.status === 'available';
  }

  step(id) {
    const def = this.byId.get(id);
    const s = this.state[id];
    return def && s?.status === 'active' ? def.steps[s.step] : null;
  }

  accept(id) {
    const def = this.byId.get(id);
    if (!def || this.state[id].status !== 'available') return false;
    this.state[id] = { status: 'active', step: 0, progress: 0 };
    this.tracked = id;
    this.bus.emit('mission:accepted', { missionId: id, title: def.title, onAccept: def.onAccept || null, step: def.steps[0] });
    return true;
  }

  /** The talk step / offer this NPC can give right now (for generated dialogue). */
  dialogueFor(npcId, ctx = {}) {
    const out = [];
    for (const m of this.defs) {
      const s = this.state[m.id];
      if (m.legacy) continue;
      if (s.status === 'available' && m.giver === npcId && !(m.requiresCalm && ctx.wanted)) out.push({ type: 'offer', mission: m });
      if (s.status === 'active') {
        const st = m.steps[s.step];
        if (st.kind === 'talk' && st.npc === npcId) out.push({ type: 'talk', mission: m, step: st });
      }
    }
    return out;
  }

  advance(id) {
    const def = this.byId.get(id);
    const s = this.state[id];
    if (!def || s.status !== 'active') return;
    const finished = def.steps[s.step];
    s.step += 1;
    s.progress = 0;
    if (s.step >= def.steps.length) {
      s.status = 'done';
      s.step = def.steps.length - 1;
      if (this.tracked === id) this.tracked = this.active()[0]?.id ?? null;
      this.bus.emit('mission:done', { missionId: id, title: def.title, reward: def.reward });
    } else {
      this.bus.emit('mission:step', { missionId: id, title: def.title, step: def.steps[s.step], index: s.step, finished });
    }
  }

  /** A talk-step dialogue option was chosen. */
  talked(npcId) {
    for (const m of this.active()) {
      const st = this.step(m.id);
      if (st.kind === 'talk' && st.npc === npcId) this.advance(m.id);
    }
  }

  bindEvents() {
    const bus = this.bus;
    bus.on('miracle:cast', (e) => {
      for (const m of this.active()) {
        const st = this.step(m.id);
        if (st.kind !== 'miracle' || st.miracle !== e.miracleId) continue;
        if (st.target && e.target !== st.target) continue;
        if (st.npc && !(e.npc === st.npc && e.healed !== false)) continue;
        this.advance(m.id);
      }
    });
    const counted = new Set(this.defs.flatMap((m) => m.steps.filter((s) => s.kind === 'event').map((s) => s.event)));
    for (const name of counted) {
      bus.on(name, (e) => {
        for (const m of this.active()) {
          const st = this.step(m.id);
          if (st.kind !== 'event' || st.event !== name) continue;
          if (st.filter && !this.world.matches(st.filter, e)) continue;
          const s = this.state[m.id];
          s.progress += 1;
          this.bus.emit('mission:progress', { missionId: m.id, progress: s.progress, count: st.count });
          if (s.progress >= st.count) this.advance(m.id);
        }
      });
    }
    // the legacy errand is accepted through Amos's own dialogue
    bus.on('sheep:asked', () => this.accept('mission.sheep'));
  }

  /** Position checks for reach / ride steps (call once per frame while playing). */
  update(player) {
    for (const m of this.active()) {
      const st = this.step(m.id);
      if (st.kind === 'reach') {
        const at = this.markerOf(m.id);
        if (!at) continue;
        if (Math.hypot(player.x - at.x, player.z - at.z) > st.r) continue;
        if (st.onWater && !player.onWater) continue;
        this.advance(m.id);
      } else if (st.kind === 'ride') {
        if (player.vehicle !== st.vehicle) continue;
        if (Math.hypot(player.x - st.x, player.z - st.z) <= st.r) this.advance(m.id);
      }
    }
  }

  /** Where the current step of a mission points (for the HUD and the maps). */
  markerOf(id) {
    const st = this.step(id);
    if (!st) return null;
    if (st.vehicle && st.kind === 'reach') return this.world.vehiclePos(st.vehicle);
    if (st.kind === 'talk') return this.world.npcPos(st.npc);
    if (st.npcTarget) return this.world.npcPos(st.npcTarget);
    if (st.npc) return this.world.npcPos(st.npc);
    if (st.target) return this.world.targetPos(st.target);
    if (st.x !== undefined) return { x: st.x, z: st.z };
    return null;
  }

  /** Text for the current step, with counters. */
  stepText(id) {
    const st = this.step(id);
    if (!st) return '';
    const s = this.state[id];
    return st.kind === 'event' && st.count > 1 ? `${st.text} (${s.progress}/${st.count})` : st.text;
  }

  stats() {
    return {
      tracked: this.tracked,
      active: this.active().map((m) => ({ id: m.id, step: this.state[m.id].step, progress: this.state[m.id].progress })),
      done: this.done().map((m) => m.id),
    };
  }
}
