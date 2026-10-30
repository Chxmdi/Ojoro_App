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

-- Step 7 BE-PASSPORT: goals. One active goal; set / change / clear; progress from the Passport;
-- idempotent; visibility on its own setting.
select no_plan();

select tests.connect(1, 3);
select tests.block(5, 1);

-- Validation.
select tests.login(1);
select throws_ok($$select public.set_goal(null, 10, gen_random_uuid())$$, 'P0001', 'goal_invalid', 'kind needed');
select throws_ok($$select public.set_goal('personal_best', 1320, gen_random_uuid(), null, '5K', 'time')$$,
  'P0001', 'goal_invalid', 'personal best needs a sport');
select throws_ok($$select public.set_goal('personal_best', 1320, gen_random_uuid(), 'running', ' ', 'time')$$,
  'P0001', 'goal_invalid', 'and a discipline');
select throws_ok($$select public.set_goal('personal_best', 1320, gen_random_uuid(), 'running', '5K', 'score')$$,
  'P0001', 'goal_invalid', 'time or distance only');
select throws_ok($$select public.set_goal('personal_best', 30, gen_random_uuid(), 'running', '5K', 'time')$$,
  'P0001', 'goal_invalid', 'a time of at least a minute');
select throws_ok($$select public.set_goal('personal_best', 1320.5, gen_random_uuid(), 'running', '5K', 'time')$$,
  'P0001', 'goal_invalid', 'whole seconds');
select throws_ok($$select public.set_goal('personal_best', 2000, gen_random_uuid(), 'running', '5K', 'distance')$$,
  'P0001', 'goal_invalid', 'distance up to 1000');
select throws_ok($$select public.set_goal('personal_best', 1320, gen_random_uuid(), 'quidditch', '5K', 'time')$$,
  'P0001', 'sport_unknown', 'a known sport');
select throws_ok($$select public.set_goal('sessions', 0, gen_random_uuid())$$, 'P0001', 'goal_invalid', 'at least one');
select throws_ok($$select public.set_goal('sessions', 501, gen_random_uuid())$$, 'P0001', 'goal_invalid', 'at most 500');
select throws_ok($$select public.set_goal('sessions', 2.5, gen_random_uuid())$$, 'P0001', 'goal_invalid', 'whole sessions');
select throws_ok($$select public.set_goal('sessions', 5, gen_random_uuid(), p_discipline => '5K')$$,
  'P0001', 'goal_invalid', 'no discipline on a count goal');
select throws_ok($$select public.set_goal('places', 3, gen_random_uuid(), 'running')$$,
  'P0001', 'goal_invalid', 'places: no sport');
select throws_ok($$select public.set_goal('places', 101, gen_random_uuid())$$, 'P0001', 'goal_invalid', 'places up to 100');
select throws_ok($$select public.set_goal('sessions', 5, gen_random_uuid(), p_target_date => current_date - 2)$$,
  'P0001', 'goal_invalid', 'a date still to come');
select throws_ok($$select public.set_goal('sessions', 5, gen_random_uuid(), p_target_date => current_date + 1200)$$,
  'P0001', 'goal_invalid', 'within 3 years');
select throws_ok($$select public.set_goal('sessions', 5, null)$$, 'P0001', 'idempotency_key_required', 'key needed');
select is(public.passport_goal(tests.u(1)), null, 'no goal yet');

-- Set: SUB-22 5K by a date. Same key → same result, one row.
select tests.keep('k1', gen_random_uuid());
select is(public.set_goal('personal_best', 1320, tests.id('k1'), 'running', '5k', 'time', current_date + 60)
            ->> 'discipline', '5K', 'discipline upper-cased');
select tests.keep('g1', (public.set_goal('personal_best', 1320, tests.id('k1'), 'running', '5k', 'time',
                                         current_date + 60) ->> 'goal_id')::uuid);
select is((select count(*)::integer from public.goals where user_id = tests.u(1)), 1, 'a retry adds nothing');
select is((public.passport_goal(tests.u(1)) ->> 'current_value'), null, 'no result yet');
select is((public.passport_goal(tests.u(1)) ->> 'fraction')::numeric, 0.000, 'nothing done');
select is((public.passport_goal(tests.u(1)) ->> 'achieved')::boolean, false, 'not reached');

-- Change the target: the same goal, in place.
select is((public.set_goal('personal_best', 1290, gen_random_uuid(), 'running', '5K', 'time', current_date + 60)
            ->> 'goal_id')::uuid, tests.id('g1'), 'same goal');
select is((select target_value from public.goals where id = tests.id('g1')), 1290.00, 'new target');

-- Something else replaces it: one active goal.
select tests.keep('g2', (public.set_goal('sessions', 2, gen_random_uuid(), 'football') ->> 'goal_id')::uuid);
select isnt(tests.id('g2'), tests.id('g1'), 'a new goal');
select is((select status::text from public.goals where id = tests.id('g1')), 'replaced', 'the old one is kept, replaced');
select is((select count(*)::integer from public.goals where user_id = tests.u(1) and status = 'active'), 1, 'one active');
select tests.logout();
select throws_ok(format($$insert into public.goals (user_id, kind, target_value) values (%L, 'places', 1)$$, tests.u(1)),
  '23505', null, 'the database holds one active goal');

