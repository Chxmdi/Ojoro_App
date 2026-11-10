import { describe, expect, it } from 'vitest';

import {
  accountBlockerSentence,
  accountDeletionGoes,
  accountDeletionStays,
  accountErrorCodes,
  blockersOf,
  isDeleteConfirmed,
} from './account';
import { isOjoroErrorCode } from './slice01';

describe('account deletion contract', () => {
  it('registers its codes', () => {
    for (const c of accountErrorCodes) expect(isOjoroErrorCode(c)).toBe(true);
  });

  it('confirms only DELETE', () => {
    expect(isDeleteConfirmed('DELETE')).toBe(true);
    expect(isDeleteConfirmed(' delete ')).toBe(true);
    expect(isDeleteConfirmed('DELET')).toBe(false);
    expect(isDeleteConfirmed('')).toBe(false);
  });

  it('says what to do for each blocker, naming the program', () => {
    const p = { program_id: 'p', program_name: 'Alpha Pickup' };
    expect(accountBlockerSentence({ kind: 'staff', program_id: null, program_name: null })).toMatch(/staff role/);
    expect(accountBlockerSentence({ kind: 'dispute_open', ...p })).toBe(
      "Alpha Pickup has an open payment dispute. Wait until it's closed, then delete.",
    );
    expect(accountBlockerSentence({ kind: 'refund_pending', ...p })).toMatch(/^Alpha Pickup has a refund/);
    expect(accountBlockerSentence({ kind: 'payout_pending', program_id: 'p', program_name: null })).toMatch(
      /^A program you run has money/,
    );
  });

  it('keeps the voice: no exclamation marks', () => {
    for (const line of [...accountDeletionGoes, ...accountDeletionStays]) expect(line).not.toMatch(/!/);
  });

  it('reads blockers off a 409 body and drops anything unknown', () => {
    expect(blockersOf(null)).toEqual([]);
    expect(blockersOf({ blockers: 'x' })).toEqual([]);
    expect(
      blockersOf({
        blockers: [
          { kind: 'payout_pending', program_id: 'p', program_name: 'Alpha' },
          { kind: 'other' },
          null,
          { kind: 'staff' },
        ],
      }),
    ).toEqual([
      { kind: 'payout_pending', program_id: 'p', program_name: 'Alpha' },
      { kind: 'staff', program_id: null, program_name: null },
    ]);
  });
});
