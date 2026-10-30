-- Step 6 BE-HOST-OPS: the money ledger (HostMembership, the roster's payment status, refunds, payouts).
-- Schema: 20261030210000_host_ops_schema.sql. Contract: docs/HOSTS_OPS_CONTRACT.md.
--
-- NO MONEY MOVES: provider = 'none' everywhere; no call leaves the database. Real money is Step 8.

-- The service fee: THE ONE PLACE ------------------------------------------------------------------------

-- PLACEHOLDER. The Ojoro service fee is not decided (PRD §16, HANDOFF.md open decisions). This function
-- is the only place that knows the rate; everything else (payouts, the next payout, insights, the CSV)
-- calls private.host_service_fee_cents(). Change it here, in a new migration, once the owner decides.
create or replace function public.host_service_fee_policy()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'placeholder', true,
    -- 8% of the week's gross charges, in basis points.
    'rate_bps', 800,
    -- Rounded to the nearest whole currency unit (100 cents).
    'rounding_cents', 100,
    'basis', 'gross_charges_per_payout'
  );
$$;

create or replace function private.host_service_fee_cents(p_gross_cents bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_gross_cents, 0) <= 0 then 0::bigint
    else (round(p_gross_cents * ((public.host_service_fee_policy() ->> 'rate_bps')::numeric / 10000)
                / (public.host_service_fee_policy() ->> 'rounding_cents')::numeric)
          * (public.host_service_fee_policy() ->> 'rounding_cents')::numeric)::bigint
  end;
$$;

-- Helpers ------------------------------------------------------------------------------------------------

-- The program, after checking p_uid runs it (BE-HOST-CORE's private.host_require: program_not_found,
-- not_program_host).
create or replace function private.host_require_program_host(p_program uuid, p_uid uuid)
returns public.host_programs
language sql
stable
security definer
set search_path = ''
as $$
  select private.host_require(p_program, p_uid);
$$;

