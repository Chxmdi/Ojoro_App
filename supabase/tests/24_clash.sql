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

-- Step 6 (Communities): Ojoro Clash: propose and answer, visibility, squads, results (captains and
-- organizers, never rewritten), the score and stages, crowd backing, standings, report.
select no_plan();

-- Two open clans: A (Tester 1 captain; 2 and 3) and B (Tester 5 captain; 6).
select tests.login(1);
select tests.keep('A', (public.create_clan(gen_random_uuid(), 'Alpha Runners', 'open', p_short_name => 'Alpha')).id);
select tests.login(2);
select public.join_clan(tests.id('A'));
select tests.login(3);
select public.join_clan(tests.id('A'));
select tests.login(5);
select tests.keep('B', (public.create_clan(gen_random_uuid(), 'Beta Runners', 'open', p_short_name => 'Beta')).id);
select tests.login(6);
select public.join_clan(tests.id('B'));

select tests.logout();
create function tests.events(p_first interval) returns jsonb language sql stable as $$
  select jsonb_build_array(
    jsonb_build_object('title', '4 × 1 km relay', 'sport_id', 'running', 'scoring', 'time',
                       'starts_at', now() + p_first, 'place_id', '00000000-0000-4000-9100-000000000001', 'squad_size', 2),
    jsonb_build_object('title', '3v3 basketball', 'sport_id', 'basketball', 'scoring', 'score',
                       'starts_at', now() + p_first + interval '3 days'),
    jsonb_build_object('title', 'Final · 10K', 'sport_id', 'running', 'scoring', 'time',
                       'starts_at', now() + p_first + interval '10 days'));
$$;
grant execute on function tests.events(interval) to authenticated;

-- Propose ---------------------------------------------------------------------------------------------------
select tests.login(2);
select throws_ok(format($$select public.create_clash(gen_random_uuid(), %L, %L, 'Fall Clash', tests.events('2 hours'))$$,
  tests.id('A'), tests.id('B')), 'P0001', 'clan_role_required', 'members do not start a Clash');
select tests.login(1);
select throws_ok(format($$select public.create_clash(gen_random_uuid(), %L, %L, 'Mirror', tests.events('2 hours'))$$,
  tests.id('A'), tests.id('A')), 'P0001', 'clash_not_allowed', 'not against yourself');
select throws_ok(format($$select public.create_clash(gen_random_uuid(), %L, %L, 'Empty', '[]')$$,
  tests.id('A'), tests.id('B')), 'P0001', 'invalid_argument', 'at least one event');
select throws_ok(format($$select public.create_clash(gen_random_uuid(), %L, %L, 'Soon', tests.events('10 minutes'))$$,
  tests.id('A'), tests.id('B')), 'P0001', 'starts_at_invalid', 'events start at least an hour ahead');
select tests.keep('xkey', gen_random_uuid());
select tests.keep('x', (public.create_clash(tests.id('xkey'), tests.id('A'), tests.id('B'), 'Fall Clash',
  tests.events('2 hours'), 'Test season')).clash_id);
select is((public.create_clash(tests.id('xkey'), tests.id('A'), tests.id('B'), 'Again', tests.events('2 hours'))).clash_id,
  tests.id('x'), 'retry with the key: the same Clash');
select throws_ok(format($$select public.create_clash(gen_random_uuid(), %L, %L, 'Second', tests.events('2 hours'))$$,
  tests.id('B'), tests.id('A')), 'P0001', 'not_clan_member', 'only for your own clan');
select throws_ok(format($$select public.create_clash(gen_random_uuid(), %L, %L, 'Second', tests.events('2 hours'))$$,
  tests.id('A'), tests.id('B')), 'P0001', 'clash_pending', 'one open Clash between two clans');
select is((select stage::text || ' ' || situation from public.clash_view(tests.id('x'))), 'proposed forming', 'proposed');

select tests.login(10);
select throws_ok(format($$select * from public.clash_view(%L)$$, tests.id('x')), 'P0001', 'clash_not_found',
  'outsiders do not see a proposal');

-- Answer --------------------------------------------------------------------------------------------------------
select tests.login(6);
select throws_ok(format($$select public.accept_clash(%L)$$, tests.id('x')), 'P0001', 'not_clash_captain',
  'members do not answer');
select tests.login(1);
select throws_ok(format($$select public.accept_clash(%L)$$, tests.id('x')), 'P0001', 'not_clash_captain',
  'the proposing side does not accept its own');
