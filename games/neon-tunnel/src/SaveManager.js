// Persistent progress via localStorage. All access is guarded: private mode,
// blocked storage or quota errors must never break the game.

const KEY = 'neon-tunnel-save-v1';

const DEFAULTS = {
  best: 0,
  bestDistance: 0,
  energyBank: 0,
  totalRuns: 0,
  unlockedSkins: ['cyber'],
  selectedSkin: 'cyber',
  seenTutorial: false,
  settings: {
    master: 0.8,
    music: 0.6,
    sfx: 0.8,
    muted: false,
    quality: 'auto', // auto | high | medium | low
    shake: true,
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class SaveManager {
  constructor() {
    this.data = clone(DEFAULTS);
    this.load();
  }

  load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.data = {
        ...clone(DEFAULTS),
        ...parsed,
        settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
      };
      if (!Array.isArray(this.data.unlockedSkins)) this.data.unlockedSkins = ['cyber'];
      if (!this.data.unlockedSkins.includes('cyber')) this.data.unlockedSkins.push('cyber');
    } catch {
      this.data = clone(DEFAULTS);
    }
  }

  save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable: keep in-memory progress */
    }
  }

  get settings() {
    return this.data.settings;
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  }

  /** Records a finished run. Returns true when it is a new best score. */
  recordRun(score, distance, energy) {
    this.data.totalRuns += 1;
    this.data.energyBank += energy;
    this.data.bestDistance = Math.max(this.data.bestDistance, Math.floor(distance));
    const isBest = score > this.data.best;
    if (isBest) this.data.best = score;
    this.save();
    return isBest;
  }

  isUnlocked(skinId) {
    return this.data.unlockedSkins.includes(skinId);
  }

  unlock(skin) {
    if (this.isUnlocked(skin.id)) return true;
    if (skin.achievement) return false; // earned through achievements only
    if (this.data.energyBank < skin.price) return false;
    this.data.energyBank -= skin.price;
    this.data.unlockedSkins.push(skin.id);
    this.save();
    return true;
  }

  selectSkin(skinId) {
    if (!this.isUnlocked(skinId)) return;
    this.data.selectedSkin = skinId;
    this.save();
  }

  reset() {
    this.data = clone(DEFAULTS);
    this.save();
  }
}
