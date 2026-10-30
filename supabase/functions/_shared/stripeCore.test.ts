import { describe, expect, it, vi } from 'vitest';
import {
  type CheckoutParams,
  type Db,
  type DbAuth,
  type Deps,
  type OutboxJob,
  type PaymentsEnv,
  type StripeLike,
  DbError,
  appBase,
  buildAccountParams,
  buildCheckoutSessionParams,
  dbErrorAnswer,
  drainOutbox,
  handleCheckout,
  handleConnect,
  handleDrain,
  handleReturn,
  handleWebhook,
  readPaymentsEnv,
  restDb,
  runJob,
  safeEqual,
  stripeFailure,
  toResponse,
  verifyStripeSignature,
} from './stripeCore';
import {
  LOCAL_TEST_WEBHOOK_SECRET,
  buildTestStripeEvent,
  stripeTestSignatureHeader,
} from '../../../packages/contracts/src/payments';

const UID = '00000000-0000-4000-9000-000000000001';
const PROGRAM = 'c6000000-0000-4000-8000-000000000001';
const CHECKOUT = 'a1000000-0000-4000-8000-000000000001';
const KEY = 'b2000000-0000-4000-8000-000000000002';
const PASS = 'c7200000-0000-4000-8000-000000000002';

function env(over: Partial<PaymentsEnv> = {}): PaymentsEnv {
  return {
    secretKey: 'sk_test_x',
    webhookSecrets: [LOCAL_TEST_WEBHOOK_SECRET],
    apiBase: null,
    connectCountry: 'CA',
    cronSecret: 'cron-secret',
    functionsUrl: 'https://fn.test/functions/v1',
    returnOrigins: ['ojoro://', 'http://localhost:8100/'],
    supabaseUrl: 'https://db.test',
    anonKey: 'anon',
    serviceRoleKey: 'service',
    ...over,
  };
}

type Call = { fn: string; args: Record<string, unknown>; auth: DbAuth };

function fakeDb(handlers: Record<string, (args: Record<string, unknown>, auth: DbAuth) => unknown>): Db & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async rpc<T>(fn: string, args: Record<string, unknown>, auth: DbAuth): Promise<T> {
      calls.push({ fn, args, auth });
      const h = handlers[fn];
      if (!h) throw new Error(`unexpected rpc ${fn}`);
      return (await h(args, auth)) as T;
    },
  };
}

function fakeStripe(over: Partial<{ [K in keyof StripeLike]: unknown }> = {}): StripeLike {
  const base = {
    accounts: {
      create: vi.fn(async () => ({ id: 'acct_new', charges_enabled: false })),
      retrieve: vi.fn(async (id: string) => ({ id, charges_enabled: true, payouts_enabled: true })),
      createLoginLink: vi.fn(async () => ({ url: 'https://connect.stripe.test/express/login' })),
    },
    accountLinks: { create: vi.fn(async () => ({ url: 'https://connect.stripe.test/setup' })) },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.test/c/1', expires_at: 1900000000 })),
      },
    },
    refunds: { create: vi.fn(async () => ({ id: 're_1', status: 'succeeded' })) },
    subscriptions: {
      update: vi.fn(async (id: string) => ({ id, status: 'active' })),
      cancel: vi.fn(async (id: string) => ({ id, status: 'canceled' })),
    },
    invoicePayments: { list: vi.fn(async () => ({ data: [{ payment: { payment_intent: 'pi_from_invoice' } }] })) },
    invoices: { retrieve: vi.fn(async () => ({ payment_intent: 'pi_old_shape' })) },
  };
  return { ...base, ...over } as unknown as StripeLike;
}

function deps(db: Db, stripe: StripeLike = fakeStripe(), e: PaymentsEnv = env()): Deps & { logs: unknown[] } {
  const logs: unknown[] = [];
  return { env: e, db, stripe, log: (event, data) => logs.push({ event, ...data }), logs };
}

function params(over: Partial<CheckoutParams> = {}): CheckoutParams {
  return {
    checkout_id: CHECKOUT,
    status: 'creating',
    kind: 'pack',
    program_id: PROGRAM,
    user_id: UID,
    account_id: 'acct_host',
    amount_cents: 7000,
    currency: 'CAD',
    application_fee_cents: 560,
    application_fee_percent: 8,
    provider_session_id: null,
    url: null,
    expires_at: '2026-10-31T12:00:00Z',
    expires_at_unix: 1900000000,
    item_name: 'Plateau Pickup · 10-pack',
    item_description: '10 sessions',
    metadata: { ojoro_checkout_id: CHECKOUT },
    ...over,
  };
}

