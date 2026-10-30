/**
 * Pure words and rules for HostPeople, HostAnnounce and HostMembership (docs/HOSTS_CONTRACT.md,
 * docs/HOSTS_OPS_CONTRACT.md). No React, no network: everything here runs in vitest.
 *
 * Counts are written as numbers, never adjectives. Status always has a word. Times are shown in the
 * program's time zone.
 */
import {
  daysLabel,
  formatMoney,
  HOST_ANNOUNCEMENT_MAX_LENGTH,
  HOST_NOTE_MAX_LENGTH,
  HOST_TAG_MAX_LENGTH,
  HOST_TAGS_MAX,
  last12Label,
  type HostAudience,
  type HostPeopleFilter,
} from '@ojoro/contracts';

import { zonedParts } from '../activities/format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "Oct 9". */
export function monthDay(at: string | number | Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${MONTHS[p.month - 1]} ${p.day}`;
}

/** "Thu Oct 1". */
export function weekdayMonthDay(at: string | number | Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${WEEKDAYS[p.weekday]} ${MONTHS[p.month - 1]} ${p.day}`;
}

/** Same calendar day in the time zone. */
export function sameDay(a: string | number | Date, b: string | number | Date, timeZone: string): boolean {
  const x = zonedParts(a, timeZone);
  const y = zonedParts(b, timeZone);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------

export type PeopleCounts = {
  all_count: number;
  played_count: number;
  regulars: number;
  members: number;
  new_count: number;
  drifting: number;
};

export const PEOPLE_FILTERS: readonly HostPeopleFilter[] = ['all', 'regulars', 'members', 'new', 'drifting'];

const FILTER_WORD: Record<HostPeopleFilter, string> = {
  all: 'All',
  regulars: 'Regulars',
  members: 'Members',
  new: 'New',
  drifting: 'Drifting',
};

/** The filter chips: "All 86", "Regulars 23" … (counts only once they've loaded). */
export function filterChips(counts: PeopleCounts | null | undefined): { key: HostPeopleFilter; label: string }[] {
  return PEOPLE_FILTERS.map((key) => {
    const n = counts ? filterCount(counts, key) : null;
    return { key, label: n == null ? FILTER_WORD[key] : `${FILTER_WORD[key]} ${n}` };
  });
}

export function filterCount(counts: PeopleCounts, key: HostPeopleFilter): number {
  switch (key) {
    case 'all':
      return counts.all_count;
    case 'regulars':
      return counts.regulars;
    case 'members':
      return counts.members;
    case 'new':
      return counts.new_count;
    case 'drifting':
      return counts.drifting;
  }
}

/** The divider over the list. */
export function listLabel(filter: HostPeopleFilter, searching: boolean): string {
  if (searching) return 'MATCHES';
  return {
    all: 'EVERYONE · MOST FIRST',
    regulars: 'REGULARS · MOST FIRST',
    members: 'MEMBERS',
    new: 'NEW THIS MONTH',
    drifting: 'DRIFTING',
  }[filter];
}

/** "86 people have played with you. 23 came at least twice this month." */
export function peopleHeadline(counts: PeopleCounts): string {
  const played = counts.played_count;
  if (played === 0) return 'Nobody has played with you yet. People show up here after their first session.';
  const first = `${played} ${plural(played, 'person has', 'people have')} played with you.`;
  const r = counts.regulars;
  const second = r === 0 ? 'Nobody came twice this month yet.' : `${r} came at least twice this month.`;
  return `${first} ${second}`;
}

/** When the filtered list is empty, in words that say what the filter means. */
export function emptyListLine(filter: HostPeopleFilter, query: string): string {
  if (query.trim()) return `Nobody matches “${query.trim()}”. Search by name or tag.`;
  return {
    all: 'Nobody has played with you yet.',
    regulars: 'No regulars yet. A regular came at least twice in the last 30 days.',
    members: 'No members right now.',
    new: 'Nobody new in the last 30 days.',
    drifting: 'Nobody is drifting. Everyone with 3 or more sessions came in the last 3 weeks.',
  }[filter];
}

export type PersonRowFacts = {
  days: number[];
  last12_count: number;
  last12_total: number;
  sessions_total: number;
  last_came_at: string | null;
  is_member: boolean;
  is_new: boolean;
  is_drifting: boolean;
  pass_kind: string | null;
  pass_label: string | null;
};

/** The line under the name: "Tue · Thu · 12 of the last 12", or when they last came. */
export function personMeta(p: PersonRowFacts, timeZone: string): string {
  if (p.sessions_total === 0) return 'Hasn’t played yet';
  if (p.is_drifting && p.last_came_at) return `Last came ${monthDay(p.last_came_at, timeZone)}`;
  const parts: string[] = [];
  const days = daysLabel(p.days);
  if (days) parts.push(days);
  if (p.last12_total > 0) parts.push(last12Label(p.last12_count, p.last12_total));
  else parts.push(`${p.sessions_total} ${plural(p.sessions_total, 'session', 'sessions')}`);
  return parts.join(' · ');
}

/** The badge word at the right of the row: the pass (ops ledger) or what they are here. */
export function personBadge(p: Pick<PersonRowFacts, 'pass_kind' | 'pass_label' | 'is_member' | 'is_new' | 'is_drifting'>): string | null {
  if (p.pass_kind) return PASS_BADGE[p.pass_kind] ?? (p.pass_label ? p.pass_label.toUpperCase() : null);
  if (p.is_member) return 'MEMBER';
  if (p.is_new) return 'NEW';
  if (p.is_drifting) return 'DRIFTING';
  return null;
}

const PASS_BADGE: Record<string, string> = {
  monthly: 'MEMBER',
  member: 'MEMBER',
  pack: '10-PACK',
  drop_in: 'DROP-IN',
  free: 'FREE',
  lapsed: 'LAPSED',
};

/** LAST 12 SESSIONS cells, oldest first: filled means came. */
export function attendanceCells(last12: readonly boolean[]): { came: boolean; key: string }[] {
  return last12.map((came, i) => ({ came, key: `${i}` }));
}

/** "Came to 9 of the last 12." */
export function attendanceSentence(last12: readonly boolean[]): string {
  if (last12.length === 0) return 'No sessions to count yet.';
  const came = last12.filter(Boolean).length;
  return `Came to ${came} of the last ${last12.length}.`;
}

/** Stats in the expanded person: 34 Sessions · APR First came · 1 No-show. */
export function personStats(
  p: { sessions_total: number; first_came_at: string | null; no_shows: number },
  timeZone: string,
): { value: string; label: string }[] {
  const first = p.first_came_at ? MONTHS[zonedParts(p.first_came_at, timeZone).month - 1]!.toUpperCase() : '–';
  return [
    { value: String(p.sessions_total), label: plural(p.sessions_total, 'Session', 'Sessions') },
    { value: first, label: 'First came' },
    { value: String(p.no_shows), label: plural(p.no_shows, 'No-show', 'No-shows') },
  ];
}

/** PASS line: "Monthly · renews Nov 1", "10-pack · 4 sessions left", or what's known without one. */
export function passLine(
  p: {
    pass_label: string | null;
    pass_renews_on: string | null;
    pass_sessions_left: number | null;
    is_member: boolean;
    member_until: string | null;
  },
  timeZone: string,
): string {
  if (p.pass_label) {
    const parts = [p.pass_label];
    const lower = p.pass_label.toLowerCase();
    if (p.pass_renews_on && !lower.includes('renew')) parts.push(`renews ${dateOnlyMonthDay(p.pass_renews_on)}`);
    if (p.pass_sessions_left != null && !lower.includes('left')) {
      parts.push(`${p.pass_sessions_left} ${plural(p.pass_sessions_left, 'session', 'sessions')} left`);
    }
    return parts.join(' · ');
  }
  if (p.is_member) return p.member_until ? `Member until ${monthDay(p.member_until, timeZone)}` : 'Member';
  return 'No pass. Pays per session.';
}

/** A `date` column ('2026-11-01') as "Nov 1", without shifting it through a time zone. */
export function dateOnlyMonthDay(date: string): string {
  const [, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d ?? 1}`;
}

/** Tags are shown in caps; the server stores them lowercased. */
export function tagWord(tag: string): string {
  return tag.toUpperCase();
}

const TAG_RE = /^[\p{L}\p{N} -]+$/u;

/**
 * Adding a tag from the input. Returns the new list, or the words for why not. Mirrors the server
 * (`tag_invalid`): up to 8, each 1–24 letters, digits, spaces or hyphens.
 */
export function addTag(tags: readonly string[], input: string): { tags: string[] } | { error: string } {
  const tag = input.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!tag) return { error: 'Write the tag first.' };
  if (tag.length > HOST_TAG_MAX_LENGTH) return { error: `Keep a tag to ${HOST_TAG_MAX_LENGTH} characters.` };
  if (!TAG_RE.test(tag)) return { error: 'Tags use letters, numbers, spaces and hyphens.' };
  if (tags.includes(tag)) return { tags: [...tags] };
  if (tags.length >= HOST_TAGS_MAX) return { error: `Up to ${HOST_TAGS_MAX} tags. Remove one first.` };
  return { tags: [...tags, tag].sort() };
}

export function removeTag(tags: readonly string[], tag: string): string[] {
  return tags.filter((t) => t !== tag);
}

/** Private note validation: words, or null when it can be saved. */
export function noteError(body: string): string | null {
  if (body.length > HOST_NOTE_MAX_LENGTH) {
    return `Keep notes to ${HOST_NOTE_MAX_LENGTH} characters. This is ${body.length}.`;
  }
  return null;
}

/** "6 regulars haven't been in for 3 weeks or more." */
export function driftingHeadline(n: number): string {
  return `${n} ${plural(n, 'regular hasn’t', 'regulars haven’t')} been in for 3 weeks or more.`;
}

/** "Send them next Tuesday's link …", naming the next session's day. */
export function driftingBody(nextSessionAt: string | null, now: Date, timeZone: string): string {
  const when = nextSessionAt ? sessionDayWord(nextSessionAt, now, timeZone) : null;
  const link = when ? `${when}’s link` : 'the next session’s link';
  return `Send them ${link} with a line from you. No streaks, no guilt, just the invite.`;
}

/** "tonight", "tomorrow", "Tuesday" or "next Tuesday" for a session start. */
export function sessionDayWord(at: string, now: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  const n = zonedParts(now, timeZone);
  const diff = Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(n.year, n.month - 1, n.day)) / 86_400_000);
  if (diff === 0) return p.hour >= 17 ? 'tonight' : 'today';
  if (diff === 1) return 'tomorrow';
  const name = WEEKDAY_NAMES[p.weekday]!;
  return diff < 7 ? name : `next ${name}`;
}

/** After INVITE THEM BACK. */
export function inviteBackResult(sent: number, skipped: number): string {
  if (sent === 0 && skipped > 0) return 'They were all invited in the last week. One invite a week is enough.';
  const head = `Invited ${sent} ${plural(sent, 'person', 'people')} back.`;
  return skipped > 0 ? `${head} ${skipped} already had one this week.` : head;
}

// ---------------------------------------------------------------------------------------------
// Announce
// ---------------------------------------------------------------------------------------------

export const AUDIENCES: readonly HostAudience[] = ['session', 'waitlist', 'members', 'everyone'];

export type AudienceCounts = {
  session_count: number;
  waitlist_count: number;
  members_count: number;
  everyone_count: number;
};

/** "Tonight's 14", "Waitlist 3", "All members 18", "Everyone 86". */
export function audienceLabel(
  key: HostAudience,
  counts: AudienceCounts,
  startsAt: string,
  now: Date,
  timeZone: string,
): string {
  switch (key) {
    case 'session': {
      const day = sessionDayWord(startsAt, now, timeZone);
      return `${capitalizeFirst(day)}’s ${counts.session_count}`;
    }
    case 'waitlist':
      return `Waitlist ${counts.waitlist_count}`;
    case 'members':
      return `All members ${counts.members_count}`;
    case 'everyone':
      return `Everyone ${counts.everyone_count}`;
  }
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Toggle one audience; the order stays the designed order. */
export function toggleAudience(selected: readonly HostAudience[], key: HostAudience): HostAudience[] {
  const on = new Set(selected);
  if (on.has(key)) on.delete(key);
  else on.add(key);
  return AUDIENCES.filter((a) => on.has(a));
}

/** The commit label: SEND TO 17, or what's missing. */
export function sendLabel(count: number | null, picked: number): string {
  if (picked === 0) return 'PICK WHO GETS IT';
  if (count == null) return 'SEND';
  if (count === 0) return 'NOBODY IN THAT GROUP';
  return `SEND TO ${count}`;
}

/** "92 of 280 characters". */
export function characterCount(body: string, max = HOST_ANNOUNCEMENT_MAX_LENGTH): string {
  return `${body.length} of ${max} characters`;
}

/** Message validation, in words; null when it can be sent. */
export function messageError(body: string, max = HOST_ANNOUNCEMENT_MAX_LENGTH): string | null {
  if (!body.trim()) return 'Write the message first.';
  if (body.length > max) return `Keep it to ${max} characters. This is ${body.length}.`;
  return null;
}

/** "PINNED · FROM ADE, YOUR HOST". */
export function pinnedOverline(authorName: string, pinned: boolean): string {
  const first = authorName.trim().split(/\s+/)[0] ?? authorName;
  return `${pinned ? 'PINNED · ' : ''}FROM ${first.toUpperCase()}, YOUR HOST`;
}

/** Under the preview: "Tuesday 7-a-side · tonight 7:30". */
export function previewWhen(sessionName: string, startsAt: string, now: Date, timeZone: string): string {
  const p = zonedParts(startsAt, timeZone);
  const h = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const time = `${h}:${p.minute.toString().padStart(2, '0')}`;
  return `${sessionName} · ${sessionDayWord(startsAt, now, timeZone)} ${time}`;
}

/** "For logistics only. Hosts get 2 per session …" with what's left. */
export function notifyDescription(pushesLeft: number, perSession: number): string {
  const base = `For logistics only. Hosts get ${perSession} per session, so people keep them switched on.`;
  if (pushesLeft <= 0) return `${base} Both are used for this session; it still goes to the chat.`;
  if (pushesLeft < perSession) return `${base} ${pushesLeft} left for this session.`;
  return base;
}

/** SENT BEFORE meta: "Thu Oct 1 · Mixed 5s", or "· everyone" when it went to everyone. */
export function historyMeta(
  row: { created_at: string; session_name: string | null; audiences: readonly HostAudience[] },
  timeZone: string,
): string {
  const date = weekdayMonthDay(row.created_at, timeZone);
  const who = row.audiences.includes('everyone') ? 'everyone' : row.session_name;
  return who ? `${date} · ${who}` : date;
}

/** "14 / 14 READ". */
export function readCount(read: number, recipients: number): string {
  return `${read} / ${recipients} READ`;
}

/** The chat link under SENT BEFORE: "23 new since this morning". */
export function chatNewLine(n: number): string {
  if (n === 0) return 'Nothing new since this morning';
  return `${n} new since this morning`;
}

// ---------------------------------------------------------------------------------------------
// Money (amounts are integer cents + currency; words for lines and payouts are in @ojoro/contracts)
// ---------------------------------------------------------------------------------------------

/** NEXT PAYOUT · FRIDAY OCT 9 (from a local YYYY-MM-DD date). */
export function payoutOverline(date: string | null): string {
  if (!date) return 'NEXT PAYOUT';
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  const weekday = WEEKDAY_NAMES[d.getUTCDay()]!.toUpperCase();
  return `NEXT PAYOUT · ${weekday} ${dateOnlyMonthDay(date).toUpperCase()}`;
}

/** "It lands in your bank on Friday." only once a provider is connected; until then, what's true. */
export function payoutLands(date: string | null, connected: boolean): string {
  if (!connected) return 'Nothing is paid out until payments are connected. These are the records so far.';
  if (!date) return '';
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  return `It lands in your bank on ${WEEKDAY_NAMES[d.getUTCDay()]}.`;
}

/** Past payout date in display caps: "OCT 2". */
export function payoutDate(date: string): string {
  return dateOnlyMonthDay(date).toUpperCase();
}

export type RefundChoice = 'full' | 'partial' | 'keep';

/** "Renewed Oct 1 for $35. Cancelled Oct 4. Hasn't played since." */
export function refundContext(
  d: {
    charge_kind: string;
    paid_at: string | null;
    cancelled_at: string | null;
    last_played_at: string | null;
    charge_amount_cents: number;
    currency: string;
  },
  timeZone: string,
): string {
  const parts: string[] = [];
  const amount = formatMoney(d.charge_amount_cents, d.currency);
  if (d.paid_at) {
    const verb = d.charge_kind === 'monthly_renewal' ? 'Renewed' : 'Paid';
    parts.push(`${verb} ${monthDay(d.paid_at, timeZone)} for ${amount}.`);
  } else parts.push(`Paid ${amount}.`);
  if (d.cancelled_at) parts.push(`Cancelled ${monthDay(d.cancelled_at, timeZone)}.`);
  if (d.cancelled_at || d.paid_at) {
    const since = d.cancelled_at ?? d.paid_at!;
    if (!d.last_played_at || new Date(d.last_played_at) < new Date(since)) parts.push('Hasn’t played since.');
    else parts.push(`Last played ${monthDay(d.last_played_at, timeZone)}.`);
  }
  return parts.join(' ');
}

/** "monthly refund", "drop-in refund". */
export function refundKind(chargeKind: string): string {
  return (
    { drop_in: 'drop-in refund', pack: '10-pack refund', monthly: 'monthly refund', monthly_renewal: 'monthly refund' } as Record<
      string,
      string
    >
  )[chargeKind] ?? 'refund';
}

/**
 * Validate a host-typed partial amount ("25" or "25.50") into cents. Mirrors the server
 * (`refund_amount_invalid`): more than 0 and less than what's refundable.
 */
export function parseRefundAmount(input: string, refundableCents: number): { cents: number } | { error: string } {
  const t = input.trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { error: 'Write an amount, like 25 or 25.50.' };
  const cents = Math.round(Number(t) * 100);
  if (cents <= 0) return { error: 'A refund is more than 0. To give nothing back, pick KEEP IT.' };
  if (cents >= refundableCents) return { error: 'That’s all of it. Pick REFUND ALL instead.' };
  return { cents };
}

/** Payout status in words (never colour only). */
export function payoutStatusWord(status: string): string {
  return ({ paid: 'PAID', scheduled: 'SCHEDULED', failed: 'DIDN’T GO THROUGH' } as Record<string, string>)[status] ??
    status.replace(/_/g, ' ').toUpperCase();
}

/** "17 renew on Nov 1. 1 cancelled. Members come to 2.4 sessions a week, drop-ins to 0.8." */
export function membersSentence(m: {
  count: number;
  renewing_count: number;
  renews_on: string | null;
  cancelled_count: number;
  member_sessions_per_week: number | null;
  drop_in_sessions_per_week: number | null;
}): string {
  if (m.count === 0 && m.cancelled_count === 0) return 'No members yet. A monthly pass makes someone a member.';
  const parts: string[] = [];
  if (m.renews_on) parts.push(`${m.renewing_count} renew on ${dateOnlyMonthDay(m.renews_on)}.`);
  if (m.cancelled_count > 0) parts.push(`${m.cancelled_count} cancelled.`);
  const mw = m.member_sessions_per_week;
  const dw = m.drop_in_sessions_per_week;
  if (mw != null && dw != null) parts.push(`Members come to ${fmt1(mw)} sessions a week, drop-ins to ${fmt1(dw)}.`);
  else if (mw != null) parts.push(`Members come to ${fmt1(mw)} sessions a week.`);
  return parts.join(' ');
}

function fmt1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

/** The service fee line label: always marked as a placeholder until the fee is decided. */
export const SERVICE_FEE_LABEL = 'Ojoro service fee (placeholder)';
