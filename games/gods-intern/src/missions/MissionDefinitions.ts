import { CONFIG } from '../core/Config';
import type { PrayerData, VillageData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface MissionDefinition {
  type: string;
  title: string;
  description: string;
  objective: string;
  /** What the villager shouts at the shrine. */
  plea: string;
  priority: number;
  reward: { energy: number; approval: number };
  expiry: number;
  trigger(sim: Simulation, v: VillageData): boolean;
  init?(sim: Simulation, v: VillageData, p: PrayerData): void;
  progress(sim: Simulation, v: VillageData, p: PrayerData): number;
  complete(sim: Simulation, v: VillageData, p: PrayerData): boolean;
  failed?(sim: Simulation, v: VillageData, p: PrayerData): boolean;
}

export const WATER_GOAL = 60;
export const FOOD_GOAL = 50;
export const PANIC_GOAL = 0.2;
export const GREEN_GOAL = 5;

export function firesNearVillage(sim: Simulation, v: VillageData): number {
  let n = 0;
  for (const f of sim.state.fires) if (Math.hypot(f.x - v.centerX, f.z - v.centerZ) < v.radius + 14) n++;
  return n;
}

/**
 * Prayer definitions. Objectives check underlying state, not specific button
 * presses: water can be restored by any rain over the well, fear falls on its
 * own or faster with Nature, fires can burn out or be rained on, etc.
 */
export const MISSIONS: MissionDefinition[] = [
  {
    type: 'THIRST',
    title: 'The Great Thirst',
    description: 'Our well is drier than God’s sense of humor.',
    objective: `Raise the village water to ${WATER_GOAL}`,
    plea: 'PLEASE! WE NEED WATER!',
    priority: 3,
    reward: { energy: 25, approval: 9 },
    expiry: 170,
    trigger: (_sim, v) => v.water < 20,
    init: (_sim, v, p) => {
      p.data.start = Math.min(v.water, WATER_GOAL - 1);
    },
    progress: (_sim, v, p) => clamp01((v.water - p.data.start) / (WATER_GOAL - p.data.start)),
    complete: (_sim, v) => v.water >= WATER_GOAL,
  },
  {
    type: 'FIRE',
    title: 'The Burning Question',
    description: 'THE FOREST IS ON FIRE. IS THIS A TEST?!',
    objective: 'Put out every fire near the village',
    plea: 'FIRE! FIIIIRE!',
    priority: 3,
    reward: { energy: 20, approval: 10 },
    expiry: 140,
    trigger: (sim, v) => firesNearVillage(sim, v) >= 2,
    init: (sim, v, p) => {
      p.data.peak = firesNearVillage(sim, v);
      const f = sim.state.fires.find((fire) => Math.hypot(fire.x - v.centerX, fire.z - v.centerZ) < v.radius + 14);
      if (f) {
        p.targetX = f.x;
        p.targetZ = f.z;
      }
    },
    progress: (sim, v, p) => {
      const now = firesNearVillage(sim, v);
      p.data.peak = Math.max(p.data.peak, now);
      return clamp01(1 - now / Math.max(1, p.data.peak));
    },
    complete: (sim, v) => firesNearVillage(sim, v) === 0,
  },
  {
    type: 'GREEN',
    title: 'A Little More Green',
    description: 'Could we have some trees? Preferably not on fire.',
    objective: `Grow ${GREEN_GOAL} trees near the village`,
    plea: 'Could we have some trees?',
    priority: 1,
    reward: { energy: 20, approval: 7 },
    expiry: 240,
    trigger: (sim, v) => v.treesNearby < 40 || (sim.state.tutorial.done && sim.state.time > 260 && !sim.state.prayerCooldowns['GREEN-asked']),
    init: (sim, _v, p) => {
      p.data.planted = 0;
      sim.state.prayerCooldowns['GREEN-asked'] = 1;
    },
    progress: (_sim, _v, p) => clamp01(p.data.planted / GREEN_GOAL),
    complete: (_sim, _v, p) => p.data.planted >= GREEN_GOAL,
  },
  {
    type: 'PANIC',
    title: 'Divine Panic',
    description: 'Something exploded and everyone is screaming!',
    objective: 'Calm the village (fear below 20%)',
    plea: 'AAAAAAAAAH!',
    priority: 2,
    reward: { energy: 15, approval: 8 },
    expiry: 150,
    trigger: (_sim, v) => v.fear > 0.4,
    init: (_sim, v, p) => {
      p.data.start = Math.max(v.fear, PANIC_GOAL + 0.05);
    },
    progress: (_sim, v, p) => clamp01((p.data.start - v.fear) / (p.data.start - PANIC_GOAL)),
    complete: (_sim, v) => v.fear < PANIC_GOAL,
  },
  {
    type: 'FLOOD',
    title: 'Too Much Rain',
    description: 'We asked for water, not an ocean!',
    objective: 'Let the flood recede (no more rain!)',
    plea: 'STOP THE RAIN!',
    priority: 2,
    reward: { energy: 15, approval: 6 },
    expiry: 160,
    trigger: (_sim, v) => v.floodActive,
    init: (_sim, v, p) => {
      p.data.start = Math.max(v.flood, CONFIG.flood.eventLevel);
    },
    progress: (_sim, v, p) => {
      p.data.start = Math.max(p.data.start, v.flood);
      return clamp01(1 - (v.flood - CONFIG.flood.recededLevel) / (p.data.start - CONFIG.flood.recededLevel));
    },
    complete: (_sim, v) => v.flood <= CONFIG.flood.recededLevel && v.happiness > 0.3,
  },
  {
    type: 'HUNGER',
    title: 'Empty Bellies',
    description: 'We have eaten the emergency turnip. There is no second turnip.',
    objective: `Raise village food to ${FOOD_GOAL}`,
    plea: 'WE ARE SO HUNGRY!',
    priority: 2,
    reward: { energy: 20, approval: 8 },
    expiry: 220,
    trigger: (_sim, v) => v.food < 18,
    init: (_sim, v, p) => {
      p.data.start = Math.min(v.food, FOOD_GOAL - 1);
    },
    progress: (_sim, v, p) => clamp01((v.food - p.data.start) / (FOOD_GOAL - p.data.start)),
    complete: (_sim, v) => v.food >= FOOD_GOAL,
  },
  {
    type: 'ROCK_KING',
    title: 'The Silent Majesty',
    description: 'YOUR MAJESTY HAS BEEN VERY QUIET. IS HE ANGRY?',
    objective: 'Give the Rock King a sign (lightning or a tree near it)',
    plea: 'IS THE KING ANGRY?!',
    priority: 1,
    reward: { energy: 15, approval: 4 },
    expiry: 200,
    trigger: (sim, v) => v.id === sim.state.villages[0]?.id && sim.state.culture.rockKingId >= 0 && sim.state.time - sim.state.culture.lastRockSign > 220,
    progress: (sim, _v, p) => (sim.state.culture.lastRockSign > p.createdAt ? 1 : 0),
    complete: (sim, _v, p) => sim.state.culture.lastRockSign > p.createdAt,
  },
  {
    type: 'PURIFY',
    title: 'The Forbidden Well',
    description: 'A frog looked at us. From inside the well. In the eyes.',
    objective: 'Purify the well with rain',
    plea: 'THE WELL IS CURSED!',
    priority: 2,
    reward: { energy: 20, approval: 6 },
    expiry: 300,
    trigger: (sim, v) => !!sim.state.culture.cursedWell && (sim.state.culture.cursedWell.villageId ?? 'v1') === v.id,
    progress: (sim) => (sim.state.culture.cursedWell ? 0 : 1),
    complete: (sim) => !sim.state.culture.cursedWell,
  },
  {
    type: 'STILL_EMPLOYED',
    title: 'Is God Still Employed?',
    description: 'We have checked the shrine. There is only a sign. It says OUT OF OFFICE.',
    objective: 'Answer any prayer to prove you are still here',
    plea: 'HELLO? GOD?',
    priority: 3,
    reward: { energy: 25, approval: 10 },
    expiry: 400,
    trigger: (sim, v) => sim.state.culture.silence && v.id === sim.state.villages[0]?.id,
    progress: (sim) => (sim.state.culture.silence ? 0 : 1),
    complete: (sim) => !sim.state.culture.silence,
  },
  {
    // v0.3: raised by favoritism detection (CivilizationSystem), never auto-generated.
    type: 'EQUAL_TREATMENT',
    title: 'Equal Opportunity Miracles',
    description: 'We have noticed the other villages get all the nice weather.',
    objective: 'Help this village (rain, trees, rescues or answered prayers worth 15 favor)',
    plea: 'WHAT ABOUT US?!',
    priority: 2,
    reward: { energy: 20, approval: 8 },
    expiry: 220,
    trigger: () => false,
    progress: (sim, v, p) => clamp01(sim.civ.favorSum(v.id, 1, 0, p.createdAt) / 15),
    complete: (sim, v, p) => sim.civ.favorSum(v.id, 1, 0, p.createdAt) >= 15,
  },
  {
    // v0.4: after a tornado rearranges the village.
    type: 'WIND',
    title: 'The Furniture Situation',
    description: 'The wind has opinions about where our chairs go.',
    objective: 'Let the storm pass and get every building back above 60% (rain on fires helps)',
    plea: 'PLEASE ASK THE WIND TO STOP REARRANGING OUR FURNITURE.',
    priority: 2,
    reward: { energy: 20, approval: 6 },
    expiry: 240,
    trigger: (sim, v) => sim.recentCount(`tornado:${v.id}`, 60) > 0,
    progress: (sim, v) => {
      const owned = sim.state.buildings.filter((b) => b.villageId === v.id);
      return clamp01(owned.filter((b) => !b.destroyed && b.health >= 60).length / Math.max(1, owned.length));
    },
    complete: (sim, v) => !sim.state.effects.some((e) => e.kind === 'tornado') && sim.state.buildings.filter((b) => b.villageId === v.id).every((b) => !b.destroyed && b.health >= 60),
  },
];
