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

-- Event day, LIVE, result verification, corrections, rivalries and rematches. Past results are
-- never rewritten.
select no_plan();

select tests.keep('ev', tests.event(1, 2));

-- Stages from the clock.
select tests.login(1);
select is((select stage::text from public.challenge_event_view(tests.id('ev'))), 'accepted', 'just accepted');
select tests.logout();
update public.challenge_events set accepted_at = now() - interval '2 days' where id = tests.id('ev');
select tests.login(1);
select is((select stage::text from public.challenge_event_view(tests.id('ev'))), 'days', 'days away');
select tests.starts_in(tests.id('ev'), '2 hours');
select is((select stage::text || '|' || situation from public.challenge_event_view(tests.id('ev'))), 'today|confirmed', 'today');
select tests.starts_in(tests.id('ev'), '20 minutes');
select is((select stage::text from public.challenge_event_view(tests.id('ev'))), 'soon', 'ALMOST TIME');

-- Check-in: competitors only, from an hour before.
select tests.starts_in(tests.id('ev'), '2 hours');
select throws_ok(format($$select public.check_in_challenge(%L)$$, tests.id('ev')), 'P0001', 'check_in_not_open',
  'check-in opens an hour before');
select tests.starts_in(tests.id('ev'), '20 minutes');
select tests.login(3);
select throws_ok(format($$select public.check_in_challenge(%L)$$, tests.id('ev')), 'P0001', 'not_competitor',
  'spectators don''t check in');
select tests.login(1);
select throws_ok(format($$select public.ready_challenge(%L)$$, tests.id('ev')), 'P0001', 'not_checked_in',
  'check in before I''M READY');
select is((public.check_in_challenge(tests.id('ev'))).a_checked_in, true, 'checked in');
select is((public.check_in_challenge(tests.id('ev'))).a_checked_in, true, 'idempotent');
select is((public.ready_challenge(tests.id('ev'))).a_ready, true, 'ready');
select is((select status::text from public.challenge_events where id = tests.id('ev')), 'scheduled', 'not live with one ready');
select tests.login(2);
select public.check_in_challenge(tests.id('ev'));
select is((select count(*)::integer from public.challenge_feed(tests.id('ev')) where milestone = 'both_here'), 1, 'BOTH ARE HERE');
select ok((public.ready_challenge(tests.id('ev'))).live_at is not null, 'both ready: LIVE');
select is((public.ready_challenge(tests.id('ev'))).stage::text, 'live', 'ready again is fine');

-- Live progress: competitors only.
select tests.login(3);
select throws_ok(format($$select public.log_challenge_progress(%L, 1, 1)$$, tests.id('ev')), 'P0001', 'not_competitor',
  'spectators don''t log progress');
select tests.login(1);
select is((public.log_challenge_progress(tests.id('ev'), 3.4, 3.1)).changed, true, 'progress');
select is((public.log_challenge_progress(tests.id('ev'), 3.4, 3.1)).changed, false, 'same values: no change');
select is((select a_progress || '/' || b_progress || '|' || progress_logged_by_name from public.challenge_event_view(tests.id('ev'))),
  '3.40/3.10|Tester 1', 'lanes and who logged');

-- Predictions for the crowd's call (made before LIVE, so set them directly).
select tests.logout();
insert into public.challenge_predictions (event_id, user_id, side)
select tests.id('ev'), tests.u(n), case when n <= 8 then 'b'::public.team_side else 'a'::public.team_side end
from generate_series(3, 10) n;
select private.challenge_recount(tests.id('ev'));

-- Result: only captains submit; it's NOT FINAL until the other confirms.
select tests.login(3);
select throws_ok(format($$select public.submit_challenge_result(%L, 1368, 1411, gen_random_uuid())$$, tests.id('ev')),
  'P0001', 'not_competitor', 'a non-participant can''t submit a result');
select tests.login(2);
select tests.keep('skey', gen_random_uuid());
select tests.keep('sub', (public.submit_challenge_result(tests.id('ev'), 1400, 1411, tests.id('skey'))).submission_id);
select is((public.submit_challenge_result(tests.id('ev'), 1400, 1411, tests.id('skey'))).submission_id, tests.id('sub'),
  'idempotent submit');
select is((select stage::text from public.challenge_event_view(tests.id('ev'))), 'verifying', 'VERIFYING');
select tests.login(3);
select is((select winner_side from public.challenge_event_view(tests.id('ev'))), null, 'nobody is called the winner yet');
select is((select count(*)::integer from public.challenge_result_submissions where event_id = tests.id('ev')), 0,
  'spectators don''t see NOT FINAL numbers');
