-- Step 8 BE-PAYMENTS: Stripe on top of the Step 6 ledger (20261030210000_host_ops_schema.sql).
-- Contract: docs/PAYMENTS_CONTRACT.md. Judgment calls: docs/DESIGN_DECISIONS.md ("Step 8 BE-PAYMENTS").
--
-- TEST MODE ONLY. public.payments_mode_policy() is the live-mode switch and it is OFF: the edge
-- functions refuse live keys and the database refuses livemode events while it is off. Turning it on
-- is an owner decision and a new migration.
--
-- Model:
--   host_payment_accounts   A program's Stripe Connect (Express) account and its flags.
--   payment_checkouts       One buying intention: a Stripe Checkout Session for a drop-in, pack or
--                           monthly membership, priced by the server.
--   host_disputes           Chargebacks on Stripe charges.
--   host_provider_payouts   Stripe's payouts to the host's bank, linked to our closed weeks.
--   private.stripe_events   Every verified Stripe event, processed once.
--   private.payment_outbox  Work for Stripe (refunds, subscription changes), drained by payments-drain.

-- The live-mode switch: THE ONE PLACE ------------------------------------------------------------------

create or replace function public.payments_mode_policy()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  -- OFF. Stripe test mode only until the owner decides (and the service fee is decided).
  select jsonb_build_object('provider', 'stripe', 'live_enabled', false, 'mode', 'test');
$$;

create or replace function private.payments_live_enabled()
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((public.payments_mode_policy() ->> 'live_enabled')::boolean, false);
$$;

-- The application fee on one Stripe charge: the placeholder rate from host_service_fee_policy()
-- (the only place that knows it), rounded to the cent. Subscriptions use the same rate as a percent.
create or replace function private.host_application_fee_cents(p_amount_cents bigint)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_amount_cents, 0) <= 0 then 0
    else round(p_amount_cents * (public.host_service_fee_policy() ->> 'rate_bps')::numeric / 10000)::integer end;
$$;

create or replace function private.host_application_fee_percent()
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round((public.host_service_fee_policy() ->> 'rate_bps')::numeric / 100, 2);
$$;

-- Step 6 tables: Stripe is now an allowed provider -----------------------------------------------------

alter table public.host_charges drop constraint host_charges_provider_check;
alter table public.host_charges add constraint host_charges_provider_check check (provider in ('none', 'stripe'));
-- provider_ref: the PaymentIntent (pi_…). provider_invoice: the subscription invoice (in_…).
alter table public.host_charges add column provider_invoice text;
create unique index host_charges_provider_ref_idx on public.host_charges (provider, provider_ref)
  where provider_ref is not null;
create unique index host_charges_provider_invoice_idx on public.host_charges (provider, provider_invoice)
  where provider_invoice is not null;

alter table public.host_refunds drop constraint host_refunds_provider_check;
alter table public.host_refunds add constraint host_refunds_provider_check check (provider in ('none', 'stripe'));
-- provider_ref: the Stripe refund (re_…).
create unique index host_refunds_provider_ref_idx on public.host_refunds (provider, provider_ref)
  where provider_ref is not null;

alter table public.host_payouts drop constraint host_payouts_provider_check;
alter table public.host_payouts add constraint host_payouts_provider_check check (provider in ('none', 'stripe'));

-- A Stripe monthly membership: provider_ref is the subscription (sub_…).
alter table public.host_memberships add column provider text not null default 'none'
  check (provider in ('none', 'stripe'));
alter table public.host_memberships add column provider_ref text;
create unique index host_memberships_provider_ref_idx on public.host_memberships (provider, provider_ref)
  where provider_ref is not null;

-- Accounts --------------------------------------------------------------------------------------------------

