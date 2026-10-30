-- Step 6 BE-HOST-OPS: league / season operations (HostSeason; PRD §13 tournament & season operations,
-- §9.15). Schema: 20261030210000_host_ops_schema.sql. Contract: docs/HOSTS_OPS_CONTRACT.md.
--
-- Captains send a score; the host confirms it (CONFIRM RESULT) or disputes it. A confirmed result is a
-- host_league_results row, insert-only: standings are computed from those rows on every read, with the
-- tie-breaks points → goal difference → goals scored (then name, so the order is stable). Nothing is
-- ever rewritten; a wrong result is not edited after confirmation.

-- Helpers ------------------------------------------------------------------------------------------------

create or replace function private.host_league_for_host(p_league uuid, p_uid uuid)
returns public.host_leagues
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.host_leagues%rowtype;
begin
  select * into v from public.host_leagues where id = p_league;
  if not found then
    perform private.fail('league_not_found');
  end if;
  perform private.host_require(v.program_id, p_uid);
  return v;
end;
$$;

create or replace function private.host_fixture_for_host(p_fixture uuid, p_uid uuid)
returns public.host_league_fixtures
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.host_league_fixtures%rowtype;
begin
  select * into v from public.host_league_fixtures where id = p_fixture for update;
  if not found then
    perform private.fail('fixture_not_found');
  end if;
  perform private.host_league_for_host(v.league_id, p_uid);
  return v;
end;
$$;

