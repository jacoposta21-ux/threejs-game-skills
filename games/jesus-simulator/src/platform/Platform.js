/**
 * Platform layer (Phase 7). The game talks to `platform` only; the platform
 * talks to the host. Two implementations:
 *
 *  - CrazyGamesPlatform: the official CrazyGames HTML5 SDK v3, loaded from the
 *    SDK's own script URL. Only used when the game is hosted on CrazyGames
 *    (crazygames.* hostname / referrer) or when the URL has `?crazygames=1`
 *    (for testing with the SDK's local mode).
 *  - LocalPlatform: everything is a no-op; there are NO ads anywhere in the
 *    game outside the host SDK, and nothing pretends to be one.
 *
 * Every SDK call is feature-checked and wrapped: a missing or failing SDK can
 * never break the game. NOTE: this was written against SDK v3 as documented
 * at the time of writing; verify the method names against the current
 * CrazyGames docs and run their QA tool before submitting.
 */
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const LOAD_TIMEOUT = 6000;

function wantCrazyGames() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('crazygames') === '1') return true;
    if (q.get('crazygames') === '0') return false;
    const host = window.location.hostname || '';
    const ref = document.referrer || '';
    return /(^|\.)crazygames\./i.test(host) || /crazygames\./i.test(ref);
  } catch {
    return false;
  }
}

function loadScript(src, timeout) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    s.src = src;
    s.async = true;
    s.onload = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => { clearTimeout(timer); reject(new Error('load failed')); };
    document.head.appendChild(s);
  });
}

/** Shared bookkeeping: the game state the host is told about, and a call log for diagnostics. */
class BasePlatform {
  constructor(name) {
    this.name = name;
    this.environment = 'none';
    this.gameplay = false;
    this.loading = false;
    this.adPlaying = false;
    this.log = [];
    this.muted = false;
    this.onMuteChange = null;
    this.lastAdAt = -Infinity;
  }

  note(what) {
    this.log.push(what);
    if (this.log.length > 60) this.log.shift();
  }

  get supportsAds() {
    return false;
  }

  async init() {}

  loadingStart() { if (this.loading) return; this.loading = true; this.note('loadingStart'); this.call('loadingStart'); }

  loadingStop() { if (!this.loading) return; this.loading = false; this.note('loadingStop'); this.call('loadingStop'); }

  /** Idempotent: only state changes reach the host. */
  gameplayStart() { if (this.gameplay || this.adPlaying) return; this.gameplay = true; this.note('gameplayStart'); this.call('gameplayStart'); }

  gameplayStop() { if (!this.gameplay) return; this.gameplay = false; this.note('gameplayStop'); this.call('gameplayStop'); }

  happytime() { this.note('happytime'); this.call('happytime'); }

  call() {}

  /**
   * A video ad at a natural break. Resolves to 'shown', 'skipped' or
   * 'unavailable'. The game is paused and muted by the caller's callbacks.
   */
  async ad() {
    return 'unavailable';
  }

  storage() {
    return null;
  }

  stats() {
    return { name: this.name, environment: this.environment, gameplay: this.gameplay, loading: this.loading, adPlaying: this.adPlaying, muted: this.muted, supportsAds: this.supportsAds, log: this.log.slice(-20) };
  }
}

export class LocalPlatform extends BasePlatform {
  constructor() {
    super('local');
  }
}

export class CrazyGamesPlatform extends BasePlatform {
  constructor(sdk) {
    super('crazygames');
    this.sdk = sdk;
  }

  async init() {
    const sdk = this.sdk;
    try {
      if (typeof sdk.init === 'function') await sdk.init();
    } catch (e) {
      this.note(`init failed: ${e?.message || e}`);
    }
    this.environment = typeof sdk.environment === 'string' ? sdk.environment : 'unknown';
    // the host's mute setting
    try {
      const g = sdk.game;
      this.muted = !!g?.settings?.muteAudio;
      if (typeof g?.addSettingsChangeListener === 'function') {
        g.addSettingsChangeListener((settings) => {
          this.muted = !!settings?.muteAudio;
          this.note(`settings: muteAudio=${this.muted}`);
          this.onMuteChange?.(this.muted);
        });
      }
    } catch { /* settings are optional */ }
  }

  get supportsAds() {
    return this.environment !== 'disabled' && typeof this.sdk?.ad?.requestAd === 'function';
  }

  call(method) {
    try {
      const fn = this.sdk?.game?.[method];
      if (typeof fn === 'function') fn.call(this.sdk.game);
    } catch (e) {
      this.note(`${method} failed: ${e?.message || e}`);
    }
  }

  /**
   * @param {'midgame'|'rewarded'} type
   * @param {{onStart?:Function, onEnd?:Function}} hooks pause/mute on start, resume on end
   */
  ad(type, hooks = {}) {
    if (!this.supportsAds || this.adPlaying) return Promise.resolve('unavailable');
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (this.adPlaying) {
          this.adPlaying = false;
          hooks.onEnd?.();
        }
        this.note(`ad ${type}: ${result}`);
        resolve(result);
      };
      try {
        this.note(`ad ${type}: requested`);
        this.sdk.ad.requestAd(type, {
          adStarted: () => {
            this.adPlaying = true;
            this.lastAdAt = performance.now();
            hooks.onStart?.();
          },
          adFinished: () => finish('shown'),
          adError: (err) => finish(this.adPlaying ? 'shown' : `skipped${err ? `: ${err?.code || err}` : ''}`),
        });
      } catch (e) {
        finish(`skipped: ${e?.message || e}`);
      }
      // never hang the game on a lost callback
      setTimeout(() => finish('skipped: timeout'), 90000);
    });
  }

  /** The SDK's data module (cloud-synced key/value), when present. */
  storage() {
    const d = this.sdk?.data;
    if (!d || typeof d.getItem !== 'function' || typeof d.setItem !== 'function') return null;
    return {
      getItem: (k) => d.getItem(k),
      setItem: (k, v) => d.setItem(k, v),
      removeItem: (k) => (typeof d.removeItem === 'function' ? d.removeItem(k) : d.setItem(k, '')),
    };
  }
}

/**
 * Pick and initialise the platform. Tests can inject an SDK double through
 * `window.__PLATFORM_SDK__` before the game boots (never shipped).
 */
export async function createPlatform() {
  const injected = window.__PLATFORM_SDK__;
  let sdk = injected || null;
  if (!sdk && wantCrazyGames()) {
    try {
      await loadScript(SDK_URL, LOAD_TIMEOUT);
      sdk = window.CrazyGames?.SDK || null;
    } catch {
      sdk = null;
    }
  }
  const platform = sdk ? new CrazyGamesPlatform(sdk) : new LocalPlatform();
  await platform.init();
  return platform;
}
