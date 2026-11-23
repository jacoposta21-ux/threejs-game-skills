import type { PrayerData, VillageData, VillagerData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';
import type { MissionDefinition } from './MissionDefinitions';

/** Builds prayer records and picks the villager who carries the prayer to the shrine. */
export class PrayerGenerator {
  private counter = 0;

  create(sim: Simulation, def: MissionDefinition, village: VillageData): PrayerData {
    this.counter = Math.max(this.counter, sim.state.prayers.length) + 1;
    const prayer: PrayerData = {
      id: `prayer-${sim.nextId()}`,
      title: def.title,
      description: def.description,
      objective: def.objective,
      villageId: village.id,
      type: def.type,
      priority: def.priority,
      status: 'active',
      createdAt: sim.state.time,
      expiresAt: sim.state.time + def.expiry,
      reward: def.reward.energy,
      progress: 0,
      targetX: village.centerX,
      targetZ: village.centerZ,
      data: { approvalReward: def.reward.approval },
    };
    def.init?.(sim, village, prayer);
    // The Department of Miracles: everything now comes with forms.
    if (sim.state.culture.officeBuilt && sim.state.culture.officeProgress >= 1) {
      const form = 10 + (sim.state.nextId % 89);
      prayer.title = `Form ${form}-B: ${prayer.title}`;
      prayer.description = `${prayer.description} (Submitted in triplicate.)`;
      prayer.reward = Math.round(prayer.reward * 1.2);
      if (prayer.expiresAt !== undefined) prayer.expiresAt += 30;
    }
    return prayer;
  }

  /** The most faithful available villager walks to the shrine and pleads. */
  pickMessenger(sim: Simulation, village: VillageData): VillagerData | null {
    let best: VillagerData | null = null;
    for (const v of sim.state.villagers) {
      if (!v.alive || v.villageId !== village.id || v.age < 10 || v.travel) continue;
      const st = v.currentTask.state;
      if (st === 'FLEEING' || st === 'PRAYING' || (st === 'RESTING' && v.currentTask.arrived)) continue;
      if (!best || v.faith > best.faith) best = v;
    }
    return best;
  }
}
