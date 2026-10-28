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

-- I'M DOWN: idempotency, capacity, exactly one Activity.
select no_plan();

select tests.keep('plan', tests.make_plan(1, 3));
select tests.keep('key', gen_random_uuid());

select tests.login(2);
select is((public.im_down(tests.id('plan'), tests.id('key'))).member_count, 2, 'the first tap joins');
select is((public.im_down(tests.id('plan'), tests.id('key'))).changed, true,
  'a retry with the same key returns the first result');
select is((public.im_down(tests.id('plan'), gen_random_uuid())).changed, false,
  'a new tap when already in is a no-op');
select throws_ok(format('select public.leave_plan(%L, %L)', tests.id('plan'), tests.id('key')),
  'P0001', 'idempotency_key_reused', 'a key cannot be reused for another operation');
select throws_ok(format('select public.im_down(%L, null)', tests.id('plan')),
  'P0001', 'idempotency_key_required', 'mutations need an idempotency key');
select tests.logout();
select is((select member_count from public.plans where id = tests.id('plan')), 2, 'member_count went up once');
select is((select count(*)::integer from public.plan_members where plan_id = tests.id('plan')), 2,
  'one membership row per person');
select is((select count(*)::integer from public.activities where plan_id = tests.id('plan')), 0,
  'no activity before capacity');

-- Reaching capacity: GAME ON, exactly one activity, attendance for everyone.
select is((tests.join(3, tests.id('plan'))).status, 'game_on'::public.plan_status,
  'the plan locks at capacity');
select is((select count(*)::integer from public.activities where plan_id = tests.id('plan')), 1,
  'exactly one activity is created');
select tests.keep('activity', (select id from public.activities where plan_id = tests.id('plan')));
select is((select count(*)::integer from public.attendance where activity_id = tests.id('activity') and status = 'confirmed'), 3,
  'every member is confirmed on the activity');
select is((select confirmed_count from public.activities where id = tests.id('activity')), 3,
  'confirmed_count matches');
select ok((select locked_at is not null from public.plans where id = tests.id('plan')), 'locked_at is set');
select is((select check_in_opens_at from public.activities where id = tests.id('activity')),
          (select starts_at - interval '30 minutes' from public.plans where id = tests.id('plan')),
  'check-in opens 30 minutes before the start');
select is((select check_in_radius_m from public.activities where id = tests.id('activity')), 150,
  'check-in radius is 150 m');
select is((select after_closes_at - ends_at from public.activities where id = tests.id('activity')), interval '24 hours',
  'the After window stays open 24 hours');

select tests.login(4);
select throws_ok(format('select public.im_down(%L, gen_random_uuid())', tests.id('plan')),
  'P0001', 'plan_full', 'joining a locked plan is refused');
select tests.logout();
select is((tests.join(2, tests.id('plan'))).changed, false, 'tapping again when already in a locked plan is a no-op');

select is(private.promote_plan(tests.id('plan')), tests.id('activity'), 'promoting twice returns the same activity');
select is((select count(*)::integer from public.activities where plan_id = tests.id('plan')), 1,
  'still exactly one activity');
select throws_ok(format($$insert into public.activities (plan_id, sport_id, starts_at, ends_at, capacity, host_id,
    attendance_rule, check_in_opens_at, check_in_closes_at, after_closes_at)
  values (%L, 'football', now(), now() + interval '1 hour', 3, %L, 'check_in', now(), now() + interval '1 hour',
    now() + interval '2 hours')$$, tests.id('plan'), tests.u(1)),
  '23505', null, 'the database refuses a second activity for one plan');
select is((select member_count from public.plans where id = tests.id('plan')),
          (select count(*)::integer from public.plan_members where plan_id = tests.id('plan')),
  'member_count equals the membership rows');
select is((select count(*)::integer from private.analytics_events where name = 'game_on_reached'
           and payload ->> 'plan_id' = tests.id('plan')::text), 1, 'game_on_reached emitted once');

