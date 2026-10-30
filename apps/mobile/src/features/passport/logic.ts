/**
 * Passport detail, goals, achievements and personal bests (PRD §9.17): pure words and shapes for
 * `/passport`, `/profile/[id]/passport`, the GOAL block on You and the goal sheet. The data comes from
 * docs/PASSPORT_CONTRACT.md; nothing here counts or ranks people.
 */
import {
  achievementProgress,
  achievementTitle,
  formatDuration,
  formatResultValue,
  GOAL_LIMITS,
  goalProgressLine,
  monthLabel,
  stampHeadline,
  type GoalKind,
  type GoalNextStep,
  type GoalNextTest,
  type GoalView,
  type PassportAchievement,
  type PassportPersonalBest,
  type PassportStamp,
  type PassportStampsFilter,
  type PassportView,
  type Visibility,
} from '@ojoro/contracts';

import { shortPlace, stampDate, weekdayClock, zonedParts } from '../activities/format';

// Stamps -------------------------------------------------------------------------------------------------

type StampLike = {
  milestone: string | null;
  milestone_count?: number | null;
  count?: number | null;
  kind: PassportStamp['kind'];
  sport_name: string;
  title: string | null;
  outcome: string | null;
  sport_number?: number | null;
  occurred_at: string;
  place_name: string | null;
  place_time_zone: string | null;
};

/** The props of a `PassportStamp` from a stamp or a milestone row: "NEW 5K PB", "MOUNT ROYAL LOOP", "29.10.26". */
export function stampProps(stamp: StampLike, fallbackTimeZone?: string) {
  return {
    title: stampHeadline(stamp),
    place: stamp.place_name ? shortPlace(stamp.place_name).toUpperCase() : 'OJORO',
    date: stampDate(stamp.occurred_at, stamp.place_time_zone ?? fallbackTimeZone),
    kind: stamp.sport_name.toUpperCase(),
  };
}

/** Where a stamp leads: the game's Recap or the Challenge's Result, when the viewer can see it. */
export function stampHref(stamp: Pick<PassportStamp, 'activity_id' | 'challenge_event_id'>): string | null {
  if (stamp.activity_id) return `/activity/${stamp.activity_id}/recap`;
  if (stamp.challenge_event_id) return `/event/${stamp.challenge_event_id}`;
  return null;
}

/**
 * One line about a stamp, in words: "Football · 90 min · Jeanne-Mance · 12th game here" or
 * "Running · 5K in 22:48 · won · new best (was 23:05)".
 */
export function stampLine(stamp: PassportStamp): string {
  const parts: string[] = [stamp.sport_name];
  if (stamp.kind === 'challenge') {
    const value = formatResultValue(stamp.scoring, stamp.value, stamp.unit);
    if (stamp.title) parts.push(value ? `${stamp.title} in ${value}` : stamp.title);
    if (stamp.outcome) parts.push(stamp.outcome);
    if (stamp.personal_best) {
      parts.push(
        stamp.previous_best == null
          ? 'first best'
          : `new best (was ${formatResultValue(stamp.scoring, stamp.previous_best, stamp.unit)})`,
      );
    }
  } else if (stamp.minutes > 0) {
    parts.push(`${stamp.minutes} min`);
  }
  if (stamp.place_name) parts.push(shortPlace(stamp.place_name));
  if (stamp.kind === 'game' && stamp.place_game_number && stamp.place_game_number > 1) {
    parts.push(`${ordinalWord(stamp.place_game_number)} game here`);
  }
  return parts.join(' · ');
}

