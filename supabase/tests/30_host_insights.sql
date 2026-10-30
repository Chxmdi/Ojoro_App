-- Generated preamble + body. Run with: npx supabase test db
begin;
-- Shared setup (repeated in every test file; each file runs in its own transaction and rolls back).
-- People tests.u(1..12) live in the Plateau (45.52, -73.58) with a 5 km radius. One test place,
-- "Test Pitch", with a meeting point at the north pitch.
create extension if not exists pgtap with schema extensions;

create schema tests;
grant usage on schema tests to authenticated;

create function tests.u(n integer) returns uuid language sql immutable
as $$ select ('00000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid $$;

create table tests.ids (k text primary key, v uuid);
grant select on tests.ids to authenticated;
create function tests.id(p_k text) returns uuid language sql stable
as $$ select v from tests.ids where k = p_k $$;
create function tests.keep(p_k text, p_v uuid) returns uuid language sql security definer
as $$ insert into tests.ids values (p_k, p_v) on conflict (k) do update set v = excluded.v returning v $$;

create function tests.login(n integer) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.u(n), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

insert into auth.users (id, instance_id, aud, role, raw_user_meta_data)
select tests.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       jsonb_build_object('display_name', 'Tester ' || n)
from generate_series(1, 12) n;
update public.profile_private set area_lat = 45.52, area_lng = -73.58, discovery_radius_km = 5
 where user_id in (select tests.u(n) from generate_series(1, 12) n);

insert into public.places (id, slug, name, area, city, lat, lng, sport_ids)
values ('00000000-0000-4000-9100-000000000001', 'test-pitch', 'Test Pitch', 'Plateau', 'Montréal',
        45.5165, -73.5862, '{football,running}');

-- A forming plan hosted by tests.u(p_host). Deadline halfway to the start.
create function tests.make_plan(
  p_host integer, p_capacity integer, p_starts interval default '3 hours',
  p_audience public.audience default 'public'
) returns uuid language plpgsql security definer as $$
declare
  v uuid;
begin
  insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            source, created_by, host_id, member_count, team_a_label, team_b_label)
  values ('football', now() + p_starts, 90, '00000000-0000-4000-9100-000000000001', p_capacity, p_audience,
          now() + p_starts / 2, 'quick', tests.u(p_host), tests.u(p_host), 1, 'Lights', 'Darks')
  returning id into v;
  insert into public.plan_members (plan_id, user_id, via) values (v, tests.u(p_host), 'host');
  insert into public.plan_meeting_points (plan_id, label, lat, lng) values (v, 'North pitch', 45.5190, -73.5880);
  return v;
end;
$$;

-- tests.u(n) taps I'M DOWN with a fresh key.
create function tests.join(n integer, p_plan uuid) returns public.plan_state language plpgsql as $$
declare
  v public.plan_state;
begin
  perform tests.login(n);
  v := public.im_down(p_plan, gen_random_uuid());
  perform tests.logout();
  return v;
end;
$$;

-- tests.u(a) and tests.u(b) played a finished game together a week ago (makes them "connected").
create function tests.connect(a integer, b integer) returns uuid language plpgsql security definer as $$
declare
  v_plan uuid;
  v_act uuid;
