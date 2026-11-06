import { createCrazyPlatform } from './CrazyGames';

/**
 * Playgama Bridge integration (default build). `npm run build:crazygames`
 * swaps in the CrazyGames SDK backend instead (see CrazyGames.ts). Every platform call goes through here so the
 * rest of the game never touches the SDK (or browser storage) directly.
 * Without the SDK (e.g. a bare dev server) every call degrades to a safe no-op
 * and storage lives in memory for the session.
 */

interface BridgeLike {
  initialize(): Promise<void>;
  EVENT_NAME: { AUDIO_STATE_CHANGED: string; PAUSE_STATE_CHANGED: string; INTERSTITIAL_STATE_CHANGED: string };
  platform: {
    language: string;
    isAudioEnabled: boolean;
    sendMessage(message: string, options?: Record<string, string>): unknown;
    on(event: string, cb: (value: boolean) => void): void;
  };
  storage: {
    get(keys: string[]): Promise<unknown[]>;
    set(keys: string[], values: string[]): Promise<void>;
    delete(keys: string[]): Promise<void>;
  };
  advertisement: {
    isInterstitialSupported: boolean;
    interstitialState: string;
    showInterstitial(placement?: string): unknown;
    on(event: string, cb: (state: string) => void): void;
  };
}

function sdk(): BridgeLike | null {
  return ((window as unknown as { bridge?: BridgeLike }).bridge ?? null) as BridgeLike | null;
}

const memory = new Map<string, string>();
let ready = false;
let gameReadySent = false;
let lastLevelState: 'started' | 'paused' | null = null;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const STORAGE_KEYS = ['shell-switch-save-v1', 'shell-switch-settings-v1'] as const;

const BridgePlatform = {
  /** Initialize the SDK and load every saved key in one call, before the game starts. */
  async init(): Promise<void> {
    const b = sdk();
    if (!b) return;
    try {
      await b.initialize();
      ready = true;
    } catch {
      ready = false;
      return;
    }
    try {
      const values = await b.storage.get([...STORAGE_KEYS]);
      STORAGE_KEYS.forEach((k, i) => {
        const v = values[i];
        if (typeof v === 'string') memory.set(k, v);
        else if (v !== null && v !== undefined) memory.set(k, JSON.stringify(v));
      });
    } catch {
      /* no saved data available */
    }
  },

  get language(): string {
    return ready ? safe(() => sdk()!.platform.language, 'en') || 'en' : 'en';
  },

  get audioEnabled(): boolean {
    return ready ? safe(() => sdk()!.platform.isAudioEnabled !== false, true) : true;
  },

  onAudioState(cb: (enabled: boolean) => void): void {
    if (!ready) return;
    safe(() => sdk()!.platform.on(sdk()!.EVENT_NAME.AUDIO_STATE_CHANGED, cb), undefined);
  },

  onPauseState(cb: (paused: boolean) => void): void {
    if (!ready) return;
    safe(() => sdk()!.platform.on(sdk()!.EVENT_NAME.PAUSE_STATE_CHANGED, cb), undefined);
  },

  /** True while an interstitial is on screen (checked at start, then via events). */
  onInterstitialState(cb: (opened: boolean) => void): void {
    if (!ready) return;
    safe(() => {
      const b = sdk()!;
      if (b.advertisement.interstitialState === 'opened') cb(true);
      b.advertisement.on(b.EVENT_NAME.INTERSTITIAL_STATE_CHANGED, (s) => cb(s === 'opened'));
    }, undefined);
  },

  gameReady(): void {
    if (!ready || gameReadySent) return;
    gameReadySent = true;
    safe(() => sdk()!.platform.sendMessage('game_ready'), undefined);
  },

  levelStarted(world: string): void {
    if (lastLevelState === 'started') return;
    lastLevelState = 'started';
    if (ready) safe(() => sdk()!.platform.sendMessage('level_started', { world, level: world }), undefined);
  },

  levelPaused(world: string): void {
    if (lastLevelState !== 'started') return;
    lastLevelState = 'paused';
    if (ready) safe(() => sdk()!.platform.sendMessage('level_paused', { world, level: world }), undefined);
  },

  levelResumed(world: string): void {
    if (lastLevelState !== 'paused') return;
    lastLevelState = 'started';
    if (ready) safe(() => sdk()!.platform.sendMessage('level_resumed', { world, level: world }), undefined);
  },

  levelCompleted(world: string, level: string): void {
    if (ready) safe(() => sdk()!.platform.sendMessage('level_completed', { world, level }), undefined);
  },

  /** Ask for an interstitial at a natural pause. Bridge decides whether one is actually shown. */
  interstitial(placement: string): void {
    if (!ready) return;
    safe(() => {
      const b = sdk()!;
      if (b.advertisement.isInterstitialSupported) b.advertisement.showInterstitial(placement);
    }, undefined);
  },

  // ---------------------------------------------------------------- storage
  read(key: string): string | null {
    return memory.get(key) ?? null;
  },

  write(key: string, value: string): void {
    memory.set(key, value);
    if (ready) safe(() => sdk()!.storage.set([key], [value]).catch(() => undefined), undefined);
  },

  remove(key: string): void {
    memory.delete(key);
    if (ready) safe(() => sdk()!.storage.delete([key]).catch(() => undefined), undefined);
  },
};


/** Chosen at build time: `vite build --mode crazygames` uses the CrazyGames SDK. */
export const Platform: typeof BridgePlatform =
  import.meta.env.MODE === 'crazygames' ? createCrazyPlatform(STORAGE_KEYS) : BridgePlatform;
