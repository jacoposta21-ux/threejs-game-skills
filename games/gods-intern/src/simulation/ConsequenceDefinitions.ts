import type { VillagerData } from '../core/types';
import { rule, type ConsequenceRule } from './ConsequenceTypes';
import type { Simulation } from './SimulationManager';

const near: VillagerData[] = [];

function celebrate(sim: Simulation, villageId: string, reason: string): void {
  const village = sim.village(villageId);
  if (!village) return;
  sim.ai.celebrate(sim, village, reason);
}

function primaryVillage(sim: Simulation) {
  return sim.state.villages[0];
}

/**
 * Consequence chains. Each rule reads real simulation state; none fire from
 * timers alone. Chains are composed across rules via remembered timestamps
 * (sim.remember / sim.recentCount) and through systems reacting to events.
 */
export const CONSEQUENCES: ConsequenceRule[] = [
  // Chain A — The Holy Lightning.
  rule({
    id: 'holy-lightning',
    title: 'The Holy Lightning',
    trigger: 'LIGHTNING_STRUCK',
    cooldown: 25,
    condition: (_sim, e) => e.treesIgnited > 0 && e.witnesses >= 3 && e.distanceToVillage < 45 && e.villagersKilled === 0,
    effects: (sim, e) => {
      const village = e.villageId ? sim.village(e.villageId) : undefined;
      if (village) sim.addVillageFaith(village, 0.12);
      sim.addChaos(4, 'Holy sign');
      sim.remember('holy-sign');
      // Witnesses kneel toward the burning tree.
      sim.villagersNear(e.x, e.z, 30, near);
      for (const v of near.slice(0, 6)) sim.ai.pray(sim, v, e.x, e.z, 7);
    },
    notify: { text: 'THE TREE HAS SPOKEN.', kind: 'chaos', sub: 'Villagers interpret the lightning as a divine sign. Faith rises.' },
  }),
  rule({
    id: 'new-religion',
    title: 'New Religious Movement',
    trigger: 'LIGHTNING_STRUCK',
    cooldown: 240,
    condition: (sim) => sim.recentCount('holy-sign', 240) >= 2,
    effects: (sim) => {
      sim.addChaos(8, 'Founded a religion by accident');
      const v = primaryVillage(sim);
      if (v) sim.addVillageFaith(v, 0.1);
    },
    notify: { text: 'NEW RELIGIOUS MOVEMENT!', kind: 'chaos', sub: 'The Church of the Smouldering Oak is accepting members.' },
    god: { text: 'PLEASE STOP INVENTING RELIGIONS.', priority: 2 },
  }),

  rule({
    id: 'rain-joy',
    title: 'Rain Dance',
    trigger: 'RAIN_STARTED',
    cooldown: 15,
    condition: (sim, e) => {
      const { village, distance } = sim.nearestVillage(e.x, e.z);
      return !!village && distance < e.radius + 10 && village.water < 75 && !village.floodActive && sim.state.culture.rainBannedUntil < sim.state.time;
    },
    effects: (sim, e) => {
      const { village } = sim.nearestVillage(e.x, e.z);
      if (village) celebrate(sim, village.id, 'rain');
    },
  }),

  rule({
    id: 'rain-booed',
    title: 'Rain Booed',
    trigger: 'RAIN_STARTED',
    cooldown: 20,
    condition: (sim, e) => sim.state.culture.rainBannedUntil > sim.state.time && sim.nearestVillage(e.x, e.z).distance < e.radius + 12,
    effects: (sim, e) => {
      const crowd = sim.memory.witnesses(e.x, e.z, 22);
      for (const v of crowd) v.happiness = Math.max(0, v.happiness - 0.03);
      sim.speech.react(crowd, ['BOOOO!', 'THE CLOUD WAS CONVICTED!', 'GUILTY CLOUD!'], 2, 2);
    },
  }),

  // Chain B — Too Much of a Good Thing.
  rule({
    id: 'flood-risk',
    title: 'Flood Risk',
    trigger: 'FLOOD_RISK',
    cooldown: 25,
    condition: () => true,
    notify: { text: 'UH… THAT MIGHT BE TOO MUCH.', kind: 'bad', sub: 'The soil is saturated. More rain will flood the streets.' },
  }),
  rule({
    id: 'flood',
    title: 'Too Much of a Good Thing',
    trigger: 'FLOOD_STARTED',
    cooldown: 60,
    condition: () => true,
    effects: (sim, e) => {
      for (const v of sim.state.villagers) {
        if (v.alive && v.villageId === e.villageId) v.happiness = Math.max(0, v.happiness - 0.12);
      }
    },
    notify: { text: 'FLASH FLOOD!', kind: 'bad', sub: 'The village is knee-deep. Crops are drowning.' },
    god: { text: 'THAT IS NOT HOW RAIN WORKS.', priority: 2 },
  }),
  rule({
    id: 'crops-drowning',
    title: 'Crops Drowning',
    trigger: 'CROPS_DAMAGED',
    cooldown: 50,
    condition: (_sim, e) => e.cropHealth < 0.85,
    notify: { text: 'THE CROPS ARE DROWNING!', kind: 'bad', sub: 'Flooded fields lose their harvest.' },
  }),

  // Chain C — The Accidental Forest Fire.
  rule({
    id: 'forest-fire',
    title: 'The Accidental Forest Fire',
    trigger: 'FIRE_SPREAD',
    cooldown: 60,
    condition: (sim) => sim.state.fires.length >= 6,
    effects: (sim) => sim.remember('wildfire'),
    notify: { text: 'FOREST FIRE!', kind: 'bad', sub: 'It is spreading. Rain puts it out.' },
    god: { text: 'WHY IS THE FOREST ON FIRE?', priority: 2 },
  }),
  rule({
    id: 'village-threatened',
    title: 'Village Threatened',
    trigger: 'TICK',
    cooldown: 45,
    condition: (sim) =>
      sim.state.fires.some((f) =>
        sim.state.buildings.some((b) => !b.destroyed && Math.hypot(b.x - f.x, b.z - f.z) < b.footprint + 7),
      ),
    notify: { text: 'THE VILLAGE IS IN DANGER!', kind: 'bad', sub: 'Flames are reaching the houses.' },
  }),
  rule({
    id: 'building-lost',
    title: 'Building Lost',
    trigger: 'BUILDING_DESTROYED',
    cooldown: 20,
    condition: () => true,
    notify: { text: 'A BUILDING BURNED DOWN', kind: 'bad', sub: 'Builders will need wood to rebuild it.' },
    god: { text: 'THE INSURANCE DOES NOT COVER THIS.', priority: 1 },
  }),

  // Chain D — The Miracle Forest.
  rule({
    id: 'plant-near-village',
    title: 'Tree near village',
    trigger: 'TREE_PLANTED',
    cooldown: 0,
    condition: (sim, e) => e.byPlayer && sim.nearestVillage(e.x, e.z).distance < 38,
    effects: (sim) => sim.remember('plant-near-village'),
  }),
  rule({
    id: 'miracle-forest',
    title: 'The Miracle Forest',
    trigger: 'TREE_PLANTED',
    cooldown: 90,
    condition: (sim, e) => e.byPlayer && sim.recentCount('plant-near-village', 45) >= 4,
    effects: (sim, e) => {
      const { village } = sim.nearestVillage(e.x, e.z);
      if (!village) return;
      village.wood = Math.min(120, village.wood + 12);
      for (const v of sim.state.villagers) {
        if (v.alive && v.villageId === village.id) {
          v.happiness = Math.min(1, v.happiness + 0.1);
          v.fear = Math.max(0, v.fear - 0.1);
        }
      }
      sim.addApproval(3, 'Miracle forest');
      celebrate(sim, village.id, 'miracle-forest');
    },
    notify: { text: 'A MIRACLE FOREST!', kind: 'good', sub: '+12 wood. The villagers hold a gratitude festival.' },
  }),

  // Chain E — Divine Neglect.
  rule({
    id: 'divine-neglect',
    title: 'Divine Neglect',
    trigger: 'TICK',
    cooldown: 120,
    condition: (sim) =>
      sim.state.villages.some(
        (v) =>
          (v.shortageTime > 50 &&
            sim.state.prayers.some((p) => p.status === 'active' && p.villageId === v.id && sim.state.time - p.createdAt > 45)) ||
          v.ignoredPrayers >= 2,
      ),
    effects: (sim) => {
      for (const village of sim.state.villages) {
        for (const v of sim.state.villagers) {
          if (v.alive && v.villageId === village.id) v.happiness = Math.max(0, v.happiness - 0.1);
        }
        sim.addVillageFaith(village, -0.1);
        village.ignoredPrayers = 0;
      }
      sim.addApproval(-5, 'Divine neglect');
    },
    notify: { text: 'THE PEOPLE ARE BEGINNING TO QUESTION MANAGEMENT.', kind: 'bad', sub: 'Unanswered prayers erode faith.' },
    god: { text: 'YOU HAD ONE JOB.', priority: 2 },
  }),

  // Chain F — Arsonist turned firefighter: raises approval and chaos together.
  rule({
    id: 'hero-firefighter',
    title: 'Arsonist Turned Hero',
    trigger: 'PRAYER_COMPLETED',
    cooldown: 120,
    condition: (sim, e) => e.prayer.type === 'FIRE' && sim.state.stats.firesStarted > 0,
    effects: (sim) => {
      sim.addApproval(4, 'Heroic rescue');
      sim.addChaos(5, 'Suspiciously convenient rescue');
    },
    notify: { text: 'ARSONIST TURNED HERO', kind: 'chaos', sub: 'You put out the fire. Nobody asks who started it.' },
    god: { text: 'I AM CHOOSING NOT TO ASK HOW THAT FIRE STARTED.', priority: 1 },
  }),

  // Supporting reactions tied to concrete events.
  rule({
    id: 'smote',
    title: 'Smiting',
    trigger: 'VILLAGER_DIED',
    cooldown: 30,
    condition: (_sim, e) => e.cause === 'lightning',
    notify: { text: 'A VILLAGER WAS SMITTEN', kind: 'bad' },
    god: { text: 'ARE THE HUMANS SUPPOSED TO BE SCREAMING?', priority: 2 },
  }),
  rule({
    id: 'mourning',
    title: 'Mourning',
    trigger: 'VILLAGER_DIED',
    cooldown: 15,
    condition: (_sim, e) => e.cause !== 'lightning',
    notify: { text: 'A VILLAGER HAS DIED', kind: 'bad' },
  }),
  rule({
    id: 'rain-saves',
    title: 'Rain Douses Fire',
    trigger: 'FIRE_EXTINGUISHED',
    cooldown: 25,
    condition: (_sim, e) => e.byRain,
    notify: { text: 'FIRE EXTINGUISHED', kind: 'good', sub: 'Steam. Relief. Mild applause.' },
  }),
  rule({
    id: 'regrowth',
    title: 'Life Finds a Way',
    trigger: 'TREE_REGROWN',
    cooldown: 60,
    condition: () => true,
    notify: { text: 'LIFE FINDS A WAY', kind: 'good', sub: 'Rain-soaked ashes sprout new saplings.' },
  }),
  rule({
    id: 'baby',
    title: 'Birth',
    trigger: 'VILLAGER_BORN',
    cooldown: 10,
    condition: () => true,
    effects: (sim, e) => sim.notify('A NEW VILLAGER IS BORN', 'good', `Welcome, ${e.name}.`),
  }),
  rule({
    id: 'first-thunder',
    title: 'First Thunder',
    trigger: 'LIGHTNING_STRUCK',
    cooldown: 9999,
    condition: (sim) => sim.state.stats.lightningStrikes === 1,
    god: { text: 'THAT WAS NOT IN THE TRAINING MANUAL.', priority: 1 },
  }),
  rule({
    id: 'explosion-panic',
    title: 'Divine Panic',
    trigger: 'LIGHTNING_STRUCK',
    cooldown: 40,
    condition: (_sim, e) => e.buildingsHit > 0,
    notify: { text: 'SOMETHING EXPLODED!', kind: 'chaos', sub: 'Everyone is screaming.' },
  }),
  rule({
    id: 'taxes',
    title: 'Taxes',
    trigger: 'TICK',
    cooldown: 600,
    condition: (sim) => sim.state.villages.some((v) => v.prosperity > 0.72 && v.population >= 22),
    effects: (sim) => sim.addChaos(3, 'Taxes'),
    god: { text: 'THEY HAVE INVENTED TAXES. THIS IS YOUR FAULT.', priority: 1 },
  }),
  rule({
    id: 'rock-worship',
    title: 'Zealotry',
    trigger: 'TICK',
    cooldown: 400,
    condition: (sim) => sim.state.villages.some((v) => v.faith > 0.85),
    god: { text: 'WHY ARE THEY WORSHIPPING A ROCK?', priority: 1 },
  }),
  rule({
    id: 'left-alone',
    title: 'Day Two',
    trigger: 'TICK',
    cooldown: 99999,
    condition: (sim) => sim.day >= 2 && sim.state.chaos > 20,
    god: { text: 'I LEFT YOU ALONE FOR SIX MINUTES.', priority: 2 },
  }),
  rule({
    id: 'handbook',
    title: 'Low approval',
    trigger: 'TICK',
    cooldown: 180,
    condition: (sim) => sim.state.approval < 25,
    god: { text: 'PLEASE READ THE EMPLOYEE HANDBOOK.', priority: 2 },
  }),
  rule({
    id: 'starving',
    title: 'Starvation',
    trigger: 'VILLAGE_STARVING',
    cooldown: 60,
    condition: () => true,
    notify: { text: 'THE VILLAGE IS STARVING', kind: 'bad', sub: 'Rain on the farm grows crops faster.' },
  }),
];
