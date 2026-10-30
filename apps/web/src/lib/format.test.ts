import { describe, expect, it } from 'vitest';

import {
  ago,
  cleanCode,
  count,
  dateTime,
  fromLocalInput,
  humanize,
  localInputValue,
  longAge,
  normalizePhone,
  shortAge,
} from './format';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const before = (ms: number) => new Date(NOW - ms).toISOString();

describe('ages', () => {
  it('shortens', () => {
    expect(shortAge(null, NOW)).toBe('–');
    expect(shortAge('nope', NOW)).toBe('–');
    expect(shortAge(before(10_000), NOW)).toBe('now');
    expect(shortAge(before(5 * 60_000), NOW)).toBe('5 min');
    expect(shortAge(before(3 * 3_600_000), NOW)).toBe('3 h');
    expect(shortAge(before(2 * 86_400_000), NOW)).toBe('2 d');
    expect(shortAge(before(21 * 86_400_000), NOW)).toBe('3 wk');
    expect(shortAge(new Date(NOW + 60_000).toISOString(), NOW)).toBe('now');
  });
  it('says ago and the long form', () => {
    expect(ago(before(10_000), NOW)).toBe('just now');
    expect(ago(before(3 * 3_600_000), NOW)).toBe('3 h ago');
    expect(ago(null, NOW)).toBe('at an unknown time');
    expect(longAge(before(3_600_000), NOW)).toBe('1 hour');
    expect(longAge(before(3 * 86_400_000), NOW)).toBe('3 days');
    expect(longAge(before(1000), NOW)).toBe('under a minute');
    expect(longAge(null, NOW)).toBe('unknown');
  });
});

describe('words', () => {
  it('formats dates', () => {
    expect(dateTime('2026-10-30T14:05:00Z', 'UTC')).toBe('30 Oct 2026, 14:05');
    expect(dateTime(null)).toBe('–');
    expect(dateTime('x')).toBe('–');
    expect(dateTime('2026-10-30T14:05:00Z')).toMatch(/2026/);
  });
  it('counts and humanizes', () => {
    expect(count(1, 'report')).toBe('1 report');
    expect(count(3, 'report')).toBe('3 reports');
    expect(count(2, 'person', 'people')).toBe('2 people');
    expect(humanize('hate_or_harassment')).toBe('Hate or harassment');
    expect(humanize(null)).toBe('–');
  });
});

describe('phone and code', () => {
  it('normalizes', () => {
    expect(normalizePhone('555 555 0100')).toEqual({ ok: true, e164: '+15555550100' });
    expect(normalizePhone('+1 555 555 0100')).toEqual({ ok: true, e164: '+15555550100' });
    expect(normalizePhone('0044 7700 900123')).toEqual({ ok: true, e164: '+447700900123' });
    expect(normalizePhone('').ok).toBe(false);
    expect(normalizePhone('abc').ok).toBe(false);
    expect(normalizePhone('+1 555').ok).toBe(false);
    expect(normalizePhone('+44 12').ok).toBe(false);
  });
  it('cleans codes', () => {
    expect(cleanCode('12 34-567')).toBe('123456');
  });
  it('round-trips datetime-local values', () => {
    const d = new Date(2026, 10, 6, 18, 0);
    expect(localInputValue(d)).toBe('2026-11-06T18:00');
    expect(fromLocalInput('2026-11-06T18:00')).toBe(d.toISOString());
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('garbage')).toBeNull();
  });
});
