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
  // ---- v0.5 ----
  /** Calmer UI and world animation (defaults to the OS preference). */
  reducedMotion: boolean;
  /** Camera shake on impacts (independent of reduced motion). */
  cameraShake: boolean;
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
  quickSlots: ['rain', 'lightning', 'nature', 'fire', 'mutation', 'tornado', 'freeze'],
  reducedCooldowns: false,
  mode: 'career',
  reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  cameraShake: true,
};

/** Quick slots: 7 distinct powers. v0.4 saved 6; the 7th is filled with the first unused power. */
function slotsFrom(v: unknown): PowerId[] {
  if (!Array.isArray(v) || v.length < 6 || !v.every((id) => POWER_ORDER.includes(id)) || new Set(v).size !== v.length) return [...DEFAULT_SETTINGS.quickSlots];
  const out = (v as PowerId[]).slice(0, 7);
  for (const id of DEFAULT_SETTINGS.quickSlots) if (out.length < 7 && !out.includes(id)) out.push(id);
  return out;
}

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
      quickSlots: slotsFrom(s.quickSlots),
      reducedCooldowns: s.reducedCooldowns === true,
      mode: s.mode === 'creative' ? 'creative' : 'career',
      reducedMotion: typeof s.reducedMotion === 'boolean' ? s.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
      cameraShake: typeof s.cameraShake === 'boolean' ? s.cameraShake : !s.reducedShake,
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
