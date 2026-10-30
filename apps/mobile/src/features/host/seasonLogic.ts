/**
 * Pure words and shapes for HostSeason (league operations) and HostInsights (insights & revenue).
 * docs/HOSTS_OPS_CONTRACT.md. No React Native imports, so it runs in Node (vitest).
 *
 * The server computes standings (points → goal difference → goals scored → name), rates, fill times
 * and money (the service fee is a PLACEHOLDER computed server-side). Nothing here recomputes them;
 * it only turns them into the words the designs use.
 */
import {
  fillTimeChange,
  fillTimeLabel,
  fixtureReadiness,
  formatMoney,
  goalDifferenceLabel,
  moneyLineLabel,
  percent,
  pointsChange,
  relativeChange,
  type HostFixtureResultState,
  type HostInsights,
  type HostInsightsWeek,
  type HostLeagueView,
  type HostResultToConfirm,
  type HostRoundFixture,
  type HostSeriesInsight,
  type HostStanding,
} from '@ojoro/contracts';

import { clock, firstName, namesList, zonedParts } from '../activities/format';
import { dateParts, monthDay, plural } from './logic';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const WEEKDAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

/** The score as written: "4–2" (an en dash). */
export function scoreLine(home: number, away: number): string {
  return `${home}–${away}`;
}

/** The score as read aloud: "4 to 2". */
export function spokenScore(home: number, away: number): string {
  return `${home} to ${away}`;
}

/** "twice", "once", "3 times". */
export function timesWord(n: number): string {
  if (n === 1) return 'once';
  if (n === 2) return 'twice';
  return `${n} times`;
}

// HostSeason -------------------------------------------------------------------------------------

type League = HostLeagueView['league'];
type Round = NonNullable<HostLeagueView['round']>;

/** Header overline: "ROUND 3 OF 10", or "10 ROUNDS PLAYED" once there's nothing left to play. */
export function seasonOverline(league: Pick<League, 'rounds_total'>, round: Pick<Round, 'number'> | null): string {
  return round ? `ROUND ${round.number} OF ${league.rounds_total}` : `${league.rounds_total} ROUNDS PLAYED`;
}

/** The display title: "WINTER LEAGUE." */
export function seasonTitle(name: string): string {
  const t = name.trim().toUpperCase();
  return t.endsWith('.') ? t : `${t}.`;
}

/** "this Saturday", "today", "tomorrow", or "Saturday Nov 7" further out. */
export function relativeDay(at: string, now: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  const n = zonedParts(now, timeZone);
  const diff = Math.round(
    (Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(n.year, n.month - 1, n.day)) / 86_400_000,
  );
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  const name = WEEKDAY_NAMES[p.weekday]!;
  if (diff > 1 && diff < 7) return `this ${name}`;
  if (diff < 0 && diff > -7) return `last ${name}`;
  return `${name} ${monthDay(`${p.year}-${p.month}-${p.day}`)}`;
}

/**
 * "6 teams, 10 Saturdays at Jeanne-Mance. Round 3 kicks off this Saturday at 9:00."
 * The weekday comes from the season's start date (rounds are weekly).
 */
export function seasonSummary(
  league: Pick<League, 'team_count' | 'rounds_total' | 'starts_on' | 'venue_label' | 'time_zone'>,
  round: Pick<Round, 'number' | 'fixtures'> | null,
  now: Date,
): string {
  const d = dateParts(league.starts_on);
  const weekday = WEEKDAY_NAMES[new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()]!;
  const where = league.venue_label ? ` at ${league.venue_label}` : '';
  const first = `${plural(league.team_count, 'team')}, ${plural(league.rounds_total, weekday)}${where}.`;
  const kickoff = round?.fixtures
    .map((f) => f.kicks_off_at)
    .sort()
    .find(Boolean);
  if (!round) return `${first} Every round is played.`;
  if (!kickoff) return `${first} Round ${round.number} is next.`;
  return `${first} Round ${round.number} kicks off ${relativeDay(kickoff, now, league.time_zone)} at ${clock(kickoff, league.time_zone)}.`;
}

