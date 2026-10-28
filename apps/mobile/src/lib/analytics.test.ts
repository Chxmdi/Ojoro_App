import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setAnalyticsSink, track, type TrackedEvent } from './analytics';

describe('track', () => {
  beforeEach(() => {
    vi.stubGlobal('__DEV__', true);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    setAnalyticsSink(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the event to the sink with a timestamp', () => {
    const events: TrackedEvent[] = [];
    setAnalyticsSink((event) => events.push(event));
    track('screen_viewed', { screen: 'home' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: 'screen_viewed', payload: { screen: 'home' } });
    expect(Number.isNaN(Date.parse(events[0]?.occurredAt ?? ''))).toBe(false);
  });

  it('defaults to an empty payload and works without a sink', () => {
    expect(() => track('im_down_committed')).not.toThrow();
    expect(console.info).toHaveBeenCalledWith('[analytics] im_down_committed', {});
  });

  it('never lets a failing sink break the caller', () => {
    setAnalyticsSink(() => {
      throw new Error('provider down');
    });
    expect(() => track('game_on_reached')).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
  });

  it('stays quiet outside development', () => {
    vi.stubGlobal('__DEV__', false);
    setAnalyticsSink(() => {
      throw new Error('provider down');
    });
    track('run_it_back');
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
