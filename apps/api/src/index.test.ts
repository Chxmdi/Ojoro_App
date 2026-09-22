import { describe, expect, it } from 'vitest';
import { healthPayload } from './index.js';

describe('api health payload', () => {
  it('is healthy and identifies the API', () => {
    expect(healthPayload()).toMatchObject({ status: 'ok', service: 'api' });
  });
});
