/**
 * Thin, defensive wrapper over the CrazyGames HTML5 SDK v3
 * (https://docs.crazygames.com/sdk/). Every call is optional: outside
 * CrazyGames, or when the script fails to load, the game runs normally.
 *
 * Calls used: SDK.init(), SDK.environment, SDK.game.loadingStart/loadingStop,
 * SDK.game.gameplayStart/gameplayStop, SDK.game.happytime,
 * SDK.game.settings + addSettingsChangeListener, SDK.ad.requestAd.
 */

interface CGAdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

interface CGSDK {
  init: () => Promise<void>;
  environment?: string;
  game?: {
    loadingStart?: () => void;
    loadingStop?: () => void;
    gameplayStart?: () => void;
    gameplayStop?: () => void;
    happytime?: () => void;
    settings?: { muteAudio?: boolean };
    isInstantMultiplayer?: boolean;
    inviteLink?: (params: Record<string, string>) => string;
    showInviteButton?: (params: Record<string, string>) => string;
    hideInviteButton?: () => void;
    getInviteParam?: (name: string) => string | null;
    addSettingsChangeListener?: (fn: (s: { muteAudio?: boolean }) => void) => void;
  };
  ad?: { requestAd?: (type: 'midgame' | 'rewarded', cb: CGAdCallbacks) => void };
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CGSDK };
  }
}

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

import type { GamePlatform } from './GamePlatform';

export class CrazyGamesPlatform implements GamePlatform {
  private sdk: CGSDK | null = null;
  private inGameplay = false;
  private lastAd = 0;
  environment = 'none';
  onAudioMute: (muted: boolean) => void = () => undefined;
  onAdPause: (paused: boolean) => void = () => undefined;

  /** Load and init the SDK with a timeout; never throws. */
  async init(): Promise<void> {
    // only try on crazygames hosts or when explicitly requested (?cg=1)
    const host = location.hostname;
    const wanted = /crazygames|1001juegos/.test(host) || new URLSearchParams(location.search).has('cg');
    if (!wanted) return;
    try {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SDK_URL;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('sdk load failed'));
        document.head.appendChild(s);
        setTimeout(() => reject(new Error('sdk timeout')), 6000);
      });
      const sdk = window.CrazyGames?.SDK;
      if (!sdk?.init) return;
      await sdk.init();
      this.sdk = sdk;
      this.environment = sdk.environment ?? 'unknown';
      const muted = sdk.game?.settings?.muteAudio;
      if (typeof muted === 'boolean') this.onAudioMute(muted);
      sdk.game?.addSettingsChangeListener?.((st) => {
        if (typeof st.muteAudio === 'boolean') this.onAudioMute(st.muteAudio);
      });
    } catch {
      this.sdk = null;
    }
  }

  loadingStart(): void {
    this.safe(() => this.sdk?.game?.loadingStart?.());
  }

  loadingProgress(): void {
    /* CrazyGames has no progress API */
  }

  loadingStop(): void {
    this.safe(() => this.sdk?.game?.loadingStop?.());
  }

  gameplayStart(): void {
    if (this.inGameplay) return;
    this.inGameplay = true;
    this.safe(() => this.sdk?.game?.gameplayStart?.());
  }

  gameplayStop(): void {
    if (!this.inGameplay) return;
    this.inGameplay = false;
    this.safe(() => this.sdk?.game?.gameplayStop?.());
  }

  /** Invite link for a multiplayer room (CrazyGames link when available, else this page with ?room=). */
  inviteLink(room: string): string {
    try {
      const l = this.sdk?.game?.inviteLink?.({ roomId: room });
      if (l) return l;
    } catch {
      /* fall through */
    }
    if (location.protocol === 'file:') return '';
    const u = new URL(location.href);
    u.searchParams.set('room', room);
    return u.toString();
  }

  showInviteButton(room: string): void {
    this.safe(() => this.sdk?.game?.showInviteButton?.({ roomId: room }));
  }

  hideInviteButton(): void {
    this.safe(() => this.sdk?.game?.hideInviteButton?.());
  }

  /** Room code from an invite (CrazyGames invite param or ?room=). */
  inviteRoom(): string | null {
    try {
      const v = this.sdk?.game?.getInviteParam?.('roomId');
      if (v) return v;
    } catch {
      /* ignore */
    }
    return new URLSearchParams(location.search).get('room');
  }

  get instantMultiplayer(): boolean {
    return !!this.sdk?.game?.isInstantMultiplayer;
  }

  happytime(): void {
    this.safe(() => this.sdk?.game?.happytime?.());
  }

  /**
   * Midgame ad at a natural break (never during a race). Rate limited to one
   * every 3 minutes. Resolves when the game may continue.
   */
  midgameBreak(): Promise<void> {
    const now = Date.now();
    const req = this.sdk?.ad?.requestAd;
    if (!req || now - this.lastAd < 180_000) return Promise.resolve();
    this.lastAd = now;
    return new Promise((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        this.onAdPause(false);
        resolve();
      };
      try {
        req('midgame', {
          adStarted: () => this.onAdPause(true),
          adFinished: finish,
          adError: finish,
        });
      } catch {
        finish();
      }
      setTimeout(finish, 45_000);
    });
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch {
      /* SDK errors must never break the game */
    }
  }
}
