-- Step 4 (Messaging and feed) sample data, loaded by `supabase db reset` after seed.sql and
-- seed_liquidity.sql ([db.seed] sql_paths). Local only. Never apply to a shared environment.
--
-- Safe to run again at any time against a running local stack, to refresh the time-relative parts
-- (the live game, "Updated 20 s ago", today's chat):
--
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_messaging.sql
--
-- It deletes and recreates only its own rows (fixed ids, its crews and their plans), and rewrites
-- the notifications of the seed people. What it shows (sign in as Chimdi, +1 555 555 0100):
--   * CrewHome / CrewChat: Thursday FC (14 members, Ade owns it, Chimdi is an admin). Today Lena,
--     Ade, Sam and Chimdi talk about Saturday morning instead of a rained-out Thursday; Ojoro noticed
--     the plan (football, Saturday 9:00 / 10:00 / 10:30, Jeanne-Mance Park or the Indoor dome,
--     4 interested). Lena tapped MAKE THIS A GAME: a crew plan with a time poll, 9 votes (5 / 3 / 1).
--     Chimdi hasn't voted.
--   * A second crew, Plateau Runners, with an OPEN suggestion (a run tomorrow evening at Lachine
--     Canal): MAKE THIS A GAME / NOT NOW work on it.
--   * LiveActivity: football at Jeanne-Mance, live now (started 34 min ago), Lights 3–2 Darks logged
--     by Ade 20 s ago, updates (kick-off, scores, HALF TIME, GOAL · MARCUS), Yara's comment, Chimdi
--     playing, Ade hosting, Thursday FC members following, reactions.
--   * Updates (Notifications): Needs you · 3 (basketball needs one more, the Thursday FC poll, the
--     score to confirm), Today (GAME ON for the live game, check-in), Earlier (Recap ready: Lights win
--     5–4, Lena joined Thursday FC). The Call-Out rows of the design are M6 and aren't seeded.

-- Ids ----------------------------------------------------------------------------------------------------
--   c1…01 Thursday FC · c1…02 Plateau Runners · c3…01 live plan · c3…02 live activity
--   c3…11 Thursday FC crew plan (poll) · b0…31 Indoor dome (place)

-- 0. Clean up what this file made before -----------------------------------------------------------------

delete from public.activities
 where plan_id in (select p.id from public.plans p
                    where p.crew_id in ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002')
                       or p.id = 'c3000000-0000-4000-8000-000000000001');
delete from public.plans
 where crew_id in ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002')
    or id = 'c3000000-0000-4000-8000-000000000001';
delete from public.crews
 where id in ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002');

-- 1. A place the chat names ("the indoor place") ----------------------------------------------------

insert into public.places (id, slug, name, area, city, lat, lng, sport_ids, surface, floodlit_until, is_free)
values ('b0000000-0000-4000-8000-000000000031', 'plateau-indoor-dome', 'Indoor dome', 'Plateau', 'Montréal',
        45.5222, -73.5781, '{football}', 'Indoor turf', null, false)
on conflict (id) do nothing;

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
  c_ana constant uuid := 'a0000000-0000-4000-8000-000000000024';
  c_jm constant uuid := 'b0000000-0000-4000-8000-000000000001';
  c_lf constant uuid := 'b0000000-0000-4000-8000-000000000002';
  c_thursday constant uuid := 'c1000000-0000-4000-8000-000000000001';
  c_runners constant uuid := 'c1000000-0000-4000-8000-000000000002';
  c_live_plan constant uuid := 'c3000000-0000-4000-8000-000000000001';
  c_live constant uuid := 'c3000000-0000-4000-8000-000000000002';
  c_crew_plan constant uuid := 'c3000000-0000-4000-8000-000000000011';
  c_tz constant text := 'America/Toronto';
  v_people uuid[];
  v_crew uuid[];
  v_players uuid[];
  v_start timestamptz;
  v_sat date;
  v_opt uuid[];
  v_poll_close timestamptz;
  v_basketball uuid;
  v_after_activity uuid;
  v_last_week_activity uuid;
  v_lena_joined timestamptz;
  v_i integer;
begin
  -- Seed people only (some files may not have run).
  select coalesce(array_agg(p.id), '{}') into v_people from public.profiles p
   where p.id::text like 'a0000000-0000-4000-8000-0000000000%';

  -- 2. Thursday FC: 14 members. Lena joined last Sunday, invited by Ade after her first game. -------
  insert into public.crews (id, name, sport_id, created_by, time_zone, member_count, created_at)
  values (c_thursday, 'Thursday FC', 'football', c_ade, c_tz, 0, now() - interval '120 days');
  v_crew := array[c_ade, c_chimdi, c_marcus, c_sam, c_yara, c_joel, c_tomi, c_tolu, c_ife, c_maya, c_theo,
                  c_dayo, c_ana, c_lena];
  v_lena_joined := ((((now() at time zone c_tz)::date
                      - (extract(isodow from now() at time zone c_tz)::integer % 7)) + time '18:00') at time zone c_tz);
  if v_lena_joined > now() - interval '1 day' then
    v_lena_joined := v_lena_joined - interval '7 days';
  end if;
  insert into public.crew_members (crew_id, user_id, role, via, invited_by, joined_at)
  select c_thursday, u,
         case when u = c_ade then 'owner'::public.crew_role when u = c_chimdi then 'admin'::public.crew_role
              else 'member'::public.crew_role end,
         case when u = c_ade then 'created'::public.crew_join_via else 'added'::public.crew_join_via end,
         case when u = c_ade then null else c_ade end,
         case when u = c_lena then v_lena_joined else now() - interval '120 days' + make_interval(days => i::integer) end
  from unnest(v_crew) with ordinality as x(u, i)
  where u = any (v_people);
  update public.crews set member_count = (select count(*) from public.crew_members m where m.crew_id = c_thursday)
   where id = c_thursday;
  insert into private.crew_invite_codes (crew_id, code, created_by) values (c_thursday, 'THURSDAY', c_ade)
  on conflict (crew_id) do update set code = excluded.code;

  -- Yesterday's chatter (outside the 6-hour window Make This a Game reads).
  insert into public.messages (crew_id, sender_id, body, created_at) values
    (c_thursday, c_marcus, 'Good game last week. Lights again on Thursday?', now() - interval '26 hours'),
    (c_thursday, c_yara, 'I''ll bring the bibs.', now() - interval '25 hours 40 minutes');

  -- Today (CrewChat.png). Lena, Ade, Sam, then Chimdi.
  insert into public.messages (crew_id, sender_id, body, created_at) values
    (c_thursday, c_lena, 'Thursday''s going to be a washout. Anyone up for Saturday morning instead?', now() - interval '16 minutes'),
    (c_thursday, c_ade, 'In, if it''s before 11.', now() - interval '15 minutes'),
    (c_thursday, c_sam, 'Saturday works. Jeanne-Mance or the indoor place?', now() - interval '13 minutes'),
    (c_thursday, c_chimdi, 'Same. Let''s actually lock it this time.', now() - interval '11 minutes');
  -- Ojoro notices the plan (the same detector send_message runs).
  perform private.detect_suggestion(c_thursday);

  -- Lena tapped MAKE THIS A GAME: a crew plan for Saturday 9:00 with a time poll (9:00, 10:00, 10:30).
  v_sat := (now() at time zone c_tz)::date + ((6 - extract(isodow from now() at time zone c_tz)::integer + 7) % 7);
  if ((v_sat + time '09:00') at time zone c_tz) < now() + interval '2 hours' then
    v_sat := v_sat + 7;
  end if;
  v_poll_close := (((now() at time zone c_tz)::date + time '21:00') at time zone c_tz);
  if v_poll_close < now() + interval '30 minutes' then
    v_poll_close := now() + interval '3 hours';
  end if;
  insert into public.plans (id, sport_id, starts_at, duration_minutes, place_id, capacity, audience, crew_id,
                            deadline_at, poll_closes_at, status, source, created_by, host_id, member_count, created_at)
  values (c_crew_plan, 'football', (v_sat + time '09:00') at time zone c_tz, 90, null, 10, 'crew', c_thursday,
          ((v_sat + time '09:00') at time zone c_tz) - interval '1 hour', v_poll_close, 'forming', 'chat',
          c_lena, c_lena, 1, now() - interval '6 minutes');
  insert into public.plan_members (plan_id, user_id, via, joined_at) values (c_crew_plan, c_lena, 'host', now() - interval '6 minutes');
  with o as (
    insert into public.plan_time_options (plan_id, starts_at, vote_count, created_by)
    select c_crew_plan, (v_sat + t) at time zone c_tz, n, c_lena
    from (values (time '09:00', 5), (time '10:00', 3), (time '10:30', 1)) v(t, n)
    returning id, starts_at
  )
  select array_agg(o.id order by o.starts_at) into v_opt from o;
  -- 9 votes, none from Chimdi.
  insert into public.plan_time_votes (plan_id, user_id, option_id)
  select c_crew_plan, u, case when i <= 5 then v_opt[1] when i <= 8 then v_opt[2] else v_opt[3] end
  from unnest(array[c_lena, c_ade, c_sam, c_yara, c_joel, c_marcus, c_tolu, c_ife, c_theo]) with ordinality as x(u, i);
  update public.chat_suggestions
     set status = 'accepted', plan_id = c_crew_plan, accepted_by = c_lena, accepted_at = now() - interval '6 minutes'
   where crew_id = c_thursday and status = 'open';
  insert into public.messages (crew_id, sender_id, kind, body, payload, created_at)
  values (c_thursday, c_lena, 'system', 'Lena R tapped MAKE THIS A GAME',
          jsonb_build_object('event', 'make_this_a_game', 'plan_id', c_crew_plan,
                             'suggestion_id', (select s.id from public.chat_suggestions s where s.plan_id = c_crew_plan)),
          now() - interval '6 minutes');

  -- 3. Plateau Runners: an open suggestion (a run tomorrow evening) to try MAKE THIS A GAME on. ------
  insert into public.crews (id, name, sport_id, created_by, time_zone, member_count, created_at)
  values (c_runners, 'Plateau Runners', 'running', c_marcus, c_tz, 0, now() - interval '40 days');
  insert into public.crew_members (crew_id, user_id, role, via, invited_by, joined_at)
  select c_runners, u, case when u = c_marcus then 'owner'::public.crew_role else 'member'::public.crew_role end,
         case when u = c_marcus then 'created'::public.crew_join_via else 'added'::public.crew_join_via end,
         case when u = c_marcus then null else c_marcus end, now() - interval '40 days'
  from unnest(array[c_marcus, c_chimdi, c_ade, c_lena]) u where u = any (v_people);
  update public.crews set member_count = (select count(*) from public.crew_members m where m.crew_id = c_runners)
   where id = c_runners;
  insert into public.messages (crew_id, sender_id, body, created_at) values
    (c_runners, c_marcus, 'Anyone up for a run tomorrow evening?', now() - interval '50 minutes'),
    (c_runners, c_lena, 'I''m in. 6:30?', now() - interval '45 minutes'),
    (c_runners, c_ade, 'Down. Lachine Canal again?', now() - interval '40 minutes');
  perform private.detect_suggestion(c_runners);

  -- 4. The live game: football at Jeanne-Mance, started 34 min ago, Lights 3–2. -----------------------
  v_start := now() - interval '34 minutes 12 seconds';
  v_players := array[c_ade, c_chimdi, c_marcus, c_joel, c_sam, c_yara, c_tolu, c_dayo];
  insert into public.plans (id, sport_id, title, starts_at, duration_minutes, place_id, capacity, audience,
                            deadline_at, status, source, created_by, host_id, member_count, level_label,
                            team_a_label, team_b_label, teams_note, kit_note, locked_at, created_at)
  values (c_live_plan, 'football', 'Pickup football', v_start, 90, c_jm, 8, 'public', v_start - interval '1 hour',
          'game_on', 'quick', c_ade, c_ade, 8, 'Mixed level', 'Lights', 'Darks',
          'Lights vs Darks. Bring both shirts.', 'Ball and bibs: Ade. Turf boots.', v_start - interval '3 hours',
          v_start - interval '1 day');
  insert into public.plan_meeting_points (plan_id, label, lat, lng)
  values (c_live_plan, 'North pitch, by the lights', 45.5190, -73.5880);
  insert into public.plan_members (plan_id, user_id, via, joined_at)
  select c_live_plan, u, case when u = c_ade then 'host'::public.member_via else 'im_down'::public.member_via end,
         v_start - interval '1 day'
  from unnest(v_players) u;
  insert into public.activities (id, plan_id, sport_id, title, starts_at, ends_at, place_id, capacity, host_id,
                                 confirmed_count, checked_in_count, level_label, team_a_label, team_b_label,
                                 teams_note, kit_note, attendance_rule, check_in_opens_at, check_in_closes_at,
                                 status, live_at, after_closes_at, created_at)
  values (c_live, c_live_plan, 'football', 'Pickup football', v_start, v_start + interval '90 minutes', c_jm, 8, c_ade,
          8, 8, 'Mixed level', 'Lights', 'Darks', 'Lights vs Darks. Bring both shirts.',
          'Ball and bibs: Ade. Turf boots.', 'check_in_host_confirms', v_start - interval '30 minutes',
          v_start + interval '90 minutes', 'live', v_start, v_start + interval '90 minutes' + interval '24 hours',
          v_start - interval '3 hours');
  insert into public.attendance (activity_id, user_id, status, team, confirmed_at, checked_in_at, check_in_method)
  select c_live, u, 'checked_in', case when i % 2 = 1 then 'a'::public.team_side else 'b'::public.team_side end,
         v_start - interval '3 hours', v_start - interval '20 minutes' + make_interval(mins => i::integer * 2), 'host'
  from unnest(v_players) with ordinality as x(u, i);

  insert into public.activity_updates (activity_id, author_id, kind, audience, body, team_a_score, team_b_score, created_at) values
    (c_live, null, 'check_in', 'participants', 'Chimdi O checked in.', null, null, v_start - interval '16 minutes'),
    (c_live, null, 'kick_off', 'everyone', 'KICK-OFF.', null, null, v_start),
    (c_live, c_ade, 'score', 'everyone', 'LIGHTS LEAD 1–0.', 1, 0, v_start + interval '6 minutes'),
    (c_live, c_ade, 'score', 'everyone', 'LEVEL 1–1.', 1, 1, v_start + interval '11 minutes'),
    (c_live, c_ade, 'score', 'everyone', 'DARKS LEAD 2–1.', 1, 2, v_start + interval '17 minutes'),
    (c_live, c_ade, 'score', 'everyone', 'LEVEL 2–2.', 2, 2, v_start + interval '22 minutes'),
    (c_live, c_ade, 'post', 'everyone', 'HALF TIME. 2-2.', null, null, v_start + interval '25 minutes'),
    (c_live, c_ade, 'score', 'everyone', 'LIGHTS LEAD 3–2.', 3, 2, now() - interval '21 seconds'),
    (c_live, c_ade, 'post', 'everyone', 'GOAL · MARCUS. LIGHTS LEAD 3-2.', null, null, now() - interval '20 seconds'),
    (c_live, c_yara, 'post', 'everyone', 'Darks need one more. Joel is everywhere.', null, null, now() - interval '1 minute');
  insert into public.activity_live (activity_id, team_a_score, team_b_score, score_logged_by, score_updated_at, last_update_at)
  values (c_live, 3, 2, c_ade, now() - interval '20 seconds', now() - interval '20 seconds')
  on conflict (activity_id) do update
    set team_a_score = 3, team_b_score = 2, score_logged_by = c_ade,
        score_updated_at = now() - interval '20 seconds', last_update_at = now() - interval '20 seconds';

  -- Followers: Thursday FC members who aren't playing.
  insert into public.activity_followers (activity_id, user_id)
  select c_live, u from unnest(array[c_lena, c_ife, c_tomi, c_maya, c_theo, c_ana]) u where u = any (v_people);
  -- Game reactions (one each): LET'S GO from Chimdi and 8 more, RESPECT 4, HOLD THAT 2 (as available).
  insert into public.activity_reactions (activity_id, update_id, user_id, reaction)
  select c_live, null, u,
         case when i <= 9 then 'lets_go'::public.reaction_word when i <= 13 then 'respect'::public.reaction_word
              else 'hold_that'::public.reaction_word end
  from unnest(array[c_chimdi, c_lena, c_ife, c_tomi, c_maya, c_theo, c_ana, c_marcus, c_sam,
                    c_joel, c_tolu, c_dayo, c_yara, c_ade]) with ordinality as x(u, i)
  where u = any (v_people);
  update public.activity_live
     set follower_count = (select count(*) from public.activity_followers f where f.activity_id = c_live),
         reaction_counts = private.reaction_counts(c_live, null)
   where activity_id = c_live;
  -- RESPECT on Yara's comment.
  insert into public.activity_reactions (activity_id, update_id, user_id, reaction)
  select c_live, u.id, r, 'respect' from public.activity_updates u, unnest(array[c_ade, c_marcus]) r
   where u.activity_id = c_live and u.author_id = c_yara;
  update public.activity_updates u set reaction_counts = private.reaction_counts(c_live, u.id)
   where u.activity_id = c_live and u.author_id = c_yara;

  -- Activity chat (people in the game only).
  insert into public.messages (activity_id, sender_id, body, created_at) values
    (c_live, c_ade, 'Teams are on the board. Lights in white.', v_start - interval '25 minutes'),
    (c_live, c_marcus, 'Two minutes away.', v_start - interval '22 minutes');

  -- 5. Basketball needs one more (Notifications): the Saturday game at Parc La Fontaine goes to 7 of 8
  --    (Main.png's sample shows 5 of 8; Notifications.png's 7 of 8 wins for Step 4).
  select p.id into v_basketball from public.plans p
   where p.sport_id = 'basketball' and p.host_id = c_theo and p.status = 'forming' order by p.created_at limit 1;
  if v_basketball is not null then
    insert into public.plan_members (plan_id, user_id, via)
    select v_basketball, u, 'im_down' from unnest(array[c_tomi, c_ife]) u where u = any (v_people)
    on conflict do nothing;
    update public.plans set member_count = (select count(*) from public.plan_members m where m.plan_id = v_basketball)
     where id = v_basketball;
  end if;
  insert into public.pull_me_in (user_id, sport_id, scope) values (c_chimdi, 'basketball', 'nearby')
  on conflict (user_id, sport_id) do nothing;

  -- 6. Notifications: rewrite the seed people's (triggers above made some; replace them). -----------
  delete from public.notifications where recipient_id = any (v_people);

  select a.id into v_after_activity from public.activities a
   where a.status = 'after' and a.host_id = c_ade and a.id <> c_live order by a.starts_at desc limit 1;
  select a.id into v_last_week_activity from public.activities a
   join public.recaps r on r.activity_id = a.id
   where a.host_id = c_ade and r.team_a_score = 5 and r.team_b_score = 4 and a.status = 'complete'
   order by a.starts_at desc limit 1;

  -- Needs you.
  if v_basketball is not null then
    insert into public.notifications (recipient_id, type, object_kind, object_id, plan_id, bundle_key, data,
                                      created_at, updated_at)
    values (c_chimdi, 'need_one_more', 'plan', v_basketball, v_basketball, 'need_one_more:' || v_basketball,
            '{"pull_me_in": true}', now() - interval '4 minutes', now() - interval '4 minutes');
  end if;
  insert into public.notifications (recipient_id, type, object_kind, object_id, plan_id, crew_id, actor_ids,
                                    actor_count, bundle_key, created_at, updated_at)
  values (c_chimdi, 'crew_poll', 'plan', c_crew_plan, c_crew_plan, c_thursday, array[c_lena], 1,
          'crew_plan:' || c_crew_plan, now() - interval '6 minutes', now() - interval '6 minutes');
  if v_after_activity is not null then
    insert into public.notifications (recipient_id, type, object_kind, object_id, activity_id, plan_id, actor_ids,
                                      actor_count, bundle_key, created_at, updated_at)
    select c_chimdi, 'result_to_confirm', 'activity', a.id, a.id, a.plan_id, array[c_ade], 1, 'result:' || a.id,
           now() - interval '95 minutes', now() - interval '95 minutes'
    from public.activities a where a.id = v_after_activity;
  end if;
  -- The same poll for the rest of the crew who haven't voted, and the live game for its followers.
  insert into public.notifications (recipient_id, type, object_kind, object_id, plan_id, crew_id, actor_ids,
                                    actor_count, bundle_key, created_at, updated_at)
  select m.user_id, 'crew_poll', 'plan', c_crew_plan, c_crew_plan, c_thursday, array[c_lena], 1,
         'crew_plan:' || c_crew_plan, now() - interval '6 minutes', now() - interval '6 minutes'
  from public.crew_members m
  where m.crew_id = c_thursday and m.user_id not in (c_chimdi, c_lena);
  insert into public.notifications (recipient_id, type, object_kind, object_id, activity_id, plan_id, bundle_key,
                                    created_at, updated_at)
  select f.user_id, 'live', 'activity', c_live, c_live, c_live_plan, 'live:' || c_live, v_start, v_start
  from public.activity_followers f where f.activity_id = c_live;

  -- Today.
  insert into public.notifications (recipient_id, type, object_kind, object_id, plan_id, bundle_key,
                                    created_at, updated_at, read_at)
  values (c_chimdi, 'game_on', 'plan', c_live_plan, c_live_plan, 'game_on:' || c_live_plan,
          v_start - interval '3 hours', v_start - interval '3 hours', v_start - interval '2 hours');
  insert into public.notifications (recipient_id, type, object_kind, object_id, activity_id, plan_id, bundle_key,
                                    created_at, updated_at, read_at)
  values (c_chimdi, 'check_in_open', 'activity', c_live, c_live, c_live_plan, 'check_in:' || c_live,
          v_start - interval '45 minutes', v_start - interval '45 minutes', v_start - interval '20 minutes');

  -- Earlier.
  if v_last_week_activity is not null then
    insert into public.notifications (recipient_id, type, object_kind, object_id, activity_id, plan_id, bundle_key,
                                      created_at, updated_at, read_at)
    select c_chimdi, 'recap_ready', 'activity', a.id, a.id, a.plan_id, 'recap:' || a.id,
           now() - interval '1 day', now() - interval '1 day', now() - interval '1 day'
    from public.activities a where a.id = v_last_week_activity;
  end if;
  insert into public.notifications (recipient_id, type, object_kind, object_id, crew_id, actor_ids, actor_count,
                                    bundle_key, data, created_at, updated_at, read_at)
  values (c_chimdi, 'crew_member_joined', 'crew', c_thursday, c_thursday, array[c_lena], 1,
          'crew_joined:' || c_thursday, jsonb_build_object('invited_by', c_ade),
          v_lena_joined, v_lena_joined, v_lena_joined + interval '1 hour');
end;
$$;
