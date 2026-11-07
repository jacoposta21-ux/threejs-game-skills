/**
 * Ads interface (shape of the CrazyGames SDK). StubAds shows a DOM overlay
 * instead of a real ad. To integrate the SDK, implement Ads in one new file
 * and change the `ads` export below.
 */
export type RewardedPlacement = 'offline_x2' | 'golden_guest_x3' | 'boost_x2';

export interface Ads {
  showRewarded(placement: RewardedPlacement, onReward: () => void, onSkip?: () => void): void;
  showMidgame(placement: 'album_unlock'): void; // interstitial
  gameplayStart(): void;
  gameplayStop(): void;
}

/** Hooks the game registers so it can pause/mute while an ad is on screen. */
export interface AdHooks {
  onAdStart?: () => void;
  onAdEnd?: () => void;
}

export class StubAds implements Ads {
  hooks: AdHooks = {};
  private busy = false;
  private playing = true;

  private readonly opts: { durationMs?: number; fail?: boolean };
  constructor(opts: { durationMs?: number; fail?: boolean } = {}) {
    this.opts = opts;
  }

  showRewarded(placement: RewardedPlacement, onReward: () => void, onSkip?: () => void): void {
    this.show(`AD (stub) – rewarded: ${placement}`, this.opts.fail ? 'fail' : 'reward', onReward, onSkip);
  }

  showMidgame(placement: 'album_unlock'): void {
    this.show(`AD (stub) – interstitial: ${placement}`, 'reward', () => {}, () => {});
  }

  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    console.debug('[ads] gameplayStart');
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    console.debug('[ads] gameplayStop');
  }

  private show(label: string, outcome: 'reward' | 'fail', onReward: () => void, onSkip?: () => void): void {
    const safe = (fn?: () => void) => {
      try {
        fn?.();
      } catch (e) {
        console.error('[ads] callback failed', e);
      }
    };
    if (this.busy || typeof document === 'undefined') {
      safe(onSkip);
      return;
    }
    this.busy = true;
    safe(this.hooks.onAdStart);
    const el = document.createElement('div');
    el.className = 'stub-ad';
    const dur = this.opts.durationMs ?? 2000;
    el.innerHTML = `<div class="stub-ad-box"><div class="stub-ad-title">${label}</div><div class="stub-ad-count">2 s</div></div>`;
    document.body.appendChild(el);
    const count = el.querySelector('.stub-ad-count') as HTMLElement;
    const start = performance.now();
    const iv = window.setInterval(() => {
      const left = Math.max(0, dur - (performance.now() - start));
      count.textContent = `${Math.ceil(left / 1000)} s`;
    }, 100);
    window.setTimeout(
      () => {
        window.clearInterval(iv);
        el.remove();
        this.busy = false;
        safe(this.hooks.onAdEnd);
        if (outcome === 'reward') safe(onReward);
        else safe(onSkip);
      },
      outcome === 'fail' ? 800 : dur,
    );
  }
}

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const ads = new StubAds({ fail: params.has('adfail') });
