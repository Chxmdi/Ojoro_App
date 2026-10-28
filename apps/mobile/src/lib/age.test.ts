import { describe, expect, it } from 'vitest';

import { clockTime, clockTimeWithPeriod, updatedAt } from './age';

describe('age helpers', () => {
  it('formats 12-hour clock times like the designs', () => {
    expect(clockTime(new Date(2026, 9, 28, 19, 2))).toBe('7:02');
    expect(clockTime(new Date(2026, 9, 28, 0, 5))).toBe('12:05');
    expect(clockTime(new Date(2026, 9, 28, 12, 30))).toBe('12:30');
    expect(clockTimeWithPeriod(new Date(2026, 9, 28, 19, 2))).toBe('7:02 PM');
    expect(clockTimeWithPeriod(new Date(2026, 9, 28, 9, 15))).toBe('9:15 AM');
  });

  it('treats an empty dataUpdatedAt as never loaded', () => {
    expect(updatedAt(0)).toBeNull();
    expect(updatedAt(1_700_000_000_000)?.getTime()).toBe(1_700_000_000_000);
  });
});
