/**
 * Step 8 (Payments, PRD §13.2, §16, §17) client contract helpers: Stripe Connect onboarding for program
 * owners, Stripe Checkout for drop-ins, packs and monthly memberships, and the reads the app needs
 * around them. The full contract is docs/PAYMENTS_CONTRACT.md.
 *
 * TEST MODE ONLY: live mode is impossible until the owner flips the server-side switch. The client
 * never sends a price and never computes the (placeholder) Ojoro fee: it sends what it wants to buy and
 * opens the hosted Stripe page it gets back with expo-linking.
 *
 * Pure TypeScript with no runtime dependencies. The test-event helpers at the bottom use WebCrypto
 * (Node 20+, browsers) and exist for local tests and e2e against stripe-mock only.
 */
import type { Database } from './database.types';
import type { RealtimeSubscription } from './slice01';
import type { HostPassKind } from './hostsOps';
import { formatMoney } from './hostsOps';

type Functions = Database['public']['Functions'];
type RpcName = keyof Functions;

/** Payments RPCs the client may call (reads). Writes go through the edge functions below. */
export const paymentsRpcs = [
  'host_purchase_options',
  'payment_checkout',
  'host_payment_account',
] as const satisfies readonly RpcName[];

/** The edge functions the app calls with `supabase.functions.invoke(name, { body })`. */
export const paymentsFunctions = {
  checkout: 'payments-checkout',
  connect: 'payments-connect',
} as const;

/** Stable error codes added by the payments backend (also part of `ojoroErrorCodes`). */
export const paymentsErrorCodes = [
  'payments_not_connected',
  'payments_unavailable',
  'checkout_not_found',
  'checkout_invalid',
  'nothing_to_pay',
] as const;
export type PaymentsErrorCode = (typeof paymentsErrorCodes)[number];

/** Payments are test mode only until the owner decides (`payments_mode_policy()`). */
export const PAYMENTS_LIVE_ENABLED = false;
/** Stripe Checkout pages stay open this many minutes (Stripe's minimum). */
export const PAYMENTS_CHECKOUT_MINUTES = 30;
/** The app scheme Stripe's return links come back to (app.config.ts `scheme`). */
export const PAYMENTS_APP_SCHEME = 'ojoro://';

// Accounts ------------------------------------------------------------------------------------------

export type HostPaymentAccountStatus = 'not_connected' | 'onboarding' | 'restricted' | 'ready';

/** A program's Stripe account as hosts see it (`host_payment_account`, `host_money_view.payment_account`). */
export interface HostPaymentAccount {
  program_id: string;
  provider: 'stripe' | 'none';
  status: HostPaymentAccountStatus;
  account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  /** Stripe's `requirements.currently_due` field names. */
  requirements_due: string[];
  disabled_reason: string | null;
  livemode: boolean;
  ready_at: string | null;
  updated_at: string | null;
  /** The viewer owns the program and may onboard / open the Stripe dashboard. */
  can_onboard: boolean;
}

/** The sentence under PAYMENTS on HostMembership. Never colour-only. */
export function paymentAccountSentence(
  account: Pick<HostPaymentAccount, 'status' | 'requirements_due'>,
): string {
  switch (account.status) {
    case 'not_connected':
      return 'Payments in the app are off. Connect Stripe to take drop-ins, packs and memberships.';
    case 'onboarding':
      return 'Stripe setup isn’t finished. Pick it up where you left off.';
    case 'restricted': {
      const n = account.requirements_due.length;
      return n > 0
        ? `Stripe needs ${n} more ${n === 1 ? 'detail' : 'details'} before you can take payments.`
        : 'Stripe has paused payments on this account. Open Stripe to see why.';
    }
    case 'ready':
      return 'Payments are on. Stripe pays you every Friday.';
  }
}

// Buying ------------------------------------------------------------------------------------------------

/** Why something can't be bought right now (null = buyable). */
export type PurchaseReason =
  | 'free'
  | 'needs_session'
  | 'already_member'
  | 'not_connected'
  | 'nothing_to_pay'
  | 'not_attending'
  | 'session_skipped';

export interface PurchasePass {
  id: string;
  kind: HostPassKind;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  sessions_included: number | null;
  valid_days: number | null;
  buyable: boolean;
  reason: PurchaseReason | null;
}

export interface PurchaseHolding {
  membership_id: string;
  kind: 'pack' | 'monthly' | 'free';
  pass_name: string;
  status: 'active' | 'cancelled' | 'ended';
  renews: boolean;
  period_ends_at: string | null;
  sessions_left: number | null;
  provider: 'stripe' | 'none';
}

export interface PurchaseSession {
  session_id: string;
  /** The roster's payment state for me (host, member, pack, paid, free, due, refunded). */
  state: Database['public']['Enums']['host_payment_state'] | null;
  amount_cents: number | null;
  currency: string;
  buyable: boolean;
  reason: PurchaseReason | null;
}

export interface HostPurchaseOptions {
  program_id: string;
  program_name: string;
  payments_connected: boolean;
  passes: PurchasePass[];
  holding: PurchaseHolding | null;
  session: PurchaseSession | null;
  open_checkout: PaymentCheckoutState | null;
}

