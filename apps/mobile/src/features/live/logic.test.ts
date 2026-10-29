import { describe, expect, it } from 'vitest';

import {
  applyReaction,
  followingLine,
  fullTimeLine,
  isLive,
  liveAnchors,
  liveOverline,
  loggedByLabel,
  reactionRows,
  readCounts,
  scoreSides,
  shareText,
  shortAge,
  shortPlace,
  updateView,
  validateUpdate,
  validScore,
  wordForLabel,
  type UpdateRow,
} from './logic';

describe('liveAnchors', () => {
  it('counts from the server clock, not the device clock', () => {
    const state = {
      server_now: '2026-10-29T18:00:00Z',
      live_at: '2026-10-29T17:25:48Z', // 34:12 before server_now
      last_update_at: '2026-10-29T17:59:40Z', // 20 s before
    };
    // The device clock is 10 minutes fast: anchors move with it, so elapsed time stays 34:12.
    const received = Date.parse('2026-10-29T18:10:00Z');
    const a = liveAnchors(state, received);
    expect(received - (a.startedAt ?? 0)).toBe((34 * 60 + 12) * 1000);
    expect(received - (a.updatedAt ?? 0)).toBe(20_000);
  });

  it('is null before kick-off and before anything is logged', () => {
    expect(liveAnchors({ server_now: '2026-10-29T18:00:00Z', live_at: null, last_update_at: null }, 0)).toEqual({
      startedAt: null,
      updatedAt: null,
    });
  });
});

describe('header words', () => {
  const row = {
    sport_id: 'football',
    place_name: 'Jeanne-Mance Park',
    playing_count: 8,
    crew_following: 'Thursday FC',
    follower_count: 6,
    score_logged_by_name: 'Ade B',
    score_logged_by_host: true,
    team_a_label: 'Lights',
    team_b_label: 'Darks',
    team_a_score: 3,
    team_b_score: 2,
    effective_status: 'live',
  };
  it('writes the overline as an area', () => {
    expect(liveOverline(row)).toBe('FOOTBALL · JEANNE-MANCE · 8 PLAYING');
    expect(liveOverline({ ...row, place_name: null, playing_count: 0, sport_id: 'beach_volleyball' })).toBe('BEACH VOLLEYBALL');
    expect(shortPlace('Indoor dome')).toBe('INDOOR DOME');
    expect(shortPlace(null)).toBeNull();
  });

  it('names who logged it and who follows', () => {
    expect(loggedByLabel(row)).toBe('Ade (host)');
    expect(loggedByLabel({ score_logged_by_name: 'Marcus T', score_logged_by_host: false })).toBe('Marcus');
    expect(loggedByLabel({ score_logged_by_name: null, score_logged_by_host: null })).toBeUndefined();
    expect(followingLine(row)).toBe('THURSDAY FC IS FOLLOWING');
    expect(followingLine({ crew_following: null, follower_count: 6 })).toBe('6 FOLLOWING');
    expect(followingLine({ crew_following: null, follower_count: 0 })).toBeNull();
  });

  it('says who calls full time', () => {
    expect(fullTimeLine(false, 'Ade B')).toBe('Ade calls full time. Then the After window opens for 24 hours.');
    expect(fullTimeLine(true, 'Ade B')).toBe('You call full time. Then the After window opens for 24 hours.');
    expect(fullTimeLine(false, null)).toContain('The host calls');
    expect(isLive('live')).toBe(true);
    expect(isLive('after')).toBe(false);
  });

  it('reads the score and shares it without names', () => {
    expect(scoreSides(row)).toEqual({ a: { name: 'LIGHTS', score: 3 }, b: { name: 'DARKS', score: 2 } });
    expect(scoreSides({ team_a_label: null, team_b_label: null, team_a_score: null, team_b_score: null }).a).toEqual({
      name: 'TEAM A',
      score: 0,
    });
    expect(shareText(row)).toBe('Lights 3–2 Darks. Football at Jeanne-Mance Park, live on Ojoro.');
    expect(shareText({ ...row, place_name: null, effective_status: 'after' })).toBe('Lights 3–2 Darks. Football, on Ojoro.');
  });
});

describe('updates', () => {
  const base: UpdateRow = {
    id: 'u',
    kind: 'post',
    author_id: 'yara',
    author_name: 'Yara M',
    author_is_host: false,
    body: 'Darks need one more.',
    reaction_counts: {},
    my_reaction: null,
    is_deleted: false,
    created_at: '2026-10-29T18:00:00Z',
  };
  it('draws Ojoro and host posts as cards, players as comments', () => {
    expect(updateView(base)).toBe('comment');
    expect(updateView({ ...base, author_is_host: true })).toBe('card');
    expect(updateView({ ...base, kind: 'score' })).toBe('card');
    expect(updateView({ ...base, author_id: null })).toBe('card');
    expect(updateView({ ...base, is_deleted: true })).toBe('hidden');
    expect(updateView({ ...base, body: null })).toBe('hidden');
  });

  it('ages comments', () => {
    const t = Date.parse('2026-10-29T18:00:00Z');
    expect(shortAge('2026-10-29T18:00:00Z', t + 30_000)).toBe('now');
    expect(shortAge('2026-10-29T18:00:00Z', t + 60_000)).toBe('1m');
    expect(shortAge('2026-10-29T18:00:00Z', t + 2 * 3_600_000)).toBe('2h');
  });

  it('validates updates and scores', () => {
    expect(validateUpdate(' Goal ', 280)).toEqual({ ok: true, body: 'Goal' });
    expect(validateUpdate('', 280)).toMatchObject({ ok: false });
    expect(validateUpdate('x'.repeat(281), 280)).toEqual({ ok: false, error: 'Updates are 1 to 280 characters.' });
    expect(validScore(0)).toBe(true);
    expect(validScore(99)).toBe(true);
    expect(validScore(100)).toBe(false);
    expect(validScore(1.5)).toBe(false);
  });
});

describe('reactions', () => {
  it('reads counts, ignoring junk', () => {
    expect(readCounts({ lets_go: 9, respect: 4, hold_that: 0, nope: 3, run_it_back: 'x' })).toEqual({ lets_go: 9, respect: 4 });
    expect(readCounts(null)).toEqual({});
  });

  it('toggles, replaces and takes back, one per person', () => {
    const start = { counts: { lets_go: 9, respect: 4 }, mine: null };
    const one = applyReaction(start, 'lets_go');
    expect(one).toEqual({ counts: { lets_go: 10, respect: 4 }, mine: 'lets_go' });
    const swapped = applyReaction(one, 'respect');
    expect(swapped).toEqual({ counts: { lets_go: 9, respect: 5 }, mine: 'respect' });
    const back = applyReaction(swapped, 'respect');
    expect(back).toEqual({ counts: { lets_go: 9, respect: 4 }, mine: null });
    expect(applyReaction({ counts: {}, mine: 'hold_that' }, 'hold_that')).toEqual({ counts: {}, mine: null });
  });

  it('lists every word in order with labels', () => {
    const rows = reactionRows({ counts: { respect: 2 }, mine: 'respect' });
    expect(rows.map((r) => r.label)).toEqual(['LET’S GO', 'RESPECT', 'HOLD THAT', 'RUN IT BACK']);
    expect(rows[1]).toMatchObject({ count: 2, mine: true });
    expect(wordForLabel('HOLD THAT')).toBe('hold_that');
    expect(wordForLabel('NOPE')).toBeNull();
  });
});
