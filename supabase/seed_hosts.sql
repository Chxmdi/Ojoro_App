-- Step 6 (Host OS core) sample data: Plateau Pickup, run by Ade B. Loaded by `supabase db reset` after
-- the earlier seeds ([db.seed] sql_paths). Local only. Never apply to a shared environment.
--
-- Safe to run again at any time against a running local stack; it rebuilds its own rows so the
-- time-relative parts ("tonight", "this week", "last 30 days") follow the clock:
--
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_hosts.sql
--
-- Re-running deletes and recreates the program (fixed id c6000000-…-0001), so the ops ledger seed
-- (seed_hosts_ops.sql) must run after it. Sample content from the designs (HostHome, HostSeries,
-- HostRoster, HostRequests, HostPeople, HostAnnounce). Sign in as Ade B (+1 555 555 0101, code 123456):
--   * YOUR WEEK: Sunday Beginners 9 / 12 with 2 asking (Grace N, Omar S), Tuesday 7-a-side 14 / 14
--     with 3 waiting (Dayo dropped, Rina took the spot), Thursday Mixed 5s 8 / 10.
--   * People: about 86 who have played, 18 members, regulars, new faces and 6 drifting.
-- Ids: docs/HOSTS_CONTRACT.md §Local data.

do $$
declare
  c_ade constant uuid := 'a0000000-0000-4000-8000-000000000002';
  c_chimdi constant uuid := 'a0000000-0000-4000-8000-000000000001';
  c_marcus constant uuid := 'a0000000-0000-4000-8000-000000000003';
  c_lena constant uuid := 'a0000000-0000-4000-8000-000000000004';
  c_sam constant uuid := 'a0000000-0000-4000-8000-000000000005';
  c_yara constant uuid := 'a0000000-0000-4000-8000-000000000006';
  c_dayo constant uuid := 'a0000000-0000-4000-8000-000000000013';
  c_program constant uuid := 'c6000000-0000-4000-8000-000000000001';
  c_crew constant uuid := 'c6000000-0000-4000-8000-000000000002';
  c_tue constant uuid := 'c6000000-0000-4000-8000-000000000011';
  c_thu constant uuid := 'c6000000-0000-4000-8000-000000000012';
  c_sun constant uuid := 'c6000000-0000-4000-8000-000000000013';
  c_jeanne constant uuid := 'b0000000-0000-4000-8000-000000000001';
  c_fontaine constant uuid := 'b0000000-0000-4000-8000-000000000002';
  v_tz constant text := 'America/Toronto';
  v_today date := (now() at time zone v_tz)::date;
  v_d date;
  v_s record;
  v_sess uuid;
  v_act uuid;
  v_plan uuid;
  v_tonight public.host_sessions%rowtype;
  v_sunday public.host_sessions%rowtype;
  v_thursday public.host_sessions%rowtype;
  v_i integer;
  v_p uuid;