/** Words for a reason a pass or session can't be bought. */
export function purchaseReasonSentence(reason: PurchaseReason): string {
  switch (reason) {
    case 'free':
      return 'This one is free. Nothing to pay.';
    case 'needs_session':
      return 'Pay for a drop-in from the session you’re in.';
    case 'already_member':
      return 'You’re already a member.';
    case 'not_connected':
      return 'This host doesn’t take payments in the app yet. Pay at the field.';
    case 'nothing_to_pay':
      return 'You’re covered for this session.';
    case 'not_attending':
      return 'Say I’M DOWN first, then pay for your spot.';
    case 'session_skipped':
      return 'This session is off. Nothing to pay.';
  }
}

export type PaymentCheckoutKind = 'drop_in' | 'pack' | 'monthly';
export type PaymentCheckoutStatus =
  'creating' | 'open' | 'completed' | 'expired' | 'failed' | 'refunded';

/** One checkout as its buyer sees it (`payment_checkout`). */
export interface PaymentCheckoutState {
  checkout_id: string;
  status: PaymentCheckoutStatus;
  kind: PaymentCheckoutKind;
  program_id: string;
  program_name: string;
  pass_id: string | null;
  pass_name: string | null;
  session_id: string | null;
  session_starts_at: string | null;
  amount_cents: number;
  currency: string;
  /** Stripe's hosted page, while `open`. */
  url: string | null;
  expires_at: string | null;
  completed_at: string | null;
  charge_id: string | null;
  membership_id: string | null;
  created_at: string;
}

/** The return screen's headline words for a checkout. */
export function checkoutStatusSentence(
  state: Pick<PaymentCheckoutState, 'status' | 'kind' | 'amount_cents' | 'currency' | 'pass_name'>,
): string {
  const amount = formatMoney(state.amount_cents, state.currency);
  const what = state.kind === 'drop_in' ? 'your spot' : (state.pass_name ?? 'your pass');
  switch (state.status) {
    case 'creating':
    case 'open':
      return `Waiting for Stripe to confirm ${amount}.`;
    case 'completed':
      return state.kind === 'monthly'
        ? `Paid ${amount}. You’re a member. It renews monthly until you cancel.`
        : `Paid ${amount} for ${what}.`;
    case 'expired':
      return 'That payment page closed before you paid. Nothing was charged.';
    case 'failed':
      return 'The payment didn’t go through. Nothing was charged.';
    case 'refunded':
      return `You were already covered, so Stripe is sending ${amount} back.`;
  }
}

/** A checkout that will still change (keep polling / listening). */
export function isCheckoutPending(status: PaymentCheckoutStatus): boolean {
  return status === 'creating' || status === 'open';
}

// Function requests and answers ----------------------------------------------------------------------

export interface StartCheckoutRequest {
  pass_id?: string;
  session_id?: string;
  idempotency_key: string;
  /** App base Stripe's return link goes back to (must be allowed server-side), e.g. 'ojoro://'. */
  return_to?: string;
}

export interface PaymentCheckoutStarted {
  checkout_id: string;
  url: string;
  status: PaymentCheckoutStatus;
  expires_at: string | null;
  kind: PaymentCheckoutKind;
  amount_cents: number;
  currency: string;
}

export type ConnectRequest =
  | { action: 'onboard'; program_id: string; idempotency_key: string; return_to?: string }
  | { action: 'dashboard'; program_id: string; idempotency_key: string }
  | { action: 'refresh'; program_id: string };

export interface ConnectOnboardAnswer {
  url: string;
  account: HostPaymentAccount;
}
export interface ConnectDashboardAnswer {
  url: string;
}
export interface ConnectRefreshAnswer {
  account: HostPaymentAccount;
}

/** The PostgREST-shaped error inside a function's error body (pass it to `toOjoroError`). */
export interface PaymentsFunctionErrorBody {
  code: string;
  message: string;
  details: string | null;
}

/** Pull the error out of a payments function's JSON body, or null when the body isn't an error. */
export function paymentsFunctionError(body: unknown): PaymentsFunctionErrorBody | null {
  if (!body || typeof body !== 'object') return null;
  const err = (body as { error?: unknown }).error;
  if (!err || typeof err !== 'object') return null;
  const { code, message, details } = err as Record<string, unknown>;
  if (typeof message !== 'string') return null;
  return {
    code: typeof code === 'string' ? code : 'P0001',
    message,
    details: typeof details === 'string' && details !== '' ? details : null,
  };
}

// Return links ------------------------------------------------------------------------------------------

export type PaymentsReturn =
  | { kind: 'checkout'; checkoutId: string; result: 'success' | 'cancel' }
  | { kind: 'connect'; programId: string; result: 'return' | 'refresh' };

function base(app: string): string {
  return app.endsWith('/') || app.endsWith('://') ? app : `${app}/`;
}

