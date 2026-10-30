/**
 * Step 6 (Host OS operations, PRD §13, §16.2, §17) client contract helpers: passes and memberships,
 * the provider-agnostic money ledger (charges, refunds, payouts), refund decisions, per-person payment
 * status, league / season operations, insights and the CSV export. The full contract is
 * docs/HOSTS_OPS_CONTRACT.md; table and enum shapes are generated into ./database.types.ts. The jsonb
 * reads (`host_money_view`, `host_league_view`, `host_insights`, …) are typed here.
 *
 * NO MONEY MOVES: no payments provider is chosen yet (`provider` is always 'none'). The Ojoro service
 * fee is a PLACEHOLDER computed server-side; never compute or hard-code it in the app.
 *
 * Pure TypeScript with no runtime dependencies.
 */
import type { Database } from './database.types';
import type { RealtimeSubscription } from './slice01';
import type { WithNull } from './competition';

type Functions = Database['public']['Functions'];
type Enums = Database['public']['Enums'];
type RpcName = keyof Functions;
type Row<F extends RpcName> = Functions[F]['Returns'] extends (infer R)[] ? R : never;

/** Every Host OS operations RPC the client may call. Host-side ones check the caller runs the program. */
export const hostOpsRpcs = [
  // HostMembership
  'host_money_view',
  'host_service_fee_policy',
  'create_host_pass',
  'update_host_pass',
  'archive_host_pass',
  'grant_host_pass',
  'decide_host_refund',
  'undo_host_refund_decision',
  // HostRoster / HostPeople
  'host_session_payments',
  'host_people_passes',
  'mark_paid_at_field',
  // Participant side
  'request_host_refund',
  'cancel_host_membership',
  // HostSeason
  'host_program_leagues',
  'host_league_view',
  'host_league_standings',
  'create_host_league',
  'upsert_host_league_team',
  'set_host_league_member',
  'generate_host_league_fixtures',
  'schedule_host_league_fixture',
  'reschedule_host_league_fixture',
  'submit_league_result',
  'confirm_league_result',
  'dispute_league_result',
  'ask_league_referee',
  'respond_league_referee',
  'clear_league_referee',
  'set_league_fixture_in',
  'check_in_league_fixture',
  // HostInsights
  'host_insights',
  'host_insights_csv',
] as const satisfies readonly RpcName[];

/** Host OS operations RPCs that take `p_idempotency_key` (one uuid per intention, reused on retry). */
export const hostOpsIdempotentRpcs = [
  'create_host_pass',
  'grant_host_pass',
  'mark_paid_at_field',
  'decide_host_refund',
  'request_host_refund',
  'cancel_host_membership',
  'create_host_league',
  'generate_host_league_fixtures',
  'schedule_host_league_fixture',
  'submit_league_result',
  'confirm_league_result',
  'ask_league_referee',
] as const satisfies readonly RpcName[];

/** Stable error codes added by the Host OS operations backend (also part of `ojoroErrorCodes`). */
export const hostOpsErrorCodes = [
  'pass_not_found',
  'pass_invalid',
  'price_invalid',
  'already_member',
  'charge_not_found',
  'refund_not_allowed',
  'membership_not_found',
  'refund_request_not_found',
  'refund_already_decided',
  'refund_amount_invalid',
  'refund_undo_closed',
  'audit_immutable',
  'league_not_found',
  'league_invalid',
  'team_not_found',
  'fixture_not_found',
  'fixture_closed',
  'fixture_not_played',
  'not_on_team',
  'not_captain',
  'result_not_agreed',
  'referee_unavailable',
] as const;

/** No payments provider is connected yet (owner decision pending). */
export const HOST_PAYMENTS_PROVIDER = 'none' as const;
/** A refund decision can be undone for this many minutes while its refund is still pending. */
export const HOST_REFUND_UNDO_MINUTES = 10;
/** HostInsights' window, in days, and the people-per-week series length. */
export const HOST_INSIGHTS_DAYS = 30;
export const HOST_INSIGHTS_WEEKS = 12;
/** Longest note on a refund request. */
export const HOST_REFUND_NOTE_MAX_LENGTH = 280;

// Enums --------------------------------------------------------------------------------------------------

