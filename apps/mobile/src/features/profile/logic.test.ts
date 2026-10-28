import { describe, expect, it } from 'vitest';

import {
  formatHours,
  freeTimes,
  gamesWithMe,
  joinWords,
  overlapLine,
  ownAvailabilityLine,
  passportHeadline,
  reputationLabel,
  sportMeta,
  stampDate,
  stampFor,
  visibilityLine,
} from './logic';

describe('visibilityLine', () => {
  it('says the defaults', () => {
    expect(visibilityLine({ sports: 'everyone', history: 'friends', availability: 'crews' })).toBe(
      "Everyone sees your sports. Friends also see your Passport. Your Crews also see when you're free.",
    );
  });
  it('groups parts with the same audience', () => {
    expect(visibilityLine({ sports: 'friends', history: 'friends', availability: 'only_me' })).toBe(
      "Friends see your sports and your Passport. Only you see when you're free.",
    );
  });
  it('says when everything is private', () => {
    expect(visibilityLine({ sports: 'only_me', history: 'only_me', availability: 'only_me' })).toBe(
      'Only you see your sports, Passport and free times.',
    );
  });
});

describe('joinWords', () => {
  it('joins like a sentence', () => {
    expect(joinWords([])).toBe('');
    expect(joinWords(['a'])).toBe('a');
    expect(joinWords(['a', 'b'])).toBe('a and b');
    expect(joinWords(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('free times', () => {
  const rows = [
    { day_of_week: 4, part: 'evening' as const },
    { day_of_week: 2, part: 'evening' as const },
    { day_of_week: 6, part: 'morning' as const },
    { day_of_week: 2, part: 'evening' as const },
  ];
  it('groups days by part, in week order', () => {
    expect(freeTimes(rows)).toBe('Tue and Thu evenings, Sat mornings');
    expect(freeTimes([])).toBeNull();
  });
  it('says every for all seven days', () => {
    const all = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ day_of_week: d, part: 'midday' as const }));
    expect(freeTimes(all)).toBe('every midday');
  });
  it('writes your own line with who sees it', () => {
    expect(ownAvailabilityLine(rows, 'crews')).toBe(
      'Usually free Tue and Thu evenings, Sat mornings. Shared with your Crews as overlap only.',
    );
    expect(ownAvailabilityLine(rows, 'friends')).toContain('Shared with Friends');
    expect(ownAvailabilityLine(rows, 'only_me')).toContain('Only you see it.');
    expect(ownAvailabilityLine([], 'crews')).toBe("You haven't said when you're usually free.");
  });
  it('writes overlap for someone else', () => {
    expect(overlapLine([{ day_of_week: 2, part: 'evening' }])).toBe(
      "You're both usually free Tue evenings.",
    );
    expect(overlapLine([])).toBeNull();
  });
});

describe('sportMeta', () => {
  it('shows the level to the owner only', () => {
    expect(sportMeta({ position: 'Midfield', level: 'intermediate' }, true)).toBe('Midfield · intermediate');
    expect(sportMeta({ position: 'Midfield', level: 'intermediate' }, false)).toBe('Midfield');
    expect(sportMeta({ position: null, level: null }, false)).toBeNull();
  });
});

describe('labels and numbers', () => {
  it('labels reputation', () => {
    expect(reputationLabel('shows_up', 31)).toBe('SHOWS UP · 31');
    expect(reputationLabel('welcomes_beginners', 12)).toBe('WELCOMES BEGINNERS · 12');
  });
  it('formats hours', () => {
    expect(formatHours(64)).toBe('64');
    expect(formatHours(1.5)).toBe('1.5');
    expect(formatHours(null)).toBe('0');
  });
  it('says games together', () => {
    expect(gamesWithMe(null)).toBeNull();
    expect(gamesWithMe(0)).toBe("You haven't played together yet");
    expect(gamesWithMe(1)).toBe('1 game with you');
    expect(gamesWithMe(12)).toBe('12 games with you');
  });
  it('writes the passport headline with singulars', () => {
    expect(passportHeadline(14, 6, 23)).toEqual(['14 STAMPS.', '6 PLACES.', '23 PEOPLE.']);
    expect(passportHeadline(1, 1, 1)).toEqual(['1 STAMP.', '1 PLACE.', '1 PERSON.']);
  });
});

describe('stamps', () => {
  it('dates in the place time zone', () => {
    expect(stampDate('2026-10-02T02:00:00Z', 'America/Toronto')).toBe('01.10.26');
  });
  it('titles by games at the place', () => {
    expect(
      stampFor(
        {
          occurred_at: '2026-10-01T23:00:00Z',
          place_game_number: 20,
          sport_game_number: 30,
          place_name: 'Jeanne-Mance Park',
          sport_name: 'Football',
        },
        'America/Toronto',
      ),
    ).toEqual({ title: '20 GAMES', place: 'Jeanne-Mance Park', date: '01.10.26', kind: 'FOOTBALL' });
  });
  it('marks a first game, and works without a place', () => {
    const stamp = stampFor({
      occurred_at: '2026-10-01T16:00:00Z',
      place_game_number: null,
      sport_game_number: 1,
      place_name: null,
      sport_name: null,
    });
    expect(stamp.title).toBe('FIRST GAME');
    expect(stamp.place).toBe('Somewhere new');
    expect(stamp.kind).toBeUndefined();
  });
});
