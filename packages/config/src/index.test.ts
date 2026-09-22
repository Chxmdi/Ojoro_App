import { describe, expect, it } from 'vitest';
import { describeService } from './index.js';

describe('config', () => {
  it('exposes a healthy bootstrap descriptor', () => {
    expect(describeService()).toEqual({ name: 'config', status: 'ready' });
  });
});
