import { CONFIG } from '../core/Config';
import type { PowerEffect, TreeData, VillagerData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';
import { WATER_NONE } from '../world/TerrainGen';
import { BasePower, type PowerContext } from './DivinePower';

const P = CONFIG.powers;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Shared: is a point well inside the island and on solid ground? */
function solid(ctx: PowerContext, max = 70): string | null {
  if (Math.hypot(ctx.x, ctx.z) > max) return 'Aim at the island';
  if (!ctx.sim.terrain.isLand(ctx.x, ctx.z)) return 'Needs solid ground';
  return null;
}

// ============================================================================ TORNADO

export class TornadoPower extends BasePower {
  id = 'tornado' as const;
  name = 'Tornado';
  description = 'A wandering twister. Scatters rocks, uproots trees, damages flimsy buildings, fans or snuffs fires.';
  energyCost = P.tornado.cost;
  cooldown = P.tornado.cooldown;
  radius = P.tornado.radius;

  validate(ctx: PowerContext): string | null {
    if (ctx.sim.effects.list.some((e) => e.kind === 'tornado')) return 'One tornado at a time, please';
    return solid(ctx);
  }

  activate(ctx: PowerContext): void {
    const { sim, x, z } = ctx;
    const a = sim.rng.range(0, Math.PI * 2);
    sim.effects.add('tornado', x, z, this.radius, P.tornado.duration, { dirX: Math.cos(a), dirZ: Math.sin(a) });
    sim.memory.record('tornado', x, z, { impact: 0.8, radius: 26 });
    sim.addChaos(3, 'Tornado');
  }
}

// ============================================================================ FREEZE

export class FreezePower extends BasePower {
  id = 'freeze' as const;
  name = 'Freeze';
  description = 'Frost an area: puts out fires, pauses crops and plants, slows villagers. Thaws on its own.';
  energyCost = P.freeze.cost;
  cooldown = P.freeze.cooldown;
  radius = P.freeze.radius;

  validate(ctx: PowerContext): string | null {
    return Math.hypot(ctx.x, ctx.z) > 72 ? 'Aim at the island' : null;
  }

  activate(ctx: PowerContext): void {
    const { sim, x, z } = ctx;
    // Freeze + Fire: freezing a burning area makes steam and thaws faster.
    const burning = sim.state.fires.some((f) => Math.hypot(f.x - x, f.z - z) < this.radius);
    const e = sim.effects.add('freeze', x, z, this.radius, P.freeze.duration * (burning ? 0.6 : 1));
    if (burning) sim.combos.trigger('steam-thaw', x, z);
    // Freeze + Rain: an active cloud overhead becomes snow and widens the frost.
    if (sim.state.clouds.some((c) => Math.hypot(c.x - x, c.z - z) < c.radius + 2)) {
      e.radius += 4;
      e.until += 10;
      sim.combos.trigger('permafrost', x, z);
    }
    sim.memory.record('freeze', x, z, { impact: 0.6, radius: 22 });
  }
}

// ============================================================================ GRAVITY

export class GravityPower extends BasePower {
  id = 'gravity' as const;
  name = 'Gravity';
  description = 'A low-gravity bubble: villagers and loose rocks float, then settle gently back down.';
  energyCost = P.gravity.cost;
  cooldown = P.gravity.cooldown;
  radius = P.gravity.radius;

  validate(ctx: PowerContext): string | null {
    return solid(ctx);
  }

  activate(ctx: PowerContext): void {
    const { sim, x, z } = ctx;
    sim.effects.add('gravity', x, z, this.radius, P.gravity.duration);
    sim.memory.record('gravity', x, z, { impact: 0.6, radius: 22 });
    sim.addChaos(2, 'Gravity');
  }
}

// ============================================================================ TERRAFORM

export class TerraformPower extends BasePower {
  id = 'terraform' as const;
  name = 'Terraform';
  description = 'Raise or lower a small patch of land (T toggles). Buildings, the bridge and water are protected.';
  energyCost = P.terraform.cost;
  cooldown = P.terraform.cooldown;
  radius = P.terraform.radius;
  mode: 'raise' | 'lower' = 'raise';

  validate(ctx: PowerContext): string | null {
    const { sim, x, z } = ctx;
    const base = solid(ctx, 66);
    if (base) return base;
    const R = this.radius;
    for (const b of sim.state.buildings) if (Math.hypot(b.x - x, b.z - z) < b.footprint + R + 0.5) return 'Too close to a building';
    for (const br of sim.terrain.bridges) {
      const mx = (br.x0 + br.x1) / 2;
      const mz = (br.z0 + br.z1) / 2;
      if (Math.hypot(mx - x, mz - z) < Math.hypot(br.x1 - br.x0, br.z1 - br.z0) / 2 + R + 3) return 'The bridge is protected';
    }
    for (let a = 0; a < 8; a++) {
      const px = x + Math.cos((a / 8) * Math.PI * 2) * (R + 1.5);
      const pz = z + Math.sin((a / 8) * Math.PI * 2) * (R + 1.5);
      if (sim.terrain.waterAt(px, pz) !== WATER_NONE) return 'Water does not like being moved';
    }
    const delta = this.mode === 'raise' ? P.terraform.step : -P.terraform.step;
    const current = sim.terrain.editOffsetAt(sim.state.terrainEdits, x, z);
    if (Math.abs(current + delta) > P.terraform.maxDelta) return this.mode === 'raise' ? 'That is as high as permits allow' : 'That is as deep as permits allow';
    if (this.mode === 'lower' && sim.terrain.heightAt(x, z) + delta < 0.9) return 'Any lower and the sea moves in';
    return null;
  }

  activate(ctx: PowerContext): void {
    const { sim, x, z } = ctx;
    sim.applyTerrainEdit({ x, z, radius: this.radius, delta: this.mode === 'raise' ? P.terraform.step : -P.terraform.step });
  }
}

// ============================================================================ TIME WARP

export class TimeWarpPower extends BasePower {
  id = 'timewarp' as const;
  name = 'Time Warp';
  description = 'A local bubble of fast (or slow, T toggles) time: walking, work, growth, building and fire.';
  energyCost = P.timewarp.cost;
  cooldown = P.timewarp.cooldown;
  radius = P.timewarp.radius;
  mode: 'fast' | 'slow' = 'fast';

  validate(ctx: PowerContext): string | null {
    if (Math.hypot(ctx.x, ctx.z) > 72) return 'Aim at the island';
    if (ctx.sim.effects.at('timewarp', ctx.x, ctx.z)) return 'Time is already warped here';
    return null;
  }

  activate(ctx: PowerContext): void {
    const { sim, x, z } = ctx;
    sim.effects.add('timewarp', x, z, this.radius, P.timewarp.duration, { factor: this.mode === 'fast' ? P.timewarp.fast : P.timewarp.slow });
    const { village, distance } = sim.nearestVillage(x, z);
    if (village && distance < village.radius + 6 && this.mode === 'fast' && sim.recentCount(`warp:${village.id}`, 600) >= 1) {
      sim.heaven.send('tuesday', 'DEPARTMENT OF TIME', `${village.name.toUpperCase()} HAS EXPERIENCED TUESDAY THREE TIMES.`);
    }
    if (village) sim.remember(`warp:${village.id}`);
  }
}

// ============================================================================ POSSESSION

export class PossessionPower extends BasePower {
  id = 'possession' as const;
  name = 'Possession';
  description = 'Walk around as one villager for 45 seconds (WASD). E interacts, Q leaves early.';
  energyCost = P.possession.cost;
  cooldown = P.possession.cooldown;
  radius = P.possession.radius;

  target(ctx: PowerContext): VillagerData | null {
    let best: VillagerData | null = null;
    let bestD = this.radius + 1;
    for (const v of ctx.sim.villagersNear(ctx.x, ctx.z, this.radius + 1, [])) {
      const d = Math.hypot(v.position.x - ctx.x, v.position.z - ctx.z);
      if (d < bestD && v.age >= 6) [best, bestD] = [v, d];
    }
    return best;
  }

  validate(ctx: PowerContext): string | null {
    if (ctx.sim.state.possession) return 'You are already someone';
    return this.target(ctx) ? null : 'Click right on a villager';
  }

  activate(ctx: PowerContext): void {
    const v = this.target(ctx);
    if (v) ctx.sim.possession.start(v);
  }
}

// ============================================================================ METEOR

export class MeteorPower extends BasePower {
  id = 'meteor' as const;
  name = 'Meteor';
  description = 'Order a meteor. 3-second warning, then a bounded impact: crater, fire, damage, a sacred fragment.';
  energyCost = P.meteor.cost;
  cooldown = P.meteor.cooldown;
  radius = P.meteor.radius;
  private readonly near: VillagerData[] = [];
  private readonly trees: TreeData[] = [];

  validate(ctx: PowerContext): string | null {
    if (ctx.sim.effects.list.some((e) => e.kind === 'meteor' && !e.done)) return 'One meteor at a time';
    return solid(ctx, 66);
  }

  activate(ctx: PowerContext): void {
    const { sim, x, z } = ctx;
    const t = sim.state.time;
    sim.effects.add('meteor', x, z, this.radius, P.meteor.warning + 8, { impactAt: t + P.meteor.warning });
    // Villagers who see the warning start running.
    for (const v of sim.villagersNear(x, z, this.radius + 10, this.near)) sim.ai.flee(sim, v, x, z);
  }

  /** Called by the effects system when the warning runs out. Bounded by `radius`. */
  impact(sim: Simulation, e: PowerEffect): void {
    e.done = true;
    const { x, z } = e;
    const R = e.radius;
    let buildings = 0;
    let trees = 0;
    let killed = 0;
    for (const b of sim.state.buildings) {
      if (b.destroyed) continue;
      const d = Math.hypot(b.x - x, b.z - z) - b.footprint;
      if (d > R) continue;
      buildings++;
      b.health -= d < R * 0.4 ? 80 : 40;
      sim.bus.emit('BUILDING_DAMAGED', { buildingId: b.id, type: b.type, health: b.health });
      if (b.health <= 0) sim.fire.destroyBuilding(sim, b);
      else if (sim.rng.chance(0.5)) sim.fire.ignite(sim, 'building', b.id, true);
    }
    for (const t of sim.treesNear(x, z, R, this.trees)) {
      if (t.golden || t.charred || t.removed) continue;
      trees++;
      if (Math.hypot(t.x - x, t.z - z) < R * 0.45) {
        t.charred = true;
        t.charredTime = 0;
        t.burning = false;
      } else if (sim.rng.chance(0.5)) sim.fire.ignite(sim, 'tree', t.id, true);
    }
    for (const v of sim.villagersNear(x, z, R + 8, this.near).slice()) {
      const d = Math.hypot(v.position.x - x, v.position.z - z);
      if (d < 2.2) {
        sim.ai.kill(sim, v, 'meteor', true);
        killed++;
        continue;
      }
      if (d < R) v.health = Math.max(0.05, v.health - 0.4 * (1 - d / R));
      v.fear = clamp01(v.fear + 0.6);
      sim.ai.flee(sim, v, x, z);
    }
    // A crater where the ground allows it (never under buildings, the bridge or water).
    const blocked = sim.state.buildings.some((b) => Math.hypot(b.x - x, b.z - z) < b.footprint + 5.5) || sim.terrain.heightAt(x, z) < 2.4;
    if (!blocked) sim.applyTerrainEdit({ x, z, radius: 5, delta: -1.4 }, true);
    // The surviving fragment: a rock with a story.
    const rockId = sim.state.rocks.length;
    const a = sim.rng.range(0, Math.PI * 2);
    const fx = x + Math.cos(a) * 1.2;
    const fz = z + Math.sin(a) * 1.2;
    sim.state.rocks.push({ id: rockId, x: fx, z: fz, scale: 1.25, rot: a, crowned: false, hatTier: 0, walking: false, targetX: fx, targetZ: fz, heading: 0, meteorite: true });
    sim.state.craters.push({ x, z, radius: 5, t: sim.state.time, fragmentRockId: rockId });
    if (sim.state.craters.length > 8) sim.state.craters.shift();
    sim.addChaos(8, 'Meteor');
    sim.memory.record('meteor', x, z, { impact: 1, radius: 40, targetEntityId: `rock:${rockId}` });
    sim.history.add('A Meteor Fell', `Something extremely large arrived from the sky near ${sim.nearestVillage(x, z).village?.name ?? 'nowhere'}. A warm fragment remains.`, { kind: 'disaster', x, z });
    sim.bus.emit('METEOR_IMPACT', { x, z, buildings, trees, killed });
  }
}

// ============================================================================ RESURRECTION

export class ResurrectionPower extends BasePower {
  id = 'resurrection' as const;
  name = 'Resurrection';
  description = 'Bring back a recently departed villager (click their grave). Same person, same memories.';
  energyCost = P.resurrection.cost;
  cooldown = P.resurrection.cooldown;
  radius = P.resurrection.radius;

  validate(ctx: PowerContext): string | null {
    const g = ctx.sim.resurrect.graveNear(ctx.x, ctx.z, this.radius);
    if (!g) return ctx.sim.state.graveyard.length ? 'Click on a grave' : 'Nobody has died recently. Congratulations?';
    if (ctx.sim.state.villagers.filter((v) => v.alive).length >= CONFIG.civ.populationCap) return 'The island is full';
    return null;
  }

  activate(ctx: PowerContext): void {
    const g = ctx.sim.resurrect.graveNear(ctx.x, ctx.z, this.radius);
    if (g) ctx.sim.resurrect.revive(g);
  }
}