begin
  insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count)
  values ('football', now() - interval '7 days', 90, '00000000-0000-4000-9100-000000000001', 2, 'public',
          now() - interval '7 days 1 hour', 'game_on', 'quick', tests.u(a), tests.u(a), 2)
  returning id into v_plan;
  insert into public.plan_members (plan_id, user_id, via) values (v_plan, tests.u(a), 'host'), (v_plan, tests.u(b), 'im_down');
  insert into public.activities (plan_id, sport_id, starts_at, ends_at, place_id, capacity, host_id, confirmed_count,
                                 checked_in_count, attendance_rule, check_in_opens_at, check_in_closes_at, status,
                                 after_closes_at)
  values (v_plan, 'football', now() - interval '7 days', now() - interval '7 days' + interval '90 minutes',
          '00000000-0000-4000-9100-000000000001', 2, tests.u(a), 2, 2, 'check_in', now() - interval '7 days 30 minutes',
          now() - interval '7 days' + interval '90 minutes', 'complete', now() - interval '6 days')
  returning id into v_act;
  insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
  values (v_act, tests.u(a), 'checked_in', now() - interval '8 days', now() - interval '7 days', 'location'),
         (v_act, tests.u(b), 'checked_in', now() - interval '8 days', now() - interval '7 days', 'location');
  insert into public.passport_entries (user_id, activity_id, sport_id, place_id, occurred_at, minutes, sport_game_number)
  values (tests.u(a), v_act, 'football', '00000000-0000-4000-9100-000000000001', now() - interval '7 days', 90, 1),
         (tests.u(b), v_act, 'football', '00000000-0000-4000-9100-000000000001', now() - interval '7 days', 90, 1);
  return v_act;
end;
$$;

-- Step 4 helpers (messaging). A crew owned by tests.u(p_owner) with tests.u(n) members.
create function tests.make_crew(p_owner integer, p_members integer[], p_name text default 'Test Crew')
returns uuid language plpgsql security definer as $$
declare
  v uuid;
begin
  insert into public.crews (name, sport_id, created_by) values (p_name, 'football', tests.u(p_owner)) returning id into v;
  insert into public.crew_members (crew_id, user_id, role, via) values (v, tests.u(p_owner), 'owner', 'created');
  insert into public.crew_members (crew_id, user_id, role, via, invited_by)
  select v, tests.u(n), 'member', 'added', tests.u(p_owner) from unnest(p_members) n where n <> p_owner;
  update public.crews set member_count = (select count(*) from public.crew_members m where m.crew_id = v) where id = v;
  return v;
end;
$$;

-- A game that has been live for 30 minutes: tests.u(p_host) hosts, p_players checked in.
create function tests.live_game(p_host integer, p_players integer[],
                                p_rule public.attendance_rule default 'check_in_host_confirms')
returns uuid language plpgsql security definer as $$
declare
  v_plan uuid;
  v_act uuid;
begin
  insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count, team_a_label, team_b_label)
  values ('football', now() - interval '30 minutes', 90, '00000000-0000-4000-9100-000000000001', 8, 'public',
          now() - interval '90 minutes', 'game_on', 'quick', tests.u(p_host), tests.u(p_host),
          cardinality(p_players), 'Lights', 'Darks')
  returning id into v_plan;
  insert into public.plan_members (plan_id, user_id, via)
  select v_plan, tests.u(n), case when n = p_host then 'host'::public.member_via else 'im_down'::public.member_via end
  from unnest(p_players) n;
  insert into public.activities (plan_id, sport_id, starts_at, ends_at, place_id, capacity, host_id, confirmed_count,
                                 checked_in_count, attendance_rule, check_in_opens_at, check_in_closes_at, status,
                                 live_at, after_closes_at, team_a_label, team_b_label)
  values (v_plan, 'football', now() - interval '30 minutes', now() + interval '60 minutes',
          '00000000-0000-4000-9100-000000000001', 8, tests.u(p_host), cardinality(p_players), cardinality(p_players),
          p_rule, now() - interval '60 minutes', now() + interval '60 minutes', 'live', now() - interval '30 minutes',
          now() + interval '25 hours', 'Lights', 'Darks')
  returning id into v_act;
  insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
  select v_act, tests.u(n), 'checked_in', now() - interval '2 hours', now() - interval '40 minutes', 'host'
  from unnest(p_players) n;
  return v_act;
end;
$$;

create function tests.block(a integer, b integer) returns void language sql security definer as $$
  insert into public.blocks (blocker_id, blocked_id) values (tests.u(a), tests.u(b)) on conflict do nothing;
$$;

create function tests.crew_code(p_crew uuid) returns text language sql security definer as $$
  select code from private.crew_invite_codes where crew_id = p_crew
