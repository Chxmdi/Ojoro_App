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

-- Call-Outs: send, see, counter, pass, withdraw, expire, and ACCEPT making exactly one event.
select no_plan();

-- Sending.
select tests.login(1);
select throws_ok($$select public.create_call_out(gen_random_uuid(), 'running', '5K', 'time', now() + interval '10 minutes',
                     p_opponent_id => tests.u(2))$$, 'P0001', 'starts_at_invalid', 'a call-out starts at least an hour out');
select throws_ok($$select public.create_call_out(gen_random_uuid(), 'running', '5K', 'time', now() + interval '1 day',
                     p_opponent_id => tests.u(1))$$, 'P0001', 'call_out_not_allowed', 'not yourself');
select throws_ok($$select public.create_call_out(gen_random_uuid(), 'curling', '5K', 'time', now() + interval '1 day',
                     p_opponent_id => tests.u(2))$$, 'P0001', 'sport_unknown', 'a known sport');
select throws_ok($$select public.create_call_out(null, 'running', '5K', 'time', now() + interval '1 day',
                     p_opponent_id => tests.u(2))$$, 'P0001', 'idempotency_key_required', 'needs a key');
select throws_ok($$select public.create_call_out(gen_random_uuid(), 'running', '', 'time', now() + interval '1 day',
                     p_opponent_id => tests.u(2))$$, 'P0001', 'invalid_argument', 'a title');

-- Blocked either way: never says which.
select tests.block(3, 1);
select tests.login(1);
select throws_ok($$select public.create_call_out(gen_random_uuid(), 'running', '5K', 'time', now() + interval '1 day',
                     p_opponent_id => tests.u(3))$$, 'P0001', 'call_out_not_allowed', 'blocked people can''t be called out');
select tests.login(3);
select throws_ok($$select public.create_call_out(gen_random_uuid(), 'running', '5K', 'time', now() + interval '1 day',
                     p_opponent_id => tests.u(1))$$, 'P0001', 'call_out_not_allowed', 'nor call out the person who blocked them');

-- Idempotent create.
select tests.login(1);
select tests.keep('key', gen_random_uuid());
select tests.keep('co', (public.create_call_out(tests.id('key'), 'running', '5K', 'time', now() + interval '3 days',
                     p_opponent_id => tests.u(2), p_target => 5, p_unit => 'km', p_message => 'Bring your legs.')).call_out_id);
select is((public.create_call_out(tests.id('key'), 'running', '5K', 'time', now() + interval '3 days',
                     p_opponent_id => tests.u(2))).call_out_id, tests.id('co'), 'a retry returns the same call-out');
select is((select count(*)::integer from public.call_outs where challenger_id = tests.u(1)), 1, 'one row');
select throws_ok($$select public.create_call_out(gen_random_uuid(), 'running', '10K', 'time', now() + interval '4 days',
                     p_opponent_id => tests.u(2))$$, 'P0001', 'call_out_pending', 'one open call-out between two people');

-- Who sees it.
select is((select status::text from public.call_out_view(tests.id('co'))), 'proposed', 'the challenger sees it, PENDING');
select is((select is_mine from public.call_out_view(tests.id('co'))), true, 'is_mine');
select is((select can_answer from public.call_out_view(tests.id('co'))), false, 'the challenger can''t answer it');
select tests.login(2);
select is((select can_answer from public.call_out_view(tests.id('co'))), true, 'the target can');
select is((select message from public.call_out_view(tests.id('co'))), 'Bring your legs.', 'the line');
select is((select count(*)::integer from public.my_call_outs()), 1, 'INCOMING CALL-OUT on Compete');
select is((select type::text || '|' || action || '|' || section || '|' || href from public.my_notifications()
            where type = 'call_out'), 'call_out|reply|needs_you|/challenge/' || tests.id('co'),
  'the target gets a call_out notification: REPLY, needs you');
select is((select title from public.my_notifications() where type = 'call_out'), 'Tester 1 called you out.', 'in words');
select tests.login(4);
select throws_ok(format($$select * from public.call_out_view(%L)$$, tests.id('co')), 'P0001', 'call_out_not_found',
  'a targeted call-out is private to the two of them');
select is((select count(*)::integer from public.call_outs where id = tests.id('co')), 0, 'RLS agrees');
select throws_ok(format($$select public.accept_call_out(%L, gen_random_uuid())$$, tests.id('co')), 'P0001',
  'call_out_not_found', 'and a stranger can''t accept it');

-- COUNTER: a new linked call-out back to the challenger; the original is countered.
select tests.login(2);
select throws_ok(format($$select public.counter_call_out(%L, gen_random_uuid())$$, tests.id('co')), 'P0001',
  'invalid_argument', 'a counter changes something');
