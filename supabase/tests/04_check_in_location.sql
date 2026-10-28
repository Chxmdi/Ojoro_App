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

-- check_in window and distance; location sharing for one game.
select no_plan();

select tests.keep('plan', tests.make_plan(1, 2, '20 minutes'));
select tests.join(2, tests.id('plan'));
select tests.keep('activity', (select id from public.activities where plan_id = tests.id('plan')));

select tests.login(3);
select throws_ok(format('select public.check_in(%L, 45.519, -73.588, gen_random_uuid())', tests.id('activity')),
  'P0001', 'not_attending', 'only confirmed people check in');

select tests.login(2);
select throws_ok(format('select public.check_in(%L, 45.5300, -73.6000, gen_random_uuid())', tests.id('activity')),
  'P0001', 'too_far', 'more than 150 m away is refused');
select throws_ok(format('select public.check_in(%L, null, null, gen_random_uuid())', tests.id('activity')),
  'P0001', 'location_required', 'a location is needed');
select tests.keep('k', gen_random_uuid());
select is((public.check_in(tests.id('activity'), 45.5195, -73.5885, tests.id('k'))).status,
  'checked_in'::public.attendance_status, 'within 150 m inside the window checks you in');
select is((public.check_in(tests.id('activity'), 45.5195, -73.5885, tests.id('k'))).checked_in_count, 1,
  'a retry returns the first result');
select is((public.check_in(tests.id('activity'), 0, 0, gen_random_uuid())).changed, false,
  'checking in again is a no-op');
select tests.logout();
select is((select checked_in_count from public.activities where id = tests.id('activity')), 1, 'counted once');
select is((select check_in_method from public.attendance where activity_id = tests.id('activity') and user_id = tests.u(2)),
  'location'::public.check_in_method, 'only that the check passed is stored');
select is((select count(*)::integer from information_schema.columns
           where table_schema = 'public' and table_name = 'attendance' and column_name ~ '(lat|lng|location|accuracy)'), 0,
  'attendance has no place to keep a raw location');

-- Window.
update public.activities set check_in_opens_at = now() + interval '5 minutes' where id = tests.id('activity');
select tests.login(1);
select throws_ok(format('select public.check_in(%L, 45.5195, -73.5885, gen_random_uuid())', tests.id('activity')),
  'P0001', 'check_in_not_open', 'before the window opens is refused');
select tests.logout();
update public.activities
   set check_in_opens_at = now() - interval '2 hours', check_in_closes_at = now() - interval '1 minute'
 where id = tests.id('activity');
select tests.login(1);
select throws_ok(format('select public.check_in(%L, 45.5195, -73.5885, gen_random_uuid())', tests.id('activity')),
  'P0001', 'check_in_closed', 'after the window closes is refused');
select tests.logout();
update public.activities
   set check_in_opens_at = now() - interval '10 minutes', check_in_closes_at = ends_at
 where id = tests.id('activity');

-- Host confirms someone.
select tests.login(2);
select throws_ok(format('select public.host_check_in(%L, %L)', tests.id('activity'), tests.u(1)),
  'P0001', 'not_host', 'only the host confirms others');
select tests.login(1);
select is((public.host_check_in(tests.id('activity'), tests.u(1))).status, 'checked_in'::public.attendance_status,
  'the host can confirm attendance');
select tests.logout();
select is((select check_in_method from public.attendance where activity_id = tests.id('activity') and user_id = tests.u(1)),
  'host'::public.check_in_method, 'host confirmation is recorded as such');

-- Location sharing: this game only, ends by itself.
select tests.login(2);
select is((public.share_location(tests.id('activity'), 45.5195, -73.5885)).expires_at,
          (select ends_at + interval '30 minutes' from public.activities where id = tests.id('activity')),
  'sharing ends 30 minutes after the game at the latest');
select is((public.share_location(tests.id('activity'), 45.5196, -73.5886, now() + interval '30 days')).expires_at,
          (select ends_at + interval '30 minutes' from public.activities where id = tests.id('activity')),
  'a later end is capped');
select tests.login(1);
select is((select count(*)::integer from public.location_shares where activity_id = tests.id('activity')), 1,
  'people in the game see the live location');
select tests.login(3);
select is((select count(*)::integer from public.location_shares where activity_id = tests.id('activity')), 0,
  'people outside the game do not');
select throws_ok(format('select public.share_location(%L, 45.5, -73.5)', tests.id('activity')),
  'P0001', 'not_attending', 'only people in the game can share');
select tests.logout();
update public.location_shares set started_at = now() - interval '2 hours', expires_at = now() - interval '1 second'
 where activity_id = tests.id('activity');
select tests.login(1);
select is((select count(*)::integer from public.location_shares where activity_id = tests.id('activity')), 0,
  'an expired share is hidden even before the job runs');
select tests.logout();
select private.tick();
select is((select count(*)::integer from public.location_shares where activity_id = tests.id('activity')), 0,
  'the job deletes expired shares');
select tests.login(2);
select is((public.stop_sharing_location(tests.id('activity'))).sharing, false, 'stop sharing is idempotent');
select tests.logout();

select * from finish();
rollback;
