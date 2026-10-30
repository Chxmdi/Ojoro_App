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

-- Step 8 TRUST: block is enforced on every person-to-person surface from Steps 1–7, both ways, and a
-- paused account is hidden from (and refused on) the same surfaces. B = tests.u(2) blocked A = tests.u(1);
-- C = tests.u(3) is in between; P = tests.u(4) gets paused.
select no_plan();

select tests.keep('together', tests.connect(1, 2));
select tests.connect(1, 3);
select tests.connect(3, 4);
select tests.block(2, 1);
select tests.keep('crew', tests.make_crew(3, array[1, 2, 4]));
select tests.keep('bplan', tests.make_plan(2, 6));
select tests.keep('aplan', tests.make_plan(1, 6));
select tests.keep('pplan', tests.make_plan(4, 6));
select tests.keep('game', tests.live_game(3, array[1, 2, 3, 4]));
select tests.keep('ev', tests.event(3, 5));
select tests.keep('bcrew', tests.make_crew(2, array[6]));
select tests.keep('bprog', tests.host_program(2));
select tests.keep('bsess', tests.host_session(tests.id('bprog'), '2 days', 4, true));
select tests.keep('bopen', tests.host_session(tests.id('bprog'), '3 days', 8, false));

-- What B and P write.
select tests.login(2);
select tests.keep('bmsg', (public.send_message(gen_random_uuid(), 'From B in the crew.', tests.id('crew'))).id);
select tests.keep('bgame', (public.send_message(gen_random_uuid(), 'From B in the game.', null, tests.id('game'))).id);
select tests.keep('bupd', (public.post_update(tests.id('game'), 'B: what a goal', gen_random_uuid())).id);
select tests.keep('bcom', (public.comment_on_challenge(tests.id('ev'), 'B says go', gen_random_uuid())).id);
select tests.keep('bclan', (public.create_clan(gen_random_uuid(), 'B Clan', 'open')).id);
select tests.login(4);
select tests.keep('pmsg', (public.send_message(gen_random_uuid(), 'From P in the crew.', tests.id('crew'))).id);
select tests.login(1);
select tests.keep('amsg', (public.send_message(gen_random_uuid(), 'From A, hi @B', tests.id('crew'), null, null,
                                               array[tests.u(2), tests.u(3)])).id);

-- Profiles and Passport -------------------------------------------------------------------------------------------
select tests.login(1);
select is((select count(*)::integer from public.profiles where id = tests.u(2)), 0, 'A cannot read B''s profile');
select is(public.passport_view(tests.u(2)), null, 'A gets no Passport for B');
select is(public.passport_reputation(tests.u(2)), null, 'or reputation');
select is((select count(*)::integer from public.profile_reputation(tests.u(2))), 0, 'or profile reputation');
select is((select count(*)::integer from public.profile_sports(tests.u(2))), 0, 'or their sports');
select tests.login(2);
select is((select count(*)::integer from public.profiles where id = tests.u(1)), 0, 'and the other way round');
select is(public.passport_view(tests.u(1)), null, 'B gets no Passport for A');

-- Plans, invites, people ------------------------------------------------------------------------------------------
select tests.login(1);
select is((select count(*)::integer from public.plans where id = tests.id('bplan')), 0, 'A cannot see B''s plan');
select is(tests.err(format('select public.im_down(%L, gen_random_uuid())', tests.id('bplan'))), 'plan_not_found', 'or join it');
select is(tests.err(format('select public.pull_in(%L, array[%L]::uuid[], gen_random_uuid())', tests.id('aplan'), tests.u(2))),
          'invite_not_allowed', 'A cannot pull B in');
select is((select count(*)::integer from public.people_to_move_with(50) where user_id = tests.u(2)), 0,
          'B is not among people to move with');
select is(tests.err(format('select public.give_reputation(%L, %L, %L)', tests.id('together'), tests.u(2), 'respectful')),
          'invalid_argument', 'A cannot give B a reputation signal');
select tests.login(3);
select is(tests.err(format('select public.give_reputation(%L, %L, %L)', tests.id('together'), tests.u(2), 'respectful')),
          'not_player', 'someone who wasn''t there gets a different answer (the block is what stops A)');
select tests.login(1);
select tests.login(2);
select is((select count(*)::integer from public.plans where id = tests.id('aplan')), 0, 'B cannot see A''s plan');

-- Crew chat, mentions, game chat, game updates ----------------------------------------------------------------------
select tests.login(1);
select is((select count(*)::integer from public.crew_messages(tests.id('crew'), null, 50) where id = tests.id('bmsg')), 0,
          'A does not get the messages of someone who blocked them');
select is((select count(*)::integer from public.activity_messages(tests.id('game'), null, 50) where id = tests.id('bgame')), 0,
          'not in game chat either');
select is((select count(*)::integer from public.activity_updates_feed(tests.id('game'), null, 50) where id = tests.id('bupd')), 0,
          'or in game updates');
select tests.logout();
select is((select tests.u(2) = any (mention_ids) from public.messages where id = tests.id('amsg')), false,
          'A cannot mention B');
select is((select tests.u(3) = any (mention_ids) from public.messages where id = tests.id('amsg')), true, 'but can mention C');
select tests.login(2);
select is((select is_hidden from public.crew_messages(tests.id('crew'), null, 50) where id = tests.id('amsg')), true,
          'B sees A''s message as hidden');
select is((select body from public.crew_messages(tests.id('crew'), null, 50) where id = tests.id('amsg')), null, 'with no words');

