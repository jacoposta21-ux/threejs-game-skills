import type { GameState } from '../economy/model.ts';
import { SAVE_KEY, deserialize, serialize } from '../economy/save.ts';

/** localStorage wrapper: any failure is swallowed and the game keeps running without saving. */
export const storage = {
  available: true,
  load(now = Date.now()): { state: GameState; restored: boolean } {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch {
      this.available = false;
    }
    return deserialize(raw, now);
  },
  save(s: GameState): boolean {
    if (!this.available) return false;
    try {
      s.lastSeen = Date.now();
      localStorage.setItem(SAVE_KEY, serialize(s));
      return true;
    } catch {
      return false;
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  },
};
