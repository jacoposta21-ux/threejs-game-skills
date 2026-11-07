/** Analytics interface + console stub. Swapping the SDK in later is a one-file change. */
export type AnalyticsEvent =
  | 'session_start'
  | 'session_end'
  | 'level_start'
  | 'level_complete'
  | 'level_fail'
  | 'pizza_lost'
  | 'delivery'
  | 'upgrade_bought'
  | 'booster_used'
  | 'ad_rewarded_shown'
  | 'ad_interstitial_shown'
  | 'district_unlocked';

export interface Analytics {
  track(event: AnalyticsEvent, params?: Record<string, string | number | boolean>): void;
}

export class StubAnalytics implements Analytics {
  log: { event: AnalyticsEvent; params?: Record<string, string | number | boolean> }[] = [];
  track(event: AnalyticsEvent, params?: Record<string, string | number | boolean>) {
    this.log.push({ event, params });
    if (this.log.length > 500) this.log.shift();
    console.debug('[analytics]', event, params ?? {});
  }
}

export const analytics: Analytics & { log?: unknown[] } = new StubAnalytics();