$$;
-- Step 5 helpers (competition). tests.u(a) calls out tests.u(b) (null: an open call-out) to a 5K
-- run at Test Pitch, p_starts from now. Returns the call-out id.
create function tests.call_out(a integer, b integer, p_starts interval default '3 days',
                               p_audience public.challenge_audience default 'public')
returns uuid language plpgsql as $$
declare
  v uuid;
begin
  perform tests.login(a);
  v := (public.create_call_out(gen_random_uuid(), 'running', '5K', 'time', now() + p_starts,
        p_opponent_id => case when b is null then null else tests.u(b) end, p_target => 5, p_unit => 'km',
        p_place_id => '00000000-0000-4000-9100-000000000001', p_audience => p_audience,
        p_message => 'Bring your legs.')).call_out_id;
  perform tests.logout();
  return v;
end;
$$;

-- An accepted Challenge Event: tests.u(a) is side a (challenger), tests.u(b) side b.
create function tests.event(a integer, b integer, p_starts interval default '3 days',
                            p_audience public.challenge_audience default 'public')
returns uuid language plpgsql as $$
declare
  v_o uuid := tests.call_out(a, b, p_starts, p_audience);
  v uuid;
begin
  perform tests.login(b);
  v := (public.accept_call_out(v_o, gen_random_uuid())).event_id;
  perform tests.logout();
  return v;
end;
$$;

-- Move an event's start to now() + p (check-in opens an hour before the start).
create function tests.starts_in(p_event uuid, p interval) returns void language sql security definer as $$
  update public.challenge_events
     set starts_at = now() + p, check_in_opens_at = now() + p - interval '60 minutes'
   where id = p_event;
$$;

-- Take an event LIVE: start in 10 minutes, both captains check in and press I'M READY.
create function tests.go_live(p_event uuid, a integer, b integer) returns void language plpgsql as $$
begin
  perform tests.starts_in(p_event, '10 minutes');
  perform tests.login(a);
  perform public.check_in_challenge(p_event);
  perform public.ready_challenge(p_event);
  perform tests.login(b);
  perform public.check_in_challenge(p_event);
  perform public.ready_challenge(p_event);
  perform tests.logout();
end;
$$;

-- tests.u(n) predicts (or backs) side p_side.
create function tests.predict(n integer, p_event uuid, p_side public.team_side) returns void language plpgsql as $$
begin
  perform tests.login(n);
  perform public.predict_challenge(p_event, p_side);
  perform tests.logout();
end;
$$;

-- A finished result between a and b (a's time, b's time in seconds), submitted by a, confirmed by b.
create function tests.finish(p_event uuid, a integer, b integer, p_a numeric, p_b numeric) returns void
language plpgsql as $$
declare
  v_s uuid;
begin
  perform tests.login(a);
  v_s := (public.submit_challenge_result(p_event, p_a, p_b, gen_random_uuid())).submission_id;
  perform tests.login(b);
  perform public.confirm_challenge_result(v_s, gen_random_uuid());
  perform tests.logout();
end;
$$;

-- Step 6 BE-HOST-OPS helpers. tests.u(p_host) runs a program with one series at Test Pitch
-- (p_price cents a drop-in, members free, every day at 19:00 for 90 minutes, capacity p_capacity).
create function tests.make_program(p_host integer, p_price integer default 800, p_capacity integer default 10)
returns uuid language plpgsql security definer as $$
declare
  v_p uuid;
  v_s uuid;
begin
  insert into public.host_programs (name, sport_id, area, created_by)
  values ('Test Pickup', 'football', 'Plateau', tests.u(p_host)) returning id into v_p;
  insert into public.host_program_hosts (program_id, user_id, role) values (v_p, tests.u(p_host), 'owner');
  insert into public.host_series (program_id, name, sport_id, place_id, start_time, duration_minutes, capacity,
                                  repeat_days, starts_on, price_cents, member_price_cents, created_by)
  values (v_p, 'Tuesday 7-a-side', 'football', '00000000-0000-4000-9100-000000000001', '19:00', 90, p_capacity,
          '{1,2,3,4,5,6,7}', current_date - 120, p_price, 0, tests.u(p_host))
  returning id into v_s;
  perform tests.keep('series', v_s);
  return v_p;
