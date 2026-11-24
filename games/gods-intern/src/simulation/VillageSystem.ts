import { CONFIG } from '../core/Config';
import type { TreeData, VillageData } from '../core/types';
import { makeVillager } from '../world/WorldGen';
import type { Simulation } from './SimulationManager';

/**
 * Village economy: well refill, farm growth and harvest, flood tracking,
 * shortages, births and aggregate stats (population, faith, happiness, fear,
 * prosperity). Runs every tick for resources and at 2 Hz for aggregates.
 */
export class VillageSystem {
  private aggregateTimer = 0;
  private readonly nearTrees: TreeData[] = [];
  private cropWarn = new Map<number, number>();
  private floodRiskWarn = -99;

  update(sim: Simulation, dt: number): void {
    const s = sim.state;
    for (const village of s.villages) {
      this.resources(sim, village, dt);
    }
    this.aggregateTimer -= dt;
    if (this.aggregateTimer <= 0) {
      this.aggregateTimer = 0.5;
      for (const village of s.villages) this.aggregate(sim, village, 0.5);
    }
  }

  private resources(sim: Simulation, village: VillageData, dt: number): void {
    const well = sim.building(village.wellId);
    if (well && !well.destroyed) {
      const m = sim.moistureAt(well.x, well.z);
      village.water = Math.min(
        CONFIG.village.maxWater,
        village.water + (CONFIG.village.wellRefillBase + CONFIG.village.wellRefillMoisture * m) * village.identity.wellRefill * dt,
      );
    }

    for (const farmId of village.farmIds) {
      const farm = sim.building(farmId);
      if (!farm || farm.destroyed) continue;
      const m = sim.moistureAt(farm.x, farm.z);
      const flood = Math.max(sim.floodAt(farm.x - 3, farm.z), sim.floodAt(farm.x + 3, farm.z), sim.floodAt(farm.x, farm.z));
      let workers = 0;
      for (const v of sim.state.villagers) {
        if (v.alive && v.currentTask.state === 'WORKING' && v.currentTask.activity === 'farm' && v.currentTask.arrived && v.currentTask.targetId === farm.id) workers++;
      }
      const moistureFactor = Math.min(1.3, Math.max(0.25, 0.25 + m * 1.25));
      const workerFactor = 1 + 0.18 * Math.min(workers, 4);
      const c = sim.state.culture;
      // Culture: Upside-Down Day slows everyone; the potato cult is reluctant to harvest relatives.
      const cultureFactor = (c.upsideDownUntil > sim.state.time ? 0.65 : 1) * (c.potatoCult && sim.religion.byArchetype('potato') ? 0.8 : 1);
      farm.cropGrowth += CONFIG.farm.baseGrowth * moistureFactor * workerFactor * cultureFactor * (flood > 0.25 ? 0.3 : 1) * dt * sim.effects.growthFactor(farm.x, farm.z);
      if (flood > 0.25) {
        farm.cropHealth = Math.max(0.1, farm.cropHealth - CONFIG.flood.cropDamagePerSec * village.identity.floodSensitivity * dt);
        const last = this.cropWarn.get(farm.id) ?? -99;
        if (sim.state.time - last > 6) {
          this.cropWarn.set(farm.id, sim.state.time);
          sim.bus.emit('CROPS_DAMAGED', { buildingId: farm.id, cropHealth: farm.cropHealth });
        }
      } else if (m > 0.2) {
        farm.cropHealth = Math.min(1, farm.cropHealth + 0.004 * dt);
      }
      if (farm.cropGrowth >= 1) {
        const amount = Math.round(CONFIG.farm.harvestYield * farm.cropHealth * village.identity.farmYield);
        farm.cropGrowth = 0;
        village.food = Math.min(CONFIG.village.maxFood, village.food + amount);
        sim.bus.emit('HARVEST', { villageId: village.id, amount });
      }
    }

    const shortage = village.food < 15 || village.water < 10;
    village.shortageTime = shortage ? village.shortageTime + dt : Math.max(0, village.shortageTime - dt * 2);
  }

