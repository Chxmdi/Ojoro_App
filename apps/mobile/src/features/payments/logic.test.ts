import type { HostPaymentAccount, PurchaseSession } from '@ojoro/contracts';
import { describe, expect, it } from 'vitest';

import {
  accountView,
  connectReturnNote,
  holdingLine,
  holdingWord,
  isTestMode,
  passCta,
  passPrice,
  passSaleNote,
  passTerms,
  payoutWord,
  receiptsToShow,
  receiptTitle,
  receiptWord,
  refundProgressNote,
  resumable,
  returnBase,
  returnBody,
  returnHeadline,
  rosterPaymentsCopy,
  sessionPayView,
} from './logic';

const TZ = 'America/Toronto';

const session = (over: Partial<PurchaseSession> = {}): PurchaseSession => ({
  session_id: 's1',
  state: 'due',
  amount_cents: 800,
  currency: 'CAD',
  buyable: true,
  reason: null,
  ...over,
});

const account = (over: Partial<HostPaymentAccount> = {}): HostPaymentAccount => ({
  program_id: 'p1',
  provider: 'stripe',
  status: 'not_connected',
  account_id: null,
  charges_enabled: false,
  payouts_enabled: false,
  details_submitted: false,
  requirements_due: [],
  disabled_reason: null,
  livemode: false,
  ready_at: null,
  updated_at: null,
  can_onboard: true,
  ...over,
});

describe('test mode', () => {
  it('is always on while the live switch is off', () => {
    expect(isTestMode()).toBe(true);
    expect(isTestMode(account({ livemode: true }))).toBe(true);
  });
});

describe('returnBase', () => {
  it('uses the web origin, and leaves native to the server default', () => {
    expect(returnBase('web', 'http://localhost:8100')).toBe('http://localhost:8100/');
    expect(returnBase('web', 'http://localhost:8100/')).toBe('http://localhost:8100/');
    expect(returnBase('web', null)).toBeUndefined();
    expect(returnBase('ios', 'x')).toBeUndefined();
  });
});

describe('sessionPayView', () => {
  it('offers PAY when the server says it is buyable', () => {
    const v = sessionPayView(session(), true);
    expect(v?.cta).toBe('PAY $8');
    expect(v?.title).toBe('Your spot is $8');
  });
  it('says how a spot is covered, in words', () => {
    expect(sessionPayView(session({ state: 'host' }), true)).toBeNull();
    expect(sessionPayView(session({ state: 'member', buyable: false }), true)?.title).toMatch(/membership/);
    expect(sessionPayView(session({ state: 'pack', buyable: false }), true)?.title).toMatch(/pack/);
    expect(sessionPayView(session({ state: 'free', buyable: false }), true)?.title).toMatch(/Free/);
    expect(sessionPayView(session({ state: 'paid', buyable: false }), true)?.title).toBe('Paid $8');
    expect(sessionPayView(session({ state: 'paid', amount_cents: null }), true)?.title).toBe('Paid');
    expect(sessionPayView(session({ state: 'refunded' }), true)?.body).toBe('$8 went back to you.');
    expect(sessionPayView(session({ state: 'refunded', amount_cents: null }), true)?.body).toMatch(/went back/);
  });
  it('explains why it cannot be paid in the app', () => {
    const v = sessionPayView(session({ buyable: false, reason: 'not_connected' }), false);
    expect(v?.cta).toBeNull();
    expect(v?.body).toBe('Pay $8 at the field. This host doesn’t take payments in the app yet.');
    expect(sessionPayView(session({ buyable: false, reason: 'not_attending' }), true)?.body).toMatch(/I’M DOWN/);
    expect(sessionPayView(session({ buyable: false, reason: 'not_attending', amount_cents: null }), true)?.title).toBe(
      'Paying for your spot',
    );
  });
  it('falls back to paying at the field, or nothing', () => {
    expect(sessionPayView(session({ buyable: false, state: null }), false)?.body).toBe('Pay $8 at the field.');
    expect(sessionPayView(session({ buyable: false, state: null }), true)).toBeNull();
  });
});

