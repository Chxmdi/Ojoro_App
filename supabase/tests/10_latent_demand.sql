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

-- STEP 3 · LIQUIDITY: areas without location, latent demand (counts only, k = 3), Create From Demand.
select no_plan();

-- Isolate from whatever the local database holds (seed data, other sessions): rolled back at the end.
update public.intent_signals set status = 'withdrawn', withdrawn_at = now() where status = 'active';
update public.plans set status = 'cancelled', cancelled_at = now() where status in ('forming', 'game_on');
update public.activities set status = 'cancelled', cancelled_at = now() where status in ('confirmed', 'live');

insert into public.places (id, slug, name, area, city, lat, lng, sport_ids) values
  ('00000000-0000-4000-9100-000000000002', 'test-court', 'Test Court', 'Plateau', 'Montréal',
   45.5251, -73.5749, '{volleyball}'),
  ('00000000-0000-4000-9100-000000000003', 'far-park', 'Far Park', 'Verdun', 'Montréal',
   45.4612, -73.5687, '{volleyball,football}');

-- An unmatched Down For for tests.u(n), inserted directly (create_down_for would match them).
create function tests.signal(
  n integer, p_sport text default 'volleyball', p_from interval default '2 hours',
  p_to interval default '6 hours', p_audience public.audience default 'public'
) returns uuid language plpgsql security definer as $$
declare
  v uuid;
begin
  insert into public.intent_signals (user_id, sport_id, window_start, window_end, expires_at, audience,
                                     radius_km, area_lat, area_lng)
  select tests.u(n), p_sport, now() + p_from, now() + p_to, now() + p_to, p_audience,
         pp.discovery_radius_km, pp.area_lat, pp.area_lng
  from public.profile_private pp where pp.user_id = tests.u(n)
  returning id into v;
  return v;
end;
$$;

-- The caller's biggest latent count for a sport (buckets can split across parts of the day).
create function tests.demand(n integer, p_sport text default 'volleyball') returns integer language plpgsql as $$
declare
  v integer;
begin
  perform tests.login(n);
  select max(people_count) into v from public.latent_demand(p_sport);
  perform tests.logout();
  return coalesce(v, 0);
end;
$$;

-- 1. Areas ---------------------------------------------------------------------------------------
select tests.login(11);
select ok(exists (select 1 from public.areas_list() where label = 'Verdun, Montréal' and lat = 45.46 and lng = -73.57),
  'areas are neighbourhoods of public places with a centroid rounded to 0.01°');
select ok(not exists (select 1 from public.areas_list() where scale(lat) > 2 or scale(lng) > 2),
  'no area point is finer than 0.01°');
select is((public.set_area('verdun, montréal', 3)).area, 'Verdun, Montréal', 'set_area takes the label, any case');
select tests.logout();
select is((select array[area_lat, area_lng]::text from public.profile_private where user_id = tests.u(11)),
  '{45.46,-73.57}', 'set_area stores the neighbourhood centroid');
select ok((select scale(area_lat) <= 2 and scale(area_lng) <= 2 from public.profile_private where user_id = tests.u(11)),
  'the stored point is never finer than 0.01°');
select is((select area from public.profiles where id = tests.u(11)), 'Verdun, Montréal', 'the label goes on the profile');
select is((select discovery_radius_km from public.profile_private where user_id = tests.u(11)), 3, 'and the radius');
select tests.login(11);
select throws_ok($$select public.set_area('Atlantis')$$, 'P0001', 'area_unknown', 'unknown areas are refused');
select throws_ok($$select public.set_area('Verdun', 99)$$, 'P0001', 'radius_invalid', 'the radius is checked');
select is((public.set_area('Verdun')).discovery_radius_km, 3, 'a unique neighbourhood name works; the radius is kept');
select tests.logout();
select ok(not has_function_privilege('anon', 'public.set_area(text,integer)', 'execute'), 'anon cannot set an area');
select ok(not has_function_privilege('anon', 'public.latent_demand(text)', 'execute'), 'anon cannot read latent demand');
select ok(not has_function_privilege('anon', 'public.create_from_demand(text,timestamptz,timestamptz,uuid)', 'execute'),
  'anon cannot create from demand');

