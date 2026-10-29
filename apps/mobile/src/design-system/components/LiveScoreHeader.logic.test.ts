import { describe, expect, it } from 'vitest';

import {
  age,
  clockLabel,
  formatClock,
  freshness,
  scoreLabel,
  scoreValue,
  STALE_AFTER_MS,
} from './LiveScoreHeader.logic';

const NOW = 1_800_000_000_000;

describe('LiveClock', () => {
  it('formats the running clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(45_000)).toBe('0:45');
    expect(formatClock((34 * 60 + 12) * 1000 + 999)).toBe('34:12');
    expect(formatClock((64 * 60 + 9) * 1000)).toBe('1:04:09');
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });

  it('reads the clock in words', () => {
    expect(clockLabel((34 * 60 + 12) * 1000)).toBe('34 minutes, 12 seconds played');
    expect(clockLabel(1000)).toBe('1 second played');
    expect(clockLabel((60 * 60 + 60) * 1000)).toBe('1 hour, 1 minute, 0 seconds played');
    expect(clockLabel(Number.NaN)).toBe('0 seconds played');
  });
});

describe('freshness', () => {
  it('ages in s, min and h', () => {
    expect(age(20_000)).toEqual({ shown: '20 s', spoken: '20 seconds' });
    expect(age(1_000)).toEqual({ shown: '1 s', spoken: '1 second' });
    expect(age(60_000)).toEqual({ shown: '1 min', spoken: '1 minute' });
    expect(age(3 * 60_000)).toEqual({ shown: '3 min', spoken: '3 minutes' });
    expect(age(3_600_000)).toEqual({ shown: '1 h', spoken: '1 hour' });
    expect(age(7_200_000).spoken).toBe('2 hours');
  });

  it('writes the LiveActivity line', () => {
    expect(freshness({ updatedAt: NOW - 20_000, now: NOW, loggedBy: 'Ade (host)' })).toEqual({
      text: 'Updated 20 s ago · logged by Ade (host)',
      spoken: 'Updated 20 seconds ago, logged by Ade (host)',
      stale: false,
    });
  });

  it('says just now, never a negative age', () => {
    expect(freshness({ updatedAt: NOW + 3000, now: NOW }).text).toBe('Updated just now');
    expect(freshness({ updatedAt: NOW - 2000, now: NOW, loggedBy: 'Ade' }).spoken).toBe(
      'Updated just now, logged by Ade',
    );
  });

  it('marks a stale score in words', () => {
    const f = freshness({ updatedAt: NOW - STALE_AFTER_MS - 60_000, now: NOW });
    expect(f.stale).toBe(true);
    expect(f.text).toBe('Updated 3 min ago. Score may be behind.');
  });

  it('keeps the last-known score offline, and says how old', () => {
    expect(
      freshness({ updatedAt: NOW - 180_000, now: NOW, offline: true, loggedBy: 'Ade (host)' }),
    ).toEqual({
      text: 'Offline. Last score 3 min ago · logged by Ade (host)',
      spoken: 'Offline. Last score 3 minutes ago, logged by Ade (host)',
      stale: true,
    });
    expect(freshness({ updatedAt: Number.NaN, now: NOW, offline: true }).text).toBe(
      'Offline. Last score 0 s ago',
    );
  });
});

describe('score', () => {
  it('reads the score', () => {
    expect(scoreLabel({ name: 'LIGHTS', score: 3 }, { name: 'DARKS', score: 2 })).toBe(
      'Score: Lights 3, Darks 2',
    );
    expect(scoreValue(-1)).toBe(0);
    expect(scoreValue(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
