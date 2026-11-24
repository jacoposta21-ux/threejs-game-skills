import { CONFIG } from '../core/Config';
import type { VillagerData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';

/** Village improvements unlocked by real progress, each a visible change in the world. */
const IMPROVEMENTS: Array<{ id: string; title: string; text: string; ready: (sim: Simulation) => boolean }> = [
  {
    id: 'gardens',
    title: 'Puddleton Planted Gardens',
    text: 'Small vegetable gardens appeared beside the houses. Two are mostly decorative rocks.',
    ready: (sim) => sim.state.villages[0].happiness > 0.66 && sim.state.time > 200,
  },
  {
    id: 'lanterns',
    title: 'Lanterns Along the Paths',
    text: 'Someone decided the night should be less dark. Lanterns now line the paths.',
    ready: (sim) => sim.day >= 2,
  },
  {
    id: 'market',
    title: 'Puddleton Opened a Market',
    text: 'A market stall opened near the storehouse. It sells one turnip at a time.',
    ready: (sim) => sim.state.stats.prayersAnswered >= 2 && sim.state.villages[0].prosperity > 0.5,
  },
  {
    id: 'shrine-expansion',
    title: 'The Shrine Was Expanded',
    text: 'Faith is up, so the shrine got a second ring of pillars and a slightly bigger halo.',
    ready: (sim) => sim.state.religions.some((r) => r.active) || sim.state.villages[0].faith > 0.62,
  },
];

/**
 * Orchestrates the v0.2 culture layer each simulation step: memory decay,
 * religions and rituals, sacred progression, walking rocks, prosperity timers,
 * the Department of Miracles construction, village improvements, and the
 * Chaos-gated Mutation unlock.
 */
export class CultureSystem {
  private slowTimer = 0;

  constructor(private readonly sim: Simulation) {}

  update(dt: number): void {
    const sim = this.sim;
    sim.memory.update(dt);
    sim.religion.update(dt);
    sim.sacredSys.update(dt);
    this.moveRocks(dt);
    this.slowTimer -= dt;
    if (this.slowTimer > 0) return;
    this.slowTimer = 1;
    const s = sim.state;
    const c = s.culture;
    // v0.4: any thriving village can drift into an Eternal Picnic, not just Puddleton.
    const prosperous = s.villages.some((v) => v.prosperity > 0.58 && v.happiness > 0.6 && v.food > 80);
    c.prosperityTime = prosperous ? c.prosperityTime + 1 : Math.max(0, c.prosperityTime - 2);
    for (const imp of IMPROVEMENTS) {
      if (c.improvements.includes(imp.id) || !imp.ready(sim)) continue;
      c.improvements.push(imp.id);
      sim.history.add(imp.title, imp.text, { kind: 'build' });
      sim.notify(imp.title.toUpperCase(), 'info', imp.text, 0);
    }
    if (c.officeBuilt && c.officeProgress < 1) this.assignOfficeWork();
    if (c.officeBuilt && c.officeProgress >= 1) this.queueAtOffice();
    if (s.tutorial.done && s.chaos >= CONFIG.powers.mutation.unlockChaos && !s.unlockedPowers.includes('mutation')) {
      sim.powers.unlock(['mutation']);
      if (!c.mutationUnlockedNotified) {
        c.mutationUnlockedNotified = true;
        sim.notify('MUTATION UNLOCKED', 'chaos', 'Your Chaos Reputation earned a new power. Press 5. Please be weird responsibly.', 3);
        sim.history.add('The Intern Discovered Mutation', 'Chaos reached a level where reality started taking suggestions.', { kind: 'mutation' });
        sim.godMessage('WHO GAVE THE INTERN MUTATION PRIVILEGES?', 3);
      }
    }
  }

  /** Walking rocks wander slowly near their home, never into water. */
  private moveRocks(dt: number): void {
    const sim = this.sim;
    for (const r of sim.state.rocks) {
      if (!r.walking) continue;
      const dx = r.targetX - r.x;
      const dz = r.targetZ - r.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        const village = sim.state.villages[0];
        for (let i = 0; i < 8; i++) {
          const a = sim.rng.range(0, Math.PI * 2);
          const len = sim.rng.range(4, 10);
          let tx = r.x + Math.cos(a) * len;
          let tz = r.z + Math.sin(a) * len;
          // Stay within a friendly distance of the village.
          if (village && Math.hypot(tx - village.centerX, tz - village.centerZ) > 42) {
            tx = r.x + (village.centerX - r.x) * 0.3;
            tz = r.z + (village.centerZ - r.z) * 0.3;
          }
          if (sim.pathfinding.isWalkable(tx, tz) && !sim.buildingAt(tx, tz, 1)) {
            r.targetX = tx;
            r.targetZ = tz;
            break;
          }
        }
        continue;
      }
      const step = Math.min(d, CONFIG.culture.rockWalkSpeed * dt);
      const nx = r.x + (dx / d) * step;
      const nz = r.z + (dz / d) * step;
      if (!sim.terrain.isLand(nx, nz) || sim.buildingAt(nx, nz, 0.5)) {
        r.targetX = r.x;
        r.targetZ = r.z;
        continue;
      }
      r.x = nx;
      r.z = nz;
      r.heading = Math.atan2(dx, dz);
    }
  }

  /** Builders put up the Department of Miracles office over a few trips. */
  private assignOfficeWork(): void {
    const sim = this.sim;
    if (sim.isNight) return;
    const busy = sim.state.villagers.filter((v) => v.alive && v.currentTask.activity === 'construct-office').length;
    if (busy >= 2) return;
    const site = officeSite(sim);
    const home = sim.state.culture.officeVillageId ?? sim.state.villages[0].id;
    const worker = sim.state.villagers.find(
      (v) => v.alive && v.villageId === home && !v.travel && v.age >= 12 && (v.job === 'builder' || v.traits.includes('ambitious')) && (v.currentTask.state === 'IDLE' || v.currentTask.state === 'WANDERING') && v.hunger < 0.6 && v.thirst < 0.6,
    );
    if (worker) sim.ai.assign(sim, worker, 'WORKING', 'construct-office', site.x + sim.rng.range(-2, 2), site.z + 2.5, null, 6);
  }

  /** With prayers pending, a few villagers stand in line at the Department of Miracles. */
  private queueAtOffice(): void {
    const sim = this.sim;
    if (sim.isNight || !sim.state.prayers.some((p) => p.status === 'active')) return;
    const inLine = sim.state.villagers.filter((v) => v.alive && v.currentTask.activity === 'queue').length;
    if (inLine >= 3) return;
    const home = sim.state.culture.officeVillageId ?? sim.state.villages[0].id;
    const v = sim.state.villagers.find((p) => p.alive && p.villageId === home && !p.travel && p.age >= 12 && p.currentTask.state === 'IDLE' && p.currentTask.activity === '' && p.hunger < 0.6 && p.thirst < 0.6);
    if (!v) return;
    const site = officeSite(sim);
    sim.ai.assign(sim, v, 'IDLE', 'queue', site.x - 1.2 - inLine * 1.1, site.z + 2.6, null, 14, site.x, site.z);
  }

  onOfficeWork(v: VillagerData): void {
    const sim = this.sim;
    const c = sim.state.culture;
    const village = sim.village(v.villageId);
    if (!village || c.officeProgress >= 1) return;
    const wood = Math.min(2, village.wood);
    village.wood -= wood;
    c.officeProgress = Math.min(1, c.officeProgress + (wood >= 2 ? 0.25 : 0.1));
    if (c.officeProgress >= 1) {
      const site = officeSite(sim);
      sim.history.add('The Department of Miracles Opened', 'A tiny office with a very large stamp. Opening hours: whenever God is not looking.', { kind: 'build', x: site.x, z: site.z });
      sim.notify('THE OFFICE IS OPEN', 'culture', 'Prayer forms can now be submitted in triplicate.', 1);
    }
  }
}

export function officeSite(sim: Simulation): { x: number; z: number } {
  const v = sim.village(sim.state.culture.officeVillageId ?? '') ?? sim.state.villages[0];
  return { x: v.centerX + 17, z: v.centerZ + 4 };
}
