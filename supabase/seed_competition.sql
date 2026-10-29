-- Step 5 (Competition) sample data, loaded by `supabase db reset` after seed.sql, seed_liquidity.sql
-- and seed_messaging.sql ([db.seed] sql_paths). Local only. Never apply to a shared environment.
--
-- Safe to run again at any time against a running local stack, to refresh the time-relative parts
-- (countdowns, "Updated 8 s ago", the live clock):
--
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_competition.sql
--
-- It deletes and recreates only its own rows (fixed ids starting d0/d1/d2/d3, the Plateau Crew and
-- the crowd accounts' activity). Sample content from the designs (docs/COMPETITION_CONTRACT.md §Local
-- data). Sign in as Chimdi (+1 555 555 0100):
--   * Compete: INCOMING CALL-OUT from Marcus (5K · Mount Royal loop · Sat 9:00, 2 h ago, REPLY); YOUR
--     EVENTS (Chimdi vs Marcus at every stage, Thursday FC vs Plateau Crew ACCEPTED, Ife vs Sam
--     sparring LIVE that you follow); RIVALRIES: Chimdi 5 / Marcus 3 over 9 meetings.
--   * CallOut           d1000000-0000-4000-8000-000000000001  Marcus called you out (PENDING)
--   * EventBuildup      d2000000-0000-4000-8000-000000000001  3 days out, 142 following, 48% / 52%,
--                       78 / 64 backing (6 of your crew back you), "Anyone under 23 minutes?", posts,
--                       THE CROWD · 38. Poster: same event.
--   * Crew vs crew      d2000000-0000-4000-8000-000000000002  Thursday FC vs Plateau Crew, ACCEPTED
--   * Sparring (live)   d2000000-0000-4000-8000-000000000003  Ife vs Sam, round 2 of 3, you follow
--   * EventToday        d2000000-0000-4000-8000-000000000004  ALMOST TIME, both checked in, 212 predictions
--   * EventLive         d2000000-0000-4000-8000-000000000005  16:42 in, 3.4 vs 3.1 km, 212 watching
--   * Verifying         d2000000-0000-4000-8000-000000000006  22:48 vs 23:31 submitted by Marcus, yours waiting
--   * Result            d2000000-0000-4000-8000-000000000007  CHIMDI WINS, the crowd got it wrong (54% Marcus)
--   * Rivalry           d0000000-0000-4000-8000-000000000001  9 meetings, 5–3–1, Marcus asked for a rematch
--                       (call-out d1000000-0000-4000-8000-000000000008)
-- The stages are separate events between the same two people so every screen has data at once.
-- 220 "crowd" accounts (no sign-in) make the counts real rows (predictions, backing, followers, cheers).

-- 0. Clean up what this file made before -----------------------------------------------------------------

begin;
set local ojoro.seed_reset = 'on';
delete from public.notifications
 where object_id::text like 'd1000000-%' or object_id::text like 'd2000000-%' or object_id::text like 'd3000000-%';
update public.call_outs set event_id = null, rematch_of_event_id = null
 where id::text like 'd1000000-%' or id::text like 'd4000000-%';
delete from public.challenge_events where id::text like 'd2000000-%' or id::text like 'd3000000-%';
delete from public.call_outs where id::text like 'd1000000-%' or id::text like 'd4000000-%';
delete from public.rivalries where id::text like 'd0000000-%';
delete from public.crews where id = 'c1000000-0000-4000-8000-000000000051';
commit;

-- 1. A place and the crowd -----------------------------------------------------------------------------

insert into public.places (id, slug, name, area, city, lat, lng, sport_ids, surface, floodlit_until, is_free)
values ('b0000000-0000-4000-8000-000000000041', 'mount-royal-loop', 'Mount Royal loop', 'Plateau', 'Montréal',
        45.5048, -73.5877, '{running,cycling}', 'Gravel · 5 km loop', null, true)
on conflict (id) do nothing;