create or replace function private.host_team(p_team uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', t.id, 'name', t.name, 'crew_id', t.crew_id, 'captain_id', t.captain_id)
  from public.host_league_teams t where t.id = p_team;
$$;

-- Captain ids of a fixture's two teams.
create or replace function private.host_fixture_captains(p_fixture uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[h.captain_id, a.captain_id], null)
  from public.host_league_fixtures f
  join public.host_league_teams h on h.id = f.home_team_id
  join public.host_league_teams a on a.id = f.away_team_id
  where f.id = p_fixture;
$$;

-- A notification about a league fixture, to people with a session to anchor it to (see host_ops_notify).
create or replace function private.host_league_notify(p_users uuid[], p_league uuid, p_actor uuid, p_bundle text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u uuid;
  v_program uuid := authz.league_program(p_league);
begin
  foreach v_u in array coalesce(p_users, '{}') loop
    if v_u is distinct from p_actor then
      perform private.host_ops_notify(v_u, v_program, p_actor, p_bundle,
                                      coalesce(p_data, '{}') || jsonb_build_object('league_id', p_league));
    end if;
  end loop;
end;
$$;

-- Standings -------------------------------------------------------------------------------------------------

-- Computed from confirmed results only. Tie-breaks: points, goal difference, goals scored, then name.
-- pending_count: fixtures already played (kick-off passed) with no confirmed result ("a game in hand
-- until you confirm").
create or replace function public.host_league_standings(p_league_id uuid)
returns table (
  "position" integer,
  team_id uuid,
  team_name text,
  played integer,
  won integer,
  drawn integer,
  lost integer,
  goals_for integer,
  goals_against integer,
  goal_difference integer,
  points integer,
  pending_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_l public.host_leagues%rowtype;
begin
  select * into v_l from public.host_leagues where id = p_league_id;
  if not found or not authz.can_see_league(p_league_id, v_uid) then
    perform private.fail('league_not_found');
  end if;
  return query
  with games as (
    select r.home_team_id as team, r.home_goals as gf, r.away_goals as ga from public.host_league_results r
    where r.league_id = p_league_id
    union all
    select r.away_team_id, r.away_goals, r.home_goals from public.host_league_results r
    where r.league_id = p_league_id
  ), agg as (
    select t.id, t.name,
           count(g.team)::int as p,
           count(*) filter (where g.gf > g.ga)::int as w,
           count(*) filter (where g.gf = g.ga)::int as d,
           count(*) filter (where g.gf < g.ga)::int as l,
           coalesce(sum(g.gf), 0)::int as gf,
           coalesce(sum(g.ga), 0)::int as ga
    from public.host_league_teams t
    left join games g on g.team = t.id
    where t.league_id = p_league_id
    group by t.id, t.name
  ), pend as (
    select x.team, count(*)::int as n from (
      select f.home_team_id as team, f.id from public.host_league_fixtures f
      where f.league_id = p_league_id and f.status in ('scheduled', 'played') and f.kicks_off_at < now()
        and not exists (select 1 from public.host_league_results r where r.fixture_id = f.id)
      union all
      select f.away_team_id, f.id from public.host_league_fixtures f
      where f.league_id = p_league_id and f.status in ('scheduled', 'played') and f.kicks_off_at < now()
        and not exists (select 1 from public.host_league_results r where r.fixture_id = f.id)
    ) x group by x.team
  )
  select (row_number() over (order by a.w * v_l.points_win + a.d * v_l.points_draw desc,
                                       a.gf - a.ga desc, a.gf desc, a.name))::int,
         a.id, a.name, a.p, a.w, a.d, a.l, a.gf, a.ga, a.gf - a.ga,
         a.w * v_l.points_win + a.d * v_l.points_draw,
         coalesce(pd.n, 0)
  from agg a left join pend pd on pd.team = a.id
  order by 1;
end;
$$;

-- Setup ---------------------------------------------------------------------------------------------------

-- A new league / season. Idempotent with a key.
create or replace function public.create_host_league(
  p_program_id uuid,
  p_name text,
  p_sport_id text,
  p_starts_on date,
  p_rounds_total integer,
  p_idempotency_key uuid,
  p_venue_label text default null,
  p_place_id uuid default null,
  p_meetings integer default 2,
  p_min_players integer default 7
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_id uuid;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_host_league:' || p_program_id);
  if v_prior is not null then
    return (v_prior ->> 'id')::uuid;
  end if;
  perform private.host_require(p_program_id, v_uid);
  if p_name is null or char_length(trim(p_name)) not between 1 and 40 or char_length(p_venue_label) > 60
     or p_rounds_total is null or p_rounds_total not between 1 and 60 or p_starts_on is null
     or p_meetings not between 1 and 4 or p_min_players not between 1 and 30 then
    perform private.fail('league_invalid');
  end if;
  if not exists (select 1 from public.sports where id = p_sport_id) then
    perform private.fail('sport_unknown');
  end if;
  insert into public.host_leagues (program_id, name, sport_id, place_id, venue_label, rounds_total, meetings,
                                   starts_on, min_players, created_by)
  values (p_program_id, trim(p_name), p_sport_id, p_place_id, nullif(trim(p_venue_label), ''), p_rounds_total,
          coalesce(p_meetings, 2), p_starts_on, coalesce(p_min_players, 7), v_uid)
  returning id into v_id;
  insert into public.host_league_rounds (league_id, number, plays_on)
  select v_id, n, p_starts_on + (n - 1) * 7 from generate_series(1, p_rounds_total) n;
  perform private.host_audit(p_program_id, v_uid, 'league_created', 'host_league', v_id);
  perform private.emit('host_league_created', v_uid, jsonb_build_object('program_id', p_program_id));
  perform private.idem_store(v_uid, p_idempotency_key, jsonb_build_object('id', v_id));
  return v_id;
end;
$$;

-- Add a team (or update its captain / crew). Set-to-state by (league, name).
create or replace function public.upsert_host_league_team(
  p_league_id uuid, p_name text, p_captain_id uuid default null, p_crew_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_l public.host_leagues%rowtype;
  v_id uuid;
begin
  v_l := private.host_league_for_host(p_league_id, v_uid);
  if p_name is null or char_length(trim(p_name)) not between 1 and 40 then
    perform private.fail('league_invalid', 'name');
  end if;
  if p_captain_id is not null and not exists (select 1 from public.profiles where id = p_captain_id) then
    perform private.fail('user_not_found');
  end if;
  insert into public.host_league_teams (league_id, name, captain_id, crew_id)
  values (p_league_id, trim(p_name), p_captain_id, p_crew_id)
  on conflict (league_id, name) do update set captain_id = excluded.captain_id, crew_id = excluded.crew_id
  returning id into v_id;
  if p_captain_id is not null then
    insert into public.host_league_members (league_id, user_id, team_id) values (p_league_id, p_captain_id, v_id)
    on conflict (league_id, user_id) do update set team_id = excluded.team_id;
  end if;
  return v_id;
end;
$$;

-- Put a person on a team, or on the free-agent list (p_team_id null). Set-to-state.
create or replace function public.set_host_league_member(
  p_league_id uuid, p_user_id uuid, p_team_id uuid default null, p_can_referee boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.host_league_for_host(p_league_id, v_uid);
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform private.fail('user_not_found');
  end if;
  if p_team_id is not null and not exists (select 1 from public.host_league_teams where id = p_team_id and league_id = p_league_id) then
    perform private.fail('team_not_found');
  end if;
  insert into public.host_league_members (league_id, user_id, team_id, can_referee)
  values (p_league_id, p_user_id, p_team_id, coalesce(p_can_referee, false))
  on conflict (league_id, user_id) do update set team_id = excluded.team_id, can_referee = excluded.can_referee;
end;
$$;

-- Fill the season: everyone plays everyone `meetings` times (circle method), one round a week from
-- starts_on, kick-offs p_slot_minutes apart from p_first_kickoff's local time. Only on a league with no
-- fixtures yet. Idempotent with a key. Returns the number of fixtures.
create or replace function public.generate_host_league_fixtures(
  p_league_id uuid, p_first_kickoff time, p_slot_minutes integer, p_idempotency_key uuid, p_pitch text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_l public.host_leagues%rowtype;
  v_tz text;
  v_teams uuid[];
  v_n integer;
  v_rounds_per_leg integer;
  v_round integer;
  v_leg integer;
  v_i integer;
  v_slot integer;
  v_home uuid;
  v_away uuid;
  v_rot uuid[];
  v_round_id uuid;
  v_plays date;
  v_count integer := 0;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'generate_host_league_fixtures:' || p_league_id);
  if v_prior is not null then
    return (v_prior ->> 'count')::integer;
  end if;
  v_l := private.host_league_for_host(p_league_id, v_uid);
  if exists (select 1 from public.host_league_fixtures where league_id = p_league_id) then
    perform private.fail('league_invalid', 'fixtures_exist');
  end if;
  if p_first_kickoff is null or p_slot_minutes not between 15 and 240 or char_length(p_pitch) > 30 then
    perform private.fail('league_invalid', 'slots');
  end if;
  select time_zone into v_tz from public.host_programs where id = v_l.program_id;
  select array_agg(id order by created_at, name) into v_teams from public.host_league_teams where league_id = p_league_id;
  v_n := coalesce(cardinality(v_teams), 0);
  if v_n < 2 then
    perform private.fail('league_invalid', 'teams');
  end if;
  if v_n % 2 = 1 then
    v_teams := v_teams || null::uuid; -- a bye
    v_n := v_n + 1;
  end if;
  v_rounds_per_leg := v_n - 1;
  for v_leg in 1 .. v_l.meetings loop
    v_rot := v_teams;
    for v_round in 1 .. v_rounds_per_leg loop
      exit when (v_leg - 1) * v_rounds_per_leg + v_round > v_l.rounds_total;
      select id, plays_on into v_round_id, v_plays from public.host_league_rounds
       where league_id = p_league_id and number = (v_leg - 1) * v_rounds_per_leg + v_round;
      v_slot := 0;
      for v_i in 1 .. v_n / 2 loop
        v_home := v_rot[v_i];
        v_away := v_rot[v_n + 1 - v_i];
        if v_home is not null and v_away is not null then
          -- Alternate home and away by round and leg.
          if (v_round + v_leg) % 2 = 0 then
            v_home := v_rot[v_n + 1 - v_i];
            v_away := v_rot[v_i];
          end if;
          insert into public.host_league_fixtures (league_id, round_id, home_team_id, away_team_id, kicks_off_at, pitch)
          values (p_league_id, v_round_id, v_home, v_away,
                  ((v_plays + p_first_kickoff + make_interval(mins => v_slot * p_slot_minutes))::timestamp at time zone v_tz),
                  nullif(trim(p_pitch), ''));
          v_slot := v_slot + 1;
          v_count := v_count + 1;
        end if;
      end loop;
      -- Rotate every team but the first one place.
      v_rot := array[v_rot[1]] || array[v_rot[v_n]] || v_rot[2:v_n - 1];
    end loop;
  end loop;
  perform private.host_audit(v_l.program_id, v_uid, 'fixtures_generated', 'host_league', p_league_id, null,
                             jsonb_build_object('count', v_count));
  perform private.idem_store(v_uid, p_idempotency_key, jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

-- One fixture by hand. Idempotent with a key.
create or replace function public.schedule_host_league_fixture(
  p_league_id uuid, p_round_number integer, p_home_team_id uuid, p_away_team_id uuid, p_kicks_off_at timestamptz,
  p_idempotency_key uuid, p_pitch text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_l public.host_leagues%rowtype;
  v_round uuid;
  v_id uuid;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'schedule_host_league_fixture:' || p_league_id);
  if v_prior is not null then
    return (v_prior ->> 'id')::uuid;
  end if;
  v_l := private.host_league_for_host(p_league_id, v_uid);
  select id into v_round from public.host_league_rounds where league_id = p_league_id and number = p_round_number;
  if v_round is null or p_kicks_off_at is null or p_home_team_id = p_away_team_id or char_length(p_pitch) > 30 then
    perform private.fail('league_invalid', 'fixture');
  end if;
  if (select count(*) from public.host_league_teams where league_id = p_league_id
        and id in (p_home_team_id, p_away_team_id)) <> 2 then
    perform private.fail('team_not_found');
  end if;
  insert into public.host_league_fixtures (league_id, round_id, home_team_id, away_team_id, kicks_off_at, pitch)
  values (p_league_id, v_round, p_home_team_id, p_away_team_id, p_kicks_off_at, nullif(trim(p_pitch), ''))
  returning id into v_id;
  perform private.idem_store(v_uid, p_idempotency_key, jsonb_build_object('id', v_id));
  return v_id;
end;
$$;

-- Rain-out: move a fixture that has no confirmed result. Set-to-state.
create or replace function public.reschedule_host_league_fixture(p_fixture_id uuid, p_kicks_off_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_f public.host_league_fixtures%rowtype;
  v_l public.host_leagues%rowtype;
begin
  v_f := private.host_fixture_for_host(p_fixture_id, v_uid);
  if exists (select 1 from public.host_league_results where fixture_id = v_f.id) then
    perform private.fail('result_already_verified');
  end if;
  if p_kicks_off_at is null then
    perform private.fail('league_invalid', 'kicks_off_at');
  end if;
  if v_f.kicks_off_at = p_kicks_off_at then
    return;
  end if;
  update public.host_league_fixtures
     set rescheduled_from = coalesce(rescheduled_from, kicks_off_at), kicks_off_at = p_kicks_off_at, status = 'scheduled'
   where id = v_f.id;
  select * into v_l from public.host_leagues where id = v_f.league_id;
  perform private.host_audit(v_l.program_id, v_uid, 'fixture_rescheduled', 'host_league_fixture', v_f.id, null,
                             jsonb_build_object('from', v_f.kicks_off_at, 'to', p_kicks_off_at));
end;
$$;

-- Players --------------------------------------------------------------------------------------------------

-- "I'm in" for a fixture (players on one of its teams). Set-to-state.
create or replace function public.set_league_fixture_in(p_fixture_id uuid, p_in boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_f public.host_league_fixtures%rowtype;
  v_team uuid;
begin
  select * into v_f from public.host_league_fixtures where id = p_fixture_id;
  if not found or not authz.can_see_league(v_f.league_id, v_uid) then
    perform private.fail('fixture_not_found');
  end if;
  v_team := authz.league_team(v_f.league_id, v_uid);
  if v_team is null or v_team not in (v_f.home_team_id, v_f.away_team_id) then
    perform private.fail('not_on_team');
  end if;
  if v_f.status in ('played', 'cancelled') or exists (select 1 from public.host_league_results where fixture_id = v_f.id) then
    perform private.fail('fixture_closed');
  end if;
  if p_in then
    insert into public.host_league_fixture_players (fixture_id, user_id, team_id) values (v_f.id, v_uid, v_team)
    on conflict (fixture_id, user_id) do nothing;
  else
    delete from public.host_league_fixture_players where fixture_id = v_f.id and user_id = v_uid and checked_in_at is null;
  end if;
end;
$$;

-- Checked in at the pitch: the player from 60 minutes before kick-off, or a host marking someone.
-- Set-to-state.
create or replace function public.check_in_league_fixture(p_fixture_id uuid, p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_f public.host_league_fixtures%rowtype;
  v_who uuid := coalesce(p_user_id, v_uid);
  v_team uuid;
  v_host boolean;
begin
  select * into v_f from public.host_league_fixtures where id = p_fixture_id;
  if not found or not authz.can_see_league(v_f.league_id, v_uid) then
    perform private.fail('fixture_not_found');
  end if;
  v_host := authz.is_program_host(authz.league_program(v_f.league_id), v_uid);
  if v_who <> v_uid and not v_host then
    perform private.fail('not_program_host');
  end if;
  v_team := authz.league_team(v_f.league_id, v_who);
  if v_team is null or v_team not in (v_f.home_team_id, v_f.away_team_id) then
    perform private.fail('not_on_team');
  end if;
  if not v_host and now() < v_f.kicks_off_at - interval '60 minutes' then
    perform private.fail('check_in_not_open', (v_f.kicks_off_at - interval '60 minutes')::text);
  end if;
  if exists (select 1 from public.host_league_results where fixture_id = v_f.id) then
    perform private.fail('fixture_closed');
  end if;
  insert into public.host_league_fixture_players (fixture_id, user_id, team_id, checked_in_at)
  values (v_f.id, v_who, v_team, now())
  on conflict (fixture_id, user_id) do update
    set checked_in_at = coalesce(public.host_league_fixture_players.checked_in_at, now());
end;
$$;

-- Results ---------------------------------------------------------------------------------------------------

-- A captain (or a host) sends the score once kick-off has passed. A team's newer score replaces its
-- older one. Idempotent with a key.
create or replace function public.submit_league_result(
  p_fixture_id uuid, p_home_goals integer, p_away_goals integer, p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_f public.host_league_fixtures%rowtype;
  v_team uuid;
  v_id uuid;
  v_l public.host_leagues%rowtype;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'submit_league_result:' || p_fixture_id);
  if v_prior is not null then
    return private.host_fixture_result_state(p_fixture_id);
  end if;
  select * into v_f from public.host_league_fixtures where id = p_fixture_id for update;
  if not found or not authz.can_see_league(v_f.league_id, v_uid) then
    perform private.fail('fixture_not_found');
  end if;
  select * into v_l from public.host_leagues where id = v_f.league_id;
  select t.id into v_team from public.host_league_teams t
   where t.id in (v_f.home_team_id, v_f.away_team_id) and t.captain_id = v_uid
   order by t.id = v_f.home_team_id desc limit 1;
  if v_team is null then
    perform private.fail('not_captain');
  end if;
  if exists (select 1 from public.host_league_results where fixture_id = v_f.id) then
    perform private.fail('result_already_verified');
  end if;
  if v_f.status = 'cancelled' or v_f.kicks_off_at > now() then
    perform private.fail('fixture_not_played');
  end if;
  if p_home_goals is null or p_away_goals is null or p_home_goals not between 0 and 99 or p_away_goals not between 0 and 99 then
    perform private.fail('invalid_argument', 'score');
  end if;
  update public.host_league_result_submissions set superseded_at = now()
   where fixture_id = v_f.id and team_id = v_team and superseded_at is null;
  insert into public.host_league_result_submissions (fixture_id, team_id, submitted_by, home_goals, away_goals)
  values (v_f.id, v_team, v_uid, p_home_goals, p_away_goals) returning id into v_id;
  update public.host_league_disputes set resolved_at = now() where fixture_id = v_f.id and resolved_at is null;
  if v_f.status <> 'played' then
    update public.host_league_fixtures set status = 'played' where id = v_f.id;
  end if;
  perform private.emit('host_league_result_submitted', v_uid, jsonb_build_object('league_id', v_f.league_id,
                                                                                 'fixture_id', v_f.id));
  perform private.idem_store(v_uid, p_idempotency_key, jsonb_build_object('id', v_id));
  return private.host_fixture_result_state(v_f.id);
end;
$$;

create or replace function private.host_fixture_result_state(p_fixture uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with f as (select * from public.host_league_fixtures where id = p_fixture),
  subs as (
    select s.* from public.host_league_result_submissions s
    where s.fixture_id = p_fixture and s.superseded_at is null
  )
  select jsonb_build_object(
    'fixture_id', f.id,
    'status', case when r.fixture_id is not null then 'confirmed'
                   when exists (select 1 from public.host_league_disputes d where d.fixture_id = f.id and d.resolved_at is null) then 'disputed'
                   when (select count(*) from subs) = 0 then 'waiting'
                   when (select count(distinct (home_goals, away_goals)) from subs) = 1
                        and (select count(*) from subs) = 2 then 'agreed'
                   when (select count(*) from subs) = 2 then 'differ'
                   else 'one_sent' end,
    'home_goals', coalesce(r.home_goals, (select min(home_goals) from subs having count(distinct (home_goals, away_goals)) = 1)),
    'away_goals', coalesce(r.away_goals, (select min(away_goals) from subs having count(distinct (home_goals, away_goals)) = 1)),
    'submissions', coalesce((select jsonb_agg(jsonb_build_object('team_id', s.team_id, 'home_goals', s.home_goals,
                                                                 'away_goals', s.away_goals, 'submitted_by', s.submitted_by,
                                                                 'created_at', s.created_at) order by s.created_at)
                             from subs s), '[]'::jsonb),
    'confirmed_at', r.confirmed_at,
    'source', r.source
  )
  from f left join public.host_league_results r on r.fixture_id = f.id;
$$;

-- CONFIRM RESULT. Hosts only. Without a score, the captains' agreed score (both sent the same) is
-- confirmed; with one, the host's score is (source host_entered). Inserts the one result row; the
-- standings recompute on the next read. Idempotent with a key; confirming an already confirmed fixture
-- with the same score returns its state, a different score fails result_already_verified.
create or replace function public.confirm_league_result(
  p_fixture_id uuid, p_idempotency_key uuid, p_home_goals integer default null, p_away_goals integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_f public.host_league_fixtures%rowtype;
  v_l public.host_leagues%rowtype;
  v_state jsonb;
  v_r public.host_league_results%rowtype;
  v_home integer;
  v_away integer;
  v_source public.host_league_result_source;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'confirm_league_result:' || p_fixture_id);
  if v_prior is not null then
    return private.host_fixture_result_state(p_fixture_id);
  end if;
  v_f := private.host_fixture_for_host(p_fixture_id, v_uid);
  select * into v_l from public.host_leagues where id = v_f.league_id;
  select * into v_r from public.host_league_results where fixture_id = v_f.id;
  if found then
    if (p_home_goals is null or p_home_goals = v_r.home_goals) and (p_away_goals is null or p_away_goals = v_r.away_goals) then
      perform private.idem_store(v_uid, p_idempotency_key, '{}');
      return private.host_fixture_result_state(v_f.id);
    end if;
    perform private.fail('result_already_verified');
  end if;
  if v_f.status = 'cancelled' or v_f.kicks_off_at > now() then
    perform private.fail('fixture_not_played');
  end if;
  v_state := private.host_fixture_result_state(v_f.id);
  if p_home_goals is not null or p_away_goals is not null then
    if p_home_goals is null or p_away_goals is null or p_home_goals not between 0 and 99 or p_away_goals not between 0 and 99 then
      perform private.fail('invalid_argument', 'score');
    end if;
    v_home := p_home_goals;
    v_away := p_away_goals;
    v_source := case when v_state ->> 'status' = 'agreed' and (v_state ->> 'home_goals')::int = p_home_goals
                          and (v_state ->> 'away_goals')::int = p_away_goals then 'captains_agree' else 'host_entered' end;
  elsif v_state ->> 'status' = 'agreed' then
    v_home := (v_state ->> 'home_goals')::int;
    v_away := (v_state ->> 'away_goals')::int;
    v_source := 'captains_agree';
  else
    perform private.fail('result_not_agreed', v_state ->> 'status');
  end if;
  insert into public.host_league_results (fixture_id, league_id, home_team_id, away_team_id, home_goals, away_goals,
                                          source, confirmed_by)
  values (v_f.id, v_f.league_id, v_f.home_team_id, v_f.away_team_id, v_home, v_away, v_source, v_uid);
  update public.host_league_fixtures set status = 'played' where id = v_f.id and status <> 'played';
  update public.host_league_disputes set resolved_at = now() where fixture_id = v_f.id and resolved_at is null;
  perform private.host_audit(v_l.program_id, v_uid, 'result_confirmed', 'host_league_fixture', v_f.id, null,
                             jsonb_build_object('home_goals', v_home, 'away_goals', v_away, 'source', v_source));
  perform private.host_league_notify(private.host_fixture_captains(v_f.id), v_f.league_id, v_uid,
    'host_league_result:' || v_f.id,
    jsonb_build_object('change', 'league_result_confirmed', 'fixture_id', v_f.id,
      'text', 'Result confirmed: ' || (select name from public.host_league_teams where id = v_f.home_team_id) || ' '
              || v_home || '–' || v_away || ' ' || (select name from public.host_league_teams where id = v_f.away_team_id)
              || '. Standings updated.'));
  perform private.emit('host_league_result_confirmed', v_uid, jsonb_build_object('league_id', v_f.league_id,
                                                                                 'source', v_source));
  perform private.idem_store(v_uid, p_idempotency_key, '{}');
  return private.host_fixture_result_state(v_f.id);
end;
$$;

-- DISPUTE. Hosts only: clears the captains' scores and asks both to send it again. Set-to-state.
create or replace function public.dispute_league_result(p_fixture_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_f public.host_league_fixtures%rowtype;
  v_l public.host_leagues%rowtype;
  v_id uuid;
begin
  v_f := private.host_fixture_for_host(p_fixture_id, v_uid);
  select * into v_l from public.host_leagues where id = v_f.league_id;
  if exists (select 1 from public.host_league_results where fixture_id = v_f.id) then
    perform private.fail('result_already_verified');
  end if;
  if char_length(p_note) > 280 then
    perform private.fail('message_invalid', '0-280');
  end if;
  if exists (select 1 from public.host_league_disputes where fixture_id = v_f.id and resolved_at is null) then
    return private.host_fixture_result_state(v_f.id);
  end if;
  update public.host_league_result_submissions set superseded_at = now()
   where fixture_id = v_f.id and superseded_at is null;
  insert into public.host_league_disputes (fixture_id, raised_by, note)
  values (v_f.id, v_uid, nullif(trim(p_note), '')) returning id into v_id;
  perform private.host_audit(v_l.program_id, v_uid, 'result_disputed', 'host_league_fixture', v_f.id, null,
                             jsonb_build_object('note', nullif(trim(p_note), '')));
  perform private.host_league_notify(private.host_fixture_captains(v_f.id), v_f.league_id, v_uid,
    'host_league_result:' || v_f.id,
    jsonb_build_object('change', 'league_result_disputed', 'fixture_id', v_f.id,
      'text', 'The host asked both captains to send the score again.'));
  perform private.emit('host_league_result_disputed', v_uid, jsonb_build_object('league_id', v_f.league_id));
  return private.host_fixture_result_state(v_f.id);
end;
$$;

-- Referees -----------------------------------------------------------------------------------------------

-- Fixtures someone has refereed (accepted, kicked off).
create or replace function private.host_refs_count(p_league uuid, p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.host_league_fixtures f
  where f.league_id = p_league and f.referee_id = p_user and f.referee_status = 'accepted' and f.kicks_off_at < now();
$$;

-- Who could referee a fixture: league people marked can_referee, not on either team, not playing or
-- refereeing within 75 minutes of it. Most experienced first.
create or replace function private.host_referee_candidates(p_fixture uuid)
returns table (user_id uuid, refs_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, private.host_refs_count(f.league_id, m.user_id)
  from public.host_league_fixtures f
  join public.host_league_members m on m.league_id = f.league_id and m.can_referee
  where f.id = p_fixture
    and (m.team_id is null or m.team_id not in (f.home_team_id, f.away_team_id))
    and not exists (
      select 1 from public.host_league_fixtures o
      where o.league_id = f.league_id and o.id <> f.id and o.status <> 'cancelled'
        and abs(extract(epoch from (o.kicks_off_at - f.kicks_off_at))) < 75 * 60
        and (o.home_team_id = m.team_id or o.away_team_id = m.team_id
             or (o.referee_id = m.user_id and o.referee_status <> 'declined')))
    and not authz.is_blocked(m.user_id, coalesce(auth.uid(), m.user_id))
  order by 2 desc, m.created_at;
$$;

-- ASK YARA TO REF. Hosts only. The person is asked; they answer with respond_league_referee.
-- Idempotent with a key; asking the same person again returns the state.
create or replace function public.ask_league_referee(p_fixture_id uuid, p_user_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_f public.host_league_fixtures%rowtype;
  v_l public.host_leagues%rowtype;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'ask_league_referee:' || p_fixture_id);
  if v_prior is not null then
    return private.host_fixture_referee(p_fixture_id);
  end if;
  v_f := private.host_fixture_for_host(p_fixture_id, v_uid);
  select * into v_l from public.host_leagues where id = v_f.league_id;
  if exists (select 1 from public.host_league_results where fixture_id = v_f.id) or v_f.status = 'cancelled' then
    perform private.fail('fixture_closed');
  end if;
  if v_f.referee_id = p_user_id and v_f.referee_status <> 'declined' then
    perform private.idem_store(v_uid, p_idempotency_key, '{}');
    return private.host_fixture_referee(v_f.id);
  end if;
  if not exists (select 1 from private.host_referee_candidates(v_f.id) c where c.user_id = p_user_id) then
    perform private.fail('referee_unavailable');
  end if;
  update public.host_league_fixtures
     set referee_id = p_user_id, referee_status = 'asked', referee_asked_at = now()
   where id = v_f.id;
  perform private.host_audit(v_l.program_id, v_uid, 'referee_asked', 'host_league_fixture', v_f.id, null,
                             jsonb_build_object('user_id', p_user_id));
  perform private.host_league_notify(array[p_user_id], v_f.league_id, v_uid, 'host_league_ref:' || v_f.id,
    jsonb_build_object('change', 'referee_asked', 'fixture_id', v_f.id,
      'text', 'Can you ref ' || (select name from public.host_league_teams where id = v_f.home_team_id) || ' v '
              || (select name from public.host_league_teams where id = v_f.away_team_id) || ' at '
              || to_char(v_f.kicks_off_at at time zone (select time_zone from public.host_programs where id = v_l.program_id),
                         'Dy FMHH24:MI') || '?'));
  perform private.emit('host_league_referee_asked', v_uid, jsonb_build_object('league_id', v_f.league_id));
  perform private.idem_store(v_uid, p_idempotency_key, '{}');
  return private.host_fixture_referee(v_f.id);
end;
$$;

create or replace function private.host_fixture_referee(p_fixture uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'fixture_id', f.id,
    'referee', case when f.referee_id is not null then private.host_person(f.referee_id) end,
    'referee_status', f.referee_status,
    'refs_count', case when f.referee_id is not null then private.host_refs_count(f.league_id, f.referee_id) end,
    'asked_at', f.referee_asked_at
  )
  from public.host_league_fixtures f where f.id = p_fixture;
$$;

-- The asked person says yes or no. Set-to-state.
create or replace function public.respond_league_referee(p_fixture_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_f public.host_league_fixtures%rowtype;
  v_l public.host_leagues%rowtype;
begin
  select * into v_f from public.host_league_fixtures where id = p_fixture_id for update;
  if not found or v_f.referee_id is distinct from v_uid then
    perform private.fail('fixture_not_found');
  end if;
  select * into v_l from public.host_leagues where id = v_f.league_id;
  update public.host_league_fixtures
     set referee_status = case when p_accept then 'accepted' else 'declined' end::public.host_referee_status
   where id = v_f.id;
  perform private.host_audit(v_l.program_id, v_uid, case when p_accept then 'referee_accepted' else 'referee_declined' end,
                             'host_league_fixture', v_f.id);
  return private.host_fixture_referee(v_f.id);
end;
$$;

-- Take the referee off a fixture. Hosts only. Set-to-state.
create or replace function public.clear_league_referee(p_fixture_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_f public.host_league_fixtures%rowtype;
begin
  v_f := private.host_fixture_for_host(p_fixture_id, v_uid);
  if v_f.referee_id is not null then
    update public.host_league_fixtures set referee_id = null, referee_status = null, referee_asked_at = null where id = v_f.id;
    perform private.host_audit(authz.league_program(v_f.league_id), v_uid, 'referee_cleared', 'host_league_fixture', v_f.id);
  end if;
end;
$$;

-- HostSeason ------------------------------------------------------------------------------------------------

create or replace function private.host_league_current_round(p_league uuid)
returns public.host_league_rounds
language sql
stable
security definer
set search_path = ''
as $$
  select r.* from public.host_league_rounds r
  join public.host_leagues l on l.id = r.league_id
  join public.host_programs p on p.id = l.program_id
  where r.league_id = p_league
  order by (r.plays_on < (now() at time zone p.time_zone)::date), -- upcoming first
           case when r.plays_on >= (now() at time zone p.time_zone)::date then r.number else -r.number end
  limit 1;
$$;

-- Fixtures with kick-off passed, no confirmed result, and a captain's score (or an open dispute), for the
-- host (RESULT TO CONFIRM). Fixtures nobody has reported yet aren't listed; standings count them as a
-- game in hand.
create or replace function private.host_league_pending(p_league uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'fixture_id', f.id,
      'round', r.number,
      'kicks_off_at', f.kicks_off_at,
      'rescheduled_from', f.rescheduled_from,
      'home', private.host_team(f.home_team_id),
      'away', private.host_team(f.away_team_id),
      'result', private.host_fixture_result_state(f.id),
      'players_in', (select count(*) from public.host_league_fixture_players p where p.fixture_id = f.id),
      'checked_in', (select count(*) from public.host_league_fixture_players p
                     where p.fixture_id = f.id and p.checked_in_at is not null)
    ) order by f.kicks_off_at), '[]'::jsonb)
  from public.host_league_fixtures f
  join public.host_league_rounds r on r.id = f.round_id
  where f.league_id = p_league and f.status in ('scheduled', 'played') and f.kicks_off_at < now()
    and not exists (select 1 from public.host_league_results x where x.fixture_id = f.id)
    and (exists (select 1 from public.host_league_result_submissions rs where rs.fixture_id = f.id and rs.superseded_at is null)
         or exists (select 1 from public.host_league_disputes d where d.fixture_id = f.id and d.resolved_at is null));
$$;

-- League operations: the header, results to confirm (hosts), standings, the next round's fixtures with
-- referees and readiness, and the season facts. Anyone who can see the league; host-only parts are
-- empty for others.
create or replace function public.host_league_view(p_league_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_l public.host_leagues%rowtype;
  v_p public.host_programs%rowtype;
  v_host boolean;
  v_round public.host_league_rounds%rowtype;
begin
  select * into v_l from public.host_leagues where id = p_league_id;
  if not found or not authz.can_see_league(p_league_id, v_uid) then
    perform private.fail('league_not_found');
  end if;
  select * into v_p from public.host_programs where id = v_l.program_id;
  v_host := authz.is_program_host(v_l.program_id, v_uid);
  v_round := private.host_league_current_round(p_league_id);
  return jsonb_build_object(
    'league', jsonb_build_object(
      'id', v_l.id, 'program_id', v_l.program_id, 'program_name', v_p.name, 'time_zone', v_p.time_zone,
      'name', v_l.name, 'sport_id', v_l.sport_id, 'venue_label', v_l.venue_label, 'status', v_l.status,
      'rounds_total', v_l.rounds_total, 'meetings', v_l.meetings, 'starts_on', v_l.starts_on,
      'min_players', v_l.min_players, 'points_win', v_l.points_win, 'points_draw', v_l.points_draw,
      'tie_breaks', jsonb_build_array('points', 'goal_difference', 'goals_scored'),
      'team_count', (select count(*) from public.host_league_teams where league_id = v_l.id),
      'player_count', (select count(*) from public.host_league_members where league_id = v_l.id and team_id is not null),
      'free_agent_count', (select count(*) from public.host_league_members where league_id = v_l.id and team_id is null),
      'fixture_count', (select count(*) from public.host_league_fixtures where league_id = v_l.id)
    ),
    'is_host', v_host,
    'to_confirm', case when v_host then private.host_league_pending(v_l.id) else '[]'::jsonb end,
    'standings', (select coalesce(jsonb_agg(to_jsonb(s) order by s."position"), '[]'::jsonb)
                  from public.host_league_standings(v_l.id) s),
    'round', case when v_round.id is not null then jsonb_build_object(
      'number', v_round.number,
      'plays_on', v_round.plays_on,
      'fixtures', coalesce((
        select jsonb_agg(jsonb_build_object(
          'fixture_id', f.id,
          'kicks_off_at', f.kicks_off_at,
          'pitch', f.pitch,
          'status', f.status,
          'home', private.host_team(f.home_team_id),
          'away', private.host_team(f.away_team_id),
          'home_in', (select count(*) from public.host_league_fixture_players p
                      where p.fixture_id = f.id and p.team_id = f.home_team_id),
          'away_in', (select count(*) from public.host_league_fixture_players p
                      where p.fixture_id = f.id and p.team_id = f.away_team_id),
          'home_checked_in', (select count(*) from public.host_league_fixture_players p
                              where p.fixture_id = f.id and p.team_id = f.home_team_id and p.checked_in_at is not null),
          'away_checked_in', (select count(*) from public.host_league_fixture_players p
                              where p.fixture_id = f.id and p.team_id = f.away_team_id and p.checked_in_at is not null),
          'referee', private.host_fixture_referee(f.id),
          'referee_suggestion', case when v_host and (f.referee_id is null or f.referee_status = 'declined') then (
              select jsonb_build_object('person', private.host_person(c.user_id), 'refs_count', c.refs_count)
              from private.host_referee_candidates(f.id) c limit 1) end
        ) order by f.kicks_off_at, f.pitch)
        from public.host_league_fixtures f where f.round_id = v_round.id and f.status <> 'cancelled'), '[]'::jsonb)
    ) end
  );
end;
$$;

-- A program's leagues (HostHome's LEAGUE tool; picking the season to open).
create or replace function public.host_program_leagues(p_program_id uuid)
returns table (
  league_id uuid,
  name text,
  status public.host_league_status,
  rounds_total integer,
  current_round integer,
  current_round_plays_on date,
  team_count integer,
  to_confirm_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_host boolean;
begin
  if not exists (select 1 from public.host_programs where id = p_program_id) then
    perform private.fail('program_not_found');
  end if;
  v_host := authz.is_program_host(p_program_id, v_uid);
  return query
  select l.id, l.name, l.status, l.rounds_total, r.number, r.plays_on,
         (select count(*)::int from public.host_league_teams t where t.league_id = l.id),
         case when v_host then jsonb_array_length(private.host_league_pending(l.id)) else 0 end
  from public.host_leagues l
  left join lateral (select (private.host_league_current_round(l.id)).*) r on true
  where l.program_id = p_program_id and authz.can_see_league(l.id, v_uid)
  order by l.status = 'complete', l.starts_on desc;
end;
$$;

-- BE-HOST-CORE seams (HostHome) -----------------------------------------------------------------------

-- Needs you: refund requests ('refund_request') and league results to confirm ('league_result').
create or replace function private.host_needs_you_ops(p_program uuid)
returns setof public.host_needs_you_item
language sql
stable
security definer
set search_path = ''
as $$
  select 'refund_request', null::uuid, q.id, ps.name, null::timestamptz,
         (count(*) over ())::int,
         array[(select display_name from public.profiles where id = q.user_id)],
         jsonb_build_object('user_id', q.user_id, 'charge_kind', c.kind, 'pass_name', ps.name,
                            'amount_cents', c.amount_cents, 'currency', c.currency, 'paid_at', c.paid_at,
                            'cancelled_at', m.cancelled_at, 'requested_at', q.created_at,
                            'days_in', case when m.cancelled_at is not null and c.paid_at is not null
                                            then extract(day from (m.cancelled_at - c.paid_at))::int end),
         q.created_at
  from public.host_refund_requests q
  join public.host_charges c on c.id = q.charge_id
  left join public.host_memberships m on m.id = c.membership_id
  left join public.host_passes ps on ps.id = c.pass_id
  where q.program_id = p_program and q.status = 'open'
  union all
  select 'league_result', null::uuid, (x ->> 'fixture_id')::uuid, l.name, (x ->> 'kicks_off_at')::timestamptz,
         jsonb_array_length(private.host_league_pending(l.id)),
         array[x -> 'home' ->> 'name', x -> 'away' ->> 'name'],
         jsonb_build_object('league_id', l.id, 'round', (x ->> 'round')::int,
                            'home', x -> 'home', 'away', x -> 'away',
                            'result_status', x -> 'result' ->> 'status',
                            'home_goals', (x -> 'result' ->> 'home_goals')::int,
                            'away_goals', (x -> 'result' ->> 'away_goals')::int,
                            'both_agree', (x -> 'result' ->> 'status') = 'agreed'),
         (x ->> 'kicks_off_at')::timestamptz
  from public.host_leagues l
  cross join lateral jsonb_array_elements(private.host_league_pending(l.id)) x
  where l.program_id = p_program and l.status = 'active'
    and (x -> 'result' ->> 'status') in ('agreed', 'differ', 'one_sent');
$$;

-- THIS WEEK: a league round in the window ("SAT · Winter League · round 3 · 3 fixtures · 6 teams").
create or replace function private.host_week_ops(p_program uuid, p_from timestamptz, p_to timestamptz)
returns setof public.host_week_item
language sql
stable
security definer
set search_path = ''
as $$
  select 'league', null::uuid, null::uuid, l.id, l.name, min(f.kicks_off_at), p.time_zone, 'scheduled',
         null::int, null::int, null::int, null::int, null::int, null::int, null::text, null::boolean, null::boolean,
         jsonb_build_object('round', r.number, 'fixtures', count(f.id),
                            'teams', (select count(*) from public.host_league_teams t where t.league_id = l.id),
                            'plays_on', r.plays_on)
  from public.host_leagues l
  join public.host_programs p on p.id = l.program_id
  join public.host_league_rounds r on r.league_id = l.id
  join public.host_league_fixtures f on f.round_id = r.id and f.status <> 'cancelled'
  where l.program_id = p_program and l.status = 'active'
    and f.kicks_off_at >= p_from and f.kicks_off_at < p_to
  group by l.id, l.name, p.time_zone, r.number, r.plays_on;
$$;
