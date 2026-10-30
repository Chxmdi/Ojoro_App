-- Step 8 BE-PAYMENTS: the Stripe webhook's ledger writes. The stripe-webhook function verifies the
-- signature and calls public.payments_record_stripe_event(event) with the service role; everything
-- below runs in that one transaction, once per Stripe event id (private.stripe_events).
-- Contract: docs/PAYMENTS_CONTRACT.md §Webhook.
--
-- Event shapes follow Stripe API 2026-09-30 (npm:stripe@23.0.0) and accept the older field places
-- too (invoice.subscription vs invoice.parent.subscription_details.subscription, and so on).

-- Small helpers -----------------------------------------------------------------------------------------

create or replace function private.payments_uuid(p text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end;
$$;

create or replace function private.payments_ts(p text)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case when p ~ '^[0-9]+$' then to_timestamp(p::bigint) end;
$$;

-- The subscription and PaymentIntent of an invoice, wherever this API version puts them.
create or replace function private.payments_invoice_subscription(p_invoice jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(p_invoice ->> 'subscription', ''),
                  p_invoice #>> '{parent,subscription_details,subscription}',
                  p_invoice #>> '{lines,data,0,parent,subscription_item_details,subscription}',
                  p_invoice #>> '{lines,data,0,subscription}');
$$;

create or replace function private.payments_invoice_payment_intent(p_invoice jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(p_invoice ->> 'payment_intent', ''),
                  p_invoice #>> '{payments,data,0,payment,payment_intent}');
$$;

-- Queue work for Stripe (drained by payments-drain). Returns the job id (or the live one already there).
create or replace function private.payments_enqueue(
  p_kind public.payment_outbox_kind,
  p_program uuid,
  p_refund uuid default null,
  p_checkout uuid default null,
  p_membership uuid default null,
  p_provider_ref text default null,
  p_not_before timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_kind = 'sync_subscription' then
    -- One open sync per membership: move it to the latest wanted time.
    update private.payment_outbox set not_before = greatest(p_not_before, now()), status = 'queued',
           leased_until = null
     where kind = 'sync_subscription' and membership_id = p_membership and status = 'queued'
    returning id into v_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  insert into private.payment_outbox (kind, program_id, refund_id, checkout_id, membership_id, provider_ref, not_before)
  values (p_kind, p_program, p_refund, p_checkout, p_membership, p_provider_ref, p_not_before)
  on conflict do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Checkout: grant what was paid for ---------------------------------------------------------------------

-- Fulfil a paid checkout like grant_host_pass / mark_paid_at_field would, with method 'app' and
-- provider 'stripe'. Returns {charge_id, membership_id} or {refund_reason} when it can't be honoured.
create or replace function private.payments_fulfil(p_checkout uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.payment_checkouts%rowtype;
  v_s public.host_sessions%rowtype;
  v_p public.host_passes%rowtype;
  v_pay jsonb;
  v_charge uuid;
  v_m uuid;
begin
  select * into v_c from public.payment_checkouts where id = p_checkout;
  if v_c.kind = 'drop_in' then
    select * into v_s from public.host_sessions where id = v_c.session_id;
    if not found or v_s.status = 'skipped' then
      return jsonb_build_object('refund_reason', 'session_skipped');
    end if;
    if not exists (select 1 from public.attendance a where a.activity_id = v_s.activity_id and a.user_id = v_c.user_id
                   and a.status in ('confirmed', 'checked_in')) then
      return jsonb_build_object('refund_reason', 'not_attending');
    end if;
    perform pg_advisory_xact_lock(hashtextextended('host_drop_in:' || v_s.id || ':' || v_c.user_id, 0));
    v_pay := private.host_payment_of(v_s.id, v_c.user_id);
    if v_pay ->> 'state' <> 'due' then
      return jsonb_build_object('refund_reason', 'already_covered');
    end if;
    if v_pay ->> 'charge_id' is not null then
      update public.host_charges
         set status = 'paid', paid_at = now(), method = 'app', provider = 'stripe',
             provider_ref = v_c.provider_payment_intent, amount_cents = v_c.amount_cents, currency = v_c.currency
       where id = (v_pay ->> 'charge_id')::uuid
      returning id into v_charge;
    else
      insert into public.host_charges (program_id, user_id, kind, session_id, amount_cents, currency, status, method,
                                       provider, provider_ref, paid_at)
      values (v_c.program_id, v_c.user_id, 'drop_in', v_s.id, v_c.amount_cents, v_c.currency, 'paid', 'app',
              'stripe', v_c.provider_payment_intent, now())
      returning id into v_charge;
    end if;
  else
    select * into v_p from public.host_passes where id = v_c.pass_id;
    if v_c.kind = 'monthly' and exists (
         select 1 from public.host_memberships m
         where m.program_id = v_c.program_id and m.user_id = v_c.user_id and m.kind = 'monthly'
           and m.status <> 'ended' and m.period_ends_at > now()) then
      return jsonb_build_object('refund_reason', 'already_member');
    end if;
    insert into public.host_memberships (program_id, pass_id, user_id, kind, period_ends_at, renews, sessions_total,
                                         provider, provider_ref)
    values (v_c.program_id, v_p.id, v_c.user_id, v_p.kind,
            case v_p.kind when 'monthly' then now() + interval '1 month'
                          when 'pack' then now() + make_interval(days => coalesce(v_p.valid_days, 120)) end,
            v_p.kind = 'monthly', v_p.sessions_included,
            case when v_c.kind = 'monthly' then 'stripe' else 'none' end,
            case when v_c.kind = 'monthly' then v_c.provider_subscription end)
    returning id into v_m;
    insert into public.host_charges (program_id, user_id, kind, pass_id, membership_id, amount_cents, currency,
                                     status, method, provider, provider_ref, provider_invoice, paid_at)
    values (v_c.program_id, v_c.user_id, v_p.kind::text::public.host_charge_kind, v_p.id, v_m, v_c.amount_cents,
            v_c.currency, 'paid', 'app', 'stripe', v_c.provider_payment_intent, v_c.provider_invoice, now())
    returning id into v_charge;
    perform private.host_sync_member(v_c.program_id, v_c.user_id);
  end if;
  insert into public.host_people (program_id, user_id) values (v_c.program_id, v_c.user_id) on conflict do nothing;
  perform private.host_audit(v_c.program_id, v_c.user_id, 'charge_paid', 'host_charge', v_charge, v_c.amount_cents,
    jsonb_build_object('kind', v_c.kind, 'checkout_id', v_c.id, 'membership_id', v_m, 'method', 'app',
                       'provider', 'stripe'));
  return jsonb_build_object('charge_id', v_charge, 'membership_id', v_m);
end;
$$;

-- checkout.session.completed / checkout.session.async_payment_succeeded.
create or replace function private.payments_on_checkout_paid(p_obj jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.payment_checkouts%rowtype;
  v_out jsonb;
  v_reason text;
begin
  select * into v_c from public.payment_checkouts
   where id = private.payments_uuid(coalesce(p_obj #>> '{metadata,ojoro_checkout_id}', p_obj ->> 'client_reference_id'))
      or provider_session_id = p_obj ->> 'id'
   order by (provider_session_id = p_obj ->> 'id') desc nulls last
   limit 1
   for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_c.status in ('completed', 'refunded') then
    return jsonb_build_object('result', 'processed', 'checkout_id', v_c.id, 'already', true);
  end if;
  if coalesce(p_obj ->> 'payment_status', '') not in ('paid', 'no_payment_required') then
    -- An async method (bank debit) that hasn't cleared: wait for async_payment_succeeded.
    return jsonb_build_object('result', 'ignored', 'checkout_id', v_c.id, 'detail', 'awaiting_payment');
  end if;
  if (p_obj ->> 'amount_total')::bigint is distinct from v_c.amount_cents
     or upper(coalesce(p_obj ->> 'currency', '')) <> v_c.currency then
    perform private.host_audit(v_c.program_id, null, 'payment_mismatch', 'payment_checkout', v_c.id, v_c.amount_cents,
      jsonb_build_object('provider', 'stripe', 'amount_total', p_obj ->> 'amount_total', 'currency', p_obj ->> 'currency',
                         'provider_session_id', p_obj ->> 'id'));
    return jsonb_build_object('result', 'amount_mismatch', 'checkout_id', v_c.id);
  end if;
  update public.payment_checkouts
     set provider_session_id = coalesce(provider_session_id, p_obj ->> 'id'),
         provider_payment_intent = coalesce(nullif(p_obj ->> 'payment_intent', ''), provider_payment_intent),
         provider_subscription = coalesce(nullif(p_obj ->> 'subscription', ''), provider_subscription),
         provider_invoice = coalesce(nullif(p_obj ->> 'invoice', ''), provider_invoice)
   where id = v_c.id
  returning * into v_c;
  v_out := private.payments_fulfil(v_c.id);
  v_reason := v_out ->> 'refund_reason';
  if v_reason is not null then
    update public.payment_checkouts
       set status = 'refunded', completed_at = now(), refund_reason = v_reason, url = null
     where id = v_c.id;
    perform private.payments_enqueue('refund', v_c.program_id, p_checkout => v_c.id);
    if v_c.provider_subscription is not null then
      perform private.payments_enqueue('cancel_subscription', v_c.program_id, p_checkout => v_c.id,
                                       p_provider_ref => v_c.provider_subscription);
    end if;
    perform private.host_audit(v_c.program_id, null, 'payment_returned', 'payment_checkout', v_c.id, v_c.amount_cents,
      jsonb_build_object('provider', 'stripe', 'reason', v_reason, 'user_id', v_c.user_id));
    perform private.emit('payments_checkout_refunded', v_c.user_id,
      jsonb_build_object('program_id', v_c.program_id, 'kind', v_c.kind, 'reason', v_reason));
    return jsonb_build_object('result', 'processed', 'checkout_id', v_c.id, 'refund_reason', v_reason, 'drain', true);
  end if;
  update public.payment_checkouts
     set status = 'completed', completed_at = now(), url = null,
         charge_id = (v_out ->> 'charge_id')::uuid, membership_id = (v_out ->> 'membership_id')::uuid
   where id = v_c.id;
  perform private.emit('payments_checkout_completed', v_c.user_id,
    jsonb_build_object('program_id', v_c.program_id, 'kind', v_c.kind));
  return jsonb_build_object('result', 'processed', 'checkout_id', v_c.id) || v_out;
end;
$$;

-- checkout.session.expired / checkout.session.async_payment_failed.
create or replace function private.payments_on_checkout_closed(p_obj jsonb, p_status public.payment_checkout_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.payment_checkouts set status = p_status, url = null
   where (provider_session_id = p_obj ->> 'id'
          or id = private.payments_uuid(p_obj #>> '{metadata,ojoro_checkout_id}'))
     and status in ('creating', 'open')
  returning id into v_id;
  return jsonb_build_object('result', case when v_id is null then 'ignored' else 'processed' end, 'checkout_id', v_id);
end;
$$;

-- Subscriptions ---------------------------------------------------------------------------------------------

-- invoice.paid: a renewal (or the first payment, which checkout.session.completed already recorded).
create or replace function private.payments_on_invoice_paid(p_obj jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub text := private.payments_invoice_subscription(p_obj);
  v_pi text := private.payments_invoice_payment_intent(p_obj);
  v_m public.host_memberships%rowtype;
  v_amount integer := (p_obj ->> 'amount_paid')::integer;
  v_end timestamptz;
  v_charge uuid;
begin
  if v_sub is null then
    return jsonb_build_object('result', 'ignored', 'detail', 'no_subscription');
  end if;
  -- The first invoice: the checkout recorded it; just remember its PaymentIntent for refunds.
  update public.host_charges set provider_ref = coalesce(provider_ref, v_pi), status = 'paid',
         paid_at = coalesce(paid_at, now())
   where provider = 'stripe' and provider_invoice = p_obj ->> 'id'
  returning id into v_charge;
  if v_charge is not null then
    return jsonb_build_object('result', 'processed', 'charge_id', v_charge);
  end if;
  select * into v_m from public.host_memberships where provider = 'stripe' and provider_ref = v_sub for update;
  if not found then
    -- Checkout hasn't been recorded yet (events can arrive in any order): the checkout will be.
    return jsonb_build_object('result', case when p_obj ->> 'billing_reason' = 'subscription_create'
                                             then 'ignored' else 'not_found' end);
  end if;
  if p_obj ->> 'billing_reason' = 'subscription_create' then
    return jsonb_build_object('result', 'ignored', 'detail', 'first_invoice');
  end if;
  if coalesce(v_amount, 0) < 1 then
    return jsonb_build_object('result', 'ignored', 'detail', 'zero_amount');
  end if;
  v_end := coalesce(private.payments_ts(p_obj #>> '{lines,data,0,period,end}'), v_m.period_ends_at + interval '1 month');
  insert into public.host_charges (program_id, user_id, kind, pass_id, membership_id, amount_cents, currency, status,
                                   method, provider, provider_ref, provider_invoice, paid_at)
  values (v_m.program_id, v_m.user_id, 'monthly_renewal', v_m.pass_id, v_m.id, v_amount,
          upper(coalesce(p_obj ->> 'currency', 'cad')), 'paid', 'app', 'stripe', v_pi, p_obj ->> 'id', now())
  returning id into v_charge;
  update public.host_memberships set period_ends_at = greatest(period_ends_at, v_end) where id = v_m.id;
  perform private.host_sync_member(v_m.program_id, v_m.user_id);
  perform private.host_audit(v_m.program_id, null, 'charge_paid', 'host_charge', v_charge, v_amount,
    jsonb_build_object('kind', 'monthly_renewal', 'membership_id', v_m.id, 'method', 'app', 'provider', 'stripe'));
  return jsonb_build_object('result', 'processed', 'charge_id', v_charge, 'membership_id', v_m.id);
end;
$$;

-- invoice.payment_failed: a renewal that didn't go through (Stripe retries; invoice.paid fixes it).
create or replace function private.payments_on_invoice_failed(p_obj jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.host_memberships%rowtype;
  v_amount integer := coalesce((p_obj ->> 'amount_due')::integer, 0);
  v_charge uuid;
begin
  if p_obj ->> 'billing_reason' = 'subscription_create' then
    return jsonb_build_object('result', 'ignored', 'detail', 'first_invoice');
  end if;
  select * into v_m from public.host_memberships
   where provider = 'stripe' and provider_ref = private.payments_invoice_subscription(p_obj);
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_amount < 1 then
    return jsonb_build_object('result', 'ignored', 'detail', 'zero_amount');
  end if;
  insert into public.host_charges (program_id, user_id, kind, pass_id, membership_id, amount_cents, currency, status,
                                   method, provider, provider_invoice)
  values (v_m.program_id, v_m.user_id, 'monthly_renewal', v_m.pass_id, v_m.id, v_amount,
          upper(coalesce(p_obj ->> 'currency', 'cad')), 'failed', 'app', 'stripe', p_obj ->> 'id')
  on conflict (provider, provider_invoice) where provider_invoice is not null do nothing
  returning id into v_charge;
  return jsonb_build_object('result', 'processed', 'charge_id', v_charge, 'membership_id', v_m.id);
end;
$$;

-- customer.subscription.updated / .deleted: keep the membership in step with Stripe.
create or replace function private.payments_on_subscription(p_obj jsonb, p_deleted boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.host_memberships%rowtype;
  v_status text := p_obj ->> 'status';
  v_end timestamptz := coalesce(private.payments_ts(p_obj ->> 'current_period_end'),
                                private.payments_ts(p_obj #>> '{items,data,0,current_period_end}'));
begin
  select * into v_m from public.host_memberships where provider = 'stripe' and provider_ref = p_obj ->> 'id' for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if p_deleted or v_status in ('canceled', 'incomplete_expired', 'unpaid') then
    if v_m.status <> 'ended' then
      update public.host_memberships
         set status = 'ended', ended_at = now(), renews = false, cancelled_at = coalesce(cancelled_at, now()),
             period_ends_at = least(period_ends_at, now())
       where id = v_m.id;
    end if;
  elsif coalesce((p_obj ->> 'cancel_at_period_end')::boolean, false) or p_obj ->> 'cancel_at' is not null then
    if v_m.renews then
      update public.host_memberships
         set renews = false, cancelled_at = coalesce(cancelled_at, now()),
             status = case when status = 'active' then 'cancelled'::public.host_membership_status else status end
       where id = v_m.id;
    end if;
  elsif v_m.status = 'cancelled' and v_status in ('active', 'trialing', 'past_due') then
    update public.host_memberships set renews = true, status = 'active', cancelled_at = null,
           period_ends_at = greatest(period_ends_at, coalesce(v_end, period_ends_at))
     where id = v_m.id;
  elsif v_end is not null and v_m.status <> 'ended' then
    update public.host_memberships set period_ends_at = greatest(period_ends_at, v_end) where id = v_m.id;
  end if;
  perform private.host_sync_member(v_m.program_id, v_m.user_id);
  return jsonb_build_object('result', 'processed', 'membership_id', v_m.id);
end;
$$;

-- Refunds ---------------------------------------------------------------------------------------------------

create or replace function private.payments_refund_status(p_stripe_status text)
returns public.host_refund_status
language sql
immutable
set search_path = ''
as $$
  select case p_stripe_status when 'succeeded' then 'succeeded' when 'failed' then 'failed'
                              when 'canceled' then 'failed' else 'pending' end::public.host_refund_status;
$$;

-- refund.created / refund.updated / refund.failed (and each refund in charge.refunded).
create or replace function private.payments_on_refund(p_obj jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.host_refunds%rowtype;
  v_c public.host_charges%rowtype;
  v_status public.host_refund_status := private.payments_refund_status(p_obj ->> 'status');
  v_left integer;
  v_id uuid;
begin
  select * into v_r from public.host_refunds
   where (provider = 'stripe' and provider_ref = p_obj ->> 'id')
      or id = private.payments_uuid(p_obj #>> '{metadata,ojoro_refund_id}')
   limit 1 for update;
  if found then
    update public.host_refunds set provider = 'stripe', provider_ref = p_obj ->> 'id',
           status = case when status = 'cancelled' then status else v_status end
     where id = v_r.id;
    if v_status = 'failed' and v_r.status <> 'failed' then
      perform private.host_audit(v_r.program_id, null, 'refund_failed', 'host_refund', v_r.id, v_r.amount_cents,
        jsonb_build_object('provider', 'stripe', 'reason', p_obj ->> 'failure_reason'));
      perform private.emit('payments_refund_failed', v_r.user_id, jsonb_build_object('program_id', v_r.program_id));
    end if;
    return jsonb_build_object('result', 'processed', 'refund_id', v_r.id, 'status', v_status);
  end if;
  -- Money back for a checkout we couldn't honour: not in the ledger.
  if p_obj #>> '{metadata,ojoro_checkout_id}' is not null then
    return jsonb_build_object('result', 'processed', 'detail', 'checkout_returned');
  end if;
  -- Made in the Stripe dashboard: record it against the charge.
  select * into v_c from public.host_charges
   where provider = 'stripe' and provider_ref is not null and provider_ref = p_obj ->> 'payment_intent' for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  v_left := private.host_refundable_cents(v_c.id);
  if v_left <= 0 or v_status = 'failed' then
    return jsonb_build_object('result', 'ignored', 'detail', 'nothing_refundable');
  end if;
  insert into public.host_refunds (program_id, charge_id, user_id, amount_cents, currency, reason, status, provider,
                                   provider_ref)
  values (v_c.program_id, v_c.id, v_c.user_id, least(v_left, (p_obj ->> 'amount')::integer), v_c.currency,
          'provider_initiated', v_status, 'stripe', p_obj ->> 'id')
  returning id into v_id;
  perform private.host_audit(v_c.program_id, null, 'refund_auto', 'host_refund', v_id, least(v_left, (p_obj ->> 'amount')::integer),
    jsonb_build_object('reason', 'provider_initiated', 'charge_id', v_c.id, 'provider', 'stripe'));
  return jsonb_build_object('result', 'processed', 'refund_id', v_id, 'status', v_status);
end;
$$;

-- Disputes --------------------------------------------------------------------------------------------------

create or replace function private.payments_on_dispute(p_obj jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.host_charges%rowtype;
  v_d public.host_disputes%rowtype;
  v_status public.host_dispute_status := case p_obj ->> 'status' when 'won' then 'won' when 'lost' then 'lost'
                                                                 else 'open' end::public.host_dispute_status;
  v_new boolean;
  v_left integer;
  v_refund uuid;
begin
  select * into v_c from public.host_charges
   where provider = 'stripe' and provider_ref is not null and provider_ref = p_obj ->> 'payment_intent';
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  v_new := not exists (select 1 from public.host_disputes where provider_ref = p_obj ->> 'id');
  insert into public.host_disputes (program_id, charge_id, user_id, provider_ref, amount_cents, currency, reason,
                                    provider_status, status, closed_at)
  values (v_c.program_id, v_c.id, v_c.user_id, p_obj ->> 'id', coalesce((p_obj ->> 'amount')::integer, v_c.amount_cents),
          upper(coalesce(p_obj ->> 'currency', v_c.currency)), left(p_obj ->> 'reason', 60), p_obj ->> 'status',
          v_status, case when v_status <> 'open' then now() end)
  on conflict (provider_ref) do update
    set provider_status = excluded.provider_status, status = excluded.status,
        closed_at = case when excluded.status <> 'open' then coalesce(public.host_disputes.closed_at, now()) end
  returning * into v_d;
  if v_new then
    perform private.host_audit(v_c.program_id, null, 'dispute_opened', 'host_dispute', v_d.id, v_d.amount_cents,
      jsonb_build_object('provider', 'stripe', 'charge_id', v_c.id, 'reason', v_d.reason));
    perform private.emit('payments_dispute_opened', v_c.user_id, jsonb_build_object('program_id', v_c.program_id));
  end if;
  if v_status = 'lost' and v_d.refund_id is null then
    v_left := private.host_refundable_cents(v_c.id);
    if v_left > 0 then
      insert into public.host_refunds (program_id, charge_id, user_id, amount_cents, currency, reason, status, provider)
      values (v_c.program_id, v_c.id, v_c.user_id, least(v_left, v_d.amount_cents), v_c.currency, 'dispute_lost',
              'succeeded', 'stripe')
      returning id into v_refund;
      update public.host_disputes set refund_id = v_refund where id = v_d.id;
    end if;
    perform private.host_audit(v_c.program_id, null, 'dispute_lost', 'host_dispute', v_d.id, v_d.amount_cents,
      jsonb_build_object('provider', 'stripe', 'refund_id', v_refund));
  end if;
  return jsonb_build_object('result', 'processed', 'dispute_id', v_d.id, 'status', v_status);
end;
$$;

-- Payouts (Connect) ------------------------------------------------------------------------------------------

create or replace function private.payments_on_payout(p_account text, p_obj jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.host_payment_accounts%rowtype;
  v_tz text;
  v_arrival date;
  v_week public.host_payouts%rowtype;
  v_id uuid;
  v_status text := coalesce(p_obj ->> 'status', 'pending');
begin
  select * into v_a from public.host_payment_accounts where account_id = p_account;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_status not in ('pending', 'in_transit', 'paid', 'failed', 'canceled') then
    v_status := 'pending';
  end if;
  select time_zone into v_tz from public.host_programs where id = v_a.program_id;
  v_arrival := (private.payments_ts(p_obj ->> 'arrival_date') at time zone v_tz)::date;
  select * into v_week from public.host_payouts
   where program_id = v_a.program_id and pays_on = v_arrival order by period_start desc limit 1 for update;
  insert into public.host_provider_payouts (program_id, provider_ref, amount_cents, currency, status, arrival_date,
                                            failure_code, payout_id)
  values (v_a.program_id, p_obj ->> 'id', coalesce((p_obj ->> 'amount')::bigint, 0),
          upper(coalesce(p_obj ->> 'currency', 'cad')), v_status, v_arrival, p_obj ->> 'failure_code', v_week.id)
  on conflict (provider_ref) do update
    set status = excluded.status, amount_cents = excluded.amount_cents, arrival_date = excluded.arrival_date,
        failure_code = excluded.failure_code,
        payout_id = coalesce(public.host_provider_payouts.payout_id, excluded.payout_id)
  returning id into v_id;
  if v_week.id is not null and v_status in ('paid', 'failed') then
    update public.host_payouts
       set status = v_status::public.host_payout_status, provider = 'stripe', provider_ref = p_obj ->> 'id',
           paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) end
     where id = v_week.id;
  end if;
  perform private.emit('payments_payout_recorded', v_a.created_by,
    jsonb_build_object('program_id', v_a.program_id, 'status', v_status));
  return jsonb_build_object('result', 'processed', 'provider_payout_id', v_id, 'payout_id', v_week.id);
end;
$$;

-- The entry point -------------------------------------------------------------------------------------------

-- Service role only (stripe-webhook, after verifying the signature). Processes each event id once.
create or replace function public.payments_record_stripe_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := p_event ->> 'id';
  v_type text := p_event ->> 'type';
  v_obj jsonb := p_event #> '{data,object}';
  v_live boolean := coalesce((p_event ->> 'livemode')::boolean, false) or coalesce((v_obj ->> 'livemode')::boolean, false);
  v_out jsonb;
  r jsonb;
begin
  if v_id is null or v_id !~ '^evt_' or v_type is null or jsonb_typeof(v_obj) <> 'object' then
    perform private.fail('invalid_argument', 'event');
  end if;
  insert into private.stripe_events (id, type, account, livemode, created, result)
  values (v_id, v_type, p_event ->> 'account', v_live, private.payments_ts(p_event ->> 'created'), 'processing')
  on conflict (id) do nothing;
  if not found then
    return jsonb_build_object('result', 'duplicate', 'event_id', v_id, 'type', v_type);
  end if;
  -- Ledger changes made here come from Stripe: don't echo them back as subscription syncs.
  perform set_config('ojoro.payments_source', 'stripe', true);
  if v_live and not private.payments_live_enabled() then
    v_out := jsonb_build_object('result', 'refused_livemode');
  else
    v_out := case
      when v_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
        then private.payments_on_checkout_paid(v_obj)
      when v_type = 'checkout.session.expired' then private.payments_on_checkout_closed(v_obj, 'expired')
      when v_type = 'checkout.session.async_payment_failed' then private.payments_on_checkout_closed(v_obj, 'failed')
      when v_type = 'invoice.paid' then private.payments_on_invoice_paid(v_obj)
      when v_type = 'invoice.payment_failed' then private.payments_on_invoice_failed(v_obj)
      when v_type = 'customer.subscription.updated' then private.payments_on_subscription(v_obj, false)
      when v_type = 'customer.subscription.deleted' then private.payments_on_subscription(v_obj, true)
      when v_type in ('refund.created', 'refund.updated', 'refund.failed', 'charge.refund.updated')
        then private.payments_on_refund(v_obj)
      when v_type in ('charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
                      'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated')
        then private.payments_on_dispute(v_obj)
      when v_type = 'account.updated' then
        case when public.payments_update_account(v_obj) is null then jsonb_build_object('result', 'not_found')
             else jsonb_build_object('result', 'processed') end
      when v_type in ('payout.created', 'payout.updated', 'payout.paid', 'payout.failed', 'payout.canceled')
        then private.payments_on_payout(coalesce(p_event ->> 'account', v_obj ->> 'destination_account'), v_obj)
      else jsonb_build_object('result', 'ignored')
    end;
    if v_type = 'charge.refunded' then
      v_out := jsonb_build_object('result', 'ignored', 'detail', 'no_refunds_listed');
      if jsonb_typeof(v_obj #> '{refunds,data}') = 'array' then
        for r in select * from jsonb_array_elements(v_obj #> '{refunds,data}') loop
          v_out := private.payments_on_refund(r || jsonb_build_object('payment_intent',
                     coalesce(r ->> 'payment_intent', v_obj ->> 'payment_intent')));
        end loop;
      end if;
    end if;
  end if;
  update private.stripe_events set result = v_out ->> 'result', detail = v_out - 'result' where id = v_id;
  perform set_config('ojoro.payments_source', '', true);
  return v_out || jsonb_build_object('event_id', v_id, 'type', v_type);
end;
$$;

revoke all on function private.payments_uuid(text), private.payments_ts(text),
  private.payments_invoice_subscription(jsonb), private.payments_invoice_payment_intent(jsonb),
  private.payments_enqueue(public.payment_outbox_kind, uuid, uuid, uuid, uuid, text, timestamptz),
  private.payments_fulfil(uuid), private.payments_on_checkout_paid(jsonb),
  private.payments_on_checkout_closed(jsonb, public.payment_checkout_status), private.payments_on_invoice_paid(jsonb),
  private.payments_on_invoice_failed(jsonb), private.payments_on_subscription(jsonb, boolean),
  private.payments_refund_status(text), private.payments_on_refund(jsonb), private.payments_on_dispute(jsonb),
  private.payments_on_payout(text, jsonb)
  from public, anon, authenticated;

revoke all on function public.payments_record_stripe_event(jsonb) from public, anon, authenticated;
grant execute on function public.payments_record_stripe_event(jsonb) to service_role;