create or replace function private.host_audit(
  p_program uuid, p_actor uuid, p_action text, p_subject_type text, p_subject uuid,
  p_amount integer default null, p_detail jsonb default '{}'
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.host_ops_audit (program_id, actor_id, action, subject_type, subject_id, amount_cents, detail)
  values (p_program, p_actor, p_action, p_subject_type, p_subject, p_amount, coalesce(p_detail, '{}'));
$$;

create or replace function private.host_person(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_path', p.avatar_path)
  from public.profiles p where p.id = p_user;
$$;

-- A "host_update" notification for one person about the program (refund decisions, referee asks), like
-- BE-HOST-CORE's: object = the activity of the latest program session they were in (notifications need
-- an object they can see). data.change names what happened; data.text is the sentence the app shows.
-- Nobody to anchor it to (they've never been to a session): no notification; the decision still stands.
create or replace function private.host_ops_notify(p_user uuid, p_program uuid, p_actor uuid, p_bundle text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s record;
begin
  select s.activity_id, s.plan_id into v_s
    from public.host_sessions s join public.attendance a on a.activity_id = s.activity_id
   where s.program_id = p_program and a.user_id = p_user
   order by s.starts_at desc limit 1;
  if v_s.activity_id is null then
    return;
  end if;
  perform private.notify(array[p_user], 'host_update', 'activity', v_s.activity_id, p_actor, p_bundle,
                         coalesce(p_data, '{}') || jsonb_build_object('program_id', p_program),
                         p_activity => v_s.activity_id, p_plan => v_s.plan_id);
end;
$$;

-- The payout week that contains p_at: Friday 00:00 to the next Friday 00:00, in the program's time
-- zone. The payout lands on period_end's date (Friday).
create or replace function private.host_period(p_program uuid, p_at timestamptz default now())
returns table (period_start timestamptz, period_end timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with z as (
    select coalesce((select time_zone from public.host_programs where id = p_program), 'America/Toronto') as tz
  ), d as (
    select z.tz, (p_at at time zone z.tz)::date as day from z
  ), s as (
    select d.tz, d.day - ((extract(isodow from d.day)::int - 5 + 7) % 7) as start_day from d
  )
  select (s.start_day::timestamp at time zone s.tz), ((s.start_day + 7)::timestamp at time zone s.tz) from s;
$$;

-- Totals for a program over [p_from, p_to): paid charges (by paid_at), recorded refunds (by created_at,
-- pending or succeeded), the placeholder fee and the net. Lines are grouped by charge kind and price.
create or replace function private.host_money_totals(p_program uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ch as (
    select c.* from public.host_charges c
    where c.program_id = p_program and c.status = 'paid' and c.paid_at >= p_from and c.paid_at < p_to
  ), lines as (
    select c.kind, c.amount_cents as unit_cents, count(*)::int as n, sum(c.amount_cents)::bigint as amount
    from ch c group by c.kind, c.amount_cents
  ), rf as (
    select r.* from public.host_refunds r
    where r.program_id = p_program and r.status in ('pending', 'succeeded')
      and r.created_at >= p_from and r.created_at < p_to
  ), sums as (
    select coalesce((select sum(amount_cents) from ch), 0)::bigint as gross,
           coalesce((select sum(amount_cents) from rf), 0)::bigint as refunds,
           (select count(*) from rf)::int as refund_count,
           (select count(*) from ch where kind <> 'drop_in')::int as pass_count,
           (select count(*) from (
              select session_id from ch where session_id is not null
              union
              select u.session_id from public.host_pass_uses u
                join public.host_sessions s on s.id = u.session_id
              where s.program_id = p_program and u.used_at >= p_from and u.used_at < p_to
            ) x)::int as session_count,
           coalesce((select max(currency) from ch),
                    (select max(s.currency) from public.host_series s where s.program_id = p_program), 'CAD') as currency
  )
  select jsonb_build_object(
    'currency', s.currency,
    'gross_cents', s.gross,
    'refunds_cents', s.refunds,
    'refund_count', s.refund_count,
    'fee_cents', private.host_service_fee_cents(s.gross),
    'net_cents', s.gross - s.refunds - private.host_service_fee_cents(s.gross),
    'pass_count', s.pass_count,
    'session_count', s.session_count,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('kind', l.kind, 'count', l.n, 'unit_cents', l.unit_cents,
                                          'amount_cents', l.amount)
                       order by array_position(array['drop_in', 'monthly_renewal', 'monthly', 'pack']::text[], l.kind::text),
                                l.unit_cents desc)
      from lines l), '[]'::jsonb)
  )
  from sums s;
$$;

-- Memberships ----------------------------------------------------------------------------------------

-- Keep BE-HOST-CORE's host_program_members in step with monthly memberships (source = 'pass').
-- Rows a host added by hand (source = 'host') are never touched.
create or replace function private.host_sync_member(p_program uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.host_memberships%rowtype;
  v_existing public.host_program_members%rowtype;
begin
  select * into v_existing from public.host_program_members where program_id = p_program and user_id = p_user;
  if found and v_existing.source = 'host' then
    return;
  end if;
  select * into v_m from public.host_memberships m
   where m.program_id = p_program and m.user_id = p_user and m.kind = 'monthly' and m.status <> 'ended'
     and m.period_ends_at > now()
   order by m.period_ends_at desc limit 1;
  if found then
    insert into public.host_program_members (program_id, user_id, started_at, ends_at, source)
    values (p_program, p_user, least(v_m.started_at, now()), case when v_m.renews then null else v_m.period_ends_at end, 'pass')
    on conflict (program_id, user_id) do update
      set ends_at = excluded.ends_at,
          started_at = least(public.host_program_members.started_at, excluded.started_at);
  elsif v_existing.user_id is not null and (v_existing.ends_at is null or v_existing.ends_at > now()) then
    update public.host_program_members
       set ends_at = greatest(now(), started_at + interval '1 second')
     where program_id = p_program and user_id = p_user;
  end if;
end;
$$;

-- Pack sessions left (null when not a pack).
create or replace function private.host_sessions_left(p_membership uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select m.sessions_total - (select count(*)::int from public.host_pass_uses u where u.membership_id = m.id)
  from public.host_memberships m where m.id = p_membership and m.kind = 'pack';
$$;

-- An active holding of this kind at p_at (not ended, period not over; packs with sessions left).
create or replace function private.host_active_holding(
  p_program uuid, p_user uuid, p_kind public.host_pass_kind, p_at timestamptz default now(), p_series uuid default null
)
returns public.host_memberships
language sql
stable
security definer
set search_path = ''
as $$
  select m.* from public.host_memberships m
  left join public.host_passes p on p.id = m.pass_id
  where m.program_id = p_program and m.user_id = p_user and m.kind = p_kind
    and m.started_at <= p_at
    and (m.status <> 'ended' or m.ended_at > p_at)
    and (m.period_ends_at is null or m.period_ends_at > p_at)
    and (m.kind <> 'pack' or private.host_sessions_left(m.id) > 0)
    and (p_series is null or p.series_id is null or p.series_id = p_series)
  order by m.started_at
  limit 1;
$$;

-- Per-person payment status -------------------------------------------------------------------------------

-- How one person's spot at one session is paid (HostRoster). Order: host, member, pack used here, paid
-- drop-in (or refunded), free session / free pass, an active pack to use at check-in, else due.
create or replace function private.host_payment_of(p_session uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.host_sessions%rowtype;
  v_m public.host_memberships%rowtype;
  v_c public.host_charges%rowtype;
  v_member boolean;
  v_price integer;
  v_use public.host_pass_uses%rowtype;
begin
  select * into v_s from public.host_sessions where id = p_session;
  if not found then
    return null;
  end if;
  if authz.is_program_host(v_s.program_id, p_user) then
    return jsonb_build_object('state', 'host', 'settled', true);
  end if;
  v_member := exists (select 1 from public.host_program_members pm
                      where pm.program_id = v_s.program_id and pm.user_id = p_user
                        and pm.started_at <= greatest(v_s.starts_at, now())
                        and (pm.ends_at is null or pm.ends_at > least(v_s.starts_at, now())));
  v_price := case when v_member then v_s.member_price_cents else v_s.price_cents end;
  if v_member and v_price = 0 then
    return jsonb_build_object('state', 'member', 'settled', true);
  end if;
  select u.* into v_use from public.host_pass_uses u where u.session_id = p_session and u.user_id = p_user;
  if found then
    select * into v_m from public.host_memberships where id = v_use.membership_id;
    return jsonb_build_object('state', 'pack', 'settled', true, 'membership_id', v_m.id,
                              'pass_name', (select name from public.host_passes where id = v_m.pass_id),
                              'sessions_left', private.host_sessions_left(v_m.id), 'used', true);
  end if;
  select * into v_c from public.host_charges c
   where c.session_id = p_session and c.user_id = p_user and c.kind = 'drop_in' and c.status <> 'void';
  if found and v_c.status = 'paid' then
    if exists (select 1 from public.host_refunds r where r.charge_id = v_c.id and r.status in ('pending', 'succeeded')) then
      return jsonb_build_object('state', 'refunded', 'settled', true, 'charge_id', v_c.id,
        'amount_cents', v_c.amount_cents, 'currency', v_c.currency,
        'refund_cents', (select sum(r.amount_cents) from public.host_refunds r
                         where r.charge_id = v_c.id and r.status in ('pending', 'succeeded')));
    end if;
    return jsonb_build_object('state', 'paid', 'settled', true, 'charge_id', v_c.id, 'method', v_c.method,
                              'amount_cents', v_c.amount_cents, 'currency', v_c.currency, 'paid_at', v_c.paid_at);
  end if;
  if v_price = 0 then
    return jsonb_build_object('state', 'free', 'settled', true);
  end if;
  v_m := private.host_active_holding(v_s.program_id, p_user, 'free', least(v_s.starts_at, now()), v_s.series_id);
  if v_m.id is not null then
    return jsonb_build_object('state', 'free', 'settled', true, 'membership_id', v_m.id,
                              'pass_name', (select name from public.host_passes where id = v_m.pass_id));
  end if;
  v_m := private.host_active_holding(v_s.program_id, p_user, 'pack', now(), v_s.series_id);
  if v_m.id is not null then
    return jsonb_build_object('state', 'pack', 'settled', true, 'membership_id', v_m.id,
                              'pass_name', (select name from public.host_passes where id = v_m.pass_id),
                              'sessions_left', private.host_sessions_left(v_m.id), 'used', false);
  end if;
  return jsonb_build_object('state', 'due', 'settled', false, 'charge_id', v_c.id,
                            'amount_cents', v_price, 'currency', v_s.currency);
end;
$$;

-- HostRoster: one row per person in the session (in, checked in, or dropped with a refund). Hosts only.
-- Keyed by (session_id, user_id). `settled` = nothing left to collect.
create or replace function public.host_session_payments(p_session_id uuid)
returns table (
  session_id uuid,
  user_id uuid,
  attendance_status public.attendance_status,
  state public.host_payment_state,
  settled boolean,
  amount_cents integer,
  currency text,
  method public.host_charge_method,
  paid_at timestamptz,
  pass_name text,
  sessions_left integer,
  refund_cents integer,
  charge_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_s public.host_sessions%rowtype;
begin
  select * into v_s from public.host_sessions where id = p_session_id;
  if not found then
    perform private.fail('session_not_found');
  end if;
  perform private.host_require_program_host(v_s.program_id, v_uid);
  return query
  select v_s.id, a.user_id, a.status,
         (j ->> 'state')::public.host_payment_state,
         (j ->> 'settled')::boolean,
         (j ->> 'amount_cents')::integer,
         coalesce(j ->> 'currency', v_s.currency),
         (j ->> 'method')::public.host_charge_method,
         (j ->> 'paid_at')::timestamptz,
         j ->> 'pass_name',
         (j ->> 'sessions_left')::integer,
         (j ->> 'refund_cents')::integer,
         (j ->> 'charge_id')::uuid
  from public.attendance a
  cross join lateral (select private.host_payment_of(v_s.id, a.user_id) as j) x
  where a.activity_id = v_s.activity_id
    and (a.status in ('confirmed', 'checked_in')
         or (a.status = 'cancelled' and (j ->> 'state') = 'refunded'))
  order by a.status = 'cancelled', a.user_id;
end;
$$;

-- What a person holds in a program (HostPeople's "pass" line and Members filter). Hosts only.
create or replace function public.host_people_passes(p_program_id uuid)
returns table (
  user_id uuid,
  membership_id uuid,
  kind public.host_pass_kind,
  pass_name text,
  status public.host_membership_status,
  renews boolean,
  period_ends_at timestamptz,
  sessions_left integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.host_require_program_host(p_program_id, v_uid);
  return query
  select distinct on (m.user_id) m.user_id, m.id, m.kind, p.name, m.status, m.renews, m.period_ends_at,
         private.host_sessions_left(m.id)
  from public.host_memberships m
  join public.host_passes p on p.id = m.pass_id
  where m.program_id = p_program_id and m.status <> 'ended'
    and (m.period_ends_at is null or m.period_ends_at > now())
    and (m.kind <> 'pack' or private.host_sessions_left(m.id) > 0)
  order by m.user_id, array_position(array['monthly', 'pack', 'free']::text[], m.kind::text), m.started_at desc;
end;
$$;

-- Ledger triggers -----------------------------------------------------------------------------------------

-- A pack is used when its holder checks in at a paid session and nothing else covers them.
create or replace function private.host_use_pack_on_check_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.host_sessions%rowtype;
  v_pay jsonb;
begin
  if new.status <> 'checked_in' or (tg_op = 'UPDATE' and old.status = 'checked_in') then
    return null;
  end if;
  select * into v_s from public.host_sessions where activity_id = new.activity_id;
  if not found then
    return null;
  end if;
  v_pay := private.host_payment_of(v_s.id, new.user_id);
  if v_pay ->> 'state' = 'pack' and not (v_pay ->> 'used')::boolean then
    insert into public.host_pass_uses (membership_id, session_id, user_id)
    values ((v_pay ->> 'membership_id')::uuid, v_s.id, new.user_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger host_use_pack_on_check_in after insert or update of status on public.attendance
  for each row execute function private.host_use_pack_on_check_in();

-- Refund one paid drop-in automatically (once). Returns the refund id or null.
create or replace function private.host_auto_refund(
  p_session uuid, p_user uuid, p_reason public.host_refund_reason, p_related uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.host_charges%rowtype;
  v_id uuid;
begin
  select * into v_c from public.host_charges c
   where c.session_id = p_session and c.user_id = p_user and c.kind = 'drop_in' and c.status = 'paid'
   for update;
  if not found or exists (select 1 from public.host_refunds r where r.charge_id = v_c.id and r.status <> 'cancelled') then
    return null;
  end if;
  insert into public.host_refunds (program_id, charge_id, user_id, amount_cents, currency, reason, related_user_id)
  values (v_c.program_id, v_c.id, p_user, v_c.amount_cents, v_c.currency, p_reason, p_related)
  returning id into v_id;
  perform private.host_audit(v_c.program_id, null, 'refund_auto', 'host_refund', v_id, v_c.amount_cents,
    jsonb_build_object('reason', p_reason, 'charge_id', v_c.id, 'session_id', p_session, 'user_id', p_user,
                       'related_user_id', p_related, 'provider', 'none'));
  return v_id;
end;
$$;

-- "A dropped spot filled from the waitlist refunds automatically." BE-HOST-CORE logs the roster in
-- host_session_log: a 'promoted' row whose related_user_id is the person who dropped, or a 'dropped' row
-- whose related_user_id is the person who took the spot. Either one refunds the dropper's drop-in.
create or replace function private.host_refund_on_spot_filled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.related_user_id is null then
    return null;
  end if;
  if new.kind = 'promoted' then
    perform private.host_auto_refund(new.session_id, new.related_user_id, 'spot_filled', new.user_id);
  elsif new.kind = 'dropped' and new.user_id is not null then
    perform private.host_auto_refund(new.session_id, new.user_id, 'spot_filled', new.related_user_id);
  end if;
  return null;
end;
$$;

create trigger host_refund_on_spot_filled after insert on public.host_session_log
  for each row execute function private.host_refund_on_spot_filled();

-- A skipped (called-off) session refunds every paid drop-in for it.
create or replace function private.host_refund_on_skip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
begin
  if new.status = 'skipped' and old.status <> 'skipped' then
    for v_c in select c.user_id from public.host_charges c
               where c.session_id = new.id and c.kind = 'drop_in' and c.status = 'paid'
    loop
      perform private.host_auto_refund(new.id, v_c.user_id, 'session_cancelled', null);
    end loop;
  end if;
  return null;
end;
$$;

create trigger host_refund_on_skip after update of status on public.host_sessions
  for each row execute function private.host_refund_on_skip();

-- Payouts ---------------------------------------------------------------------------------------------------

-- Close every week that has ended and isn't closed yet (for programs with any ledger rows). Totals are
-- frozen; status 'scheduled' (no provider is connected, so it stays there until Step 8).
create or replace function private.host_close_payouts(p_program uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_start timestamptz;
  v_end timestamptz;
  v_t jsonb;
  v_n integer := 0;
  v_first timestamptz;
  v_tz text;
  v_note text;
begin
  for v_p in
    select hp.id, hp.time_zone from public.host_programs hp
    where (p_program is null or hp.id = p_program)
      and (exists (select 1 from public.host_charges c where c.program_id = hp.id)
           or exists (select 1 from public.host_refunds r where r.program_id = hp.id))
  loop
    select least((select min(c.paid_at) from public.host_charges c where c.program_id = v_p.id and c.status = 'paid'),
                 (select min(r.created_at) from public.host_refunds r where r.program_id = v_p.id))
      into v_first;
    if v_first is null then
      continue;
    end if;
    -- Start after the last closed week (or at the first ledger row) and walk forward to now.
    select coalesce(max(po.period_end), (select period_start from private.host_period(v_p.id, v_first)))
      into v_start from public.host_payouts po where po.program_id = v_p.id;
    loop
      v_end := (select period_end from private.host_period(v_p.id, v_start));
      v_start := (select period_start from private.host_period(v_p.id, v_start));
      exit when v_end > now();
      if not exists (select 1 from public.host_payouts po where po.program_id = v_p.id and po.period_start = v_start) then
        v_t := private.host_money_totals(v_p.id, v_start, v_end);
        select 'rain-out on ' || string_agg(distinct to_char(s.starts_at at time zone v_p.time_zone, 'FMDay'), ' and ')
          into v_note
          from public.host_sessions s
         where s.program_id = v_p.id and s.status = 'skipped' and s.starts_at >= v_start and s.starts_at < v_end;
        insert into public.host_payouts (program_id, period_start, period_end, pays_on, currency, gross_cents,
          refunds_cents, fee_cents, net_cents, session_count, pass_count, refund_count, note, lines)
        values (v_p.id, v_start, v_end, (v_end at time zone v_p.time_zone)::date, v_t ->> 'currency',
          (v_t ->> 'gross_cents')::bigint, (v_t ->> 'refunds_cents')::bigint, (v_t ->> 'fee_cents')::bigint,
          (v_t ->> 'net_cents')::bigint, (v_t ->> 'session_count')::int, (v_t ->> 'pass_count')::int,
          (v_t ->> 'refund_count')::int, v_note, v_t -> 'lines');
        perform private.host_audit(v_p.id, null, 'payout_closed', 'host_payout', null,
          ((v_t ->> 'net_cents')::bigint)::integer,
          jsonb_build_object('period_start', v_start, 'period_end', v_end, 'provider', 'none'));
        v_n := v_n + 1;
      end if;
      v_start := v_end;
    end loop;
  end loop;
  return v_n;
end;
$$;

-- Hourly: close finished weeks, renew monthly memberships (the renewal charge is 'due': no provider can
-- collect it yet), end cancelled / expired / used-up holdings, keep members in step.
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
           or (m.kind = 'pack' and private.host_sessions_left(m.id) <= 0))
  loop
    update public.host_memberships set status = 'ended', ended_at = now() where id = v_m.id;
    perform private.host_sync_member(v_m.program_id, v_m.user_id);
    v_n := v_n + 1;
  end loop;
  v_n := v_n + private.host_close_payouts();
  return v_n;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ojoro_host_ops_tick', '7 * * * *', 'select private.host_ops_tick()');
  else
    raise notice 'pg_cron not available: call private.host_ops_tick() from a scheduler';
  end if;
end;
$$;

-- Passes ----------------------------------------------------------------------------------------------------

create or replace function private.host_check_pass(
  p_kind public.host_pass_kind, p_name text, p_description text, p_price integer, p_sessions integer, p_days integer
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_name is null or char_length(trim(p_name)) not between 1 and 40 or char_length(p_description) > 120 then
    perform private.fail('pass_invalid', 'name');
  end if;
  if p_price is null or p_price not between 0 and 100000 or ((p_kind = 'free') <> (p_price = 0)) then
    perform private.fail('price_invalid');
  end if;
  if (p_kind = 'pack') <> (p_sessions is not null) or p_sessions not between 2 and 100
     or (p_kind <> 'pack' and p_days is not null) or p_days not between 1 and 730 then
    perform private.fail('pass_invalid', 'sessions');
  end if;
end;
$$;

-- NEW PASS. Idempotent with a key.
create or replace function public.create_host_pass(
  p_program_id uuid,
  p_kind public.host_pass_kind,
  p_name text,
  p_price_cents integer,
  p_idempotency_key uuid,
  p_description text default null,
  p_sessions_included integer default null,
  p_valid_days integer default null,
  p_series_id uuid default null,
  p_currency text default 'CAD'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_id uuid;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_host_pass:' || p_program_id);
  if v_prior is not null then
    return (v_prior ->> 'id')::uuid;
  end if;
  perform private.host_require_program_host(p_program_id, v_uid);
  perform private.host_check_pass(p_kind, p_name, p_description, p_price_cents, p_sessions_included, p_valid_days);
  if p_series_id is not null and not exists (select 1 from public.host_series where id = p_series_id and program_id = p_program_id) then
    perform private.fail('invalid_argument', 'series');
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    perform private.fail('invalid_argument', 'currency');
  end if;
  insert into public.host_passes (program_id, kind, name, description, price_cents, currency, sessions_included,
                                  valid_days, series_id, sort_order, created_by)
  values (p_program_id, p_kind, trim(p_name), nullif(trim(p_description), ''), p_price_cents, p_currency,
          p_sessions_included, p_valid_days, p_series_id,
          coalesce((select max(sort_order) + 1 from public.host_passes where program_id = p_program_id), 0), v_uid)
  returning id into v_id;
  perform private.host_audit(p_program_id, v_uid, 'pass_created', 'host_pass', v_id, p_price_cents,
                             jsonb_build_object('kind', p_kind, 'name', trim(p_name)));
  perform private.emit('host_pass_created', v_uid, jsonb_build_object('program_id', p_program_id, 'kind', p_kind));
  perform private.idem_store(v_uid, p_idempotency_key, jsonb_build_object('id', v_id));
  return v_id;
end;
$$;

-- EDIT. Set-to-state (safe to repeat). A price change applies to new sales only: charges keep their amount.
create or replace function public.update_host_pass(
  p_pass_id uuid,
  p_name text,
  p_price_cents integer,
  p_description text default null,
  p_sessions_included integer default null,
  p_valid_days integer default null
)
returns public.host_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_p public.host_passes%rowtype;
begin
  select * into v_p from public.host_passes where id = p_pass_id for update;
  if not found then
    perform private.fail('pass_not_found');
  end if;
  perform private.host_require_program_host(v_p.program_id, v_uid);
  perform private.host_check_pass(v_p.kind, p_name, p_description, p_price_cents, p_sessions_included, p_valid_days);
  update public.host_passes
     set name = trim(p_name), description = nullif(trim(p_description), ''), price_cents = p_price_cents,
         sessions_included = p_sessions_included, valid_days = p_valid_days
   where id = p_pass_id
  returning * into v_p;
  perform private.host_audit(v_p.program_id, v_uid, 'pass_updated', 'host_pass', v_p.id, p_price_cents,
                             jsonb_build_object('name', v_p.name));
  return v_p;
end;
$$;

-- Stop selling a pass. Holders keep what they have. Set-to-state.
create or replace function public.archive_host_pass(p_pass_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_p public.host_passes%rowtype;
begin
  select * into v_p from public.host_passes where id = p_pass_id for update;
  if not found then
    perform private.fail('pass_not_found');
  end if;
  perform private.host_require_program_host(v_p.program_id, v_uid);
  if v_p.archived_at is null then
    update public.host_passes set archived_at = now() where id = p_pass_id;
    perform private.host_audit(v_p.program_id, v_uid, 'pass_archived', 'host_pass', v_p.id);
  end if;
end;
$$;

-- A host records a pass someone bought outside the app (cash, transfer) or gives one away. Creates the
-- holding and, for a priced pass, a charge: paid (method host_recorded) or due. Idempotent with a key.
-- Participant-side buying isn't designed yet (HANDOFF.md); it will create the same rows.
create or replace function public.grant_host_pass(
  p_pass_id uuid, p_user_id uuid, p_paid boolean, p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_p public.host_passes%rowtype;
  v_id uuid;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'grant_host_pass:' || p_pass_id || ':' || p_user_id);
  if v_prior is not null then
    return (v_prior ->> 'id')::uuid;
  end if;
  select * into v_p from public.host_passes where id = p_pass_id;
  if not found then
    perform private.fail('pass_not_found');
  end if;
  perform private.host_require_program_host(v_p.program_id, v_uid);
  if v_p.archived_at is not null or v_p.kind = 'drop_in' then
    perform private.fail('pass_invalid', 'kind');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform private.fail('user_not_found');
  end if;
  if authz.is_blocked(v_uid, p_user_id) then
    perform private.fail('user_not_found');
  end if;
  if v_p.kind = 'monthly' and exists (
       select 1 from public.host_memberships m
       where m.program_id = v_p.program_id and m.user_id = p_user_id and m.kind = 'monthly'
         and m.status <> 'ended' and m.period_ends_at > now()) then
    perform private.fail('already_member');
  end if;
  insert into public.host_memberships (program_id, pass_id, user_id, kind, period_ends_at, renews, sessions_total)
  values (v_p.program_id, v_p.id, p_user_id, v_p.kind,
          case v_p.kind when 'monthly' then now() + interval '1 month'
                        when 'pack' then now() + make_interval(days => coalesce(v_p.valid_days, 120)) end,
          v_p.kind = 'monthly', v_p.sessions_included)
  returning id into v_id;
  if v_p.price_cents > 0 then
    insert into public.host_charges (program_id, user_id, kind, pass_id, membership_id, amount_cents, currency,
                                     status, method, paid_at, recorded_by)
    values (v_p.program_id, p_user_id, v_p.kind::text::public.host_charge_kind, v_p.id, v_id, v_p.price_cents,
            v_p.currency, (case when p_paid then 'paid' else 'due' end)::public.host_charge_status, 'host_recorded',
            case when p_paid then now() end, v_uid);
  end if;
  insert into public.host_people (program_id, user_id) values (v_p.program_id, p_user_id) on conflict do nothing;
  perform private.host_sync_member(v_p.program_id, p_user_id);
  perform private.host_audit(v_p.program_id, v_uid, 'pass_granted', 'host_membership', v_id, v_p.price_cents,
                             jsonb_build_object('pass_id', v_p.id, 'user_id', p_user_id, 'paid', p_paid, 'provider', 'none'));
  perform private.emit('host_pass_granted', v_uid, jsonb_build_object('program_id', v_p.program_id, 'kind', v_p.kind));
  perform private.idem_store(v_uid, p_idempotency_key, jsonb_build_object('id', v_id));
  return v_id;
end;
$$;

-- "Mark it when he does": the host records a drop-in paid at the field. Set-to-state (a second call
-- returns the same paid charge). The person must be in the session; members, pack holders and free
-- spots have nothing to pay.
create or replace function public.mark_paid_at_field(p_session_id uuid, p_user_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_s public.host_sessions%rowtype;
  v_pay jsonb;
  v_id uuid;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'mark_paid_at_field:' || p_session_id || ':' || p_user_id);
  if v_prior is not null then
    return private.host_payment_of(p_session_id, p_user_id);
  end if;
  select * into v_s from public.host_sessions where id = p_session_id;
  if not found then
    perform private.fail('session_not_found');
  end if;
  perform private.host_require_program_host(v_s.program_id, v_uid);
  if not exists (select 1 from public.attendance a where a.activity_id = v_s.activity_id and a.user_id = p_user_id
                 and a.status in ('confirmed', 'checked_in')) then
    perform private.fail('not_attending');
  end if;
  -- One drop-in charge per person per session.
  perform pg_advisory_xact_lock(hashtextextended('host_drop_in:' || p_session_id || ':' || p_user_id, 0));
  v_pay := private.host_payment_of(p_session_id, p_user_id);
  if (v_pay ->> 'state') = 'due' then
    if v_pay ->> 'charge_id' is not null then
      update public.host_charges set status = 'paid', paid_at = now(), method = 'at_field', recorded_by = v_uid
       where id = (v_pay ->> 'charge_id')::uuid returning id into v_id;
    else
      insert into public.host_charges (program_id, user_id, kind, session_id, amount_cents, currency, status, method,
                                       paid_at, recorded_by)
      values (v_s.program_id, p_user_id, 'drop_in', v_s.id, (v_pay ->> 'amount_cents')::int, v_s.currency, 'paid',
              'at_field', now(), v_uid)
      returning id into v_id;
    end if;
    perform private.host_audit(v_s.program_id, v_uid, 'charge_marked_paid', 'host_charge', v_id,
                               (v_pay ->> 'amount_cents')::int,
                               jsonb_build_object('session_id', v_s.id, 'user_id', p_user_id, 'method', 'at_field',
                                                  'provider', 'none'));
    perform private.emit('host_paid_at_field', v_uid, jsonb_build_object('program_id', v_s.program_id,
                                                                         'session_id', v_s.id));
  end if;
  perform private.idem_store(v_uid, p_idempotency_key, '{}');
  return private.host_payment_of(p_session_id, p_user_id);
end;
$$;

-- Refund requests and decisions --------------------------------------------------------------------------

-- Ask for money back on one of my paid charges (participant side). Idempotent with a key.
create or replace function public.request_host_refund(p_charge_id uuid, p_note text, p_idempotency_key uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_c public.host_charges%rowtype;
  v_id uuid;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'request_host_refund:' || p_charge_id);
  if v_prior is not null then
    return (v_prior ->> 'id')::uuid;
  end if;
  select * into v_c from public.host_charges where id = p_charge_id and user_id = v_uid;
  if not found then
    perform private.fail('charge_not_found');
  end if;
  if v_c.status <> 'paid' or private.host_refundable_cents(v_c.id) <= 0 then
    perform private.fail('refund_not_allowed');
  end if;
  if char_length(p_note) > 280 then
    perform private.fail('message_invalid', '0-280');
  end if;
  select id into v_id from public.host_refund_requests where charge_id = v_c.id and status = 'open';
  if v_id is null then
    insert into public.host_refund_requests (program_id, user_id, charge_id, note)
    values (v_c.program_id, v_uid, v_c.id, nullif(trim(p_note), ''))
    returning id into v_id;
    perform private.host_audit(v_c.program_id, v_uid, 'refund_requested', 'host_refund_request', v_id, v_c.amount_cents);
    perform private.emit('host_refund_requested', v_uid, jsonb_build_object('program_id', v_c.program_id,
                                                                            'kind', v_c.kind));
  end if;
  perform private.idem_store(v_uid, p_idempotency_key, jsonb_build_object('id', v_id));
  return v_id;
end;
$$;

create or replace function private.host_refundable_cents(p_charge uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select c.amount_cents - coalesce((select sum(r.amount_cents) from public.host_refunds r
                                    where r.charge_id = c.id and r.status in ('pending', 'succeeded')), 0)::int
  from public.host_charges c where c.id = p_charge;
$$;

-- Cancel my membership (it stays until the period ends; it doesn't renew). With a note, also ask for a
-- refund of the latest payment. Set-to-state; idempotent with a key for the refund request.
create or replace function public.cancel_host_membership(
  p_membership_id uuid, p_idempotency_key uuid, p_refund_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_m public.host_memberships%rowtype;
  v_charge uuid;
  v_req uuid;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'cancel_host_membership:' || p_membership_id);
  if v_prior is not null then
    return v_prior;
  end if;
  select * into v_m from public.host_memberships where id = p_membership_id and user_id = v_uid for update;
  if not found then
    perform private.fail('membership_not_found');
  end if;
  if v_m.status = 'active' then
    update public.host_memberships set status = 'cancelled', renews = false, cancelled_at = now()
     where id = v_m.id returning * into v_m;
    perform private.host_sync_member(v_m.program_id, v_uid);
    perform private.host_audit(v_m.program_id, v_uid, 'membership_cancelled', 'host_membership', v_m.id);
    perform private.emit('host_membership_cancelled', v_uid, jsonb_build_object('program_id', v_m.program_id,
                                                                                'kind', v_m.kind));
  end if;
  if nullif(trim(p_refund_note), '') is not null then
    select c.id into v_charge from public.host_charges c
     where c.membership_id = v_m.id and c.status = 'paid' order by c.paid_at desc limit 1;
    if v_charge is not null and private.host_refundable_cents(v_charge) > 0 then
      select id into v_req from public.host_refund_requests where charge_id = v_charge and status = 'open';
      if v_req is null then
        if char_length(p_refund_note) > 280 then
          perform private.fail('message_invalid', '0-280');
        end if;
        insert into public.host_refund_requests (program_id, user_id, charge_id, note)
        values (v_m.program_id, v_uid, v_charge, trim(p_refund_note)) returning id into v_req;
        perform private.host_audit(v_m.program_id, v_uid, 'refund_requested', 'host_refund_request', v_req);
        perform private.emit('host_refund_requested', v_uid, jsonb_build_object('program_id', v_m.program_id,
                                                                                'kind', v_m.kind));
      end if;
    end if;
  end if;
  v_prior := jsonb_build_object('membership_id', v_m.id, 'status', v_m.status, 'period_ends_at', v_m.period_ends_at,
                                'refund_request_id', v_req);
  perform private.idem_store(v_uid, p_idempotency_key, v_prior);
  return v_prior;
end;
$$;

create or replace function private.host_decision_state(p_request uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'request_id', q.id,
    'status', q.status,
    'decision', q.decision,
    'decided_at', q.decided_at,
    'refund_id', r.id,
    'refund_cents', coalesce(r.amount_cents, 0),
    'refund_status', r.status,
    'currency', c.currency,
    'provider', 'none',
    'membership_id', m.id,
    'membership_status', m.status,
    'membership_ends_at', coalesce(m.ended_at, m.period_ends_at),
    'undo_until', case when q.decided_at is not null then q.decided_at + interval '10 minutes' end
  )
  from public.host_refund_requests q
  join public.host_charges c on c.id = q.charge_id
  left join public.host_memberships m on m.id = c.membership_id
  left join lateral (select * from public.host_refunds r0 where r0.request_id = q.id and r0.status <> 'cancelled'
                     order by r0.created_at desc limit 1) r on true
  where q.id = p_request;
$$;

-- REFUND ALL / REFUND $25 / KEEP IT. Hosts only; authorized and recorded server-side, with an audit row.
-- full: everything not yet refunded. partial: p_amount_cents (1 .. refundable - 1). keep: nothing.
-- A refunded membership or pack ends now; a kept one stays active to its period end and doesn't renew.
-- The person is told by Ojoro (a host_update notification). Idempotent with a key; deciding an already
-- decided request the same way returns its state, a different way fails refund_already_decided.
create or replace function public.decide_host_refund(
  p_request_id uuid,
  p_decision public.host_refund_decision,
  p_idempotency_key uuid,
  p_amount_cents integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_q public.host_refund_requests%rowtype;
  v_c public.host_charges%rowtype;
  v_m public.host_memberships%rowtype;
  v_left integer;
  v_amount integer;
  v_refund uuid;
  v_name text;
  v_tz text;
  v_text text;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'decide_host_refund:' || p_request_id);
  if v_prior is not null then
    return private.host_decision_state(p_request_id);
  end if;
  select * into v_q from public.host_refund_requests where id = p_request_id for update;
  if not found then
    perform private.fail('refund_request_not_found');
  end if;
  perform private.host_require_program_host(v_q.program_id, v_uid);
  if v_q.status <> 'open' then
    if v_q.decision = p_decision then
      perform private.idem_store(v_uid, p_idempotency_key, '{}');
      return private.host_decision_state(p_request_id);
    end if;
    perform private.fail('refund_already_decided', v_q.status::text);
  end if;
  select * into v_c from public.host_charges where id = v_q.charge_id for update;
  v_left := private.host_refundable_cents(v_c.id);
  v_amount := case p_decision when 'full' then v_left when 'partial' then p_amount_cents else 0 end;
  if p_decision = 'partial' and (p_amount_cents is null or p_amount_cents < 1 or p_amount_cents >= v_left) then
    perform private.fail('refund_amount_invalid', v_left::text);
  end if;
  if p_decision = 'full' and v_left <= 0 then
    perform private.fail('refund_amount_invalid', '0');
  end if;
  select * into v_m from public.host_memberships where id = v_c.membership_id for update;
  if v_amount > 0 then
    insert into public.host_refunds (program_id, charge_id, user_id, amount_cents, currency, reason, request_id, decided_by)
    values (v_c.program_id, v_c.id, v_c.user_id, v_amount, v_c.currency, 'host_decision', v_q.id, v_uid)
    returning id into v_refund;
  end if;
  update public.host_refund_requests
     set status = case p_decision when 'full' then 'refunded_full' when 'partial' then 'refunded_partial' else 'kept' end::public.host_refund_request_status,
         decision = p_decision, decided_by = v_uid, decided_at = now()
   where id = v_q.id;
  if v_m.id is not null then
    if p_decision = 'keep' then
      update public.host_memberships set renews = false,
             status = case when status = 'active' then 'cancelled'::public.host_membership_status else status end,
             cancelled_at = coalesce(cancelled_at, now())
       where id = v_m.id;
    elsif v_m.status <> 'ended' then
      update public.host_memberships set renews = false, status = 'ended', ended_at = now(),
             period_ends_at = case when period_ends_at is null or period_ends_at > now() then now() else period_ends_at end,
             cancelled_at = coalesce(cancelled_at, now())
       where id = v_m.id;
    end if;
    perform private.host_sync_member(v_m.program_id, v_m.user_id);
  end if;
  perform private.host_audit(v_q.program_id, v_uid, 'refund_decided', 'host_refund_request', v_q.id, v_amount,
    jsonb_build_object('decision', p_decision, 'refund_id', v_refund, 'charge_id', v_c.id, 'user_id', v_c.user_id,
                       'membership_id', v_m.id, 'prior_membership', case when v_m.id is not null then
                         jsonb_build_object('status', v_m.status, 'renews', v_m.renews,
                                            'period_ends_at', v_m.period_ends_at, 'cancelled_at', v_m.cancelled_at) end,
                       'provider', 'none'));
  select name, time_zone into v_name, v_tz from public.host_programs where id = v_q.program_id;
  v_text := case p_decision
    when 'keep' then v_name || ' kept your payment. ' ||
      case when v_m.id is not null and v_m.period_ends_at is not null
           then 'Your membership stays active to ' || to_char(v_m.period_ends_at at time zone v_tz, 'FMMon FMDD') || ', so you can still come.'
           else 'You can still come.' end
    else v_name || ' is refunding ' || private.host_fmt_money(v_amount, v_c.currency) || '.' ||
      case when v_m.id is not null then ' Your membership ends today.' else '' end
  end;
  perform private.host_ops_notify(v_c.user_id, v_q.program_id, v_uid, 'host_refund:' || v_q.id,
    jsonb_build_object('change', 'refund_decided', 'decision', p_decision, 'amount_cents', v_amount,
                       'currency', v_c.currency, 'text', v_text));
  perform private.emit('host_refund_decided', v_uid, jsonb_build_object('program_id', v_q.program_id,
    'decision', p_decision, 'charge_kind', v_c.kind));
  perform private.idem_store(v_uid, p_idempotency_key, '{}');
  return private.host_decision_state(v_q.id);
end;
$$;

create or replace function private.host_fmt_money(p_cents bigint, p_currency text default 'CAD')
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_cents < 0 then '−' else '' end || '$' ||
    case when abs(p_cents) % 100 = 0 then to_char(abs(p_cents) / 100, 'FM999,999,990')
         else to_char(abs(p_cents) / 100.0, 'FM999,999,990.00') end;
$$;

-- UNDO a decision within 10 minutes, while its refund is still pending (no provider has sent it).
-- The request is open again and the membership goes back to how it was. Set-to-state.
create or replace function public.undo_host_refund_decision(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_q public.host_refund_requests%rowtype;
  v_a public.host_ops_audit%rowtype;
  v_prev jsonb;
begin
  select * into v_q from public.host_refund_requests where id = p_request_id for update;
  if not found then
    perform private.fail('refund_request_not_found');
  end if;
  perform private.host_require_program_host(v_q.program_id, v_uid);
  if v_q.status = 'open' then
    return private.host_decision_state(v_q.id);
  end if;
  if v_q.decided_at < now() - interval '10 minutes'
     or exists (select 1 from public.host_refunds r where r.request_id = v_q.id and r.status in ('succeeded', 'failed')) then
    perform private.fail('refund_undo_closed');
  end if;
  update public.host_refunds set status = 'cancelled' where request_id = v_q.id and status = 'pending';
  select * into v_a from public.host_ops_audit
   where subject_id = v_q.id and action = 'refund_decided' order by id desc limit 1;
  v_prev := v_a.detail -> 'prior_membership';
  if v_prev is not null and jsonb_typeof(v_prev) = 'object' then
    update public.host_memberships
       set status = (v_prev ->> 'status')::public.host_membership_status,
           renews = (v_prev ->> 'renews')::boolean,
           period_ends_at = (v_prev ->> 'period_ends_at')::timestamptz,
           cancelled_at = (v_prev ->> 'cancelled_at')::timestamptz,
           ended_at = case when v_prev ->> 'status' = 'ended' then ended_at end
     where id = (v_a.detail ->> 'membership_id')::uuid;
    perform private.host_sync_member(v_q.program_id, v_q.user_id);
  end if;
  update public.host_refund_requests set status = 'open', decision = null, decided_by = null, decided_at = null
   where id = v_q.id;
  perform private.host_audit(v_q.program_id, v_uid, 'refund_decision_undone', 'host_refund_request', v_q.id, null,
                             jsonb_build_object('decision', v_q.decision));
  perform private.host_ops_notify(v_q.user_id, v_q.program_id, v_uid, 'host_refund:' || v_q.id,
    jsonb_build_object('change', 'refund_reopened', 'text',
      (select name from public.host_programs where id = v_q.program_id) || ' is taking another look at your refund.'));
  return private.host_decision_state(v_q.id);
end;
$$;

-- HostMembership ------------------------------------------------------------------------------------------

-- Everything on Memberships & payments, for the program's hosts.
create or replace function public.host_money_view(p_program_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_p public.host_programs%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_next jsonb;
  v_month_start timestamptz := now() - interval '30 days';
begin
  v_p := private.host_require_program_host(p_program_id, v_uid);
  select period_start, period_end into v_start, v_end from private.host_period(p_program_id, now());
  v_next := private.host_money_totals(p_program_id, v_start, v_end)
    || jsonb_build_object('period_start', v_start, 'period_end', v_end,
                          'pays_on', (v_end at time zone v_p.time_zone)::date, 'status', 'upcoming');
  return jsonb_build_object(
    'program_id', v_p.id,
    'program_name', v_p.name,
    'time_zone', v_p.time_zone,
    'provider', 'none',
    'payments_connected', false,
    'fee_policy', public.host_service_fee_policy(),
    'next_payout', v_next,
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'request_id', q.id,
        'person', private.host_person(q.user_id),
        'note', q.note,
        'requested_at', q.created_at,
        'charge_id', c.id,
        'charge_kind', c.kind,
        'charge_amount_cents', c.amount_cents,
        'refundable_cents', private.host_refundable_cents(c.id),
        'currency', c.currency,
        'paid_at', c.paid_at,
        'pass_name', ps.name,
        'membership_id', m.id,
        'cancelled_at', m.cancelled_at,
        'period_ends_at', m.period_ends_at,
        'last_played_at', (select max(a.checked_in_at) from public.attendance a
                           join public.host_sessions s on s.activity_id = a.activity_id
                           where s.program_id = p_program_id and a.user_id = q.user_id),
        -- A suggested partial amount: the unused part of the period, rounded to whole units.
        'suggested_partial_cents', case when m.kind = 'monthly' and m.period_ends_at > now() and c.paid_at is not null then
          least(private.host_refundable_cents(c.id) - 100,
                greatest(100, (round(c.amount_cents * extract(epoch from (m.period_ends_at - greatest(coalesce(m.cancelled_at, now()), c.paid_at)))
                     / nullif(extract(epoch from (m.period_ends_at - c.paid_at)), 0) / 100) * 100)::int)) end
      ) order by q.created_at)
      from public.host_refund_requests q
      join public.host_charges c on c.id = q.charge_id
      left join public.host_memberships m on m.id = c.membership_id
      left join public.host_passes ps on ps.id = c.pass_id
      where q.program_id = p_program_id and q.status = 'open'
        and not authz.is_blocked(v_uid, q.user_id)), '[]'::jsonb),
    'recent_decisions', coalesce((
      select jsonb_agg(private.host_decision_state(q.id) || jsonb_build_object('person', private.host_person(q.user_id))
                       order by q.decided_at desc)
      from public.host_refund_requests q
      where q.program_id = p_program_id and q.status not in ('open', 'withdrawn')
        and q.decided_at > now() - interval '10 minutes'), '[]'::jsonb),
    'passes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ps.id, 'kind', ps.kind, 'name', ps.name, 'description', ps.description,
        'price_cents', ps.price_cents, 'currency', ps.currency, 'sessions_included', ps.sessions_included,
        'valid_days', ps.valid_days, 'series_id', ps.series_id,
        -- The count under each pass, and what it counts.
        'count_kind', case ps.kind when 'drop_in' then 'sold_this_month' when 'pack' then 'active'
                                    when 'monthly' then 'members' else 'in_next_session' end,
        'count', case ps.kind
          when 'drop_in' then (select count(*) from public.host_charges c
                               where c.program_id = p_program_id and c.kind = 'drop_in' and c.status = 'paid'
                                 and c.paid_at >= v_month_start)
          when 'pack' then (select count(*) from public.host_memberships m
                            where m.pass_id = ps.id and m.status <> 'ended'
                              and (m.period_ends_at is null or m.period_ends_at > now())
                              and private.host_sessions_left(m.id) > 0)
          when 'monthly' then (select count(*) from public.host_memberships m
                               where m.pass_id = ps.id and m.status <> 'ended' and m.period_ends_at > now())
          else (select a.confirmed_count from public.host_sessions s join public.activities a on a.id = s.activity_id
                where s.series_id = ps.series_id and s.status = 'scheduled' and s.starts_at > now()
                order by s.starts_at limit 1)
        end
      ) order by ps.sort_order, ps.created_at)
      from public.host_passes ps
      where ps.program_id = p_program_id and ps.archived_at is null), '[]'::jsonb),
    'members', (
      with mm as (
        select m.* from public.host_memberships m
        where m.program_id = p_program_id and m.kind = 'monthly' and m.status <> 'ended' and m.period_ends_at > now()
      )
      select jsonb_build_object(
        'count', (select count(*) from mm),
        'renewing_count', (select count(*) from mm where renews),
        'renews_on', (select (min(period_ends_at) filter (where renews) at time zone v_p.time_zone)::date from mm),
        'cancelled_count', (select count(*) from mm where not renews),
        'faces', coalesce((select jsonb_agg(private.host_person(x.user_id) order by x.started_at)
                           from (select mm.user_id, mm.started_at from mm
                                 where not authz.is_blocked(v_uid, mm.user_id)
                                 order by mm.started_at limit 7) x), '[]'::jsonb),
        -- Sessions a week over the last 4 weeks: members vs drop-in people.
        'member_sessions_per_week', (
          select round(count(*)::numeric / 4 / nullif((select count(*) from mm), 0), 1)
          from public.attendance a join public.host_sessions s on s.activity_id = a.activity_id
          where s.program_id = p_program_id and a.status = 'checked_in'
            and s.starts_at >= now() - interval '28 days' and a.user_id in (select user_id from mm)),
        'drop_in_sessions_per_week', (
          select round(count(*)::numeric / 4 / nullif(count(distinct c.user_id), 0), 1)
          from public.host_charges c
          where c.program_id = p_program_id and c.kind = 'drop_in' and c.status = 'paid'
            and c.paid_at >= now() - interval '28 days')
      )
    ),
    'past_payouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', po.id, 'pays_on', po.pays_on, 'period_start', po.period_start, 'period_end', po.period_end,
        'net_cents', po.net_cents, 'gross_cents', po.gross_cents, 'refunds_cents', po.refunds_cents,
        'fee_cents', po.fee_cents, 'currency', po.currency, 'session_count', po.session_count,
        'refund_count', po.refund_count, 'note', po.note, 'status', po.status, 'paid_at', po.paid_at,
        'lines', po.lines
      ) order by po.period_start desc)
      from (select * from public.host_payouts where program_id = p_program_id
            order by period_start desc limit 6) po), '[]'::jsonb)
  );
end;
$$;


-- BE-HOST-CORE seams (HostRoster, HostPeople) ------------------------------------------------------------
-- Core's roster and people reads call these; the shapes are core's (public.host_payment,
-- public.host_pass_summary, public.host_settlement).

-- status: 'host' | 'member' | 'pass' | 'paid' | 'free' | 'due_at_field' | 'refunded'.
-- label: the badge words ('MEMBER', '10-PACK', 'PAID $8', '$8 AT FIELD', 'FREE', 'REFUNDED', 'HOST').
-- detail: '4 sessions left' for a pack, 'Refunded $8' for a refund.
create or replace function private.host_payment_for(p_session uuid, p_user uuid)
returns public.host_payment
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j jsonb := private.host_payment_of(p_session, p_user);
  v_amount integer;
  v_cur text;
begin
  if j is null then
    return null;
  end if;
  v_amount := (j ->> 'amount_cents')::integer;
  v_cur := j ->> 'currency';
  return row(
    case j ->> 'state' when 'pack' then 'pass' when 'due' then 'due_at_field' else j ->> 'state' end,
    case j ->> 'state'
      when 'host' then 'HOST'
      when 'member' then 'MEMBER'
      when 'pack' then upper(coalesce(j ->> 'pass_name', 'Pack'))
      when 'paid' then 'PAID ' || private.host_fmt_money(v_amount, v_cur)
      when 'free' then 'FREE'
      when 'due' then private.host_fmt_money(v_amount, v_cur) || ' AT FIELD'
      when 'refunded' then 'REFUNDED'
    end,
    v_amount,
    v_cur,
    case j ->> 'state'
      when 'pack' then (j ->> 'sessions_left') || case when (j ->> 'sessions_left')::int = 1 then ' session left' else ' sessions left' end
      when 'refunded' then 'Refunded ' || private.host_fmt_money((j ->> 'refund_cents')::bigint, v_cur)
    end
  )::public.host_payment;
end;
$$;

-- kind: 'monthly' | 'pack' | 'free' | 'drop_in' (no pass, but paid a drop-in in the last 60 days).
create or replace function private.host_person_pass(p_program uuid, p_user uuid)
returns public.host_pass_summary
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v record;
  v_tz text := (select time_zone from public.host_programs where id = p_program);
begin
  select m.kind, p.name, m.renews, m.period_ends_at, private.host_sessions_left(m.id) as left_n into v
    from public.host_memberships m join public.host_passes p on p.id = m.pass_id
   where m.program_id = p_program and m.user_id = p_user and m.status <> 'ended'
     and (m.period_ends_at is null or m.period_ends_at > now())
     and (m.kind <> 'pack' or private.host_sessions_left(m.id) > 0)
   order by array_position(array['monthly', 'pack', 'free']::text[], m.kind::text), m.started_at desc
   limit 1;
  if found then
    return row(v.kind::text, v.name,
               case when v.kind = 'monthly' and v.renews then (v.period_ends_at at time zone v_tz)::date end,
               v.left_n)::public.host_pass_summary;
  end if;
  if exists (select 1 from public.host_charges c
             where c.program_id = p_program and c.user_id = p_user and c.kind = 'drop_in' and c.status = 'paid'
               and c.paid_at > now() - interval '60 days') then
    return row('drop_in', 'Drop-in', null, null)::public.host_pass_summary;
  end if;
  return null;
end;
$$;

-- "13 of 14 settled. Tomás is new and pays $8 at the field."
create or replace function private.host_session_settlement(p_session uuid)
returns public.host_settlement
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.host_sessions%rowtype;
  v_total integer := 0;
  v_settled integer := 0;
  v_due_user uuid;
  v_due_amount integer;
  r record;
  j jsonb;
  v_name text;
  v_new boolean;
begin
  select * into v_s from public.host_sessions where id = p_session;
  if not found then
    return null;
  end if;
  for r in select a.user_id from public.attendance a
           where a.activity_id = v_s.activity_id and a.status in ('confirmed', 'checked_in')
           order by coalesce(a.confirmed_at, a.updated_at)
  loop
    j := private.host_payment_of(p_session, r.user_id);
    v_total := v_total + 1;
    if (j ->> 'settled')::boolean then
      v_settled := v_settled + 1;
    elsif v_due_user is null then
      v_due_user := r.user_id;
      v_due_amount := (j ->> 'amount_cents')::integer;
    end if;
  end loop;
  if v_due_user is not null then
    select split_part(display_name, ' ', 1) into v_name from public.profiles where id = v_due_user;
    v_new := not exists (select 1 from public.attendance a join public.host_sessions s on s.activity_id = a.activity_id
                         where s.program_id = v_s.program_id and a.user_id = v_due_user
                           and a.status = 'checked_in' and s.starts_at < v_s.starts_at);
    return row(v_settled, v_total, v_due_user,
               coalesce(v_name, 'Someone') || case when v_new then ' is new and pays ' else ' pays ' end
               || private.host_fmt_money(v_due_amount, v_s.currency) || ' at the field.'
               || case when v_total - v_settled > 1 then ' ' || (v_total - v_settled - 1) || ' more to settle.' else '' end
              )::public.host_settlement;
  end if;
  return row(v_settled, v_total, null, null)::public.host_settlement;
end;
$$;
