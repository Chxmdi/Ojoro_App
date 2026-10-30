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

-- Step 6 (Communities): Clans: identity and visibility, joining (open, request, invite), roles and
-- what they allow, club runs (capacity, GAME ON, check-in), the mission, the clan-only leaderboard,
-- clan Rituals, report.
select no_plan();

create function tests.clan_code(p_clan uuid) returns text language sql security definer as $$
  select code from private.clan_invite_codes where clan_id = p_clan
$$;
grant execute on function tests.clan_code(uuid) to authenticated;

-- Create ---------------------------------------------------------------------------------------------------
select tests.login(1);
select tests.keep('ckey', gen_random_uuid());
select tests.keep('clan', (public.create_clan(tests.id('ckey'), 'Test Run Club', 'request', 'Every pace.', 'running',
  'Plateau', 'Montréal', 'Test')).id);
select is((public.create_clan(tests.id('ckey'), 'Other name')).id, tests.id('clan'), 'retry with the key: the same clan');
select is((select my_role::text || ' ' || member_count || ' ' || short_name from public.clan_view(tests.id('clan'))),
  'captain 1 Test', 'the creator is the captain');
select throws_ok($$select public.create_clan(gen_random_uuid(), '')$$, 'P0001', 'invalid_argument', 'a name');

-- Visibility -----------------------------------------------------------------------------------------------
select tests.login(2);
select is((select is_member::text || ' ' || can_start_run || ' ' || can_invite || ' ' || coalesce(my_role::text, 'none')
           from public.clan_view(tests.id('clan'))), 'false false false none',
  'a request clan is visible to everyone signed in; nothing to do yet');
select throws_ok(format($$select * from public.clan_leaderboard(%L)$$, tests.id('clan')), 'P0001', 'not_clan_member',
  'the leaderboard is members only');
select throws_ok(format($$select * from public.clan_roster(%L)$$, tests.id('clan')), 'P0001', 'not_clan_member',
  'the roster is members only');
select ok(public.report('clan', tests.id('clan'), 'spam') is not null, 'report a clan you can see');

select tests.login(3);
select tests.keep('secret', (public.create_clan(gen_random_uuid(), 'Secret Club', 'invite')).id);
select isnt(public.clan_invite_code(tests.id('secret')), null, 'the captain reads the invite code');
select tests.login(2);
select throws_ok(format($$select * from public.clan_view(%L)$$, tests.id('secret')), 'P0001', 'clan_not_found',
  'invite clans: members only');
select throws_ok(format($$select public.report('clan', %L, 'spam')$$, tests.id('secret')), 'P0001', 'subject_not_found',
  'cannot report what you cannot see');
select throws_ok(format($$select public.join_clan(%L)$$, tests.id('secret')), 'P0001', 'clan_not_found',
  'cannot ask to join an invite clan you cannot see');
select is((public.join_clan_with_code(lower(tests.clan_code(tests.id('secret'))))).status, 'member', 'join with the code');
select is((public.join_clan_with_code(tests.clan_code(tests.id('secret')))).changed, false, 'again: already in');
select throws_ok($$select public.join_clan_with_code('NOPE1234')$$, 'P0001', 'invite_code_invalid', 'a wrong code');

select tests.block(1, 9);
select tests.login(9);
select throws_ok(format($$select * from public.clan_view(%L)$$, tests.id('clan')), 'P0001', 'clan_not_found',
  'a block with the captain hides the clan');

-- Requests --------------------------------------------------------------------------------------------------
select tests.login(2);
select tests.keep('req', (public.join_clan(tests.id('clan'), 'I run 5K most weeks')).request_id);
select is((select status || ' ' || changed from public.join_clan(tests.id('clan')) x), 'requested false',
  'asking again: the same request');
select tests.login(4);
select throws_ok(format($$select public.decide_clan_request(%L, true)$$, tests.id('req')), 'P0001',
  'clan_request_not_found', 'only people who admit can decide');
select tests.login(1);
select is((select count(*)::integer from public.clan_requests(tests.id('clan'))), 1, 'the captain sees the request');
select is((select pending_requests from public.clan_view(tests.id('clan'))), 1, 'and the count');
select is(public.decide_clan_request(tests.id('req'), true)::text, 'approved', 'approve');
select is(public.decide_clan_request(tests.id('req'), false)::text, 'approved', 'answered already: stays approved');
select is((select member_count from public.clan_view(tests.id('clan'))), 2, 'two members');

-- Open joining.
select is((public.update_clan(tests.id('clan'), p_join_policy => 'open')).join_policy::text, 'open', 'open the clan');
select tests.login(5);
select is((public.join_clan(tests.id('clan'))).status, 'member', 'open: straight in');
select tests.login(7);
select public.join_clan(tests.id('clan'));
select tests.login(8);
select public.join_clan(tests.id('clan'));

-- Roles ----------------------------------------------------------------------------------------------------------
select tests.login(5);
select throws_ok(format($$select public.set_clan_role(%L, %L, 'coach')$$, tests.id('clan'), tests.u(2)), 'P0001',
  'clan_role_required', 'only the captain gives roles');
