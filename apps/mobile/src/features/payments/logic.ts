/**
 * Pure words and rules for the payment flows (docs/PAYMENTS_CONTRACT.md). Participant side is not
 * designed (HANDOFF.md): it stays minimal and every state is said in words, never colour only.
 * Amounts always come from the server; nothing here computes a price or the (placeholder) fee.
 */
import {
  checkoutStatusSentence,
  formatMoney,
  isCheckoutPending,
  PAYMENTS_LIVE_ENABLED,
  paymentAccountSentence,
  purchaseReasonSentence,
  type HostPaymentAccount,
  type PaymentCheckoutState,
  type PaymentCheckoutStatus,
  type PurchaseHolding,
  type PurchasePass,
  type PurchaseSession,
} from '@ojoro/contracts';

import { shortDate } from '../activities/format';

/** Shown to hosts (and on the buy flow) while live mode is off: nothing real is charged. */
export const TEST_MODE_LABEL = 'TEST MODE';
export const TEST_MODE_NOTE = 'Stripe test mode. No real card is charged and no real money moves.';

/** True while the server-side live switch is off (the default until the owner decides). */
export function isTestMode(account?: Pick<HostPaymentAccount, 'livemode'> | null): boolean {
  return !PAYMENTS_LIVE_ENABLED || !(account?.livemode ?? false);
}

/**
 * Where Stripe's return link should come back to. Web passes its own origin (allowed server-side by
 * PAYMENTS_RETURN_ORIGINS); native leaves it to the server default, the `ojoro://` scheme.
 */
export function returnBase(os: string, origin: string | null | undefined): string | undefined {
  if (os !== 'web' || !origin) return undefined;
  return origin.endsWith('/') ? origin : `${origin}/`;
}

// Participant: a session ------------------------------------------------------------------------------

export type SessionPayView = {
  title: string;
  body: string;
  /** PAY $8, when the server says this person can pay for their spot in the app. */
  cta: string | null;
};

/** The pay block on a priced host session, from `host_purchase_options(…).session`. */
export function sessionPayView(s: PurchaseSession, connected: boolean): SessionPayView | null {
  const amount = s.amount_cents != null ? formatMoney(s.amount_cents, s.currency) : null;
  switch (s.state) {
    case 'host':
      return null;
    case 'member':
      return { title: 'Covered by your membership', body: 'Nothing to pay for this one.', cta: null };
    case 'pack':
      return { title: 'Covered by your pack', body: 'This session comes off your pack when you check in.', cta: null };
    case 'free':
      return { title: 'Free for you', body: 'Nothing to pay for this one.', cta: null };
    case 'paid':
      return { title: amount ? `Paid ${amount}` : 'Paid', body: 'Your spot is paid for.', cta: null };
    case 'refunded':
      return { title: 'Refunded', body: amount ? `${amount} went back to you.` : 'Your payment went back to you.', cta: null };
    case 'due':
    case null:
      break;
  }
  if (s.buyable && amount) {
    return {
      title: `Your spot is ${amount}`,
      body: 'Pay now through Stripe, or at the field. Stripe takes the card; Ojoro never sees it.',
      cta: `PAY ${amount}`,
    };
  }
  if (s.reason) {
    const body =
      s.reason === 'not_connected' && amount
        ? `Pay ${amount} at the field. This host doesn’t take payments in the app yet.`
        : purchaseReasonSentence(s.reason);
    return { title: amount ? `${amount} a session` : 'Paying for your spot', body, cta: null };
  }
  if (!connected && amount) {
    return { title: `${amount} a session`, body: `Pay ${amount} at the field.`, cta: null };
  }
  return null;
}

// Participant: passes ---------------------------------------------------------------------------------

/** PAY $70 / PAY $35 A MONTH, or null when the pass can't be bought here. */
export function passCta(p: Pick<PurchasePass, 'kind' | 'price_cents' | 'currency' | 'buyable'>): string | null {
  if (!p.buyable || p.price_cents <= 0) return null;
  const amount = formatMoney(p.price_cents, p.currency);
  return p.kind === 'monthly' ? `PAY ${amount} A MONTH` : `PAY ${amount}`;
}

/** "10 sessions · use within 120 days", "Renews monthly until you cancel", "One session". */
export function passTerms(p: Pick<PurchasePass, 'kind' | 'sessions_included' | 'valid_days'>): string {
  switch (p.kind) {
    case 'pack':
      return `${p.sessions_included ?? 0} sessions · use within ${p.valid_days ?? 0} days`;
    case 'monthly':
      return 'Renews monthly until you cancel';
    case 'drop_in':
      return 'One session';
    case 'free':
      return 'Free';
  }
}