describe('readPaymentsEnv', () => {
  const good: Record<string, string> = {
    STRIPE_SECRET_KEY: 'sk_test_abc',
    STRIPE_WEBHOOK_SECRET: 'whsec_a',
    STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_b',
    STRIPE_MODE: 'test',
    SUPABASE_URL: 'http://kong:8000/',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    STRIPE_API_BASE: 'http://host.docker.internal:12111',
    PAYMENTS_RETURN_ORIGINS: 'ojoro://, http://localhost:8100/',
  };
  const read = (over: Record<string, string | undefined>) =>
    readPaymentsEnv((k) => ({ ...good, ...over })[k]);

  it('reads a test configuration', () => {
    const r = read({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.env.webhookSecrets).toEqual(['whsec_a', 'whsec_b']);
    expect(r.env.apiBase).toEqual({ protocol: 'http', host: 'host.docker.internal', port: 12111 });
    expect(r.env.functionsUrl).toBe('http://kong:8000/functions/v1');
    expect(r.env.returnOrigins).toEqual(['ojoro://', 'http://localhost:8100/']);
    expect(r.env.connectCountry).toBe('CA');
  });

  it('refuses live keys and live mode (the switch is off)', () => {
    expect(read({ STRIPE_SECRET_KEY: 'sk_live_abc' })).toEqual({ ok: false, detail: 'live_mode_off' });
    expect(read({ STRIPE_SECRET_KEY: 'rk_live_abc' })).toEqual({ ok: false, detail: 'live_mode_off' });
    expect(read({ STRIPE_MODE: 'live' })).toEqual({ ok: false, detail: 'live_mode_off' });
  });

  it('is not configured without a test key or Supabase', () => {
    expect(read({ STRIPE_SECRET_KEY: undefined })).toEqual({ ok: false, detail: 'not_configured' });
    expect(read({ STRIPE_SECRET_KEY: 'pk_test_abc' })).toEqual({ ok: false, detail: 'not_configured' });
    expect(read({ SUPABASE_SERVICE_ROLE_KEY: '' })).toEqual({ ok: false, detail: 'not_configured' });
    expect(read({ STRIPE_API_BASE: 'not a url' })).toEqual({ ok: false, detail: 'not_configured' });
  });

  it('defaults mode, origins, country and the API host', () => {
    const r = read({ STRIPE_MODE: undefined, PAYMENTS_RETURN_ORIGINS: undefined, STRIPE_API_BASE: undefined, STRIPE_CONNECT_COUNTRY: 'us' });
    expect(r.ok && r.env.apiBase).toBe(null);
    expect(r.ok && r.env.returnOrigins).toEqual(['ojoro://']);
    expect(r.ok && r.env.connectCountry).toBe('US');
    const https = read({ STRIPE_API_BASE: 'https://localhost' });
    expect(https.ok && https.env.apiBase).toEqual({ protocol: 'https', host: 'localhost', port: 443 });
  });
});

describe('signatures', () => {
  const payload = JSON.stringify(buildTestStripeEvent('checkout.session.completed', { id: 'cs_1' }, { id: 'evt_1' }));

  it('accepts what the contracts test helper signs (Stripe’s scheme)', async () => {
    const header = await stripeTestSignatureHeader(payload, LOCAL_TEST_WEBHOOK_SECRET, 1_800_000_000);
    expect(await verifyStripeSignature(payload, header, ['whsec_other', LOCAL_TEST_WEBHOOK_SECRET], { nowSeconds: 1_800_000_010 })).toBe('ok');
  });

  it('rejects a changed body, an old timestamp, junk and nothing', async () => {
    const header = await stripeTestSignatureHeader(payload, LOCAL_TEST_WEBHOOK_SECRET, 1_800_000_000);
    expect(await verifyStripeSignature(`${payload} `, header, [LOCAL_TEST_WEBHOOK_SECRET], { nowSeconds: 1_800_000_000 })).toBe('mismatch');
    expect(await verifyStripeSignature(payload, header, [LOCAL_TEST_WEBHOOK_SECRET], { nowSeconds: 1_800_000_301 })).toBe('too_old');
    expect(await verifyStripeSignature(payload, 't=abc,v1=', [LOCAL_TEST_WEBHOOK_SECRET])).toBe('malformed');
    expect(await verifyStripeSignature(payload, null, [LOCAL_TEST_WEBHOOK_SECRET])).toBe('missing');
  });

  it('compares in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
  });
});

