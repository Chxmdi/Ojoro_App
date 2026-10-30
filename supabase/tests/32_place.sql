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


-- Step 7 (Places) helpers ----------------------------------------------------------------------------------

-- Isolate from whatever the local database holds (seed data, other sessions): rolled back at the end.
update public.intent_signals set status = 'withdrawn', withdrawn_at = now() where status = 'active';
update public.plans set status = 'cancelled', cancelled_at = now() where status in ('forming', 'game_on');
update public.activities set status = 'cancelled', cancelled_at = now() where status in ('confirmed', 'live');
update public.clan_runs set status = 'cancelled', cancelled_at = now() where status <> 'cancelled';

-- A place in an area. Plateau test places sit inside tests.u(n)'s 5 km radius.
create function tests.place(
  p_slug text, p_area text, p_lat double precision, p_lng double precision, p_sensitive boolean default false
) returns uuid language sql security definer as $$
  insert into public.places (slug, name, area, city, lat, lng, sport_ids, surface, floodlit_until, sensitive)
  values (p_slug, initcap(replace(p_slug, '-', ' ')), p_area, 'Montréal', p_lat, p_lng,
          '{football,running,volleyball}', 'Turf', '23:00', p_sensitive)
  returning id;
$$;

-- A forming plan at a place, hosted by tests.u(p_host), with p_members people (the host first).
create function tests.plan_at(
  p_host integer, p_place uuid, p_starts interval default '3 hours',
  p_audience public.audience default 'public', p_sport text default 'football',
  p_capacity integer default 8, p_members integer default 1
) returns uuid language plpgsql security definer as $$
declare
  v uuid;
begin
  insert into public.plans (sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            source, created_by, host_id, member_count, level_label)
  values (p_sport, 'Test ' || p_sport, now() + p_starts, 60, p_place, p_capacity, p_audience, now() + p_starts / 2,
          'quick', tests.u(p_host), tests.u(p_host), p_members, 'Mixed level')
  returning id into v;
  insert into public.plan_members (plan_id, user_id, via)
  select v, tests.u(p_host + i), case when i = 0 then 'host'::public.member_via else 'im_down'::public.member_via end
  from generate_series(0, p_members - 1) i;
  insert into public.plan_meeting_points (plan_id, label) values (v, 'North pitch');
  return v;
end;
$$;

-- A GAME ON game at a place starting at now() + p_starts (negative = already live), host only.
create function tests.game_at(
  p_host integer, p_place uuid, p_starts interval default '2 hours',
  p_audience public.audience default 'public', p_title text default 'Sparring'
) returns uuid language plpgsql security definer as $$
declare
  v_plan uuid;
  v uuid;
begin
  insert into public.plans (sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count, locked_at)
  values ('football', p_title, now() + p_starts, 90, p_place, 2, p_audience, now() + p_starts - interval '1 hour',
          'game_on', 'quick', tests.u(p_host), tests.u(p_host), 1, now() - interval '1 day')
  returning id into v_plan;
  insert into public.plan_members (plan_id, user_id, via) values (v_plan, tests.u(p_host), 'host');
  insert into public.activities (plan_id, sport_id, title, starts_at, ends_at, place_id, capacity, host_id,
                                 confirmed_count, attendance_rule, check_in_opens_at, check_in_closes_at, status,
                                 live_at, after_closes_at)
  values (v_plan, 'football', p_title, now() + p_starts, now() + p_starts + interval '90 minutes', p_place, 2,
          tests.u(p_host), 1, 'check_in', now() + p_starts - interval '30 minutes',
          now() + p_starts + interval '90 minutes',
          case when p_starts < interval '0' then 'live'::public.activity_status else 'confirmed' end,
          case when p_starts < interval '0' then now() + p_starts end, now() + p_starts + interval '25 hours')
  returning id into v;
  return v;
end;
$$;

-- p_n finished games at a place hosted by tests.u(p_host), each with p_people checked in, p_days_ago
-- days back (one a day), at 7 PM local.
create function tests.history(
  p_host integer, p_place uuid, p_n integer, p_people integer default 6,
  p_audience public.audience default 'public', p_days_ago integer default 1
) returns void language plpgsql security definer as $$
declare
  v_plan uuid;
  v_at timestamptz;
