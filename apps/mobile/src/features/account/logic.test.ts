import { describe, expect, it } from 'vitest';

import { deleteFailure, maskedPhone } from './logic';

describe('deleteFailure', () => {
  it('is offline when nothing answered', () => {
    expect(deleteFailure(0, null).error.code).toBe('network');
  });

  it('keeps the code and the blockers', () => {
    const blockers = [{ kind: 'dispute_open', program_id: 'p', program_name: 'Alpha' }];
    const f = deleteFailure(409, {
      error: { code: 'P0001', message: 'account_delete_blocked', details: 'dispute_open' },
      blockers,
    });
    expect(f.error.code).toBe('account_delete_blocked');
    expect(f.blockers).toEqual(blockers);
  });

  it('staff get their own code', () => {
    expect(deleteFailure(403, { error: { code: 'P0001', message: 'account_delete_staff', details: '' } }).error.code).toBe(
      'account_delete_staff',
    );
  });

  it('anything else is a failure that deleted nothing', () => {
    expect(deleteFailure(502, 'gateway').error.code).toBe('account_delete_failed');
  });
});

describe('maskedPhone', () => {
  it('shows the country code and the last four', () => {
    expect(maskedPhone('15555550100')).toBe('+1 ••• ••• 0100');
    expect(maskedPhone('+1 555 555 0100')).toBe('+1 ••• ••• 0100');
    expect(maskedPhone('5555550100')).toBe('••• ••• 0100');
  });
  it('nothing to show', () => {
    expect(maskedPhone(null)).toBeNull();
    expect(maskedPhone('12')).toBeNull();
  });
});
