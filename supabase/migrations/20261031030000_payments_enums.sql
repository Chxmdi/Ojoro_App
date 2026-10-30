-- Step 8 BE-PAYMENTS: types for real money through Stripe (test mode only). Contract:
-- docs/PAYMENTS_CONTRACT.md. New enum values live in their own file: Postgres can't use a value in the
-- transaction that adds it.

-- A refund made in the Stripe dashboard (not through Ojoro), and a dispute the host lost.
alter type public.host_refund_reason add value if not exists 'provider_initiated';
alter type public.host_refund_reason add value if not exists 'dispute_lost';

create type public.payment_checkout_kind as enum ('drop_in', 'pack', 'monthly');
-- creating: our row exists, Stripe's session not attached yet. open: the hosted page is live.
-- completed: Stripe confirmed payment and the ledger has it. expired / failed: nothing was charged.
-- refunded: paid, but it couldn't be honoured any more (already covered, left the session), so the
-- money went straight back.
create type public.payment_checkout_status as enum ('creating', 'open', 'completed', 'expired', 'failed', 'refunded');
create type public.payment_outbox_kind as enum ('refund', 'sync_subscription', 'cancel_subscription');
create type public.payment_outbox_status as enum ('queued', 'sending', 'done', 'failed', 'cancelled');
create type public.host_dispute_status as enum ('open', 'won', 'lost');
