/** Save (de)serialization with validation. Pure: storage access lives in the game layer. */
import { CONFIG, type EconomyConfig } from './config.ts';
import { createState, type GameState, UPGRADE_IDS } from './model.ts';

export const SAVE_KEY = 'cot_save_v1';

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

function num(v: unknown, def: number, min = -Infinity, max = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
}

/**
 * Parses a save. Anything invalid (bad JSON, wrong version, wrong shapes)
 * yields a fresh state; individual bad fields fall back to defaults.
 */
export function deserialize(raw: string | null | undefined, now = Date.now(), cfg: EconomyConfig = CONFIG): { state: GameState; restored: boolean } {
  const fresh = createState(now, cfg);
  if (!raw) return { state: fresh, restored: false };
  let d: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { state: fresh, restored: false };
    d = parsed as Record<string, unknown>;
  } catch {
    return { state: fresh, restored: false };
  }
  if (d.v !== 1) return { state: fresh, restored: false };
  const size = cfg.cols * cfg.rows;
  if (!Array.isArray(d.grid) || d.grid.length !== size) return { state: fresh, restored: false };

  const s = fresh;
  s.grid = d.grid.map((x) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= cfg.maxLevel ? x : 0));
  s.coins = num(d.coins, 0, 0);
  s.poolsBought = Math.floor(num(d.poolsBought, 0, 0));
  const up = (d.upgrades && typeof d.upgrades === 'object' ? d.upgrades : {}) as Record<string, unknown>;
  for (const id of UPGRADE_IDS) s.upgrades[id] = Math.floor(num(up[id], 0, 0, cfg.upgrades[id].max));
  s.spawnTimer = num(d.spawnTimer, 0, 0, cfg.autoSpawnSec);
  if (Array.isArray(d.unlocked)) for (let i = 0; i < cfg.maxLevel; i++) s.unlocked[i] = d.unlocked[i] === true;
  s.maxLevel = Math.floor(num(d.maxLevel, 0, 0, cfg.maxLevel));
  // the album must at least contain everything on the board
  for (const l of s.grid) if (l > 0) { s.unlocked[l - 1] = true; s.maxLevel = Math.max(s.maxLevel, l); }
  s.playTime = num(d.playTime, 0, 0);
  s.totalEarned = num(d.totalEarned, 0, 0);
  s.goldenTime = num(d.goldenTime, 0, 0, cfg.golden.videoDurationSec);
  s.boostTime = num(d.boostTime, 0, 0, cfg.boost.durationSec);
  s.nextGuestIn = num(d.nextGuestIn, s.nextGuestIn, 0, cfg.golden.maxIntervalSec);
  s.merges = Math.floor(num(d.merges, 0, 0));
  s.lastSeen = num(d.lastSeen, now, 0, now);
  s.muted = d.muted === true;
  return { state: s, restored: true };
}
