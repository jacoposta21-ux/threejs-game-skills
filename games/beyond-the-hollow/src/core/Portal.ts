/**
 * One facade for the publishing portals.
 *  - default build: CrazyGames SDK v3 (loaded only on CrazyGames domains, see CrazySDK.ts)
 *  - Playgama build (VITE_PORTAL=playgama, `npm run build:playgama`): Playgama Bridge, whose runtime the
 *    official Vite plugin injects (CDN with a bundled fallback). Bridge also covers Playgama's partner portals.
 *
 * The game only talks to Portal: loading, gameplay start/stop, level events, ads at natural breaks,
 * platform language, platform audio/pause, and cloud saves.
 */
import { Crazy } from './CrazySDK';
import { Sound } from './Audio';

export const IS_PLAYGAMA = import.meta.env.VITE_PORTAL === 'playgama';

type Bridge = any;
let bridge: Bridge | null = null;
let gameplay = false;
let platformMuted = false;
let adPlaying = false;
/** set by the game: pause/resume itself when the platform asks (e.g. an overlay opened over the game) */
let onPlatformPause: ((paused: boolean) => void) | null = null;

const SAVE_KEY = 'beyond-the-hollow-save-v1';

function applyAudio() {
  Sound.setExternalMute(platformMuted || adPlaying);
}

