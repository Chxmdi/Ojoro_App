import { describe, expect, it } from 'vitest';

import { commentLabel, repliesWord, respectLabel, respectWord } from './Comment.logic';

describe('Comment logic', () => {
  it('writes RESPECT with its count', () => {
    expect(respectWord(14, true)).toBe('RESPECTED · 14');
    expect(respectWord(2, false)).toBe('RESPECT · 2');
    expect(respectWord(undefined, false)).toBe('RESPECT');
    expect(respectWord(0, true)).toBe('RESPECTED');
    expect(respectLabel(14, true)).toBe('Respected, 14');
    expect(respectLabel(undefined, undefined)).toBe('Respect');
  });

  it('counts replies', () => {
    expect(repliesWord(3)).toBe('3 REPLIES');
    expect(repliesWord(1)).toBe('1 REPLY');
    expect(repliesWord(0)).toBeNull();
    expect(repliesWord(undefined)).toBeNull();
  });

  it('reads author, badge, time and body', () => {
    expect(commentLabel('Marcus T', 'COMPETITOR', '8m', "Mornings don't win races.")).toBe(
      "Marcus T, competitor, 8m, Mornings don't win races.",
    );
    expect(commentLabel('Yara M', undefined, undefined, 'Hi')).toBe('Yara M, Hi');
  });
});
