import { describe, expect, it } from 'vitest';

import { crewMomentumModel } from './CrewMomentum.logic';

const base = {
  crew: 'Thursday FC',
  memberCount: 14,
  weeks: [1, 2, 3, 4, 5, 6, 7, 8],
  canJoin: true,
};

describe('crewMomentumModel', () => {
  it('labels the crew and its rhythm with real counts', () => {
    const m = crewMomentumModel(base);
    expect(m.overline).toBe('CREW · 14');
    expect(m.rhythmLabel).toBe('RHYTHM · 8 WEEKS');
    expect(m.accessibilityLabel).toBe('Thursday FC crew, 14 members');
    expect(crewMomentumModel({ ...base, memberCount: 1, weeks: [1] })).toMatchObject({
      rhythmLabel: 'RHYTHM · 1 WEEK',
      accessibilityLabel: 'Thursday FC crew, 1 member',
    });
  });

  it('drops the week count with no history', () => {
    expect(crewMomentumModel({ ...base, weeks: [] }).rhythmLabel).toBe('RHYTHM');
  });

  it('shows the join only with a next thing on', () => {
    expect(crewMomentumModel(base).join).toBe('none');
    expect(crewMomentumModel({ ...base, next: 'Football · Thu 7:30' }).join).toBe('open');
    expect(crewMomentumModel({ ...base, next: 'Football', joined: true }).join).toBe('joined');
    expect(crewMomentumModel({ ...base, next: 'Football', canJoin: false }).join).toBe('view');
  });
});
