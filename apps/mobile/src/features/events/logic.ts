/**
 * Pure rules for the Challenge Event pre-live screens (EventBuildup, EventToday, Poster) and the
 * optimistic patches in ./data.tsx. No React Native imports. Predictions and backing are social
 * counts only: no money, odds, points or payouts in any word here.
 */
import { PREDICTION_MIN_COUNT, formatChallengeValue, type ChallengeScoring } from '@ojoro/contracts';

import { clock, firstName, zonedParts } from '../activities/format';

type Side = 'a' | 'b';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const WD_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

// Optimistic patches -----------------------------------------------------------------------------

type FollowFacts = { i_follow: boolean | null; follower_count: number | null };

export function applyFollow<T extends FollowFacts>(row: T, follow: boolean): T {
  if (!!row.i_follow === follow) return row;
  return { ...row, i_follow: follow, follower_count: Math.max(0, (row.follower_count ?? 0) + (follow ? 1 : -1)) };
}

type PredictionFacts = {
  my_prediction: Side | null;
  prediction_count: number | null;
  prediction_a_pct: number | null;
  prediction_b_pct: number | null;
};

/** Counts behind the shown split (rounded back from the percentages). */
export function predictionCounts(row: PredictionFacts): { a: number; b: number } {
  const total = Math.max(0, row.prediction_count ?? 0);
  if (row.prediction_a_pct === null) {
    // Under the privacy threshold only the total is known; place the viewer's own pick.
    if (row.my_prediction === 'a') return { a: Math.min(1, total), b: Math.max(0, total - 1) };
    if (row.my_prediction === 'b') return { a: Math.max(0, total - 1), b: Math.min(1, total) };
    return { a: 0, b: total };
  }
  const a = Math.round((row.prediction_a_pct / 100) * total);
  return { a, b: Math.max(0, total - a) };
}

function pctOf(a: number, total: number): number | null {
  return total >= PREDICTION_MIN_COUNT ? Math.round((a / total) * 100) : null;
}

/** WHO TAKES IT? pick or change: move one count, recompute the split (hidden below the threshold). */
export function applyPrediction<T extends PredictionFacts>(row: T, side: Side): T {
  if (row.my_prediction === side) return row;
  const c = predictionCounts(row);
  if (row.my_prediction === 'a') c.a = Math.max(0, c.a - 1);
  if (row.my_prediction === 'b') c.b = Math.max(0, c.b - 1);
  c[side] += 1;
  const total = c.a + c.b;
  const a = pctOf(c.a, total);
  return {
    ...row,
    my_prediction: side,
    prediction_count: total,
    prediction_a_pct: a,
    prediction_b_pct: a === null ? null : 100 - a,
  };
}

type BackingFacts = { my_backing: Side | null; backing_a: number | null; backing_b: number | null };

/** BACK a side, switch, or (null) stop backing. */
export function applyBacking<T extends BackingFacts>(row: T, side: Side | null): T {
  if (row.my_backing === side) return row;
  const counts = { a: row.backing_a ?? 0, b: row.backing_b ?? 0 };
  if (row.my_backing) counts[row.my_backing] = Math.max(0, counts[row.my_backing] - 1);
  if (side) counts[side] += 1;
  return { ...row, my_backing: side, backing_a: counts.a, backing_b: counts.b };
}

/** Tapping the side you back stops backing it; tapping the other switches. */
export function nextBacking(current: Side | null, tapped: Side): Side | null {
  return current === tapped ? null : tapped;
}

type PollFacts = { vote_counts: number[]; my_vote: number | null; total_votes: number | null };

export function applyPollVote<T extends PollFacts>(poll: T, option: number): T {
  if (poll.my_vote === option) return poll;
  const counts = [...poll.vote_counts];
  const had = poll.my_vote !== null && poll.my_vote >= 0 && poll.my_vote < counts.length;
  if (had) counts[poll.my_vote!] = Math.max(0, (counts[poll.my_vote!] ?? 0) - 1);
  counts[option] = (counts[option] ?? 0) + 1;
  return { ...poll, vote_counts: counts, my_vote: option, total_votes: (poll.total_votes ?? 0) + (had ? 0 : 1) };
}

type RespectFacts = { respected: boolean | null; respect_count: number | null };

