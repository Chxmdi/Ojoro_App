-- Local seed data, loaded by `supabase db reset` after migrations (see [db.seed] in config.toml).
-- Sample content from design-handoff/ (names, places, counts). Never apply to a shared environment.
--
-- Times are relative to now() so "tonight" is always tonight (Montréal time). Sign in locally with
-- the test numbers in config.toml, code 123456:
--   +1 555 555 0100  Chimdi O  (the "you" user in the designs)
--   +1 555 555 0101  Ade B     (host)
--   +1 555 555 0102  Marcus T
--   +1 555 555 0103  Lena R
-- Everyone else has a 0104+ number that is not a test number (no sign-in).
--
-- Step 3 (Liquidity) sample data is in seed_liquidity.sql, loaded right after this file and safe to
-- re-run on a running stack (docs/LIQUIDITY_CONTRACT.md §Local data).

-- Places (public centroids; meeting points are per plan) ----------------------------------------------------

insert into public.places (id, slug, name, area, city, lat, lng, sport_ids, surface, floodlit_until, is_free) values
  ('b0000000-0000-4000-8000-000000000001', 'jeanne-mance-park', 'Jeanne-Mance Park', 'Plateau', 'Montréal',
   45.5165, -73.5862, '{football,running,tennis,volleyball}', 'Turf', '23:00', true),
  ('b0000000-0000-4000-8000-000000000002', 'parc-la-fontaine', 'Parc La Fontaine', 'Plateau', 'Montréal',
   45.5268, -73.5697, '{basketball,volleyball,running,tennis}', 'Courts', '22:00', true),
  ('b0000000-0000-4000-8000-000000000003', 'parc-jarry', 'Parc Jarry', 'Villeray', 'Montréal',
   45.5335, -73.6280, '{beach_volleyball,football,tennis,running}', 'Sand courts', '22:00', true),
  ('b0000000-0000-4000-8000-000000000004', 'lachine-canal', 'Lachine Canal', 'Saint-Henri', 'Montréal',
   45.4835, -73.5800, '{running,cycling}', 'Paved · 8 km loop', null, true),
  ('b0000000-0000-4000-8000-000000000005', 'hoshino-boxing', 'Hoshino Boxing', 'Mile End', 'Montréal',
   45.5240, -73.5990, '{boxing}', 'Gym', null, false);

-- People ------------------------------------------------------------------------------------------------

create temporary table seed_people (
  n integer primary key,
  id uuid not null,
  phone text not null,
  name text not null,
  handle text not null,
  area text not null,
  lat numeric(5, 2) not null,
  lng numeric(5, 2) not null
);

insert into seed_people values
  (1, 'a0000000-0000-4000-8000-000000000001', '15555550100', 'Chimdi O', 'chimdi', 'Plateau, Montréal', 45.52, -73.58),
  (2, 'a0000000-0000-4000-8000-000000000002', '15555550101', 'Ade B', 'ade', 'Plateau, Montréal', 45.52, -73.58),
  (3, 'a0000000-0000-4000-8000-000000000003', '15555550102', 'Marcus T', 'marcus', 'Mile End, Montréal', 45.52, -73.60),
  (4, 'a0000000-0000-4000-8000-000000000004', '15555550103', 'Lena R', 'lena', 'Plateau, Montréal', 45.52, -73.57),
  (5, 'a0000000-0000-4000-8000-000000000005', '15555550104', 'Sam K', 'sam', 'Rosemont, Montréal', 45.54, -73.58),
  (6, 'a0000000-0000-4000-8000-000000000006', '15555550105', 'Yara M', 'yara', 'Plateau, Montréal', 45.53, -73.58),
  (7, 'a0000000-0000-4000-8000-000000000007', '15555550106', 'Joel P', 'joel', 'Mile End, Montréal', 45.52, -73.60),
  (8, 'a0000000-0000-4000-8000-000000000008', '15555550107', 'Tomi A', 'tomi', 'Villeray, Montréal', 45.54, -73.62),
  (9, 'a0000000-0000-4000-8000-000000000009', '15555550108', 'Tolu D', 'tolu', 'Plateau, Montréal', 45.52, -73.59),
  (10, 'a0000000-0000-4000-8000-000000000010', '15555550109', 'Ife N', 'ife', 'Plateau, Montréal', 45.53, -73.57),
  (11, 'a0000000-0000-4000-8000-000000000011', '15555550110', 'Maya K', 'maya', 'Villeray, Montréal', 45.54, -73.62),
  (12, 'a0000000-0000-4000-8000-000000000012', '15555550111', 'Theo L', 'theo', 'Plateau, Montréal', 45.53, -73.57),
  (13, 'a0000000-0000-4000-8000-000000000013', '15555550112', 'Dayo F', 'dayo', 'Rosemont, Montréal', 45.54, -73.58);

insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000', p.id, 'authenticated', 'authenticated', p.phone, now(),
       '{"provider":"phone","providers":["phone"]}', jsonb_build_object('display_name', p.name),
       now() - interval '200 days', now(), '', '', '', '', '', '', '', ''
from seed_people p;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select p.id::text, p.id,
       jsonb_build_object('sub', p.id::text, 'phone', p.phone, 'phone_verified', true),
       'phone', now(), now() - interval '200 days', now()
from seed_people p;

-- Profile rows exist already (auth trigger). Fill them in.
update public.profiles pr
   set handle = p.handle, area = p.area, onboarding_completed_at = now() - interval '190 days'
  from seed_people p where pr.id = p.id;
update public.profile_private pp set area_lat = p.lat, area_lng = p.lng
  from seed_people p where pp.user_id = p.id;
-- Lena is new to the area and hasn't finished onboarding.
update public.profiles set onboarding_completed_at = null where id = 'a0000000-0000-4000-8000-000000000004';

-- Chimdi, as on the You and onboarding screens.
insert into public.user_sports (user_id, sport_id, level, position, is_main) values
  ('a0000000-0000-4000-8000-000000000001', 'football', 'intermediate', 'Midfield', true),
  ('a0000000-0000-4000-8000-000000000001', 'running', 'advanced', '5K and 10K', false),
  ('a0000000-0000-4000-8000-000000000001', 'boxing', 'learning', null, false),
  ('a0000000-0000-4000-8000-000000000002', 'football', 'advanced', 'Defence', true),
  ('a0000000-0000-4000-8000-000000000003', 'football', 'advanced', 'Striker', true),
  ('a0000000-0000-4000-8000-000000000004', 'football', 'casual', null, true),
  ('a0000000-0000-4000-8000-000000000005', 'football', 'intermediate', null, true),
  ('a0000000-0000-4000-8000-000000000006', 'football', 'intermediate', 'Goal', true),
  ('a0000000-0000-4000-8000-000000000007', 'football', 'intermediate', 'Midfield', true),
  ('a0000000-0000-4000-8000-000000000008', 'football', 'intermediate', null, false),
  ('a0000000-0000-4000-8000-000000000008', 'beach_volleyball', 'advanced', null, true),
  ('a0000000-0000-4000-8000-000000000009', 'football', 'casual', null, true),
  ('a0000000-0000-4000-8000-000000000010', 'football', 'intermediate', null, true),
  ('a0000000-0000-4000-8000-000000000012', 'basketball', 'intermediate', 'Guard', true);

-- Usually free Tue and Thu evenings, Sat mornings.
insert into public.availability_slots (user_id, day_of_week, part) values
  ('a0000000-0000-4000-8000-000000000001', 2, 'evening'),
  ('a0000000-0000-4000-8000-000000000001', 4, 'evening'),
  ('a0000000-0000-4000-8000-000000000001', 6, 'morning'),
  ('a0000000-0000-4000-8000-000000000007', 2, 'evening'),
  ('a0000000-0000-4000-8000-000000000007', 3, 'evening'),
  ('a0000000-0000-4000-8000-000000000007', 4, 'evening'),
  ('a0000000-0000-4000-8000-000000000008', 2, 'evening'),
  ('a0000000-0000-4000-8000-000000000008', 4, 'evening');