begin
  for i in 0 .. p_n - 1 loop
    v_at := ((((now() at time zone 'America/Toronto')::date - (p_days_ago + i)) + time '19:00') at time zone 'America/Toronto');
    insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at, status,
                              source, created_by, host_id, member_count, locked_at)
    values ('football', v_at, 60, p_place, 12, p_audience, v_at - interval '1 hour', 'game_on', 'quick',
            tests.u(p_host), tests.u(p_host), 1, v_at - interval '2 hours')
    returning id into v_plan;
    insert into public.activities (plan_id, sport_id, starts_at, ends_at, place_id, capacity, host_id, confirmed_count,
                                   checked_in_count, attendance_rule, check_in_opens_at, check_in_closes_at, status,
                                   live_at, ended_at, after_closes_at, completed_at)
    values (v_plan, 'football', v_at, v_at + interval '60 minutes', p_place, 12, tests.u(p_host), p_people, p_people,
            'check_in', v_at - interval '30 minutes', v_at + interval '60 minutes', 'complete', v_at,
            v_at + interval '60 minutes', v_at + interval '25 hours', v_at + interval '25 hours');
  end loop;
end;
$$;

-- An unmatched Down For for tests.u(n) (inserted directly; create_down_for would match them).
create function tests.signal(
  n integer, p_sport text default 'volleyball', p_audience public.audience default 'public'
) returns uuid language sql security definer as $$
  insert into public.intent_signals (user_id, sport_id, window_start, window_end, expires_at, audience,
                                     radius_km, area_lat, area_lng)
  select tests.u(n), p_sport, now() + interval '2 hours', now() + interval '6 hours', now() + interval '6 hours',
         p_audience, pp.discovery_radius_km, pp.area_lat, pp.area_lng
  from public.profile_private pp where pp.user_id = tests.u(n)
  returning id;
$$;

create function tests.block(a integer, b integer) returns void language sql security definer as $$
  insert into public.blocks (blocker_id, blocked_id) values (tests.u(a), tests.u(b));
$$;

-- STEP 7 · PLACE: the page read, tonight here, regular groups, hosts here, busy times, prefill.
select no_plan();

select tests.keep('pitch', '00000000-0000-4000-9100-000000000001');
update public.places set surface = 'Turf', floodlit_until = '23:00', is_free = true, kind = 'park',
  facilities = '{lights,water}', verification = 'community_confirmed', verified_at = now()
 where id = tests.id('pitch');
select tests.keep('quiet', tests.place('quiet-yard', 'Plateau', 45.5200, -73.5800, true));

-- place_view: header, facts, verification, prefill -----------------------------------------------------------

select tests.login(10);
select is(
  (select row(name, area_label, kind, facts, verification)::text from public.place_view(tests.id('pitch'))),
  row('Test Pitch', 'Plateau, Montréal', 'park'::public.place_kind, 'Football · turf · floodlit until 11 PM · free',
      'community_confirmed'::public.place_verification)::text,
  'place_view: name, area, kind, the facts line, verification');
select is((select tonight_count from public.place_view(tests.id('pitch'))), 0, 'nothing on tonight yet');
select is((select has_busy_history from public.place_view(tests.id('pitch'))), false, 'no busy history yet');
select is((select busy_levels from public.place_view(tests.id('pitch'))), null, 'so no levels');
select ok(
  (select prefill_starts_at >= now() + interval '2 hours' and prefill_starts_at <= now() + interval '1 day'
          and prefill_sport_id = 'football' and prefill_capacity = (select default_capacity from public.sports where id = 'football')
   from public.place_view(tests.id('pitch'))),
  'CREATE ACTIVITY HERE prefill: the place''s sport, its default size, a time at least 2 hours away');
select throws_ok(format('select * from public.place_view(%L)', gen_random_uuid()), 'P0001', 'place_unknown',
  'unknown place');
select tests.logout();
select ok(
  exists (select 1 from private.analytics_events where name = 'place_viewed' and user_id = tests.u(10)
            and payload->>'place_id' = tests.id('pitch')::text),
  'place_view records place_viewed');

-- The prefill uses your main sport when the place has it.
insert into public.user_sports (user_id, sport_id, level, is_main) values (tests.u(10), 'running', 'casual', true);
select tests.login(10);
select is((select prefill_sport_id from public.place_view(tests.id('pitch'))), 'running',
  'prefill: your main sport when the place has it');
