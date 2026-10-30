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

-- Step 7 BE-PASSPORT: Challenge results add Passport stamps and personal bests. Insert-only, once per
-- result per person, never rewritten.
select no_plan();

-- First result: u2 wins 1450 to 1500. Both get a stamp and a first personal best.
select tests.keep('r1', tests.result(1, 2, 1500, 1450));
select is((select count(*)::integer from public.passport_entries where challenge_event_id = tests.id('r1')), 2,
  'one stamp per competitor');
select is((select kind::text || '|' || challenge_title || '|' || challenge_outcome || '|' || challenge_value::text
             || '|' || challenge_side::text || '|' || coalesce(activity_id::text, 'no game') || '|' || sport_game_number
           from public.passport_entries where challenge_event_id = tests.id('r1') and user_id = tests.u(1)),
  'challenge|5K|lost|1500.00|a|no game|1', 'u1: lost, own time, side a');
select is((select challenge_outcome from public.passport_entries
           where challenge_event_id = tests.id('r1') and user_id = tests.u(2)), 'won', 'u2: won');
select is((select minutes from public.passport_entries
           where challenge_event_id = tests.id('r1') and user_id = tests.u(1)), 25, 'minutes from the time');
select is((select discipline || '|' || scoring::text || '|' || value::text || '|' || coalesce(previous_value::text, 'first')
           from public.personal_bests where user_id = tests.u(1)), '5K|time|1500.00|first', 'u1 first 5K');
select is((select count(*)::integer from public.personal_bests where user_id = tests.u(2)), 1, 'u2 first 5K');

-- Second: u1 improves (1480), u2 is slower than their best (1460 > 1450): no new best for u2.
select tests.keep('r2', tests.result(1, 2, 1480, 1460));
select is((select count(*)::integer from public.personal_bests where user_id = tests.u(1)), 2, 'u1 new best');
select is((select value::text || '|' || previous_value::text from public.personal_bests
           where user_id = tests.u(1) and challenge_event_id = tests.id('r2')), '1480.00|1500.00', 'improved from 1500');
select is((select count(*)::integer from public.personal_bests where user_id = tests.u(2)), 1, 'u2 no new best');
select is((select sport_game_number from public.passport_entries
           where challenge_event_id = tests.id('r2') and user_id = tests.u(1)), 2, 'second Challenge in the sport');

-- Third: u1 slower than their best. No best; past bests unchanged.
select tests.keep('r3', tests.result(1, 2, 1490, 1500));
select is((select count(*)::integer from public.personal_bests where user_id = tests.u(1)), 2, 'no best from a slower run');
select is((select challenge_outcome from public.passport_entries
           where challenge_event_id = tests.id('r3') and user_id = tests.u(1)), 'won', 'u1 won r3');

-- A draw.
select tests.keep('r4', tests.result(1, 2, 1495, 1495));
select is((select string_agg(challenge_outcome, ',') from public.passport_entries
           where challenge_event_id = tests.id('r4')), 'draw,draw', 'a draw for both');

-- Once per result: recording again changes nothing.
select private.passport_record_challenge(tests.id('r2'));
select private.passport_record_challenge(tests.id('r2'));
select is((select count(*)::integer from public.passport_entries where challenge_event_id = tests.id('r2')), 2,
  'still one stamp each');
select is((select count(*)::integer from public.personal_bests where user_id = tests.u(1)), 2, 'still two bests');
select throws_ok(
  format($$insert into public.passport_entries (user_id, kind, challenge_event_id, sport_id, occurred_at, minutes,
           sport_game_number, challenge_title, challenge_scoring, challenge_outcome)
           values (%L, 'challenge', %L, 'running', now(), 1, 1, '5K', 'time', 'won')$$, tests.u(1), tests.id('r2')),
  '23505', null, 'a second stamp for the same result is refused');
select throws_ok(
  format($$insert into public.passport_entries (user_id, kind, sport_id, occurred_at, minutes, sport_game_number)
           values (%L, 'challenge', 'running', now(), 1, 1)$$, tests.u(1)),
  '23514', null, 'a stamp needs its game or Challenge');

-- Never rewritten.
select throws_ok(format($$update public.personal_bests set value = 1 where user_id = %L$$, tests.u(1)),
  'P0001', 'result_already_verified', 'a personal best is never changed');
