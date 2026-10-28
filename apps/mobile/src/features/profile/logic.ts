import type { Database } from '@ojoro/contracts';

type Visibility = Database['public']['Enums']['visibility'];
type DayPart = Database['public']['Enums']['day_part'];
type Level = Database['public']['Enums']['skill_level'];
type ReputationKind = Database['public']['Enums']['reputation_kind'];

/** Who can see what, in one line under the stats (You.png): wider audiences see less. */
export function visibilityLine(v: { sports: Visibility; history: Visibility; availability: Visibility }): string {
  const parts: { name: string; v: Visibility }[] = [
    { name: 'your sports', v: v.sports },
    { name: 'your Passport', v: v.history },
    { name: "when you're free", v: v.availability },
  ];
  const audiences: { v: Visibility; who: string; verb: string }[] = [
    { v: 'everyone', who: 'Everyone', verb: 'sees' },
    { v: 'friends', who: 'Friends', verb: 'see' },
    { v: 'crews', who: 'Your Crews', verb: 'see' },
  ];
  const sentences: string[] = [];
  let seenWider = false;
  for (const audience of audiences) {
    const names = parts.filter((p) => p.v === audience.v).map((p) => p.name);
    if (names.length === 0) continue;
    sentences.push(`${audience.who} ${seenWider ? 'also ' : ''}${audience.verb} ${joinWords(names)}.`);
    seenWider = true;
  }
  const hidden = parts.filter((p) => p.v === 'only_me').map((p) => p.name);
  if (hidden.length === parts.length) return 'Only you see your sports, Passport and free times.';
  if (hidden.length > 0) sentences.push(`Only you see ${joinWords(hidden)}.`);
  return sentences.join(' ');
}

/** "a", "a and b", "a, b and c". */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PART_PLURAL: Record<DayPart, string> = {
  morning: 'mornings',
  midday: 'middays',
  evening: 'evenings',
};

/** "Tue and Thu evenings, Sat mornings". Never a calendar: days of the week and parts only. */
export function freeTimes(rows: readonly { day_of_week: number; part: DayPart }[]): string | null {
  if (rows.length === 0) return null;
  const byPart = new Map<DayPart, number[]>();
  for (const row of rows) {
    const days = byPart.get(row.part) ?? [];
    if (!days.includes(row.day_of_week)) days.push(row.day_of_week);
    byPart.set(row.part, days);
  }
  const groups = [...byPart.entries()]
    .map(([part, days]) => ({ part, days: days.sort((a, b) => a - b) }))
    .sort((a, b) => (a.days[0] ?? 0) - (b.days[0] ?? 0));
  return groups
    .map(({ part, days }) => {
      if (days.length === 7) return `every ${part}`;
      const names = days.map((d) => DAY_SHORT[d - 1]).filter((d): d is string => d !== undefined);
      return `${joinWords(names)} ${PART_PLURAL[part]}`;
    })
    .join(', ');
}

/** Your own free times, and who they're shared with (as overlap). */
export function ownAvailabilityLine(
  rows: readonly { day_of_week: number; part: DayPart }[],
  visibility: Visibility,
): string {
  const times = freeTimes(rows);
  if (!times) return "You haven't said when you're usually free.";
  const shared =
    visibility === 'only_me'
      ? 'Only you see it.'
      : `Shared with ${visibility === 'crews' ? 'your Crews' : 'Friends'} as overlap only.`;
  return `Usually free ${capitalizeFirst(times)}. ${shared}`;
}

/** Someone else's: only what you both have free. */
export function overlapLine(rows: readonly { day_of_week: number; part: DayPart }[]): string | null {
  const times = freeTimes(rows);
  return times ? `You're both usually free ${times}.` : null;
}

function capitalizeFirst(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** The muted line under a sport: position and, for the owner only, the level. Never a score. */
export function sportMeta(sport: { position: string | null; level: Level | null }, isMe: boolean): string | null {
  const bits: string[] = [];
  if (sport.position) bits.push(sport.position);
  if (isMe && sport.level) bits.push(sport.level);
  return bits.length > 0 ? bits.join(' · ') : null;
}

const REPUTATION_WORDS: Record<ReputationKind, string> = {
  shows_up: 'SHOWS UP',
  respectful: 'RESPECTFUL',
  welcomes_beginners: 'WELCOMES BEGINNERS',
  great_host: 'GREAT HOST',
};

/** "SHOWS UP · 31" */
export function reputationLabel(kind: ReputationKind, confirmations: number): string {
  return `${REPUTATION_WORDS[kind]} · ${confirmations}`;
}

/** Ojoro hours: whole numbers stay whole, otherwise one decimal. */
export function formatHours(hours: number | null): string {
  if (hours === null) return '0';
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/** "06.10.26" */
export function stampDate(iso: string, timeZone = 'America/Toronto'): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')}`;
}

export type StampEntry = {
  occurred_at: string;
  place_game_number: number | null;
  sport_game_number: number;
  place_name: string | null;
  sport_name: string | null;
};

/** A Passport stamp from an entry: "21 GAMES" at the place, or the first game. */
export function stampFor(entry: StampEntry, timeZone?: string) {
  const n = entry.place_game_number ?? entry.sport_game_number;
  return {
    title: n <= 1 ? 'FIRST GAME' : `${n} GAMES`,
    place: entry.place_name ?? 'Somewhere new',
    date: stampDate(entry.occurred_at, timeZone),
    kind: entry.sport_name ? entry.sport_name.toUpperCase() : undefined,
  };
}

/** "14 STAMPS. 6 PLACES. 23 PEOPLE." with singulars. */
export function passportHeadline(stamps: number, places: number, people: number): string[] {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}.`;
  return [plural(stamps, 'STAMP', 'STAMPS'), plural(places, 'PLACE', 'PLACES'), plural(people, 'PERSON', 'PEOPLE')];
}

/** "12 games with you" / "First game with you is still to come". */
export function gamesWithMe(n: number | null): string | null {
  if (n === null) return null;
  if (n === 0) return "You haven't played together yet";
  return n === 1 ? '1 game with you' : `${n} games with you`;
}
