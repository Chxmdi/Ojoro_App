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

-- Host OS core: HostHome (week, needs you, last 30 days), announcements (recipients, pin, push limit,
-- read counts) and the notification words.
select no_plan();

select tests.keep('prog', tests.host_program(1));
select tests.keep('s', tests.host_session(tests.id('prog'), '1 day', 4));
select tests.keep('s_sk', tests.host_session(tests.id('prog'), '2 days', 6));
select tests.host_played(tests.id('prog'), array[1, 2, 3], '5 days');
-- One no-show in a session last week.
select tests.keep('past', tests.host_played(tests.id('prog'), array[2, 4], '8 days'));
insert into public.attendance (activity_id, user_id, status, confirmed_at)
values (tests.activity_of(tests.id('past')), tests.u(5), 'confirmed', now() - interval '9 days');
select tests.logout();

select tests.login(2);
select lives_ok($$select public.join_waitlist(tests.activity_of(tests.id('s')), gen_random_uuid())$$, 'Two in');
select tests.login(3);
select lives_ok($$select public.join_waitlist(tests.activity_of(tests.id('s')), gen_random_uuid())$$, 'Three in');
select tests.login(1);
select lives_ok($$select public.skip_session(tests.id('s_sk'))$$, 'skip one');

-- HostHome.
select is((select sessions_this_week from public.host_home(tests.id('prog'))), 1, 'scheduled sessions this week');
select is((select spots_taken || ' of ' || spots_total from public.host_home(tests.id('prog'))), '2 of 4', 'spots taken');
select is((select last30_sessions from public.host_home(tests.id('prog'))), 2, 'sessions in the last 30 days');
select is((select last30_showed_up_pct from public.host_home(tests.id('prog'))), 83, 'showed up: 5 of 6');
select is((select last30_ojoro_hours from public.host_home(tests.id('prog'))), 8, 'Ojoro hours: 5 × 90 min');
select is((select count(*)::integer from public.host_week(tests.id('prog'))), 2, 'THIS WEEK lists the skipped one too');
select is((select status from public.host_week(tests.id('prog')) where session_id = tests.id('s_sk')), 'skipped', 'marked skipped');
select is((select in_count from public.host_week(tests.id('prog')) where session_id = tests.id('s')), 2, '2 / 4');
select is((select needs_you_count from public.host_home(tests.id('prog'))), 0, 'nothing needs you');
select tests.login(2);
select throws_ok($$select * from public.host_week(tests.id('prog'))$$, 'P0001', 'not_program_host', 'hosts only');

-- Announcements.
select tests.login(1);
select ok(public.set_program_member(tests.id('prog'), tests.u(6), true), 'Six is a member');
select is((select session_count from public.announce_context(tests.id('s'))), 2, 'Tonight''s 2');
select is((select members_count from public.announce_context(tests.id('s'))), 1, 'All members 1');
select is((select everyone_count from public.announce_context(tests.id('s'))), 5, 'Everyone: played (host included) or member');
select is(public.announce_recipient_count(tests.id('s'), array['session', 'members']::public.host_audience[]), 3, 'live count');
select is((select count(*)::integer from public.announce_templates(tests.id('s'))), 4, 'four templates');
select ok((select body from public.announce_templates(tests.id('s')) where key = 'pitch_moved') like 'Pitch moved%Test Pitch%',
          'worded for this session');
select throws_ok($$select public.send_announcement(tests.id('s'), '{}', 'x', null, true, false, gen_random_uuid())$$, 'P0001',
                 'announce_no_recipients', 'pick who it goes to');
select throws_ok($$select public.send_announcement(tests.id('s'), '{session}', repeat('x', 281), null, true, false, gen_random_uuid())$$,
                 'P0001', 'invalid_argument', 'up to 280 characters');
select tests.keep('a1', (public.send_announcement(tests.id('s'), '{session}', 'Pitch moved to the south side.', 'pitch_moved',
                                                  true, true, '55555555-5555-4555-8555-555555555555')).announcement_id);
select is((public.send_announcement(tests.id('s'), '{session}', 'Pitch moved to the south side.', 'pitch_moved',
                                    true, true, '55555555-5555-4555-8555-555555555555')).announcement_id, tests.id('a1'),
          'a retry sends nothing new');
select is((select recipient_count from public.host_announcements where id = tests.id('a1')), 2, 'sent to 2');
select is((select count(*)::integer from public.messages m where m.activity_id = tests.activity_of(tests.id('s'))
             and m.payload ->> 'host_announcement' = tests.id('a1')::text), 1, 'pinned in the session chat');
