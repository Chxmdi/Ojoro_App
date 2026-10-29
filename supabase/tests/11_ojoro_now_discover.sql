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

-- STEP 3 · LIQUIDITY: Ojoro Now, further out, Surprise Me / Concierge, Discover search, people to
-- move with, places, home density, Pull Someone In ranking, plan_cards time zone.
select no_plan();

-- Isolate from whatever the local database holds (seed data, other sessions): rolled back at the end.
update public.intent_signals set status = 'withdrawn', withdrawn_at = now() where status = 'active';
update public.plans set status = 'cancelled', cancelled_at = now() where status in ('forming', 'game_on');
update public.activities set status = 'cancelled', cancelled_at = now() where status in ('confirmed', 'live');

insert into public.places (id, slug, name, area, city, lat, lng, sport_ids) values
  ('00000000-0000-4000-9100-000000000002', 'near-court', 'Near Court', 'Plateau', 'Montréal',
   45.5251, -73.5749, '{volleyball,tennis,football}'),
  ('00000000-0000-4000-9100-000000000003', 'far-park', 'Far Park', 'Verdun', 'Montréal',
   45.4612, -73.5687, '{volleyball,football}');

-- A forming football plan at a given place.
create function tests.plan_at(
  p_host integer, p_place uuid, p_starts interval, p_audience public.audience default 'public',
  p_status public.plan_status default 'forming', p_deadline interval default null
) returns uuid language plpgsql security definer as $$
declare
  v uuid;
begin
  insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count)
  values ('football', now() + p_starts, 90, p_place, 8, p_audience, now() + coalesce(p_deadline, p_starts / 2),
          p_status, 'quick', tests.u(p_host), tests.u(p_host), 1)
  returning id into v;
  insert into public.plan_members (plan_id, user_id, via) values (v, tests.u(p_host), 'host');
  return v;
end;
$$;

insert into public.user_sports (user_id, sport_id, level, is_main) values
  (tests.u(1), 'football', 'advanced', true),
  (tests.u(2), 'football', 'advanced', true),
  (tests.u(3), 'football', 'learning', true),
  (tests.u(4), 'football', 'casual', true),
  (tests.u(10), 'football', 'intermediate', true),
  (tests.u(11), 'football', 'intermediate', true);
insert into public.availability_slots (user_id, day_of_week, part) values
  (tests.u(1), 2, 'evening'), (tests.u(2), 2, 'evening'), (tests.u(2), 5, 'morning');

select tests.connect(1, 2);
select tests.keep('soon', tests.make_plan(2, 8, '40 minutes'));          -- Test Pitch, 40 min
select tests.keep('later', tests.make_plan(3, 8, '100 minutes'));        -- Test Pitch, 100 min
select tests.keep('far', tests.plan_at(4, '00000000-0000-4000-9100-000000000003', '40 minutes'));
select tests.keep('mine', tests.make_plan(1, 8, '50 minutes'));
select tests.keep('blocked', tests.make_plan(4, 8, '45 minutes'));
insert into public.plan_members (plan_id, user_id, via) values (tests.id('blocked'), tests.u(5), 'im_down');
update public.plans set member_count = 2 where id = tests.id('blocked');
select tests.login(5);
select public.block_user(tests.u(1));
select tests.logout();
select tests.keep('secret', tests.make_plan(7, 8, '30 minutes', 'invite_only'));
select tests.keep('friends', tests.make_plan(8, 8, '30 minutes', 'friends'));

-- A live game hosted by tests.u(6) at Test Pitch.
insert into public.plans (id, sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                          status, source, created_by, host_id, member_count, locked_at)
values ('00000000-0000-4000-9200-000000000010', 'football', 'Sparring', now() - interval '10 minutes', 90,
        '00000000-0000-4000-9100-000000000001', 2, 'public', now() - interval '1 hour', 'game_on', 'quick',
        tests.u(6), tests.u(6), 2, now() - interval '2 hours');
