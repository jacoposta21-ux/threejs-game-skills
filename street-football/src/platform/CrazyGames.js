// CrazyGames HTML5 SDK v3 integration.
//
// Method names follow the SDK v3 surface (window.CrazyGames.SDK): init(),
// game.loadingStart/loadingStop, game.gameplayStart/gameplayStop,
// game.happytime, game.settings.muteAudio + game.addSettingsChangeListener,
// ad.requestAd('midgame', { adStarted, adFinished, adError }), data.getItem/setItem.
// Verify against https://docs.crazygames.com/ before submitting — see docs/CRAZYGAMES.md.
//
// Off CrazyGames (local dev, other hosts) every call is a safe no-op, so the
// game never depends on the SDK being present.

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

function loadScript(src, timeoutMs) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    const timer = setTimeout(() => reject(new Error('SDK load timeout')), timeoutMs);
    s.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    s.onerror = () => {
      clearTimeout(timer);
      reject(new Error('SDK load failed'));
    };
    document.head.appendChild(s);
  });
}

export class Platform {
  constructor() {
    this.sdk = null;
    this.environment = 'none';
    this.inGameplay = false;
    this.adActive = false;
    this.onMuteChange = null;
    this.onAdPause = null;
  }

  shouldLoadSdk() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('nosdk')) return false;
    if (params.has('sdk')) return true;
    const host = window.location.hostname;
    const ref = document.referrer || '';
    return /crazygames\./.test(host) || /crazygames\./.test(ref);
  }

  async init() {
    if (!this.shouldLoadSdk()) return;
    try {
      await loadScript(SDK_URL, 6000);
      const sdk = window.CrazyGames?.SDK;
      if (!sdk) return;
      await sdk.init();
      this.sdk = sdk;
      this.environment = sdk.environment ?? 'crazygames';
      if (sdk.game?.addSettingsChangeListener) {
        sdk.game.addSettingsChangeListener(() => this.onMuteChange?.(this.platformMuted));
      }
    } catch (err) {
      console.warn('[platform] CrazyGames SDK unavailable, continuing without it:', err.message);
      this.sdk = null;
    }
  }

  get platformMuted() {
    return !!this.sdk?.game?.settings?.muteAudio;
  }

  /** Data module for persistent saves when available. */
  get dataBackend() {
    return this.sdk?.data ?? null;
  }

  call(fn) {
    try {
      const r = fn();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      /* SDK errors must never break the game */
    }
  }

  loadingStart() {
    if (this.sdk) this.call(() => this.sdk.game.loadingStart());
  }

  loadingStop() {
    if (this.sdk) this.call(() => this.sdk.game.loadingStop());
  }

  gameplayStart() {
    if (this.inGameplay) return;
    this.inGameplay = true;
    if (this.sdk) this.call(() => this.sdk.game.gameplayStart());
  }

  gameplayStop() {
    if (!this.inGameplay) return;
    this.inGameplay = false;
    if (this.sdk) this.call(() => this.sdk.game.gameplayStop());
  }

  happytime() {
    if (this.sdk) this.call(() => this.sdk.game.happytime());
  }

  /**
   * Midgame ad at a natural break (between matches). Resolves when the game
   * may continue. The game is paused and muted for the ad's duration.
   */
  requestMidgameAd() {
    return new Promise((resolve) => {
      if (!this.sdk?.ad?.requestAd) {
        resolve(false);
        return;
      }
      const done = (shown) => {
        this.adActive = false;
        this.onAdPause?.(false);
        resolve(shown);
      };
      this.call(() =>
        this.sdk.ad.requestAd('midgame', {
          adStarted: () => {
            this.adActive = true;
            this.onAdPause?.(true);
          },
          adFinished: () => done(true),
          adError: () => done(false),
        }),
      );
    });
  }
}
