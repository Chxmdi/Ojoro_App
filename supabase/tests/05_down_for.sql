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

-- Down For: required expiry, idempotent creation, matching into Plan Forming.
-- Uses running (no seed plans or signals) so seed data can't join the matches.
select no_plan();

select tests.login(1);
select throws_ok($$select public.create_down_for(gen_random_uuid(), 'running', now() + interval '2 hours',
  now() + interval '5 hours', null)$$, 'P0001', 'expiry_required', 'a Down For needs an expiry');
select throws_ok($$select public.create_down_for(gen_random_uuid(), 'running', now() + interval '2 hours',
  now() + interval '5 hours', now() + interval '6 hours')$$, 'P0001', 'expiry_invalid',
  'a Down For cannot outlive its window');
select throws_ok($$select public.create_down_for(gen_random_uuid(), 'running', now() + interval '5 hours',
  now() + interval '2 hours', now() + interval '2 hours')$$, 'P0001', 'window_invalid', 'the window must make sense');
select tests.logout();
select throws_ok(format($$insert into public.intent_signals (user_id, sport_id, window_start, window_end, radius_km)
  values (%L, 'running', now() + interval '1 hour', now() + interval '2 hours', 5)$$, tests.u(1)),
  '23502', null, 'the table itself refuses a signal without expiry');

-- Idempotent creation.
select tests.keep('key', gen_random_uuid());
select tests.login(1);
select tests.keep('s1', (public.create_down_for(tests.id('key'), 'running', now() + interval '2 hours',
  now() + interval '5 hours', now() + interval '5 hours')).signal_id);
select is((select status from public.intent_signals where id = tests.id('s1')), 'active'::public.signal_status,
  'alone, the signal stays active');
select is((public.create_down_for(tests.id('key'), 'running', now() + interval '2 hours',
  now() + interval '5 hours', now() + interval '5 hours')).signal_id, tests.id('s1'), 'a retry returns the same signal');
select is((public.create_down_for(gen_random_uuid(), 'running', now() + interval '3 hours',
  now() + interval '6 hours', now() + interval '6 hours')).created, false,
  'an overlapping Down For for the same sport is the same intent');
select tests.logout();
select is((select count(*)::integer from public.intent_signals where user_id = tests.u(1)), 1, 'no duplicate signal');
select throws_ok(format($$insert into public.intent_signals (user_id, sport_id, window_start, window_end, expires_at, radius_km)
  values (%L, 'running', now() + interval '4 hours', now() + interval '7 hours', now() + interval '7 hours', 5)$$, tests.u(1)),
  '23P01', null, 'the table refuses an overlapping active signal');

-- Local seed data (seed_places.sql's runs tonight, other samples) has real forming plans nearby that a
-- signal could rightly join. These assertions are about the test's own plan, so other people's forming
-- plans are taken out of matching for this transaction only (rolled back with everything else).
update public.plans set audience = 'invite_only'
 where status = 'forming' and host_id not in (select tests.u(n) from generate_series(1, 12) n);

-- Matching: a compatible signal forms a plan with both people in it.
select tests.login(2);
select tests.keep('m', (public.create_down_for(gen_random_uuid(), 'running', now() + interval '1 hour',
  now() + interval '4 hours', now() + interval '4 hours')).matched_plan_id);
select isnt(tests.id('m'), null, 'two compatible signals form a plan');
select tests.logout();
select is((select member_count from public.plans where id = tests.id('m')), 2, 'both are in');
select is((select source from public.plans where id = tests.id('m')), 'down_for'::public.plan_source, 'source is down_for');
select is((select status from public.intent_signals where id = tests.id('s1')), 'matched'::public.signal_status,
  'the earlier signal is matched too');
select is((select starts_at from public.plans where id = tests.id('m')), now() + interval '2 hours',
  'the plan starts at the newest window start the group shares');
select is((select place_id from public.plans where id = tests.id('m')), '00000000-0000-4000-9100-000000000001'::uuid,
  'the nearest place for the sport is proposed');
select ok((select deadline_at <= starts_at and deadline_at > now() from public.plans where id = tests.id('m')),
  'the plan has a deadline before it starts');

-- A third signal joins the existing plan.
select tests.login(3);
select is((public.create_down_for(gen_random_uuid(), 'running', now() + interval '1 hour',
  now() + interval '6 hours', now() + interval '6 hours')).matched_plan_id, tests.id('m'),
  'a later compatible signal joins the forming plan');
select tests.logout();
select is((select member_count from public.plans where id = tests.id('m')), 3, 'three in');

-- Blocks keep people apart.
select tests.login(4);
select public.block_user(tests.u(1));
select is((public.create_down_for(gen_random_uuid(), 'running', now() + interval '1 hour',
  now() + interval '6 hours', now() + interval '6 hours')).status, 'active'::public.signal_status,
  'someone who blocked a member is not matched into that plan');

-- Minimum participants.
select tests.login(5);
select public.create_down_for(gen_random_uuid(), 'running', now() + interval '1 day 2 hours',
  now() + interval '1 day 5 hours', now() + interval '1 day 5 hours', p_min_participants => 4);
select tests.login(6);
select is((public.create_down_for(gen_random_uuid(), 'running', now() + interval '1 day 2 hours',
  now() + interval '1 day 5 hours', now() + interval '1 day 5 hours')).matched_plan_id, null::uuid,
  'no plan until everyone''s minimum can be met');

-- Withdraw.
select tests.login(5);
select tests.keep('s5', (select id from public.intent_signals where user_id = tests.u(5)));
select is(public.withdraw_down_for(tests.id('s5')), 'withdrawn'::public.signal_status, 'a signal can be withdrawn');
select is(public.withdraw_down_for(tests.id('s5')), 'withdrawn'::public.signal_status, 'withdrawing again is a no-op');
select tests.login(6);
select throws_ok(format('select public.withdraw_down_for(%L)', tests.id('s5')),
  'P0001', 'signal_not_found', 'you cannot withdraw someone else''s signal');

-- Down For near you never includes location.
select tests.login(7);
select is((select count(*)::integer from public.down_for_nearby('running') where user_id = tests.u(6)), 1,
  'others see the person who is down');
select is((select count(*)::integer from information_schema.parameters
           where specific_schema = 'public' and specific_name like 'down_for_nearby%' and parameter_mode = 'OUT'
             and parameter_name ~ '(lat|lng|area|radius)'), 0,
  'down_for_nearby returns no location or radius');
select tests.logout();

select * from finish();
rollback;
