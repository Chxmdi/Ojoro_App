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

-- Step 7 BE-PASSPORT helpers. A complete Challenge between tests.u(a) (side a) and tests.u(b): a's and
-- b's values in seconds, verified by both. Returns the event id.
create function tests.result(a integer, b integer, p_a numeric, p_b numeric) returns uuid language plpgsql as $$
declare
  v uuid := tests.event(a, b);
begin
  perform tests.go_live(v, a, b);
  -- Each result a minute after the one before (the stamp's time is when it went live).
  perform set_config('role', 'postgres', true);
  update public.challenge_events
     set live_at = now() - interval '1 day' + make_interval(mins => (select count(*)::integer from public.challenge_results))
   where id = v;
  perform tests.finish(v, a, b, p_a, p_b);
  return v;
end;
$$;

-- A finished game for tests.u(n) at Test Pitch (or p_place), p_ago before now, with its stamp.
create function tests.stamp(n integer, p_ago interval, p_sport text default 'football',
                            p_place uuid default '00000000-0000-4000-9100-000000000001')
returns uuid language plpgsql security definer as $$
declare
  v_plan uuid;
  v_act uuid;
begin
  insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count)
  values (p_sport, now() - p_ago, 60, p_place, 2, 'public', now() - p_ago - interval '1 hour', 'game_on', 'quick',
          tests.u(n), tests.u(n), 1)
  returning id into v_plan;
  insert into public.plan_members (plan_id, user_id, via) values (v_plan, tests.u(n), 'host');
  insert into public.activities (plan_id, sport_id, starts_at, ends_at, place_id, capacity, host_id, confirmed_count,
                                 checked_in_count, attendance_rule, check_in_opens_at, check_in_closes_at, status,
                                 after_closes_at)
  values (v_plan, p_sport, now() - p_ago, now() - p_ago + interval '60 minutes', p_place, 2, tests.u(n), 1, 1,
          'check_in', now() - p_ago - interval '30 minutes', now() - p_ago + interval '60 minutes', 'complete',
          now() - p_ago + interval '1 day')
  returning id into v_act;
  insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
  values (v_act, tests.u(n), 'checked_in', now() - p_ago - interval '1 day', now() - p_ago, 'location');
  insert into public.passport_entries (user_id, activity_id, sport_id, place_id, occurred_at, minutes, sport_game_number)
  values (tests.u(n), v_act, p_sport, p_place, now() - p_ago, 60, 1);
  return v_act;
end;
$$;

-- Step 7 BE-PASSPORT: Passport reads (detail, stamps, milestones, achievements, reputation) and privacy.
select no_plan();

insert into public.places (id, slug, name, area, city, lat, lng, sport_ids)
values ('00000000-0000-4000-9100-000000000002', 'test-gym', 'Test Gym', 'Mile End', 'Montréal', 45.523, -73.6,
        '{boxing}');

-- u1: six football games at Test Pitch (the 5th is a milestone), one boxing session at Test Gym, two
-- 5K Challenges against u2 (one personal best each time).
select tests.stamp(1, make_interval(days => 70 - 10 * n)) from generate_series(1, 6) n;
select tests.stamp(1, '5 days', 'boxing', '00000000-0000-4000-9100-000000000002');
select tests.keep('r1', tests.result(1, 2, 1500, 1450));
select tests.keep('r2', tests.result(1, 2, 1480, 1460));
-- u1 and u3 played together; u4 is a stranger; u5 blocks u1.
select tests.connect(1, 3);
select tests.block(5, 1);