describe('return links', () => {
  it('sends checkout and connect returns to the app', () => {
    const e = env();
    const a = handleReturn(new URL(`https://fn.test/payments-return?to=checkout&checkout_id=${CHECKOUT}&result=success&app=http%3A%2F%2Flocalhost%3A8100%2F`), e);
    expect(a).toMatchObject({ status: 302, headers: { Location: `http://localhost:8100/pay/return?checkout_id=${CHECKOUT}&result=success` } });
    const b = handleReturn(new URL(`https://fn.test/payments-return?to=connect&program_id=${PROGRAM}&result=refresh`), e);
    expect(b.headers?.Location).toBe(`ojoro://host/${PROGRAM}/payments?connect=refresh`);
  });

  it('never redirects to an origin that is not allowed', () => {
    expect(appBase('https://evil.test/', ['ojoro://'])).toBe('ojoro://');
    expect(appBase(42, ['ojoro://'])).toBe('ojoro://');
    expect(appBase('ojoro://', [])).toBe('ojoro://');
    const a = handleReturn(new URL(`https://fn.test/payments-return?to=checkout&checkout_id=${CHECKOUT}&result=cancel&app=https%3A%2F%2Fevil.test`), env());
    expect(a.headers?.Location).toBe(`ojoro://pay/return?checkout_id=${CHECKOUT}&result=cancel`);
  });

  it('refuses malformed returns', () => {
    expect(handleReturn(new URL('https://fn.test/payments-return?to=checkout&checkout_id=x&result=success'), env()).status).toBe(400);
    expect(handleReturn(new URL(`https://fn.test/payments-return?to=connect&program_id=${PROGRAM}&result=other`), env()).status).toBe(400);
    expect(handleReturn(new URL('https://fn.test/payments-return'), env()).status).toBe(400);
  });
});

describe('buildCheckoutSessionParams', () => {
  const urls = { success: 'https://fn.test/s', cancel: 'https://fn.test/c' };

  it('makes a one-time destination charge with the placeholder fee', () => {
    const p = buildCheckoutSessionParams(params(), urls);
    expect(p).toMatchObject({
      mode: 'payment',
      client_reference_id: CHECKOUT,
      expires_at: 1900000000,
      line_items: [{ quantity: 1, price_data: { currency: 'cad', unit_amount: 7000, product_data: { name: 'Plateau Pickup · 10-pack', description: '10 sessions' } } }],
      payment_intent_data: { application_fee_amount: 560, transfer_data: { destination: 'acct_host' } },
    });
    expect(p).not.toHaveProperty('subscription_data');
  });

  it('makes a monthly subscription for memberships', () => {
    const p = buildCheckoutSessionParams(params({ kind: 'monthly', amount_cents: 3500, item_description: null }), urls);
    expect(p).toMatchObject({
      mode: 'subscription',
      subscription_data: { application_fee_percent: 8, transfer_data: { destination: 'acct_host' } },
    });
    const item = (p.line_items as Array<{ price_data: Record<string, unknown> }>)[0]!;
    expect(item.price_data.recurring).toEqual({ interval: 'month' });
    expect(item.price_data.product_data).toEqual({ name: 'Plateau Pickup · 10-pack' });
    expect(p).not.toHaveProperty('payment_intent_data');
  });

  it('asks for an Express account paid out on Fridays', () => {
    expect(buildAccountParams({ program_id: PROGRAM, program_name: 'Plateau Pickup' }, 'CA')).toMatchObject({
      type: 'express',
      country: 'CA',
      metadata: { ojoro_program_id: PROGRAM },
      settings: { payouts: { schedule: { interval: 'weekly', weekly_anchor: 'friday' } } },
    });
  });
});

