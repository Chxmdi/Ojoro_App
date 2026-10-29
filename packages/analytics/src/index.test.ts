import { describe, expect, it } from 'vitest';
import { analyticsEvents, createAnalyticsEvent } from './index.js';

describe('analytics contract', () => {
  it('creates a typed event envelope', () => {
    const event = createAnalyticsEvent(analyticsEvents.imDownCommitted, {
      planId: 'football-tonight',
    });
    expect(event.name).toBe('im_down_committed');
    expect(event.payload.planId).toBe('football-tonight');
  });

  it('has the Step 5 client events the competition contract names', () => {
    expect([
      analyticsEvents.challengeShared,
      analyticsEvents.challengeLiveViewed,
      analyticsEvents.predictionMade,
      analyticsEvents.crowdBacked,
      analyticsEvents.rematchRequested,
      analyticsEvents.rematchAccepted,
    ]).toEqual([
      'challenge_shared',
      'challenge_live_viewed',
      'prediction_made',
      'crowd_backed',
      'rematch_requested',
      'rematch_accepted',
    ]);
    const names = Object.values(analyticsEvents);
    expect(new Set(names).size).toBe(names.length);
  });
});