/** "$70", "$35 / month", "Free". */
export function passPrice(p: Pick<PurchasePass, 'kind' | 'price_cents' | 'currency'>): string {
  if (p.kind === 'free' || p.price_cents <= 0) return 'FREE';
  const amount = formatMoney(p.price_cents, p.currency);
  return p.kind === 'monthly' ? `${amount}/MO` : amount;
}

/** What I hold: "Monthly · renews Tue 1 Nov", "10-pack · 4 sessions left · use by Sun 30 Nov". */
export function holdingLine(
  h: Pick<PurchaseHolding, 'kind' | 'pass_name' | 'status' | 'renews' | 'period_ends_at' | 'sessions_left'>,
  timeZone?: string,
): string {
  const until = h.period_ends_at ? shortDate(h.period_ends_at, timeZone) : null;
  const parts = [h.pass_name];
  if (h.status === 'ended') {
    parts.push(until ? `ended ${until}` : 'ended');
    return parts.join(' · ');
  }
  if (h.kind === 'monthly') {
    if (until) parts.push(h.renews && h.status === 'active' ? `renews ${until}` : `ends ${until}`);
  } else if (h.kind === 'pack') {
    const n = h.sessions_left ?? 0;
    parts.push(`${n} ${n === 1 ? 'session' : 'sessions'} left`);
    if (until) parts.push(`use by ${until}`);
  }
  return parts.join(' · ');
}

/** The holding's status word (badge). */
export function holdingWord(h: Pick<PurchaseHolding, 'status' | 'renews' | 'kind'>): string {
  if (h.status === 'ended') return 'ENDED';
  if (h.status === 'cancelled') return 'CANCELLED';
  if (h.kind === 'monthly') return h.renews ? 'MEMBER' : 'ENDING';
  return 'ACTIVE';
}

// Participant: checkout state -------------------------------------------------------------------------

/** The return screen's headline (display face, uppercase). */
export function returnHeadline(status: PaymentCheckoutStatus, result: 'success' | 'cancel', waitedLong: boolean): string {
  switch (status) {
    case 'completed':
      return 'PAID.';
    case 'refunded':
      return 'SENT BACK.';
    case 'expired':
      return 'PAGE CLOSED.';
    case 'failed':
      return 'NOT PAID.';
    case 'creating':
    case 'open':
      if (result === 'cancel') return 'NOT PAID YET.';
      return waitedLong ? 'STILL CHECKING.' : 'CHECKING WITH STRIPE.';
  }
}

/** The sentence under the headline. The webhook is the source of truth, never the return link. */
export function returnBody(
  state: Pick<PaymentCheckoutState, 'status' | 'kind' | 'amount_cents' | 'currency' | 'pass_name' | 'expires_at'>,
  result: 'success' | 'cancel',
  waitedLong: boolean,
  timeZone?: string,
): string {
  if (isCheckoutPending(state.status)) {
    if (result === 'cancel') {
      const until = state.expires_at ? ` The payment page stays open until ${clockOf(state.expires_at, timeZone)}.` : '';
      return `You left the payment page, so nothing was charged.${until}`;
    }
    return waitedLong
      ? 'Stripe hasn’t confirmed it yet. That can take a minute. You can leave this screen; your pass or spot shows up once Stripe confirms.'
      : checkoutStatusSentence(state);
  }
  return checkoutStatusSentence(state);
}

function clockOf(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

/** Short status word for a receipt row. */
export function receiptWord(status: PaymentCheckoutStatus): string {
  return (
    {
      creating: 'WAITING',
      open: 'NOT PAID',
      completed: 'PAID',
      expired: 'CLOSED',
      failed: 'DIDN’T GO THROUGH',
      refunded: 'REFUNDED',
    } as const
  )[status];
}

/** Receipt title: "Drop-in · Plateau Pickup", "10-pack · Plateau Pickup". */
export function receiptTitle(c: Pick<PaymentCheckoutState, 'kind' | 'pass_name' | 'program_name'>): string {
  const what = c.kind === 'drop_in' ? 'Drop-in' : (c.pass_name ?? (c.kind === 'monthly' ? 'Monthly' : 'Pack'));
  return `${what} · ${c.program_name}`;
}

/** Receipts worth listing: money that moved or is waiting to; closed pages drop off. */
export function receiptsToShow<T extends Pick<PaymentCheckoutState, 'status'>>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.status === 'completed' || r.status === 'refunded' || r.status === 'failed');
}

