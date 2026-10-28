import { describe, expect, it } from 'vitest';

import { runItBackModel } from './RunItBack.logic';

describe('runItBackModel', () => {
  const m = runItBackModel({
    activity: 'Football',
    crew: 'Thursday FC + 2',
    lastDate: 'Tue 6 Oct',
    count: 8,
    suggested: 'Tue 13 Oct, 7:30 at Jeanne-Mance',
  });

  it('matches the web copy, overline in caps', () => {
    expect(m.overline).toBe('LAST TUE 6 OCT · 8 PLAYED');
    expect(m.question).toEqual(['RUN IT', 'BACK?']);
  });

  it('speaks the whole prompt as one sentence', () => {
    expect(m.accessibilityLabel).toBe(
      'Run it back. Football with Thursday FC + 2, Tue 13 Oct, 7:30 at Jeanne-Mance.',
    );
  });

  it('says that a new plan opens and nobody is in yet', () => {
    expect(m.runHint).toMatch(/new plan/);
    expect(m.runHint).toMatch(/Nobody is in until they tap I'M DOWN/);
  });
});