select is(tests.notified(2, 'host_announcement'), 1, 'pushed to people in');
select is((select pushes_left from public.announce_context(tests.id('s'))), 1, '1 push left');
select tests.keep('a2', (public.send_announcement(tests.id('s'), '{session,members}', 'Running late.', 'running_late', true, true,
                                                  gen_random_uuid())).announcement_id);
select is((select pinned from public.host_announcements where id = tests.id('a1')), false, 'one pinned at a time');
select throws_ok($$select public.send_announcement(tests.id('s'), '{session}', 'Third.', null, false, true, gen_random_uuid())$$,
                 'P0001', 'announce_push_limit', 'two pushes per session');
select lives_ok($$select public.send_announcement(tests.id('s'), '{session}', 'Chat only.', null, false, false, gen_random_uuid())$$,
                'it can still go without a push');
select tests.login(2);
select is((select body from public.session_pinned_announcement(tests.activity_of(tests.id('s')))), 'Running late.',
          'people in see the pinned line');
select throws_ok($$select public.send_announcement(tests.id('s'), '{session}', 'Hi.', null, false, false, gen_random_uuid())$$, 'P0001',
                 'not_program_host', 'only hosts announce');
select ok(public.mark_announcement_read(tests.id('a2')), 'READ');
select ok(not public.mark_announcement_read(tests.id('a2')), 'once');
select tests.login(6);
select is((select body from public.session_pinned_announcement(tests.activity_of(tests.id('s')))), 'Running late.',
          'a member it was sent to sees it too');
select is((select count(*)::integer from public.host_announcements), 1, 'recipients read their announcements, not others');
select tests.login(7);
select is((select count(*)::integer from public.session_pinned_announcement(tests.activity_of(tests.id('s')))), 0,
          'nobody else');
select tests.login(1);
select is((select read_count from public.host_announcement_history(tests.id('prog')) where announcement_id = tests.id('a2')), 1,
          'read count');
select is((select count(*)::integer from public.host_announcement_history(tests.id('prog'))), 3, 'SENT BEFORE');
select ok(public.unpin_announcement(tests.id('a2')), 'unpin');

-- Notification words.
select tests.keep('s_ap', tests.host_session(tests.id('prog'), '3 days', 4, true));
select tests.login(8);
select lives_ok($$select public.ask_to_join(tests.id('s_ap'), null, gen_random_uuid())$$, 'Eight asks');
select tests.login(1);
select is((select title from public.my_notifications() where type::text = 'host_request'), 'Tester 8 asked to join.',
          'host_request words');
select is((select section from public.my_notifications() where type::text = 'host_request'), 'needs_you', 'and it needs you');
select ok((select href from public.my_notifications() where type::text = 'host_request') like '/host/%/requests', 'links to requests');
select tests.login(2);
select is((select title from public.my_notifications() where type::text = 'host_announcement' limit 1), 'From Tester 1, your host',
          'host_announcement words');
select ok(exists (select 1 from public.my_notifications() where type::text = 'host_announcement' and body = 'Running late.'),
          'the announcement');
select tests.logout();
select is(private.generic_copy('host_update'), 'A session you''re in has an update.', 'lock-screen words');

-- Ops ledger updates bring their own words (data.text).
select tests.logout();
select private.notify(array[tests.u(2)], 'host_update', 'activity', tests.activity_of(tests.id('s')), null, 'host_refund:test',
  jsonb_build_object('change', 'refund_decided', 'text', 'Ade refunded $8 for Tuesday.'), p_activity => tests.activity_of(tests.id('s')));
select private.notify(array[tests.u(2)], 'host_update', 'activity', tests.activity_of(tests.id('s')), null, 'host_series:test',
  jsonb_build_object('change', 'series_updated'), p_activity => tests.activity_of(tests.id('s')));
select tests.login(2);
select is((select title from public.my_notifications() where type::text = 'host_update' and data ->> 'change' = 'refund_decided'),
          'Ade refunded $8 for Tuesday.', 'ops host_update shows data.text');
select is((select title from public.my_notifications() where type::text = 'host_update' and data ->> 'change' = 'series_updated'),
          'Your football session changed.', 'series changes keep their words');

-- Report reaches a program; not across a block.
select tests.login(7);
select lives_ok($$select public.report('host_program', tests.id('prog'), 'spam')$$, 'report a program');
select tests.block(1, 7);
select tests.login(7);
select throws_ok($$select public.report('host_program', tests.id('prog'), 'spam')$$, 'P0001', 'subject_not_found',
                 'not one whose host blocked you');

select * from finish();
rollback;
