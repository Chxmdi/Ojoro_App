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

-- Step 7 BE-PASSPORT helpers. A complete Challenge between tests.u(a) (side a) and tests.u(b): a's and
-- b's values in seconds, verified by both. Returns the event id.
create function tests.result(a integer, b integer, p_a numeric, p_b numeric) returns uuid language plpgsql as $$
declare
  v uuid := tests.event(a, b);
begin
  perform tests.go_live(v, a, b);
  -- Each result a minute after the one before (the stamp's time is when it went live).
  perform set_config('role', 'postgres', true);
  update public.challenge_events
     set live_at = now() - interval '1 day' + make_interval(mins => (select count(*)::integer from public.challenge_results))
   where id = v;
  perform tests.finish(v, a, b, p_a, p_b);
  return v;
end;
$$;

-- A finished game for tests.u(n) at Test Pitch (or p_place), p_ago before now, with its stamp.
create function tests.stamp(n integer, p_ago interval, p_sport text default 'football',
                            p_place uuid default '00000000-0000-4000-9100-000000000001')
returns uuid language plpgsql security definer as $$
declare
  v_plan uuid;
  v_act uuid;
begin
  insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count)
  values (p_sport, now() - p_ago, 60, p_place, 2, 'public', now() - p_ago - interval '1 hour', 'game_on', 'quick',
          tests.u(n), tests.u(n), 1)
  returning id into v_plan;
  insert into public.plan_members (plan_id, user_id, via) values (v_plan, tests.u(n), 'host');
  insert into public.activities (plan_id, sport_id, starts_at, ends_at, place_id, capacity, host_id, confirmed_count,
                                 checked_in_count, attendance_rule, check_in_opens_at, check_in_closes_at, status,
                                 after_closes_at)
  values (v_plan, p_sport, now() - p_ago, now() - p_ago + interval '60 minutes', p_place, 2, tests.u(n), 1, 1,
          'check_in', now() - p_ago - interval '30 minutes', now() - p_ago + interval '60 minutes', 'complete',
          now() - p_ago + interval '1 day')
  returning id into v_act;
  insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
  values (v_act, tests.u(n), 'checked_in', now() - p_ago - interval '1 day', now() - p_ago, 'location');
  insert into public.passport_entries (user_id, activity_id, sport_id, place_id, occurred_at, minutes, sport_game_number)
  values (tests.u(n), v_act, p_sport, p_place, now() - p_ago, 60, 1);
  return v_act;
end;
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

-- Step 8 TRUST helpers. tests.u(11) is an Ojoro admin, tests.u(12) a moderator.
insert into private.staff_members (user_id, role, note)
values (tests.u(11), 'admin', 'test'), (tests.u(12), 'moderator', 'test');

-- Fails with the code a statement raises (or 'ok'), for "this surface refuses it" checks.
create function tests.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;

-- A finished game where tests.u(n) confirmed but never checked in (counts as missed), p_ago ago.
create function tests.missed(n integer, p_ago interval default '3 days') returns uuid
language plpgsql security definer as $$
declare
  v_act uuid := tests.stamp(1, p_ago);
begin
  insert into public.attendance (activity_id, user_id, status, confirmed_at)
  values (v_act, tests.u(n), 'confirmed', now() - p_ago - interval '1 day');
  return v_act;
end;
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

-- Step 8 TRUST: staff, the moderation queue (cases, severity, de-duplication), staff reads and writes,
-- hidden content, paused accounts, places, and the audit log nobody can edit.
select no_plan();

-- The queue starts empty here (local seed cases are rolled back with the rest).
delete from public.reports;
delete from private.moderation_cases;

select tests.keep('crew', tests.make_crew(1, array[2, 3, 4, 5, 6]));
select tests.login(2);
select tests.keep('m1', (public.send_message(gen_random_uuid(), 'You are useless, quit the crew.', tests.id('crew'))).id);
select tests.keep('m2', (public.send_message(gen_random_uuid(), 'Second message.', tests.id('crew'))).id);

-- Staff recognition -------------------------------------------------------------------------------------------
select tests.login(3);
select is(public.my_staff_role(), null, 'not staff: no role');
select throws_ok($$select public.staff_queue()$$, 'P0001', 'not_staff', 'staff reads are staff only');
select throws_ok(format('select public.staff_hide_content(%L, %L, %L, null, gen_random_uuid())', 'message', tests.id('m1'), 'x'),
                 'P0001', 'not_staff', 'staff writes are staff only');
