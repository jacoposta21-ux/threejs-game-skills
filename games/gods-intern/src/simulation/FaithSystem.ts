import { CONFIG } from '../core/Config';
import type { Simulation } from './SimulationManager';

/**
 * God's Approval (helpfulness) and Chaos Reputation (unpredictability) are
 * independent meters. Event handlers here translate outcomes into both; a
 * player can hold high approval and high chaos at the same time.
 */
export class FaithSystem {
  private suffering = 0;

  attach(sim: Simulation): void {
    const bus = sim.bus;
    bus.on('PRAYER_COMPLETED', ({ prayer }) => {
      sim.addApproval(prayer.data.approvalReward ?? 8, 'Prayer answered');
      sim.state.stats.prayersAnswered++;
      const village = sim.village(prayer.villageId);
      if (village) sim.addVillageFaith(village, 0.1);
    });
    bus.on('PRAYER_FAILED', ({ prayer }) => {
      sim.addApproval(-8, 'Prayer ignored');
      sim.state.stats.prayersFailed++;
      const village = sim.village(prayer.villageId);
      if (village) {
        village.ignoredPrayers++;
        sim.addVillageFaith(village, -0.08);
      }
    });
    bus.on('VILLAGER_DIED', ({ byPlayer, cause }) => {
      sim.state.stats.villagersLost++;
      sim.addApproval(byPlayer ? -6 : -4, `Villager lost (${cause})`);
      if (byPlayer) sim.addChaos(6, 'Smote a villager');
    });
    bus.on('BUILDING_DESTROYED', () => {
      sim.addApproval(-5, 'Building destroyed');
      sim.addChaos(4, 'Property damage');
    });
    bus.on('FIRE_STARTED', ({ byPlayer }) => {
      if (byPlayer) sim.addChaos(2, 'Arson');
    });
    bus.on('FIRE_SPREAD', () => {
      if (sim.state.fires.length > 10) sim.addChaos(0.3, 'Wildfire');
    });
    bus.on('LIGHTNING_STRUCK', ({ treesIgnited, buildingsHit }) => {
      sim.addChaos(1 + treesIgnited + buildingsHit * 2, 'Lightning');
    });
    bus.on('FLOOD_STARTED', () => {
      sim.addApproval(-3, 'Flooding');
      sim.addChaos(5, 'Accidental flood');
    });
    bus.on('HARVEST', ({ amount }) => {
      if (amount > 20) sim.addApproval(0.6, 'Good harvest');
    });
    bus.on('TREE_PLANTED', ({ x, z, byPlayer }) => {
      if (!byPlayer) return;
      const { distance } = sim.nearestVillage(x, z);
      if (distance < 40) sim.addApproval(0.4, 'Greenery');
    });
    bus.on('BUILDING_REPAIRED', () => sim.addApproval(0.5, 'Village rebuilt'));
  }

  update(sim: Simulation, dt: number): void {
    const s = sim.state;
    let thriving = 0;
    let struggling = 0;
    for (const village of s.villages) {
      if (village.happiness > 0.72 && village.shortageTime === 0) thriving++;
      if (village.shortageTime > 20) struggling++;
    }
    // Small continuous drift so the meter reflects ongoing conditions.
    this.suffering += dt;
    if (this.suffering >= 1) {
      this.suffering = 0;
      if (thriving) sim.addApproval(0.05 * thriving, 'Thriving village');
      if (struggling) sim.addApproval(-0.08 * struggling, 'Preventable suffering');
      if (s.chaos > 0) s.chaos = Math.max(0, s.chaos - 0.02);
    }
    void CONFIG;
  }
}