select tests.login(1);
select is((public.passport_view(tests.u(1)) -> 'totals' ->> 'stamps')::integer, 10, '7 games + connect game + 2 Challenges');
select is((public.passport_view(tests.u(1)) -> 'totals' ->> 'challenges')::integer, 2, 'two Challenges');
select is((public.passport_view(tests.u(1)) -> 'totals' ->> 'places')::integer, 2, 'two places');
select is((public.passport_view(tests.u(1)) -> 'totals' ->> 'sports')::integer, 3, 'football, boxing, running');
select is((public.passport_view(tests.u(1)) -> 'totals' ->> 'people_moved_with')::integer, 1, 'moved with u3');
select is((public.passport_view(tests.u(1)) -> 'totals' ->> 'personal_bests')::integer, 2, 'two bests set');
select is(public.passport_view(tests.u(1)) ->> 'history_visibility', 'friends', 'own setting shown');
select is(public.passport_view(tests.u(1)) ->> 'goals_visibility', 'friends', 'goals default friends');
select is((public.passport_view(tests.u(1)) -> 'places' -> 0 ->> 'name'), 'Test Pitch', 'most stamps first');
select is((public.passport_view(tests.u(1)) -> 'places' -> 0 ->> 'games')::integer, 7, 'games at Test Pitch');
select is((select count(*)::integer from jsonb_array_elements(public.passport_view(tests.u(1)) -> 'sports')), 3, 'by sport');
select ok((select count(*) from jsonb_array_elements(public.passport_view(tests.u(1)) -> 'months')) >= 2, 'by month');
select is((public.passport_view(tests.u(1)) -> 'personal_bests' -> 0 ->> 'value')::numeric, 1480.00, 'current 5K best');
select is((public.passport_view(tests.u(1)) -> 'personal_bests' -> 0 ->> 'first_value')::numeric, 1500.00, 'where it started');
select is((public.passport_view(tests.u(1)) -> 'personal_bests' -> 0 ->> 'improvements')::integer, 1, 'beaten once');
select is((select string_agg(m ->> 'milestone', ',' order by (m ->> 'occurred_at')::timestamptz)
           from jsonb_array_elements(public.passport_view(tests.u(1)) -> 'milestones') m),
  'first_stamp,place_games,first_in_sport,first_in_discipline,personal_best', 'firsts and milestones, in order');
select is((select (m ->> 'count')::integer from jsonb_array_elements(public.passport_view(tests.u(1)) -> 'milestones') m
           where m ->> 'milestone' = 'place_games'), 5, '5 games at Test Pitch');

-- Stamps list and its filters.
select is((select count(*)::integer from public.passport_stamps(tests.u(1))), 10, 'all stamps');
select is((select count(*)::integer from public.passport_stamps(tests.u(1), p_sport_id => 'boxing')), 1, 'by sport');
select is((select count(*)::integer from public.passport_stamps(tests.u(1), p_place_id => '00000000-0000-4000-9100-000000000002')),
  1, 'by place');
select is((select count(*)::integer from public.passport_stamps(tests.u(1), p_milestones_only => true)), 5, 'milestones only');
select is((select count(*)::integer from public.passport_stamps(tests.u(1),
             p_month => to_char(now() at time zone 'America/Toronto', 'YYYY-MM'))),
  (select count(*)::integer from public.passport_entries where user_id = tests.u(1)
     and to_char(occurred_at at time zone 'America/Toronto', 'YYYY-MM') = to_char(now() at time zone 'America/Toronto', 'YYYY-MM')),
  'by month');
select is((select count(*)::integer from public.passport_stamps(tests.u(1), p_limit => 3)), 3, 'a page');
select is((select count(*)::integer from public.passport_stamps(tests.u(1),
             p_before => (select min(occurred_at) from public.passport_stamps(tests.u(1), p_limit => 3)))),
  7, 'the rest');
select is((select stamp_number || '|' || place_game_number from public.passport_stamps(tests.u(1))
           where milestone = 'place_games'), '5|5', 'ordinals from history');
select is((select kind::text || '|' || title || '|' || outcome || '|' || personal_best::text || '|' || (challenge_event_id is not null)::text
           from public.passport_stamps(tests.u(1)) where challenge_event_id = tests.id('r2')),
  'challenge|5K|lost|true|true', 'a Challenge stamp');
select throws_ok(format($$select * from public.passport_stamps(%L, p_month => '2026-13')$$, tests.u(1)),
  'P0001', 'invalid_argument', 'month is YYYY-MM');

-- One stamp by id, the stamp for a game / Challenge, and ids on milestones.
select is((select kind::text || '|' || title || '|' || milestone from public.passport_entry(
             (select entry_id from public.passport_stamps(tests.u(1)) where challenge_event_id = tests.id('r2')))),
  'challenge|5K|personal_best', 'one stamp by id');
