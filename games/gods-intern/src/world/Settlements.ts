import { CONFIG } from '../core/Config';
import { Rng } from '../core/Rng';
import type { BuildingData, BuildingType, GameStateData, Trait, VillageCulture, VillageData, VillageIdentity, VillagerJob } from '../core/types';
import type { TerrainData } from './TerrainGen';
import { makeVillager } from './WorldGen';

export { FOOTPRINT } from './Footprints';
import { FOOTPRINT } from './Footprints';

/** Cultural identity presets. Tendencies, not rules: individual traits still decide. */
export function identityFor(villageId: string, culture: VillageCulture): VillageIdentity {
  switch (culture) {
    case 'mountain':
      return { villageId, culture, openness: 0.35, religiousTolerance: 0.3, divineFavor: 0, preferredResources: ['stone', 'wood'], farmYield: 0.6, wellRefill: 0.9, floodSensitivity: 0.8, monumentDevotion: 1.35 };
    case 'riverside':
      return { villageId, culture, openness: 0.8, religiousTolerance: 0.7, divineFavor: 0, preferredResources: ['water', 'food'], farmYield: 0.9, wellRefill: 1.6, floodSensitivity: 1.5, monumentDevotion: 0.9 };
    default:
      return { villageId, culture, openness: 0.55, religiousTolerance: 0.55, divineFavor: 0, preferredResources: ['food'], farmYield: 1.15, wellRefill: 1, floodSensitivity: 1, monumentDevotion: 1 };
  }
}

export const CULTURE_OF: Record<string, VillageCulture> = { v1: 'agricultural', v2: 'riverside', v3: 'mountain' };

export function emptyVillage(id: string, name: string, x: number, z: number, culture: VillageCulture): VillageData {
  return {
    id,
    name,
    population: 0,
    food: 0,
    water: 0,
    wood: 0,
    faith: 0.5,
    happiness: 0.7,
    fear: 0,
    prosperity: 0.5,
    centerX: x,
    centerZ: z,
    radius: id === 'v1' ? CONFIG.village.radius : 15,
    wellId: -1,
    storageId: -1,
    shrineId: -1,
    farmIds: [],
    houseIds: [],
    birthTimer: CONFIG.village.birthInterval,
    shortageTime: 0,
    ignoredPrayers: 0,
    flood: 0,
    floodActive: false,
    treesNearby: 0,
    problems: [],
    stone: 0,
    identity: identityFor(id, culture),
    quarryIds: [],
    fisheryIds: [],
  };
}

interface SettlementPlan {
  culture: VillageCulture;
  layout: Array<[number, number, BuildingType]>;
  jobs: VillagerJob[];
  start: { food: number; water: number; wood: number; stone: number };
  favoredTraits: Trait[];
  shadeTrees: Array<[number, number]>;
}

const PLANS: Record<string, SettlementPlan> = {
  // Drizzleville — riverside traders: good water, fishing, curious and open.
  v2: {
    culture: 'riverside',
    layout: [
      [0, 0, 'well'],
      [0, -9, 'shrine'],
      [8, -3, 'storage'],
      [-9, -5, 'fishery'],
      [3, 10, 'farm'],
      [-10, 3, 'house'],
      [-6, 9.5, 'house'],
      [12, 4, 'house'],
      [-5, -9.5, 'house'],
      [5.5, -9, 'house'],
    ],
    jobs: ['farmer', 'farmer', 'farmer', 'fisher', 'fisher', 'fisher', 'fisher', 'woodcutter', 'woodcutter', 'builder', 'idler', 'idler', 'idler', 'idler', 'idler', 'idler'],
    start: { food: 95, water: 85, wood: 25, stone: 0 },
    favoredTraits: ['curious', 'dramatic'],
    shadeTrees: [[-3, 4], [4, -4], [-12, -10]],
  },
  // Rockbottom — mountain folk: stone and wood, poor farms, stubborn faith.
  v3: {
    culture: 'mountain',
    layout: [
      [0, 0, 'well'],
      [0, -9, 'shrine'],
      [8, 1, 'storage'],
      [-8, -6, 'quarry'],
      [6, 9, 'farm'],
      [-9, 3, 'house'],
      [-5, 9.5, 'house'],
      [10, -6, 'house'],
      [-10, -12, 'house'],
    ],
    jobs: ['miner', 'miner', 'miner', 'miner', 'woodcutter', 'woodcutter', 'woodcutter', 'farmer', 'farmer', 'builder', 'builder', 'idler', 'idler', 'idler'],
    start: { food: 35, water: 45, wood: 80, stone: 60 },
    favoredTraits: ['superstitious', 'brave', 'devout'],
    shadeTrees: [[-4, 5], [4, -4]],
  },
};

