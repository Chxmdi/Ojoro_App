import { describe, expect, it } from 'vitest';
import { describeService } from './index.js';

describe('contracts', () => {
  it('exposes a healthy bootstrap descriptor', () => {
    expect(describeService()).toEqual({ name: 'contracts', status: 'ready' });
  });
});
