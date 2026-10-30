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
-- Step 6 helpers (Host OS core). A program owned by tests.u(p_owner).
create function tests.host_program(p_owner integer, p_name text default 'Test Pickup')
returns uuid language plpgsql security definer as $$
declare
  v uuid;
begin
  insert into public.host_programs (name, sport_id, area, created_by)
  values (p_name, 'football', 'Plateau, Montréal', tests.u(p_owner)) returning id into v;
  insert into public.host_program_hosts (program_id, user_id, role, added_by) values (v, tests.u(p_owner), 'owner', tests.u(p_owner));
  return v;
end;
$$;

-- Move a session (plan, activity and rule times) to start p_starts from now.
create function tests.host_shift(p_session uuid, p_starts interval) returns void language plpgsql security definer as $$
declare
  s public.host_sessions%rowtype;
  v_start timestamptz := now() + p_starts;
begin
  select * into s from public.host_sessions where id = p_session;
  update public.host_sessions
     set starts_at = v_start, opens_at = v_start - interval '5 days',
         members_open_at = case when s.members_first then v_start - interval '7 days' else v_start - interval '5 days' end,
         auto_fill_cutoff_at = v_start - interval '2 hours'
   where id = p_session;
  update public.plans set starts_at = v_start, deadline_at = v_start where id = s.plan_id;
  update public.activities
     set starts_at = v_start, ends_at = v_start + interval '90 minutes', check_in_opens_at = v_start - interval '30 minutes',
         check_in_closes_at = v_start + interval '90 minutes', after_closes_at = v_start + interval '90 minutes 24 hours',
         status = case when status = 'cancelled' then status
                       when v_start + interval '90 minutes 24 hours' <= now() then 'complete'::public.activity_status
                       when v_start + interval '90 minutes' <= now() then 'after'
                       when v_start <= now() then 'live' else 'confirmed' end
   where id = s.activity_id;
end;
$$;

-- One session of a fresh series (no other dates generated), starting p_starts from now.
create function tests.host_session(
  p_program uuid, p_starts interval default '2 days', p_capacity integer default 4,
  p_approval boolean default false, p_auto_fill boolean default true, p_members_first boolean default false,
  p_price integer default 800
) returns uuid language plpgsql security definer as $$
declare
  v_series uuid;
  v_sess uuid;
begin
  insert into public.host_series (program_id, name, sport_id, place_id, start_time, duration_minutes, capacity,
                                  repeat_days, starts_on, until_on, approval_required, waitlist_auto_fill,
                                  members_first, price_cents, created_by)
  values (p_program, 'Test series', 'football', '00000000-0000-4000-9100-000000000001', '19:30', 90, p_capacity,
          '{1,2,3,4,5,6,7}', '2099-01-01', '2099-01-01', p_approval, p_auto_fill, p_members_first, p_price,
          (select user_id from public.host_program_hosts where program_id = p_program and role = 'owner'))
  returning id into v_series;
  v_sess := private.host_create_session(v_series, current_date);
  perform tests.host_shift(v_sess, p_starts);
  return v_sess;
end;
$$;

create function tests.activity_of(p_session uuid) returns uuid language sql security definer as $$
  select activity_id from public.host_sessions where id = p_session
$$;

-- tests.u(n) checked in to a finished session of this program p_ago ago.
create function tests.host_played(p_program uuid, p_users integer[], p_ago interval default '7 days')
returns uuid language plpgsql security definer as $$
declare
  v_sess uuid;
  v_act uuid;
begin
  v_sess := tests.host_session(p_program, -p_ago, 20);
  v_act := tests.activity_of(v_sess);
  insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
  select v_act, tests.u(n), 'checked_in', now() - p_ago - interval '1 day', now() - p_ago, 'host' from unnest(p_users) n;
  update public.activities set confirmed_count = cardinality(p_users), checked_in_count = cardinality(p_users) where id = v_act;
  return v_sess;
end;
$$;

create function tests.attendance_status(p_session uuid, n integer) returns public.attendance_status
language sql security definer as $$
  select t.status from public.attendance t join public.host_sessions s on s.activity_id = t.activity_id
  where s.id = p_session and t.user_id = tests.u(n)
