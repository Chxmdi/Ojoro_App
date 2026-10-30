import { describe, expect, it } from 'vitest';

import {
  addTag,
  attendanceCells,
  attendanceSentence,
  audienceLabel,
  characterCount,
  chatNewLine,
  dateOnlyMonthDay,
  driftingBody,
  driftingHeadline,
  emptyListLine,
  filterChips,
  filterCount,
  historyMeta,
  inviteBackResult,
  listLabel,
  membersSentence,
  messageError,
  monthDay,
  nextSession,
  noteError,
  notifyDescription,
  parseRefundAmount,
  passLine,
  payoutDate,
  payoutLands,
  payoutOverline,
  payoutStatusWord,
  peopleHeadline,
  personBadge,
  personMeta,
  personStats,
  pickAnnounceSession,
  pinnedOverline,
  previewWhen,
  readCount,
  refundContext,
  refundKind,
  removeTag,
  sameDay,
  sendLabel,
  sessionDayWord,
  tagWord,
  toggleAudience,
  weekdayMonthDay,
} from './peopleLogic';

const TZ = 'America/Toronto';
// Tuesday Oct 6 2026, 3 PM in Montréal.
const NOW = new Date('2026-10-06T19:00:00Z');

const counts = { all_count: 86, played_count: 86, regulars: 23, members: 18, new_count: 9, drifting: 6 };

describe('people filters and headline', () => {
  it('labels chips with counts once loaded', () => {
    expect(filterChips(counts).map((c) => c.label)).toEqual([
      'All 86',
      'Regulars 23',
      'Members 18',
      'New 9',
      'Drifting 6',
    ]);
    expect(filterChips(null)[0]).toEqual({ key: 'all', label: 'All' });
    expect(filterCount(counts, 'new')).toBe(9);
  });

  it('writes the headline in counts', () => {
    expect(peopleHeadline(counts)).toBe('86 people have played with you. 23 came at least twice this month.');
    expect(peopleHeadline({ ...counts, played_count: 1, regulars: 0 })).toBe(
      '1 person has played with you. Nobody came twice this month yet.',
    );
    expect(peopleHeadline({ ...counts, played_count: 0 })).toMatch(/^Nobody has played/);
  });

  it('labels the list and its empty state', () => {
    expect(listLabel('regulars', false)).toBe('REGULARS · MOST FIRST');
    expect(listLabel('members', true)).toBe('MATCHES');
    expect(emptyListLine('drifting', '')).toMatch(/Nobody is drifting/);
    expect(emptyListLine('all', ' keeper ')).toBe('Nobody matches “keeper”. Search by name or tag.');
  });
});

