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
-- Step 6 helpers (Host OS core). A program owned by tests.u(p_owner).
create function tests.host_program(p_owner integer, p_name text default 'Test Pickup')
returns uuid language plpgsql security definer as $$
declare
  v uuid;
begin
  insert into public.host_programs (name, sport_id, area, created_by)
  values (p_name, 'football', 'Plateau, Montréal', tests.u(p_owner)) returning id into v;
  insert into public.host_program_hosts (program_id, user_id, role, added_by) values (v, tests.u(p_owner), 'owner', tests.u(p_owner));
  return v;
end;
$$;

-- Move a session (plan, activity and rule times) to start p_starts from now.
create function tests.host_shift(p_session uuid, p_starts interval) returns void language plpgsql security definer as $$
declare
  s public.host_sessions%rowtype;
  v_start timestamptz := now() + p_starts;
begin
  select * into s from public.host_sessions where id = p_session;
  update public.host_sessions
     set starts_at = v_start, opens_at = v_start - interval '5 days',
         members_open_at = case when s.members_first then v_start - interval '7 days' else v_start - interval '5 days' end,
         auto_fill_cutoff_at = v_start - interval '2 hours'
   where id = p_session;
  update public.plans set starts_at = v_start, deadline_at = v_start where id = s.plan_id;
  update public.activities
     set starts_at = v_start, ends_at = v_start + interval '90 minutes', check_in_opens_at = v_start - interval '30 minutes',
         check_in_closes_at = v_start + interval '90 minutes', after_closes_at = v_start + interval '90 minutes 24 hours',
         status = case when status = 'cancelled' then status
                       when v_start + interval '90 minutes 24 hours' <= now() then 'complete'::public.activity_status
                       when v_start + interval '90 minutes' <= now() then 'after'
                       when v_start <= now() then 'live' else 'confirmed' end
   where id = s.activity_id;
end;
$$;

-- One session of a fresh series (no other dates generated), starting p_starts from now.
create function tests.host_session(
  p_program uuid, p_starts interval default '2 days', p_capacity integer default 4,
  p_approval boolean default false, p_auto_fill boolean default true, p_members_first boolean default false,
  p_price integer default 800
) returns uuid language plpgsql security definer as $$
declare
  v_series uuid;
  v_sess uuid;
begin
  insert into public.host_series (program_id, name, sport_id, place_id, start_time, duration_minutes, capacity,
                                  repeat_days, starts_on, until_on, approval_required, waitlist_auto_fill,
                                  members_first, price_cents, created_by)
  values (p_program, 'Test series', 'football', '00000000-0000-4000-9100-000000000001', '19:30', 90, p_capacity,
          '{1,2,3,4,5,6,7}', '2099-01-01', '2099-01-01', p_approval, p_auto_fill, p_members_first, p_price,
          (select user_id from public.host_program_hosts where program_id = p_program and role = 'owner'))
  returning id into v_series;
  v_sess := private.host_create_session(v_series, current_date);
  perform tests.host_shift(v_sess, p_starts);
  return v_sess;
end;
$$;

create function tests.activity_of(p_session uuid) returns uuid language sql security definer as $$
  select activity_id from public.host_sessions where id = p_session
$$;

-- Step 8 TRUST helpers. tests.u(11) is an Ojoro admin, tests.u(12) a moderator.
insert into private.staff_members (user_id, role, note)
values (tests.u(11), 'admin', 'test'), (tests.u(12), 'moderator', 'test');

-- Fails with the code a statement raises (or 'ok'), for "this surface refuses it" checks.
create function tests.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;

-- A finished game where tests.u(n) confirmed but never checked in (counts as missed), p_ago ago.
create function tests.missed(n integer, p_ago interval default '3 days') returns uuid
language plpgsql security definer as $$
declare
  v_act uuid := tests.stamp(1, p_ago);
begin
  insert into public.attendance (activity_id, user_id, status, confirmed_at)
  values (v_act, tests.u(n), 'confirmed', now() - p_ago - interval '1 day');
  return v_act;
end;
$$;

-- Step 8 TRUST: appeals (account pause, hidden content, show-up), reputation corrections that never rewrite
-- attendance or signals, and the rate limits on abuse-prone writes.
select no_plan();