begin
  -- Clean up our own rows (sessions are plans + activities; delete those too).
  create temporary table seed_host_objects on commit drop as
    select s.plan_id, s.activity_id from public.host_sessions s where s.program_id = c_program
    union all
    select a.plan_id, a.id from public.activities a
    where a.id::text like 'c6300000-0000-4000-8000-%';
  delete from public.host_programs where id = c_program;
  delete from public.notifications where activity_id in (select activity_id from seed_host_objects)
     or plan_id in (select plan_id from seed_host_objects);
  delete from public.activities where id in (select activity_id from seed_host_objects);
  delete from public.plans where id in (select plan_id from seed_host_objects);
  delete from public.crews where id = c_crew;

  -- People ----------------------------------------------------------------------------------------------
  -- c6100000-…-0000000000NN. 01–09 named in the designs; 10+ the rest of the program's players.
  create temporary table seed_host_people (
    n integer primary key,
    id uuid not null,
    name text not null,
    area text not null,
    lat numeric(5, 2) not null,
    lng numeric(5, 2) not null,
    -- regular | new | drifting | occasional | asking | waiting | member_only
    kind text not null,
    tue integer not null default 0,
    thu integer not null default 0,
    sun integer not null default 0,
    member boolean not null default false,
    joined_days_ago integer not null default 300
  ) on commit drop;

  insert into seed_host_people (n, id, name, area, lat, lng, kind, tue, thu, sun, member, joined_days_ago) values
    (1, 'c6100000-0000-4000-8000-000000000001', 'Priya S', 'Plateau, Montréal', 45.52, -73.58, 'regular', 0, 55, 55, false, 300),
    (2, 'c6100000-0000-4000-8000-000000000002', 'Rina K', 'Mile End, Montréal', 45.52, -73.60, 'regular', 45, 20, 0, false, 300),
    (3, 'c6100000-0000-4000-8000-000000000003', 'Tomás G', 'Plateau, Montréal', 45.52, -73.57, 'waiting', 0, 0, 0, false, 40),
    (4, 'c6100000-0000-4000-8000-000000000004', 'Lucas P', 'Villeray, Montréal', 45.54, -73.62, 'waiting', 0, 60, 0, false, 300),
    (5, 'c6100000-0000-4000-8000-000000000005', 'Femi J', 'Rosemont, Montréal', 45.54, -73.58, 'waiting', 0, 0, 0, false, 20),
    (6, 'c6100000-0000-4000-8000-000000000006', 'Ana C', 'Plateau, Montréal', 45.53, -73.58, 'waiting', 25, 0, 0, false, 300),
    (7, 'c6100000-0000-4000-8000-000000000007', 'Grace N', 'Verdun, Montréal', 45.49, -73.58, 'asking', 0, 0, 0, false, 300),
    (8, 'c6100000-0000-4000-8000-000000000008', 'Omar S', 'Rosemont, Montréal', 45.56, -73.60, 'asking', 0, 0, 0, false, 3),
    (9, 'c6100000-0000-4000-8000-000000000009', 'Kofi A', 'Plateau, Montréal', 45.52, -73.58, 'regular', 70, 65, 0, true, 300);

  -- Regulars and members (with the named ones from seed.sql below).
  insert into seed_host_people (n, id, name, area, lat, lng, kind, tue, thu, sun, member)
  select 10 + i, ('c6100000-0000-4000-8000-' || lpad((10 + i)::text, 12, '0'))::uuid,
         (array['Theo B', 'Nadia F', 'Hugo L', 'Inès R', 'Malik D', 'Sofia T', 'Kwame O', 'Léa M',
                'Bilal H', 'Chloé V', 'Dami O', 'Elena P', 'Jonah W', 'Zainab K', 'Mateo R'])[i],
         'Plateau, Montréal', 45.52, -73.58, 'regular',
         case when i % 3 = 0 then 0 else 60 + (i * 7) % 30 end,
         case when i % 3 = 1 then 0 else 55 + (i * 11) % 35 end,
         case when i % 4 = 0 then 50 else 0 end,
         i <= 12
  from generate_series(1, 15) i;

  -- New faces (first came in the last month).
  insert into seed_host_people (n, id, name, area, lat, lng, kind, tue, thu, sun, joined_days_ago)
  select 30 + i, ('c6100000-0000-4000-8000-' || lpad((30 + i)::text, 12, '0'))::uuid,
         (array['Aiden Q', 'Bea N', 'Carlos M', 'Divya S', 'Eli K', 'Fatou D', 'Gabe R', 'Hana Y', 'Ivan P'])[i],
         'Plateau, Montréal', 45.52, -73.58, 'new',
         case when i % 2 = 0 then 60 else 0 end, case when i % 2 = 1 then 60 else 0 end, 50, 40
  from generate_series(1, 9) i;

  -- Drifting (regulars who haven't been in for 3 weeks or more): LR is Lena R from seed.sql.
  insert into seed_host_people (n, id, name, area, lat, lng, kind, tue, thu)
  select 40 + i, ('c6100000-0000-4000-8000-' || lpad((40 + i)::text, 12, '0'))::uuid,
         (array['Ivy V', 'Paul M', 'Ava W', 'Kemi E', 'Jules E'])[i],
         'Plateau, Montréal', 45.52, -73.58, 'drifting', 70, 50
  from generate_series(1, 5) i;

  -- Occasional players across the season.
  insert into seed_host_people (n, id, name, area, lat, lng, kind, tue, thu, sun)
  select 50 + i, ('c6100000-0000-4000-8000-' || lpad((50 + i)::text, 12, '0'))::uuid,
         (array['Adam', 'Bruno', 'Cyril', 'Dana', 'Emeka', 'Farah', 'Gus', 'Hiro', 'Idris', 'Jana',
                'Kai', 'Lior', 'Mina', 'Nico', 'Olu', 'Pia', 'Quinn', 'Rafa', 'Sade', 'Tariq',
                'Uma', 'Vik', 'Wren', 'Xavi', 'Yusuf', 'Zoe', 'Abe', 'Bo', 'Cleo', 'Dev',
                'Ezra', 'Fola', 'Gia', 'Hal', 'Ike', 'Jojo', 'Kit', 'Lu', 'Mo', 'Nell',
                'Oz', 'Pat', 'Rio', 'Sol', 'Tex', 'Val', 'Wim', 'Yan', 'Zed', 'Ari'])[i]
         || ' ' || substr('ABCDEFGHJKLMNPRSTVWY', 1 + (i * 7) % 20, 1),
         'Plateau, Montréal', 45.52, -73.58, 'occasional', 7, 7, 6
  from generate_series(1, 50) i;

  -- Members only (pay monthly, haven't come yet this season).
  insert into seed_host_people (n, id, name, area, lat, lng, kind, member)
  values (120, 'c6100000-0000-4000-8000-000000000120', 'Maud T', 'Plateau, Montréal', 45.52, -73.58, 'member_only', true);

  insert into auth.users (instance_id, id, aud, role, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          phone_change, phone_change_token, email_change_token_current, reauthentication_token)
  select '00000000-0000-0000-0000-000000000000', p.id, 'authenticated', 'authenticated',
         jsonb_build_object('display_name', p.name), now() - make_interval(days => p.joined_days_ago), now(),
         '', '', '', '', '', '', '', ''
  from seed_host_people p
  on conflict (id) do nothing;
  update public.profiles pr
     set display_name = p.name, area = p.area, onboarding_completed_at = coalesce(pr.onboarding_completed_at, now()),
         created_at = now() - make_interval(days => p.joined_days_ago)
    from seed_host_people p where pr.id = p.id;
  update public.profile_private pp set area_lat = p.lat, area_lng = p.lng
    from seed_host_people p where pp.user_id = p.id;
  insert into public.user_sports (user_id, sport_id, level, is_main)
  select p.id, 'football', case when p.kind = 'asking' then 'learning'::public.skill_level else 'casual' end, true
  from seed_host_people p
  on conflict do nothing;

  -- People from seed.sql who play here.
  insert into seed_host_people (n, id, name, area, lat, lng, kind, tue, thu, sun, member) values
    (201, c_yara, 'Yara M', '', 0, 0, 'regular', 100, 100, 0, true),
    (202, c_chimdi, 'Chimdi O', '', 0, 0, 'regular', 92, 92, 0, true),
    (203, c_marcus, 'Marcus T', '', 0, 0, 'regular', 78, 0, 0, true),
    (204, c_sam, 'Sam K', '', 0, 0, 'regular', 55, 0, 0, false),
    (205, c_dayo, 'Dayo F', '', 0, 0, 'regular', 50, 30, 0, false),
    (206, c_lena, 'Lena R', '', 0, 0, 'drifting', 70, 40, 0, true);

  -- Program, crew, series --------------------------------------------------------------------------------
  insert into public.crews (id, name, sport_id, created_by) values (c_crew, 'Plateau Pickup', 'football', c_ade);
  insert into public.crew_members (crew_id, user_id, role, via) values (c_crew, c_ade, 'owner', 'created');
  insert into public.crew_members (crew_id, user_id, role, via, invited_by)
  select c_crew, p.id, 'member', 'added', c_ade from seed_host_people p where p.member;
  update public.crews set member_count = (select count(*) from public.crew_members m where m.crew_id = c_crew)
   where id = c_crew;

  insert into public.host_programs (id, name, sport_id, area, crew_id, created_by, auto_approve_played_with,
                                    auto_approve_experienced, auto_approve_crews, created_at)
  values (c_program, 'Plateau Pickup', 'football', 'Plateau, Montréal', c_crew, c_ade, true, false, true,
          now() - interval '240 days');
  insert into public.host_program_hosts (program_id, user_id, role, added_by) values (c_program, c_ade, 'owner', c_ade);

  insert into public.host_series (id, program_id, name, sport_id, place_id, start_time, duration_minutes, capacity,
                                  level, repeat_days, starts_on, until_on, join_opens_days, approval_required,
                                  waitlist_auto_fill, members_first, price_cents, member_price_cents, refund_window,
                                  teams_note, kit_note, created_by)
  values
    (c_tue, c_program, 'Tuesday 7-a-side', 'football', c_jeanne, '19:30', 90, 14, 'mixed', '{2}',
     v_today - 7 * 34, '2027-03-30', 5, true, true, true, 800, 0, 'hours_12',
     '7 a side. Ojoro balances teams at check-in.', 'Bibs and balls: Ade. Turf boots.', c_ade),
    (c_thu, c_program, 'Mixed 5s', 'football', c_fontaine, '19:30', 75, 10, 'mixed', '{4}',
     v_today - 7 * 24, null, 5, false, true, true, 800, 0, 'hours_12', null, null, c_ade),
    (c_sun, c_program, 'Beginners', 'football', c_jeanne, '10:00', 90, 12, 'beginners', '{7}',
     v_today - 7 * 14, null, 5, true, true, false, 0, 0, 'any_time', null, 'Any trainers are fine.', c_ade);

  -- Members (18): active monthly members.
  insert into public.host_program_members (program_id, user_id, started_at, source)
  select c_program, p.id, now() - interval '200 days', 'host' from seed_host_people p where p.member
  on conflict do nothing;
  -- The ops ledger keeps memberships in step with passes; until then, top up to 18 here.
  insert into public.host_program_members (program_id, user_id, started_at, source)
  select c_program, p.id, now() - interval '60 days', 'host' from seed_host_people p
  where p.kind = 'regular' and not p.member and p.n between 14 and 25
    and (select count(*) from public.host_program_members m where m.program_id = c_program) < 18
  on conflict do nothing;

  -- History: every past date of each series (Tuesday since March, 3 skipped for the holidays-style gap),
  -- with check-ins chosen deterministically from each person's habits.
  for v_s in select * from public.host_series where program_id = c_program loop
    for v_d in
      select g::date from generate_series(v_s.starts_on::timestamp, (v_today - 1)::timestamp, interval '1 day') g
      where extract(isodow from g)::smallint = any (v_s.repeat_days)
    loop
      v_sess := private.host_create_session(v_s.id, v_d);
      select activity_id, plan_id into v_act, v_plan from public.host_sessions where id = v_sess;
      -- Ade hosts and plays Tuesdays.
      insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
      select v_act, c_ade, 'checked_in', a.starts_at - interval '2 days', a.starts_at - interval '10 minutes', 'host'
      from public.activities a where a.id = v_act and v_s.id = c_tue;
      insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
      select v_act, x.id,
             case when x.noshow then 'confirmed'::public.attendance_status else 'checked_in' end,
             x.starts_at - interval '2 days',
             case when x.noshow then null else x.starts_at - interval '5 minutes' end,
             case when x.noshow then null else 'location'::public.check_in_method end
      from (
        select p.id, a.starts_at,
               abs(hashtext(p.id::text || v_d::text || 'n')) % 100 < 3 as noshow,
               abs(hashtext(p.id::text || v_d::text)) % 100 as roll,
               case v_s.id when c_tue then p.tue when c_thu then p.thu else p.sun end as prob
        from seed_host_people p, public.activities a
        where a.id = v_act
          -- New faces only in the last month; drifting stopped 3+ weeks ago (and came 8+ weeks back).
          and (p.kind <> 'new' or v_d > v_today - 28)
          and (p.kind <> 'drifting' or v_d between v_today - 7 * 12 and v_today - 24)
          and p.kind not in ('asking', 'member_only')
          and not (p.id = c_dayo and v_d > v_today - 10)
      ) x
      where x.roll < x.prob
      order by x.prob desc, x.roll
      limit (select capacity from public.activities where id = v_act) - case when v_s.id = c_tue then 1 else 0 end;
      update public.activities a
         set confirmed_count = (select count(*) from public.attendance t where t.activity_id = a.id),
             checked_in_count = (select count(*) from public.attendance t where t.activity_id = a.id and t.status = 'checked_in'),
             status = 'complete', live_at = a.starts_at, ended_at = a.ends_at, completed_at = a.after_closes_at
       where a.id = v_act;
    end loop;
  end loop;
  -- The roster log of past sessions isn't sample content: clear what the inserts wrote.
  delete from public.host_session_log l using public.host_sessions s
   where s.id = l.session_id and s.program_id = c_program;

  -- Upcoming sessions.
  perform private.host_materialize_series(c_tue);
  perform private.host_materialize_series(c_thu);
  perform private.host_materialize_series(c_sun);
  select * into v_tonight from public.host_sessions where series_id = c_tue and starts_at > now() order by starts_at limit 1;
  select * into v_thursday from public.host_sessions where series_id = c_thu and starts_at > now() order by starts_at limit 1;
  select * into v_sunday from public.host_sessions where series_id = c_sun and starts_at > now() order by starts_at limit 1;

  -- Tuesday ("tonight"): 14 in with Dayo, then Rina, Lucas, Femi, Ana wait; Dayo drops and Rina is in.
  insert into public.attendance (activity_id, user_id, status, confirmed_at)
  select v_tonight.activity_id, u, 'confirmed', now() - make_interval(hours => (80 - o)::integer)
  from unnest(array[c_ade, c_chimdi, c_yara, c_marcus, c_sam, 'c6100000-0000-4000-8000-000000000001'::uuid,
                    'c6100000-0000-4000-8000-000000000009', 'c6100000-0000-4000-8000-000000000003',
                    'c6100000-0000-4000-8000-000000000011', 'c6100000-0000-4000-8000-000000000012',
                    'c6100000-0000-4000-8000-000000000014', 'c6100000-0000-4000-8000-000000000015',
                    'c6100000-0000-4000-8000-000000000017', c_dayo]) with ordinality as x(u, o);
  insert into public.attendance (activity_id, user_id, status, waitlisted_at)
  values (v_tonight.activity_id, 'c6100000-0000-4000-8000-000000000002', 'waitlisted', now() - interval '4 days'),
         (v_tonight.activity_id, 'c6100000-0000-4000-8000-000000000004', 'waitlisted', now() - interval '3 days'),
         (v_tonight.activity_id, 'c6100000-0000-4000-8000-000000000005', 'waitlisted', now() - interval '2 days'),
         (v_tonight.activity_id, 'c6100000-0000-4000-8000-000000000006', 'waitlisted', now() - interval '3 hours');
  update public.activities set confirmed_count = 14, waitlist_count = 4 where id = v_tonight.activity_id;
  -- Tomás (first time) and Femi were approved by Ade.
  insert into public.host_join_requests (session_id, user_id, note, status, approved_via, decided_by, decided_at, created_at)
  values (v_tonight.id, 'c6100000-0000-4000-8000-000000000003', 'First time on Ojoro. Played centre-mid at uni.',
          'approved', 'host', c_ade, now() - interval '3 days', now() - interval '3 days 2 hours'),
         (v_tonight.id, 'c6100000-0000-4000-8000-000000000005', null,
          'approved', 'host', c_ade, now() - interval '2 days', now() - interval '2 days 1 hour');
  perform private.drop_attendance(v_tonight.activity_id, c_dayo);

  -- Thursday: 8 / 10, members free.
  insert into public.attendance (activity_id, user_id, status, confirmed_at)
  select v_thursday.activity_id, p.id, 'confirmed', now() - interval '1 day'
  from seed_host_people p where p.kind = 'regular' and p.thu > 0
  order by p.thu desc, p.n limit 8;
  update public.activities set confirmed_count = 8 where id = v_thursday.activity_id;

  -- Sunday Beginners: 9 / 12, two asking.
  insert into public.attendance (activity_id, user_id, status, confirmed_at)
  select v_sunday.activity_id, p.id, 'confirmed', now() - interval '1 day'
  from seed_host_people p where p.kind in ('new', 'regular') and p.sun > 0
  order by p.kind, p.n limit 9;
  update public.activities a set confirmed_count = (select count(*) from public.attendance t where t.activity_id = a.id)
   where a.id = v_sunday.activity_id;
  insert into public.host_join_requests (session_id, user_id, note, status, created_at)
  values (v_sunday.id, 'c6100000-0000-4000-8000-000000000007',
          'Haven''t played football since school. Want to get back into it with people who won''t mind.',
          'pending', now() - interval '20 hours'),
         (v_sunday.id, 'c6100000-0000-4000-8000-000000000008',
          'Just moved here. Played a bit in Lyon, mostly 5-a-side.', 'pending', now() - interval '6 hours');

  -- Grace's Ojoro history elsewhere: 14 games, showed up to all 14, several with Chimdi.
  for v_i in 1..14 loop
    v_plan := ('c6200000-0000-4000-8000-' || lpad(v_i::text, 12, '0'))::uuid;
    v_act := ('c6300000-0000-4000-8000-' || lpad(v_i::text, 12, '0'))::uuid;
    insert into public.plans (id, sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                              status, source, created_by, host_id, member_count, locked_at)
    values (v_plan, 'football', now() - make_interval(days => 10 + v_i * 6), 60, 'b0000000-0000-4000-8000-000000000004',
            6, 'public', now() - make_interval(days => 11 + v_i * 6), 'game_on', 'quick',
            'c6100000-0000-4000-8000-000000000007', 'c6100000-0000-4000-8000-000000000007', 2,
            now() - make_interval(days => 11 + v_i * 6));
    insert into public.activities (id, plan_id, sport_id, starts_at, ends_at, place_id, capacity, host_id,
                                   confirmed_count, checked_in_count, attendance_rule, check_in_opens_at,
                                   check_in_closes_at, status, after_closes_at, live_at, ended_at, completed_at)
    values (v_act, v_plan, 'football', now() - make_interval(days => 10 + v_i * 6),
            now() - make_interval(days => 10 + v_i * 6) + interval '60 minutes',
            'b0000000-0000-4000-8000-000000000004', 6, 'c6100000-0000-4000-8000-000000000007',
            case when v_i <= 4 then 2 else 1 end, case when v_i <= 4 then 2 else 1 end, 'check_in',
            now() - make_interval(days => 10 + v_i * 6) - interval '30 minutes',
            now() - make_interval(days => 10 + v_i * 6) + interval '60 minutes', 'complete',
            now() - make_interval(days => 9 + v_i * 6) + interval '60 minutes',
            now() - make_interval(days => 10 + v_i * 6), now() - make_interval(days => 10 + v_i * 6) + interval '60 minutes',
            now() - make_interval(days => 9 + v_i * 6) + interval '60 minutes');
    insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
    values (v_act, 'c6100000-0000-4000-8000-000000000007', 'checked_in', now() - make_interval(days => 11 + v_i * 6),
            now() - make_interval(days => 10 + v_i * 6), 'location');
    if v_i <= 4 then
      insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
      values (v_act, c_chimdi, 'checked_in', now() - make_interval(days => 11 + v_i * 6),
              now() - make_interval(days => 10 + v_i * 6), 'location');
    end if;
    -- Passport stamps (people who played together are "connected": "You both play with Chimdi O.").
    insert into public.passport_entries (user_id, activity_id, sport_id, place_id, occurred_at, minutes, sport_game_number)
    select t.user_id, v_act, 'football', 'b0000000-0000-4000-8000-000000000004', now() - make_interval(days => 10 + v_i * 6),
           60, 15 - v_i
    from public.attendance t where t.activity_id = v_act
    on conflict (user_id, activity_id) do nothing;
  end loop;

  -- People CRM: Marcus's tags and Ade's private note.
  insert into public.host_people (program_id, user_id, tags) values (c_program, c_marcus, '{centre-back,spare bibs}')
  on conflict (program_id, user_id) do update set tags = excluded.tags;
  insert into public.host_person_notes (program_id, user_id, author_id, body)
  values (c_program, c_marcus, c_ade, 'Prefers centre-back. Brings the spare bibs. Usually 5 minutes late on Tuesdays.');
  update public.host_people hp set first_seen_at = coalesce((
    select min(s.starts_at) from public.host_sessions s join public.attendance t on t.activity_id = s.activity_id
    where s.program_id = c_program and t.user_id = hp.user_id), hp.first_seen_at)
   where hp.program_id = c_program;

  -- Announcements sent before (with read counts).
  insert into public.host_announcements (program_id, session_id, author_id, body, audiences, template,
                                         recipient_count, read_count, pinned, notify, created_at)
  select c_program, s.id, c_ade, x.body, x.aud::public.host_audience[], x.tpl, x.rc, x.rd, false, x.nf, s.starts_at - interval '3 hours'
  from (values
    (c_thu, 1, 'Rain check: we''re on. The turf drains fine.', '{session}', 'weather_call', 10, 10, true),
    (c_tue, 1, 'Bring a light shirt and a dark shirt.', '{session}', 'bring_kit', 14, 14, false),
    (c_thu, 2, 'Winter League sign-ups close Friday. Captains, register your team.', '{everyone}', null, 86, 71, true)
  ) x(series, weeks_back, body, aud, tpl, rc, rd, nf)
  cross join lateral (
    select h.id, h.starts_at from public.host_sessions h
    where h.series_id = x.series and h.starts_at < now()
    order by h.starts_at desc offset x.weeks_back - 1 limit 1
  ) s;
end;
$$;
