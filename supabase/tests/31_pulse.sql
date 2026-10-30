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

-- STEP 7 · PULSE: markers per place, area and latent demand; visibility, k-anonymity, sensitive places.
select no_plan();

select tests.keep('pitch', '00000000-0000-4000-9100-000000000001');
update public.places set surface = 'Turf', floodlit_until = '23:00' where id = tests.id('pitch');
select tests.keep('far', tests.place('far-field', 'Verdun', 45.4612, -73.5687));
select tests.keep('quiet', tests.place('quiet-yard', 'Plateau', 45.5200, -73.5800, true));

-- A forming plan (3 of 8), a GAME ON game later, a live game, an invite-only plan, a far plan.
select tests.keep('forming', tests.plan_at(1, tests.id('pitch'), '3 hours', 'public', 'football', 8, 3));
select tests.keep('game', tests.game_at(5, tests.id('pitch'), '2 hours', 'public', 'Pickup'));
select tests.keep('live', tests.game_at(6, tests.id('pitch'), '-20 minutes', 'public', 'Sparring'));
select tests.keep('secret', tests.plan_at(7, tests.id('pitch'), '4 hours', 'invite_only'));
select tests.keep('farplan', tests.plan_at(8, tests.id('far'), '3 hours'));

select tests.login(10);

select is(
  (select activity_count from public.pulse(null, 'week') where marker_id = 'place:' || tests.id('pitch')),
  3, 'place marker counts what you can see: forming, GAME ON and live (not the invite-only plan)');
select is(
  (select row(live_count, forming_count, forming_member_count, forming_capacity, live_title)::text
   from public.pulse(null, 'week') where kind = 'place' and place_id = tests.id('pitch')),
  row(1, 1, 3, 8, 'Sparring')::text, 'live and forming parts of the marker: FORMING 3 / 8, the live title');
select is(
  (select forming_plan_id from public.pulse(null, 'week') where kind = 'place' and place_id = tests.id('pitch')),
  tests.id('forming'), 'the forming pill opens that plan');
select ok(
  not exists (select 1 from public.pulse(null, 'week') where place_id = tests.id('far')),
  'places beyond your radius are left out');
select ok(
  exists (select 1 from public.pulse(null, 'week', 25) where place_id = tests.id('far')),
  'a wider radius brings them in');
select ok(
  (select summary from public.pulse(null, 'week') where kind = 'place' and place_id = tests.id('pitch'))
    like 'Test Pitch: 3 activities this week, football forming at 3 of 8, Sparring live now.',
  'summary is the text alternative for the marker');
select is(
  (select round(lat::numeric, 4) from public.pulse(null, 'week') where kind = 'place' and place_id = tests.id('pitch')),
  45.5165, 'place markers carry the public centroid');
select is(
  (select activity_count from public.pulse(null, 'week') where kind = 'area' and area = 'Plateau'),
  3, 'the area aggregate sums its places');

-- Filters.
select is(
  (select activity_count from public.pulse('running', 'week') where kind = 'place' and place_id = tests.id('pitch')),
  null, 'sport filter: nothing for running here, so no marker');
select is(
  coalesce((select live_count from public.pulse(null, 'tomorrow') where kind = 'place' and place_id = tests.id('pitch')), 0),
  0, 'tomorrow: the game live now is not counted');
select tests.logout();
select is(
  (select row(w_from, w_until)::text from private.pulse_window('tonight', 'America/Toronto')),
  row(greatest(now(), (((now() at time zone 'America/Toronto')::date + interval '17 hours') at time zone 'America/Toronto')),
      private.tonight_end('America/Toronto'))::text,
  'tonight is Discover''s tonight: from 5 PM (or now) until 4 AM');
select is(
  (select includes_now from private.pulse_window('tonight', 'America/Toronto')),
  (now() at time zone 'America/Toronto')::time >= time '17:00'
    or (now() at time zone 'America/Toronto')::time < time '04:00',
  'live games count tonight only once the evening has started');
select tests.login(10);
select is(
  (select activity_count from public.pulse(null, 'now') where kind = 'place' and place_id = tests.id('pitch')),
  1, 'now: only the live game (nothing starts in the next hour)');
select throws_ok($$ select * from public.pulse(null, 'someday') $$, 'P0001', 'invalid_argument',
  'unknown window is invalid_argument');
select throws_ok($$ select * from public.pulse(null, 'tonight', 0) $$, 'P0001', 'radius_invalid',
  'radius outside 1-50');
select throws_ok($$ select * from public.pulse('quidditch') $$, 'P0001', 'sport_unknown', 'unknown sport');

-- Visibility: the invite-only plan counts for its host only.
select tests.login(7);
select is(
  (select activity_count from public.pulse(null, 'week') where kind = 'place' and place_id = tests.id('pitch')),
  4, 'the host sees their own invite-only plan counted');

