import { CONFIG } from '../core/Config';
import type { DivineMemory, VillagerData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';
import { fearScale, has } from './Personality';

export interface RecordOptions {
  impact: number;
  radius: number;
  targetEntityId?: string;
  intensity?: number;
  y?: number;
}

const INTERPRETATION: Record<string, string> = {
  'lightning-rock': 'The sky chose the rock.',
  'lightning-tree': 'The sky is angry at trees specifically.',
  'lightning-building': 'Someone up there dislikes architecture.',
  lightning: 'A loud reminder that someone is watching.',
  'tree-survived': 'The tree is protected. The tree is important.',
  'instant-tree': 'Trees now arrive on request.',
  flood: 'The water came because we asked too loudly.',
  'drought-ended': 'Our thirst was heard by a cloud.',
  regrowth: 'What burns, returns.',
  'fire-extinguished': 'Fire comes, rain goes, and everyone is fine. Mostly.',
  'survived-fire': 'I lived. Clearly I was chosen.',
  'building-destroyed': 'Our houses are offerings now, apparently.',
  'prayer-answered': 'Somebody up there reads the mail.',
  smiting: 'Never stand under a cloud with an opinion.',
  'mutation-golden-tree': 'The tree became money. Money is holy now.',
  'mutation-walking-rock': 'The rock has places to be.',
  'mutation-giant-head': 'His head knows things.',
  'crop-survived': 'The potato endures.',
};

const REACTIONS: Record<string, string[]> = {
  lightning: ['WHAT WAS THAT?!', 'I THINK GOD IS NEW.', 'WHO DID THAT?!'],
  'lightning-rock': ['THE ROCK GLOWED!', 'WHAT DID THE ROCK DO?!'],
  'lightning-tree': ['THE TREE HAS SPOKEN!', 'FIRE FROM THE SKY!'],
  'lightning-building': ['MY HOUSE!', 'THIS SEEMS ILLEGAL.'],
  flood: ['WHY IS EVERYTHING WET?', 'MY SOCKS!', 'WE ASKED FOR A LITTLE.'],
  'drought-ended': ['WATER!', 'THE SKY HEARD US!'],
  'instant-tree': ['A TREE! JUST LIKE THAT!', 'WE SHOULD BUILD A TEMPLE.'],
  regrowth: ['THE ASHES ARE GROWING!'],
  'building-destroyed': ['NOOOO!', 'THAT WAS MY HOUSE!'],
  'fire-extinguished': ['PHEW.', 'THE RAIN SAVED US!'],
  'prayer-answered': ['IT WORKED!', 'THANK YOU, SKY PERSON!'],
  smiting: ['RUN!', 'ARE WE BEING PUNISHED?!'],
  'mutation-giant-head': ['IS YOUR HEAD BIGGER?', 'HIS HEAD IS A SIGN!'],
  'mutation-golden-tree': ['THE TREE IS GOLD!', 'THIS SEEMS ILLEGAL.'],
  'mutation-walking-rock': ['THE ROCK IS WALKING!', 'WHERE IS IT GOING?!'],
};

/** Events that count toward "too many unusual interventions" (Upside-Down Day). */
const WEIRD = new Set(['lightning', 'lightning-rock', 'lightning-tree', 'lightning-building', 'flood', 'smiting', 'mutation-giant-head', 'mutation-golden-tree', 'mutation-walking-rock', 'fire-started']);

/**
 * Persistent collective memory. Significant events are recorded with the ids
 * of villagers who perceived them (spatial-grid query, alive and awake). Memory
 * intensity decays; events with enough emotional weight × witnesses become
 * permanent cultural memories. Memories feed faith, fear and belief formation.
 */
export class MemorySystem {
  private readonly near: VillagerData[] = [];
  private timer = 0;

  constructor(private readonly sim: Simulation) {
    const bus = sim.bus;
    const P = CONFIG.culture.perception;
    bus.on('LIGHTNING_STRUCK', (e) => {
      const type = e.rockIds.length ? 'lightning-rock' : e.treesIgnited ? 'lightning-tree' : e.buildingsHit ? 'lightning-building' : 'lightning';
      this.record(type, e.x, e.z, { impact: e.villagersKilled ? 0.95 : 0.75, radius: P.dramatic, targetEntityId: e.rockIds.length ? `rock:${e.rockIds[0]}` : undefined });
      if (e.villagersKilled) this.record('smiting', e.x, e.z, { impact: 0.95, radius: P.dramatic });
    });
    bus.on('FLOOD_STARTED', (e) => {
      sim.remember('flood-start');
      sim.remember('rain-damage');
      this.record('flood', e.x, e.z, { impact: 0.7, radius: P.dramatic });
    });
    bus.on('CROPS_DAMAGED', () => sim.remember('rain-damage'));
    bus.on('RAIN_STARTED', (e) => {
      const { village } = sim.nearestVillage(e.x, e.z);
      const well = village ? sim.building(village.wellId) : undefined;
      if (village && well && village.water < 25 && Math.hypot(well.x - e.x, well.z - e.z) <= e.radius) {
        this.record('drought-ended', well.x, well.z, { impact: 0.6, radius: P.notable });
      } else {
        this.react('rain', e.x, e.z, P.minor, ['IS IT RAINING ON PURPOSE?', 'NICE WEATHER FOR DUCKS.']);
      }
    });
    bus.on('TREE_PLANTED', (e) => {
      if (e.byPlayer) this.record('instant-tree', e.x, e.z, { impact: 0.35, radius: P.minor, targetEntityId: `tree:${e.treeId}` });
    });
    bus.on('TREE_REGROWN', (e) => this.record('regrowth', e.x, e.z, { impact: 0.5, radius: P.notable, targetEntityId: `tree:${e.treeId}` }));
    bus.on('BUILDING_DESTROYED', (e) => {
      const b = sim.building(e.buildingId);
      if (b) this.record('building-destroyed', b.x, b.z, { impact: 0.8, radius: P.notable, targetEntityId: `building:${b.id}` });
    });
    bus.on('FIRE_STARTED', (e) => {
      if (e.byPlayer) sim.remember('weird');
    });
    bus.on('FIRE_EXTINGUISHED', (e) => {
      if (!e.byRain) return;
      const m = this.record('fire-extinguished', e.x, e.z, { impact: 0.45, radius: P.notable, targetEntityId: e.kind === 'tree' ? `tree:${e.targetId}` : undefined });
      if (m && m.witnessIds.length >= 2) sim.remember('fire-out-witnessed');
      // Villagers who were frightened nearby remember surviving it.
      const survivors = sim.villagersNear(e.x, e.z, 16, this.near).filter((v) => v.fear > 0.3);
      if (survivors.length) this.record('survived-fire', e.x, e.z, { impact: 0.55, radius: 16 });
    });
    bus.on('PRAYER_COMPLETED', (e) => this.record('prayer-answered', e.prayer.targetX, e.prayer.targetZ, { impact: 0.4, radius: P.notable }));
    bus.on('MUTATION_APPLIED', (e) =>
      this.record(`mutation-${e.mutation.kind}`, e.x, e.z, { impact: 0.8, radius: P.notable, targetEntityId: `${e.mutation.targetKind}:${e.mutation.targetId}` }),
    );
  }

  /** Villagers who can perceive an event: alive, awake, and within radius (spatial grid). */
  witnesses(x: number, z: number, radius: number): VillagerData[] {
    return this.sim
      .villagersNear(x, z, radius, this.near)
      .filter((v) => v.alive && !(v.currentTask.state === 'RESTING' && v.currentTask.arrived));
  }

  private react(type: string, x: number, z: number, radius: number, lines: string[]): void {
    this.sim.speech.react(this.witnesses(x, z, radius), lines, 1, 0);
    void type;
  }

  record(eventType: string, x: number, z: number, opts: RecordOptions): DivineMemory | null {
    const sim = this.sim;
    const s = sim.state;
    if (WEIRD.has(eventType)) sim.remember('weird');
    const witnesses = this.witnesses(x, z, opts.radius).slice();
    // Reactions happen even for weak events.
    const lines = REACTIONS[eventType];
    if (lines && witnesses.length) sim.speech.react(witnesses, lines, eventType.startsWith('mutation') || eventType === 'lightning-rock' ? 2 : 1, 1);
    // Unobserved miracles are much weaker.
    const observed = witnesses.length > 0;
    const impact = observed ? opts.impact : opts.impact * 0.3;
    if (impact < CONFIG.culture.storeImpact) return null;
    const { village } = sim.nearestVillage(x, z);
    const memory: DivineMemory = {
      id: `m${sim.nextId()}`,
      eventType,
      timestamp: s.time,
      position: { x, y: opts.y ?? sim.terrain.heightAt(x, z), z },
      targetEntityId: opts.targetEntityId,
      witnessIds: witnesses.map((v) => v.id),
      intensity: opts.intensity ?? 1,
      emotionalImpact: impact,
      interpretation: INTERPRETATION[eventType],
      villageId: village?.id ?? 'v1',
      permanent: impact * (witnesses.length / 3) >= CONFIG.culture.permanentScore,
    };
    s.memories.push(memory);
    for (const v of witnesses) {
      v.memoryIds.push(memory.id);
      if (v.memoryIds.length > CONFIG.culture.villagerMemorySlots) v.memoryIds.shift();
      v.faith = Math.min(1, v.faith + 0.04 * impact * (has(v, 'skeptical') ? 0.4 : 1));
      if (eventType === 'smiting' || eventType === 'building-destroyed' || eventType.startsWith('lightning')) {
        v.fear = Math.min(1, v.fear + 0.15 * impact * fearScale(v));
      }
    }
    this.prune();
    sim.bus.emit('MEMORY_CREATED', { memory });
    return memory;
  }

  private prune(): void {
    const s = this.sim.state;
    if (s.memories.length <= CONFIG.culture.maxMemories) return;
    // Drop the weakest non-permanent memories that no religion depends on.
    const protectedIds = new Set(s.religions.map((r) => r.originEventId));
    const removable = s.memories
      .filter((m) => !m.permanent && !protectedIds.has(m.id))
      .sort((a, b) => a.intensity * a.emotionalImpact - b.intensity * b.emotionalImpact);
    const excess = s.memories.length - CONFIG.culture.maxMemories;
    const drop = new Set(removable.slice(0, excess).map((m) => m.id));
    if (drop.size) s.memories = s.memories.filter((m) => !drop.has(m.id));
    if (s.memories.length > CONFIG.culture.maxMemories) s.memories.splice(0, s.memories.length - CONFIG.culture.maxMemories);
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    const step = 1 - this.timer;
    this.timer = 1;
    const s = this.sim.state;
    const protectedIds = new Set(s.religions.map((r) => r.originEventId));
    let removed = false;
    for (const m of s.memories) {
      if (m.permanent) continue;
      m.intensity -= CONFIG.culture.memoryDecayPerSec * step;
      if (m.intensity <= 0.05 && !protectedIds.has(m.id)) removed = true;
    }
    if (removed) {
      const keep = s.memories.filter((m) => m.permanent || m.intensity > 0.05 || protectedIds.has(m.id));
      const keepIds = new Set(keep.map((m) => m.id));
      s.memories = keep;
      for (const v of s.villagers) v.memoryIds = v.memoryIds.filter((id) => keepIds.has(id));
    }
  }

  /** Strongest remembered intensity of an event family for one villager (drives fear/curiosity). */
  recall(v: VillagerData, prefix: string): number {
    let best = 0;
    for (const id of v.memoryIds) {
      const m = this.sim.state.memories.find((x) => x.id === id);
      if (m && m.eventType.startsWith(prefix)) best = Math.max(best, m.intensity * m.emotionalImpact);
    }
    return best;
  }

  latest(eventType: string): DivineMemory | undefined {
    const list = this.sim.state.memories;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].eventType === eventType) return list[i];
    return undefined;
  }
}
