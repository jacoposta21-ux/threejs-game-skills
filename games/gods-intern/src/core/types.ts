import type { PowerId } from './Config';

/**
 * Logical game state. Everything here is plain JSON-serializable data: the
 * save system writes it as-is and the renderer rebuilds visuals from it.
 *
 * Normalization convention (all 0..1):
 *  - hunger, thirst, fear     → unmet needs / negative states (0 = fine, 1 = critical)
 *  - health, happiness, faith → positive states (1 = best)
 * Village resources (food, water, wood) are absolute units capped by CONFIG.village.
 * Village faith/happiness/fear are averages of living villagers (0..1);
 * prosperity is a derived 0..1 score.
 */

export interface Vector3Data {
  x: number;
  y: number;
  z: number;
}

export type VillagerStateName =
  | 'IDLE'
  | 'WANDERING'
  | 'WORKING'
  | 'SEEKING_FOOD'
  | 'SEEKING_WATER'
  | 'RESTING'
  | 'FLEEING'
  | 'PRAYING'
  | 'CELEBRATING'
  | 'DEAD';

export type VillagerJob = 'farmer' | 'woodcutter' | 'builder' | 'idler';

export interface VillagerTask {
  state: VillagerStateName;
  /** Destination in world space; walking happens while path is non-empty. */
  targetX: number;
  targetZ: number;
  targetId: number | null;
  /** Seconds remaining in the current activity after arrival. */
  timer: number;
  /** Activity sub-kind, e.g. 'farm' | 'chop' | 'repair' | 'drink-well' | 'drink-river'. */
  activity: string;
  arrived: boolean;
}

export type ThoughtIcon = 'question' | 'alarm' | 'heart' | 'pray' | 'water' | 'food' | 'sleep' | null;

export interface VillagerData {
  id: string;
  name: string;
  age: number;
  health: number;
  hunger: number;
  thirst: number;
  happiness: number;
  fear: number;
  faith: number;
  villageId: string;
  position: Vector3Data;
  heading: number;
  currentTask: VillagerTask;
  alive: boolean;
  job: VillagerJob;
  homeId: number;
  path: number[]; // flattened [x0, z0, x1, z1, ...]
  pathIndex: number;
  decisionTimer: number;
  thought: ThoughtIcon;
  thoughtTimer: number;
  /** Seconds since death, used to fade and prune bodies. */
  deadTime: number;
  causeOfDeath: string | null;
  look: VillagerLook;
}

export interface VillagerLook {
  skin: number;
  shirt: number;
  pants: number;
  hair: number;
  hairStyle: 0 | 1 | 2 | 3; // bald, short, bun, hat
  height: number;
}

export interface VillageData {
  id: string;
  name: string;
  population: number;
  food: number;
  water: number;
  wood: number;
  faith: number;
  happiness: number;
  fear: number;
  prosperity: number;
  centerX: number;
  centerZ: number;
  radius: number;
  wellId: number;
  storageId: number;
  shrineId: number;
  farmIds: number[];
  houseIds: number[];
  birthTimer: number;
  shortageTime: number;
  ignoredPrayers: number;
  flood: number;
  floodActive: boolean;
  treesNearby: number;
  problems: string[];
}

export type BuildingType = 'house' | 'well' | 'farm' | 'storage' | 'shrine';

export interface BuildingData {
  id: number;
  type: BuildingType;
  villageId: string;
  x: number;
  z: number;
  rotation: number;
  health: number; // 0..100
  destroyed: boolean;
  footprint: number; // collision radius
  /** Farm-only crop state. */
  cropGrowth: number;
  cropHealth: number;
  variant: number;
}

export type TreeKind = 'oak' | 'pine' | 'bush';

export interface TreeData {
  id: number;
  kind: TreeKind;
  x: number;
  z: number;
  /** 0..1, visual scale target. */
  growth: number;
  growRate: number;
  health: number;
  burning: boolean;
  charred: boolean;
  charredTime: number;
  byPlayer: boolean;
  scale: number;
  rot: number;
  removed: boolean;
}

export type FireKind = 'tree' | 'building' | 'ground';

export interface FireData {
  id: number;
  kind: FireKind;
  targetId: number;
  x: number;
  z: number;
  intensity: number;
  fuel: number;
  age: number;
  spreadTimer: number;
  byPlayer: boolean;
}

export interface CloudData {
  id: number;
  x: number;
  z: number;
  radius: number;
  timeLeft: number;
  duration: number;
}

export interface PrayerData {
  id: string;
  title: string;
  description: string;
  objective: string;
  villageId: string;
  type: string;
  priority: number; // 1 low … 3 urgent
  status: 'active' | 'completed' | 'failed';
  createdAt: number;
  expiresAt?: number;
  reward: number;
  progress: number;
  targetX: number;
  targetZ: number;
  /** Definition-specific counters (baseline values, counts). */
  data: Record<string, number>;
  resolvedAt?: number;
}

export interface TutorialState {
  step: number;
  done: boolean;
  timer: number;
  rainsCast: number;
}

export interface StatsData {
  treesPlanted: number;
  firesStarted: number;
  lightningStrikes: number;
  rainsCast: number;
  villagersLost: number;
  villagersBorn: number;
  prayersAnswered: number;
  prayersFailed: number;
  buildingsLost: number;
}

export interface GameStateData {
  version: number;
  seed: number;
  rngState: number;
  time: number;
  nextId: number;
  energy: number;
  cooldowns: Record<PowerId, number>;
  unlockedPowers: PowerId[];
  approval: number;
  chaos: number;
  villages: VillageData[];
  villagers: VillagerData[];
  buildings: BuildingData[];
  trees: TreeData[];
  fires: FireData[];
  clouds: CloudData[];
  moisture: number[];
  flood: number[];
  prayers: PrayerData[];
  prayerCooldowns: Record<string, number>;
  consequenceCooldowns: Record<string, number>;
  /** Short rolling memory of timed events used by consequence conditions. */
  recent: Record<string, number[]>;
  tutorial: TutorialState;
  stats: StatsData;
  lastGodMessage: number;
}
