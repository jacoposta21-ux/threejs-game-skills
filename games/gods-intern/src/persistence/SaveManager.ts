import type { GameStateData } from '../core/types';
import { SAVE_VERSION } from '../world/WorldGen';
import { migrateState } from './Migrations';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'gods-intern.save';
export const AUTOSAVE_KEY = 'gods-intern.autosave';

/** v0.4: Career and Creative progress live in separate save slots. Career keeps the original keys. */
export function slotKey(mode: 'career' | 'creative', auto: boolean): string {
  if (mode === 'career') return auto ? AUTOSAVE_KEY : SAVE_KEY;
  return auto ? 'gods-intern.creative.autosave' : 'gods-intern.creative.save';
}
export const SETTINGS_KEY = 'gods-intern.settings';

export interface SaveEnvelope {
  version: number;
  savedAt: number;
  state: GameStateData;
}

export type LoadResult =
  | { ok: true; state: GameStateData; savedAt: number }
  | { ok: false; reason: 'missing' | 'corrupt' | 'outdated' | 'invalid' };

/** In-memory fallback when localStorage is unavailable (private mode, iframes). */
export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

export function browserStore(): KeyValueStore {
  try {
    const probe = '__gi_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return new MemoryStore();
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isArr = Array.isArray;

/** Structural validation of the fields the simulation relies on. */
export function validateState(s: unknown): s is GameStateData {
  if (!s || typeof s !== 'object') return false;
  const st = s as Record<string, unknown>;
  if (!isNum(st.version) || !isNum(st.seed) || !isNum(st.time) || !isNum(st.energy)) return false;
  if (!isNum(st.approval) || !isNum(st.chaos) || !isNum(st.rngState) || !isNum(st.nextId)) return false;
  for (const key of ['villages', 'villagers', 'buildings', 'trees', 'fires', 'clouds', 'moisture', 'flood', 'prayers', 'unlockedPowers']) {
    if (!isArr(st[key])) return false;
  }
  if (!st.cooldowns || typeof st.cooldowns !== 'object') return false;
  if (!st.tutorial || typeof st.tutorial !== 'object') return false;
  const villagers = st.villagers as Array<Record<string, unknown>>;
  for (const v of villagers) {
    if (typeof v.id !== 'string' || !v.position || !v.currentTask || !isNum(v.hunger) || !v.look) return false;
  }
  const villages = st.villages as Array<Record<string, unknown>>;
  if (!villages.length) return false;
  for (const v of villages) if (!isNum(v.food) || !isNum(v.water) || !isNum(v.centerX)) return false;
  for (const t of st.trees as Array<Record<string, unknown>>) if (!isNum(t.x) || !isNum(t.growth)) return false;
  if ((st.moisture as unknown[]).length !== (st.flood as unknown[]).length) return false;
  return true;
}

/** Version migrations. Unknown future versions are rejected. */
function migrate(state: GameStateData): GameStateData | null {
  if (state.version > SAVE_VERSION || state.version < 1) return null;
  return migrateState(state);
}

export class SaveManager {
  constructor(private readonly store: KeyValueStore) {}

  serialize(state: GameStateData): string {
    const envelope: SaveEnvelope = { version: SAVE_VERSION, savedAt: Date.now(), state };
    return JSON.stringify(envelope);
  }

  deserialize(raw: string | null): LoadResult {
    if (!raw) return { ok: false, reason: 'missing' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'corrupt' };
    }
    const env = parsed as Partial<SaveEnvelope>;
    if (!env || typeof env !== 'object' || !env.state) return { ok: false, reason: 'corrupt' };
    if (!isNum(env.version) || env.version > SAVE_VERSION) return { ok: false, reason: 'outdated' };
    if (!validateState(env.state)) return { ok: false, reason: 'invalid' };
    const migrated = migrate(env.state);
    if (!migrated) return { ok: false, reason: 'outdated' };
    return { ok: true, state: migrated, savedAt: env.savedAt ?? 0 };
  }

  save(state: GameStateData, key = SAVE_KEY): boolean {
    try {
      this.store.setItem(key, this.serialize(state));
      return true;
    } catch {
      return false;
    }
  }

  load(key = SAVE_KEY): LoadResult {
    try {
      return this.deserialize(this.store.getItem(key));
    } catch {
      return { ok: false, reason: 'corrupt' };
    }
  }

  has(key = SAVE_KEY): boolean {
    try {
      return this.store.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  clear(key = SAVE_KEY): void {
    try {
      this.store.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }
}