insert into public.activities (id, plan_id, sport_id, title, starts_at, ends_at, place_id, capacity, host_id,
                               confirmed_count, attendance_rule, check_in_opens_at, check_in_closes_at, status,
                               live_at, after_closes_at)
values ('00000000-0000-4000-9300-000000000010', '00000000-0000-4000-9200-000000000010', 'football', 'Sparring',
        now() - interval '10 minutes', now() + interval '80 minutes', '00000000-0000-4000-9100-000000000001', 2,
        tests.u(6), 2, 'check_in', now() - interval '40 minutes', now() + interval '80 minutes', 'live',
        now() - interval '10 minutes', now() + interval '1 day');

-- 1. Ojoro Now ----------------------------------------------------------------------------------------
select tests.login(1);
create temporary table now_rows on commit drop as select * from public.ojoro_now();
select ok(exists (select 1 from now_rows where plan_id = tests.id('soon') and action = 'join' and kind = 'plan'),
  'a plan starting in 40 minutes nearby is in Ojoro Now, joinable');
select ok((select reason from now_rows where plan_id = tests.id('soon'))
            ~ '^starts in 4\d min · 0\.\d km · 1 person you''ve played with$',
  'with a plain-language reason: time, distance, people you''ve played with');
select is((select played_with_count from now_rows where plan_id = tests.id('soon')), 1, 'and the count behind it');
select ok(not exists (select 1 from now_rows where plan_id = tests.id('later')), 'outside the hour: not now');
select ok(exists (select 1 from public.ojoro_now(120) where plan_id = tests.id('later')), 'a wider window includes it');
select ok(not exists (select 1 from now_rows where plan_id = tests.id('far')), 'outside the radius: not near');
select ok(not exists (select 1 from now_rows where plan_id = tests.id('mine')), 'plans you are in are left out');
select ok(not exists (select 1 from now_rows where plan_id = tests.id('blocked')),
  'a plan with someone who blocked you is left out');
select ok(not exists (select 1 from now_rows where plan_id in (tests.id('secret'), tests.id('friends'))),
  'plans you cannot see are left out');
select is((select action from now_rows where activity_id = '00000000-0000-4000-9300-000000000010'), 'watch',
  'a live game is there to watch');
select is((select reason from now_rows where activity_id = '00000000-0000-4000-9300-000000000010'), 'on now · 0.6 km',
  'live reason');
select tests.logout();
select ok(exists (select 1 from private.analytics_events where name = 'ojoro_now_served' and user_id = tests.u(1)),
  'ojoro_now_served is recorded');

-- 2. A bit further out ---------------------------------------------------------------------------------
select tests.login(1);
select ok(exists (select 1 from public.further_out() where plan_id = tests.id('far') and distance_km > 5 and distance_km <= 10),
  'a plan beyond the radius (up to twice it) is further out, with its distance');
select ok(not exists (select 1 from public.further_out() where plan_id = tests.id('soon')),
  'plans inside the radius are not further out');
select tests.logout();

-- 3. Surprise Me / Concierge --------------------------------------------------------------------------
select tests.login(1);
select is((select plan_id from public.surprise_me()), tests.id('soon'),
  'Surprise Me picks the plan with people you have played with');
select is((select plan_id from public.surprise_me()), (select plan_id from public.surprise_me()), 'deterministic');
select ok((select reason from public.surprise_me()) ~ 'played with', 'with a reason');
select ok(not exists (select 1 from public.concierge_suggest(null, 'football', null, 5) where plan_id = tests.id('later')),
  'a plan far from your level is not suggested (levels never shown)');
select ok(not exists (select 1 from public.concierge_suggest(null, 'football', null, 5)
                      where plan_id in (tests.id('blocked'), tests.id('far'), tests.id('mine'), tests.id('secret'))),
  'never blocked, far, your own or hidden plans');
