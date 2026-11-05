export type Quality = 'low' | 'medium' | 'high';

export interface SettingsData {
  version: 1;
  master: number;
  music: number;
  sfx: number;
  sensitivity: number;
  invertY: boolean;
  quality: Quality;
  subtitles: boolean;
}

const KEY = 'littlenight.settings.v1';

export function defaultSettings(): SettingsData {
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return {
    version: 1,
    master: 0.8,
    music: 0.7,
    sfx: 0.9,
    sensitivity: 1,
    invertY: false,
    quality: coarse ? 'low' : 'medium',
    subtitles: true,
  };
}

export function loadSettings(): SettingsData {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<SettingsData>;
    if (parsed.version !== 1) return base;
    return { ...base, ...parsed, version: 1 };
  } catch {
    return base;
  }
}

export function saveSettings(settings: SettingsData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable (private mode); settings stay in memory */
  }
}