export type HostPassKind = Enums['host_pass_kind'];
export type HostMembershipStatus = Enums['host_membership_status'];
export type HostChargeKind = Enums['host_charge_kind'];
export type HostChargeStatus = Enums['host_charge_status'];
export type HostChargeMethod = Enums['host_charge_method'];
export type HostRefundStatus = Enums['host_refund_status'];
export type HostRefundReason = Enums['host_refund_reason'];
export type HostRefundRequestStatus = Enums['host_refund_request_status'];
export type HostRefundDecision = Enums['host_refund_decision'];
export type HostPayoutStatus = Enums['host_payout_status'];
export type HostPaymentState = Enums['host_payment_state'];
export type HostLeagueStatus = Enums['host_league_status'];
export type HostFixtureStatus = Enums['host_fixture_status'];
export type HostRefereeStatus = Enums['host_referee_status'];
export type HostLeagueResultSource = Enums['host_league_result_source'];

// Rows from table-returning RPCs --------------------------------------------------------------------------

export type HostSessionPayment = WithNull<
  Row<'host_session_payments'>,
  'amount_cents' | 'method' | 'paid_at' | 'pass_name' | 'sessions_left' | 'refund_cents' | 'charge_id'
>;
export type HostPeoplePass = WithNull<Row<'host_people_passes'>, 'period_ends_at' | 'sessions_left'>;
export type HostProgramLeague = WithNull<Row<'host_program_leagues'>, 'current_round' | 'current_round_plays_on'>;
export type HostStanding = Row<'host_league_standings'>;

// jsonb reads -----------------------------------------------------------------------------------------------

export interface HostOpsPerson {
  id: string;
  display_name: string;
  avatar_path: string | null;
}

export interface HostFeePolicy {
  placeholder: true;
  rate_bps: number;
  rounding_cents: number;
  basis: 'gross_charges_per_payout';
}

/** "Drop-ins · 22 × $8 … $176". */
export interface HostMoneyLine {
  kind: HostChargeKind;
  count: number;
  unit_cents: number;
  amount_cents: number;
}

export interface HostMoneyTotals {
  currency: string;
  gross_cents: number;
  refunds_cents: number;
  refund_count: number;
  /** PLACEHOLDER fee, computed server-side. */
  fee_cents: number;
  net_cents: number;
  pass_count: number;
  session_count: number;
  lines: HostMoneyLine[];
}

export interface HostNextPayout extends HostMoneyTotals {
  period_start: string;
  period_end: string;
  /** Local date (YYYY-MM-DD) the payout lands. */
  pays_on: string;
  status: 'upcoming';
}

export interface HostRefundDecisionItem {
  request_id: string;
  person: HostOpsPerson;
  note: string | null;
  requested_at: string;
  charge_id: string;
  charge_kind: HostChargeKind;
  charge_amount_cents: number;
  refundable_cents: number;
  currency: string;
  paid_at: string | null;
  pass_name: string | null;
  membership_id: string | null;
  cancelled_at: string | null;
  period_ends_at: string | null;
  last_played_at: string | null;
  /** A partial amount to offer (the unused part of the period, whole units), or null. */
  suggested_partial_cents: number | null;
}

/** What decide_host_refund / undo_host_refund_decision return. */
export interface HostDecisionState {
  request_id: string;
  status: HostRefundRequestStatus;
  decision: HostRefundDecision | null;
  decided_at: string | null;
  refund_id: string | null;
  refund_cents: number;
  refund_status: HostRefundStatus | null;
  currency: string;
  provider: typeof HOST_PAYMENTS_PROVIDER;
  membership_id: string | null;
  membership_status: HostMembershipStatus | null;
  membership_ends_at: string | null;
  undo_until: string | null;
}

export interface HostPassItem {
  id: string;
  kind: HostPassKind;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  sessions_included: number | null;
  valid_days: number | null;
  series_id: string | null;
  count_kind: 'sold_this_month' | 'active' | 'members' | 'in_next_session';
  count: number | null;
}

export interface HostMembersBlock {
  count: number;
  renewing_count: number;
  renews_on: string | null;
  cancelled_count: number;
  faces: HostOpsPerson[];
  member_sessions_per_week: number | null;
  drop_in_sessions_per_week: number | null;
}

export interface HostPastPayout {
  id: string;
  pays_on: string;
  period_start: string;
  period_end: string;
  net_cents: number;
  gross_cents: number;
  refunds_cents: number;
  fee_cents: number;
  currency: string;
  session_count: number;
  refund_count: number;
  note: string | null;
  status: HostPayoutStatus;
  paid_at: string | null;
  lines: HostMoneyLine[];
}