end;
$$;

-- A session of the 'series' on current_date + p_days (negative: in the past).
create function tests.session(p_days integer, p_series uuid default null) returns uuid
language plpgsql security definer as $$
begin
  return private.host_create_session(coalesce(p_series, tests.id('series')), current_date + p_days);
end;
$$;

-- Put tests.u(n) in a session with a status (confirmed, waitlisted, checked_in). Keeps the counts.
create function tests.attend(p_session uuid, n integer, p_status public.attendance_status default 'confirmed',
                             p_confirmed_at timestamptz default null)
returns void language plpgsql security definer as $$
declare
  v_a uuid := (select activity_id from public.host_sessions where id = p_session);
begin
  insert into public.attendance (activity_id, user_id, status, confirmed_at, waitlisted_at, checked_in_at, check_in_method)
  values (v_a, tests.u(n), p_status,
          case when p_status <> 'waitlisted' then coalesce(p_confirmed_at, now() - interval '1 day') end,
          case when p_status = 'waitlisted' then now() - interval '1 hour' end,
          case when p_status = 'checked_in' then now() - interval '1 minute' end,
          case when p_status = 'checked_in' then 'host'::public.check_in_method end);
  update public.activities
     set confirmed_count = confirmed_count + case when p_status in ('confirmed', 'checked_in') then 1 else 0 end,
         waitlist_count = waitlist_count + case when p_status = 'waitlisted' then 1 else 0 end,
         checked_in_count = checked_in_count + case when p_status = 'checked_in' then 1 else 0 end
   where id = v_a;
end;
$$;

-- Step 6 BE-HOST-OPS: insights & revenue and the CSV export. Ojoro hours, show-up, return within two
-- weeks, fill time, payout total, people per week, fill rate per series, the revenue ledger.
select no_plan();

select tests.keep('prog', tests.make_program(1, 800, 4));
select tests.keep('a', tests.session(-20));
select tests.keep('b', tests.session(-10));
select tests.keep('c', tests.session(-3));
select tests.attend(tests.id('a'), 2, 'checked_in');
select tests.attend(tests.id('a'), 3, 'checked_in');
select tests.attend(tests.id('a'), 4, 'checked_in');
select tests.attend(tests.id('a'), 5, 'confirmed');
select tests.attend(tests.id('b'), 2, 'checked_in');
select tests.attend(tests.id('b'), 3, 'checked_in');
select tests.attend(tests.id('c'), 6, 'checked_in');
select tests.attend(tests.id('c'), 2, 'confirmed');
-- Money in the window: a drop-in, a monthly, a refund.
insert into public.host_passes (id, program_id, kind, name, price_cents, created_by)
values ('00000000-0000-4000-9300-000000000001', tests.id('prog'), 'monthly', 'Monthly', 3500, tests.u(1));
insert into public.host_charges (id, program_id, user_id, kind, session_id, amount_cents, currency, status, method, paid_at)
values ('00000000-0000-4000-9300-000000000002', tests.id('prog'), tests.u(2), 'drop_in', tests.id('b'), 800, 'CAD',
        'paid', 'at_field', now() - interval '10 days');
insert into public.host_charges (program_id, user_id, kind, pass_id, amount_cents, currency, status, method, paid_at)
values (tests.id('prog'), tests.u(3), 'monthly', '00000000-0000-4000-9300-000000000001', 3500, 'CAD', 'paid', 'app',
        now() - interval '5 days');
insert into public.host_refunds (program_id, charge_id, user_id, amount_cents, currency, reason, created_at)
values (tests.id('prog'), '00000000-0000-4000-9300-000000000002', tests.u(2), 800, 'CAD', 'host_decision',
        now() - interval '4 days');