describe('handleCheckout', () => {
  it('needs a user, a key and exactly one target', async () => {
    const d = deps(fakeDb({}));
    expect((await handleCheckout({}, null, d)).status).toBe(401);
    expect(await handleCheckout({ pass_id: PASS }, 'jwt', d)).toMatchObject({ status: 400, body: { error: { message: 'idempotency_key_required' } } });
    expect(await handleCheckout({ idempotency_key: KEY }, 'jwt', d)).toMatchObject({ body: { error: { message: 'checkout_invalid', details: 'target' } } });
    expect(await handleCheckout({ idempotency_key: KEY, pass_id: PASS, session_id: PASS }, 'jwt', d)).toMatchObject({ status: 400 });
    expect(await handleCheckout({ idempotency_key: KEY, pass_id: 'nope' }, 'jwt', d)).toMatchObject({ status: 400 });
  });

  it('prices on the server, calls Stripe with our idempotency key and stores the session', async () => {
    const db = fakeDb({
      begin_host_checkout: () => ({ checkout_id: CHECKOUT, status: 'creating' }),
      payments_checkout_params_for: () => params(),
      payments_attach_checkout: (args) => ({ status: 'open', url: args.p_url, expires_at: args.p_expires_at }),
    });
    const stripe = fakeStripe();
    const a = await handleCheckout({ idempotency_key: KEY, pass_id: PASS, return_to: 'http://localhost:8100/', price_cents: 1 }, 'jwt', deps(db, stripe));
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ checkout_id: CHECKOUT, url: 'https://checkout.stripe.test/c/1', status: 'open', amount_cents: 7000 });
    expect(db.calls[0]).toMatchObject({ fn: 'begin_host_checkout', args: { p_pass_id: PASS, p_session_id: null }, auth: { as: 'user', jwt: 'jwt' } });
    // The client's price_cents is never passed on.
    expect(JSON.stringify(db.calls[0]!.args)).not.toContain('price');
    const create = stripe.checkout.sessions.create as unknown as ReturnType<typeof vi.fn>;
    const [sent, opts] = create.mock.calls[0]!;
    expect(opts).toEqual({ idempotencyKey: `ojoro-checkout-${CHECKOUT}` });
    expect(sent.success_url).toContain('payments-return?to=checkout');
    expect(sent.success_url).toContain(encodeURIComponent('http://localhost:8100/'));
    expect(db.calls[2]).toMatchObject({ fn: 'payments_attach_checkout', auth: { as: 'service' }, args: { p_provider_session_id: 'cs_test_1' } });
  });

  it('resumes an open checkout without a second Stripe call', async () => {
    const db = fakeDb({
      begin_host_checkout: () => ({ checkout_id: CHECKOUT, status: 'open' }),
      payments_checkout_params_for: () => params({ status: 'open', url: 'https://checkout.stripe.test/c/1' }),
    });
    const stripe = fakeStripe();
    const a = await handleCheckout({ idempotency_key: KEY, pass_id: PASS }, 'jwt', deps(db, stripe));
    expect(a.body).toMatchObject({ url: 'https://checkout.stripe.test/c/1', status: 'open' });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('maps database refusals and Stripe failures to codes', async () => {
    const refused = fakeDb({ begin_host_checkout: () => { throw new DbError(400, 'payments_not_connected', null); } });
    expect(await handleCheckout({ idempotency_key: KEY, pass_id: PASS }, 'jwt', deps(refused))).toMatchObject({
      status: 400,
      body: { error: { code: 'P0001', message: 'payments_not_connected' } },
    });
    const db = fakeDb({
      begin_host_checkout: () => ({ checkout_id: CHECKOUT, status: 'creating' }),
      payments_checkout_params_for: () => params(),
    });
    const down = fakeStripe({
      checkout: { sessions: { create: vi.fn(async () => { throw Object.assign(new Error('x'), { type: 'StripeConnectionError' }); }) } },
    });
    const d = deps(db, down);
    expect(await handleCheckout({ idempotency_key: KEY, pass_id: PASS }, 'jwt', d)).toMatchObject({
      status: 502,
      body: { error: { message: 'payments_unavailable', details: 'provider_error' } },
    });
    expect(d.logs).toEqual([{ event: 'stripe_checkout_failed', checkout_id: CHECKOUT, type: 'StripeConnectionError', code: null }]);
    const noUrl = fakeStripe({ checkout: { sessions: { create: vi.fn(async () => ({ id: 'cs_1', url: null })) } } });
    expect((await handleCheckout({ idempotency_key: KEY, pass_id: PASS }, 'jwt', deps(db, noUrl))).status).toBe(502);
    const boom = fakeDb({ begin_host_checkout: () => { throw new TypeError('boom'); } });
    await expect(handleCheckout({ idempotency_key: KEY, pass_id: PASS }, 'jwt', deps(boom))).rejects.toThrow('boom');
  });
});

