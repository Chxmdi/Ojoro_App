import { describe, expect, it } from 'vitest';

import { activityStripLabel, activityTag } from './ActivityStrip.logic';

describe('activityTag', () => {
  it('forming shows the count boxed', () => {
    expect(activityTag('forming', 5, 8)).toEqual({ kind: 'badge', tone: 'neutral', text: '5 / 8' });
    expect(activityTag(undefined, 5, 8)).toEqual({ kind: 'badge', tone: 'neutral', text: '5 / 8' });
  });

  it('confirmed is a signal GAME ON, full a FULL badge, live the indicator', () => {
    expect(activityTag('confirmed')).toEqual({ kind: 'badge', tone: 'signal', text: 'GAME ON' });
    expect(activityTag('full')).toEqual({ kind: 'badge', tone: 'neutral', text: 'FULL' });
    expect(activityTag('live')).toEqual({ kind: 'live' });
  });

  it('copes with a missing count', () => {
    expect(activityTag('forming')).toEqual({ kind: 'badge', tone: 'neutral', text: '/' });
  });
});

describe('activityStripLabel', () => {
  it('reads in visual order with the visible tag words', () => {
    expect(
      activityStripLabel({
        activity: 'Pickup football',
        time: '7:30',
        place: 'Jeanne-Mance Park',
        status: 'full',
      }),
    ).toBe('7:30, Pickup football, Jeanne-Mance Park, FULL');
    expect(
      activityStripLabel({
        activity: 'Pickup football',
        time: '7:30',
        place: 'Jeanne-Mance Park',
        status: 'confirmed',
      }),
    ).toBe('7:30, Pickup football, Jeanne-Mance Park, GAME ON');
    expect(
      activityStripLabel({ activity: 'Sparring', time: 'NOW', place: 'Hoshino', status: 'live' }),
    ).toBe('NOW, Sparring, Hoshino, LIVE');
    expect(
      activityStripLabel({ activity: 'Run', time: '6:30', place: 'Canal', count: 5, capacity: 8 }),
    ).toBe('6:30, Run, Canal, 5 / 8, forming');
    expect(activityStripLabel({ activity: 'Run', time: '6:30', place: 'Canal' })).toBe(
      '6:30, Run, Canal, forming',
    );
  });
});
