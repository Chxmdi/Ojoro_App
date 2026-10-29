import { describe, expect, it } from 'vitest';

import {
  REACTIONS,
  reactionCount,
  reactionLabel,
  reactionWord,
  toggleReaction,
} from './ReactionBar.logic';

describe('ReactionBar logic', () => {
  it('has the fixed vocabulary', () => {
    expect(REACTIONS).toEqual(['LET’S GO', 'RESPECT', 'HOLD THAT', 'RUN IT BACK']);
  });

  it('reads label, count and whether you reacted', () => {
    expect(reactionLabel({ label: 'RESPECT', count: 14, mine: true })).toBe(
      'Respect, 14, you reacted',
    );
    expect(reactionLabel({ label: 'HOLD THAT', count: 2 })).toBe('Hold that, 2');
    expect(reactionWord('LET’S GO')).toBe('Let’s go');
  });

  it('keeps counts whole and never negative', () => {
    expect(reactionCount(-1)).toBe(0);
    expect(reactionCount(3.7)).toBe(3);
    expect(reactionCount(Number.NaN)).toBe(0);
  });

  it('toggles one reaction optimistically, and back', () => {
    const start = [
      { label: 'LET’S GO', count: 9, mine: true },
      { label: 'RESPECT', count: 4 },
    ];
    const on = toggleReaction(start, 'RESPECT');
    expect(on).toEqual([
      { label: 'LET’S GO', count: 9, mine: true },
      { label: 'RESPECT', count: 5, mine: true },
    ]);
    expect(toggleReaction(on, 'RESPECT')[1]).toEqual({ label: 'RESPECT', count: 4, mine: false });
    expect(toggleReaction(start, 'LET’S GO')[0]).toEqual({
      label: 'LET’S GO',
      count: 8,
      mine: false,
    });
    expect(toggleReaction([{ label: 'RESPECT', count: 0, mine: true }], 'RESPECT')[0]?.count).toBe(
      0,
    );
    expect(toggleReaction(start, 'NOPE')).toEqual(start);
  });
});
