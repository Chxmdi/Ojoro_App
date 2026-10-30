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

-- Step 6 BE-HOST-OPS: league operations. Fixtures, captains' scores, the host's CONFIRM RESULT /
-- DISPUTE, insert-only results, standings with tie-breaks (points → goal difference → goals scored),
-- referees and readiness.
select no_plan();

select tests.keep('prog', tests.make_program(1));
select tests.login(1);
select tests.keep('lg', public.create_host_league(tests.id('prog'), 'Winter League', 'football', current_date + 1, 10,
                                                  gen_random_uuid(), 'Jeanne-Mance'));
select is((select count(*) from public.host_league_rounds where league_id = tests.id('lg')), 10::bigint, 'ten rounds, a week apart');
-- Six teams, captained by tests.u(2..7).
select tests.keep('t' || n, public.upsert_host_league_team(tests.id('lg'), 'Team ' || n, tests.u(n + 1)))
from generate_series(1, 6) n;
select is(public.upsert_host_league_team(tests.id('lg'), 'Team 1', tests.u(2)), tests.id('t1'), 'teams are set-to-state by name');
select is(public.generate_host_league_fixtures(tests.id('lg'), '09:00', 75, gen_random_uuid(), 'Turf 1'), 30,
          'everyone plays everyone twice: 30 fixtures');
select is((select count(*) from (
             select least(home_team_id, away_team_id), greatest(home_team_id, away_team_id)
             from public.host_league_fixtures where league_id = tests.id('lg') group by 1, 2 having count(*) = 2) x),
          15::bigint, 'each pair meets exactly twice');
select is((select count(distinct r.number) from public.host_league_fixtures f join public.host_league_rounds r on r.id = f.round_id
           where f.league_id = tests.id('lg')), 10::bigint, 'over ten rounds');
select is((select max(c) from (select r.id, count(*) c from public.host_league_fixtures f
                                 join public.host_league_rounds r on r.id = f.round_id
                                 where f.league_id = tests.id('lg') group by r.id) x), 3::bigint, 'three fixtures a round');
select is((select count(*) from (
             select r.id, t from public.host_league_fixtures f join public.host_league_rounds r on r.id = f.round_id,
                    lateral unnest(array[f.home_team_id, f.away_team_id]) t
             where f.league_id = tests.id('lg') group by r.id, t having count(*) > 1) x), 0::bigint,
          'nobody plays twice in a round');
select throws_ok(format($$select public.generate_host_league_fixtures(%L, '09:00', 75, gen_random_uuid())$$, tests.id('lg')),
                 'P0001', 'league_invalid', 'fixtures are generated once');

select tests.logout();
-- Results on known fixtures, moved into the past.
create function tests.fx(h integer, a integer) returns uuid language sql security definer as $$
  select f.id from public.host_league_fixtures f
  where f.league_id = tests.id('lg')
    and ((f.home_team_id = tests.id('t' || h) and f.away_team_id = tests.id('t' || a))
      or (f.home_team_id = tests.id('t' || a) and f.away_team_id = tests.id('t' || h)))
  order by f.kicks_off_at limit 1
$$;
-- Score as "team h goals – team a goals", whichever side is home.
create function tests.score(h integer, a integer, gh integer, ga integer) returns void language plpgsql as $$
declare
  v uuid := tests.fx(h, a);
  v_home boolean := (select home_team_id = tests.id('t' || h) from public.host_league_fixtures where id = v);
begin
  update public.host_league_fixtures set kicks_off_at = now() - interval '3 days' where id = v;
  perform tests.login(h + 1);
  perform public.submit_league_result(v, case when v_home then gh else ga end, case when v_home then ga else gh end, gen_random_uuid());
  perform tests.login(a + 1);
  perform public.submit_league_result(v, case when v_home then gh else ga end, case when v_home then ga else gh end, gen_random_uuid());
  perform tests.login(1);
  perform public.confirm_league_result(v, gen_random_uuid());
  perform tests.logout();
end;
$$;

-- A future fixture can't have a result.
select tests.logout();
select tests.keep('future', (select id from public.host_league_fixtures where league_id = tests.id('lg')
                             and kicks_off_at > now() order by kicks_off_at limit 1));