-- Blocks: a blocked host's plan isn't counted.
select tests.logout();
select tests.block(10, 1);
select tests.login(10);
select is(
  (select activity_count from public.pulse(null, 'week') where kind = 'place' and place_id = tests.id('pitch')),
  2, 'a plan hosted by someone you blocked is not counted');
select tests.logout();
delete from public.blocks where blocker_id = tests.u(10);

-- Sensitive place: never its own marker; reaches the area only from 3 activities.
select tests.plan_at(2, tests.id('quiet'), '3 hours');
select tests.login(10);
select ok(
  not exists (select 1 from public.pulse(null, 'week') where place_id = tests.id('quiet')),
  'a sensitive place is never a marker of its own');
select is(
  (select activity_count from public.pulse(null, 'week') where kind = 'area' and area = 'Plateau'),
  3, 'one activity at a sensitive place does not reach the area count');
select tests.logout();
select tests.plan_at(3, tests.id('quiet'), '4 hours');
select tests.plan_at(4, tests.id('quiet'), '5 hours');
select tests.login(10);
select is(
  (select activity_count from public.pulse(null, 'week') where kind = 'area' and area = 'Plateau'),
  6, 'from three, the sensitive place counts in its area');
select is(
  (select suppressed from public.pulse_place(tests.id('quiet'), null, 'week')), true, 'the sheet suppresses a sensitive place');
select is(
  (select activity_count from public.pulse_place(tests.id('quiet'), null, 'week')), null, 'with no counts');
select tests.logout();

-- Latent demand: counts only, from k = 3 people, never you, never across a block.
select tests.signal(1);
select tests.signal(2);
select tests.login(10);
select ok(
  not exists (select 1 from public.pulse(null, 'week') where kind = 'demand' and area = 'Plateau'),
  'two people wanting volleyball is not shown');
select tests.logout();
select tests.signal(3);
select tests.signal(10);
select tests.login(10);
select is(
  (select people_count from public.pulse(null, 'week') where kind = 'demand' and area = 'Plateau' and sport_id = 'volleyball'),
  3, 'three people (not you) is a demand marker');
select ok(
  not exists (select 1 from public.pulse(null, 'week') where kind = 'demand' and area <> 'Plateau'),
  'each person counts once, in their nearest area only');
select is(
  (select summary from public.pulse(null, 'week') where kind = 'demand' and area = 'Plateau' and sport_id = 'volleyball'),
  '3 people want volleyball near Plateau this week.', 'demand summary is a count near an area');
select is(
  (select row(place_id, place_name, activity_count)::text from public.pulse(null, 'week')
   where kind = 'demand' and area = 'Plateau'),
  row(null::uuid, null::text, null::integer)::text, 'demand markers name no place');
select is(
  (select people_count from public.pulse('football', 'week') where kind = 'demand'), null,
  'sport filter applies to demand');
select tests.logout();
select tests.block(10, 3);
select tests.login(10);
select ok(
  not exists (select 1 from public.pulse(null, 'week') where kind = 'demand' and area = 'Plateau'),
  'a blocked person does not count, so two is hidden again');
select tests.logout();
delete from public.blocks where blocker_id = tests.u(10);
select tests.plan_at(11, tests.id('pitch'), '3 hours', 'public', 'volleyball', 8, 1);
select tests.login(10);
select ok(
  not exists (select 1 from public.pulse(null, 'week') where kind = 'demand' and area = 'Plateau'),
  'a volleyball plan forming in the area replaces the demand marker');
select tests.logout();

-- The sheet.
select tests.login(10);
select is(
  (select headline from public.pulse_place(tests.id('pitch'), 'football', 'week')),
  '3 activities this week. Football is forming at 3 / 8 for '
    || to_char((select starts_at from public.plans where id = tests.id('forming')) at time zone 'America/Toronto', 'FMHH12:MI')
    || '.',
  'sheet headline: count and the forming plan');
select is(
  (select facts from public.pulse_place(tests.id('pitch'), 'football', 'week')),
  'Football · turf · floodlit until 11 PM · 0.6 km', 'sheet facts: sport, surface, lights, distance');
select throws_ok(format('select * from public.pulse_place(%L)', gen_random_uuid()), 'P0001', 'place_unknown',
  'unknown place');

-- pulse is logged (POST) and signed-in only.
select tests.logout();
select ok(
  (select count(*) from private.analytics_events where name = 'pulse_viewed' and user_id = tests.u(10)) > 0,
  'pulse records pulse_viewed');
select is((select provolatile::text from pg_proc where proname = 'pulse' and pronamespace = 'public'::regnamespace),
  'v', 'pulse is volatile (call it with POST)');
select ok(not has_function_privilege('anon', 'public.pulse(text, text, integer)', 'execute'), 'anon cannot call pulse');
select throws_ok($$ select * from public.pulse(null, 'week') $$, 'P0001', 'not_authenticated', 'signed out');

select * from finish();
rollback;