select tests.login(11);
select is(public.my_staff_role(), 'admin', 'admin recognised');
select tests.login(12);
select is(public.my_staff_role(), 'moderator', 'moderator recognised');
select tests.logout();
select is((select count(*)::integer from information_schema.role_table_grants
           where table_schema = 'private' and table_name in ('staff_members', 'moderation_cases', 'trust_audit', 'appeals',
                                                             'account_pauses', 'content_hides', 'reputation_corrections')
             and grantee in ('anon', 'authenticated')), 0, 'no client role can touch the trust tables');

-- Reports open cases, de-duplicated --------------------------------------------------------------------------------
select tests.login(3);
select tests.keep('r1', public.report('message', tests.id('m1'), 'harassment', 'Aimed at me.'));
select is(public.report('message', tests.id('m1'), 'harassment', 'again'), tests.id('r1'), 'the same reporter again: the same report');
select is((select count(*)::integer from public.reports where reporter_id = tests.u(3)), 1, 'no second row');
select tests.logout();
select tests.keep('case1', (select case_id from public.reports where id = tests.id('r1')));
select isnt(tests.id('case1'), null, 'the report joined a case');
select is((select private.severity_label(severity_rank) from private.moderation_cases where id = tests.id('case1')), 'medium',
          'harassment starts at medium');
select is((select owner_id from private.moderation_cases where id = tests.id('case1')), tests.u(2), 'owner is the sender');
select is((select snapshot ->> 'text' from private.moderation_cases where id = tests.id('case1')), 'You are useless, quit the crew.',
          'the reported words are kept');
select tests.login(4);
select public.report('message', tests.id('m1'), 'spam');
select tests.login(5);
select public.report('message', tests.id('m1'), 'harassment');
select tests.logout();
select is((select reporter_count from private.moderation_cases where id = tests.id('case1')), 3, 'three people, one case');
select is((select private.severity_label(severity_rank) from private.moderation_cases where id = tests.id('case1')), 'high',
          'three reporters raise it a step');
select is((select reasons[1]::text from private.moderation_cases where id = tests.id('case1')), 'harassment', 'most reported reason first');
select tests.login(4);
select tests.keep('r2', public.report('message', tests.id('m2'), 'spam'));
select tests.keep('case2', (select case_id from public.reports where id = tests.id('r2')));
select tests.logout();
select is((select private.severity_label(severity_rank) from private.moderation_cases where id = tests.id('case2')), 'low', 'spam is low');

-- Staff reads ----------------------------------------------------------------------------------------------------------
select tests.login(12);
select is((public.staff_queue()) -> 'items' -> 0 ->> 'id', tests.id('case1')::text, 'high first');
select is(((public.staff_queue()) -> 'counts' ->> 'open')::integer, 2, 'tab counts');
select is(jsonb_array_length((public.staff_queue(p_severity => array['low'])) -> 'items'), 1, 'severity filter');
select is(jsonb_array_length((public.staff_queue(p_kinds => array['profile'])) -> 'items'), 0, 'kind filter');
select is((public.staff_queue(p_limit => 1)) ->> 'next_cursor', 'o1', 'a next page');
select is((public.staff_queue(p_limit => 1, p_cursor => 'o1')) -> 'items' -> 0 ->> 'id', tests.id('case2')::text, 'the next page');
select is((public.staff_queue(p_limit => 1, p_cursor => 'o1')) ->> 'next_cursor', null, 'no page after the last');
select throws_ok($$select public.staff_queue(p_cursor => 'x')$$, 'P0001', 'invalid_argument', 'bad cursor');
select is((public.staff_queue()) -> 'items' -> 0 -> 'owner' ->> 'display_name', 'Tester 2', 'owner shown by name');
select is((public.staff_queue()) -> 'items' -> 0 ->> 'preview', 'You are useless, quit the crew.', 'preview text');
select tests.keep('detail', null);
select is(jsonb_array_length((public.staff_case(tests.id('case1'))) -> 'reports'), 3, 'case detail lists its reports');
select is((public.staff_case(tests.id('case1'))) -> 'subject' ->> 'title', 'Message in Test Crew', 'subject title');
select is((public.staff_case(tests.id('case1'))) -> 'related' -> 0 ->> 'id', tests.id('case2')::text,
          'related: other cases against the same owner');