export function applyRespect<T extends RespectFacts>(c: T): T {
  const on = !c.respected;
  return { ...c, respected: on, respect_count: Math.max(0, (c.respect_count ?? 0) + (on ? 1 : -1)) };
}

// Words -----------------------------------------------------------------------------------------

/** A side's short name for display type: "Chimdi O" → "Chimdi"; a crew keeps its name. */
export function sideName(name: string | null | undefined, crew: boolean): string {
  const n = (name ?? '').trim();
  if (!n) return crew ? 'Crew' : 'Someone';
  return crew ? n : firstName(n);
}

/** Header dateline: "SAT 12 OCT · MOUNT ROYAL". */
export function dateline(startsAt: string, timeZone: string, place: string | null | undefined): string {
  const p = zonedParts(startsAt, timeZone);
  const date = `${WD_SHORT[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}`;
  const where = (place ?? '').trim();
  return where ? `${date} · ${where.toUpperCase()}` : date;
}

/** EventToday header: "SAT 12 OCT · 8:34 AM" (now, in the event's zone). */
export function todayDateline(now: number, timeZone: string): string {
  const p = zonedParts(now, timeZone);
  return `${WD_SHORT[p.weekday]} ${p.day} ${MONTHS[p.month - 1]} · ${clock(now, timeZone)} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

/** "142 following", "1 following", or null at zero. */
export function followingCount(n: number | null | undefined): string | null {
  const v = Math.max(0, Math.floor(n ?? 0));
  return v > 0 ? `${v} following` : null;
}

/** "9:00 Saturday": when picks lock, in the event's zone. */
export function lockTime(startsAt: string, timeZone: string): string {
  return `${clock(startsAt, timeZone)} ${WEEKDAYS[zonedParts(startsAt, timeZone).weekday]}`;
}

export const SOCIAL_ONLY = 'Social only: no money, no points, no odds.';

/** The line under WHO TAKES IT? before the start. */
export function predictionNote(v: {
  myPick: Side | null;
  aName: string;
  bName: string;
  locked: boolean;
  count: number;
  startsAt: string;
  timeZone: string;
  competitor: boolean;
}): string {
  if (v.locked) return `${countWord(v.count, 'prediction')}. Locked when the race went live.`;
  const until = lockTime(v.startsAt, v.timeZone);
  const hidden = v.count < PREDICTION_MIN_COUNT ? ` The split shows from ${PREDICTION_MIN_COUNT} predictions.` : '';
  if (v.myPick) {
    const name = v.myPick === 'a' ? v.aName : v.bName;
    return `You picked ${name}. Change it any time before ${until}. ${SOCIAL_ONLY}${hidden}`;
  }
  if (v.competitor) return `You can only pick yourself. ${SOCIAL_ONLY}${hidden}`;
  return `Tap a side to pick. Change it any time before ${until}. ${SOCIAL_ONLY}${hidden}`;
}

/** EventToday: "212 predictions. They lock the moment the race goes live." */
export function todayPredictionNote(count: number, locked: boolean): string {
  return locked
    ? `${countWord(count, 'prediction')}. Locked when the race went live.`
    : `${countWord(count, 'prediction')}. They lock the moment the race goes live.`;
}

/** "6 of your Crew back Chimdi. Backing never affects the result." */
export function crewBackingLine(v: { crewA: number; crewB: number; aName: string; bName: string }): string {
  const tail = 'Backing never affects the result.';
  const a = Math.max(0, v.crewA);
  const b = Math.max(0, v.crewB);
  if (a === 0 && b === 0) return tail;
  const lead = a >= b ? { n: a, name: v.aName } : { n: b, name: v.bName };
  return `${lead.n} of your Crew back${lead.n === 1 ? 's' : ''} ${lead.name}. ${tail}`;
}

export function countWord(n: number, word: string): string {
  const v = Math.max(0, Math.floor(n));
  return `${v} ${word}${v === 1 ? '' : 's'}`;
}

/** Poll "Closes Sat 9:00". */
export function pollCloses(closesAt: string | null, timeZone: string): string | undefined {
  if (!closesAt) return undefined;
  const p = zonedParts(closesAt, timeZone);
  const day = WD_SHORT[p.weekday]!;
  return `${day.charAt(0)}${day.slice(1).toLowerCase()} ${clock(closesAt, timeZone)}`;
}

// Feed ------------------------------------------------------------------------------------------

/** "12m", "3h", "1d", "now". */
export function postAge(at: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Ojoro's update time: "1H AGO" today, the weekday after that ("SUN"). */
export function systemTime(at: string, now: number, timeZone: string): string {
  const s = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  if (s < 60) return 'NOW';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}M AGO`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}H AGO`;
  return WD_SHORT[zonedParts(at, timeZone).weekday]!;
}

export type FeedPostFacts = {
  kind: 'system' | 'statement' | 'training' | 'progress' | 'logistics';
  author_id: string | null;
  author_name: string | null;
  author_role: string | null;
  author_side: Side | null;
  body: string | null;
  stats: unknown;
  is_deleted: boolean | null;
};

export type HypeView =
  | { hidden: true }
  | {
      hidden: false;
      kind: 'system' | 'competitor' | 'evidence' | 'supporter';
      body: string;
      side: string | undefined;
      stats: { value: string; label: string }[];
    };

/** How a feed post is drawn (HypePost kind, badge side, training stats). */
export function hypeView(p: FeedPostFacts, names: { a: string; b: string }): HypeView {
  if (p.is_deleted || !p.body) return { hidden: true };
  const sideName = p.author_side ? (p.author_side === 'a' ? names.a : names.b).toUpperCase() : undefined;
  if (p.kind === 'system' || !p.author_id) {
    return { hidden: false, kind: 'system', body: p.body.toUpperCase(), side: undefined, stats: [] };
  }
  const stats = trainingStats(p.stats);
  if ((p.kind === 'training' || p.kind === 'progress') && stats.length > 0) {
    return { hidden: false, kind: 'evidence', body: p.body, side: sideName, stats };
  }
  if (p.author_role === 'competitor') return { hidden: false, kind: 'competitor', body: p.body, side: sideName, stats: [] };
  return { hidden: false, kind: 'supporter', body: p.body, side: undefined, stats: [] };
}

/** {"distance_km": 5.2, "time_seconds": 1428} → 5.2 KM distance, 23:48 time. */
export function trainingStats(json: unknown): { value: string; label: string }[] {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return [];
  const o = json as Record<string, unknown>;
  const out: { value: string; label: string }[] = [];
  if (typeof o.distance_km === 'number' && Number.isFinite(o.distance_km) && o.distance_km >= 0) {
    out.push({ value: `${o.distance_km.toFixed(1)} KM`, label: 'distance' });
  }
  if (typeof o.time_seconds === 'number' && Number.isFinite(o.time_seconds) && o.time_seconds >= 0) {
    out.push({ value: formatChallengeValue(o.time_seconds, 'time') ?? '', label: 'time' });
  }
  return out;
}

/** A comment's badge: COMPETITOR (designs) or ORGANIZER. */
export function commentBadge(badge: string | null | undefined): string | undefined {
  if (badge === 'competitor') return 'COMPETITOR';
  if (badge === 'organizer') return 'ORGANIZER';
  return undefined;
}

export function validateComment(text: string, max: number): { ok: true; body: string } | { ok: false; error: string } {
  const body = text.trim();
  if (!body) return { ok: false, error: 'Write something first.' };
  if (body.length > max) return { ok: false, error: `Keep it under ${max} characters. ${body.length} now.` };
  return { ok: true, body };
}

// Stage and time --------------------------------------------------------------------------------

/** The server's "now" carried forward on the device clock since the answer arrived. */
export function serverNow(serverNowIso: string, receivedAt: number, now: number): number {
  return Date.parse(serverNowIso) + (now - receivedAt);
}

/**
 * Milliseconds until the next time-based stage change (accepted→days at 24 h after acceptance,
 * →today on the day or 3 h before, →soon 30 min before, →past the start), or null when the stage
 * only changes by a write (live, verifying…). The router refetches then; the server decides.
 */
export function nextStageChange(
  v: { stage: string; starts_at: string; accepted_at: string | null; server_now: string },
  receivedAt: number,
  now: number,
): number | null {
  if (!['accepted', 'days', 'today', 'soon'].includes(v.stage)) return null;
  const t = serverNow(v.server_now, receivedAt, now);
  const start = Date.parse(v.starts_at);
  const marks = [start - 3 * 3600_000, start - 30 * 60_000, start, start + 3 * 3600_000];
  if (v.accepted_at) marks.push(Date.parse(v.accepted_at) + 24 * 3600_000);
  const next = marks.filter((m) => Number.isFinite(m) && m > t).sort((x, y) => x - y)[0];
  if (next === undefined) return null;
  // A day boundary (→today) is in the event's zone; poll at least every hour to catch it.
  return Math.min(next - t + 1000, 3600_000);
}

/** The hero's countdown target on the device clock: the start shifted by server/device skew. */
export function countdownTarget(startsAt: string, serverNowIso: string, receivedAt: number): number {
  return Date.parse(startsAt) - (Date.parse(serverNowIso) - receivedAt);
}

/** "9:00 · Cartier monument" under the names on the day. */
export function whenLine(startsAt: string, timeZone: string, place: string | null | undefined): string {
  const where = (place ?? '').trim();
  return where ? `${clock(startsAt, timeZone)} · ${where}` : clock(startsAt, timeZone);
}

/** The discipline in display type: the sport's short name or the target ("5K"). */
export function disciplineLabel(v: {
  title: string | null;
  sport_name: string | null;
  target: number | null;
  scoring: ChallengeScoring;
  unit: string | null;
}): string {
  if (v.scoring === 'time' && v.target && v.target > 0) return `${trimNumber(v.target)}K`;
  if (v.scoring === 'distance' && v.target && v.target > 0) return `${trimNumber(v.target)} KM`;
  return (v.sport_name ?? v.title ?? 'CHALLENGE').toUpperCase();
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** A check-in row's note: "You · 8:22 · watch connected", "8:31", "Not here yet". */
export function checkInNote(v: { me: boolean; checkedIn: boolean; at?: string | null; timeZone: string }): string {
  const parts: string[] = [];
  if (v.me) parts.push('You');
  if (v.checkedIn) {
    if (v.at) parts.push(clock(v.at, v.timeZone));
  } else {
    parts.push('Not here yet');
  }
  return parts.join(' · ');
}

/** The Ojoro update on the day, from check-ins: BOTH ARE HERE. / CHIMDI IS HERE. / null. */
export function arrivalHeadline(a: { name: string; in: boolean }, b: { name: string; in: boolean }): string | null {
  if (a.in && b.in) return 'BOTH ARE HERE.';
  if (a.in) return `${a.name.toUpperCase()} IS HERE.`;
  if (b.in) return `${b.name.toUpperCase()} IS HERE.`;
  return null;
}

/** The line above I'M READY. */
export function readyLine(v: { competitor: boolean; meReady: boolean; otherReady: boolean; otherName: string; checkedIn: boolean }): string {
  if (!v.competitor) return 'The race goes live when both press start. Predictions lock then.';
  if (!v.checkedIn) return 'Check in when you get there. Check-in opens an hour before the start.';
  if (v.meReady && v.otherReady) return 'Both ready. Going live.';
  if (v.meReady) return `You're ready. The race goes live when ${v.otherName} is too.`;
  return 'The race goes live when you both press start on your watch. Nothing to do here until then.';
}

// Poster ----------------------------------------------------------------------------------------

/** The poster's date line: "Sat 12 Oct · 9:00". */
export function posterWhen(startsAt: string, timeZone: string): string {
  const p = zonedParts(startsAt, timeZone);
  const wd = WD_SHORT[p.weekday]!;
  const mo = MONTHS[p.month - 1]!;
  return `${wd.charAt(0)}${wd.slice(1).toLowerCase()} ${p.day} ${mo.charAt(0)}${mo.slice(1).toLowerCase()} · ${clock(startsAt, timeZone)}`;
}

/** The share message that goes with the poster (no exclamation marks, no emoji). */
export function posterShareText(v: { a: string; b: string; discipline: string; when: string; link: string | null }): string {
  const head = `${v.a} vs ${v.b}. ${v.discipline}, ${v.when}. Who takes it? Follow, predict and back on Ojoro.`;
  return v.link ? `${head} ${v.link}` : head;
}
