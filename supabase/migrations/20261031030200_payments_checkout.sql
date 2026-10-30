-- Step 8 BE-PAYMENTS: Connect accounts and Checkout (server-priced). Schema: 20261031030100.
-- Contract: docs/PAYMENTS_CONTRACT.md.
--
-- The edge functions call these: as the signed-in user for checks and prices (begin_*), and with the
-- service role to store what Stripe answered (payments_attach_*, payments_update_account). The
-- client never sends a price.

-- Accounts ----------------------------------------------------------------------------------------------

-- HostPaymentAccount for a program (hosts' view). p_viewer decides can_onboard (owners only).
create or replace function private.payments_account_json(p_program uuid, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'program_id', p_program,
    'provider', case when a.program_id is null then 'none' else 'stripe' end,
    'status', case
      when a.program_id is null then 'not_connected'
      when a.charges_enabled and a.payouts_enabled then 'ready'
      when not a.details_submitted then 'onboarding'
      else 'restricted' end,
    'account_id', a.account_id,
    'charges_enabled', coalesce(a.charges_enabled, false),
    'payouts_enabled', coalesce(a.payouts_enabled, false),
    'details_submitted', coalesce(a.details_submitted, false),
    'requirements_due', to_jsonb(coalesce(a.requirements_due, '{}'::text[])),
    'disabled_reason', a.disabled_reason,
    'livemode', coalesce(a.livemode, false),
    'ready_at', a.ready_at,
    'updated_at', a.updated_at,
    'can_onboard', coalesce(authz.program_role(p_program, p_viewer) = 'owner', false)
  )
  from (select p_program as id) x
  left join public.host_payment_accounts a on a.program_id = x.id;
$$;

-- Like host_programs' RLS: hosts, or anyone signed in unless archived or the owner blocked them.
create or replace function private.payments_can_see_program(p_program uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.host_programs p where p.id = p_program
                 and (authz.is_program_host(p.id, p_viewer)
                      or (p.archived_at is null and not authz.is_blocked(p.created_by, p_viewer))));
$$;

-- A program can take payments in the app: its Stripe account can charge and pay out.
create or replace function private.payments_connected(p_program uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.host_payment_accounts a
                 where a.program_id = p_program and a.charges_enabled and a.payouts_enabled and not a.livemode);
$$;

create or replace function public.host_payment_account(p_program_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.host_require_program_host(p_program_id, v_uid);
  return private.payments_account_json(p_program_id, v_uid);
end;
$$;

-- payments-connect: who may onboard and what to tell Stripe. Owners only (owner_required).
create or replace function public.payments_connect_context(p_program_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_p public.host_programs%rowtype;
begin
  v_p := private.host_require_program_host(p_program_id, v_uid);
  if authz.program_role(p_program_id, v_uid) is distinct from 'owner' then
    perform private.fail('owner_required');
  end if;
  return jsonb_build_object(
    'program_id', v_p.id,
    'program_name', v_p.name,
    'user_id', v_uid,
    'account', private.payments_account_json(v_p.id, v_uid),
    'live_enabled', private.payments_live_enabled()
  );
end;
$$;

-- Service: store the Express account Stripe made for the program. A program keeps its first account
-- (a retry that made the same account is a no-op).
create or replace function public.payments_attach_account(p_program_id uuid, p_account_id text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new boolean;
begin
  if p_account_id is null or p_account_id !~ '^acct_[A-Za-z0-9]+$' then
    perform private.fail('invalid_argument', 'account_id');
  end if;
  insert into public.host_payment_accounts (program_id, account_id, created_by)
  values (p_program_id, p_account_id, p_user_id)
  on conflict (program_id) do nothing;
  v_new := found;
  if v_new then
    perform private.host_audit(p_program_id, p_user_id, 'payments_account_created', 'host_payment_account', null,
                               null, jsonb_build_object('provider', 'stripe', 'account_id', p_account_id));
    perform private.emit('payments_account_created', p_user_id, jsonb_build_object('program_id', p_program_id));
  end if;
  return private.payments_account_json(p_program_id, p_user_id);
end;
$$;

-- Service: bring an account's flags in step with a Stripe Account object (account.updated, refresh).
-- Returns the account json, or null when the account isn't one of ours.
create or replace function public.payments_update_account(p_account jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.host_payment_accounts%rowtype;
  v_ready boolean;
begin
  select * into v_a from public.host_payment_accounts where account_id = p_account ->> 'id' for update;
  if not found then
    return null;
  end if;
  if coalesce((p_account ->> 'livemode')::boolean, false) and not private.payments_live_enabled() then
    perform private.fail('payments_unavailable', 'live_mode_off');
  end if;
  v_ready := coalesce((p_account ->> 'charges_enabled')::boolean, false)
             and coalesce((p_account ->> 'payouts_enabled')::boolean, false);
  update public.host_payment_accounts
     set charges_enabled = coalesce((p_account ->> 'charges_enabled')::boolean, false),
         payouts_enabled = coalesce((p_account ->> 'payouts_enabled')::boolean, false),
         details_submitted = coalesce((p_account ->> 'details_submitted')::boolean, false),
         requirements_due = coalesce(array(select jsonb_array_elements_text(
                              case when jsonb_typeof(p_account #> '{requirements,currently_due}') = 'array'
                                   then p_account #> '{requirements,currently_due}' else '[]'::jsonb end)), '{}'),
         disabled_reason = left(p_account #>> '{requirements,disabled_reason}', 120),
         ready_at = case when v_ready then coalesce(ready_at, now()) else ready_at end
   where program_id = v_a.program_id;
  if v_ready and v_a.ready_at is null then
    perform private.host_audit(v_a.program_id, null, 'payments_connected', 'host_payment_account', null, null,
                               jsonb_build_object('provider', 'stripe', 'account_id', v_a.account_id));
    perform private.emit('payments_account_ready', v_a.created_by, jsonb_build_object('program_id', v_a.program_id));
  end if;
  return private.payments_account_json(v_a.program_id, v_a.created_by);
end;
$$;

-- Checkout ---------------------------------------------------------------------------------------------

-- What the function needs to make the Stripe session and what the app gets back.
create or replace function private.payments_checkout_json(p_checkout uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'checkout_id', c.id,
    'status', case when c.status = 'open' and c.expires_at <= now() then 'expired' else c.status::text end,
    'kind', c.kind,
    'program_id', c.program_id,
    'program_name', p.name,
    'pass_id', c.pass_id,
    'pass_name', ps.name,
    'session_id', c.session_id,
    'session_starts_at', s.starts_at,
    'amount_cents', c.amount_cents,
    'currency', c.currency,
    'url', case when c.status = 'open' and c.expires_at > now() then c.url end,
    'expires_at', c.expires_at,
    'completed_at', c.completed_at,
    'charge_id', c.charge_id,
    'membership_id', c.membership_id,
    'created_at', c.created_at
  )
  from public.payment_checkouts c
  join public.host_programs p on p.id = c.program_id
  left join public.host_passes ps on ps.id = c.pass_id
  left join public.host_sessions s on s.id = c.session_id
  where c.id = p_checkout;
$$;

-- The Stripe-facing part (service only; the function reads it after begin_host_checkout).
create or replace function private.payments_checkout_params(p_checkout uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.payments_checkout_json(c.id) || jsonb_build_object(
    'user_id', c.user_id,
    'account_id', c.account_id,
    'application_fee_cents', c.application_fee_cents,
    'application_fee_percent', private.host_application_fee_percent(),
    'provider_session_id', c.provider_session_id,
    'expires_at_unix', floor(extract(epoch from c.expires_at))::bigint,
    'item_name', left(case c.kind
      when 'drop_in' then p.name || ' drop-in'
      else p.name || ' · ' || ps.name end, 120),
    'item_description', left(case c.kind
      when 'drop_in' then coalesce(se.name || ' · ', '') ||
        to_char(s.starts_at at time zone p.time_zone, 'FMDy FMMon FMDD, FMHH12:MI AM')
      when 'pack' then ps.sessions_included || ' sessions' ||
        coalesce(', use within ' || ps.valid_days || ' days', '')
      else 'Monthly membership. Renews every month until you cancel.' end, 200),
    'metadata', jsonb_strip_nulls(jsonb_build_object(
      'ojoro_checkout_id', c.id::text,
      'ojoro_program_id', c.program_id::text,
      'ojoro_user_id', c.user_id::text,
      'ojoro_kind', c.kind::text,
      'ojoro_pass_id', c.pass_id::text,
      'ojoro_session_id', c.session_id::text))
  )
  from public.payment_checkouts c
  join public.host_programs p on p.id = c.program_id
  left join public.host_passes ps on ps.id = c.pass_id
  left join public.host_sessions s on s.id = c.session_id
  left join public.host_series se on se.id = s.series_id
  where c.id = p_checkout;
$$;

-- Why p_user can't pay for p_session in the app (null = they can), and what they'd pay.
create or replace function private.payments_session_reason(p_session uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.host_sessions%rowtype;
  v_pay jsonb;
  v_reason text;
begin
  select * into v_s from public.host_sessions where id = p_session;
  if not found then
    return null;
  end if;
  v_pay := private.host_payment_of(v_s.id, p_user);
  v_reason := case
    when v_s.status = 'skipped' then 'session_skipped'
    when not exists (select 1 from public.attendance a where a.activity_id = v_s.activity_id and a.user_id = p_user
                     and a.status in ('confirmed', 'checked_in')) then 'not_attending'
    when v_pay ->> 'state' <> 'due' then 'nothing_to_pay'
    when not private.payments_connected(v_s.program_id) then 'not_connected'
  end;
  return jsonb_build_object(
    'session_id', v_s.id,
    'program_id', v_s.program_id,
    'state', v_pay ->> 'state',
    'amount_cents', case when v_pay ->> 'state' = 'due' then (v_pay ->> 'amount_cents')::int end,
    'currency', v_s.currency,
    'buyable', v_reason is null,
    'reason', v_reason
  );
end;
$$;

-- Why p_user can't buy p_pass in the app (null = they can).
create or replace function private.payments_pass_reason(p_pass public.host_passes, p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_pass.kind = 'free' or p_pass.price_cents = 0 then 'free'
    when p_pass.kind = 'drop_in' then 'needs_session'
    when p_pass.kind = 'monthly' and exists (
      select 1 from public.host_memberships m
      where m.program_id = p_pass.program_id and m.user_id = p_user and m.kind = 'monthly'
        and m.status <> 'ended' and m.period_ends_at > now()) then 'already_member'
    when not private.payments_connected(p_pass.program_id) then 'not_connected'
  end;
$$;

-- payments-checkout, as the buyer: validate, price and record the intention. Idempotent with a key
-- (the same key returns the same checkout). An open checkout for the same thing is returned instead
-- of a second one. Exactly one of p_pass_id / p_session_id.
create or replace function public.begin_host_checkout(
  p_idempotency_key uuid,
  p_pass_id uuid default null,
  p_session_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_p public.host_passes%rowtype;
  v_s public.host_sessions%rowtype;
  v_program uuid;
  v_kind public.payment_checkout_kind;
  v_amount integer;
  v_currency text;
  v_reason text;
  v_sr jsonb;
  v_acct text;
  v_id uuid;
begin
  if (p_pass_id is null) = (p_session_id is null) then
    perform private.fail('checkout_invalid', 'target');
  end if;
  v_prior := private.idem_claim(v_uid, p_idempotency_key,
                                'begin_host_checkout:' || coalesce(p_pass_id, p_session_id));
  if v_prior is not null then
    return private.payments_checkout_json((v_prior ->> 'checkout_id')::uuid);
  end if;
  if p_pass_id is not null then
    select * into v_p from public.host_passes where id = p_pass_id;
    if not found or not private.payments_can_see_program(v_p.program_id, v_uid) then
      perform private.fail('pass_not_found');
    end if;
    if v_p.archived_at is not null then
      perform private.fail('checkout_invalid', 'archived');
    end if;
    v_reason := private.payments_pass_reason(v_p, v_uid);
    if v_reason = 'free' then
      perform private.fail('checkout_invalid', 'free');
    elsif v_reason = 'needs_session' then
      perform private.fail('checkout_invalid', 'kind');
    elsif v_reason = 'already_member' then
      perform private.fail('already_member');
    elsif v_reason = 'not_connected' then
      perform private.fail('payments_not_connected');
    end if;
    v_program := v_p.program_id;
    v_kind := v_p.kind::text::public.payment_checkout_kind;
    v_amount := v_p.price_cents;
    v_currency := v_p.currency;
  else
    select * into v_s from public.host_sessions where id = p_session_id;
    if not found or not private.payments_can_see_program(v_s.program_id, v_uid) then
      perform private.fail('session_not_found');
    end if;
    v_sr := private.payments_session_reason(v_s.id, v_uid);
    v_reason := v_sr ->> 'reason';
    if v_reason = 'session_skipped' then
      perform private.fail('session_skipped');
    elsif v_reason = 'not_attending' then
      perform private.fail('not_attending');
    elsif v_reason = 'nothing_to_pay' then
      perform private.fail('nothing_to_pay', v_sr ->> 'state');
    elsif v_reason = 'not_connected' then
      perform private.fail('payments_not_connected');
    end if;
    v_program := v_s.program_id;
    v_kind := 'drop_in';
    v_amount := (v_sr ->> 'amount_cents')::int;
    v_currency := v_s.currency;
  end if;
  if v_amount is null or v_amount < 1 then
    perform private.fail('checkout_invalid', 'free');
  end if;
  -- One open checkout per person per thing: resume it rather than risk paying twice.
  select c.id into v_id from public.payment_checkouts c
   where c.user_id = v_uid and c.status in ('creating', 'open') and c.created_at > now() - interval '1 day'
     and (c.expires_at is null or c.expires_at > now() + interval '2 minutes')
     and c.pass_id is not distinct from p_pass_id and c.session_id is not distinct from p_session_id
   order by c.created_at desc limit 1;
  if v_id is null then
    select account_id into v_acct from public.host_payment_accounts where program_id = v_program;
    insert into public.payment_checkouts (program_id, user_id, kind, pass_id, session_id, amount_cents, currency,
                                          application_fee_cents, account_id, expires_at, idempotency_key)
    values (v_program, v_uid, v_kind, case when v_kind <> 'drop_in' then p_pass_id end, p_session_id, v_amount,
            v_currency, private.host_application_fee_cents(v_amount), v_acct,
            -- Stripe's minimum is 30 minutes from when it makes the session; leave a minute for the call.
            now() + interval '31 minutes', p_idempotency_key)
    returning id into v_id;
    perform private.emit('payments_checkout_started', v_uid, jsonb_build_object('program_id', v_program,
                                                                                'kind', v_kind));
  end if;
  perform private.idem_store(v_uid, p_idempotency_key, jsonb_build_object('checkout_id', v_id));
  return private.payments_checkout_json(v_id);
end;
$$;

-- Service: what payments-checkout sends to Stripe for a checkout.
create or replace function public.payments_checkout_params_for(p_checkout_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.payments_checkout_params(p_checkout_id);
$$;

-- Service: store the Stripe Checkout Session. Set-to-state (a retry with the same session is a no-op).
create or replace function public.payments_attach_checkout(
  p_checkout_id uuid, p_provider_session_id text, p_url text, p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.payment_checkouts%rowtype;
begin
  select * into v_c from public.payment_checkouts where id = p_checkout_id for update;
  if not found then
    perform private.fail('checkout_not_found');
  end if;
  if p_provider_session_id is null or p_provider_session_id !~ '^cs_' or p_url !~ '^https://' then
    perform private.fail('invalid_argument', 'provider_session');
  end if;
  if v_c.status = 'creating' then
    update public.payment_checkouts
       set status = 'open', provider_session_id = p_provider_session_id, url = p_url,
           expires_at = coalesce(p_expires_at, expires_at)
     where id = v_c.id;
  end if;
  return private.payments_checkout_json(v_c.id);
end;
$$;

-- Reads -------------------------------------------------------------------------------------------------

-- What I can buy in a program (and for one of its sessions).
create or replace function public.host_purchase_options(p_program_id uuid, p_session_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_p public.host_programs%rowtype;
  v_session jsonb;
begin
  select * into v_p from public.host_programs where id = p_program_id;
  if not found or not private.payments_can_see_program(p_program_id, v_uid) then
    perform private.fail('program_not_found');
  end if;
  if p_session_id is not null then
    v_session := private.payments_session_reason(p_session_id, v_uid);
    if v_session is null or (v_session ->> 'program_id')::uuid <> p_program_id then
      perform private.fail('session_not_found');
    end if;
    v_session := v_session - 'program_id';
  end if;
  return jsonb_build_object(
    'program_id', v_p.id,
    'program_name', v_p.name,
    'payments_connected', private.payments_connected(v_p.id),
    'passes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ps.id, 'kind', ps.kind, 'name', ps.name, 'description', ps.description,
        'price_cents', ps.price_cents, 'currency', ps.currency, 'sessions_included', ps.sessions_included,
        'valid_days', ps.valid_days,
        'buyable', private.payments_pass_reason(ps, v_uid) is null,
        'reason', private.payments_pass_reason(ps, v_uid)
      ) order by ps.sort_order, ps.created_at)
      from public.host_passes ps where ps.program_id = v_p.id and ps.archived_at is null), '[]'::jsonb),
    'holding', (
      select jsonb_build_object('membership_id', m.id, 'kind', m.kind, 'pass_name', ps.name, 'status', m.status,
                                'renews', m.renews, 'period_ends_at', m.period_ends_at,
                                'sessions_left', private.host_sessions_left(m.id), 'provider', m.provider)
      from public.host_memberships m join public.host_passes ps on ps.id = m.pass_id
      where m.program_id = v_p.id and m.user_id = v_uid and m.status <> 'ended'
        and (m.period_ends_at is null or m.period_ends_at > now())
        and (m.kind <> 'pack' or private.host_sessions_left(m.id) > 0)
      order by array_position(array['monthly', 'pack', 'free']::text[], m.kind::text), m.started_at desc
      limit 1),
    'session', v_session,
    'open_checkout', (
      select private.payments_checkout_json(c.id) from public.payment_checkouts c
      where c.program_id = v_p.id and c.user_id = v_uid and c.status = 'open' and c.expires_at > now()
        and (p_session_id is null or c.session_id = p_session_id)
      order by c.created_at desc limit 1)
  );
end;
$$;

-- One of my checkouts (the return screen).
create or replace function public.payment_checkout(p_checkout_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not exists (select 1 from public.payment_checkouts where id = p_checkout_id and user_id = v_uid) then
    perform private.fail('checkout_not_found');
  end if;
  return private.payments_checkout_json(p_checkout_id);
end;
$$;

-- Grants ----------------------------------------------------------------------------------------------------

revoke all on function private.payments_account_json(uuid, uuid), private.payments_connected(uuid),
  private.payments_can_see_program(uuid, uuid),
  private.payments_checkout_json(uuid), private.payments_checkout_params(uuid),
  private.payments_session_reason(uuid, uuid), private.payments_pass_reason(public.host_passes, uuid)
  from public, anon, authenticated;

revoke all on function public.host_payment_account(uuid), public.payments_connect_context(uuid),
  public.begin_host_checkout(uuid, uuid, uuid), public.host_purchase_options(uuid, uuid),
  public.payment_checkout(uuid) from public, anon;
grant execute on function public.host_payment_account(uuid), public.payments_connect_context(uuid),
  public.begin_host_checkout(uuid, uuid, uuid), public.host_purchase_options(uuid, uuid),
  public.payment_checkout(uuid) to authenticated, service_role;

-- Service role only: the functions store what Stripe answered.
revoke all on function public.payments_attach_account(uuid, text, uuid), public.payments_update_account(jsonb),
  public.payments_checkout_params_for(uuid), public.payments_attach_checkout(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.payments_attach_account(uuid, text, uuid), public.payments_update_account(jsonb),
  public.payments_checkout_params_for(uuid), public.payments_attach_checkout(uuid, text, text, timestamptz)
  to service_role;