-- Appeals start empty here (anything local is rolled back with the rest).
delete from private.appeals;

-- Show-up appeals --------------------------------------------------------------------------------------------------
select tests.keep('g1', tests.missed(2, '3 days'));
select tests.keep('g2', tests.missed(2, '5 days'));
select tests.keep('g3', tests.stamp(2, '6 days'));
select tests.login(2);
select is((public.passport_reputation(tests.u(2))) -> 'show_up', '{"showed_up": 1, "committed": 3}'::jsonb, 'two games counted as missed');
select is(jsonb_array_length((public.my_missed_games()) -> 'items'), 2, 'my missed games');
select is((public.my_missed_games()) -> 'items' -> 0 ->> 'activity_id', tests.id('g1')::text, 'newest first');
select throws_ok(format('select public.submit_appeal(%L, %L, %L, gen_random_uuid())', 'show_up', tests.id('g3'), 'I was there'),
                 'P0001', 'appeal_not_allowed', 'a game you checked in to is not a miss');
select throws_ok(format('select public.submit_appeal(%L, %L, %L, gen_random_uuid())', 'show_up', tests.id('g1'), '  '),
                 'P0001', 'invalid_argument', 'say what happened');
select throws_ok(format('select public.submit_appeal(%L, %L, %L, gen_random_uuid())', 'nonsense', tests.id('g1'), 'x'),
                 'P0001', 'invalid_argument', 'known kinds only');
select tests.keep('a1', ((public.submit_appeal('show_up', tests.id('g1'), 'Check-in failed, the host saw me.',
                                               '30000000-0000-4000-8000-000000000001')) ->> 'id')::uuid);
select is(((public.submit_appeal('show_up', tests.id('g1'), 'Check-in failed, the host saw me.',
            '30000000-0000-4000-8000-000000000001')) ->> 'id')::uuid, tests.id('a1'), 'a retry returns the same appeal');
select throws_ok(format('select public.submit_appeal(%L, %L, %L, gen_random_uuid())', 'show_up', tests.id('g1'), 'again'),
                 'P0001', 'appeal_exists', 'one open appeal per game');
select is((public.my_missed_games()) -> 'items' -> 0 ->> 'appeal_status', 'open', 'the miss shows its appeal');
select tests.keep('a2', ((public.submit_appeal('show_up', tests.id('g2'), 'The host cancelled on the pitch.', gen_random_uuid())) ->> 'id')::uuid);

select tests.login(12);
select is((public.staff_appeals()) -> 'items' -> 0 ->> 'id', tests.id('a1')::text, 'oldest open appeal first');
select is(((public.staff_appeals()) -> 'counts' ->> 'open')::integer, 2, 'open count');
select is((public.staff_appeal(tests.id('a1'))) -> 'subject' ->> 'attendance_status', 'confirmed', 'staff see the game');
select is((public.staff_appeal(tests.id('a1'))) -> 'appeal' ->> 'message', 'Check-in failed, the host saw me.', 'and the message');
select throws_ok(format('select public.staff_decide_appeal(%L, %L, %L, null, null, gen_random_uuid())', tests.id('a1'), 'maybe', 'x'),
                 'P0001', 'invalid_argument', 'upheld or denied');
select is((public.staff_decide_appeal(tests.id('a1'), 'upheld', 'Host confirmed', 'We counted the game as played.', null,
                                       gen_random_uuid())) ->> 'status', 'upheld', 'upheld');
select is((public.staff_decide_appeal(tests.id('a1'), 'upheld', 'again', null, null, gen_random_uuid())) ->> 'changed', 'false',
          'deciding twice changes nothing');
select throws_ok(format('select public.staff_decide_appeal(%L, %L, %L, null, null, gen_random_uuid())', tests.id('a1'), 'denied', 'x'),
                 'P0001', 'appeal_closed', 'a decided appeal stays decided');
select is((public.staff_decide_appeal(tests.id('a2'), 'upheld', 'Host cancelled late', null, 'excused', gen_random_uuid())) ->> 'status',
          'upheld', 'excused');
select tests.login(2);
select is((public.passport_reputation(tests.u(2))) -> 'show_up', '{"showed_up": 2, "committed": 2}'::jsonb,
          'attended counts as showed up; excused counts for neither');
