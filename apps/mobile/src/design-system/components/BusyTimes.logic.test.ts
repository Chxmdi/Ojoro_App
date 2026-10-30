import { describe, expect, it } from 'vitest';

import {
  barShare,
  busyLabel,
  busyLevel,
  busyMax,
  busyRank,
  busySummary,
  type BusyTimesDatum,
} from './BusyTimes.logic';

const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const week = (values: number[]): BusyTimesDatum[] =>
  values.map((value, i) => ({
    label: names[i]!.slice(0, 3).toUpperCase(),
    name: names[i]!,
    value,
  }));
const place = week([30, 85, 70, 100, 45, 60, 40]);

describe('bars', () => {
  it('scales to the busiest with a floor for non-zero bars', () => {
    expect(busyMax(place)).toBe(100);
    expect(barShare(85, 100)).toBe(0.85);
    expect(barShare(1, 100)).toBe(0.06);
    expect(barShare(0, 100)).toBe(0);
    expect(barShare(5, 0)).toBe(0);
    expect(barShare(200, 100)).toBe(1);
    expect(busyMax([])).toBe(0);
  });
  it('words each level', () => {
    expect(busyLevel(100, 100)).toBe('busiest');
    expect(busyLevel(70, 100)).toBe('busy');
    expect(busyLevel(40, 100)).toBe('steady');
    expect(busyLevel(10, 100)).toBe('quiet');
    expect(busyLevel(0, 100)).toBe('nothing on');
    expect(busyLevel(Number.NaN, 100)).toBe('nothing on');
  });
  it('ranks with shared ties', () => {
    expect(busyRank(place, 3)).toBe(1);
    expect(busyRank(place, 1)).toBe(2);
    expect(busyRank(week([5, 5, 3]), 2)).toBe(2);
  });
});

describe('busySummary', () => {
  it('reads like the design', () => {
    expect(busySummary(place, { currentIndex: 1, period: 'evenings' })).toBe(
      'Busiest Thursday evenings. Tonight (Tuesday) is the second busiest.',
    );
  });
  it('handles the busiest, ties, quiet and no current', () => {
    expect(busySummary(place, { currentIndex: 3 })).toBe(
      'Busiest Thursday. Tonight (Thursday) is the busiest.',
    );
    expect(busySummary(week([5, 5, 0]), { currentIndex: 0, currentWord: 'TODAY' })).toBe(
      'Busiest Monday and Tuesday. Today (Monday) is one of the busiest.',
    );
    expect(busySummary(week([5, 0]), { currentIndex: 1 })).toBe(
      'Busiest Monday. Tonight (Tuesday) is usually quiet.',
    );
    expect(busySummary(week([1, 2, 3, 4, 5, 6, 7]), { currentIndex: 0 })).toBe(
      'Busiest Sunday. Tonight (Monday) is the seventh busiest.',
    );
    expect(busySummary(week([3, 2, 3, 1]), { currentIndex: null })).toBe(
      'Busiest Monday and Wednesday.',
    );
    expect(busySummary(week([0, 0]))).toBe('Not enough games here yet to show when it gets busy.');
  });
  it('falls back to a numeric ordinal past seventh', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      label: `D${i}`,
      name: `Day ${i}`,
      value: 9 - i,
    }));
    expect(busySummary(many, { currentIndex: 8 })).toBe(
      'Busiest Day 0. Tonight (Day 8) is the 9th busiest.',
    );
  });
});

describe('busyLabel', () => {
  it('reads every bar in words and marks now', () => {
    expect(busyLabel("When it's busy, evenings.", week([30, 85, 100]), { currentIndex: 1 })).toBe(
      "When it's busy, evenings. Monday quiet. Tuesday busy, tonight. Wednesday busiest.",
    );
  });
});