select tests.keep('counter', (public.counter_call_out(tests.id('co'), gen_random_uuid(),
                                p_starts_at => now() + interval '4 days', p_title => '10K', p_target => 10)).call_out_id);
select is((select status::text from public.call_outs where id = tests.id('co')), 'countered', 'the original reads COUNTERED');
select is((select countered_from from public.call_outs where id = tests.id('counter')), tests.id('co'), 'linked');
select is((select challenger_id from public.call_outs where id = tests.id('counter')), tests.u(2), 'the counter is from them');
select is((select opponent_id from public.call_outs where id = tests.id('counter')), tests.u(1), 'to the challenger');
select is((select title || ' ' || target from public.call_outs where id = tests.id('counter')), '10K 10.00', 'with the change');
select throws_ok(format($$select public.accept_call_out(%L, gen_random_uuid())$$, tests.id('co')), 'P0001',
  'call_out_closed', 'the countered call-out can''t be accepted');
select tests.login(1);
select is((select title from public.my_notifications() where type = 'call_out'), 'Tester 2 countered.',
  'the challenger hears: countered');

-- PASS: quiet, no notification. Idempotent.
select tests.login(1);
select is((public.decline_call_out(tests.id('counter'))).status::text, 'declined', 'PASS');
select is((public.decline_call_out(tests.id('counter'))).created, false, 'PASS twice changes nothing');
select tests.login(2);
select is((select count(*)::integer from public.my_notifications() where type in ('challenge_response', 'call_out')
            and object_id = tests.id('counter')), 0, 'nobody is told about a pass');

-- WITHDRAW.
select tests.keep('w', tests.call_out(5, 6));
select tests.login(6);
select throws_ok(format($$select public.withdraw_call_out(%L)$$, tests.id('w')), 'P0001', 'call_out_not_allowed',
  'only the challenger withdraws');
select tests.login(5);
select is((public.withdraw_call_out(tests.id('w'))).status::text, 'withdrawn', 'withdrawn');
select tests.login(6);
select is((select section from public.my_notifications() where type = 'call_out' and object_id = tests.id('w')), 'today',
  'a withdrawn call-out no longer needs you');

-- EXPIRY is computed from the clock.
select tests.keep('exp', tests.call_out(5, 7));
update public.call_outs set expires_at = now() - interval '1 minute', created_at = now() - interval '3 days'
 where id = tests.id('exp');
select tests.login(7);
select is((select status::text from public.call_out_view(tests.id('exp'))), 'expired', 'expired after expires_at');
select throws_ok(format($$select public.accept_call_out(%L, gen_random_uuid())$$, tests.id('exp')), 'P0001',
  'call_out_expired', 'can''t accept an expired call-out');

-- ACCEPT: exactly one Challenge Event, whatever the retries.
select tests.keep('a1', tests.call_out(8, 9));
select tests.login(9);
select tests.keep('akey', gen_random_uuid());
select tests.keep('ev', (public.accept_call_out(tests.id('a1'), tests.id('akey'))).event_id);
select is((public.accept_call_out(tests.id('a1'), tests.id('akey'))).event_id, tests.id('ev'), 'same key: same event');
select is((public.accept_call_out(tests.id('a1'), gen_random_uuid())).event_id, tests.id('ev'),
  'a double tap with a new key: same event');
select is((public.accept_call_out(tests.id('a1'), gen_random_uuid())).created, false, 'and says it wasn''t created');
select is((select count(*)::integer from public.challenge_events where call_out_id = tests.id('a1')), 1,
  'exactly one Challenge Event');
select is((select status::text || '|' || event_id from public.call_outs where id = tests.id('a1')),
  'accepted|' || tests.id('ev'), 'the call-out is accepted and points at it');
select is((select count(*)::integer from public.challenge_competitors where event_id = tests.id('ev')), 2, 'two competitors');
select is((select a_captain_id from public.challenge_events where id = tests.id('ev')), tests.u(8), 'challenger is side a');
select is((select b_captain_id from public.challenge_events where id = tests.id('ev')), tests.u(9), 'accepter is side b');
select is((select body from public.challenge_feed(tests.id('ev')) where milestone = 'set'), 'THE CHALLENGE IS SET.',
  'the first milestone');
select is((select stage::text from public.challenge_event_view(tests.id('ev'))), 'accepted', 'stage: accepted');
select is((select situation from public.challenge_event_view(tests.id('ev'))), 'forming', 'forming situation');
select tests.login(8);
select is((select title from public.my_notifications() where type = 'challenge_response'), 'Tester 9 accepted.',
  'the challenger hears');
select is((select href from public.my_notifications() where type = 'challenge_response'), '/event/' || tests.id('ev'),
  'and it opens the event');
select is((public.accept_call_out(tests.id('a1'), gen_random_uuid())).event_id, tests.id('ev'),
  'the challenger tapping ACCEPT gets the same event too');