export const Portal = {
  async init(): Promise<void> {
    if (!IS_PLAYGAMA) {
      await Crazy.init();
      return;
    }
    const w = window as any;
    const b = w.bridge ?? w.playgamaBridge ?? null;
    if (!b) return;
    try {
      await b.initialize();
    } catch {
      return;
    }
    // only use the SDK once it is initialized
    bridge = b;
    try {
      bridge.engine = 'phaser';
    } catch { /* optional */ }
    // the platform's own sound switch and pause requests
    try {
      platformMuted = bridge.platform.isAudioEnabled === false;
      bridge.platform.on(bridge.EVENT_NAME.AUDIO_STATE_CHANGED, (enabled: boolean) => {
        platformMuted = !enabled;
        applyAudio();
      });
      bridge.platform.on(bridge.EVENT_NAME.PAUSE_STATE_CHANGED, (paused: boolean) => {
        Sound.suspend(paused);
        onPlatformPause?.(paused);
      });
      bridge.platform.on(bridge.EVENT_NAME.VISIBILITY_STATE_CHANGED, (state: string) => Sound.suspend(state === 'hidden'));
    } catch { /* older platforms: events unsupported */ }
    // have a rewarded ad ready for the game-over screen
    try { if (bridge.advertisement.isRewardedSupported) bridge.advertisement.preloadRewarded(); } catch { /* */ }
    // cloud save → local cache, so the synchronous Save module sees the player's progress
    try {
      const v = await bridge.storage.get(SAVE_KEY, false);
      if (typeof v === 'string' && v.length > 2) localStorage.setItem(SAVE_KEY, v);
    } catch { /* keep the local copy */ }
    applyAudio();
  },
  get name() {
    return IS_PLAYGAMA ? (bridge ? `playgama:${bridge.platform.id}` : 'playgama:offline') : 'crazygames';
  },
  /** two-letter language reported by the platform, if any */
  language(): string | null {
    try {
      const l = bridge?.platform?.language;
      return typeof l === 'string' && l ? l.toLowerCase().slice(0, 2) : null;
    } catch {
      return null;
    }
  },
  setPauseHandler(fn: (paused: boolean) => void) {
    onPlatformPause = fn;
  },
  loadingProgress(pct: number) {
    try { bridge?.setGameLoadingProgress?.(Math.round(pct)); } catch { /* */ }
  },
  loadingStart() {
    if (!IS_PLAYGAMA) Crazy.loadingStart();
  },
  /** the game is loaded and interactive */
  loadingStop() {
    if (!IS_PLAYGAMA) return Crazy.loadingStop();
    try { bridge?.platform.sendMessage('game_ready'); } catch { /* */ }
  },
  gameplayStart() {
    if (!IS_PLAYGAMA) return Crazy.gameplayStart();
    if (gameplay) return;
    gameplay = true;
    try { bridge?.platform.sendMessage('gameplay_started'); } catch { /* */ }
  },
  gameplayStop() {
    if (!IS_PLAYGAMA) return Crazy.gameplayStop();
    if (!gameplay) return;
    gameplay = false;
    try { bridge?.platform.sendMessage('gameplay_stopped'); } catch { /* */ }
  },
  levelStarted(level: number) {
    try { bridge?.platform.sendMessage('level_started', { level: level + 1 }); } catch { /* */ }
  },
  levelCompleted(level: number) {
    try { bridge?.platform.sendMessage('level_completed', { level: level + 1 }); } catch { /* */ }
  },
  levelFailed(level: number) {
    try { bridge?.platform.sendMessage('level_failed', { level: level + 1 }); } catch { /* */ }
  },
  /** a big moment (boss defeated) */
  happytime() {
    if (!IS_PLAYGAMA) return Crazy.happytime();
    try { bridge?.platform.sendMessage('player_got_achievement'); } catch { /* */ }
  },
  /**
   * An interstitial at a natural break (between parts / chapters). Sound is muted while it plays.
   * Resolves when the ad is over, failed, or was not shown (the platform enforces its own minimum delay).
   */
  breakAd(_reason: 'level' | 'chapter' | 'retry' | 'quit'): Promise<void> {
    // CrazyGames and Playgama both rate-limit midgame ads themselves
    if (!IS_PLAYGAMA) return Crazy.midgameAd();
    const b = bridge;
    if (!b || !b.advertisement?.isInterstitialSupported) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        adPlaying = false;
        applyAudio();
        try { b.advertisement.off?.(b.EVENT_NAME.INTERSTITIAL_STATE_CHANGED, onState); } catch { /* */ }
        resolve();
      };
      const onState = (state: string) => {
        if (state === 'opened') {
          adPlaying = true;
          applyAudio();
        } else if (state === 'closed' || state === 'failed') finish();
      };
      try {
        b.advertisement.on(b.EVENT_NAME.INTERSTITIAL_STATE_CHANGED, onState);
        b.advertisement.showInterstitial();
      } catch {
        finish();
      }
      // if the platform skips the ad (minimum delay not reached) no state change comes: don't hang
      setTimeout(() => { if (!adPlaying) finish(); }, 1500);
    });
  },
  /** can we offer a rewarded ad right now? */
  rewardedAvailable(): boolean {
    if (!IS_PLAYGAMA) return Crazy.ready;
    try {
      return !!bridge?.advertisement?.isRewardedSupported;
    } catch {
      return false;
    }
  },
  /** A rewarded ad. Resolves true only when the platform grants the reward. Sound is muted while it plays. */
  rewarded(): Promise<boolean> {
    if (!IS_PLAYGAMA) return Crazy.rewardedAd();
    const b = bridge;
    if (!b || !b.advertisement?.isRewardedSupported) return Promise.resolve(false);
    return new Promise((resolve) => {
      let granted = false, done = false;
      const finish = () => {
        if (done) return;
        done = true;
        adPlaying = false;
        applyAudio();
        try { b.advertisement.off?.(b.EVENT_NAME.REWARDED_STATE_CHANGED, onState); } catch { /* */ }
        try { b.advertisement.preloadRewarded(); } catch { /* */ }
        resolve(granted);
      };
      const onState = (state: string) => {
        if (state === 'opened') {
          adPlaying = true;
          applyAudio();
        } else if (state === 'rewarded') granted = true;
        else if (state === 'closed' || state === 'failed') finish();
      };
      try {
        b.advertisement.on(b.EVENT_NAME.REWARDED_STATE_CHANGED, onState);
        b.advertisement.showRewarded();
      } catch {
        finish();
      }
    });
  },
  /** mirror the save to the platform's storage (cloud saves where available) */
  persist(json: string) {
    if (!bridge) return;
    try { bridge.storage.set(SAVE_KEY, json); } catch { /* */ }
  },
};
