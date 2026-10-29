import { describe, expect, it } from 'vitest';

import {
  discipline,
  formHistory,
  headerTitle,
  lastTimeLine,
  meetingBadge,
  meetingDate,
  meetingLine,
  meetingScore,
  meetingTitle,
  nextLine,
  rematchBlock,
  rematchPromise,
  shortMargin,
  sourceWords,
  type RivalryMeetingRow,
  type RivalryViewRow,
} from './logic';

const TZ = 'America/Toronto';

function view(over: Partial<RivalryViewRow> = {}): RivalryViewRow {
  return {
    rivalry_id: 'r1',
    kind: 'people',
    a_id: 'u-a',
    a_name: 'Chimdi',
    b_id: 'u-b',
    b_name: 'Marcus',
    i_am_in: true,
    meetings: 9,
    a_wins: 5,
    b_wins: 3,
    draws: 1,
    form: ['b', 'a', 'd', 'b', 'a', 'b', 'a', 'a'],
    streak_side: 'a',
    streak_length: 2,
    last_event_id: 'e-last',
    last_winner: 'a',
    last_margin: 43,
    last_scoring: 'time',
    last_unit: null,
    last_title: '5K',
    next_event_id: null,
    next_title: null,
    next_starts_at: null,
    next_time_zone: null,
    next_stage: null,
    rematch_call_out_id: null,
    rematch_from: null,
    rematch_from_name: null,
    rematch_message: null,
    rematch_title: null,
    rematch_starts_at: null,
    rematch_can_answer: false,
    ...over,
  };
}

function meeting(over: Partial<RivalryMeetingRow> = {}): RivalryMeetingRow {
  return {
    event_id: 'e1',
    starts_at: '2026-10-12T13:00:00Z',
    time_zone: TZ,
    title: '5K',
    sport_id: 'running',
    place_name: 'Mount Royal',
    scoring: 'time',
    unit: null,
    a_value: 1368,
    b_value: 1411,
    winner: 'a',
    margin: 43,
    source: 'participant_confirmation',
    verified_at: '2026-10-12T14:00:00Z',
    ...over,
  };
}

describe('header and form', () => {
  it('names both sides in capitals', () => {
    expect(headerTitle(view())).toBe('CHIMDI · MARCUS');
  });
  it('keeps known results only, in order', () => {
    expect(formHistory(['a', 'x', 'd', 'b'])).toEqual(['a', 'd', 'b']);
    expect(formHistory(null)).toEqual([]);
  });
});

describe('meetings', () => {
  it('dates as day.month in the place time zone', () => {
    expect(meetingDate('2026-10-12T13:00:00Z', TZ)).toBe('12.10');
    // 01:00 UTC on the 1st is still the 30th in Toronto.
    expect(meetingDate('2026-10-01T01:00:00Z', TZ)).toBe('30.09');
    expect(meetingDate('2026-10-12T13:00:00Z', null)).toBe('12.10');
  });
  it('adds the place unless the title has it', () => {
    expect(meetingTitle(meeting())).toBe('5K · Mount Royal');
    expect(meetingTitle(meeting({ title: '5K Mount Royal loop' }))).toBe('5K Mount Royal loop');
    expect(meetingTitle(meeting({ place_name: null }))).toBe('5K');
  });
  it('says how the result was verified', () => {
    expect(sourceWords('participant_confirmation')).toBe('participant confirmed');
    expect(sourceWords('organizer_review')).toBe('organizer reviewed');
    expect(sourceWords(null)).toBeNull();
  });
  it('reads times as a vs b and scores as a–b', () => {
    expect(meetingScore(meeting())).toBe('22:48 vs 23:31');
    expect(meetingScore(meeting({ scoring: 'score', a_value: 3, b_value: 3 }))).toBe('3–3');
    expect(meetingScore(meeting({ scoring: 'distance', a_value: 5.2, b_value: 4.9 }))).toBe('5.2 km vs 4.9 km');
    expect(meetingScore(meeting({ a_value: null }))).toBeNull();
  });
  it('builds the line, falling back to the margin', () => {
    expect(meetingLine(meeting(), 'Chimdi', 'Marcus')).toBe('22:48 vs 23:31 · participant confirmed');
    expect(meetingLine(meeting({ a_value: null, winner: 'b', margin: 62 }), 'Chimdi', 'Marcus')).toBe(
      'Marcus by 1:02 · participant confirmed',
    );
    expect(meetingLine(meeting({ a_value: null, winner: 'd', margin: 0, source: null }), 'C', 'M')).toBe('');
  });
  it('badges the winner the same way the form cells do', () => {
    expect(meetingBadge('a', 'Chimdi', 'Marcus')).toEqual({ text: 'CHIMDI', tone: 'signal' });
    expect(meetingBadge('b', 'Chimdi', 'Marcus')).toEqual({ text: 'MARCUS', tone: 'neutral' });
    expect(meetingBadge('d', 'Chimdi', 'Marcus')).toEqual({ text: 'DRAW', tone: 'neutral' });
  });
});