select throws_ok(format($$select * from public.challenge_verification(%L)$$, tests.id('ev')), 'P0001', 'not_competitor',
  'nor the checks');
select tests.login(1);
select is((select i_need_to_confirm from public.challenge_verification(tests.id('ev'))), true, 'your confirmation: WAITING');
select is((select jsonb_array_length(checks) from public.challenge_verification(tests.id('ev'))), 2, 'one check per captain');
select is((select needs_you from public.my_notifications() where type = 'challenge_to_confirm'), true,
  'the other captain is asked to confirm');

-- REQUEST A CORRECTION pauses it; a new submission answers it.
select is((public.request_challenge_correction(tests.id('ev'), 'My time was 22:48.')).stage::text, 'disputed', 'paused');
select is((public.request_challenge_correction(tests.id('ev'))).stage::text, 'disputed', 'idempotent');
select tests.login(2);
select throws_ok(format($$select public.confirm_challenge_result(%L, gen_random_uuid())$$, tests.id('sub')), 'P0001',
  'correction_open', 'no confirming while a correction is open');
select tests.login(1);
select tests.keep('sub2', (public.submit_challenge_result(tests.id('ev'), 1368, 1411, gen_random_uuid(),
  'Out hard, held it through the last climb.')).submission_id);
select is((select status::text from public.challenge_result_submissions where id = tests.id('sub')), 'superseded',
  'the old numbers are replaced');
select is((select stage::text from public.challenge_event_view(tests.id('ev'))), 'verifying', 'verifying again');
select tests.login(2);
select throws_ok(format($$select public.confirm_challenge_result(%L, gen_random_uuid())$$, tests.id('sub')), 'P0001',
  'proposal_superseded', 'the replaced submission can''t be confirmed');
select tests.keep('ckey', gen_random_uuid());
select is((public.confirm_challenge_result(tests.id('sub2'), tests.id('ckey'))).verified, true, 'CONFIRM BOTH TIMES: final');
select is((public.confirm_challenge_result(tests.id('sub2'), tests.id('ckey'))).verified, true, 'idempotent');
select is((select count(*)::integer from public.challenge_results where event_id = tests.id('ev')), 1, 'one result');

select tests.login(3);
select is((select stage::text || '|' || winner_side || '|' || margin from public.challenge_event_view(tests.id('ev'))),
  'complete|a|43.00', 'COMPLETE: side a wins by 43 s');
select is((select crowd_called_it from public.challenge_event_view(tests.id('ev'))), false, 'the crowd got it wrong');
select is((select crowd_pick_side::text || ' ' || crowd_pick_pct from public.challenge_event_view(tests.id('ev'))), 'b 75',
  '75% picked side b');
select is((select body from public.challenge_feed(tests.id('ev')) where milestone = 'result'), 'TESTER 1 WINS.', 'the result post');
select tests.login(1);
select throws_ok(format($$select public.submit_challenge_result(%L, 1, 2, gen_random_uuid())$$, tests.id('ev')), 'P0001',
  'result_already_verified', 'no new numbers after COMPLETE');
select tests.logout();
select throws_ok(format($$update public.challenge_results set a_value = 1500 where event_id = %L$$, tests.id('ev')), 'P0001',
  'result_already_verified', 'a result can''t be rewritten, even by the database owner');
select throws_ok(format($$delete from public.challenge_results where event_id = %L$$, tests.id('ev')), 'P0001',
  'result_already_verified', 'or removed');

-- Rivalry: computed from results.
select tests.keep('riv', (select rivalry_id from public.challenge_events where id = tests.id('ev')));
select tests.login(2);
select is((select a_name || ' ' || a_wins || '-' || b_wins || ' ' || b_name from public.rivalry_view(tests.id('riv'))),
  'Tester 2 0-1 Tester 1', 'you are side a of your rivalry');
select is((select form from public.rivalry_view(tests.id('riv'))), array['b'], 'form');

-- Rematch: a new linked call-out; accepting makes a new event; the old result stays.
select tests.login(3);
select throws_ok(format($$select public.run_it_back_challenge(%L, gen_random_uuid())$$, tests.id('ev')), 'P0001',
  'not_competitor', 'spectators can''t ask for a rematch');
select tests.login(2);
select tests.keep('rm', (public.run_it_back_challenge(tests.id('ev'), gen_random_uuid(), p_message => 'Same loop, two weeks.')).call_out_id);
select is((public.run_it_back_challenge(tests.id('ev'), gen_random_uuid())).call_out_id, tests.id('rm'),
  'asking again returns the same call-out');
select is((select rematch_of_event_id::text || '|' || rivalry_id::text from public.call_outs where id = tests.id('rm')),
  tests.id('ev')::text || '|' || tests.id('riv')::text, 'linked to the event and the rivalry');
