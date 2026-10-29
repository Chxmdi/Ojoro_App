-- Step 3 (Liquidity) sample data, loaded by `supabase db reset` after seed.sql ([db.seed] sql_paths).
-- Local only. Never apply to a shared environment.
--
-- Safe to run again at any time against a running local stack, to refresh the time-relative parts
-- ("starts in 40 min" goes stale within the hour):
--
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_liquidity.sql
--
-- It inserts people with `on conflict do nothing` and deletes and recreates only its own plans,
-- activities and signals (fixed ids). What it shows:
--   * Discover / Ojoro Now for Chimdi (Plateau, 3 km): Sparring rounds at Hoshino Boxing (LIVE, 2 people
--     you've played with), Evening 5K at Parc La Fontaine (GAME ON in 40 min, full: waitlist), Tennis
--     doubles at Jeanne-Mance (forming 2/4 in 50 min).
--   * Latent demand near Chimdi: 5 people want volleyball tonight from 7 (each needs 6, so nothing has
--     formed): "5 people within 3 km want to play volleyball after 7. MAKE IT HAPPEN."
--   * People to move with: Ade also runs and is usually free Saturday mornings, like Chimdi.
--   * FirstHome: Nneka B, day 1 in Saint-Henri (3 km), nothing near; 3 runners nearby are down for an
--     evening run tomorrow (each needs 4): "Add yourself and it becomes a plan at 4."
--     Sign in as Nneka with +1 555 555 0120 (code 123456) once the stack restarts with the updated
--     config.toml; until then use the SQL in docs/LIQUIDITY_CONTRACT.md §Local data.

-- People ----------------------------------------------------------------------------------------------

drop table if exists seed_liquidity_people;
create temporary table seed_liquidity_people (
  id uuid primary key,
  phone text not null,
  name text not null,
  handle text not null,
  area text not null,
  lat numeric(5, 2) not null,
  lng numeric(5, 2) not null,
  radius integer not null
);

insert into seed_liquidity_people values
  -- The quiet-area user (FirstHome).
  ('a0000000-0000-4000-8000-000000000020', '15555550120', 'Nneka B', 'nneka', 'Saint-Henri, Montréal', 45.48, -73.58, 3),
  -- Runners in Saint-Henri (latent demand for Nneka).
  ('a0000000-0000-4000-8000-000000000021', '15555550121', 'Rui C', 'rui', 'Saint-Henri, Montréal', 45.48, -73.58, 3),
  ('a0000000-0000-4000-8000-000000000022', '15555550122', 'Bea L', 'bea', 'Saint-Henri, Montréal', 45.48, -73.57, 3),
  ('a0000000-0000-4000-8000-000000000023', '15555550123', 'Kofi M', 'kofi', 'Saint-Henri, Montréal', 45.49, -73.58, 3),
  -- Volleyball players near the Plateau (latent demand for Chimdi).
  ('a0000000-0000-4000-8000-000000000024', '15555550124', 'Ana P', 'ana', 'Plateau, Montréal', 45.52, -73.57, 5),
  ('a0000000-0000-4000-8000-000000000025', '15555550125', 'Luc D', 'luc', 'Plateau, Montréal', 45.53, -73.58, 5),
  ('a0000000-0000-4000-8000-000000000026', '15555550126', 'Zoe F', 'zoe', 'Mile End, Montréal', 45.52, -73.60, 5),
  ('a0000000-0000-4000-8000-000000000027', '15555550127', 'Max R', 'max', 'Plateau, Montréal', 45.53, -73.57, 5),
  ('a0000000-0000-4000-8000-000000000028', '15555550128', 'Ola S', 'ola', 'Plateau, Montréal', 45.51, -73.58, 5);

insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000', p.id, 'authenticated', 'authenticated', p.phone, now(),
       '{"provider":"phone","providers":["phone"]}', jsonb_build_object('display_name', p.name),
       now() - interval '30 days', now(), '', '', '', '', '', '', '', ''
from seed_liquidity_people p
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select p.id::text, p.id, jsonb_build_object('sub', p.id::text, 'phone', p.phone, 'phone_verified', true),
       'phone', now(), now() - interval '30 days', now()
from seed_liquidity_people p
on conflict do nothing;

update public.profiles pr
   set handle = p.handle, area = p.area,
       onboarding_completed_at = coalesce(pr.onboarding_completed_at, now() - interval '20 days')
  from seed_liquidity_people p
 where pr.id = p.id;
update public.profile_private pp
   set area_lat = p.lat, area_lng = p.lng, discovery_radius_km = p.radius
  from seed_liquidity_people p
 where pp.user_id = p.id;
-- Nneka joined today: DAY 1.
update public.profiles set onboarding_completed_at = now() - interval '1 hour'
 where id = 'a0000000-0000-4000-8000-000000000020';

insert into public.user_sports (user_id, sport_id, level, is_main) values
  ('a0000000-0000-4000-8000-000000000020', 'running', 'casual', true),
  ('a0000000-0000-4000-8000-000000000020', 'football', 'casual', false),
  ('a0000000-0000-4000-8000-000000000020', 'boxing', 'learning', false),
  ('a0000000-0000-4000-8000-000000000021', 'running', 'casual', true),
  ('a0000000-0000-4000-8000-000000000022', 'running', 'intermediate', true),
  ('a0000000-0000-4000-8000-000000000023', 'running', 'casual', true),
  ('a0000000-0000-4000-8000-000000000024', 'volleyball', 'intermediate', true),
  ('a0000000-0000-4000-8000-000000000025', 'volleyball', 'intermediate', true),
  ('a0000000-0000-4000-8000-000000000026', 'volleyball', 'advanced', true),
  ('a0000000-0000-4000-8000-000000000027', 'volleyball', 'casual', true),
  ('a0000000-0000-4000-8000-000000000028', 'volleyball', 'intermediate', true),
  -- Ade also runs; Chimdi and Ade are both usually free Saturday mornings (people to move with).
  ('a0000000-0000-4000-8000-000000000002', 'running', 'intermediate', false),
  ('a0000000-0000-4000-8000-000000000003', 'tennis', 'intermediate', false),
  ('a0000000-0000-4000-8000-000000000005', 'tennis', 'intermediate', false),
  ('a0000000-0000-4000-8000-000000000013', 'boxing', 'intermediate', true),
  ('a0000000-0000-4000-8000-000000000008', 'boxing', 'intermediate', false)
on conflict (user_id, sport_id) do nothing;
insert into public.availability_slots (user_id, day_of_week, part) values
  ('a0000000-0000-4000-8000-000000000002', 6, 'morning'),
  ('a0000000-0000-4000-8000-000000000020', 2, 'evening'),
  ('a0000000-0000-4000-8000-000000000020', 4, 'evening')
on conflict do nothing;

-- Time-relative plans, activities and signals (recreated on every run) --------------------------------

do $$
declare
  c_chimdi constant uuid := 'a0000000-0000-4000-8000-000000000001';
  c_marcus constant uuid := 'a0000000-0000-4000-8000-000000000003';
  c_sam constant uuid := 'a0000000-0000-4000-8000-000000000005';
  c_yara constant uuid := 'a0000000-0000-4000-8000-000000000006';
  c_joel constant uuid := 'a0000000-0000-4000-8000-000000000007';
  c_tomi constant uuid := 'a0000000-0000-4000-8000-000000000008';
  c_tolu constant uuid := 'a0000000-0000-4000-8000-000000000009';
  c_ife constant uuid := 'a0000000-0000-4000-8000-000000000010';
  c_dayo constant uuid := 'a0000000-0000-4000-8000-000000000013';
  c_jm constant uuid := 'b0000000-0000-4000-8000-000000000001';
  c_lf constant uuid := 'b0000000-0000-4000-8000-000000000002';
  c_hoshino constant uuid := 'b0000000-0000-4000-8000-000000000005';
  c_sparring_plan constant uuid := 'd0000000-0000-4000-8000-000000000001';
  c_sparring constant uuid := 'd0000000-0000-4000-8000-000000000101';
  c_5k_plan constant uuid := 'd0000000-0000-4000-8000-000000000002';
  c_5k constant uuid := 'd0000000-0000-4000-8000-000000000102';
  c_tennis_plan constant uuid := 'd0000000-0000-4000-8000-000000000003';
  c_volley_people constant uuid[] := array[
    'a0000000-0000-4000-8000-000000000024', 'a0000000-0000-4000-8000-000000000025',
    'a0000000-0000-4000-8000-000000000026', 'a0000000-0000-4000-8000-000000000027',
    'a0000000-0000-4000-8000-000000000028']::uuid[];
  c_runners constant uuid[] := array[
    'a0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000022',
    'a0000000-0000-4000-8000-000000000023']::uuid[];
  c_tz constant text := 'America/Toronto';
  v_today date := (now() at time zone c_tz)::date;
  v_start timestamptz;
  v_end timestamptz;
begin
  -- Clear what an earlier run made (and plans formed from its demand, e.g. after MAKE IT HAPPEN).
  update public.plans set status = 'cancelled', cancelled_at = now()
   where status = 'forming'
     and id in (select m.plan_id from public.plan_members m where m.user_id = any (c_volley_people || c_runners));
  delete from public.intent_signals where user_id = any (c_volley_people || c_runners);
  delete from public.activities where id in (c_sparring, c_5k);
  delete from public.plans where id in (c_sparring_plan, c_5k_plan, c_tennis_plan);

  -- 1. LIVE: Sparring rounds at Hoshino Boxing, started 15 minutes ago. Dayo and Tomi have both played
  --    with Chimdi ("2 people you've played with").
  v_start := now() - interval '15 minutes';
  insert into public.plans (id, sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count, locked_at, created_at)
  values (c_sparring_plan, 'boxing', 'Sparring rounds', v_start, 60, c_hoshino, 2, 'public', v_start - interval '1 hour',
          'game_on', 'quick', c_dayo, c_dayo, 2, v_start - interval '3 hours', v_start - interval '1 day');
  insert into public.plan_members (plan_id, user_id, via) values
    (c_sparring_plan, c_dayo, 'host'), (c_sparring_plan, c_tomi, 'im_down');
  insert into public.activities (id, plan_id, sport_id, title, starts_at, ends_at, place_id, capacity, host_id,
                                 confirmed_count, checked_in_count, attendance_rule, check_in_opens_at,
                                 check_in_closes_at, status, live_at, after_closes_at)
  values (c_sparring, c_sparring_plan, 'boxing', 'Sparring rounds', v_start, v_start + interval '60 minutes', c_hoshino,
          2, c_dayo, 2, 2, 'check_in', v_start - interval '30 minutes', v_start + interval '60 minutes', 'live',
          v_start, v_start + interval '60 minutes' + interval '24 hours');
  insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method) values
    (c_sparring, c_dayo, 'checked_in', v_start - interval '3 hours', v_start - interval '5 minutes', 'location'),
    (c_sparring, c_tomi, 'checked_in', v_start - interval '3 hours', v_start - interval '2 minutes', 'location');

  -- 2. GAME ON: Evening 5K at Parc La Fontaine in 40 minutes, 4 of 4 (full: waitlist).
  v_start := date_bin('5 minutes', now() + interval '40 minutes', timestamptz '2000-01-01');
  insert into public.plans (id, sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count, level_label, locked_at, created_at)
  values (c_5k_plan, 'running', 'Evening 5K', v_start, 45, c_lf, 4, 'public', now() - interval '10 minutes', 'game_on',
          'quick', c_yara, c_yara, 4, 'Easy pace', now() - interval '30 minutes', now() - interval '1 day');
  insert into public.plan_members (plan_id, user_id, via) values
    (c_5k_plan, c_yara, 'host'), (c_5k_plan, c_tolu, 'im_down'), (c_5k_plan, c_ife, 'im_down'),
    (c_5k_plan, c_joel, 'im_down');
  insert into public.activities (id, plan_id, sport_id, title, starts_at, ends_at, place_id, capacity, host_id,
                                 confirmed_count, level_label, attendance_rule, check_in_opens_at, check_in_closes_at,
                                 status, after_closes_at)
  values (c_5k, c_5k_plan, 'running', 'Evening 5K', v_start, v_start + interval '45 minutes', c_lf, 4, c_yara, 4,
          'Easy pace', 'check_in', v_start - interval '30 minutes', v_start + interval '45 minutes', 'confirmed',
          v_start + interval '45 minutes' + interval '24 hours');
  insert into public.attendance (activity_id, user_id, status, confirmed_at)
  select c_5k, u, 'confirmed', now() - interval '30 minutes' from unnest(array[c_yara, c_tolu, c_ife, c_joel]) u;

  -- 3. Forming: Tennis doubles at Jeanne-Mance in 50 minutes, 2 of 4 (Marcus hosts, Sam is in).
  v_start := date_bin('5 minutes', now() + interval '50 minutes', timestamptz '2000-01-01');
  insert into public.plans (id, sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count, created_at)
  values (c_tennis_plan, 'tennis', 'Tennis doubles', v_start, 60, c_jm, 4, 'public', v_start - interval '5 minutes',
          'forming', 'quick', c_marcus, c_marcus, 2, now() - interval '2 hours');
  insert into public.plan_members (plan_id, user_id, via, joined_at) values
    (c_tennis_plan, c_marcus, 'host', now() - interval '2 hours'),
    (c_tennis_plan, c_sam, 'im_down', now() - interval '1 hour');

  -- 4. Latent demand near Chimdi: 5 people down for volleyball tonight from 7 PM, each needing 6.
  v_start := (v_today + time '19:00') at time zone c_tz;
  if v_start < now() + interval '1 hour' then
    v_start := date_bin('15 minutes', now() + interval '1 hour', timestamptz '2000-01-01');
  end if;
  v_end := v_start + interval '4 hours';
  insert into public.intent_signals (user_id, sport_id, window_start, window_end, expires_at, audience, radius_km,
                                     min_participants, area_lat, area_lng, created_at)
  select u, 'volleyball', v_start, v_end, v_end, 'public', pp.discovery_radius_km, 6, pp.area_lat, pp.area_lng,
         now() - interval '2 hours'
  from unnest(c_volley_people) u
  join public.profile_private pp on pp.user_id = u;

  -- 5. Latent demand near Nneka: 3 runners down for an evening run tomorrow, each needing 4.
  v_start := ((v_today + 1) + time '18:00') at time zone c_tz;
  v_end := ((v_today + 1) + time '21:00') at time zone c_tz;
  insert into public.intent_signals (user_id, sport_id, window_start, window_end, expires_at, audience, radius_km,
                                     min_participants, area_lat, area_lng, created_at)
  select u, 'running', v_start, v_end, v_end, 'public', pp.discovery_radius_km, 4, pp.area_lat, pp.area_lng,
         now() - interval '3 hours'
  from unnest(c_runners) u
  join public.profile_private pp on pp.user_id = u;
end;
$$;

drop table seed_liquidity_people;
