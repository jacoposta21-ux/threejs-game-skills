/** localStorage save (key pw_save_v1). Every access is guarded: failure never stops the game. */
import { UPGRADES, type UpgradeId } from './rules.ts';

export const SAVE_KEY = 'pw_save_v1';

export interface SaveData {
  v: 1;
  coins: number;
  stars: number[]; // best stars per turn, index 0 = turn 1
  upgrades: Record<UpgradeId, number>;
  muted: boolean;
  quality: 'auto' | 'high' | 'low';
  unlocked: string[]; // districts announced as unlocked
  lastTurn: number;
}

export function defaultSave(): SaveData {
  return {
    v: 1,
    coins: 0,
    stars: new Array(30).fill(0),
    upgrades: { motor: 0, suspension: 0, rack: 0, bag: 0 },
    muted: false,
    quality: 'auto',
    unlocked: ['centro'],
    lastTurn: 1,
  };
}

const clampInt = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : d;

/** Parse and sanitise; anything corrupt falls back to defaults field by field. */
export function parseSave(raw: string | null): SaveData {
  const d = defaultSave();
  if (!raw) return d;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw);
  } catch {
    return d;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== 1) return d;
  const up = (o.upgrades && typeof o.upgrades === 'object' ? o.upgrades : {}) as Record<string, unknown>;
  const stars = Array.isArray(o.stars) ? o.stars : [];
  return {
    v: 1,
    coins: clampInt(o.coins, 0, 1e9, 0),
    stars: d.stars.map((_, i) => clampInt(stars[i], 0, 3, 0)),
    upgrades: {
      motor: clampInt(up.motor, 0, UPGRADES.motor.max, 0),
      suspension: clampInt(up.suspension, 0, UPGRADES.suspension.max, 0),
      rack: clampInt(up.rack, 0, UPGRADES.rack.max, 0),
      bag: clampInt(up.bag, 0, UPGRADES.bag.max, 0),
    },
    muted: o.muted === true,
    quality: o.quality === 'high' || o.quality === 'low' ? o.quality : 'auto',
    unlocked: Array.isArray(o.unlocked) ? o.unlocked.filter((x): x is string => typeof x === 'string') : ['centro'],
    lastTurn: clampInt(o.lastTurn, 1, 30, 1),
  };
}

export function loadSave(storage: Pick<Storage, 'getItem'> | null = safeStorage()): SaveData {
  try {
    return parseSave(storage ? storage.getItem(SAVE_KEY) : null);
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: SaveData, storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function totalStars(s: SaveData): number {
  return s.stars.reduce((a, b) => a + b, 0);
}
