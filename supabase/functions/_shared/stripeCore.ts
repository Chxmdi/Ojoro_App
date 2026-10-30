// Payments (Stripe, TEST MODE ONLY): the logic behind the payments-* and stripe-webhook Edge Functions
// (docs/PAYMENTS_CONTRACT.md). Pure TypeScript with injected Stripe / database / fetch, so it runs
// under Deno (the functions) and under vitest (stripeCore.test.ts). The Deno adapter that makes the
// real clients is ./stripe.ts.
//
// Rules kept here:
//   - Live mode is impossible: keys must be sk_test_ / rk_test_, STRIPE_MODE must be test.
//   - Every Stripe write sends an Idempotency-Key derived from our own ids.
//   - Prices, fees and metadata come from the database (begin_host_checkout); the client sends none.
//   - Secrets are never logged or echoed.

// Configuration -----------------------------------------------------------------------------------------

export interface PaymentsEnv {
  secretKey: string;
  webhookSecrets: string[];
  apiBase: { protocol: 'http' | 'https'; host: string; port: number } | null;
  connectCountry: string;
  cronSecret: string | null;
  functionsUrl: string;
  returnOrigins: string[];
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

export type EnvResult =
  | { ok: true; env: PaymentsEnv }
  | { ok: false; detail: 'not_configured' | 'live_mode_off' };

/** Read and check the functions' environment. Refuses live keys and any mode but test. */
export function readPaymentsEnv(get: (name: string) => string | undefined): EnvResult {
  const key = get('STRIPE_SECRET_KEY')?.trim() ?? '';
  const mode = (get('STRIPE_MODE') ?? 'test').trim().toLowerCase();
  if (/^(sk|rk)_live_/.test(key) || mode !== 'test') return { ok: false, detail: 'live_mode_off' };
  const supabaseUrl = get('SUPABASE_URL')?.replace(/\/+$/, '') ?? '';
  const anonKey = get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!/^(sk|rk)_test_/.test(key) || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return { ok: false, detail: 'not_configured' };
  }
  let apiBase: PaymentsEnv['apiBase'] = null;
  const rawBase = get('STRIPE_API_BASE')?.trim();
  if (rawBase) {
    try {
      const u = new URL(rawBase);
      const protocol = u.protocol === 'http:' ? 'http' : 'https';
      apiBase = { protocol, host: u.hostname, port: u.port ? Number(u.port) : protocol === 'http' ? 80 : 443 };
    } catch {
      return { ok: false, detail: 'not_configured' };
    }
  }
  const webhookSecrets = [get('STRIPE_WEBHOOK_SECRET'), get('STRIPE_CONNECT_WEBHOOK_SECRET')]
    .map((s) => s?.trim() ?? '')
    .filter((s) => s.startsWith('whsec_'));
  const functionsUrl = (get('PAYMENTS_FUNCTIONS_URL') ?? `${supabaseUrl}/functions/v1`).replace(/\/+$/, '');
  const returnOrigins = (get('PAYMENTS_RETURN_ORIGINS') ?? 'ojoro://')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    ok: true,
    env: {
      secretKey: key,
      webhookSecrets,
      apiBase,
      connectCountry: (get('STRIPE_CONNECT_COUNTRY') ?? 'CA').trim().toUpperCase() || 'CA',
      cronSecret: get('PAYMENTS_CRON_SECRET')?.trim() || null,
      functionsUrl,
      returnOrigins: returnOrigins.length ? returnOrigins : ['ojoro://'],
      supabaseUrl,
      anonKey,
      serviceRoleKey,
    },
  };
}

// HTTP helpers ----------------------------------------------------------------------------------------------

