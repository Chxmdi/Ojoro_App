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

-- Results (Participant Confirmed), Recap + Passport, moments, reputation, Run It Back.
select no_plan();

select tests.keep('plan', tests.make_plan(1, 4, '20 minutes'));
select tests.join(2, tests.id('plan'));
select tests.join(3, tests.id('plan'));
select tests.join(4, tests.id('plan'));
select tests.keep('a', (select id from public.activities where plan_id = tests.id('plan')));
select tests.login(1);
select public.host_check_in(tests.id('a'), tests.u(n)) from generate_series(1, 4) n;
select tests.login(2);
select throws_ok(format('select public.propose_result(%L, 5, 4, gen_random_uuid())', tests.id('a')),
  'P0001', 'result_not_open', 'no result before the game');
select tests.login(1);
select throws_ok(format('select public.run_it_back(%L, now() + interval ''7 days'', gen_random_uuid())', tests.id('a')),
  'P0001', 'activity_not_finished', 'Run It Back waits until the game is over');

-- The game happened: now in the After window.
select tests.logout();
update public.activities
   set starts_at = now() - interval '2 hours', ends_at = now() - interval '30 minutes',
       check_in_opens_at = now() - interval '150 minutes', check_in_closes_at = now() - interval '30 minutes',
       after_closes_at = now() + interval '23 hours'
 where id = tests.id('a');
select is((select effective_status from public.activity_cards where id = tests.id('a')), 'after'::public.activity_status,
  'effective status is after once the game has ended');

select tests.login(2);
select tests.keep('r', (public.propose_result(tests.id('a'), 5, 4, gen_random_uuid())).proposal_id);
select tests.logout();
select is((select threshold from public.result_proposals where id = tests.id('r')), 2, 'threshold is half of 4 players');
select is((select confirmations_count from public.result_proposals where id = tests.id('r')), 1, 'the proposer counts');
select is((select status from public.result_proposals where id = tests.id('r')), 'proposed'::public.proposal_status,
  'one confirmation is not enough');
select tests.login(5);
select throws_ok(format('select public.confirm_result(%L, gen_random_uuid())', tests.id('r')),
  'P0001', 'not_player', 'people who did not play cannot confirm the result');

-- Suggest a fix: a new proposal replaces the unverified one.
select tests.login(3);
select tests.keep('r2', (public.propose_result(tests.id('a'), 5, 3, gen_random_uuid())).proposal_id);
select tests.logout();
select is((select status from public.result_proposals where id = tests.id('r')), 'superseded'::public.proposal_status,
  'the earlier proposal is superseded');
select tests.login(2);
select throws_ok(format('select public.confirm_result(%L, gen_random_uuid())', tests.id('r')),
  'P0001', 'proposal_superseded', 'a superseded proposal cannot be confirmed');
select tests.keep('ck', gen_random_uuid());
select is((public.confirm_result(tests.id('r2'), tests.id('ck'))).status, 'verified'::public.proposal_status,
  'at the threshold the result is verified');
select is((public.confirm_result(tests.id('r2'), tests.id('ck'))).confirmations_count, 2, 'a retry returns the first result');
select is((public.confirm_result(tests.id('r2'), gen_random_uuid())).confirmations_count, 2, 'confirming twice counts once');
select tests.logout();
select is((select verification_level from public.result_proposals where id = tests.id('r2')),
  'participant_confirmed'::public.verification_level, 'verification level is Participant Confirmed');
select is((select count(*)::integer from public.recaps where activity_id = tests.id('a')), 1, 'the Recap is created');
select is((select team_a_score || '-' || team_b_score from public.recaps where activity_id = tests.id('a')), '5-3',
  'the Recap carries the verified score');
select is((select count(*)::integer from public.passport_entries where activity_id = tests.id('a')), 4,
  'every player gets a Passport stamp');
select tests.login(4);
select is((public.confirm_result(tests.id('r2'), gen_random_uuid())).confirmations_count, 3,
  'confirmations keep counting after verification');
select throws_ok(format('select public.propose_result(%L, 1, 1, gen_random_uuid())', tests.id('a')),
  'P0001', 'result_already_verified', 'a verified result is not replaced');
