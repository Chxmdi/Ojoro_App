/**
 * Pure rules for crews, CrewChat's Make This a Game and the minimal crew screens: copy built from
 * the facts (docs/MESSAGING_CONTRACT.md, Make This a Game), validation, and the arguments for
 * `make_this_a_game`. No React Native imports.
 */
import { clock, clockWithPeriod, dayDiff, zonedParts } from '../plans/time';

export type CrewRole = 'owner' | 'admin' | 'member';

/** The facts of a `chat_suggestions()` row the screen uses. */
export type SuggestionFacts = {
  id: string;
  status: 'open' | 'accepted' | 'expired';
  sport_id: string;
  sport_name: string | null;
  day_label: string;
  proposed_times: readonly string[];
  place_ids: readonly string[];
  place_names: readonly string[];
  interested_count: number;
  member_count: number;
  free_count: number;
  plan_id: string | null;
  accepted_by_name: string | null;
};

/** "FOOTBALL, SATURDAY MORNING?" */
export function suggestionTitle(s: Pick<SuggestionFacts, 'sport_name' | 'sport_id' | 'day_label'>): string {
  const sport = (s.sport_name ?? s.sport_id.replace(/_/g, ' ')).toUpperCase();
  return `${sport}, ${s.day_label.toUpperCase()}?`;
}

/** What MAKE THIS A GAME will still ask: "time and place", "place", "the details". */
export function missingParts(s: Pick<SuggestionFacts, 'proposed_times' | 'place_ids'>): string {
  const time = s.proposed_times.length > 1;
  const place = s.place_ids.length !== 1;
  if (time && place) return 'time and place';
  if (time) return 'time';
  if (place) return 'place';
  return 'the details';
}

/** "4 of you want in. Ojoro can set up the plan with this crew already invited and ask only what's missing: time and place." */
export function suggestionBody(s: SuggestionFacts): string {
  const want = `${s.interested_count} of you want in.`;
  return `${want} Ojoro can set up the plan with this crew already invited and ask only what's missing: ${missingParts(s)}.`;
}

/** "9", "10:30" in the crew's zone: hours without ":00", as the design writes ranges. */
export function hourLabel(at: string, timeZone: string): string {
  const c = clock(at, timeZone);
  return c.endsWith(':00') ? c.slice(0, -3) : c;
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** The day word in a sentence: "Saturday", "tomorrow", "tonight", "this weekend". */
export function dayWord(dayLabel: string): string {
  const words = dayLabel.trim().split(/\s+/);
  const first = (words[0] ?? '').toLowerCase();
  if (WEEKDAYS.includes(first)) return first.charAt(0).toUpperCase() + first.slice(1);
  if (first === 'this' && words[1]) return `this ${words[1].toLowerCase()}`;
  return first;
}

/** "9 of 14 are free Saturday between 9 and 10:30." Null when nobody's free time is known. */
export function freeLine(
  s: Pick<SuggestionFacts, 'free_count' | 'member_count' | 'day_label' | 'proposed_times'>,
  timeZone: string,
): string | null {
  if (s.free_count <= 0 || s.member_count <= 0) return null;
  const times = [...s.proposed_times].sort((a, b) => Date.parse(a) - Date.parse(b));
  const first = times[0];
  const last = times[times.length - 1];
  const day = dayWord(s.day_label);
  const verb = s.free_count === 1 ? 'is' : 'are';
  if (!first || !last) return `${s.free_count} of ${s.member_count} ${verb} free ${day}.`;
  const when =
    first === last
      ? `at ${hourLabel(first, timeZone)}`
      : `between ${hourLabel(first, timeZone)} and ${hourLabel(last, timeZone)}`;
  return `${s.free_count} of ${s.member_count} ${verb} free ${day} ${when}.`;
}

/** "WHAT TIME SATURDAY?" (the crew plan's time poll). */
export function pollQuestion(dayLabel: string | null | undefined): string {
  if (!dayLabel) return 'WHAT TIME?';
  return `WHAT TIME ${dayWord(dayLabel).toUpperCase()}?`;
}

/** CrewChat's header caption: "14 members · 4 free tonight". */
export function crewCaption(v: { member_count: number; free_tonight: number | null }): string {
  const members = `${v.member_count} ${v.member_count === 1 ? 'member' : 'members'}`;
  return v.free_tonight && v.free_tonight > 0 ? `${members} · ${v.free_tonight} free tonight` : members;
}

export function roleLabel(role: CrewRole | null | undefined): string | null {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  return null;
}

export function isCrewAdmin(role: CrewRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/** A time the tapper can pick: "Sat 9:00" (or "Tomorrow 6:30", "Tonight 7:00"). */
export function timeChoiceLabel(at: string, now: Date, timeZone: string): string {
  const diff = dayDiff(at, now, timeZone);
  const p = zonedParts(at, timeZone);
  const day = diff === 0 ? (p.hour >= 17 ? 'Tonight' : 'Today') : diff === 1 ? 'Tomorrow' : p.weekday;
  return `${day} ${clock(at, timeZone)}`;
}

export type MakeGameDraft = {
  times: readonly string[];
  /** A place id, or null: the place is agreed later. */
  placeId: string | null;
  capacity: number;
};

export const MAX_TIMES = 4;
export const MIN_CAPACITY = 2;
export const MAX_CAPACITY = 30;

/** The defaults: every suggested time still ahead, the place to be agreed, the sport's capacity. */
export function defaultDraft(
  s: Pick<SuggestionFacts, 'proposed_times'>,
  defaultCapacity: number,
  now: Date,
): MakeGameDraft {
  const ahead = s.proposed_times.filter((t) => Date.parse(t) > now.getTime()).slice(0, MAX_TIMES);
  return { times: ahead, placeId: null, capacity: clampCapacity(defaultCapacity) };
}

export function clampCapacity(n: number): number {
  if (!Number.isFinite(n)) return 10;
  return Math.min(MAX_CAPACITY, Math.max(MIN_CAPACITY, Math.round(n)));
}

/** Pick or unpick a time, keeping them in order and at most four. */
export function toggleTime(times: readonly string[], at: string): string[] {
  const next = times.includes(at) ? times.filter((t) => t !== at) : [...times, at];
  return next.sort((a, b) => Date.parse(a) - Date.parse(b)).slice(0, MAX_TIMES);
}

export type DraftCheck = { ok: true } | { ok: false; error: string };

export function validateDraft(d: MakeGameDraft, now: Date): DraftCheck {
  if (d.times.length === 0) return { ok: false, error: 'Pick at least one time.' };
  if (d.times.length > MAX_TIMES) return { ok: false, error: 'Pick up to four times.' };
  if (d.times.some((t) => Date.parse(t) <= now.getTime())) {
    return { ok: false, error: 'One of those times has passed. Pick another.' };
  }
  if (d.capacity < MIN_CAPACITY || d.capacity > MAX_CAPACITY) {
    return { ok: false, error: `Between ${MIN_CAPACITY} and ${MAX_CAPACITY} people.` };
  }
  return { ok: true };
}

/** `make_this_a_game` arguments for a checked draft (the key is the caller's, one per tap). */
export function makeGameArgs(suggestionId: string, d: MakeGameDraft, key: string) {
  return {
    p_suggestion_id: suggestionId,
    p_time_options: [...d.times],
    p_capacity: d.capacity,
    p_idempotency_key: key,
    ...(d.placeId ? { p_place_id: d.placeId } : null),
  };
}

/** What the sheet's button promises: one time is a plan, more is a plan with a poll. */
export function makeGameNote(d: MakeGameDraft): string {
  const where = d.placeId ? '' : ' The place is agreed later.';
  if (d.times.length > 1) {
    return `Starts a crew plan with a ${d.times.length}-time poll. You're in; the crew taps I'M DOWN themselves.${where}`;
  }
  return `Starts a crew plan. You're in; the crew taps I'M DOWN themselves.${where}`;
}

// Invite codes and names -------------------------------------------------------------------------

/** Codes are 8 characters from A–Z and 2–9 without look-alikes (contract). */
export const CODE_LENGTH = 8;

export function normalizeCode(input: string): { ok: true; code: string } | { ok: false; error: string } {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length === 0) return { ok: false, error: 'Enter the 8-character code.' };
  if (!/^[A-Z2-9]+$/.test(code)) return { ok: false, error: 'Codes use letters and the numbers 2 to 9.' };
  if (code.length !== CODE_LENGTH) return { ok: false, error: 'Codes are 8 characters.' };
  return { ok: true, code };
}

export const CREW_NAME_MAX = 40;

export function validateCrewName(name: string): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, error: 'Give the crew a name.' };
  if (trimmed.length > CREW_NAME_MAX) return { ok: false, error: `Names are up to ${CREW_NAME_MAX} characters.` };
  return { ok: true, name: trimmed };
}

