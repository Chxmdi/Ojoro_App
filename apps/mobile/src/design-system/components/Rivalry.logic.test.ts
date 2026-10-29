import { describe, expect, it } from 'vitest';

import {
  cleanRecord,
  formCells,
  formHeading,
  meetings,
  recordSentence,
  rivalryOverline,
} from './Rivalry.logic';

describe('Rivalry logic', () => {
  it('counts meetings, draws included', () => {
    expect(meetings({ a: 5, b: 3, draws: 1 })).toBe(9);
    expect(rivalryOverline({ a: 5, b: 3, draws: 1 })).toBe('RIVALRY · 9 MEETINGS');
    expect(rivalryOverline({ a: 1, b: 0 })).toBe('RIVALRY · 1 MEETING');
    expect(cleanRecord({ a: -1, b: Number.NaN, draws: 2.5 })).toEqual({ a: 0, b: 0, draws: 2 });
    expect(meetings(undefined)).toBe(0);
  });

  it('reads the record as a sentence', () => {
    expect(recordSentence('Chimdi', 'Marcus', { a: 5, b: 3, draws: 1 })).toBe(
      'Rivalry. Chimdi leads Marcus 5 to 3, with 1 draw, after 9 meetings.',
    );
    expect(recordSentence('Chimdi', 'Marcus', { a: 2, b: 4, draws: 2 })).toBe(
      'Rivalry. Marcus leads Chimdi 4 to 2, with 2 draws, after 8 meetings.',
    );
    expect(recordSentence('Chimdi', 'Marcus', { a: 1, b: 0 })).toBe(
      'Rivalry. Chimdi leads Marcus 1 to 0, after 1 meeting.',
    );
    expect(recordSentence('Chimdi', 'Marcus', { a: 4, b: 4 })).toBe(
      'Rivalry. Chimdi and Marcus are level at 4 each, after 8 meetings.',
    );
    expect(recordSentence('Chimdi', 'Marcus', { a: 0, b: 0 })).toBe(
      "Rivalry. Chimdi and Marcus haven't met yet.",
    );
  });

  it('marks form cells with the winner, = for a draw', () => {
    expect(formHeading(8)).toBe('FORM · LAST 8 (OLDEST FIRST)');
    expect(formCells(['b', 'a', 'd', 'x' as never], 'chimdi', 'Marcus')).toEqual([
      { result: 'b', mark: 'M', label: 'Marcus' },
      { result: 'a', mark: 'C', label: 'chimdi' },
      { result: 'd', mark: '=', label: 'Draw' },
    ]);
    expect(formCells(undefined, 'A', 'B')).toEqual([]);
  });
});
