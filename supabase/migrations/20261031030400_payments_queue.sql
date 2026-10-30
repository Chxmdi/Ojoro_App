-- Step 8 BE-PAYMENTS: refunds and subscription changes go to Stripe through a server queue
-- (private.payment_outbox, drained by the payments-drain function), and the Step 6 reads learn about
-- Stripe. Contract: docs/PAYMENTS_CONTRACT.md §Refunds and the queue, §Memberships and renewals.
--
-- Step 6 functions wrapped here (their bodies are unchanged and move to private.*_base):
--   public.host_money_view          + provider, payments_connected, payment_account, disputes, provider_payouts
--   private.host_decision_state     + the refund's provider and whether Stripe has it
--   public.undo_host_refund_decision  closes once the refund has been sent to Stripe
-- Redefined: private.host_ops_tick (Stripe memberships renew through Stripe, not the tick).

-- Refund rows on Stripe charges --------------------------------------------------------------------------

-- A refund on a Stripe charge is a Stripe refund (unless it already is one: dashboard, lost dispute).
create or replace function private.payments_refund_provider()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider = 'none' and new.reason in ('host_decision', 'spot_filled', 'session_cancelled')
     and exists (select 1 from public.host_charges c where c.id = new.charge_id and c.provider = 'stripe') then
    new.provider := 'stripe';
  end if;
  return new;
end;
$$;

create trigger payments_refund_provider before insert on public.host_refunds
  for each row execute function private.payments_refund_provider();

-- Queue it. Host decisions wait out the 10-minute UNDO; automatic refunds go at once.
create or replace function private.payments_queue_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider = 'stripe' and new.provider_ref is null and new.status = 'pending'
     and new.reason in ('host_decision', 'spot_filled', 'session_cancelled') then
    perform private.payments_enqueue('refund', new.program_id, p_refund => new.id,
      p_not_before => case when new.reason = 'host_decision' then now() + interval '10 minutes' else now() end);
  end if;
  return null;
end;
$$;

create trigger payments_queue_refund after insert on public.host_refunds
  for each row execute function private.payments_queue_refund();

-- UNDO cancelled the refund before it was sent: drop the job.
create or replace function private.payments_unqueue_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update private.payment_outbox set status = 'cancelled' where refund_id = new.id and status = 'queued';
  end if;
  return null;
end;
$$;

create trigger payments_unqueue_refund after update of status on public.host_refunds
  for each row execute function private.payments_unqueue_refund();

-- Stripe memberships: keep the subscription in step --------------------------------------------------------

-- Any change to whether a Stripe membership renews or has ended (cancel, KEEP IT, a refund, UNDO) asks
-- Stripe to match. Ending now waits out the 10-minute UNDO. Changes that came from Stripe's own
-- webhook aren't echoed back.
create or replace function private.payments_queue_subscription_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider = 'stripe' and new.provider_ref is not null
     and (new.renews is distinct from old.renews or new.status is distinct from old.status)
     and coalesce(current_setting('ojoro.payments_source', true), '') <> 'stripe' then
    perform private.payments_enqueue('sync_subscription', new.program_id, p_membership => new.id,
      p_not_before => case when new.status = 'ended' then now() + interval '10 minutes' else now() end);
  end if;
  return null;
end;
$$;

create trigger payments_queue_subscription_sync after update of renews, status on public.host_memberships
  for each row execute function private.payments_queue_subscription_sync();

-- Draining (service role: payments-drain) ---------------------------------------------------------------