$$;

create function tests.notified(n integer, p_type text, p_change text default null) returns integer
language sql security definer as $$
  select count(*)::integer from public.notifications
  where recipient_id = tests.u(n) and type::text = p_type and (p_change is null or data ->> 'change' = p_change)
$$;

-- Host OS core: programs, series → sessions, edits from the next session, skip / restore, joining
-- windows, the waitlist that fills itself until the cutoff, the host choosing after it, check-in.
select no_plan();

-- Programs and authorization.
select tests.login(1);
select tests.keep('prog', (public.create_host_program('Plateau Pickup', 'football', null, null, gen_random_uuid())).id);
select is((select role::text from public.host_program_hosts where program_id = tests.id('prog') and user_id = tests.u(1)),
          'owner', 'the creator owns the program');
select is((select count(*)::integer from public.my_host_programs()), 1, 'my_host_programs lists it');
select throws_ok($$select public.create_host_program('', null, null, null, gen_random_uuid())$$, 'P0001', 'invalid_argument', 'a name');
select tests.login(2);
select throws_ok($$select * from public.host_home(tests.id('prog'))$$, 'P0001', 'not_program_host', 'only hosts read HostHome');
select throws_ok($$select public.add_co_host(tests.id('prog'), tests.u(2))$$, 'P0001', 'not_program_host', 'nor add co-hosts');
select is((select count(*)::integer from public.my_host_programs()), 0, 'not in their list');
select tests.login(1);
select ok(public.add_co_host(tests.id('prog'), tests.u(2)), 'the owner adds a co-host');
select tests.login(2);
select lives_ok($$select * from public.host_home(tests.id('prog'))$$, 'a co-host reads HostHome');
select throws_ok($$select public.add_co_host(tests.id('prog'), tests.u(3))$$, 'P0001', 'owner_required', 'only the owner adds co-hosts');

-- Series validation and generation.
select tests.login(1);
select throws_ok($$select public.create_series(tests.id('prog'), '{"name": "x", "place_id": "00000000-0000-4000-9100-000000000001", "start_time": "19:30", "duration_minutes": 90, "capacity": 1, "repeat_days": [2]}', gen_random_uuid())$$,
                 'P0001', 'series_invalid', 'capacity 2 to 100');
select throws_ok($$select public.create_series(tests.id('prog'), '{"name": "x", "place_id": "00000000-0000-4000-9100-000000000001", "start_time": "19:30", "duration_minutes": 90, "repeat_days": [9]}', gen_random_uuid())$$,
                 'P0001', 'series_invalid', 'repeat days are ISO days');
select throws_ok($$select public.create_series(tests.id('prog'), '{"name": "x", "colour": "red"}', gen_random_uuid())$$,
                 'P0001', 'series_invalid', 'unknown settings are refused');
select throws_ok($$select public.create_series(tests.id('prog'), '{"name": "x", "place_id": "00000000-0000-4000-9100-000000000001", "start_time": "late", "duration_minutes": 90, "repeat_days": [2]}', gen_random_uuid())$$,
                 'P0001', 'series_invalid', 'a start time that parses');
select tests.keep('series', (public.create_series(tests.id('prog'),
  jsonb_build_object('name', 'Daily 7-a-side', 'place_id', '00000000-0000-4000-9100-000000000001', 'start_time', '23:59',
                     'duration_minutes', 90, 'capacity', 14, 'repeat_days', jsonb_build_array(1, 2, 3, 4, 5, 6, 7),
                     'price_cents', 800, 'member_price_cents', 0, 'approval_required', false),
  '11111111-1111-4111-8111-111111111111')).id);
select is((public.create_series(tests.id('prog'), '{}', '11111111-1111-4111-8111-111111111111')).id, tests.id('series'),
          'create_series is idempotent with its key');
select cmp_ok((select count(*)::integer from public.host_sessions where series_id = tests.id('series')), '>=', 30,
              'sessions are generated about five weeks ahead');
