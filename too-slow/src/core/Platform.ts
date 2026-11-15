/**
 * Thin wrapper around the CrazyGames HTML5 SDK (v3).
 *
 * The SDK script is only loaded when the game runs on CrazyGames (their domains) or with
 * `?crazygames=1` for testing, so the standalone build makes no external requests. Without the
 * SDK every call is a harmless no-op and ads report "not available" (no fake ads).
 */

interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

interface CrazySdk {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart(): void;
    loadingStop(): void;
    happytime(): void;
  };
  ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks: AdCallbacks): void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazySdk };
  }
}

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
/** Minimum gap between interstitials, in ms. */
const MIDGAME_GAP = 3 * 60 * 1000;

export interface PlatformHooks {
  /** An ad is on screen: mute audio and hold the game. */
  adStart(): void;
  adEnd(): void;
}

export class Platform {
  private sdk: CrazySdk | null = null;
  private playing = false;
  private lastMidgame = Date.now();
  private hooks: PlatformHooks | null = null;
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.boot();
  }

  /** True when the game is running inside CrazyGames with ads enabled. */
  get adsAvailable(): boolean {
    return !!this.sdk && this.sdk.environment !== 'disabled';
  }

  get name(): string {
    return this.sdk ? 'CrazyGames' : 'standalone';
  }

  setHooks(hooks: PlatformHooks): void {
    this.hooks = hooks;
  }

  private wanted(): boolean {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('crazygames') === '0') return false;
    if (params.get('crazygames') === '1') return true;
    const host = window.location.hostname;
    const ref = document.referrer;
    return /(^|\.)crazygames\.[a-z.]+$/.test(host) || /crazygames\./.test(ref);
  }

  private async boot(): Promise<void> {
    if (!this.wanted()) return;
    try {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SDK_URL;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('CrazyGames SDK failed to load'));
        document.head.appendChild(s);
      });
      const sdk = window.CrazyGames?.SDK;
      if (!sdk) return;
      await sdk.init();
      this.sdk = sdk;
    } catch (e) {
      console.warn('[platform]', e);
      this.sdk = null;
    }
  }

  loadingStart(): void {
    this.safe(() => this.sdk?.game.loadingStart());
  }

  loadingStop(): void {
    this.safe(() => this.sdk?.game.loadingStop());
  }

  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    this.safe(() => this.sdk?.game.gameplayStart());
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.safe(() => this.sdk?.game.gameplayStop());
  }

  /** A moment of joy (win, new record): lets the platform celebrate too. */
  happytime(): void {
    this.safe(() => this.sdk?.game.happytime());
  }

  /** Interstitial between races, at most every few minutes. Resolves when the game may continue. */
  midgame(): Promise<void> {
    if (!this.adsAvailable || Date.now() - this.lastMidgame < MIDGAME_GAP) return Promise.resolve();
    this.lastMidgame = Date.now();
    return this.request('midgame').then(() => undefined);
  }

  /** Rewarded ad; resolves true only if it was watched to the end. */
  rewarded(): Promise<boolean> {
    if (!this.adsAvailable) return Promise.resolve(false);
    return this.request('rewarded');
  }

  private request(type: 'midgame' | 'rewarded'): Promise<boolean> {
    return new Promise((resolve) => {
      let started = false;
      const done = (ok: boolean) => {
        if (started) this.hooks?.adEnd();
        resolve(ok);
      };
      try {
        this.sdk!.ad.requestAd(type, {
          adStarted: () => {
            started = true;
            this.hooks?.adStart();
          },
          adFinished: () => done(true),
          adError: () => done(false),
        });
      } catch {
        resolve(false);
      }
    });
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      console.warn('[platform]', e);
    }
  }
}
