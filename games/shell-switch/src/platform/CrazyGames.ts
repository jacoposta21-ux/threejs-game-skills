/**
 * CrazyGames SDK v3 backend (build with `npm run build:crazygames`).
 * Same surface as the Playgama backend so the game code never changes.
 * The SDK script is loaded from sdk.crazygames.com by the HTML; without it
 * (local file, blocked network) every call degrades to a safe no-op and
 * saves fall back to localStorage.
 */

interface CrazySettings {
  muteAudio: boolean;
  disableChat: boolean;
}

interface CrazySdk {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled' | string;
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    settings: CrazySettings;
    addSettingsChangeListener(cb: (s: CrazySettings) => void): void;
  };
  ad: {
    requestAd(
      type: 'midgame' | 'rewarded',
      callbacks: { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void },
    ): void;
  };
  data: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
}

function sdk(): CrazySdk | null {
  return (window as unknown as { CrazyGames?: { SDK?: CrazySdk } }).CrazyGames?.SDK ?? null;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const memory = new Map<string, string>();
let ready = false;
let loadingDone = false;
let playing = false;
let adOpen = false;
const adListeners: Array<(open: boolean) => void> = [];

// Data module writes are throttled: coalesce per key, flush when the tab hides.
const WRITE_GAP_MS = 8000;
const lastWrite = new Map<string, number>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();

function storeNow(key: string): void {
  pending.delete(key);
  lastWrite.set(key, Date.now());
  const value = memory.get(key);
  const s = ready ? sdk() : null;
  if (s) {
    const ok = safe(() => {
      if (value === undefined) s.data.removeItem(key);
      else s.data.setItem(key, value);
      return true;
    }, false);
    if (ok) return;
  }
  safe(() => {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }, undefined);
}

function scheduleStore(key: string): void {
  if (pending.has(key)) return;
  const wait = Math.max(0, (lastWrite.get(key) ?? 0) + WRITE_GAP_MS - Date.now());
  if (wait === 0) storeNow(key);
  else pending.set(key, setTimeout(() => storeNow(key), wait));
}

function flushAll(): void {
  for (const [key, t] of [...pending]) {
    clearTimeout(t);
    storeNow(key);
  }
}

function setAd(open: boolean): void {
  if (adOpen === open) return;
  adOpen = open;
  for (const cb of adListeners) safe(() => cb(open), undefined);
}

export function createCrazyPlatform(keys: readonly string[]) {
  return {
    async init(): Promise<void> {
      const s = sdk();
      if (s) {
        try {
          await s.init();
          ready = s.environment !== 'disabled';
        } catch {
          ready = false;
        }
      }
      if (ready) safe(() => sdk()!.game.loadingStart(), undefined);
      for (const k of keys) {
        let v: string | null = null;
        if (ready) v = safe(() => sdk()!.data.getItem(k), null);
        if (v === null) v = safe(() => localStorage.getItem(k), null);
        if (typeof v === 'string') memory.set(k, v);
      }
      window.addEventListener('pagehide', flushAll);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushAll();
      });
    },

    get language(): string {
      return 'en';
    },

    get audioEnabled(): boolean {
      return ready ? !safe(() => sdk()!.game.settings.muteAudio, false) : true;
    },

    onAudioState(cb: (enabled: boolean) => void): void {
      if (!ready) return;
      safe(() => sdk()!.game.addSettingsChangeListener((st) => cb(!st.muteAudio)), undefined);
    },

    /** CrazyGames has no platform pause event; ads are handled below. */
    onPauseState(_cb: (paused: boolean) => void): void {
      /* not provided by the SDK */
    },

    onInterstitialState(cb: (opened: boolean) => void): void {
      adListeners.push(cb);
    },

    /** Title screen is interactive: loading is over. */
    gameReady(): void {
      if (!ready || loadingDone) return;
      loadingDone = true;
      safe(() => sdk()!.game.loadingStop(), undefined);
    },

    levelStarted(_world: string): void {
      if (playing) return;
      playing = true;
      if (ready) safe(() => sdk()!.game.gameplayStart(), undefined);
    },

    levelPaused(_world: string): void {
      if (!playing) return;
      playing = false;
      if (ready) safe(() => sdk()!.game.gameplayStop(), undefined);
    },

    levelResumed(_world: string): void {
      if (playing) return;
      playing = true;
      if (ready) safe(() => sdk()!.game.gameplayStart(), undefined);
    },

    /** Mission complete: a genuine celebration moment. */
    levelCompleted(_world: string, _level: string): void {
      if (ready) safe(() => sdk()!.game.happytime(), undefined);
    },

    /**
     * Midgame ads only at natural breaks (mission complete, ending). Opening the
     * pause menu never triggers an ad on CrazyGames. The SDK enforces frequency.
     */
    interstitial(placement: string): void {
      if (!ready || adOpen || placement === 'pause') return;
      const wasPlaying = playing;
      safe(
        () =>
          sdk()!.ad.requestAd('midgame', {
            adStarted: () => {
              if (playing) safe(() => sdk()!.game.gameplayStop(), undefined);
              setAd(true);
            },
            adFinished: () => {
              setAd(false);
              if (wasPlaying && playing) safe(() => sdk()!.game.gameplayStart(), undefined);
            },
            adError: () => {
              const wasOpen = adOpen;
              setAd(false);
              if (wasOpen && playing) safe(() => sdk()!.game.gameplayStart(), undefined);
            },
          }),
        undefined,
      );
    },

    read(key: string): string | null {
      return memory.get(key) ?? null;
    },

    write(key: string, value: string): void {
      if (memory.get(key) === value) return;
      memory.set(key, value);
      scheduleStore(key);
    },

    remove(key: string): void {
      memory.delete(key);
      const t = pending.get(key);
      if (t) clearTimeout(t);
      storeNow(key);
    },
  };
}
