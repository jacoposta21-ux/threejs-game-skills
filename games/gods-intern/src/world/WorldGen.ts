import { BASIC_POWERS, CONFIG, POWER_ORDER, type PowerId } from '../core/Config';
import { rollTraits } from '../culture/Personality';
import { defaultCivState, defaultCulture, defaultV4State } from '../persistence/Migrations';
import { addSettlement, identityFor } from './Settlements';
import { FOOTPRINT } from './Footprints';
import { Rng } from '../core/Rng';
import type {
  BuildingData,
  BuildingType,
  GameStateData,
  RockData,
  TreeData,
  TreeKind,
  VillageData,
  VillagerData,
  VillagerJob,
} from '../core/types';
import { fbm, TerrainData, WATER_NONE } from './TerrainGen';

export const SAVE_VERSION = 4;

const FIRST_NAMES = [
  'Gary', 'Brenda', 'Kevin', 'Doris', 'Nigel', 'Mildred', 'Barnaby', 'Agatha', 'Dave', 'Gertrude',
  'Clive', 'Petunia', 'Reginald', 'Hilda', 'Trevor', 'Wanda', 'Bartholomew', 'Ethel', 'Steve', 'Ursula',
  'Norbert', 'Fern', 'Gus', 'Olga', 'Percival', 'Beryl', 'Wilbur', 'Tabitha', 'Kenneth', 'Marge',
  'Humphrey', 'Prudence', 'Derek', 'Maud', 'Archibald', 'Bev',
];
const LAST_NAMES = [
  'Mudfoot', 'the Damp', 'Twicebaked', 'Potato', 'of the Ditch', 'Goatwhisper', 'Pebblesworth',
  'the Unsure', 'Halfbucket', 'Cabbagehand', 'Wobblebottom', 'Puddlejump', 'Nettlesnout',
  'the Moderately Brave', 'Crumb', 'Sootwhistle', 'Oddsock', 'Mossbeard', 'Featherbrain', 'Turnipson',
  'the Lesser', 'Bucketsworth', 'Grimble', 'Sprout', 'Two-Shoes', 'Hedgeworth',
];

const SKIN = [0xf2c9a0, 0xe0ac7e, 0xc68a5c, 0x9b6440, 0x7a4a2c, 0xf6d6b8];
const SHIRTS = [0xd9534f, 0x4f86c6, 0xf0ad4e, 0x5cb85c, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xf4d35e, 0xee6c4d, 0x3d5a80];
const PANTS = [0x5b4636, 0x3b4a6b, 0x6b5b3e, 0x44403c, 0x7c5c3b];
const HAIR = [0x2b1d14, 0x5a3a22, 0xc69c5d, 0x8a8a8a, 0xb5522b, 0x161616, 0xe8d9a8];

export function villagerName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

export function makeVillager(
  rng: Rng,
  id: string,
  villageId: string,
  x: number,
  y: number,
  z: number,
  homeId: number,
  job: VillagerJob,
  age: number,
): VillagerData {
  return {
    id,
    name: villagerName(rng),
    age,
    health: 1,
    hunger: rng.range(0.05, 0.35),
    thirst: rng.range(0.1, 0.35),
    happiness: rng.range(0.6, 0.8),
    fear: 0,
    faith: rng.range(0.35, 0.65),
    villageId,
    position: { x, y, z },
    heading: rng.range(0, Math.PI * 2),
    currentTask: { state: 'IDLE', targetX: x, targetZ: z, targetId: null, timer: rng.range(0.5, 3), activity: '', arrived: true },
    alive: true,
    job,
    homeId,
    path: [],
    pathIndex: 0,
    decisionTimer: rng.range(0, CONFIG.villager.decisionInterval),
    thought: null,
    thoughtTimer: 0,
    deadTime: 0,
    causeOfDeath: null,
    look: {
      skin: rng.pick(SKIN),
      shirt: rng.pick(SHIRTS),
      pants: rng.pick(PANTS),
      hair: rng.pick(HAIR),
      hairStyle: rng.int(0, 3) as 0 | 1 | 2 | 3,
      height: rng.range(0.9, 1.08),
    },
    traits: rollTraits(rng),
    religionId: null,
    memoryIds: [],
    mutation: null,
    title: null,
  };
}


/** Village layout relative to the site centre (x, z, type). Doors face the well. */
const VILLAGE_LAYOUT: Array<[number, number, BuildingType]> = [
  [0, 0, 'well'],
  [0, -12, 'shrine'],
  [10, 1, 'storage'],
  [9, 12, 'farm'],
  [-12, -3, 'house'],
  [-11, 6, 'house'],
  [-5, 12, 'house'],
  [-8, -10, 'house'],
  [7, -9, 'house'],
  [13, -6, 'house'],
  [-1, 15, 'house'],
];