select is(((public.staff_case(tests.id('case1'))) -> 'owner_history' -> 'cases_against' ->> 'total')::integer, 2, 'owner history');
select throws_ok(format('select public.staff_case(%L)', gen_random_uuid()), 'P0001', 'case_not_found', 'no such case');
select is(((public.staff_user(tests.u(2))) -> 'profile' ->> 'display_name'), 'Tester 2', 'person detail');
select is(jsonb_array_length((public.staff_find_users('tester 2')) -> 'items'), 1, 'find people by name');
select throws_ok($$select public.staff_find_users('a')$$, 'P0001', 'invalid_argument', 'two characters at least');
select tests.logout();
select ok((select count(*) from private.trust_audit where actor_id = tests.u(12) and action = 'view_case') >= 3,
          'reading a case is audited');
select ok(exists (select 1 from private.trust_audit where actor_id = tests.u(12) and action = 'view_queue'), 'the queue read is audited');
select ok(exists (select 1 from private.trust_audit where actor_id = tests.u(12) and action = 'view_user'
                  and target_user_id = tests.u(2)), 'a person read is audited with who');
select ok(exists (select 1 from private.trust_audit where actor_id = tests.u(12) and action = 'find_users'), 'search is audited');

-- Assign -----------------------------------------------------------------------------------------------------------------
select tests.login(12);
select is((public.staff_assign_case(tests.id('case1'), null, '10000000-0000-4000-8000-000000000001')) ->> 'status', 'reviewing', 'assigned');
select is((public.staff_assign_case(tests.id('case1'), null, '10000000-0000-4000-8000-000000000001')) ->> 'changed', 'true',
          'a retry returns the first result');
select is((public.staff_assign_case(tests.id('case1'), null, gen_random_uuid())) ->> 'changed', 'false', 'already mine');
select throws_ok(format('select public.staff_assign_case(%L, %L, gen_random_uuid())', tests.id('case1'), tests.u(3)),
                 'P0001', 'invalid_argument', 'only to staff');
select is(jsonb_array_length((public.staff_queue(p_assigned => 'me')) -> 'items'), 1, 'mine');
select is(jsonb_array_length((public.staff_queue(p_assigned => 'unassigned')) -> 'items'), 1, 'unassigned');
select tests.login(3);
select is((select status from public.reports where id = tests.id('r1')), 'reviewing', 'the reporter sees it is being looked at');

-- Hide and restore content ----------------------------------------------------------------------------------------------
select tests.login(12);
select throws_ok(format('select public.staff_hide_content(%L, %L, %L, null, gen_random_uuid())', 'message', tests.id('m1'), ' '),
                 'P0001', 'reason_required', 'a reason is required');
select throws_ok(format('select public.staff_hide_content(%L, %L, %L, null, gen_random_uuid())', 'profile', tests.u(2), 'x'),
                 'P0001', 'cannot_hide_kind', 'people are paused, not hidden');
select tests.keep('hide1', ((public.staff_hide_content('message', tests.id('m1'), 'Harassment', null, gen_random_uuid())) ->> 'hide_id')::uuid);
select is((public.staff_hide_content('message', tests.id('m1'), 'Harassment', null, gen_random_uuid())) ->> 'changed', 'false',
          'hiding twice changes nothing');
select tests.login(3);
select is((select is_deleted from public.crew_messages(tests.id('crew'), null, 50) where id = tests.id('m1')), true,
          'hidden: reads as removed');
