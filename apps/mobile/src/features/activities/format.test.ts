import { describe, expect, it } from 'vitest';

import {
  attendanceRuleLabel,
  clock,
  clockWithPeriod,
  costLabel,
  dateLabel,
  dayLabel,
  distanceKm,
  distanceLabel,
  firstName,
  hourWithPeriod,
  monthSince,
  namesList,
  ordinal,
  shortDate,
  shortPlace,
  stampDate,
  weekdayClock,
  weekdayHour,
  zonedParts,
  zonedTime,
} from './format';

const TZ = 'America/Toronto';
// Tue 27 Oct 2026, 7:30 PM in Montréal (EDT, UTC−4).
const TUE_730 = '2026-10-27T23:30:00Z';

describe('zoned time', () => {
  it('reads wall-clock parts in the place zone', () => {
    expect(zonedParts(TUE_730, TZ)).toEqual({
      year: 2026,
      month: 10,
      day: 27,
      weekday: 2,
      hour: 19,
      minute: 30,
    });
  });

  it('defaults to Montréal', () => {
    expect(zonedParts(TUE_730).hour).toBe(19);
  });

  it('finds the instant for a wall-clock time, across daylight saving', () => {
    expect(zonedTime({ year: 2026, month: 10, day: 27, hour: 19, minute: 30 }, TZ).toISOString()).toBe('2026-10-27T23:30:00.000Z');
    // 3 Nov 2026 is after the change to EST (UTC−5).
    expect(zonedTime({ year: 2026, month: 11, day: 3, hour: 19, minute: 30 }, TZ).toISOString()).toBe(
      '2026-11-04T00:30:00.000Z',
    );
  });

  it('rolls over month ends', () => {
    expect(zonedTime({ year: 2026, month: 10, day: 34, hour: 19, minute: 30 }, TZ).toISOString()).toBe(
      '2026-11-04T00:30:00.000Z',
    );
  });
});

describe('time words', () => {
  it('writes clock times', () => {
    expect(clock(TUE_730, TZ)).toBe('7:30');
    expect(clockWithPeriod(TUE_730, TZ)).toBe('7:30 PM');
    expect(clockWithPeriod('2026-10-27T13:05:00Z', TZ)).toBe('9:05 AM');
    expect(clock('2026-10-27T04:00:00Z', TZ)).toBe('12:00');
    expect(clock(new Date('2026-10-27T16:00:00Z'), TZ)).toBe('12:00');
  });

  it('drops :00 on the hour', () => {
    expect(hourWithPeriod('2026-10-28T01:00:00Z', TZ)).toBe('9 PM');
    expect(hourWithPeriod('2026-10-28T01:30:00Z', TZ)).toBe('9:30 PM');
    expect(hourWithPeriod('2026-10-27T16:00:00Z', TZ)).toBe('12 PM');
  });

  it('labels the day relative to now', () => {
    const now = new Date('2026-10-27T16:00:00Z'); // Tue noon
    expect(dayLabel(TUE_730, now, TZ)).toBe('TONIGHT');
    expect(dayLabel('2026-10-27T14:00:00Z', now, TZ)).toBe('TODAY');
    expect(dayLabel('2026-10-28T23:30:00Z', now, TZ)).toBe('TOMORROW');
    expect(dayLabel('2026-10-26T23:30:00Z', now, TZ)).toBe('YESTERDAY');
    expect(dayLabel('2026-10-29T23:30:00Z', now, TZ)).toBe('THU');
    expect(dayLabel('2026-11-10T23:30:00Z', now, TZ)).toBe('TUE 10 NOV');
    expect(dayLabel('2026-10-20T23:30:00Z', now, TZ)).toBe('TUE 20 OCT');
  });

  it('writes dates', () => {
    expect(shortDate(TUE_730, TZ)).toBe('Tue 27 Oct');
    expect(dateLabel('2026-10-06T23:30:00Z', TZ)).toBe('TUE 6 OCT');
    expect(weekdayClock(TUE_730, TZ)).toBe('Tue 7:30');
    expect(weekdayHour('2026-10-29T01:00:00Z', TZ)).toBe('WED 9 PM');
    expect(stampDate('2026-10-06T23:30:00Z', TZ)).toBe('06.10.26');
  });

  it('says since when', () => {
    const now = new Date(TUE_730);
    expect(monthSince('2026-03-12T23:00:00Z', now, TZ)).toBe('March');
    expect(monthSince('2025-03-12T23:00:00Z', now, TZ)).toBe('March 2025');
  });
});

describe('words', () => {
  it('shortens place names', () => {
    expect(shortPlace('Jeanne-Mance Park')).toBe('Jeanne-Mance');
    expect(shortPlace('Parc La Fontaine')).toBe('La Fontaine');
    expect(shortPlace('Lachine Canal')).toBe('Lachine Canal');
    expect(shortPlace('Park')).toBe('Park');
  });

  it('writes cost for display', () => {
    expect(costLabel(0)).toBe('Free');
    expect(costLabel(1200)).toBe('$12');
    expect(costLabel(1250, 'USD')).toBe('$12.50');
    expect(costLabel(500, 'EUR')).toBe('EUR 5');
  });

  it('writes the attendance rule', () => {
    expect(attendanceRuleLabel('check_in_host_confirms')).toBe('Check-in at the pitch. Host confirms.');
    expect(attendanceRuleLabel('check_in')).toBe('Check-in at the pitch.');
  });

  it('lists names', () => {
    expect(namesList([])).toBe('');
    expect(namesList(['Lena'])).toBe('Lena');
    expect(namesList(['Lena', 'Joel'])).toBe('Lena and Joel');
    expect(namesList(['Lena', 'Sam', 'Yara', 'Tolu'])).toBe('Lena, Sam, Yara and Tolu');
  });

  it('takes first names and ordinals', () => {
    expect(firstName('Ade B')).toBe('Ade');
    expect(firstName('  Ade  ')).toBe('Ade');
    expect(['1', '2', '3', '4', '11', '12', '13', '21', '22', '112'].map((n) => ordinal(Number(n)))).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '112th',
    ]);
  });

  it('measures distance', () => {
    const km = distanceKm({ lat: 45.53, lng: -73.58 }, { lat: 45.5165, lng: -73.5862 });
    expect(km).toBeGreaterThan(1.4);
    expect(km).toBeLessThan(1.7);
    expect(distanceLabel(1.234)).toBe('1.2 km');
    expect(distanceLabel(12.6)).toBe('13 km');
    expect(distanceLabel(0.42)).toBe('400 m');
    expect(distanceLabel(0.01)).toBe('100 m');
  });
});