function placeTree(trees: TreeData[], kind: TreeKind, x: number, z: number, rng: Rng, growth = 1): TreeData {
  const tree: TreeData = {
    id: trees.length,
    kind,
    x,
    z,
    growth,
    growRate: 0,
    health: 1,
    burning: false,
    charred: false,
    charredTime: 0,
    byPlayer: false,
    scale: rng.range(0.8, 1.25),
    rot: rng.range(0, Math.PI * 2),
    removed: false,
  };
  trees.push(tree);
  return tree;
}

export function createInitialState(seed: number, terrain: TerrainData): GameStateData {
  const rng = new Rng(seed * 7919 + 17);
  const buildings: BuildingData[] = [];
  const villages: VillageData[] = [];
  const villagers: VillagerData[] = [];
  const trees: TreeData[] = [];

  const site = terrain.sites[0];
  const village: VillageData = {
    id: site.id,
    name: site.name,
    population: 0,
    food: CONFIG.village.startFood,
    water: CONFIG.village.startWater,
    wood: CONFIG.village.startWood,
    faith: 0.5,
    happiness: 0.7,
    fear: 0,
    prosperity: 0.5,
    centerX: site.x,
    centerZ: site.z,
    radius: CONFIG.village.radius,
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
    identity: identityFor(site.id, 'agricultural'),
    quarryIds: [],
    fisheryIds: [],
  };
  villages.push(village);

  for (const [ox, oz, type] of VILLAGE_LAYOUT) {
    const x = site.x + ox;
    const z = site.z + oz;
    const rotation = type === 'farm' ? 0.12 : Math.atan2(site.x - x, site.z - z);
    const building: BuildingData = {
      id: buildings.length,
      type,
      villageId: village.id,
      x,
      z,
      rotation: type === 'well' ? 0 : rotation,
      health: 100,
      destroyed: false,
      footprint: FOOTPRINT[type],
      cropGrowth: type === 'farm' ? 0.45 : 0,
      cropHealth: 1,
      variant: rng.int(0, 3),
      style: 'agricultural',
    };
    buildings.push(building);
    if (type === 'well') village.wellId = building.id;
    if (type === 'storage') village.storageId = building.id;
    if (type === 'shrine') village.shrineId = building.id;
    if (type === 'farm') village.farmIds.push(building.id);
    if (type === 'house') village.houseIds.push(building.id);
  }

  const jobs: VillagerJob[] = [
    'farmer', 'farmer', 'farmer', 'farmer', 'farmer', 'farmer', 'farmer',
    'woodcutter', 'woodcutter', 'woodcutter', 'woodcutter',
    'builder', 'builder',
    'idler', 'idler', 'idler', 'idler', 'idler', 'idler', 'idler',
  ];
  let nextId = 1;
  jobs.forEach((job, index) => {
    const homeId = village.houseIds[index % village.houseIds.length];
    const home = buildings[homeId];
    const angle = rng.range(0, Math.PI * 2);
    const r = rng.range(3, 9);
    const x = site.x + Math.cos(angle) * r * 0.9 + (home.x - site.x) * 0.2;
    const z = site.z + Math.sin(angle) * r * 0.9 + (home.z - site.z) * 0.2;
    villagers.push(
      makeVillager(rng, `p${nextId++}`, village.id, x, terrain.heightAt(x, z), z, homeId, job, rng.int(16, 72)),
    );
  });

  // Forests: jittered grid filtered by a forest-density noise field.
  const spacing = 2.9;
  for (let gz = -76; gz <= 76; gz += spacing) {
    for (let gx = -76; gx <= 76; gx += spacing) {
      const x = gx + rng.range(-1.2, 1.2);
      const z = gz + rng.range(-1.2, 1.2);
      if (terrain.waterAt(x, z) !== WATER_NONE) continue;
      const h = terrain.heightAt(x, z);
      if (h < 1.3 || h > 19) continue;
      if (terrain.slopeAt(x, z) > 1.5) continue;
      // Keep clear of water edges and settlements.
      if (terrain.waterAt(x + 1.8, z) !== WATER_NONE || terrain.waterAt(x - 1.8, z) !== WATER_NONE) continue;
      if (terrain.waterAt(x, z + 1.8) !== WATER_NONE || terrain.waterAt(x, z - 1.8) !== WATER_NONE) continue;
      let blocked = false;
      for (const s of terrain.sites) {
        if (Math.hypot(x - s.x, z - s.z) < s.radius + (s.populated ? 2 : -2)) blocked = true;
      }
      if (blocked) continue;
      const density = fbm(x * 0.045 + 11, z * 0.045 - 4, seed + 77, 3);
      const forest = density > -0.06;
      if (!forest && !rng.chance(0.07)) continue;
      if (forest && !rng.chance(0.86)) continue;
      const kind: TreeKind = h > 9.5 ? (rng.chance(0.9) ? 'pine' : 'bush') : rng.chance(0.68) ? 'oak' : rng.chance(0.5) ? 'pine' : 'bush';
      placeTree(trees, kind, x, z, rng);
    }
  }

  // A few shade trees inside the village so it feels lived-in.
  const villageTrees: Array<[number, number]> = [[-4, -5], [4, 5], [-15, 10], [15, 4], [-3, -15], [5, -14], [-16, 1]];
  for (const [ox, oz] of villageTrees) placeTree(trees, ox % 2 === 0 ? 'oak' : 'bush', site.x + ox, site.z + oz, rng);

  const state: GameStateData = {
    version: SAVE_VERSION,
    seed,
    rngState: rng.state,
    time: CONFIG.time.dayLength * CONFIG.time.startTimeOfDay,
    nextId,
    energy: CONFIG.energy.start,
    cooldowns: Object.fromEntries(POWER_ORDER.map((id) => [id, 0])) as Record<PowerId, number>,
    unlockedPowers: ['rain'],
    // (Mutation joins BASIC_POWERS only after Chaos reaches its threshold.)
    approval: CONFIG.reputation.startApproval,
    chaos: CONFIG.reputation.startChaos,
    villages,
    villagers,
    buildings,
    trees,
    fires: [],
    clouds: [],
    moisture: new Array(CONFIG.cells.count * CONFIG.cells.count).fill(CONFIG.cells.baseMoisture),
    flood: new Array(CONFIG.cells.count * CONFIG.cells.count).fill(0),
    prayers: [],
    prayerCooldowns: {},
    consequenceCooldowns: {},
    recent: {},
    tutorial: { step: 0, done: false, timer: 0, rainsCast: 0 },
    stats: {
      treesPlanted: 0,
      firesStarted: 0,
      lightningStrikes: 0,
      rainsCast: 0,
      villagersLost: 0,
      villagersBorn: 0,
      prayersAnswered: 0,
      prayersFailed: 0,
      buildingsLost: 0,
      tradesCompleted: 0,
      tradesFailed: 0,
      migrations: 0,
      religionSpreads: 0,
      prayersAfterOffice: 0,
    },
    lastGodMessage: -999,
    rocks: generateRocks(terrain, seed),
    memories: [],
    religions: [],
    sacred: [],
    mutations: [],
    history: [],
    culture: defaultCulture(),
    civ: defaultCivState(),
    ...defaultV4State(),
  };
  // v0.3: Drizzleville and Rockbottom.
  village.population = villagers.length;
  addSettlement(state, terrain, 'v2');
  addSettlement(state, terrain, 'v3');
  return state;
}

