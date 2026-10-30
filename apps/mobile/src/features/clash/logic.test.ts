import { describe, expect, it } from 'vitest';

import {
  canBack,
  clashOverline,
  clashShareText,
  eventRow,
  myPartCopy,
  posterSides,
  resultLine,
  scoreBlock,
  speakName,
  type ClashFacts,
  type EventFacts,
  type MyPartFacts,
} from './logic';

const TZ = 'America/Toronto';
// Wednesday 28 Oct 2026, 2 PM in Montréal.
const NOW = new Date('2026-10-28T18:00:00Z');

const clash: ClashFacts = {
  title: 'Fall Clash',
  season_label: 'Fall 2026',
  a_name: 'Concordia Run Club',
  a_short_name: 'CONCORDIA',
  b_name: 'McGill Running Society',
  b_short_name: 'MCGILL',
  stage: 'live',
  my_side: 'a',
  event_count: 6,
  decided_count: 3,
  a_wins: 2,
  b_wins: 1,
  draws: 0,
  leader: 'a',
  first_starts_at: '2026-10-10T13:00:00Z',
  time_zone: TZ,
};

describe('poster', () => {
  it('writes the overline and the names, yours first', () => {
    expect(clashOverline(clash)).toBe('OJORO CLASH · FALL 2026');
    expect(clashOverline({ ...clash, season_label: null })).toBe('OJORO CLASH · FALL CLASH');
    expect(posterSides(clash).map((s) => s.poster)).toEqual(['CONCORDIA', 'MCGILL']);
    expect(posterSides({ ...clash, my_side: 'b' }).map((s) => s.spoken)).toEqual(['McGill', 'Concordia']);
  });

  it('speaks short names in their own casing', () => {
    expect(speakName('MCGILL', 'McGill Running Society')).toBe('McGill');
    expect(speakName('Plateau', 'The Plateau Crew')).toBe('Plateau');
    expect(speakName('UQAM', 'Université du Québec')).toBe('Uqam');
  });

  it('scores from your side with words beside it', () => {
    expect(scoreBlock(clash, NOW)).toEqual({
      score: '2-1',
      label: 'AFTER 3 OF 6',
      line: 'Concordia leads',
      spoken: 'Concordia 2, McGill 1, after 3 of 6',
    });
    expect(scoreBlock({ ...clash, my_side: 'b' }, NOW).score).toBe('1-2');
    expect(scoreBlock({ ...clash, leader: null }, NOW).line).toBe('Level');
    expect(scoreBlock({ ...clash, leader: 'b' }, NOW).line).toBe('McGill leads');
    expect(scoreBlock({ ...clash, stage: 'proposed' }, NOW)).toMatchObject({ label: 'PROPOSED', line: '6 events, waiting on an answer' });
    expect(scoreBlock({ ...clash, stage: 'upcoming', first_starts_at: '2026-10-28T23:00:00Z' }, NOW).line).toBe('Starts today at 7 PM');
    expect(scoreBlock({ ...clash, stage: 'upcoming', first_starts_at: '2026-10-29T23:00:00Z' }, NOW).line).toBe('Starts tomorrow at 7 PM');
    expect(scoreBlock({ ...clash, stage: 'upcoming', first_starts_at: '2026-11-07T15:00:00Z' }, NOW).line).toBe('Starts Sat 7 Nov');
    expect(scoreBlock({ ...clash, stage: 'upcoming', first_starts_at: null }, NOW).line).toBe('Starting soon');
    expect(scoreBlock({ ...clash, stage: 'complete' }, NOW)).toMatchObject({ label: 'FINAL', line: 'Concordia won the Clash' });
    expect(scoreBlock({ ...clash, stage: 'complete', leader: null }, NOW).line).toBe('Level at the end');
    expect(scoreBlock({ ...clash, stage: 'declined' }, NOW).label).toBe('DECLINED');
    expect(scoreBlock({ ...clash, stage: 'cancelled' }, NOW).label).toBe('CALLED OFF');
  });

  it('shares the score in words', () => {
    expect(clashShareText(clash, NOW)).toBe('Ojoro Clash: Concordia vs McGill, 2-1 (after 3 of 6).');
  });
});