-- Progress from the Passport: stamps since the goal was set, in its sport.
select tests.stamp(1, '0 seconds');
select tests.stamp(1, '0 seconds', 'boxing');
select tests.login(1);
select is((public.passport_goal(tests.u(1)) ->> 'current_value')::integer, 1, 'one football session since');
select is((public.passport_goal(tests.u(1)) ->> 'fraction')::numeric, 0.500, 'half way');
select tests.logout();
select tests.stamp(1, '0 seconds');
select tests.login(1);
select is((public.passport_goal(tests.u(1)) ->> 'achieved')::boolean, true, 'reached');
select isnt(public.passport_goal(tests.u(1)) ->> 'achieved_at', null, 'when it was reached');
select is((select achieved from public.passport_achievements(tests.u(1)) where ladder = 'goals' and threshold = 1), true,
  'FIRST GOAL REACHED');

-- Places goal: only places first visited after it was set.
select public.set_goal('places', 1, gen_random_uuid());
select is((public.passport_goal(tests.u(1)) ->> 'current_value')::integer, 0, 'Test Pitch is not new');
select tests.logout();
insert into public.places (id, slug, name, area, city, lat, lng, sport_ids)
values ('00000000-0000-4000-9100-000000000003', 'test-park', 'Test Park', 'Plateau', 'Montréal', 45.52, -73.58, '{football}');
select tests.stamp(1, '0 seconds', 'football', '00000000-0000-4000-9100-000000000003');
select tests.login(1);
select is((public.passport_goal(tests.u(1)) ->> 'achieved')::boolean, true, 'a new place');

-- NEXT STEP and next test, yours only.
select tests.logout();
select tests.keep('plan', tests.make_plan(4, 6, '2 days'));
select tests.keep('ev', tests.event(1, 2, '5 days'));
select tests.login(1);
select public.set_goal('personal_best', 1320, gen_random_uuid(), 'running', '5K', 'time');
select is((public.passport_goal(tests.u(1)) -> 'next_test' ->> 'event_id')::uuid, tests.id('ev'), 'the next 5K Challenge');
select is(public.passport_goal(tests.u(1)) -> 'next_test' ->> 'opponent_name', 'Tester 2', 'against u2');
select is(coalesce(public.passport_goal(tests.u(1)) -> 'next_step' ->> 'sport_id', 'running'), 'running',
  'a next step, if any, is a running game');
select public.set_goal('sessions', 3, gen_random_uuid(), 'football');
select is(public.passport_goal(tests.u(1)) -> 'next_step' ->> 'sport_id', 'football', 'a football game to join');
select ok((public.passport_goal(tests.u(1)) -> 'next_step' ->> 'starts_at')::timestamptz
            <= (select starts_at from public.plans where id = tests.id('plan')), 'the soonest one');
select ok(public.passport_goal(tests.u(1)) -> 'next_step' ->> 'action' in ('join', 'waitlist'), 'I''M DOWN or the waitlist');

-- Visibility: friends by default (played together).
select tests.login(3);
select is((public.passport_goal(tests.u(1)) ->> 'kind'), 'sessions', 'u3 sees the goal');
select is(public.passport_goal(tests.u(1)) -> 'next_step', 'null'::jsonb, 'not the next step');
select is((select count(*)::integer from public.goals where user_id = tests.u(1)), 1, 'RLS: only the active goal');
select tests.login(4);
select is(public.passport_goal(tests.u(1)), null, 'a stranger does not');
select is((select count(*)::integer from public.goals where user_id = tests.u(1)), 0, 'RLS: none');
select tests.login(5);
select is(public.passport_goal(tests.u(1)), null, 'blocked: nothing');
select tests.login(1);
select is(public.set_goals_visibility('everyone'), 'everyone'::public.visibility, 'goals: everyone');
select is(public.set_goals_visibility('everyone'), 'everyone'::public.visibility, 'safe to repeat');
select tests.login(4);
select is((public.passport_goal(tests.u(1)) ->> 'kind'), 'sessions', 'now a stranger sees it');
select is((public.passport_view(tests.u(1)) ->> 'goals_visible')::boolean, true, 'passport_view says so');
select is((public.passport_view(tests.u(1)) ->> 'visible')::boolean, false, 'history stays separate');
select tests.login(5);
select is(public.passport_goal(tests.u(1)), null, 'blocked still sees nothing');
select tests.login(1);
select public.set_goals_visibility('only_me');
select tests.login(3);
select is(public.passport_goal(tests.u(1)), null, 'only me: hidden from u3');

-- Clear: safe to repeat.
select tests.login(1);
select is(public.clear_goal() ->> 'cleared', 'true', 'cleared');
select is(public.clear_goal(), '{"cleared": false, "goal_id": null}'::jsonb, 'nothing to clear');
select is(public.passport_goal(tests.u(1)), null, 'no goal');
select tests.logout();

-- Analytics.
select is((select count(*)::integer from private.analytics_events where name = 'goal_set' and user_id = tests.u(1)), 5,
  'goal_set per new goal');
select is((select count(*)::integer from private.analytics_events where name = 'goal_updated' and user_id = tests.u(1)), 1,
  'goal_updated');
select is((select count(*)::integer from private.analytics_events where name = 'goal_achieved' and user_id = tests.u(1)), 3,
  'goal_achieved: 2 sessions, a new place, 3 football sessions (the three stamps since)');
select is((select count(*)::integer from private.analytics_events where name = 'goal_cleared' and user_id = tests.u(1)), 1,
  'goal_cleared once');

-- Clients can't write goals directly.
select tests.login(1);
select throws_ok(format($$update public.goals set target_value = 1 where user_id = %L$$, tests.u(1)),
  '42501', null, 'no direct updates');
select tests.logout();

select * from finish();
rollback;