export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export interface HttpAnswer {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export function toResponse(a: HttpAnswer): Response {
  const headers: Record<string, string> = { ...CORS, ...(a.headers ?? {}) };
  if (a.body === undefined) return new Response(null, { status: a.status, headers });
  return new Response(JSON.stringify(a.body), {
    status: a.status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** The error body the app maps with paymentsFunctionError / toOjoroError (PostgREST shape). */
export function errorAnswer(code: string, detail: string | null, status: number): HttpAnswer {
  return { status, body: { error: { code: 'P0001', message: code, details: detail ?? '' } } };
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && uuidRe.test(v);
}

export function bearer(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.get('Authorization') ?? '');
  return m ? m[1]! : null;
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Database (PostgREST RPC) ------------------------------------------------------------------------------------

export class DbError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string | null,
  ) {
    super(code);
  }
}

export type DbAuth = { as: 'service' } | { as: 'user'; jwt: string };

export interface Db {
  rpc<T = unknown>(fn: string, args: Record<string, unknown>, auth: DbAuth): Promise<T>;
}

/** A PostgREST RPC client over fetch. */
export function restDb(env: Pick<PaymentsEnv, 'supabaseUrl' | 'anonKey' | 'serviceRoleKey'>, f: typeof fetch): Db {
  return {
    async rpc<T>(fn: string, args: Record<string, unknown>, auth: DbAuth): Promise<T> {
      const token = auth.as === 'service' ? env.serviceRoleKey : auth.jwt;
      const res = await f(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          apikey: auth.as === 'service' ? env.serviceRoleKey : env.anonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      if (!res.ok) {
        const b = (body ?? {}) as { code?: string; message?: string; details?: string };
        // P0001 = an Ojoro code in message; 42501 / PGRST301 = not allowed / bad JWT.
        const code =
          b.code === 'P0001' && b.message
            ? b.message
            : res.status === 401 || b.code === 'PGRST301'
              ? 'not_authenticated'
              : b.code === '42501'
                ? 'permission_denied'
                : 'unknown';
        throw new DbError(res.status, code, b.details && b.details !== '' ? b.details : null);
      }
      return body as T;
    },
  };
}

export function dbErrorAnswer(e: DbError): HttpAnswer {
  const status =
    e.code === 'not_authenticated'
      ? 401
      : e.code === 'permission_denied' || e.code === 'owner_required' || e.code === 'not_program_host'
        ? 403
        : 400;
  return errorAnswer(e.code, e.detail, e.code === 'unknown' ? 500 : status);
}

// Stripe (the subset we call) ---------------------------------------------------------------------------------

export interface StripeRequestOptions {
  idempotencyKey?: string;
}

export interface StripeLike {
  accounts: {
    create(params: Record<string, unknown>, options?: StripeRequestOptions): Promise<{ id: string } & Record<string, unknown>>;
    retrieve(id: string): Promise<Record<string, unknown> & { id: string }>;
    createLoginLink(id: string, params?: Record<string, unknown>, options?: StripeRequestOptions): Promise<{ url: string }>;
  };
  accountLinks: {
    create(params: Record<string, unknown>, options?: StripeRequestOptions): Promise<{ url: string; expires_at?: number }>;
  };
  checkout: {
    sessions: {
      create(
        params: Record<string, unknown>,
        options?: StripeRequestOptions,
      ): Promise<{ id: string; url: string | null; expires_at?: number }>;
    };
  };
  refunds: {
    create(params: Record<string, unknown>, options?: StripeRequestOptions): Promise<{ id: string; status: string | null }>;
  };
  subscriptions: {
    update(id: string, params: Record<string, unknown>, options?: StripeRequestOptions): Promise<{ id: string; status: string }>;
    cancel(id: string, params?: Record<string, unknown>, options?: StripeRequestOptions): Promise<{ id: string; status: string }>;
  };
  invoicePayments?: {
    list(params: Record<string, unknown>): Promise<{ data: Array<{ payment?: { payment_intent?: string | null } }> }>;
  };
  invoices: {
    retrieve(id: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
}

/** What we log and answer about a Stripe failure: its type / code, never the request or keys. */
export function stripeFailure(e: unknown): { type: string; code: string | null; retryable: boolean; missing: boolean } {
  const err = (e ?? {}) as { type?: string; code?: string; statusCode?: number; rawType?: string };
  const type = typeof err.type === 'string' ? err.type : 'Error';
  const status = typeof err.statusCode === 'number' ? err.statusCode : null;
  const retryable =
    type === 'StripeConnectionError' ||
    type === 'StripeAPIError' ||
    type === 'StripeRateLimitError' ||
    status === null ||
    status >= 500 ||
    status === 429;
  return { type, code: typeof err.code === 'string' ? err.code : null, retryable, missing: err.code === 'resource_missing' };
}

// Return links ------------------------------------------------------------------------------------------------

/** The app base a return link goes to: the requested one if allowed, else the first allowed one. */
export function appBase(requested: unknown, allowed: string[]): string {
  const fallback = allowed[0] ?? 'ojoro://';
  if (typeof requested !== 'string' || requested.length > 200) return fallback;
  return allowed.some((origin) => requested.startsWith(origin)) ? requested : fallback;
}

function withSlash(app: string): string {
  return app.endsWith('/') || app.endsWith('://') ? app : `${app}/`;
}

export function functionReturnUrl(
  env: Pick<PaymentsEnv, 'functionsUrl'>,
  params: Record<string, string>,
): string {
  return `${env.functionsUrl}/payments-return?${new URLSearchParams(params).toString()}`;
}

/** payments-return: GET from Stripe's hosted page → 302 to the app. */
export function handleReturn(url: URL, env: Pick<PaymentsEnv, 'returnOrigins'>): HttpAnswer {
  const to = url.searchParams.get('to');
  const app = withSlash(appBase(url.searchParams.get('app'), env.returnOrigins));
  const result = url.searchParams.get('result') ?? '';
  let location: string | null = null;
  if (to === 'checkout') {
    const id = url.searchParams.get('checkout_id');
    if (isUuid(id) && (result === 'success' || result === 'cancel')) {
      location = `${app}pay/return?checkout_id=${id}&result=${result}`;
    }
  } else if (to === 'connect') {
    const id = url.searchParams.get('program_id');
    if (isUuid(id) && (result === 'return' || result === 'refresh')) {
      location = `${app}host/${id}/payments?connect=${result}`;
    }
  }
  if (!location) return { status: 400, body: { error: 'bad_return' } };
  return { status: 302, headers: { Location: location, 'Cache-Control': 'no-store' } };
}

// Checkout ----------------------------------------------------------------------------------------------------

/** What begin_host_checkout + payments_checkout_params_for give back (snake_case jsonb). */
export interface CheckoutParams {
  checkout_id: string;
  status: string;
  kind: 'drop_in' | 'pack' | 'monthly';
  program_id: string;
  user_id: string;
  account_id: string;
  amount_cents: number;
  currency: string;
  application_fee_cents: number;
  application_fee_percent: number;
  provider_session_id: string | null;
  url: string | null;
  expires_at: string | null;
  expires_at_unix: number;
  item_name: string;
  item_description: string | null;
  metadata: Record<string, string>;
}

/** The Checkout Session we ask Stripe for: hosted page, destination charge, placeholder fee. */
export function buildCheckoutSessionParams(
  p: CheckoutParams,
  urls: { success: string; cancel: string },
): Record<string, unknown> {
  const subscription = p.kind === 'monthly';
  const product: Record<string, unknown> = { name: p.item_name };
  if (p.item_description) product.description = p.item_description;
  const priceData: Record<string, unknown> = {
    currency: p.currency.toLowerCase(),
    unit_amount: p.amount_cents,
    product_data: product,
  };
  if (subscription) priceData.recurring = { interval: 'month' };
  const params: Record<string, unknown> = {
    mode: subscription ? 'subscription' : 'payment',
    line_items: [{ quantity: 1, price_data: priceData }],
    client_reference_id: p.checkout_id,
    metadata: p.metadata,
    success_url: urls.success,
    cancel_url: urls.cancel,
    expires_at: p.expires_at_unix,
  };
  if (subscription) {
    params.subscription_data = {
      application_fee_percent: p.application_fee_percent,
      transfer_data: { destination: p.account_id },
      metadata: p.metadata,
    };
  } else {
    params.payment_intent_data = {
      application_fee_amount: p.application_fee_cents,
      transfer_data: { destination: p.account_id },
      metadata: p.metadata,
    };
  }
  return params;
}

export interface Deps {
  env: PaymentsEnv;
  db: Db;
  stripe: StripeLike;
  log?: (event: string, data: Record<string, unknown>) => void;
}

function logOf(deps: Deps) {
  return deps.log ?? (() => undefined);
}

/** payments-checkout: start (or resume) a Stripe Checkout for a pass or a session I'm in. */
export async function handleCheckout(body: unknown, jwt: string | null, deps: Deps): Promise<HttpAnswer> {
  if (!jwt) return errorAnswer('not_authenticated', null, 401);
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isUuid(b.idempotency_key)) return errorAnswer('idempotency_key_required', null, 400);
  const passId = b.pass_id ?? null;
  const sessionId = b.session_id ?? null;
  if ((passId === null) === (sessionId === null) || (passId !== null && !isUuid(passId)) || (sessionId !== null && !isUuid(sessionId))) {
    return errorAnswer('checkout_invalid', 'target', 400);
  }
  try {
    const started = await deps.db.rpc<{ checkout_id: string; status: string }>(
      'begin_host_checkout',
      { p_idempotency_key: b.idempotency_key, p_pass_id: passId, p_session_id: sessionId },
      { as: 'user', jwt },
    );
    const p = await deps.db.rpc<CheckoutParams>('payments_checkout_params_for', { p_checkout_id: started.checkout_id }, { as: 'service' });
    if (p.status !== 'creating') {
      // Already made (a retry, or an open checkout we resume): same answer, no new Stripe call.
      return { status: 200, body: checkoutAnswer(p) };
    }
    const app = appBase(b.return_to, deps.env.returnOrigins);
    const urls = {
      success: functionReturnUrl(deps.env, { to: 'checkout', checkout_id: p.checkout_id, result: 'success', app }),
      cancel: functionReturnUrl(deps.env, { to: 'checkout', checkout_id: p.checkout_id, result: 'cancel', app }),
    };
    let session: { id: string; url: string | null; expires_at?: number };
    try {
      session = await deps.stripe.checkout.sessions.create(buildCheckoutSessionParams(p, urls), {
        idempotencyKey: `ojoro-checkout-${p.checkout_id}`,
      });
    } catch (e) {
      const f = stripeFailure(e);
      logOf(deps)('stripe_checkout_failed', { checkout_id: p.checkout_id, type: f.type, code: f.code });
      return errorAnswer('payments_unavailable', 'provider_error', 502);
    }
    if (!session.url) return errorAnswer('payments_unavailable', 'provider_error', 502);
    const attached = await deps.db.rpc<CheckoutParams>(
      'payments_attach_checkout',
      {
        p_checkout_id: p.checkout_id,
        p_provider_session_id: session.id,
        p_url: session.url,
        p_expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      },
      { as: 'service' },
    );
    return { status: 200, body: checkoutAnswer({ ...p, ...attached }) };
  } catch (e) {
    if (e instanceof DbError) return dbErrorAnswer(e);
    throw e;
  }
}

function checkoutAnswer(p: Pick<CheckoutParams, 'checkout_id' | 'url' | 'status' | 'expires_at' | 'kind' | 'amount_cents' | 'currency'>) {
  return {
    checkout_id: p.checkout_id,
    url: p.url,
    status: p.status,
    expires_at: p.expires_at,
    kind: p.kind,
    amount_cents: p.amount_cents,
    currency: p.currency,
  };
}

// Connect -----------------------------------------------------------------------------------------------------

interface ConnectContext {
  program_id: string;
  program_name: string;
  user_id: string;
  account: { account_id: string | null; details_submitted: boolean } & Record<string, unknown>;
}

export function buildAccountParams(ctx: Pick<ConnectContext, 'program_id' | 'program_name'>, country: string): Record<string, unknown> {
  return {
    type: 'express',
    country,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_profile: { name: ctx.program_name },
    metadata: { ojoro_program_id: ctx.program_id },
    // Payout weeks end on Friday (host_period): ask Stripe to pay out then.
    settings: { payouts: { schedule: { interval: 'weekly', weekly_anchor: 'friday' } } },
  };
}

/** payments-connect: onboard (owner), dashboard (owner), refresh (hosts). */
export async function handleConnect(body: unknown, jwt: string | null, deps: Deps): Promise<HttpAnswer> {
  if (!jwt) return errorAnswer('not_authenticated', null, 401);
  const b = (body ?? {}) as Record<string, unknown>;
  const action = b.action;
  if (!isUuid(b.program_id)) return errorAnswer('invalid_argument', 'program_id', 400);
  const programId = b.program_id;
  try {
    if (action === 'refresh') {
      const account = await deps.db.rpc<{ account_id: string | null }>('host_payment_account', { p_program_id: programId }, { as: 'user', jwt });
      if (!account.account_id) return { status: 200, body: { account } };
      let remote: Record<string, unknown>;
      try {
        remote = await deps.stripe.accounts.retrieve(account.account_id);
      } catch (e) {
        const f = stripeFailure(e);
        logOf(deps)('stripe_account_retrieve_failed', { program_id: programId, type: f.type, code: f.code });
        return errorAnswer('payments_unavailable', 'provider_error', 502);
      }
      await deps.db.rpc('payments_update_account', { p_account: remote }, { as: 'service' });
      const fresh = await deps.db.rpc('host_payment_account', { p_program_id: programId }, { as: 'user', jwt });
      return { status: 200, body: { account: fresh } };
    }
    if (action !== 'onboard' && action !== 'dashboard') return errorAnswer('invalid_argument', 'action', 400);
    if (!isUuid(b.idempotency_key)) return errorAnswer('idempotency_key_required', null, 400);
    const ctx = await deps.db.rpc<ConnectContext>('payments_connect_context', { p_program_id: programId }, { as: 'user', jwt });
    let accountId = ctx.account.account_id;
    if (action === 'dashboard') {
      if (!accountId || !ctx.account.details_submitted) return errorAnswer('payments_not_connected', null, 400);
      try {
        const link = await deps.stripe.accounts.createLoginLink(accountId, {}, {
          idempotencyKey: `ojoro-login-${programId}-${b.idempotency_key}`,
        });
        return { status: 200, body: { url: link.url } };
      } catch (e) {
        const f = stripeFailure(e);
        logOf(deps)('stripe_login_link_failed', { program_id: programId, type: f.type, code: f.code });
        return errorAnswer('payments_unavailable', 'provider_error', 502);
      }
    }
    try {
      if (!accountId) {
        const made = await deps.stripe.accounts.create(buildAccountParams(ctx, deps.env.connectCountry), {
          idempotencyKey: `ojoro-account-${programId}`,
        });
        const stored = await deps.db.rpc<{ account_id: string }>(
          'payments_attach_account',
          { p_program_id: programId, p_account_id: made.id, p_user_id: ctx.user_id },
          { as: 'service' },
        );
        accountId = stored.account_id;
        await deps.db.rpc('payments_update_account', { p_account: made }, { as: 'service' });
      }
      const app = appBase(b.return_to, deps.env.returnOrigins);
      const link = await deps.stripe.accountLinks.create(
        {
          account: accountId,
          type: 'account_onboarding',
          refresh_url: functionReturnUrl(deps.env, { to: 'connect', program_id: programId, result: 'refresh', app }),
          return_url: functionReturnUrl(deps.env, { to: 'connect', program_id: programId, result: 'return', app }),
        },
        { idempotencyKey: `ojoro-link-${programId}-${b.idempotency_key}` },
      );
      const account = await deps.db.rpc('host_payment_account', { p_program_id: programId }, { as: 'user', jwt });
      return { status: 200, body: { url: link.url, account } };
    } catch (e) {
      if (e instanceof DbError) throw e;
      const f = stripeFailure(e);
      logOf(deps)('stripe_onboard_failed', { program_id: programId, type: f.type, code: f.code });
      return errorAnswer('payments_unavailable', 'provider_error', 502);
    }
  } catch (e) {
    if (e instanceof DbError) return dbErrorAnswer(e);
    throw e;
  }
}

// Webhook -----------------------------------------------------------------------------------------------------

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, message: string, subtle: SubtleCrypto): Promise<string> {
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await subtle.sign('HMAC', key, enc.encode(message)));
}

/**
 * Verify a Stripe-Signature header (t=…,v1=…) against any of the endpoint secrets, Stripe's scheme:
 * HMAC-SHA256 of `${t}.${rawBody}`, within `toleranceSeconds` of now.
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secrets: string[],
  options: { nowSeconds?: number; toleranceSeconds?: number; subtle?: SubtleCrypto } = {},
): Promise<'ok' | 'missing' | 'malformed' | 'too_old' | 'mismatch'> {
  if (!header) return 'missing';
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k, v]) => k === 'v1' && v).map(([, v]) => v!);
  if (!t || !/^\d+$/.test(t) || sigs.length === 0) return 'malformed';
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(t)) > (options.toleranceSeconds ?? 300)) return 'too_old';
  const subtle = options.subtle ?? globalThis.crypto.subtle;
  for (const secret of secrets) {
    const expected = await hmacHex(secret, `${t}.${rawBody}`, subtle);
    if (sigs.some((s) => safeEqual(s, expected))) return 'ok';
  }
  return 'mismatch';
}

export interface WebhookResult {
  result: string;
  drain?: boolean;
  event_id?: string;
  type?: string;
}

/** stripe-webhook: verify, record once, then drain the queue (best effort). */
export async function handleWebhook(rawBody: string, signature: string | null, deps: Deps): Promise<HttpAnswer> {
  if (deps.env.webhookSecrets.length === 0) return errorAnswer('payments_unavailable', 'not_configured', 500);
  const verdict = await verifyStripeSignature(rawBody, signature, deps.env.webhookSecrets);
  if (verdict !== 'ok') {
    logOf(deps)('stripe_webhook_rejected', { reason: verdict });
    return { status: 400, body: { error: 'bad_signature' } };
  }
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: 'bad_payload' } };
  }
  if (event.livemode === true) {
    // The database refuses it too; don't even send it there.
    logOf(deps)('stripe_webhook_livemode_refused', { type: String(event.type ?? '') });
    return { status: 200, body: { received: true, result: 'refused_livemode' } };
  }
  let out: WebhookResult;
  try {
    out = await deps.db.rpc<WebhookResult>('payments_record_stripe_event', { p_event: event }, { as: 'service' });
  } catch (e) {
    if (e instanceof DbError && e.code === 'invalid_argument') return { status: 400, body: { error: 'bad_event' } };
    // Nothing was written (one transaction): Stripe retries.
    logOf(deps)('stripe_webhook_failed', { type: String(event.type ?? ''), code: e instanceof DbError ? e.code : 'error' });
    return { status: 500, body: { error: 'retry' } };
  }
  logOf(deps)('stripe_webhook', { type: out.type, result: out.result });
  if (out.result === 'processed') {
    try {
      await drainOutbox(deps, 10);
    } catch (e) {
      logOf(deps)('drain_after_webhook_failed', { type: stripeFailure(e).type });
    }
  }
  return { status: 200, body: { received: true, result: out.result } };
}

