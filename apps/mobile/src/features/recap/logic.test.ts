import { describe, expect, it } from 'vitest';

import {
  crewLine,
  hoursLabel,
  passportLine,
  pickerDays,
  pickerTimes,
  playedWithLine,
  posterOverline,
  recapHeadline,
  resultLine,
  runItBackOptions,
  shareText,
  stampTitle,
  startError,
  suggestedLine,
  timeLabel,
  type RecapRow,
} from './logic';

const TZ = 'America/Toronto';

function recap(over: Partial<RecapRow> = {}): RecapRow {
  return {
    occurred_at: '2026-10-06T23:30:00Z',
    duration_minutes: 90,
    played_count: 8,
    team_a_label: 'Lights',
    team_b_label: 'Darks',
    team_a_score: 5,
    team_b_score: 4,
    verification_level: 'participant_confirmed',
    confirmed_count: 6,
    finalized_at: null,
    ...over,
  };
}

describe('recap poster', () => {
  it('names the winner and the score', () => {
    expect(recapHeadline(recap())).toEqual(['LIGHTS WIN', '5–4.']);
    expect(recapHeadline(recap({ team_a_score: 2, team_b_score: 3 }))).toEqual(['DARKS WIN', '3–2.']);
    expect(recapHeadline(recap({ team_a_score: 3, team_b_score: 3 }))).toEqual(['DRAW', '3–3.']);
    expect(recapHeadline(recap({ team_a_score: null }))).toEqual(['GOOD', 'GAME.']);
    expect(recapHeadline(recap({ team_a_label: null }))).toEqual(['TEAM A WIN', '5–4.']);
    expect(recapHeadline(recap({ team_b_label: null, team_b_score: 6 }))).toEqual(['TEAM B WIN', '6–5.']);
  });

  it('says how the result was confirmed', () => {
    expect(resultLine(recap())).toBe('Confirmed by 6 of 8 players.');
    expect(resultLine(recap({ verification_level: 'self_recorded' }))).toMatch(/Not confirmed/);
    expect(resultLine(recap({ team_b_score: null }))).toBe('No score was logged.');
  });

  it('writes the overline and share text', () => {
    expect(posterOverline('Football', 'Jeanne-Mance Park')).toBe('FOOTBALL · JEANNE-MANCE');
    expect(posterOverline('Football', null)).toBe('FOOTBALL');
    expect(
      shareText({
        headline: ['LIGHTS WIN', '5–4.'],
        sportName: 'Football',
        placeName: 'Jeanne-Mance Park',
        occurredAt: '2026-10-06T23:30:00Z',
        played: 8,
        timeZone: TZ,
      }),
    ).toBe('LIGHTS WIN 5–4. Football at Jeanne-Mance Park, Tue 6 Oct. 8 played. On Ojoro.');
    expect(
      shareText({ headline: ['GOOD', 'GAME.'], sportName: 'Football', placeName: null, occurredAt: '2026-10-06T23:30:00Z', played: 2 }),
    ).toBe('GOOD GAME. Football, Tue 6 Oct. 2 played. On Ojoro.');
  });
});

describe('played with', () => {
  const people = [
    { user_id: 'me', display_name: 'Chimdi O', games_with_me: null, is_first_with_me: false },
    { user_id: 'lr', display_name: 'Lena R', games_with_me: 1, is_first_with_me: true },
    { user_id: 'jp', display_name: 'Joel P', games_with_me: 1, is_first_with_me: true },
    { user_id: 'mt', display_name: 'Marcus T', games_with_me: 12, is_first_with_me: false },
    { user_id: 'ab', display_name: 'Ade B', games_with_me: 9, is_first_with_me: false },
  ];
  it('names firsts and the longest run', () => {
    expect(playedWithLine(people, 'me')).toBe('First game with Lena and Joel. 12th with Marcus.');
    expect(playedWithLine(people.slice(3), 'me')).toBe('12th with Marcus.');
    expect(playedWithLine([people[0]!], 'me')).toBeNull();
    expect(
      playedWithLine([{ user_id: 'x', display_name: null, games_with_me: 3, is_first_with_me: null }], 'me'),
    ).toBe('3rd with someone.');
    expect(
      playedWithLine([{ user_id: 'x', display_name: null, games_with_me: null, is_first_with_me: true }], 'me'),
    ).toBe('First game with someone.');
  });
});