select tests.login((select right(t.captain_id::text, 12)::int from public.host_league_teams t
                    join public.host_league_fixtures f on f.home_team_id = t.id where f.id = tests.id('future')));
select throws_ok(format($$select public.submit_league_result(%L, 1, 0, gen_random_uuid())$$, tests.id('future')),
                 'P0001', 'fixture_not_played', 'no score before kick-off');

-- Team 1 v Team 2: the captains send different scores; the host can't confirm without one.
select tests.logout();
update public.host_league_fixtures set kicks_off_at = now() - interval '2 days' where id = tests.fx(1, 2);
select tests.keep('f12', tests.fx(1, 2));
update public.host_league_fixtures set home_team_id = tests.id('t1'), away_team_id = tests.id('t2') where id = tests.id('f12');
select tests.login(2);
select is(public.submit_league_result(tests.id('f12'), 4, 2, gen_random_uuid()) ->> 'status', 'one_sent', 'one captain sent it');
select tests.login(4);
select throws_ok(format($$select public.submit_league_result(%L, 4, 2, gen_random_uuid())$$, tests.id('f12')),
                 'P0001', 'not_captain', 'only the two captains send a score');
select tests.login(3);
select is(public.submit_league_result(tests.id('f12'), 3, 2, gen_random_uuid()) ->> 'status', 'differ', 'the captains differ');
select tests.login(1);
select throws_ok(format($$select public.confirm_league_result(%L, gen_random_uuid())$$, tests.id('f12')),
                 'P0001', 'result_not_agreed', 'nothing agreed to confirm');
select is(public.dispute_league_result(tests.id('f12'), 'Send it again') ->> 'status', 'disputed', 'DISPUTE');
select is((select count(*) from public.host_league_result_submissions where fixture_id = tests.id('f12') and superseded_at is null),
          0::bigint, 'clears both scores');
select tests.login(2);
select public.submit_league_result(tests.id('f12'), 4, 2, gen_random_uuid());
select tests.login(3);
select is(public.submit_league_result(tests.id('f12'), 4, 2, gen_random_uuid()) ->> 'status', 'agreed', 'both captains sent 4–2');
select tests.logout();
select is((select count(*) from private.host_needs_you_ops(tests.id('prog')) where kind = 'league_result')::int, 1,
          'Host home: league result to confirm');
select tests.login(1);
select is(jsonb_array_length(public.host_league_view(tests.id('lg')) -> 'to_confirm'), 1, 'RESULT TO CONFIRM');
select is((select pending_count from public.host_league_standings(tests.id('lg')) where team_id = tests.id('t1')), 1,
          'a game in hand until you confirm');
select tests.login(2);
select throws_ok(format($$select public.confirm_league_result(%L, gen_random_uuid())$$, tests.id('f12')),
                 'P0001', 'not_program_host', 'only hosts confirm');
select tests.login(1);
select tests.keep('kc', gen_random_uuid());
select is(public.confirm_league_result(tests.id('f12'), tests.id('kc')) ->> 'status', 'confirmed', 'CONFIRM RESULT');
select is(public.confirm_league_result(tests.id('f12'), tests.id('kc')) ->> 'status', 'confirmed', 'retry-safe');
select is(public.confirm_league_result(tests.id('f12'), gen_random_uuid(), 4, 2) ->> 'source', 'captains_agree',
          'confirming the same score again is a no-op');
select throws_ok(format($$select public.confirm_league_result(%L, gen_random_uuid(), 5, 2)$$, tests.id('f12')),
                 'P0001', 'result_already_verified', 'a confirmed result is never rewritten');
select tests.logout();
select throws_ok(format($$update public.host_league_results set home_goals = 9 where fixture_id = %L$$, tests.id('f12')),
                 'P0001', 'result_already_verified', 'results are insert-only');
select throws_ok(format($$delete from public.host_league_results where fixture_id = %L$$, tests.id('f12')),
                 'P0001', 'result_already_verified', 'and cannot be deleted');

