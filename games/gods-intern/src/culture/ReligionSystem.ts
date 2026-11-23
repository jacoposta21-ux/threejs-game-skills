import { CONFIG } from '../core/Config';
import { Rng } from '../core/Rng';
import type { DivineMemory, Religion, RitualDefinition, SacredKind, SacredObject, VillagerData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';
import { ARCHETYPE_OF, ARCHETYPES, DISAGREEMENTS, ORGS, RELIGION_COLORS } from './Archetypes';
import { conversionWeight, has, leaderScore } from './Personality';

export interface FoundOptions {
  memory?: DivineMemory;
  x: number;
  z: number;
  sacredKind?: SacredKind;
  targetId?: number;
  label?: string;
  sacredness?: number;
  /** Extra candidate followers when the founding event had few witnesses. */
  recruitFromVillage?: boolean;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Procedural religions that emerge from witnessed events.
 *
 * Each stored memory adds belief pressure to its archetype, weighted by how
 * many witnesses saw it and how impressionable they are. A religion forms only
 * when pressure crosses the threshold, enough villagers witnessed the latest
 * event, no active belief of that archetype exists, and the global founding
 * cooldown has elapsed. Active religions are capped; the weakest is retired
 * when a new one needs room. Followers hold a daily ritual at the sacred site,
 * recruit others, argue with rival believers, and drift away when ignored.
 */
export class ReligionSystem {
  private timer = 0;
  private spreadTimer = 20;
  private argueTimer = 60;

  constructor(private readonly sim: Simulation) {
    sim.bus.on('MEMORY_CREATED', ({ memory }) => this.onMemory(memory));
    sim.bus.on('PRAYER_FAILED', () => sim.state.culture.ignoredStreak++);
    sim.bus.on('PRAYER_COMPLETED', () => (sim.state.culture.ignoredStreak = 0));
  }

  get active(): Religion[] {
    return this.sim.state.religions.filter((r) => r.active);
  }

  byArchetype(archetype: string): Religion | undefined {
    return this.active.find((r) => r.archetype === archetype);
  }

  private onMemory(memory: DivineMemory): void {
    const sim = this.sim;
    const archetype = ARCHETYPE_OF[memory.eventType];
    if (!archetype) return;
    const witnesses = memory.witnessIds.map((id) => sim.villager(id)).filter((v): v is VillagerData => !!v);
    const weight = witnesses.length ? witnesses.reduce((a, v) => a + conversionWeight(v), 0) / witnesses.length : 0;
    const existing = this.byArchetype(archetype);
    if (existing) {
      // An existing belief absorbs the event: more influence, more converts.
      existing.influence = Math.min(1, existing.influence + 0.05 * memory.emotionalImpact);
      for (const v of witnesses) if (!v.religionId && sim.rng.next() < 0.25 * conversionWeight(v) * sim.civ.conversionFactor(v, existing)) this.convert(v, existing, true, 'shared miracle');
      const sacred = existing.sacredEntityId ? sim.state.sacred.find((s) => s.id === existing.sacredEntityId) : undefined;
      if (sacred && Math.hypot(sacred.x - memory.position.x, sacred.z - memory.position.z) < 12) sim.sacredSys.addSacredness(sacred, 0.6);
      return;
    }
    const c = sim.state.culture;
    // Belief needs repetition: one event can never found a faith on its own (witness factor caps at 1.5).
    c.pressure[archetype] = (c.pressure[archetype] ?? 0) + memory.emotionalImpact * Math.min(1.5, witnesses.length / 4) * weight;
    if (
      sim.state.tutorial.done &&
      c.pressure[archetype] >= CONFIG.culture.religionThreshold &&
      witnesses.length >= CONFIG.culture.religionMinWitnesses &&
      sim.state.time - c.lastReligionAt >= CONFIG.culture.religionCooldown
    ) {
      // Tie the sacred place to the entity involved (the struck rock, the surviving tree…).
      const [kind, rawId] = (memory.targetEntityId ?? '').split(':');
      const targeted = (kind === 'rock' || kind === 'tree' || kind === 'building') && rawId !== undefined;
      this.found(archetype, {
        memory,
        x: memory.position.x,
        z: memory.position.z,
        sacredKind: targeted ? (kind as SacredKind) : undefined,
        targetId: targeted ? Number(rawId) : undefined,
      });
    }
  }

  /** Deterministic, readable, event-connected name. Never repeats an existing one. */
  generateName(archetype: string, seed: string): string {
    const a = ARCHETYPES[archetype];
    const rng = new Rng(hashString(seed));
    const used = new Set(this.sim.state.religions.map((r) => r.name));
    for (let i = 0; i < 16; i++) {
      const name = `${ORGS[Math.floor(rng.next() * ORGS.length)]} ${a.nouns[Math.floor(rng.next() * a.nouns.length)]}`;
      if (!used.has(name)) return name;
    }
    return `${ORGS[0]} ${a.nouns[0]} (Reformed)`;
  }

  /**
   * Found a religion of an archetype, or return the existing active one.
   * Respects the active-religion cap by retiring the weakest belief.
   */
  found(archetype: string, o: FoundOptions): Religion | null {
    const sim = this.sim;
    const a = ARCHETYPES[archetype];
    if (!a) return null;
    const existing = this.byArchetype(archetype);
    if (existing) return existing;
    const active = this.active;
    if (active.length >= CONFIG.culture.maxReligions) {
      const weakest = [...active].sort((x, y) => x.influence - y.influence)[0];
      this.retire(weakest, `merged into the newer, louder faith`);
    }
    const c = sim.state.culture;
    const id = `r${sim.nextId()}`;
    const seed = `${archetype}:${o.memory?.id ?? id}:${sim.state.seed}`;
    const rng = new Rng(hashString(seed));
    const color = RELIGION_COLORS[sim.state.religions.length % RELIGION_COLORS.length];
    const doctrine = [...a.doctrine].sort(() => rng.next() - 0.5).slice(0, 3);
    const ritual: RitualDefinition = {
      id: `${id}-ritual`,
      name: a.ritual.name,
      kind: a.ritual.kind,
      timeOfDay: a.ritual.timeOfDay,
      duration: a.ritual.duration,
      lastPerformedDay: sim.day, // first ritual tomorrow (or via ritualNow for tests)
      activeUntil: 0,
      x: o.x,
      z: o.z,
    };
    const religion: Religion = {
      id,
      name: this.generateName(archetype, seed),
      archetype,
      originEventId: o.memory?.id ?? '',
      sacredLocation: { x: o.x, y: sim.terrain.heightAt(o.x, o.z), z: o.z },
      followers: [],
      doctrine,
      rituals: [ritual],
      symbols: [...a.symbols],
      influence: 0,
      createdAt: sim.state.time,
      color,
      leaderId: null,
      villageId: sim.nearestVillage(o.x, o.z).village?.id ?? 'v1',
      active: true,
    };
    if (o.memory) o.memory.permanent = true;
    sim.state.religions.push(religion);

    // Sacred place.
    const sacred = sim.sacredSys.create({
      kind: o.sacredKind ?? a.sacredKind,
      targetId: o.targetId ?? -1,
      x: o.x,
      z: o.z,
      label: o.label ?? a.nouns[0].replace(/^the /, 'The '),
      religionId: id,
      sacredness: o.sacredness ?? 1.2,
      monument: a.monument,
    });
    if (sacred) {
      sacred.religionId = id;
      religion.sacredEntityId = sacred.id;
    }

    // Founding followers: witnesses first, weighted by personality.
    const witnesses = (o.memory?.witnessIds ?? []).map((wid) => sim.villager(wid)).filter((v): v is VillagerData => !!v && v.alive);
    // v0.3: a faith is born in one village; extra recruits come from that village only.
    const pool = witnesses.length >= 2 || !o.recruitFromVillage ? witnesses : sim.state.villagers.filter((v) => v.alive && v.villageId === religion.villageId);
    const ranked = [...pool].sort((x, y) => conversionWeight(y) + y.faith - (conversionWeight(x) + x.faith));
    for (const v of ranked) {
      if (v.religionId && v.religionId !== id) continue;
      if (religion.followers.length < 2 || rng.next() < 0.45 * conversionWeight(v)) this.convert(v, religion, false);
    }
    this.pickLeader(religion);
    this.refreshInfluence(religion);

    c.lastReligionAt = sim.state.time;
    c.pressure[archetype] = 0;
    sim.addChaos(6, 'Founded a religion by accident');
    sim.history.add(`${religion.name} Was Founded`, `${religion.doctrine[0]} Followers: ${religion.followers.length}.`, { kind: 'religion', x: o.x, z: o.z, villageId: religion.villageId });
    sim.notify('A NEW RELIGION!', 'culture', religion.name, 3);
    const leader = religion.leaderId ? sim.villager(religion.leaderId) : undefined;
    sim.speech.say(leader, a.shouts[0], 3, 4);
    if (this.active.length >= 3) sim.godMessage('YOU HAVE CREATED THREE RELIGIONS AND ZERO SOLUTIONS.', 2);
    else sim.godMessage('PLEASE STOP INVENTING RELIGIONS.', 1);
    sim.bus.emit('RELIGION_FOUNDED', { religion });
    return religion;
  }

  convert(v: VillagerData, religion: Religion, announce = true, via = 'word of mouth'): void {
    if (!v.alive || v.religionId === religion.id) return;
    // v0.3: the first believer in a new village is a cross-village spread.
    const sim = this.sim;
    const elsewhere = religion.followers.some((id) => sim.villager(id)?.alive);
    const present = religion.followers.some((id) => sim.villager(id)?.alive && sim.villager(id)?.villageId === v.villageId);
    if (v.religionId) {
      const old = this.sim.state.religions.find((r) => r.id === v.religionId);
      if (old) old.followers = old.followers.filter((id) => id !== v.id);
    }
    v.religionId = religion.id;
    religion.followers.push(v.id);
    v.faith = Math.min(1, v.faith + 0.08);
    if (announce) this.sim.bus.emit('CONVERSION', { villagerId: v.id, religionId: religion.id });
    const village = sim.village(v.villageId);
    if (announce && elsewhere && !present && village && religion.active) sim.civ.announceSpread(religion, village, via);
  }

  private pickLeader(r: Religion): void {
    const sim = this.sim;
    let best: VillagerData | undefined;
    for (const id of r.followers) {
      const v = sim.villager(id);
      if (v && v.alive && (!best || leaderScore(v) > leaderScore(best))) best = v;
    }
    if (!best) return;
    if (r.leaderId && r.leaderId !== best.id) {
      const old = sim.villager(r.leaderId);
      if (old && old.alive) return; // leaders keep their post while alive
    }
    if (r.leaderId !== best.id) {
      r.leaderId = best.id;
      const noun = ARCHETYPES[r.archetype].nouns[0].replace(/^the /, 'the ');
      best.title = best.mutation === 'giant-head' ? `Big-Headed Oracle of ${noun}` : `Prophet of ${noun}`;
    }
  }

  private refreshInfluence(r: Religion): void {
    const pop = this.sim.state.villagers.filter((v) => v.alive).length || 1;
    const target = Math.min(1, r.followers.length / pop + 0.1);
    r.influence += (target - r.influence) * 0.2;
  }

  retire(r: Religion, reason: string): void {
    const sim = this.sim;
    r.active = false;
    for (const id of r.followers) {
      const v = sim.villager(id);
      if (v && v.religionId === r.id) {
        v.religionId = null;
        if (v.title?.startsWith('Prophet') || v.title?.includes('Oracle')) v.title = null;
      }
    }
    r.followers = [];
    for (const s of sim.state.sacred) if (s.religionId === r.id) s.religionId = null; // cultural memory remains
    sim.history.add(`${r.name} Faded`, `The faith ${reason}. Its shrine remains, mostly as a place to sit.`, { kind: 'religion' });
    sim.bus.emit('RELIGION_FADED', { religion: r, reason });
  }

  // ------------------------------------------------------------- rituals

  /** Start a religion's ritual immediately (also used by tests and decrees). */
  startRitual(r: Religion, ritual: RitualDefinition): number {
    const sim = this.sim;
    const sacred = r.sacredEntityId ? sim.state.sacred.find((s) => s.id === r.sacredEntityId) : undefined;
    const x = sacred?.x ?? r.sacredLocation.x;
    const z = sacred?.z ?? r.sacredLocation.z;
    ritual.x = x;
    ritual.z = z;
    ritual.lastPerformedDay = sim.day;
    const attendees = r.followers
      .map((id) => sim.villager(id))
      .filter((v): v is VillagerData => {
        if (!v || !v.alive) return false;
        const st = v.currentTask.state;
        if (st === 'FLEEING' || (st === 'RESTING' && v.currentTask.arrived)) return false;
        if (v.hunger > 0.8 || v.thirst > 0.8) return false;
        if (has(v, 'rebellious') && sim.rng.next() < 0.3) return false;
        return true;
      });
    if (!attendees.length) return 0;
    ritual.activeUntil = sim.state.time + ritual.duration;
    attendees.forEach((v, i) => sim.ai.attendRitual(sim, v, ritual, x, z, i, attendees.length));
    if (sacred) sacred.visits += attendees.length;
    sim.bus.emit('RITUAL_STARTED', { religionId: r.id, ritual, x, z, attendees: attendees.length });
    const leader = r.leaderId ? sim.villager(r.leaderId) : attendees[0];
    sim.speech.say(leader, RITUAL_CALLS[ritual.kind], 2, 3.5);
    return attendees.length;
  }

  private finishRitual(r: Religion, ritual: RitualDefinition): void {
    const sim = this.sim;
    ritual.activeUntil = 0;
    const attendees = sim.state.villagers.filter((v) => v.alive && v.currentTask.activity === 'ritual' && v.religionId === r.id).length || 1;
    const sacred = r.sacredEntityId ? sim.state.sacred.find((s) => s.id === r.sacredEntityId) : undefined;
    if (sacred) sim.sacredSys.addSacredness(sacred, 0.7 + 0.15 * attendees);
    r.influence = Math.min(1, r.influence + 0.03);
    for (const id of r.followers) {
      const v = sim.villager(id);
      if (!v) continue;
      v.happiness = Math.min(1, v.happiness + 0.04);
      v.faith = Math.min(1, v.faith + 0.03);
    }
    // Spectators may convert.
    for (const v of sim.villagersNear(ritual.x, ritual.z, 12, [])) {
      if (!v.religionId && sim.rng.next() < 0.12 * conversionWeight(v)) this.convert(v, r);
    }
    this.ritualEffect(r, ritual);
    sim.bus.emit('RITUAL_COMPLETED', { religionId: r.id, ritual, attendees });
  }

  /** Each ritual kind changes the world a little. */
  private ritualEffect(r: Religion, ritual: RitualDefinition): void {
    const sim = this.sim;
    const village = sim.village(r.villageId);
    const c = sim.state.culture;
    switch (ritual.kind) {
      case 'planting': {
        // Rebirth believers replant burned stumps near their sacred ground, or plant fresh saplings.
        let planted = 0;
        for (const t of sim.treesNear(ritual.x, ritual.z, 22, [])) {
          if (planted >= 2) break;
          if (t.charred) {
            t.charred = false;
            t.charredTime = 0;
            t.health = 1;
            t.growth = 0.1;
            t.growRate = 1 / CONFIG.trees.naturalGrowSeconds;
            planted++;
            sim.bus.emit('TREE_REGROWN', { treeId: t.id, x: t.x, z: t.z });
          }
        }
        if (!planted) sim.plantTree(ritual.x + sim.rng.range(-6, 6), ritual.z + sim.rng.range(-6, 6), false);
        break;
      }
      case 'offering':
        if (village) village.food = Math.max(0, village.food - 3); // the chosen vegetables are not eaten; others are left as offerings
        break;
      case 'dance':
        for (const v of sim.state.villagers) if (v.alive && v.villageId === r.villageId) v.happiness = Math.min(1, v.happiness + 0.03);
        break;
      case 'bonfire':
        // Fire Appreciation Society: a stray ember sometimes escapes.
        if (sim.rng.next() < 0.12) {
          const tree = sim.treesNear(ritual.x, ritual.z, 14, []).find((t) => !t.charred && !t.golden && sim.moistureAt(t.x, t.z) < 0.6);
          if (tree && sim.fire.ignite(sim, 'tree', tree.id, false)) sim.notify('A STRAY EMBER!', 'bad', 'The Bonfire Night got slightly out of hand.', 2);
        }
        break;
      case 'gathering':
        if (r.archetype === 'rock' && c.rockKingId >= 0) this.royalDecree(r);
        break;
      default:
        break;
    }
  }

  /** The Rock King issues a decree with a real, temporary effect. */
  private royalDecree(r: Religion): void {
    const sim = this.sim;
    const c = sim.state.culture;
    const kinds = ['nap-day', 'plant-trees', 'ration-water'];
    const kind = kinds[Math.floor(sim.rng.next() * kinds.length)];
    c.decree = { kind, until: sim.state.time + 120 };
    const rock = sim.state.rocks[c.rockKingId];
    const text: Record<string, string> = {
      'nap-day': 'THE ROCK SAYS: NAP.',
      'plant-trees': 'THE ROCK DEMANDS SHRUBBERY.',
      'ration-water': 'THE ROCK SAYS: DRINK LESS. IT DOES NOT DRINK AT ALL.',
    };
    const leader = r.leaderId ? sim.villager(r.leaderId) : undefined;
    sim.speech.say(leader, text[kind], 3, 4);
    sim.notify('ROYAL DECREE', 'culture', text[kind], 2);
    if (kind === 'plant-trees' && rock) {
      for (let i = 0; i < 2; i++) sim.plantTree(rock.x + sim.rng.range(-5, 5), rock.z + sim.rng.range(-5, 5), false);
    }
  }

  // ------------------------------------------------------------- tick

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1;
    const sim = this.sim;
    const s = sim.state;
    const tod = sim.timeOfDay;
    for (const r of s.religions) {
      if (!r.active) continue;
      r.followers = r.followers.filter((id) => sim.villager(id)?.alive && sim.villager(id)?.religionId === r.id);
      this.pickLeader(r);
      this.refreshInfluence(r);
      for (const ritual of r.rituals) {
        if (ritual.activeUntil > 0 && s.time >= ritual.activeUntil) this.finishRitual(r, ritual);
        else if (
          ritual.activeUntil === 0 &&
          ritual.lastPerformedDay !== sim.day &&
          tod >= ritual.timeOfDay &&
          tod < ritual.timeOfDay + 0.05 &&
          !sim.isNight &&
          !s.culture.silence
        ) {
          this.startRitual(r, ritual);
        }
      }
      // Fade forgotten faiths.
      if (s.time - r.createdAt > CONFIG.culture.religionFadeAge && (r.followers.length === 0 || r.influence < 0.04)) {
        this.retire(r, 'was quietly forgotten');
      }
    }
    if (s.culture.decree && s.culture.decree.until < s.time) s.culture.decree = null;

    this.spreadTimer -= 1;
    if (this.spreadTimer <= 0) {
      this.spreadTimer = 20;
      this.spread();
    }
    this.argueTimer -= 1;
    if (this.argueTimer <= 0) {
      this.argueTimer = 55 + sim.rng.next() * 30;
      this.argue();
    }
  }

  /** Word of mouth: a follower tries to recruit a nearby non-believer. */
  private spread(): void {
    const sim = this.sim;
    for (const r of this.active) {
      const followers = r.followers.map((id) => sim.villager(id)).filter((v): v is VillagerData => !!v);
      if (!followers.length) continue;
      const preacher = followers[Math.floor(sim.rng.next() * followers.length)];
      const target = sim.villagersNear(preacher.position.x, preacher.position.z, 7, []).find((v) => v.id !== preacher.id && v.religionId !== r.id);
      if (!target) continue;
      if (sim.rng.next() < 0.18 * conversionWeight(target) * sim.civ.conversionFactor(target, r) * (target.religionId ? 0.3 : 1)) {
        this.convert(target, r);
        sim.speech.say(preacher, `JOIN ${r.name.split(' ').slice(-2).join(' ').toUpperCase()}!`, 1);
      }
    }
  }

  /** Nonviolent theological disagreement between two villagers in public. */
  private argue(): void {
    const sim = this.sim;
    const active = this.active;
    if (!active.length) return;
    const believers = sim.state.villagers.filter((v) => v.alive && v.religionId && v.currentTask.state !== 'RESTING' && v.currentTask.state !== 'FLEEING');
    if (!believers.length) return;
    const a = believers[Math.floor(sim.rng.next() * believers.length)];
    const rivals = sim.state.villagers.filter(
      (v) => v.alive && v.id !== a.id && v.currentTask.state !== 'RESTING' && v.currentTask.state !== 'FLEEING' && !v.travel === !a.travel &&
        Math.hypot(v.position.x - a.position.x, v.position.z - a.position.z) < 30 &&
        ((v.religionId && v.religionId !== a.religionId) || (!v.religionId && (has(v, 'skeptical') || has(v, 'rebellious')))),
    );
    if (!rivals.length) return;
    const b = rivals[Math.floor(sim.rng.next() * rivals.length)];
    const pair = DISAGREEMENTS[Math.floor(sim.rng.next() * DISAGREEMENTS.length)];
    const village = sim.village(a.villageId);
    const mx = village ? village.centerX + sim.rng.range(-4, 4) : a.position.x;
    const mz = village ? village.centerZ + sim.rng.range(-4, 4) : a.position.z;
    sim.ai.argue(sim, a, b, mx, mz);
    sim.civ.onArgument(a, b);
    sim.speech.say(a, pair[0], 2, 3.5);
    sim.speech.say(b, pair[1], 2, 3.5);
    a.happiness = Math.max(0, a.happiness - 0.03);
    b.happiness = Math.max(0, b.happiness - 0.03);
    sim.state.culture.argumentUntil = sim.state.time + 8;
    if (!sim.state.history.some((h) => h.kind === 'argument')) {
      sim.history.add('The First Theological Argument', `${a.name} and ${b.name} disagreed loudly about ${pair[0].toLowerCase().replace(/!$/, '')}. Nobody won.`, { kind: 'argument', x: mx, z: mz });
    }
  }

  sacredOf(r: Religion): SacredObject | undefined {
    return r.sacredEntityId ? this.sim.state.sacred.find((s) => s.id === r.sacredEntityId) : undefined;
  }
}

const RITUAL_CALLS: Record<string, string> = {
  gathering: 'GATHER, FAITHFUL ONES!',
  procession: 'WALK WITH ME. SLOWLY.',
  offering: 'BRING THE OFFERINGS!',
  dance: 'STOMP FOR THE PUDDLES!',
  planting: 'PLANT WHERE IT HURT!',
  backwards: '!SDRAWKCAB KLAW',
  bonfire: 'LIGHT THE SAFE FIRE!',
};
