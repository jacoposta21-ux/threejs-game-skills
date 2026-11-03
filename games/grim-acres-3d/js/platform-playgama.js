// Playgama Bridge adapter: same interface as platform.js (the CrazyGames one), swapped in by
// vite.config.js for the Playgama build. Bridge storage is async, so the game's save keys are
// fetched once at startup and kept in a write-through cache; localStorage is always a fallback.

const KEYS = ['grimacres.save', 'grimacres.settings', 'grimacres.progress'];
let bridge = null;
let gameplayOn = false;
let ready = false;
const cache = new Map();

function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
function local() { return safe(() => window.localStorage, null); }
const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

export const Platform = {
  get active() { return !!bridge; },
  onPause: null,  // (paused: boolean) => void, set by main.js
  onAudio: null,  // (enabled: boolean) => void

  async init() {
    const B = safe(() => window.bridge, null);
    if (!B) return false;
    try {
      await Promise.race([B.initialize(), timeout(8000)]);
      bridge = B;
    } catch { bridge = null; return false; }
    try {
      const vals = await Promise.race([bridge.storage.get(KEYS, false), timeout(5000)]);
      KEYS.forEach((k, i) => {
        const v = Array.isArray(vals) ? vals[i] : vals && vals[k];
        if (v !== null && v !== undefined && v !== '') cache.set(k, typeof v === 'string' ? v : JSON.stringify(v));
      });
    } catch { /* fall back to localStorage */ }
    safe(() => {
      const E = bridge.EVENT_NAME;
      bridge.platform.on(E.PAUSE_STATE_CHANGED, (p) => this.onPause && this.onPause(!!p));
      bridge.platform.on(E.AUDIO_STATE_CHANGED, (a) => this.onAudio && this.onAudio(!!a));
    });
    return true;
  },

  get audioEnabled() { return bridge ? safe(() => bridge.platform.isAudioEnabled, true) !== false : true; },

  loadingStart() {},
  // first time the title screen is up: tell the platform the game is ready
  loadingStop() {
    if (ready || !bridge) return;
    ready = true;
    safe(() => bridge.platform.sendMessage('game_ready'));
  },

  setGameplay(on) {
    if (on === gameplayOn) return;
    gameplayOn = on;
    if (bridge) safe(() => bridge.platform.sendMessage(on ? 'gameplay_started' : 'gameplay_stopped'));
  },

  happytime() {},

  locale() {
    const l = bridge ? safe(() => bridge.platform.language, null) : null;
    return l || safe(() => navigator.language, 'en') || 'en';
  },

  getItem(key) {
    if (cache.has(key)) return cache.get(key);
    const ls = local();
    return ls ? safe(() => ls.getItem(key), null) : null;
  },

  setItem(key, value) {
    cache.set(key, value);
    if (bridge) safe(() => bridge.storage.set(key, value).catch(() => {}));
    const ls = local();
    if (ls) safe(() => ls.setItem(key, value));
    return true;
  },

  removeItem(key) {
    cache.delete(key);
    if (bridge) safe(() => bridge.storage.delete(key).catch(() => {}));
    const ls = local();
    if (ls) safe(() => ls.removeItem(key));
  },
};
