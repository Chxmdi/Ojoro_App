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

-- RLS: who can read and write what.
select no_plan();

select tests.keep('plan', tests.make_plan(1, 8));
select tests.join(2, tests.id('plan'));

-- Exact meeting point is for members only.
select tests.login(3);
select is((select count(*)::integer from public.plans where id = tests.id('plan')), 1,
  'an outsider sees a public plan');
select is((select place_name from public.plan_cards where id = tests.id('plan')), 'Test Pitch',
  'an outsider sees the public place');
select is((select count(*)::integer from public.plan_meeting_points where plan_id = tests.id('plan')), 0,
  'a non-member cannot see the exact meeting point');
select tests.login(2);
select is((select label from public.plan_meeting_points where plan_id = tests.id('plan')), 'North pitch',
  'a member sees the exact meeting point');

-- Invite-only plans are invisible to outsiders.
select tests.keep('private', tests.make_plan(1, 8, '3 hours', 'invite_only'));
select tests.login(3);
select is((select count(*)::integer from public.plan_cards where id = tests.id('private')), 0,
  'an outsider cannot see an invite-only plan');

-- A blocked user sees nothing of the blocker.
select tests.login(1);
select public.block_user(tests.u(4));
select tests.login(4);
select is((select count(*)::integer from public.plans where id = tests.id('plan')), 0,
  'a blocked user cannot see the host''s plan');
select is((select count(*)::integer from public.plan_members where plan_id = tests.id('plan')), 0,
  'a blocked user cannot see its members');
select is((select count(*)::integer from public.profiles where id = tests.u(1)), 0,
  'a blocked user cannot see the blocker''s profile');
select is((select count(*)::integer from public.profile_view(tests.u(1))), 0,
  'profile_view returns nothing across a block');
select is((select count(*)::integer from public.profile_sports(tests.u(1))), 0,
  'profile_sports returns nothing across a block');
select throws_ok(format('select public.im_down(%L, gen_random_uuid())', tests.id('plan')),
  'P0001', 'plan_not_found', 'a blocked user cannot join the blocker''s plan');
select throws_ok(format('select * from public.plan_roster(%L)', tests.id('plan')),
  'P0001', 'plan_not_found', 'a blocked user cannot read the roster');
select tests.login(1);
select is((select count(*)::integer from public.profiles where id = tests.u(4)), 0,
  'the blocker cannot see the blocked profile either');
select is((select count(*)::integer from public.my_blocks() where user_id = tests.u(4)), 1,
  'the blocker can list who they blocked');

-- A block by a member (not the host): the plan stays visible, the member is hidden, joining is refused.
select tests.login(2);
select public.block_user(tests.u(5));
select tests.login(5);
select is((select count(*)::integer from public.plan_members where plan_id = tests.id('plan') and user_id = tests.u(2)), 0,
  'a member who blocked you is hidden from plan_members');
select ok(not exists (select 1 from public.plan_roster(tests.id('plan')) where user_id = tests.u(2)),
  'a member who blocked you is hidden from the roster');
select throws_ok(format('select public.im_down(%L, gen_random_uuid())', tests.id('plan')),
  'P0001', 'plan_unavailable', 'you cannot join a plan with someone who blocked you');

-- Nobody can edit other people's rows; writes go through functions.
select tests.login(3);
update public.profiles set display_name = 'Hacked' where id = tests.u(1);
update public.privacy_settings set history_visibility = 'everyone' where user_id = tests.u(1);
select tests.logout();
select is((select display_name from public.profiles where id = tests.u(1)), 'Tester 1',
  'cannot rename someone else');
select is((select history_visibility from public.privacy_settings where user_id = tests.u(1)), 'friends'::public.visibility,
  'cannot change someone else''s privacy');
select tests.login(3);
update public.profiles set display_name = 'Three' where id = tests.u(3);
select is((select display_name from public.profiles where id = tests.u(3)), 'Three', 'can rename yourself');
select throws_ok($$update public.profiles set onboarding_completed_at = now() where id = tests.u(3)$$,
  '42501', null, 'only the granted profile columns are writable');
select throws_ok(format($$insert into public.plan_members (plan_id, user_id, via) values (%L, %L, 'im_down')$$,
  tests.id('plan'), tests.u(3)), '42501', null, 'no direct inserts into plan_members');
select throws_ok(format('update public.plans set member_count = 8 where id = %L', tests.id('plan')),
  '42501', null, 'no direct updates to plans');
select throws_ok($$delete from public.blocks$$, '42501', null, 'no direct deletes on blocks');
select throws_ok($$insert into public.attendance (activity_id, user_id, status) select id, tests.u(3), 'checked_in' from public.activities limit 1$$,
  '42501', null, 'no direct attendance writes');

-- Self-only rows; others get shaped reads.
select tests.logout();
insert into public.user_sports (user_id, sport_id, level, position, is_main)
values (tests.u(1), 'football', 'advanced', 'Striker', true);
insert into public.availability_slots (user_id, day_of_week, part)
values (tests.u(1), 2, 'evening'), (tests.u(1), 4, 'evening'), (tests.u(3), 2, 'evening'), (tests.u(3), 6, 'morning');
select tests.login(3);
select is((select count(*)::integer from public.user_sports where user_id = tests.u(1)), 0,
  'user_sports rows are self-only');
select is((select "position" from public.profile_sports(tests.u(1))), 'Striker',
  'others see what someone plays');
select is((select level from public.profile_sports(tests.u(1))), null::public.skill_level,
  'levels are never shown to others');
select is((select count(*)::integer from public.availability_slots where user_id = tests.u(1)), 0,
  'availability rows are self-only');
select is((select count(*)::integer from public.availability_overlap(tests.u(1))), 0,
  'availability is hidden from people outside the chosen audience');
select tests.logout();
select tests.connect(1, 3);
select tests.login(3);
select results_eq(
  format('select day_of_week::integer, part::text from public.availability_overlap(%L)', tests.u(1)),
  $$values (2, 'evening')$$,
  'connected people see only the overlap, never the whole schedule');
select tests.login(1);
select is((select level from public.profile_sports(tests.u(1))), 'advanced'::public.skill_level,
  'you see your own level');

-- Signals are never readable by others.
select tests.logout();
insert into public.intent_signals (user_id, sport_id, window_start, window_end, expires_at, radius_km)
values (tests.u(6), 'running', now() + interval '1 hour', now() + interval '3 hours', now() + interval '3 hours', 5);
select tests.login(7);
select is((select count(*)::integer from public.intent_signals where user_id = tests.u(6)), 0,
  'someone else''s Down For signal rows are invisible');
select tests.login(6);
select is((select count(*)::integer from public.intent_signals where user_id = tests.u(6)), 1,
  'you see your own signals');

-- anon gets nothing.
select tests.logout();
set local role anon;
select throws_ok($$select count(*) from public.plans$$, '42501', null, 'anon cannot read plans');
select throws_ok($$select public.im_down(gen_random_uuid(), gen_random_uuid())$$, '42501', null,
  'anon cannot call mutations');
reset role;

-- Every public table has RLS on.
select is((select count(*)::integer from pg_tables where schemaname = 'public' and not rowsecurity), 0,
  'RLS is enabled on every public table');

select * from finish();
rollback;