describe('passport', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  const entry = {
    occurred_at: '2026-10-06T23:30:00Z',
    ojoro_hours: 1.5,
    place_name: 'Jeanne-Mance Park',
    place_game_number: 21,
    first_at_place: '2026-03-12T23:00:00Z',
  };
  it('writes the stamp and the line', () => {
    expect(stampTitle(entry)).toBe('21 GAMES');
    expect(stampTitle({ place_game_number: 1 })).toBe('1 GAME');
    expect(passportLine(entry, now, TZ)).toBe('21 games at Jeanne-Mance since March.');
    expect(passportLine({ ...entry, first_at_place: null }, now, TZ)).toBe('21 games at Jeanne-Mance.');
    expect(passportLine({ ...entry, place_game_number: 1, place_name: null }, now, TZ)).toBe(
      'Your first game at this place.',
    );
  });

  it('writes hours', () => {
    expect(hoursLabel(1.5)).toBe('+1.5');
    expect(hoursLabel(2)).toBe('+2');
    expect(hoursLabel(1.04)).toBe('+1');
  });
});

describe('run it back', () => {
  it('offers next week at the same wall-clock time, across daylight saving', () => {
    // Last game Wed 21 Oct 7:30 PM; now Wed 28 Oct at 4 PM → Wed 28 Oct 7:30 PM is still ahead.
    const opts = runItBackOptions('2026-10-21T23:30:00Z', new Date('2026-10-28T20:00:00Z'), TZ);
    expect(opts.map((o) => o.label)).toEqual(['Wed 7:30', 'Thu 7:30', 'Fri 7:30']);
    expect(opts[0]?.startsAt).toBe('2026-10-28T23:30:00.000Z');
    // Now later that evening: it moves a week, past the change to EST.
    const later = runItBackOptions('2026-10-21T23:30:00Z', new Date('2026-10-28T23:00:00Z'), TZ);
    expect(later[0]?.startsAt).toBe('2026-11-05T00:30:00.000Z');
    expect(later[0]?.label).toBe('Wed 7:30');
  });

  it('writes the suggestion and validates the start', () => {
    expect(suggestedLine('2026-10-13T23:30:00Z', 'Jeanne-Mance Park', TZ)).toBe('Tue 13 Oct, 7:30 at Jeanne-Mance');
    expect(suggestedLine('2026-10-13T23:30:00Z', null, TZ)).toBe('Tue 13 Oct, 7:30');
    const now = new Date('2026-10-13T20:00:00Z');
    expect(startError('2026-10-13T20:30:00Z', now)).toMatch(/hour/);
    expect(startError('2026-10-13T23:30:00Z', now)).toBeNull();
  });

  it('builds the picker', () => {
    const days = pickerDays(new Date('2026-10-30T16:00:00Z'), TZ, 4);
    expect(days.map((d) => d.label)).toEqual(['Today', 'Tomorrow', 'Sun 1 Nov', 'Mon 2 Nov']);
    expect(days[2]).toMatchObject({ day: 1, month: 11, year: 2026 });
    expect(pickerDays(new Date('2026-10-30T16:00:00Z'))).toHaveLength(14);
    const times = pickerTimes();
    expect(times[0]).toEqual([6, 0]);
    expect(times.at(-1)).toEqual([22, 30]);
    expect(timeLabel([19, 30])).toBe('7:30 PM');
    expect(timeLabel([0, 0])).toBe('12:00 AM');
    expect(timeLabel([12, 0])).toBe('12:00 PM');
  });

  it('writes the crew line', () => {
    expect(crewLine(['Ade B', 'Marcus T', 'Lena R', 'Joel P'])).toBe('Ade, Marcus + 2');
    expect(crewLine(['Ade B', 'Marcus T'])).toBe('Ade and Marcus');
    expect(crewLine(['Ade B'])).toBe('Ade');
  });
});
