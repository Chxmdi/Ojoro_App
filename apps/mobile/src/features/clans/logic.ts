/**
 * Pure copy and rules for the Clan page (design-handoff/screens/Clan.png; docs/COMMUNITIES_CONTRACT.md,
 * Clans). Built from the server's facts in the clan's time zone. No React Native imports.
 */
import { formatMissionAmount, missionFraction, type MissionMetric } from '@ojoro/contracts';

import { clockWithPeriod, dayDiff, zonedParts } from '../plans/time';

const MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];

export type ClanRoleName = 'captain' | 'organizer' | 'coach' | 'moderator' | 'mentor' | 'connector' | 'member';

/** "CAPTAIN", "CONNECTOR". */
export function roleWord(role: ClanRoleName): string {
  return role.toUpperCase();
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'AN' : 'A';
}

/** The header overline: "CLAN · YOU'RE A CONNECTOR", "CLAN · YOU'RE THE CAPTAIN", "CLAN · ASK TO JOIN". */
export function clanOverline(v: {
  is_member: boolean;
  my_role: ClanRoleName | null;
  join_policy: 'open' | 'request' | 'invite';
}): string {
  if (v.is_member) {
    if (!v.my_role || v.my_role === 'member') return "CLAN · YOU'RE IN";
    if (v.my_role === 'captain') return "CLAN · YOU'RE THE CAPTAIN";
    return `CLAN · YOU'RE ${article(v.my_role)} ${roleWord(v.my_role)}`;
  }
  if (v.join_policy === 'open') return 'CLAN · OPEN TO JOIN';
  if (v.join_policy === 'request') return 'CLAN · ASK TO JOIN';
  return 'CLAN · INVITE ONLY';
}

