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


-- Step 7 (Places) helpers ----------------------------------------------------------------------------------

-- Isolate from whatever the local database holds (seed data, other sessions): rolled back at the end.
update public.intent_signals set status = 'withdrawn', withdrawn_at = now() where status = 'active';
update public.plans set status = 'cancelled', cancelled_at = now() where status in ('forming', 'game_on');
update public.activities set status = 'cancelled', cancelled_at = now() where status in ('confirmed', 'live');
update public.clan_runs set status = 'cancelled', cancelled_at = now() where status <> 'cancelled';

-- A place in an area. Plateau test places sit inside tests.u(n)'s 5 km radius.
create function tests.place(
  p_slug text, p_area text, p_lat double precision, p_lng double precision, p_sensitive boolean default false
) returns uuid language sql security definer as $$
  insert into public.places (slug, name, area, city, lat, lng, sport_ids, surface, floodlit_until, sensitive)
  values (p_slug, initcap(replace(p_slug, '-', ' ')), p_area, 'Montréal', p_lat, p_lng,
          '{football,running,volleyball}', 'Turf', '23:00', p_sensitive)
  returning id;
$$;

-- A forming plan at a place, hosted by tests.u(p_host), with p_members people (the host first).
create function tests.plan_at(
  p_host integer, p_place uuid, p_starts interval default '3 hours',
  p_audience public.audience default 'public', p_sport text default 'football',
  p_capacity integer default 8, p_members integer default 1
) returns uuid language plpgsql security definer as $$
declare
  v uuid;
begin
  insert into public.plans (sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            source, created_by, host_id, member_count, level_label)
  values (p_sport, 'Test ' || p_sport, now() + p_starts, 60, p_place, p_capacity, p_audience, now() + p_starts / 2,
          'quick', tests.u(p_host), tests.u(p_host), p_members, 'Mixed level')
  returning id into v;
  insert into public.plan_members (plan_id, user_id, via)
  select v, tests.u(p_host + i), case when i = 0 then 'host'::public.member_via else 'im_down'::public.member_via end
  from generate_series(0, p_members - 1) i;
  insert into public.plan_meeting_points (plan_id, label) values (v, 'North pitch');
  return v;
end;
$$;

-- A GAME ON game at a place starting at now() + p_starts (negative = already live), host only.
create function tests.game_at(
  p_host integer, p_place uuid, p_starts interval default '2 hours',
  p_audience public.audience default 'public', p_title text default 'Sparring'
) returns uuid language plpgsql security definer as $$
declare
  v_plan uuid;
  v uuid;
begin
  insert into public.plans (sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count, locked_at)
  values ('football', p_title, now() + p_starts, 90, p_place, 2, p_audience, now() + p_starts - interval '1 hour',
          'game_on', 'quick', tests.u(p_host), tests.u(p_host), 1, now() - interval '1 day')
  returning id into v_plan;
  insert into public.plan_members (plan_id, user_id, via) values (v_plan, tests.u(p_host), 'host');
  insert into public.activities (plan_id, sport_id, title, starts_at, ends_at, place_id, capacity, host_id,
                                 confirmed_count, attendance_rule, check_in_opens_at, check_in_closes_at, status,
                                 live_at, after_closes_at)
  values (v_plan, 'football', p_title, now() + p_starts, now() + p_starts + interval '90 minutes', p_place, 2,
          tests.u(p_host), 1, 'check_in', now() + p_starts - interval '30 minutes',
          now() + p_starts + interval '90 minutes',
          case when p_starts < interval '0' then 'live'::public.activity_status else 'confirmed' end,
          case when p_starts < interval '0' then now() + p_starts end, now() + p_starts + interval '25 hours')
  returning id into v;
  return v;
end;
$$;

-- p_n finished games at a place hosted by tests.u(p_host), each with p_people checked in, p_days_ago
-- days back (one a day), at 7 PM local.
create function tests.history(
  p_host integer, p_place uuid, p_n integer, p_people integer default 6,
  p_audience public.audience default 'public', p_days_ago integer default 1
) returns void language plpgsql security definer as $$
declare
  v_plan uuid;
  v_at timestamptz;
begin
  for i in 0 .. p_n - 1 loop
    v_at := ((((now() at time zone 'America/Toronto')::date - (p_days_ago + i)) + time '19:00') at time zone 'America/Toronto');
    insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at, status,
                              source, created_by, host_id, member_count, locked_at)
    values ('football', v_at, 60, p_place, 12, p_audience, v_at - interval '1 hour', 'game_on', 'quick',
            tests.u(p_host), tests.u(p_host), 1, v_at - interval '2 hours')
    returning id into v_plan;
    insert into public.activities (plan_id, sport_id, starts_at, ends_at, place_id, capacity, host_id, confirmed_count,
                                   checked_in_count, attendance_rule, check_in_opens_at, check_in_closes_at, status,
                                   live_at, ended_at, after_closes_at, completed_at)
    values (v_plan, 'football', v_at, v_at + interval '60 minutes', p_place, 12, tests.u(p_host), p_people, p_people,
            'check_in', v_at - interval '30 minutes', v_at + interval '60 minutes', 'complete', v_at,
            v_at + interval '60 minutes', v_at + interval '25 hours', v_at + interval '25 hours');
  end loop;
end;
$$;