select is((select count(*)::integer from public.host_sessions s join public.plans p on p.id = s.plan_id
            join public.activities a on a.id = s.activity_id
            where s.series_id = tests.id('series') and p.source::text = 'host_session' and p.status = 'game_on'
              and a.capacity = 14 and a.cost_cents = 800 and a.title = 'Daily 7-a-side'),
          (select count(*)::integer from public.host_sessions where series_id = tests.id('series')),
          'each session is a locked plan and its activity (14 players allowed)');
select tests.logout();
select is(private.host_materialize_series(tests.id('series')), 0, 'generation is idempotent');

-- Edits apply from the next session; past sessions keep what they were.
select tests.keep('s_next', (select id from public.host_sessions where series_id = tests.id('series') order by starts_at limit 1));
select tests.keep('s_past', (select id from public.host_sessions where series_id = tests.id('series') order by starts_at offset 1 limit 1));
select tests.host_shift(tests.id('s_past'), '-3 days');
select tests.logout();
insert into public.attendance (activity_id, user_id, status, confirmed_at)
values (tests.activity_of(tests.id('s_next')), tests.u(5), 'confirmed', now());
update public.activities set confirmed_count = 1 where id = tests.activity_of(tests.id('s_next'));
select tests.login(1);
select throws_ok($$select public.update_series(tests.id('series'), '{"price_cents": 900}', 99)$$, 'P0001', 'series_version_conflict',
                 'a stale edit is refused');
select is((public.update_series(tests.id('series'), '{"price_cents": 900, "level": "competitive"}', 1)).version, 2, 'the edit bumps the version');
select is((select cost_cents from public.activities where id = tests.activity_of(tests.id('s_next'))), 900, 'the next session follows');
select is((select price_cents from public.host_sessions where id = tests.id('s_next')), 900, 'its rules too');
select is((select cost_cents from public.activities where id = tests.activity_of(tests.id('s_past'))), 800, 'a past session keeps its price');
select is(tests.notified(5, 'host_update', 'series_updated'), 1, 'people already in get one message');
select is((public.update_series(tests.id('series'), '{"level": "competitive"}', 2)).sessions_updated, 0, 'no change, no edit');
select throws_ok($$select public.update_series(tests.id('series'), '{"capacity": 500}', 2)$$, 'P0001', 'series_invalid', 'edits are validated');
select tests.login(3);
select throws_ok($$select public.update_series(tests.id('series'), '{"price_cents": 0}', 2)$$, 'P0001', 'not_program_host', 'only hosts edit');

-- Removing a repeat day skips those dates (not deleted).
select tests.login(1);
select tests.keep('series2', (public.create_series(tests.id('prog'),
  jsonb_build_object('name', 'Weekdays', 'place_id', '00000000-0000-4000-9100-000000000001', 'start_time', '23:59',
                     'duration_minutes', 60, 'capacity', 10, 'repeat_days', jsonb_build_array(1, 2, 3, 4, 5)), gen_random_uuid())).id);
select lives_ok($$select public.update_series(tests.id('series2'), '{"repeat_days": [1, 2, 3, 4]}', 1)$$, 'drop Fridays');
select is((select count(*)::integer from public.host_sessions
           where series_id = tests.id('series2') and extract(isodow from occurs_on) = 5 and status = 'scheduled'), 0,
          'no Friday session stays scheduled');
select ok((select count(*) from public.host_sessions where series_id = tests.id('series2') and status = 'skipped') > 0,
          'the Friday sessions are skipped');

-- Skip and restore keep people's places.
select tests.keep('s_skip', tests.host_session(tests.id('prog'), '3 days', 4));
select tests.login(5);
select lives_ok($$select public.join_waitlist(tests.activity_of(tests.id('s_skip')), gen_random_uuid())$$, 'someone joins');
select tests.login(1);
select is((public.skip_session(tests.id('s_skip'), 'Field booked for a tournament')).status::text, 'skipped', 'SKIP');
select is((select status::text from public.activities where id = tests.activity_of(tests.id('s_skip'))), 'cancelled',
          'the activity is called off');