create function pg_temp.crowd(n integer) returns uuid language sql immutable
as $$ select ('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into auth.users (
  instance_id, id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, phone_change,
  phone_change_token, email_change_token_current, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000', pg_temp.crowd(n), 'authenticated', 'authenticated',
       '{"provider":"phone","providers":["phone"]}',
       jsonb_build_object('display_name',
         (array['Amara', 'Bruno', 'Chloé', 'Dami', 'Elif', 'Femi', 'Gabe', 'Hana', 'Idris', 'Jade', 'Kemi', 'Luc',
                'Mina', 'Noah', 'Ola', 'Priya', 'Quinn', 'Rémi', 'Sade', 'Tariq'])[1 + (n - 1) % 20]
         || ' ' || substr('ABCDEFGHJKLMNPRSTVWY', 1 + ((n - 1) / 20) % 20, 1)),
       now() - interval '90 days', now(), '', '', '', '', '', '', '', ''
from generate_series(1, 220) n
on conflict (id) do nothing;
update public.profiles set onboarding_completed_at = coalesce(onboarding_completed_at, now() - interval '80 days')
 where id::text like 'e0000000-%';

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
  c_theo constant uuid := 'a0000000-0000-4000-8000-000000000012';
  c_jm constant uuid := 'b0000000-0000-4000-8000-000000000001';
  c_lachine constant uuid := 'b0000000-0000-4000-8000-000000000004';
  c_hoshino constant uuid := 'b0000000-0000-4000-8000-000000000005';
  c_mr constant uuid := 'b0000000-0000-4000-8000-000000000041';
  c_thursday constant uuid := 'c1000000-0000-4000-8000-000000000001';
  c_plateau constant uuid := 'c1000000-0000-4000-8000-000000000051';
  c_tz constant text := 'America/Toronto';
  c_course constant text := 'Mount Royal loop, 5.0 km, from the Cartier monument';
  r_cm constant uuid := 'd0000000-0000-4000-8000-000000000001';
  r_crews constant uuid := 'd0000000-0000-4000-8000-000000000002';
  r_is constant uuid := 'd0000000-0000-4000-8000-000000000003';
  v_today date := (now() at time zone c_tz)::date;
  v_sat timestamptz;
  v_start timestamptz;
  v_yday timestamptz;
  v_e uuid;
  v_co uuid;
  v_i integer;
  v_hist record;
  v_ade_comment uuid;
  v_sub uuid;
begin
  if not exists (select 1 from public.profiles where id = c_chimdi) then
    raise notice 'seed.sql has not run: skipping the competition seed';
    return;
  end if;
  v_sat := ((v_today + 4) + time '09:00') at time zone c_tz;
  v_yday := ((v_today - 1) + time '09:00') at time zone c_tz;

  -- Plateau Crew (Theo owns it), for crew vs crew.
  insert into public.crews (id, name, sport_id, created_by, time_zone, member_count, created_at)
  values (c_plateau, 'Plateau Crew', 'football', c_theo, c_tz, 0, now() - interval '60 days');
  insert into public.crew_members (crew_id, user_id, role, via, joined_at)
  values (c_plateau, c_theo, 'owner', 'created', now() - interval '60 days');
  insert into public.crew_members (crew_id, user_id, role, via, invited_by, joined_at)
  select c_plateau, pg_temp.crowd(n), 'member', 'added', c_theo, now() - interval '50 days' from generate_series(201, 210) n;
  update public.crews set member_count = 11 where id = c_plateau;

  -- Rivalries (ids fixed; low/high in canonical order).
  insert into public.rivalries (id, kind, low_id, high_id, created_at) values
    (r_cm, 'people', least(c_chimdi, c_marcus), greatest(c_chimdi, c_marcus), now() - interval '300 days'),
    (r_crews, 'crews', least(c_thursday, c_plateau), greatest(c_thursday, c_plateau), now() - interval '2 hours'),
    (r_is, 'people', least(c_ife, c_sam), greatest(c_ife, c_sam), now() - interval '3 days');

  -- History: 8 earlier meetings, oldest first. Winners from Chimdi's side: C M C C M C = M; then the
  -- Result event (C) makes 9 meetings, 5–3–1. Recent: 10K Lachine Canal (Marcus by 1:02), 1v1 football
  -- at Jeanne-Mance (3–3).
  for v_hist in
    select * from (values
      (1, 'running', '5K', 'time'::public.challenge_scoring, 5.0, 'km', c_mr, 225, c_chimdi, 1402.0, 1431.0),
      (2, 'running', '5K', 'time', 5.0, 'km', c_mr, 196, c_marcus, 1390.0, 1412.0),
      (3, 'running', '10K', 'time', 10.0, 'km', c_lachine, 168, c_chimdi, 2805.0, 2840.0),
      (4, 'running', '5K', 'time', 5.0, 'km', c_mr, 140, c_marcus, 1420.0, 1398.0),
      (5, 'running', '5K', 'time', 5.0, 'km', c_mr, 112, c_chimdi, 1440.0, 1405.0),
      (6, 'running', '5K', 'time', 5.0, 'km', c_mr, 84, c_marcus, 1396.0, 1385.0),
      (7, 'football', '1v1 football', 'score', null, 'goals', c_jm, 42, c_chimdi, 3.0, 3.0),
      (8, 'running', '10K', 'time', 10.0, 'km', c_lachine, 28, c_marcus, 2700.0, 2762.0)
    ) h(n, sport, title, scoring, target, unit, place, days_ago, challenger, a_val, b_val)
  loop
    v_co := ('d4000000-0000-4000-8000-' || lpad(v_hist.n::text, 12, '0'))::uuid;
    v_e := ('d3000000-0000-4000-8000-' || lpad(v_hist.n::text, 12, '0'))::uuid;
    insert into public.call_outs (id, format, sport_id, title, scoring, target, unit, place_id, starts_at, time_zone,
                                  challenger_id, opponent_id, status, expires_at, responded_at, responded_by,
                                  rivalry_id, created_at)
    values (v_co, 'person_vs_person', v_hist.sport, v_hist.title, v_hist.scoring, v_hist.target, v_hist.unit, v_hist.place,
            v_yday - make_interval(days => v_hist.days_ago), c_tz, v_hist.challenger,
            case when v_hist.challenger = c_chimdi then c_marcus else c_chimdi end, 'accepted',
            v_yday - make_interval(days => v_hist.days_ago + 1), v_yday - make_interval(days => v_hist.days_ago + 5),
            case when v_hist.challenger = c_chimdi then c_marcus else c_chimdi end, r_cm,
            v_yday - make_interval(days => v_hist.days_ago + 6));
    insert into public.challenge_events (id, call_out_id, format, sport_id, title, scoring, target, unit, place_id,
      starts_at, time_zone, audience, verification, side_size, rivalry_id, a_user_id, b_user_id, a_captain_id, b_captain_id,
      accepted_at, check_in_opens_at, status, live_at, ended_at, completed_at, follower_count)
    values (v_e, v_co, 'person_vs_person', v_hist.sport, v_hist.title, v_hist.scoring, v_hist.target, v_hist.unit, v_hist.place,
      v_yday - make_interval(days => v_hist.days_ago), c_tz, 'public', 'participant_confirmation', 1, r_cm,
      v_hist.challenger, case when v_hist.challenger = c_chimdi then c_marcus else c_chimdi end,
      v_hist.challenger, case when v_hist.challenger = c_chimdi then c_marcus else c_chimdi end,
      v_yday - make_interval(days => v_hist.days_ago + 5), v_yday - make_interval(days => v_hist.days_ago) - interval '1 hour',
      'complete', v_yday - make_interval(days => v_hist.days_ago),
      v_yday - make_interval(days => v_hist.days_ago) + interval '40 minutes',
      v_yday - make_interval(days => v_hist.days_ago) + interval '2 hours', 40 + v_hist.n * 10);
    update public.call_outs set event_id = v_e where id = v_co;
    insert into public.challenge_competitors (event_id, user_id, side, is_captain, checked_in_at, ready_at)
    values (v_e, v_hist.challenger, 'a', true, null, null),
           (v_e, case when v_hist.challenger = c_chimdi then c_marcus else c_chimdi end, 'b', true, null, null);
    insert into public.challenge_results (event_id, rivalry_id, a_value, b_value, winner_side, margin, source,
                                          predicted_a, predicted_b, crowd_called_it, watched_count, verified_at)
    values (v_e, r_cm, v_hist.a_val, v_hist.b_val,
            case when v_hist.a_val = v_hist.b_val then null
                 when v_hist.scoring = 'time' then case when v_hist.a_val < v_hist.b_val then 'a'::public.team_side else 'b'::public.team_side end
                 else case when v_hist.a_val > v_hist.b_val then 'a'::public.team_side else 'b'::public.team_side end end,
            abs(v_hist.a_val - v_hist.b_val), 'participant_confirmation', 0, 0, null, 40 + v_hist.n * 10,
            v_yday - make_interval(days => v_hist.days_ago) + interval '2 hours');
  end loop;

  -- A helper shape for the five Chimdi vs Marcus 5K events: Marcus called Chimdi out (side a = Marcus).
  for v_i in 1..7 loop
    continue when v_i in (2, 3);
    v_co := ('d1000000-0000-4000-8000-' || lpad((v_i + 10)::text, 12, '0'))::uuid;
    v_e := ('d2000000-0000-4000-8000-' || lpad(v_i::text, 12, '0'))::uuid;
    v_start := case v_i when 1 then v_sat
                        when 4 then now() + interval '26 minutes'
                        when 5 then now() - interval '16 minutes 42 seconds'
                        when 6 then now() - interval '41 minutes'
                        else v_yday end;
    insert into public.call_outs (id, format, sport_id, title, scoring, target, unit, place_id, course_note, starts_at,
                                  time_zone, message, challenger_id, opponent_id, status, expires_at, responded_at,
                                  responded_by, rivalry_id, created_at)
    values (v_co, 'person_vs_person', 'running', '5K', 'time', 5, 'km', c_mr, c_course, v_start,
            c_tz, 'Saturday. Mount Royal. Bring your legs.', c_marcus, c_chimdi, 'accepted',
            least(now() - interval '1 day', v_start - interval '2 days'), now() - interval '2 days', c_chimdi, r_cm,
            least(now() - interval '3 days', v_start - interval '7 days'));
    insert into public.challenge_events (id, call_out_id, format, sport_id, title, scoring, target, unit, place_id,
      course_note, starts_at, time_zone, audience, verification, side_size, rivalry_id, a_user_id, b_user_id,
      a_captain_id, b_captain_id, accepted_at, check_in_opens_at)
    select v_e, v_co, 'person_vs_person', 'running', '5K', 'time', 5, 'km', c_mr, c_course, o.starts_at, c_tz, 'public',
           'participant_confirmation', 1, r_cm, c_marcus, c_chimdi, c_marcus, c_chimdi, now() - interval '2 days',
           o.starts_at - interval '60 minutes'
    from public.call_outs o where o.id = v_co;
    update public.call_outs set event_id = v_e where id = v_co;
    insert into public.challenge_competitors (event_id, user_id, side, is_captain)
    values (v_e, c_marcus, 'a', true), (v_e, c_chimdi, 'b', true);
    insert into public.challenge_posts (event_id, kind, body, milestone, created_at)
    values (v_e, 'system', 'THE CHALLENGE IS SET.', 'set', now() - interval '2 days');
  end loop;

  -- Event 1 (EventBuildup, days): 142 following (Chimdi + 141), WHO TAKES IT? 48% Chimdi / 52% Marcus
  -- (100 predictions), THE CROWD 78 back Chimdi (6 from Thursday FC) / 64 back Marcus.
  v_e := 'd2000000-0000-4000-8000-000000000001';
  insert into public.challenge_followers (event_id, user_id, created_at)
  select v_e, pg_temp.crowd(n), now() - interval '1 day' from generate_series(1, 141) n
  union all select v_e, c_chimdi, now() - interval '2 days';
  insert into public.challenge_predictions (event_id, user_id, side)
  select v_e, pg_temp.crowd(n), case when n <= 47 then 'b'::public.team_side else 'a'::public.team_side end
  from generate_series(1, 98) n
  union all values (v_e, c_chimdi, 'b'::public.team_side), (v_e, c_marcus, 'a'::public.team_side);
  insert into public.challenge_backings (event_id, user_id, side)
  select v_e, pg_temp.crowd(n), case when n <= 71 then 'b'::public.team_side else 'a'::public.team_side end
  from generate_series(1, 134) n
  union all select v_e, u, 'b'::public.team_side from unnest(array[c_chimdi, c_ade, c_lena, c_sam, c_yara, c_joel, c_tomi]) u
  union all values (v_e, c_marcus, 'a'::public.team_side);
  insert into public.challenge_organizers (event_id, user_id, proposed_by, proposed_side, approved_at, created_at)
  values (v_e, c_ade, c_chimdi, 'b', now() - interval '1 day', now() - interval '2 days');
  insert into public.challenge_posts (event_id, author_id, kind, body, stats, milestone, created_at) values
    (v_e, c_chimdi, 'statement', 'Rain or not, Saturday I run it.', null, null, now() - interval '1 day'),
    (v_e, c_ade, 'logistics', 'Start is at the Cartier monument. Bring a layer, it''s cold at 9.', null, null,
     now() - interval '5 hours'),
    (v_e, c_marcus, 'training', 'Last tempo run before Saturday.', '{"distance_km": 5.2, "time_seconds": 1428}', null,
     now() - interval '3 hours'),
    (v_e, null, 'system', 'THE CROWD IS CHANGING ITS MIND.', null, 'crowd_shift', now() - interval '1 hour');
  insert into public.challenge_polls (event_id, template, question, options, vote_counts, threshold, created_by, closes_at)
  values (v_e, 'performance', 'Anyone under 23 minutes?', array['Yes, at least one', 'Neither'], array[0, 0], 1380,
          c_marcus, v_sat);
  -- THE CROWD · 38: Ade's comment with 3 replies (Marcus among them), and 34 more.
  insert into public.challenge_comments (event_id, author_id, body, respect_count, reply_count, created_at)
  values (v_e, c_ade, 'Chimdi''s been out on Mount Royal every morning. Just saying.', 14, 3, now() - interval '12 minutes')
  returning id into v_ade_comment;
  insert into public.challenge_comments (event_id, parent_id, author_id, body, respect_count, created_at) values
    (v_e, v_ade_comment, c_marcus, 'Mornings don''t win races.', 31, now() - interval '8 minutes'),
    (v_e, v_ade_comment, pg_temp.crowd(3), 'Saturday will tell.', 2, now() - interval '6 minutes'),
    (v_e, v_ade_comment, c_lena, 'I''ll be at the top of the climb.', 5, now() - interval '4 minutes');
  insert into public.challenge_comment_respects (comment_id, user_id)
  select v_ade_comment, pg_temp.crowd(n) from generate_series(1, 13) n union all select v_ade_comment, c_chimdi;
  insert into public.challenge_comments (event_id, author_id, body, respect_count, created_at)
  select v_e, pg_temp.crowd(100 + n),
         (array['See you at the monument.', 'Marcus by a minute.', 'Chimdi has the legs for the climb.',
                'Bringing the whole crew.', 'Who''s pacing who?', 'This one''s close.'])[1 + n % 6],
         n % 4, now() - make_interval(hours => n)
  from generate_series(1, 34) n;
  insert into public.challenge_reactions (event_id, user_id, reaction)
  select v_e, pg_temp.crowd(n), 'lets_go' from generate_series(1, 20) n;

  -- Event 2 (crew vs crew, accepted 2 h ago): Thursday FC vs Plateau Crew, Sunday, 5 a side.
  v_co := 'd1000000-0000-4000-8000-000000000012';
  v_e := 'd2000000-0000-4000-8000-000000000002';
  insert into public.call_outs (id, format, sport_id, title, scoring, unit, place_id, starts_at, time_zone, message,
                                side_size, challenger_id, challenger_crew_id, opponent_crew_id, status, expires_at,
                                responded_at, responded_by, rivalry_id, created_at)
  values (v_co, 'crew_vs_crew', 'football', '5 a side', 'score', 'goals', c_jm, ((v_today + 5) + time '10:00') at time zone c_tz,
          c_tz, 'Sunday at Jeanne-Mance. Five of yours, five of ours.', 5, c_ade, c_thursday, c_plateau, 'accepted',
          now() + interval '1 day', now() - interval '2 hours', c_theo, r_crews, now() - interval '1 day');
  insert into public.challenge_events (id, call_out_id, format, sport_id, title, scoring, unit, place_id, starts_at,
    time_zone, audience, verification, side_size, rivalry_id, a_crew_id, b_crew_id, a_captain_id, b_captain_id,
    accepted_at, check_in_opens_at)
  values (v_e, v_co, 'crew_vs_crew', 'football', '5 a side', 'score', 'goals', c_jm,
          ((v_today + 5) + time '10:00') at time zone c_tz, c_tz, 'public', 'participant_confirmation', 5, r_crews,
          c_thursday, c_plateau, c_ade, c_theo, now() - interval '2 hours',
          ((v_today + 5) + time '09:00') at time zone c_tz);
  update public.call_outs set event_id = v_e where id = v_co;
  insert into public.challenge_competitors (event_id, user_id, side, is_captain)
  values (v_e, c_ade, 'a', true), (v_e, c_chimdi, 'a', false), (v_e, c_theo, 'b', true),
         (v_e, pg_temp.crowd(201), 'b', false);
  insert into public.challenge_posts (event_id, kind, body, milestone, created_at)
  values (v_e, 'system', 'THE CHALLENGE IS SET.', 'set', now() - interval '2 hours');
  insert into public.challenge_followers (event_id, user_id)
  select v_e, pg_temp.crowd(n) from generate_series(150, 175) n;

  -- Event 3 (live): Ife vs Sam, sparring, round 2 of 3. Chimdi follows.
  v_co := 'd1000000-0000-4000-8000-000000000013';
  v_e := 'd2000000-0000-4000-8000-000000000003';
  insert into public.call_outs (id, format, sport_id, title, scoring, target, unit, place_id, starts_at, time_zone,
                                challenger_id, opponent_id, status, expires_at, responded_at, responded_by, rivalry_id,
                                created_at)
  values (v_co, 'person_vs_person', 'boxing', 'Sparring', 'rounds', 3, 'rounds', c_hoshino, now() - interval '9 minutes',
          c_tz, c_ife, c_sam, 'accepted', now() - interval '1 day', now() - interval '3 days', c_sam, r_is,
          now() - interval '4 days');
  insert into public.challenge_events (id, call_out_id, format, sport_id, title, scoring, target, unit, place_id, starts_at,
    time_zone, audience, verification, side_size, rivalry_id, a_user_id, b_user_id, a_captain_id, b_captain_id,
    accepted_at, check_in_opens_at, status, live_at, a_progress, b_progress, live_period, progress_updated_at,
    progress_logged_by)
  values (v_e, v_co, 'person_vs_person', 'boxing', 'Sparring', 'rounds', 3, 'rounds', c_hoshino,
          now() - interval '9 minutes', c_tz, 'public', 'participant_confirmation', 1, r_is, c_ife, c_sam, c_ife, c_sam,
          now() - interval '3 days', now() - interval '69 minutes', 'live', now() - interval '7 minutes', 1, 0, 2,
          now() - interval '40 seconds', c_ife);
  update public.call_outs set event_id = v_e where id = v_co;
  insert into public.challenge_competitors (event_id, user_id, side, is_captain, checked_in_at, ready_at)
  values (v_e, c_ife, 'a', true, now() - interval '20 minutes', now() - interval '7 minutes'),
         (v_e, c_sam, 'b', true, now() - interval '15 minutes', now() - interval '7 minutes');
  insert into public.challenge_posts (event_id, kind, body, milestone, created_at) values
    (v_e, 'system', 'THE CHALLENGE IS SET.', 'set', now() - interval '3 days'),
    (v_e, 'system', 'PREDICTIONS LOCKED. THE CHALLENGE IS LIVE.', 'live', now() - interval '7 minutes');
  insert into public.challenge_followers (event_id, user_id)
  select v_e, pg_temp.crowd(n) from generate_series(60, 90) n union all select v_e, c_chimdi;

  -- Events 4–7 share the 5K crowd: 212 followers; predictions 46% Chimdi (98) / 54% Marcus (114),
  -- Chimdi picked himself, Marcus himself.
  for v_i in 4..7 loop
    v_e := ('d2000000-0000-4000-8000-' || lpad(v_i::text, 12, '0'))::uuid;
    insert into public.challenge_followers (event_id, user_id, created_at)
    select v_e, pg_temp.crowd(n), now() - interval '1 day' from generate_series(1, 212) n;
    insert into public.challenge_predictions (event_id, user_id, side, created_at, updated_at)
    select v_e, pg_temp.crowd(n), case when n <= 97 then 'b'::public.team_side else 'a'::public.team_side end,
           now() - interval '1 day', now() - interval '1 day'
    from generate_series(1, 210) n
    union all values (v_e, c_chimdi, 'b'::public.team_side, now() - interval '1 day', now() - interval '1 day'),
                     (v_e, c_marcus, 'a'::public.team_side, now() - interval '1 day', now() - interval '1 day');
    insert into public.challenge_backings (event_id, user_id, side)
    select v_e, pg_temp.crowd(n), case when n <= 90 then 'b'::public.team_side else 'a'::public.team_side end
    from generate_series(1, 160) n;
    insert into public.challenge_posts (event_id, kind, body, milestone, created_at) values
      (v_e, 'system', 'TOMORROW.', 'tomorrow', now() - interval '1 day');
  end loop;

  -- Event 4 (EventToday, soon): ALMOST TIME, Chimdi checked in 12 min ago, Marcus 3 min ago.
  v_e := 'd2000000-0000-4000-8000-000000000004';
  update public.challenge_competitors set checked_in_at = now() - interval '12 minutes'
   where event_id = v_e and user_id = c_chimdi;
  update public.challenge_competitors set checked_in_at = now() - interval '3 minutes'
   where event_id = v_e and user_id = c_marcus;
  insert into public.challenge_posts (event_id, kind, body, milestone, created_at) values
    (v_e, 'system', 'ALMOST TIME.', 'almost', now() - interval '4 minutes'),
    (v_e, 'system', 'BOTH ARE HERE.', 'both_here', now() - interval '3 minutes');

  -- Event 5 (EventLive): 16:42 in, Chimdi 3.4 km, Marcus 3.1 km, updated 8 s ago; cheers 88 / 41 / 17.
  v_e := 'd2000000-0000-4000-8000-000000000005';
  update public.challenge_events
     set status = 'live', live_at = now() - interval '16 minutes 42 seconds', a_progress = 3.1, b_progress = 3.4,
         progress_updated_at = now() - interval '8 seconds', progress_logged_by = c_chimdi
   where id = v_e;
  update public.challenge_competitors set checked_in_at = now() - interval '40 minutes', ready_at = now() - interval '17 minutes'
   where event_id = v_e;
  insert into public.challenge_posts (event_id, kind, body, milestone, created_at) values
    (v_e, 'system', 'BOTH ARE HERE.', 'both_here', now() - interval '30 minutes'),
    (v_e, 'system', 'PREDICTIONS LOCKED. THE CHALLENGE IS LIVE.', 'live', now() - interval '16 minutes 42 seconds');
  insert into public.challenge_reactions (event_id, user_id, reaction)
  select v_e, pg_temp.crowd(n),
         case when n <= 88 then 'lets_go'::public.reaction_word when n <= 129 then 'respect'::public.reaction_word
              else 'hold_that'::public.reaction_word end
  from generate_series(1, 146) n;
  insert into public.challenge_comments (event_id, author_id, body, respect_count, created_at) values
    (v_e, c_lena, 'Marcus always finishes fast. Not over yet.', 4, now() - interval '1 minute'),
    (v_e, c_ade, 'He''s pulling away on the climb!', 9, now() - interval '10 seconds');

  -- Event 6 (Verifying): finished 18 min ago; Marcus submitted 22:48 (Chimdi) and 23:31 (Marcus) and
  -- confirmed; Chimdi's confirmation is waiting.
  v_e := 'd2000000-0000-4000-8000-000000000006';
  update public.challenge_events
     set status = 'verifying', live_at = now() - interval '41 minutes', ended_at = now() - interval '18 minutes',
         a_progress = 5, b_progress = 5, progress_updated_at = now() - interval '18 minutes', progress_logged_by = c_marcus
   where id = v_e;
  update public.challenge_competitors set checked_in_at = now() - interval '60 minutes', ready_at = now() - interval '41 minutes'
   where event_id = v_e;
  insert into public.challenge_result_submissions (event_id, submitted_by, a_value, b_value, note, created_at)
  values (v_e, c_marcus, 1411, 1368, null, now() - interval '15 minutes')
  returning id into v_sub;
  insert into public.challenge_result_confirmations (submission_id, user_id, created_at)
  values (v_sub, c_marcus, now() - interval '15 minutes');
  insert into public.challenge_posts (event_id, kind, body, milestone, created_at) values
    (v_e, 'system', 'PREDICTIONS LOCKED. THE CHALLENGE IS LIVE.', 'live', now() - interval '41 minutes');

  -- Event 7 (Result): yesterday, Chimdi 22:48 beat Marcus 23:31; 212 watched; 54% picked Marcus.
  v_e := 'd2000000-0000-4000-8000-000000000007';
  update public.challenge_events
     set status = 'complete', live_at = v_yday, ended_at = v_yday + interval '23 minutes',
         completed_at = v_yday + interval '41 minutes', a_progress = 5, b_progress = 5,
         progress_updated_at = v_yday + interval '23 minutes', progress_logged_by = c_chimdi,
         accepted_at = v_yday - interval '6 days'
   where id = v_e;
  update public.challenge_competitors set checked_in_at = v_yday - interval '38 minutes', ready_at = v_yday
   where event_id = v_e;
  insert into public.challenge_result_submissions (event_id, submitted_by, a_value, b_value, note, status, created_at)
  values (v_e, c_chimdi, 1411, 1368, 'Out hard, held it through the last climb on Camillien-Houde.', 'confirmed',
          v_yday + interval '25 minutes')
  returning id into v_sub;
  insert into public.challenge_result_confirmations (submission_id, user_id, created_at)
  values (v_sub, c_chimdi, v_yday + interval '25 minutes'), (v_sub, c_marcus, v_yday + interval '41 minutes');
  insert into public.challenge_results (event_id, rivalry_id, a_value, b_value, winner_side, margin, source, submission_id,
                                        note, predicted_a, predicted_b, crowd_called_it, watched_count, verified_at)
  values (v_e, r_cm, 1411, 1368, 'b', 43, 'participant_confirmation', v_sub,
          'Out hard, held it through the last climb on Camillien-Houde.', 114, 98, false, 212,
          v_yday + interval '41 minutes');
  insert into public.challenge_posts (event_id, kind, body, milestone, created_at) values
    (v_e, 'system', 'PREDICTIONS LOCKED. THE CHALLENGE IS LIVE.', 'live', v_yday),
    (v_e, 'system', 'CHIMDI O WINS.', 'result', v_yday + interval '41 minutes');

  -- The incoming call-out (CallOut): Marcus → Chimdi, 5K Saturday 9:00, sent 2 h ago.
  insert into public.call_outs (id, format, sport_id, title, scoring, target, unit, place_id, course_note, starts_at,
                                time_zone, message, challenger_id, opponent_id, status, expires_at, rivalry_id, created_at)
  values ('d1000000-0000-4000-8000-000000000001', 'person_vs_person', 'running', '5K', 'time', 5, 'km', c_mr, c_course,
          v_sat, c_tz, 'Saturday. Mount Royal. Bring your legs.', c_marcus, c_chimdi, 'proposed',
          least(v_sat - interval '30 minutes', now() + interval '70 hours'), r_cm, now() - interval '2 hours');

  -- The rematch (Rivalry): Marcus wants the 5K again, two weeks on.
  insert into public.call_outs (id, format, sport_id, title, scoring, target, unit, place_id, course_note, starts_at,
                                time_zone, message, challenger_id, opponent_id, status, expires_at, rematch_of_event_id,
                                rivalry_id, created_at)
  values ('d1000000-0000-4000-8000-000000000008', 'person_vs_person', 'running', '5K', 'time', 5, 'km', c_mr, c_course,
          ((v_today + 13) + time '09:00') at time zone c_tz, c_tz, 'Same loop, two weeks. Best of three?', c_marcus, c_chimdi, 'proposed',
          now() + interval '70 hours', 'd2000000-0000-4000-8000-000000000007', r_cm, now() - interval '30 minutes');

  -- Counts from the rows.
  for v_e in select e.id from public.challenge_events e where e.id::text like 'd2000000-%' or e.id::text like 'd3000000-%' loop
    if v_e::text like 'd2000000-%' then
      perform private.challenge_recount(v_e);
    end if;
  end loop;

  -- Updates for Chimdi: the call-out (needs you), the rematch, 3 new posts in Chimdi vs Marcus,
  -- the result to confirm (needs you), the result.
  insert into public.notifications (recipient_id, type, object_kind, object_id, actor_ids, actor_count, count,
                                    bundle_key, data, created_at, updated_at)
  values
    (c_chimdi, 'call_out', 'challenge', 'd1000000-0000-4000-8000-000000000001', array[c_marcus], 1, 1,
     'call_out:d1000000-0000-4000-8000-000000000001', '{"rematch": false, "counter": false}',
     now() - interval '2 hours', now() - interval '2 hours'),
    (c_chimdi, 'call_out', 'challenge', 'd1000000-0000-4000-8000-000000000008', array[c_marcus], 1, 1,
     'call_out:d1000000-0000-4000-8000-000000000008', '{"rematch": true, "counter": false}',
     now() - interval '30 minutes', now() - interval '30 minutes'),
    (c_chimdi, 'challenge_posts', 'challenge_event', 'd2000000-0000-4000-8000-000000000001', array[c_marcus, c_ade], 2, 3,
     'challenge_posts:d2000000-0000-4000-8000-000000000001', '{"system": true}',
     now() - interval '5 hours', now() - interval '1 hour'),
    (c_chimdi, 'challenge_to_confirm', 'challenge_event', 'd2000000-0000-4000-8000-000000000006', array[c_marcus], 1, 1,
     'challenge_confirm:d2000000-0000-4000-8000-000000000006', '{}',
     now() - interval '15 minutes', now() - interval '15 minutes'),
    (c_chimdi, 'challenge_milestone', 'challenge_event', 'd2000000-0000-4000-8000-000000000007', '{}', 0, 1,
     'challenge_milestone:d2000000-0000-4000-8000-000000000007:result', '{"milestone": "result"}',
     v_yday + interval '41 minutes', v_yday + interval '41 minutes');
  update public.notifications set read_at = updated_at
   where recipient_id = c_chimdi and object_id = 'd2000000-0000-4000-8000-000000000007';
end;
$$;
