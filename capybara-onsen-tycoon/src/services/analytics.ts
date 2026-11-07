/** Analytics interface. Swap StubAnalytics for a real SDK adapter later (one file). */
export type AnalyticsEvent =
  | 'session_start'
  | 'session_end'
  | 'merge'
  | 'max_level_reached'
  | 'pool_bought'
  | 'upgrade_bought'
  | 'offline_collected'
  | 'golden_guest_tapped'
  | 'booster_used'
  | 'ad_rewarded_shown'
  | 'ad_interstitial_shown'
  | 'album_opened';

export interface Analytics {
  track(event: AnalyticsEvent | string, params?: Record<string, number | string>): void;
}

export class StubAnalytics implements Analytics {
  track(event: string, params?: Record<string, number | string>): void {
    try {
      console.debug('[analytics]', event, params ?? {});
    } catch {
      /* never break the game for analytics */
    }
  }
}

export const analytics: Analytics = new StubAnalytics();