select is((select count(*)::integer from public.passport_entry('00000000-0000-4000-9000-000000000999')), 0, 'unknown stamp');
select is((select challenge_outcome from public.passport_entries where id =
             (select entry_id from public.passport_entry_for(p_event_id => tests.id('r2')))), 'lost', 'my stamp for a Challenge');
select is((select place_game_number from public.passport_entry_for(p_activity_id =>
             (select activity_id from public.passport_stamps(tests.u(1)) where milestone = 'place_games'))), 5,
  'my stamp for a game');
select is((select count(*)::integer from public.passport_entry_for(p_activity_id => tests.id('r1'))), 0,
  'no stamp: no row');
select throws_ok($$select * from public.passport_entry_for()$$, 'P0001', 'invalid_argument', 'a game or a Challenge');
select is((select (m ->> 'challenge_event_id')::uuid from jsonb_array_elements(public.passport_view(tests.u(1)) -> 'milestones') m
           where m ->> 'milestone' = 'personal_best'), tests.id('r2'), 'milestones link to the Result');
select isnt((select m ->> 'activity_id' from jsonb_array_elements(public.passport_view(tests.u(1)) -> 'milestones') m
             where m ->> 'milestone' = 'place_games'), null, 'and to the Recap');
select tests.login(2);
select is((select challenge_outcome from public.passport_entries where id =
             (select entry_id from public.passport_entry_for(p_event_id => tests.id('r2')))), 'won', 'u2 gets their own');
select tests.login(3);
select is((select count(*)::integer from public.passport_entry_for(p_event_id => tests.id('r2'), p_user_id => tests.u(1))),
  1, 'someone they played with: visible');
select tests.login(4);
select is((select count(*)::integer from public.passport_entry_for(p_event_id => tests.id('r2'), p_user_id => tests.u(1))),
  0, 'a stranger: nothing');
select is((select count(*)::integer from public.passport_entry(
             (select id from public.passport_entries where false))), 0, 'null id: nothing');
select tests.logout();
select throws_ok(format($$select * from public.passport_entry(%L)$$,
                        (select id from public.passport_entries where user_id = tests.u(1) limit 1)),
  'P0001', 'not_authenticated', 'signed out: refused');
select tests.login(5);
select is((select count(*)::integer from public.passport_entry_for(p_event_id => tests.id('r2'), p_user_id => tests.u(1))),
  0, 'blocked: nothing');
select tests.login(1);

-- Achievements: reached tiers with when, plus the next tier of each ladder for yourself.
select is((select achieved_at from public.passport_achievements(tests.u(1)) where ladder = 'sessions' and threshold = 1),
  (select min(occurred_at) from public.passport_entries where user_id = tests.u(1)), 'first stamp, when it happened');
select is((select current || '|' || achieved::text from public.passport_achievements(tests.u(1))
           where ladder = 'sessions' and threshold = 10), '10|true', '10 stamps');
select is((select current || '|' || achieved::text from public.passport_achievements(tests.u(1))
           where ladder = 'sessions' and threshold = 25), '10|false', 'next: 25');
select is((select count(*)::integer from public.passport_achievements(tests.u(1)) where ladder = 'sessions' and threshold = 50),
  0, 'only the next tier');
select is((select achieved from public.passport_achievements(tests.u(1)) where ladder = 'sports' and threshold = 3), true, '3 sports');
select is((select achieved from public.passport_achievements(tests.u(1)) where ladder = 'personal_bests' and threshold = 1),
  true, 'first PB');
select is((select achieved from public.passport_achievements(tests.u(1)) where ladder = 'hosted' and threshold = 1),
  true, 'hosted a game that ended');
select is((select current || '|' || achieved::text from public.passport_achievements(tests.u(1))
           where ladder = 'regular'), '7|false', 'regular: 7 of 10 at one place');
select tests.logout();

-- Someone they played with (history: friends).
select tests.login(3);
select is((public.passport_view(tests.u(1)) ->> 'visible')::boolean, true, 'visible to u3');
select is(public.passport_view(tests.u(1)) ->> 'history_visibility', null, 'settings are private');
select is((select count(*)::integer from public.passport_achievements(tests.u(1)) where not achieved), 0,
  'no locked tiers for others');
