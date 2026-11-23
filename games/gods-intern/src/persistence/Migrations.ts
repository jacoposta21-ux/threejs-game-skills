import type { CultureState, GameStateData, VillagerData } from '../core/types';
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
  return s;
}
