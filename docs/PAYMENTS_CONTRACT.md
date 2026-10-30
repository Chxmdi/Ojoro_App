# Step 8: Payments contract (Stripe, test mode only)

Real money for Host OS on top of the provider-agnostic ledger in
[`HOSTS_OPS_CONTRACT.md`](HOSTS_OPS_CONTRACT.md): Stripe Connect Express onboarding for program owners,
Stripe Checkout for drop-ins, packs and monthly memberships, a signed webhook that writes the ledger,
and refunds / subscription changes sent through a server queue. PRD §13.2, §16, §17. Every rule in
[`SLICE01_CONTRACT.md`](SLICE01_CONTRACT.md) still applies (write only through RPCs or these
functions, map errors by code, one idempotency key per intention). Judgment calls:
`docs/DESIGN_DECISIONS.md` ("Step 8 BE-PAYMENTS").

> **Test mode only. Live mode is impossible** until the owner decides: the switch is
> `public.payments_mode_policy()` (`live_enabled: false`, a migration changes it). The functions
> refuse any Stripe key that isn't `sk_test_…` / `rk_test_…`, refuse `STRIPE_MODE` other than `test`,
> and the database refuses every `livemode: true` event while the switch is off.
>
> **The Ojoro service fee is still a PLACEHOLDER** (`public.host_service_fee_policy()`, 8%). Checkout's
> `application_fee_amount` / `application_fee_percent` come from the same rate
> (`private.host_application_fee_cents()`); nothing else knows it. The app never computes a fee.

- Schema: `supabase/migrations/20261031030000_payments_enums.sql`, `…030100_payments_schema.sql`,
  `…030200_payments_checkout.sql`, `…030300_payments_webhook.sql`, `…030400_payments_queue.sql`.
- Edge functions (Deno, `npm:stripe@23.0.0`, API version pinned by the SDK): `supabase/functions/`
  `payments-checkout`, `payments-connect`, `payments-return`, `payments-drain`, `stripe-webhook`;
  shared code `supabase/functions/_shared/stripe*.ts` (logic is pure and unit-tested with vitest).
- Client helpers: `packages/contracts/src/payments.ts` (exported from `@ojoro/contracts`):
  `paymentsRpcs`, `paymentsFunctions`, `paymentsErrorCodes` (also in `ojoroErrorCodes`), request and
  response types for every function, `HostPurchaseOptions`, `PaymentCheckoutState`,
  `HostPaymentAccount`, `paymentAccountSentence`, `checkoutStatusSentence`, `purchaseReasonSentence`,
  `paymentsReturnUrl`, `parsePaymentsReturn`, `paymentsFunctionError`, realtime descriptors
  `paymentCheckoutSubscription`, `hostPaymentAccountSubscription`, and the local test helpers
  `stripeTestSignatureHeader`, `buildTestStripeEvent`.
- Tests: `supabase/tests/37_payments_connect_checkout.sql`, `38_payments_webhook.sql`,
  `39_payments_queue.sql`; `packages/contracts/src/payments.test.ts`;
  `supabase/functions/_shared/stripe*.test.ts` (run by `pnpm test`).