-- Claim up to p_limit due jobs (leased for 2 minutes; a crashed drain's jobs come back) and say what to
-- send. Jobs with nothing left to do are closed here and not returned.
create or replace function public.payments_claim_outbox(p_limit integer default 20)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_job private.payment_outbox%rowtype;
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_r public.host_refunds%rowtype;
  v_c public.host_charges%rowtype;
  v_k public.payment_checkouts%rowtype;
  v_m public.host_memberships%rowtype;
begin
  for v_job in
    with due as (
      select o.id from private.payment_outbox o
      where (o.status = 'queued' and o.not_before <= now())
         or (o.status = 'sending' and o.leased_until < now())
      order by o.not_before
      limit greatest(1, least(coalesce(p_limit, 20), 100))
      for update skip locked
    )
    update private.payment_outbox o
       set status = 'sending', leased_until = now() + interval '2 minutes', attempts = o.attempts + 1
      from due where o.id = due.id
    returning o.*
  loop
    v_item := null;
    if v_job.kind = 'refund' and v_job.refund_id is not null then
      select * into v_r from public.host_refunds where id = v_job.refund_id;
      select * into v_c from public.host_charges where id = v_r.charge_id;
      if v_r.status = 'cancelled' then
        update private.payment_outbox set status = 'cancelled', leased_until = null where id = v_job.id;
      elsif v_r.provider_ref is not null then
        update private.payment_outbox set status = 'done', result_ref = v_r.provider_ref, leased_until = null
         where id = v_job.id;
      else
        v_item := jsonb_build_object(
          'idempotency_key', 'ojoro-refund-' || v_r.id,
          'amount_cents', v_r.amount_cents, 'currency', v_r.currency,
          'payment_intent', v_c.provider_ref, 'invoice', v_c.provider_invoice,
          'refund_application_fee', true, 'reverse_transfer', true,
          'metadata', jsonb_build_object('ojoro_refund_id', v_r.id::text, 'ojoro_program_id', v_r.program_id::text,
                                         'ojoro_reason', v_r.reason::text));
      end if;
    elsif v_job.kind = 'refund' then
      select * into v_k from public.payment_checkouts where id = v_job.checkout_id;
      v_item := jsonb_build_object(
        'idempotency_key', 'ojoro-checkout-refund-' || v_k.id,
        'amount_cents', v_k.amount_cents, 'currency', v_k.currency,
        'payment_intent', v_k.provider_payment_intent, 'invoice', v_k.provider_invoice,
        'refund_application_fee', true, 'reverse_transfer', true,
        'metadata', jsonb_build_object('ojoro_checkout_id', v_k.id::text, 'ojoro_program_id', v_k.program_id::text,
                                       'ojoro_reason', coalesce(v_k.refund_reason, 'unfulfilled')));
    elsif v_job.kind = 'sync_subscription' then
      select * into v_m from public.host_memberships where id = v_job.membership_id;
      if v_m.provider_ref is null then
        update private.payment_outbox set status = 'done', leased_until = null where id = v_job.id;
      else
        v_item := jsonb_build_object(
          'idempotency_key', 'ojoro-sub-' || v_job.id,
          'subscription', v_m.provider_ref,
          'want', case when v_m.status = 'ended' then 'cancel_now'
                       when not v_m.renews then 'cancel_at_period_end' else 'renew' end);
      end if;
    else
      v_item := jsonb_build_object('idempotency_key', 'ojoro-sub-' || v_job.id, 'subscription', v_job.provider_ref,
                                   'want', 'cancel_now');
    end if;
    if v_item is not null then
      v_out := v_out || jsonb_build_array(v_item || jsonb_build_object(
        'job_id', v_job.id, 'kind', v_job.kind, 'attempts', v_job.attempts, 'program_id', v_job.program_id));
    end if;
  end loop;
  return v_out;
end;
$$;

-- Stripe answered. For a refund: its id and status (succeeded / pending / failed / canceled).
create or replace function public.payments_complete_outbox(p_job_id uuid, p_result_ref text, p_provider_status text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.payment_outbox%rowtype;
  v_r public.host_refunds%rowtype;
begin
  select * into v_job from private.payment_outbox where id = p_job_id for update;
  if not found then
    perform private.fail('invalid_argument', 'job');
  end if;
  if v_job.status = 'done' then
    return;
  end if;
  update private.payment_outbox set status = 'done', result_ref = p_result_ref, leased_until = null, last_error = null
   where id = v_job.id;
  if v_job.kind = 'refund' and v_job.refund_id is not null then
    update public.host_refunds
       set provider = 'stripe', provider_ref = coalesce(provider_ref, p_result_ref),
           status = case when status = 'pending' and p_provider_status is not null
                         then private.payments_refund_status(p_provider_status) else status end
     where id = v_job.refund_id
    returning * into v_r;
    perform private.emit('payments_refund_sent', null,
      jsonb_build_object('program_id', v_r.program_id, 'reason', v_r.reason));
  elsif v_job.kind = 'refund' then
    perform private.emit('payments_refund_sent', null,
      jsonb_build_object('program_id', v_job.program_id, 'reason', 'unfulfilled'));
  end if;
end;
$$;

-- Stripe didn't take it. Retry with backoff (1, 2, 4 … minutes), up to 8 tries; then the job and the
-- refund are failed and audited.
create or replace function public.payments_fail_outbox(p_job_id uuid, p_error text, p_retryable boolean default true)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.payment_outbox%rowtype;
  v_r public.host_refunds%rowtype;
begin
  select * into v_job from private.payment_outbox where id = p_job_id for update;
  if not found then
    perform private.fail('invalid_argument', 'job');
  end if;
  if v_job.status <> 'sending' then
    return v_job.status::text;
  end if;
  if coalesce(p_retryable, true) and v_job.attempts < 8 then
    update private.payment_outbox
       set status = 'queued', leased_until = null, last_error = left(p_error, 300),
           not_before = now() + make_interval(mins => power(2, greatest(v_job.attempts - 1, 0))::int)
     where id = v_job.id;
    return 'queued';
  end if;
  update private.payment_outbox set status = 'failed', leased_until = null, last_error = left(p_error, 300)
   where id = v_job.id;
  if v_job.kind = 'refund' and v_job.refund_id is not null then
    update public.host_refunds set status = 'failed' where id = v_job.refund_id and status = 'pending'
    returning * into v_r;
    if v_r.id is not null then
      perform private.host_audit(v_r.program_id, null, 'refund_failed', 'host_refund', v_r.id, v_r.amount_cents,
        jsonb_build_object('provider', 'stripe', 'error', left(p_error, 120)));
      perform private.emit('payments_refund_failed', v_r.user_id, jsonb_build_object('program_id', v_r.program_id));
    end if;
  elsif v_job.program_id is not null then
    perform private.host_audit(v_job.program_id, null, 'payment_job_failed', 'payment_outbox', v_job.id, null,
      jsonb_build_object('provider', 'stripe', 'kind', v_job.kind, 'error', left(p_error, 120)));
  end if;
  return 'failed';
end;
$$;

-- pg_cron: kick payments-drain every minute when there's due work and the Vault says where it is
-- (secrets payments_drain_url and payments_drain_secret). Without them it does nothing.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end;
$$;

create or replace function private.payments_kick_drain()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from private.payment_outbox
                 where (status = 'queued' and not_before <= now()) or (status = 'sending' and leased_until < now())) then
    return false;
  end if;
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return false;
  end if;
  execute $q$select max(decrypted_secret) filter (where name = 'payments_drain_url'),
                    max(decrypted_secret) filter (where name = 'payments_drain_secret')
             from vault.decrypted_secrets where name in ('payments_drain_url', 'payments_drain_secret')$q$
    into v_url, v_secret;
  if v_url is null or v_secret is null then
    return false;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 30000)'
    using v_url, '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret);
  return true;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ojoro_payments_drain', '* * * * *', 'select private.payments_kick_drain()');
  else
    raise notice 'pg_cron not available: call private.payments_kick_drain() from a scheduler';
  end if;
