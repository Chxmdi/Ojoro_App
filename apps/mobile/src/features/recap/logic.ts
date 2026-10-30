/**
 * Recap and Run It Back: the poster headline, who you played with, the Passport line, the share
 * text and the time options. Pure, so it runs in Node.
 */
import {
  clock,
  firstName,
  monthSince,
  namesList,
  ordinal,
  shortDate,
  shortPlace,
  weekdayClock,
  zonedParts,
  zonedTime,
} from '../activities/format';

export type RecapRow = {
  occurred_at: string;
  duration_minutes: number;
  played_count: number;
  team_a_label: string | null;
  team_b_label: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  verification_level: 'self_recorded' | 'participant_confirmed' | null;
  confirmed_count: number;
  finalized_at: string | null;
};

/** The poster's display lines: ["LIGHTS WIN", "5–4."], ["DRAW", "3–3."] or ["GOOD", "GAME."]. */
export function recapHeadline(recap: RecapRow): [string, string] {
  const a = recap.team_a_score;
  const b = recap.team_b_score;
  if (a === null || b === null) return ['GOOD', 'GAME.'];
  const score = `${Math.max(a, b)}–${Math.min(a, b)}.`;
  if (a === b) return ['DRAW', `${a}–${b}.`];
  const winner = (a > b ? recap.team_a_label : recap.team_b_label) ?? (a > b ? 'Team A' : 'Team B');
  return [`${winner.toUpperCase()} WIN`, score];
}

/** The line under the verification badge. */
export function resultLine(recap: RecapRow): string {
  if (recap.team_a_score === null || recap.team_b_score === null) return 'No score was logged.';
  if (recap.verification_level === 'participant_confirmed') {
    return `Confirmed by ${recap.confirmed_count} of ${recap.played_count} players.`;
  }
  return 'Logged by one player. Not confirmed by the others.';
}

export type RecapPerson = {
  user_id: string;
  display_name: string | null;
  games_with_me: number | null;
  is_first_with_me: boolean | null;
};

/**
 * "First game with Lena and Joel. 12th with Marcus." Firsts, then the longest run with one person
 * (from 2 games). `meId` is left out.
 */
export function playedWithLine(people: readonly RecapPerson[], meId: string): string | null {
  const others = people.filter((p) => p.user_id !== meId);
  const firsts = others.filter((p) => p.is_first_with_me).map((p) => firstName(p.display_name ?? 'someone'));
  const parts: string[] = [];
  if (firsts.length) parts.push(`First game with ${namesList(firsts)}.`);
  const most = others
    .filter((p) => !p.is_first_with_me && (p.games_with_me ?? 0) >= 2)
    .sort((a, b) => (b.games_with_me ?? 0) - (a.games_with_me ?? 0))[0];
  if (most) parts.push(`${ordinal(most.games_with_me ?? 0)} with ${firstName(most.display_name ?? 'someone')}.`);
  return parts.length ? parts.join(' ') : null;
}

export type PassportRow = {
  /** The stamp's id (links to it in the Passport). */
  passport_entry_id?: string | null;
  occurred_at: string;
  ojoro_hours: number;
  place_name: string | null;
  place_game_number: number;
  first_at_place: string | null;
};

/** The stamp's display line: "21 GAMES", "1 GAME". */
export function stampTitle(entry: Pick<PassportRow, 'place_game_number'>): string {
  const n = entry.place_game_number;
  return `${n} ${n === 1 ? 'GAME' : 'GAMES'}`;
}

/** "21 games at Jeanne-Mance since March." or "Your first game at Jeanne-Mance." */
export function passportLine(entry: PassportRow, now: Date, timeZone?: string): string {
  const place = entry.place_name ? shortPlace(entry.place_name) : 'this place';
  if (entry.place_game_number <= 1) return `Your first game at ${place}.`;
  const since = entry.first_at_place ? ` since ${monthSince(entry.first_at_place, now, timeZone)}` : '';
  return `${entry.place_game_number} games at ${place}${since}.`;
}