select is((select count(*)::integer from public.challenge_events where call_out_id = tests.id('a1')), 1, 'still one');

-- Rules are copied and the call-out row never changes them afterwards.
select is((select title || '|' || scoring || '|' || target from public.challenge_events where id = tests.id('ev')),
  '5K|time|5.00', 'the rules');

-- Open call-outs: the first to accept gets it; the second is told it's closed.
select tests.keep('open', tests.call_out(10, null));
select tests.login(11);
select is((select is_open from public.call_out_view(tests.id('open'))), true, 'open');
select is((select can_answer from public.call_out_view(tests.id('open'))), true, 'anyone may accept an open call-out');
select tests.keep('open_ev', (public.accept_call_out(tests.id('open'), gen_random_uuid())).event_id);
select tests.login(12);
select throws_ok(format($$select public.accept_call_out(%L, gen_random_uuid())$$, tests.id('open')), 'P0001',
  'call_out_closed', 'the second person is too late');
select is((select count(*)::integer from public.challenge_events where call_out_id = tests.id('open')), 1, 'one event');
select is((select b_user_id from public.challenge_events where id = tests.id('open_ev')), tests.u(11), 'with the first');
select tests.login(11);
select throws_ok(format($$select public.counter_call_out(%L, gen_random_uuid(), p_title => 'X')$$, tests.id('open')),
  'P0001', 'call_out_closed', 'no counter once accepted');

-- Crew vs crew: owners/admins speak for a crew.
select tests.keep('crewA', tests.make_crew(1, array[1, 2, 4]));
select tests.keep('crewB', tests.make_crew(5, array[5, 6, 7], 'Other Crew'));
select tests.login(2);
select throws_ok(format($$select public.create_call_out(gen_random_uuid(), 'football', '5 a side', 'score', now() + interval '5 days',
                     p_challenger_crew_id => %L, p_opponent_crew_id => %L)$$, tests.id('crewA'), tests.id('crewB')),
  'P0001', 'not_crew_admin', 'a member can''t call out for the crew');
select tests.login(1);
select tests.keep('crew_co', (public.create_call_out(gen_random_uuid(), 'football', '5 a side', 'score', now() + interval '5 days',
                     p_challenger_crew_id => tests.id('crewA'), p_opponent_crew_id => tests.id('crewB'))).call_out_id);
select is((select side_size from public.call_outs where id = tests.id('crew_co')), 5, 'five a side by default');
select tests.login(6);
select is((select can_answer from public.call_out_view(tests.id('crew_co'))), false, 'a crew member sees it but can''t answer');
select throws_ok(format($$select public.accept_call_out(%L, gen_random_uuid())$$, tests.id('crew_co')), 'P0001',
  'call_out_not_allowed', 'only the owner or an admin accepts');
select tests.login(5);
select is((select title from public.my_notifications() where type = 'call_out'), 'Test Crew called Other Crew out.',
  'the owner hears');
select tests.keep('crew_ev', (public.accept_call_out(tests.id('crew_co'), gen_random_uuid())).event_id);
select is((select a_name || ' vs ' || b_name from public.challenge_event_view(tests.id('crew_ev'))), 'Test Crew vs Other Crew',
  'crew names');
select tests.login(6);
select is(public.join_challenge_lineup(tests.id('crew_ev')), 2, 'a member joins the lineup');
select is(public.join_challenge_lineup(tests.id('crew_ev')), 2, 'idempotent');
select tests.login(3);
select throws_ok(format($$select public.join_challenge_lineup(%L)$$, tests.id('crew_ev')), 'P0001', 'not_competitor',
  'outsiders can''t join a crew''s lineup');

-- Report and block reach call-outs.
select tests.login(2);
select ok(public.report('call_out', tests.id('co'), 'harassment') is not null, 'a call-out can be reported');
select tests.login(12);
select throws_ok(format($$select public.report('call_out', %L, 'spam')$$, tests.id('co')), 'P0001', 'subject_not_found',
  'only one you can see');
select tests.keep('bl', tests.call_out(4, 2));
select tests.login(2);
select ok(public.block_user(tests.u(4)), 'block the challenger');
select is((select status::text from public.call_outs where id = tests.id('bl')), null, 'the blocker no longer sees it');
select tests.logout();
select is((select status::text from public.call_outs where id = tests.id('bl')), 'withdrawn', 'and it ended');

-- Analytics: facts only.
select ok((select count(*) from private.analytics_events where name = 'callout_sent') >= 5, 'callout_sent');
select is((select count(*)::integer from private.analytics_events where name = 'challenge_event_created'
            and payload ->> 'call_out_id' = tests.id('a1')::text), 1, 'challenge_event_created once');

select * from finish();
rollback;