describe('your part', () => {
  const part: MyPartFacts = {
    position: 4,
    title: '7-a-side football',
    sport_id: 'football',
    starts_at: '2026-10-31T13:00:00Z',
    place_name: 'Jeanne-Mance',
    place_area: null,
    squad_size: 14,
    squad_taken: 9,
    i_am_in: true,
  };
  it("reads You're in the football squad for Saturday.", () => {
    expect(myPartCopy(part, NOW, TZ)).toEqual({
      overline: 'YOUR PART · EVENT 4',
      title: "You're in the football squad for Saturday.",
      meta: '7-a-side football · Jeanne-Mance · 9 AM · 9 of 14 squad spots taken',
    });
  });
  it('offers room when you are not in', () => {
    expect(myPartCopy({ ...part, i_am_in: false, squad_size: null, starts_at: '2026-10-29T13:00:00Z' }, NOW, TZ)).toMatchObject({
      title: "Your clan's football squad has room for tomorrow.",
      meta: '7-a-side football · Jeanne-Mance · 9 AM · 9 in the squad',
    });
    expect(myPartCopy({ ...part, starts_at: '2026-10-28T23:00:00Z' }, NOW, TZ).title).toContain('for tonight.');
    expect(myPartCopy({ ...part, starts_at: '2026-10-28T19:00:00Z' }, NOW, TZ).title).toContain('for today.');
    expect(myPartCopy({ ...part, starts_at: '2026-11-15T14:00:00Z' }, NOW, TZ).title).toContain('for Sun 15 Nov.');
  });
});

describe('the events', () => {
  const base: EventFacts = {
    clash_event_id: 'e',
    position: 2,
    title: '3v3 basketball',
    scoring: 'score',
    starts_at: '2026-10-17T15:00:00Z',
    place_name: null,
    place_area: null,
    state: 'decided',
    is_final: false,
    a_value: 17,
    b_value: 21,
    winner_side: 'b',
    result_source: 'captains_confirmed',
  };
  it('names the winner, with their value first', () => {
    expect(eventRow(base, clash, NOW, TZ)).toEqual({ meta: '21–17', badge: 'MCGILL', signal: false });
    expect(eventRow({ ...base, a_value: 38, b_value: 34, winner_side: 'a' }, clash, NOW, TZ)).toEqual({
      meta: '38–34',
      badge: 'CONCORDIA',
      signal: true,
    });
    expect(eventRow({ ...base, result_source: 'organizer_verified', winner_side: 'a' }, clash, NOW, TZ).meta).toBe('Organizer verified');
    expect(eventRow({ ...base, winner_side: null, b_value: 17 }, clash, NOW, TZ)).toEqual({ meta: '17–17', badge: 'DRAW', signal: false });
    expect(eventRow(base, { ...clash, my_side: null }, NOW, TZ).signal).toBe(false);
  });
  it('words what is coming', () => {
    expect(eventRow({ ...base, state: 'this_week', starts_at: '2026-10-31T13:00:00Z' }, clash, NOW, TZ)).toEqual({
      meta: 'Sat 9:00 · squads forming',
      badge: 'SAT',
      signal: false,
    });
    expect(eventRow({ ...base, state: 'this_week', starts_at: '2026-10-28T23:00:00Z' }, clash, NOW, TZ).badge).toBe('TODAY');
    expect(eventRow({ ...base, state: 'this_week', starts_at: '2026-10-29T23:00:00Z' }, clash, NOW, TZ).meta).toBe('Tomorrow 7:00 · squads forming');
    expect(eventRow({ ...base, state: 'this_week', is_final: true }, clash, NOW, TZ).badge).toBe('FINAL');
    expect(eventRow({ ...base, state: 'upcoming', starts_at: '2026-11-02T15:00:00Z' }, clash, NOW, TZ)).toEqual({
      meta: 'Mon 2 Nov',
      badge: 'UPCOMING',
      signal: false,
    });
    expect(
      eventRow({ ...base, state: 'upcoming', is_final: true, place_name: 'Mount Royal', starts_at: '2026-11-16T15:00:00Z' }, clash, NOW, TZ),
    ).toEqual({ meta: 'Mon 16 Nov · Mount Royal', badge: 'FINAL', signal: false });
    expect(eventRow({ ...base, state: 'live', place_area: 'Plateau' }, clash, NOW, TZ)).toEqual({ meta: 'Plateau · on now', badge: 'LIVE', signal: true });
    expect(eventRow({ ...base, state: 'verifying' }, clash, NOW, TZ).badge).toBe('NOT FINAL');
  });
  it('formats time results', () => {
    expect(resultLine({ a_value: 600, b_value: 615, scoring: 'time', result_source: 'captains_confirmed' }, 'a')).toBe('10:00–10:15');
    expect(resultLine({ a_value: null, b_value: 615, scoring: 'time', result_source: 'captains_confirmed' }, 'a')).toBe('Verified');
  });
});

describe('backing', () => {
  it('opens while upcoming or live, your own clan only', () => {
    expect(canBack(clash, 'a')).toBe(true);
    expect(canBack(clash, 'b')).toBe(false);
    expect(canBack({ ...clash, my_side: null }, 'b')).toBe(true);
    expect(canBack({ ...clash, stage: 'complete' }, 'a')).toBe(false);
    expect(canBack({ ...clash, stage: 'upcoming' }, 'a')).toBe(true);
  });
});