/** "CONCORDIA RUN CLUB." */
export function clanHeadline(name: string): string {
  const t = name.trim().toUpperCase();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** The three numbers under the tagline. */
export function clanStats(v: { member_count: number; runs_per_week: number; coach_count: number }) {
  return [
    { value: v.member_count, label: v.member_count === 1 ? 'Member' : 'Members' },
    { value: v.runs_per_week, label: v.runs_per_week === 1 ? 'Run a week' : 'Runs a week' },
    { value: v.coach_count, label: v.coach_count === 1 ? 'Coach' : 'Coaches' },
  ];
}

/** "212", "1,240": grouped numbers in the display face. */
export function grouped(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export type JoinState =
  | { kind: 'member' }
  | { kind: 'join'; label: 'JOIN THE CLAN' | 'ASK TO JOIN' }
  | { kind: 'requested' }
  | { kind: 'invite' };

/** What a person outside the clan can do. */
export function joinState(v: {
  is_member: boolean;
  join_policy: 'open' | 'request' | 'invite';
  request_status: string | null;
}): JoinState {
  if (v.is_member) return { kind: 'member' };
  if (v.request_status === 'pending') return { kind: 'requested' };
  if (v.join_policy === 'open') return { kind: 'join', label: 'JOIN THE CLAN' };
  if (v.join_policy === 'request') return { kind: 'join', label: 'ASK TO JOIN' };
  return { kind: 'invite' };
}

export type RunFacts = {
  run_id: string;
  title: string;
  starts_at: string;
  place_name: string | null;
  place_area: string | null;
  down_count: number;
  capacity: number;
  stage: 'forming' | 'game_on' | 'live' | 'done' | 'cancelled';
  i_am_down: boolean;
};

export type RunStrip = {
  time: string;
  activity: string;
  place: string;
  count: number;
  capacity: number;
  status: 'forming' | 'confirmed' | 'live' | 'full';
};

/** THIS WEEK keeps what's still ahead or on now; called-off and finished runs drop off. */
export function upcomingRuns<T extends Pick<RunFacts, 'stage' | 'starts_at'>>(rows: readonly T[]): T[] {
  return rows
    .filter((r) => r.stage !== 'cancelled' && r.stage !== 'done')
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/** "TUE" · "Tempo · 6 km" · "Hall building · 6:30 PM" · 18 / 30, or GAME ON. */
export function runStrip(r: RunFacts, now: Date, timeZone: string): RunStrip {
  const diff = dayDiff(r.starts_at, now, timeZone);
  const p = zonedParts(r.starts_at, timeZone);
  const time = diff === 0 ? (p.hour >= 17 ? 'TONIGHT' : 'TODAY') : p.weekday.toUpperCase();
  const where = r.place_name ?? r.place_area;
  const place = [where, clockWithPeriod(r.starts_at, timeZone)].filter(Boolean).join(' · ');
  const status =
    r.stage === 'live'
      ? 'live'
      : r.stage === 'game_on'
        ? 'confirmed'
        : r.down_count >= r.capacity
          ? 'full'
          : 'forming';
  return { time, activity: r.title, place, count: r.down_count, capacity: r.capacity, status };
}

/** I'M DOWN shows on a run you're not in, before it starts, with room. */
export function canJoinRun(r: Pick<RunFacts, 'i_am_down' | 'stage' | 'down_count' | 'capacity'>): boolean {
  return !r.i_am_down && (r.stage === 'forming' || r.stage === 'game_on') && r.down_count < r.capacity;
}

// Mission ----------------------------------------------------------------------------------------

/** "OCTOBER MISSION" from the mission's first day ("2026-10-01"). */
export function missionOverline(startsOn: string): string {
  const m = /^\d{4}-(\d{2})/.exec(startsOn);
  const month = m ? MONTHS[Number(m[1]) - 1] : null;
  return month ? `${month} MISSION` : 'MISSION';
}

/** "2,000 KM AS A CLAN." */
export function missionHeadline(title: string): string {
  const t = title.trim().toUpperCase();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

export const MISSION_SEGMENTS = 10;

export type MissionFacts = {
  metric: MissionMetric;
  target: number;
  progress: number;
  contributors: number;
  my_share: number | null;
  is_done: boolean;
};

/** "1,240 km so far, from 96 runners. Your share: 46 km." */
export function missionLine(m: MissionFacts): string {
  const so = `${formatMissionAmount(m.progress, m.metric)} ${m.is_done ? 'done' : 'so far'}`;
  const from = m.contributors > 0 ? `, from ${grouped(m.contributors)} ${m.contributors === 1 ? 'runner' : 'runners'}` : '';
  const mine = m.my_share !== null ? ` Your share: ${formatMissionAmount(m.my_share, m.metric)}.` : '';
  return `${so}${from}.${mine}`;
}

/** The bar: whole segments out of ten, and its words ("1,240 of 2,000 km"). */
export function missionBar(m: MissionFacts): { value: number; max: number; label: string } {
  const value = Math.floor(missionFraction(m.progress, m.target) * MISSION_SEGMENTS);
  const unit = formatMissionAmount(m.target, m.metric);
  const progress = formatMissionAmount(m.progress, m.metric).replace(/ .*$/, '');
  return { value, max: MISSION_SEGMENTS, label: `${progress} of ${unit}` };
}

// Clash row --------------------------------------------------------------------------------------

export type ClanClashFacts = {
  title: string;
  opponent_name: string | null;
  stage: 'proposed' | 'upcoming' | 'live' | 'complete' | 'declined' | 'cancelled';
  our_wins: number;
  their_wins: number;
  event_count: number;
  decided_count: number;
  standing: string;
  next_position: number | null;
  next_sport_id: string | null;
  next_starts_at: string | null;
};

function sport(id: string | null): string {
  return id ? id.replace(/_/g, ' ') : 'next event';
}

/** OJORO CLASH row: "2-1" · "Fall Clash vs McGill" · "Event 4 of 6 · football, Sat" · LEADING. */
export function clashRow(c: ClanClashFacts, timeZone: string): { score: string; title: string; meta: string; badge: string; signal: boolean } {
  const score = `${c.our_wins}-${c.their_wins}`;
  const title = `${c.title} vs ${c.opponent_name ?? 'another clan'}`;
  let meta: string;
  if (c.stage === 'complete') meta = `Finished · ${c.decided_count} of ${c.event_count} events decided`;
  else if (c.stage === 'proposed') meta = `${c.event_count} events · waiting on an answer`;
  else if (c.next_position && c.next_starts_at)
    meta = `Event ${c.next_position} of ${c.event_count} · ${sport(c.next_sport_id)}, ${zonedParts(c.next_starts_at, timeZone).weekday}`;
  else meta = `${c.decided_count} of ${c.event_count} events decided`;
  return { score, title, meta, ...clashBadge(c) };
}

export function clashBadge(c: Pick<ClanClashFacts, 'stage' | 'standing' | 'our_wins' | 'their_wins'>): { badge: string; signal: boolean } {
  if (c.stage === 'proposed') return { badge: 'PROPOSED', signal: false };
  if (c.stage === 'declined') return { badge: 'DECLINED', signal: false };
  if (c.stage === 'cancelled') return { badge: 'CALLED OFF', signal: false };
  if (c.stage === 'complete') {
    if (c.our_wins > c.their_wins) return { badge: 'WON', signal: true };
    if (c.our_wins < c.their_wins) return { badge: 'LOST', signal: false };
    return { badge: 'DRAW', signal: false };
  }
  if (c.stage === 'upcoming') return { badge: 'UPCOMING', signal: false };
  if (c.standing === 'leading') return { badge: 'LEADING', signal: true };
  if (c.standing === 'trailing') return { badge: 'TRAILING', signal: false };
  return { badge: 'LEVEL', signal: false };
}

// Roles and leaderboard --------------------------------------------------------------------------

/** "You · welcomes new runners", "Sets the calendar and the rules". */
export function roleMeta(p: { is_me: boolean; role_note: string | null }): string | undefined {
  const parts = [p.is_me ? 'You' : null, p.role_note].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

/** "MOST RUNS · OCTOBER · CLAN ONLY". */
export function leaderboardLabel(now: Date, timeZone: string): string {
  const month = MONTHS[zonedParts(now, timeZone).month - 1] ?? '';
  return `MOST RUNS · ${month} · CLAN ONLY`;
}

/** "Chimdi O · you", "14 runs". */
export function leaderboardRow(r: { display_name: string; runs: number; is_me: boolean }): { name: string; runs: string } {
  return { name: r.is_me ? `${r.display_name} · you` : r.display_name, runs: `${r.runs} ${r.runs === 1 ? 'run' : 'runs'}` };
}

/** What INVITE shares. */
export function clanInviteText(name: string, code: string): string {
  return `Join ${name} on Ojoro with the code ${code}: ojoro://clan/join/${code}`;
}
