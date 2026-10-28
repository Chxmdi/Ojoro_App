import { describe, expect, it } from 'vitest';

import { pollModel } from './Poll.logic';

const times = [
  { label: '7:30', votes: 4 },
  { label: '8:00', votes: 2 },
];

describe('pollModel', () => {
  it('is open (radio group) before you vote', () => {
    const m = pollModel({ options: times, closes: 'at 6:00' });
    expect(m.mode).toBe('open');
    expect(m.closesLine).toBe('Closes at 6:00');
    expect(m.votesLine).toBe('6 votes');
    expect(m.rows.map((r) => r.accessibilityLabel)).toEqual(['7:30', '8:00']);
  });

  it('shows results with percentages and your vote once voted (Plan: 67% / 33%)', () => {
    const m = pollModel({ options: times, voted: 0, closes: 'at 6:00' });
    expect(m.mode).toBe('results');
    expect(m.rows).toEqual([
      { label: '7:30', pct: 67, mine: true, accessibilityLabel: '7:30, 67 percent, your vote' },
      { label: '8:00', pct: 33, mine: false, accessibilityLabel: '8:00, 33 percent' },
    ]);
  });

  it('closed shows results without a check', () => {
    const m = pollModel({ options: times, voted: 1, closed: true, closes: 'at 6:00' });
    expect(m.mode).toBe('results');
    expect(m.rows.some((r) => r.mine)).toBe(false);
    expect(m.closesLine).toBe('Closed');
    expect(pollModel({ options: times, closed: true }).mode).toBe('results');
  });

  it('copes with no votes, one vote, bad counts and an out-of-range vote', () => {
    const none = pollModel({
      options: [
        { label: 'A', votes: 0 },
        { label: 'B', votes: 0 },
      ],
      closed: true,
    });
    expect(none.votesLine).toBe('0 votes');
    expect(none.rows.map((r) => r.pct)).toEqual([0, 0]);
    expect(
      pollModel({
        options: [
          { label: 'A', votes: 1 },
          { label: 'B', votes: Number.NaN },
        ],
      }).votesLine,
    ).toBe('1 vote');
    expect(pollModel({ options: times, voted: 5 }).mode).toBe('open');
    expect(pollModel({ options: times }).closesLine).toBeNull();
  });
});