select tests.logout();

-- place_tonight: visibility, meeting point for members only -------------------------------------------------

select tests.keep('forming', tests.plan_at(1, tests.id('pitch'), '3 hours', 'public', 'football', 8, 3));
select tests.keep('live', tests.game_at(5, tests.id('pitch'), '-20 minutes'));
select tests.keep('secret', tests.plan_at(7, tests.id('pitch'), '4 hours', 'invite_only'));

select tests.login(10);
select is((select count(*)::integer from public.place_tonight(tests.id('pitch'))), 2,
  'tonight here: what you can see (not the invite-only plan)');
select is(
  (select array_agg(kind order by starts_at) from public.place_tonight(tests.id('pitch'))),
  array['activity', 'plan'], 'ordered by start, live first');
select is(
  (select meeting_point from public.place_tonight(tests.id('pitch')) where plan_id = tests.id('forming')),
  null, 'no meeting point for people outside the plan');
select is(
  (select row(member_count, capacity, spots_left, level_label, i_am_in)::text
   from public.place_tonight(tests.id('pitch')) where plan_id = tests.id('forming')),
  row(3, 8, 5, 'Mixed level', false)::text, 'counts and level');
select tests.login(2);
select is(
  (select meeting_point from public.place_tonight(tests.id('pitch')) where plan_id = tests.id('forming')),
  'North pitch', 'members see the exact spot');
select is(
  (select i_am_in from public.place_tonight(tests.id('pitch')) where plan_id = tests.id('forming')),
  true, 'and that they are in');
select tests.login(10);
select is((select tonight_count from public.place_view(tests.id('pitch'))), 2, 'place_view counts tonight');
select is(
  (select count(*)::integer from public.place_tonight(tests.id('pitch'), 'tomorrow')), 0, 'tomorrow is empty');

-- A sensitive place lists only what you're in.
select tests.logout();
select tests.keep('qplan', tests.plan_at(2, tests.id('quiet'), '3 hours', 'public', 'football', 8, 2));
select tests.login(10);
select is((select count(*)::integer from public.place_tonight(tests.id('quiet'))), 0,
  'sensitive place: nothing listed for people not in it');
select is((select tonight_count from public.place_view(tests.id('quiet'))), 0, 'and not counted');
select tests.login(3);
select is((select count(*)::integer from public.place_tonight(tests.id('quiet'))), 1,
  'sensitive place: you see what you are in');
select tests.logout();

-- place_groups: crew Rituals for members, clan Rituals by clan visibility, host series ------------------------

insert into public.crews (id, name, created_by) values ('00000000-0000-4000-9200-000000000001', 'Test FC', tests.u(1));
insert into public.crew_members (crew_id, user_id, role, via)
values ('00000000-0000-4000-9200-000000000001', tests.u(1), 'owner', 'created'),
       ('00000000-0000-4000-9200-000000000001', tests.u(2), 'member', 'added');
insert into public.rituals (id, crew_id, sport_id, title, day_of_week, local_time, time_zone, duration_minutes,
                            place_id, capacity, host_id, created_by)
values ('00000000-0000-4000-9300-000000000001', '00000000-0000-4000-9200-000000000001', 'football', 'Thursday FC', 4,
        '19:30', 'America/Toronto', 90, tests.id('pitch'), 10, tests.u(1), tests.u(1));
insert into public.clans (id, name, sport_id, join_policy, created_by)
values ('00000000-0000-4000-9400-000000000001', 'Open Runners', 'running', 'open', tests.u(3)),
       ('00000000-0000-4000-9400-000000000002', 'Secret Runners', 'running', 'invite', tests.u(4));
insert into public.clan_members (clan_id, user_id, role, via)
values ('00000000-0000-4000-9400-000000000001', tests.u(3), 'captain', 'created'),
       ('00000000-0000-4000-9400-000000000002', tests.u(4), 'captain', 'created');
insert into public.rituals (id, clan_id, sport_id, title, day_of_week, local_time, time_zone, duration_minutes,
                            place_id, capacity, min_to_go, distance_km, host_id, created_by)