select tests.login(5);
select is((public.accept_clash(tests.id('x'))).stage::text, 'upcoming', 'accepted');
select is((public.accept_clash(tests.id('x'))).created, false, 'again: same state');
select throws_ok(format($$select public.decline_clash(%L)$$, tests.id('x')), 'P0001', 'clash_closed',
  'too late to decline');
select tests.login(10);
select is((select a_short_name || ' ' || b_short_name || ' ' || stage || ' ' || coalesce(my_side::text, 'none')
           from public.clash_view(tests.id('x'))), 'Alpha Beta upcoming none', 'outsiders see it once it''s on');
select ok(public.report('clash', tests.id('x'), 'spam') is not null, 'report a Clash');

select tests.keep('e1', (select clash_event_id from public.clash_events_list(tests.id('x')) where position = 1));
select tests.keep('e2', (select clash_event_id from public.clash_events_list(tests.id('x')) where position = 2));
select tests.keep('e3', (select clash_event_id from public.clash_events_list(tests.id('x')) where position = 3));

-- Squads ---------------------------------------------------------------------------------------------------------
select tests.login(2);
select is((public.join_clash_squad(tests.id('e1'))).squad_count, 1, 'I''M DOWN for the squad');
select is((public.join_clash_squad(tests.id('e1'))).changed, false, 'again: same state');
select is((select position || ' ' || i_am_in || ' ' || squad_taken from public.clash_my_part(tests.id('x'))), '1 true 1',
  'YOUR PART: the event you''re in');
select tests.login(3);
select is((select position || ' ' || i_am_in from public.clash_my_part(tests.id('x'))), '1 false',
  'YOUR PART: the next squad with room');
select public.join_clash_squad(tests.id('e1'));
select tests.login(1);
select throws_ok(format($$select public.join_clash_squad(%L)$$, tests.id('e1')), 'P0001', 'squad_full', 'squads hold their size');
select tests.login(6);
select is((public.join_clash_squad(tests.id('e1'))).side::text, 'b', 'the other clan has its own squad');
select tests.login(10);
select throws_ok(format($$select public.join_clash_squad(%L)$$, tests.id('e1')), 'P0001', 'not_clan_member',
  'squads are for the two clans');
select is((select count(*)::integer from public.clash_my_part(tests.id('x'))), 0, 'no part for outsiders');
select tests.login(3);
select is((public.leave_clash_squad(tests.id('e1'))).i_am_in, false, 'out again');

-- Backing ------------------------------------------------------------------------------------------------------------
select tests.login(10);
select is((select backing_a || ' ' || backing_b from public.back_clash(tests.id('x'), 'a') s), '1 0', 'back Alpha');
select is((select backing_a || ' ' || backing_b from public.back_clash(tests.id('x'), 'b') s), '0 1', 'switch');
select is((select backing_a || ' ' || backing_b from public.back_clash(tests.id('x'), 'b') s), '0 1',
  'again: same state');
select is((select backing_a || ' ' || backing_b || ' ' || coalesce(my_backing::text, 'none')
           from public.back_clash(tests.id('x')) s), '0 0 none', 'stop backing');
select tests.login(6);
select throws_ok(format($$select public.back_clash(%L, 'a')$$, tests.id('x')), 'P0001', 'prediction_not_allowed',
  'members back their own clan');
select is((public.back_clash(tests.id('x'), 'b')).backing_b, 1, 'their own clan: fine');

-- Results ----------------------------------------------------------------------------------------------------------
select tests.login(1);
select throws_ok(format($$select public.submit_clash_result(%L, 300, 310, gen_random_uuid())$$, tests.id('e1')),
  'P0001', 'clash_event_not_started', 'no result before the event');
select tests.logout();
update public.clash_events set starts_at = now() - interval '1 hour' where id = tests.id('e1');
select tests.login(10);
select is((select stage::text || ' ' || situation from public.clash_view(tests.id('x'))), 'live live', 'live from the first event');
select tests.login(6);
select throws_ok(format($$select public.submit_clash_result(%L, 300, 310, gen_random_uuid())$$, tests.id('e1')),
  'P0001', 'not_clash_captain', 'captains and organizers only');
select tests.login(1);
select tests.keep('skey', gen_random_uuid());
select tests.keep('sub', (public.submit_clash_result(tests.id('e1'), 300, 310, tests.id('skey'))).submission_id);
select is((public.submit_clash_result(tests.id('e1'), 999, 1, tests.id('skey'))).submission_id, tests.id('sub'),
  'retry with the key: the same submission');
select is((select state::text || ' ' || pending_a_value from public.clash_events_list(tests.id('x')) where position = 1),
  'verifying 300.00', 'NOT FINAL for captains');
