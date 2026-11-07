/** Ads interface + stub. The CrazyGames SDK can implement `Ads` in a single new file. */
export type RewardedPlacement = 'double_tips' | 'recover_pizza' | 'extra_time';

export interface Ads {
  showRewarded(placement: RewardedPlacement, onReward: () => void, onSkip?: () => void): void;
  showMidgame(placement: 'between_shifts'): void; // interstitial
  gameplayStart(): void;
  gameplayStop(): void;
}

/** Interstitial policy: never before shift 3, at most once every 3 minutes. */
export class MidgamePolicy {
  private last = -Infinity;
  private now: () => number;
  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }
  canShow(nextTurn: number): boolean {
    return nextTurn > 3 && this.now() - this.last >= 180_000;
  }
  mark() {
    this.last = this.now();
  }
}

/** Overlay "AD (stub) – 2 s", then the callback. Never throws into the game. */
export class StubAds implements Ads {
  private playing = false;
  onPauseChange: (paused: boolean) => void = () => {};
  failNext = false; // debug: simulate an ad failure
  private root: HTMLElement;
  private label: string;
  constructor(root: HTMLElement, label: string) {
    this.root = root;
    this.label = label;
  }

  private overlay(done: () => void) {
    const el = document.createElement('div');
    el.className = 'ad-stub';
    let left = 2;
    el.innerHTML = `<div class="ad-card"><b>${this.label}</b><span>– ${left} s</span></div>`;
    this.root.appendChild(el);
    const span = el.querySelector('span')!;
    const iv = window.setInterval(() => {
      left--;
      span.textContent = `– ${left} s`;
      if (left <= 0) {
        window.clearInterval(iv);
        el.remove();
        done();
      }
    }, 1000);
  }

  showRewarded(placement: RewardedPlacement, onReward: () => void, onSkip?: () => void) {
    if (this.playing) return onSkip?.();
    try {
      if (this.failNext) {
        this.failNext = false;
        throw new Error('stub ad failure');
      }
      this.playing = true;
      this.gameplayStop();
      this.overlay(() => {
        this.playing = false;
        this.gameplayStart();
        void placement;
        onReward();
      });
    } catch {
      this.playing = false;
      onSkip?.();
    }
  }

  showMidgame(_placement: 'between_shifts') {
    if (this.playing) return;
    try {
      this.playing = true;
      this.overlay(() => {
        this.playing = false;
      });
    } catch {
      this.playing = false;
    }
  }

  gameplayStart() {
    console.debug('[ads] gameplayStart');
    this.onPauseChange(false);
  }
  gameplayStop() {
    console.debug('[ads] gameplayStop');
    this.onPauseChange(true);
  }
}