describe('last time', () => {
  it('shortens margins', () => {
    expect(shortMargin(43, 'time')).toBe('43S');
    expect(shortMargin(62, 'time')).toBe('1:02');
    expect(shortMargin(0.34, 'distance')).toBe('0.3 KM');
    expect(shortMargin(-2, 'score')).toBe('2');
    expect(shortMargin(2, 'rounds', 'rounds')).toBe('2 ROUNDS');
  });
  it('names the winner and the margin', () => {
    expect(lastTimeLine(view())).toBe('CHIMDI BY 43S');
    expect(lastTimeLine(view({ last_winner: 'b', last_margin: 2, last_scoring: 'score' }))).toBe('MARCUS BY 2');
    expect(lastTimeLine(view({ last_winner: 'b', last_margin: 0 }))).toBe('MARCUS');
    expect(lastTimeLine(view({ last_winner: 'd' }))).toBe('DRAW');
    expect(lastTimeLine(view({ last_winner: null }))).toBeNull();
  });
  it('reads the discipline into the sentence', () => {
    expect(discipline('5K')).toBe('the 5K');
    expect(discipline(' ')).toBe('it');
    expect(discipline(null)).toBe('it');
  });
});

describe('next meeting', () => {
  it('is null without one', () => {
    expect(nextLine(view())).toBeNull();
  });
  it('dates a scheduled one', () => {
    expect(
      nextLine(view({ next_event_id: 'n', next_title: '5K', next_starts_at: '2026-10-24T13:00:00Z', next_time_zone: TZ, next_stage: 'days' })),
    ).toBe('5K · Sat 24 Oct');
    expect(nextLine(view({ next_event_id: 'n', next_title: '5K' }))).toBe('5K');
  });
  it('says live and verifying in words', () => {
    expect(nextLine(view({ next_event_id: 'n', next_title: '5K', next_stage: 'live' }))).toBe('5K · live now');
    expect(nextLine(view({ next_event_id: 'n', next_title: '5K', next_stage: 'disputed' }))).toBe('5K · verifying');
  });
});

describe('rematch block', () => {
  it('lets you answer their request', () => {
    const b = rematchBlock(
      view({
        rematch_call_out_id: 'co1',
        rematch_from: 'b',
        rematch_from_name: 'Marcus',
        rematch_title: '5K',
        rematch_message: ' Same loop, two weeks. Best of three? ',
        rematch_can_answer: true,
      }),
    );
    expect(b).toEqual({
      kind: 'answer',
      callOutId: 'co1',
      requester: 'Marcus',
      opponent: 'Chimdi',
      discipline: 'the 5K',
      note: 'Same loop, two weeks. Best of three?',
    });
  });
  it('falls back to the side name and the last title', () => {
    const b = rematchBlock(view({ rematch_call_out_id: 'co1', rematch_from: 'a', rematch_can_answer: true, rematch_message: '' }));
    expect(b).toMatchObject({ kind: 'answer', requester: 'Chimdi', opponent: 'Marcus', discipline: 'the 5K', note: null });
  });
  it('waits on your own request', () => {
    expect(rematchBlock(view({ rematch_call_out_id: 'co1', rematch_from: 'a' }))).toEqual({
      kind: 'waiting',
      callOutId: 'co1',
      opponent: 'Marcus',
    });
  });
  it('shows a pending request to someone who cannot answer', () => {
    expect(rematchBlock(view({ i_am_in: false, rematch_call_out_id: 'co1', rematch_from: 'b', rematch_from_name: 'Marcus' }))).toEqual({
      kind: 'pending',
      callOutId: 'co1',
      requester: 'Marcus',
    });
  });
  it('points at the next meeting when one is on', () => {
    expect(rematchBlock(view({ next_event_id: 'n' }))).toEqual({ kind: 'scheduled', eventId: 'n' });
  });
  it('offers RUN IT BACK to a competitor after a final result', () => {
    expect(rematchBlock(view())).toEqual({ kind: 'offer', eventId: 'e-last', opponent: 'Marcus', discipline: 'the 5K' });
  });
  it('offers nothing to spectators or before a first meeting', () => {
    expect(rematchBlock(view({ i_am_in: false }))).toEqual({ kind: 'none' });
    expect(rematchBlock(view({ last_event_id: null }))).toEqual({ kind: 'none' });
  });
});

describe('rematch promise', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  it('names the day within a week', () => {
    expect(rematchPromise(true, { starts_at: '2026-10-10T13:00:00Z', time_zone: TZ }, now)).toBe(
      "Accepting creates a new Call-Out linked to this rivalry. Saturday's result stays exactly as it is.",
    );
  });
  it('names the date after that', () => {
    expect(rematchPromise(false, { starts_at: '2026-09-14T13:00:00Z', time_zone: null }, now)).toBe(
      'Asking sends a new Call-Out linked to this rivalry. The result from 14 Sep stays exactly as it is.',
    );
  });
  it('speaks generally without a meeting', () => {
    expect(rematchPromise(true, null, now)).toBe(
      'Accepting creates a new Call-Out linked to this rivalry. Past results stay exactly as they are.',
    );
  });
});