-- Standings: Team 1 won 4–2 (3 pts, +2). Add:
--   Team 3 beats Team 4 2–0 (3 pts, +2, 2 scored)  → behind Team 1 on goals scored.
--   Team 5 beats Team 6 1–0 (3 pts, +1)            → behind on goal difference.
select tests.score(3, 4, 2, 0);
select tests.score(5, 6, 1, 0);
select tests.login(1);
select is((select string_agg(team_name || ':' || points || ':' || goal_difference || ':' || goals_for, ' ' order by "position")
           from public.host_league_standings(tests.id('lg'))),
          'Team 1:3:2:4 Team 3:3:2:2 Team 5:3:1:1 Team 6:0:-1:0 Team 2:0:-2:2 Team 4:0:-2:0',
          'points, then goal difference, then goals scored');
select is((select played || '/' || won || '/' || drawn || '/' || lost from public.host_league_standings(tests.id('lg'))
           where team_id = tests.id('t2')), '1/0/0/1', 'P W D L');
-- A draw: 1 point each.
select tests.logout();
select tests.score(2, 4, 1, 1);
select tests.login(1);
select is((select points from public.host_league_standings(tests.id('lg')) where team_id = tests.id('t4')), 1, 'a draw is a point');
select is((select count(*) from public.host_ops_audit where action = 'result_confirmed')::int, 4, 'confirmations are audited');

-- Public season page: anyone signed in reads standings, not the captains' raw scores.
select tests.login(11);
select is((select count(*) from public.host_league_standings(tests.id('lg')))::int, 6, 'standings are public');
select is(jsonb_array_length(public.host_league_view(tests.id('lg')) -> 'to_confirm'), 0, 'results to confirm are host-only');
select is((select count(*) from public.host_league_result_submissions)::int, 0, 'raw submissions are not public');

-- Referees and readiness.
select tests.login(1);
select tests.keep('nx', (select id from public.host_league_fixtures where league_id = tests.id('lg')
                         and kicks_off_at > now() order by kicks_off_at, id limit 1));
select public.set_host_league_member(tests.id('lg'), tests.u(9), null, true);
select public.set_host_league_member(tests.id('lg'), tests.u(10), null, false);
select is(public.host_league_view(tests.id('lg')) -> 'round' -> 'fixtures' -> 0 -> 'referee_suggestion' -> 'person' ->> 'id',
          tests.u(9)::text, 'a free referee is suggested');
select throws_ok(format($$select public.ask_league_referee(%L, %L, gen_random_uuid())$$, tests.id('nx'), tests.u(10)),
                 'P0001', 'referee_unavailable', 'only people who referee');
select is(public.ask_league_referee(tests.id('nx'), tests.u(9), gen_random_uuid()) ->> 'referee_status', 'asked',
          'ASK YARA TO REF');
select tests.login(9);
select is(public.respond_league_referee(tests.id('nx'), true) ->> 'referee_status', 'accepted', 'she says yes');
-- A player on a team says they're in.
select tests.logout();
select tests.keep('nxhome', (select home_team_id from public.host_league_fixtures where id = tests.id('nx')));
insert into public.host_league_members (league_id, user_id, team_id)
values (tests.id('lg'), tests.u(12), tests.id('nxhome'));
select tests.login(12);
select public.set_league_fixture_in(tests.id('nx'), true);
select public.set_league_fixture_in(tests.id('nx'), true);
select tests.login(1);
select ok((select (f ->> 'home_in')::int >= 1 from jsonb_array_elements(public.host_league_view(tests.id('lg')) -> 'round' -> 'fixtures') f
           where f ->> 'fixture_id' = tests.id('nx')::text), 'readiness counts who is in');
select tests.login(11);
select throws_ok(format($$select public.set_league_fixture_in(%L, true)$$, tests.id('nx')), 'P0001', 'not_on_team',
                 'only players on the two teams');

-- Deleting a whole program takes its league, results and audit trail with it.
select tests.logout();
select lives_ok(format($$delete from public.host_programs where id = %L$$, tests.id('prog')),
                'a program can be deleted with its confirmed results');
select is((select count(*) from public.host_league_results where league_id = tests.id('lg')), 0::bigint, 'gone with it');

select * from finish();
rollback;