values ('00000000-0000-4000-9300-000000000002', '00000000-0000-4000-9400-000000000001', 'running', 'Sunrise run', 7,
        '07:00', 'America/Toronto', 60, tests.id('pitch'), 40, 4, 6, tests.u(3), tests.u(3)),
       ('00000000-0000-4000-9300-000000000003', '00000000-0000-4000-9400-000000000002', 'running', 'Secret run', 3,
        '06:00', 'America/Toronto', 60, tests.id('pitch'), 40, 4, 5, tests.u(4), tests.u(4));
insert into public.host_programs (id, name, sport_id, area, created_by)
values ('00000000-0000-4000-9500-000000000001', 'Test Pickup', 'football', 'Plateau, Montréal', tests.u(5));
insert into public.host_program_hosts (program_id, user_id, role)
values ('00000000-0000-4000-9500-000000000001', tests.u(5), 'owner');
insert into public.host_series (id, program_id, name, sport_id, place_id, start_time, duration_minutes, capacity,
                                repeat_days, starts_on, approval_required, created_by)
values ('00000000-0000-4000-9600-000000000001', '00000000-0000-4000-9500-000000000001', 'Tue and Thu 7-a-side',
        'football', tests.id('pitch'), '19:30', 90, 14, '{2,4}', current_date - 30, true, tests.u(5));

-- Two weeks of the crew Ritual happened, then a skip, then three more.
insert into public.ritual_occurrences (ritual_id, occurs_on, starts_at, plan_id, skipped_at)
select '00000000-0000-4000-9300-000000000001', current_date - 7 * w, now() - make_interval(days => 7 * w),
       case when w = 4 then null else tests.id('forming') end, case when w = 4 then now() - interval '30 days' end
from generate_series(1, 6) w;

select tests.login(2);
select is(
  (select array_agg(kind || ':' || title order by days[1], local_time) from public.place_groups(tests.id('pitch'))),
  array['host_series:Tue and Thu 7-a-side', 'crew_ritual:Thursday FC', 'clan_ritual:Sunrise run'],
  'a crew member sees the crew Ritual, the open clan''s Ritual and the series (not the invite-only clan''s)');
select is(
  (select row(access, weeks_running, cadence, i_am_in)::text from public.place_groups(tests.id('pitch'))
   where kind = 'crew_ritual'),
  row('crew', 3, 'Every week, 7:30', true)::text, 'crew Ritual: CREW, three weeks running since the skip');
select is(
  (select row(access, distance_km, group_name, i_am_in)::text from public.place_groups(tests.id('pitch'))
   where kind = 'clan_ritual'),
  row('open', 6.00, 'Open Runners', false)::text, 'clan Ritual: open, its distance');
select is(
  (select row(access, cadence, days)::text from public.place_groups(tests.id('pitch')) where kind = 'host_series'),
  row('request', 'Tue and Thu, 7:30', '{2,4}'::smallint[])::text, 'host series: ask to join, its days');
select tests.login(10);
select ok(
  not exists (select 1 from public.place_groups(tests.id('pitch')) where kind = 'crew_ritual'),
  'crews are private: someone outside the crew does not see its Ritual');
select tests.login(4);
select ok(
  exists (select 1 from public.place_groups(tests.id('pitch')) where title = 'Secret run'),
  'invite-only clan members see their own Ritual');
select tests.logout();
select tests.block(10, 5);
select tests.login(10);
select ok(
  not exists (select 1 from public.place_groups(tests.id('pitch')) where kind = 'host_series'),
  'a program whose owner you blocked is not listed');
select tests.logout();
delete from public.blocks where blocker_id = tests.u(10);

-- place_hosts ----------------------------------------------------------------------------------------------

select tests.history(6, tests.id('pitch'), 7);
select tests.history(8, tests.id('pitch'), 4, 6, 'public', 20);
select tests.connect(10, 6);
select tests.connect(10, 8);

select tests.login(10);
select is(
  (select array_agg(display_name || ':' || hosted_here order by hosted_here desc) from public.place_hosts(tests.id('pitch'))),
  array['Tester 6:7', 'Tester 5:0'],
  'hosts here: 5+ games with visible history, and anyone running a series here; not someone with 4');
select is(
  (select row(is_top, trusted_host)::text from public.place_hosts(tests.id('pitch')) where user_id = tests.u(6)),
  row(true, false)::text, 'the top host; not trusted yet');
