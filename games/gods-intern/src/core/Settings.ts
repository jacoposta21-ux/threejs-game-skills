import type { KeyValueStore } from '../persistence/SaveManager';
import { POWER_ORDER, type PowerId } from './Config';
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
  // ---- v0.4 ----
  musicVolume: number;
  ambientVolume: number;
  uiVolume: number;
  quickSlots: PowerId[];
  /** Creative Mode only: power cooldowns ×0.25. */
  reducedCooldowns: boolean;
  /** Which save slot the game opens. */
  mode: 'career' | 'creative';
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.7,
  sfxVolume: 0.8,
  quality: 'auto',
  cameraSensitivity: 1,
  unlimitedEnergy: false,
  reducedShake: false,
  tutorialSeen: false,
  musicVolume: 0.35,
  ambientVolume: 0.7,
  uiVolume: 0.7,
  quickSlots: ['rain', 'lightning', 'nature', 'fire', 'mutation', 'tornado'],
  reducedCooldowns: false,
  mode: 'career',
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
      musicVolume: clamp(s.musicVolume, 0, 1, DEFAULT_SETTINGS.musicVolume),
      ambientVolume: clamp(s.ambientVolume, 0, 1, DEFAULT_SETTINGS.ambientVolume),
      uiVolume: clamp(s.uiVolume, 0, 1, DEFAULT_SETTINGS.uiVolume),
      quickSlots:
        Array.isArray(s.quickSlots) && s.quickSlots.length === 6 && s.quickSlots.every((id) => POWER_ORDER.includes(id)) && new Set(s.quickSlots).size === 6
          ? [...s.quickSlots]
          : [...DEFAULT_SETTINGS.quickSlots],
      reducedCooldowns: s.reducedCooldowns === true,
      mode: s.mode === 'creative' ? 'creative' : 'career',
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
