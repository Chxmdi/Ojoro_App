import { describe, expect, it } from 'vitest';

import {
  applyBacking,
  calledOffLine,
  fromShown,
  orient,
  shownSides,
  toShown,
  applyFollow,
  applyPollVote,
  applyPrediction,
  applyRespect,
  arrivalHeadline,
  checkInNote,
  commentBadge,
  countdownTarget,
  countWord,
  crewBackingLine,
  dateline,
  disciplineLabel,
  followingCount,
  hypeView,
  lockTime,
  nextBacking,
  nextStageChange,
  pollCloses,
  postAge,
  posterShareText,
  posterWhen,
  predictionCounts,
  predictionNote,
  readyLine,
  serverNow,
  sideName,
  systemTime,
  todayDateline,
  todayPredictionNote,
  trainingStats,
  validateComment,
  whenLine,
} from './logic';

const TZ = 'America/Toronto';
// Sat 12 Oct 2024, 9:00 in Montréal.
const START = '2024-10-12T13:00:00Z';

describe('optimistic patches', () => {
  it('follows and unfollows once', () => {
    const row = { i_follow: false, follower_count: 141 };
    const on = applyFollow(row, true);
    expect(on).toEqual({ i_follow: true, follower_count: 142 });
    expect(applyFollow(on, true)).toBe(on);
    expect(applyFollow({ i_follow: true, follower_count: 0 }, false).follower_count).toBe(0);
    expect(applyFollow({ i_follow: null, follower_count: null }, true).follower_count).toBe(1);
  });

  it('places a first pick and recomputes the split', () => {
    const row = {
      my_prediction: null,
      prediction_count: 9,
      prediction_a_pct: 44,
      prediction_b_pct: 56,
    };
    expect(predictionCounts(row)).toEqual({ a: 4, b: 5 });
    const next = applyPrediction(row, 'a');
    expect(next).toMatchObject({
      my_prediction: 'a',
      prediction_count: 10,
      prediction_a_pct: 50,
      prediction_b_pct: 50,
    });
    expect(applyPrediction(next, 'a')).toBe(next);
  });

  it('moves a changed pick without changing the total', () => {
    const row = {
      my_prediction: 'a' as const,
      prediction_count: 10,
      prediction_a_pct: 50,
      prediction_b_pct: 50,
    };
    expect(applyPrediction(row, 'b')).toMatchObject({
      prediction_count: 10,
      prediction_a_pct: 40,
      prediction_b_pct: 60,
    });
  });

  it('keeps the split hidden under the privacy threshold', () => {
    const row = {
      my_prediction: null,
      prediction_count: 2,
      prediction_a_pct: null,
      prediction_b_pct: null,
    };
    expect(applyPrediction(row, 'b')).toMatchObject({
      prediction_count: 3,
      prediction_a_pct: null,
      prediction_b_pct: null,
    });
    expect(predictionCounts({ ...row, my_prediction: 'a' })).toEqual({ a: 1, b: 1 });
    expect(predictionCounts({ ...row, my_prediction: 'b' })).toEqual({ a: 1, b: 1 });
    expect(predictionCounts({ ...row, prediction_count: null })).toEqual({ a: 0, b: 0 });
  });

  it('backs, switches and stops backing', () => {
    const row = { my_backing: null, backing_a: 77, backing_b: 64 };
    const a = applyBacking(row, 'a');
    expect(a).toEqual({ my_backing: 'a', backing_a: 78, backing_b: 64 });
    expect(applyBacking(a, 'b')).toEqual({ my_backing: 'b', backing_a: 77, backing_b: 65 });
    expect(applyBacking(a, null)).toEqual({ my_backing: null, backing_a: 77, backing_b: 64 });
    expect(applyBacking(a, 'a')).toBe(a);
    expect(applyBacking({ my_backing: 'a', backing_a: null, backing_b: null }, null)).toEqual({
      my_backing: null,
      backing_a: 0,
      backing_b: 0,
    });
  });

  it('taps the backed side to stop, the other to switch', () => {
    expect(nextBacking('a', 'a')).toBeNull();
    expect(nextBacking('a', 'b')).toBe('b');
    expect(nextBacking(null, 'a')).toBe('a');
  });

  it('votes and moves a poll vote', () => {
    const poll = { vote_counts: [0, 0], my_vote: null, total_votes: 0 };
    const v = applyPollVote(poll, 1);
    expect(v).toEqual({ vote_counts: [0, 1], my_vote: 1, total_votes: 1 });
    expect(applyPollVote(v, 0)).toEqual({ vote_counts: [1, 0], my_vote: 0, total_votes: 1 });
    expect(applyPollVote(v, 1)).toBe(v);
    expect(
      applyPollVote({ vote_counts: [], my_vote: null, total_votes: null }, 0).total_votes,
    ).toBe(1);
  });

  it('toggles respect', () => {
    expect(applyRespect({ respected: false, respect_count: 14 })).toEqual({
      respected: true,
      respect_count: 15,
    });
    expect(applyRespect({ respected: true, respect_count: 0 })).toEqual({
      respected: false,
      respect_count: 0,
    });
    expect(applyRespect({ respected: null, respect_count: null })).toEqual({
      respected: true,
      respect_count: 1,
    });
  });
});

