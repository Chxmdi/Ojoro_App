import { describe, expect, it } from 'vitest';

import { LIVE_WORD, liveLabel, liveWord } from './LiveIndicator.logic';

describe('LiveIndicator logic', () => {
  it('shows LIVE by default and the label in caps', () => {
    expect(liveWord(undefined)).toBe(LIVE_WORD);
    expect(liveWord('  ')).toBe('LIVE');
    expect(liveWord('Sparring')).toBe('SPARRING');
  });

  it('reads the word in sentence case', () => {
    expect(liveLabel(undefined)).toBe('Live');
    expect(liveLabel('SPARRING')).toBe('Sparring');
    expect(liveLabel('LIVE NOW')).toBe('Live now');
  });
});