select is(jsonb_array_length((public.my_missed_games()) -> 'items'), 0, 'nothing missed now');
select is((select x ->> 'decision_note' from jsonb_array_elements((public.my_appeals()) -> 'items') x
           where x ->> 'id' = tests.id('a1')::text), 'We counted the game as played.', 'the decision in words');
select tests.logout();
select is((select status::text from public.attendance where activity_id = tests.id('g1') and user_id = tests.u(2)), 'confirmed',
          'attendance itself is never rewritten');
select throws_ok($$delete from private.reputation_corrections$$, 'P0001', 'audit_immutable', 'corrections are append-only');

-- Voided signals ---------------------------------------------------------------------------------------------------------
insert into public.reputation_signals (giver_id, subject_id, activity_id, kind)
select tests.u(n), tests.u(7), tests.id('g3'), 'respectful' from generate_series(1, 5) n;
select tests.login(3);
select is((public.passport_reputation(tests.u(7))) -> 'signals' -> 0 ->> 'confirmations', '5', 'five confirmations');
select tests.login(12);
select is((public.staff_void_reputation(tests.u(7), tests.u(1), 'Boosting ring', null, null, gen_random_uuid())) ->> 'voided', '1', 'voided');
select is((public.staff_void_reputation(tests.u(7), tests.u(1), 'again', null, null, gen_random_uuid())) ->> 'changed', 'false',
          'voiding twice changes nothing');
select tests.login(3);
select is(jsonb_array_length((public.passport_reputation(tests.u(7))) -> 'signals'), 0, 'below the threshold now');
select is((select count(*)::integer from public.profile_reputation(tests.u(7))), 0, 'on the profile too');
select tests.logout();
select is((select count(*)::integer from public.reputation_signals where subject_id = tests.u(7)), 5, 'the signals are all still there');

-- Pause appeals ------------------------------------------------------------------------------------------------------------
select tests.login(12);
select tests.keep('p4', ((public.staff_pause_account(tests.u(4), 'spam', 'Spam links', 'You sent the same link to many people.',
                                                     null, null, gen_random_uuid())) ->> 'pause_id')::uuid);
select tests.login(4);
select throws_ok(format('select public.submit_appeal(%L, %L, %L, gen_random_uuid())', 'show_up', tests.id('g1'), 'x'),
                 'P0001', 'account_paused', 'paused: only the pause can be appealed');
select throws_ok(format('select public.submit_appeal(%L, %L, %L, gen_random_uuid())', 'account_pause', gen_random_uuid(), 'x'),
                 'P0001', 'appeal_not_allowed', 'only your own pause');
select tests.keep('a4', ((public.submit_appeal('account_pause', tests.id('p4'), 'Those were invites to my run club.',
                                               gen_random_uuid())) ->> 'id')::uuid);
select is((public.my_account_status()) -> 'appeal' ->> 'status', 'open', 'the paused screen shows the appeal');
select is((public.my_account_status()) ->> 'can_appeal', 'false', 'one appeal at a time');
select is(jsonb_array_length((public.my_appeals()) -> 'items'), 1, 'my appeals while paused');
select tests.login(12);
select is((public.staff_appeal(tests.id('a4'))) -> 'subject' -> 'pause' ->> 'id', tests.id('p4')::text, 'staff see the pause');
select public.staff_decide_appeal(tests.id('a4'), 'upheld', 'Run club invites', 'Sorry. Your account is back.', null, gen_random_uuid());
select tests.login(4);
select is((public.my_account_status()) ->> 'paused', 'false', 'an upheld pause appeal restores the account');
select tests.logout();
select ok(exists (select 1 from private.trust_audit where action = 'restore_account' and appeal_id = tests.id('a4')),
          'the restore is audited against the appeal');

-- Hidden content appeals -------------------------------------------------------------------------------------------------------
select tests.keep('crew', tests.make_crew(5, array[6]));
select tests.login(5);
select tests.keep('m', (public.send_message(gen_random_uuid(), 'Bring the cones.', tests.id('crew'))).id);
select tests.login(12);
select tests.keep('h', ((public.staff_hide_content('message', tests.id('m'), 'Looked like spam', null, gen_random_uuid())) ->> 'hide_id')::uuid);
select tests.login(6);
select throws_ok(format('select public.submit_appeal(%L, %L, %L, gen_random_uuid())', 'content_hidden', tests.id('h'), 'x'),
                 'P0001', 'appeal_not_allowed', 'only your own content');
