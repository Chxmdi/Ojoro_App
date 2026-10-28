import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PRIVACY,
  initialDraft,
  nameError,
  PRIVACY_PARTS,
  rowsToSlots,
  setLevel,
  setPrivacy,
  slotsToRows,
  sportsError,
  togglePullMeIn,
  toggleSport,
  toSaveArgs,
} from './draft';

const names: Record<string, string> = { football: 'Football', running: 'Running', boxing: 'Boxing' };
const nameOf = (id: string) => names[id] ?? id;

describe('onboarding draft', () => {
  it('starts with the product defaults and nothing opted in', () => {
    const draft = initialDraft();
    expect(draft.radiusKm).toBe(3);
    expect(draft.privacy).toEqual(DEFAULT_PRIVACY);
    expect(draft.pullMeIn).toEqual([]);
    expect(draft.privacyTouched).toBe(false);
  });

  it('keeps pick order and drops level and Pull Me In with the sport', () => {
    let draft = toggleSport(initialDraft(), 'running');
    draft = toggleSport(draft, 'football');
    draft = setLevel(draft, 'running', 'advanced');
    draft = togglePullMeIn(draft, 'running');
    expect(draft.sports).toEqual(['running', 'football']);
    draft = toggleSport(draft, 'running');
    expect(draft.sports).toEqual(['football']);
    expect(draft.levels).toEqual({});
    expect(draft.pullMeIn).toEqual([]);
  });

  it('only turns Pull Me In on for picked sports, and off again', () => {
    let draft = togglePullMeIn(initialDraft(), 'football');
    expect(draft.pullMeIn).toEqual([]);
    draft = togglePullMeIn(toggleSport(draft, 'football'), 'football');
    expect(draft.pullMeIn).toEqual(['football']);
    expect(togglePullMeIn(draft, 'football').pullMeIn).toEqual([]);
  });

  it('asks for a level for every sport, naming them', () => {
    let draft = toggleSport(toggleSport(toggleSport(initialDraft(), 'football'), 'running'), 'boxing');
    expect(sportsError(draft, nameOf)).toBe('Pick a rough level for Football, Running and Boxing.');
    draft = setLevel(setLevel(draft, 'football', 'casual'), 'running', 'casual');
    expect(sportsError(draft, nameOf)).toBe('Pick a rough level for Boxing.');
    draft = setLevel(draft, 'boxing', 'learning');
    expect(sportsError(draft, nameOf)).toBeNull();
    expect(sportsError(initialDraft(), nameOf)).toBeNull();
  });

  it('checks the name', () => {
    expect(nameError(' ')).not.toBeNull();
    expect(nameError('a'.repeat(41))).not.toBeNull();
    expect(nameError('Sam K')).toBeNull();
  });

  it('marks privacy as touched', () => {
    const draft = setPrivacy(initialDraft(), 'history', 'only_me');
    expect(draft.privacy.history).toBe('only_me');
    expect(draft.privacyTouched).toBe(true);
  });

  it('never offers Everyone for availability', () => {
    const availability = PRIVACY_PARTS.find((p) => p.part === 'availability');
    expect(availability?.choices.map((c) => c.value)).not.toContain('everyone');
  });
});

describe('availability rows', () => {
  it('maps grid slots to day numbers and back', () => {
    const rows = slotsToRows(['tue-evening', 'sun-morning']);
    expect(rows).toEqual([
      { day_of_week: 2, part: 'evening' },
      { day_of_week: 7, part: 'morning' },
    ]);
    expect(rowsToSlots([{ day_of_week: 7, part: 'morning' }, { day_of_week: 2, part: 'evening' }])).toEqual([
      'tue-evening',
      'sun-morning',
    ]);
    expect(rowsToSlots([{ day_of_week: 9, part: 'morning' }])).toEqual([]);
  });
});

describe('toSaveArgs', () => {
  it('sends all three steps, the first sport as main', () => {
    let draft = toggleSport(toggleSport(initialDraft(), 'football'), 'boxing');
    draft = setLevel(setLevel(draft, 'football', 'intermediate'), 'boxing', 'learning');
    draft = togglePullMeIn(draft, 'football');
    draft = { ...draft, slots: ['tue-evening'], radiusKm: 5, name: '  Sam K ' };
    expect(toSaveArgs(draft)).toEqual({
      p_sports: [
        { sport_id: 'football', level: 'intermediate', is_main: true },
        { sport_id: 'boxing', level: 'learning', is_main: false },
      ],
      p_availability: [{ day_of_week: 2, part: 'evening' }],
      p_discovery_radius_km: 5,
      p_pull_me_in: [{ sport_id: 'football', scope: 'connections' }],
      p_privacy: DEFAULT_PRIVACY,
      p_display_name: 'Sam K',
    });
  });

  it('skipping sports sends empty lists and no name', () => {
    const args = toSaveArgs(initialDraft());
    expect(args.p_sports).toEqual([]);
    expect(args.p_pull_me_in).toEqual([]);
    expect('p_display_name' in args).toBe(false);
  });

  it('falls back to casual if a level is somehow missing', () => {
    const args = toSaveArgs(toggleSport(initialDraft(), 'running'));
    expect(args.p_sports).toEqual([{ sport_id: 'running', level: 'casual', is_main: true }]);
  });
});
