import { describe, expect, it } from 'vitest';

import { deleteOutcome, maskE164 } from './deleteAccount';

describe('deleteOutcome', () => {
  it('deleted, or already deleted', () => {
    expect(deleteOutcome(200, { status: 'deleted' })).toEqual({ kind: 'deleted' });
    expect(deleteOutcome(200, { status: 'already_deleted' })).toEqual({ kind: 'deleted' });
  });

  it('blocked with what to do first', () => {
    const out = deleteOutcome(409, {
      error: { code: 'P0001', message: 'account_delete_blocked', details: 'payout_pending' },
      blockers: [{ kind: 'payout_pending', program_id: 'p', program_name: 'Alpha Pickup' }],
    });
    expect(out).toEqual({
      kind: 'blocked',
      sentences: [
        "Alpha Pickup has money that hasn't been paid out to you yet. Wait for the payout to arrive, then delete.",
      ],
    });
  });

  it('staff are told to ask an admin', () => {
    const out = deleteOutcome(403, {
      error: { code: 'P0001', message: 'account_delete_staff', details: '' },
    });
    expect(out.kind).toBe('blocked');
    expect(out.kind === 'blocked' && out.sentences[0]).toMatch(/staff role/);
  });

  it('errors in words', () => {
    expect(deleteOutcome(0, null)).toMatchObject({
      kind: 'error',
      words: expect.stringMatching(/offline/),
    });
    expect(
      deleteOutcome(401, { error: { code: 'P0001', message: 'not_authenticated', details: '' } }),
    ).toEqual({
      kind: 'error',
      words: 'You are signed out. Sign in again.',
    });
    expect(deleteOutcome(502, 'bad gateway')).toMatchObject({
      kind: 'error',
      words: expect.stringMatching(/Try again/),
    });
    expect(deleteOutcome(200, { status: 'odd' }).kind).toBe('error');
  });
});

describe('maskE164', () => {
  it('keeps the country code and last four', () => {
    expect(maskE164('+15555550100')).toBe('+1 ••• ••• 0100');
    expect(maskE164('+12')).toBe('+12');
  });
});