-- 2. Latent demand -------------------------------------------------------------------------------
select ok(pg_get_function_result('public.latent_demand(text)'::regprocedure)
            !~ '\m(user_id|signal_id|display_name|avatar_path|handle|area_lat|area_lng|lat|lng|place_id|place_name|radius_km)\M',
  'latent demand has no column that could identify or locate anyone');

select tests.keep('s2', tests.signal(2));
select tests.keep('s3', tests.signal(3));
select is(tests.demand(1), 0, 'two people are below k: nothing shows');
select tests.login(1);
select is((select count(*)::integer from public.latent_demand()), 0, 'not even a row with a small count');
select tests.logout();
select tests.keep('s4', tests.signal(4));
select is(tests.demand(1), 3, 'three people near you: the count shows');
select tests.login(1);
select ok((select bool_and(sport_id = 'volleyball' and sport_name = 'Volleyball' and suggested_start >= window_start
                           and suggested_start < window_end and suggested_start >= now() + interval '45 minutes')
           from public.latent_demand('volleyball')),
  'each bucket has the sport, a window and a start time about an hour out or later');
select tests.logout();

select tests.keep('s5', tests.signal(5));
select is(tests.demand(1), 4, 'a fourth person counts');
select is(tests.demand(5), 3, 'your own signal never counts for you');
select tests.signal(6, 'volleyball', '2 hours', '6 hours', 'friends');
select is(tests.demand(1), 4, 'a friends-only signal from someone you have not played with does not count');
select tests.signal(7, 'tennis');
select tests.signal(8, 'tennis');
select tests.login(1);
select is((select count(*)::integer from public.latent_demand('tennis')), 0, 'tennis with two people stays hidden');
select tests.logout();

-- Distance: someone in Verdun (6.5 km away, 3 km radius) neither counts nor sees Plateau demand.
select tests.signal(11);
select is(tests.demand(1), 4, 'signals outside the radius do not count');
select is(tests.demand(11), 0, 'and far demand does not show');

-- Blocks hide in both directions.
select tests.login(2);
select public.block_user(tests.u(1));
select tests.logout();
select is(tests.demand(1), 3, 'a person who blocked you is not counted');

-- An open plan you could join in that window replaces the demand.
insert into public.plans (id, sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                          source, created_by, host_id, member_count)
values ('00000000-0000-4000-9200-000000000001', 'volleyball', now() + interval '3 hours', 90,
        '00000000-0000-4000-9100-000000000002', 8, 'public', now() + interval '2 hours', 'quick',
        tests.u(9), tests.u(9), 1);
insert into public.plan_members (plan_id, user_id, via) values ('00000000-0000-4000-9200-000000000001', tests.u(9), 'host');
select tests.login(1);
select ok(not exists (select 1 from public.latent_demand('volleyball')
                      where now() + interval '3 hours' >= window_start and now() + interval '3 hours' < window_end),
  'a bucket with an open plan is not latent demand');
select tests.logout();
update public.plans set status = 'cancelled', cancelled_at = now() where id = '00000000-0000-4000-9200-000000000001';
select is(tests.demand(1), 3, 'a cancelled plan does not hide demand');

-- 3. Create From Demand ------------------------------------------------------------------------------
select tests.login(1);
select tests.keep('k', gen_random_uuid());
create temporary table demand_row on commit drop as
  select * from public.latent_demand('volleyball') order by people_count desc limit 1;
select tests.keep('plan', (public.create_from_demand('volleyball',
  (select suggested_start from demand_row), (select window_end from demand_row), tests.id('k'))).plan_id);
select isnt(tests.id('plan'), null, 'MAKE IT HAPPEN forms a plan');
select is((public.create_from_demand('volleyball', (select suggested_start from demand_row),
                                      (select window_end from demand_row), tests.id('k'))).plan_id,
  tests.id('plan'), 'a retry with the same key returns the same plan');