/** The app link `payments-return` redirects to (built server-side; here for tests and the router). */
export function paymentsReturnUrl(
  target: PaymentsReturn,
  app: string = PAYMENTS_APP_SCHEME,
): string {
  const root = base(app);
  if (target.kind === 'checkout') {
    return `${root}pay/return?checkout_id=${encodeURIComponent(target.checkoutId)}&result=${target.result}`;
  }
  return `${root}host/${encodeURIComponent(target.programId)}/payments?connect=${target.result}`;
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function returnPath(url: string): string {
  const noQuery = url.split(/[?#]/)[0] ?? '';
  const http = /^https?:\/\/[^/]*/i;
  const custom = /^[a-z][a-z0-9+.-]*:\/\//i;
  const rest = http.test(noQuery) ? noQuery.replace(http, '') : noQuery.replace(custom, '');
  return rest.replace(/^\/+/, '').replace(/\/+$/, '');
}

/** Read a return link (deep link, Expo dev link or web URL). Null when it isn't one. */
export function parsePaymentsReturn(url: string): PaymentsReturn | null {
  const path = returnPath(url);
  const q = url.indexOf('?');
  const params = new URLSearchParams(q === -1 ? '' : url.slice(q + 1).split('#')[0]);
  if (/(^|\/)pay\/return$/.test(path)) {
    const id = params.get('checkout_id') ?? '';
    const result = params.get('result');
    if (!uuidRe.test(id) || (result !== 'success' && result !== 'cancel')) return null;
    return { kind: 'checkout', checkoutId: id, result };
  }
  const m = /(^|\/)host\/([^/]+)\/payments$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[2] ?? '');
    const result = params.get('connect');
    if (!uuidRe.test(id) || (result !== 'return' && result !== 'refresh')) return null;
    return { kind: 'connect', programId: id, result };
  }
  return null;
}

// Realtime ------------------------------------------------------------------------------------------------

/** My checkouts (the return screen waits for `completed`). Refetch hints only. */
export function paymentCheckoutSubscription(userId: string): RealtimeSubscription {
  return {
    channel: `payment-checkouts:${userId}`,
    changes: [
      { event: '*', schema: 'public', table: 'payment_checkouts', filter: `user_id=eq.${userId}` },
    ],
  };
}

/** A program's Stripe account state (HostMembership's PAYMENTS block). Refetch hints only. */
export function hostPaymentAccountSubscription(programId: string): RealtimeSubscription {
  return {
    channel: `host-payment-account:${programId}`,
    changes: [
      {
        event: '*',
        schema: 'public',
        table: 'host_payment_accounts',
        filter: `program_id=eq.${programId}`,
      },
    ],
  };
}

// Local test helpers (stripe-mock / e2e only) ---------------------------------------------------------

/** The local webhook secret used in supabase/functions/.env for stripe-mock runs. Test only. */
export const LOCAL_TEST_WEBHOOK_SECRET = 'whsec_ojoro_local_test_only';

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A `Stripe-Signature` header for `payload`, as Stripe computes it (HMAC-SHA256 of `${t}.${payload}`
 * with the endpoint secret). For local tests against stripe-mock; never sign with a real secret.
 */
export async function stripeTestSignatureHeader(
  payload: string,
  secret: string = LOCAL_TEST_WEBHOOK_SECRET,
  timestamp: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(`${timestamp}.${payload}`),
  );
  return `t=${timestamp},v1=${hex(sig)}`;
}

export interface TestStripeEvent {
  id: string;
  object: 'event';
  api_version: string;
  created: number;
  livemode: false;
  type: string;
  account?: string;
  pending_webhooks: number;
  request: { id: null; idempotency_key: null };
  data: { object: Record<string, unknown> };
}

/** A Stripe-shaped test event around `object` (always `livemode: false`). */
export function buildTestStripeEvent(
  type: string,
  object: Record<string, unknown>,
  options: { id?: string; account?: string; created?: number } = {},
): TestStripeEvent {
  const created = options.created ?? Math.floor(Date.now() / 1000);
  const id =
    options.id ?? `evt_test_${created.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    object: 'event',
    api_version: '2026-09-30.endive',
    created,
    livemode: false,
    type,
    ...(options.account ? { account: options.account } : {}),
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  };
}

/** The `checkout.session.completed` object Stripe sends for one of our checkouts (test only). */
export function testCheckoutCompletedObject(checkout: {
  checkout_id: string;
  provider_session_id: string;
  kind: PaymentCheckoutKind;
  amount_cents: number;
  currency: string;
}): Record<string, unknown> {
  const suffix = checkout.checkout_id.replace(/-/g, '').slice(0, 14);
  const subscription = checkout.kind === 'monthly';
  return {
    id: checkout.provider_session_id,
    object: 'checkout.session',
    mode: subscription ? 'subscription' : 'payment',
    status: 'complete',
    payment_status: 'paid',
    amount_total: checkout.amount_cents,
    currency: checkout.currency.toLowerCase(),
    client_reference_id: checkout.checkout_id,
    livemode: false,
    metadata: { ojoro_checkout_id: checkout.checkout_id },
    payment_intent: subscription ? null : `pi_test_${suffix}`,
    subscription: subscription ? `sub_test_${suffix}` : null,
    invoice: subscription ? `in_test_${suffix}` : null,
    customer: `cus_test_${suffix}`,
  };
}
