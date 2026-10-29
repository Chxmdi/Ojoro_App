import { describe, expect, it } from 'vitest';

import {
  HYPE_POST_KINDS,
  hypePostLabel,
  postAvatarSize,
  postBadge,
  showsStats,
  systemOverline,
} from './HypePost.logic';

describe('HypePost logic', () => {
  it('names the kind in words', () => {
    expect(HYPE_POST_KINDS).toHaveLength(4);
    expect(postBadge('competitor', 'CHIMDI')).toBe('COMPETITOR · CHIMDI');
    expect(postBadge('evidence', undefined)).toBe('TRAINING');
    expect(postBadge('supporter', 'MARCUS')).toBe('SUPPORTER · MARCUS');
  });

  it('writes the system overline with or without a time', () => {
    expect(systemOverline('8:01')).toBe('UPDATE · 8:01');
    expect(systemOverline(undefined)).toBe('UPDATE');
  });

  it('sizes the avatar by kind and shows stats on evidence only', () => {
    expect(postAvatarSize('competitor')).toBe('md');
    expect(postAvatarSize('supporter')).toBe('sm');
    const stats = [{ value: '5.2 KM', label: 'distance' }];
    expect(showsStats('evidence', stats)).toBe(true);
    expect(showsStats('evidence', [])).toBe(false);
    expect(showsStats('competitor', stats)).toBe(false);
  });

  it('reads the post as one item', () => {
    expect(hypePostLabel({ kind: 'system', time: '8:01', body: 'HALF TIME. 2–2.' })).toBe(
      'Ojoro update, 8:01. HALF TIME. 2–2.',
    );
    expect(hypePostLabel({ kind: 'system', body: 'THE CHALLENGE IS SET.' })).toBe(
      'Ojoro update. THE CHALLENGE IS SET.',
    );
    expect(
      hypePostLabel({
        kind: 'evidence',
        author: 'Marcus T',
        side: 'MARCUS',
        time: '3h',
        body: 'Last tempo run before Saturday.',
        stats: [
          { value: '5.2 KM', label: 'distance' },
          { value: '23:48', label: 'time' },
        ],
      }),
    ).toBe(
      'Marcus T, training, Marcus, 3h. Last tempo run before Saturday. 5.2 KM distance, 23:48 time.',
    );
    expect(hypePostLabel({ kind: 'supporter', author: 'Ade B', body: 'Go on.' })).toBe(
      'Ade B, supporter. Go on.',
    );
  });
});