select is((select body from public.crew_messages(tests.id('crew'), null, 50) where id = tests.id('m1')), null, 'no words');
select tests.login(12);
select is((public.staff_case(tests.id('case1'))) -> 'subject' ->> 'text', 'You are useless, quit the crew.', 'staff still see it');
select is((public.staff_case(tests.id('case1'))) -> 'subject' ->> 'hidden', 'true', 'and that it is hidden');
select is((public.staff_case(tests.id('case1'))) -> 'hide' ->> 'id', tests.id('hide1')::text, 'the hide on the case');
select is((public.staff_queue()) -> 'items' -> 0 ->> 'content_hidden', 'true', 'queue says hidden');
select is((public.staff_restore_content(tests.id('hide1'), 'Context was a joke', gen_random_uuid())) ->> 'changed', 'true', 'restored');
select is((public.staff_restore_content(tests.id('hide1'), 'again', gen_random_uuid())) ->> 'changed', 'false', 'restoring twice');
select throws_ok(format('select public.staff_restore_content(%L, %L, gen_random_uuid())', gen_random_uuid(), 'x'),
                 'P0001', 'hide_not_found', 'no such hide');
select tests.login(3);
select is((select body from public.crew_messages(tests.id('crew'), null, 50) where id = tests.id('m1')),
          'You are useless, quit the crew.', 'the words are back');

-- Moments: hidden from the table and the bucket, then back with their tags.
select tests.keep('game', tests.live_game(1, array[1, 2, 3]));
select set_config('role', 'postgres', true);
insert into public.moments (id, activity_id, author_id, storage_path, alt_text)
values ('20000000-0000-4000-8000-000000000001', tests.id('game'), tests.u(2), tests.id('game') || '/' || tests.u(2) || '/a.jpg', 'Team photo');
insert into public.moment_tags (moment_id, user_id, tagged_by) values ('20000000-0000-4000-8000-000000000001', tests.u(3), tests.u(2));
select tests.login(12);
select tests.keep('hide2', ((public.staff_hide_content('moment', '20000000-0000-4000-8000-000000000001', 'Not from this game', null,
                                                        gen_random_uuid())) ->> 'hide_id')::uuid);
select tests.login(3);
select is((select count(*)::integer from public.moments where id = '20000000-0000-4000-8000-000000000001'), 0, 'hidden moment: gone');
select is(authz.moment_object_hidden(tests.id('game') || '/' || tests.u(2) || '/a.jpg'), true, 'its photo is hidden in the bucket');
select tests.login(12);
select public.staff_restore_content(tests.id('hide2'), 'Was from this game', gen_random_uuid());
select tests.login(3);
select is((select count(*)::integer from public.moments where id = '20000000-0000-4000-8000-000000000001'), 1, 'moment back');
select is((select count(*)::integer from public.moment_tags where moment_id = '20000000-0000-4000-8000-000000000001'), 1,
          'with its tag');

-- Resolve -----------------------------------------------------------------------------------------------------------------
select tests.login(12);
select throws_ok(format('select public.staff_resolve_case(%L, %L, %L, gen_random_uuid())', tests.id('case1'), 'maybe', 'x'),
                 'P0001', 'invalid_argument', 'outcome is actioned or dismissed');
select is((public.staff_resolve_case(tests.id('case1'), 'actioned', 'Warned and hid', gen_random_uuid())) ->> 'status', 'actioned', 'resolved');
select is((public.staff_resolve_case(tests.id('case1'), 'actioned', 'again', gen_random_uuid())) ->> 'changed', 'false', 'resolving twice');
select throws_ok(format('select public.staff_resolve_case(%L, %L, %L, gen_random_uuid())', tests.id('case1'), 'dismissed', 'x'),
                 'P0001', 'case_closed', 'a closed case stays closed');
select throws_ok(format('select public.staff_assign_case(%L, null, gen_random_uuid())', tests.id('case1')),
                 'P0001', 'case_closed', 'a closed case cannot be assigned');
select is((public.staff_resolve_case(tests.id('case2'), 'dismissed', 'Not spam', gen_random_uuid())) ->> 'status', 'dismissed', 'dismissed');
select tests.login(3);
select is((select status from public.reports where id = tests.id('r1')), 'actioned', 'the reporter sees what happened');
select isnt(public.report('message', tests.id('m1'), 'harassment', 'It happened again'), tests.id('r1'),
            'reporting after the case closed: a new report');
select tests.logout();
select is((select count(*)::integer from private.moderation_cases where subject_id = tests.id('m1')), 2, 'and a new case');
select is((select private.severity_label(severity_rank) from private.moderation_cases
           where subject_id = tests.id('m1') and status = 'open'), 'high', 'an owner with an actioned case: one step up');