/** The words shared with the code. No link page exists yet, so it says where to type it. */
export function inviteText(crewName: string, code: string): string {
  return `Join ${crewName} on Ojoro: open Crews, tap JOIN WITH A CODE and enter ${code}.`;
}

/** A row in Your crews: "14 members · Admin". */
export function crewRowMeta(row: { member_count: number; role: CrewRole }): string {
  const members = `${row.member_count} ${row.member_count === 1 ? 'member' : 'members'}`;
  const role = roleLabel(row.role);
  return role ? `${members} · ${role}` : members;
}

/** The leave confirmation, in counts. */
export function leaveBody(v: { name: string; member_count: number; my_role: CrewRole | null }): string {
  if (v.my_role === 'owner' && v.member_count > 1) {
    return `You own ${v.name}. Hand it to someone else first; then you can leave.`;
  }
  if (v.member_count <= 1) return `You're the last one in. Leaving closes ${v.name}.`;
  return `You leave the chat and its plans. ${v.member_count - 1} stay. You can come back with an invite code.`;
}

/** The poll's closing time after "Closes": "tonight 9 PM", "today 4 PM", "tomorrow 9 AM", "Sat 9 AM". */
export function closesText(at: string, now: Date, timeZone: string): string {
  const diff = dayDiff(at, now, timeZone);
  const p = zonedParts(at, timeZone);
  const time = clockWithPeriod(at, timeZone);
  if (diff === 0) return `${p.hour >= 17 ? 'tonight' : 'today'} ${time}`;
  if (diff === 1) return `tomorrow ${time}`;
  return `${p.weekday} ${time}`;
}

// Realtime ----------------------------------------------------------------------------------------

/**
 * What about a suggestion is worth a refetch. `chat_suggestions()` runs detection, which rewrites
 * the open row (its expiry moves) on every call, so a refetch on every row event would loop: one
 * read writes, the write is an event, the event reads. Only these facts changing counts.
 */
export function suggestionSignature(row: Record<string, unknown>): string {
  const pick = (k: string) => JSON.stringify(row[k] ?? null);
  return ['status', 'plan_id', 'day_key', 'day_label', 'proposed_times', 'place_ids', 'interested_ids']
    .map(pick)
    .join('|');
}
