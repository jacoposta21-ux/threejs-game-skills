import type { KeyValueStore } from '../persistence/SaveManager';
import { SETTINGS_KEY } from '../persistence/SaveManager';

export type QualityLevel = 'auto' | 'low' | 'medium' | 'high';

export interface Settings {
  masterVolume: number;
  sfxVolume: number;
  quality: QualityLevel;
  cameraSensitivity: number;
  unlimitedEnergy: boolean;
  reducedShake: boolean;
  tutorialSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.7,
  sfxVolume: 0.8,
  quality: 'auto',
  cameraSensitivity: 1,
  unlimitedEnergy: false,
  reducedShake: false,
  tutorialSeen: false,
};

const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

export function loadSettings(store: KeyValueStore): Settings {
  try {
    const raw = store.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      masterVolume: clamp(s.masterVolume, 0, 1, DEFAULT_SETTINGS.masterVolume),
      sfxVolume: clamp(s.sfxVolume, 0, 1, DEFAULT_SETTINGS.sfxVolume),
      quality: (['auto', 'low', 'medium', 'high'] as const).includes(s.quality as QualityLevel) ? (s.quality as QualityLevel) : 'auto',
      cameraSensitivity: clamp(s.cameraSensitivity, 0.3, 2, 1),
      unlimitedEnergy: s.unlimitedEnergy === true,
      reducedShake: s.reducedShake === true,
      tutorialSeen: s.tutorialSeen === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(store: KeyValueStore, settings: Settings): void {
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}
