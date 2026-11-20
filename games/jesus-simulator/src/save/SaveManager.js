import { LANDMARKS } from '../world/layout.js';

const SAVE_EXTENT = 240; // the play area is +-204 m since Phase 5

const SAVE_KEY = 'jesus-simulator.save.v1';
const SETTINGS_KEY = 'jesus-simulator.settings.v1';
const CORRUPT_KEY = 'jesus-simulator.save.corrupt';

export const DEFAULT_SETTINGS = Object.freeze({
  musicVolume: 0.5,
  sfxVolume: 0.8,
  sensitivity: 1,
  invertY: false,
  quality: 'high',
  showFps: false,
});

const QUALITIES = ['low', 'medium', 'high'];
const num = (v, min, max, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

/** First launch: phones and tablets start on medium (the automatic downgrade handles weak desktops). */
function defaultQuality() {
  try {
    const touch = (navigator.maxTouchPoints || 0) > 0 && window.matchMedia?.('(pointer: coarse)').matches;
    const short = Math.min(window.innerWidth, window.innerHeight);
    if (touch && short < 520) return 'low'; // phones: no shadows, 1x pixels
    if (touch && short < 900) return 'medium'; // tablets
  } catch { /* fall through */ }
  return DEFAULT_SETTINGS.quality;
}

function storage() {
  try {
    const s = window.localStorage;
    const probe = '__js_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** LocalStorage persistence with validation. Never saves transient physics objects. */
export class SaveManager {
  constructor() {
    this.store = storage();
    this.lastError = null;
  }

  get available() {
    return !!this.store;
  }

  loadSettings() {
    const raw = this.readJson(SETTINGS_KEY);
    const s = raw && typeof raw === 'object' ? raw : {};
    return {
      musicVolume: num(s.musicVolume, 0, 1, DEFAULT_SETTINGS.musicVolume),
      sfxVolume: num(s.sfxVolume, 0, 1, DEFAULT_SETTINGS.sfxVolume),
      sensitivity: num(s.sensitivity, 0.2, 3, DEFAULT_SETTINGS.sensitivity),
      invertY: typeof s.invertY === 'boolean' ? s.invertY : DEFAULT_SETTINGS.invertY,
      quality: QUALITIES.includes(s.quality) ? s.quality : defaultQuality(),
      showFps: typeof s.showFps === 'boolean' ? s.showFps : DEFAULT_SETTINGS.showFps,
    };
  }

  saveSettings(settings) {
    this.writeJson(SETTINGS_KEY, settings);
  }

  hasSave() {
    return !!this.loadGame().data;
  }

  /** @returns {{data: object|null, corrupted: boolean}} */
  loadGame() {
    if (!this.store) return { data: null, corrupted: false };
    const text = this.store.getItem(SAVE_KEY);
    if (!text) return { data: null, corrupted: false };
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      this.quarantine(text);
      return { data: null, corrupted: true };
    }
    const data = validateSave(raw);
    if (!data) {
      this.quarantine(text);
      return { data: null, corrupted: true };
    }
    return { data, corrupted: false };
  }

  saveGame(snapshot) {
    return this.writeJson(SAVE_KEY, { version: 2, savedAt: Date.now(), ...snapshot });
  }

  deleteGame() {
    this.store?.removeItem(SAVE_KEY);
  }

  quarantine(text) {
    try {
      this.store.setItem(CORRUPT_KEY, text);
      this.store.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  /**
   * Use the host's storage (e.g. the CrazyGames data module) instead of
   * localStorage. A save that only exists locally is carried over once.
   */
  attachStore(store) {
    if (!store) return false;
    try {
      const local = this.store;
      for (const key of [SAVE_KEY, SETTINGS_KEY]) {
        const there = store.getItem(key);
        const here = local?.getItem(key);
        if (!there && here) store.setItem(key, here);
      }
      this.store = store;
      this.hostStore = true;
      return true;
    } catch {
      return false;
    }
  }

  readJson(key) {
    if (!this.store) return null;
    try {
      return JSON.parse(this.store.getItem(key) || 'null');
    } catch {
      return null;
    }
  }

  writeJson(key, value) {
    if (!this.store) return false;
    try {
      this.store.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      this.lastError = error;
      return false;
    }
  }
}

const LANDMARK_IDS = new Set(LANDMARKS.map((l) => l.id));

export function validateSave(raw) {
  // version 1 (Phases 1-5) loads fine: the Phase 6 fields simply start empty
  if (!raw || typeof raw !== 'object' || (raw.version !== 1 && raw.version !== 2)) return null;
  const p = raw.player;
  if (!p || typeof p !== 'object') return null;
  const x = num(p.x, -SAVE_EXTENT, SAVE_EXTENT, NaN);
  const y = num(p.y, -5, 80, NaN);
  const z = num(p.z, -SAVE_EXTENT, SAVE_EXTENT, NaN);
  if (![x, y, z].every(Number.isFinite)) return null;
  const stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
  return {
    version: 2,
    player: { x, y, z, yaw: num(p.yaw, -10, 10, 0) },
    discovered: Array.isArray(raw.discovered) ? raw.discovered.filter((id) => LANDMARK_IDS.has(id)) : [],
    unlockedMiracles: Array.isArray(raw.unlockedMiracles) ? raw.unlockedMiracles.filter((id) => typeof id === 'string') : [],
    missions: raw.missions && typeof raw.missions === 'object' ? raw.missions : {},
    faith: num(raw.faith, 0, 1e6, 0),
    chaos: num(raw.chaos, 0, 1e6, 0),
    stats: {
      distance: num(stats.distance, 0, 1e9, 0),
      jumps: num(stats.jumps, 0, 1e9, 0),
      playTime: num(stats.playTime, 0, 1e9, 0),
      propsDisturbed: num(stats.propsDisturbed, 0, 1e9, 0),
      conversations: num(stats.conversations, 0, 1e9, 0),
      potsBroken: num(stats.potsBroken, 0, 1e9, 0),
      peopleKnocked: num(stats.peopleKnocked, 0, 1e9, 0),
      miracles: num(stats.miracles, 0, 1e9, 0),
      fed: num(stats.fed, 0, 1e9, 0),
      arrests: num(stats.arrests, 0, 1e9, 0),
      escapes: num(stats.escapes, 0, 1e9, 0),
      soldiersToppled: num(stats.soldiersToppled, 0, 1e9, 0),
      maxStars: num(stats.maxStars, 0, 5, 0),
      rides: num(stats.rides, 0, 1e9, 0),
      ridden: num(stats.ridden, 0, 1e9, 0),
      chariotsStolen: num(stats.chariotsStolen, 0, 1e9, 0),
      laps: num(stats.laps, 0, 1e9, 0),
      bestLap: num(stats.bestLap, 0, 1e5, 0),
      missions: num(stats.missions, 0, 1e4, 0),
      followersEver: num(stats.followersEver, 0, 1e4, 0),
      blessings: num(stats.blessings, 0, 100, 0),
      faithEarned: num(stats.faithEarned, 0, 1e7, 0),
    },
    flags: validFlags(raw.flags),
    met: Array.isArray(raw.met) ? raw.met.filter((id) => typeof id === 'string' && (id.startsWith('npc.') || id.startsWith('roman.'))).slice(0, 200) : [],
    clock: num(raw.clock, 0, 0.9999, 0.1),
    ministry: raw.ministry && typeof raw.ministry === 'object' && !Array.isArray(raw.ministry) ? raw.ministry : null,
    followers: Array.isArray(raw.followers) ? raw.followers.filter((f) => f && typeof f.id === 'string' && f.id.startsWith('npc.')).slice(0, 12).map((f) => ({ id: f.id, waiting: !!f.waiting })) : [],
    miracleLevels: validLevels(raw.miracleLevels),
    vehicles: Array.isArray(raw.vehicles) ? raw.vehicles.filter((v) => v && typeof v.id === 'string' && v.id.startsWith('vehicle.')).slice(0, 20).map((v) => ({ id: v.id, x: num(v.x, -SAVE_EXTENT, SAVE_EXTENT, 0), z: num(v.z, -SAVE_EXTENT, SAVE_EXTENT, 0), yaw: num(v.yaw, -10, 10, 0) })) : [],
    savedAt: num(raw.savedAt, 0, 1e15, 0),
  };
}

function validLevels(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) if (/^miracle\.[a-z-]+$/.test(k)) out[k] = num(v, 0, 2, 0);
  return out;
}

function validFlags(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k === 'string' && k.length < 64 && /^[a-z0-9.-]+$/i.test(k) && v === true) out[k] = true;
  }
  return out;
}
