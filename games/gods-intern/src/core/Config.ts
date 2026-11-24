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
    mutation: { cost: 25, cooldown: 4, radius: 2.4, unlockChaos: 60 },
    // ---- v0.4 ----
    tornado: { cost: 30, cooldown: 12, radius: 5, duration: 14, speed: 3.2 },
    freeze: { cost: 25, cooldown: 8, radius: 8, duration: 30 },
    gravity: { cost: 25, cooldown: 8, radius: 7, duration: 12 },
    terraform: { cost: 15, cooldown: 1.2, radius: 4, step: 1.1, maxDelta: 4 },
    timewarp: { cost: 30, cooldown: 12, radius: 9, duration: 25, fast: 2.5, slow: 0.35 },
    possession: { cost: 35, cooldown: 30, radius: 2.5, duration: 45 },
    meteor: { cost: 60, cooldown: 40, radius: 8, warning: 3 },
    resurrection: { cost: 50, cooldown: 25, radius: 4, graveTtl: 900, maxGraves: 12 },
  },
  /** v0.4 Heavenly Career. */
  career: {
    // v0.5 rebalance (v0.4 was [0, 100, 250, 450, 750, 1150, 1700, 2400, 3300, 4500] with
    // large one-time rewards that unlocked several ranks in the first few minutes).
    thresholds: [0, 880, 1150, 1420, 1650, 2000, 2500, 3200, 4000, 5000],
    /** Mutation unlocks at this XP (a "probation review") or at its Chaos threshold, whichever comes first. */
    mutationXp: 700,
    /** Every XP source in one place (audit table in docs/VERIFICATION.md). v0.4 values in comments. */
    xp: {
      training: 10, // 25
      firstUse: 0, // 10 per power — now rewarded with +5 energy instead
      prayer: 12, // 25
      shortage: 4, // 10
      challenge: { easy: 10, medium: 20, hard: 45 }, // 30 / 60 / 120
      surreal: 8, // 40
      religion: 15, // 30 per religion → once per kind of religion
      sacredStage: 6, // 15
      monument: 20, // 40
      rescue: 2, // 4 (max 5/min) → max 4/min
      relation: 10, // 20
      witnessed: 2, // 3 (max 6 per 2 min) → max 3 per 2 min
      rebuilt: 3, // new: a village rebuilt after a disaster (max 2 per 2 min)
      resurrect: 10, // 25
      flood: 4, // 10
      consequence: 3, // 15 every 4 min per chain → once per chain (a discovery)
      meteor: 8, // 20
      comboScale: 0.35, // combos were 30–45, now 11–16
      mastery: 6, // new in v0.5
    },
    overtime: { duration: 30, cooldown: 180, cooldownMult: 0.25, regenMult: 4 },
    maxEffects: 8,
  },
  /** v0.2 culture systems: memory, belief, sacred objects, surreal events. */
  culture: {
    maxMemories: 80,
    memoryDecayPerSec: 0.0025,
    storeImpact: 0.25, // weaker events produce reactions but no stored memory
    permanentScore: 2.4, // impact × witnesses/3 above this never fades
    villagerMemorySlots: 8,
    perception: { minor: 14, notable: 24, dramatic: 34 },
    religionThreshold: 1.6, // accumulated belief pressure per archetype
    religionMinWitnesses: 3,
    maxReligions: 4,
    religionCooldown: 90,
    religionFadeAge: 420,
    maxSacred: 10,
    stageThresholds: [1, 2.5, 5, 9], // sacredness to reach stage 2..5
    maxDecorations: 8,
    shrineWood: 12,
    monumentWood: 24,
    maxHistory: 80,
    speechInterval: 1.2,
    speechVillagerCooldown: 8,
    rockWalkSpeed: 0.55,
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
  /** v0.3 civilization layer. */
  civ: {
    populationCap: 90,
    comfort: { food: 60, water: 50, wood: 40, stone: 20 } as Record<string, number>,
    maxStock: { food: 160, water: 100, wood: 120, stone: 80 } as Record<string, number>,
    tradeInterval: 12,
    maxCaravans: 3,
    caravanTimeout: 200,
    maxCargo: 15,
    migrationInterval: 30,
    migrationCooldown: 70,
    relationStep: 6, // max change from one event
    relationDrift: 0.5, // max drift per diplomacy update
    diplomacyInterval: 5,
    favorWindow: 300,
    favoritismGap: 40,
    favoritismCooldown: 120,
    pilgrimageInterval: 45,
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

export type PowerId =
  | 'rain' | 'lightning' | 'nature' | 'fire' | 'mutation'
  | 'tornado' | 'freeze' | 'gravity' | 'terraform' | 'timewarp' | 'possession' | 'meteor' | 'resurrection';
export const POWER_ORDER: PowerId[] = ['rain', 'lightning', 'nature', 'fire', 'mutation', 'tornado', 'freeze', 'gravity', 'terraform', 'timewarp', 'possession', 'meteor', 'resurrection'];
export type PowerCategory = 'Creation' | 'Weather' | 'Destruction' | 'Reality';
/** v0.5 categories (All Powers panel). */
export const POWER_CATEGORY: Record<PowerId, PowerCategory> = {
  nature: 'Creation', terraform: 'Creation', resurrection: 'Creation',
  rain: 'Weather', tornado: 'Weather', freeze: 'Weather',
  lightning: 'Destruction', fire: 'Destruction', meteor: 'Destruction',
  gravity: 'Reality', timewarp: 'Reality', mutation: 'Reality', possession: 'Reality',
};
export const POWER_UNLOCK_RANK: Partial<Record<PowerId, number>> = {
  tornado: 2, freeze: 3, gravity: 4, terraform: 5, timewarp: 6, possession: 7, meteor: 8, resurrection: 9,
};
/** Powers granted when the tutorial ends; Mutation unlocks through Chaos. */
export const BASIC_POWERS: PowerId[] = ['rain', 'lightning', 'nature', 'fire'];
