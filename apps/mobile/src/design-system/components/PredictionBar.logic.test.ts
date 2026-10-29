import { describe, expect, it } from 'vitest';

import { pickLabel, predictionLabel, predictionSplit } from './PredictionBar.logic';

const chimdi = { name: 'Chimdi', pct: 48 };
const marcus = { name: 'Marcus', pct: 52 };

describe('predictionSplit', () => {
  it('keeps percentages that already sum to 100', () => {
    expect(predictionSplit(chimdi, marcus)).toEqual({ a: 48, b: 52, empty: false });
  });

  it('normalises raw counts and always sums to 100', () => {
    expect(predictionSplit({ name: 'A', pct: 1 }, { name: 'B', pct: 2 })).toEqual({
      a: 33,
      b: 67,
      empty: false,
    });
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [97, 101],
      [0.5, 0.5],
      [7, 0],
    ] as const) {
      const s = predictionSplit({ name: 'A', pct: x }, { name: 'B', pct: y });
      expect(s.a + s.b).toBe(100);
    }
  });

  it('is empty when nobody has picked, and ignores bad numbers', () => {
    expect(predictionSplit({ name: 'A', pct: 0 }, { name: 'B', pct: 0 })).toEqual({
      a: 0,
      b: 0,
      empty: true,
    });
    expect(predictionSplit({ name: 'A', pct: Number.NaN }, { name: 'B', pct: -3 }).empty).toBe(
      true,
    );
  });
});

describe('predictionLabel', () => {
  it('reads as the spec says', () => {
    expect(predictionLabel({ a: chimdi, b: marcus })).toBe(
      'Who takes it? Chimdi 48 percent, Marcus 52 percent',
    );
  });

  it('adds your pick and the lock', () => {
    expect(predictionLabel({ a: chimdi, b: marcus, picked: 'b', locked: true })).toBe(
      'Who takes it? Chimdi 48 percent, Marcus 52 percent. Your pick, Marcus. Predictions locked',
    );
    expect(
      predictionLabel({ question: 'WHO FINISHES FIRST?', a: chimdi, b: marcus, picked: 'a' }),
    ).toBe('Who finishes first? Chimdi 48 percent, Marcus 52 percent. Your pick, Chimdi');
  });

  it('says when nobody has picked', () => {
    expect(predictionLabel({ a: { name: 'Chimdi', pct: 0 }, b: { name: 'Marcus', pct: 0 } })).toBe(
      'Who takes it? No predictions yet',
    );
  });
});

describe('pickLabel', () => {
  it('names the side with its share', () => {
    expect(pickLabel(chimdi, 48, false)).toBe('Chimdi, 48 percent');
    expect(pickLabel(chimdi, 0, true)).toBe('Chimdi');
  });
});
