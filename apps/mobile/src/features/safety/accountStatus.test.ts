import type { AccountStatus, MissedGame } from '@ojoro/contracts';
import { describe, expect, it } from 'vitest';

import {
  appealMessageProblem,
  appealableGames,
  isPausedCode,
  missedGameLabel,
  pausedView,
} from './accountStatus';

const base: AccountStatus = {
  paused: false,
  pause: null,
  appeal: null,
  can_appeal: false,
  hidden_content: [],
};

const game = (id: string, appeal: MissedGame['appeal_status']): MissedGame => ({
  activity_id: id,
  sport_id: 'beach_volleyball',
  starts_at: '2026-10-24T22:00:00Z',
  place_name: 'Parc Jarry',
  place_area: 'Villeray',
  appeal_status: appeal,
});

describe('paused view', () => {
  it('is null when not paused', () => {
    expect(pausedView(base)).toBeNull();
  });

  it('says why, until when, and where the appeal is', () => {
    const v = pausedView({
      ...base,
      paused: true,
      pause: {
        id: 'p',
        reason: 'spam',
        note_to_user: 'You sent the same link to many people.',
        starts_at: '2026-10-30T00:00:00Z',
        ends_at: '2026-11-12T00:00:00Z',
      },
      appeal: {
        id: 'a',
        kind: 'account_pause',
        status: 'open',
        subject_id: 'p',
        message: 'x',
        created_at: '2026-10-30T00:00:00Z',
        decided_at: null,
        decision_note: null,
        correction_effect: null,
      },
      can_appeal: false,
    });
    expect(v).toEqual({
      headline: 'THIS ACCOUNT IS PAUSED',
      until: 'Until 12 November.',
      reason: 'Paused for spam.',
      note: 'You sent the same link to many people.',
      appealLine: 'We are looking at your appeal.',
      canAppeal: false,
    });
  });

  it('knows the paused code', () => {
    expect(isPausedCode('account_paused')).toBe(true);
    expect(isPausedCode('not_authenticated')).toBe(false);
    expect(isPausedCode(null)).toBe(false);
  });
});

describe('show-up appeal', () => {
  it('labels a missed game', () => {
    expect(missedGameLabel(game('1', null))).toBe('Beach volleyball · Sat 24 Oct · Parc Jarry');
    expect(missedGameLabel(game('1', null), 'Football')).toBe('Football · Sat 24 Oct · Parc Jarry');
  });

  it('offers games without an open appeal', () => {
    expect(
      appealableGames([game('1', 'open'), game('2', null), game('3', 'denied')]).map(
        (g) => g.activity_id,
      ),
    ).toEqual(['2', '3']);
  });

  it('checks the message', () => {
    expect(appealMessageProblem('  ')).toBe('Say what happened.');
    expect(appealMessageProblem('x'.repeat(1001))).toBe('Keep it under 1000 characters.');
    expect(appealMessageProblem('The check-in failed.')).toBeNull();
  });
});
