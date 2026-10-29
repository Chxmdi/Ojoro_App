import { describe, expect, it } from 'vitest';

import { CALL_OUT_STATUSES, callOutModel } from './CallOutPoster.logic';

const base = { challenger: { name: 'Marcus' }, opponent: { name: 'Chimdi' }, discipline: '5K' };

describe('callOutModel', () => {
  it('defaults to PENDING, outlined, and reads the call-out', () => {
    expect(callOutModel(base)).toEqual({
      status: 'PENDING',
      badgeTone: 'neutral',
      challenger: 'MARCUS',
      opponent: 'CHIMDI',
      accessibilityLabel: 'Call-out. Marcus versus Chimdi, 5K. Pending.',
    });
  });

  it('fills the badge only when accepted; every status is a word', () => {
    expect(CALL_OUT_STATUSES).toEqual(['PENDING', 'ACCEPTED', 'COUNTERED', 'DECLINED', 'WITHDRAWN', 'EXPIRED']);
    expect(callOutModel({ ...base, status: 'ACCEPTED' }).badgeTone).toBe('signal');
    expect(callOutModel({ ...base, status: 'COUNTERED' }).badgeTone).toBe('neutral');
    expect(
      callOutModel({ ...base, status: 'DECLINED', when: 'Sat 12 Oct · 9:00' }).accessibilityLabel,
    ).toBe('Call-out. Marcus versus Chimdi, 5K, Sat 12 Oct · 9:00. Declined.');
  });

  it('falls back to PENDING for an unknown status', () => {
    expect(callOutModel({ ...base, status: 'WON' as never }).status).toBe('PENDING');
  });
});