-- Pull Me In: Chimdi and Joel for football (people they've played with); Ife for anyone nearby.
insert into public.pull_me_in (user_id, sport_id, scope) values
  ('a0000000-0000-4000-8000-000000000001', 'football', 'connections'),
  ('a0000000-0000-4000-8000-000000000007', 'football', 'connections'),
  ('a0000000-0000-4000-8000-000000000010', 'football', 'nearby');

-- Plans, activities, history ------------------------------------------------------------------------------

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
  c_lf constant uuid := 'b0000000-0000-4000-8000-000000000002';
  c_jarry constant uuid := 'b0000000-0000-4000-8000-000000000003';
  c_tz constant text := 'America/Toronto';
  v_tonight timestamptz;
  v_saturday timestamptz;
  v_start timestamptz;
  v_plan uuid;
  v_activity uuid;
  v_proposal uuid;
  v_players uuid[];
  v_option uuid;
  v_week integer;
begin
  -- Tonight 7:30 PM Montréal time, or 3 hours from now if 7:30 is too close or past.
  v_tonight := (((now() at time zone c_tz)::date + time '19:30') at time zone c_tz);
  if v_tonight < now() + interval '2 hours' then
    v_tonight := date_bin('30 minutes', now() + interval '3 hours', timestamptz '2000-01-01');
  end if;
  -- Next Saturday 10:00.
  v_saturday := ((((now() at time zone c_tz)::date
                  + ((6 - extract(isodow from now() at time zone c_tz)::integer + 7) % 7)) + time '10:00') at time zone c_tz);
  if v_saturday < now() + interval '2 hours' then
    v_saturday := v_saturday + interval '7 days';
  end if;

  -- 1. Eleven weekly Thursday FC games at Jeanne-Mance, 12 to 2 weeks ago: history for
  --    "12 games with you", "40 games hosted", Passport and reputation. Lena isn't in any.
  for v_week in reverse 12 .. 2 loop
    v_start := now() - make_interval(days => 7 * v_week);
    v_players := array[c_ade, c_chimdi, c_marcus, c_sam, c_yara, c_tolu,
                       case when v_week % 2 = 0 then c_tomi else c_ife end,
                       case when v_week % 3 = 0 then c_theo else c_dayo end];
    insert into public.plans (sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                              status, source, created_by, host_id, member_count, level_label, team_a_label, team_b_label,
                              locked_at, created_at)
    values ('football', 'Thursday FC', v_start, 90, c_jm, 8, 'public', v_start - interval '1 hour', 'game_on', 'quick',
            c_ade, c_ade, 8, 'Mixed level', 'Lights', 'Darks', v_start - interval '3 hours', v_start - interval '2 days')
    returning id into v_plan;
    insert into public.plan_members (plan_id, user_id, via, joined_at)
    select v_plan, u, case when u = c_ade then 'host'::public.member_via else 'im_down'::public.member_via end,
           v_start - interval '1 day'
    from unnest(v_players) u;
    insert into public.activities (plan_id, sport_id, title, starts_at, ends_at, place_id, capacity, host_id,
                                   confirmed_count, checked_in_count, level_label, team_a_label, team_b_label,
                                   attendance_rule, check_in_opens_at, check_in_closes_at, status, live_at,
                                   after_closes_at, completed_at, created_at)
    values (v_plan, 'football', 'Thursday FC', v_start, v_start + interval '90 minutes', c_jm, 8, c_ade, 8, 8,
            'Mixed level', 'Lights', 'Darks', 'check_in_host_confirms', v_start - interval '30 minutes',
            v_start + interval '90 minutes', 'complete', v_start, v_start + interval '90 minutes' + interval '24 hours',
            v_start + interval '90 minutes' + interval '24 hours', v_start - interval '3 hours')
    returning id into v_activity;
    insert into public.attendance (activity_id, user_id, status, team, confirmed_at, checked_in_at, check_in_method)
    select v_activity, u, 'checked_in', case when i % 2 = 1 then 'a'::public.team_side else 'b'::public.team_side end,
           v_start - interval '3 hours', v_start - interval '10 minutes', 'location'
    from unnest(v_players) with ordinality as x(u, i);
    insert into public.result_proposals (activity_id, proposed_by, team_a_score, team_b_score, status,
                                         verification_level, confirmations_count, threshold, verified_at, created_at)
    values (v_activity, c_ade, 3 + v_week % 3, 2 + v_week % 2, 'verified', 'participant_confirmed', 5, 4,
            v_start + interval '2 hours', v_start + interval '95 minutes')
    returning id into v_proposal;
    insert into public.result_confirmations (proposal_id, user_id)
    select v_proposal, u from unnest(v_players[1:5]) u;
    insert into public.recaps (activity_id, sport_id, place_id, occurred_at, duration_minutes, played_count,
                               team_a_label, team_b_label, team_a_score, team_b_score, result_proposal_id,
                               verification_level, confirmed_count, created_at, finalized_at)
    values (v_activity, 'football', c_jm, v_start, 90, 8, 'Lights', 'Darks', 3 + v_week % 3, 2 + v_week % 2,
            v_proposal, 'participant_confirmed', 5, v_start + interval '2 hours',
            v_start + interval '90 minutes' + interval '24 hours');
    insert into public.passport_entries (user_id, activity_id, sport_id, place_id, occurred_at, minutes, sport_game_number)
    select u, v_activity, 'football', c_jm, v_start, 90, 0 from unnest(v_players) u;
    -- Reputation from people who played with Chimdi.
    insert into public.reputation_signals (giver_id, subject_id, activity_id, kind, created_at)
    select u, c_chimdi, v_activity, 'shows_up', v_start + interval '3 hours'
    from unnest(v_players) u where u <> c_chimdi;
    insert into public.reputation_signals (giver_id, subject_id, activity_id, kind, created_at)
    select u, c_chimdi, v_activity, 'respectful', v_start + interval '3 hours'
    from unnest(array[c_ade, c_marcus]) u;
    if v_week <= 4 then
      insert into public.reputation_signals (giver_id, subject_id, activity_id, kind, created_at)
      values (c_ade, c_chimdi, v_activity, 'welcomes_beginners', v_start + interval '3 hours');
    end if;
  end loop;

  -- 2. Last week: LIGHTS WIN 5–4. Complete, with a finalized Recap (Recap screen, Main "last Thursday").
  v_start := now() - interval '7 days';
  v_players := array[c_ade, c_chimdi, c_marcus, c_joel, c_sam, c_yara, c_tolu, c_tomi];
  insert into public.plans (sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count, level_label, team_a_label, team_b_label,
                            teams_note, kit_note, locked_at, created_at)
  values ('football', 'Thursday FC', v_start, 90, c_jm, 8, 'public', v_start - interval '1 hour', 'game_on', 'quick',
          c_ade, c_ade, 8, 'Mixed level', 'Lights', 'Darks', 'Lights vs Darks. Bring both shirts.',
          'Ball and bibs: Ade. Turf boots.', v_start - interval '3 hours', v_start - interval '2 days')
  returning id into v_plan;
  insert into public.plan_meeting_points (plan_id, label, lat, lng)
  values (v_plan, 'North pitch, by the lights', 45.5190, -73.5880);
  insert into public.plan_members (plan_id, user_id, via, joined_at)
  select v_plan, u, case when u = c_ade then 'host'::public.member_via else 'im_down'::public.member_via end,
         v_start - interval '1 day'
  from unnest(v_players) u;
  insert into public.activities (plan_id, sport_id, title, starts_at, ends_at, place_id, capacity, host_id,
                                 confirmed_count, checked_in_count, level_label, team_a_label, team_b_label,
                                 teams_note, kit_note, attendance_rule, check_in_opens_at, check_in_closes_at,
                                 status, live_at, after_closes_at, completed_at, created_at)
  values (v_plan, 'football', 'Thursday FC', v_start, v_start + interval '90 minutes', c_jm, 8, c_ade, 8, 8,
          'Mixed level', 'Lights', 'Darks', 'Lights vs Darks. Bring both shirts.', 'Ball and bibs: Ade. Turf boots.',
          'check_in_host_confirms', v_start - interval '30 minutes', v_start + interval '90 minutes', 'complete',
          v_start, v_start + interval '90 minutes' + interval '24 hours',
          v_start + interval '90 minutes' + interval '24 hours', v_start - interval '3 hours')
  returning id into v_activity;
  insert into public.attendance (activity_id, user_id, status, team, confirmed_at, checked_in_at, check_in_method)
  select v_activity, u, 'checked_in', case when i % 2 = 1 then 'a'::public.team_side else 'b'::public.team_side end,
         v_start - interval '3 hours', v_start - interval '8 minutes', 'location'
  from unnest(v_players) with ordinality as x(u, i);
  insert into public.result_proposals (activity_id, proposed_by, team_a_score, team_b_score, status,
                                       verification_level, confirmations_count, threshold, verified_at, created_at)
  values (v_activity, c_ade, 5, 4, 'verified', 'participant_confirmed', 6, 4, v_start + interval '2 hours',
          v_start + interval '95 minutes')
  returning id into v_proposal;
  insert into public.result_confirmations (proposal_id, user_id)
  select v_proposal, u from unnest(v_players[1:6]) u;
  insert into public.recaps (activity_id, sport_id, place_id, occurred_at, duration_minutes, played_count,
                             team_a_label, team_b_label, team_a_score, team_b_score, result_proposal_id,
                             verification_level, confirmed_count, moments_count, created_at, finalized_at)
  values (v_activity, 'football', c_jm, v_start, 90, 8, 'Lights', 'Darks', 5, 4, v_proposal,
          'participant_confirmed', 6, 0, v_start + interval '2 hours',
          v_start + interval '90 minutes' + interval '24 hours');
  insert into public.passport_entries (user_id, activity_id, sport_id, place_id, occurred_at, minutes, sport_game_number)
  select u, v_activity, 'football', c_jm, v_start, 90, 0 from unnest(v_players) u;

  -- Passport ordinals in time order.
  update public.passport_entries e
     set place_game_number = o.place_n, sport_game_number = o.sport_n
    from (select id,
                 row_number() over (partition by user_id, place_id order by occurred_at, id) as place_n,
                 row_number() over (partition by user_id, sport_id order by occurred_at, id) as sport_n
          from public.passport_entries) o
   where o.id = e.id;

  -- 3. Two hours ago: a game in the After window. Ade logged 5–4; 3 of 8 confirmed (threshold 4).
  --    Chimdi played and hasn't confirmed yet (After screen).
  v_start := date_bin('15 minutes', now() - interval '3 hours 30 minutes', timestamptz '2000-01-01');
  v_players := array[c_ade, c_chimdi, c_marcus, c_joel, c_lena, c_sam, c_yara, c_tolu];
  insert into public.plans (sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count, level_label, team_a_label, team_b_label,
                            teams_note, kit_note, locked_at, created_at)
  values ('football', 'Pickup football', v_start, 90, c_jm, 8, 'public', v_start - interval '1 hour', 'game_on', 'quick',
          c_ade, c_ade, 8, 'Mixed level', 'Lights', 'Darks', 'Lights vs Darks. Bring both shirts.',
          'Ball and bibs: Ade. Turf boots.', v_start - interval '2 hours', v_start - interval '1 day')
  returning id into v_plan;
  insert into public.plan_meeting_points (plan_id, label, lat, lng)
  values (v_plan, 'North pitch, by the lights', 45.5190, -73.5880);
  insert into public.plan_members (plan_id, user_id, via, joined_at)
  select v_plan, u, case when u = c_ade then 'host'::public.member_via else 'im_down'::public.member_via end,
         v_start - interval '6 hours'
  from unnest(v_players) u;
  insert into public.activities (plan_id, sport_id, title, starts_at, ends_at, place_id, capacity, host_id,
                                 confirmed_count, checked_in_count, level_label, team_a_label, team_b_label,
                                 teams_note, kit_note, attendance_rule, check_in_opens_at, check_in_closes_at,
                                 status, live_at, after_closes_at, created_at)
  values (v_plan, 'football', 'Pickup football', v_start, v_start + interval '90 minutes', c_jm, 8, c_ade, 8, 8,
          'Mixed level', 'Lights', 'Darks', 'Lights vs Darks. Bring both shirts.', 'Ball and bibs: Ade. Turf boots.',
          'check_in_host_confirms', v_start - interval '30 minutes', v_start + interval '90 minutes', 'after',
          v_start, v_start + interval '90 minutes' + interval '24 hours', v_start - interval '2 hours')
  returning id into v_activity;
  insert into public.attendance (activity_id, user_id, status, team, confirmed_at, checked_in_at, check_in_method)
  select v_activity, u, 'checked_in', case when i % 2 = 1 then 'a'::public.team_side else 'b'::public.team_side end,
         v_start - interval '2 hours', v_start - interval '20 minutes' + make_interval(mins => i::integer * 2), 'location'
  from unnest(v_players) with ordinality as x(u, i);
  insert into public.result_proposals (activity_id, proposed_by, team_a_score, team_b_score, status,
                                       confirmations_count, threshold, created_at)
  values (v_activity, c_ade, 5, 4, 'proposed', 3, 4, v_start + interval '95 minutes')
  returning id into v_proposal;
  insert into public.result_confirmations (proposal_id, user_id)
  values (v_proposal, c_ade), (v_proposal, c_marcus), (v_proposal, c_yara);

  -- 4. Tonight: football at Jeanne-Mance, 6 of 8, forming (Plan screen). Poll 7:30 (4) vs 8:00 (2).
  insert into public.plans (sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            poll_closes_at, status, source, created_by, host_id, member_count, level_label,
                            team_a_label, team_b_label, teams_note, kit_note, created_at)
  values ('football', 'Football tonight', v_tonight, 90, c_jm, 8, 'public', v_tonight - interval '1 hour',
          v_tonight - interval '90 minutes', 'forming', 'down_for', c_ade, c_ade, 6, 'Mixed level', 'Lights', 'Darks',
          'Lights vs Darks. Bring both shirts.', 'Ball and bibs: Ade. Turf boots.', now() - interval '3 hours')
  returning id into v_plan;
  insert into public.plan_meeting_points (plan_id, label, lat, lng)
  values (v_plan, 'North pitch, by the lights', 45.5190, -73.5880);
  insert into public.plan_members (plan_id, user_id, via, joined_at) values
    (v_plan, c_ade, 'host', now() - interval '3 hours'),
    (v_plan, c_chimdi, 'down_for', now() - interval '170 minutes'),
    (v_plan, c_marcus, 'down_for', now() - interval '160 minutes'),
    (v_plan, c_lena, 'im_down', now() - interval '90 minutes'),
    (v_plan, c_sam, 'im_down', now() - interval '60 minutes'),
    (v_plan, c_yara, 'im_down', now() - interval '30 minutes');
  insert into public.plan_time_options (plan_id, starts_at, vote_count, created_by) values
    (v_plan, v_tonight, 4, c_ade) returning id into v_option;
  insert into public.plan_time_votes (plan_id, user_id, option_id)
  select v_plan, u, v_option from unnest(array[c_ade, c_marcus, c_sam, c_yara]) u;
  insert into public.plan_time_options (plan_id, starts_at, vote_count, created_by) values
    (v_plan, v_tonight + interval '30 minutes', 2, c_lena) returning id into v_option;
  insert into public.plan_time_votes (plan_id, user_id, option_id)
  select v_plan, u, v_option from unnest(array[c_lena, c_chimdi]) u;

  -- Down For: three more people want football tonight (Main "11 people near you want to play").
  insert into public.intent_signals (user_id, sport_id, window_start, window_end, expires_at, audience, radius_km,
                                     area_lat, area_lng, created_at)
  select u, 'football', v_tonight - interval '90 minutes', v_tonight + interval '2 hours',
         v_tonight + interval '2 hours', 'public', 5, pp.area_lat, pp.area_lng, now() - interval '1 hour'
  from unnest(array[c_joel, c_tolu, c_ife]) u
  join public.profile_private pp on pp.user_id = u;

  -- 5. Last night: volleyball at Parc La Fontaine that didn't come together, 3 of 8 (States: EXPIRED).
  v_start := v_tonight - interval '23 hours 30 minutes';
  insert into public.plans (sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count, expired_at, created_at)
  values ('volleyball', 'Volleyball', v_start, 90, c_lf, 8, 'public', v_start - interval '1 hour', 'expired', 'quick',
          c_sam, c_sam, 3, v_start - interval '1 hour', v_start - interval '1 day')
  returning id into v_plan;
  insert into public.plan_members (plan_id, user_id, via) values
    (v_plan, c_sam, 'host'), (v_plan, c_chimdi, 'im_down'), (v_plan, c_yara, 'im_down');

  -- 6. Tonight 7:00: beach volleyball at Parc Jarry, 5 of 8 (States: STILL ON TONIGHT).
  insert into public.plans (sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count, created_at)
  values ('beach_volleyball', 'Beach volleyball', v_tonight - interval '30 minutes', 90, c_jarry, 8, 'public',
          v_tonight - interval '90 minutes', 'forming', 'quick', c_tomi, c_tomi, 5, now() - interval '5 hours')
  returning id into v_plan;
  insert into public.plan_members (plan_id, user_id, via) values
    (v_plan, c_tomi, 'host'), (v_plan, c_ife, 'im_down'), (v_plan, c_maya, 'im_down'),
    (v_plan, c_theo, 'im_down'), (v_plan, c_dayo, 'im_down');

  -- 7. Saturday 10:00: basketball at Parc La Fontaine courts, 5 of 8 (Main "Forming near you").
  insert into public.plans (sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count, created_at)
  values ('basketball', 'Basketball', v_saturday, 90, c_lf, 8, 'public', v_saturday - interval '1 hour', 'forming',
          'quick', c_theo, c_theo, 5, now() - interval '1 day')
  returning id into v_plan;
  insert into public.plan_meeting_points (plan_id, label) values (v_plan, 'Courts by the pond');
  insert into public.plan_members (plan_id, user_id, via) values
    (v_plan, c_theo, 'host'), (v_plan, c_maya, 'im_down'), (v_plan, c_dayo, 'im_down'),
    (v_plan, c_tolu, 'im_down'), (v_plan, c_joel, 'im_down');
end;
$$;