create table public.host_payment_accounts (
  program_id uuid primary key references public.host_programs (id) on delete cascade,
  provider text not null default 'stripe' check (provider = 'stripe'),
  account_id text not null unique check (account_id ~ '^acct_[A-Za-z0-9]+$'),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  -- Stripe's requirements.currently_due (field names, no values).
  requirements_due text[] not null default '{}',
  disabled_reason text check (char_length(disabled_reason) <= 120),
  livemode boolean not null default false check (not livemode),
  -- The first time it could take payments and pay out.
  ready_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Checkouts -------------------------------------------------------------------------------------------------

create table public.payment_checkouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.host_programs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.payment_checkout_kind not null,
  pass_id uuid references public.host_passes (id),
  session_id uuid references public.host_sessions (id) on delete set null,
  amount_cents integer not null check (amount_cents between 1 and 100000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  application_fee_cents integer not null default 0 check (application_fee_cents >= 0),
  status public.payment_checkout_status not null default 'creating',
  provider text not null default 'stripe' check (provider = 'stripe'),
  account_id text not null,
  provider_session_id text unique,
  -- The hosted page (while open).
  url text,
  expires_at timestamptz,
  completed_at timestamptz,
  -- What it became in the ledger.
  charge_id uuid references public.host_charges (id) on delete set null,
  membership_id uuid references public.host_memberships (id) on delete set null,
  -- Stripe's ids from the completed session.
  provider_payment_intent text,
  provider_subscription text,
  provider_invoice text,
  -- Why it was refunded straight away ('already_covered', 'not_attending', 'session_skipped', 'already_member').
  refund_reason text,
  idempotency_key uuid not null,
  livemode boolean not null default false check (not livemode),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (kind <> 'drop_in' or session_id is not null or status <> 'creating'),
  check (kind = 'drop_in' or pass_id is not null),
  -- completed_at: when Stripe confirmed the payment (completed, or paid and sent back).
  check ((status in ('completed', 'refunded')) = (completed_at is not null))
);
create index payment_checkouts_user_idx on public.payment_checkouts (user_id, created_at desc);
create index payment_checkouts_program_idx on public.payment_checkouts (program_id, status);

-- Disputes and provider payouts ---------------------------------------------------------------------------

create table public.host_disputes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.host_programs (id) on delete cascade,
  charge_id uuid references public.host_charges (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_ref text not null unique,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  -- Stripe's reason ('fraudulent', 'product_not_received', …) and raw status.
  reason text,
  provider_status text,
  status public.host_dispute_status not null default 'open',
  -- Lost: the refund row that takes it off the payout.
  refund_id uuid references public.host_refunds (id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index host_disputes_program_idx on public.host_disputes (program_id, status);

create table public.host_provider_payouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.host_programs (id) on delete cascade,
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_ref text not null unique,
  amount_cents bigint not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  -- Stripe's payout status: pending, in_transit, paid, failed, canceled.
  status text not null check (status in ('pending', 'in_transit', 'paid', 'failed', 'canceled')),
  arrival_date date,
  failure_code text,
  -- The closed week it pays (pays_on = arrival_date).
  payout_id uuid references public.host_payouts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index host_provider_payouts_program_idx on public.host_provider_payouts (program_id, arrival_date desc);

-- Private: events and the outbox -------------------------------------------------------------------------

create table private.stripe_events (
  id text primary key check (id ~ '^evt_'),
  type text not null,
  account text,
  livemode boolean not null default false,
  created timestamptz,
  -- processed / ignored / not_found / amount_mismatch / refused_livemode.
  result text not null,
  detail jsonb not null default '{}',
  received_at timestamptz not null default now()
);
create index stripe_events_received_idx on private.stripe_events (received_at desc);

create table private.payment_outbox (
  id uuid primary key default gen_random_uuid(),
  kind public.payment_outbox_kind not null,
  program_id uuid references public.host_programs (id) on delete cascade,
  -- refund: our refund row, or (refund_id null) a checkout we couldn't honour.
  refund_id uuid references public.host_refunds (id) on delete cascade,
  checkout_id uuid references public.payment_checkouts (id) on delete cascade,
  -- sync_subscription: the membership whose state Stripe should match.
  membership_id uuid references public.host_memberships (id) on delete cascade,
  -- cancel_subscription: the subscription to cancel now (no membership: a duplicate monthly).
  provider_ref text,
  status public.payment_outbox_status not null default 'queued',
  not_before timestamptz not null default now(),
  leased_until timestamptz,
  attempts integer not null default 0,
  last_error text,
  result_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'refund' or refund_id is not null or checkout_id is not null),
  check (kind <> 'sync_subscription' or membership_id is not null),
  check (kind <> 'cancel_subscription' or provider_ref is not null)
);
create index payment_outbox_due_idx on private.payment_outbox (not_before) where status in ('queued', 'sending');
-- One live job per refund, per unhonoured checkout and per membership sync.
create unique index payment_outbox_refund_idx on private.payment_outbox (refund_id)
  where refund_id is not null and status in ('queued', 'sending', 'done');
create unique index payment_outbox_checkout_idx on private.payment_outbox (checkout_id)
  where checkout_id is not null and kind = 'refund' and status in ('queued', 'sending', 'done');
create unique index payment_outbox_sync_idx on private.payment_outbox (membership_id)
  where kind = 'sync_subscription' and status in ('queued', 'sending');

create trigger set_updated_at before update on public.host_payment_accounts
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.payment_checkouts
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_disputes
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_provider_payouts
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on private.payment_outbox
  for each row execute function private.set_updated_at();

-- RLS: reads only; writes go through RPCs and the service-role functions ---------------------------------

alter table public.host_payment_accounts enable row level security;
alter table public.payment_checkouts enable row level security;
alter table public.host_disputes enable row level security;
alter table public.host_provider_payouts enable row level security;

grant select on public.host_payment_accounts, public.payment_checkouts, public.host_disputes,
  public.host_provider_payouts to authenticated;

create policy "host_payment_accounts: hosts" on public.host_payment_accounts
  for select to authenticated using (authz.is_program_host(program_id));
create policy "payment_checkouts: self and hosts" on public.payment_checkouts
  for select to authenticated using (user_id = auth.uid() or authz.is_program_host(program_id));
create policy "host_disputes: hosts" on public.host_disputes
  for select to authenticated using (authz.is_program_host(program_id));
create policy "host_provider_payouts: hosts" on public.host_provider_payouts
  for select to authenticated using (authz.is_program_host(program_id));

revoke all on private.stripe_events, private.payment_outbox from public, anon, authenticated;

alter publication supabase_realtime add table public.host_payment_accounts, public.payment_checkouts;

grant execute on function public.payments_mode_policy() to anon, authenticated, service_role;
revoke all on function private.payments_live_enabled(), private.host_application_fee_cents(bigint),
  private.host_application_fee_percent() from public, anon, authenticated;
grant execute on function private.payments_live_enabled(), private.host_application_fee_cents(bigint),
  private.host_application_fee_percent() to service_role;