// Queue ---------------------------------------------------------------------------------------------------------

export interface OutboxJob {
  job_id: string;
  kind: 'refund' | 'sync_subscription' | 'cancel_subscription';
  attempts: number;
  idempotency_key: string;
  amount_cents?: number;
  currency?: string;
  payment_intent?: string | null;
  invoice?: string | null;
  refund_application_fee?: boolean;
  reverse_transfer?: boolean;
  metadata?: Record<string, string>;
  subscription?: string;
  want?: 'cancel_now' | 'cancel_at_period_end' | 'renew';
}

class JobError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** The PaymentIntent behind a subscription invoice (2026 API: invoice payments; older: invoice.payment_intent). */
export async function invoicePaymentIntent(stripe: StripeLike, invoice: string): Promise<string | null> {
  if (stripe.invoicePayments) {
    try {
      const list = await stripe.invoicePayments.list({ invoice, limit: 3 });
      const pi = list.data.find((p) => typeof p.payment?.payment_intent === 'string')?.payment?.payment_intent;
      if (pi) return pi;
    } catch {
      // Fall through to the invoice itself.
    }
  }
  const inv = await stripe.invoices.retrieve(invoice);
  return typeof inv.payment_intent === 'string' ? inv.payment_intent : null;
}

/** Send one job to Stripe. Returns the Stripe id and status to record. */
export async function runJob(job: OutboxJob, stripe: StripeLike): Promise<{ ref: string; status: string | null }> {
  const opts = { idempotencyKey: job.idempotency_key };
  if (job.kind === 'refund') {
    let pi = job.payment_intent ?? null;
    if (!pi && job.invoice) pi = await invoicePaymentIntent(stripe, job.invoice);
    if (!pi) throw new JobError('no_payment_intent', true);
    const refund = await stripe.refunds.create(
      {
        payment_intent: pi,
        amount: job.amount_cents,
        reverse_transfer: job.reverse_transfer ?? true,
        refund_application_fee: job.refund_application_fee ?? true,
        metadata: job.metadata ?? {},
      },
      opts,
    );
    return { ref: refund.id, status: refund.status };
  }
  if (!job.subscription) throw new JobError('no_subscription', false);
  try {
    const sub =
      job.want === 'cancel_now'
        ? await stripe.subscriptions.cancel(job.subscription, {}, opts)
        : await stripe.subscriptions.update(job.subscription, { cancel_at_period_end: job.want !== 'renew' }, opts);
    return { ref: sub.id, status: sub.status };
  } catch (e) {
    // Already gone at Stripe: nothing left to change.
    if (job.want === 'cancel_now' && stripeFailure(e).missing) return { ref: job.subscription, status: 'canceled' };
    throw e;
  }
}