select ok((select count(*) from public.passport_achievements(tests.u(1))) > 0, 'reached tiers are visible');
select tests.logout();

-- A stranger.
select tests.login(4);
select is((public.passport_view(tests.u(1)) ->> 'visible')::boolean, false, 'not visible to a stranger');
select is(public.passport_view(tests.u(1)) -> 'totals', 'null'::jsonb, 'no totals');
select is(jsonb_array_length(public.passport_view(tests.u(1)) -> 'milestones'), 0, 'no milestones');
select is(jsonb_array_length(public.passport_view(tests.u(1)) -> 'personal_bests'), 0, 'no bests');
select is((select count(*)::integer from public.passport_stamps(tests.u(1))), 0, 'no stamps');
select is((select count(*)::integer from public.passport_achievements(tests.u(1))), 0, 'no achievements');
select is(public.passport_view(tests.u(1)) ->> 'display_name', 'Tester 1', 'the name still shows');
select tests.logout();

update public.privacy_settings set history_visibility = 'everyone' where user_id = tests.u(1);
select tests.login(4);
select is((public.passport_view(tests.u(1)) ->> 'visible')::boolean, true, 'everyone: visible');
select is((select count(*)::integer from public.passport_stamps(tests.u(1))), 10, 'everyone: stamps');
select tests.logout();

-- Blocked either way: nothing at all.
select tests.login(5);
select is(public.passport_view(tests.u(1)), null, 'blocked: no Passport');
select is((select count(*)::integer from public.passport_stamps(tests.u(1))), 0, 'blocked: no stamps');
select is(public.passport_reputation(tests.u(1)), null, 'blocked: no reputation');
select tests.login(1);
select is(public.passport_view(tests.u(5)), null, 'the blocked person sees nothing of the blocker');
select is(public.passport_view('00000000-0000-4000-9000-000000000999'), null, 'no such person: null');
select tests.logout();

-- Reputation: only past 5 confirmations; building kinds for yourself only.
insert into public.reputation_signals (giver_id, subject_id, activity_id, kind)
select tests.u(n), tests.u(1), (select activity_id from public.passport_entries where user_id = tests.u(1)
                                  and kind = 'game' order by occurred_at limit 1), 'shows_up'
from generate_series(6, 11) n;
insert into public.reputation_signals (giver_id, subject_id, activity_id, kind)
select tests.u(n), tests.u(1), (select activity_id from public.passport_entries where user_id = tests.u(1)
                                  and kind = 'game' order by occurred_at limit 1), 'great_host'
from generate_series(6, 8) n;
select tests.login(1);
select is(public.passport_reputation(tests.u(1)) -> 'signals', '[{"kind": "shows_up", "confirmations": 6}]'::jsonb,
  'only past the threshold');
select is(public.passport_reputation(tests.u(1)) -> 'building', '["great_host"]'::jsonb, 'yours: on the way');
select is(public.passport_reputation(tests.u(1)) -> 'show_up', '{"showed_up": 8, "committed": 8}'::jsonb,
  'your show-up record');
select is((public.passport_reputation(tests.u(1)) ->> 'hosted')::integer, 8, 'games hosted');
select tests.login(3);
select is(public.passport_reputation(tests.u(1)) -> 'building', '[]'::jsonb, 'others: no building kinds');
select is(public.passport_reputation(tests.u(1)) -> 'show_up', '{"showed_up": 8, "committed": 8}'::jsonb,
  'visible history and 5+ games: the record shows');
select tests.login(1);
select is(public.passport_reputation(tests.u(3)) -> 'show_up', 'null'::jsonb, 'not shown on 1 game');
select tests.logout();
update public.privacy_settings set history_visibility = 'only_me' where user_id = tests.u(1);
select tests.login(3);
select is(public.passport_reputation(tests.u(1)) -> 'show_up', 'null'::jsonb, 'history hidden: no record');
select is(jsonb_array_length(public.passport_reputation(tests.u(1)) -> 'signals'), 1, 'signals still show');
select tests.logout();

select * from finish();
rollback;
