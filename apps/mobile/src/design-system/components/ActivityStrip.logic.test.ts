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
  it('reads activity, time, place and status like the web', () => {
    expect(
      activityStripLabel({ activity: 'Pickup football', time: '7:30', place: 'Jeanne-Mance Park', status: 'full' }),
    ).toBe('Pickup football, 7:30, Jeanne-Mance Park, full');
    expect(activityStripLabel({ activity: 'Run', time: '6:30', place: 'Canal' })).toBe('Run, 6:30, Canal, forming');
  });
});
