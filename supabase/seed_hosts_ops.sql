-- Step 6 (Host OS operations) sample data for Plateau Pickup: passes, memberships, the money ledger,
-- Lena's refund request, past payouts and the Winter League. Loaded by `supabase db reset` after
-- seed_hosts.sql ([db.seed] sql_paths). Local only. Never apply to a shared environment.
--
-- Safe to run again at any time (and run it again after seed_hosts.sql, which rebuilds the program and
-- with it everything here):
--
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_hosts_ops.sql
--
-- NO MONEY MOVES: every row has provider 'none'. Amounts are sample content from the designs
-- (HostMembership, HostRoster, HostSeason, HostInsights). Sign in as Ade B (+1 555 555 0101, 123456):
--   * Memberships & payments: next payout $412 (22 drop-ins, 6 monthly renewals, one 10-pack, an $8
--     refund, the PLACEHOLDER fee), Lena R's monthly refund to decide, 4 passes, 18 members, 3 past payouts.
--   * Tonight's roster: 13 of 14 settled (Tomás pays $8 at the field), Sam and Rina PAID $8, Priya's
--     10-pack with 4 sessions left, Dayo's $8 refunded when Rina took his spot.
--   * Winter League: round 3 of 10 this Saturday, Thursday FC 4–2 Plateau Crew to confirm, standings,
--     refs (Kofi A, Chimdi O; Yara M suggested for 10:15), readiness 7 + 8 / 9 + 6 / 8 + 7.
-- Ids: docs/HOSTS_OPS_CONTRACT.md §Local data.

begin;
set local ojoro.seed_reset = 'on';

do $$
declare
  c_program constant uuid := 'c6000000-0000-4000-8000-000000000001';
  c_tue constant uuid := 'c6000000-0000-4000-8000-000000000011';
  c_thu constant uuid := 'c6000000-0000-4000-8000-000000000012';
  c_sun constant uuid := 'c6000000-0000-4000-8000-000000000013';
  c_ade constant uuid := 'a0000000-0000-4000-8000-000000000002';
  c_chimdi constant uuid := 'a0000000-0000-4000-8000-000000000001';
  c_lena constant uuid := 'a0000000-0000-4000-8000-000000000004';
  c_sam constant uuid := 'a0000000-0000-4000-8000-000000000005';
  c_yara constant uuid := 'a0000000-0000-4000-8000-000000000006';
  c_dayo constant uuid := 'a0000000-0000-4000-8000-000000000013';
  c_priya constant uuid := 'c6100000-0000-4000-8000-000000000001';
  c_rina constant uuid := 'c6100000-0000-4000-8000-000000000002';
  c_kofi constant uuid := 'c6100000-0000-4000-8000-000000000009';
  c_drop constant uuid := 'c7200000-0000-4000-8000-000000000001';
  c_pack constant uuid := 'c7200000-0000-4000-8000-000000000002';
  c_monthly constant uuid := 'c7200000-0000-4000-8000-000000000003';
  c_free constant uuid := 'c7200000-0000-4000-8000-000000000004';
  c_lena_request constant uuid := 'c7300000-0000-4000-8000-000000000001';
  c_league constant uuid := 'c7000000-0000-4000-8000-000000000001';
  c_jeanne constant uuid := 'b0000000-0000-4000-8000-000000000001';
  v_tz constant text := 'America/Toronto';
  v_today date := (now() at time zone v_tz)::date;
  v_start timestamptz;
  v_end timestamptz;
  v_month timestamptz;
  v_span interval;
  v_tonight public.host_sessions%rowtype;
  v_sessions uuid[];
  v_people uuid[];
  v_m uuid;
  v_i integer;
  v_u uuid;
  v_sat3 date;
  v_round uuid[];
  v_team uuid[];
  v_f uuid;
  v_teams text[] := array['Mile End Strikers', 'Thursday FC', 'Lachine Locos', 'Plateau Crew',
                          'Saint-Henri United', 'Concordia Old Boys'];