select ok((select reasons[1] from public.concierge_suggest('I have 90 minutes and want to play football')) = 'it fits your 90 minutes',
  'the Concierge reads minutes from the text and says why');
select is((select count(*)::integer from public.concierge_suggest('I only have 15 minutes')), 0,
  'nothing fits: no rows (offer Down For)');
select tests.logout();

-- 4. Discover search --------------------------------------------------------------------------------------
select tests.login(1);
select ok(exists (select 1 from public.discover_search('test pitch') where kind = 'plan' and id = tests.id('soon')),
  'search finds plans by place name');
select ok(exists (select 1 from public.discover_search('plateau') where kind = 'place' and title = 'Near Court'),
  'search finds places by area');
select ok(exists (select 1 from public.discover_search('montreal') where kind = 'place'), 'accents are folded');
select ok(not exists (select 1 from public.discover_search(null) where id in (tests.id('secret'), tests.id('friends'))),
  'invite-only and friends plans stay hidden from people who cannot see them');
select ok(not exists (select 1 from public.discover_search('football') where id = tests.id('blocked')),
  'a plan with someone who blocked you stays hidden');
select ok(exists (select 1 from public.discover_search('tester 2') where kind = 'person' and id = tests.u(2)),
  'people you have played with are searchable by name');
select ok(not exists (select 1 from public.discover_search('tester 3') where kind = 'person'),
  'strangers are not searchable by name');
select ok(not exists (select 1 from public.discover_search('tester 5') where kind = 'person'), 'nor blocked people');
select ok(not exists (select 1 from public.discover_search(null, null, 'tomorrow') where id = tests.id('soon')),
  'the when filter applies');
select throws_ok($$select * from public.discover_search('x', null, 'someday')$$, 'P0001', 'invalid_argument',
  'unknown when');
select tests.logout();

-- 5. People to move with ----------------------------------------------------------------------------------
insert into public.pull_me_in (user_id, sport_id, scope) values
  (tests.u(10), 'football', 'nearby'), (tests.u(11), 'football', 'nearby');
update public.privacy_settings set sports_visibility = 'only_me' where user_id = tests.u(11);
select tests.connect(1, 12);
select tests.login(12);
select public.block_user(tests.u(1));
select tests.logout();
select tests.login(1);
create temporary table people_rows on commit drop as select * from public.people_to_move_with(50);
select ok(exists (select 1 from people_rows where user_id = tests.u(2) and played_together and games_with_me = 1),
  'people you have played with come first, with games together');
select is((select array[overlap_day_of_week::text, overlap_part::text] from people_rows where user_id = tests.u(2)),
  array['2', 'evening'], 'a shared usual free time when their setting includes you');
select is((select reason from people_rows where user_id = tests.u(2)),
  'You''ve played 1 game together and you''re both usually free Tuesday evenings.', 'reason from facts');
select is((select sessions from people_rows where user_id = tests.u(2)), 1, 'sessions when their history is visible');
select ok(exists (select 1 from people_rows where user_id = tests.u(10) and not played_together
                  and shared_sports = array['Football']),
  'a nearby person with Pull Me In on for a sport you play appears');
select ok(not exists (select 1 from people_rows where user_id = tests.u(3)), 'strangers without Pull Me In do not');
select ok(not exists (select 1 from people_rows where user_id = tests.u(11)),
  'nor people who keep their sports to themselves');
select ok(not exists (select 1 from people_rows where user_id in (tests.u(12), tests.u(5))), 'nor blocked people');
select tests.logout();
update public.privacy_settings set availability_visibility = 'only_me', history_visibility = 'only_me'
 where user_id = tests.u(2);
select tests.login(1);
select is((select overlap_day_of_week from public.people_to_move_with(50) where user_id = tests.u(2)), null,
  'availability hidden: no overlap');
select is((select sessions from public.people_to_move_with(50) where user_id = tests.u(2)), null,
  'history hidden: no sessions');
select tests.logout();

