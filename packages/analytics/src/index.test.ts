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
});
