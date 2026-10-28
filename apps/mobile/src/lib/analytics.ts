import type { AnalyticsEvent, AnalyticsPayload } from '@ojoro/analytics';

/**
 * Provider-agnostic analytics. The provider isn't chosen yet (HANDOFF.md, open
 * decisions), so events go to whatever sink is plugged in with `setAnalyticsSink`
 * and are logged in development. Event names come from `@ojoro/analytics`.
 */

export type { AnalyticsEvent, AnalyticsPayload };

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