/** `host_money_view(p_program_id)`: Memberships & payments. Hosts only. */
export interface HostMoneyView {
  program_id: string;
  program_name: string;
  time_zone: string;
  provider: typeof HOST_PAYMENTS_PROVIDER;
  payments_connected: false;
  fee_policy: HostFeePolicy;
  next_payout: HostNextPayout;
  decisions: HostRefundDecisionItem[];
  /** Decisions made in the last 10 minutes (for UNDO), with the person. */
  recent_decisions: (HostDecisionState & { person: HostOpsPerson })[];
  passes: HostPassItem[];
  members: HostMembersBlock;
  past_payouts: HostPastPayout[];
}

export interface HostTeamRef {
  id: string;
  name: string;
  crew_id: string | null;
  captain_id: string | null;
}

export interface HostFixtureResultState {
  fixture_id: string;
  status: 'waiting' | 'one_sent' | 'agreed' | 'differ' | 'disputed' | 'confirmed';
  home_goals: number | null;
  away_goals: number | null;
  submissions: { team_id: string; home_goals: number; away_goals: number; submitted_by: string; created_at: string }[];
  confirmed_at: string | null;
  source: HostLeagueResultSource | null;
}

export interface HostFixtureReferee {
  fixture_id: string;
  referee: HostOpsPerson | null;
  referee_status: HostRefereeStatus | null;
  refs_count: number | null;
  asked_at: string | null;
}

export interface HostResultToConfirm {
  fixture_id: string;
  round: number;
  kicks_off_at: string;
  rescheduled_from: string | null;
  home: HostTeamRef;
  away: HostTeamRef;
  result: HostFixtureResultState;
  players_in: number;
  checked_in: number;
}

export interface HostRoundFixture {
  fixture_id: string;
  kicks_off_at: string;
  pitch: string | null;
  status: HostFixtureStatus;
  home: HostTeamRef;
  away: HostTeamRef;
  home_in: number;
  away_in: number;
  home_checked_in: number;
  away_checked_in: number;
  referee: HostFixtureReferee;
  /** Hosts only, when nobody is refereeing: the most experienced free referee. */
  referee_suggestion: { person: HostOpsPerson; refs_count: number } | null;
}

/** `host_league_view(p_league_id)`: League operations. */
export interface HostLeagueView {
  league: {
    id: string;
    program_id: string;
    program_name: string;
    time_zone: string;
    name: string;
    sport_id: string;
    venue_label: string | null;
    status: HostLeagueStatus;
    rounds_total: number;
    meetings: number;
    starts_on: string;
    min_players: number;
    points_win: number;
    points_draw: number;
    tie_breaks: ['points', 'goal_difference', 'goals_scored'];
    team_count: number;
    player_count: number;
    free_agent_count: number;
    fixture_count: number;
  };
  is_host: boolean;
  /** Hosts only (empty for everyone else). */
  to_confirm: HostResultToConfirm[];
  standings: HostStanding[];
  round: { number: number; plays_on: string; fixtures: HostRoundFixture[] } | null;
}

export interface HostInsightsWeek {
  /** Local Monday (YYYY-MM-DD). */
  week_start: string;
  people: number;
  sessions: number;
  skipped: { session_id: string; starts_at: string; series_name: string | null; reason: string | null }[];
}

export interface HostSeriesInsight {
  series_id: string;
  name: string;
  sessions: number;
  capacity: number;
  /** 0..1 */
  fill_rate: number | null;
  no_show_rate: number | null;
  typical_in: number | null;
  typical_waitlist: number | null;
  median_fill_seconds: number | null;
  first_timers: number;
  first_timer_return_rate: number | null;
}

/** `host_insights(p_program_id, p_days)`: Insights & revenue. Rates are 0..1. Hosts only. */
export interface HostInsights {
  program_id: string;
  program_name: string;
  time_zone: string;
  days: number;
  from: string;
  to: string;
  ojoro_hours: number;
  ojoro_hours_before: number;
  sessions: number;
  show_up_rate: number | null;
  show_up_rate_before: number | null;
  return_rate: number | null;
  return_rate_before: number | null;
  fill: {
    series_id: string;
    series_name: string;
    repeat_days: number[];
    filled_sessions: number;
    median_seconds: number;
    median_seconds_before: number | null;
  } | null;
  payout_cents: number;
  payout_cents_before: number;
  currency: string;
  weeks: HostInsightsWeek[];
  by_series: HostSeriesInsight[];
  revenue: HostMoneyTotals;
  fee_policy: HostFeePolicy;
  provider: typeof HOST_PAYMENTS_PROVIDER;
  payments_connected: false;
}

