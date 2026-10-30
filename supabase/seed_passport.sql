-- Step 7 (Passport) sample data, loaded by `supabase db reset` after the other seeds ([db.seed] sql_paths;
-- needs seed.sql, seed_liquidity.sql and seed_competition.sql). Local only. Never apply to a shared
-- environment.
--
-- Safe to run again at any time against a running local stack:
--
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_passport.sql
--
-- It deletes and recreates only its own rows (plans e7000000-…, activities e7100000-…, Chimdi's goals).
-- Sample content from the designs (You.png: "SUB-22 5K BY DECEMBER.", reputation chips, a full
-- Passport); docs/PASSPORT_CONTRACT.md §Local data. Sign in as Chimdi (+1 555 555 0100, code 123456):
--   * Passport: football, running, boxing, basketball and volleyball across Jeanne-Mance, Lachine Canal,
--     Mount Royal loop, Parc La Fontaine, Parc Jarry and Hoshino Boxing, months back to March; Challenge
--     stamps and personal bests (5K 22:48, 10K) come from seed_competition.sql's results.
--   * Goal: SUB-22 5K BY DECEMBER. Best so far from the Marcus rivalry; next test = the 5K Call-Out event.
--   * Reputation: SHOWS UP, RESPECTFUL, WELCOMES BEGINNERS and GREAT HOST past 5; 8 games hosted.

begin;
set local ojoro.seed_reset = 'on';

-- 0. Clean up what this file made before --------------------------------------------------------------

delete from public.activities where id::text like 'e7100000-%';
delete from public.plans where id::text like 'e7000000-%';
delete from public.goals where user_id = 'a0000000-0000-4000-8000-000000000001';

-- 1. Games across sports and places -----------------------------------------------------------------------

do $$
declare
  c_chimdi constant uuid := 'a0000000-0000-4000-8000-000000000001';
  c_ade constant uuid := 'a0000000-0000-4000-8000-000000000002';
  c_lena constant uuid := 'a0000000-0000-4000-8000-000000000004';
  c_sam constant uuid := 'a0000000-0000-4000-8000-000000000005';
  c_yara constant uuid := 'a0000000-0000-4000-8000-000000000006';
  c_joel constant uuid := 'a0000000-0000-4000-8000-000000000007';
  c_ife constant uuid := 'a0000000-0000-4000-8000-000000000010';
  c_maya constant uuid := 'a0000000-0000-4000-8000-000000000011';
  c_theo constant uuid := 'a0000000-0000-4000-8000-000000000012';
  c_dayo constant uuid := 'a0000000-0000-4000-8000-000000000013';
  c_rui constant uuid := 'a0000000-0000-4000-8000-000000000021';
  c_bea constant uuid := 'a0000000-0000-4000-8000-000000000022';
  c_kofi constant uuid := 'a0000000-0000-4000-8000-000000000023';
  c_ana constant uuid := 'a0000000-0000-4000-8000-000000000024';
  c_luc constant uuid := 'a0000000-0000-4000-8000-000000000025';
  c_zoe constant uuid := 'a0000000-0000-4000-8000-000000000026';
  c_max constant uuid := 'a0000000-0000-4000-8000-000000000027';
  c_ola constant uuid := 'a0000000-0000-4000-8000-000000000028';
  c_nneka constant uuid := 'a0000000-0000-4000-8000-000000000020';
  c_priya constant uuid := 'c6100000-0000-4000-8000-000000000001';
  c_femi constant uuid := 'c6100000-0000-4000-8000-000000000005';
  c_lf constant uuid := 'b0000000-0000-4000-8000-000000000002';
  c_jarry constant uuid := 'b0000000-0000-4000-8000-000000000003';
  c_lachine constant uuid := 'b0000000-0000-4000-8000-000000000004';
  c_hoshino constant uuid := 'b0000000-0000-4000-8000-000000000005';
  c_mountroyal constant uuid := 'b0000000-0000-4000-8000-000000000041';
  c_tz constant text := 'America/Toronto';
  g record;
  v_i integer := 0;
  v_start timestamptz;
  v_plan uuid;
  v_activity uuid;
  v_players uuid[];
begin
  for g in
    select * from (values
      (210, '18:30', 'running', c_lf, c_chimdi, 'Plateau Run Club', 60, array[c_chimdi, c_lena, c_maya, c_rui, c_bea]),
      (180, '19:00', 'boxing', c_hoshino, c_ade, 'Sparring basics', 75, array[c_chimdi, c_ade, c_kofi, c_ana]),
      (150, '09:00', 'running', c_lachine, c_chimdi, 'Long run', 90, array[c_chimdi, c_joel, c_luc, c_zoe, c_max]),
      (120, '18:00', 'basketball', c_jarry, c_theo, 'Jarry 3v3', 90, array[c_chimdi, c_theo, c_dayo, c_ola, c_kofi, c_rui]),
      (100, '19:00', 'boxing', c_hoshino, c_ade, 'Sparring basics', 75, array[c_chimdi, c_ade, c_ana, c_zoe]),
      (75, '17:30', 'volleyball', c_lf, c_maya, 'Sunday volleyball', 120, array[c_chimdi, c_maya, c_lena, c_bea, c_luc, c_max, c_nneka, c_priya]),
      (60, '18:30', 'running', c_lf, c_chimdi, 'Plateau Run Club', 60, array[c_chimdi, c_lena, c_maya, c_joel, c_ife]),
      (45, '19:00', 'boxing', c_hoshino, c_chimdi, 'Pads and footwork', 60, array[c_chimdi, c_ade, c_kofi]),
      (35, '07:00', 'running', c_mountroyal, c_chimdi, 'Tempo run', 50, array[c_chimdi, c_rui, c_bea, c_lena]),
      (25, '18:00', 'basketball', c_jarry, c_chimdi, 'Jarry 3v3', 90, array[c_chimdi, c_theo, c_dayo, c_ola, c_sam, c_yara]),
      (20, '17:30', 'volleyball', c_lf, c_maya, 'Sunday volleyball', 120, array[c_chimdi, c_maya, c_bea, c_zoe, c_max, c_ana, c_femi]),
      (16, '18:30', 'running', c_lf, c_chimdi, 'Plateau Run Club', 60, array[c_chimdi, c_lena, c_rui, c_luc]),
      (9, '08:00', 'running', c_lachine, c_chimdi, 'Long run', 90, array[c_chimdi, c_joel, c_zoe, c_maya]),
      (5, '19:00', 'boxing', c_hoshino, c_ade, 'Sparring basics', 75, array[c_chimdi, c_ade, c_kofi, c_ana])
    ) as t(days_ago, at_time, sport, place, host, title, minutes, players)
    order by days_ago desc
  loop
    v_i := v_i + 1;
    v_start := ((((now() at time zone c_tz)::date - g.days_ago) + g.at_time::time) at time zone c_tz);
    -- Only people that exist (the liquidity seed adds Nneka and Rui to Ola; communities adds Priya, Femi).
    select array_agg(u order by o) into v_players
    from unnest(g.players) with ordinality as x(u, o)
    where exists (select 1 from public.profiles p where p.id = x.u);
    v_plan := ('e7000000-0000-4000-8000-' || lpad(v_i::text, 12, '0'))::uuid;
    v_activity := ('e7100000-0000-4000-8000-' || lpad(v_i::text, 12, '0'))::uuid;

    insert into public.plans (id, sport_id, title, starts_at, duration_minutes, place_id, capacity, audience,
                              deadline_at, status, source, created_by, host_id, member_count, level_label,
                              locked_at, created_at)
    values (v_plan, g.sport, g.title, v_start, g.minutes, g.place, 8, 'public', v_start - interval '1 hour',
            'game_on', 'quick', g.host, g.host, cardinality(v_players), 'Mixed level',
            v_start - interval '3 hours', v_start - interval '2 days');
    insert into public.plan_members (plan_id, user_id, via, joined_at)
    select v_plan, u, case when u = g.host then 'host'::public.member_via else 'im_down'::public.member_via end,
           v_start - interval '1 day'
    from unnest(v_players) u;
    insert into public.activities (id, plan_id, sport_id, title, starts_at, ends_at, place_id, capacity, host_id,
                                   confirmed_count, checked_in_count, level_label, attendance_rule,
                                   check_in_opens_at, check_in_closes_at, status, live_at, ended_at,
                                   after_closes_at, completed_at, created_at)
    values (v_activity, v_plan, g.sport, g.title, v_start, v_start + make_interval(mins => g.minutes), g.place, 8,
            g.host, cardinality(v_players), cardinality(v_players), 'Mixed level', 'check_in',
            v_start - interval '30 minutes', v_start + make_interval(mins => g.minutes), 'complete', v_start,
            v_start + make_interval(mins => g.minutes),
            v_start + make_interval(mins => g.minutes) + interval '24 hours',
            v_start + make_interval(mins => g.minutes) + interval '24 hours', v_start - interval '3 hours');
    insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
    select v_activity, u, 'checked_in', v_start - interval '3 hours', v_start - interval '10 minutes', 'location'
    from unnest(v_players) u;
    insert into public.recaps (activity_id, sport_id, place_id, occurred_at, duration_minutes, played_count,
                               created_at, finalized_at)
    values (v_activity, g.sport, g.place, v_start, g.minutes, cardinality(v_players),
            v_start + make_interval(mins => g.minutes),
            v_start + make_interval(mins => g.minutes) + interval '24 hours');
    -- Stamps with the same ordinals the server writes (games only).
    insert into public.passport_entries (user_id, activity_id, sport_id, place_id, occurred_at, minutes,
                                         place_game_number, sport_game_number, created_at)
    select u, v_activity, g.sport, g.place, v_start, g.minutes,
           1 + (select count(*) from public.passport_entries e
                 where e.user_id = u and e.place_id = g.place and e.kind = 'game' and e.occurred_at < v_start),
           1 + (select count(*) from public.passport_entries e
                 where e.user_id = u and e.sport_id = g.sport and e.kind = 'game' and e.occurred_at < v_start),
           v_start + make_interval(mins => g.minutes)
    from unnest(v_players) u;

    -- Reputation from the people Chimdi played with (one of each kind per person per game at most).
    insert into public.reputation_signals (giver_id, subject_id, activity_id, kind, created_at)
    select u, c_chimdi, v_activity, 'respectful', v_start + interval '3 hours'
    from unnest(v_players[2:2]) u
    on conflict do nothing;
    insert into public.reputation_signals (giver_id, subject_id, activity_id, kind, created_at)
    select u, c_chimdi, v_activity, 'welcomes_beginners', v_start + interval '3 hours'
    from unnest(v_players[3:3]) u
    where g.sport in ('boxing', 'volleyball', 'running')
    on conflict do nothing;
    if g.host = c_chimdi then
      insert into public.reputation_signals (giver_id, subject_id, activity_id, kind, created_at)
      select u, c_chimdi, v_activity, 'great_host', v_start + interval '3 hours'
      from unnest(v_players[2:2]) u
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

-- 2. The goal on You: SUB-22 5K BY DECEMBER -----------------------------------------------------------------

insert into public.goals (user_id, kind, sport_id, discipline, scoring, target_value, target_date, created_at,
                          updated_at)
select 'a0000000-0000-4000-8000-000000000001', 'personal_best', 'running', '5K', 'time', 1320,
       case when make_date(extract(year from d)::integer, 12, 31) >= d
            then make_date(extract(year from d)::integer, 12, 31)
            else make_date(extract(year from d)::integer + 1, 12, 31) end,
       now() - interval '30 days', now() - interval '30 days'
from (select (now() at time zone 'America/Toronto')::date as d) x;

commit;
