import { CONFIG } from '../core/Config';
import type { TreeData, VillagerData } from '../core/types';
import { BasePower, type PowerContext } from './DivinePower';

const WITNESS_RADIUS = 28;

/**
 * Area rules (all relative to the displayed target ring, radius R):
 *  - closest tree inside R always ignites, others inside R ignite at 55%
 *  - buildings whose footprint overlaps R take 30 damage, 50% chance to ignite
 *  - villagers within 1.4 die, within R are injured and flee
 *  - villagers within 28 witness the strike (fear + faith)
 * Nothing outside R is damaged.
 */
export class LightningPower extends BasePower {
  id = 'lightning' as const;
  name = 'Lightning';
  description = 'Strike a point. Ignites trees, damages buildings and terrifies everyone nearby.';
  energyCost = CONFIG.powers.lightning.cost;
  cooldown = CONFIG.powers.lightning.cooldown;
  radius = CONFIG.powers.lightning.radius;
  private readonly trees: TreeData[] = [];
  private readonly near: VillagerData[] = [];

  validate(ctx: PowerContext): string | null {
    if (!this.onIsland(ctx, 72)) return 'Aim at the island';
    if (ctx.sim.terrain.heightAt(ctx.x, ctx.z) < -2.5) return 'The sea is not impressed';
    return null;
  }

  activate(ctx: PowerContext): void {
    const { sim, x, z } = ctx;
    const R = this.radius;
    sim.state.stats.lightningStrikes++;

    let treesIgnited = 0;
    const trees = sim.treesNear(x, z, R, this.trees).filter((t) => !t.charred && !t.burning && t.growth > 0.2);
    trees.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    trees.forEach((tree, i) => {
      if (i === 0 || sim.rng.chance(0.55)) {
        if (sim.fire.ignite(sim, 'tree', tree.id, true)) treesIgnited++;
      } else tree.health = Math.max(0.2, tree.health - 0.3);
    });

    let buildingsHit = 0;
    for (const b of sim.state.buildings) {
      if (b.destroyed) continue;
      const d = Math.hypot(b.x - x, b.z - z) - b.footprint;
      if (d > R) continue;
      buildingsHit++;
      b.health -= 30;
      sim.bus.emit('BUILDING_DAMAGED', { buildingId: b.id, type: b.type, health: b.health });
      if (b.health <= 0) sim.fire.destroyBuilding(sim, b);
      else if (sim.rng.chance(0.5)) sim.fire.ignite(sim, 'building', b.id, true);
    }

    // Dry grass can catch from a bare-ground strike.
    if (!treesIgnited && !buildingsHit && sim.terrain.isLand(x, z) && sim.moistureAt(x, z) < 0.5 && sim.terrain.heightAt(x, z) > 1.1) {
      if (sim.rng.chance(0.45)) sim.fire.igniteGround(sim, x, z, true);
    }

    let killed = 0;
    let witnesses = 0;
    const villagers = sim.villagersNear(x, z, WITNESS_RADIUS, this.near).slice();
    for (const v of villagers) {
      const d = Math.hypot(v.position.x - x, v.position.z - z);
      if (d < 1.4) {
        sim.ai.kill(sim, v, 'lightning', true);
        killed++;
        continue;
      }
      if (v.currentTask.state === 'RESTING' && v.currentTask.arrived) continue;
      witnesses++;
      v.fear = Math.min(1, v.fear + 0.55 * (1 - d / WITNESS_RADIUS));
      v.faith = Math.min(1, v.faith + 0.06);
      if (d < R) {
        v.health -= 0.45;
        if (v.health <= 0) {
          sim.ai.kill(sim, v, 'lightning', true);
          killed++;
          continue;
        }
      }
      if (d < 11) sim.ai.flee(sim, v, x, z);
    }

    const { village, distance } = sim.nearestVillage(x, z);
    sim.bus.emit('LIGHTNING_STRUCK', {
      x,
      z,
      y: sim.terrain.surfaceAt(x, z),
      treesIgnited,
      buildingsHit,
      villagersKilled: killed,
      witnesses,
      villageId: village?.id ?? null,
      distanceToVillage: distance,
    });
    if (witnesses >= 3 && village) {
      sim.bus.emit('MIRACLE_WITNESSED', { villageId: village.id, kind: 'lightning', witnesses, x, z });
    }
  }
}