function ordinalWord(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${n % 10 > 3 ? 'th' : suffix}`;
}

/** The stamp a Recap or Result link points at (`?entry=`, `?activity=` or `?event=`). */
export type StampTarget = {
  entry?: string | null | undefined;
  activity?: string | null | undefined;
  event?: string | null | undefined;
};

export function hasTarget(target: StampTarget): boolean {
  return Boolean(target.entry || target.activity || target.event);
}

export function findStamp(stamps: readonly PassportStamp[], target: StampTarget): PassportStamp | null {
  if (!hasTarget(target)) return null;
  return (
    stamps.find(
      (s) =>
        (target.entry && s.entry_id === target.entry) ||
        (target.activity && s.activity_id === target.activity) ||
        (target.event && s.challenge_event_id === target.event),
    ) ?? null
  );
}

/** `/passport?activity=…`: the link from a Recap's stamp (and `?event=` from a Result). */
export function passportHrefFor(target: StampTarget): string {
  const q = target.entry
    ? `entry=${encodeURIComponent(target.entry)}`
    : target.activity
      ? `activity=${encodeURIComponent(target.activity)}`
      : target.event
        ? `event=${encodeURIComponent(target.event)}`
        : '';
  return q ? `/passport?${q}` : '/passport';
}

// Filters ------------------------------------------------------------------------------------------------

export type FilterBy = PassportStampsFilter['by'];

export const FILTER_BYS: readonly { by: FilterBy; label: string }[] = [
  { by: 'all', label: 'All' },
  { by: 'milestones', label: 'Firsts and milestones' },
  { by: 'sport', label: 'Sport' },
  { by: 'place', label: 'Place' },
  { by: 'month', label: 'Month' },
];

export type FilterValue = { id: string; label: string; count: number };

/** The values for a grouping, most stamps first (months newest first), with counts. */
export function filterValues(view: Pick<PassportView, 'sports' | 'places' | 'months'>, by: FilterBy): FilterValue[] {
  if (by === 'sport') {
    return [...view.sports]
      .sort((a, b) => b.stamps - a.stamps)
      .map((s) => ({ id: s.sport_id, label: s.name, count: s.stamps }));
  }
  if (by === 'place') return view.places.map((p) => ({ id: p.place_id, label: shortPlace(p.name), count: p.stamps }));
  if (by === 'month') return view.months.map((m) => ({ id: m.month, label: monthName(m.month), count: m.stamps }));
  return [];
}

/** 'YYYY-MM' → "October 2026" (sentence case for chips). */
export function monthName(month: string): string {
  const upper = monthLabel(month);
  return upper.charAt(0) + upper.slice(1).toLowerCase();
}

/** A filter from a grouping and a picked value (falls back to all stamps when nothing is picked). */
export function toFilter(by: FilterBy, value: string | null): PassportStampsFilter {
  if (by === 'milestones') return { by };
  if (!value) return { by: 'all' };
  if (by === 'sport') return { by, sportId: value };
  if (by === 'place') return { by, placeId: value };
  if (by === 'month') return { by, month: value };
  return { by: 'all' };
}

/** The key part of a filter, for query keys and analytics. */
export function filterKey(filter: PassportStampsFilter): string {
  switch (filter.by) {
    case 'sport':
      return `sport:${filter.sportId}`;
    case 'place':
      return `place:${filter.placeId}`;
    case 'month':
      return `month:${filter.month}`;
    default:
      return filter.by;
  }
}

/** The empty line for a filtered list. */
export function emptyStampsLine(filter: PassportStampsFilter, self: boolean): string {
  if (filter.by === 'all') return self ? 'No stamps yet. Your first game adds one.' : 'No stamps yet.';
  if (filter.by === 'milestones') return 'No firsts or milestones yet.';
  return 'No stamps here.';
}

// Header -------------------------------------------------------------------------------------------------

/** "14 STAMPS." "6 PLACES." "23 PEOPLE." with singulars. */
export function headlineLines(totals: { stamps: number; places: number; people_moved_with: number }): string[] {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}.`;
  return [
    plural(totals.stamps, 'STAMP', 'STAMPS'),
    plural(totals.places, 'PLACE', 'PLACES'),
    plural(totals.people_moved_with, 'PERSON', 'PEOPLE'),
  ];
}

