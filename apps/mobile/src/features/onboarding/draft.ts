import type { Database, RpcArgs } from '@ojoro/contracts';

import type { AvailabilitySlot } from '@/design-system/components/AvailabilityGrid.logic';

export type Level = Database['public']['Enums']['skill_level'];
export type Visibility = Database['public']['Enums']['visibility'];
export type DayPart = Database['public']['Enums']['day_part'];

/** OnboardSports: the rough levels, for matching only. */
export const LEVELS: readonly { value: Level; label: string }[] = [
  { value: 'learning', label: 'Learning' },
  { value: 'casual', label: 'Casual' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

/** OnboardWhen: "HOW FAR WILL YOU GO?" */
export const RADIUS_CHOICES = [1, 3, 5, 10] as const;
export const DEFAULT_RADIUS_KM = 3;

export type PrivacyPart = 'sports' | 'history' | 'availability';
export type PrivacyChoice = { value: Visibility; label: string };

/** OnboardPrivacy: the chips per part. Availability is never `everyone` (the database refuses it). */
export const PRIVACY_PARTS: readonly {
  part: PrivacyPart;
  title: string;
  group: string;
  choices: readonly PrivacyChoice[];
  note?: string;
}[] = [
  {
    part: 'sports',
    title: 'Your sports and level',
    group: 'Sports and level visible to',
    choices: [
      { value: 'everyone', label: 'Everyone' },
      { value: 'friends', label: 'Friends' },
      { value: 'only_me', label: 'Just me' },
    ],
  },
  {
    part: 'history',
    title: "What you've done and your Passport",
    group: 'History visible to',
    choices: [
      { value: 'everyone', label: 'Everyone' },
      { value: 'friends', label: 'Friends' },
      { value: 'only_me', label: 'Just me' },
    ],
  },
  {
    part: 'availability',
    title: "When you're free",
    group: 'Availability visible to',
    choices: [
      { value: 'friends', label: 'Friends' },
      { value: 'crews', label: 'My Crews' },
      { value: 'only_me', label: 'Just me' },
    ],
    note: 'Shown as overlap with theirs, never as your schedule.',
  },
];

export type Privacy = Record<PrivacyPart, Visibility>;

/** The product defaults (OnboardPrivacy; the same as the `privacy_settings` column defaults). */
export const DEFAULT_PRIVACY: Privacy = {
  sports: 'everyone',
  history: 'friends',
  availability: 'crews',
};

export type OnboardingDraft = {
  name: string;
  /** Sport ids in the order they were picked; the first is the main sport. */
  sports: string[];
  levels: Record<string, Level>;
  slots: AvailabilitySlot[];
  radiusKm: number;
  /** Sports with Pull Me In on. Opt-in: nothing is on until chosen. */
  pullMeIn: string[];
  privacy: Privacy;
  /** True once privacy was changed here (server defaults then don't overwrite it). */
  privacyTouched: boolean;
};

export function initialDraft(): OnboardingDraft {
  return {
    name: '',
    sports: [],
    levels: {},
    slots: [],
    radiusKm: DEFAULT_RADIUS_KM,
    pullMeIn: [],
    privacy: { ...DEFAULT_PRIVACY },
    privacyTouched: false,
  };
}

export function toggleSport(draft: OnboardingDraft, sportId: string): OnboardingDraft {
  if (!draft.sports.includes(sportId)) return { ...draft, sports: [...draft.sports, sportId] };
  const levels = { ...draft.levels };
  delete levels[sportId];
  return {
    ...draft,
    sports: draft.sports.filter((id) => id !== sportId),
    levels,
    pullMeIn: draft.pullMeIn.filter((id) => id !== sportId),
  };
}

export function setLevel(draft: OnboardingDraft, sportId: string, level: Level): OnboardingDraft {
  return { ...draft, levels: { ...draft.levels, [sportId]: level } };
}

export function togglePullMeIn(draft: OnboardingDraft, sportId: string): OnboardingDraft {
  if (!draft.sports.includes(sportId)) return draft;
  return draft.pullMeIn.includes(sportId)
    ? { ...draft, pullMeIn: draft.pullMeIn.filter((id) => id !== sportId) }
    : { ...draft, pullMeIn: [...draft.pullMeIn, sportId] };
}

export function setPrivacy(draft: OnboardingDraft, part: PrivacyPart, value: Visibility): OnboardingDraft {
  return { ...draft, privacy: { ...draft.privacy, [part]: value }, privacyTouched: true };
}

/** Sports step: every picked sport needs a rough level. Returns the words, or null. */
export function sportsError(draft: OnboardingDraft, nameOf: (id: string) => string): string | null {
  const missing = draft.sports.filter((id) => !draft.levels[id]);
  if (missing.length === 0) return null;
  const names = missing.map(nameOf);
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Pick a rough level for ${list}.`;
}

export const NAME_MAX = 40;

export function nameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Add the name people will know you by.';
  if (trimmed.length > NAME_MAX) return `Keep it under ${NAME_MAX} characters.`;
  return null;
}

const DAY_NUMBERS = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 } as const;
type DayKey = keyof typeof DAY_NUMBERS;
const DAY_KEYS = Object.keys(DAY_NUMBERS) as DayKey[];

export function slotsToRows(slots: readonly AvailabilitySlot[]): { day_of_week: number; part: DayPart }[] {
  return slots.map((slot) => {
    const [day, part] = slot.split('-') as [DayKey, DayPart];
    return { day_of_week: DAY_NUMBERS[day], part };
  });
}

export function rowsToSlots(rows: readonly { day_of_week: number; part: DayPart }[]): AvailabilitySlot[] {
  const slots: AvailabilitySlot[] = [];
  for (const row of [...rows].sort((a, b) => a.day_of_week - b.day_of_week)) {
    const day = DAY_KEYS[row.day_of_week - 1];
    if (day) slots.push(`${day}-${row.part}`);
  }
  return slots;
}

/** One `save_onboarding` call with all three steps (contract: each list replaces what was there). */
export function toSaveArgs(draft: OnboardingDraft): RpcArgs<'save_onboarding'> {
  const name = draft.name.trim();
  return {
    p_sports: draft.sports.map((id, i) => ({
      sport_id: id,
      level: draft.levels[id] ?? 'casual',
      is_main: i === 0,
    })),
    p_availability: slotsToRows(draft.slots),
    p_discovery_radius_km: draft.radiusKm,
    p_pull_me_in: draft.pullMeIn
      .filter((id) => draft.sports.includes(id))
      .map((id) => ({ sport_id: id, scope: 'connections' })),
    p_privacy: { ...draft.privacy },
    ...(name.length > 0 ? { p_display_name: name } : {}),
  };
}
