import { describe, expect, it } from 'vitest';

import { userMeta, userMiniCardActions, userMiniCardLabel, userRows } from './UserMiniCard.logic';

const ade = {
  name: 'Ade B',
  handle: 'adeb',
  area: 'Mile End',
  verified: true,
  sports: ['Football', 'Running'],
  stats: [
    { value: '61', label: 'Sessions' },
    { value: '6', label: 'Games with you' },
    { value: '2', label: 'Crews' },
  ],
};

describe('UserMiniCard logic', () => {
  it('writes the handle line', () => {
    expect(userMeta(ade)).toBe('@adeb · Mile End');
    expect(userMeta({ handle: '@lena' })).toBe('@lena');
  });

  it('drops blank sports and stats', () => {
    expect(
      userRows({ sports: ['Football', ' ', ''], stats: [{ value: '', label: 'Crews' }] }),
    ).toEqual({ sports: ['Football'], stats: [] });
    expect(userRows({})).toEqual({ sports: [], stats: [] });
  });

  it('reads as one sentence', () => {
    expect(userMiniCardLabel(ade)).toBe(
      'Ade B, @adeb, Mile End, ID verified. Plays football and running. 61 sessions, 6 games with you, 2 crews.',
    );
    expect(userMiniCardLabel({ name: 'Lena R', handle: 'lenar' })).toBe('Lena R, @lenar.');
    expect(
      userMiniCardLabel({
        name: 'Kofi',
        handle: 'kofi',
        sports: ['Boxing', 'Football', 'Running'],
        stats: [{ value: '12', label: 'KM this week' }],
      }),
    ).toBe('Kofi, @kofi. Plays boxing, football and running. 12 KM this week.');
    expect(userMiniCardLabel({ name: 'Kofi', handle: 'kofi', sports: ['Boxing'] })).toBe(
      'Kofi, @kofi. Plays boxing.',
    );
  });

  it('keeps CALL OUT secondary and shows only buttons that do something', () => {
    expect(userMiniCardActions({ hasFollow: true, hasCallOut: true })).toEqual({
      follow: { label: 'FOLLOW', variant: 'primary', pressed: false },
      callOut: true,
    });
    expect(userMiniCardActions({ following: true, hasFollow: true, hasCallOut: false })).toEqual({
      follow: { label: 'FOLLOWING', variant: 'secondary', pressed: true },
      callOut: false,
    });
    expect(userMiniCardActions({ hasFollow: false, hasCallOut: false })).toEqual({
      follow: null,
      callOut: false,
    });
  });
});