Contents: [Rules](#rules) · [Errors](#errors) · [Model](#model) · [Functions](#functions) ·
[Reads](#reads) · [Connect onboarding](#connect-onboarding) · [Checkout](#checkout) ·
[Webhook](#webhook) · [Refunds and the queue](#refunds-and-the-queue) ·
[Memberships and renewals](#memberships-and-renewals) · [Payouts](#payouts) ·
[Return links](#return-links) · [Realtime](#realtime) · [Analytics](#analytics) ·
[Configuration](#configuration) · [Local development](#local-development) · [Not built](#not-built)

---

## Rules

1. **The client never sends a price.** It sends what it wants to buy (`pass_id` or `session_id`) and an
   idempotency key. The server computes the amount from `host_passes` (packs, monthly) or the session's
   drop-in price for this person (`price_cents`, or `member_price_cents` for members), the currency, and
   the placeholder application fee.
2. **Money moves only through Stripe's hosted pages.** The app opens the `url` it gets back with
   `Linking.openURL` (expo-linking) and handles the return deep link. No Stripe SDK in the app, no card
   fields, no new client dependency.
3. **The webhook is the source of truth.** A Checkout is paid when Stripe says so
   (`checkout.session.completed` with `payment_status = 'paid'`, or `async_payment_succeeded`), never
   because the app came back on the success link. The return screen polls / listens to
   `payment_checkout` until `status` is `completed` (or `failed`, `expired`, `refunded`).
4. **Each Stripe event is processed once** (`private.stripe_events`, keyed by event id, in the same
   transaction as its ledger writes). A redelivery returns `duplicate` and changes nothing.
5. **Every Stripe write sends an Idempotency-Key** derived from our own ids:
   `ojoro-account-<program_id>`, `ojoro-link-<program_id>-<client key>`,
   `ojoro-login-<program_id>-<client key>`, `ojoro-checkout-<checkout_id>`, `ojoro-refund-<refund_id>`,
   `ojoro-checkout-refund-<checkout_id>`, `ojoro-sub-<outbox_id>`.
6. **Authorization is server-side** (PRD §17): owners onboard the program's Stripe account
   (`owner_required` otherwise) and open its dashboard; hosts read the account state; people buy for
   themselves only and read only their own checkouts. Service-only functions (`payments_*` without a
   public grant) are callable with the service role only.
7. **Money is integer cents + an ISO currency.** Stripe gets the currency lower-cased.
8. **Status is never colour-only.** Every state has words: `paymentAccountSentence`,
   `checkoutStatusSentence`, `purchaseReasonSentence`.
9. **Privacy.** Stripe gets the program name and the pass / session words. No addresses, no Ojoro
   profile data beyond the user id in metadata. Stripe collects the buyer's card and email itself.

## Errors

New codes (words in `apps/mobile/src/lib/errorMessages.ts`):

| Code | Meaning | `detail` |
|---|---|---|
| `payments_not_connected` | The program can't take payments in the app yet (no Stripe account, or it isn't ready). | |
| `payments_unavailable` | Payments are switched off or Stripe didn't answer. Try again later. | `not_configured` / `live_mode_off` / `provider_error` |
| `checkout_not_found` | Unknown checkout, or not yours. | |
| `checkout_invalid` | Nothing buyable: a free or archived pass, a drop-in pass without a session, or both / neither of pass and session. | `target` / `kind` / `free` / `archived` / `session` |
| `nothing_to_pay` | You're covered for this session already (host, member, pack, paid, free). | The payment state |

Also used: `pass_not_found`, `already_member`, `session_not_found`, `session_skipped`,
`not_attending`, `program_not_found`, `not_program_host`, `owner_required`, `invalid_argument`,
`not_authenticated`, `idempotency_key_required`, `idempotency_key_reused`.

Functions answer errors as HTTP 4xx/5xx with the body
`{ "error": { "code": "P0001", "message": "<ojoro code>", "details": "<detail>" } }`, the same shape as a
PostgREST error, so `paymentsFunctionError(body)` (or `toOjoroError(body.error)`) maps it.

## Model

| Table | Visible to | Notes |
|---|---|---|
| `host_payment_accounts` | Program hosts | One per program: `provider = 'stripe'`, `account_id` (`acct_…`), `charges_enabled`, `payouts_enabled`, `details_submitted`, `requirements_due` (Stripe field names), `disabled_reason`, `livemode` (always false), `ready_at` (first time it could take payments and pay out). |
| `payment_checkouts` | The buyer, program hosts | One per buying intention: `kind` (`drop_in`, `pack`, `monthly`), `pass_id`, `session_id`, `amount_cents`, `currency`, `application_fee_cents`, `status` (`creating` → `open` → `completed`; or `expired`, `failed`, `refunded`), `provider_session_id` (`cs_…`), `url`, `expires_at`, `completed_at`, `charge_id`, `membership_id`. |
| `host_disputes` | Program hosts | A buyer disputed a charge with their bank: `status` `open` → `won` / `lost` (a lost dispute is recorded as a `dispute_lost` refund so it comes off the payout). |
| `host_provider_payouts` | Program hosts | Stripe's payouts to the host's bank, as Stripe reports them (`status` `pending`, `in_transit`, `paid`, `failed`, `canceled`), linked to the closed week (`payout_id`) whose `pays_on` matches `arrival_date`. |
| `private.stripe_events` | Nobody (service) | Every verified event: id, type, account, `result`, `processed_at`. |
| `private.payment_outbox` | Nobody (service) | Work for Stripe: `refund`, `sync_subscription`, `cancel_subscription`; `not_before`, `attempts`, `status` (`queued`, `sending`, `done`, `failed`, `cancelled`). |

Changes to Step 6 tables: `host_charges.provider`, `host_refunds.provider`, `host_payouts.provider` now
allow `'none'` or `'stripe'`. `host_charges` gains `provider_invoice` (`in_…` for subscription
payments); `provider_ref` holds the PaymentIntent (`pi_…`). `host_memberships` gains `provider` and
`provider_ref` (the subscription, `sub_…`). `host_refunds.provider_ref` is the Stripe refund (`re_…`).
New refund reasons: `dispute_lost`, `provider_initiated` (made in the Stripe dashboard).

Charges recorded by hosts (at the field, granted passes) stay `provider = 'none'`, and so do their
refunds: those are settled outside the app as before.

## Functions

All are POST JSON with the signed-in user's access token (`supabase.functions.invoke(name, { body })`
sends it), except `stripe-webhook` (Stripe's signature), `payments-drain` (the cron secret) and
`payments-return` (a GET from the browser).

| Function | Body | Answer |
|---|---|---|
| `payments-checkout` | `{ pass_id?: uuid, session_id?: uuid, idempotency_key: uuid, return_to?: string }` (exactly one of pass / session) | `PaymentCheckoutStarted` `{ checkout_id, url, status, expires_at, kind, amount_cents, currency }` |
| `payments-connect` | `{ action: 'onboard', program_id, idempotency_key, return_to? }` | `{ url, account: HostPaymentAccount }` (open `url`: Stripe's hosted onboarding) |
| | `{ action: 'dashboard', program_id, idempotency_key }` | `{ url }` (Stripe Express dashboard, owner only, once the account has details) |
| | `{ action: 'refresh', program_id }` | `{ account: HostPaymentAccount }` (reads Stripe now; the webhook does this too) |
| `payments-return` | GET `?to=checkout&checkout_id=…&result=success\|cancel&app=…` or `?to=connect&program_id=…&result=return\|refresh&app=…` | 302 to the app (see [Return links](#return-links)) |
| `stripe-webhook` | Stripe events, `Stripe-Signature` header | `200 { received: true, result }`; `400` bad signature; `500` (Stripe retries) |
| `payments-drain` | `{ limit?: number }`, `Authorization: Bearer <PAYMENTS_CRON_SECRET>` | `{ claimed, done, retried, failed }` |

Retrying `payments-checkout` with the same key returns the same checkout and URL (Stripe sees the same
Idempotency-Key). A checkout whose page expired: start a new one with a new key.

## Reads

- **`host_purchase_options(p_program_id, p_session_id?) → HostPurchaseOptions`** (signed in): what I
  can buy here. `payments_connected`, `passes` (active passes, each with `buyable` and `reason`:
  `null`, `free`, `needs_session` (drop-in passes are bought from a session), `already_member`,
  `not_connected`), my `holding` (the pass I hold, like `host_people_passes`), `session` (when
  `p_session_id`: my `state` from the roster's payment status, `amount_cents`, `currency`, `buyable`,
  `reason`), and `open_checkout` (my latest open checkout here, to resume).
- **`payment_checkout(p_checkout_id) → PaymentCheckoutState`** (the buyer): `status`, `kind`, program
  and pass names, `session_id`, `amount_cents`, `currency`, `url` (while open), `expires_at`,
  `completed_at`, `charge_id`, `membership_id`. The return screen reads this.
- **`host_money_view`** (Step 6) now reports `provider` (`'stripe'` once the program has an account),
  `payments_connected` (true when Stripe says `charges_enabled` and `payouts_enabled`),
  `payment_account` (`HostPaymentAccount`, with `can_onboard` for owners), `disputes` (open), and
  `provider_payouts` (last 6 Stripe payouts). Past payouts turn `paid` / `failed` when Stripe pays the
  matching week.
- **`host_payment_account(p_program_id) → HostPaymentAccount`** (hosts).
- **`host_decision_state`** (refund decisions) reports the refund's `provider` and `refund_status`.

`HostPaymentAccount.status`: `not_connected` (no account), `onboarding` (details not submitted),
`restricted` (submitted, but Stripe needs more or has paused charges / payouts: `requirements_due`,
`disabled_reason`), `ready`.

## Connect onboarding

1. An owner taps CONNECT PAYMENTS on HostMembership. The app calls `payments-connect` `onboard` with a
   new key and opens `url`.
2. The function makes (once per program) an Express account (country `STRIPE_CONNECT_COUNTRY`, default
   `CA`; card payments + transfers; weekly payouts on Fridays to match the payout weeks), stores it,
   and creates an Account Link (`account_onboarding`).
3. Stripe returns to `payments-return?to=connect&result=return`, which sends the app to
   `host/<programId>/payments?connect=return`. `result=refresh` means the link expired: call
   `onboard` again with a new key.
4. `account.updated` (and `refresh`) keep the flags in step. `payments_connected` turns true, and
   checkout opens for the program, only when `charges_enabled` and `payouts_enabled` are both true.

Co-hosts see the state but can't onboard or open the dashboard (`owner_required`).

## Checkout

`payments-checkout` → `begin_host_checkout` (as the user; validates and computes) → Stripe Checkout
Session → `payments_attach_checkout` (service) → `{ url }`.

| Buying | Rules | Stripe |
|---|---|---|
| A drop-in (`session_id`) | I'm in the session (confirmed or checked in), it isn't skipped, and my roster state is `due` (`nothing_to_pay` with the state otherwise). Amount = the session's price for me. | `mode: payment`, destination charge to the host's account, `application_fee_amount`. |
| A pack (`pass_id`, kind `pack`) | Active, priced. | Same. |
| Monthly (`pass_id`, kind `monthly`) | Active, priced, I'm not already a monthly member (`already_member`). | `mode: subscription`, monthly `price_data`, `subscription_data.application_fee_percent`, `transfer_data.destination`. |
| Free / archived / drop-in pass alone | `checkout_invalid` (`free`, `archived`, `kind`). | |

Metadata on the session (and its PaymentIntent / subscription): `ojoro_checkout_id`, `ojoro_program_id`,
`ojoro_user_id`, `ojoro_kind`, `ojoro_pass_id`, `ojoro_session_id`. The session expires 31
minutes after it starts (Stripe's minimum is 30), set by the database.

On completion the webhook writes exactly what `grant_host_pass` / `mark_paid_at_field` would, with
`method = 'app'` and `provider = 'stripe'`: a paid drop-in charge (updating a `due` one if there is),
or the membership (+ `host_program_members` for monthly) and its paid charge, plus `host_people`.
If it can't be honoured any more (I left the session, it was skipped, I'm already covered or already a
member), the checkout becomes `refunded` and the money goes straight back (queue, below); the ledger is
untouched. An amount or currency that doesn't match the checkout is refused (`result: amount_mismatch`)
and nothing is granted.

## Webhook

`stripe-webhook` verifies `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET` (and
`STRIPE_CONNECT_WEBHOOK_SECRET` for the Connect endpoint, if set; 5-minute tolerance), refuses
`livemode` events while the switch is off, and hands the event to
`payments_record_stripe_event(p_event)` (service), which processes it once:

| Event | Ledger |
|---|---|
| `checkout.session.completed` (paid), `checkout.session.async_payment_succeeded` | Grant (see Checkout). |
| `checkout.session.async_payment_failed` / `checkout.session.expired` | Checkout `failed` / `expired`. |
| `invoice.paid` (`subscription_cycle`) | Renewal: the period moves to the invoice's period end; a `monthly_renewal` charge is `paid` (the tick no longer makes `due` renewals for Stripe memberships). |
| `invoice.payment_failed` | The renewal charge is recorded `failed` (Stripe retries; a later `invoice.paid` makes it `paid`). |
| `customer.subscription.updated` | `cancel_at_period_end` → the membership is `cancelled` (won't renew) or active again. |
| `customer.subscription.deleted` | The membership `ended`; member list in step. |
| `refund.created`, `refund.updated`, `refund.failed`, `charge.refunded` | Our refund (by `metadata.ojoro_refund_id` or `re_…`) → `succeeded` / `failed`. A refund made in Stripe's dashboard is recorded as `provider_initiated`. |
| `charge.dispute.created` / `charge.dispute.updated` / `charge.dispute.closed` | `host_disputes`; lost → a `dispute_lost` refund. |
| `account.updated` (Connect) | `host_payment_accounts` flags; `ready_at`. |
| `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`, `payout.canceled` (Connect) | `host_provider_payouts`; the matching closed week turns `paid` / `failed`. |
| Anything else | Recorded, `ignored`. |

`result` is one of `processed`, `duplicate`, `ignored`, `not_found`, `amount_mismatch`,
`refused_livemode`. Only an unexpected failure answers 500 (Stripe retries; nothing was written).

## Refunds and the queue

Refund rows are still made by the Step 6 paths: `decide_host_refund` (REFUND ALL / REFUND $25), a
dropped spot filled from the waitlist, a skipped session. When the charge was paid through Stripe:

- The refund row gets `provider = 'stripe'` and a `refund` job in `private.payment_outbox`.
- Host decisions wait out the **10-minute UNDO** (`not_before = decided_at + 10 min`); automatic ones go
  at once. UNDO works until the job has been sent (`refund_undo_closed` after: Stripe has it).
- `payments-drain` claims due jobs (leased, `for update skip locked`), calls the Refunds API
  (`payment_intent`, `amount`, `reverse_transfer: true`, `refund_application_fee: true`,
  `metadata.ojoro_refund_id`, Idempotency-Key `ojoro-refund-<refund_id>`) and records `re_…`. The
  refund turns `succeeded` / `failed` from the webhook.
- Failures retry with backoff (1, 2, 4 … minutes); after 8 tries the job and the refund are `failed`
  and audited (`refund_failed`). Nothing is lost: the host sees the refund `failed` in the ledger.
- The drain runs every minute from pg_cron (`ojoro_payments_drain`, through pg_net) when the Vault has
  `payments_drain_url` and `payments_drain_secret`; the webhook also drains after each event.

## Memberships and renewals

A Stripe monthly membership has `provider = 'stripe'`, `provider_ref = sub_…`. Any change to its
`renews` / `status` (the person cancels with `cancel_host_membership`, a host decides KEEP IT or
refunds, UNDO) queues `sync_subscription`, which sets Stripe to match (`cancel_at_period_end` true /
false, or cancel now when the membership ended). Ending now waits out the 10-minute UNDO. The hourly
tick skips Stripe memberships (no `due` renewals; Stripe renews, the webhook records it) and ends one
only if Stripe has been silent for 7 days past its period end.

## Payouts

Stripe pays the host's bank on its own schedule (weekly, Friday). Payout events land in
`host_provider_payouts`; when one arrives on a closed week's `pays_on`, that week turns `paid` (or
`failed`) with `provider = 'stripe'`. The week's totals stay Ojoro's ledger figures (with the
placeholder fee); Stripe's amount is on the provider payout.

## Return links

Stripe can only send the browser to https URLs, so success / cancel / onboarding links point at
`payments-return`, which redirects to the app:

- Checkout: `<app>pay/return?checkout_id=<id>&result=success|cancel`
- Connect: `<app>host/<programId>/payments?connect=return|refresh`

`<app>` is `return_to` from the request when it starts with one of `PAYMENTS_RETURN_ORIGINS`
(comma-separated; default `ojoro://`), else `ojoro://`. On web dev, pass
`return_to: 'http://localhost:8100/'`. `paymentsReturnUrl` / `parsePaymentsReturn` build and read these.

## Realtime

Refetch hints:

- `paymentCheckoutSubscription(userId)`: `payment_checkouts` filtered by `user_id` (the return screen).
- `hostPaymentAccountSubscription(programId)`: `host_payment_accounts` by `program_id`
  (HostMembership's connect state). Step 6's `hostMoneySubscription` covers charges, refunds and
  memberships.

## Analytics

Server-recorded: `payments_account_created`, `payments_account_ready`, `payments_checkout_started`
{kind}, `payments_checkout_completed` {kind}, `payments_checkout_refunded` {kind, reason},
`payments_refund_sent` {reason}, `payments_refund_failed`, `payments_dispute_opened`,
`payments_payout_recorded` {status}. Payloads carry ids and kinds, never amounts per person.
Client (`@ojoro/analytics`): `payment_checkout_opened`, `payment_return_viewed`,
`host_connect_opened`.

## Configuration

Secrets live in the functions' environment (`supabase secrets set …` for a hosted project;
`supabase/functions/.env` locally, git-ignored). Names only in `supabase/.env.example`:

| Name | What |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` (or a restricted `rk_test_…`). Live keys are refused. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` of the platform webhook endpoint. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Optional: `whsec_…` of the Connect endpoint (account and payout events). |
| `STRIPE_MODE` | Must be `test`. |
| `STRIPE_API_BASE` | Optional: e.g. `http://host.docker.internal:12111` for stripe-mock. |
| `STRIPE_CONNECT_COUNTRY` | Optional, default `CA`. |
| `PAYMENTS_CRON_SECRET` | Shared with the Vault secret `payments_drain_secret`; guards `payments-drain`. |
| `PAYMENTS_FUNCTIONS_URL` | Public base of the functions (`https://<ref>.supabase.co/functions/v1`), for return links. |
| `PAYMENTS_RETURN_ORIGINS` | Allowed app return bases, comma-separated (default `ojoro://`). |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Provided by Supabase. |

Stripe dashboard (test mode): enable Connect (Express), add a webhook endpoint
`<functions>/stripe-webhook` for the platform events above and a Connect endpoint for `account.updated`
and `payout.*`, and copy their signing secrets.

## Local development

```bash
scripts/stripe-mock.sh start                 # stripe-mock on :12111 (HTTP) / :12112 (HTTPS)
npx -y supabase@2.122.0 functions serve --env-file supabase/functions/.env   # serves the functions
```

`supabase/functions/.env` for local runs (git-ignored; test values only):

```bash
STRIPE_SECRET_KEY=sk_test_ojoroLocalStripeMock
STRIPE_WEBHOOK_SECRET=whsec_ojoro_local_test_only
STRIPE_MODE=test
STRIPE_API_BASE=http://host.docker.internal:12111
PAYMENTS_CRON_SECRET=local-drain-secret
PAYMENTS_FUNCTIONS_URL=http://127.0.0.1:54321/functions/v1
PAYMENTS_RETURN_ORIGINS=ojoro://,http://localhost:8100/
```

stripe-mock answers every call with fixture data and never sends webhooks, so a test pretends to be
Stripe with a **locally signed test event**:

```bash
# A participant's checkout is now paid (drop-in, pack or monthly):
scripts/stripe-mock.sh complete-checkout <checkout_id>
# A program's Stripe account can take payments and pay out (after `onboard` made the account):
scripts/stripe-mock.sh account-ready <program_id>
# Any event JSON file, signed and posted:
scripts/stripe-mock.sh send-event <file.json>
```

They read the row from the local database, build the event Stripe would send, sign it with
`STRIPE_WEBHOOK_SECRET` (`whsec_ojoro_local_test_only` unless set) and POST it to
`PAYMENTS_WEBHOOK_URL` (default `http://127.0.0.1:54321/functions/v1/stripe-webhook`). From Node (e2e),
`buildTestStripeEvent(type, object)` and `stripeTestSignatureHeader(payload, secret)` in
`@ojoro/contracts` do the same. Never use these against a hosted project.

## Not built

- Live mode (switch off, keys refused) and the real fee (placeholder).
- Participant-side payment screens beyond the minimal buy / return flow (not designed; HANDOFF.md).
- Saved cards, Stripe customers per person, receipts in the app (Stripe emails receipts in live mode).
- Taxes, multiple currencies per program, partial payments, payment links in chat.
- Telling the buyer in the app when a refund lands (Stripe emails them); a host notification for a
  failed refund or a new dispute (they're in the ledger and the audit trail).
