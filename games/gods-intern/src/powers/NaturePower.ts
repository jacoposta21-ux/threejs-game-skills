import { CONFIG } from '../core/Config';
import type { TreeData, TreeKind, VillagerData } from '../core/types';
import { WATER_NONE } from '../world/TerrainGen';
import { BasePower, type PowerContext } from './DivinePower';

export class NaturePower extends BasePower {
  id = 'nature' as const;
  name = 'Nature';
  description = 'Grow a tree in seconds. Calms villagers, adds greenery and future wood.';
  energyCost = CONFIG.powers.nature.cost;
  cooldown = CONFIG.powers.nature.cooldown;
  radius = CONFIG.powers.nature.radius;
  private readonly trees: TreeData[] = [];
  private readonly near: VillagerData[] = [];

  validate(ctx: PowerContext): string | null {
    const { sim, x, z } = ctx;
    if (!this.onIsland(ctx, 72)) return 'Trees need land';
    if (sim.terrain.waterAt(x, z) !== WATER_NONE || sim.terrain.heightAt(x, z) < 0.6) return 'Too wet to plant here';
    if (sim.terrain.heightAt(x, z) > 19) return 'Too high and rocky';
    if (sim.terrain.slopeAt(x, z) > 1.1) return 'Too steep';
    const b = sim.buildingAt(x, z, 0.6);
    if (b) return b.type === 'farm' ? 'The farmers would object' : 'Something is already built here';
    if (sim.floodAt(x, z) > 0.4) return 'Roots would drown';
    const close = sim.treesNear(x, z, CONFIG.trees.minSpacing, this.trees).filter((t) => !t.charred);
    if (close.length) return 'Too close to another tree';
    if (sim.state.trees.length >= CONFIG.trees.maxTrees) return 'The island is full of trees';
    return null;
  }

  activate(ctx: PowerContext): void {
    const { sim, x, z } = ctx;
    const h = sim.terrain.heightAt(x, z);
    const roll = sim.rng.next();
    const kind: TreeKind = h > 9 ? 'pine' : roll < 0.18 ? 'bush' : roll < 0.35 ? 'pine' : 'oak';
    // Replant over a charred stump if one is here.
    const stump = sim.treesNear(x, z, CONFIG.trees.minSpacing, this.trees).find((t) => t.charred);
    let tree: TreeData;
    if (stump) {
      tree = stump;
      tree.charred = false;
      tree.kind = kind;
    } else {
      tree = {
        id: sim.state.trees.length,
        kind,
        x,
        z,
        growth: 0,
        growRate: 0,
        health: 1,
        burning: false,
        charred: false,
        charredTime: 0,
        byPlayer: true,
        scale: sim.rng.range(0.9, 1.2),
        rot: sim.rng.range(0, Math.PI * 2),
        removed: false,
      };
      sim.state.trees.push(tree);
      sim.treeGrid.insert(tree.id, x, z);
    }
    tree.growth = 0.02;
    tree.growRate = 1 / CONFIG.trees.playerGrowSeconds;
    tree.health = 1;
    tree.byPlayer = true;
    sim.state.stats.treesPlanted++;

    const idx = sim.cellIndex(x, z);
    sim.state.moisture[idx] = Math.min(1, sim.state.moisture[idx] + 0.03);
    for (const v of sim.villagersNear(x, z, 12, this.near)) {
      v.fear = Math.max(0, v.fear - 0.18);
      v.happiness = Math.min(1, v.happiness + 0.04);
      if (v.fear < 0.1 && v.currentTask.state === 'IDLE') {
        v.thought = 'heart';
        v.thoughtTimer = 2.5;
      }
    }
    sim.bus.emit('TREE_PLANTED', { treeId: tree.id, x, z, byPlayer: true });
  }
}
