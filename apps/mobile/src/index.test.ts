import { describe, expect, it } from 'vitest';
import { describeService } from './index.js';

describe('mobile', () => {
  it('exposes a healthy bootstrap descriptor', () => {
    expect(describeService()).toEqual({ name: 'mobile', status: 'ready' });
  });
});