select is(tests.notified(5, 'activity_changed', 'cancelled'), 1, 'and people in it are told');
select is(tests.attendance_status(tests.id('s_skip'), 5)::text, 'confirmed', 'their place is kept');
select is((public.skip_session(tests.id('s_skip'))).skip_reason, 'Field booked for a tournament', 'skip is set-to-state');
select tests.login(6);
select throws_ok($$select public.join_waitlist(tests.activity_of(tests.id('s_skip')), gen_random_uuid())$$, 'P0001', 'session_skipped',
                 'nobody joins a skipped session');
select tests.login(1);
select is((public.restore_session(tests.id('s_skip'))).status::text, 'scheduled', 'RESTORE');
select is((select status::text from public.activities where id = tests.activity_of(tests.id('s_skip'))), 'confirmed', 'on again');
select is(tests.notified(5, 'host_update', 'restored'), 1, 'they hear it is back on');
select lives_ok($$select public.save_series_template(tests.id('series'), 'Tuesday template')$$, 'SAVE AS A TEMPLATE');
select is((select settings ->> 'level' from public.host_series_templates where name = 'Tuesday template'), 'competitive',
          'with the series settings');

-- Joining window and members first.
select tests.keep('s_far', tests.host_session(tests.id('prog'), '10 days', 4, false, true, true));
select tests.login(6);
select throws_ok($$select public.join_waitlist(tests.activity_of(tests.id('s_far')), gen_random_uuid())$$, 'P0001', 'joining_not_open',
                 'joining opens 5 days before');
select tests.login(1);
select ok(public.set_program_member(tests.id('prog'), tests.u(6), true), 'Six becomes a member');
select tests.host_shift(tests.id('s_far'), '6 days');
select tests.login(6);
select is((public.join_waitlist(tests.activity_of(tests.id('s_far')), gen_random_uuid())).status::text, 'confirmed',
          'members get in 48 hours earlier');
select tests.login(7);
select throws_ok($$select public.join_waitlist(tests.activity_of(tests.id('s_far')), gen_random_uuid())$$, 'P0001', 'joining_not_open',
                 'everyone else waits for the window');

-- The waitlist fills itself until the cutoff (2 h before), then the host chooses.
select tests.keep('s_wl', tests.host_session(tests.id('prog'), '1 day', 2));
select tests.login(3);
select is((public.join_waitlist(tests.activity_of(tests.id('s_wl')), gen_random_uuid())).status::text, 'confirmed', 'in');
select tests.login(4);
select is((public.join_waitlist(tests.activity_of(tests.id('s_wl')), gen_random_uuid())).status::text, 'confirmed', 'in, full');
select tests.login(5);
select is((public.join_waitlist(tests.activity_of(tests.id('s_wl')), gen_random_uuid())).status::text, 'waitlisted', 'waitlist 1');
select tests.login(7);
select is((public.join_waitlist(tests.activity_of(tests.id('s_wl')), gen_random_uuid())).status::text, 'waitlisted', 'waitlist 2');
select tests.login(1);
select is(public.reorder_waitlist(tests.id('s_wl'), array[tests.u(7), tests.u(5)]), 2, 'REORDER');
select throws_ok($$select public.reorder_waitlist(tests.id('s_wl'), array[tests.u(7)])$$, 'P0001', 'invalid_argument',
                 'the whole waitlist is reordered');
select tests.login(3);
select is((public.cancel_attendance(tests.activity_of(tests.id('s_wl')), gen_random_uuid())).promoted_user_id, tests.u(7),
          'a drop before the cutoff: the first waiting (after the reorder) is in');
select tests.login(1);
select is((select related_user_id from public.host_session_log where session_id = tests.id('s_wl') and kind = 'dropped'),
          tests.u(7), 'the log says who took the spot');
select is((select related_user_id from public.host_session_log where session_id = tests.id('s_wl') and kind = 'promoted'),
          tests.u(3), 'and whose spot it was');
select tests.login(4);
select is((select count(*)::integer from public.host_session_log), 0, 'participants never read the roster log');
select tests.host_shift(tests.id('s_wl'), '90 minutes');
select tests.login(4);
select is((public.cancel_attendance(tests.activity_of(tests.id('s_wl')), gen_random_uuid())).promoted_user_id, null::uuid,
          'after the cutoff the spot stays open');
