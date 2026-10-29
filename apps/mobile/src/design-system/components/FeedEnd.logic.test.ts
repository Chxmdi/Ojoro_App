import { describe, expect, it } from 'vitest';

import { FEED_END_SIZES, feedEndLayout } from './FeedEnd.logic';

describe('FeedEnd logic', () => {
  it('matches Main at md (the default)', () => {
    expect(feedEndLayout()).toEqual({ mark: 48, gap: 12, paddingTop: 16, message: 'body' });
    expect(feedEndLayout('md')).toEqual(feedEndLayout());
  });

  it('matches FirstHome at sm', () => {
    expect(feedEndLayout('sm')).toEqual({ mark: 40, gap: 8, paddingTop: 0, message: 'body-sm' });
  });

  it('lists both sizes', () => {
    expect(FEED_END_SIZES).toEqual(['md', 'sm']);
  });
});
