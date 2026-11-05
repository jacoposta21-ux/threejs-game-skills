/**
 * CrazyGames HTML5 SDK v3 integration, isolated from gameplay code.
 *
 * Only documented v3 calls are used:
 *   window.CrazyGames.SDK.init()
 *   SDK.game.loadingStart() / loadingStop()
 *   SDK.game.gameplayStart() / gameplayStop()
 *   SDK.game.happytime()
 *   SDK.game.settings.muteAudio + SDK.game.addSettingsChangeListener(cb)
 *   SDK.data.getItem / setItem / removeItem
 *   SDK.ad.requestAd('midgame', { adStarted, adFinished, adError })
 *
 * When the SDK script cannot be loaded (local development, offline, other
 * portals) every call becomes a safe no-op and the game keeps working.
 */

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

interface CrazyAdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

interface CrazySdk {
  init(): Promise<void>;
  environment?: string;
  game: {
    loadingStart(): void | Promise<void>;
    loadingStop(): void | Promise<void>;
    gameplayStart(): void | Promise<void>;
    gameplayStop(): void | Promise<void>;
    happytime(): void | Promise<void>;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?(listener: (settings: { muteAudio?: boolean }) => void): void;
  };
  data?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  ad?: {
    requestAd(type: 'midgame' | 'rewarded', callbacks: CrazyAdCallbacks): void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazySdk };
  }
}

class CrazyGamesIntegration {
  private sdk: CrazySdk | null = null;
  private gameplayActive = false;
  private loadingActive = false;
  private muteListeners = new Set<(muted: boolean) => void>();
  ready = false;

  /** True when running inside the CrazyGames portal (or their QA tool). */
  get available(): boolean {
    return this.sdk !== null && this.sdk.environment !== 'disabled';
  }

  get environment(): string {
    return this.sdk?.environment ?? 'none';
  }

  async init(): Promise<void> {
    if (this.ready) return;
    this.ready = true;
    if (!this.shouldLoad()) return;
    try {
      await this.loadScript(4000);
      const sdk = window.CrazyGames?.SDK;
      if (!sdk) return;
      await withTimeout(sdk.init(), 4000);
      this.sdk = sdk;
      sdk.game.addSettingsChangeListener?.((settings) => {
        const muted = Boolean(settings?.muteAudio);
        for (const listener of this.muteListeners) listener(muted);
      });
    } catch (error) {
      console.info('[LittleNight] CrazyGames SDK unavailable, running standalone.', error);
      this.sdk = null;
    }
  }

  get platformMuted(): boolean {
    return Boolean(this.sdk?.game.settings?.muteAudio);
  }

  onMuteChange(listener: (muted: boolean) => void): void {
    this.muteListeners.add(listener);
  }

  loadingStart(): void {
    if (this.loadingActive) return;
    this.loadingActive = true;
    this.safe(() => this.sdk?.game.loadingStart());
  }

  loadingStop(): void {
    if (!this.loadingActive) return;
    this.loadingActive = false;
    this.safe(() => this.sdk?.game.loadingStop());
  }

  gameplayStart(): void {
    if (this.gameplayActive) return;
    this.gameplayActive = true;
    this.safe(() => this.sdk?.game.gameplayStart());
  }

  gameplayStop(): void {
    if (!this.gameplayActive) return;
    this.gameplayActive = false;
    this.safe(() => this.sdk?.game.gameplayStop());
  }

  happytime(): void {
    this.safe(() => this.sdk?.game.happytime());
  }

  /**
   * Natural break between chapters. Resolves when the ad (if any) is done.
   * Audio must be muted by the caller between onStart and resolve.
   */
  midgameBreak(onStart: () => void): Promise<void> {
    const ad = this.sdk?.ad;
    if (!ad) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      try {
        ad.requestAd('midgame', {
          adStarted: onStart,
          adFinished: done,
          adError: done,
        });
      } catch {
        done();
      }
      window.setTimeout(done, 60000);
    });
  }

  dataGet(key: string): string | null {
    try {
      return this.sdk?.data?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  dataSet(key: string, value: string): void {
    this.safe(() => this.sdk?.data?.setItem(key, value));
  }

  dataRemove(key: string): void {
    this.safe(() => this.sdk?.data?.removeItem(key));
  }

  private shouldLoad(): boolean {
    const params = new URLSearchParams(location.search);
    if (params.has('nosdk')) return false;
    if (params.has('sdk')) return true;
    // Inside the CrazyGames iframe, or on their domains, always load.
    const host = location.hostname;
    if (/crazygames|1001juegos/.test(host)) return true;
    if (window.top !== window.self) return true;
    // Plain local development: skip the network request entirely.
    return false;
  }

  private loadScript(timeoutMs: number): Promise<void> {
    if (window.CrazyGames?.SDK) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      const timer = window.setTimeout(() => reject(new Error('SDK load timeout')), timeoutMs);
      script.onload = () => {
        window.clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('SDK script failed to load'));
      };
      document.head.appendChild(script);
    });
  }

  private safe(fn: () => unknown): void {
    try {
      const result = fn();
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(() => {});
      }
    } catch {
      /* SDK failures must never break the game */
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const CrazyGames = new CrazyGamesIntegration();
