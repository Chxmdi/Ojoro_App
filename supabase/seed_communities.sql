-- Step 6 (Communities) sample data, loaded by `supabase db reset` after seed.sql, seed_liquidity.sql,
-- seed_messaging.sql and seed_competition.sql ([db.seed] sql_paths). Local only. Never apply to a
-- shared environment.
--
-- Safe to run again at any time against a running local stack, to refresh the time-relative parts
-- (this week's runs, the Ritual's week, Down For windows, the month's leaderboard):
--
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_communities.sql
--
-- It deletes and recreates only its own rows (fixed ids starting f0…f8, places b0…61/62) and the
-- rhythm, chat read mark and availability it sets. Sample content from the designs
-- (docs/COMMUNITIES_CONTRACT.md §Local data). Sign in as Chimdi (+1 555 555 0100):
--   * CrewHome   c1000000-0000-4000-8000-000000000001  Thursday FC: rhythm 3 a week, 8 weeks
--                {2,1,3,4,5,3,5,6} (6 WEEK STREAK), free tonight Ade, Lena, Joel and Sam, DOWN FOR
--                Lena (football Saturday morning, 3 down) and Sam (running Sunday evening, 1 down),
--                RITUAL Thursday football 6 / 10 this week, crew vs crew Plateau Crew 9 of 10 in, 4 new
--   * Clan       f1000000-0000-4000-8000-000000000001  Concordia Run Club: 212 members, 4 runs a week,
--                3 coaches, Chimdi a connector; THIS WEEK tempo 18 / 30, easy 8 km 22 / 40, long run
--                GAME ON; October mission 1,240 of 2,000 km from 96 runners (Chimdi 46 km); MOST RUNS
--                Maya 14, Chimdi 11, Theo 10
--   * Clash      f4000000-0000-4000-8000-000000000001  Fall Clash vs McGill: 2-1 after 3 of 6, Chimdi in
--                the football squad (9 of 14), the crowd 312 / 287
-- Uses the 220 crowd accounts from seed_competition.sql (e0000000-…-000000000001…220).

-- 0. Clean up what this file made before -----------------------------------------------------------------

begin;
set local ojoro.seed_reset = 'on';
delete from public.clashes where id::text like 'f4000000-%';
delete from public.rituals where id::text like 'f0000000-%';
delete from public.clans where id::text like 'f1000000-%';
delete from public.activities where id::text like 'f8000000-%';
delete from public.plans where id::text like 'f6000000-%' or id = 'f0000000-0000-4000-8000-000000000011';
delete from public.intent_signals where id::text like 'f7000000-%';
delete from public.crew_chat_reads
 where crew_id = 'c1000000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-4000-8000-000000000001';
commit;

-- 1. Places ------------------------------------------------------------------------------------------------

insert into public.places (id, slug, name, area, city, lat, lng, sport_ids, surface, floodlit_until, is_free) values
  ('b0000000-0000-4000-8000-000000000061', 'hall-building', 'Hall building', 'Downtown', 'Montréal',
   45.4972, -73.5788, '{running}', 'Street', null, true),
  ('b0000000-0000-4000-8000-000000000062', 'atwater-market', 'Atwater market', 'Saint-Henri', 'Montréal',
   45.4800, -73.5770, '{running,cycling}', 'Paved', null, true)
on conflict (id) do nothing;
insert into public.places (id, slug, name, area, city, lat, lng, sport_ids, surface, floodlit_until, is_free)
values ('b0000000-0000-4000-8000-000000000041', 'mount-royal-loop', 'Mount Royal loop', 'Plateau', 'Montréal',
        45.5048, -73.5877, '{running,cycling}', 'Gravel · 5 km loop', null, true)
on conflict (id) do nothing;

-- 2. Everything else ------------------------------------------------------------------------------------

do $$
declare
  c_chimdi constant uuid := 'a0000000-0000-4000-8000-000000000001';
  c_ade constant uuid := 'a0000000-0000-4000-8000-000000000002';
  c_marcus constant uuid := 'a0000000-0000-4000-8000-000000000003';
  c_lena constant uuid := 'a0000000-0000-4000-8000-000000000004';
  c_sam constant uuid := 'a0000000-0000-4000-8000-000000000005';
  c_yara constant uuid := 'a0000000-0000-4000-8000-000000000006';
  c_joel constant uuid := 'a0000000-0000-4000-8000-000000000007';
  c_tomi constant uuid := 'a0000000-0000-4000-8000-000000000008';
  c_tolu constant uuid := 'a0000000-0000-4000-8000-000000000009';
  c_ife constant uuid := 'a0000000-0000-4000-8000-000000000010';
  c_maya constant uuid := 'a0000000-0000-4000-8000-000000000011';
  c_theo constant uuid := 'a0000000-0000-4000-8000-000000000012';
  c_dayo constant uuid := 'a0000000-0000-4000-8000-000000000013';
  c_jm constant uuid := 'b0000000-0000-4000-8000-000000000001';
  c_lachine constant uuid := 'b0000000-0000-4000-8000-000000000004';
  c_mr constant uuid := 'b0000000-0000-4000-8000-000000000041';
  c_hall constant uuid := 'b0000000-0000-4000-8000-000000000061';
  c_atwater constant uuid := 'b0000000-0000-4000-8000-000000000062';
  c_thursday constant uuid := 'c1000000-0000-4000-8000-000000000001';
  c_versus constant uuid := 'd2000000-0000-4000-8000-000000000002';
  c_ritual constant uuid := 'f0000000-0000-4000-8000-000000000001';
  c_ritual_plan constant uuid := 'f0000000-0000-4000-8000-000000000011';
  c_concordia constant uuid := 'f1000000-0000-4000-8000-000000000001';
  c_mcgill constant uuid := 'f1000000-0000-4000-8000-000000000002';
  c_mission constant uuid := 'f3000000-0000-4000-8000-000000000001';
  c_clash constant uuid := 'f4000000-0000-4000-8000-000000000001';
  c_tz constant text := 'America/Toronto';
  v_today date := (now() at time zone c_tz)::date;
  v_monday date := private.local_week_start(now(), c_tz);
  v_targets integer[] := array[2, 1, 3, 4, 5, 3, 5, 6];
  v_have integer[];
  v_need integer;
  v_at timestamptz;
  v_wk date;
  v_n integer := 0;
  v_i integer;
  v_k integer;
  r public.rituals%rowtype;
  v_on date;
  v_sat date;
  v_ids uuid[];
  v_read timestamptz;
  v_month date := date_trunc('month', now() at time zone c_tz)::date;
  v_past_end timestamptz;
  v_past_start timestamptz;
  v_dist integer[] := array[6, 8, 4, 6, 2, 8, 6, 4, 2, 6, 8, 4, 6, 2, 8, 6, 4, 2, 6, 8];
  v_remaining integer;
  v_run uuid;
  v_user uuid;
  v_d integer;
  v_e4 timestamptz;
  v_crowd uuid[];
begin
  if not exists (select 1 from public.profiles where id = c_chimdi)
     or not exists (select 1 from public.crews where id = c_thursday)
     or not exists (select 1 from public.profiles where id = 'e0000000-0000-4000-8000-000000000220') then
    raise notice 'seed.sql, seed_messaging.sql or seed_competition.sql has not run: skipping the communities seed';
    return;
  end if;
  select array_agg(('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid order by n) into v_crowd
  from generate_series(1, 220) n;

  -- Crew Home: Thursday FC ----------------------------------------------------------------------------

  -- Rhythm: three sessions a week. Eight weeks of sessions: top up each week to the design's bars with
  -- past crew games (Ade hosts; nobody else is attached, so no Passport or recap changes).
  update public.crews set rhythm_per_week = 3 where id = c_thursday;
  v_have := private.crew_weeks(c_thursday);
  for v_i in 1 .. 8 loop
    v_wk := v_monday - (8 - v_i) * 7;
    v_need := v_targets[v_i] - coalesce(v_have[v_i], 0);
    for v_k in 1 .. greatest(v_need, 0) loop
      v_n := v_n + 1;
      if v_i = 8 then
        -- This week: spread before now.
        v_at := (v_wk::timestamp at time zone c_tz)
              + (now() - (v_wk::timestamp at time zone c_tz)) * v_k / (v_need + 1);
      else
        v_at := ((v_wk + ((v_i * 2 + v_k * 3) % 7)) + make_time(17 + (v_i + v_k) % 4, 0, 0)) at time zone c_tz;
      end if;
      insert into public.plans (id, sport_id, starts_at, duration_minutes, place_id, capacity, audience, crew_id,
                                deadline_at, status, source, created_by, host_id, member_count, locked_at, created_at)
      values (('f6000000-0000-4000-8000-' || lpad(v_n::text, 12, '0'))::uuid,
              (array['football', 'running', 'basketball', 'volleyball'])[1 + (v_i + v_k) % 4],
              v_at, 60, c_jm, 10, 'crew', c_thursday, v_at - interval '1 hour', 'game_on', 'quick', c_ade, c_ade, 1,
              v_at - interval '2 hours', v_at - interval '1 day');
      insert into public.plan_members (plan_id, user_id, via, joined_at)
      values (('f6000000-0000-4000-8000-' || lpad(v_n::text, 12, '0'))::uuid, c_ade, 'host', v_at - interval '1 day');
      insert into public.activities (id, plan_id, sport_id, starts_at, ends_at, place_id, capacity, host_id,
                                     confirmed_count, attendance_rule, check_in_opens_at, check_in_closes_at,
                                     status, live_at, ended_at, after_closes_at, completed_at, created_at)
      values (('f8000000-0000-4000-8000-' || lpad(v_n::text, 12, '0'))::uuid,
              ('f6000000-0000-4000-8000-' || lpad(v_n::text, 12, '0'))::uuid,
              (array['football', 'running', 'basketball', 'volleyball'])[1 + (v_i + v_k) % 4],
              v_at, v_at + interval '60 minutes', c_jm, 10, c_ade, 1, 'check_in',
              v_at - interval '30 minutes', v_at + interval '60 minutes',
              case when v_at + interval '60 minutes' < now() then 'complete'::public.activity_status else 'live' end,
              v_at, case when v_at + interval '60 minutes' < now() then v_at + interval '60 minutes' end,
              v_at + interval '25 hours',
              case when v_at + interval '60 minutes' < now() then v_at + interval '60 minutes' end,
              v_at - interval '2 hours');
    end loop;
  end loop;

  -- The Ritual: Thursday football at Jeanne-Mance, 7:30 PM, Ade hosts. This week's plan: 6 of 10 in
  -- (Ade, Joel, Sam, Yara, Tomi, Tolu); Chimdi hasn't tapped yet.
  insert into public.rituals (id, crew_id, sport_id, title, day_of_week, local_time, time_zone, duration_minutes,
                              place_id, capacity, host_id, lead_days, created_by, created_at)
  values (c_ritual, c_thursday, 'football', 'Thursday football', 4, '19:30', c_tz, 90, c_jm, 10, c_ade, 6, c_ade,
          now() - interval '60 days')
  returning * into r;
  v_on := private.ritual_next_on(r, now() + interval '30 minutes');
  v_at := private.ritual_starts_at(r, v_on);
  insert into public.plans (id, sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, crew_id,
                            deadline_at, source, created_by, host_id, member_count, team_a_label, team_b_label, created_at)
  values (c_ritual_plan, 'football', 'Thursday football', v_at, 90, c_jm, 10, 'crew', c_thursday,
          v_at - interval '1 hour', 'ritual', c_ade, c_ade, 6, 'Lights', 'Darks', now() - interval '2 days');
  insert into public.plan_members (plan_id, user_id, via, joined_at)
  select c_ritual_plan, u, case when u = c_ade then 'host'::public.member_via else 'im_down'::public.member_via end,
         now() - interval '2 days' + (o * interval '3 hours')
  from unnest(array[c_ade, c_joel, c_sam, c_yara, c_tomi, c_tolu]) with ordinality as x(u, o);
  insert into public.ritual_occurrences (ritual_id, occurs_on, starts_at, plan_id, created_at)
  values (c_ritual, v_on, v_at, c_ritual_plan, now() - interval '2 days');

  -- FREE TONIGHT: Ade, Lena, Joel and Sam are usually free in the evening (every day, so it holds
  -- whenever this runs). Their availability setting is the default, "crews".
  insert into public.availability_slots (user_id, day_of_week, part)
  select u, d, 'evening' from unnest(array[c_ade, c_lena, c_joel, c_sam]) u, generate_series(1, 7) d
  on conflict do nothing;

  -- DOWN FOR: Lena, football Saturday morning, ends Friday 10 PM, with Joel and Tolu (3 down); Sam,
  -- running Sunday evening, ends Sunday 10 PM.
  v_sat := v_today + ((6 - extract(isodow from v_today)::integer + 7) % 7);
  if ((v_sat - 1) + time '22:00') at time zone c_tz <= now() + interval '1 hour' then
    v_sat := v_sat + 7;
  end if;
  insert into public.intent_signals (id, user_id, sport_id, window_start, window_end, expires_at, audience, radius_km,
                                     area_lat, area_lng, created_at)
  values
    ('f7000000-0000-4000-8000-000000000001', c_lena, 'football', (v_sat + time '08:00') at time zone c_tz,
     (v_sat + time '12:00') at time zone c_tz, ((v_sat - 1) + time '22:00') at time zone c_tz, 'friends', 5,
     45.52, -73.57, now() - interval '5 hours'),
    ('f7000000-0000-4000-8000-000000000002', c_joel, 'football', (v_sat + time '09:00') at time zone c_tz,
     (v_sat + time '11:00') at time zone c_tz, ((v_sat - 1) + time '22:00') at time zone c_tz, 'friends', 5,
     45.52, -73.60, now() - interval '3 hours'),
    ('f7000000-0000-4000-8000-000000000003', c_tolu, 'football', (v_sat + time '08:30') at time zone c_tz,
     (v_sat + time '11:30') at time zone c_tz, ((v_sat - 1) + time '22:00') at time zone c_tz, 'friends', 5,
     45.52, -73.59, now() - interval '2 hours'),
    ('f7000000-0000-4000-8000-000000000004', c_sam, 'running', ((v_sat + 1) + time '16:00') at time zone c_tz,
     ((v_sat + 1) + time '23:00') at time zone c_tz, ((v_sat + 1) + time '22:00') at time zone c_tz, 'friends', 5,
     45.54, -73.58, now() - interval '1 hour')
  on conflict do nothing;

  -- CREW VS CREW: Sunday vs Plateau Crew, 9 of 10 in (both lineups).
  insert into public.challenge_competitors (event_id, user_id, side, joined_at)
  select c_versus, u, 'a', now() - interval '1 hour'
  from unnest(array[c_ade, c_chimdi, c_joel, c_sam, c_yara]) u
  where exists (select 1 from public.challenge_events e where e.id = c_versus)
    and (select count(*) from public.challenge_competitors k where k.event_id = c_versus and k.side = 'a') < 5
  on conflict do nothing;
  for v_i in 201 .. 210 loop
    exit when (select count(*) from public.challenge_competitors k where k.event_id = c_versus) >= 9
           or not exists (select 1 from public.challenge_events e where e.id = c_versus);
    insert into public.challenge_competitors (event_id, user_id, side, joined_at)
    values (c_versus, v_crowd[v_i], 'b', now() - interval '50 minutes')
    on conflict do nothing;
  end loop;

  -- OPEN CREW CHAT · 4 NEW: Chimdi read up to just before the last four messages from others.
  select x.created_at into v_read from public.messages x
   where x.crew_id = c_thursday and x.sender_id <> c_chimdi and x.deleted_at is null
   order by x.created_at desc offset 4 limit 1;
  if v_read is not null then
    insert into public.crew_chat_reads (crew_id, user_id, last_read_at) values (c_thursday, c_chimdi, v_read)
    on conflict (crew_id, user_id) do update set last_read_at = excluded.last_read_at;
  end if;

  -- Clans --------------------------------------------------------------------------------------------------

  insert into public.clans (id, name, short_name, tagline, sport_id, area, city, join_policy, time_zone, created_by,
                            member_count, created_at)
  values
    (c_concordia, 'Concordia Run Club', 'Concordia',
     'Four runs a week from the Hall building. Every pace, nobody left at the back.', 'running', 'Downtown',
     'Montréal', 'request', c_tz, c_maya, 0, now() - interval '400 days'),
    (c_mcgill, 'McGill Running Society', 'McGill', 'Mornings on the mountain, all year.', 'running', 'Milton-Parc',
     'Montréal', 'request', c_tz, c_marcus, 0, now() - interval '500 days');

  -- Concordia: Maya captain, Theo and two more coaches, Chimdi a connector, 207 more = 212.
  insert into public.clan_members (clan_id, user_id, role, role_note, via, joined_at) values
    (c_concordia, c_maya, 'captain', 'Sets the calendar and the rules', 'created', now() - interval '400 days'),
    (c_concordia, c_theo, 'coach', 'Runs the Tuesday tempo', 'approved', now() - interval '300 days'),
    (c_concordia, c_chimdi, 'connector', 'Welcomes new runners', 'approved', now() - interval '200 days'),
    (c_concordia, v_crowd[1], 'coach', 'Runs the Thursday easy run', 'approved', now() - interval '350 days'),
    (c_concordia, v_crowd[2], 'coach', 'Runs the Saturday long run', 'approved', now() - interval '340 days');
  insert into public.clan_members (clan_id, user_id, role, via, joined_at)
  select c_concordia, v_crowd[n], 'member', 'approved', now() - (n || ' days')::interval from generate_series(3, 209) n;
  update public.clans set member_count = (select count(*) from public.clan_members m where m.clan_id = c_concordia)
   where id = c_concordia;

  -- McGill: Marcus captain, ten more.
  insert into public.clan_members (clan_id, user_id, role, role_note, via, joined_at)
  values (c_mcgill, c_marcus, 'captain', 'Sets the calendar', 'created', now() - interval '500 days');
  insert into public.clan_members (clan_id, user_id, role, via, joined_at)
  select c_mcgill, v_crowd[n], 'member', 'approved', now() - interval '100 days' from generate_series(211, 220) n;
  update public.clans set member_count = (select count(*) from public.clan_members m where m.clan_id = c_mcgill)
   where id = c_mcgill;

  -- Four runs a week (Rituals). The Sunday one is put on the board the day before, so THIS WEEK shows
  -- the three from the design.
  insert into public.rituals (id, clan_id, sport_id, title, day_of_week, local_time, time_zone, duration_minutes,
                              place_id, capacity, min_to_go, distance_km, host_id, lead_days, created_by, created_at)
  values
    ('f0000000-0000-4000-8000-000000000002', c_concordia, 'running', 'Tempo · 6 km', 2, '18:30', c_tz, 60, c_hall,
     30, 20, 6, c_theo, 6, c_maya, now() - interval '300 days'),
    ('f0000000-0000-4000-8000-000000000003', c_concordia, 'running', 'Easy 8 km, all paces', 4, '18:30', c_tz, 75,
     c_hall, 40, 25, 8, v_crowd[1], 6, c_maya, now() - interval '300 days'),
    ('f0000000-0000-4000-8000-000000000004', c_concordia, 'running', 'Long run · Lachine Canal', 6, '09:00', c_tz,
     120, c_atwater, 40, 10, 16, v_crowd[2], 6, c_maya, now() - interval '300 days'),
    ('f0000000-0000-4000-8000-000000000005', c_concordia, 'running', 'Recovery jog · 4 km', 7, '10:00', c_tz, 45,
     c_hall, 30, 4, 4, c_chimdi, 1, c_maya, now() - interval '100 days');

  -- THIS WEEK: the next tempo (18 / 30), easy run (22 / 40) and long run (GAME ON, 12 / 40).
  for v_i in 1 .. 3 loop
    select * into r from public.rituals where id = ('f0000000-0000-4000-8000-00000000000' || (v_i + 1))::uuid;
    v_on := private.ritual_next_on(r, now() + interval '30 minutes');
    v_at := private.ritual_starts_at(r, v_on);
    v_run := ('f2000000-0000-4000-8000-00000000000' || v_i)::uuid;
    v_k := (array[18, 22, 12])[v_i];
    insert into public.clan_runs (id, clan_id, ritual_id, sport_id, title, starts_at, duration_minutes, place_id,
                                  distance_km, capacity, min_to_go, host_id, created_by, status, down_count, game_on_at,
                                  created_at)
    values (v_run, c_concordia, r.id, 'running', r.title, v_at, r.duration_minutes, r.place_id, r.distance_km,
            r.capacity, r.min_to_go, r.host_id, r.host_id,
            case when v_k >= r.min_to_go then 'game_on'::public.clan_run_status else 'forming' end, v_k,
            case when v_k >= r.min_to_go then now() - interval '3 hours' end, now() - interval '3 days');
    insert into public.clan_run_members (run_id, user_id, joined_at)
    select v_run, u, now() - interval '2 days'
    from (select r.host_id as u
          union all
          select v_crowd[n] from generate_series(10, 10 + v_k - 2) n) x;
    insert into public.ritual_occurrences (ritual_id, occurs_on, starts_at, clan_run_id, created_at)
    values (r.id, v_on, v_at, v_run, now() - interval '3 days');
  end loop;

  -- This month so far: 20 runs, checked in. Maya 14, Chimdi 11 (46 km), Theo 10; 93 more runners make
  -- 96, 1,240 km in all.
  v_past_start := (v_month::timestamp at time zone c_tz) + interval '7 hours';
  v_past_end := greatest(v_past_start + interval '1 hour', (v_today::timestamp at time zone c_tz) - interval '2 hours');
  for v_i in 1 .. 20 loop
    v_run := ('f2000000-0000-4000-8000-000000000' || (100 + v_i))::uuid;
    v_at := v_past_start + (v_past_end - v_past_start) * (v_i - 1) / 19;
    insert into public.clan_runs (id, clan_id, sport_id, title, starts_at, duration_minutes, place_id, distance_km,
                                  capacity, min_to_go, host_id, created_by, status, game_on_at, created_at)
    values (v_run, c_concordia, 'running',
            case v_dist[v_i] when 2 then 'Recovery jog · 2 km' when 4 then 'Easy 4 km' when 6 then 'Tempo · 6 km'
                             else 'Easy 8 km, all paces' end,
            v_at, 60, c_hall, v_dist[v_i], 200, 4, c_maya, c_maya, 'game_on', v_at - interval '1 day',
            v_at - interval '3 days');
  end loop;
  -- Named runners.
  insert into public.clan_run_members (run_id, user_id, joined_at, checked_in_at, check_in_method)
  select ('f2000000-0000-4000-8000-000000000' || (100 + i))::uuid, u, now() - interval '40 days', r2.starts_at, 'place'
  from (
    select c_maya as u, i from generate_series(1, 14) i
    union all select c_theo, i from generate_series(1, 10) i
    union all select c_chimdi, i from unnest(array[1, 4, 7, 10, 13, 3, 8, 5, 9, 14, 18]) i
  ) x
  join public.clan_runs r2 on r2.id = ('f2000000-0000-4000-8000-000000000' || (100 + x.i))::uuid;
  -- Everyone else: one 2 km run each, then longer runs until the total is 1,240 km.
  v_remaining := 1240 - (select coalesce(sum(r2.distance_km), 0)::integer from public.clan_run_members m
                         join public.clan_runs r2 on r2.id = m.run_id where r2.clan_id = c_concordia
                           and m.checked_in_at is not null);
  for v_i in 1 .. 93 loop
    v_user := v_crowd[2 + v_i];
    v_run := ('f2000000-0000-4000-8000-000000000' || (100 + (array[5, 9, 14, 18])[1 + v_i % 4]))::uuid;
    insert into public.clan_run_members (run_id, user_id, joined_at, checked_in_at, check_in_method)
    select v_run, v_user, now() - interval '20 days', r2.starts_at, 'place' from public.clan_runs r2 where r2.id = v_run;
    v_remaining := v_remaining - 2;
  end loop;
  foreach v_d in array array[8, 6, 4, 2] loop
    for v_i in 1 .. 93 loop
      exit when v_remaining < v_d;
      v_user := v_crowd[2 + v_i];
      for v_k in 1 .. 20 loop
        exit when v_remaining < v_d
               or (select count(*) from public.clan_run_members m join public.clan_runs r2 on r2.id = m.run_id
                   where r2.clan_id = c_concordia and m.user_id = v_user and m.checked_in_at is not null) >= 9;
        continue when v_dist[v_k] <> v_d;
        v_run := ('f2000000-0000-4000-8000-000000000' || (100 + v_k))::uuid;
        insert into public.clan_run_members (run_id, user_id, joined_at, checked_in_at, check_in_method)
        select v_run, v_user, now() - interval '20 days', r2.starts_at, 'place' from public.clan_runs r2 where r2.id = v_run
        on conflict do nothing;
        if found then
          v_remaining := v_remaining - v_d;
        end if;
      end loop;
    end loop;
  end loop;
  update public.clan_runs r2
     set down_count = (select count(*) from public.clan_run_members m where m.run_id = r2.id),
         checked_in_count = (select count(*) from public.clan_run_members m where m.run_id = r2.id and m.checked_in_at is not null)
   where r2.clan_id = c_concordia and r2.id::text like 'f2000000-0000-4000-8000-0000000001%';

  insert into public.clan_missions (id, clan_id, title, metric, target, starts_on, ends_on, created_by, created_at)
  values (c_mission, c_concordia, '2,000 km as a clan', 'distance_km', 2000, v_month,
          (v_month + interval '1 month - 1 day')::date, c_maya, v_month::timestamp at time zone c_tz);

  -- Ojoro Clash: Fall Clash, Concordia vs McGill ----------------------------------------------------------

  -- Event 4 is next Saturday 9:00; the three before it were on the Saturdays before.
  v_e4 := (v_sat + time '09:00') at time zone c_tz;
  insert into public.clashes (id, title, season_label, a_clan_id, b_clan_id, proposed_by, accepted_by, status,
                              accepted_at, backing_a, backing_b, created_at)
  values (c_clash, 'Fall Clash', 'Fall 2026', c_concordia, c_mcgill, c_maya, c_marcus, 'scheduled',
          v_e4 - interval '30 days', 312, 287, v_e4 - interval '32 days');
  insert into public.clash_events (id, clash_id, position, title, sport_id, scoring, starts_at, place_id, squad_size)
  values
    ('f5000000-0000-4000-8000-000000000001', c_clash, 1, '4 × 1 km relay', 'running', 'time',
     v_e4 - interval '21 days', c_mr, 4),
    ('f5000000-0000-4000-8000-000000000002', c_clash, 2, '3v3 basketball', 'basketball', 'score',
     v_e4 - interval '14 days', null, 3),
    ('f5000000-0000-4000-8000-000000000003', c_clash, 3, 'Bouldering · most tops', 'climbing', 'count',
     v_e4 - interval '7 days', null, 6),
    ('f5000000-0000-4000-8000-000000000004', c_clash, 4, '7-a-side football', 'football', 'score',
     v_e4, c_jm, 14),
    -- No rowing in the sports list: the erg row uses cycling for its icon (docs/DESIGN_DECISIONS.md).
    ('f5000000-0000-4000-8000-000000000005', c_clash, 5, 'Rowing erg · 2 km team', 'cycling', 'time',
     v_e4 + interval '1 day', null, 4),
    ('f5000000-0000-4000-8000-000000000006', c_clash, 6, 'Final · 10K, every runner counts', 'running', 'time',
     v_e4 + interval '15 days', c_mr, null);
  -- Dayo organizes (both captains approved him).
  insert into public.clash_organizers (clash_id, user_id, proposed_by_a, proposed_by_b, approved_at)
  values (c_clash, c_dayo, true, true, v_e4 - interval '29 days');
  insert into public.clash_event_results (clash_event_id, clash_id, a_value, b_value, winner_side, source, recorded_by,
                                          confirmed_by, verified_at)
  values
    ('f5000000-0000-4000-8000-000000000001', c_clash, 912, 931, 'a', 'organizer_verified', c_dayo, null,
     v_e4 - interval '21 days' + interval '2 hours'),
    ('f5000000-0000-4000-8000-000000000002', c_clash, 17, 21, 'b', 'captains_confirmed', c_marcus, c_maya,
     v_e4 - interval '14 days' + interval '3 hours'),
    ('f5000000-0000-4000-8000-000000000003', c_clash, 38, 34, 'a', 'captains_confirmed', c_maya, c_marcus,
     v_e4 - interval '7 days' + interval '4 hours');
  -- Squads for the football: Chimdi and 8 more from Concordia (9 of 14); 7 from McGill.
  insert into public.clash_squad_members (clash_event_id, clash_id, user_id, side, joined_at)
  select 'f5000000-0000-4000-8000-000000000004', c_clash, u, 'a', now() - interval '1 day'
  from unnest(array[c_chimdi, c_theo] || v_crowd[20:26]) u;
  insert into public.clash_squad_members (clash_event_id, clash_id, user_id, side, joined_at)
  select 'f5000000-0000-4000-8000-000000000004', c_clash, u, 'b', now() - interval '1 day'
  from unnest(array[c_marcus] || v_crowd[211:216]) u;
  -- The crowd: 312 back Concordia, 287 McGill (counts; Chimdi's own row backs Concordia).
  insert into public.clash_backings (clash_id, user_id, side) values (c_clash, c_chimdi, 'a');
end;
$$;
