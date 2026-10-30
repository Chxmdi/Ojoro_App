import { describe, expect, it } from 'vitest';

import { StaffCallError, errorOf, errorWords } from './errors';

describe('errorWords', () => {
  it('maps known and unknown failures', () => {
    expect(
      errorWords(
        new StaffCallError({ kind: 'permission', code: 'permission_denied', detail: null }),
      ),
    ).toMatch(/can't do that/);
    expect(errorWords({ name: 'TypeError', message: 'Failed to fetch' })).toMatch(/offline/);
    expect(errorWords(null)).toMatch(/Something went wrong/);
    expect(
      errorWords(
        new StaffCallError({ kind: 'ojoro', code: 'invalid_argument', detail: 'p_ends_at' }),
      ),
    ).toBe('Check ends at and try again.');
    expect(
      errorWords(new StaffCallError({ kind: 'ojoro', code: 'invalid_argument', detail: null })),
    ).toMatch(/isn't right/);
  });
  it('unwraps staff call errors', () => {
    const e = new StaffCallError({ kind: 'network', code: 'network', detail: null });
    expect(errorOf(e)).toBe(e.ojoro);
    expect(e.message).toBe('network');
  });
});
