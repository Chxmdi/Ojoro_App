-- Step 6 BE-HOST-OPS: insights & revenue (HostInsights; PRD §13 analytics & revenue, §15) and the CSV
-- export, then privileges for every BE-HOST-OPS function. Contract: docs/HOSTS_OPS_CONTRACT.md.
--
-- Everything is computed from the program's own sessions (BE-HOST-CORE host_sessions → Slice 01
-- activities + attendance) and the ledger. Hosts see attendance at their own sessions only (counts and
-- rates; no person-level data leaves host_insights).

-- Insights ------------------------------------------------------------------------------------------------

-- Ended, held sessions of a program in [p_from, p_to).
create or replace function private.host_held_sessions(p_program uuid, p_from timestamptz, p_to timestamptz)
returns table (session_id uuid, series_id uuid, activity_id uuid, starts_at timestamptz, ends_at timestamptz,
               capacity integer, opens_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.series_id, s.activity_id, a.starts_at, a.ends_at, a.capacity, s.opens_at
  from public.host_sessions s join public.activities a on a.id = s.activity_id
  where s.program_id = p_program and s.status = 'scheduled' and a.status <> 'cancelled'
    and a.starts_at >= p_from and a.starts_at < p_to and a.ends_at <= now();
$$;

-- Hours, show-up and return for one window.
create or replace function private.host_window_stats(p_program uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with hs as (select * from private.host_held_sessions(p_program, p_from, p_to)),
  att as (
    select a.user_id, a.status, a.checked_in_at, hs.session_id, hs.starts_at, hs.ends_at
    from hs join public.attendance a on a.activity_id = hs.activity_id
    where a.status in ('confirmed', 'checked_in')
  ),
  firsts as (
    select distinct on (user_id) user_id, starts_at from att
    where status = 'checked_in' and starts_at <= least(p_to, now()) - interval '14 days'
    order by user_id, starts_at
  )
  select jsonb_build_object(
    'sessions', (select count(*) from hs),
    'ojoro_hours', coalesce((select round(sum(extract(epoch from (ends_at - starts_at)) / 3600))::int
                             from att where status = 'checked_in'), 0),
    'checked_in', (select count(*) from att where status = 'checked_in'),
    'committed', (select count(*) from att),
    'show_up_rate', (select round(count(*) filter (where status = 'checked_in')::numeric / nullif(count(*), 0), 4) from att),
    'return_eligible', (select count(*) from firsts),
    'return_rate', (
      select round(count(*) filter (where exists (
               select 1 from public.attendance a2 join public.host_sessions s2 on s2.activity_id = a2.activity_id
               where s2.program_id = p_program and a2.user_id = f.user_id and a2.status = 'checked_in'
                 and s2.starts_at > f.starts_at and s2.starts_at <= f.starts_at + interval '14 days'))::numeric
             / nullif(count(*), 0), 4)
      from firsts f)
  );
$$;

-- Time from a session opening for joining to its last spot being taken, per filled session.
create or replace function private.host_fill_seconds(p_program uuid, p_from timestamptz, p_to timestamptz)
returns table (session_id uuid, series_id uuid, fill_seconds integer)
language sql
stable
security definer
set search_path = ''
as $$
  select hs.session_id, hs.series_id,
         greatest(0, extract(epoch from (x.filled_at - hs.opens_at)))::int
  from private.host_held_sessions(p_program, p_from, p_to) hs
  cross join lateral (
    select a.confirmed_at as filled_at from public.attendance a
    where a.activity_id = hs.activity_id and a.status in ('confirmed', 'checked_in') and a.confirmed_at is not null
    order by a.confirmed_at offset greatest(hs.capacity - 1, 0) limit 1
  ) x;
$$;

-- Insights & revenue for the program's hosts. p_days: the window (default 30); the "before" numbers are
-- the same length just before it. The weekly series is always the last 12 weeks (Monday starts, local).
create or replace function public.host_insights(p_program_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_p public.host_programs%rowtype;
  v_to timestamptz := now();
  v_from timestamptz;
  v_prev timestamptz;
  v_now_stats jsonb;
  v_prev_stats jsonb;
  v_fill jsonb;
  v_money jsonb;
  v_money_prev jsonb;
  v_week0 date;
begin
  v_p := private.host_require(p_program_id, v_uid);
  if p_days is null or p_days not between 7 and 365 then
    perform private.fail('invalid_argument', 'days');
  end if;
  v_from := v_to - make_interval(days => p_days);
  v_prev := v_from - make_interval(days => p_days);
  v_now_stats := private.host_window_stats(p_program_id, v_from, v_to);
  v_prev_stats := private.host_window_stats(p_program_id, v_prev, v_from);
  v_money := private.host_money_totals(p_program_id, v_from, v_to);
  v_money_prev := private.host_money_totals(p_program_id, v_prev, v_from);
  v_week0 := date_trunc('week', (v_to at time zone v_p.time_zone))::date - 77;

  -- The series that fills best: most filled sessions, then the fastest median.
  with now_f as (select * from private.host_fill_seconds(p_program_id, v_from, v_to)),
  prev_f as (select * from private.host_fill_seconds(p_program_id, v_prev, v_from)),
  best as (
    select f.series_id, count(*) as n,
           percentile_cont(0.5) within group (order by f.fill_seconds) as median_s
    from now_f f where f.series_id is not null group by f.series_id
    order by count(*) desc, 3 limit 1
  )
  select jsonb_build_object(
    'series_id', b.series_id,
    'series_name', (select name from public.host_series where id = b.series_id),
    'repeat_days', (select to_jsonb(repeat_days) from public.host_series where id = b.series_id),
    'filled_sessions', b.n,
    'median_seconds', round(b.median_s)::int,
    'median_seconds_before', (select round(percentile_cont(0.5) within group (order by p.fill_seconds))::int
                              from prev_f p where p.series_id = b.series_id)
  ) into v_fill from best b;

  return jsonb_build_object(
    'program_id', v_p.id,
    'program_name', v_p.name,
    'time_zone', v_p.time_zone,
    'days', p_days,
    'from', v_from,
    'to', v_to,
    'ojoro_hours', (v_now_stats ->> 'ojoro_hours')::int,
    'ojoro_hours_before', (v_prev_stats ->> 'ojoro_hours')::int,
    'sessions', (v_now_stats ->> 'sessions')::int,
    'show_up_rate', (v_now_stats ->> 'show_up_rate')::numeric,
    'show_up_rate_before', (v_prev_stats ->> 'show_up_rate')::numeric,
    'return_rate', (v_now_stats ->> 'return_rate')::numeric,
    'return_rate_before', (v_prev_stats ->> 'return_rate')::numeric,
    'fill', v_fill,
    'payout_cents', (v_money ->> 'net_cents')::bigint,
    'payout_cents_before', (v_money_prev ->> 'net_cents')::bigint,
    'currency', v_money ->> 'currency',
    'weeks', (
      select jsonb_agg(jsonb_build_object(
        'week_start', w.d,
        'people', (select count(distinct a.user_id)
                   from public.host_sessions s join public.attendance a on a.activity_id = s.activity_id
                   where s.program_id = p_program_id and s.status = 'scheduled' and a.status = 'checked_in'
                     and (s.starts_at at time zone v_p.time_zone)::date >= w.d
                     and (s.starts_at at time zone v_p.time_zone)::date < w.d + 7),
        'sessions', (select count(*) from public.host_sessions s join public.activities a on a.id = s.activity_id
                     where s.program_id = p_program_id and s.status = 'scheduled' and a.status <> 'cancelled'
                       and a.ends_at <= now()
                       and (s.starts_at at time zone v_p.time_zone)::date >= w.d
                       and (s.starts_at at time zone v_p.time_zone)::date < w.d + 7),
        'skipped', coalesce((select jsonb_agg(jsonb_build_object('session_id', s.id, 'starts_at', s.starts_at,
                                                                 'series_name', se.name, 'reason', s.skip_reason)
                                              order by s.starts_at)
                             from public.host_sessions s left join public.host_series se on se.id = s.series_id
                             where s.program_id = p_program_id and s.status = 'skipped'
                               and (s.starts_at at time zone v_p.time_zone)::date >= w.d
                               and (s.starts_at at time zone v_p.time_zone)::date < w.d + 7), '[]'::jsonb)
      ) order by w.d)
      from (select v_week0 + 7 * i as d from generate_series(0, 11) i) w
    ),
    'by_series', coalesce((
      with hs as (select * from private.host_held_sessions(p_program_id, v_from, v_to)),
      per as (
        select hs.session_id, hs.series_id, hs.capacity, hs.starts_at,
               (select count(*) from public.attendance a where a.activity_id = hs.activity_id
                and a.status in ('confirmed', 'checked_in')) as in_n,
               (select count(*) from public.attendance a where a.activity_id = hs.activity_id
                and a.status = 'confirmed') as no_show_n,
               (select count(*) from public.attendance a where a.activity_id = hs.activity_id
                and a.status = 'waitlisted') as wait_n
        from hs
      ), firsts as (
        -- First-timers at the program in this window, and whether they came back within 8 days.
        select hs.series_id, a.user_id,
               exists (select 1 from public.attendance a2 join public.host_sessions s2 on s2.activity_id = a2.activity_id
                       where s2.program_id = p_program_id and a2.user_id = a.user_id and a2.status = 'checked_in'
                         and s2.starts_at > hs.starts_at and s2.starts_at <= hs.starts_at + interval '8 days') as came_back
        from hs join public.attendance a on a.activity_id = hs.activity_id and a.status = 'checked_in'
        where not exists (select 1 from public.attendance a0 join public.host_sessions s0 on s0.activity_id = a0.activity_id
                          where s0.program_id = p_program_id and a0.user_id = a.user_id and a0.status = 'checked_in'
                            and s0.starts_at < hs.starts_at)
          and hs.starts_at <= now() - interval '8 days'
      )
      select jsonb_agg(jsonb_build_object(
        'series_id', se.id,
        'name', se.name,
        'sessions', x.n,
        'capacity', se.capacity,
        'fill_rate', x.fill_rate,
        'no_show_rate', x.no_show_rate,
        'typical_in', x.typical_in,
        'typical_waitlist', x.typical_wait,
        'median_fill_seconds', (select round(percentile_cont(0.5) within group (order by f.fill_seconds))::int
                                from private.host_fill_seconds(p_program_id, v_from, v_to) f where f.series_id = se.id),
        'first_timers', (select count(*) from firsts f where f.series_id = se.id),
        'first_timer_return_rate', (select round(count(*) filter (where f.came_back)::numeric / nullif(count(*), 0), 4)
                                    from firsts f where f.series_id = se.id)
      ) order by x.fill_rate desc nulls last, se.name)
      from public.host_series se
      join lateral (
        select count(*) as n,
               round(avg(least(p.in_n::numeric / nullif(p.capacity, 0), 1)), 4) as fill_rate,
               round(sum(p.no_show_n)::numeric / nullif(sum(p.in_n), 0), 4) as no_show_rate,
               round(percentile_cont(0.5) within group (order by p.in_n))::int as typical_in,
               round(percentile_cont(0.5) within group (order by p.wait_n))::int as typical_wait
        from per p where p.series_id = se.id
      ) x on x.n > 0
      where se.program_id = p_program_id), '[]'::jsonb),
    'revenue', v_money,
    'fee_policy', public.host_service_fee_policy(),
    'provider', 'none',
    'payments_connected', false
  );
end;
$$;

-- CSV export ---------------------------------------------------------------------------------------------

create or replace function private.csv_cell(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p is null then ''
              -- Leading = + - @ would run as a formula in a spreadsheet: prefix a quote.
              when p ~ '^[=+\-@]' and p !~ '^-?[0-9]+(\.[0-9]+)?$' then '"''' || replace(p, '"', '""') || '"'
              when p ~ '[",\n\r]' then '"' || replace(p, '"', '""') || '"'
              else p end;
$$;

-- DOWNLOAD CSV: the program's ledger for the window, one row per record (charges, refunds, closed payouts
-- and their placeholder fee), oldest first. Hosts only. Amounts in currency units with two decimals
-- (refunds and fees negative). Names are the display names the host already sees.
create or replace function public.host_insights_csv(p_program_id uuid, p_days integer default 30)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_p public.host_programs%rowtype;
  v_from timestamptz;
  v_out text;
begin
  v_p := private.host_require(p_program_id, v_uid);
  if p_days is null or p_days not between 7 and 365 then
    perform private.fail('invalid_argument', 'days');
  end if;
  v_from := now() - make_interval(days => p_days);
  with rows as (
    select c.created_at as at, coalesce(c.paid_at, c.created_at) as on_at, 'charge' as record, c.kind::text as kind,
           coalesce(ps.name, case when c.kind = 'drop_in' then se.name end) as description,
           pr.display_name as person, c.amount_cents::bigint as cents, c.currency, c.status::text as status,
           c.method::text as method, c.provider, c.id
    from public.host_charges c
    join public.profiles pr on pr.id = c.user_id
    left join public.host_passes ps on ps.id = c.pass_id
    left join public.host_sessions s on s.id = c.session_id
    left join public.host_series se on se.id = s.series_id
    where c.program_id = p_program_id and coalesce(c.paid_at, c.created_at) >= v_from
    union all
    select r.created_at, r.created_at, 'refund', r.reason::text, null, pr.display_name, -r.amount_cents::bigint,
           r.currency, r.status::text, null, r.provider, r.id
    from public.host_refunds r join public.profiles pr on pr.id = r.user_id
    where r.program_id = p_program_id and r.created_at >= v_from
    union all
    select po.period_end, po.period_end, 'service_fee', 'placeholder', 'Ojoro service fee (placeholder)', null,
           -po.fee_cents, po.currency, po.status::text, null, po.provider, po.id
    from public.host_payouts po where po.program_id = p_program_id and po.period_end >= v_from and po.fee_cents > 0
    union all
    select po.period_end, po.period_end, 'payout', 'weekly',
           'Week of ' || to_char(po.period_start at time zone v_p.time_zone, 'YYYY-MM-DD'), null,
           po.net_cents, po.currency, po.status::text, null, po.provider, po.id
    from public.host_payouts po where po.program_id = p_program_id and po.period_end >= v_from
  )
  select 'date,record,kind,description,person,amount,currency,status,method,provider,id' || chr(10) ||
         coalesce(string_agg(
           array_to_string(array[
             to_char(r.on_at at time zone v_p.time_zone, 'YYYY-MM-DD'),
             r.record, r.kind, private.csv_cell(r.description), private.csv_cell(r.person),
             to_char(r.cents / 100.0, 'FM999999990.00'), r.currency, r.status, coalesce(r.method, ''), r.provider,
             r.id::text], ','),
           chr(10) order by r.on_at, r.record, r.id) || chr(10), '')
    into v_out
  from rows r;
  perform private.emit('host_insights_exported', v_uid, jsonb_build_object('program_id', p_program_id, 'days', p_days));
  return v_out;
end;
$$;

-- Privileges -------------------------------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname = any (array[
        'host_service_fee_policy', 'host_session_payments', 'host_people_passes', 'create_host_pass',
        'update_host_pass', 'archive_host_pass', 'grant_host_pass', 'mark_paid_at_field', 'request_host_refund',
        'cancel_host_membership', 'decide_host_refund', 'undo_host_refund_decision', 'host_money_view',
        'host_league_standings', 'create_host_league', 'upsert_host_league_team', 'set_host_league_member',
        'generate_host_league_fixtures', 'schedule_host_league_fixture', 'reschedule_host_league_fixture',
        'set_league_fixture_in', 'check_in_league_fixture', 'submit_league_result', 'confirm_league_result',
        'dispute_league_result', 'ask_league_referee', 'respond_league_referee', 'clear_league_referee',
        'host_league_view', 'host_program_leagues', 'host_insights', 'host_insights_csv'])
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end;
$$;

grant execute on function private.host_ops_tick() to service_role;
