import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({ randomUUID: vi.fn(() => '6f8a1c2e-0000-4000-8000-000000000001') }));

import { newIdempotencyKey } from './idempotency';

describe('newIdempotencyKey', () => {
  it('returns a fresh UUID for each intention', () => {
    expect(newIdempotencyKey()).toBe('6f8a1c2e-0000-4000-8000-000000000001');
  });
});