begin
  if not exists (select 1 from public.host_programs where id = c_program) then
    raise notice 'seed_hosts_ops: run seed_hosts.sql first';
    return;
  end if;

  -- 0. Clean up what this file made before ---------------------------------------------------------------
  delete from public.host_leagues where program_id = c_program;
  delete from public.host_refund_requests where program_id = c_program;
  delete from public.host_refunds where program_id = c_program;
  delete from public.host_pass_uses u using public.host_sessions s where s.id = u.session_id and s.program_id = c_program;
  delete from public.host_charges where program_id = c_program;
  delete from public.host_memberships where program_id = c_program;
  delete from public.host_passes where program_id = c_program;
  delete from public.host_payouts where program_id = c_program;
  delete from public.host_ops_audit where program_id = c_program;

  select period_start, period_end into v_start, v_end from private.host_period(c_program, now());
  -- Spread "this week" rows over the part of the payout week that has passed.
  v_span := greatest(now() - v_start, interval '1 minute');
  v_month := (date_trunc('month', v_today) + interval '9 hours')::timestamp at time zone v_tz;
  if v_month < now() - interval '29 days' then
    v_month := now() - interval '29 days';
  end if;

  -- 1. Passes ------------------------------------------------------------------------------------------------
  insert into public.host_passes (id, program_id, kind, name, description, price_cents, sessions_included, valid_days,
                                  series_id, sort_order, created_by, created_at)
  values
    (c_drop, c_program, 'drop_in', 'Drop-in', 'One session, any Tuesday or Thursday', 800, null, null, null, 0, c_ade, now() - interval '200 days'),
    (c_pack, c_program, 'pack', '10-pack', '10 sessions, use within 4 months', 7000, 10, 120, null, 1, c_ade, now() - interval '200 days'),
    (c_monthly, c_program, 'monthly', 'Monthly', 'Every Tuesday and Thursday, early access', 3500, null, null, null, 2, c_ade, now() - interval '200 days'),
    (c_free, c_program, 'free', 'Sunday beginners', 'Approval on, 12 spots', 0, null, null, c_sun, 3, c_ade, now() - interval '100 days');

  -- 2. Monthly memberships: the 18 members. Lena renewed on the 1st and cancelled 3 days in; 6 renewed
  --    this payout week; the rest on the 1st.
  v_i := 0;
  for v_u in select m.user_id from public.host_program_members m where m.program_id = c_program
             order by (m.user_id = c_lena) desc, m.user_id
  loop
    v_i := v_i + 1;
    insert into public.host_memberships (program_id, pass_id, user_id, kind, status, started_at, period_ends_at, renews,
                                         cancelled_at)
    values (c_program, c_monthly, v_u, 'monthly',
            case when v_u = c_lena then 'cancelled' else 'active' end::public.host_membership_status,
            now() - interval '200 days',
            case when v_i between 2 and 7 then v_start + v_span * (v_i / 8.0) + interval '1 month'
                 else (date_trunc('month', v_today) + interval '1 month')::timestamp at time zone v_tz end,
            v_u <> c_lena,
            case when v_u = c_lena then v_month + interval '3 days' end)
    returning id into v_m;
    insert into public.host_charges (program_id, user_id, kind, pass_id, membership_id, amount_cents, currency, status,
                                     method, paid_at, created_at)
    values (c_program, v_u, 'monthly_renewal', c_monthly, v_m, 3500, 'CAD', 'paid', 'app',
            case when v_i between 2 and 7 then v_start + v_span * (v_i / 8.0) else v_month end,
            case when v_i between 2 and 7 then v_start + v_span * (v_i / 8.0) else v_month end);
  end loop;

  -- Lena's request (NEEDS A DECISION).
  insert into public.host_refund_requests (id, program_id, user_id, charge_id, note, created_at)
  select c_lena_request, c_program, c_lena, c.id,
         'New job with late shifts, so Tuesdays and Thursdays are out for now. Could I get some of October back?',
         v_month + interval '3 days'
  from public.host_charges c join public.host_memberships m on m.id = c.membership_id
  where m.user_id = c_lena and m.program_id = c_program;

  -- 3. 10-packs: 7 active. Priya's has 6 used (4 left); one sold this week; 4 more earlier this month.
  insert into public.host_memberships (program_id, pass_id, user_id, kind, started_at, period_ends_at, sessions_total)
  values (c_program, c_pack, c_priya, 'pack', now() - interval '50 days', now() + interval '70 days', 10)
  returning id into v_m;
  insert into public.host_charges (program_id, user_id, kind, pass_id, membership_id, amount_cents, currency, status, method, paid_at, created_at)
  values (c_program, c_priya, 'pack', c_pack, v_m, 7000, 'CAD', 'paid', 'app', now() - interval '50 days', now() - interval '50 days');
  insert into public.host_pass_uses (membership_id, session_id, user_id, used_at)
  select v_m, s.id, c_priya, s.starts_at
  from public.host_sessions s
  where s.series_id in (c_tue, c_thu) and s.starts_at < now() and s.starts_at > now() - interval '50 days'
  order by s.starts_at desc limit 6;
  for v_i in 1..6 loop
    v_u := ('c6100000-0000-4000-8000-' || lpad((30 + v_i)::text, 12, '0'))::uuid;  -- new faces
    insert into public.host_memberships (program_id, pass_id, user_id, kind, started_at, period_ends_at, sessions_total)
    values (c_program, c_pack, v_u, 'pack',
            case when v_i = 1 then v_start + v_span * 0.9 else now() - make_interval(days => 3 + v_i * 4) end,
            now() + interval '110 days', 10)
    returning id into v_m;
    insert into public.host_charges (program_id, user_id, kind, pass_id, membership_id, amount_cents, currency, status, method, paid_at, created_at)
    values (c_program, v_u, 'pack', c_pack, v_m, 7000, 'CAD', 'paid', 'app',
            case when v_i = 1 then v_start + v_span * 0.9 else now() - make_interval(days => 3 + v_i * 4) end,
            case when v_i = 1 then v_start + v_span * 0.9 else now() - make_interval(days => 3 + v_i * 4) end);
  end loop;

  -- 4. Drop-ins. Tonight: Sam and Rina paid, Dayo paid and was refunded when Rina took his spot.
  select * into v_tonight from public.host_sessions where series_id = c_tue and starts_at > now() order by starts_at limit 1;
  insert into public.host_charges (program_id, user_id, kind, session_id, amount_cents, currency, status, method, paid_at, created_at)
  values (c_program, c_sam, 'drop_in', v_tonight.id, 800, 'CAD', 'paid', 'app', v_start + v_span * 0.2, v_start + v_span * 0.2),
         (c_program, c_rina, 'drop_in', v_tonight.id, 800, 'CAD', 'paid', 'app', v_start + v_span * 0.95, v_start + v_span * 0.95),
         (c_program, c_dayo, 'drop_in', v_tonight.id, 800, 'CAD', 'paid', 'app', v_start + v_span * 0.1, v_start + v_span * 0.1);
  insert into public.host_refunds (program_id, charge_id, user_id, amount_cents, currency, reason, related_user_id, created_at)
  select c_program, c.id, c_dayo, 800, 'CAD', 'spot_filled', c_rina, v_start + v_span * 0.96
  from public.host_charges c where c.session_id = v_tonight.id and c.user_id = c_dayo;
  insert into public.host_ops_audit (program_id, action, subject_type, subject_id, amount_cents, detail, created_at)
  select c_program, 'refund_auto', 'host_refund', r.id, 800,
         jsonb_build_object('reason', 'spot_filled', 'user_id', c_dayo, 'related_user_id', c_rina, 'provider', 'none'), r.created_at
  from public.host_refunds r where r.user_id = c_dayo and r.program_id = c_program;

  -- 19 more drop-ins this week, over the next Thursday and the last Tuesday and Thursday (4 sessions in
  -- all with tonight), paid by occasional players. 19 earlier in the month, and 3 refunds then.
  select array_agg(id order by starts_at) into v_sessions from (
    (select id, starts_at from public.host_sessions where series_id = c_thu and starts_at > now() order by starts_at limit 1)
    union all
    (select id, starts_at from public.host_sessions where series_id in (c_tue, c_thu) and starts_at < now()
     order by starts_at desc limit 2)
  ) x;
  select array_agg(('c6100000-0000-4000-8000-' || lpad((50 + i)::text, 12, '0'))::uuid order by i) into v_people
  from generate_series(1, 50) i;
  for v_i in 1..19 loop
    insert into public.host_charges (program_id, user_id, kind, session_id, amount_cents, currency, status, method, paid_at, created_at)
    values (c_program, v_people[v_i], 'drop_in', v_sessions[1 + (v_i - 1) % 3], 800, 'CAD', 'paid',
            case when v_i % 5 = 0 then 'at_field' else 'app' end::public.host_charge_method,
            v_start + v_span * (v_i / 20.0), v_start + v_span * (v_i / 20.0));
  end loop;
  for v_i in 1..19 loop
    insert into public.host_charges (program_id, user_id, kind, session_id, amount_cents, currency, status, method, paid_at, created_at)
    select c_program, v_people[20 + v_i], 'drop_in', s.id, 800, 'CAD', 'paid', 'app', s.starts_at - interval '1 day',
           s.starts_at - interval '1 day'
    from public.host_sessions s
    where s.series_id in (c_tue, c_thu) and s.starts_at < v_start - interval '1 day'
    order by s.starts_at desc offset v_i % 6 limit 1;
  end loop;
  insert into public.host_refunds (program_id, charge_id, user_id, amount_cents, currency, reason, status, created_at)
  select c_program, c.id, c.user_id, 800, 'CAD', 'spot_filled', 'succeeded', c.paid_at + interval '20 hours'
  from public.host_charges c
  where c.program_id = c_program and c.kind = 'drop_in' and c.paid_at < v_start - interval '1 day'
  order by c.paid_at desc limit 3;

  -- The 30 days before that (so HostInsights has a "before"): 16 renewals, 38 drop-ins, 4 packs.
  insert into public.host_charges (program_id, user_id, kind, pass_id, amount_cents, currency, status, method, paid_at, created_at)
  select c_program, m.user_id, 'monthly_renewal', c_monthly, 3500, 'CAD', 'paid', 'app',
         v_month - interval '1 month', v_month - interval '1 month'
  from public.host_program_members m where m.program_id = c_program and m.user_id <> c_lena
  order by m.user_id limit 16;
  insert into public.host_charges (program_id, user_id, kind, session_id, amount_cents, currency, status, method, paid_at, created_at)
  select c_program, v_people[x.n], 'drop_in', x.sid, 800, 'CAD', 'paid', 'app', x.at - interval '1 day', x.at - interval '1 day'
  from (
    select s.id as sid, s.starts_at as at, row_number() over (order by s.starts_at, g) as n
    from public.host_sessions s, generate_series(1, 5) g
    where s.series_id in (c_tue, c_thu) and s.starts_at between now() - interval '58 days' and now() - interval '32 days'
  ) x where x.n <= 38;
  insert into public.host_charges (program_id, user_id, kind, pass_id, amount_cents, currency, status, method, paid_at, created_at)
  select c_program, v_people[40 + i], 'pack', c_pack, 7000, 'CAD', 'paid', 'app',
         now() - make_interval(days => 33 + i * 5), now() - make_interval(days => 33 + i * 5)
  from generate_series(1, 4) i;

  -- 5. Past payouts (frozen, as the designs show them). PAID: no provider is connected, so in the app
  --    these would wait as 'scheduled'; the sample history shows the finished state.
  insert into public.host_payouts (program_id, period_start, period_end, pays_on, currency, gross_cents, refunds_cents,
                                   fee_cents, net_cents, session_count, pass_count, refund_count, note, lines, status, paid_at)
  select c_program, v_start - make_interval(days => 7 * x.k), v_start - make_interval(days => 7 * (x.k - 1)),
         ((v_start - make_interval(days => 7 * (x.k - 1))) at time zone v_tz)::date, 'CAD',
         x.gross, x.refunds, x.fee, x.gross - x.refunds - x.fee, x.sessions, x.passes, x.refund_n, x.note,
         x.lines::jsonb, 'paid', v_start - make_interval(days => 7 * (x.k - 1)) + interval '9 hours'
  from (values
    (1, 42800, 800, 3400, 5, 6, 1, null,
     '[{"kind":"drop_in","count":26,"unit_cents":800,"amount_cents":20800},{"kind":"monthly_renewal","count":4,"unit_cents":3500,"amount_cents":14000},{"kind":"pack","count":1,"unit_cents":7000,"amount_cents":7000}]'),
    (2, 43700, 0, 3500, 5, 7, 0, null,
     '[{"kind":"drop_in","count":21,"unit_cents":800,"amount_cents":16800},{"kind":"monthly_renewal","count":4,"unit_cents":3500,"amount_cents":14000},{"kind":"pack","count":1,"unit_cents":7000,"amount_cents":7000},{"kind":"monthly","count":1,"unit_cents":3500,"amount_cents":3500}]'),
    (3, 37400, 0, 3000, 4, 5, 0, 'rain-out on Thursday',
     '[{"kind":"drop_in","count":18,"unit_cents":800,"amount_cents":14400},{"kind":"monthly_renewal","count":4,"unit_cents":3500,"amount_cents":14000},{"kind":"pack","count":1,"unit_cents":7000,"amount_cents":7000}]')
  ) x(k, gross, refunds, fee, sessions, passes, refund_n, note, lines);

  -- 6. Winter League ------------------------------------------------------------------------------------------
  -- Round 3 is the coming Saturday (today if it's Saturday morning); rounds are a week apart.
  v_sat3 := v_today + (6 - extract(isodow from v_today)::int + 7) % 7;
  if v_sat3 = v_today and now() > (v_today + time '12:00')::timestamp at time zone v_tz then
    v_sat3 := v_sat3 + 7;
  end if;
  insert into public.host_leagues (id, program_id, name, sport_id, place_id, venue_label, rounds_total, meetings,
                                   starts_on, min_players, created_by, created_at)
  values (c_league, c_program, 'Winter League', 'football', c_jeanne, 'Jeanne-Mance', 10, 2, v_sat3 - 14, 7, c_ade,
          now() - interval '40 days');
  insert into public.host_league_rounds (league_id, number, plays_on)
  select c_league, n, v_sat3 + (n - 3) * 7 from generate_series(1, 10) n;
  select array_agg(id order by number) into v_round from public.host_league_rounds where league_id = c_league;
  for v_i in 1..6 loop
    insert into public.host_league_teams (id, league_id, name, created_at)
    values (('c7100000-0000-4000-8000-' || lpad(v_i::text, 12, '0'))::uuid, c_league, v_teams[v_i],
            now() - interval '40 days' + make_interval(mins => v_i));
  end loop;
  select array_agg(id order by created_at) into v_team from public.host_league_teams where league_id = c_league;
  -- 64 players (≈11 a team, the first of each is the captain) and 9 free agents (3 of them referee).
  insert into public.host_league_members (league_id, user_id, team_id)
  select c_league, p.id, v_team[1 + (p.rn - 1) % 6]
  from (select pr.id, row_number() over (order by pr.id) as rn from public.profiles pr
        where pr.id::text like 'c6100000-%' and pr.id not in (c_kofi, c_priya, c_rina)) p
  where p.rn <= 64;
  update public.host_league_teams t set captain_id = (
    select m.user_id from public.host_league_members m where m.team_id = t.id order by m.user_id limit 1)
   where t.league_id = c_league;
  insert into public.host_league_members (league_id, user_id, can_referee)
  values (c_league, c_yara, true), (c_league, c_kofi, true), (c_league, c_chimdi, true), (c_league, c_priya, false),
         (c_league, c_rina, false), (c_league, c_sam, false), (c_league, c_lena, false),
         (c_league, 'a0000000-0000-4000-8000-000000000003', false), (c_league, c_dayo, false);

  -- Fixtures: team numbers 1 Mile End, 2 Thursday FC, 3 Lachine, 4 Plateau Crew, 5 Saint-Henri,
  -- 6 Concordia. Rounds 1–5 meet everyone once; 6–10 again with home and away swapped.
  insert into public.host_league_fixtures (league_id, round_id, home_team_id, away_team_id, kicks_off_at, pitch)
  select c_league, v_round[x.r + leg * 5],
         v_team[case when leg = 0 then x.h else x.a end], v_team[case when leg = 0 then x.a else x.h end],
         ((v_sat3 + (x.r + leg * 5 - 3) * 7) + x.t)::timestamp at time zone v_tz, 'Turf 1'
  from (values
    (1, 2, 6, time '09:00'), (1, 1, 5, time '10:15'), (1, 3, 4, time '11:30'),
    (2, 1, 6, time '09:00'), (2, 3, 5, time '10:15'), (2, 2, 4, time '11:30'),
    (3, 1, 2, time '09:00'), (3, 3, 6, time '10:15'), (3, 4, 5, time '11:30'),
    (4, 1, 3, time '09:00'), (4, 2, 5, time '10:15'), (4, 4, 6, time '11:30'),
    (5, 1, 4, time '09:00'), (5, 2, 3, time '10:15'), (5, 5, 6, time '11:30')
  ) x(r, h, a, t)
  cross join generate_series(0, 1) leg;

  -- Confirmed results (rounds 1 and 2). Yara reffed two of them.
  insert into public.host_league_results (fixture_id, league_id, home_team_id, away_team_id, home_goals, away_goals,
                                          source, confirmed_by, confirmed_at)
  select f.id, c_league, f.home_team_id, f.away_team_id, x.hg, x.ag, 'captains_agree', c_ade, f.kicks_off_at + interval '3 hours'
  from (values (2, 6, 2, 1), (1, 5, 3, 1), (3, 4, 2, 2), (1, 6, 2, 0), (3, 5, 1, 1)) x(h, a, hg, ag)
  join public.host_league_fixtures f on f.league_id = c_league and f.home_team_id = v_team[x.h] and f.away_team_id = v_team[x.a]
   and f.round_id in (v_round[1], v_round[2]);
  update public.host_league_fixtures set status = 'played'
   where id in (select fixture_id from public.host_league_results where league_id = c_league);
  update public.host_league_fixtures set referee_id = c_yara, referee_status = 'accepted', referee_asked_at = kicks_off_at - interval '5 days'
   where league_id = c_league and ((round_id = v_round[1] and home_team_id = v_team[2])
                                   or (round_id = v_round[2] and home_team_id = v_team[3]));

  -- Round 2's Thursday FC v Plateau Crew was rained out and played last Thursday evening: both captains
  -- sent 4–2, 13 of 14 checked in at the pitch. RESULT TO CONFIRM.
  select f.id into v_f from public.host_league_fixtures f
   where f.round_id = v_round[2] and f.home_team_id = v_team[2] and f.away_team_id = v_team[4];
  update public.host_league_fixtures
     set rescheduled_from = kicks_off_at, status = 'played',
         kicks_off_at = (select ((d + time '19:30')::timestamp at time zone v_tz)
                         from (select v_today - ((extract(isodow from v_today)::int - 4 + 7) % 7) as d0) z,
                              lateral (select case when ((z.d0 + time '19:30')::timestamp at time zone v_tz) > now() - interval '2 hours'
                                                   then z.d0 - 7 else z.d0 end as d) w)
   where id = v_f;
  insert into public.host_league_result_submissions (fixture_id, team_id, submitted_by, home_goals, away_goals, created_at)
  select v_f, t.id, t.captain_id, 4, 2, f.kicks_off_at + make_interval(mins => 100 + row_number() over (order by t.id)::int * 7)
  from public.host_league_teams t, public.host_league_fixtures f
  where f.id = v_f and t.id in (v_team[2], v_team[4]);
  insert into public.host_league_fixture_players (fixture_id, user_id, team_id, in_at, checked_in_at)
  select v_f, m.user_id, m.team_id, f.kicks_off_at - interval '2 days',
         case when m.rn = 7 and m.team_id = v_team[4] then null else f.kicks_off_at - interval '10 minutes' end
  from (select mm.*, row_number() over (partition by mm.team_id order by mm.user_id) as rn
        from public.host_league_members mm where mm.team_id in (v_team[2], v_team[4])) m,
       public.host_league_fixtures f
  where f.id = v_f and m.rn <= 7;

  -- Round 3 (this Saturday): refs Kofi A at 9:00 and Chimdi O at 11:30, nobody yet at 10:15.
  update public.host_league_fixtures set referee_id = c_kofi, referee_status = 'accepted', referee_asked_at = now() - interval '4 days'
   where round_id = v_round[3] and home_team_id = v_team[1];
  update public.host_league_fixtures set referee_id = c_chimdi, referee_status = 'accepted', referee_asked_at = now() - interval '3 days'
   where round_id = v_round[3] and home_team_id = v_team[4];
  -- Who's in: 7 + 8, 9 + 6, 8 + 7.
  insert into public.host_league_fixture_players (fixture_id, user_id, team_id, in_at)
  select f.id, m.user_id, m.team_id, now() - make_interval(hours => m.rn::int)
  from public.host_league_fixtures f
  join (values (1, 7, 8), (3, 9, 6), (4, 8, 7)) x(home, home_in, away_in) on f.home_team_id = v_team[x.home]
  join (select mm.*, row_number() over (partition by mm.team_id order by mm.user_id) as rn
        from public.host_league_members mm where mm.team_id is not null) m
    on (m.team_id = f.home_team_id and m.rn <= x.home_in) or (m.team_id = f.away_team_id and m.rn <= x.away_in)
  where f.round_id = v_round[3];
end;
$$;

commit;
