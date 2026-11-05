// Playgama Bridge adapter: same interface as platform.js (the CrazyGames one), swapped in by
// vite.config.js for the Playgama build. Bridge storage is async, so the game's save keys are
// fetched once at startup and kept in a write-through cache; localStorage is always a fallback.

const KEYS = ['grimacres.save', 'grimacres.settings', 'grimacres.progress'];
let bridge = null;
let gameplayOn = false;
let ready = false;
let adActive = false;
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

  onAd: null,     // (showing: boolean) => void: freeze + mute while an ad is on screen
  get adActive() { return adActive; },
  get rewardedAvailable() { return !!bridge && safe(() => bridge.advertisement.isRewardedSupported, false) === true; },

  // Fire-and-forget interstitial at a natural break. Resolves when it is over (or never started:
  // unsupported, too soon after the previous one, no fill).
  interstitial(placement) {
    return this._ad('INTERSTITIAL_STATE_CHANGED', 'showInterstitial', 'isInterstitialSupported', placement, 4000).then((s) => s.shown);
  },
  // Rewarded ad; resolves true only when the platform confirms the reward.
  rewarded(placement) {
    return this._ad('REWARDED_STATE_CHANGED', 'showRewarded', 'isRewardedSupported', placement, 12000).then((s) => s.rewarded);
  },
  _ad(event, method, supported, placement, waitMs) {
    return new Promise((resolve) => {
      if (!bridge || adActive || safe(() => bridge.advertisement[supported], false) !== true) { resolve({ shown: false, rewarded: false }); return; }
      const A = bridge.advertisement, E = bridge.EVENT_NAME[event];
      let opened = false, rewarded = false, finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        safe(() => A.off(E, onState));
        if (adActive) { adActive = false; if (this.onAd) this.onAd(false); }
        resolve({ shown: opened, rewarded });
      };
      const onState = (state) => {
        if (state === 'opened') { opened = true; adActive = true; if (this.onAd) this.onAd(true); }
        else if (state === 'rewarded') rewarded = true;
        else if (state === 'closed' || state === 'failed') done();
      };
      safe(() => A.on(E, onState));
      if (!safe(() => { A[method](placement); return true; }, false)) { done(); return; }
      setTimeout(() => { if (!opened) done(); }, waitMs);
    });
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
