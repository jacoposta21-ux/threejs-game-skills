/**
 * Playgama Bridge integration (https://wiki.playgama.com, @playgama/bridge v2).
 *
 * The Bridge runtime is injected as a <script> by the official Vite plugin in the
 * Playgama build, which exposes `window.bridge`. One build then runs on every
 * portal Playgama distributes to (Playgama, CrazyGames, Poki, Yandex, ...).
 *
 * Calls used: bridge.initialize(), bridge.setGameLoadingProgress(),
 * bridge.platform.sendMessage('game_ready' | 'gameplay_started' | 'gameplay_stopped'),
 * bridge.platform.on(AUDIO_STATE_CHANGED | PAUSE_STATE_CHANGED),
 * bridge.advertisement.showInterstitial() + INTERSTITIAL_STATE_CHANGED.
 * Every call is guarded: outside a portal the game still runs.
 */
import type { GamePlatform } from './GamePlatform';

interface Emitter {
  on(event: string, cb: (value: unknown) => void): void;
  off?(event: string, cb?: (value: unknown) => void): void;
}

interface BridgeGlobal {
  initialize(options?: Record<string, unknown>): Promise<void>;
  setGameLoadingProgress?(percent: number): void;
  EVENT_NAME: Record<string, string>;
  platform: Emitter & {
    id?: string;
    sendMessage(message: string, options?: unknown): Promise<unknown>;
    isPlatformAudioEnabled?: boolean;
    isPlatformPaused?: boolean;
  };
  advertisement: Emitter & {
    showInterstitial(placement?: string | null): void;
    isInterstitialSupported?: boolean;
  };
}

declare global {
  interface Window {
    bridge?: BridgeGlobal;
  }
}

export class PlaygamaPlatform implements GamePlatform {
  environment = 'none';
  onAudioMute: (muted: boolean) => void = () => undefined;
  onAdPause: (paused: boolean) => void = () => undefined;
  private bridge: BridgeGlobal | null = null;
  private inGameplay = false;
  private lastAd = 0;
  private readySent = false;

  private initPromise: Promise<void> | null = null;

  init(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const b = window.bridge;
    if (!b?.initialize) return;
    try {
      await b.initialize();
      this.bridge = b;
      this.environment = b.platform.id ?? 'playgama';
      const ev = b.EVENT_NAME ?? {};
      // the Bridge already aggregates ads, tab visibility and platform pause
      b.platform.on(ev.PAUSE_STATE_CHANGED ?? 'pause_state_changed', (paused) => this.onAdPause(paused === true));
      b.platform.on(ev.AUDIO_STATE_CHANGED ?? 'audio_state_changed', (enabled) => this.onAudioMute(enabled === false));
      if (b.platform.isPlatformAudioEnabled === false) this.onAudioMute(true);
    } catch {
      this.bridge = null;
    }
  }

  loadingStart(): void {
    this.progress(0);
  }

  loadingProgress(fraction: number): void {
    this.progress(fraction);
  }

  loadingStop(): void {
    if (this.readySent) return;
    this.readySent = true;
    // game_ready must follow a completed initialize(), even if boot stopped waiting for it
    void (this.initPromise ?? Promise.resolve()).then(() => {
      this.progress(1);
      this.message('game_ready');
      if (this.inGameplay) this.message('gameplay_started');
    });
  }

  gameplayStart(): void {
    if (this.inGameplay) return;
    this.inGameplay = true;
    if (this.readySent) this.message('gameplay_started');
  }

  gameplayStop(): void {
    if (!this.inGameplay) return;
    this.inGameplay = false;
    this.message('gameplay_stopped');
  }

  happytime(): void {
    /* no Bridge equivalent */
  }

  /** Interstitial at a natural break between races; never during a race. */
  midgameBreak(): Promise<void> {
    const b = this.bridge;
    const now = Date.now();
    if (!b || b.advertisement.isInterstitialSupported === false || now - this.lastAd < 180_000) return Promise.resolve();
    this.lastAd = now;
    const ev = b.EVENT_NAME?.INTERSTITIAL_STATE_CHANGED ?? 'interstitial_state_changed';
    return new Promise((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        b.advertisement.off?.(ev, listener);
        resolve();
      };
      const listener = (state: unknown): void => {
        if (state === 'closed' || state === 'failed') finish();
      };
      b.advertisement.on(ev, listener);
      try {
        b.advertisement.showInterstitial();
      } catch {
        finish();
      }
      setTimeout(finish, 45_000);
    });
  }

  inviteLink(room: string): string {
    if (location.protocol === 'file:') return '';
    const u = new URL(location.href);
    u.searchParams.set('room', room);
    return u.toString();
  }

  showInviteButton(): void {
    /* not provided by the Bridge */
  }

  hideInviteButton(): void {
    /* not provided by the Bridge */
  }

  inviteRoom(): string | null {
    return new URLSearchParams(location.search).get('room');
  }

  get instantMultiplayer(): boolean {
    return false;
  }

  private progress(fraction: number): void {
    try {
      this.bridge?.setGameLoadingProgress?.(Math.round(Math.max(0, Math.min(1, fraction)) * 100));
    } catch {
      /* ignore */
    }
  }

  private message(m: string): void {
    try {
      void this.bridge?.platform.sendMessage(m).catch(() => undefined);
    } catch {
      /* SDK errors must never break the game */
    }
  }
}
