/**
 * Central tuning table. Every gameplay number that a designer might want to
 * change lives here so systems stay free of magic constants.
 *
 * Units: world units (1 ≈ 1 metre), simulation seconds, resources in "units".
 * Normalized villager stats are 0..1 (see core/types.ts for the convention).
 */
export const CONFIG = {
  world: {
    size: 160,
    segments: 160,
    seaLevel: 0,
    islandRadius: 64,
  },
  sim: {
    hz: 20,
    maxStepsPerFrame: 8,
  },
  time: {
    dayLength: 360, // seconds per in-game day (6 real minutes)
    startTimeOfDay: 0.3, // 0 = midnight, 0.25 = 6:00, 0.5 = noon
    nightStart: 0.82,
    morning: 0.26,
  },
  energy: {
    max: 100,
    start: 100,
    regen: 5,
  },
  powers: {
    rain: { cost: 15, cooldown: 1.0, radius: 9, duration: 8 },
    lightning: { cost: 20, cooldown: 1.5, radius: 3.2 },
    nature: { cost: 10, cooldown: 0.3, radius: 1.4 },
    fire: { cost: 15, cooldown: 1.0, radius: 2.6 },
  },
  cells: {
    size: 4,
    count: 40, // 40 × 4 = 160 world units
    baseMoisture: 0.3,
    relaxRate: 0.0022, // moisture drifts back to groundwater baseline per second
  },
  rain: {
    moisturePerSec: 0.1,
    wellWaterPerSec: 5,
    fireDampPerSec: 0.75,
  },
  flood: {
    puddleLevel: 0.12,
    eventLevel: 0.25,
    recededLevel: 0.08,
    drainPerSec: 0.018,
    cropDamagePerSec: 0.05,
    max: 2,
  },
  fire: {
    maxActive: 70,
    spreadInterval: 0.6,
    spreadRadius: 5.5,
    baseSpread: 0.24,
    growPerSec: 0.35,
    treeFuel: 12,
    buildingFuel: 26,
    groundFuel: 5,
    buildingDamagePerSec: 4.2,
    extinguishBelow: 0.08,
    maxSpreadChecksPerTick: 24,
  },
  trees: {
    playerGrowSeconds: 1.6,
    regrowDelay: 90,
    regrowMoisture: 0.42,
    naturalGrowSeconds: 60,
    maxTrees: 1400,
    minSpacing: 1.3,
  },
  villager: {
    walkSpeed: 2.3,
    runSpeed: 4.8,
    hungerPerSec: 1 / 300,
    thirstPerSec: 1 / 230,
    hungerSeek: 0.55,
    thirstSeek: 0.5,
    starveDamagePerSec: 0.006,
    fearDecayPerSec: 0.006,
    fireFearRadius: 15,
    fleeRadius: 9,
    decisionInterval: 1.2,
  },
  village: {
    startFood: 70,
    startWater: 24,
    startWood: 30,
    maxFood: 160,
    maxWater: 100,
    maxWood: 120,
    wellRefillBase: 0.05,
    wellRefillMoisture: 0.15,
    radius: 22,
    birthInterval: 75,
    houseCapacity: 4,
    repairWood: 5,
    repairAmount: 25,
  },
  farm: {
    baseGrowth: 1 / 140,
    harvestYield: 22,
  },
  prayers: {
    maxActive: 3,
    defaultExpiry: 150,
    repeatCooldown: 45,
  },
  reputation: {
    startApproval: 50,
    startChaos: 0,
  },
  autosaveInterval: 60,
  godMessageCooldown: 22,
} as const;

export type PowerId = 'rain' | 'lightning' | 'nature' | 'fire';
export const POWER_ORDER: PowerId[] = ['rain', 'lightning', 'nature', 'fire'];