select ok((select starts_at from public.call_outs where id = tests.id('rm')) > now() + interval '13 days', 'two weeks on');
select tests.login(1);
select is((select rematch_call_out_id from public.rivalry_view(tests.id('riv'))), tests.id('rm'), 'REMATCH? on Rivalry');
select is((select rematch_can_answer from public.rivalry_view(tests.id('riv'))), true, 'RUN IT BACK is offered');
select is((select title from public.my_notifications() where type = 'call_out'), 'Tester 2 wants a rematch.', 'in Updates');
select tests.keep('rm_state_ev', (public.run_it_back_challenge(tests.id('ev'), gen_random_uuid())).event_id);
select isnt(tests.id('rm_state_ev'), null, 'RUN IT BACK on their request accepts it');
select is((select rematch_of_event_id from public.challenge_events where id = tests.id('rm_state_ev')), tests.id('ev'),
  'a new event linked to the old one');
select is((select rivalry_id from public.challenge_events where id = tests.id('rm_state_ev')), tests.id('riv'), 'same rivalry');
select is((select count(*)::integer from public.challenge_events where call_out_id = tests.id('rm')), 1, 'exactly one');
select is((select a_value || '/' || b_value || '/' || winner_side from public.challenge_results where event_id = tests.id('ev')),
  '1368.00/1411.00/a', 'the first result is exactly as it was');

-- Finish the rematch the other way round: rivalry 1-1, history untouched.
select tests.go_live(tests.id('rm_state_ev'), 2, 1);
select tests.finish(tests.id('rm_state_ev'), 2, 1, 1300, 1350);
select tests.login(1);
select is((select a_wins || '-' || b_wins || '|' || meetings from public.rivalry_view(tests.id('riv'))), '1-1|2', 'record 1-1');
select is((select form from public.rivalry_view(tests.id('riv'))), array['a', 'b'], 'form, oldest first');
select is((select streak_side || streak_length from public.rivalry_view(tests.id('riv'))), 'b1', 'streak');
select is((select count(*)::integer from public.rivalry_meetings(tests.id('riv'))), 2, 'two meetings');
select is((select winner from public.rivalry_meetings(tests.id('riv')) limit 1), 'b', 'newest first');
select is((select count(*)::integer from public.my_rivalries()), 1, 'Compete lists it');
select is((select a_value || '/' || b_value from public.challenge_results where event_id = tests.id('ev')), '1368.00/1411.00',
  'still exactly as it was');

-- Draws.
select tests.keep('d', tests.event(5, 6));
select tests.go_live(tests.id('d'), 5, 6);
select tests.logout();
update public.challenge_events set scoring = 'score' where id = tests.id('d');
select tests.finish(tests.id('d'), 5, 6, 3, 3);
select tests.login(5);
select is((select is_draw from public.challenge_event_view(tests.id('d'))), true, 'a draw');
select is((select body from public.challenge_feed(tests.id('d')) where milestone = 'result'), 'IT''S A DRAW.', 'said plainly');

-- Cancel before LIVE only; no-shows close themselves.
select tests.keep('c', tests.event(7, 8));
select tests.login(9);
select throws_ok(format($$select public.cancel_challenge_event(%L)$$, tests.id('c')), 'P0001', 'not_competitor',
  'only a captain calls it off');
select tests.login(7);
select is(public.cancel_challenge_event(tests.id('c'))::text, 'cancelled', 'called off');
select tests.login(1);
select throws_ok(format($$select public.cancel_challenge_event(%L)$$, tests.id('ev')), 'P0001', 'challenge_started',
  'not after LIVE');

select tests.keep('ns', tests.event(9, 10));
select tests.logout();
update public.challenge_events set starts_at = now() - interval '4 hours', check_in_opens_at = now() - interval '5 hours'
 where id = tests.id('ns');
select tests.login(9);
select is((select stage::text from public.challenge_event_view(tests.id('ns'))), 'cancelled', 'nobody started it: cancelled');
select tests.logout();
select ok((private.challenge_tick() ->> 'closed')::integer >= 1, 'the minute job stores it');
select is((select cancel_reason from public.challenge_events where id = tests.id('ns')), 'no_show', 'no_show');

-- Countdown milestones from the minute job.
select tests.keep('m', tests.event(11, 12, '2 days'));
update public.challenge_events set accepted_at = now() - interval '3 days', starts_at = now() + interval '20 hours'
 where id = tests.id('m');
select private.challenge_tick();
select private.challenge_tick();
select is((select count(*)::integer from public.challenge_posts where event_id = tests.id('m') and milestone = 'tomorrow'), 1,
  'TOMORROW., once');

select * from finish();
rollback;