-- The time poll decides the start.
select tests.keep('poll', tests.make_plan(1, 2));
insert into public.plan_time_options (plan_id, starts_at)
select tests.id('poll'), starts_at from public.plans where id = tests.id('poll');
insert into public.plan_time_options (plan_id, starts_at)
select tests.id('poll'), starts_at + interval '30 minutes' from public.plans where id = tests.id('poll');
select tests.login(1);
select is((select count(*)::integer from public.vote_time(tests.id('poll'),
  (select id from public.plan_time_options where plan_id = tests.id('poll') order by starts_at desc limit 1)) where is_mine), 1,
  'a member votes');
select tests.login(5);
select throws_ok(format('select * from public.vote_time(%L, %L)', tests.id('poll'),
  (select id from public.plan_time_options where plan_id = tests.id('poll') limit 1)),
  'P0001', 'not_member', 'only members vote');
select tests.logout();
select tests.join(5, tests.id('poll'));
select is((select a.starts_at - p.starts_at from public.activities a, public.plans p
           where a.plan_id = tests.id('poll') and p.id = tests.id('poll')), interval '0',
  'the activity starts at the plan time');
select is((select a.starts_at from public.activities a where a.plan_id = tests.id('poll')),
          (select max(starts_at) from public.plan_time_options where plan_id = tests.id('poll')),
  'the most-voted time wins');

-- Expired, cancelled and invisible plans.
select tests.keep('late', tests.make_plan(1, 8));
update public.plans set deadline_at = now() - interval '1 minute' where id = tests.id('late');
select tests.login(6);
select throws_ok(format('select public.im_down(%L, gen_random_uuid())', tests.id('late')),
  'P0001', 'plan_expired', 'joining after the deadline is refused even before the job runs');
select tests.logout();
select tests.keep('off', tests.make_plan(1, 8));
update public.plans set status = 'cancelled' where id = tests.id('off');
select tests.login(6);
select throws_ok(format('select public.im_down(%L, gen_random_uuid())', tests.id('off')),
  'P0001', 'plan_cancelled', 'joining a cancelled plan is refused');
select throws_ok(format('select public.im_down(%L, gen_random_uuid())', gen_random_uuid()),
  'P0001', 'plan_not_found', 'an unknown plan is not found');
select tests.logout();
select tests.keep('secret', tests.make_plan(1, 8, '3 hours', 'invite_only'));
select tests.login(6);
select throws_ok(format('select public.im_down(%L, gen_random_uuid())', tests.id('secret')),
  'P0001', 'plan_not_found', 'an invite-only plan is not found for outsiders');
select tests.logout();

-- Joining marks a matching Down For signal as matched.
insert into public.intent_signals (user_id, sport_id, window_start, window_end, expires_at, radius_km)
values (tests.u(7), 'football', now() + interval '2 hours', now() + interval '4 hours', now() + interval '4 hours', 5);
select tests.keep('open', tests.make_plan(1, 8));
select tests.join(7, tests.id('open'));
select is((select status from public.intent_signals where user_id = tests.u(7)), 'matched'::public.signal_status,
  'joining a plan matches your Down For');

-- create_plan: the creator hosts and is in; validation.
select tests.login(8);
select tests.keep('created', (public.create_plan(gen_random_uuid(), 'football', now() + interval '4 hours', 6,
  '00000000-0000-4000-9100-000000000001', p_time_options => array[now() + interval '4 hours 30 minutes'],
  p_meeting_point => 'South pitch')).plan_id);
select is((select member_count from public.plan_cards where id = tests.id('created')), 1, 'the creator is in');
select is((select count(*)::integer from public.plan_time_options where plan_id = tests.id('created')), 2,
  'the proposed time and the extra option are both in the poll');
select throws_ok($$select public.create_plan(gen_random_uuid(), 'football', now() + interval '4 hours', 14)$$,
  'P0001', 'capacity_invalid', 'plans hold 2 to 12 people');
select throws_ok($$select public.create_plan(gen_random_uuid(), 'curling', now() + interval '4 hours', 6)$$,
  'P0001', 'sport_unknown', 'unknown sports are refused');
select throws_ok($$select public.create_plan(gen_random_uuid(), 'football', now() - interval '1 hour', 6)$$,
  'P0001', 'starts_at_invalid', 'plans start in the future');
select tests.logout();

select * from finish();
rollback;