select throws_ok(format($$delete from public.personal_bests where user_id = %L$$, tests.u(1)),
  'P0001', 'result_already_verified', 'nor removed');
select throws_ok(format($$update public.challenge_results set a_value = 1 where event_id = %L$$, tests.id('r1')),
  'P0001', 'result_already_verified', 'results stay final');

-- Clients can't write.
select tests.login(1);
select throws_ok(format($$insert into public.personal_bests (user_id, sport_id, discipline, scoring, value,
                          passport_entry_id, challenge_event_id, set_at)
                          select %L, 'running', '5K', 'time', 1, id, %L, now() from public.passport_entries limit 1$$,
                        tests.u(1), tests.id('r1')),
  '42501', null, 'no client inserts');

-- The Result screen row.
select is((select personal_best::text || '|' || first_in_discipline::text || '|' || previous_best::text || '|' ||
                  best_value::text || '|' || outcome || '|' || place_name
           from public.challenge_passport_for_me(tests.id('r2'))),
  'true|false|1500.00|1480.00|lost|Test Pitch', 'r2: a new best, in a loss');
select is((select personal_best::text || '|' || first_in_discipline::text
           from public.challenge_passport_for_me(tests.id('r1'))), 'true|true', 'r1: first 5K');
select is((select personal_best from public.challenge_passport_for_me(tests.id('r3'))), false, 'r3: no best');
select is((select goal_gap from public.challenge_passport_for_me(tests.id('r3'))), null, 'no goal, no gap');
select tests.login(3);
select is((select count(*)::integer from public.challenge_passport_for_me(tests.id('r2'))), 0,
  'nothing for someone who did not compete');

-- Visibility: history setting (default friends = played together). Competing isn't playing together.
select is((select count(*)::integer from public.personal_bests where user_id = tests.u(1)), 0,
  'a stranger sees no bests');
select is((select count(*)::integer from public.passport_entries where user_id = tests.u(1)), 0,
  'nor stamps');
select tests.logout();
select tests.connect(1, 3);
select tests.login(3);
select is((select count(*)::integer from public.personal_bests where user_id = tests.u(1)), 2, 'played together: visible');
select tests.logout();
update public.privacy_settings set history_visibility = 'only_me' where user_id = tests.u(1);
select tests.login(3);
select is((select count(*)::integer from public.personal_bests where user_id = tests.u(1)), 0, 'only me: hidden');
select tests.logout();

-- A goal reached by a result: sub-24:30 5K, then 1465.
select tests.login(1);
select is((public.set_goal('personal_best', 1470, gen_random_uuid(), 'running', '5K', 'time') ->> 'achieved')::boolean,
  false, 'goal not reached at 1480');
select is((select goal_gap from public.challenge_passport_for_me(tests.id('r2'))), 10.00, '10 s off the goal');
select tests.logout();
select tests.keep('r5', tests.result(1, 2, 1465, 1500));
select isnt((select achieved_at from public.goals where user_id = tests.u(1) and status = 'active'), null,
  'reached by the result');
select tests.login(1);
select is((select goal_gap from public.challenge_passport_for_me(tests.id('r5'))), -5.00, 'under the goal by 5 s');
select tests.logout();

-- Analytics.
select is((select count(*)::integer from private.analytics_events
           where name = 'personal_best_set' and user_id = tests.u(1)), 3, 'personal_best_set per best');
select is((select count(*)::integer from private.analytics_events
           where name = 'passport_entry_added' and payload ->> 'event_id' = tests.id('r1')::text), 2,
  'passport_entry_added per stamp');
select is((select count(*)::integer from private.analytics_events where name = 'goal_achieved' and user_id = tests.u(1)), 1,
  'goal_achieved once');

-- Game stamps count games only (a Challenge at the same place isn't a game there).
select tests.keep('g', tests.live_game(1, array[1, 4]));
select private.ensure_recap(tests.id('g'));
select is((select sport_game_number || '|' || place_game_number from public.passport_entries
           where activity_id = tests.id('g') and user_id = tests.u(1)), '2|2',
  'second game here for u1 (after the connect game), not the 7th stamp');

select * from finish();
rollback;