describe('words', () => {
  it('names sides', () => {
    expect(sideName('Chimdi O', false)).toBe('Chimdi');
    expect(sideName('Lights FC', true)).toBe('Lights FC');
    expect(sideName(null, false)).toBe('Someone');
    expect(sideName(' ', true)).toBe('Crew');
  });

  it('writes the datelines', () => {
    expect(dateline(START, TZ, 'Mount Royal')).toBe('SAT 12 OCT · MOUNT ROYAL');
    expect(dateline(START, TZ, null)).toBe('SAT 12 OCT');
    expect(todayDateline(Date.parse('2024-10-12T12:34:00Z'), TZ)).toBe('SAT 12 OCT · 8:34 AM');
    expect(todayDateline(Date.parse('2024-10-12T20:00:00Z'), TZ)).toBe('SAT 12 OCT · 4:00 PM');
  });

  it('counts followers and things', () => {
    expect(followingCount(142)).toBe('142 following');
    expect(followingCount(0)).toBeNull();
    expect(followingCount(null)).toBeNull();
    expect(countWord(1, 'prediction')).toBe('1 prediction');
    expect(countWord(212, 'prediction')).toBe('212 predictions');
  });

  it('says how predictions work', () => {
    expect(lockTime(START, TZ)).toBe('9:00 Saturday');
    const base = { locked: false, count: 142, startsAt: START, timeZone: TZ, competitor: false };
    expect(predictionNote({ ...base, myPick: 'Chimdi' })).toBe(
      'You picked Chimdi. Change it any time before 9:00 Saturday. Social only: no money, no points, no odds.',
    );
    expect(predictionNote({ ...base, myPick: 'Marcus' })).toContain('You picked Marcus.');
    expect(predictionNote({ ...base, myPick: null })).toContain('Tap a side to pick.');
    expect(predictionNote({ ...base, myPick: null, competitor: true })).toContain(
      'You can only pick yourself.',
    );
    expect(predictionNote({ ...base, myPick: null, count: 2 })).toContain(
      'The split shows from 5 predictions.',
    );
    expect(predictionNote({ ...base, myPick: 'Chimdi', locked: true })).toBe(
      '142 predictions. Locked when the race went live.',
    );
    expect(todayPredictionNote(212, false)).toBe(
      '212 predictions. They lock the moment the race goes live.',
    );
    expect(todayPredictionNote(1, true)).toBe('1 prediction. Locked when the race went live.');
  });

  it('says what the crew backs', () => {
    const names = { aName: 'Chimdi', bName: 'Marcus' };
    expect(crewBackingLine({ ...names, crewA: 6, crewB: 2 })).toBe(
      '6 of your Crew back Chimdi. Backing never affects the result.',
    );
    expect(crewBackingLine({ ...names, crewA: 0, crewB: 1 })).toBe(
      '1 of your Crew backs Marcus. Backing never affects the result.',
    );
    expect(crewBackingLine({ ...names, crewA: 0, crewB: 0 })).toBe(
      'Backing never affects the result.',
    );
  });

  it('closes polls, labels comments, checks comments', () => {
    expect(pollCloses(START, TZ)).toBe('Sat 9:00');
    expect(pollCloses(null, TZ)).toBeUndefined();
    expect(commentBadge('competitor')).toBe('COMPETITOR');
    expect(commentBadge('organizer')).toBe('ORGANIZER');
    expect(commentBadge(null)).toBeUndefined();
    expect(validateComment('  hi ', 10)).toEqual({ ok: true, body: 'hi' });
    expect(validateComment('   ', 10)).toEqual({ ok: false, error: 'Write something first.' });
    expect(validateComment('abcdefghijk', 10)).toEqual({
      ok: false,
      error: 'Keep it under 10 characters. 11 now.',
    });
  });
});

