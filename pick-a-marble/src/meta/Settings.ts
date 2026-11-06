import { readJSON, STORAGE_KEYS, writeJSON } from './SaveManager';

export type Quality = 'low' | 'medium' | 'high';

export interface SettingsData {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  quality: Quality;
  showFps: boolean;
  tutorials: Record<string, boolean>;
  lastSkins: string[];
  lastNames: Record<string, string>;
  marbleCount: number;
}

const DEFAULTS: SettingsData = {
  master: 0.8,
  music: 0.55,
  sfx: 0.85,
  muted: false,
  quality: 'high',
  showFps: false,
  tutorials: {},
  lastSkins: [],
  lastNames: {},
  marbleCount: 8,
};

export class Settings {
  data: SettingsData;
  private listeners: ((s: SettingsData) => void)[] = [];

  constructor() {
    const stored = readJSON<Partial<SettingsData>>(STORAGE_KEYS.settings, {});
    this.data = { ...DEFAULTS, ...stored, tutorials: { ...(stored.tutorials ?? {}) }, lastNames: { ...(stored.lastNames ?? {}) } };
    if (!stored.quality) this.data.quality = guessQuality();
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
    this.save();
  }

  save(): void {
    writeJSON(STORAGE_KEYS.settings, this.data);
    for (const l of this.listeners) l(this.data);
  }

  onChange(fn: (s: SettingsData) => void): void {
    this.listeners.push(fn);
  }

  seenTutorial(id: string): boolean {
    return !!this.data.tutorials[id];
  }

  markTutorial(id: string): void {
    this.data.tutorials[id] = true;
    this.save();
  }
}

function guessQuality(): Quality {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (coarse || small) return cores >= 8 ? 'medium' : 'low';
  return cores >= 4 ? 'high' : 'medium';
}
