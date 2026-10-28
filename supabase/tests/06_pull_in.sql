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

-- PULL SOMEONE IN: quota, permission, blocks, what the invitee sees.
select no_plan();

select tests.connect(1, 2);
select tests.connect(1, 3);
select tests.connect(1, 4);
select tests.connect(1, 5);
select tests.connect(1, 8);
insert into public.pull_me_in (user_id, sport_id, scope) values (tests.u(7), 'football', 'nearby');
select tests.keep('plan', tests.make_plan(1, 8));

select tests.login(1);
select throws_ok(format('select public.pull_in(%L, array[%L]::uuid[], gen_random_uuid())', tests.id('plan'), tests.u(6)),
  'P0001', 'invite_not_allowed', 'a stranger without Pull Me In cannot be invited');
select is((public.pull_in(tests.id('plan'), array[tests.u(7)], gen_random_uuid())).remaining, 2,
  'Pull Me In (nearby) allows an invite from a stranger');
select tests.login(8);
select public.block_user(tests.u(1));
select tests.login(1);
select throws_ok(format('select public.pull_in(%L, array[%L]::uuid[], gen_random_uuid())', tests.id('plan'), tests.u(8)),
  'P0001', 'invite_not_allowed', 'blocked people cannot be invited (and the reason is not revealed)');
select tests.keep('k', gen_random_uuid());
select is((public.pull_in(tests.id('plan'), array[tests.u(2), tests.u(3)], tests.id('k'))).sent, 2,
  'connections can be invited');
select is((public.pull_in(tests.id('plan'), array[tests.u(2), tests.u(3)], tests.id('k'))).sent, 2,
  'a retry returns the first result');
select throws_ok(format('select public.pull_in(%L, array[%L]::uuid[], gen_random_uuid())', tests.id('plan'), tests.u(4)),
  'P0001', 'invite_quota_exceeded', 'three invites per plan per person');
select is((public.pull_in(tests.id('plan'), array[tests.u(2)], gen_random_uuid())).sent, 0,
  'inviting someone already invited sends nothing');
select is((select remaining from public.pull_in_quota(tests.id('plan'))), 0, 'quota shows none left');
select ok(not exists (select 1 from public.pull_in_candidates(tests.id('plan')) where user_id in (tests.u(6), tests.u(8))),
  'candidates never include strangers or blocked people');
select ok(exists (select 1 from public.pull_in_candidates(tests.id('plan')) where user_id = tests.u(4) and games_with_me = 1),
  'candidates include connections, with games together');
select tests.logout();
select is((select count(*)::integer from public.plan_invites where plan_id = tests.id('plan')), 3, 'three invites stored');

select tests.login(6);
select throws_ok(format('select public.pull_in(%L, array[%L]::uuid[], gen_random_uuid())', tests.id('plan'), tests.u(1)),
  'P0001', 'not_member', 'only people in the plan pull others in');

-- Invite-only plan: the invitee sees who's in, the time and the place, not the exact meeting point.
select tests.logout();
select tests.keep('secret', tests.make_plan(1, 8, '3 hours', 'invite_only'));
select tests.login(5);
select is((select count(*)::integer from public.plan_cards where id = tests.id('secret')), 0, 'not visible before the invite');
select tests.login(1);
select public.pull_in(tests.id('secret'), array[tests.u(5)], gen_random_uuid());
select tests.login(5);
select is((select place_name from public.plan_cards where id = tests.id('secret')), 'Test Pitch', 'the invitee sees the place');
select is((select count(*)::integer from public.plan_roster(tests.id('secret'))), 1, 'the invitee sees who is in');
select is((select count(*)::integer from public.plan_meeting_points where plan_id = tests.id('secret')), 0,
  'the invitee does not see the exact meeting point');
select is((select count(*)::integer from public.plan_invites where invitee_id = tests.u(5)), 1, 'the invitee sees the invite');
select is((public.im_down(tests.id('secret'), gen_random_uuid())).is_member, true, 'the invitee can say I''M DOWN');
select tests.logout();
select is((select via from public.plan_members where plan_id = tests.id('secret') and user_id = tests.u(5)),
  'invite'::public.member_via, 'joined via the invite');
select is((select status from public.plan_invites where plan_id = tests.id('secret') and invitee_id = tests.u(5)),
  'accepted'::public.invite_status, 'the invite is accepted');

-- Decline.
select tests.login(7);
select is(public.decline_invite((select id from public.plan_invites where invitee_id = tests.u(7))),
  'declined'::public.invite_status, 'an invite can be declined');
select tests.logout();

select * from finish();
rollback;