end;
$$;

-- Step 6 wrappers --------------------------------------------------------------------------------------

alter function private.host_decision_state(uuid) rename to host_decision_state_base;

create or replace function private.host_decision_state(p_request uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.host_decision_state_base(p_request) || jsonb_build_object(
    'provider', coalesce((select r.provider from public.host_refunds r
                          where r.request_id = p_request and r.status <> 'cancelled'
                          order by r.created_at desc limit 1), 'none'),
    'refund_sent', exists (select 1 from public.host_refunds r
                           where r.request_id = p_request and r.status <> 'cancelled'
                             and (r.provider_ref is not null or exists (
                               select 1 from private.payment_outbox o
                               where o.refund_id = r.id and o.status in ('sending', 'done')))));
$$;

alter function public.undo_host_refund_decision(uuid) set schema private;
alter function private.undo_host_refund_decision(uuid) rename to undo_host_refund_decision_base;

-- UNDO, now also closed once Stripe has the refund (sent or sending). Set-to-state as before.
create or replace function public.undo_host_refund_decision(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_q public.host_refund_requests%rowtype;
  v_sent boolean;
begin
  select * into v_q from public.host_refund_requests where id = p_request_id for update;
  if not found then
    perform private.fail('refund_request_not_found');
  end if;
  perform private.host_require_program_host(v_q.program_id, v_uid);
  -- Hold the queued job so the drain can't take it while we undo (it skips locked rows).
  perform 1 from private.payment_outbox o
   where o.refund_id in (select r.id from public.host_refunds r where r.request_id = v_q.id)
   for update;
  select exists (
    select 1 from public.host_refunds r
    where r.request_id = v_q.id and r.status <> 'cancelled'
      and (r.provider_ref is not null or exists (
        select 1 from private.payment_outbox o where o.refund_id = r.id and o.status in ('sending', 'done', 'failed'))))
    into v_sent;
  if v_q.status <> 'open' and v_sent then
    perform private.fail('refund_undo_closed');
  end if;
  return private.undo_host_refund_decision_base(p_request_id);
end;
$$;

alter function public.host_money_view(uuid) set schema private;
alter function private.host_money_view(uuid) rename to host_money_view_base;

-- HostMembership: Step 6's view plus the program's Stripe account, disputes and Stripe payouts.
create or replace function public.host_money_view(p_program_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_base jsonb;
  v_account jsonb;
begin
  v_base := private.host_money_view_base(p_program_id);
  v_account := private.payments_account_json(p_program_id, v_uid);
  return v_base || jsonb_build_object(
    'provider', v_account ->> 'provider',
    'payments_connected', private.payments_connected(p_program_id),
    'payment_account', v_account,
    'disputes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'charge_id', d.charge_id, 'person', private.host_person(d.user_id),
        'amount_cents', d.amount_cents, 'currency', d.currency, 'reason', d.reason, 'status', d.status,
        'opened_at', d.opened_at) order by d.opened_at desc)
      from public.host_disputes d
      where d.program_id = p_program_id and d.status = 'open'), '[]'::jsonb),
    'provider_payouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'provider_ref', x.provider_ref, 'amount_cents', x.amount_cents, 'currency', x.currency,
        'status', x.status, 'arrival_date', x.arrival_date, 'payout_id', x.payout_id) order by x.arrival_date desc)
      from (select * from public.host_provider_payouts where program_id = p_program_id
            order by arrival_date desc nulls last limit 6) x), '[]'::jsonb)
  );