describe('person rows', () => {
  const row = {
    days: [2, 4],
    last12_count: 12,
    last12_total: 12,
    sessions_total: 48,
    last_came_at: '2026-10-01T23:30:00Z',
    is_member: true,
    is_new: false,
    is_drifting: false,
    pass_kind: null,
    pass_label: null,
  };

  it('writes the meta line', () => {
    expect(personMeta(row, TZ)).toBe('Tue · Thu · 12 of the last 12');
    expect(personMeta({ ...row, is_drifting: true, last_came_at: '2026-09-08T23:30:00Z' }, TZ)).toBe('Last came Sep 8');
    expect(personMeta({ ...row, sessions_total: 0 }, TZ)).toBe('Hasn’t played yet');
    expect(personMeta({ ...row, days: [], last12_total: 0, sessions_total: 1 }, TZ)).toBe('1 session');
  });

  it('picks a badge word', () => {
    expect(personBadge(row)).toBe('MEMBER');
    expect(personBadge({ ...row, pass_kind: 'pack', pass_label: '10-pack' })).toBe('10-PACK');
    expect(personBadge({ ...row, pass_kind: 'other', pass_label: 'Season' })).toBe('SEASON');
    expect(personBadge({ ...row, pass_kind: 'other', pass_label: null })).toBeNull();
    expect(personBadge({ ...row, is_member: false, is_new: true })).toBe('NEW');
    expect(personBadge({ ...row, is_member: false, is_drifting: true })).toBe('DRIFTING');
    expect(personBadge({ ...row, is_member: false })).toBeNull();
  });

  it('draws and describes the last 12', () => {
    const last12 = [true, true, false, true];
    expect(attendanceCells(last12).map((c) => c.came)).toEqual(last12);
    expect(attendanceSentence(last12)).toBe('Came to 3 of the last 4.');
    expect(attendanceSentence([])).toBe('No sessions to count yet.');
  });

  it('writes stats with singulars', () => {
    expect(personStats({ sessions_total: 34, first_came_at: '2026-04-14T23:30:00Z', no_shows: 1 }, TZ)).toEqual([
      { value: '34', label: 'Sessions' },
      { value: 'APR', label: 'First came' },
      { value: '1', label: 'No-show' },
    ]);
    expect(personStats({ sessions_total: 1, first_came_at: null, no_shows: 0 }, TZ).map((s) => s.label)).toEqual([
      'Session',
      'First came',
      'No-shows',
    ]);
  });

  it('writes the pass line', () => {
    const base = { pass_label: null, pass_renews_on: null, pass_sessions_left: null, is_member: false, member_until: null };
    expect(passLine({ ...base, pass_label: 'Monthly', pass_renews_on: '2026-11-01' }, TZ)).toBe('Monthly · renews Nov 1');
    expect(passLine({ ...base, pass_label: 'Monthly · renews Nov 1', pass_renews_on: '2026-11-01' }, TZ)).toBe(
      'Monthly · renews Nov 1',
    );
    expect(passLine({ ...base, pass_label: '10-pack', pass_sessions_left: 1 }, TZ)).toBe('10-pack · 1 session left');
    expect(passLine({ ...base, is_member: true }, TZ)).toBe('Member');
    expect(passLine({ ...base, is_member: true, member_until: '2026-10-31T12:00:00Z' }, TZ)).toBe('Member until Oct 31');
    expect(passLine(base, TZ)).toBe('No pass. Pays per session.');
  });
});

describe('tags and notes', () => {
  it('adds, refuses and removes tags like the server', () => {
    expect(addTag(['winger'], '  Spare   Bibs ')).toEqual({ tags: ['spare bibs', 'winger'] });
    expect(addTag(['winger'], 'WINGER')).toEqual({ tags: ['winger'] });
    expect(addTag([], ' ')).toEqual({ error: 'Write the tag first.' });
    expect(addTag([], 'x'.repeat(25))).toHaveProperty('error');
    expect(addTag([], 'no!')).toEqual({ error: 'Tags use letters, numbers, spaces and hyphens.' });
    expect(addTag(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'i')).toEqual({ error: 'Up to 8 tags. Remove one first.' });
    expect(addTag([], 'centre-back')).toEqual({ tags: ['centre-back'] });
    expect(removeTag(['a', 'b'], 'a')).toEqual(['b']);
    expect(tagWord('spare bibs')).toBe('SPARE BIBS');
  });

  it('limits notes', () => {
    expect(noteError('ok')).toBeNull();
    expect(noteError('x'.repeat(1001))).toBe('Keep notes to 1000 characters. This is 1001.');
  });
});

describe('drifting and invites', () => {
  it('writes the panel', () => {
    expect(driftingHeadline(6)).toBe('6 regulars haven’t been in for 3 weeks or more.');
    expect(driftingHeadline(1)).toBe('1 regular hasn’t been in for 3 weeks or more.');
    // Next Tuesday Oct 13, 7:30 PM.
    expect(driftingBody('2026-10-13T23:30:00Z', NOW, TZ)).toBe(
      'Send them next Tuesday’s link with a line from you. No streaks, no guilt, just the invite.',
    );
    expect(driftingBody(null, NOW, TZ)).toMatch(/the next session’s link/);
  });

  it('names the session day', () => {
    expect(sessionDayWord('2026-10-06T23:30:00Z', NOW, TZ)).toBe('tonight');
    expect(sessionDayWord('2026-10-06T14:00:00Z', NOW, TZ)).toBe('today');
    expect(sessionDayWord('2026-10-07T23:30:00Z', NOW, TZ)).toBe('tomorrow');
    expect(sessionDayWord('2026-10-08T23:30:00Z', NOW, TZ)).toBe('Thursday');
  });

  it('reports invite results', () => {
    expect(inviteBackResult(6, 0)).toBe('Invited 6 people back.');
    expect(inviteBackResult(1, 2)).toBe('Invited 1 person back. 2 already had one this week.');
    expect(inviteBackResult(0, 3)).toMatch(/already|last week/);
  });

  it('finds the next session and the one to announce', () => {
    const week = [
      { kind: 'league', session_id: null, status: 'scheduled', starts_at: '2026-10-06T20:00:00Z' },
      { kind: 'session', session_id: 'later', status: 'scheduled', starts_at: '2026-10-08T23:30:00Z' },
      { kind: 'session', session_id: 'skipped', status: 'skipped', starts_at: '2026-10-07T23:30:00Z' },
      { kind: 'session', session_id: 'tonight', status: 'scheduled', starts_at: '2026-10-06T23:30:00Z' },
      { kind: 'session', session_id: 'started', status: 'scheduled', starts_at: '2026-10-06T18:00:00Z' },
    ];
    expect(nextSession(week, NOW)?.session_id).toBe('tonight');
    expect(pickAnnounceSession(week, NOW)).toBe('started');
    expect(pickAnnounceSession(week, NOW, 'asked')).toBe('asked');
    expect(pickAnnounceSession([], NOW)).toBeNull();
    expect(nextSession([], NOW)).toBeNull();
  });
});