describe('passes', () => {
  const pass = { kind: 'pack' as const, price_cents: 7000, currency: 'CAD', buyable: true, sessions_included: 10, valid_days: 120 };
  it('labels the buy button with the server price', () => {
    expect(passCta(pass)).toBe('PAY $70');
    expect(passCta({ ...pass, kind: 'monthly', price_cents: 3500 })).toBe('PAY $35 A MONTH');
    expect(passCta({ ...pass, buyable: false })).toBeNull();
    expect(passCta({ ...pass, price_cents: 0 })).toBeNull();
  });
  it('says the terms and price', () => {
    expect(passTerms(pass)).toBe('10 sessions · use within 120 days');
    expect(passTerms({ ...pass, sessions_included: null, valid_days: null })).toBe('0 sessions · use within 0 days');
    expect(passTerms({ ...pass, kind: 'monthly' })).toMatch(/Renews monthly/);
    expect(passTerms({ ...pass, kind: 'drop_in' })).toBe('One session');
    expect(passTerms({ ...pass, kind: 'free' })).toBe('Free');
    expect(passPrice(pass)).toBe('$70');
    expect(passPrice({ ...pass, kind: 'monthly', price_cents: 3500 })).toBe('$35/MO');
    expect(passPrice({ ...pass, kind: 'free' })).toBe('FREE');
  });
  it('describes what I hold', () => {
    const h = { kind: 'pack' as const, pass_name: '10-pack', status: 'active' as const, renews: false, period_ends_at: '2026-11-30T17:00:00Z', sessions_left: 4 };
    expect(holdingLine(h, TZ)).toBe('10-pack · 4 sessions left · use by Mon 30 Nov');
    expect(holdingLine({ ...h, sessions_left: 1, period_ends_at: null }, TZ)).toBe('10-pack · 1 session left');
    expect(holdingLine({ ...h, sessions_left: null, period_ends_at: null }, TZ)).toBe('10-pack · 0 sessions left');
    const m = { ...h, kind: 'monthly' as const, pass_name: 'Monthly', renews: true, period_ends_at: '2026-12-01T17:00:00Z' };
    expect(holdingLine(m, TZ)).toBe('Monthly · renews Tue 1 Dec');
    expect(holdingLine({ ...m, renews: false, status: 'cancelled' }, TZ)).toBe('Monthly · ends Tue 1 Dec');
    expect(holdingLine({ ...m, period_ends_at: null }, TZ)).toBe('Monthly');
    expect(holdingLine({ ...m, status: 'ended' }, TZ)).toBe('Monthly · ended Tue 1 Dec');
    expect(holdingLine({ ...m, status: 'ended', period_ends_at: null }, TZ)).toBe('Monthly · ended');
    expect(holdingLine({ ...h, kind: 'free', pass_name: 'Sunday' }, TZ)).toBe('Sunday');
    expect(holdingWord(m)).toBe('MEMBER');
    expect(holdingWord({ ...m, renews: false })).toBe('ENDING');
    expect(holdingWord({ ...m, status: 'cancelled' })).toBe('CANCELLED');
    expect(holdingWord({ ...m, status: 'ended' })).toBe('ENDED');
    expect(holdingWord(h)).toBe('ACTIVE');
  });
});

describe('return screen', () => {
  const st = {
    status: 'open' as const,
    kind: 'pack' as const,
    amount_cents: 7000,
    currency: 'CAD',
    pass_name: '10-pack',
    expires_at: '2026-10-30T16:30:00Z',
  };
  it('never says paid until Stripe has', () => {
    expect(returnHeadline('open', 'success', false)).toBe('CHECKING WITH STRIPE.');
    expect(returnHeadline('creating', 'success', true)).toBe('STILL CHECKING.');
    expect(returnHeadline('open', 'cancel', false)).toBe('NOT PAID YET.');
    expect(returnHeadline('completed', 'cancel', false)).toBe('PAID.');
    expect(returnHeadline('refunded', 'success', false)).toBe('SENT BACK.');
    expect(returnHeadline('expired', 'success', false)).toBe('PAGE CLOSED.');
    expect(returnHeadline('failed', 'success', false)).toBe('NOT PAID.');
  });
  it('explains each state honestly', () => {
    expect(returnBody(st, 'success', false, TZ)).toBe('Waiting for Stripe to confirm $70.');
    expect(returnBody(st, 'success', true, TZ)).toMatch(/hasn’t confirmed it yet/);
    expect(returnBody(st, 'cancel', false, TZ)).toMatch(/^You left the payment page, so nothing was charged\. The payment page stays open until 12:30/);
    expect(returnBody({ ...st, expires_at: null }, 'cancel', false, TZ)).toBe('You left the payment page, so nothing was charged.');
    expect(returnBody({ ...st, status: 'completed' }, 'success', false, TZ)).toBe('Paid $70 for 10-pack.');
  });
  it('lists receipts with words', () => {
    expect(receiptWord('completed')).toBe('PAID');
    expect(receiptWord('refunded')).toBe('REFUNDED');
    expect(receiptWord('open')).toBe('NOT PAID');
    expect(receiptTitle({ kind: 'drop_in', pass_name: null, program_name: 'Plateau' })).toBe('Drop-in · Plateau');
    expect(receiptTitle({ kind: 'pack', pass_name: '10-pack', program_name: 'Plateau' })).toBe('10-pack · Plateau');
    expect(receiptTitle({ kind: 'monthly', pass_name: null, program_name: 'P' })).toBe('Monthly · P');
    expect(receiptTitle({ kind: 'pack', pass_name: null, program_name: 'P' })).toBe('Pack · P');
    const rows = [{ status: 'open' }, { status: 'completed' }, { status: 'expired' }, { status: 'refunded' }, { status: 'failed' }] as const;
    expect(receiptsToShow(rows).map((r) => r.status)).toEqual(['completed', 'refunded', 'failed']);
  });
  it('resumes an open page that has time left', () => {
    const now = new Date('2026-10-30T16:00:00Z');
    expect(resumable({ status: 'open', url: 'https://x', expires_at: '2026-10-30T16:20:00Z' }, now)).toBe(true);
    expect(resumable({ status: 'open', url: 'https://x', expires_at: null }, now)).toBe(true);
    expect(resumable({ status: 'open', url: 'https://x', expires_at: '2026-10-30T16:00:30Z' }, now)).toBe(false);
    expect(resumable({ status: 'completed', url: 'https://x', expires_at: null }, now)).toBe(false);
    expect(resumable({ status: 'open', url: null, expires_at: null }, now)).toBe(false);
    expect(resumable(null, now)).toBe(false);
  });
});

