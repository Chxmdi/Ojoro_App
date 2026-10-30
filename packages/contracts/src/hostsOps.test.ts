import { describe, expect, it } from 'vitest';
import {
  decisionSentence,
  fillTimeChange,
  fillTimeLabel,
  fixtureReadiness,
  formatMoney,
  goalDifferenceLabel,
  hostLeagueSubscription,
  hostMoneySubscription,
  hostOpsErrorCodes,
  hostOpsIdempotentRpcs,
  hostOpsRpcs,
  insightsCsvFileName,
  moneyLineLabel,
  passCountLabel,
  passPriceLabel,
  pastPayoutMeta,
  payoutSourceSentence,
  percent,
  pointsChange,
  relativeChange,
} from './hostsOps';
import { idempotentRpcs, isOjoroErrorCode } from './slice01';

const team = (id: string, name: string) => ({ id, name, crew_id: null, captain_id: null });

describe('hostsOps contract', () => {
  it('lists every idempotent RPC among the RPCs and in idempotentRpcs', () => {
    for (const rpc of hostOpsIdempotentRpcs) {
      expect(hostOpsRpcs).toContain(rpc);
      expect(idempotentRpcs).toContain(rpc);
    }
  });

  it('registers its error codes', () => {
    for (const code of hostOpsErrorCodes) expect(isOjoroErrorCode(code)).toBe(true);
  });

  it('formats money in whole units, cents and a true minus', () => {
    expect(formatMoney(41200)).toBe('$412');
    expect(formatMoney(154400)).toBe('$1,544');
    expect(formatMoney(-3600)).toBe('−$36');
    expect(formatMoney(1250)).toBe('$12.50');
    expect(formatMoney(800, 'EUR')).toBe('EUR 8');
  });

  it('labels payout lines and sentences', () => {
    expect(moneyLineLabel({ kind: 'drop_in', count: 22, unit_cents: 800, amount_cents: 17600 })).toBe('Drop-ins · 22 × $8');
    expect(moneyLineLabel({ kind: 'monthly_renewal', count: 6, unit_cents: 3500, amount_cents: 21000 })).toBe(
      'Monthly renewals · 6 × $35',
    );
    expect(moneyLineLabel({ kind: 'pack', count: 1, unit_cents: 7000, amount_cents: 7000 })).toBe('10-pack · 1 × $70');
    expect(moneyLineLabel({ kind: 'pack', count: 2, unit_cents: 4000, amount_cents: 8000 }, 'CAD', '5-pack')).toBe(
      '5-pack · 2 × $40',
    );
    expect(moneyLineLabel({ kind: 'monthly', count: 1, unit_cents: 3500, amount_cents: 3500 })).toBe('Membership · 1 × $35');
    expect(payoutSourceSentence({ session_count: 4, pass_count: 7 })).toBe('From 4 sessions and 7 passes this week.');
    expect(payoutSourceSentence({ session_count: 1, pass_count: 0 })).toBe('From 1 session this week.');
    expect(payoutSourceSentence({ session_count: 0, pass_count: 1 })).toBe('From 1 pass this week.');
    expect(payoutSourceSentence({ session_count: 0, pass_count: 0 })).toBe('Nothing in this payout yet.');
    expect(pastPayoutMeta({ session_count: 5, refund_count: 1, note: null })).toBe('5 sessions · 1 refund');
    expect(pastPayoutMeta({ session_count: 4, refund_count: 2, note: 'rain-out on Thursday' })).toBe(
      '4 sessions · 2 refunds · rain-out on Thursday',
    );
    expect(pastPayoutMeta({ session_count: 1, refund_count: 0, note: null })).toBe('1 session');
  });

  it('labels passes', () => {
    expect(passPriceLabel({ kind: 'drop_in', price_cents: 800, currency: 'CAD' })).toBe('$8');
    expect(passPriceLabel({ kind: 'free', price_cents: 0, currency: 'CAD' })).toBe('FREE');
    expect(passCountLabel({ count_kind: 'sold_this_month', count: 41 })).toBe('41 SOLD THIS MONTH');
    expect(passCountLabel({ count_kind: 'active', count: 7 })).toBe('7 ACTIVE');
    expect(passCountLabel({ count_kind: 'members', count: 18 })).toBe('18 MEMBERS');
    expect(passCountLabel({ count_kind: 'members', count: 1 })).toBe('1 MEMBER');
    expect(passCountLabel({ count_kind: 'in_next_session', count: 9 }, 'Sunday')).toBe('9 IN THIS SUNDAY');
    expect(passCountLabel({ count_kind: 'in_next_session', count: null })).toBe('0 IN NEXT SESSION');
  });

  it('words refund decisions', () => {
    const base = { currency: 'CAD', membership_id: 'm' };
    expect(decisionSentence({ ...base, decision: 'full', refund_cents: 3500 }, 'Lena')).toBe(
      'Refunded $35. Lena has been told and the membership ends today.',
    );
    expect(decisionSentence({ ...base, decision: 'keep', refund_cents: 0 }, 'Lena', 'Oct 31')).toBe(
      'Kept. Lena has been told it stays active to Oct 31, so they can still come.',
    );
    expect(decisionSentence({ ...base, membership_id: null, decision: 'keep', refund_cents: 0 }, 'Sam')).toBe(
      'Kept. Sam has been told.',
    );
    expect(decisionSentence({ ...base, membership_id: null, decision: 'partial', refund_cents: 400 }, 'Sam')).toBe(
      'Refunded $4. Sam has been told.',
    );
  });

  it('words insights', () => {
    expect(percent(0.912)).toBe('91%');
    expect(percent(null)).toBe('–');
    expect(pointsChange(0.91, 0.88)).toBe('+3 pts');
    expect(pointsChange(0.6, 0.62)).toBe('−2 pts');
    expect(pointsChange(0.6, 0.6)).toBe('Same');
    expect(pointsChange(null, 0.6)).toBeNull();
    expect(relativeChange(154400, 137900)).toBe('+12%');
    expect(relativeChange(96, 100)).toBe('−4%');
    expect(relativeChange(5, 5)).toBe('Same');
    expect(relativeChange(5, 0)).toBeNull();
    expect(fillTimeLabel(26 * 3600)).toBe('1 DAY');
    expect(fillTimeLabel(50 * 3600)).toBe('2 DAYS');
    expect(fillTimeLabel(40 * 3600)).toBe('2 DAYS');
    expect(fillTimeLabel(5 * 3600)).toBe('5 HOURS');
    expect(fillTimeLabel(3600)).toBe('1 HOUR');
    expect(fillTimeLabel(600)).toBe('10 MIN');
    expect(fillTimeChange(26 * 3600, 30 * 3600)).toBe('4 hours faster');
    expect(fillTimeChange(26 * 3600, 25 * 3600)).toBe('1 hour slower');
    expect(fillTimeChange(26 * 3600, 26 * 3600)).toBeNull();
    expect(fillTimeChange(26 * 3600, null)).toBeNull();
  });

  it('words league tables and readiness', () => {
    expect(goalDifferenceLabel(4)).toBe('+4');
    expect(goalDifferenceLabel(0)).toBe('0');
    expect(goalDifferenceLabel(-3)).toBe('−3');
    const home = team('h', 'Lachine Locos');
    const away = team('a', 'Concordia Old Boys');
    expect(fixtureReadiness({ home, away, home_in: 7, away_in: 8 }, 7)).toEqual({
      label: '7 + 8 IN',
      short: false,
      shortTeamId: null,
    });
    expect(fixtureReadiness({ home, away, home_in: 9, away_in: 6 }, 7)).toEqual({
      label: '6 OF 7 · CONCORDIA',
      short: true,
      shortTeamId: 'a',
    });
    expect(fixtureReadiness({ home, away, home_in: 2, away_in: 5 }, 7, (n) => n).label).toBe('2 OF 7 · LACHINE LOCOS');
  });

  it('names the CSV file', () => {
    expect(insightsCsvFileName('Plateau Pickup', new Date('2026-10-30T12:00:00Z'))).toBe('plateau-pickup-2026-10-30.csv');
    expect(insightsCsvFileName('Été!', new Date('2026-10-30T12:00:00Z'))).toBe('ete-2026-10-30.csv');
    expect(insightsCsvFileName('', new Date('2026-10-30T12:00:00Z'))).toBe('ojoro-2026-10-30.csv');
  });

  it('builds realtime descriptors', () => {
    expect(hostMoneySubscription('p').channel).toBe('host-money:p');
    expect(hostMoneySubscription('p').changes.every((c) => c.filter === 'program_id=eq.p')).toBe(true);
    expect(hostLeagueSubscription('l').changes.map((c) => c.table)).toEqual([
      'host_league_fixtures',
      'host_league_results',
      'host_league_result_submissions',
    ]);
  });
});