  private aggregate(sim: Simulation, village: VillageData, dt: number): void {
    const s = sim.state;
    let pop = 0;
    let faith = 0;
    let happy = 0;
    let fear = 0;
    let hungry = 0;
    for (const v of s.villagers) {
      if (!v.alive || v.villageId !== village.id) continue;
      pop++;
      faith += v.faith;
      happy += v.happiness;
      fear += v.fear;
      if (v.hunger > 0.8) hungry++;
    }
    village.population = pop;
    if (pop > 0) {
      village.faith = faith / pop;
      village.happiness = happy / pop;
      village.fear = fear / pop;
    }

    // Resource edge triggers.
    for (const res of ['food', 'water', 'wood'] as const) {
      const key = `depleted-${village.id}-${res}`;
      if (village[res] <= 0.5 && !s.recent[key]?.length) {
        sim.remember(key);
        sim.bus.emit('RESOURCE_DEPLETED', { villageId: village.id, resource: res });
      } else if (village[res] > 5 && s.recent[key]?.length) {
        s.recent[key] = [];
      }
    }
    if (village.food <= 0.5 && hungry >= 4 && sim.recentCount(`starving-${village.id}`, 60) === 0) {
      sim.remember(`starving-${village.id}`);
      sim.bus.emit('VILLAGE_STARVING', { villageId: village.id });
    }

    // Flood level across the village footprint.
    let maxFlood = 0;
    let moistSum = 0;
    let moistCount = 0;
    for (let dz = -16; dz <= 16; dz += 4) {
      for (let dx = -16; dx <= 16; dx += 4) {
        if (dx * dx + dz * dz > 18 * 18) continue;
        const f = sim.floodAt(village.centerX + dx, village.centerZ + dz);
        maxFlood = Math.max(maxFlood, f);
        moistSum += sim.moistureAt(village.centerX + dx, village.centerZ + dz);
        moistCount++;
      }
    }
    village.flood = maxFlood;
    if (!village.floodActive && maxFlood >= CONFIG.flood.eventLevel) {
      village.floodActive = true;
      sim.bus.emit('FLOOD_STARTED', { villageId: village.id, level: maxFlood, x: village.centerX, z: village.centerZ });
    } else if (village.floodActive && maxFlood <= CONFIG.flood.recededLevel) {
      village.floodActive = false;
      sim.bus.emit('FLOOD_RECEDED', { villageId: village.id });
    }
    const avgMoist = moistCount ? moistSum / moistCount : 0;
    const rainingHere = s.clouds.some((c) => Math.hypot(c.x - village.centerX, c.z - village.centerZ) < c.radius + 14);
    if (rainingHere && avgMoist > 0.9 && !village.floodActive && s.time - this.floodRiskWarn > 15) {
      this.floodRiskWarn = s.time;
      sim.bus.emit('FLOOD_RISK', { villageId: village.id, moisture: avgMoist });
    }

    // Vegetation around the village.
    const trees = sim.treesNear(village.centerX, village.centerZ, 32, this.nearTrees);
    let alive = 0;
    for (const t of trees) if (!t.charred && t.growth > 0.5) alive++;
    village.treesNearby = alive;

    // Prosperity.
    const owned = s.buildings.filter((b) => b.villageId === village.id);
    const intact = owned.filter((b) => !b.destroyed).length / Math.max(1, owned.length);
    village.prosperity =
      Math.min(1, ((village.food / CONFIG.village.maxFood + village.water / CONFIG.village.maxWater + village.wood / CONFIG.village.maxWood) / 3) * 0.55 + intact * 0.3 + village.happiness * 0.15);

    // Births: only once the economy is healthy and housing allows.
    const houses = village.houseIds.filter((id) => !sim.building(id)?.destroyed).length;
    const capacity = houses * CONFIG.village.houseCapacity;
    village.birthTimer -= dt;
    if (village.birthTimer <= 0) {
      village.birthTimer = CONFIG.village.birthInterval;
      if (village.food > 50 && village.water > 40 && village.happiness > 0.55 && pop < capacity && pop > 1) {
        const homeId = village.houseIds.find((id) => !sim.building(id)?.destroyed) ?? village.houseIds[0];
        const home = sim.building(homeId)!;
        const x = home.x + (village.centerX - home.x) * 0.25;
        const z = home.z + (village.centerZ - home.z) * 0.25;
        const id = `p${sim.nextId()}`;
        const baby = makeVillager(sim.rng, id, village.id, x, sim.terrain.heightAt(x, z), z, homeId, 'idler', 0);
        baby.faith = Math.min(1, village.faith + 0.1);
        village.food -= 10;
        sim.addVillager(baby);
        sim.state.stats.villagersBorn++;
        sim.bus.emit('VILLAGER_BORN', { villagerId: id, name: baby.name, villageId: village.id });
      }
    }

    // Inspector problem list derived from state.
    const problems: string[] = [];
    if (village.water < 20) problems.push('The well is running dry');
    if (village.food < 20) problems.push('Food stores are low');
    if (village.floodActive) problems.push('Streets are flooded');
    if (village.fear > 0.4) problems.push('Villagers are terrified');
    if (village.happiness < 0.4) problems.push('Morale is collapsing');
    if (s.fires.some((f) => Math.hypot(f.x - village.centerX, f.z - village.centerZ) < village.radius + 10)) problems.push('Fire nearby!');
    if (owned.some((b) => b.destroyed)) problems.push('Buildings need rebuilding');
    village.problems = problems;
  }
}