select tests.login(1);
create temp table ins as select public.host_insights(tests.id('prog')) as j;
select is((select (j ->> 'ojoro_hours')::int from ins), 9, 'Ojoro hours: 6 check-ins × 1.5 h');
select is((select (j ->> 'show_up_rate')::numeric from ins), 0.75, 'showed up: 6 of 8');
select is((select round((j ->> 'return_rate')::numeric, 2) from ins), 0.67, 'came back within 2 weeks: 2 of 3');
select is((select (j -> 'fill' ->> 'filled_sessions')::int from ins), 1, 'one session filled');
select ok((select (j -> 'fill' ->> 'median_seconds')::int >= 0 from ins), 'with a fill time');
select is((select j -> 'fill' ->> 'series_name' from ins), 'Tuesday 7-a-side', 'named by its series');
select is((select jsonb_array_length(j -> 'weeks') from ins), 12, 'twelve weeks');
select is((select sum((w ->> 'people')::int) from ins, jsonb_array_elements(j -> 'weeks') w)::int, 6, 'people per week');
select is((select sum((w ->> 'sessions')::int) from ins, jsonb_array_elements(j -> 'weeks') w)::int, 3, 'sessions per week');
select is((select round((j -> 'by_series' -> 0 ->> 'fill_rate')::numeric, 2) from ins), 0.67, 'fill rate per series');
select is((select (j -> 'by_series' -> 0 ->> 'no_show_rate')::numeric from ins), 0.25, 'no-shows per series');
select is((select (j -> 'revenue' ->> 'gross_cents')::int from ins), 4300, 'revenue: charges');
select is((select (j -> 'revenue' ->> 'refunds_cents')::int from ins), 800, 'refunds');
select is((select (j -> 'revenue' ->> 'fee_cents')::int from ins), 300, 'the placeholder fee');
select is((select (j ->> 'payout_cents')::int from ins), 3200, 'paid out to you');
select is((select jsonb_array_length(j -> 'revenue' -> 'lines') from ins), 2, 'one line per kind and price');
select throws_ok(format($$select public.host_insights(%L, 3)$$, tests.id('prog')), 'P0001', 'invalid_argument',
                 'a window of at least a week');

-- CSV
create temp table csv as select public.host_insights_csv(tests.id('prog')) as t;
select is((select split_part(t, chr(10), 1) from csv), 'date,record,kind,description,person,amount,currency,status,method,provider,id',
          'a header row');
select is((select count(*) from csv, regexp_split_to_table(t, chr(10)) l where l like '%,charge,%')::int, 2, 'one row per charge');
select ok((select t like '%,refund,host_decision,,Tester 2,-8.00,CAD,pending,,none,%' from csv), 'refunds are negative');
select tests.logout();
select is((select provolatile::text from pg_proc where oid = 'public.host_insights_csv(uuid, integer)'::regprocedure), 'v',
          'the export records an event, so it is volatile (PostgREST runs stable functions read-only)');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.provolatile <> 'v'
             and p.proname in ('host_insights_csv', 'create_host_pass', 'grant_host_pass', 'mark_paid_at_field',
                               'decide_host_refund', 'undo_host_refund_decision', 'confirm_league_result',
                               'dispute_league_result', 'submit_league_result', 'ask_league_referee')), 0::bigint,
          'no writing RPC is stable');
select is(private.csv_cell('=SUM(A1)'), '"''=SUM(A1)"', 'formulas are defused');
select is(private.csv_cell('Hello, "you"'), '"Hello, ""you"""', 'commas and quotes are quoted');
select is(private.csv_cell('-12.50'), '-12.50', 'negative numbers stay numbers');
select tests.login(2);
select throws_ok(format($$select public.host_insights_csv(%L)$$, tests.id('prog')), 'P0001', 'not_program_host',
                 'only hosts export');
select throws_ok(format($$select public.host_insights(%L)$$, tests.id('prog')), 'P0001', 'not_program_host',
                 'only hosts see insights');

select * from finish();
rollback;
