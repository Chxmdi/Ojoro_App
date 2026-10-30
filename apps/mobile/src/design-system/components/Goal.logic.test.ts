import { describe, expect, it } from 'vitest';

import { goalHeadline, goalLabel } from './Goal.logic';

describe('goalHeadline', () => {
  it('sets the goal in caps with one full stop', () => {
    expect(goalHeadline('Sub-22 5K by December')).toBe('SUB-22 5K BY DECEMBER.');
    expect(goalHeadline('  run   a 10k. ')).toBe('RUN A 10K.');
    expect(goalHeadline('Can I box?')).toBe('CAN I BOX?');
    expect(goalHeadline('Play every week!!')).toBe('PLAY EVERY WEEK.');
  });
  it('is null when there is no goal', () => {
    expect(goalHeadline('   ')).toBeNull();
    expect(goalHeadline(null)).toBeNull();
    expect(goalHeadline(undefined)).toBeNull();
  });
});

describe('goalLabel', () => {
  it('reads the goal, progress and next step', () => {
    expect(
      goalLabel({
        title: 'Sub-22 5K by December!',
        body: 'Best so far: 23:05.',
        nextStep: 'Tempo run · Thu 6:30.',
      }),
    ).toBe('Goal: Sub-22 5K by December. Best so far: 23:05. Next step: Tempo run · Thu 6:30.');
    expect(goalLabel({ title: 'Run' })).toBe('Goal: Run.');
    expect(goalLabel({ title: ' ' })).toBe('Goal: none set.');
  });
});