select tests.login(10);
select is((select state::text || ' ' || coalesce(pending_submission_id::text, 'hidden') from public.clash_events_list(tests.id('x'))
           where position = 1), 'verifying hidden', 'outsiders never see a pending result');
select tests.login(1);
select throws_ok(format($$select public.confirm_clash_result(%L)$$, tests.id('sub')), 'P0001', 'not_clash_captain',
  'the other side confirms');
select tests.login(5);
select is((select status || ' ' || winner_side || ' ' || source from public.confirm_clash_result(tests.id('sub')) s),
  'final a captains_confirmed', 'confirmed: lower time wins');
select is((public.confirm_clash_result(tests.id('sub'))).status, 'final', 'again: same state');
select is((select a_wins || '-' || b_wins || ' ' || leader || ' ' || decided_count || '/' || event_count
           from public.clash_view(tests.id('x'))), '1-0 a 1/3', 'the score');
select throws_ok(format($$select public.submit_clash_result(%L, 1, 2, gen_random_uuid())$$, tests.id('e1')),
  'P0001', 'result_already_verified', 'one result per event');
select tests.logout();
select throws_ok(format($$update public.clash_event_results set winner_side = 'b' where clash_event_id = %L$$, tests.id('e1')),
  'P0001', 'result_already_verified', 'results are never rewritten');

-- Organizers: both captains approve; their result is final at once.
select tests.login(1);
select is(public.propose_clash_organizer(tests.id('x'), tests.u(9)), false, 'one side proposed: not yet');
select throws_ok(format($$select public.propose_clash_organizer(%L, %L)$$, tests.id('x'), tests.u(2)), 'P0001',
  'organizer_not_allowed', 'not someone from either clan');
select tests.login(5);
select is(public.propose_clash_organizer(tests.id('x'), tests.u(9)), true, 'both sides: approved');
select tests.logout();
update public.clash_events set starts_at = now() - interval '30 minutes' where id = tests.id('e2');
select tests.login(9);
select is((select status || ' ' || winner_side || ' ' || source
           from public.submit_clash_result(tests.id('e2'), 17, 21, gen_random_uuid()) s),
  'final b organizer_verified', 'organizer verified');
select tests.login(10);
select is((select a_wins || '-' || b_wins || ' ' || coalesce(leader::text, 'level') from public.clash_view(tests.id('x'))),
  '1-1 level', 'level');
select is((select result_source::text from public.clash_events_list(tests.id('x')) where position = 2), 'organizer_verified',
  '"Organizer verified" on the row');

-- The final decides it.
select tests.logout();
update public.clash_events set starts_at = now() - interval '10 minutes' where id = tests.id('e3');
select tests.login(9);
select public.submit_clash_result(tests.id('e3'), 2900, 3100, gen_random_uuid());
select tests.login(10);
select is((select stage::text || ' ' || situation || ' ' || a_wins || '-' || b_wins from public.clash_view(tests.id('x'))),
  'complete after 2-1', 'complete once the final is decided');
select throws_ok(format($$select public.back_clash(%L, 'a')$$, tests.id('x')), 'P0001', 'backing_closed',
  'backing closes when it''s over');
select tests.login(2);
select is((select our_wins || '-' || their_wins || ' ' || standing || ' ' || stage from public.clan_clashes(tests.id('A'))),
  '2-1 leading complete', 'the clan''s Clash row');
select tests.login(6);
select is((select our_wins || '-' || their_wins || ' ' || standing from public.clan_clashes(tests.id('B'))),
  '1-2 trailing', 'from the other side');
select is((select won || ' ' || events_won from public.clash_season_standings('Test season') where clan_id = tests.id('A')),
  '1 2', 'season standings');

-- Cancel ----------------------------------------------------------------------------------------------------------
select tests.login(1);
select tests.keep('y', (public.create_clash(gen_random_uuid(), tests.id('A'), tests.id('B'), 'Spring Clash',
  tests.events('5 days'))).clash_id);
select tests.login(5);
select public.accept_clash(tests.id('y'));
select is((public.cancel_clash(tests.id('y'))).stage::text, 'cancelled', 'either side calls it off before it starts');
select is((public.cancel_clash(tests.id('y'))).created, false, 'again: same state');
select tests.login(2);
select throws_ok(format($$select public.back_clash(%L, 'a')$$, tests.id('y')), 'P0001', 'backing_closed',
  'no backing a called-off Clash');
select tests.login(10);
select throws_ok(format($$select * from public.clash_view(%L)$$, tests.id('y')), 'P0001', 'clash_not_found',
  'outsiders don''t see a called-off Clash');

select * from finish();
rollback;