describe('announce', () => {
  const c = { session_count: 14, waitlist_count: 3, members_count: 18, everyone_count: 86 };

  it('labels audiences', () => {
    expect(audienceLabel('session', c, '2026-10-06T23:30:00Z', NOW, TZ)).toBe('Tonight’s 14');
    expect(audienceLabel('session', c, '2026-10-08T23:30:00Z', NOW, TZ)).toBe('Thursday’s 14');
    expect(audienceLabel('waitlist', c, '', NOW, TZ)).toBe('Waitlist 3');
    expect(audienceLabel('members', c, '', NOW, TZ)).toBe('All members 18');
    expect(audienceLabel('everyone', c, '', NOW, TZ)).toBe('Everyone 86');
  });

  it('toggles audiences in designed order', () => {
    expect(toggleAudience(['waitlist'], 'session')).toEqual(['session', 'waitlist']);
    expect(toggleAudience(['session', 'waitlist'], 'session')).toEqual(['waitlist']);
  });

  it('labels the send button', () => {
    expect(sendLabel(17, 2)).toBe('SEND TO 17');
    expect(sendLabel(null, 0)).toBe('PICK WHO GETS IT');
    expect(sendLabel(null, 1)).toBe('SEND');
    expect(sendLabel(0, 1)).toBe('NOBODY IN THAT GROUP');
  });

  it('counts and validates the message', () => {
    expect(characterCount('x'.repeat(92))).toBe('92 of 280 characters');
    expect(messageError('  ')).toBe('Write the message first.');
    expect(messageError('x'.repeat(281))).toBe('Keep it to 280 characters. This is 281.');
    expect(messageError('Pitch moved')).toBeNull();
  });

  it('writes the preview and delivery words', () => {
    expect(pinnedOverline('Ade B', true)).toBe('PINNED · FROM ADE, YOUR HOST');
    expect(pinnedOverline('Ade B', false)).toBe('FROM ADE, YOUR HOST');
    expect(previewWhen('Tuesday 7-a-side', '2026-10-06T23:30:00Z', NOW, TZ)).toBe('Tuesday 7-a-side · tonight 7:30');
    expect(notifyDescription(2, 2)).toBe('For logistics only. Hosts get 2 per session, so people keep them switched on.');
    expect(notifyDescription(1, 2)).toMatch(/1 left for this session\.$/);
    expect(notifyDescription(0, 2)).toMatch(/Both are used/);
  });

  it('writes history rows', () => {
    expect(
      historyMeta({ created_at: '2026-10-01T22:00:00Z', session_name: 'Mixed 5s', audiences: ['session'] }, TZ),
    ).toBe('Thu Oct 1 · Mixed 5s');
    expect(historyMeta({ created_at: '2026-09-24T22:00:00Z', session_name: 'X', audiences: ['everyone'] }, TZ)).toBe(
      'Thu Sep 24 · everyone',
    );
    expect(historyMeta({ created_at: '2026-09-24T22:00:00Z', session_name: null, audiences: ['session'] }, TZ)).toBe(
      'Thu Sep 24',
    );
    expect(readCount(71, 86)).toBe('71 / 86 READ');
    expect(chatNewLine(23)).toBe('23 new since this morning');
    expect(chatNewLine(0)).toBe('Nothing new since this morning');
  });
});

