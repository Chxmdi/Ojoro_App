import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_TEST_WEBHOOK_SECRET,
  PAYMENTS_LIVE_ENABLED,
  buildTestStripeEvent,
  checkoutStatusSentence,
  hostPaymentAccountSubscription,
  isCheckoutPending,
  parsePaymentsReturn,
  paymentAccountSentence,
  paymentCheckoutSubscription,
  paymentsErrorCodes,
  paymentsFunctionError,
  paymentsFunctions,
  paymentsReturnUrl,
  paymentsRpcs,
  purchaseReasonSentence,
  stripeTestSignatureHeader,
  testCheckoutCompletedObject,
  type PurchaseReason,
} from './payments';
import { ojoroErrorCodes, toOjoroError } from './slice01';

const CHECKOUT = 'a1000000-0000-4000-8000-000000000001';
const PROGRAM = 'c6000000-0000-4000-8000-000000000001';

describe('payments contract', () => {
  it('lists reads, functions and codes', () => {
    expect(paymentsRpcs).toEqual(['host_purchase_options', 'payment_checkout', 'host_payment_account']);
    expect(paymentsFunctions).toEqual({ checkout: 'payments-checkout', connect: 'payments-connect' });
    for (const code of paymentsErrorCodes) expect(ojoroErrorCodes).toContain(code);
    expect(PAYMENTS_LIVE_ENABLED).toBe(false);
  });

  it('words every account state', () => {
    expect(paymentAccountSentence({ status: 'not_connected', requirements_due: [] })).toMatch(/Connect Stripe/);
    expect(paymentAccountSentence({ status: 'onboarding', requirements_due: [] })).toMatch(/isn’t finished/);
    expect(paymentAccountSentence({ status: 'restricted', requirements_due: ['external_account'] })).toBe(
      'Stripe needs 1 more detail before you can take payments.',
    );
    expect(paymentAccountSentence({ status: 'restricted', requirements_due: ['a', 'b'] })).toMatch(/2 more details/);
    expect(paymentAccountSentence({ status: 'restricted', requirements_due: [] })).toMatch(/paused/);
    expect(paymentAccountSentence({ status: 'ready', requirements_due: [] })).toBe('Payments are on. Stripe pays you every Friday.');
  });

  it('words every checkout state, without exclamation marks', () => {
    const base = { kind: 'pack' as const, amount_cents: 7000, currency: 'CAD', pass_name: '10-pack' };
    expect(checkoutStatusSentence({ ...base, status: 'open' })).toBe('Waiting for Stripe to confirm $70.');
    expect(checkoutStatusSentence({ ...base, status: 'creating' })).toMatch(/Waiting/);
    expect(checkoutStatusSentence({ ...base, status: 'completed' })).toBe('Paid $70 for 10-pack.');
    expect(checkoutStatusSentence({ ...base, kind: 'drop_in', amount_cents: 800, status: 'completed' })).toBe('Paid $8 for your spot.');
    expect(checkoutStatusSentence({ ...base, pass_name: null, status: 'completed' })).toBe('Paid $70 for your pass.');
    expect(checkoutStatusSentence({ ...base, kind: 'monthly', amount_cents: 3500, status: 'completed' })).toMatch(/You’re a member/);
    expect(checkoutStatusSentence({ ...base, status: 'expired' })).toMatch(/Nothing was charged/);
    expect(checkoutStatusSentence({ ...base, status: 'failed' })).toMatch(/didn’t go through/);
    expect(checkoutStatusSentence({ ...base, status: 'refunded' })).toBe('You were already covered, so Stripe is sending $70 back.');
    expect(isCheckoutPending('open')).toBe(true);
    expect(isCheckoutPending('creating')).toBe(true);
    expect(isCheckoutPending('completed')).toBe(false);
    const reasons: PurchaseReason[] = ['free', 'needs_session', 'already_member', 'not_connected', 'nothing_to_pay', 'not_attending', 'session_skipped'];
    for (const r of reasons) {
      expect(purchaseReasonSentence(r)).toMatch(/\.$/);
      expect(purchaseReasonSentence(r)).not.toContain('!');
    }
    expect(purchaseReasonSentence('not_attending')).toContain('I’M DOWN');
  });

  it('builds and reads return links', () => {
    const c = paymentsReturnUrl({ kind: 'checkout', checkoutId: CHECKOUT, result: 'success' });
    expect(c).toBe(`ojoro://pay/return?checkout_id=${CHECKOUT}&result=success`);
    expect(parsePaymentsReturn(c)).toEqual({ kind: 'checkout', checkoutId: CHECKOUT, result: 'success' });
    const w = paymentsReturnUrl({ kind: 'connect', programId: PROGRAM, result: 'return' }, 'http://localhost:8100');
    expect(w).toBe(`http://localhost:8100/host/${PROGRAM}/payments?connect=return`);
    expect(parsePaymentsReturn(w)).toEqual({ kind: 'connect', programId: PROGRAM, result: 'return' });
    expect(parsePaymentsReturn(`exp://192.168.1.2:8081/--/pay/return?checkout_id=${CHECKOUT}&result=cancel`)).toEqual({
      kind: 'checkout',
      checkoutId: CHECKOUT,
      result: 'cancel',
    });
    expect(parsePaymentsReturn(`ojoro://pay/return?checkout_id=nope&result=success`)).toBe(null);
    expect(parsePaymentsReturn(`ojoro://host/${PROGRAM}/payments?connect=other`)).toBe(null);
    expect(parsePaymentsReturn('ojoro://plan/1')).toBe(null);
    expect(parsePaymentsReturn('ojoro://pay/return')).toBe(null);
  });

  it('reads a function error body for toOjoroError', () => {
    const body = { error: { code: 'P0001', message: 'payments_not_connected', details: '' } };
    const e = paymentsFunctionError(body);
    expect(e).toEqual({ code: 'P0001', message: 'payments_not_connected', details: null });
    expect(toOjoroError(e)).toMatchObject({ kind: 'ojoro', code: 'payments_not_connected' });
    expect(paymentsFunctionError({ error: { message: 'nothing_to_pay', details: 'member' } })).toEqual({
      code: 'P0001',
      message: 'nothing_to_pay',
      details: 'member',
    });
    expect(paymentsFunctionError(null)).toBe(null);
    expect(paymentsFunctionError({ checkout_id: CHECKOUT })).toBe(null);
    expect(paymentsFunctionError({ error: { code: 'x' } })).toBe(null);
  });

  it('describes realtime hints', () => {
    expect(paymentCheckoutSubscription('u1').changes[0]).toEqual({
      event: '*',
      schema: 'public',
      table: 'payment_checkouts',
      filter: 'user_id=eq.u1',
    });
    expect(hostPaymentAccountSubscription(PROGRAM).channel).toBe(`host-payment-account:${PROGRAM}`);
  });
});

