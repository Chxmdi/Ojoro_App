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

-- Host OS core: join requests (approval, auto-approve rules, quiet decline, undo), privacy, and the
-- People CRM (attendance at this host's sessions only, tags, private notes, drifting invite-back).
select no_plan();

select tests.keep('prog', tests.host_program(1));
select tests.keep('s', tests.host_session(tests.id('prog'), '2 days', 3, true));
-- Two (u2) has played a session of this program before. Three plays elsewhere with Two.
select tests.keep('past', tests.host_played(tests.id('prog'), array[1, 2], '14 days'));
select tests.connect(2, 3);
select tests.connect(1, 2);
update public.profiles set area = 'Plateau, Montréal' where id = tests.u(3);

-- A first-timer needs the host's OK.
select tests.login(3);
select throws_ok($$select public.join_waitlist(tests.activity_of(tests.id('s')), gen_random_uuid())$$, 'P0001', 'approval_required',
                 'join_waitlist says the host approves new faces');
select is((public.ask_to_join(tests.id('s'), 'Played a bit in Lyon.', '33333333-3333-4333-8333-333333333333')).request_status::text,
          'pending', 'ASK TO JOIN');
select is((public.ask_to_join(tests.id('s'), 'Played a bit in Lyon.', '33333333-3333-4333-8333-333333333333')).changed, true,
          'a retry returns the first result');
select is((public.ask_to_join(tests.id('s'), 'again', gen_random_uuid())).changed, false, 'asking twice changes nothing');
select is((select count(*)::integer from public.host_join_requests), 1, 'they see their own request');
select throws_ok($$select public.ask_to_join(tests.id('s'), repeat('x', 281), gen_random_uuid())$$, 'P0001', 'invalid_argument',
                 'a note is up to 280 characters');
select is(tests.notified(1, 'host_request'), 1, 'the host is told');

-- Played with you: straight in (rule on by default).
select tests.login(2);
select is((public.join_waitlist(tests.activity_of(tests.id('s')), gen_random_uuid())).status::text, 'confirmed',
          'people who played with you join straight away');

-- HostRequests.
select tests.login(1);
select is((select count from public.host_needs_you(tests.id('prog')) where kind = 'join_requests'), 1, 'NEEDS YOU: 1 asked to join');
select is((select note from public.session_requests(tests.id('s'))), 'Played a bit in Lyon.', 'their note');
select is((select area from public.session_requests(tests.id('s'))), 'Plateau, Montréal', 'area only');
select is((select distance_km from public.session_requests(tests.id('s'))), 1, 'about 1 km away (coarse)');
select is((select ojoro_games from public.session_requests(tests.id('s'))), 1, 'their Ojoro games');
select is((select show_up_of from public.session_requests(tests.id('s'))), 1, 'show-up record');
select is((select shared_names from public.session_requests(tests.id('s'))), array['Tester 2'], 'You both play with Tester 2.');
select is((select id_verified from public.session_requests(tests.id('s'))), false, 'no ID verification yet');
select is((select stated_level::text from public.session_requests(tests.id('s'))), null, 'no level set: null');
select tests.logout();
insert into public.user_sports (user_id, sport_id, level) values (tests.u(3), 'football', 'learning')
on conflict (user_id, sport_id) do update set level = excluded.level;
select tests.login(1);
select is((select stated_level::text from public.session_requests(tests.id('s'))), 'learning',
          'the host deciding sees their self-declared level for this sport');
select tests.keep('r3', (select request_id from public.session_requests(tests.id('s'))));
select tests.login(4);
select throws_ok($$select * from public.session_requests(tests.id('s'))$$, 'P0001', 'not_program_host', 'hosts only');
select throws_ok($$select public.decide_join_request(tests.id('r3'), true, gen_random_uuid())$$, 'P0001', 'not_program_host',
                 'only hosts decide');

select tests.login(1);
select is((public.decide_join_request(tests.id('r3'), true, '44444444-4444-4444-8444-444444444444')).attendance_status::text,
          'confirmed', 'APPROVE puts them in');
select is((public.decide_join_request(tests.id('r3'), true, '44444444-4444-4444-8444-444444444444')).changed, true,
          'retry with the key returns the first result');
select is((public.decide_join_request(tests.id('r3'), true, gen_random_uuid())).changed, false, 'approving twice is a no-op');
select throws_ok($$select public.decide_join_request(tests.id('r3'), false, gen_random_uuid())$$, 'P0001', 'request_decided',
                 'decide the other way only after UNDO');
select is(tests.notified(3, 'host_update', 'request_approved'), 1, 'they hear yes');
select is((select approved_via::text from public.session_roster(tests.id('s')) where user_id = tests.u(3)), 'host',
          'the roster says the host approved them');
select is((select first_time from public.session_roster(tests.id('s')) where user_id = tests.u(3)), true, 'first time');
select is((select first_time from public.session_roster(tests.id('s')) where user_id = tests.u(2)), false, 'not for Two');

-- UNDO: the approval and their spot go, the request is pending again.
select is((public.undo_join_decision(tests.id('r3'))).request_status::text, 'pending', 'UNDO');
select is(tests.attendance_status(tests.id('s'), 3)::text, 'cancelled', 'their spot goes');
select is(tests.notified(3, 'host_update', 'request_approved'), 0, 'the unread yes is taken back');

-- Quiet decline.
select is((public.decide_join_request(tests.id('r3'), false, gen_random_uuid())).request_status::text, 'declined', 'DECLINE');
select is(tests.notified(3, 'host_update', 'request_declined'), 1, 'they are told quietly');
select tests.logout();
select is((select data - 'session_id' from public.notifications where recipient_id = tests.u(3)
           and data ->> 'change' = 'request_declined'), '{"change": "request_declined"}'::jsonb, 'no reason, no words');
update public.host_join_requests set decided_at = now() - interval '11 minutes' where id = tests.id('r3');
select tests.login(1);
select throws_ok($$select public.undo_join_decision(tests.id('r3'))$$, 'P0001', 'undo_expired', 'undo lasts 10 minutes');
select tests.login(3);
select is((public.ask_to_join(tests.id('s'), 'please', gen_random_uuid())).request_status::text, 'declined',
          'a declined request stays declined');

-- Auto-approve rules.
select tests.login(1);
select is((public.update_host_rules(tests.id('prog'), p_played_with => false)).auto_approve_played_with, false, 'switch a rule off');
select tests.keep('s2', tests.host_session(tests.id('prog'), '2 days', 6, true));
select tests.login(2);
select throws_ok($$select public.join_waitlist(tests.activity_of(tests.id('s2')), gen_random_uuid())$$, 'P0001', 'approval_required',
                 'with the rule off, people who played with you ask too');
select tests.keep('crew', tests.make_crew(1, array[5]));
select tests.login(5);
select is((public.ask_to_join(tests.id('s2'), null, gen_random_uuid())).attendance_status::text, 'confirmed',
          'Your Crews: crew-mates of a host join straight in');
select tests.login(1);
select ok((public.update_host_rules(tests.id('prog'), p_experienced => true)).auto_approve_experienced, 'experienced rule on');
select tests.logout();
select tests.connect(6, 7);
select tests.connect(6, 8);
select tests.login(6);
select throws_ok($$select public.join_waitlist(tests.activity_of(tests.id('s2')), gen_random_uuid())$$, 'P0001', 'approval_required',
                 'two games anywhere is not enough');
select tests.logout();
select tests.connect(6, 9);
select tests.login(6);
select is((public.join_waitlist(tests.activity_of(tests.id('s2')), gen_random_uuid())).status::text, 'confirmed',
          '3 or more checked-in games: straight in');

-- Blocks.
select tests.block(1, 10);
select tests.login(10);
select throws_ok($$select public.join_waitlist(tests.activity_of(tests.id('s2')), gen_random_uuid())$$, 'P0001', 'activity_not_found',
                 'someone the host blocked can''t join, and isn''t told why');

-- People CRM.
select tests.logout();
select tests.host_played(tests.id('prog'), array[2, 4], '3 days');
select tests.host_played(tests.id('prog'), array[2, 4], '10 days');
select tests.host_played(tests.id('prog'), array[11], '60 days');
select tests.host_played(tests.id('prog'), array[11], '50 days');
select tests.host_played(tests.id('prog'), array[11], '45 days');
select tests.login(1);
select is((select played_count from public.host_people_counts(tests.id('prog'))), 3, 'people who have played (hosts not counted)');
select is((select regulars from public.host_people_counts(tests.id('prog'))), 2, 'regulars: twice in 30 days');
select is((select drifting from public.host_people_counts(tests.id('prog'))), 1, 'drifting: a regular gone 3 weeks');
select is((select count(*)::integer from public.host_people(tests.id('prog'), 'drifting')), 1, 'Drifting filter');
select is((select user_id from public.host_people(tests.id('prog'), 'drifting')), tests.u(11), 'it is Eleven');
select is((select last12_count from public.host_people(tests.id('prog'), 'all') where user_id = tests.u(4)), 2, 'last 12');
select throws_ok($$select * from public.host_people(tests.id('prog'), 'vip')$$, 'P0001', 'invalid_argument', 'known filters');

-- Only this host's sessions: Four's game elsewhere doesn't count.
select tests.logout();
select tests.connect(4, 12);
select tests.login(1);
select is((select sessions_total from public.host_person(tests.id('prog'), tests.u(4))), 2,
          'attendance at your own sessions only');

select is(public.set_person_tags(tests.id('prog'), tests.u(4), array['Centre-back', 'spare bibs', 'centre-back']),
          array['centre-back', 'spare bibs'], 'tags are lowercased and unique');
select throws_ok($$select public.set_person_tags(tests.id('prog'), tests.u(4), array['<script>'])$$, 'P0001', 'tag_invalid', 'tag words');
select throws_ok($$select public.set_person_tags(tests.id('prog'), tests.u(12), array['x'])$$, 'P0001', 'person_not_found',
                 'only people this program knows');
select is((select count(*)::integer from public.host_people(tests.id('prog'), 'all', 'SPARE')), 1, 'search matches tags');
select is((select count(*)::integer from public.host_people(tests.id('prog'), 'all', 'tester 4')), 1, 'and names');
select is(public.set_person_note(tests.id('prog'), tests.u(4), 'Usually 5 minutes late.'), 'Usually 5 minutes late.', 'YOUR NOTES');
select is((select my_note from public.host_person(tests.id('prog'), tests.u(4))), 'Usually 5 minutes late.', 'the author reads it');
select ok(public.add_co_host(tests.id('prog'), tests.u(9)), 'a co-host');
select tests.login(9);
select is((select my_note from public.host_person(tests.id('prog'), tests.u(4))), null, 'other hosts never read it');
select is((select count(*)::integer from public.host_person_notes), 0, 'not even through the table');
select tests.login(4);
select is((select count(*)::integer from public.host_person_notes), 0, 'nor the person');
select is((select count(*)::integer from public.host_people), 0, 'participants never read the CRM');
select throws_ok($$select * from public.host_person(tests.id('prog'), tests.u(4))$$, 'P0001', 'not_program_host', 'hosts only');
select tests.login(1);
select is(public.set_person_note(tests.id('prog'), tests.u(4), '  '), null, 'empty clears it');

-- Drifting invite-back: once a week.
select is((select sent from public.invite_back(tests.id('prog'), tests.id('s2'))), 1, 'INVITE THEM BACK');
select is(tests.notified(11, 'host_update', 'invite_back'), 1, 'Eleven gets the invite');
select is((select sent from public.invite_back(tests.id('prog'), tests.id('s2'))), 0, 'not twice in a week');
select is((select skipped from public.invite_back(tests.id('prog'), tests.id('s2'), array[tests.u(5), tests.u(12)])), 2,
          'people already in, or unknown, are skipped');

select * from finish();
rollback;