describe('dates', () => {
  it('formats in the time zone', () => {
    expect(monthDay('2026-10-02T02:00:00Z', TZ)).toBe('Oct 1');
    expect(weekdayMonthDay('2026-10-02T02:00:00Z', TZ)).toBe('Thu Oct 1');
    expect(sameDay('2026-10-06T14:00:00Z', NOW, TZ)).toBe(true);
    expect(sameDay('2026-10-07T14:00:00Z', NOW, TZ)).toBe(false);
    expect(dateOnlyMonthDay('2026-11-01')).toBe('Nov 1');
  });
});

describe('money words', () => {
  it('writes the payout header', () => {
    expect(payoutOverline('2026-10-09')).toBe('NEXT PAYOUT · FRIDAY OCT 9');
    expect(payoutOverline(null)).toBe('NEXT PAYOUT');
    expect(payoutDate('2026-10-02')).toBe('OCT 2');
    expect(payoutLands('2026-10-09', true)).toBe('It lands in your bank on Friday.');
    expect(payoutLands(null, true)).toBe('');
    expect(payoutLands('2026-10-09', false)).toMatch(/Nothing is paid out until payments are connected/);
  });

  it('never says PAID without a provider', () => {
    expect(payoutStatusWord('paid', false)).toBe('NOT SENT');
    expect(payoutStatusWord('paid', true)).toBe('PAID');
    expect(payoutStatusWord('scheduled', true)).toBe('SCHEDULED');
    expect(payoutStatusWord('on_hold', true)).toBe('ON HOLD');
  });

  it('describes a refund request', () => {
    const d = {
      charge_kind: 'monthly_renewal',
      paid_at: '2026-10-01T16:00:00Z',
      cancelled_at: '2026-10-04T16:00:00Z',
      last_played_at: '2026-09-08T23:30:00Z',
      charge_amount_cents: 3500,
      currency: 'CAD',
    };
    expect(refundContext(d, TZ)).toBe('Renewed Oct 1 for $35. Cancelled Oct 4. Hasn’t played since.');
    expect(refundContext({ ...d, charge_kind: 'drop_in', cancelled_at: null, last_played_at: '2026-10-05T23:30:00Z' }, TZ)).toBe(
      'Paid Oct 1 for $35. Last played Oct 5.',
    );
    expect(refundContext({ ...d, paid_at: null, cancelled_at: null }, TZ)).toBe('Paid $35.');
    expect(refundKind('monthly_renewal')).toBe('monthly refund');
    expect(refundKind('other')).toBe('refund');
  });

  it('parses a partial amount', () => {
    expect(parseRefundAmount('25', 3500)).toEqual({ cents: 2500 });
    expect(parseRefundAmount('$12.50', 3500)).toEqual({ cents: 1250 });
    expect(parseRefundAmount('abc', 3500)).toHaveProperty('error');
    expect(parseRefundAmount('0', 3500)).toHaveProperty('error');
    expect(parseRefundAmount('35', 3500)).toEqual({ error: 'That’s all of it. Pick REFUND ALL instead.' });
  });

  it('writes the members sentence', () => {
    expect(
      membersSentence({
        count: 18,
        renewing_count: 17,
        renews_on: '2026-11-01',
        cancelled_count: 1,
        member_sessions_per_week: 2.4,
        drop_in_sessions_per_week: 0.8,
      }),
    ).toBe('17 renew on Nov 1. 1 cancelled. Members come to 2.4 sessions a week, drop-ins to 0.8.');
    expect(
      membersSentence({
        count: 2,
        renewing_count: 2,
        renews_on: null,
        cancelled_count: 0,
        member_sessions_per_week: 2,
        drop_in_sessions_per_week: null,
      }),
    ).toBe('Members come to 2 sessions a week.');
    expect(
      membersSentence({
        count: 0,
        renewing_count: 0,
        renews_on: null,
        cancelled_count: 0,
        member_sessions_per_week: null,
        drop_in_sessions_per_week: null,
      }),
    ).toMatch(/No members yet/);
  });
});