/** "PASSPORT" for yours, "ADE'S PASSPORT" for someone else's. */
export function passportOverline(view: Pick<PassportView, 'is_me' | 'display_name'>): string {
  if (view.is_me) return 'PASSPORT';
  const first = (view.display_name ?? '').trim().split(/\s+/)[0] ?? '';
  return first ? `${first.toUpperCase()}'S PASSPORT` : 'PASSPORT';
}

/** "Since March 2026." from the first stamp, in the owner's time zone. */
export function sinceLine(firstAt: string | null, timeZone?: string): string | null {
  if (!firstAt) return null;
  const p = zonedParts(firstAt, timeZone);
  return `Since ${monthName(`${p.year}-${String(p.month).padStart(2, '0')}`)}.`;
}

const AUDIENCE: Record<Visibility, string> = {
  everyone: 'Everyone sees',
  friends: 'Friends see',
  crews: 'Your Crews see',
  only_me: 'Only you see',
};

/** "Friends see your Passport. Only you see your goal." */
export function passportVisibilityLine(history: Visibility, goals: Visibility): string {
  if (history === goals) return `${AUDIENCE[history]} your Passport and your goal.`;
  return `${AUDIENCE[history]} your Passport. ${AUDIENCE[goals]} your goal.`;
}

// Personal bests -----------------------------------------------------------------------------------------

/** "5K · 22:48". */
export function personalBestTitle(pb: Pick<PassportPersonalBest, 'discipline' | 'scoring' | 'value' | 'unit'>): string {
  return `${pb.discipline} · ${formatResultValue(pb.scoring, pb.value, pb.unit)}`;
}

/** "Running · 29.10.26 at Mount Royal loop · down from 23:22, beaten 3 times". */
export function personalBestMeta(pb: PassportPersonalBest, timeZone?: string): string {
  const parts = [pb.sport_name, `${stampDate(pb.set_at, timeZone)}${pb.place_name ? ` at ${shortPlace(pb.place_name)}` : ''}`];
  if (pb.improvements > 0) {
    const times = pb.improvements === 1 ? 'once' : `${pb.improvements} times`;
    parts.push(`from ${formatResultValue(pb.scoring, pb.first_value, pb.unit)}, beaten ${times}`);
  } else {
    parts.push('first result');
  }
  return parts.join(' · ');
}

// Achievements -------------------------------------------------------------------------------------------

export type AchievementRow = { key: string; title: string; meta: string; achieved: boolean };

/**
 * The highest tier reached on each ladder (newest first) and, for yourself, the next tier of each
 * ladder ("6 of 10"), the closest first. Words only: no points, nothing to spend.
 */
export function achievementRows(rows: readonly PassportAchievement[], timeZone?: string) {
  // Only the highest tier reached on each ladder (and place): 25 STAMPS says 10 STAMPS already.
  const top = new Map<string, PassportAchievement>();
  for (const a of rows) {
    if (!a.achieved) continue;
    const k = `${a.ladder}-${a.context ?? ''}`;
    const held = top.get(k);
    if (!held || a.threshold > held.threshold) top.set(k, a);
  }
  const reached: AchievementRow[] = [...top.values()]
    .sort((a, b) => (b.achieved_at ?? '').localeCompare(a.achieved_at ?? ''))
    .map((a) => ({
      key: `${a.ladder}-${a.threshold}-${a.context ?? ''}`,
      title: achievementTitle(a.ladder, a.threshold),
      meta: [a.context ? shortPlace(a.context) : null, a.achieved_at ? stampDate(a.achieved_at, timeZone) : null]
        .filter(Boolean)
        .join(' · '),
      achieved: true,
    }));
  const next: AchievementRow[] = rows
    .filter((a) => !a.achieved)
    .sort((a, b) => b.current / b.threshold - a.current / a.threshold)
    .map((a) => ({
      key: `${a.ladder}-${a.threshold}-${a.context ?? ''}`,
      title: achievementTitle(a.ladder, a.threshold),
      meta: `${achievementProgress(a) ?? ''} so far`,
      achieved: false,
    }));
  return { reached, next };
}

