import { AD_POLICY } from '../economy/config.ts';

/**
 * Midgame (interstitial) pacing: only after a new capybara is unlocked,
 * never during the first 5 minutes of the session, at most once per 3 minutes.
 */
export class MidgamePolicy {
  private lastShownAt = -Infinity;
  private readonly cooldownSec: number;
  private readonly graceSec: number;
  constructor(cooldownSec = AD_POLICY.midgameCooldownSec, graceSec = AD_POLICY.midgameGraceSec) {
    this.cooldownSec = cooldownSec;
    this.graceSec = graceSec;
  }

  /** sessionSec = seconds since the session started. */
  canShow(sessionSec: number, afterUnlock: boolean): boolean {
    if (!afterUnlock) return false;
    if (sessionSec < this.graceSec) return false;
    return sessionSec - this.lastShownAt >= this.cooldownSec;
  }

  markShown(sessionSec: number): void {
    this.lastShownAt = sessionSec;
  }
}
