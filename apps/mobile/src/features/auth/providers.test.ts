import { describe, expect, it } from 'vitest';

import { parseAuthProviders, phoneButtonVariant } from './providers';

describe('parseAuthProviders', () => {
  it('is off unless the build says on', () => {
    expect(parseAuthProviders({})).toEqual({ apple: false, google: false });
    expect(parseAuthProviders({ apple: 'off', google: '' })).toEqual({ apple: false, google: false });
  });
  it('reads common truthy words', () => {
    expect(parseAuthProviders({ apple: ' ON ', google: 'true' })).toEqual({ apple: true, google: true });
    expect(parseAuthProviders({ apple: '1', google: 'yes' })).toEqual({ apple: true, google: true });
  });
});

describe('phoneButtonVariant', () => {
  it('leads with phone when it is the only way in', () => {
    expect(phoneButtonVariant({ apple: false, google: false })).toBe('primary');
    expect(phoneButtonVariant({ apple: true, google: false })).toBe('ghost');
    expect(phoneButtonVariant({ apple: false, google: true })).toBe('ghost');
  });
});
