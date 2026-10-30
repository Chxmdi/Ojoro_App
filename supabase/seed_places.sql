-- Step 7 (Places and Ojoro Pulse) sample data, loaded by `supabase db reset` after the other seeds
-- ([db.seed] sql_paths, last). Local only. Never apply to a shared environment.
--
-- Safe to run again at any time against a running local stack, to refresh the time-relative parts
-- (tonight's plans, the busy-times history):
--
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_places.sql
--
-- Re-run it after seed_communities.sql (which recreates the Thursday football Ritual and with it its
-- weeks). It deletes and recreates only its own rows (fixed ids starting 97…) and updates the facts
-- of the seeded places. Sample content from Pulse.png and Place.png (docs/PLACES_CONTRACT.md §Local
-- data). Sign in as Chimdi (+1 555 555 0100):
--   * Pulse   12 ACTIVE at Jeanne-Mance (football forming 6 / 8), SPARRING live at Hoshino, 3 at the Hall
--             building (Downtown), 5 want volleyball near Plateau
--   * Place   b0000000-0000-4000-8000-000000000001 Jeanne-Mance Park: TONIGHT HERE 7:30 Pickup football
--             6 / 8, 8:00 Women's 5 a side GAME ON, 8:30 Sprint intervals 3 / 10, then later plans;
--             RITUALS HERE Thursday FC (crew), Sunrise run · 6 km (open clan); HOSTS HERE Ade B,
--             TRUSTED HOST; busiest Thursday evenings, Tuesday second.

-- 0. Clean up what this file made before -----------------------------------------------------------------

begin;
set local ojoro.seed_reset = 'on';
delete from public.rituals where id::text like '97200000-%';
delete from public.clans where id::text like '97100000-%';
delete from public.attendance where activity_id::text like '97800000-%';
delete from public.activities where id::text like '97800000-%';
delete from public.plan_members where plan_id::text like '97600000-%';
delete from public.plans where id::text like '97600000-%';
delete from public.reputation_signals where subject_id = 'a0000000-0000-4000-8000-000000000002' and kind = 'great_host'
  and activity_id in (select a.id from public.activities a
                      where a.host_id = 'a0000000-0000-4000-8000-000000000002' and a.title = 'Thursday FC');
commit;

-- 1. Place facts ----------------------------------------------------------------------------------------------

update public.places set kind = 'park',
  description = 'Floodlit turf with a north and a south pitch, tennis courts and a track by the pond.',
  facilities = '{lights,water,washrooms}', verification = 'community_confirmed', verified_at = now() - interval '200 days'
where id = 'b0000000-0000-4000-8000-000000000001';
update public.places set kind = 'park', facilities = '{lights,water}', verification = 'community_confirmed',
  verified_at = now() - interval '150 days'
where id = 'b0000000-0000-4000-8000-000000000002';
update public.places set kind = 'park', facilities = '{lights,washrooms}'
where id = 'b0000000-0000-4000-8000-000000000003';
update public.places set kind = 'trail', facilities = '{water,bike racks}'
where id = 'b0000000-0000-4000-8000-000000000004';
update public.places set kind = 'gym', description = 'Boxing gym. Sparring rounds most evenings.',
  facilities = '{changing rooms,showers,water}', verification = 'venue_verified', verified_at = now() - interval '90 days'
where id = 'b0000000-0000-4000-8000-000000000005';
update public.places set kind = 'pitch', facilities = '{lights,changing rooms}'
where id = 'b0000000-0000-4000-8000-000000000031';
update public.places set kind = 'trail' where id in ('b0000000-0000-4000-8000-000000000041',
                                                     'b0000000-0000-4000-8000-000000000061',
                                                     'b0000000-0000-4000-8000-000000000062');

-- 2. Tonight, history, groups, hosts ------------------------------------------------------------------------------

do $$
declare
  c_tz constant text := 'America/Toronto';
  c_jm constant uuid := 'b0000000-0000-4000-8000-000000000001';
  c_chimdi constant uuid := 'a0000000-0000-4000-8000-000000000001';
  c_ade constant uuid := 'a0000000-0000-4000-8000-000000000002';
  c_marcus constant uuid := 'a0000000-0000-4000-8000-000000000003';
  c_lena constant uuid := 'a0000000-0000-4000-8000-000000000004';
  c_sam constant uuid := 'a0000000-0000-4000-8000-000000000005';
  c_yara constant uuid := 'a0000000-0000-4000-8000-000000000006';
  c_tolu constant uuid := 'a0000000-0000-4000-8000-000000000009';
  c_ife constant uuid := 'a0000000-0000-4000-8000-000000000010';
  c_maya constant uuid := 'a0000000-0000-4000-8000-000000000011';
  c_theo constant uuid := 'a0000000-0000-4000-8000-000000000012';
  c_rui constant uuid := 'a0000000-0000-4000-8000-000000000021';
  c_thursday_ritual constant uuid := 'f0000000-0000-4000-8000-000000000001';
  c_clan constant uuid := '97100000-0000-4000-8000-000000000071';
  c_ritual constant uuid := '97200000-0000-4000-8000-000000000071';
  v_tonight timestamptz;
  v_at timestamptz;
  v_plan uuid;
  v_act uuid;
  v_n integer := 0;
  v_people uuid[];
  v_week integer;
  v_day integer;
  v_count integer;
  v_monday date;
  -- People who showed up per evening, per week (Mon..Sun). Tuesday adds to Plateau Pickup's sessions
  -- (seed_hosts.sql); together they make Thursday the busiest and Tuesday second.
  v_per_day integer[] := array[13, 23, 32, 45, 20, 27, 18];
  r record;
begin
  -- Tonight 7:30 PM Montréal time, or 3 hours from now if that is too close or past (same rule as seed.sql).
  v_tonight := (((now() at time zone c_tz)::date + time '19:30') at time zone c_tz);
  if v_tonight < now() + interval '2 hours' then
    v_tonight := date_bin('30 minutes', now() + interval '3 hours', timestamptz '2000-01-01');
  end if;

  -- TONIGHT HERE at Jeanne-Mance. 7:30 Pickup football 6 / 8 is seed.sql's "Football tonight".
  -- 8:00 Women's 5 a side, GAME ON (10 of 10), hosted by Lena.
  v_plan := '97600000-0000-4000-8000-000000000001';
  v_act := '97800000-0000-4000-8000-000000000001';
  v_at := v_tonight + interval '30 minutes';
  v_people := array[c_lena] || array(select ('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
                                      from generate_series(150, 158) n);
  insert into public.plans (id, sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count, level_label, locked_at, created_at)
  values (v_plan, 'football', 'Women''s 5 a side', v_at, 60, c_jm, 10, 'public', v_at - interval '1 hour', 'game_on',
          'quick', c_lena, c_lena, 10, 'Open', now() - interval '3 hours', now() - interval '1 day');
  insert into public.plan_members (plan_id, user_id, via, joined_at)
  select v_plan, u, case when u = c_lena then 'host'::public.member_via else 'im_down'::public.member_via end,
         now() - interval '1 day' + o * interval '10 minutes'
  from unnest(v_people) with ordinality x(u, o);
  insert into public.plan_meeting_points (plan_id, label) values (v_plan, 'South pitch');
  insert into public.activities (id, plan_id, sport_id, title, starts_at, ends_at, place_id, capacity, host_id,
                                 confirmed_count, level_label, attendance_rule, check_in_opens_at, check_in_closes_at,
                                 status, after_closes_at, created_at)
  values (v_act, v_plan, 'football', 'Women''s 5 a side', v_at, v_at + interval '60 minutes', c_jm, 10, c_lena, 10,
          'Open', 'check_in_host_confirms', v_at - interval '30 minutes', v_at + interval '60 minutes', 'confirmed',
          v_at + interval '25 hours', now() - interval '3 hours');
  insert into public.attendance (activity_id, user_id, status, confirmed_at)
  select v_act, u, 'confirmed', now() - interval '3 hours' from unnest(v_people) u;

  -- 8:30 Sprint intervals, forming 3 / 10, hosted by Yara.
  v_plan := '97600000-0000-4000-8000-000000000002';
  v_at := v_tonight + interval '60 minutes';
  insert into public.plans (id, sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count, level_label, created_at)
  values (v_plan, 'running', 'Sprint intervals', v_at, 45, c_jm, 10, 'public', v_at - interval '30 minutes', 'forming',
          'quick', c_yara, c_yara, 3, 'All paces', now() - interval '5 hours');
  insert into public.plan_members (plan_id, user_id, via, joined_at)
  select v_plan, u, case when u = c_yara then 'host'::public.member_via else 'im_down'::public.member_via end,
         now() - interval '5 hours' + o * interval '20 minutes'
  from unnest(array[c_yara, c_ife, c_theo]) with ordinality x(u, o);
  insert into public.plan_meeting_points (plan_id, label) values (v_plan, 'Track by the pond');

  -- Later tonight: seven more small plans, so Jeanne-Mance shows 12 on Pulse.
  for r in
    select * from (values
      (3, 'tennis', 'Late tennis', 90, 2, c_marcus),
      (4, 'football', 'Small-sided', 105, 10, c_sam),
      (5, 'running', 'Night 5K', 120, 8, c_tolu),
      (6, 'tennis', 'Tennis singles', 135, 2, c_ife),
      (7, 'football', 'Late kickabout', 150, 10, c_theo),
      (8, 'running', 'Easy loop', 165, 6, c_maya),
      (9, 'tennis', 'Doubles, last court', 180, 4, c_rui)
    ) t(n, sport, title, offset_min, cap, host)
  loop
    v_plan := ('97600000-0000-4000-8000-' || lpad(r.n::text, 12, '0'))::uuid;
    v_at := v_tonight + make_interval(mins => r.offset_min);
    insert into public.plans (id, sport_id, title, starts_at, duration_minutes, place_id, capacity, audience,
                              deadline_at, status, source, created_by, host_id, member_count, created_at)
    values (v_plan, r.sport, r.title, v_at, 60, c_jm, r.cap, 'public', v_at - interval '30 minutes', 'forming',
            'quick', r.host, r.host, 1, now() - interval '2 hours');
    insert into public.plan_members (plan_id, user_id, via, joined_at)
    values (v_plan, r.host, 'host', now() - interval '2 hours');
  end loop;

  -- Parc Jarry: three runs tonight → the small "3". Not at the Hall building: downtown is under 2 km from
  -- Saint-Henri, which must stay quiet for the FirstHome sample (seed_liquidity.sql, Nneka).
  for r in
    select * from (values (21, 'Hill repeats', 30, c_maya), (22, 'Tempo 5K', 75, c_theo), (23, 'Recovery jog', 120, c_rui))
      t(n, title, offset_min, host)
  loop
    v_plan := ('97600000-0000-4000-8000-' || lpad(r.n::text, 12, '0'))::uuid;
    v_at := v_tonight + make_interval(mins => r.offset_min);
    insert into public.plans (id, sport_id, title, starts_at, duration_minutes, place_id, capacity, audience,
                              deadline_at, status, source, created_by, host_id, member_count, created_at)
    values (v_plan, 'running', r.title, v_at, 45, 'b0000000-0000-4000-8000-000000000003', 8, 'public', v_at - interval '30 minutes', 'forming',
            'quick', r.host, r.host, 1, now() - interval '4 hours');
    insert into public.plan_members (plan_id, user_id, via, joined_at)
    values (v_plan, r.host, 'host', now() - interval '4 hours');
  end loop;

  -- WHEN IT'S BUSY: twelve weeks of finished public evening games at Jeanne-Mance, hosted by Rui C (who
  -- hasn't played with Chimdi, so Chimdi doesn't see Rui under HOSTS HERE). Counts only: no attendance rows.
  v_monday := (now() at time zone c_tz)::date - (extract(isodow from now() at time zone c_tz)::integer - 1);
  for v_week in 1 .. 12 loop
    for v_day in 1 .. 7 loop
      v_count := v_per_day[v_day];
      continue when v_count = 0;
      v_at := ((v_monday - 7 * v_week + (v_day - 1)) + time '19:00') at time zone c_tz;
      v_n := v_n + 1;
      v_plan := ('97600000-0000-4000-8000-' || lpad((1000 + v_n)::text, 12, '0'))::uuid;
      v_act := ('97800000-0000-4000-8000-' || lpad((1000 + v_n)::text, 12, '0'))::uuid;
      insert into public.plans (id, sport_id, title, starts_at, duration_minutes, place_id, capacity, audience,
                                deadline_at, status, source, created_by, host_id, member_count, locked_at, created_at)
      values (v_plan, 'football', 'Evening pickup', v_at, 90, c_jm, v_count, 'public', v_at - interval '1 hour',
              'game_on', 'quick', c_rui, c_rui, v_count, v_at - interval '2 hours', v_at - interval '1 day');
      insert into public.activities (id, plan_id, sport_id, title, starts_at, ends_at, place_id, capacity, host_id,
                                     confirmed_count, checked_in_count, attendance_rule, check_in_opens_at,
                                     check_in_closes_at, status, live_at, ended_at, after_closes_at, completed_at,
                                     created_at)
      values (v_act, v_plan, 'football', 'Evening pickup', v_at, v_at + interval '90 minutes', c_jm, v_count, c_rui,
              v_count, v_count, 'check_in_host_confirms', v_at - interval '30 minutes', v_at + interval '90 minutes',
              'complete', v_at, v_at + interval '90 minutes', v_at + interval '25 hours', v_at + interval '25 hours',
              v_at - interval '2 hours');
    end loop;
  end loop;

  -- RITUALS HERE: Sunrise run · 6 km, Sunday 7:00, an open clan (Sunrise Runners, captain Lena).
  insert into public.clans (id, name, short_name, tagline, sport_id, area, city, join_policy, time_zone, created_by,
                            member_count, created_at)
  values (c_clan, 'Sunrise Runners', 'Sunrise', 'Six kilometres before work, every Sunday. Open to all.', 'running',
          'Plateau', 'Montréal', 'open', c_tz, c_lena, 0, now() - interval '120 days');
  insert into public.clan_members (clan_id, user_id, role, role_note, via, joined_at)
  values (c_clan, c_lena, 'captain', 'Sets the route', 'created', now() - interval '120 days');
  insert into public.clan_members (clan_id, user_id, role, via, joined_at)
  select c_clan, ('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'member', 'open',
         now() - (n || ' days')::interval
  from generate_series(160, 175) n;
  update public.clans set member_count = (select count(*) from public.clan_members m where m.clan_id = c_clan)
   where id = c_clan;
  insert into public.rituals (id, clan_id, sport_id, title, day_of_week, local_time, time_zone, duration_minutes,
                              place_id, capacity, min_to_go, distance_km, host_id, lead_days, created_by, created_at)
  values (c_ritual, c_clan, 'running', 'Sunrise run', 7, '07:00', c_tz, 60, c_jm, 40, 4, 6, c_lena, 6, c_lena,
          now() - interval '120 days');

  -- Thursday FC: six weeks running (the six latest past Thursday FC games become its weeks).
  if exists (select 1 from public.rituals where id = c_thursday_ritual) then
    insert into public.ritual_occurrences (ritual_id, occurs_on, starts_at, plan_id, created_at)
    select c_thursday_ritual, (p.starts_at at time zone c_tz)::date, p.starts_at, p.id, p.starts_at - interval '6 days'
    from (select p.id, p.starts_at from public.plans p
          where p.host_id = c_ade and p.title = 'Thursday FC' and p.place_id = c_jm and p.starts_at < now()
          order by p.starts_at desc limit 6) p
    on conflict (ritual_id, occurs_on) do nothing;
  end if;

  -- HOSTS HERE: Ade is a TRUSTED HOST ("great host" from five people who played his games).
  insert into public.reputation_signals (giver_id, subject_id, activity_id, kind, created_at)
  select g, c_ade, a.id, 'great_host', a.starts_at + interval '3 hours'
  from (select a.id, a.starts_at from public.activities a
        where a.host_id = c_ade and a.title = 'Thursday FC' and a.status = 'complete'
        order by a.starts_at desc limit 1) a
  cross join unnest(array[c_chimdi, c_marcus, c_sam, c_yara, c_tolu]) g
  on conflict do nothing;
end;
$$;