select is((public.create_from_demand('volleyball', (select suggested_start from demand_row),
                                      (select window_end from demand_row), gen_random_uuid())).plan_id,
  tests.id('plan'), 'a second tap with a new key joins the same plan instead of forming another');
select tests.logout();

select is((select host_id from public.plans where id = tests.id('plan')), tests.u(1), 'the caller hosts');
select is((select status from public.plans where id = tests.id('plan')), 'forming'::public.plan_status, 'it is forming');
select is((select source from public.plans where id = tests.id('plan')), 'down_for'::public.plan_source,
  'formed by Down For matching, like create_down_for');
select is((select member_count from public.plans where id = tests.id('plan')), 4,
  'the caller and the three compatible signals are in');
select is((select array_agg(user_id order by user_id)::text from public.plan_members where plan_id = tests.id('plan')),
  array[tests.u(1), tests.u(3), tests.u(4), tests.u(5)]::text, 'the blocked person is left out');
select ok((select bool_and(via = 'down_for') from public.plan_members where plan_id = tests.id('plan')),
  'everyone matched is a member via down_for');
select is((select count(*)::integer from public.intent_signals
           where id in (tests.id('s3'), tests.id('s4'), tests.id('s5')) and status = 'matched'
             and matched_plan_id = tests.id('plan')), 3, 'their signals are matched to the plan');
select is((select status from public.intent_signals where id = tests.id('s2')), 'active'::public.signal_status,
  'the blocked person''s signal stays active');
select is((select count(*)::integer from public.plans where sport_id = 'volleyball' and created_by = tests.u(1)), 1,
  'exactly one plan');
select is(tests.demand(9), 0, 'the demand is spoken for (one person left is below k)');
select ok(exists (select 1 from private.analytics_events where name = 'demand_plan_created' and user_id = tests.u(1)),
  'demand_plan_created is recorded');

-- Errors.
select tests.login(7);
select throws_ok(format('select public.create_from_demand(%L, now() + interval ''1 hour'', now() + interval ''5 hours'', gen_random_uuid())', 'cycling'),
  'P0001', 'demand_unavailable', 'nobody to match: demand_unavailable');
select tests.logout();
select is((select count(*)::integer from public.intent_signals where user_id = tests.u(7) and sport_id = 'cycling'), 0,
  'and nothing is kept');
select tests.login(7);
select throws_ok($$select public.create_from_demand('volleyball', now() + interval '1 hour', now() + interval '5 hours', null)$$,
  'P0001', 'idempotency_key_required', 'a key is required');
select throws_ok($$select public.create_from_demand('volleyball', now() + interval '5 hours', now() + interval '1 hour', gen_random_uuid())$$,
  'P0001', 'window_invalid', 'the window is checked');
select throws_ok($$select public.create_from_demand('curling', now() + interval '1 hour', now() + interval '5 hours', gen_random_uuid())$$,
  'P0001', 'sport_unknown', 'the sport is checked');
select tests.logout();
update public.profile_private set area_lat = null, area_lng = null where user_id = tests.u(12);
select tests.login(12);
select throws_ok($$select public.create_from_demand('volleyball', now() + interval '1 hour', now() + interval '5 hours', gen_random_uuid())$$,
  'P0001', 'area_required', 'demand needs an area');
select tests.logout();
insert into public.plans (sport_id, starts_at, duration_minutes, capacity, audience, deadline_at, status, source,
                          created_by, host_id, member_count)
select 'running', now() + interval '1 day', 60, 6, 'public', now() + interval '20 hours', 'cancelled', 'down_for',
       tests.u(8), tests.u(8), 0
from generate_series(1, 5);
select tests.login(8);
select throws_ok($$select public.create_from_demand('volleyball', now() + interval '1 hour', now() + interval '5 hours', gen_random_uuid())$$,
  'P0001', 'demand_rate_limited', 'five formed plans a day at most');
select tests.logout();

select * from finish();
rollback;
