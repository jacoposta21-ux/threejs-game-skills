// Thin wrapper over the CrazyGames HTML5 SDK v3. Every call is a no-op when the
// SDK script is not on the page (single-file build, other hosts), so the game
// never depends on it. The SDK script is only added by `npm run build:crazygames`.
//
// What the game reports: loading start/stop, gameplay start/stop (pause, map,
// shops and ads count as "not playing"), happy moments; it follows the portal's
// mute setting, shows a midgame ad at natural breaks (after a mission ends, after
// being busted/wasted) at most every few minutes, and stores the save through the
// SDK's Data module (cloud save for signed-in players) when it is available.

const sdk = () => (window.CrazyGames && window.CrazyGames.SDK) || null;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const AD_MIN_GAP = 180; // seconds between our own midgame requests
const AD_FIRST_AFTER = 120; // no ad in the first two minutes of play

export const Platform = {
  sdk: null,
  env: 'none', // 'none' | 'local' | 'crazygames' | 'disabled'
  muted: false,
  adPlaying: false,
  playing: false,
  lastAd: -1e9,
  muteListeners: [],

  /** Starts the SDK if its script is on the page. Never throws, never waits more than a few seconds. */
  async init() {
    const s = sdk();
    if (!s) return false;
    try {
      await Promise.race([s.init(), wait(6000).then(() => { throw new Error('SDK init timed out'); })]);
      this.env = s.environment;
      if (this.env === 'disabled') return false;
      this.sdk = s;
      this.muted = !!(s.game.settings && s.game.settings.muteAudio);
      s.game.addSettingsChangeListener((st) => {
        const m = !!(st && st.muteAudio);
        if (m === this.muted) return;
        this.muted = m;
        for (const f of this.muteListeners) f(m);
      });
      this.migrateSave();
      return true;
    } catch (e) {
      console.warn('[platform] CrazyGames SDK unavailable:', e && e.message);
      this.sdk = null;
      return false;
    }
  },

  get active() { return !!this.sdk; },

  call(fn) { if (!this.sdk) return; try { fn(this.sdk); } catch (e) { console.warn('[platform]', e && e.message); } },

  loadingStart() { this.call((s) => s.game.loadingStart()); },
  loadingStop() { this.call((s) => s.game.loadingStop()); },
  happytime() { this.call((s) => s.game.happytime()); },

  /** Reports gameplay start/stop only on changes (the SDK throttles repeats anyway). */
  setPlaying(on) {
    if (on === this.playing) return;
    this.playing = on;
    this.call((s) => (on ? s.game.gameplayStart() : s.game.gameplayStop()));
  },

  onMute(fn) { this.muteListeners.push(fn); },

  // ------------------------------------------------------------------ storage
  /** The SDK Data module when available (cloud save for signed-in players), localStorage otherwise. */
  store() {
    if (this.sdk) { try { const d = this.sdk.data; if (d) return d; } catch { /* data module disabled */ } }
    try { return window.localStorage; } catch { return null; }
  },
  getItem(k) { try { const v = this.store()?.getItem(k); return v === undefined ? null : v; } catch { return null; } },
  setItem(k, v) { const st = this.store(); if (!st) throw new Error('no storage'); st.setItem(k, v); },
  removeItem(k) { try { this.store()?.removeItem(k); } catch { /* nothing stored */ } },

  /** Players who saved before the SDK was added keep their progress. */
  migrateSave() {
    try {
      const d = this.sdk.data;
      for (const key of ['vistamar.save']) {
        if (d.getItem(key) == null) { const old = window.localStorage.getItem(key); if (old) d.setItem(key, old); }
      }
    } catch { /* storage blocked or data module disabled */ }
  },

  // ------------------------------------------------------------------ ads
  /**
   * Midgame ad at a natural break. `before` pauses and mutes the game, `after` restores it;
   * both always run as a pair (also on errors, ad blockers or when no ad is filled).
   */
  midgameAd(playTime, before, after) {
    if (!this.sdk || this.adPlaying) return false;
    if (playTime < AD_FIRST_AFTER || playTime - this.lastAd < AD_MIN_GAP) return false;
    this.lastAd = playTime;
    let started = false, done = false;
    const finish = () => { if (done) return; done = true; this.adPlaying = false; if (started) after(); };
    try {
      this.sdk.ad.requestAd('midgame', {
        adStarted: () => { started = true; this.adPlaying = true; before(); },
        adFinished: finish,
        adError: finish,
      });
      return true;
    } catch (e) {
      console.warn('[platform] ad request failed', e && e.message);
      finish();
      return false;
    }
  },
};
