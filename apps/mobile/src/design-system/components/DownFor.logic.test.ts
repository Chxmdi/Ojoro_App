import { describe, expect, it } from 'vitest';

import { downForAccessibilityLabel, downForModel } from './DownFor.logic';

describe('downForModel', () => {
  it('asks the question in caps and counts who is down', () => {
    const m = downForModel({ activity: 'Football', when: 'tonight', downCount: 11 });
    expect(m.question).toBe('FOOTBALL TONIGHT?');
    expect(m.countText).toBe('11 down');
    expect(m.count).toBe(11);
    expect(m.accessibilityLabel).toBe('Football tonight. 11 people down.');
  });

  it('never shows a negative or fractional count', () => {
    expect(downForModel({ activity: 'Run', when: 'now', downCount: -3 }).countText).toBe('0 down');
    expect(downForModel({ activity: 'Run', when: 'now', downCount: 2.7 }).countText).toBe('2 down');
    expect(downForModel({ activity: 'Run', when: 'now', downCount: Number.NaN }).count).toBe(0);
  });
});

describe('downForAccessibilityLabel', () => {
  it('says person for one, people otherwise', () => {
    expect(downForAccessibilityLabel('Tennis', 'Saturday', 1)).toBe(
      'Tennis Saturday. 1 person down.',
    );
    expect(downForAccessibilityLabel('Tennis', 'Saturday', 0)).toBe(
      'Tennis Saturday. 0 people down.',
    );
  });
});
