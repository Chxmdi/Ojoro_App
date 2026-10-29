import { describe, expect, it } from 'vitest';

import {
  clampCapacity,
  closesText,
  crewCaption,
  crewRowMeta,
  dayWord,
  defaultDraft,
  freeLine,
  hourLabel,
  inviteText,
  isCrewAdmin,
  leaveBody,
  makeGameArgs,
  makeGameNote,
  missingParts,
  normalizeCode,
  pollQuestion,
  roleLabel,
  suggestionSignature,
  suggestionBody,
  suggestionTitle,
  timeChoiceLabel,
  toggleTime,
  validateCrewName,
  validateDraft,
  type SuggestionFacts,
} from './logic';

const TZ = 'America/Toronto';
const NOW = new Date('2026-10-29T18:30:00Z'); // Thu 2:30 PM in Montréal
const SAT_9 = '2026-10-31T13:00:00Z';
const SAT_10 = '2026-10-31T14:00:00Z';
const SAT_1030 = '2026-10-31T14:30:00Z';

const facts: SuggestionFacts = {
  id: 's',
  status: 'open',
  sport_id: 'football',
  sport_name: 'Football',
  day_label: 'Saturday morning',
  proposed_times: [SAT_9, SAT_10, SAT_1030],
  place_ids: ['p1', 'p2'],
  place_names: ['Jeanne-Mance Park', 'Indoor dome'],
  interested_count: 4,
  member_count: 14,
  free_count: 9,
  plan_id: null,
  accepted_by_name: null,
};

describe('suggestion copy', () => {
  it('asks the plan as a question', () => {
    expect(suggestionTitle(facts)).toBe('FOOTBALL, SATURDAY MORNING?');
    expect(suggestionTitle({ ...facts, sport_name: null, sport_id: 'ultimate_frisbee' })).toBe(
      'ULTIMATE FRISBEE, SATURDAY MORNING?',
    );
  });

  it('names only what is missing', () => {
    expect(missingParts(facts)).toBe('time and place');
    expect(missingParts({ ...facts, proposed_times: [SAT_9] })).toBe('place');
    expect(missingParts({ ...facts, place_ids: ['p1'] })).toBe('time');
    expect(missingParts({ proposed_times: [SAT_9], place_ids: ['p1'] })).toBe('the details');
    expect(suggestionBody(facts)).toBe(
      "4 of you want in. Ojoro can set up the plan with this crew already invited and ask only what's missing: time and place.",
    );
  });

  it('writes the free line from counts and the hour range', () => {
    expect(hourLabel(SAT_9, TZ)).toBe('9');
    expect(hourLabel(SAT_1030, TZ)).toBe('10:30');
    expect(freeLine(facts, TZ)).toBe('9 of 14 are free Saturday between 9 and 10:30.');
    expect(freeLine({ ...facts, free_count: 1, proposed_times: [SAT_9] }, TZ)).toBe('1 of 14 is free Saturday at 9.');
    expect(freeLine({ ...facts, proposed_times: [] }, TZ)).toBe('9 of 14 are free Saturday.');
    expect(freeLine({ ...facts, free_count: 0 }, TZ)).toBeNull();
  });

  it('reads the day word', () => {
    expect(dayWord('Saturday morning')).toBe('Saturday');
    expect(dayWord('tomorrow evening')).toBe('tomorrow');
    expect(dayWord('this weekend')).toBe('this weekend');
    expect(pollQuestion('Saturday morning')).toBe('WHAT TIME SATURDAY?');
    expect(pollQuestion('tonight')).toBe('WHAT TIME TONIGHT?');
    expect(pollQuestion(null)).toBe('WHAT TIME?');
  });

  it('says when the poll closes', () => {
    expect(closesText('2026-10-30T01:00:00Z', NOW, TZ)).toBe('tonight 9 PM');
    expect(closesText('2026-10-29T20:00:00Z', NOW, TZ)).toBe('today 4 PM');
    expect(closesText('2026-10-30T13:00:00Z', NOW, TZ)).toBe('tomorrow 9 AM');
    expect(closesText(SAT_9, NOW, TZ)).toBe('Sat 9 AM');
  });
});

describe('crew words', () => {
  it('captions the header', () => {
    expect(crewCaption({ member_count: 14, free_tonight: 4 })).toBe('14 members · 4 free tonight');
    expect(crewCaption({ member_count: 1, free_tonight: 0 })).toBe('1 member');
    expect(crewCaption({ member_count: 3, free_tonight: null })).toBe('3 members');
  });

  it('labels roles', () => {
    expect(roleLabel('owner')).toBe('Owner');
    expect(roleLabel('admin')).toBe('Admin');
    expect(roleLabel('member')).toBeNull();
    expect(isCrewAdmin('admin')).toBe(true);
    expect(isCrewAdmin(null)).toBe(false);
    expect(crewRowMeta({ member_count: 14, role: 'admin' })).toBe('14 members · Admin');
    expect(crewRowMeta({ member_count: 1, role: 'member' })).toBe('1 member');
  });

  it('explains leaving in counts', () => {
    expect(leaveBody({ name: 'Thursday FC', member_count: 14, my_role: 'owner' })).toContain('Hand it to someone else');
    expect(leaveBody({ name: 'Thursday FC', member_count: 1, my_role: 'owner' })).toContain('closes Thursday FC');
    expect(leaveBody({ name: 'Thursday FC', member_count: 14, my_role: 'member' })).toContain('13 stay');
  });

  it('shares the code in words', () => {
    expect(inviteText('Thursday FC', 'THURSDAY')).toBe(
      'Join Thursday FC on Ojoro: open Crews, tap JOIN WITH A CODE and enter THURSDAY.',
    );
  });
});

