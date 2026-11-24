/**
 * Platform integration boundary. Core gameplay only talks to this interface,
 * so the game runs identically on any host.
 *
 * CrazyGames HTML5 SDK v3 (checked against docs.crazygames.com: /sdk/intro/,
 * /sdk/game/, /requirements/technical/):
 *  - script: https://sdk.crazygames.com/crazygames-sdk-v3.js, then `await window.CrazyGames.SDK.init()`
 *  - `SDK.game.loadingStart() / loadingStop() / gameplayStart() / gameplayStop() / happytime()`
 *  - `SDK.environment` is 'local' | 'crazygames' | 'disabled'; when 'disabled' every call throws,
 *    so calls are only made for 'crazygames' or 'local'.
 *  - Do not call gameplayStop on focus/visibility changes (CrazyGames handles that);
 *    call it on menus/pauses. `happytime()` is for notable achievements, used sparingly.
 * The SDK script is only requested when the game is actually hosted on CrazyGames (or
 * explicitly asked for with ?platform=crazygames), so standalone play makes no external
 * requests and never depends on it. No advertising is implemented.
 */
export interface GamePlatform {
  readonly name: string;
  init(): Promise<void>;
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** Notable achievement (promotions). Sparingly: hosts may rate-limit it. */
  celebrate(): void;
  /** Whether the host wants us to pause gameplay on tab visibility changes ourselves. */
  readonly handlesVisibility: boolean;
}

export class StandalonePlatform implements GamePlatform {
  readonly name = 'standalone';
  readonly handlesVisibility = false;
  async init(): Promise<void> {}
  loadingStart(): void {}
  loadingStop(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  celebrate(): void {}
}

interface CrazySdk {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: { loadingStart(): void; loadingStop(): void; gameplayStart(): void; gameplayStop(): void; happytime(): void };
}

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

export class CrazyGamesPlatform implements GamePlatform {
  readonly name = 'crazygames';
  readonly handlesVisibility = true;
  private sdk: CrazySdk | null = null;
  private playing = false;
  private lastHappy = -1e9;

  async init(): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = SDK_URL;
        tag.async = true;
        tag.onload = () => resolve();
        tag.onerror = () => reject(new Error('CrazyGames SDK unavailable'));
        document.head.appendChild(tag);
        window.setTimeout(() => reject(new Error('CrazyGames SDK timeout')), 6000);
      });
      const sdk = (window as unknown as { CrazyGames?: { SDK?: CrazySdk } }).CrazyGames?.SDK;
      if (!sdk) return;
      await sdk.init();
      // Only talk to the SDK where it is enabled; elsewhere every call would throw.
      if (sdk.environment === 'crazygames' || sdk.environment === 'local') this.sdk = sdk;
    } catch {
      this.sdk = null; // stay fully playable without the platform
    }
  }

  private call(fn: (g: CrazySdk['game']) => void): void {
    if (!this.sdk) return;
    try {
      fn(this.sdk.game);
    } catch {
      /* platform service unavailable: ignore */
    }
  }

  loadingStart(): void {
    this.call((g) => g.loadingStart());
  }

  loadingStop(): void {
    this.call((g) => g.loadingStop());
  }

  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    this.call((g) => g.gameplayStart());
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.call((g) => g.gameplayStop());
  }

  celebrate(): void {
    const now = performance.now();
    if (now - this.lastHappy < 60_000) return; // sparingly
    this.lastHappy = now;
    this.call((g) => g.happytime());
  }
}

/** CrazyGames when hosted there (or ?platform=crazygames), otherwise standalone. */
export function createPlatform(): GamePlatform {
  const host = window.location.hostname;
  const forced = new URLSearchParams(window.location.search).get('platform') === 'crazygames';
  let embedded = false;
  try {
    embedded = /(^|\.)crazygames\.[a-z.]+$/i.test(new URL(document.referrer).hostname);
  } catch {
    embedded = false;
  }
  if (forced || /(^|\.)crazygames\.[a-z.]+$/i.test(host) || embedded) return new CrazyGamesPlatform();
  return new StandalonePlatform();
}