// Goals --------------------------------------------------------------------------------------------------

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "The Call-Out on Saturday is your next real test." (within the week), else with the date. */
export function nextTestSentence(test: GoalNextTest, now: Date): string {
  const at = zonedParts(test.starts_at, test.time_zone);
  const today = zonedParts(now, test.time_zone);
  const days = Math.round(
    (Date.UTC(at.year, at.month - 1, at.day) - Date.UTC(today.year, today.month - 1, today.day)) / 86_400_000,
  );
  const when =
    days === 0
      ? 'today'
      : days === 1
        ? 'tomorrow'
        : days > 1 && days < 7
          ? `on ${WEEKDAY_NAMES[at.weekday]}`
          : `on ${at.day} ${MONTH_SHORT[at.month - 1]}`;
  return `The Call-Out ${when} is your next real test.`;
}

/** The muted line under the goal: progress, then the next test when there is one. */
export function goalBody(goal: GoalView, now: Date): string {
  const parts = [goalProgressLine(goal)];
  if (goal.next_test && !goal.achieved) parts.push(nextTestSentence(goal.next_test, now));
  return parts.join(' ');
}

/** NEXT STEP: "Tempo run · Thu 6:30 · Plateau Run Club". */
export function nextStepTitle(step: GoalNextStep): string {
  const tz = step.place_time_zone ?? undefined;
  return [step.title?.trim() || step.sport_name, weekdayClock(step.starts_at, tz), step.place_name ? shortPlace(step.place_name) : null]
    .filter(Boolean)
    .join(' · ');
}

/** What the NEXT STEP button does: I'M DOWN joins; otherwise it opens the plan. */
export function nextStepAction(step: GoalNextStep): { label: string; joins: boolean } {
  if (step.action === 'join') return { label: "I'M DOWN", joins: true };
  if (step.action === 'waitlist') return { label: 'JOIN WAITLIST', joins: false };
  return { label: 'SEE THE PLAN', joins: false };
}

/** Parses a race time: "22" (minutes), "22:30", "1:02:05". Null when it isn't one. */
export function parseTime(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(t)) return null;
  const parts = t.split(':').map(Number);
  if (parts.length === 1) return parts[0]! * 60;
  if (parts.slice(1).some((p) => p >= 60)) return null;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
}

/** Parses a positive number ("12", "12.5", "12,5"). */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

export type GoalDraft = {
  kind: GoalKind;
  sportId: string | null;
  discipline: string;
  scoring: 'time' | 'distance';
  target: string;
  /** 'YYYY-MM-DD' or null. */
  date: string | null;
};

export function draftFrom(goal: GoalView | null, defaultSport: string | null): GoalDraft {
  if (!goal) {
    return { kind: 'personal_best', sportId: defaultSport, discipline: '', scoring: 'time', target: '', date: null };
  }
  const scoring = goal.scoring ?? 'time';
  return {
    kind: goal.kind,
    sportId: goal.sport_id ?? (goal.kind === 'personal_best' ? defaultSport : null),
    discipline: goal.discipline ?? '',
    scoring,
    target:
      goal.kind === 'personal_best' && scoring === 'time'
        ? formatDuration(goal.target_value)
        : String(goal.target_value),
    date: goal.target_date,
  };
}

export type GoalField = 'kind' | 'sport' | 'discipline' | 'target' | 'date';

export type GoalArgs = {
  p_kind: GoalKind;
  p_target_value: number;
  p_sport_id?: string;
  p_discipline?: string;
  p_scoring?: 'time' | 'distance';
  p_target_date?: string;
};