/** What the captains have sent, in words, for the RESULT TO CONFIRM block. */
export function resultStatusLine(item: Pick<HostResultToConfirm, 'home' | 'away' | 'result'>): string {
  const r: HostFixtureResultState = item.result;
  const sent = (teamId: string) => r.submissions.find((s) => s.team_id === teamId);
  switch (r.status) {
    case 'agreed':
    case 'confirmed':
      return r.home_goals != null && r.away_goals != null
        ? `Both captains sent ${scoreLine(r.home_goals, r.away_goals)}`
        : 'Both captains sent the same score';
    case 'one_sent': {
      const s = r.submissions[0];
      const by = s && s.team_id === item.away.id ? item.away : item.home;
      const other = by.id === item.home.id ? item.away : item.home;
      return s
        ? `${by.name} sent ${scoreLine(s.home_goals, s.away_goals)}. ${other.name} hasn't sent a score yet`
        : 'One captain has sent a score';
    }
    case 'differ': {
      const h = sent(item.home.id);
      const a = sent(item.away.id);
      return h && a
        ? `The captains sent different scores: ${item.home.name} ${scoreLine(h.home_goals, h.away_goals)}, ${item.away.name} ${scoreLine(a.home_goals, a.away_goals)}`
        : 'The captains sent different scores';
    }
    case 'disputed':
      return 'Disputed. Both captains were asked to send the score again';
    case 'waiting':
    default:
      return 'No score from the captains yet';
  }
}

/**
 * "Round 2, played Thursday, moved from Saturday. Both captains sent 4–2 and 13 of 14 players
 * checked in at the pitch."
 */
export function resultDetail(item: HostResultToConfirm, timeZone: string): string {
  const day = WEEKDAY_NAMES[zonedParts(item.kicks_off_at, timeZone).weekday]!;
  const moved = item.rescheduled_from
    ? `, moved from ${WEEKDAY_NAMES[zonedParts(item.rescheduled_from, timeZone).weekday]!}`
    : '';
  const checked =
    item.players_in > 0 ? ` and ${item.checked_in} of ${item.players_in} players checked in at the pitch` : '';
  return `Round ${item.round}, played ${day}${moved}. ${resultStatusLine(item)}${checked}.`;
}

/** The score shown big in the block: the agreed or confirmed one, else a dash. */
export function resultScore(r: HostFixtureResultState): { shown: string; spoken: string } {
  if (r.home_goals == null || r.away_goals == null) return { shown: '–', spoken: 'No score yet' };
  return { shown: scoreLine(r.home_goals, r.away_goals), spoken: spokenScore(r.home_goals, r.away_goals) };
}

/** CONFIRM RESULT works without a score only once both captains sent the same one. */
export function canConfirm(r: Pick<HostFixtureResultState, 'status'>): boolean {
  return r.status === 'agreed';
}

/** DISPUTE: while it isn't disputed or confirmed. */
export function canDispute(r: Pick<HostFixtureResultState, 'status'>): boolean {
  return r.status !== 'disputed' && r.status !== 'confirmed';
}

/** Under the block when CONFIRM RESULT can't be used yet. */
export function confirmBlockedNote(r: Pick<HostFixtureResultState, 'status'>): string | null {
  switch (r.status) {
    case 'agreed':
    case 'confirmed':
      return null;
    case 'differ':
      return 'Confirm once both captains send the same score, or dispute it to ask them again.';
    case 'disputed':
      return 'Waiting on both captains to send the score again.';
    default:
      return 'Confirm once both captains send the same score.';
  }
}

export type StandingsCell = Record<'pos' | 'team' | 'p' | 'w' | 'd' | 'l' | 'gd' | 'pts', string | number>;

/** Standings as the table shows them, in the server's order. */
export function standingsRows(
  standings: readonly HostStanding[],
  moved: ReadonlySet<string> = new Set(),
): { key: string; cells: StandingsCell; highlighted: boolean }[] {
  return standings.map((s) => ({
    key: s.team_id,
    highlighted: moved.has(s.team_id),
    cells: {
      pos: s.position,
      team: s.team_name,
      p: s.played,
      w: s.won,
      d: s.drawn,
      l: s.lost,
      gd: goalDifferenceLabel(s.goal_difference),
      pts: s.points,
    },
  }));
}

/** Under the table: who has a game in hand, or what the shading means after a confirm. */
export function standingsNote(standings: readonly HostStanding[], justConfirmed: boolean): string | null {
  if (justConfirmed) return 'Shaded rows moved with the result you just confirmed.';
  const pending = standings.filter((s) => s.pending_count > 0).map((s) => s.team_name);
  if (pending.length === 0) return null;
  const verb = pending.length === 1 ? 'has' : 'have';
  const games = pending.length === 1 && (standings.find((s) => s.team_name === pending[0])?.pending_count ?? 1) > 1
    ? 'games'
    : 'a game';
  return `${namesList(pending)} ${verb} ${games} in hand until you confirm.`;
}