select is((select count(*)::integer from private.trust_audit where action in ('resolve_case', 'dismiss_case')
           and actor_id = tests.u(12)), 2,
          'resolutions audited');

-- Pause and restore an account ---------------------------------------------------------------------------------------------
select tests.keep('plan', tests.make_plan(1, 6));
select tests.login(12);
select throws_ok(format('select public.staff_pause_account(%L, %L, %L, null, now() - interval %L, null, gen_random_uuid())',
                        tests.u(2), 'harassment', 'x', '1 day'), 'P0001', 'pause_end_invalid', 'an end in the past');
select throws_ok(format('select public.staff_pause_account(%L, %L, %L, null, now() + interval %L, null, gen_random_uuid())',
                        tests.u(2), 'harassment', 'x', '400 days'), 'P0001', 'pause_end_invalid', 'at most a year');
select throws_ok(format('select public.staff_pause_account(%L, %L, %L, null, null, null, gen_random_uuid())',
                        tests.u(11), 'other', 'x'), 'P0001', 'cannot_pause_staff', 'staff are not paused');
select throws_ok(format('select public.staff_pause_account(%L, %L, %L, null, null, null, gen_random_uuid())',
                        gen_random_uuid(), 'other', 'x'), 'P0001', 'user_not_found', 'no such person');
select tests.keep('pause1', ((public.staff_pause_account(tests.u(2), 'harassment', 'Repeated harassment in crew chat',
        'You sent messages aimed at people in your crew.', now() + interval '7 days', tests.id('case1'),
        gen_random_uuid())) ->> 'pause_id')::uuid);
select tests.login(2);
select throws_ok(format('select public.im_down(%L, gen_random_uuid())', tests.id('plan')), 'P0001', 'account_paused',
                 'a paused account cannot act');
select throws_ok(format('select public.send_message(gen_random_uuid(), %L, %L)', 'hi', tests.id('crew')), 'P0001', 'account_paused',
                 'or write');
select throws_ok(format('select public.passport_view(%L)', tests.u(2)), 'P0001', 'account_paused', 'or read');
select is((public.my_account_status()) ->> 'paused', 'true', 'but can see why');
select is((public.my_account_status()) -> 'pause' ->> 'note_to_user', 'You sent messages aimed at people in your crew.', 'with the note');
select is((public.my_account_status()) ->> 'can_appeal', 'true', 'and can appeal');
update public.profiles set display_name = 'New name' where id = tests.u(2);
select tests.logout();
select is((select display_name from public.profiles where id = tests.u(2)), 'Tester 2', 'no direct profile edits while paused');
select tests.login(3);
select is((select count(*)::integer from public.profiles where id = tests.u(2)), 0, 'a paused account disappears for others');
select is((select count(*)::integer from public.crew_messages(tests.id('crew'), null, 50) where sender_id = tests.u(2)), 0,
          'and so do their messages');
select tests.login(12);
select is((public.staff_user(tests.u(2))) -> 'paused' ->> 'id', tests.id('pause1')::text, 'staff see the pause');
select is((public.staff_queue()) -> 'items' -> 0 -> 'owner' ->> 'paused', 'true', 'queue shows the owner is paused');
-- A new pause replaces the old one.
select tests.keep('pause2', ((public.staff_pause_account(tests.u(2), 'harassment', 'Longer', null, null, null,
                                                          gen_random_uuid())) ->> 'pause_id')::uuid);
select tests.logout();
select is((select restore_reason from private.account_pauses where id = tests.id('pause1')), 'Replaced', 'the old pause ends');
select tests.login(12);
select is((public.staff_restore_account(tests.u(2), 'Spoke with them', gen_random_uuid())) ->> 'pause_id', tests.id('pause2')::text, 'restored');
select is((public.staff_restore_account(tests.u(2), 'again', gen_random_uuid())) ->> 'changed', 'false', 'restoring twice');
select tests.login(2);
select is((public.im_down(tests.id('plan'), gen_random_uuid())).is_member, true, 'restored: can act again');
select tests.login(3);
select is((select count(*)::integer from public.profiles where id = tests.u(2)), 1, 'and is seen again');
-- A pause past its end is over by itself.
select tests.logout();
insert into private.account_pauses (user_id, reason, staff_note, starts_at, ends_at)
values (tests.u(6), 'spam', 'Old', now() - interval '10 days', now() - interval '3 days');
select is(authz.is_paused(tests.u(6)), false, 'a pause past its end is over');

