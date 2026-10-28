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

-- leave_plan, cancel_attendance, waitlist promotion.
select no_plan();

-- Leaving before GAME ON.
select tests.keep('plan', tests.make_plan(1, 4));
select tests.join(2, tests.id('plan'));
select tests.join(3, tests.id('plan'));
select tests.login(2);
select is((public.leave_plan(tests.id('plan'), gen_random_uuid())).member_count, 2, 'leaving frees the spot');
select is((public.leave_plan(tests.id('plan'), gen_random_uuid())).changed, false, 'leaving again is a no-op');
select is((public.leave_plan(tests.id('plan'), gen_random_uuid())).is_member, false, 'and you are out');
select tests.logout();
select is((select member_count from public.plans where id = tests.id('plan')),
          (select count(*)::integer from public.plan_members where plan_id = tests.id('plan')),
  'member_count equals the membership rows after leaving');

-- The host leaves: the longest-standing member hosts.
select tests.login(1);
select public.leave_plan(tests.id('plan'), gen_random_uuid());
select tests.logout();
select is((select host_id from public.plans where id = tests.id('plan')), tests.u(3), 'hosting passes on');
select tests.login(3);
select is((public.leave_plan(tests.id('plan'), gen_random_uuid())).status, 'cancelled'::public.plan_status,
  'the last person leaving cancels the plan');
select tests.logout();

-- After GAME ON: waitlist and promotion.
select tests.keep('full', tests.make_plan(1, 2));
select tests.join(3, tests.id('full'));
select tests.keep('activity', (select id from public.activities where plan_id = tests.id('full')));
select tests.login(3);
select throws_ok(format('select public.leave_plan(%L, gen_random_uuid())', tests.id('full')),
  'P0001', 'plan_locked', 'after GAME ON you cancel attendance instead of leaving');

select tests.keep('k4', gen_random_uuid());
select tests.login(4);
select is((public.join_waitlist(tests.id('activity'), tests.id('k4'))).waitlist_position, 1, 'first on the waitlist');
select is((public.join_waitlist(tests.id('activity'), tests.id('k4'))).waitlist_position, 1, 'a retry is the same');
select is((public.join_waitlist(tests.id('activity'), gen_random_uuid())).changed, false, 'joining twice is a no-op');
select tests.login(5);
select is((public.join_waitlist(tests.id('activity'), gen_random_uuid())).waitlist_position, 2, 'second on the waitlist');
select tests.logout();
select is((select waitlist_count from public.activities where id = tests.id('activity')), 2, 'waitlist_count is 2');

select tests.keep('k3', gen_random_uuid());
select tests.login(3);
select is((public.cancel_attendance(tests.id('activity'), tests.id('k3'))).promoted_user_id, tests.u(4),
  'cancelling promotes the first person on the waitlist');
select is((public.cancel_attendance(tests.id('activity'), tests.id('k3'))).promoted_user_id, tests.u(4),
  'a retry returns the first result');
select is((public.cancel_attendance(tests.id('activity'), gen_random_uuid())).changed, false,
  'cancelling again is a no-op');
select tests.logout();
select is((select status from public.attendance where activity_id = tests.id('activity') and user_id = tests.u(4)),
  'confirmed'::public.attendance_status, 'the promoted person is confirmed');
select is((select confirmed_count from public.activities where id = tests.id('activity')), 2, 'spots stay at capacity');
select is((select waitlist_count from public.activities where id = tests.id('activity')), 1, 'one left on the waitlist');
select is((select count(*)::integer from public.attendance
           where activity_id = tests.id('activity') and status in ('confirmed', 'checked_in')), 2,
  'confirmed_count matches the rows');
select tests.login(5);
select is((select waitlist_position from public.join_waitlist(tests.id('activity'), gen_random_uuid())), 1,
  'the next person moves up');

-- Cancelling from the waitlist.
select tests.login(6);
select public.join_waitlist(tests.id('activity'), gen_random_uuid());
select is((public.cancel_attendance(tests.id('activity'), gen_random_uuid())).status, 'cancelled'::public.attendance_status,
  'you can leave the waitlist');
select tests.logout();
select is((select waitlist_count from public.activities where id = tests.id('activity')), 1, 'waitlist_count drops');

-- Once check-in opens, a freed spot is not auto-filled.
update public.activities set check_in_opens_at = now() - interval '1 minute' where id = tests.id('activity');
select tests.login(4);
select is((public.cancel_attendance(tests.id('activity'), gen_random_uuid())).promoted_user_id, null::uuid,
  'no promotion after check-in opens');
select tests.logout();
select is((select confirmed_count from public.activities where id = tests.id('activity')), 1, 'the spot is free');

-- A free spot before check-in confirms a newcomer directly.
select tests.keep('roomy', tests.make_plan(1, 2));
select tests.join(2, tests.id('roomy'));
select tests.keep('roomy_activity', (select id from public.activities where plan_id = tests.id('roomy')));
select tests.login(2);
select public.cancel_attendance(tests.id('roomy_activity'), gen_random_uuid());
select tests.login(7);
select is((public.join_waitlist(tests.id('roomy_activity'), gen_random_uuid())).status, 'confirmed'::public.attendance_status,
  'with a free spot you are in straight away');
select is((select count(*)::integer from public.plan_meeting_points where plan_id = tests.id('roomy')), 1,
  'someone confirmed from the waitlist sees the meeting point');
select tests.login(2);
select is((public.join_waitlist(tests.id('roomy_activity'), gen_random_uuid())).status, 'waitlisted'::public.attendance_status,
  'coming back after cancelling puts you on the waitlist when it is full');

-- After the start you cannot cancel.
select tests.logout();
update public.activities set starts_at = now() - interval '5 minutes', check_in_opens_at = now() - interval '35 minutes'
 where id = tests.id('roomy_activity');
select tests.login(7);
select throws_ok(format('select public.cancel_attendance(%L, gen_random_uuid())', tests.id('roomy_activity')),
  'P0001', 'activity_started', 'cancelling after the start is refused');
select tests.logout();

select * from finish();
rollback;