/** "Points, then goal difference, then goals scored". */
export function tieBreakLine(tieBreaks: readonly string[]): string {
  const words: Record<string, string> = {
    points: 'points',
    goal_difference: 'goal difference',
    goals_scored: 'goals scored',
  };
  const list = tieBreaks.map((t) => words[t] ?? t.replace(/_/g, ' '));
  const text = list.join(', then ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "ROUND 3 · SAT OCT 31". */
export function roundHeading(round: Pick<Round, 'number' | 'plays_on'>): string {
  const d = dateParts(round.plays_on);
  const weekday = WEEKDAY_SHORT[new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()]!;
  return `ROUND ${round.number} · ${weekday} ${MONTH_SHORT[d.month - 1]} ${d.day}`;
}

/** "10 rounds, everyone plays everyone twice". */
export function fixturesMeta(league: Pick<League, 'rounds_total' | 'meetings'>): string {
  return `${plural(league.rounds_total, 'round')}, everyone plays everyone ${timesWord(league.meetings)}`;
}

/** "6 teams · 64 players · 9 free agents". */
export function teamsMeta(league: Pick<League, 'team_count' | 'player_count' | 'free_agent_count'>): string {
  return [
    plural(league.team_count, 'team'),
    plural(league.player_count, 'player'),
    plural(league.free_agent_count, 'free agent'),
  ].join(' · ');
}

/** "Teams need 7 checked in by kick-off. 9 free agents are on the league list if one is short." */
export function readinessNote(league: Pick<League, 'min_players' | 'free_agent_count'>): string {
  const first = `Teams need ${league.min_players} checked in by kick-off.`;
  if (league.free_agent_count === 0) return first;
  const agents =
    league.free_agent_count === 1
      ? '1 free agent is on the league list'
      : `${league.free_agent_count} free agents are on the league list`;
  return `${first} ${agents} if one is short.`;
}

export type FixtureModel = {
  key: string;
  time: string;
  pitch: string | null;
  match: string;
  refLine: string;
  badge: { label: string; tone: 'neutral' | 'signal' };
  /** ASK YARA TO REF: the suggested free referee, when nobody is refereeing. */
  ask: { userId: string; label: string; name: string } | null;
};

/** One fixture of the next round: time, pitch, teams, referee and readiness, in words. */
export function fixtureModel(f: HostRoundFixture, league: Pick<League, 'min_players' | 'time_zone'>): FixtureModel {
  const ref = f.referee;
  const person = ref.referee;
  const suggestion = f.referee_suggestion;
  let refLine: string;
  if (person && ref.referee_status === 'accepted') refLine = `Ref: ${person.display_name}`;
  else if (person && ref.referee_status === 'asked') refLine = `Ref: ${person.display_name} · asked, waiting for an answer`;
  else {
    const declined = person && ref.referee_status === 'declined' ? `${person.display_name} can't ref. ` : '';
    refLine = suggestion
      ? `${declined}No ref yet. ${suggestion.person.display_name} is free and ${suggestion.refs_count > 0 ? `has reffed ${timesWord(suggestion.refs_count)}` : "hasn't reffed yet"}.`
      : `${declined}No ref yet. Nobody on the referee list is free.`;
  }
  const askable = suggestion && (!person || ref.referee_status === 'declined');
  let badge: FixtureModel['badge'];
  if (f.status === 'postponed') badge = { label: 'POSTPONED', tone: 'neutral' };
  else if (f.status === 'cancelled') badge = { label: 'CALLED OFF', tone: 'neutral' };
  else if (f.status === 'played') badge = { label: 'PLAYED', tone: 'neutral' };
  else {
    const r = fixtureReadiness(f, league.min_players);
    badge = { label: r.label, tone: r.short ? 'signal' : 'neutral' };
  }
  return {
    key: f.fixture_id,
    time: clock(f.kicks_off_at, league.time_zone),
    pitch: f.pitch,
    match: `${f.home.name} v ${f.away.name}`,
    refLine,
    badge,
    ask: askable
      ? {
          userId: suggestion.person.id,
          name: suggestion.person.display_name,
          label: `ASK ${firstName(suggestion.person.display_name).toUpperCase()} TO REF`,
        }
      : null,
  };
}

/** The share sheet's text: the table in a few lines (there's no public season page yet). */
export function standingsShareText(league: Pick<League, 'name'>, standings: readonly HostStanding[]): string {
  const rows = standings.map(
    (s) => `${s.position}. ${s.team_name} · ${s.points} pts · ${goalDifferenceLabel(s.goal_difference)} GD`,
  );
  return [`${league.name} standings`, ...rows].join('\n');
}

// HostInsights ------------------------------------------------------------------------------------

/** "Up 18% on the 30 days before." / "Down 4% …" / "Same as the 30 days before." / "" (nothing before). */
export function hoursChangeSentence(now: number, before: number | null, days: number): string {
  const c = relativeChange(now, before);
  if (c == null) return '';
  if (c === 'Same') return ` Same as the ${days} days before.`;
  return ` ${c.startsWith('+') ? 'Up' : 'Down'} ${c.slice(1)} on the ${days} days before.`;
}

/** The hero's explanation line. */
export function hoursExplainer(i: Pick<HostInsights, 'ojoro_hours' | 'ojoro_hours_before' | 'days'>): string {
  return `Everyone who checked in, times how long they played.${hoursChangeSentence(i.ojoro_hours, i.ojoro_hours_before, i.days)}`;
}

/** "1,240". */
export function countText(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** "Tuesday", or the series name when it runs on several days. */
function fillSubject(fill: NonNullable<HostInsights['fill']>): string {
  const isoNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  if (fill.repeat_days.length === 1) {
    const name = isoNames[(fill.repeat_days[0] ?? 1) - 1];
    if (name) return name;
  }
  return fill.series_name;
}

export type TileModel = { key: string; value: string; label: string; delta?: string | undefined };

/** The four key numbers, in the design's order. */
export function insightTiles(i: HostInsights): TileModel[] {
  const before = `on the ${i.days} days before`;
  const showDelta = pointsChange(i.show_up_rate, i.show_up_rate_before);
  const returnDelta = pointsChange(i.return_rate, i.return_rate_before);
  const payoutDelta = relativeChange(i.payout_cents, i.payout_cents_before);
  return [
    {
      key: 'show-up',
      value: percent(i.show_up_rate),
      label: 'Showed up',
      delta: showDelta ? `${showDelta} ${before}` : undefined,
    },
    {
      key: 'return',
      value: percent(i.return_rate),
      label: 'Came back within 2 weeks',
      delta: returnDelta ?? undefined,
    },
    i.fill
      ? {
          key: 'fill',
          value: fillTimeLabel(i.fill.median_seconds),
          label: `For ${fillSubject(i.fill)} to fill`,
          delta: fillTimeChange(i.fill.median_seconds, i.fill.median_seconds_before) ?? undefined,
        }
      : { key: 'fill', value: '–', label: 'No session filled up yet' },
    {
      key: 'payout',
      value: formatMoney(i.payout_cents, i.currency),
      label: 'Paid out to you',
      delta: payoutDelta ?? undefined,
    },
  ];
}

/** "Sep 28" from a local Monday 'YYYY-MM-DD'. */
export function weekLabel(weekStart: string): string {
  return monthDay(weekStart);
}

/** "Thursday called off" for each skipped session of a week. */
function skippedWords(w: HostInsightsWeek, timeZone: string): string[] {
  return w.skipped.map((s) => {
    const day = WEEKDAY_NAMES[zonedParts(s.starts_at, timeZone).weekday]!;
    return s.reason ? `${day} called off: ${s.reason}` : `${day} called off`;
  });
}

export type WeekDatum = {
  key: string;
  label: string;
  value: number;
  meta: string;
  extra: { sessions: number };
  accessibilityLabel: string;
};

/** The people-per-week series for ColumnChart, oldest first. */
export function weekData(weeks: readonly HostInsightsWeek[], timeZone: string): WeekDatum[] {
  return weeks.map((w) => {
    const label = weekLabel(w.week_start);
    const parts = [`Week of ${label}`, plural(w.sessions, 'session'), ...skippedWords(w, timeZone)];
    return {
      key: w.week_start,
      label,
      value: w.people,
      meta: parts.join(' · '),
      extra: { sessions: w.sessions },
      accessibilityLabel: `${parts.join(', ')}: ${plural(w.people, 'person', 'people')}`,
    };
  });
}

/** "LAST WEEK", or "THIS WEEK" while the last column's week is still running. */
export function lastWeekLabel(weeks: readonly HostInsightsWeek[], now: Date, timeZone: string): string {
  const last = weeks[weeks.length - 1];
  if (!last) return 'LAST WEEK';
  const p = zonedParts(now, timeZone);
  const today = Date.UTC(p.year, p.month - 1, p.day);
  const d = dateParts(last.week_start);
  const start = Date.UTC(d.year, d.month - 1, d.day);
  return today < start + 7 * 86_400_000 ? 'THIS WEEK' : 'LAST WEEK';
}

/** The note under the chart: what explains a week with sessions called off. */
export function chartCaption(weeks: readonly HostInsightsWeek[], timeZone: string): string | undefined {
  const hit = weeks.filter((w) => w.skipped.length > 0);
  if (hit.length === 0) return undefined;
  const w = hit[hit.length - 1]!;
  const days = namesList([...new Set(w.skipped.map((s) => WEEKDAY_NAMES[zonedParts(s.starts_at, timeZone).weekday]!))]);
  const n = w.skipped.length;
  return `The week of ${weekLabel(w.week_start)} had ${n === 1 ? 'a session' : `${n} sessions`} called off (${days}).`;
}

/** "Fills in about 26 hours", "about 3 days", "about 40 minutes". */
export function aboutDuration(seconds: number): string {
  const hours = seconds / 3600;
  if (hours < 1) return `about ${plural(Math.max(1, Math.round(seconds / 60)), 'minute')}`;
  if (hours < 48) return `about ${plural(Math.round(hours), 'hour')}`;
  return `about ${plural(Math.round(hours / 24), 'day')}`;
}

/** One BY SESSION row: name, "98% full", the meter label and the muted line. */
export function seriesRow(s: HostSeriesInsight): {
  key: string;
  name: string;
  pct: number | null;
  full: string;
  aria: string;
  meta: string;
} {
  const pct = s.fill_rate == null ? null : Math.round(s.fill_rate * 100);
  const parts: string[] = [];
  if (s.sessions === 0) parts.push('No sessions in this window');
  else if (pct != null && pct >= 95 && s.median_fill_seconds != null) parts.push(`Fills in ${aboutDuration(s.median_fill_seconds)}`);
  else if (s.typical_in != null) parts.push(`Usually ${s.typical_in} of ${s.capacity}`);
  if (s.no_show_rate != null) parts.push(`${Math.round(s.no_show_rate * 100)}% no-shows`);
  if (s.typical_waitlist != null && s.typical_waitlist > 0) parts.push(`${s.typical_waitlist} on the waitlist most weeks`);
  if (s.first_timers > 0 && s.first_timer_return_rate != null) {
    parts.push(`${Math.round(s.first_timer_return_rate * 10)} in 10 first-timers come back the next week`);
  }
  return {
    key: s.series_id,
    name: s.name,
    pct,
    full: pct == null ? 'No data yet' : `${pct}% full`,
    aria: pct == null ? `${s.name}, no sessions yet` : `${s.name}, ${pct} percent full on average`,
    meta: parts.join(' · '),
  };
}

/** Ledger lines for REVENUE: charges by kind, then refunds and the placeholder fee (money out). */
export function revenueLines(r: HostInsights['revenue']): {
  key: string;
  label: string;
  amountCents: number;
  note?: string | undefined;
}[] {
  const lines: { key: string; label: string; amountCents: number; note?: string | undefined }[] = r.lines.map(
    (l) => ({
      key: `${l.kind}:${l.unit_cents}`,
      label: moneyLineLabel(l, r.currency),
      amountCents: l.amount_cents,
    }),
  );
  if (r.refunds_cents !== 0) lines.push({ key: 'refunds', label: 'Refunds', amountCents: -Math.abs(r.refunds_cents) });
  lines.push({ key: 'fee', label: 'Ojoro service fee', amountCents: -Math.abs(r.fee_cents), note: 'placeholder' });
  return lines;
}

/** The fee placeholder note under the ledger, from the server's policy (never a constant here). */
export function feeNote(policy: HostInsights['fee_policy'], connected: boolean): string {
  const rate = policy.rate_bps / 100;
  const shown = Number.isInteger(rate) ? `${rate}%` : `${rate.toFixed(1)}%`;
  const fee = `The Ojoro service fee is a placeholder (${shown} of each week's charges) until fees are decided.`;
  return connected ? fee : `${fee} Payments aren't connected yet, so no money moves; these are records.`;
}

/** The locale for money: CAD reads "$" in Canadian English, everything else in US English. */
export function moneyLocale(currency: string): string {
  return currency === 'CAD' ? 'en-CA' : 'en-US';
}