-- Places ------------------------------------------------------------------------------------------------------------------
select tests.login(12);
select is((public.staff_set_place_sensitive('00000000-0000-4000-9100-000000000001', true, 'Shelter next door', gen_random_uuid()))
          ->> 'changed', 'true', 'marked sensitive');
select is((select sensitive from public.places where id = '00000000-0000-4000-9100-000000000001'), true, 'the place is sensitive');
select is((public.staff_set_place_sensitive('00000000-0000-4000-9100-000000000001', true, 'again', gen_random_uuid()))
          ->> 'changed', 'false', 'set-to-state');
select is(((public.staff_places('test', true)) -> 'items' -> 0 ->> 'sensitive'), 'true', 'staff place list');
select throws_ok(format('select public.staff_set_place_sensitive(%L, false, %L, gen_random_uuid())', gen_random_uuid(), 'x'),
                 'P0001', 'place_unknown', 'no such place');

-- Roles ---------------------------------------------------------------------------------------------------------------------
select throws_ok(format('select public.staff_set_role(%L, %L, %L, gen_random_uuid())', tests.u(7), 'moderator', 'x'),
                 'P0001', 'not_admin', 'moderators cannot grant');
select tests.login(11);
select is((public.staff_set_role(tests.u(7), 'moderator', 'New team member', gen_random_uuid())) ->> 'changed', 'true', 'granted');
select tests.login(7);
select is(public.my_staff_role(), 'moderator', 'the grant takes effect at once');
select tests.login(11);
select throws_ok(format('select public.staff_set_role(%L, null, %L, gen_random_uuid())', tests.u(11), 'x'),
                 'P0001', 'invalid_argument', 'not your own role');
select is((public.staff_set_role(tests.u(7), null, 'Left the team', gen_random_uuid())) ->> 'changed', 'true', 'revoked');
select tests.login(7);
select throws_ok($$select public.staff_queue()$$, 'P0001', 'not_staff', 'a revoke takes effect at once');
select tests.logout();
select is(private.grant_staff(tests.u(8), 'moderator', 'Operator grant'), true, 'operators grant with SQL');
select ok(exists (select 1 from private.trust_audit where action = 'grant_staff' and actor_id is null and target_user_id = tests.u(8)),
          'SQL grants are audited with no actor');

-- Audit log ----------------------------------------------------------------------------------------------------------------
select tests.login(11);
select is((public.staff_audit_log(p_actions => array['pause_account'])) -> 'items' -> 0 ->> 'action', 'pause_account', 'audit filter');
select is((public.staff_audit_log(p_target_user => tests.u(2), p_actions => array['pause_account'])) -> 'items' -> 0 -> 'actor' ->> 'id',
          tests.u(12)::text, 'who did it');
select is(jsonb_array_length((public.staff_audit_log(p_limit => 2)) -> 'items'), 2, 'paged');
select isnt((public.staff_audit_log(p_limit => 2)) ->> 'next_cursor', null, 'with a next page');
select tests.logout();
select ok((select count(*) from private.trust_audit where action in ('hide_content', 'restore_content', 'pause_account',
            'restore_account', 'assign_case', 'set_place_sensitive', 'grant_staff', 'revoke_staff')) >= 10, 'every write audited');
select throws_ok($$update private.trust_audit set reason = 'edited'$$, 'P0001', 'audit_immutable', 'the audit log cannot be edited');
select throws_ok($$delete from private.trust_audit$$, 'P0001', 'audit_immutable', 'or deleted');
select throws_ok($$truncate private.trust_audit$$, 'P0001', 'audit_immutable', 'or truncated');

