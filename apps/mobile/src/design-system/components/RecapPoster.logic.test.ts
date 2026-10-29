import { describe, expect, it } from 'vitest';

import { recapModel } from './RecapPoster.logic';

describe('recapModel', () => {
  it('heads with a fact and reads the whole keepsake', () => {
    expect(
      recapModel({
        winner: 'Chimdi',
        discipline: '5K',
        date: 'Sat 12 Oct',
        stats: [
          { value: '22:48', label: 'Chimdi' },
          { value: '212', label: 'Watched' },
        ],
        story: 'Out hard, held it. 43 seconds.',
      }),
    ).toEqual({
      overline: 'RECAP · SAT 12 OCT',
      headline: 'CHIMDI WINS.',
      accessibilityLabel:
        'Recap, Sat 12 Oct. Result verified. Chimdi wins. 5K. 22:48 Chimdi, 212 Watched. Out hard, held it. 43 seconds.',
    });
  });

  it('works with the minimum', () => {
    const m = recapModel({ winner: 'Lights', discipline: 'Football', result: '5–4' });
    expect(m.overline).toBe('RECAP');
    expect(m.accessibilityLabel).toBe('Recap. Result verified. Lights wins. Football. 5–4.');
  });
});