/**
 * Adds a populated settlement (buildings, villagers, rocks) to a state.
 * Used both for new worlds and when upgrading older saves. Deterministic:
 * it uses its own RNG seeded from the world seed and the site id, so a
 * migrated save gets exactly the same village a new world would.
 */
export function addSettlement(state: GameStateData, terrain: TerrainData, siteId: string): VillageData | null {
  if (state.villages.some((v) => v.id === siteId)) return null;
  const site = terrain.sites.find((s) => s.id === siteId);
  const plan = PLANS[siteId];
  if (!site || !plan) return null;
  const rng = new Rng(state.seed * 31337 + siteId.charCodeAt(1) * 7919);
  const village = emptyVillage(site.id, site.name, site.x, site.z, plan.culture);
  Object.assign(village, plan.start);

  for (const [ox, oz, type] of plan.layout) {
    const x = site.x + ox;
    const z = site.z + oz;
    const rotation = type === 'farm' ? 0.12 : type === 'well' ? 0 : Math.atan2(site.x - x, site.z - z);
    const b: BuildingData = {
      id: state.buildings.length,
      type,
      villageId: village.id,
      x,
      z,
      rotation,
      health: 100,
      destroyed: false,
      footprint: FOOTPRINT[type],
      cropGrowth: type === 'farm' ? 0.3 : 0,
      cropHealth: 1,
      variant: rng.int(0, 3),
      style: plan.culture,
    };
    state.buildings.push(b);
    if (type === 'well') village.wellId = b.id;
    if (type === 'storage') village.storageId = b.id;
    if (type === 'shrine') village.shrineId = b.id;
    if (type === 'farm') village.farmIds.push(b.id);
    if (type === 'house') village.houseIds.push(b.id);
    if (type === 'quarry') village.quarryIds.push(b.id);
    if (type === 'fishery') village.fisheryIds.push(b.id);
  }

  plan.jobs.forEach((job, index) => {
    const homeId = village.houseIds[index % village.houseIds.length];
    const home = state.buildings[homeId];
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(2.5, 6);
    const x = site.x + Math.cos(a) * r + (home.x - site.x) * 0.2;
    const z = site.z + Math.sin(a) * r + (home.z - site.z) * 0.2;
    const v = makeVillager(rng, `p${state.nextId++}`, village.id, x, terrain.heightAt(x, z), z, homeId, job, rng.int(16, 70));
    // Cultural tendency, not destiny: some villagers swap a trait for a locally favored one.
    if (rng.chance(0.4)) {
      const favored = rng.pick(plan.favoredTraits);
      if (!v.traits.includes(favored) && !(favored === 'superstitious' && v.traits.includes('skeptical')) && !(favored === 'brave' && v.traits.includes('cowardly'))) v.traits[0] = favored;
    }
    state.villagers.push(v);
  });
  village.population = plan.jobs.length;

  // Clear any old trees standing where the new buildings and plaza are (older saves).
  for (const t of state.trees) {
    if (t.removed) continue;
    if (Math.hypot(t.x - site.x, t.z - site.z) < 6) t.removed = true;
    for (const b of state.buildings) if (b.villageId === village.id && Math.hypot(t.x - b.x, t.z - b.z) < b.footprint + 1.2) t.removed = true;
  }
  for (const [ox, oz] of plan.shadeTrees) {
    state.trees.push({ id: state.trees.length, kind: 'oak', x: site.x + ox, z: site.z + oz, growth: 1, growRate: 0, health: 1, burning: false, charred: false, charredTime: 0, byPlayer: false, scale: rng.range(0.85, 1.15), rot: rng.range(0, 6.28), removed: false });
  }

  // A plaza rock (every village gets one to misunderstand) plus a few boulders; Rockbottom gets more.
  const addRock = (x: number, z: number, scale: number) =>
    state.rocks.push({ id: state.rocks.length, x, z, scale, rot: rng.range(0, 6.28), crowned: false, hatTier: 0, walking: false, targetX: x, targetZ: z, heading: 0 });
  addRock(site.x + 4.5, site.z + 4, plan.culture === 'mountain' ? 1.4 : 1.1);
  const extra = plan.culture === 'mountain' ? 6 : 2;
  for (let i = 0, placed = 0; i < 80 && placed < extra; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(13, 22);
    const x = site.x + Math.cos(a) * r;
    const z = site.z + Math.sin(a) * r;
    if (!terrain.isLand(x, z) || terrain.slopeAt(x, z) > 0.9) continue;
    if (state.rocks.some((o) => Math.hypot(o.x - x, o.z - z) < 5)) continue;
    if (state.buildings.some((b) => Math.hypot(b.x - x, b.z - z) < b.footprint + 2)) continue;
    addRock(x, z, rng.range(0.9, 1.4));
    placed++;
  }

  state.villages.push(village);
  return village;
}

export function relationKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
