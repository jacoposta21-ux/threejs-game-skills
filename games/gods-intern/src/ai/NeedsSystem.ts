import { CONFIG } from '../core/Config';
import type { VillagerData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';
import { fearScale } from '../culture/Personality';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Per-villager needs and wellbeing: hunger/thirst growth, health loss from
 * deprivation or burns, fear from nearby fire, and happiness drifting toward a
 * target derived from real conditions (needs, fear, greenery, flooding).
 */
export class NeedsSystem {
  private readonly near: VillagerData[] = [];

  update(sim: Simulation, dt: number): void {
    const s = sim.state;
    const cfg = CONFIG.villager;

    // Fear and burns around active fires (grid query per fire, not all-pairs).
    for (const fire of s.fires) {
      sim.villagersNear(fire.x, fire.z, cfg.fireFearRadius, this.near);
      for (const v of this.near) {
        const d = Math.hypot(v.position.x - fire.x, v.position.z - fire.z);
        v.fear = clamp01(v.fear + 0.09 * fearScale(v) * fire.intensity * (1 - d / cfg.fireFearRadius) * dt);
        if (d < 1.6) {
          v.health -= 0.2 * fire.intensity * dt;
          if (v.health <= 0) sim.ai.kill(sim, v, 'fire', fire.byPlayer);
        }
      }
    }

    for (const v of s.villagers) {
      if (!v.alive) continue;
      const village = sim.village(v.villageId);
      const resting = v.currentTask.state === 'RESTING' && v.currentTask.arrived;
      const picnicking = v.currentTask.activity === 'picnic';
      const rate = resting ? 0.45 : picnicking ? 1.35 : 1; // picnics are mostly snacking
      v.hunger = clamp01(v.hunger + cfg.hungerPerSec * rate * dt);
      v.thirst = clamp01(v.thirst + cfg.thirstPerSec * rate * dt);
      v.age += dt / CONFIG.time.dayLength;

      if (v.hunger > 0.92 || v.thirst > 0.92) {
        v.health -= cfg.starveDamagePerSec * dt;
        if (v.health <= 0) {
          sim.ai.kill(sim, v, v.thirst > v.hunger ? 'thirst' : 'starvation', false);
          continue;
        }
      } else if (v.health < 1) {
        v.health = Math.min(1, v.health + 0.004 * dt);
      }

      v.fear = Math.max(0, v.fear - cfg.fearDecayPerSec * dt);

      const greenery = village ? Math.min(1, village.treesNearby / 40) * 0.14 : 0;
      const flood = village ? Math.min(1, village.flood) * 0.25 : 0;
      const celebrating = v.currentTask.state === 'CELEBRATING' ? 0.15 : 0;
      const target = clamp01(0.68 - v.hunger * 0.35 - v.thirst * 0.35 - v.fear * 0.45 + greenery - flood + celebrating + (v.health - 1) * 0.3);
      v.happiness += (target - v.happiness) * Math.min(1, 0.03 * dt);

      // Faith slowly relaxes toward the village mood baseline.
      const faithBase = 0.35 + (village ? village.happiness * 0.2 : 0);
      v.faith += (faithBase - v.faith) * 0.0015 * dt;
    }
  }
}
