import { describe, expect, it } from 'vitest';

import { crowdSide } from './CrowdSupport.logic';

describe('crowdSide', () => {
  it('not backing: secondary BACK button', () => {
    expect(crowdSide({ name: 'Marcus', count: 64 }, 'b', undefined)).toEqual({
      count: '64',
      caption: 'BACK MARCUS',
      button: 'BACK MARCUS',
      variant: 'secondary',
      backing: false,
      spoken: '64 people back Marcus',
      buttonLabel: 'Back Marcus',
    });
  });

  it('backing this side: primary, reads BACKING', () => {
    const m = crowdSide({ name: 'Chimdi', count: 78 }, 'a', 'a');
    expect(m.button).toBe('BACKING');
    expect(m.variant).toBe('primary');
    expect(m.backing).toBe(true);
    expect(m.buttonLabel).toBe('Backing Chimdi');
  });

  it('backing the other side leaves this one secondary', () => {
    expect(crowdSide({ name: 'Chimdi', count: 78 }, 'a', 'b').variant).toBe('secondary');
  });

  it('counts are whole, never negative, singular for one', () => {
    expect(crowdSide({ name: 'Chimdi', count: 1 }, 'a', undefined).spoken).toBe(
      '1 person backs Chimdi',
    );
    expect(crowdSide({ name: 'Chimdi', count: -4 }, 'a', undefined).count).toBe('0');
    expect(crowdSide({ name: 'Chimdi', count: Number.NaN }, 'a', undefined).count).toBe('0');
    expect(crowdSide({ name: 'Chimdi', count: 12.9 }, 'a', undefined).count).toBe('12');
  });
});