/** Checks a draft the way the server does (GOAL_LIMITS); the server still has the last word. */
export function validateGoal(
  d: GoalDraft,
): { ok: true; args: GoalArgs } | { ok: false; field: GoalField; message: string } {
  const date = d.date ? { p_target_date: d.date } : {};
  if (d.kind === 'personal_best') {
    if (!d.sportId) return { ok: false, field: 'sport', message: 'Pick the sport.' };
    const discipline = d.discipline.trim().replace(/\s+/g, ' ');
    if (!discipline) return { ok: false, field: 'discipline', message: 'Say which distance or event, like 5K.' };
    if (discipline.length > 24) return { ok: false, field: 'discipline', message: 'Keep it to 24 characters.' };
    if (d.scoring === 'time') {
      const s = parseTime(d.target);
      const { min, max } = GOAL_LIMITS.timeSeconds;
      if (s == null) return { ok: false, field: 'target', message: 'Write the time as minutes and seconds, like 22:00.' };
      if (s < min || s > max) return { ok: false, field: 'target', message: 'Pick a time between 1:00 and 24:00:00.' };
      return {
        ok: true,
        args: { p_kind: d.kind, p_target_value: s, p_sport_id: d.sportId, p_discipline: discipline.toUpperCase(), p_scoring: 'time', ...date },
      };
    }
    const n = parseAmount(d.target);
    const { min, max } = GOAL_LIMITS.distance;
    if (n == null || n < min || n > max) {
      return { ok: false, field: 'target', message: `Pick a distance from ${min} to ${max}.` };
    }
    return {
      ok: true,
      args: { p_kind: d.kind, p_target_value: n, p_sport_id: d.sportId, p_discipline: discipline.toUpperCase(), p_scoring: 'distance', ...date },
    };
  }
  const limits = d.kind === 'sessions' ? GOAL_LIMITS.sessions : GOAL_LIMITS.places;
  const n = parseAmount(d.target);
  if (n == null || !Number.isInteger(n) || n < limits.min || n > limits.max) {
    return { ok: false, field: 'target', message: `Pick a whole number from ${limits.min} to ${limits.max}.` };
  }
  return {
    ok: true,
    args: {
      p_kind: d.kind,
      p_target_value: n,
      ...(d.kind === 'sessions' && d.sportId ? { p_sport_id: d.sportId } : {}),
      ...date,
    },
  };
}

/** Maps a `goal_invalid` detail from the server to the field it is about. */
export function fieldOfDetail(detail: unknown): GoalField | null {
  if (typeof detail !== 'string') return null;
  if (detail === 'target_value' || detail === 'scoring') return 'target';
  if (detail === 'target_date') return 'date';
  if (detail === 'sport') return 'sport';
  if (detail === 'discipline') return 'discipline';
  if (detail === 'kind') return 'kind';
  return null;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * BY: the last day of this month and the next ones ("End of December"; "End of January 2027" in
 * another year). A date the goal already has is kept as an option.
 */
export function dateOptions(now: Date, count: number, timeZone?: string, keep?: string | null) {
  const today = zonedParts(now, timeZone);
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const m0 = today.month - 1 + i;
    const year = today.year + Math.floor(m0 / 12);
    const month = (m0 % 12) + 1;
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const value = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    const name = MONTH_NAMES[month - 1]!;
    options.push({ value, label: `End of ${name}${year === today.year ? '' : ` ${year}`}` });
  }
  if (keep && !options.some((o) => o.value === keep)) {
    const [y, m, d] = keep.split('-').map(Number);
    options.push({ value: keep, label: `By ${d} ${MONTH_NAMES[(m ?? 1) - 1]}${y === today.year ? '' : ` ${y}`}` });
  }
  return options;
}

/** The target field's label and hint for a draft. */
export function targetField(d: Pick<GoalDraft, 'kind' | 'scoring'>): { label: string; hint: string; numeric: boolean } {
  if (d.kind === 'personal_best') {
    return d.scoring === 'time'
      ? { label: 'Target time', hint: 'Under this time. Minutes and seconds, like 22:00.', numeric: false }
      : { label: 'Target distance', hint: 'Over this distance, in km.', numeric: true };
  }
  if (d.kind === 'sessions') return { label: 'How many sessions', hint: 'Counted from today.', numeric: true };
  return { label: 'How many new places', hint: 'Places you play for the first time, from today.', numeric: true };
}
