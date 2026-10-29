import { describe, expect, it } from 'vitest';

import { rematchModel } from './Rematch.logic';

describe('rematchModel', () => {
  it('reads the request', () => {
    expect(
      rematchModel({
        requester: 'Marcus',
        opponent: 'Chimdi',
        discipline: 'the 5K',
        lastResult: 'Chimdi by 43s',
        note: 'Same loop, two weeks. Best of three?',
      }),
    ).toEqual({
      overline: 'LAST TIME · CHIMDI BY 43S',
      accessibilityLabel:
        'Rematch. Marcus wants a rematch with Chimdi, the 5K. Last time: Chimdi by 43s. Same loop, two weeks. Best of three?',
      sentence: ' wants the 5K again. Same loop, two weeks. Best of three?',
    });
  });

  it('works without a note', () => {
    const m = rematchModel({
      requester: 'A',
      opponent: 'B',
      discipline: '1v1',
      lastResult: '3–3',
      note: '  ',
    });
    expect(m.sentence).toBe(' wants 1v1 again.');
    expect(m.accessibilityLabel).toBe('Rematch. A wants a rematch with B, 1v1. Last time: 3–3.');
  });
});
