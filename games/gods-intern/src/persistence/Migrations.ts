import { CONFIG } from '../core/Config';
import type { CivState, CultureState, GameStateData, VillagerData } from '../core/types';
import { POWER_ORDER } from '../core/Config';
import { defaultCareer } from '../career/CareerSystem';
import { defaultHeaven } from '../career/HeavenSystem';
import { identityFor } from '../world/Settlements';
import { traitsFromId } from '../culture/Personality';

export function defaultCulture(): CultureState {
  return {
    pressure: {},
    lastReligionAt: -9999,
    picnicUntil: 0,
    picnickers: [],
    picnicSpot: null,
    upsideDownUntil: 0,
    cursedWell: null,
    festivals: [],
    festivalUntil: 0,
    officeBuilt: false,
    officeProgress: 0,
    firePit: null,
    fireRisk: 0,
    silence: false,
    trial: null,
    rainBannedUntil: 0,
    potatoCult: false,
    rockKingId: -1,
    lastRockSign: 0,
    decree: null,
    prosperityTime: 0,
    ignoredStreak: 0,
    improvements: [],
    argumentUntil: 0,
    lastMajorEvent: -9999,
    mutationUnlockedNotified: false,
    eventsFired: [],
  };
}

export function defaultCivState(): CivState {
  return {
    relations: {},
    caravans: [],
    favorEvents: [],
    lastFavoritismAt: -9999,
    rivalries: {},
    challenges: {},
    pinned: [],
    titles: [],
    selectedTitle: null,
    cosmetics: [],
    visited: [],
    shippingFees: false,
    luxuryCarrots: false,
    lastMigrationAt: -9999,
    officePrayersCounted: false,
  };
}

/**
 * Upgrade a save to the current schema in place. v1 → v2 adds personalities,
 * memories, religions, sacred objects, mutations, history, rocks and culture
 * state. Rocks need the terrain, so an empty list is filled by the Simulation
 * (see Simulation.ensureWorldFeatures). Missing fields get defaults; existing
 * fields are never overwritten.
 */
export function migrateState(state: GameStateData): GameStateData {
  const s = state as GameStateData & Record<string, unknown>;
  if (s.version < 2) {
    for (const v of s.villagers as VillagerData[]) {
      const anyV = v as VillagerData & Partial<Record<string, unknown>>;
      if (!Array.isArray(anyV.traits)) v.traits = traitsFromId(v.id);
      if (anyV.religionId === undefined) v.religionId = null;
      if (!Array.isArray(anyV.memoryIds)) v.memoryIds = [];
      if (anyV.mutation === undefined) v.mutation = null;
      if (anyV.title === undefined) v.title = null;
    }
    s.version = 2;
  }
  if (!Array.isArray(s.rocks)) s.rocks = [];
  if (!Array.isArray(s.memories)) s.memories = [];
  if (!Array.isArray(s.religions)) s.religions = [];
  if (!Array.isArray(s.sacred)) s.sacred = [];
  if (!Array.isArray(s.mutations)) s.mutations = [];
  if (!Array.isArray(s.history)) s.history = [];
  s.culture = { ...defaultCulture(), ...((s.culture as Partial<CultureState>) ?? {}) };
  if (typeof s.cooldowns.mutation !== 'number') s.cooldowns.mutation = 0;
  // v2 → v3: civilization layer. New villages are added by the Simulation
  // (they need the terrain); here we only extend existing records.
  if (s.version < 3) {
    for (const v of s.villages) {
      const anyV = v as typeof v & Partial<Record<string, unknown>>;
      if (typeof anyV.stone !== 'number') v.stone = 0;
      if (!anyV.identity) v.identity = identityFor(v.id, 'agricultural');
      if (!Array.isArray(anyV.quarryIds)) v.quarryIds = [];
      if (!Array.isArray(anyV.fisheryIds)) v.fisheryIds = [];
    }
    for (const b of s.buildings) if (!b.style) b.style = 'agricultural';
    s.version = 3;
  }
  const st = s.stats as unknown as Record<string, number>;
  for (const k of ['tradesCompleted', 'tradesFailed', 'migrations', 'religionSpreads', 'prayersAfterOffice']) if (typeof st[k] !== 'number') st[k] = 0;
  s.civ = { ...defaultCivState(), ...((s.civ as Partial<CivState>) ?? {}) };
  // v3 → v4: Heavenly Career, new powers, effects, terrain edits, graveyard, discoveries.
  // Deterministic and additive: nothing existing is reset.
  const d = defaultV4State();
  const anyS = s as GameStateData & Partial<Record<string, unknown>>;
  if (anyS.mode !== 'career' && anyS.mode !== 'creative') s.mode = d.mode;
  s.career = { ...defaultCareer(), ...((anyS.career as object) ?? {}) };
  for (const k of ['effects', 'terrainEdits', 'graveyard', 'discoveries', 'craters'] as const) if (!Array.isArray(anyS[k])) (s as unknown as Record<string, unknown>)[k] = [];
  if (anyS.possession === undefined) s.possession = null;
  s.heaven = { ...defaultHeaven(), ...((anyS.heaven as object) ?? {}) };
  for (const id of POWER_ORDER) if (typeof s.cooldowns[id] !== 'number') s.cooldowns[id] = 0;
  if (s.version < 4) s.version = 4;
  // v4 → v5: new career economy. Never demote: keep the rank (XP is raised to at least
  // the new threshold of the rank already earned), keep every unlocked power, and keep
  // the award ledger so nothing pays out twice. No promotion events fire on migration.
  if (s.version < 5) {
    const c = s.career;
    c.rank = Math.max(1, Math.min(CONFIG.career.thresholds.length, Math.round(c.rank) || 1));
    c.xp = Math.max(c.xp, CONFIG.career.thresholds[c.rank - 1]);
    s.version = 5;
  }
  if (!Array.isArray(s.tutorial.tipsSeen)) s.tutorial.tipsSeen = [];
  return s;
}

export function defaultV4State(): Pick<GameStateData, 'mode' | 'career' | 'effects' | 'terrainEdits' | 'graveyard' | 'discoveries' | 'possession' | 'heaven' | 'craters'> {
  return { mode: 'career', career: defaultCareer(), effects: [], terrainEdits: [], graveyard: [], discoveries: [], possession: null, heaven: defaultHeaven(), craters: [] };
}