-- 6. Places nearby: tonight counts ignore cancelled and expired plans ----------------------------------------
select tests.plan_at(3, '00000000-0000-4000-9100-000000000002', '30 minutes');
select tests.plan_at(3, '00000000-0000-4000-9100-000000000002', '30 minutes', 'public', 'cancelled');
select tests.plan_at(3, '00000000-0000-4000-9100-000000000002', '30 minutes', 'public', 'forming', '-1 minute');
select tests.plan_at(3, '00000000-0000-4000-9100-000000000002', '30 minutes', 'public', 'expired', '-1 minute');
select tests.plan_at(7, '00000000-0000-4000-9100-000000000002', '30 minutes', 'invite_only');
select tests.login(1);
select is((select plans_tonight from public.places_nearby() where place_id = '00000000-0000-4000-9100-000000000002'), 1,
  'only the forming plan counts tonight: not cancelled, not expired, not hidden');
select ok(not exists (select 1 from public.places_nearby() where place_id = '00000000-0000-4000-9100-000000000003'),
  'places outside the radius are not near');
select ok(exists (select 1 from public.sports_nearby() where sport_id = 'football' and plan_count > 0),
  'filter chips list sports with something on');
select tests.logout();

-- 7. Home density -----------------------------------------------------------------------------------------
select tests.login(1);
select is((select has_area and not low_density and plans_near >= 1 from public.home_density()), true,
  'a busy area is not low density');
select tests.logout();
update public.profile_private set area_lat = 46.81, area_lng = -71.21 where user_id = tests.u(9);
select tests.login(9);
select is((select array[plans_near, games_near]::text || low_density::text from public.home_density()),
  '{0,0}true', 'a quiet area is low density, honestly');
select is((select count(*)::integer from public.ojoro_now()), 0, 'and Ojoro Now is empty there');
select tests.logout();

-- 8. Pull Someone In ranking -------------------------------------------------------------------------------
select tests.join(1, tests.id('later'));
select tests.connect(1, 3);
select tests.connect(10, 2);
insert into public.pull_me_in (user_id, sport_id, scope) values (tests.u(9), 'football', 'nearby');
update public.profile_private set area_lat = 45.52, area_lng = -73.58 where user_id = tests.u(9);
select tests.login(1);
create temporary table cand on commit drop as
  select row_number() over () as rn, * from public.pull_in_candidates(tests.id('later'));
select is((select tier from cand where user_id = tests.u(2)), 'played_together', 'people you have played with: first tier');
select is((select tier from cand where user_id = tests.u(10)), 'friend_of_friend',
  'Pull Me In and plays with someone you play with: friend of a friend');
select is((select tier from cand where user_id = tests.u(9)), 'nearby', 'Pull Me In nearby only: nearby');
select ok((select max(rn) from cand where tier = 'played_together') < (select min(rn) from cand where tier = 'friend_of_friend')
      and (select max(rn) from cand where tier = 'friend_of_friend') < (select min(rn) from cand where tier = 'nearby'),
  'ranked by tier (PRD §9.5)');
select is((select reason from cand where user_id = tests.u(10)), 'Plays with people you''ve played with · Pull Me In is on for football · 1 km away',
  'a reason per person');
select is((select distance_km from cand where user_id = tests.u(9)), 1, 'distance in whole kilometres, at least 1');
select is((select shared_title from cand where user_id = tests.u(2)), 'Football', 'the game you shared');
select tests.logout();

-- 9. plan_cards carries the place time zone ------------------------------------------------------------------
select tests.login(1);
select is((select place_time_zone from public.plan_cards where id = tests.id('soon')), 'America/Toronto',
  'plan_cards.place_time_zone');
select tests.logout();

select ok(not has_function_privilege('anon', 'public.ojoro_now(integer,text)', 'execute'), 'anon cannot call ojoro_now');
select ok(not has_function_privilege('anon', 'public.people_to_move_with(integer)', 'execute'), 'nor people_to_move_with');

select * from finish();
rollback;
