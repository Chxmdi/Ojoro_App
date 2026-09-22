import { describe, expect, it } from 'vitest';
import { describeService } from './index.js';

describe('web', () => {
  it('exposes a healthy bootstrap descriptor', () => {
    expect(describeService()).toEqual({ name: 'web', status: 'ready' });
  });
});
