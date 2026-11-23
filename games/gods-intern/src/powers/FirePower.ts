import { CONFIG } from '../core/Config';
import type { BuildingData, TreeData } from '../core/types';
import { BasePower, type PowerContext } from './DivinePower';

type FireTarget = { kind: 'tree'; tree: TreeData } | { kind: 'building'; building: BuildingData } | { kind: 'ground' };

export class FirePower extends BasePower {
  id = 'fire' as const;
  name = 'Fire';
  description = 'Set something ablaze. Fire spreads through dry forest. Rain stops it.';
  energyCost = CONFIG.powers.fire.cost;
  cooldown = CONFIG.powers.fire.cooldown;
  radius = CONFIG.powers.fire.radius;
  private readonly trees: TreeData[] = [];

  private findTarget(ctx: PowerContext): FireTarget | null {
    const { sim, x, z } = ctx;
    const trees = sim.treesNear(x, z, this.radius, this.trees).filter((t) => !t.charred && !t.burning && t.growth > 0.2);
    if (trees.length) {
      trees.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
      return { kind: 'tree', tree: trees[0] };
    }
    const b = sim.buildingAt(x, z, 0.8);
    if (b && !b.destroyed && b.type !== 'well' && !sim.fire.fireOnBuilding(sim, b.id)) return { kind: 'building', building: b };
    const h = sim.terrain.heightAt(x, z);
    if (sim.terrain.isLand(x, z) && h > 1.1 && h < 16 && sim.moistureAt(x, z) < 0.85 && sim.floodAt(x, z) < 0.1) return { kind: 'ground' };
    return null;
  }

  validate(ctx: PowerContext): string | null {
    if (!this.onIsland(ctx, 72)) return 'Nothing to burn there';
    if (ctx.sim.state.fires.length >= CONFIG.fire.maxActive) return 'Too many fires already';
    const target = this.findTarget(ctx);
    if (!target) {
      if (ctx.sim.moistureAt(ctx.x, ctx.z) >= 0.85 || ctx.sim.floodAt(ctx.x, ctx.z) >= 0.1) return 'Too wet to burn';
      return 'Nothing flammable here';
    }
    return null;
  }

  activate(ctx: PowerContext): void {
    const { sim, x, z } = ctx;
    const target = this.findTarget(ctx);
    if (!target) return;
    if (target.kind === 'tree') sim.fire.ignite(sim, 'tree', target.tree.id, true);
    else if (target.kind === 'building') sim.fire.ignite(sim, 'building', target.building.id, true);
    else sim.fire.igniteGround(sim, x, z, true);
  }
}
