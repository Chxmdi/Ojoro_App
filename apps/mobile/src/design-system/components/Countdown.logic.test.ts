import { describe, expect, it } from 'vitest';

import { countdownLabel, countdownParts, countdownUnits, nextTickDelay } from './Countdown.logic';

const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

describe('countdownUnits', () => {
  it('pads to two digits and keeps the order (EventBuildup: 03 14 20)', () => {
    expect(countdownUnits({ days: 3, hours: 14, minutes: 20 })).toEqual([
      { key: 'days', value: '03', unit: 'DAYS' },
      { key: 'hours', value: '14', unit: 'HRS' },
      { key: 'minutes', value: '20', unit: 'MIN' },
    ]);
  });

  it('shows only the units passed; seconds when given; bad values dropped', () => {
    expect(countdownUnits({ minutes: 4, seconds: 7 }).map((u) => u.value)).toEqual(['04', '07']);
    expect(countdownUnits({ days: Number.NaN, hours: -2, minutes: 120.7 })).toEqual([
      { key: 'hours', value: '00', unit: 'HRS' },
      { key: 'minutes', value: '120', unit: 'MIN' },
    ]);
  });
});

describe('countdownLabel', () => {
  it('reads the units in words after the label', () => {
    expect(countdownLabel({ days: 3, hours: 14, minutes: 20 }, 'STARTS IN')).toBe(
      'Starts in: 3 days, 14 hours, 20 minutes',
    );
    expect(countdownLabel({ days: 1, hours: 1, minutes: 1 })).toBe('1 day, 1 hour, 1 minute');
  });

  it('never speaks seconds, so it changes at most once a minute', () => {
    expect(countdownLabel({ minutes: 12, seconds: 40 })).toBe('12 minutes');
    expect(countdownLabel({ minutes: 12, seconds: 39 })).toBe(
      countdownLabel({ minutes: 12, seconds: 40 }),
    );
  });

  it('drops leading zero units, and says the last minute and zero in words', () => {
    expect(countdownLabel({ days: 0, hours: 2, minutes: 0 })).toBe('2 hours, 0 minutes');
    expect(countdownLabel({ minutes: 0, seconds: 30 }, 'STARTS IN')).toBe(
      'Starts in: less than a minute',
    );
    expect(countdownLabel({ minutes: 0, seconds: 0 })).toBe('now');
    expect(countdownLabel({})).toBe('now');
  });
});

describe('countdownParts', () => {
  it('days, hours, minutes while a day or more is left', () => {
    expect(countdownParts(3 * D + 14 * H + 20 * M + 59 * S)).toEqual({
      days: 3,
      hours: 14,
      minutes: 20,
    });
  });

  it('hours and minutes under a day; minutes and seconds in the last hour', () => {
    expect(countdownParts(5 * H + 2 * M)).toEqual({ hours: 5, minutes: 2 });
    expect(countdownParts(42 * M + 7 * S + 500)).toEqual({ minutes: 42, seconds: 7 });
  });

  it('stops at zero and copes with bad input', () => {
    expect(countdownParts(-5)).toEqual({ minutes: 0, seconds: 0 });
    expect(countdownParts(Number.NaN)).toEqual({ minutes: 0, seconds: 0 });
  });
});

describe('nextTickDelay', () => {
  it('ticks at the next minute boundary over an hour', () => {
    expect(nextTickDelay(2 * H + 30 * S)).toBe(30 * S);
    expect(nextTickDelay(2 * H)).toBe(M);
  });

  it('ticks every second in the last hour', () => {
    expect(nextTickDelay(H)).toBe(S);
    expect(nextTickDelay(10 * M + 250)).toBe(250);
  });

  it('stops at zero', () => {
    expect(nextTickDelay(0)).toBeNull();
    expect(nextTickDelay(-1)).toBeNull();
    expect(nextTickDelay(Number.NaN)).toBeNull();
  });
});
