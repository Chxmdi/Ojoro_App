import { describe, expect, it } from 'vitest';
import { describeService } from './index.js';

describe('analytics', () => {
  it('exposes a healthy bootstrap descriptor', () => {
    expect(describeService()).toEqual({ name: 'analytics', status: 'ready' });
  });
});