-- Challenges ---------------------------------------------------------------------------------------------------------
select tests.login(1);
select is(tests.err(format('select public.create_call_out(gen_random_uuid(), %L, %L, %L, now() + interval %L, p_opponent_id => %L)',
                           'running', '5K', 'time', '2 days', tests.u(2))), 'call_out_not_allowed', 'A cannot call B out');
select is((select count(*)::integer from public.challenge_comments(tests.id('ev'), null, 50, null) where id = tests.id('bcom')), 0,
          'A does not see B''s comments in the Crowd');

-- Crews and clans -----------------------------------------------------------------------------------------------------
select is(tests.err(format('select public.join_crew(%L)', tests.crew_code(tests.id('bcrew')))), 'invite_code_invalid',
          'A cannot join B''s crew with its code');
select is(tests.err(format('select public.join_clan(%L, null)', tests.id('bclan'))), 'clan_not_found', 'or B''s clan');
select tests.login(2);
select is(tests.err(format('select public.add_crew_members(%L, array[%L]::uuid[])', tests.id('bcrew'), tests.u(1))),
          'crew_member_not_allowed', 'B cannot add A to a crew');

-- Hosts ------------------------------------------------------------------------------------------------------------------
select tests.login(1);
select is(tests.err(format('select public.ask_to_join(%L, %L, gen_random_uuid())', tests.id('bsess'), 'hi')), 'session_not_found',
          'A cannot ask to join B''s session');
select is(tests.err(format('select public.report(%L, %L, %L)', 'host_program', tests.id('bprog'), 'spam')), 'subject_not_found',
          'A cannot see B''s program to report it');
select tests.logout();
insert into public.attendance (activity_id, user_id, status, confirmed_at)
values (tests.activity_of(tests.id('bopen')), tests.u(1), 'confirmed', now()),
       (tests.activity_of(tests.id('bopen')), tests.u(6), 'confirmed', now());
select tests.login(2);
select tests.keep('ann', (public.send_announcement(tests.id('bopen'), '{session}', 'Pitch moved.', null, false, false,
                                                   gen_random_uuid())).announcement_id);
select tests.logout();
select is((select count(*)::integer from public.host_announcement_recipients
           where announcement_id = tests.id('ann') and user_id = tests.u(1)), 0, 'B''s announcement does not reach A');
select is((select count(*)::integer from public.host_announcement_recipients
           where announcement_id = tests.id('ann') and user_id = tests.u(6)), 1, 'it reaches everyone else');

-- Reporting still works across a block (the blocker reports the person they blocked).
select tests.login(2);
select is(tests.err(format('select public.report(%L, %L, %L)', 'profile', tests.u(1), 'harassment')), 'ok', 'B can report A');

-- Paused account: hidden from the same surfaces, refused on its own writes -----------------------------------------------
select tests.login(11);
select public.staff_pause_account(tests.u(4), 'unsafe', 'Unsafe behaviour at a game', null, null, null, gen_random_uuid());
select tests.login(3);
select is((select count(*)::integer from public.profiles where id = tests.u(4)), 0, 'C cannot read P''s profile');
select is(public.passport_view(tests.u(4)), null, 'or Passport');
select is((select count(*)::integer from public.plans where id = tests.id('pplan')), 0, 'or P''s plan');
select is(tests.err(format('select public.im_down(%L, gen_random_uuid())', tests.id('pplan'))), 'plan_not_found', 'or join it');
select is((select count(*)::integer from public.people_to_move_with(50) where user_id = tests.u(4)), 0, 'or move with P');
select is((select is_hidden from public.crew_messages(tests.id('crew'), null, 50) where id = tests.id('pmsg')), true,
          'P''s messages are hidden placeholders');
select is(tests.err(format('select public.create_call_out(gen_random_uuid(), %L, %L, %L, now() + interval %L, p_opponent_id => %L)',
                           'running', '5K', 'time', '2 days', tests.u(4))), 'call_out_not_allowed', 'C cannot call P out');
select tests.login(4);
select is(tests.err(format('select public.send_message(gen_random_uuid(), %L, %L)', 'hi', tests.id('crew'))), 'account_paused',
          'P cannot send messages');
select is(tests.err(format('select public.post_update(%L, %L, gen_random_uuid())', tests.id('game'), 'x')), 'account_paused',
          'or post updates');
select is(tests.err(format('select public.report(%L, %L, %L)', 'profile', tests.u(3), 'spam')), 'account_paused', 'or report');
select is(tests.err(format('select public.block_user(%L)', tests.u(3))), 'account_paused', 'or block');
select is(tests.err(format('select public.comment_on_challenge(%L, %L, gen_random_uuid())', tests.id('ev'), 'x')), 'account_paused',
          'or comment');
select is(tests.err(format('select public.ask_to_join(%L, %L, gen_random_uuid())', tests.id('bopen'), 'x')), 'account_paused',
          'or ask to join');
select tests.login(3);
select is((select count(*)::integer from public.profiles where id = tests.u(3)), 1, 'C still sees their own profile');
select tests.login(11);
select public.staff_restore_account(tests.u(4), 'Cleared', gen_random_uuid());
select tests.login(3);
select is((select count(*)::integer from public.profiles where id = tests.u(4)), 1, 'restored: P is back');
select is((select body from public.crew_messages(tests.id('crew'), null, 50) where id = tests.id('pmsg')), 'From P in the crew.',
          'with their messages');

select * from finish();
rollback;
