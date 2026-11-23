import { CONFIG } from '../core/Config';
import type { SacredKind, SacredObject, VillagerData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';
import { has } from './Personality';

export const STAGE_NAMES = ['', 'Ordinary', 'Gathering place', 'Decorated', 'Shrine', 'Monument'];

export interface CreateSacred {
  kind: SacredKind;
  targetId: number;
  x: number;
  z: number;
  label: string;
  religionId?: string | null;
  sacredness: number;
  monument: string;
}

const WORK = new Set(['decorate', 'construct']);

/**
 * Sacred objects and their visible progression:
 *   1 ordinary → 2 gathering → 3 decorated → 4 shrine → 5 monument.
 * Sacredness rises with rituals, visits and miracles nearby. From stage 3,
 * villagers walk over and place decorations one at a time (1 wood each); from
 * stage 4 they build a shrine and then a monument with wood over several work
 * trips. Nothing appears instantly — construction is visible in the world.
 */
export class SacredSystem {
  private timer = 0;

  constructor(private readonly sim: Simulation) {
    sim.bus.on('TREE_BURNED', (e) => {
      const s = this.find('tree', e.treeId);
      if (s) this.damaged(s, `The sacred ${s.label} burned to a crisp.`);
    });
    sim.bus.on('BUILDING_DESTROYED', (e) => {
      const s = this.find('building', e.buildingId) ?? (e.type === 'well' ? this.find('well', e.buildingId) : undefined);
      if (s) this.damaged(s, `${s.label} was destroyed.`);
    });
  }

  find(kind: SacredKind, targetId: number): SacredObject | undefined {
    return this.sim.state.sacred.find((s) => s.kind === kind && s.targetId === targetId);
  }

  nearest(x: number, z: number, radius: number): SacredObject | undefined {
    let best: SacredObject | undefined;
    let bestD = radius;
    for (const s of this.sim.state.sacred) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** Create (or strengthen an existing) sacred object. Returns null at the cap. */
  create(o: CreateSacred): SacredObject | null {
    const sim = this.sim;
    const existing = this.find(o.kind, o.targetId);
    if (existing && o.kind !== 'ground') {
      existing.sacredness = Math.max(existing.sacredness, o.sacredness);
      if (o.religionId && !existing.religionId) existing.religionId = o.religionId;
      this.restage(existing);
      return existing;
    }
    if (sim.state.sacred.length >= CONFIG.culture.maxSacred) return null;
    const sacred: SacredObject = {
      id: `s${sim.nextId()}`,
      kind: o.kind,
      targetId: o.targetId,
      x: o.x,
      z: o.z,
      label: o.label,
      sacredness: o.sacredness,
      religionId: o.religionId ?? null,
      stage: 1,
      decorations: 0,
      shrineProgress: 0,
      monumentProgress: 0,
      monument: o.monument,
      createdAt: sim.state.time,
      visits: 0,
    };
    sim.state.sacred.push(sacred);
    this.restage(sacred, true);
    sim.bus.emit('SACRED_CREATED', { sacred });
    return sacred;
  }

  addSacredness(s: SacredObject, amount: number): void {
    // Monument-loving cultures (Rockbottom) push their sacred places further.
    const devotion = amount > 0 ? this.ownerVillage(s)?.identity?.monumentDevotion ?? 1 : 1;
    s.sacredness += amount * devotion;
    this.restage(s);
  }

  /** Stage follows sacredness, but stage 5 needs the shrine finished first. */
  private restage(s: SacredObject, silent = false): void {
    const t = CONFIG.culture.stageThresholds;
    let stage = 1 + t.filter((v) => s.sacredness >= v).length;
    if (stage >= 5 && s.shrineProgress < 1) stage = 4;
    if (stage > s.stage) {
      s.stage = stage;
      if (!silent) this.sim.bus.emit('SACRED_STAGE', { sacred: s, stage });
      if (!silent && stage === 2) this.sim.notify(`${s.label.toUpperCase()} DRAWS A CROWD`, 'culture', 'Villagers now gather here.', 1);
    }
  }

  private damaged(s: SacredObject, text: string): void {
    const sim = this.sim;
    const religion = s.religionId ? sim.state.religions.find((r) => r.id === s.religionId) : undefined;
    const mourners: VillagerData[] = [];
    for (const v of sim.state.villagers) {
      if (!v.alive) continue;
      if (religion && v.religionId === religion.id) {
        v.fear = Math.min(1, v.fear + 0.2);
        v.happiness = Math.max(0, v.happiness - 0.15);
        mourners.push(v);
      }
    }
    if (religion) religion.influence = Math.max(0, religion.influence - 0.1);
    sim.speech.react(mourners.length ? mourners : sim.memory.witnesses(s.x, s.z, 24), ['NOT THE SACRED ONE!', 'WE WILL REBUILD!', 'IS THIS A TEST?!'], 2, 2);
    sim.history.add(`The Desecration of ${s.label}`, text, { kind: 'loss', x: s.x, z: s.z });
    sim.notify('A SACRED PLACE WAS DAMAGED', 'bad', text, 2);
    sim.bus.emit('SACRED_DAMAGED', { sacred: s, reason: text });
  }

  /** Target decoration count for the current stage. */
  desiredDecorations(s: SacredObject): number {
    if (s.stage < 3) return 0;
    return Math.min(CONFIG.culture.maxDecorations, 3 + (s.stage - 3) * 2 + Math.floor(s.visits / 6));
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1;
    const sim = this.sim;
    const state = sim.state;
    // Keep positions synced with moving targets (walking rocks).
    for (const s of state.sacred) {
      if (s.kind === 'rock') {
        const rock = state.rocks[s.targetId];
        if (rock) {
          s.x = rock.x;
          s.z = rock.z;
          if (rock.crowned) rock.hatTier = Math.min(3, Math.floor(s.sacredness / 3));
        }
      }
      if (!s.religionId) s.sacredness = Math.max(0, s.sacredness - 0.0008);
      this.restage(s);
    }
    this.assignWork();
  }

  /** The village a sacred place belongs to (nearest village). */
  ownerVillage(s: SacredObject) {
    return this.sim.nearestVillage(s.x, s.z).village;
  }

  private workersOn(index: number): number {
    let n = 0;
    for (const v of this.sim.state.villagers) {
      if (v.alive && WORK.has(v.currentTask.activity) && v.currentTask.targetId === index) n++;
    }
    return n;
  }

  private totalWorkers(): number {
    let n = 0;
    for (const v of this.sim.state.villagers) if (v.alive && WORK.has(v.currentTask.activity)) n++;
    return n;
  }

  private needsWork(s: SacredObject): 'decorate' | 'construct' | null {
    const v = this.ownerVillage(s);
    const wood = v?.wood ?? 0;
    const stone = v?.stone ?? 0;
    // Stone substitutes for wood in construction (Rockbottom builds mostly in stone).
    if (s.stage >= 4 && s.shrineProgress < 1 && (wood >= 3 || stone >= 2)) return 'construct';
    if (s.stage >= 5 && s.monumentProgress < 1 && (wood >= 4 || stone >= 3)) return 'construct';
    if (s.decorations < this.desiredDecorations(s) && wood >= 1) return 'decorate';
    return null;
  }

  private assignWork(): void {
    const sim = this.sim;
    if (sim.isNight) return;
    let budget = 4 - this.totalWorkers();
    sim.state.sacred.forEach((s, index) => {
      if (budget <= 0) return;
      const job = this.needsWork(s);
      if (!job) return;
      const max = job === 'construct' ? 3 : 1;
      let current = this.workersOn(index);
      while (current < max && budget > 0) {
        const v = this.pickWorker(s);
        if (!v) return;
        const a = sim.rng.range(0, Math.PI * 2);
        const r = job === 'construct' ? 2.8 : 2;
        sim.ai.assign(sim, v, 'WORKING', job, s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, index, job === 'construct' ? 7 : 4.5);
        current++;
        budget--;
      }
    });
  }

  private pickWorker(s: SacredObject): VillagerData | undefined {
    let best: VillagerData | undefined;
    let bestScore = 0;
    for (const v of this.sim.state.villagers) {
      if (!v.alive || v.age < 12) continue;
      const t = v.currentTask;
      if (!(t.state === 'IDLE' || t.state === 'WANDERING' || (t.state === 'WORKING' && t.activity !== 'farm'))) continue;
      if (WORK.has(t.activity)) continue;
      if (v.hunger > 0.6 || v.thirst > 0.6) continue;
      let score = 0.2;
      if (s.religionId && v.religionId === s.religionId) score += 1;
      if (has(v, 'ambitious')) score += 0.6;
      if (has(v, 'devout')) score += 0.3;
      if (v.job === 'builder') score += 0.5;
      if (has(v, 'lazy')) score -= 0.5;
      const d = Math.hypot(v.position.x - s.x, v.position.z - s.z);
      score -= d / 80;
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }
    return best;
  }

  /** Called by the villager AI when a decorate/construct trip finishes. */
  onWorkDone(v: VillagerData, activity: string, index: number | null): void {
    const sim = this.sim;
    if (index === null) return;
    const s = sim.state.sacred[index];
    if (!s) return;
    const village = this.ownerVillage(s) ?? sim.village(v.villageId);
    if (!village) return;
    const productivity = sim.state.culture.upsideDownUntil > sim.state.time ? 0.65 : 1;
    if (activity === 'decorate') {
      if (village.wood < 1 || s.decorations >= this.desiredDecorations(s)) return;
      village.wood -= 1;
      s.decorations++;
      s.sacredness += 0.08;
      if (s.decorations === 1) sim.speech.say(v, s.kind === 'rock' ? 'A FLAG FOR HIS MAJESTY!' : 'IT NEEDS RIBBONS.', 1);
      return;
    }
    if (activity === 'construct') {
      if (s.shrineProgress < 1) {
        if (village.stone >= 2) village.stone -= 2;
        else if (village.wood >= 3) village.wood -= 3;
        else return;
        s.shrineProgress = Math.min(1, s.shrineProgress + 0.25 * productivity);
        if (s.shrineProgress >= 1) {
          sim.history.add(`A Shrine for ${s.label}`, 'The villagers built a small shrine. It leans slightly. This is considered holy.', { kind: 'build', x: s.x, z: s.z });
          sim.notify('A SHRINE WAS BUILT', 'culture', `${s.label} now has its own shrine.`, 2);
          this.restage(s);
        }
      } else if (s.stage >= 5 && s.monumentProgress < 1) {
        if (village.stone >= 3) village.stone -= 3;
        else if (village.wood >= 4) village.wood -= 4;
        else return;
        s.monumentProgress = Math.min(1, s.monumentProgress + 0.17 * productivity);
        if (s.monumentProgress >= 1) {
          sim.history.add(`The Monument to ${s.label}`, MONUMENT_TEXT[s.monument] ?? 'An enormous tribute now stands here. Nobody remembers voting for it.', { kind: 'monument', x: s.x, z: s.z });
          sim.notify('A MONUMENT RISES', 'culture', `${s.label} is now officially a landmark.`, 3);
          sim.godMessage('THE ISLAND IS BECOMING A MUSEUM OF YOUR MISTAKES.', 1);
          sim.bus.emit('MONUMENT_COMPLETED', { sacredId: s.id, label: s.label, x: s.x, z: s.z });
        }
      }
    }
  }
}

const MONUMENT_TEXT: Record<string, string> = {
  'crown-statue': 'A stone crown the size of a cart. The rock seems pleased. Probably.',
  'giant-potato': 'A wooden potato taller than two villagers. Offerings are left daily. They are potatoes.',
  'cloud-effigy': 'A cloud carved from wood, so it can be judged forever.',
  'sock-totem': 'A totem of stacked socks. It is still damp.',
  'memorial-garden': 'A ring of flowers where the ashes were. It smells of hope and smoke.',
  'golden-shrine': 'A gilded obelisk. The tree insisted.',
  'out-of-office': 'A large sign reading OUT OF OFFICE. It is addressed to you.',
  obelisk: 'A tall stone with carvings of the event. Some carvings are just faces.',
};