-- Account deletion ------------------------------------------------------------------------------------------------
-- tests.u(1) hosted, played, challenged, created a crew, a clan and a program, paid a host and was refunded.
select tests.keep('forming', tests.make_plan(1, 6));
select tests.join(2, tests.id('forming'));
select tests.keep('live', tests.live_game(1, array[1, 2, 3]));
select tests.keep('past', tests.stamp(1, '3 days'));
select tests.keep('ev', tests.result(1, 2, 1500, 1600));
select tests.keep('open_co', tests.call_out(1, 3));
select tests.keep('dcrew', tests.make_crew(1, array[2, 3]));
select tests.login(1);
select tests.keep('clan', (public.create_clan(gen_random_uuid(), 'Deletion Clan', 'open')).id);
select tests.keep('msg', (public.send_message(gen_random_uuid(), 'Last words.', tests.id('dcrew'))).id);
select public.report('profile', tests.u(9), 'spam');
select tests.logout();
select tests.keep('dprog', tests.host_program(1));
select tests.keep('dsess', tests.host_session(tests.id('dprog'), '2 days', 6, false));
select tests.keep('done', tests.host_played(tests.id('dprog'), array[2, 3]));
insert into public.host_ops_audit (program_id, actor_id, action, subject_type) values (tests.id('dprog'), tests.u(1), 'test', 'test');
-- Money: u1 paid a drop-in to u5's program and got part of it back.
select tests.keep('prog5', tests.host_program(5));
insert into public.host_charges (id, program_id, user_id, kind, amount_cents, currency, status, method, paid_at)
values ('40000000-0000-4000-8000-000000000001', tests.id('prog5'), tests.u(1), 'pack', 7000, 'CAD', 'paid', 'app', now() - interval '3 days');
insert into public.host_refunds (program_id, charge_id, user_id, amount_cents, currency, reason)
values (tests.id('prog5'), '40000000-0000-4000-8000-000000000001', tests.u(1), 2000, 'CAD', 'host_decision');
select tests.keep('result_count', null);
select is(tests.err($$delete from auth.users where id = tests.u(1)$$), 'ok', 'an account that hosted, played and paid can be deleted');
select is((select count(*)::integer from public.profiles where id = tests.u(1)), 0, 'the profile is gone');
select is((select status::text from public.plans where id = tests.id('forming')), 'cancelled', 'their forming plan is called off');
select is((select count(*)::integer from public.plan_members where plan_id = tests.id('forming') and user_id = tests.u(2)), 1,
          'its members are kept');
select is((select host_id from public.activities where id = tests.id('live')), private.former_member(), 'a game they hosted stays, by a former member');
select is((select host_id from public.activities where id = tests.id('past')), private.former_member(), 'and past games');
select is((select count(*)::integer from public.challenge_results where event_id = tests.id('ev')), 1, 'results are never removed');
select is((select a_captain_id from public.challenge_events where id = tests.id('ev')), private.former_member(), 'the event keeps its side');
select is((select challenger_id from public.call_outs where event_id = tests.id('ev')), private.former_member(),
          'the Call-Out behind an event stays');
select is((select count(*)::integer from public.call_outs where id = tests.id('open_co')), 0, 'an open Call-Out goes with them');
select is((select created_by from public.crews where id = tests.id('dcrew')), private.former_member(), 'the crew stays');
select is((select created_by from public.clans where id = tests.id('clan')), private.former_member(), 'the clan stays');
select isnt((select archived_at from public.host_programs where id = tests.id('dprog')), null, 'their program is archived');
select is((select status::text from public.activities where id = tests.activity_of(tests.id('dsess'))), 'cancelled',
          'its sessions still to come are called off');
select is((select actor_id from public.host_ops_audit where action = 'test' and program_id = tests.id('dprog')), null,
          'ledger audit rows stay, without them');
select is((select user_id from public.host_charges where id = '40000000-0000-4000-8000-000000000001'), private.former_member(),
          'a host keeps the charge in their ledger');
select is((select user_id from public.host_refunds where charge_id = '40000000-0000-4000-8000-000000000001'), private.former_member(),
          'and the refund');
select is((select count(*)::integer from public.messages where id = tests.id('msg')), 0, 'their own messages go with them');
select is((select count(*)::integer from public.reports where subject_id = tests.u(9)), 0, 'and their reports');
select throws_ok(format('update public.challenge_results set a_value = 1 where event_id = %L', tests.id('ev')),
                 'P0001', 'result_already_verified', 'results are still final after the deletion');
select throws_ok($$delete from public.profiles where id = private.former_member()$$, 'P0001', 'invalid_argument',
                 'the placeholder stays');

select * from finish();
rollback;
