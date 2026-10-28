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

-- Time rules: effective status from timestamps, the minute job, STILL ON TONIGHT.
select no_plan();

select ok(exists (select 1 from cron.job where jobname = 'ojoro_tick'), 'the minute job is scheduled');

-- A plan past its deadline reads as expired before the job runs.
select tests.keep('late', tests.make_plan(1, 8));
select tests.join(2, tests.id('late'));
update public.plans set deadline_at = now() - interval '1 minute' where id = tests.id('late');
select tests.login(2);
select is((select effective_status from public.plan_cards where id = tests.id('late')), 'expired'::public.plan_status,
  'effective status is expired once the deadline passes');
select is((select status from public.plan_cards where id = tests.id('late')), 'forming'::public.plan_status,
  'even though the stored status has not moved yet');

-- STILL ON TONIGHT: same sport family, nearby, spots left, soon, visible.
select tests.logout();
select tests.keep('other', tests.make_plan(3, 8, '4 hours'));
select tests.keep('far_future', tests.make_plan(3, 8, '3 days'));
select tests.keep('hidden', tests.make_plan(3, 8, '4 hours', 'invite_only'));
select tests.login(2);
select ok(exists (select 1 from public.still_on_nearby(tests.id('late')) where plan_id = tests.id('other')),
  'a plan still on tonight is offered');
select ok(not exists (select 1 from public.still_on_nearby(tests.id('late'))
                      where plan_id in (tests.id('late'), tests.id('far_future'), tests.id('hidden'))),
  'not the expired plan itself, not days away, not plans you cannot see');
select ok(exists (select 1 from public.plans_nearby('football') where plan_id = tests.id('far_future')),
  'plans_nearby looks a week ahead');

select tests.logout();
select private.tick();
select is((select status from public.plans where id = tests.id('late')), 'expired'::public.plan_status,
  'the job stores the expiry (realtime subscribers get the UPDATE)');

-- Signals expire.
insert into public.intent_signals (user_id, sport_id, window_start, window_end, expires_at, radius_km, created_at)
values (tests.u(4), 'running', now() - interval '3 hours', now() + interval '1 hour', now() - interval '1 minute', 5,
        now() - interval '3 hours');
select private.tick();
select is((select status from public.intent_signals where user_id = tests.u(4)), 'expired'::public.signal_status,
  'the job expires Down For signals');

-- Activity lifecycle: confirmed → live → after → complete.
select tests.keep('p', tests.make_plan(1, 2, '20 minutes'));
select tests.join(2, tests.id('p'));
select tests.keep('a', (select id from public.activities where plan_id = tests.id('p')));
select tests.login(1);
select public.host_check_in(tests.id('a'), tests.u(1));
select public.host_check_in(tests.id('a'), tests.u(2));
select tests.logout();
select is((select effective_status from public.activity_cards where id = tests.id('a')), 'confirmed'::public.activity_status,
  'confirmed before the start');

update public.activities set starts_at = now() - interval '10 minutes', check_in_opens_at = now() - interval '40 minutes'
 where id = tests.id('a');
select is((select effective_status from public.activity_cards where id = tests.id('a')), 'live'::public.activity_status,
  'live once it starts');
select private.tick();
select is((select status from public.activities where id = tests.id('a')), 'live'::public.activity_status, 'job stores live');

update public.activities
   set starts_at = now() - interval '2 hours', ends_at = now() - interval '30 minutes',
       check_in_opens_at = now() - interval '150 minutes', check_in_closes_at = now() - interval '30 minutes',
       after_closes_at = now() + interval '23 hours'
 where id = tests.id('a');
select is((select effective_status from public.activity_cards where id = tests.id('a')), 'after'::public.activity_status,
  'after once it ends');
select private.tick();
select is((select status from public.activities where id = tests.id('a')), 'after'::public.activity_status, 'job stores after');

update public.activities set after_closes_at = now() - interval '1 minute', ends_at = now() - interval '2 minutes',
       starts_at = now() - interval '92 minutes', check_in_closes_at = now() - interval '2 minutes'
 where id = tests.id('a');
select is((select effective_status from public.activity_cards where id = tests.id('a')), 'complete'::public.activity_status,
  'complete once the After window closes');
select private.tick();
select is((select status from public.activities where id = tests.id('a')), 'complete'::public.activity_status,
  'job stores complete');
select ok((select finalized_at is not null and verification_level is null from public.recaps where activity_id = tests.id('a')),
  'a Recap is created and frozen even without a result');
select is((select count(*)::integer from public.passport_entries where activity_id = tests.id('a')), 2, 'stamps for both players');
select tests.login(1);
select throws_ok(format('select public.propose_result(%L, 1, 0, gen_random_uuid())', tests.id('a')),
  'P0001', 'result_not_open', 'no results after the After window');
select tests.logout();

select * from finish();
rollback;
