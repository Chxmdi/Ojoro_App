import { describe, expect, it } from 'vitest';

import { VERIFICATION_LEVELS, VERIFY, verificationModel } from './VerificationBadge.logic';

describe('verificationModel', () => {
  it('uses the web words for every level', () => {
    expect(VERIFICATION_LEVELS.map((l) => verificationModel(l).word)).toEqual([
      'CHECKED IN',
      'RESULT VERIFIED',
      'ID VERIFIED',
      'TRUSTED HOST',
    ]);
    expect(VERIFY.identity).toBe('ID VERIFIED');
  });

  it('fills the O only for marks Ojoro confirms', () => {
    expect(verificationModel('checked-in').filled).toBe(false);
    expect(verificationModel('identity').filled).toBe(false);
    expect(verificationModel('result').filled).toBe(true);
    expect(verificationModel('host').filled).toBe(true);
  });

  it('reads in sentence case and defaults to checked in', () => {
    expect(verificationModel('identity').spoken).toBe('ID verified');
    expect(verificationModel(undefined)).toEqual({
      word: 'CHECKED IN',
      spoken: 'Checked in',
      filled: false,
    });
    expect(verificationModel('bogus' as never).word).toBe('CHECKED IN');
  });
});
