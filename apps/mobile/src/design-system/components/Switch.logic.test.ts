import { describe, expect, it } from 'vitest';

import { SWITCH, knobOffset, needsMarkRing, switchWord } from './Switch.logic';

describe('switchWord', () => {
  it('says the state in a word', () => {
    expect(switchWord(true)).toBe('ON');
    expect(switchWord(false)).toBe('OFF');
  });
});

describe('knobOffset', () => {
  it('sits 3px in from the left when off', () => {
    expect(knobOffset(false)).toBe(3);
  });
  it('sits 3px in from the right when on', () => {
    expect(knobOffset(true)).toBe(SWITCH.width - 2 * SWITCH.border - SWITCH.knob - 3);
    expect(knobOffset(true)).toBe(43);
  });
  it('centres the knob vertically with the same inset', () => {
    expect((SWITCH.height - 2 * SWITCH.border - SWITCH.knob) / 2).toBe(SWITCH.knobInset);
  });
});

describe('needsMarkRing', () => {
  it('rings a pill that merges with its ground', () => {
    expect(needsMarkRing(1.09)).toBe(true);
    expect(needsMarkRing(21)).toBe(false);
  });
});
