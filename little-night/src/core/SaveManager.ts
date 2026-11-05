import type { ChapterId } from './types';
import { CrazyGames } from '../integration/CrazyGamesSDK';

export const SAVE_VERSION = 2;
const KEY = 'littlenight.save';

export interface SaveData {
  version: number;
  chapter: ChapterId;
  checkpoint: string;
  flags: Record<string, unknown>;
  inventory: string[];
  lumoEnergy: number;
  lumoFound: boolean;
  completedChapters: ChapterId[];
  gameComplete: boolean;
  savedAt: number;
}

/**
 * Versioned save storage. localStorage is the source of truth; when the
 * CrazyGames SDK data module is available the save is mirrored there so a
 * signed-in player keeps progress across devices.
 */
export class SaveManager {
  load(): SaveData | null {
    const candidates: SaveData[] = [];
    const local = this.parse(this.readLocal());
    if (local) candidates.push(local);
    const remote = this.parse(CrazyGames.dataGet(KEY));
    if (remote) candidates.push(remote);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.savedAt - a.savedAt);
    return candidates[0];
  }

  save(data: Omit<SaveData, 'version' | 'savedAt'>): SaveData {
    const full: SaveData = { ...data, version: SAVE_VERSION, savedAt: Date.now() };
    const json = JSON.stringify(full);
    try {
      localStorage.setItem(KEY, json);
    } catch {
      /* ignore quota/private-mode failures; in-memory checkpoint still works */
    }
    CrazyGames.dataSet(KEY, json);
    return full;
  }

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
    CrazyGames.dataRemove(KEY);
  }

  hasSave(): boolean {
    const save = this.load();
    return Boolean(save && !save.gameComplete);
  }

  private readLocal(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  private parse(raw: string | null): SaveData | null {
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as SaveData;
      if (!data || typeof data !== 'object') return null;
      if (data.version !== SAVE_VERSION) return this.migrate(data);
      if (!['bedroom', 'kitchen', 'attic'].includes(data.chapter)) return null;
      return data;
    } catch {
      return null;
    }
  }

  /** Older save formats: keep the chapter, restart it from its first checkpoint. */
  private migrate(data: Partial<SaveData>): SaveData | null {
    if (!data.chapter || !['bedroom', 'kitchen', 'attic'].includes(data.chapter)) return null;
    return {
      version: SAVE_VERSION,
      chapter: data.chapter,
      checkpoint: 'start',
      flags: {},
      inventory: [],
      lumoEnergy: 60,
      lumoFound: data.chapter !== 'bedroom',
      completedChapters: data.completedChapters ?? [],
      gameComplete: false,
      savedAt: data.savedAt ?? 0,
    };
  }
}