describe('feed', () => {
  const now = Date.parse('2024-10-08T12:00:00Z');
  it('ages posts', () => {
    expect(postAge('2024-10-08T11:59:30Z', now)).toBe('now');
    expect(postAge('2024-10-08T11:48:00Z', now)).toBe('12m');
    expect(postAge('2024-10-08T09:00:00Z', now)).toBe('3h');
    expect(postAge('2024-10-07T09:00:00Z', now)).toBe('1d');
    expect(systemTime('2024-10-08T11:59:30Z', now, TZ)).toBe('NOW');
    expect(systemTime('2024-10-08T11:30:00Z', now, TZ)).toBe('30M AGO');
    expect(systemTime('2024-10-08T11:00:00Z', now, TZ)).toBe('1H AGO');
    expect(systemTime('2024-10-06T16:00:00Z', now, TZ)).toBe('SUN');
  });

  const post = {
    kind: 'statement' as const,
    author_id: 'u1',
    author_name: 'Chimdi O',
    author_role: 'competitor',
    author_side: 'a' as const,
    body: 'Rain or not, Saturday I run it.',
    stats: null,
    is_deleted: false,
  };
  const names = { a: 'Chimdi', b: 'Marcus' };

  it('draws each post kind', () => {
    expect(hypeView(post, names)).toMatchObject({
      hidden: false,
      kind: 'competitor',
      side: 'CHIMDI',
    });
    expect(hypeView({ ...post, is_deleted: true }, names)).toEqual({ hidden: true });
    expect(hypeView({ ...post, body: null }, names)).toEqual({ hidden: true });
    expect(
      hypeView({ ...post, kind: 'system', author_id: null, body: 'The challenge is set.' }, names),
    ).toMatchObject({
      kind: 'system',
      body: 'THE CHALLENGE IS SET.',
    });
    expect(
      hypeView(
        {
          ...post,
          kind: 'training',
          author_side: 'b',
          stats: { distance_km: 5.2, time_seconds: 1428 },
        },
        names,
      ),
    ).toMatchObject({
      kind: 'evidence',
      side: 'MARCUS',
      stats: [
        { value: '5.2 KM', label: 'distance' },
        { value: '23:48', label: 'time' },
      ],
    });
    expect(hypeView({ ...post, kind: 'training' }, names)).toMatchObject({ kind: 'competitor' });
    expect(hypeView({ ...post, author_role: 'organizer', author_side: null }, names)).toMatchObject(
      { kind: 'supporter', side: undefined },
    );
  });

  it('reads only well-formed training stats', () => {
    expect(trainingStats(null)).toEqual([]);
    expect(trainingStats([1])).toEqual([]);
    expect(trainingStats({ distance_km: -1, time_seconds: 'x' })).toEqual([]);
    expect(trainingStats({ time_seconds: 3723 })).toEqual([{ value: '1:02:03', label: 'time' }]);
  });
});

describe('stage and time', () => {
  it('carries the server clock forward', () => {
    expect(serverNow('2024-10-12T12:00:00Z', 1000, 61_000)).toBe(
      Date.parse('2024-10-12T12:01:00Z'),
    );
    expect(countdownTarget(START, '2024-10-12T12:00:00Z', Date.parse('2024-10-12T12:00:05Z'))).toBe(
      Date.parse(START) + 5000,
    );
  });

  it('finds the next time-based stage change', () => {
    const at = (iso: string) => ({
      stage: 'days',
      starts_at: START,
      accepted_at: '2024-10-01T00:00:00Z',
      server_now: iso,
    });
    // 2 days before: capped at an hour so the day boundary is caught.
    expect(nextStageChange(at('2024-10-10T13:00:00Z'), 0, 0)).toBe(3600_000);
    // 2 hours before → soon (30 min before) in 90 min, capped at an hour.
    expect(nextStageChange({ ...at('2024-10-12T11:00:00Z'), stage: 'today' }, 0, 0)).toBe(3600_000);
    // 40 min before → soon in 10 min.
    expect(nextStageChange({ ...at('2024-10-12T12:20:00Z'), stage: 'today' }, 0, 0)).toBe(
      600_000 + 1000,
    );
    // Accepted an hour ago: → days in 23 h, capped.
    expect(
      nextStageChange(
        { ...at('2024-10-10T13:00:00Z'), stage: 'accepted', accepted_at: '2024-10-10T12:30:00Z' },
        0,
        0,
      ),
    ).toBe(3600_000);
    expect(nextStageChange({ ...at('2024-10-12T13:00:00Z'), stage: 'live' }, 0, 0)).toBeNull();
    expect(
      nextStageChange({ ...at('2024-10-13T13:00:00Z'), stage: 'soon', accepted_at: null }, 0, 0),
    ).toBeNull();
  });

  it('writes the day lines', () => {
    expect(whenLine(START, TZ, 'Cartier monument')).toBe('9:00 · Cartier monument');
    expect(whenLine(START, TZ, '  ')).toBe('9:00');
    expect(
      checkInNote({ me: true, checkedIn: true, at: '2024-10-12T12:22:00Z', timeZone: TZ }),
    ).toBe('You · 8:22');
    expect(checkInNote({ me: false, checkedIn: true, timeZone: TZ })).toBe('');
    expect(checkInNote({ me: false, checkedIn: false, timeZone: TZ })).toBe('Not here yet');
    expect(arrivalHeadline({ name: 'Chimdi', in: true }, { name: 'Marcus', in: true })).toBe(
      'BOTH ARE HERE.',
    );
    expect(arrivalHeadline({ name: 'Chimdi', in: true }, { name: 'Marcus', in: false })).toBe(
      'CHIMDI IS HERE.',
    );
    expect(arrivalHeadline({ name: 'Chimdi', in: false }, { name: 'Marcus', in: true })).toBe(
      'MARCUS IS HERE.',
    );
    expect(
      arrivalHeadline({ name: 'Chimdi', in: false }, { name: 'Marcus', in: false }),
    ).toBeNull();
  });

  it('says how the race goes live', () => {
    const base = {
      competitor: true,
      meReady: false,
      otherReady: false,
      otherName: 'Marcus',
      checkedIn: true,
    };
    expect(readyLine(base)).toBe(
      'The race goes live when you both press start on your watch. Nothing to do here until then.',
    );
    expect(readyLine({ ...base, meReady: true })).toBe(
      "You're ready. The race goes live when Marcus is too.",
    );
    expect(readyLine({ ...base, meReady: true, otherReady: true })).toBe('Both ready. Going live.');
    expect(readyLine({ ...base, checkedIn: false })).toContain('Check in when you get there.');
    expect(readyLine({ ...base, competitor: false })).toContain('Predictions lock then.');
  });

  it('labels the discipline', () => {
    const v = { title: 'Mount Royal 5K', sport_name: 'Running', unit: null };
    expect(disciplineLabel({ ...v, target: 5, scoring: 'time' })).toBe('5K');
    expect(disciplineLabel({ ...v, target: 2.5, scoring: 'distance' })).toBe('2.5 KM');
    expect(disciplineLabel({ ...v, target: null, scoring: 'score' })).toBe('RUNNING');
    expect(
      disciplineLabel({
        title: null,
        sport_name: null,
        unit: null,
        target: null,
        scoring: 'rounds',
      }),
    ).toBe('CHALLENGE');
  });
});

