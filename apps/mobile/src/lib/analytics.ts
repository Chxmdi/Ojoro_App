/**
 * Provider-agnostic analytics. The provider isn't chosen yet (HANDOFF.md, open
 * decisions), so events go to whatever sink is plugged in with `setAnalyticsSink`
 * and are logged in development.
 *
 * Event names mirror `analyticsEvents` in packages/analytics (`@ojoro/analytics`).
 * That package isn't a dependency of the app yet; when it is, import
 * `AnalyticsEvent` and `AnalyticsPayload` from it and delete the local copies.
 */

export type AnalyticsEvent =
  | 'screen_viewed'
  | 'down_for_created'
  | 'im_down_committed'
  | 'plan_threshold_changed'
  | 'game_on_reached'
  | 'need_one_more_shown'
  | 'friend_pulled_in'
  | 'activity_opened'
  | 'activity_started'
  | 'activity_completed'
  | 'recap_viewed'
  | 'run_it_back'
  | 'crew_make_this_a_game'
  | 'challenge_sent'
  | 'challenge_accepted'
  | 'challenge_countered'
  | 'challenge_completed';

export type AnalyticsPayload = Record<string, string | number | boolean | null>;

export type TrackedEvent = {
  name: AnalyticsEvent;
  payload: AnalyticsPayload;
  occurredAt: string;
};

export type AnalyticsSink = (event: TrackedEvent) => void;

let sink: AnalyticsSink | null = null;

/** Plug in the provider. Pass null to detach it. */
export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next;
}

export function track(name: AnalyticsEvent, payload: AnalyticsPayload = {}): void {
  const event: TrackedEvent = { name, payload, occurredAt: new Date().toISOString() };
  if (__DEV__) {
    console.info(`[analytics] ${name}`, payload);
  }
  try {
    sink?.(event);
  } catch (error) {
    // A broken provider must never break the screen that emitted the event.
    if (__DEV__) console.warn('[analytics] sink failed', error);
  }
}