end;
$$;

-- The tick: Stripe memberships renew through Stripe -------------------------------------------------------

-- As Step 6 (20261030210100), except memberships with provider 'stripe': no 'due' renewal charge and no
-- period roll (Stripe charges and the webhook records it); they end here only if Stripe has been
-- silent for 7 days past the period end.
create or replace function private.host_ops_tick()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m record;
  v_n integer := 0;
begin
  for v_m in
    select m.* from public.host_memberships m
    where m.kind = 'monthly' and m.status = 'active' and m.renews and m.period_ends_at <= now()
      and m.provider = 'none'
    for update
  loop
    update public.host_memberships set period_ends_at = period_ends_at + interval '1 month' where id = v_m.id;
    insert into public.host_charges (program_id, user_id, kind, pass_id, membership_id, amount_cents, currency, status, method)
    select v_m.program_id, v_m.user_id, 'monthly_renewal', p.id, v_m.id, p.price_cents, p.currency, 'due', 'app'
    from public.host_passes p where p.id = v_m.pass_id and p.price_cents > 0;
    perform private.host_sync_member(v_m.program_id, v_m.user_id);
    v_n := v_n + 1;
  end loop;
  for v_m in
    select m.* from public.host_memberships m
    where m.status <> 'ended'
      and ((m.period_ends_at is not null and m.period_ends_at <= now() and not m.renews)
           or (m.kind = 'pack' and private.host_sessions_left(m.id) <= 0)
           or (m.provider = 'stripe' and m.renews and m.period_ends_at <= now() - interval '7 days'))
  loop
    update public.host_memberships set status = 'ended', ended_at = now() where id = v_m.id;
    perform private.host_sync_member(v_m.program_id, v_m.user_id);
    v_n := v_n + 1;
  end loop;
  v_n := v_n + private.host_close_payouts();
  return v_n;
end;
$$;

-- Grants ------------------------------------------------------------------------------------------------

revoke all on function private.payments_refund_provider(), private.payments_queue_refund(),
  private.payments_unqueue_refund(), private.payments_queue_subscription_sync(), private.payments_kick_drain(),
  private.host_decision_state(uuid), private.host_decision_state_base(uuid),
  private.undo_host_refund_decision_base(uuid), private.host_money_view_base(uuid)
  from public, anon, authenticated;
grant execute on function private.host_ops_tick(), private.payments_kick_drain() to service_role;

revoke all on function public.undo_host_refund_decision(uuid), public.host_money_view(uuid) from public, anon;
grant execute on function public.undo_host_refund_decision(uuid), public.host_money_view(uuid)
  to authenticated, service_role;

revoke all on function public.payments_claim_outbox(integer), public.payments_complete_outbox(uuid, text, text),
  public.payments_fail_outbox(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.payments_claim_outbox(integer), public.payments_complete_outbox(uuid, text, text),
  public.payments_fail_outbox(uuid, text, boolean) to service_role;
