import { CONFIG } from '../core/Config';
import type { GameStateData, RelationCategory, RelationRecord } from '../core/types';
import { relationKey } from '../world/Settlements';
import type { Simulation } from '../simulation/SimulationManager';

/** Category bands (inclusive): Allied ≥60, Friendly 20..59, Neutral -19..19, Rival -59..-20, Hostile ≤-60. */
export function categoryOf(score: number): RelationCategory {
  if (score >= 60) return 'allied';
  if (score >= 20) return 'friendly';
  if (score > -20) return 'neutral';
  if (score > -60) return 'rival';
  return 'hostile';
}

export const CATEGORY_LABEL: Record<RelationCategory, string> = {
  allied: 'Allied',
  friendly: 'Friendly',
  neutral: 'Neutral',
  rival: 'Rival',
  hostile: 'Hostile',
};

/** How each category scales trade appetite. Hostile suspends trade entirely. */
export const TRADE_MULT: Record<RelationCategory, number> = { allied: 1.6, friendly: 1.2, neutral: 1, rival: 0.5, hostile: 0 };
/** How each category scales foreign religious influence. */
export const FAITH_MULT: Record<RelationCategory, number> = { allied: 1.4, friendly: 1.2, neutral: 1, rival: 0.6, hostile: 0.3 };

/** Starting attitudes: Puddleton is everyone's slightly annoying neighbour; the river and the mountain distrust each other. */
const INITIAL: Record<string, number> = { 'v1|v2': 12, 'v1|v3': 0, 'v2|v3': -14 };

/** Create any missing relation records (new worlds and migrated saves alike). Deterministic. */
export function ensureRelations(state: GameStateData): void {
  const ids = state.villages.map((v) => v.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const key = relationKey(ids[i], ids[j]);
      if (state.civ.relations[key]) continue;
      const score = INITIAL[key] ?? 0;
      state.civ.relations[key] = { score, category: categoryOf(score), negCauses: {}, everRival: score <= -20 };
    }
  }
}

export function relation(state: GameStateData, a: string, b: string): RelationRecord | undefined {
  return state.civ.relations[relationKey(a, b)];
}

export function relationCategory(state: GameStateData, a: string, b: string): RelationCategory {
  if (a === b) return 'allied';
  return relation(state, a, b)?.category ?? 'neutral';
}

/**
 * Apply a bounded relationship change. A single cause can never move the score by
 * more than CONFIG.civ.relationStep, scores stay in -100..100, and category
 * transitions emit RELATIONSHIP_CHANGED (the only place that event is emitted).
 */
export function changeRelation(sim: Simulation, a: string, b: string, delta: number, cause: string): number {
  if (a === b || !Number.isFinite(delta) || delta === 0) return 0;
  const rec = relation(sim.state, a, b);
  if (!rec) return 0;
  const step = Math.max(-CONFIG.civ.relationStep, Math.min(CONFIG.civ.relationStep, delta));
  const before = rec.score;
  rec.score = Math.max(-100, Math.min(100, before + step));
  const applied = rec.score - before;
  if (applied < 0) rec.negCauses[cause] = (rec.negCauses[cause] ?? 0) - applied;
  const from = rec.category;
  const to = categoryOf(rec.score);
  if (to !== from) {
    rec.category = to;
    const wasRival = rec.everRival;
    if (to === 'rival' || to === 'hostile') rec.everRival = true;
    sim.bus.emit('RELATIONSHIP_CHANGED', { a, b, score: rec.score, from, to, cause });
    // Keep the record of what pushed them apart small and relevant.
    if (to !== 'rival' && to !== 'hostile') rec.negCauses = {};
    void wasRival;
  }
  return applied;
}