select is(
  (select program_name from public.place_hosts(tests.id('pitch')) where user_id = tests.u(5)),
  'Test Pickup', 'series hosts carry their program');
select tests.logout();
update public.privacy_settings set history_visibility = 'only_me' where user_id = tests.u(6);
select tests.login(10);
select ok(
  not exists (select 1 from public.place_hosts(tests.id('pitch')) where user_id = tests.u(6)),
  'hidden history: not listed');
select tests.logout();
update public.privacy_settings set history_visibility = 'friends' where user_id = tests.u(6);

-- TRUSTED HOST: 20 finished games and "great host" from 5 people.
select tests.history(6, tests.id('pitch'), 13, 6, 'public', 40);
insert into public.reputation_signals (giver_id, subject_id, activity_id, kind)
select tests.u(g), tests.u(6), (select id from public.activities where host_id = tests.u(6) limit 1), 'great_host'
from generate_series(1, 4) g;
select tests.login(10);
select is((select trusted_host from public.place_hosts(tests.id('pitch')) where user_id = tests.u(6)), false,
  'four people is not enough');
select tests.logout();
insert into public.reputation_signals (giver_id, subject_id, activity_id, kind)
values (tests.u(9), tests.u(6), (select id from public.activities where host_id = tests.u(6) limit 1), 'great_host');
select tests.login(10);
select is((select trusted_host from public.place_hosts(tests.id('pitch')) where user_id = tests.u(6)), true,
  'TRUSTED HOST from 20 games and five people');
select tests.logout();
insert into public.reports (reporter_id, subject_kind, subject_id, reason, status)
values (tests.u(1), 'profile', tests.u(6), 'unsafe', 'actioned');
select tests.login(10);
select is((select trusted_host from public.place_hosts(tests.id('pitch')) where user_id = tests.u(6)), false,
  'an actioned report removes it');
select tests.logout();
select tests.block(6, 10);
select tests.login(10);
select ok(not exists (select 1 from public.place_hosts(tests.id('pitch')) where user_id = tests.u(6)),
  'never across a block');
select tests.logout();
delete from public.blocks where blocker_id = tests.u(6);

-- Busy times -------------------------------------------------------------------------------------------------

select tests.login(10);
select ok((select count(*) from public.place_busy_times(tests.id('pitch'))) > 0, 'busy times from history');
select is((select max(level) from public.place_busy_times(tests.id('pitch'))), 100, 'levels are relative: max 100');
select is((select busy_part from public.place_view(tests.id('pitch'))), 'evening'::public.day_part,
  'the busiest part of the day');
select is((select cardinality(busy_levels) from public.place_view(tests.id('pitch'))), 7, 'seven daily levels');
select ok((select busy_summary like 'Busiest % evenings. %' from public.place_view(tests.id('pitch'))),
  'a summary sentence');
select tests.logout();

-- Private plans never feed busy times.
select tests.keep('lonely', tests.place('lonely-court', 'Plateau', 45.5210, -73.5810));
select tests.history(1, tests.id('lonely'), 8, 4, 'invite_only');
select tests.login(10);
select is((select count(*)::integer from public.place_busy_times(tests.id('lonely'))), 0,
  'invite-only games are not counted in busy times');
select tests.logout();
select tests.history(1, tests.id('lonely'), 5, 4, 'public');
select tests.login(10);
select is((select count(*)::integer from public.place_busy_times(tests.id('lonely'))), 0,
  'five sessions is not enough history');
select tests.logout();
select tests.history(1, tests.id('lonely'), 1, 4, 'public', 30);
select tests.login(10);
select ok((select count(*) from public.place_busy_times(tests.id('lonely'))) > 0, 'six is');

select throws_ok(format('select * from public.place_groups(%L)', gen_random_uuid()), 'P0001', 'place_unknown',
  'place_groups: unknown place');
select throws_ok(format('select * from public.place_hosts(%L)', gen_random_uuid()), 'P0001', 'place_unknown',
  'place_hosts: unknown place');
select throws_ok(format('select * from public.place_tonight(%L)', gen_random_uuid()), 'P0001', 'place_unknown',
  'place_tonight: unknown place');
select tests.logout();

select * from finish();
rollback;