export interface DrainSummary {
  claimed: number;
  done: number;
  retried: number;
  failed: number;
}

/** Claim due jobs, send each to Stripe, record the answer (or the failure, with backoff). */
export async function drainOutbox(deps: Deps, limit = 20): Promise<DrainSummary> {
  const jobs = await deps.db.rpc<OutboxJob[]>('payments_claim_outbox', { p_limit: limit }, { as: 'service' });
  const summary: DrainSummary = { claimed: jobs.length, done: 0, retried: 0, failed: 0 };
  for (const job of jobs) {
    try {
      const r = await runJob(job, deps.stripe);
      await deps.db.rpc(
        'payments_complete_outbox',
        { p_job_id: job.job_id, p_result_ref: r.ref, p_provider_status: r.status },
        { as: 'service' },
      );
      summary.done += 1;
    } catch (e) {
      if (e instanceof DbError) throw e;
      const f = e instanceof JobError ? { type: 'JobError', code: e.message, retryable: e.retryable } : stripeFailure(e);
      logOf(deps)('payment_job_failed', { job_id: job.job_id, kind: job.kind, type: f.type, code: f.code });
      const state = await deps.db.rpc<string>(
        'payments_fail_outbox',
        { p_job_id: job.job_id, p_error: `${f.type}:${f.code ?? ''}`, p_retryable: f.retryable },
        { as: 'service' },
      );
      if (state === 'failed') summary.failed += 1;
      else summary.retried += 1;
    }
  }
  return summary;
}

/** payments-drain: the cron (or a test) asks; guarded by PAYMENTS_CRON_SECRET. */
export async function handleDrain(req: Request, deps: Deps): Promise<HttpAnswer> {
  const token = bearer(req);
  if (!deps.env.cronSecret || !token || !safeEqual(token, deps.env.cronSecret)) {
    return { status: 401, body: { error: 'unauthorized' } };
  }
  let limit = 20;
  try {
    const b = (await req.json()) as { limit?: unknown };
    if (typeof b.limit === 'number' && b.limit >= 1 && b.limit <= 100) limit = Math.floor(b.limit);
  } catch {
    // An empty body is fine.
  }
  return { status: 200, body: await drainOutbox(deps, limit) };
}
