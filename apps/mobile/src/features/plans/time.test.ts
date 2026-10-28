import { describe, expect, it } from 'vitest';

import {
  clock,
  clockWithPeriod,
  closesLabel,
  dailyDate,
  dayDiff,
  dayLabel,
  floodlitLabel,
  planTitle,
  planWhen,
  shortClock,
  zonedParts,
  zonedTime,
} from './time';

const TZ = 'America/Toronto';
// Wed 28 Oct 2026, 4:02 PM in Montréal (EDT, UTC−4).
const NOW = new Date('2026-10-28T20:02:00Z');

describe('zoned time', () => {
  it('reads wall-clock parts in the zone', () => {
    expect(zonedParts('2026-10-28T23:30:00Z', TZ)).toMatchObject({
      year: 2026,
      month: 10,
      day: 28,
      hour: 19,
      minute: 30,
      weekday: 'Wed',
      monthName: 'Oct',
    });
  });

  it('builds an instant from a wall-clock time, across daylight saving', () => {
    expect(zonedTime(2026, 10, 28, 18, 0, TZ).toISOString()).toBe('2026-10-28T22:00:00.000Z');
    // 1 Nov 2026 Montréal is back on EST (UTC−5).
    expect(zonedTime(2026, 11, 2, 18, 0, TZ).toISOString()).toBe('2026-11-02T23:00:00.000Z');
  });

  it('counts calendar days in the zone, not in UTC', () => {
    // 01:30Z on the 29th is still the 28th in Montréal.
    expect(dayDiff('2026-10-29T01:30:00Z', NOW, TZ)).toBe(0);
    expect(dayDiff('2026-10-29T15:00:00Z', NOW, TZ)).toBe(1);
    expect(dayDiff('2026-10-27T23:00:00Z', NOW, TZ)).toBe(-1);
  });
});

describe('clocks', () => {
  it('writes 12-hour times', () => {
    expect(clock('2026-10-28T23:30:00Z', TZ)).toBe('7:30');
    expect(clock('2026-10-28T16:00:00Z', TZ)).toBe('12:00');
    expect(clockWithPeriod('2026-10-29T03:00:00Z', TZ)).toBe('11 PM');
    expect(clockWithPeriod('2026-10-28T13:15:00Z', TZ)).toBe('9:15 AM');
    expect(shortClock(0, 0)).toBe('12 AM');
  });

  it('reads floodlit times', () => {
    expect(floodlitLabel('23:00:00')).toBe('11 PM');
    expect(floodlitLabel('22:30')).toBe('10:30 PM');
    expect(floodlitLabel(null)).toBeNull();
    expect(floodlitLabel('late')).toBeNull();
  });
});

describe('day words', () => {
  it('says tonight, today, tomorrow, last night and yesterday', () => {
    expect(dayLabel('2026-10-28T23:30:00Z', NOW, TZ)).toBe('Tonight');
    expect(dayLabel('2026-10-28T14:00:00Z', NOW, TZ)).toBe('Today');
    expect(dayLabel('2026-10-29T23:30:00Z', NOW, TZ)).toBe('Tomorrow');
    expect(dayLabel('2026-10-28T00:00:00Z', NOW, TZ)).toBe('Last night');
    expect(dayLabel('2026-10-27T14:00:00Z', NOW, TZ)).toBe('Yesterday');
  });

  it('uses the weekday within the week, then a date', () => {
    expect(dayLabel('2026-10-31T14:00:00Z', NOW, TZ)).toBe('Sat');
    expect(dayLabel('2026-11-07T15:00:00Z', NOW, TZ)).toBe('Sat 7 Nov');
    expect(planWhen('2026-10-31T14:00:00Z', NOW, TZ)).toBe('Sat 10:00');
    expect(planWhen('2026-10-28T23:30:00Z', NOW, TZ)).toBe('Tonight 7:30');
  });

  it('writes the daily date and closing times', () => {
    expect(dailyDate(NOW, TZ)).toBe('WED 28 OCT');
    expect(closesLabel('2026-10-28T22:00:00Z', NOW, TZ)).toBe('at 6:00');
    expect(closesLabel('2026-10-29T22:00:00Z', NOW, TZ)).toBe('tomorrow at 6:00');
    expect(closesLabel('2026-10-31T13:00:00Z', NOW, TZ)).toBe('Sat at 9:00');
  });
});

describe('planTitle', () => {
  it('uses the stored title in caps', () => {
    expect(
      planTitle({ title: 'Football tonight', sport_name: 'Football', starts_at: '2026-10-28T23:30:00Z' }, NOW, TZ),
    ).toBe('FOOTBALL TONIGHT');
  });

  it('builds sport + day when the title is missing or only the sport', () => {
    expect(
      planTitle({ title: null, sport_name: 'Basketball', starts_at: '2026-10-31T14:00:00Z' }, NOW, TZ),
    ).toBe('BASKETBALL SAT');
    expect(
      planTitle({ title: 'Volleyball', sport_name: 'Volleyball', starts_at: '2026-10-28T23:30:00Z' }, NOW, TZ),
    ).toBe('VOLLEYBALL TONIGHT');
  });

  it('uses the default zone', () => {
    expect(clock('2026-10-28T23:30:00Z')).toBe('7:30');
    expect(zonedTime(2026, 10, 28, 18, 0).toISOString()).toBe('2026-10-28T22:00:00.000Z');
    expect(dayDiff('2026-10-28T23:30:00Z', NOW)).toBe(0);
  });
});
