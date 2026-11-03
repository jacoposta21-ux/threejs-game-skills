// Save / load through the platform adapter (CrazyGames data module or localStorage).
// The format is versioned; add a migration step to MIGRATIONS when SAVE_VERSION goes up.
import { Platform } from './platform.js';

export const SAVE_VERSION = 1;
const KEY = 'grimacres.save';
const SETTINGS_KEY = 'grimacres.settings';

// MIGRATIONS[n] upgrades a version-n save to version n+1.
const MIGRATIONS = {};

export const Save = {
  exists() { return !!this.load(); },

  load() {
    const raw = Platform.getItem(KEY);
    if (!raw) return null;
    try {
      let data = JSON.parse(raw);
      if (!data || typeof data.v !== 'number') return null;
      while (data.v < SAVE_VERSION && MIGRATIONS[data.v]) data = MIGRATIONS[data.v](data);
      return data.v === SAVE_VERSION ? data : null;
    } catch { return null; }
  },

  write(data) {
    data.v = SAVE_VERSION;
    const raw = JSON.stringify(data);
    if (raw.length > 900_000) console.warn('Grim Acres: save is unexpectedly large', raw.length);
    return Platform.setItem(KEY, raw);
  },

  clear() { Platform.removeItem(KEY); },

  settings() {
    try { return JSON.parse(Platform.getItem(SETTINGS_KEY) || '{}') || {}; } catch { return {}; }
  },
  saveSettings(s) { Platform.setItem(SETTINGS_KEY, JSON.stringify(s)); },
};
