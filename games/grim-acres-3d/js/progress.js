// Lifetime progress shared by every save slot: achievements and statistics.
// Stored through the platform adapter (CrazyGames data or localStorage).
import { Platform } from './platform.js';
import { ACHIEVEMENTS } from './data/achievements.js';

const KEY = 'grimacres.progress';
const EMPTY = () => ({ unlocked: {}, stats: { games: 0, wins: 0, losses: 0, harvested: 0, earned: 0, clues: 0, quests: 0, fish: 0, pets: 0, days: 0, caught: {} } });

let data = null;

function load() {
  if (data) return data;
  data = EMPTY();
  try {
    const raw = Platform.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      data.unlocked = o.unlocked || {};
      data.stats = { ...data.stats, ...(o.stats || {}) };
    }
  } catch { /* corrupt progress: start fresh */ }
  return data;
}

function save() { Platform.setItem(KEY, JSON.stringify(data)); }

export const Progress = {
  get stats() { return load().stats; },
  get unlocked() { return load().unlocked; },
  add(stat, n = 1) { const s = load().stats; s[stat] = (s[stat] || 0) + n; save(); },
  caught(gnomerId) { const c = load().stats.caught; c[gnomerId] = (c[gnomerId] || 0) + 1; save(); },
  // Returns the ids newly unlocked by the current game state.
  check(game) {
    const d = load(), fresh = [];
    for (const a of ACHIEVEMENTS) {
      if (d.unlocked[a.id]) continue;
      let ok = false;
      try { ok = !!a.test(game, d); } catch { ok = false; }
      if (ok) { d.unlocked[a.id] = Date.now(); fresh.push(a.id); }
    }
    if (fresh.length) save();
    return fresh;
  },
};