// Words ------------------------------------------------------------------------------------------------------

/** "$8", "$1,544", "$12.50", "−$36" (a true minus sign). Whole units drop the cents. */
export function formatMoney(cents: number, currency = 'CAD'): string {
  const sign = cents < 0 ? '−' : '';
  const abs = Math.abs(Math.round(cents));
  const symbol = currency === 'CAD' || currency === 'USD' ? '$' : `${currency} `;
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = abs % 100;
  return `${sign}${symbol}${whole}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}

const lineNames: Record<HostChargeKind, [string, string]> = {
  drop_in: ['Drop-in', 'Drop-ins'],
  pack: ['10-pack', '10-packs'],
  monthly: ['Membership', 'Memberships'],
  monthly_renewal: ['Monthly renewal', 'Monthly renewals'],
};

/** "Drop-ins · 22 × $8". Pass `packName` when the pack isn't a 10-pack. */
export function moneyLineLabel(line: HostMoneyLine, currency = 'CAD', packName?: string): string {
  const [one, many] = lineNames[line.kind];
  const name = line.kind === 'pack' && packName ? packName : line.count === 1 ? one : many;
  return `${name} · ${line.count} × ${formatMoney(line.unit_cents, currency)}`;
}

/** "From 4 sessions and 7 passes this week." */
export function payoutSourceSentence(t: Pick<HostMoneyTotals, 'session_count' | 'pass_count'>): string {
  const parts: string[] = [];
  if (t.session_count > 0) parts.push(`${t.session_count} ${t.session_count === 1 ? 'session' : 'sessions'}`);
  if (t.pass_count > 0) parts.push(`${t.pass_count} ${t.pass_count === 1 ? 'pass' : 'passes'}`);
  if (parts.length === 0) return 'Nothing in this payout yet.';
  return `From ${parts.join(' and ')} this week.`;
}

/** "5 sessions · 1 refund", "4 sessions · rain-out on Thursday". */
export function pastPayoutMeta(p: Pick<HostPastPayout, 'session_count' | 'refund_count' | 'note'>): string {
  const parts = [`${p.session_count} ${p.session_count === 1 ? 'session' : 'sessions'}`];
  if (p.refund_count > 0) parts.push(`${p.refund_count} ${p.refund_count === 1 ? 'refund' : 'refunds'}`);
  if (p.note) parts.push(p.note);
  return parts.join(' · ');
}

/** "$8" or "FREE". */
export function passPriceLabel(pass: Pick<HostPassItem, 'price_cents' | 'currency' | 'kind'>): string {
  return pass.kind === 'free' || pass.price_cents === 0 ? 'FREE' : formatMoney(pass.price_cents, pass.currency);
}

/** "41 SOLD THIS MONTH", "7 ACTIVE", "18 MEMBERS", "9 IN THIS SUNDAY" (label, uppercase). */
export function passCountLabel(pass: Pick<HostPassItem, 'count_kind' | 'count'>, nextSessionDay?: string): string {
  const n = pass.count ?? 0;
  switch (pass.count_kind) {
    case 'sold_this_month':
      return `${n} SOLD THIS MONTH`;
    case 'active':
      return `${n} ACTIVE`;
    case 'members':
      return `${n} ${n === 1 ? 'MEMBER' : 'MEMBERS'}`;
    case 'in_next_session':
      return nextSessionDay ? `${n} IN THIS ${nextSessionDay.toUpperCase()}` : `${n} IN NEXT SESSION`;
  }
}

/** What the host sees after deciding (the person hears it from Ojoro). */
export function decisionSentence(
  state: Pick<HostDecisionState, 'decision' | 'refund_cents' | 'currency' | 'membership_id'>,
  firstName: string,
  endsOn?: string,
): string {
  if (state.decision === 'keep') {
    return state.membership_id && endsOn
      ? `Kept. ${firstName} has been told it stays active to ${endsOn}, so they can still come.`
      : `Kept. ${firstName} has been told.`;
  }
  const refunded = `Refunded ${formatMoney(state.refund_cents, state.currency)}. ${firstName} has been told`;
  return state.membership_id ? `${refunded} and the membership ends today.` : `${refunded}.`;
}

/** 0.91 → "91%". Null → "–". */
export function percent(rate: number | null): string {
  return rate == null ? '–' : `${Math.round(rate * 100)}%`;
}

/** Change in points between two rates: "+3 pts", "−2 pts", "Same". Null when either is missing. */
export function pointsChange(now: number | null, before: number | null): string | null {
  if (now == null || before == null) return null;
  const d = Math.round(now * 100) - Math.round(before * 100);
  if (d === 0) return 'Same';
  return `${d > 0 ? '+' : '−'}${Math.abs(d)} pts`;
}

/** Relative change: "+12%", "−4%", "Same". Null when there's nothing before. */
export function relativeChange(now: number, before: number | null): string | null {
  if (before == null || before === 0) return null;
  const d = Math.round(((now - before) / before) * 100);
  if (d === 0) return 'Same';
  return `${d > 0 ? '+' : '−'}${Math.abs(d)}%`;
}

/** Fill time for the tile: "1 DAY", "2 DAYS", "26 HOURS", "45 MIN". */
export function fillTimeLabel(seconds: number): string {
  const hours = seconds / 3600;
  if (hours >= 36) {
    const days = Math.round(hours / 24);
    return `${days} ${days === 1 ? 'DAY' : 'DAYS'}`;
  }
  if (hours >= 20) return '1 DAY';
  if (hours >= 1) {
    const h = Math.round(hours);
    return `${h} ${h === 1 ? 'HOUR' : 'HOURS'}`;
  }
  return `${Math.max(1, Math.round(seconds / 60))} MIN`;
}

/** "4 hours faster" / "2 hours slower" / null, comparing fill times. */
export function fillTimeChange(now: number, before: number | null): string | null {
  if (before == null) return null;
  const h = Math.round((before - now) / 3600);
  if (h === 0) return null;
  return `${Math.abs(h)} ${Math.abs(h) === 1 ? 'hour' : 'hours'} ${h > 0 ? 'faster' : 'slower'}`;
}

/** "+4", "0", "−3" for goal difference (tabular numerals in the UI). */
export function goalDifferenceLabel(gd: number): string {
  if (gd > 0) return `+${gd}`;
  if (gd < 0) return `−${Math.abs(gd)}`;
  return '0';
}

/** Readiness badge: "7 + 8 IN", or "6 OF 7 · CONCORDIA" when a side is short of `minPlayers`. */
export function fixtureReadiness(
  f: Pick<HostRoundFixture, 'home_in' | 'away_in' | 'home' | 'away'>,
  minPlayers: number,
  shortName: (teamName: string) => string = (n) => n.split(' ')[0] ?? n,
): { label: string; short: boolean; shortTeamId: string | null } {
  const sides = [
    { team: f.home, n: f.home_in },
    { team: f.away, n: f.away_in },
  ].filter((s) => s.n < minPlayers);
  sides.sort((a, b) => a.n - b.n);
  const short = sides[0]?.team ?? null;
  if (short) {
    const n = short.id === f.home.id ? f.home_in : f.away_in;
    return { label: `${n} OF ${minPlayers} · ${shortName(short.name).toUpperCase()}`, short: true, shortTeamId: short.id };
  }
  return { label: `${f.home_in} + ${f.away_in} IN`, short: false, shortTeamId: null };
}

/** A file name for DOWNLOAD CSV: "plateau-pickup-2026-10-30.csv". */
export function insightsCsvFileName(programName: string, date: Date = new Date()): string {
  const slug = programName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'ojoro'}-${date.toISOString().slice(0, 10)}.csv`;
}

// Realtime ----------------------------------------------------------------------------------------------------

/** HostMembership (and HostRoster's payment badges): the program's ledger. Refetch hints only. */
export function hostMoneySubscription(programId: string): RealtimeSubscription {
  const filter = `program_id=eq.${programId}`;
  return {
    channel: `host-money:${programId}`,
    changes: [
      { event: '*', schema: 'public', table: 'host_charges', filter },
      { event: '*', schema: 'public', table: 'host_refunds', filter },
      { event: '*', schema: 'public', table: 'host_refund_requests', filter },
      { event: '*', schema: 'public', table: 'host_memberships', filter },
      { event: '*', schema: 'public', table: 'host_passes', filter },
    ],
  };
}

/** HostSeason: fixtures, confirmed results and captains' scores of one league. Refetch hints only. */
export function hostLeagueSubscription(leagueId: string): RealtimeSubscription {
  const filter = `league_id=eq.${leagueId}`;
  return {
    channel: `host-league:${leagueId}`,
    changes: [
      { event: '*', schema: 'public', table: 'host_league_fixtures', filter },
      { event: 'INSERT', schema: 'public', table: 'host_league_results', filter },
      { event: '*', schema: 'public', table: 'host_league_result_submissions' },
    ],
  };
}