describe('validation', () => {
  it('normalizes invite codes', () => {
    expect(normalizeCode(' thur-sday ')).toEqual({ ok: true, code: 'THURSDAY' });
    expect(normalizeCode('')).toMatchObject({ ok: false });
    expect(normalizeCode('ABCD1234')).toEqual({ ok: false, error: 'Codes use letters and the numbers 2 to 9.' });
    expect(normalizeCode('ABC')).toEqual({ ok: false, error: 'Codes are 8 characters.' });
  });

  it('checks crew names', () => {
    expect(validateCrewName('  Thursday FC ')).toEqual({ ok: true, name: 'Thursday FC' });
    expect(validateCrewName(' ')).toMatchObject({ ok: false });
    expect(validateCrewName('x'.repeat(41))).toMatchObject({ ok: false });
  });
});

describe('Make This a Game draft', () => {
  it('defaults to the times still ahead, place later, the sport capacity', () => {
    const d = defaultDraft({ proposed_times: ['2026-10-29T10:00:00Z', SAT_9, SAT_10] }, 10, NOW);
    expect(d).toEqual({ times: [SAT_9, SAT_10], placeId: null, capacity: 10 });
    expect(clampCapacity(1)).toBe(2);
    expect(clampCapacity(99)).toBe(30);
    expect(clampCapacity(Number.NaN)).toBe(10);
  });

  it('toggles times in order, at most four', () => {
    expect(toggleTime([SAT_10], SAT_9)).toEqual([SAT_9, SAT_10]);
    expect(toggleTime([SAT_9, SAT_10], SAT_9)).toEqual([SAT_10]);
    expect(toggleTime(['a1', 'a2', 'a3', 'a4'].map((_, i) => `2026-11-0${i + 1}T12:00:00Z`), SAT_9)).toHaveLength(4);
  });

  it('validates', () => {
    expect(validateDraft({ times: [], placeId: null, capacity: 10 }, NOW)).toMatchObject({ ok: false });
    expect(validateDraft({ times: [SAT_9, SAT_10, SAT_1030, SAT_9, SAT_9], placeId: null, capacity: 10 }, NOW)).toMatchObject({
      ok: false,
    });
    expect(validateDraft({ times: ['2026-10-29T10:00:00Z'], placeId: null, capacity: 10 }, NOW)).toMatchObject({ ok: false });
    expect(validateDraft({ times: [SAT_9], placeId: null, capacity: 1 }, NOW)).toMatchObject({ ok: false });
    expect(validateDraft({ times: [SAT_9], placeId: 'p', capacity: 10 }, NOW)).toEqual({ ok: true });
  });

  it('builds the arguments and the note', () => {
    expect(makeGameArgs('s', { times: [SAT_9], placeId: null, capacity: 10 }, 'k')).toEqual({
      p_suggestion_id: 's',
      p_time_options: [SAT_9],
      p_capacity: 10,
      p_idempotency_key: 'k',
    });
    expect(makeGameArgs('s', { times: [SAT_9], placeId: 'p', capacity: 10 }, 'k').p_place_id).toBe('p');
    expect(makeGameNote({ times: [SAT_9, SAT_10], placeId: null, capacity: 10 })).toContain('2-time poll');
    expect(makeGameNote({ times: [SAT_9], placeId: 'p', capacity: 10 })).toBe(
      "Starts a crew plan. You're in; the crew taps I'M DOWN themselves.",
    );
  });

  it('labels time choices', () => {
    expect(timeChoiceLabel(SAT_9, NOW, TZ)).toBe('Sat 9:00');
    expect(timeChoiceLabel('2026-10-30T22:30:00Z', NOW, TZ)).toBe('Tomorrow 6:30');
    expect(timeChoiceLabel('2026-10-29T23:00:00Z', NOW, TZ)).toBe('Tonight 7:00');
    expect(timeChoiceLabel('2026-10-29T19:00:00Z', NOW, TZ)).toBe('Today 3:00');
  });
});

describe('suggestionSignature', () => {
  it('ignores the expiry and timestamps detection rewrites, and sees real changes', () => {
    const row = { id: 's', status: 'open', plan_id: null, proposed_times: [SAT_9], interested_ids: ['a', 'b'], expires_at: 'x' };
    const sig = suggestionSignature(row);
    expect(suggestionSignature({ ...row, expires_at: 'y', updated_at: 'z' })).toBe(sig);
    expect(suggestionSignature({ ...row, status: 'accepted', plan_id: 'p' })).not.toBe(sig);
    expect(suggestionSignature({ ...row, interested_ids: ['a', 'b', 'c'] })).not.toBe(sig);
  });
});