select tests.login(5);
select is((public.my_account_status()) -> 'hidden_content' -> 0 ->> 'hide_id', tests.id('h')::text, 'you see what was hidden');
select tests.keep('a5', ((public.submit_appeal('content_hidden', tests.id('h'), 'It was about training kit.', gen_random_uuid())) ->> 'id')::uuid);
select tests.login(12);
select is((public.staff_appeal(tests.id('a5'))) -> 'subject' -> 'content' ->> 'text', 'Bring the cones.', 'staff see the hidden words');
select public.staff_decide_appeal(tests.id('a5'), 'denied', 'Still spam', 'We looked again.', null, gen_random_uuid());
select tests.login(5);
select is((select is_deleted from public.crew_messages(tests.id('crew'), null, 10) where id = tests.id('m')), true, 'denied: still hidden');
select is((public.my_account_status()) -> 'hidden_content' -> 0 ->> 'appeal_status', 'denied', 'and says so');
select tests.keep('a6', ((public.submit_appeal('content_hidden', tests.id('h'), 'Please look again.', gen_random_uuid())) ->> 'id')::uuid);
select tests.login(11);
select public.staff_decide_appeal(tests.id('a6'), 'upheld', 'Second look', null, null, gen_random_uuid());
select tests.login(5);
select is((select body from public.crew_messages(tests.id('crew'), null, 10) where id = tests.id('m')), 'Bring the cones.',
          'upheld: the words are back');

-- Appeal rate limit -------------------------------------------------------------------------------------------------------------
select tests.logout();
insert into private.appeals (user_id, kind, subject_id, message, status, decided_at)
select tests.u(8), 'show_up', gen_random_uuid(), 'x', 'denied', now() from generate_series(1, 5);
select tests.keep('g8', tests.missed(8, '2 days'));
select tests.login(8);
select throws_ok(format('select public.submit_appeal(%L, %L, %L, gen_random_uuid())', 'show_up', tests.id('g8'), 'x'),
                 'P0001', 'appeal_rate_limited', 'five appeals a week');

-- Report rate limit ---------------------------------------------------------------------------------------------------------------
select tests.logout();
insert into public.reports (reporter_id, subject_kind, subject_id, reason)
select tests.u(9), 'plan', gen_random_uuid(), 'spam' from generate_series(1, 20);
select tests.login(9);
select throws_ok(format('select public.report(%L, %L, %L)', 'profile', tests.u(3), 'spam'), 'P0001', 'report_rate_limited',
                 'twenty reports a day');

-- Host join requests and announcements --------------------------------------------------------------------------------------------
select tests.logout();
select tests.keep('prog', tests.host_program(1));
create temporary table sess as select tests.host_session(tests.id('prog'), '2 days', 4, true) as id from generate_series(1, 21);
insert into public.host_join_requests (session_id, user_id, note)
select s.id, tests.u(10), 'please' from (select id from sess limit 20) s;
select tests.keep('s21', (select id from sess where id not in (select session_id from public.host_join_requests
                                                              where user_id = tests.u(10))));
select tests.keep('s1', (select id from sess limit 1));
select tests.login(10);
select throws_ok(format('select public.ask_to_join(%L, %L, gen_random_uuid())', tests.id('s21'), 'please'),
                 'P0001', 'join_request_rate_limited', 'twenty join requests a day');
select tests.logout();
insert into public.host_announcements (program_id, author_id, body, audiences)
select tests.id('prog'), tests.u(1), 'Note ' || n, '{everyone}' from generate_series(1, 10) n;
insert into public.attendance (activity_id, user_id, status, confirmed_at)
values (tests.activity_of(tests.id('s1')), tests.u(3), 'confirmed', now());
select tests.login(1);
select throws_ok(format('select public.send_announcement(%L, %L, %L, null, false, false, gen_random_uuid())',
                        tests.id('s1'), '{session}', 'Pitch moved'),
                 'P0001', 'announcement_rate_limited', 'ten announcements an hour');
select tests.login(3);
select throws_ok($$select public.crew_messages(gen_random_uuid(), null, 1)$$, 'P0001', null, 'reads still answer');

select * from finish();
rollback;