select throws_ok(format($$select public.clan_invite_code(%L)$$, tests.id('clan')), 'P0001', 'clan_role_required',
  'members do not read the invite code');
select tests.login(1);
select is(public.set_clan_role(tests.id('clan'), tests.u(2), 'connector', 'Welcomes new runners')::text, 'connector',
  'make someone a connector');
select is(public.set_clan_role(tests.id('clan'), tests.u(5), 'moderator')::text, 'moderator', 'and a moderator');
select is(public.set_clan_role(tests.id('clan'), tests.u(8), 'coach', 'Runs the tempo')::text, 'coach', 'and a coach');
select throws_ok(format($$select public.set_clan_role(%L, %L, 'captain')$$, tests.id('clan'), tests.u(2)), 'P0001',
  'invalid_argument', 'captaincy moves by transfer');
select is((select array_agg(role::text order by ord) from public.clan_roles(tests.id('clan')) with ordinality as x(a, b, c, role, d, e, ord)),
  array['captain', 'coach', 'moderator', 'connector'], 'WHO RUNS IT: captain first, then by role');
select tests.login(2);
select is((select can_start_run::text || ' ' || can_invite || ' ' || can_admit || ' ' || can_manage || ' ' || my_role_note
           from public.clan_view(tests.id('clan'))), 'true true true false Welcomes new runners',
  'a connector starts runs, invites and admits, but does not manage');
select isnt(public.clan_invite_code(tests.id('clan')), null, 'connectors read the invite code');
select tests.login(5);
select throws_ok(format($$select public.remove_clan_member(%L, %L)$$, tests.id('clan'), tests.u(2)), 'P0001',
  'clan_role_required', 'only the captain removes people with a role');
select throws_ok(format($$select public.remove_clan_member(%L, %L)$$, tests.id('clan'), tests.u(1)), 'P0001',
  'cannot_remove_captain', 'nobody removes the captain');

-- Club runs ----------------------------------------------------------------------------------------------------
select tests.login(7);
select throws_ok(format($$select public.create_clan_run(gen_random_uuid(), %L, 'running', 'Tempo', now() + interval '2 hours', 3)$$,
  tests.id('clan')), 'P0001', 'clan_role_required', 'members do not start club runs');
select tests.login(2);
select tests.keep('rkey', gen_random_uuid());
select tests.keep('run', (public.create_clan_run(tests.id('rkey'), tests.id('clan'), 'running', 'Tempo · 5 km',
  now() + interval '2 hours', 3, 2, '00000000-0000-4000-9100-000000000001', 60, 5)).run_id);
select is((public.create_clan_run(tests.id('rkey'), tests.id('clan'), 'running', 'x', now() + interval '3 hours', 9)).run_id,
  tests.id('run'), 'retry with the key: the same run');
select throws_ok(format($$select public.create_clan_run(gen_random_uuid(), %L, 'running', 'Huge', now() + interval '2 hours', 900)$$,
  tests.id('clan')), 'P0001', 'capacity_invalid', 'up to 500');
select tests.login(5);
select is((select stage::text || ' ' || down_count from public.join_clan_run(tests.id('run')) x), 'game_on 2',
  'GAME ON at the minimum');
select is((public.join_clan_run(tests.id('run'))).changed, false, 'again: same state');
select tests.login(6);
select throws_ok(format($$select public.join_clan_run(%L)$$, tests.id('run')), 'P0001', 'not_clan_member',
  'members only');
select tests.login(7);
select is((public.join_clan_run(tests.id('run'))).down_count, 3, 'full now');
select tests.login(8);
select throws_ok(format($$select public.join_clan_run(%L)$$, tests.id('run')), 'P0001', 'clan_run_full', 'capacity holds');
select tests.login(5);
select is((select status::text || ' ' || down_count from public.leave_clan_run(tests.id('run')) x), 'game_on 2',
  'leaving keeps GAME ON');
select tests.login(2);
select throws_ok(format($$select public.leave_clan_run(%L)$$, tests.id('run')), 'P0001', 'invalid_argument',
  'the host cancels instead');
select tests.login(7);
select is((select count(*)::integer from public.clan_week(tests.id('clan')) where i_am_down), 1, 'THIS WEEK shows it');
select throws_ok(format($$select public.check_in_clan_run(%L, 45.5165, -73.5862)$$, tests.id('run')), 'P0001',
  'check_in_not_open', 'check-in opens 30 minutes before');

select tests.logout();
update public.clan_runs set starts_at = now() - interval '5 minutes' where id = tests.id('run');
select tests.login(7);
select throws_ok(format($$select public.check_in_clan_run(%L, 45.60, -73.5862)$$, tests.id('run')), 'P0001', 'too_far',
  'within 300 m of the place');