describe('handleConnect', () => {
  const ctx = (account_id: string | null, details_submitted = false) => ({
    program_id: PROGRAM,
    program_name: 'Plateau Pickup',
    user_id: UID,
    account: { account_id, details_submitted },
  });

  it('makes the Express account once and hands back an onboarding link', async () => {
    const db = fakeDb({
      payments_connect_context: () => ctx(null),
      payments_attach_account: (args) => ({ account_id: args.p_account_id }),
      payments_update_account: () => ({}),
      host_payment_account: () => ({ status: 'onboarding', account_id: 'acct_new' }),
    });
    const stripe = fakeStripe();
    const a = await handleConnect({ action: 'onboard', program_id: PROGRAM, idempotency_key: KEY }, 'jwt', deps(db, stripe));
    expect(a).toMatchObject({ status: 200, body: { url: 'https://connect.stripe.test/setup', account: { status: 'onboarding' } } });
    expect((stripe.accounts.create as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual({ idempotencyKey: `ojoro-account-${PROGRAM}` });
    const [link, opts] = (stripe.accountLinks.create as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(link).toMatchObject({ account: 'acct_new', type: 'account_onboarding' });
    expect(link.return_url).toContain('result=return');
    expect(opts).toEqual({ idempotencyKey: `ojoro-link-${PROGRAM}-${KEY}` });

    const again = fakeDb({ payments_connect_context: () => ctx('acct_old'), host_payment_account: () => ({}) });
    const s2 = fakeStripe();
    await handleConnect({ action: 'onboard', program_id: PROGRAM, idempotency_key: KEY }, 'jwt', deps(again, s2));
    expect(s2.accounts.create).not.toHaveBeenCalled();
  });

  it('opens the dashboard only once details are in', async () => {
    const early = fakeDb({ payments_connect_context: () => ctx('acct_1', false) });
    expect(await handleConnect({ action: 'dashboard', program_id: PROGRAM, idempotency_key: KEY }, 'jwt', deps(early))).toMatchObject({
      body: { error: { message: 'payments_not_connected' } },
    });
    const ready = fakeDb({ payments_connect_context: () => ctx('acct_1', true) });
    expect(await handleConnect({ action: 'dashboard', program_id: PROGRAM, idempotency_key: KEY }, 'jwt', deps(ready))).toMatchObject({
      body: { url: 'https://connect.stripe.test/express/login' },
    });
    const down = fakeStripe({ accounts: { createLoginLink: vi.fn(async () => { throw new Error('x'); }) } });
    expect((await handleConnect({ action: 'dashboard', program_id: PROGRAM, idempotency_key: KEY }, 'jwt', deps(ready, down))).status).toBe(502);
  });

  it('refreshes from Stripe', async () => {
    const db = fakeDb({
      host_payment_account: () => ({ account_id: 'acct_1', status: 'ready' }),
      payments_update_account: () => ({}),
    });
    const a = await handleConnect({ action: 'refresh', program_id: PROGRAM }, 'jwt', deps(db));
    expect(a.body).toMatchObject({ account: { status: 'ready' } });
    expect(db.calls.map((c) => c.fn)).toEqual(['host_payment_account', 'payments_update_account', 'host_payment_account']);
    const none = fakeDb({ host_payment_account: () => ({ account_id: null }) });
    expect((await handleConnect({ action: 'refresh', program_id: PROGRAM }, 'jwt', deps(none))).body).toEqual({ account: { account_id: null } });
    const down = fakeStripe({ accounts: { retrieve: vi.fn(async () => { throw new Error('x'); }) } });
    expect((await handleConnect({ action: 'refresh', program_id: PROGRAM }, 'jwt', deps(db, down))).status).toBe(502);
  });

  it('checks its input and maps refusals', async () => {
    const d = deps(fakeDb({ payments_connect_context: () => { throw new DbError(400, 'owner_required', null); } }));
    expect((await handleConnect({}, null, d)).status).toBe(401);
    expect((await handleConnect({ action: 'onboard' }, 'jwt', d)).status).toBe(400);
    expect((await handleConnect({ action: 'nope', program_id: PROGRAM }, 'jwt', d)).status).toBe(400);
    expect((await handleConnect({ action: 'onboard', program_id: PROGRAM }, 'jwt', d)).status).toBe(400);
    expect(await handleConnect({ action: 'onboard', program_id: PROGRAM, idempotency_key: KEY }, 'jwt', d)).toMatchObject({
      status: 403,
      body: { error: { message: 'owner_required' } },
    });
    const down = fakeStripe({ accountLinks: { create: vi.fn(async () => { throw new Error('x'); }) } });
    const db = fakeDb({ payments_connect_context: () => ctx('acct_1') });
    expect((await handleConnect({ action: 'onboard', program_id: PROGRAM, idempotency_key: KEY }, 'jwt', deps(db, down))).status).toBe(502);
  });
});

describe('handleWebhook', () => {
  async function signed(event: object, secret = LOCAL_TEST_WEBHOOK_SECRET) {
    const body = JSON.stringify(event);
    return { body, header: await stripeTestSignatureHeader(body, secret) };
  }

  it('records a verified event once and drains the queue', async () => {
    const db = fakeDb({
      payments_record_stripe_event: () => ({ result: 'processed', type: 'checkout.session.completed' }),
      payments_claim_outbox: () => [],
    });
    const { body, header } = await signed(buildTestStripeEvent('checkout.session.completed', { id: 'cs_1' }));
    const a = await handleWebhook(body, header, deps(db));
    expect(a).toEqual({ status: 200, body: { received: true, result: 'processed' } });
    expect(db.calls.map((c) => c.fn)).toEqual(['payments_record_stripe_event', 'payments_claim_outbox']);
    expect(db.calls[0]!.auth).toEqual({ as: 'service' });
  });

  it('answers duplicates without draining', async () => {
    const db = fakeDb({ payments_record_stripe_event: () => ({ result: 'duplicate' }) });
    const { body, header } = await signed(buildTestStripeEvent('invoice.paid', {}));
    expect((await handleWebhook(body, header, deps(db))).body).toEqual({ received: true, result: 'duplicate' });
    expect(db.calls).toHaveLength(1);
  });

  it('rejects bad signatures, junk and live events', async () => {
    const db = fakeDb({});
    const { body } = await signed(buildTestStripeEvent('invoice.paid', {}));
    const wrong = await stripeTestSignatureHeader(body, 'whsec_wrong');
    expect((await handleWebhook(body, wrong, deps(db))).status).toBe(400);
    const junk = await signed({} as object);
    const notJson = 'not json';
    expect((await handleWebhook(notJson, await stripeTestSignatureHeader(notJson), deps(db))).status).toBe(400);
    const live = await signed({ ...buildTestStripeEvent('invoice.paid', {}), livemode: true });
    expect((await handleWebhook(live.body, live.header, deps(db))).body).toEqual({ received: true, result: 'refused_livemode' });
    expect(db.calls).toHaveLength(0);
    expect(junk.body).toBe('{}');
    expect((await handleWebhook(body, null, deps(db, fakeStripe(), env({ webhookSecrets: [] })))).status).toBe(500);
  });

  it('asks Stripe to retry when recording fails, and refuses malformed events', async () => {
    const { body, header } = await signed(buildTestStripeEvent('invoice.paid', {}));
    const down = fakeDb({ payments_record_stripe_event: () => { throw new DbError(500, 'unknown', null); } });
    expect((await handleWebhook(body, header, deps(down))).status).toBe(500);
    const bad = fakeDb({ payments_record_stripe_event: () => { throw new DbError(400, 'invalid_argument', 'event'); } });
    expect((await handleWebhook(body, header, deps(bad))).status).toBe(400);
    const drainDown = fakeDb({
      payments_record_stripe_event: () => ({ result: 'processed' }),
      payments_claim_outbox: () => { throw new Error('x'); },
    });
    expect((await handleWebhook(body, header, deps(drainDown))).status).toBe(200);
  });
});

describe('the queue', () => {
  const refundJob: OutboxJob = {
    job_id: 'j1',
    kind: 'refund',
    attempts: 1,
    idempotency_key: 'ojoro-refund-r1',
    amount_cents: 800,
    currency: 'CAD',
    payment_intent: 'pi_1',
    invoice: null,
    metadata: { ojoro_refund_id: 'r1' },
  };

  it('sends refunds with our key, reversing the transfer and the fee', async () => {
    const stripe = fakeStripe();
    expect(await runJob(refundJob, stripe)).toEqual({ ref: 're_1', status: 'succeeded' });
    expect((stripe.refunds.create as unknown as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([
      { payment_intent: 'pi_1', amount: 800, reverse_transfer: true, refund_application_fee: true, metadata: { ojoro_refund_id: 'r1' } },
      { idempotencyKey: 'ojoro-refund-r1' },
    ]);
  });

  it('finds the PaymentIntent of a subscription invoice', async () => {
    const stripe = fakeStripe();
    await runJob({ ...refundJob, payment_intent: null, invoice: 'in_1' }, stripe);
    expect((stripe.refunds.create as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0].payment_intent).toBe('pi_from_invoice');
    const old = fakeStripe({ invoicePayments: { list: vi.fn(async () => { throw new Error('404'); }) } });
    await runJob({ ...refundJob, payment_intent: null, invoice: 'in_1' }, old);
    expect((old.refunds.create as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0].payment_intent).toBe('pi_old_shape');
    const none = fakeStripe({ invoicePayments: undefined, invoices: { retrieve: vi.fn(async () => ({})) } });
    await expect(runJob({ ...refundJob, payment_intent: null, invoice: 'in_1' }, none)).rejects.toThrow('no_payment_intent');
  });

  it('sets subscriptions to match the membership', async () => {
    const stripe = fakeStripe();
    const sub = { job_id: 'j2', kind: 'sync_subscription' as const, attempts: 1, idempotency_key: 'ojoro-sub-j2', subscription: 'sub_1' };
    await runJob({ ...sub, want: 'cancel_at_period_end' }, stripe);
    await runJob({ ...sub, want: 'renew' }, stripe);
    await runJob({ ...sub, want: 'cancel_now' }, stripe);
    const update = (stripe.subscriptions.update as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(update[0]).toEqual(['sub_1', { cancel_at_period_end: true }, { idempotencyKey: 'ojoro-sub-j2' }]);
    expect(update[1]![1]).toEqual({ cancel_at_period_end: false });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1', {}, { idempotencyKey: 'ojoro-sub-j2' });
    const gone = fakeStripe({
      subscriptions: { cancel: vi.fn(async () => { throw Object.assign(new Error('x'), { type: 'StripeInvalidRequestError', statusCode: 404, code: 'resource_missing' }); }), update: vi.fn() },
    });
    expect(await runJob({ ...sub, want: 'cancel_now' }, gone)).toEqual({ ref: 'sub_1', status: 'canceled' });
    await expect(runJob({ ...sub, want: 'cancel_now', subscription: undefined }, stripe)).rejects.toThrow('no_subscription');
    const bad = fakeStripe({ subscriptions: { update: vi.fn(async () => { throw new Error('x'); }), cancel: vi.fn() } });
    await expect(runJob({ ...sub, want: 'renew' }, bad)).rejects.toThrow('x');
  });

  it('records answers and failures (retryable or not)', async () => {
    const failures: unknown[] = [];
    const db = fakeDb({
      payments_claim_outbox: () => [refundJob, { ...refundJob, job_id: 'j3' }, { ...refundJob, job_id: 'j4' }],
      payments_complete_outbox: () => null,
      payments_fail_outbox: (args) => {
        failures.push(args);
        return args.p_retryable ? 'queued' : 'failed';
      },
    });
    let n = 0;
    const stripe = fakeStripe({
      refunds: {
        create: vi.fn(async () => {
          n += 1;
          if (n === 2) throw Object.assign(new Error('x'), { type: 'StripeConnectionError' });
          if (n === 3) throw Object.assign(new Error('x'), { type: 'StripeInvalidRequestError', statusCode: 400, code: 'charge_already_refunded' });
          return { id: 're_ok', status: 'pending' };
        }),
      },
    });
    expect(await drainOutbox(deps(db, stripe))).toEqual({ claimed: 3, done: 1, retried: 1, failed: 1 });
    expect(db.calls.find((c) => c.fn === 'payments_complete_outbox')!.args).toEqual({ p_job_id: 'j1', p_result_ref: 're_ok', p_provider_status: 'pending' });
    expect(failures).toEqual([
      { p_job_id: 'j3', p_error: 'StripeConnectionError:', p_retryable: true },
      { p_job_id: 'j4', p_error: 'StripeInvalidRequestError:charge_already_refunded', p_retryable: false },
    ]);
    const dbDown = fakeDb({ payments_claim_outbox: () => [refundJob], payments_complete_outbox: () => { throw new DbError(500, 'unknown', null); } });
    await expect(drainOutbox(deps(dbDown))).rejects.toBeInstanceOf(DbError);
  });

  it('classifies Stripe failures', () => {
    expect(stripeFailure(Object.assign(new Error(), { type: 'StripeRateLimitError', statusCode: 429 }))).toMatchObject({ retryable: true });
    expect(stripeFailure(Object.assign(new Error(), { type: 'StripeAPIError', statusCode: 500 }))).toMatchObject({ retryable: true });
    expect(stripeFailure(Object.assign(new Error(), { type: 'StripeCardError', statusCode: 402, code: 'card_declined' }))).toEqual({
      type: 'StripeCardError',
      code: 'card_declined',
      retryable: false,
      missing: false,
    });
    expect(stripeFailure(null)).toMatchObject({ type: 'Error', retryable: true });
  });

  it('only drains with the cron secret', async () => {
    const db = fakeDb({ payments_claim_outbox: (args) => (args.p_limit === 5 ? [] : [refundJob].slice(0, 0)) });
    const req = (auth?: string, body = '{"limit":5}') =>
      new Request('https://fn.test/payments-drain', { method: 'POST', body, headers: auth ? { Authorization: auth } : {} });
    expect((await handleDrain(req(), deps(db))).status).toBe(401);
    expect((await handleDrain(req('Bearer nope'), deps(db))).status).toBe(401);
    expect((await handleDrain(req('Bearer cron-secret'), deps(db, fakeStripe(), env({ cronSecret: null })))).status).toBe(401);
    expect(await handleDrain(req('Bearer cron-secret'), deps(db))).toEqual({ status: 200, body: { claimed: 0, done: 0, retried: 0, failed: 0 } });
    expect(db.calls.at(-1)!.args).toEqual({ p_limit: 5 });
    await handleDrain(req('Bearer cron-secret', ''), deps(db));
    expect(db.calls.at(-1)!.args).toEqual({ p_limit: 20 });
  });
});

describe('restDb and answers', () => {
  function fetchReturning(status: number, body: unknown) {
    return vi.fn(async () => new Response(body === undefined ? '' : JSON.stringify(body), { status })) as unknown as typeof fetch;
  }
  const e = env();

  it('calls PostgREST as the user or the service role', async () => {
    const f = fetchReturning(200, { ok: 1 });
    const db = restDb(e, f);
    expect(await db.rpc('payment_checkout', { p_checkout_id: CHECKOUT }, { as: 'user', jwt: 'user-jwt' })).toEqual({ ok: 1 });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://db.test/rest/v1/rpc/payment_checkout');
    expect(init.headers).toMatchObject({ apikey: 'anon', Authorization: 'Bearer user-jwt' });
    await db.rpc('payments_claim_outbox', {}, { as: 'service' });
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[1]![1].headers).toMatchObject({ apikey: 'service', Authorization: 'Bearer service' });
    expect(await restDb(e, fetchReturning(200, undefined)).rpc('x', {}, { as: 'service' })).toBe(null);
  });

  it('turns errors into Ojoro codes', async () => {
    const err = (status: number, body: unknown) => restDb(e, fetchReturning(status, body)).rpc('x', {}, { as: 'service' }).catch((x) => x);
    expect(await err(400, { code: 'P0001', message: 'nothing_to_pay', details: 'member' })).toMatchObject({ code: 'nothing_to_pay', detail: 'member' });
    expect(await err(401, { code: 'PGRST301', message: 'JWT expired' })).toMatchObject({ code: 'not_authenticated' });
    expect(await err(403, { code: '42501', message: 'permission denied' })).toMatchObject({ code: 'permission_denied' });
    expect(await err(500, undefined)).toMatchObject({ code: 'unknown', detail: null });
    const junk = restDb(e, vi.fn(async () => new Response('<html>', { status: 502 })) as unknown as typeof fetch);
    expect(await junk.rpc('x', {}, { as: 'service' }).catch((x) => x)).toMatchObject({ code: 'unknown' });
  });

  it('answers with CORS and the PostgREST error shape', async () => {
    expect(dbErrorAnswer(new DbError(400, 'not_authenticated', null)).status).toBe(401);
    expect(dbErrorAnswer(new DbError(400, 'permission_denied', null)).status).toBe(403);
    expect(dbErrorAnswer(new DbError(500, 'unknown', null)).status).toBe(500);
    const r = toResponse({ status: 400, body: { error: { message: 'x' } } });
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await r.json()).toEqual({ error: { message: 'x' } });
    const empty = toResponse({ status: 204 });
    expect(empty.status).toBe(204);
    expect(await empty.text()).toBe('');
  });
});