select tests.logout();
select is((select confirmed_count from public.recaps where activity_id = tests.id('a')), 3, 'the Recap count follows');

-- Recap reads.
select tests.login(2);
select is((select count(*)::integer from public.recap_people(tests.id('a'))), 3, 'you see the three others');
select ok((select bool_and(is_first_with_me) from public.recap_people(tests.id('a'))), 'first game with each of them');
select is((select place_game_number from public.recap_for_me(tests.id('a'))), 1, 'first stamp at this place');
select tests.login(6);
select throws_ok(format('select * from public.recap_people(%L)', tests.id('a')),
  'P0001', 'not_player', 'people who did not play do not get the people list');

-- Moments and reputation.
select tests.login(2);
select throws_ok(format('select public.add_moment(%L, %L)', tests.id('a'), tests.id('a') || '/' || tests.u(2) || '/x.jpg'),
  'P0001', 'moment_path_invalid', 'a moment needs an uploaded object at your own path');
select is(public.give_reputation(tests.id('a'), tests.u(3), 'shows_up'), true, 'players can vouch for each other');
select throws_ok(format('select public.give_reputation(%L, %L, ''shows_up'')', tests.id('a'), tests.u(2)),
  'P0001', 'invalid_argument', 'not for yourself');
select is((select count(*)::integer from public.profile_reputation(tests.u(3))), 0, 'a signal needs 5 confirmations');

-- Run It Back: a new plan with invites, never memberships or attendance.
select tests.login(6);
select throws_ok(format('select public.run_it_back(%L, now() + interval ''7 days'', gen_random_uuid())', tests.id('a')),
  'P0001', 'not_player', 'people who did not play cannot run it back');
select tests.login(2);
select throws_ok(format('select public.run_it_back(%L, now() + interval ''10 minutes'', gen_random_uuid())', tests.id('a')),
  'P0001', 'starts_at_invalid', 'Run It Back needs a time at least an hour away');
select tests.keep('rk', gen_random_uuid());
select tests.keep('new', (public.run_it_back(tests.id('a'), date_trunc('minute', now()) + interval '7 days', tests.id('rk'))).plan_id);
select is((public.run_it_back(tests.id('a'), date_trunc('minute', now()) + interval '7 days', tests.id('rk'))).plan_id,
  tests.id('new'), 'a retry returns the same plan');
select results_eq(
  format($$select invitee_id from public.plan_invites where plan_id = %L and kind = 'run_it_back' order by invitee_id$$, tests.id('new')),
  format($$select unnest(array[%L, %L, %L]::uuid[]) order by 1$$, tests.u(1), tests.u(3), tests.u(4)),
  'the other players get invites');
select tests.login(3);
select is((public.run_it_back(tests.id('a'), date_trunc('minute', now()) + interval '7 days', gen_random_uuid())).created, false,
  'another player running it back to the same time lands in the same plan');
select tests.logout();
select isnt(tests.id('new'), tests.id('plan'), 'it is a NEW plan');
select is((select source_activity_id from public.plans where id = tests.id('new')), tests.id('a'), 'linked to the old game');
select is((select source from public.plans where id = tests.id('new')), 'run_it_back'::public.plan_source, 'source is run_it_back');
select is((select member_count from public.plans where id = tests.id('new')), 0, 'nobody is in, not even the caller');
select is((select count(*)::integer from public.plan_members where plan_id = tests.id('new')), 0, 'no membership rows');
select is((select count(*)::integer from public.activities where plan_id = tests.id('new')), 0, 'no activity, no attendance');
select is((select label from public.plan_meeting_points where plan_id = tests.id('new')), 'North pitch',
  'the same meeting point');
select is((select team_a_label from public.plans where id = tests.id('new')), 'Lights', 'the same configuration');
select tests.join(3, tests.id('new'));
select is((select via from public.plan_members where plan_id = tests.id('new') and user_id = tests.u(3)),
  'invite'::public.member_via, 'people come in by tapping I''M DOWN on the invite');
select is((select count(*)::integer from public.attendance where activity_id = tests.id('a')), 4,
  'the old attendance is untouched');

select * from finish();
rollback;