describe('local test helpers', () => {
  it('signs like Stripe (HMAC-SHA256 of t.payload)', async () => {
    const header = await stripeTestSignatureHeader('{"a":1}', 'whsec_test', 1700000000);
    const expected = createHmac('sha256', 'whsec_test').update('1700000000.{"a":1}').digest('hex');
    expect(header).toBe(`t=1700000000,v1=${expected}`);
    expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
    expect(await stripeTestSignatureHeader('{"a":1}', 'whsec_test', 1700000000)).toBe(header);
    expect(await stripeTestSignatureHeader('{"a":2}', 'whsec_test', 1700000000)).not.toBe(header);
    expect(await stripeTestSignatureHeader('x')).toMatch(/^t=\d+,v1=/);
    expect(LOCAL_TEST_WEBHOOK_SECRET).toMatch(/^whsec_/);
  });

  it('builds test events and checkout objects', () => {
    const e = buildTestStripeEvent('account.updated', { id: 'acct_1' }, { account: 'acct_1', id: 'evt_x', created: 5 });
    expect(e).toMatchObject({ id: 'evt_x', type: 'account.updated', account: 'acct_1', livemode: false, created: 5, data: { object: { id: 'acct_1' } } });
    expect(buildTestStripeEvent('x', {}).id).toMatch(/^evt_test_/);
    expect(buildTestStripeEvent('x', {})).not.toHaveProperty('account');
    const pay = testCheckoutCompletedObject({ checkout_id: CHECKOUT, provider_session_id: 'cs_1', kind: 'drop_in', amount_cents: 800, currency: 'CAD' });
    expect(pay).toMatchObject({ mode: 'payment', payment_status: 'paid', amount_total: 800, currency: 'cad', subscription: null });
    expect(String(pay.payment_intent)).toMatch(/^pi_test_/);
    const sub = testCheckoutCompletedObject({ checkout_id: CHECKOUT, provider_session_id: 'cs_2', kind: 'monthly', amount_cents: 3500, currency: 'CAD' });
    expect(sub).toMatchObject({ mode: 'subscription', payment_intent: null, metadata: { ojoro_checkout_id: CHECKOUT } });
    expect(String(sub.subscription)).toMatch(/^sub_test_/);
  });
});