select is((public.check_in_clan_run(tests.id('run'), 45.5166, -73.5861)).i_checked_in, true, 'checked in');
select is((public.check_in_clan_run(tests.id('run'), 45.5166, -73.5861)).changed, false, 'again: same state');
select tests.login(1);
select throws_ok(format($$select public.check_in_clan_run(%L, 45.5166, -73.5861)$$, tests.id('run')), 'P0001',
  'not_attending', 'tap I''M DOWN first');
select is((public.mark_clan_run_attendance(tests.id('run'), tests.u(5), true)).checked_in_count, 2,
  'the captain marks someone who was there');
select tests.login(7);
select throws_ok(format($$select public.mark_clan_run_attendance(%L, %L, true)$$, tests.id('run'), tests.u(8)), 'P0001',
  'not_host', 'only the host or a captain/organizer marks');
select ok(public.report('clan_run', tests.id('run'), 'spam') is not null, 'report a club run');

-- Mission --------------------------------------------------------------------------------------------------------
select tests.login(5);
select throws_ok(format($$select public.set_clan_mission(%L, 'Lots of km', 'distance_km', 100)$$, tests.id('clan')),
  'P0001', 'clan_role_required', 'moderators do not set missions');
select tests.login(8);
select is((public.set_clan_mission(tests.id('clan'), '100 km as a clan', 'distance_km', 100)).target, 100.00,
  'a coach sets the month''s mission');
select tests.login(7);
select is((select progress || ' ' || contributors || ' ' || my_share || ' ' || is_done from public.clan_mission(tests.id('clan'))),
  '10.00 2 5.00 false', 'progress from club-run check-ins; your share');
select tests.login(4);
select is((select coalesce(my_share::text, 'none') from public.clan_mission(tests.id('clan'))), 'none',
  'outsiders see the total, not a share');

-- Leaderboard ----------------------------------------------------------------------------------------------------
select tests.login(7);
select is((select count(*)::integer from public.clan_leaderboard(tests.id('clan'))), 2, 'two runners this month');
select tests.login(5);
select is(public.set_clan_leaderboard(tests.id('clan'), false), false, 'hide me');
select tests.login(7);
select is((select array_agg(user_id) from public.clan_leaderboard(tests.id('clan'))), array[tests.u(7)],
  'hidden people are left out');
select tests.login(5);
select is((select array_agg(user_id) from public.clan_leaderboard(tests.id('clan'))), array[tests.u(5), tests.u(7)],
  'you always see your own row');
select tests.logout();
update public.privacy_settings set history_visibility = 'only_me' where user_id = tests.u(7);
select tests.login(5);
select is((select array_agg(user_id) from public.clan_leaderboard(tests.id('clan'))), array[tests.u(5)],
  'history "only me": not listed');
select tests.logout();
update public.privacy_settings set history_visibility = 'friends' where user_id = tests.u(7);
select tests.block(7, 2);
select tests.login(2);
select is((select count(*)::integer from public.clan_leaderboard(tests.id('clan')) where user_id = tests.u(7)), 0,
  'never across a block');

-- Clan Rituals -----------------------------------------------------------------------------------------------------
select tests.login(8);
select tests.keep('crit', (public.create_ritual(gen_random_uuid(), 'running', 'Easy 6 km',
  extract(isodow from ((now() at time zone 'America/Toronto')::date + 2))::integer, '18:30', 40,
  p_clan_id => tests.id('clan'), p_min_to_go => 6, p_distance_km => 6)).id);
select is((select count(*)::integer from public.clan_week(tests.id('clan')) where ritual_id = tests.id('crit')), 1,
  'a clan Ritual prefills a club run');
select is((select runs_per_week from public.clan_view(tests.id('clan'))), 1, 'Runs a week');
select tests.login(7);
select throws_ok(format($$select public.create_ritual(gen_random_uuid(), 'running', 'Mine', 1, '18:30', 40, p_clan_id => %L)$$,
  tests.id('clan')), 'P0001', 'clan_role_required', 'members do not start clan Rituals');

-- Leaving -----------------------------------------------------------------------------------------------------------
select tests.login(1);
select throws_ok(format($$select public.leave_clan(%L)$$, tests.id('clan')), 'P0001', 'captain_must_transfer',
  'the captain hands over first');
select ok(public.transfer_clan_captaincy(tests.id('clan'), tests.u(2)), 'hand over');
select is((select my_role::text from public.clan_view(tests.id('clan'))), 'organizer', 'the old captain is an organizer');
select ok(public.leave_clan(tests.id('clan')), 'then leave');
select ok(public.leave_clan(tests.id('clan')), 'again: fine');
select is((select count(*)::integer from public.my_clans() where clan_id = tests.id('clan')), 0, 'gone from my clans');

-- Rate limit --------------------------------------------------------------------------------------------------------
select tests.login(10);
select public.create_clan(gen_random_uuid(), 'A' || n) from generate_series(1, 3) n;
select throws_ok($$select public.create_clan(gen_random_uuid(), 'Too many')$$, 'P0001', 'clan_rate_limited',
  '3 clans a day');

select * from finish();
rollback;