select tests.login(1);
select is((select kind from public.host_needs_you(tests.id('prog')) where session_id = tests.id('s_wl')), 'waitlist_choice',
          'and HostHome asks the host to choose');
select is((select auto_fill_active from public.session_view(tests.id('s_wl'))), false, 'the roster says it stopped');
select is((public.promote_from_waitlist(tests.id('s_wl'), tests.u(5), gen_random_uuid())).status::text, 'confirmed',
          'the host chooses who is in');
select throws_ok($$select public.promote_from_waitlist(tests.id('s_wl'), tests.u(6), gen_random_uuid())$$, 'P0001', 'not_waitlisted',
                 'only people waiting');
select tests.login(8);
select is((public.join_waitlist(tests.activity_of(tests.id('s_wl')), gen_random_uuid())).status::text, 'waitlisted', 'full again');
select tests.login(1);
select throws_ok($$select public.promote_from_waitlist(tests.id('s_wl'), tests.u(8), gen_random_uuid())$$, 'P0001', 'session_full',
                 'no spot: add one first');
select is((public.add_session_spot(tests.id('s_wl'), gen_random_uuid())).capacity, 3, 'ADD A SPOT');
select is(tests.attendance_status(tests.id('s_wl'), 8)::text, 'waitlisted', 'after the cutoff the new spot waits for the host');
select is((public.promote_from_waitlist(tests.id('s_wl'), tests.u(8), '22222222-2222-4222-8222-222222222222')).status::text,
          'confirmed', 'who then chooses');
select is((public.promote_from_waitlist(tests.id('s_wl'), tests.u(8), '22222222-2222-4222-8222-222222222222')).changed,
          true, 'a retry returns the first result');
select tests.login(3);
select throws_ok($$select public.promote_from_waitlist(tests.id('s_wl'), tests.u(8), gen_random_uuid())$$, 'P0001', 'not_program_host',
                 'only hosts choose');

-- Roster and check-in.
select tests.login(1);
select is((select count(*)::integer from public.session_roster(tests.id('s_wl')) where section = 'in'), 3, 'IN · 3');
select is((select count(*)::integer from public.session_roster(tests.id('s_wl')) where section = 'dropped'), 2, 'DROPPED · 2');
select is((select replaced_by from public.session_roster(tests.id('s_wl')) where user_id = tests.u(3)), tests.u(7),
          'dropped row names who took the spot');
select tests.logout();
create function tests.payment_status(p_session uuid, n integer) returns text language sql security definer as $f$
  select (private.host_payment_for(p_session, tests.u(n))).status
$f$;
grant execute on function tests.payment_status(uuid, integer) to authenticated;
select tests.login(1);
select is((select payment_status from public.session_roster(tests.id('s_wl')) r where r.user_id = tests.u(5)),
          tests.payment_status(tests.id('s_wl'), 5), 'payment comes from the ops ledger seam');
select throws_ok($$select public.host_session_check_in(tests.id('s_wl'), tests.u(5))$$, 'P0001', 'check_in_not_open',
                 'check-in opens 30 minutes before');
select tests.host_shift(tests.id('s_wl'), '10 minutes');
select tests.login(2);
select is((public.host_session_check_in(tests.id('s_wl'), tests.u(5))).status::text, 'checked_in', 'a co-host checks people in');
select is((public.host_session_check_in(tests.id('s_wl'), tests.u(5))).changed, false, 'twice is fine');
select throws_ok($$select public.host_session_check_in(tests.id('s_wl'), tests.u(9))$$, 'P0001', 'not_attending', 'only people in');

-- The tick generates ahead and is idempotent.
select tests.logout();
select lives_ok($$select private.host_tick()$$, 'the hourly tick runs');
select is(private.host_materialize_series(tests.id('series2')), 0, 'and has nothing new for an up-to-date series');

-- Analytics are recorded server-side.
select ok((select count(*) from private.analytics_events where name = 'host_series_updated') >= 1, 'host_series_updated');
select ok((select count(*) from private.analytics_events where name = 'host_session_joined') >= 4, 'host_session_joined');

select * from finish();
rollback;
