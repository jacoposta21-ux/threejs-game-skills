import { CONFIG } from '../core/Config';
import type { Simulation } from './SimulationManager';

/**
 * Soil moisture, flooding, rain clouds, and tree growth/regrowth.
 *
 * Moisture model: each 4×4 cell holds soil moisture (0..1) that relaxes toward a
 * groundwater baseline. Rain adds moisture; any rain falling on saturated soil
 * becomes surface flood water, which drains slowly. This is what makes the
 * second consecutive rain over the same spot flood the village.
 */
export class EnvironmentSystem {
  update(sim: Simulation, dt: number): void {
    const s = sim.state;
    const n = CONFIG.cells.count;
    const size = CONFIG.cells.size;
    const half = CONFIG.world.size / 2;

    // Rain clouds.
    for (let i = s.clouds.length - 1; i >= 0; i--) {
      const cloud = s.clouds[i];
      cloud.timeLeft -= dt;
      const r = cloud.radius;
      const minX = Math.max(0, Math.floor((cloud.x - r + half) / size));
      const maxX = Math.min(n - 1, Math.floor((cloud.x + r + half) / size));
      const minZ = Math.max(0, Math.floor((cloud.z - r + half) / size));
      const maxZ = Math.min(n - 1, Math.floor((cloud.z + r + half) / size));
      for (let cz = minZ; cz <= maxZ; cz++) {
        for (let cx = minX; cx <= maxX; cx++) {
          const wx = -half + (cx + 0.5) * size;
          const wz = -half + (cz + 0.5) * size;
          const d = Math.hypot(wx - cloud.x, wz - cloud.z);
          if (d > r) continue;
          const falloff = 1 - (d / r) * 0.35;
          const idx = cz * n + cx;
          let m = s.moisture[idx] + CONFIG.rain.moisturePerSec * falloff * dt;
          if (m > 1) {
            s.flood[idx] = Math.min(CONFIG.flood.max, s.flood[idx] + (m - 1));
            m = 1;
          }
          s.moisture[idx] = m;
        }
      }
      for (const village of s.villages) {
        const well = sim.building(village.wellId);
        if (!well || well.destroyed) continue;
        if (Math.hypot(well.x - cloud.x, well.z - cloud.z) <= r) {
          village.water = Math.min(CONFIG.village.maxWater, village.water + CONFIG.rain.wellWaterPerSec * dt);
        }
      }
      if (cloud.timeLeft <= 0) {
        s.clouds.splice(i, 1);
        sim.bus.emit('RAIN_STOPPED', { cloudId: cloud.id, x: cloud.x, z: cloud.z });
      }
    }

    // Relax moisture toward groundwater and drain floods.
    const base = CONFIG.cells.baseMoisture;
    const relax = CONFIG.cells.relaxRate * dt;
    const drain = CONFIG.flood.drainPerSec * dt;
    for (let i = 0; i < s.moisture.length; i++) {
      const m = s.moisture[i];
      s.moisture[i] = m > base ? Math.max(base, m - relax) : Math.min(base, m + relax);
      if (s.flood[i] > 0) s.flood[i] = Math.max(0, s.flood[i] - drain);
    }

    // Trees: growth animation and post-fire regrowth.
    for (const tree of s.trees) {
      if (tree.removed) continue;
      if (tree.growth < 1 && !tree.charred && tree.growRate > 0) {
        tree.growth = Math.min(1, tree.growth + tree.growRate * dt * sim.effects.growthFactor(tree.x, tree.z));
      }
      if (tree.charred) {
        tree.charredTime += dt;
        if (tree.charredTime > CONFIG.trees.regrowDelay && sim.moistureAt(tree.x, tree.z) > CONFIG.trees.regrowMoisture) {
          tree.charred = false;
          tree.charredTime = 0;
          tree.health = 1;
          tree.growth = 0.08;
          tree.growRate = 1 / CONFIG.trees.naturalGrowSeconds;
          sim.bus.emit('TREE_REGROWN', { treeId: tree.id, x: tree.x, z: tree.z });
        }
      } else if (tree.health < 1 && !tree.burning) {
        tree.health = Math.min(1, tree.health + 0.004 * dt);
      }
    }
  }
}
