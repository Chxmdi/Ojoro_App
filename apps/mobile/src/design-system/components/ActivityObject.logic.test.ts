import { describe, expect, it } from 'vitest';

import {
  activityObjectLabel,
  activityObjectModel,
  isActivityBreakthrough,
  spokenDay,
} from './ActivityObject.logic';

const base = {
  activity: 'Pickup football',
  day: 'Thu',
  time: '7:30',
  place: 'Jeanne-Mance Park',
  count: 6,
  capacity: 10,
};

describe('activityObjectModel', () => {
  it('forming: calm ground, count badge, open spots, I’M DOWN', () => {
    const m = activityObjectModel(base);
    expect(m.situation).toBe('calm');
    expect(m.tag).toEqual({ kind: 'badge', tone: 'neutral', text: '6 / 10' });
    expect(m.openSpots).toBe(2);
    expect(m.join).toBe('join');
    expect(m.full).toBe(false);
    expect(m.accessibilityLabel).toBe('Pickup football, Thu 7:30, Jeanne-Mance Park. 6 of 10 in.');
  });

  it('forming and joined: YOU’RE DOWN; one spot left shows one open', () => {
    const m = activityObjectModel({ ...base, count: 9, joined: true });
    expect(m.join).toBe('joined');
    expect(m.openSpots).toBe(1);
  });

  it('confirmed: its own situation, GAME ON badge, no join, no open spots', () => {
    const m = activityObjectModel({ ...base, count: 10, status: 'confirmed' });
    expect(m.situation).toBe('confirmed');
    expect(m.tag).toEqual({ kind: 'badge', tone: 'signal', text: 'GAME ON' });
    expect(m.join).toBe('none');
    expect(m.openSpots).toBe(0);
    expect(m.accessibilityLabel).toMatch(/10 of 10 in\. Game on\.$/);
  });

  it('live: live situation and the LIVE tag', () => {
    const m = activityObjectModel({ ...base, status: 'live' });
    expect(m.situation).toBe('live');
    expect(m.tag).toEqual({ kind: 'live' });
    expect(m.accessibilityLabel).toMatch(/Live now\.$/);
  });

  it('full while forming: FULL, no join for those not in, YOU’RE DOWN for those in', () => {
    const out = activityObjectModel({ ...base, count: 10 });
    expect(out.full).toBe(true);
    expect(out.tag).toEqual({ kind: 'badge', tone: 'neutral', text: 'FULL' });
    expect(out.join).toBe('none');
    expect(out.openSpots).toBe(0);
    expect(out.accessibilityLabel).toMatch(/Full\.$/);
    expect(activityObjectModel({ ...base, count: 10, joined: true }).join).toBe('joined');
  });

  it('adds the distance to the place', () => {
    expect(activityObjectModel({ ...base, distance: '1.2 km' }).where).toBe(
      'Jeanne-Mance Park · 1.2 km',
    );
    expect(activityObjectModel(base).where).toBe('Jeanne-Mance Park');
  });

  it('clamps bad counts', () => {
    const m = activityObjectModel({ ...base, count: -1, capacity: Number.NaN });
    expect(m.tag).toEqual({ kind: 'badge', tone: 'neutral', text: '0 / 0' });
    expect(m.full).toBe(false);
    expect(m.left).toBe(0);
  });
});

describe('spokenDay', () => {
  it('turns an all-caps day into a word', () => {
    expect(spokenDay('TONIGHT')).toBe('Tonight');
    expect(spokenDay('Thu')).toBe('Thu');
    expect(spokenDay('6.10')).toBe('6.10');
    expect(spokenDay('X')).toBe('X');
  });
});

describe('activityObjectLabel', () => {
  it('uses the spoken day', () => {
    expect(
      activityObjectLabel({
        ...base,
        day: 'TONIGHT',
        count: 8,
        capacity: 8,
        status: 'confirmed',
        full: false,
      }),
    ).toBe('Pickup football, Tonight 7:30, Jeanne-Mance Park. 8 of 8 in. Game on.');
  });
});

describe('isActivityBreakthrough', () => {
  it('plays only when forming turns confirmed', () => {
    expect(isActivityBreakthrough('forming', 'confirmed')).toBe(true);
    expect(isActivityBreakthrough(undefined, 'confirmed')).toBe(false);
    expect(isActivityBreakthrough('confirmed', 'confirmed')).toBe(false);
    expect(isActivityBreakthrough('confirmed', 'live')).toBe(false);
    expect(isActivityBreakthrough('forming', 'live')).toBe(false);
    expect(isActivityBreakthrough('forming', 'forming')).toBe(false);
  });
});