/** An open checkout whose Stripe page can still be used (resume it instead of starting another). */
export function resumable(c: Pick<PaymentCheckoutState, 'status' | 'url' | 'expires_at'> | null, now: Date): boolean {
  if (!c || c.status !== 'open' || !c.url) return false;
  return !c.expires_at || Date.parse(c.expires_at) > now.getTime() + 60_000;
}

// Host: Stripe account -----------------------------------------------------------------------------------

export type AccountAction = 'onboard' | 'dashboard' | 'refresh';

export type AccountView = {
  word: string;
  title: string;
  body: string;
  primary: { action: AccountAction; label: string } | null;
  secondary: { action: AccountAction; label: string } | null;
  ownerOnlyNote: string | null;
};

/** HostMembership's PAYMENTS block for each Stripe account state. */
export function accountView(account: HostPaymentAccount): AccountView {
  const owner = account.can_onboard;
  const body = paymentAccountSentence(account);
  const ownerOnlyNote = owner ? null : 'Only the program’s owner can set up payouts or open Stripe.';
  switch (account.status) {
    case 'not_connected':
      return {
        word: 'NOT CONNECTED',
        title: 'Set up payouts',
        body: `${body} Stripe checks who you are and where to send your money; Ojoro never sees your bank details.`,
        primary: owner ? { action: 'onboard', label: 'SET UP PAYOUTS' } : null,
        secondary: null,
        ownerOnlyNote,
      };
    case 'onboarding':
      return {
        word: 'SETUP NOT FINISHED',
        title: 'Finish setting up payouts',
        body,
        primary: owner ? { action: 'onboard', label: 'FINISH SETUP' } : null,
        secondary: { action: 'refresh', label: 'CHECK AGAIN' },
        ownerOnlyNote,
      };
    case 'restricted':
      return {
        word: 'NEEDS INFO',
        title: 'Stripe needs more from you',
        body,
        primary: owner
          ? account.requirements_due.length > 0 || !account.details_submitted
            ? { action: 'onboard', label: 'ADD THE DETAILS' }
            : { action: 'dashboard', label: 'OPEN STRIPE' }
          : null,
        secondary: { action: 'refresh', label: 'CHECK AGAIN' },
        ownerOnlyNote,
      };
    case 'ready':
      return {
        word: 'READY',
        title: 'Payouts are set up',
        body,
        primary: null,
        secondary: owner && account.details_submitted ? { action: 'dashboard', label: 'OPEN STRIPE' } : null,
        ownerOnlyNote: null,
      };
  }
}

/** The return from Stripe's onboarding (`?connect=`). */
export function connectReturnNote(result: string | undefined): string | null {
  if (result === 'return') return 'Back from Stripe. Checking what Stripe has now.';
  if (result === 'refresh') return 'That Stripe link expired before you finished. Open a fresh one to carry on.';
  return null;
}

/** A past payout's word: PAID only when Stripe paid it. */
export function payoutWord(p: { status: string; provider?: string | null }, connected: boolean): string {
  if (p.status === 'paid' && p.provider === 'stripe') return 'PAID';
  if (p.status === 'failed' && p.provider === 'stripe') return 'DIDN’T GO THROUGH';
  if (!connected) return 'NOT SENT';
  if (p.status === 'scheduled') return 'SCHEDULED';
  return 'NOT SENT';
}

/** The line under a decided refund: who sends it and where it is. */
export function refundProgressNote(
  d: { refund_cents: number; provider?: string | null; refund_status?: string | null },
  connected: boolean,
): string {
  if (d.refund_cents <= 0) return '';
  if (d.provider === 'stripe') {
    switch (d.refund_status) {
      case 'succeeded':
        return ' Stripe sent it.';
      case 'failed':
        return ' Stripe couldn’t send it. It shows as failed in your ledger.';
      default:
        return ' Stripe sends it once the 10 minutes to undo are up.';
    }
  }
  return connected
    ? ' It was paid outside the app, so settle it the same way.'
    : ' Recorded; it goes out once payments are connected.';
}

/** HostRoster's payments note when nothing is recorded yet for a priced session. */
export function rosterPaymentsCopy(connected: boolean): { title: string; body: string } {
  return connected
    ? {
        title: 'Players can pay in the app',
        body: 'People pay through Stripe from the session, or at the field. Mark field payments here.',
      }
    : {
        title: 'Payments aren’t connected',
        body: 'Nobody pays through Ojoro yet. Collect at the field and mark it here, and it shows in your payout.',
      };
}

/** The pass sheet's note on how the pass is sold. */
export function passSaleNote(connected: boolean): string {
  return connected
    ? 'People can buy it in the app through Stripe. You can still record passes sold at the field.'
    : 'Payments aren’t connected yet, so nobody can buy it in the app. You can record passes sold at the field.';
}
