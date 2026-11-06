import { cloneTrack, sanitizeTrack } from '../track/Track';
import type { TrackData } from '../track/types';

/**
 * Local persistence. Everything goes through safe wrappers: storage can be
 * unavailable (private mode, iframes with blocked storage) and the game must
 * keep running in that case.
 *
 * The TrackData JSON is the same shape an online sharing backend would accept,
 * so a future `RemoteTrackStore` can implement `TrackStore` without changes to
 * the editor.
 */
export interface TrackStore {
  list(): TrackData[];
  get(id: string): TrackData | null;
  put(track: TrackData): void;
  remove(id: string): void;
}

const KEYS = {
  tracks: 'pam.tracks.v1',
  autosave: 'pam.autosave.v1',
  progress: 'pam.progress.v1',
  settings: 'pam.settings.v1',
};

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export class SaveManager implements TrackStore {
  private tracks: TrackData[];
  readonly MAX = 60;

  constructor() {
    const raw = readJSON<unknown[]>(KEYS.tracks, []);
    this.tracks = [];
    for (const r of Array.isArray(raw) ? raw : []) {
      try {
        this.tracks.push(sanitizeTrack(r));
      } catch {
        /* skip corrupted entry */
      }
    }
  }

  list(): TrackData[] {
    return this.tracks.slice().sort((a, b) => b.updated - a.updated);
  }

  get(id: string): TrackData | null {
    const t = this.tracks.find((x) => x.id === id);
    return t ? cloneTrack(t) : null;
  }

  put(track: TrackData): boolean {
    const copy = cloneTrack(track);
    copy.updated = Date.now();
    const i = this.tracks.findIndex((t) => t.id === copy.id);
    if (i >= 0) this.tracks[i] = copy;
    else this.tracks.push(copy);
    if (this.tracks.length > this.MAX) {
      this.tracks.sort((a, b) => b.updated - a.updated);
      this.tracks.length = this.MAX;
    }
    return this.flush();
  }

  rename(id: string, name: string): void {
    const t = this.tracks.find((x) => x.id === id);
    if (!t) return;
    t.name = name.slice(0, 40) || 'Untitled Track';
    t.updated = Date.now();
    this.flush();
  }

  duplicate(id: string): TrackData | null {
    const t = this.get(id);
    if (!t) return null;
    const now = Date.now();
    t.id = `t${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    t.name = `${t.name} (copy)`.slice(0, 40);
    t.created = now;
    this.put(t);
    return t;
  }

  remove(id: string): void {
    this.tracks = this.tracks.filter((t) => t.id !== id);
    this.flush();
  }

  private flush(): boolean {
    if (writeJSON(KEYS.tracks, this.tracks)) return true;
    // quota: drop thumbnails of the oldest tracks and retry
    const sorted = this.tracks.slice().sort((a, b) => a.updated - b.updated);
    for (const t of sorted) {
      delete t.thumb;
      if (writeJSON(KEYS.tracks, this.tracks)) return true;
    }
    return false;
  }

  autosave(track: TrackData): void {
    writeJSON(KEYS.autosave, track);
  }

  loadAutosave(): TrackData | null {
    const raw = readJSON<unknown>(KEYS.autosave, null);
    if (!raw) return null;
    try {
      return sanitizeTrack(raw);
    } catch {
      return null;
    }
  }

  clearAutosave(): void {
    try {
      window.localStorage.removeItem(KEYS.autosave);
    } catch {
      /* ignore */
    }
  }

  exportFile(track: TrackData): void {
    const data = cloneTrack(track);
    delete data.thumb;
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${track.name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'track'}.marbletrack.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  importFile(): Promise<TrackData> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return reject(new Error('No file'));
        if (file.size > 2_000_000) return reject(new Error('File too large'));
        file
          .text()
          .then((txt) => {
            const t = sanitizeTrack(JSON.parse(txt));
            const now = Date.now();
            t.id = `t${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
            t.created = now;
            resolve(t);
          })
          .catch((e) => reject(e instanceof Error ? e : new Error('Could not read file')));
      };
      input.click();
    });
  }
}

export const STORAGE_KEYS = KEYS;