/**
 * Boulders as entities: one landmark rock on the village plaza plus a ring of
 * boulders in the surrounding meadows. Deterministic for a seed.
 */
export function generateRocks(terrain: TerrainData, seed: number): RockData[] {
  const site = terrain.sites[0];
  const rocks: RockData[] = [];
  const rng = new Rng(seed * 104729 + 3);
  const add = (x: number, z: number, scale: number) =>
    rocks.push({ id: rocks.length, x, z, scale, rot: rng.range(0, Math.PI * 2), crowned: false, hatTier: 0, walking: false, targetX: x, targetZ: z, heading: 0 });
  add(site.x + 2, site.z - 5.5, 1.25); // the plaza rock: in full view, clear of houses and trees
  for (let i = 0; i < 200 && rocks.length < 14; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(18, 44);
    const x = site.x + Math.cos(a) * r;
    const z = site.z + Math.sin(a) * r;
    if (!terrain.isLand(x, z) || terrain.slopeAt(x, z) > 0.8 || terrain.heightAt(x, z) > 12) continue;
    if (terrain.waterAt(x + 2, z) || terrain.waterAt(x - 2, z) || terrain.waterAt(x, z + 2) || terrain.waterAt(x, z - 2)) continue;
    if (rocks.some((o) => Math.hypot(o.x - x, o.z - z) < 7)) continue;
    add(x, z, rng.range(0.85, 1.3));
  }
  return rocks;
}

export function allPowersUnlocked(state: GameStateData): boolean {
  return BASIC_POWERS.every((p) => state.unlockedPowers.includes(p));
}