/** "+1.5". */
export function hoursLabel(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `+${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}`;
}

/** "FOOTBALL · JEANNE-MANCE". */
export function posterOverline(sportName: string, placeName: string | null): string {
  return [sportName, placeName ? shortPlace(placeName) : null].filter(Boolean).join(' · ').toUpperCase();
}

/** What SHARE RECAP sends: words only (no link yet; recaps have no public page in Slice 01). */
export function shareText(input: {
  headline: [string, string];
  sportName: string;
  placeName: string | null;
  occurredAt: string;
  played: number;
  timeZone?: string | undefined;
}): string {
  const where = input.placeName ? ` at ${input.placeName}` : '';
  return `${input.headline.join(' ')} ${input.sportName}${where}, ${shortDate(input.occurredAt, input.timeZone)}. ${input.played} played. On Ojoro.`;
}

/** Run It Back needs the new start at least an hour ahead (contract). */
export const RUN_IT_BACK_MIN_LEAD_MS = 60 * 60 * 1000;

export type TimeOption = { startsAt: string; label: string };

/**
 * SAME TIME, OR MOVE IT: the same weekday and time next week (or the first such week at least an
 * hour away), then the next two days at the same time. Wall-clock in the place's zone, so a
 * daylight-saving change keeps 7:30 at 7:30.
 */
export function runItBackOptions(lastStart: string, now: Date, timeZone?: string): TimeOption[] {
  const p = zonedParts(lastStart, timeZone);
  const at = (addDays: number) =>
    zonedTime(
      { year: p.year, month: p.month, day: p.day + addDays, hour: p.hour, minute: p.minute },
      timeZone,
    );
  let week = 7;
  while (at(week).getTime() < now.getTime() + RUN_IT_BACK_MIN_LEAD_MS) week += 7;
  return [0, 1, 2].map((extra) => {
    const d = at(week + extra);
    return { startsAt: d.toISOString(), label: weekdayClock(d, timeZone) };
  });
}

/** "Tue 13 Oct, 7:30 at Jeanne-Mance". */
export function suggestedLine(startsAt: string, placeName: string | null, timeZone?: string): string {
  const where = placeName ? ` at ${shortPlace(placeName)}` : '';
  return `${shortDate(startsAt, timeZone)}, ${clock(startsAt, timeZone)}${where}`;
}

/** The custom-time sheet: the next 14 days, and times around the last start every 30 minutes. */
export function pickerDays(now: Date, timeZone?: string, count = 14): { key: string; label: string; day: number; month: number; year: number }[] {
  const today = zonedParts(now, timeZone);
  return Array.from({ length: count }, (_, i) => {
    const d = zonedTime({ year: today.year, month: today.month, day: today.day + i, hour: 12, minute: 0 }, timeZone);
    const p = zonedParts(d, timeZone);
    return {
      key: `${p.year}-${p.month}-${p.day}`,
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : shortDate(d, timeZone),
      day: p.day,
      month: p.month,
      year: p.year,
    };
  });
}

/** Times from 6:00 AM to 10:30 PM every 30 minutes, as [hour, minute]. */
export function pickerTimes(): [number, number][] {
  const out: [number, number][] = [];
  for (let h = 6; h <= 22; h += 1) {
    out.push([h, 0], [h, 30]);
  }
  return out;
}

/** "7:30 PM" for an [hour, minute] pair. */
export function timeLabel([h, m]: [number, number]): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Whether a picked start is allowed (at least an hour ahead). Returns the words when it isn't. */
export function startError(startsAt: string, now: Date): string | null {
  return Date.parse(startsAt) < now.getTime() + RUN_IT_BACK_MIN_LEAD_MS
    ? 'Pick a time at least an hour from now.'
    : null;
}

/** The crew line beside the avatars: "Ade, Marcus + 6". */
export function crewLine(names: readonly string[]): string {
  const first = names.slice(0, 2).map(firstName);
  const rest = names.length - first.length;
  return rest > 0 ? `${first.join(', ')} + ${rest}` : namesList(first);
}
