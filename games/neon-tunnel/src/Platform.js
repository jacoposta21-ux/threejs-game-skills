// Platform adapters. The game only talks to this interface, so portal SDKs
// stay out of gameplay code.
//
//   init()                      async, before anything else
//   loadingStart/loadingStop()  boot
//   gameplayStart/gameplayStop() run started/resumed, run paused/ended/menu
//   celebrate()                 a "happy" moment (new best, achievement)
//   requestBreak('midgame'|'rewarded', hooks) -> Promise<{ shown: boolean }>
//       hooks.pause()/hooks.resume() silence and freeze the game around the ad
//   onMuteChange(cb)            platform-level mute (e.g. portal setting)
//
// Selection: build with VITE_PLATFORM=crazygames (npm run build:crazygames)
// or open the page with ?platform=crazygames. Everything else uses the local
// adapter, so the game stays fully playable during development.

export class LocalPlatform {
  constructor() {
    this.name = 'local';
    this.supportsRewarded = true; // simulated, so the reward flow can be tested
  }

  async init() {
    return true;
  }

  loadingStart() {}

  loadingStop() {}

  gameplayStart() {}

  gameplayStop() {}

  celebrate() {}

  onMuteChange() {}

  /** Local dev: midgame breaks are skipped, rewarded ads show a short placeholder. */
  async requestBreak(kind, hooks) {
    if (kind !== 'rewarded') return { shown: false };
    hooks?.pause?.();
    await showPlaceholderAd();
    hooks?.resume?.();
    return { shown: true };
  }
}

function showPlaceholderAd() {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'ad-placeholder';
    el.innerHTML = '<div><b>AD PLACEHOLDER</b><span>Local development: a rewarded ad would play here.</span></div>';
    document.body.appendChild(el);
    setTimeout(() => {
      el.remove();
      resolve();
    }, 1400);
  });
}

/**
 * CrazyGames HTML5 SDK v3 adapter.
 *
 * Method names follow the SDK v3 surface (window.CrazyGames.SDK: init,
 * game.loadingStart/loadingStop/gameplayStart/gameplayStop/happytime,
 * game.settings.muteAudio + game.addSettingsChangeListener,
 * ad.requestAd(type, { adStarted, adFinished, adError })). They were
 * cross-checked against a published third-party integration because the
 * official docs were unreachable from the build environment: re-verify
 * against docs.crazygames.com before submitting.
 */
export class CrazyGamesPlatform {
  constructor() {
    this.name = 'crazygames';
    this.sdk = null;
    this.supportsRewarded = true;
    this.muteListeners = [];
  }

  async init() {
    try {
      await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js');
      this.sdk = window.CrazyGames?.SDK ?? null;
      if (!this.sdk) throw new Error('CrazyGames SDK missing after load');
      await this.sdk.init();
      this.sdk.game.addSettingsChangeListener?.(() => this.emitMute());
      this.emitMute();
      return true;
    } catch (err) {
      console.warn('[platform] CrazyGames SDK unavailable, continuing without it:', err?.message ?? err);
      this.sdk = null;
      this.supportsRewarded = false;
      return false;
    }
  }

  call(fn) {
    if (!this.sdk) return;
    try {
      const r = fn(this.sdk);
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      /* never let the SDK break the game */
    }
  }

  loadingStart() {
    this.call((sdk) => sdk.game.loadingStart());
  }

  loadingStop() {
    this.call((sdk) => sdk.game.loadingStop());
  }

  gameplayStart() {
    this.call((sdk) => sdk.game.gameplayStart());
  }

  gameplayStop() {
    this.call((sdk) => sdk.game.gameplayStop());
  }

  celebrate() {
    this.call((sdk) => sdk.game.happytime());
  }

  onMuteChange(cb) {
    this.muteListeners.push(cb);
    this.emitMute();
  }

  emitMute() {
    const muted = !!this.sdk?.game?.settings?.muteAudio;
    for (const cb of this.muteListeners) cb(muted);
  }

  requestBreak(kind, hooks) {
    if (!this.sdk) return Promise.resolve({ shown: false });
    return new Promise((resolve) => {
      let paused = false;
      const finish = (shown) => {
        if (paused) hooks?.resume?.();
        resolve({ shown });
      };
      try {
        this.sdk.ad.requestAd(kind, {
          adStarted: () => {
            paused = true;
            hooks?.pause?.();
          },
          adFinished: () => finish(true),
          adError: () => finish(false),
        });
      } catch {
        finish(false);
      }
    });
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export function createPlatform() {
  let wanted = import.meta.env?.VITE_PLATFORM;
  try {
    wanted = new URLSearchParams(window.location.search).get('platform') || wanted;
  } catch {
    /* ignore */
  }
  return wanted === 'crazygames' ? new CrazyGamesPlatform() : new LocalPlatform();
}