describe('host account', () => {
  it('walks not connected → onboarding → needs info → ready', () => {
    expect(accountView(account()).primary).toEqual({ action: 'onboard', label: 'SET UP PAYOUTS' });
    expect(accountView(account()).word).toBe('NOT CONNECTED');
    const ob = accountView(account({ status: 'onboarding' }));
    expect(ob.primary?.label).toBe('FINISH SETUP');
    expect(ob.secondary?.action).toBe('refresh');
    const r = accountView(account({ status: 'restricted', details_submitted: true, requirements_due: ['individual.id_number'] }));
    expect(r.word).toBe('NEEDS INFO');
    expect(r.primary?.label).toBe('ADD THE DETAILS');
    expect(r.body).toMatch(/1 more detail/);
    const paused = accountView(account({ status: 'restricted', details_submitted: true }));
    expect(paused.primary).toEqual({ action: 'dashboard', label: 'OPEN STRIPE' });
    const ready = accountView(account({ status: 'ready', details_submitted: true, charges_enabled: true, payouts_enabled: true }));
    expect(ready.word).toBe('READY');
    expect(ready.primary).toBeNull();
    expect(ready.secondary?.label).toBe('OPEN STRIPE');
    expect(accountView(account({ status: 'ready' })).secondary).toBeNull();
  });
  it('tells co-hosts only the owner can set it up', () => {
    const v = accountView(account({ can_onboard: false }));
    expect(v.primary).toBeNull();
    expect(v.ownerOnlyNote).toMatch(/owner/);
    expect(accountView(account({ can_onboard: false, status: 'restricted' })).primary).toBeNull();
    expect(accountView(account({ can_onboard: false, status: 'onboarding' })).primary).toBeNull();
  });
  it('reads the return from Stripe', () => {
    expect(connectReturnNote('return')).toMatch(/Back from Stripe/);
    expect(connectReturnNote('refresh')).toMatch(/expired/);
    expect(connectReturnNote(undefined)).toBeNull();
  });
  it('says PAID only when Stripe paid the week', () => {
    expect(payoutWord({ status: 'paid', provider: 'stripe' }, true)).toBe('PAID');
    expect(payoutWord({ status: 'paid', provider: 'none' }, true)).toBe('NOT SENT');
    expect(payoutWord({ status: 'paid' }, false)).toBe('NOT SENT');
    expect(payoutWord({ status: 'failed', provider: 'stripe' }, true)).toBe('DIDN’T GO THROUGH');
    expect(payoutWord({ status: 'scheduled', provider: 'none' }, true)).toBe('SCHEDULED');
    expect(payoutWord({ status: 'scheduled' }, false)).toBe('NOT SENT');
  });
  it('says where a refund is', () => {
    expect(refundProgressNote({ refund_cents: 0 }, true)).toBe('');
    expect(refundProgressNote({ refund_cents: 800, provider: 'stripe', refund_status: 'pending' }, true)).toMatch(/10 minutes/);
    expect(refundProgressNote({ refund_cents: 800, provider: 'stripe', refund_status: 'succeeded' }, true)).toBe(' Stripe sent it.');
    expect(refundProgressNote({ refund_cents: 800, provider: 'stripe', refund_status: 'failed' }, true)).toMatch(/failed/);
    expect(refundProgressNote({ refund_cents: 800, provider: 'none' }, true)).toMatch(/outside the app/);
    expect(refundProgressNote({ refund_cents: 800, provider: 'none' }, false)).toMatch(/once payments are connected/);
  });
  it('words the roster and pass sheet by connection', () => {
    expect(rosterPaymentsCopy(true).title).toMatch(/pay in the app/);
    expect(rosterPaymentsCopy(false).title).toBe('Payments aren’t connected');
    expect(passSaleNote(true)).toMatch(/through Stripe/);
    expect(passSaleNote(false)).toMatch(/aren’t connected/);
  });
});