describe('sides', () => {
  const row = {
    a_name: 'Marcus T',
    b_name: 'Chimdi O',
    a_user_id: 'm',
    b_user_id: 'c',
    a_checked_in: true,
    b_checked_in: false,
    a_ready: null,
    b_ready: true,
    prediction_a_pct: 52,
    prediction_b_pct: 48,
    backing_a: 64,
    backing_b: 78,
    crew_backing_a: null,
    crew_backing_b: 6,
    format: 'person_vs_person',
  };
  it('puts your side first', () => {
    const s = shownSides(row, 'b');
    expect(s.a).toMatchObject({
      side: 'b',
      name: 'Chimdi',
      userId: 'c',
      pct: 48,
      backing: 78,
      crewBacking: 6,
      ready: true,
      checkedIn: false,
    });
    expect(s.b).toMatchObject({
      side: 'a',
      name: 'Marcus',
      pct: 52,
      crewBacking: 0,
      ready: false,
      checkedIn: true,
    });
    expect(toShown('b', s.o)).toBe('a');
    expect(toShown('a', s.o)).toBe('b');
    expect(toShown(null, s.o)).toBeUndefined();
    expect(fromShown('a', s.o)).toBe('b');
    expect(fromShown('b', s.o)).toBe('a');
  });
  it('shows side a first to spectators and crews by name', () => {
    const s = shownSides(
      { ...row, format: 'crew_vs_crew', prediction_a_pct: null, backing_a: null },
      null,
    );
    expect(s.a).toMatchObject({ side: 'a', name: 'Marcus T', pct: 0, backing: 0 });
    expect(orient('a')).toEqual({ first: 'a', second: 'b' });
  });
  it('says why it was called off', () => {
    expect(calledOffLine('no_show')).toContain('Nobody started it');
    expect(calledOffLine('no_result')).toContain('no result');
    expect(calledOffLine(null)).toContain('called it off');
  });
});

describe('poster', () => {
  it('writes when and the share text', () => {
    expect(posterWhen(START, TZ)).toBe('Sat 12 Oct · 9:00');
    expect(
      posterShareText({
        a: 'Chimdi',
        b: 'Marcus',
        discipline: '5K',
        when: 'Sat 12 Oct · 9:00',
        link: 'ojoro://event/1',
      }),
    ).toBe(
      'Chimdi vs Marcus. 5K, Sat 12 Oct · 9:00. Who takes it? Follow, predict and back on Ojoro. ojoro://event/1',
    );
    expect(
      posterShareText({ a: 'A', b: 'B', discipline: '5K', when: 'x', link: null }),
    ).not.toContain('ojoro://');
  });
});