-- An unmatched Down For for tests.u(n) (inserted directly; create_down_for would match them).
create function tests.signal(
  n integer, p_sport text default 'volleyball', p_audience public.audience default 'public'
) returns uuid language sql security definer as $$
  insert into public.intent_signals (user_id, sport_id, window_start, window_end, expires_at, audience,
                                     radius_km, area_lat, area_lng)
  select tests.u(n), p_sport, now() + interval '2 hours', now() + interval '6 hours', now() + interval '6 hours',
         p_audience, pp.discovery_radius_km, pp.area_lat, pp.area_lng
  from public.profile_private pp where pp.user_id = tests.u(n)
  returning id;
$$;

create function tests.block(a integer, b integer) returns void language sql security definer as $$
  insert into public.blocks (blocker_id, blocked_id) values (tests.u(a), tests.u(b));
$$;

-- STEP 7 · PLACES: realtime hints (pulse_ticks), report a place, privileges.
select no_plan();

select tests.keep('pitch', '00000000-0000-4000-9100-000000000001');
delete from public.pulse_ticks where city = 'Montréal';

-- A public plan bumps the place and its city.
select tests.keep('public', tests.plan_at(1, tests.id('pitch'), '3 hours'));
select is(
  (select array_agg(key order by key) from public.pulse_ticks where city = 'Montréal'),
  array['Montréal:*', 'Montréal:' || tests.id('pitch')::text], 'a public plan bumps the city and the place');

-- Private plans never bump a tick.
delete from public.pulse_ticks where city = 'Montréal';
select tests.plan_at(2, tests.id('pitch'), '3 hours', 'invite_only');
select tests.plan_at(3, tests.id('pitch'), '4 hours', 'friends');
select is((select count(*)::integer from public.pulse_ticks where city = 'Montréal'), 0,
  'invite-only and friends plans do not bump a tick');

-- Joining and a game going live bump it.
select tests.keep('game', tests.game_at(5, tests.id('pitch'), '2 hours'));
delete from public.pulse_ticks where city = 'Montréal';
update public.activities set status = 'live', live_at = now() where id = tests.id('game');
select is((select count(*)::integer from public.pulse_ticks where place_id = tests.id('pitch')), 1,
  'a game going live bumps the place');
delete from public.pulse_ticks where city = 'Montréal';
select tests.join(4, tests.id('public'));
select is((select count(*)::integer from public.pulse_ticks where place_id = tests.id('pitch')), 1,
  'I''M DOWN bumps the place');

-- A Down For signal bumps only the city.
delete from public.pulse_ticks where city = 'Montréal';
select tests.signal(6);
select is(
  (select array_agg(key) from public.pulse_ticks where city = 'Montréal'), array['Montréal:*'],
  'a Down For bumps the city row only');

-- Ticks carry no people and no plans.
select is(
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
   where table_schema = 'public' and table_name = 'pulse_ticks'),
  array['key', 'city', 'place_id', 'ticked_at'], 'pulse_ticks: city, place, time only');
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pulse_ticks'),
  'pulse_ticks is published for realtime');

select tests.login(10);
select ok((select count(*) from public.pulse_ticks) > 0, 'signed-in people read ticks');
select throws_ok(
  format($$insert into public.pulse_ticks (key, city) values ('x:*', 'x')$$), '42501', null,
  'clients cannot write ticks');
select tests.logout();

-- Report a place ---------------------------------------------------------------------------------------------

select tests.login(10);
select ok(public.report('place', tests.id('pitch'), 'other', 'Closed for the winter') is not null,
  'a place can be reported');
select throws_ok(format('select public.report(%L, %L, %L)', 'place', gen_random_uuid(), 'other'), 'P0001',
  'subject_not_found', 'an unknown place is not found');
select tests.logout();
select is(
  (select count(*)::integer from public.reports where subject_kind = 'place' and subject_id = tests.id('pitch')),
  1, 'the report is stored');
-- The Host OS kind still works through the same seam.
insert into public.host_programs (id, name, created_by)
values ('00000000-0000-4000-9500-000000000009', 'Seam Check', tests.u(5));
select tests.login(10);
select ok(public.report('host_program', '00000000-0000-4000-9500-000000000009', 'spam') is not null,
  'host programs are still reportable');
select tests.logout();

-- Privileges ---------------------------------------------------------------------------------------------------

select ok(
  not has_function_privilege('authenticated', 'private.place_items(uuid, timestamptz, timestamptz, boolean, text, uuid)', 'execute'),
  'private.place_items is not callable by clients');
select ok(
  not has_function_privilege('authenticated', 'private.trusted_host(uuid)', 'execute'),
  'private.trusted_host is not callable by clients');
select ok(
  not has_function_privilege('anon', 'public.place_view(uuid)', 'execute'), 'anon cannot read a place page');
select ok(
  has_function_privilege('authenticated', 'public.place_tonight(uuid, text)', 'execute'),
  'signed-in people can');
select is(
  (select array_agg(proname::text order by proname) from pg_proc
   where pronamespace = 'public'::regnamespace and provolatile = 'v'
     and proname in ('pulse', 'pulse_place', 'place_view', 'place_tonight', 'place_groups', 'place_hosts',
                     'place_busy_times')),
  array['place_view', 'pulse'], 'only the logged reads are volatile');

-- Clients cannot change place facts.
select tests.login(10);
select throws_ok(format('update public.places set sensitive = true where id = %L', tests.id('pitch')), '42501', null,
  'clients cannot change place facts');
select tests.logout();

select * from finish();
rollback;
