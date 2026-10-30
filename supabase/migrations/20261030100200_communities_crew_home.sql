-- Step 6 (Communities): Crew Home reads, Crew Momentum, Rituals (crew and clan), the crew Down For
-- board, crew vs crew and memories. Contract: docs/COMMUNITIES_CONTRACT.md §Crew Home, §Rituals.
--
-- Rules (PRD §9.10, §9.12):
--   * Availability is overlap only: counts and the names of crew mates whose availability setting
--     includes you. Never a calendar, never a time slot of anyone.
--   * Momentum is plain counts per week against the crew's rhythm. Missing a week is a comeback,
--     never a lost streak shown as a loss.
--   * Rituals prefill each week's plan; the host is in, everyone else still taps I'M DOWN. Easy to
--     pause, skip a week, edit or end.

create type public.ritual_week_state as (
  ritual_id uuid,
  occurs_on date,
  starts_at timestamptz,
  skipped boolean,
  plan_id uuid,
  clan_run_id uuid
);

-- Time helpers -----------------------------------------------------------------------------------------

-- Monday of the local week that contains p_at.
create or replace function private.local_week_start(p_at timestamptz, p_tz text)
returns date
language sql
stable
set search_path = ''
as $$
  select (date_trunc('week', p_at at time zone p_tz))::date;
$$;

-- The next local date (today or later) that falls on p_dow whose session hasn't started before
-- p_after. p_after = now() for "can still be prefilled", now() − duration for "this week's".
create or replace function private.ritual_next_on(r public.rituals, p_after timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select case when ((d + r.local_time) at time zone r.time_zone) > p_after then d else d + 7 end
  from (
    select today + ((r.day_of_week - extract(isodow from today)::integer + 7) % 7) as d
    from (select (now() at time zone r.time_zone)::date as today) t
  ) x;
$$;

create or replace function private.ritual_starts_at(r public.rituals, p_on date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (p_on + r.local_time) at time zone r.time_zone;
$$;

-- Crew sessions --------------------------------------------------------------------------------------------

-- What counts as the crew moving together (Crew Momentum and memories): a game from one of the
-- crew's plans, any game two or more crew mates checked in to, or a crew vs crew Challenge Event that
-- finished. Things that already happened only.
create or replace function private.crew_sessions(p_crew uuid, p_since timestamptz)
returns table (activity_id uuid, challenge_event_id uuid, starts_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, null::uuid, a.starts_at
  from public.activities a
  join public.plans p on p.id = a.plan_id
  where p.crew_id = p_crew and a.status <> 'cancelled' and a.starts_at >= p_since and a.starts_at <= now()
  union
  select a.id, null::uuid, a.starts_at
  from (
    select t.activity_id
    from public.attendance t
    join public.crew_members m on m.user_id = t.user_id and m.crew_id = p_crew
    where t.status = 'checked_in' and t.checked_in_at >= p_since
    group by t.activity_id
    having count(*) >= 2
  ) together
  join public.activities a on a.id = together.activity_id
  where a.status <> 'cancelled' and a.starts_at >= p_since and a.starts_at <= now()
  union
  select null::uuid, e.id, e.starts_at
  from public.challenge_events e
  where (e.a_crew_id = p_crew or e.b_crew_id = p_crew) and e.status = 'complete' and e.starts_at >= p_since;
$$;

-- Eight weeks of sessions, oldest first (this week last), in the crew's time zone.
create or replace function private.crew_weeks(p_crew uuid)
returns integer[]
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select private.local_week_start(now(), k.time_zone) as monday, k.time_zone from public.crews k where k.id = p_crew
  ),
  s as (
    select private.local_week_start(x.starts_at, c.time_zone) as wk
    from c, private.crew_sessions(p_crew, ((c.monday - 49)::timestamp at time zone c.time_zone)) x
  )
  select array_agg((select count(*)::integer from s where s.wk = c.monday - (7 - i) * 7) order by i)
  from c, generate_series(0, 7) i;
$$;

-- Crew Momentum from the weeks and the rhythm. streak = whole weeks in a row that met the rhythm,
-- ending last week, plus this week once it's met. state: 'on_rhythm' (streak > 0), 'comeback'
-- (no streak now, but the crew met its rhythm in the last eight weeks), 'starting' (not yet).
create or replace function private.crew_momentum(p_weeks integer[], p_target integer)
returns table (streak integer, state text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_n integer := coalesce(cardinality(p_weeks), 0);
  v_streak integer := 0;
  i integer;
begin
  if v_n = 0 then
    return query select 0, 'starting'::text;
    return;
  end if;
  i := v_n - 1;
  while i >= 1 and p_weeks[i] >= p_target loop
    v_streak := v_streak + 1;
    i := i - 1;
  end loop;
  if p_weeks[v_n] >= p_target then
    v_streak := v_streak + 1;
  end if;
  return query select v_streak,
    case when v_streak > 0 then 'on_rhythm'
         when exists (select 1 from unnest(p_weeks) w where w >= p_target) then 'comeback'
         else 'starting' end;
end;
$$;

-- Free tonight (overlap only) ------------------------------------------------------------------------------

-- Crew mates usually free this evening, only those whose availability setting includes you. Names
-- and avatars only; never which slots, never a calendar.
create or replace function private.crew_free_tonight(p_crew uuid, p_uid uuid)
returns table (user_id uuid, display_name text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.display_name, pr.avatar_path
  from public.crew_members m
  join public.profiles pr on pr.id = m.user_id
  where m.crew_id = p_crew and m.user_id <> p_uid
    and not authz.is_blocked(m.user_id, p_uid)
    and authz.can_see_part(m.user_id, 'availability', p_uid)
    and exists (select 1 from public.availability_slots s
                where s.user_id = m.user_id
                  and s.day_of_week = extract(isodow from now() at time zone pr.time_zone)
                  and s.part = 'evening')
  order by pr.display_name, pr.id;
$$;

create or replace function public.crew_free_tonight(p_crew_id uuid)
returns table (user_id uuid, display_name text, avatar_path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not authz.is_crew_member(p_crew_id, v_uid) then
    perform private.fail('crew_not_found');
  end if;
  return query select * from private.crew_free_tonight(p_crew_id, v_uid);
end;
$$;

-- Crew Home header -----------------------------------------------------------------------------------------

create or replace function public.crew_home(p_crew_id uuid)
returns table (
  crew_id uuid,
  name text,
  sport_id text,
  member_count integer,
  my_role public.crew_role,
  can_manage boolean,
  time_zone text,
  -- Momentum
  rhythm_per_week integer,
  weeks integer[],
  this_week integer,
  streak_weeks integer,
  momentum text,
  -- The next thing on (a crew plan, forming or GAME ON)
  next_plan_id uuid,
  next_sport_id text,
  next_title text,
  next_starts_at timestamptz,
  next_place_name text,
  next_member_count integer,
  next_capacity integer,
  next_status public.plan_status,
  next_i_am_in boolean,
  next_ritual_id uuid,
  -- Free tonight (count; names from crew_free_tonight)
  free_tonight integer,
  -- Chat
  unread_count integer,
  last_message_at timestamptz,
  -- Make This a Ritual (null when nothing repeats or a Ritual already covers it)
  suggest_sport_id text,
  suggest_day_of_week integer,
  suggest_local_time time,
  suggest_place_id uuid,
  suggest_place_name text,
  suggest_weeks integer,
  server_now timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_crew public.crews%rowtype;
  v_role public.crew_role;
  v_weeks integer[];
  v_m record;
  v_next record;
  v_read timestamptz;
  v_sugg record;
begin
  v_role := authz.crew_role(p_crew_id, v_uid);
  if v_role is null then
    perform private.fail('crew_not_found');
  end if;
  select * into v_crew from public.crews c where c.id = p_crew_id;
  v_weeks := private.crew_weeks(p_crew_id);
  select * into v_m from private.crew_momentum(v_weeks, v_crew.rhythm_per_week);

  select p.id, p.sport_id, p.title, p.starts_at, pl.name as place_name, p.member_count, p.capacity,
         private.plan_status_now(p) as status,
         exists (select 1 from public.plan_members pm where pm.plan_id = p.id and pm.user_id = v_uid) as i_am_in,
         (select o.ritual_id from public.ritual_occurrences o where o.plan_id = p.id limit 1) as ritual_id
    into v_next
  from public.plans p
  left join public.places pl on pl.id = p.place_id
  where p.crew_id = p_crew_id and p.starts_at > now()
    and private.plan_status_now(p) in ('forming', 'game_on')
    and not authz.is_blocked(p.host_id, v_uid)
  order by p.starts_at, p.id
  limit 1;

  select coalesce(r.last_read_at, m.joined_at) into v_read
  from public.crew_members m
  left join public.crew_chat_reads r on r.crew_id = m.crew_id and r.user_id = m.user_id
  where m.crew_id = p_crew_id and m.user_id = v_uid;

  -- The same sport on the same weekday around the same hour in 3 of the last 5 weeks, with no
  -- Ritual (active or paused) for that sport and day yet.
  select x.sport_id, x.dow, x.local_time, x.place_id, pl.name as place_name, x.weeks into v_sugg
  from (
    select a.sport_id,
           extract(isodow from a.starts_at at time zone v_crew.time_zone)::integer as dow,
           (date_trunc('hour', a.starts_at at time zone v_crew.time_zone)
             + case when extract(minute from a.starts_at at time zone v_crew.time_zone) >= 30
                    then interval '30 minutes' else interval '0' end)::time as local_time,
           (array_agg(a.place_id order by a.starts_at desc))[1] as place_id,
           count(distinct private.local_week_start(a.starts_at, v_crew.time_zone))::integer as weeks
    from private.crew_sessions(p_crew_id, now() - interval '35 days') s
    join public.activities a on a.id = s.activity_id
    group by 1, 2, 3
  ) x
  left join public.places pl on pl.id = x.place_id
  where x.weeks >= 3
    and not exists (select 1 from public.rituals r
                    where r.crew_id = p_crew_id and r.status in ('active', 'paused')
                      and r.sport_id = x.sport_id and r.day_of_week = x.dow)
  order by x.weeks desc, x.dow, x.local_time
  limit 1;

  return query
  select v_crew.id, v_crew.name, v_crew.sport_id, v_crew.member_count, v_role, v_role in ('owner', 'admin'),
         v_crew.time_zone, v_crew.rhythm_per_week::integer, v_weeks, v_weeks[cardinality(v_weeks)],
         v_m.streak, v_m.state,
         v_next.id, v_next.sport_id, v_next.title, v_next.starts_at, v_next.place_name, v_next.member_count,
         v_next.capacity, v_next.status, v_next.i_am_in, v_next.ritual_id,
         (select count(*)::integer from private.crew_free_tonight(p_crew_id, v_uid)),
         (select least(count(*), 99)::integer from public.messages x
           where x.crew_id = p_crew_id and x.sender_id <> v_uid and x.deleted_at is null
             and x.created_at > v_read and not authz.is_blocked(x.sender_id, v_uid)),
         (select max(x.created_at) from public.messages x
           where x.crew_id = p_crew_id and not authz.is_blocked(x.sender_id, v_uid)),
         v_sugg.sport_id, v_sugg.dow, v_sugg.local_time, v_sugg.place_id, v_sugg.place_name, v_sugg.weeks,
         now();
end;
$$;

-- Owners and admins set the rhythm (sessions a week). Set-to-state.
create or replace function public.set_crew_rhythm(p_crew_id uuid, p_per_week integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_role public.crew_role := authz.crew_role(p_crew_id, v_uid);
begin
  if v_role is null then
    perform private.fail('crew_not_found');
  end if;
  if v_role = 'member' then
    perform private.fail('not_crew_admin');
  end if;
  if p_per_week is null or p_per_week not between 1 and 7 then
    perform private.fail('invalid_argument', 'per_week');
  end if;
  update public.crews set rhythm_per_week = p_per_week where id = p_crew_id and rhythm_per_week <> p_per_week;
  if found then
    perform private.emit('crew_rhythm_set', v_uid, jsonb_build_object('crew_id', p_crew_id, 'per_week', p_per_week));
  end if;
  return p_per_week;
end;
$$;

-- The chat was read up to now (or p_at). Never moves back. Set-to-state.
create or replace function public.mark_crew_chat_read(p_crew_id uuid, p_at timestamptz default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_at timestamptz := least(coalesce(p_at, now()), now());
begin
  if not authz.is_crew_member(p_crew_id, v_uid) then
    perform private.fail('crew_not_found');
  end if;
  insert into public.crew_chat_reads (crew_id, user_id, last_read_at) values (p_crew_id, v_uid, v_at)
  on conflict on constraint crew_chat_reads_pkey
  do update set last_read_at = greatest(public.crew_chat_reads.last_read_at, excluded.last_read_at)
  returning last_read_at into v_at;
  return v_at;
end;
$$;

-- Down For board ------------------------------------------------------------------------------------------

-- Crew mates' active Down For signals, one row per group: signals of the same sport whose windows
-- overlap are one row, led by the earliest. down_count = crew mates in that group you can see
-- (including you). i_am_down: you're in it. Tapping I'M DOWN = join_down_for(signal_id).
create or replace function public.crew_down_for(p_crew_id uuid)
returns table (
  signal_id uuid,
  user_id uuid,
  display_name text,
  avatar_path text,
  sport_id text,
  sport_name text,
  window_start timestamptz,
  window_end timestamptz,
  expires_at timestamptz,
  down_count integer,
  i_am_down boolean,
  is_mine boolean,
  matched_plan_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not authz.is_crew_member(p_crew_id, v_uid) then
    perform private.fail('crew_not_found');
  end if;
  return query
  with sig as (
    select s.*
    from public.intent_signals s
    join public.crew_members m on m.user_id = s.user_id and m.crew_id = p_crew_id
    where s.status in ('active', 'matched') and s.expires_at > now() and s.window_end > now()
      and (s.user_id = v_uid or not authz.is_blocked(s.user_id, v_uid))
  )
  select s.id, s.user_id, pr.display_name, pr.avatar_path, s.sport_id, sp.name, s.window_start, s.window_end,
         s.expires_at,
         (select count(distinct o.user_id)::integer from sig o
           where o.sport_id = s.sport_id and tstzrange(o.window_start, o.window_end) && tstzrange(s.window_start, s.window_end)),
         exists (select 1 from sig o where o.user_id = v_uid and o.sport_id = s.sport_id
                   and tstzrange(o.window_start, o.window_end) && tstzrange(s.window_start, s.window_end)),
         s.user_id = v_uid,
         s.matched_plan_id
  from sig s
  join public.profiles pr on pr.id = s.user_id
  join public.sports sp on sp.id = s.sport_id
  where not exists (
    select 1 from sig o
    where o.sport_id = s.sport_id and o.id <> s.id
      and tstzrange(o.window_start, o.window_end) && tstzrange(s.window_start, s.window_end)
      and (o.created_at, o.id) < (s.created_at, s.id)
  )
  order by s.window_start, s.created_at, s.id;
end;
$$;

-- I'M DOWN on someone's Down For: your own signal for the same sport and window (create_down_for,
-- so matching runs as usual). Idempotent with the key; already down for an overlapping window →
-- that signal (created = false). You can see a signal that's public, from someone you've played
-- with, or from a crew mate.
create or replace function public.join_down_for(p_signal_id uuid, p_idempotency_key uuid)
returns public.down_for_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_s public.intent_signals%rowtype;
  v_state public.down_for_state;
begin
  select * into v_s from public.intent_signals where id = p_signal_id;
  if not found or v_s.status not in ('active', 'matched') or v_s.expires_at <= now() or v_s.window_end <= now()
     or authz.is_blocked(v_s.user_id, v_uid)
     or not (v_s.audience = 'public' or authz.connected(v_s.user_id, v_uid)
             or exists (select 1 from public.crew_members a join public.crew_members b on b.crew_id = a.crew_id
                        join public.crews c on c.id = a.crew_id and c.archived_at is null
                        where a.user_id = v_uid and b.user_id = v_s.user_id)) then
    perform private.fail('signal_not_found');
  end if;
  if v_s.user_id = v_uid then
    perform private.fail('invalid_argument', 'own signal');
  end if;
  v_state := public.create_down_for(
    p_idempotency_key, v_s.sport_id, greatest(v_s.window_start, now()), v_s.window_end, v_s.expires_at,
    v_s.audience, null, v_s.min_participants, v_s.place_id);
  if v_state.created then
    perform private.emit('down_for_joined', v_uid,
      jsonb_build_object('signal_id', p_signal_id, 'sport_id', v_s.sport_id, 'joined_signal_id', v_state.signal_id));
  end if;
  return v_state;
end;
$$;

-- Crew vs crew -------------------------------------------------------------------------------------------

-- The crew's Challenge Events against other crews: what's coming (soonest first), then results
-- (latest first). in_count / needed: people in the lineups of both sides / both sides full.
create or replace function public.crew_versus(p_crew_id uuid, p_limit integer default 10)
returns table (
  event_id uuid,
  rivalry_id uuid,
  opponent_crew_id uuid,
  opponent_name text,
  title text,
  sport_id text,
  side_size integer,
  starts_at timestamptz,
  time_zone text,
  place_name text,
  stage public.challenge_stage,
  in_count integer,
  needed integer,
  our_side public.team_side,
  our_value numeric,
  their_value numeric,
  outcome text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not authz.is_crew_member(p_crew_id, v_uid) then
    perform private.fail('crew_not_found');
  end if;
  return query
  select x.* from (
    select e.id, e.rivalry_id,
           case when e.a_crew_id = p_crew_id then e.b_crew_id else e.a_crew_id end,
           (select c.name from public.crews c where c.id = case when e.a_crew_id = p_crew_id then e.b_crew_id else e.a_crew_id end),
           e.title, e.sport_id, e.side_size, e.starts_at, e.time_zone, pl.name,
           private.challenge_stage(e) as stage,
           (select count(*)::integer from public.challenge_competitors k where k.event_id = e.id),
           e.side_size * 2,
           case when e.a_crew_id = p_crew_id then 'a'::public.team_side else 'b'::public.team_side end,
           case when e.a_crew_id = p_crew_id then r.a_value else r.b_value end,
           case when e.a_crew_id = p_crew_id then r.b_value else r.a_value end,
           case when r.event_id is null then null
                when r.winner_side is null then 'draw'
                when (r.winner_side = 'a') = (e.a_crew_id = p_crew_id) then 'won'
                else 'lost' end
    from public.challenge_events e
    left join public.places pl on pl.id = e.place_id
    left join public.challenge_results r on r.event_id = e.id
    where (e.a_crew_id = p_crew_id or e.b_crew_id = p_crew_id)
      and authz.can_see_challenge_event(e.id, v_uid)
  ) x
  order by (x.stage in ('complete', 'cancelled')),
           case when x.stage in ('complete', 'cancelled') then null else x.starts_at end,
           x.starts_at desc, x.id
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
end;
$$;

-- Head-to-head records with other crews (from results; never rewritten).
create or replace function public.crew_rivalries(p_crew_id uuid)
returns table (
  rivalry_id uuid,
  opponent_crew_id uuid,
  opponent_name text,
  meetings integer,
  wins integer,
  losses integer,
  draws integer,
  last_met_at timestamptz,
  next_event_id uuid,
  next_starts_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not authz.is_crew_member(p_crew_id, v_uid) then
    perform private.fail('crew_not_found');
  end if;
  return query
  select rv.id,
         case when rv.low_id = p_crew_id then rv.high_id else rv.low_id end,
         (select c.name from public.crews c where c.id = case when rv.low_id = p_crew_id then rv.high_id else rv.low_id end),
         (select count(*)::integer from public.challenge_results r where r.rivalry_id = rv.id),
         (select count(*)::integer from public.challenge_results r join public.challenge_events e on e.id = r.event_id
           where r.rivalry_id = rv.id and r.winner_side is not null
             and (r.winner_side = 'a') = (e.a_crew_id = p_crew_id)),
         (select count(*)::integer from public.challenge_results r join public.challenge_events e on e.id = r.event_id
           where r.rivalry_id = rv.id and r.winner_side is not null
             and (r.winner_side = 'a') <> (e.a_crew_id = p_crew_id)),
         (select count(*)::integer from public.challenge_results r where r.rivalry_id = rv.id and r.winner_side is null),
         (select max(e.starts_at) from public.challenge_results r join public.challenge_events e on e.id = r.event_id
           where r.rivalry_id = rv.id),
         n.id, n.starts_at
  from public.rivalries rv
  left join lateral (
    select e.id, e.starts_at from public.challenge_events e
    where e.rivalry_id = rv.id and e.status in ('scheduled', 'live', 'verifying', 'disputed')
      and private.challenge_stage(e) <> 'cancelled'
    order by e.starts_at limit 1
  ) n on true
  where rv.kind = 'crews' and (rv.low_id = p_crew_id or rv.high_id = p_crew_id)
    and exists (select 1 from public.challenge_events e
                where e.rivalry_id = rv.id and authz.can_see_challenge_event(e.id, v_uid))
  order by 8 desc nulls last, rv.id;
end;
$$;

-- Memories ------------------------------------------------------------------------------------------------

-- Recaps of crew sessions, newest first, each with one photo. The photo (path, alt, caption) only
-- for people who played in that game (moments are participants-only); others get the recap line.
create or replace function public.crew_memories(p_crew_id uuid, p_limit integer default 6)
returns table (
  activity_id uuid,
  recap_id uuid,
  occurred_at timestamptz,
  sport_id text,
  place_name text,
  team_a_label text,
  team_b_label text,
  team_a_score integer,
  team_b_score integer,
  played_count integer,
  i_played boolean,
  moment_id uuid,
  moment_path text,
  moment_alt text,
  moment_caption text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not authz.is_crew_member(p_crew_id, v_uid) then
    perform private.fail('crew_not_found');
  end if;
  return query
  select r.activity_id, r.id, r.occurred_at, r.sport_id, pl.name, r.team_a_label, r.team_b_label, r.team_a_score,
         r.team_b_score, r.played_count, authz.is_participant(r.activity_id, v_uid),
         mo.id, mo.storage_path, mo.alt_text, mo.caption
  from (select distinct s.activity_id from private.crew_sessions(p_crew_id, now() - interval '365 days') s
        where s.activity_id is not null) s
  join public.recaps r on r.activity_id = s.activity_id
  left join public.places pl on pl.id = r.place_id
  left join lateral (
    select m.id, m.storage_path, m.alt_text, m.caption from public.moments m
    where m.activity_id = r.activity_id and authz.is_participant(r.activity_id, v_uid)
      and (m.author_id = v_uid or not authz.is_blocked(m.author_id, v_uid))
    order by m.created_at desc, m.id limit 1
  ) mo on true
  where not exists (select 1 from public.activities a where a.id = r.activity_id and authz.is_blocked(a.host_id, v_uid))
  order by r.occurred_at desc, r.id
  limit least(greatest(coalesce(p_limit, 6), 1), 24);
end;
$$;

-- Rituals ------------------------------------------------------------------------------------------------

-- Who may edit a Ritual: crew owner/admin; clan captain/organizer/coach. The host may skip a week.
create or replace function private.can_edit_ritual(r public.rituals, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.crew_id is not null then coalesce(authz.crew_role(r.crew_id, p_uid) in ('owner', 'admin'), false)
    else authz.clan_can(r.clan_id, 'mission', p_uid)
  end;
$$;

-- Make sure the week on p_on exists: an occurrence row, and (unless skipped, paused or not yet in the
-- lead window) that week's plan or club run. Safe to call again; returns the week.
create or replace function private.ensure_ritual_week(p_ritual uuid, p_on date)
returns public.ritual_week_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rituals%rowtype;
  o public.ritual_occurrences%rowtype;
  v_start timestamptz;
  v_plan uuid;
  v_run uuid;
  v_live boolean;
begin
  select * into r from public.rituals where id = p_ritual for update;
  if not found then
    return null;
  end if;
  v_start := private.ritual_starts_at(r, p_on);
  select * into o from public.ritual_occurrences where ritual_id = p_ritual and occurs_on = p_on;

  -- Is the existing week's plan/run still standing?
  v_live := (o.plan_id is not null and exists (select 1 from public.plans p where p.id = o.plan_id and p.status <> 'cancelled'))
         or (o.clan_run_id is not null and exists (select 1 from public.clan_runs x where x.id = o.clan_run_id and x.status <> 'cancelled'));

  if r.status = 'active' and o.skipped_at is null and not coalesce(v_live, false)
     and v_start > now() + interval '30 minutes' and v_start - make_interval(days => r.lead_days) <= now() then
    if r.crew_id is not null and authz.is_crew_member(r.crew_id, r.host_id) then
      insert into public.plans (
        sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, crew_id, deadline_at,
        source, created_by, host_id, member_count
      ) values (
        r.sport_id, r.title, v_start, r.duration_minutes, r.place_id, r.capacity, 'crew', r.crew_id,
        least(v_start, greatest(now() + interval '5 minutes', v_start - interval '1 hour')),
        'ritual', r.host_id, r.host_id, 1
      ) returning id into v_plan;
      insert into public.plan_members (plan_id, user_id, via) values (v_plan, r.host_id, 'host');
      perform private.emit('ritual_plan_created', r.host_id,
        jsonb_build_object('ritual_id', r.id, 'crew_id', r.crew_id, 'plan_id', v_plan, 'sport_id', r.sport_id));
    elsif r.clan_id is not null and authz.is_clan_member(r.clan_id, r.host_id) then
      insert into public.clan_runs (
        clan_id, ritual_id, sport_id, title, starts_at, duration_minutes, place_id, distance_km, capacity,
        min_to_go, host_id, created_by, down_count
      ) values (
        r.clan_id, r.id, r.sport_id, r.title, v_start, r.duration_minutes, r.place_id, r.distance_km, r.capacity,
        coalesce(r.min_to_go, least(r.capacity, 4)), r.host_id, r.host_id, 1
      )
      on conflict (ritual_id, starts_at) where ritual_id is not null do nothing
      returning id into v_run;
      if v_run is not null then
        insert into public.clan_run_members (run_id, user_id) values (v_run, r.host_id);
        perform private.emit('ritual_plan_created', r.host_id,
          jsonb_build_object('ritual_id', r.id, 'clan_id', r.clan_id, 'clan_run_id', v_run, 'sport_id', r.sport_id));
      end if;
    end if;
    insert into public.ritual_occurrences (ritual_id, occurs_on, starts_at, plan_id, clan_run_id)
    values (r.id, p_on, v_start, v_plan, v_run)
    on conflict (ritual_id, occurs_on) do update
      set plan_id = coalesce(excluded.plan_id, public.ritual_occurrences.plan_id),
          clan_run_id = coalesce(excluded.clan_run_id, public.ritual_occurrences.clan_run_id),
          starts_at = excluded.starts_at;
    select * into o from public.ritual_occurrences where ritual_id = p_ritual and occurs_on = p_on;
  end if;

  return row(r.id, p_on, coalesce(o.starts_at, v_start), o.skipped_at is not null, o.plan_id, o.clan_run_id)::public.ritual_week_state;
end;
$$;

-- Every few minutes: prefill each active Ritual's next week once it's inside the lead window.
create or replace function private.ritual_tick()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rituals%rowtype;
  v_n integer := 0;
  v_on date;
begin
  for r in select * from public.rituals where status = 'active' loop
    v_on := private.ritual_next_on(r, now() + interval '30 minutes');
    if private.ritual_starts_at(r, v_on) - make_interval(days => r.lead_days) <= now()
       and not exists (select 1 from public.ritual_occurrences o
                       where o.ritual_id = r.id and o.occurs_on = v_on
                         and (o.skipped_at is not null or o.plan_id is not null or o.clan_run_id is not null)) then
      perform private.ensure_ritual_week(r.id, v_on);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

create or replace function private.validate_ritual(r public.rituals)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if r.title is null or char_length(trim(r.title)) not between 1 and 40 then
    perform private.fail('invalid_argument', 'title');
  end if;
  if r.day_of_week is null or r.day_of_week not between 1 and 7 then
    perform private.fail('invalid_argument', 'day_of_week');
  end if;
  if r.local_time is null then
    perform private.fail('invalid_argument', 'local_time');
  end if;
  if r.place_id is not null and not exists (select 1 from public.places where id = r.place_id) then
    perform private.fail('place_unknown');
  end if;
  if r.crew_id is not null and (r.capacity is null or r.capacity not between 2 and 12) then
    perform private.fail('capacity_invalid', '2-12');
  end if;
  if r.clan_id is not null and (r.capacity is null or r.capacity not between 2 and 500) then
    perform private.fail('capacity_invalid', '2-500');
  end if;
  if r.min_to_go is not null and (r.min_to_go < 2 or r.min_to_go > r.capacity) then
    perform private.fail('invalid_argument', 'min_to_go');
  end if;
  if r.distance_km is not null and (r.distance_km <= 0 or r.distance_km > 500) then
    perform private.fail('invalid_argument', 'distance_km');
  end if;
  if r.duration_minutes is null or r.duration_minutes not between 15 and 480 then
    perform private.fail('invalid_argument', 'duration_minutes');
  end if;
  if r.lead_days not between 1 and 13 then
    perform private.fail('invalid_argument', 'lead_days');
  end if;
  if r.crew_id is not null and not authz.is_crew_member(r.crew_id, r.host_id) then
    perform private.fail('not_crew_member');
  end if;
  if r.clan_id is not null and not authz.is_clan_member(r.clan_id, r.host_id) then
    perform private.fail('not_clan_member');
  end if;
end;
$$;

-- MAKE THIS A RITUAL / new Ritual. Exactly one of p_crew_id, p_clan_id. Crew owner/admin, or clan
-- captain/organizer/coach. Up to 3 active Rituals a crew, 14 a clan. Prefills the first week if it's
-- inside the lead window.
create or replace function public.create_ritual(
  p_idempotency_key uuid,
  p_sport_id text,
  p_title text,
  p_day_of_week integer,
  p_local_time time,
  p_capacity integer,
  p_crew_id uuid default null,
  p_clan_id uuid default null,
  p_place_id uuid default null,
  p_duration_minutes integer default null,
  p_host_id uuid default null,
  p_min_to_go integer default null,
  p_distance_km numeric default null,
  p_lead_days integer default 6
)
returns public.rituals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  r public.rituals%rowtype;
  v_sport public.sports%rowtype;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_ritual');
  if v_prior is not null then
    return jsonb_populate_record(null::public.rituals, v_prior);
  end if;
  if num_nonnulls(p_crew_id, p_clan_id) <> 1 then
    perform private.fail('invalid_argument', 'crew_id or clan_id');
  end if;
  if p_crew_id is not null then
    if not authz.is_crew_member(p_crew_id, v_uid) then
      perform private.fail('crew_not_found');
    end if;
    if authz.crew_role(p_crew_id, v_uid) = 'member' then
      perform private.fail('not_crew_admin');
    end if;
    if (select count(*) from public.rituals x where x.crew_id = p_crew_id and x.status in ('active', 'paused')) >= 3 then
      perform private.fail('ritual_limit', '3');
    end if;
  else
    if not authz.is_clan_member(p_clan_id, v_uid) then
      perform private.fail(case when authz.can_see_clan(p_clan_id, v_uid) then 'not_clan_member' else 'clan_not_found' end);
    end if;
    if not authz.clan_can(p_clan_id, 'mission', v_uid) then
      perform private.fail('clan_role_required');
    end if;
    if (select count(*) from public.rituals x where x.clan_id = p_clan_id and x.status in ('active', 'paused')) >= 14 then
      perform private.fail('ritual_limit', '14');
    end if;
  end if;
  select * into v_sport from public.sports where id = p_sport_id;
  if not found then
    perform private.fail('sport_unknown');
  end if;

  r.crew_id := p_crew_id;
  r.clan_id := p_clan_id;
  r.sport_id := p_sport_id;
  r.title := trim(p_title);
  r.day_of_week := p_day_of_week;
  r.local_time := p_local_time;
  r.time_zone := coalesce((select c.time_zone from public.crews c where c.id = p_crew_id),
                          (select c.time_zone from public.clans c where c.id = p_clan_id));
  r.duration_minutes := coalesce(p_duration_minutes, v_sport.default_duration_minutes);
  r.place_id := p_place_id;
  r.capacity := p_capacity;
  r.min_to_go := case when p_clan_id is not null then p_min_to_go end;
  r.distance_km := case when p_clan_id is not null then p_distance_km end;
  r.host_id := coalesce(p_host_id, v_uid);
  r.lead_days := coalesce(p_lead_days, 6);
  perform private.validate_ritual(r);

  insert into public.rituals (crew_id, clan_id, sport_id, title, day_of_week, local_time, time_zone, duration_minutes,
                              place_id, capacity, min_to_go, distance_km, host_id, lead_days, created_by)
  values (r.crew_id, r.clan_id, r.sport_id, r.title, r.day_of_week, r.local_time, r.time_zone, r.duration_minutes,
          r.place_id, r.capacity, r.min_to_go, r.distance_km, r.host_id, r.lead_days, v_uid)
  returning * into r;

  perform private.ensure_ritual_week(r.id, private.ritual_next_on(r, now() + interval '30 minutes'));
  perform private.emit('ritual_created', v_uid,
    jsonb_build_object('ritual_id', r.id, 'crew_id', r.crew_id, 'clan_id', r.clan_id, 'sport_id', r.sport_id,
                       'day_of_week', r.day_of_week));
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(r));
  return r;
end;
$$;

-- Edit. Nulls leave a field as it is. Weeks already on the board keep their plan; later weeks follow
-- the new settings. Set-to-state.
create or replace function public.update_ritual(
  p_ritual_id uuid,
  p_title text default null,
  p_day_of_week integer default null,
  p_local_time time default null,
  p_place_id uuid default null,
  p_capacity integer default null,
  p_duration_minutes integer default null,
  p_host_id uuid default null,
  p_min_to_go integer default null,
  p_distance_km numeric default null,
  p_lead_days integer default null
)
returns public.rituals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rituals%rowtype;
begin
  select * into r from public.rituals where id = p_ritual_id for update;
  if not found or not authz.can_see_ritual(p_ritual_id, v_uid) or r.status = 'ended' then
    perform private.fail('ritual_not_found');
  end if;
  if not private.can_edit_ritual(r, v_uid) then
    perform private.fail(case when r.crew_id is not null then 'not_crew_admin' else 'clan_role_required' end);
  end if;
  r.title := coalesce(trim(p_title), r.title);
  r.day_of_week := coalesce(p_day_of_week, r.day_of_week);
  r.local_time := coalesce(p_local_time, r.local_time);
  r.place_id := coalesce(p_place_id, r.place_id);
  r.capacity := coalesce(p_capacity, r.capacity);
  r.duration_minutes := coalesce(p_duration_minutes, r.duration_minutes);
  r.host_id := coalesce(p_host_id, r.host_id);
  if r.clan_id is not null then
    r.min_to_go := coalesce(p_min_to_go, r.min_to_go);
    r.distance_km := coalesce(p_distance_km, r.distance_km);
  end if;
  r.lead_days := coalesce(p_lead_days, r.lead_days);
  perform private.validate_ritual(r);
  update public.rituals
     set title = r.title, day_of_week = r.day_of_week, local_time = r.local_time, place_id = r.place_id,
         capacity = r.capacity, duration_minutes = r.duration_minutes, host_id = r.host_id,
         min_to_go = r.min_to_go, distance_km = r.distance_km, lead_days = r.lead_days
   where id = p_ritual_id
  returning * into r;
  perform private.emit('ritual_edited', v_uid, jsonb_build_object('ritual_id', r.id));
  if r.status = 'active' then
    perform private.ensure_ritual_week(r.id, private.ritual_next_on(r, now() + interval '30 minutes'));
  end if;
  return r;
end;
$$;

-- Pause or resume. Paused Rituals prefill nothing; weeks already on the board stay. Set-to-state.
create or replace function public.set_ritual_paused(p_ritual_id uuid, p_paused boolean)
returns public.ritual_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rituals%rowtype;
begin
  select * into r from public.rituals where id = p_ritual_id for update;
  if not found or not authz.can_see_ritual(p_ritual_id, v_uid) or r.status = 'ended' then
    perform private.fail('ritual_not_found');
  end if;
  if not private.can_edit_ritual(r, v_uid) then
    perform private.fail(case when r.crew_id is not null then 'not_crew_admin' else 'clan_role_required' end);
  end if;
  if coalesce(p_paused, true) and r.status = 'active' then
    update public.rituals set status = 'paused', paused_at = now() where id = p_ritual_id returning * into r;
    perform private.emit('ritual_paused', v_uid, jsonb_build_object('ritual_id', r.id));
  elsif not coalesce(p_paused, true) and r.status = 'paused' then
    update public.rituals set status = 'active', paused_at = null where id = p_ritual_id returning * into r;
    perform private.emit('ritual_resumed', v_uid, jsonb_build_object('ritual_id', r.id));
    perform private.ensure_ritual_week(r.id, private.ritual_next_on(r, now() + interval '30 minutes'));
  end if;
  return r.status;
end;
$$;

-- End a Ritual for good. Past weeks stay in history; a week already on the board stays too.
create or replace function public.end_ritual(p_ritual_id uuid)
returns public.ritual_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rituals%rowtype;
begin
  select * into r from public.rituals where id = p_ritual_id for update;
  if not found or not authz.can_see_ritual(p_ritual_id, v_uid) then
    perform private.fail('ritual_not_found');
  end if;
  if r.status = 'ended' then
    return r.status;
  end if;
  if not private.can_edit_ritual(r, v_uid) then
    perform private.fail(case when r.crew_id is not null then 'not_crew_admin' else 'clan_role_required' end);
  end if;
  update public.rituals set status = 'ended', ended_at = now() where id = p_ritual_id;
  perform private.emit('ritual_ended', v_uid, jsonb_build_object('ritual_id', r.id));
  return 'ended';
end;
$$;

-- SKIP A WEEK (p_skip = true) or put it back (false). p_occurs_on = that week's local date; null =
-- the next week. Skipping calls off that week's plan or club run while it's still forming; once it's
-- GAME ON the week is locked (cancel the game instead). Editors and the Ritual's host. Set-to-state.
create or replace function public.skip_ritual_week(
  p_ritual_id uuid, p_occurs_on date default null, p_skip boolean default true
)
returns public.ritual_week_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rituals%rowtype;
  o public.ritual_occurrences%rowtype;
  v_on date;
  v_start timestamptz;
  v_skip boolean := coalesce(p_skip, true);
begin
  select * into r from public.rituals where id = p_ritual_id for update;
  if not found or not authz.can_see_ritual(p_ritual_id, v_uid) or r.status = 'ended' then
    perform private.fail('ritual_not_found');
  end if;
  if not private.can_edit_ritual(r, v_uid) and r.host_id <> v_uid then
    perform private.fail(case when r.crew_id is not null then 'not_crew_admin' else 'clan_role_required' end);
  end if;
  v_on := coalesce(p_occurs_on, private.ritual_next_on(r, now()));
  v_start := private.ritual_starts_at(r, v_on);
  if extract(isodow from v_on)::integer <> r.day_of_week or v_start <= now() or v_on > (now() at time zone r.time_zone)::date + 56 then
    perform private.fail('invalid_argument', 'occurs_on');
  end if;

  select * into o from public.ritual_occurrences where ritual_id = p_ritual_id and occurs_on = v_on for update;
  if v_skip then
    if (o.plan_id is not null and exists (select 1 from public.plans p where p.id = o.plan_id and p.status = 'game_on'))
       or (o.clan_run_id is not null and exists (select 1 from public.clan_runs x where x.id = o.clan_run_id and x.status = 'game_on')) then
      perform private.fail('ritual_week_locked');
    end if;
    if o.skipped_at is null then
      insert into public.ritual_occurrences (ritual_id, occurs_on, starts_at, skipped_at, skipped_by)
      values (r.id, v_on, v_start, now(), v_uid)
      on conflict (ritual_id, occurs_on) do update set skipped_at = now(), skipped_by = v_uid;
      update public.plans set status = 'cancelled', cancelled_at = now()
       where id = o.plan_id and status = 'forming';
      update public.plan_invites set status = 'revoked', responded_at = now()
       where plan_id = o.plan_id and status = 'pending';
      update public.clan_runs set status = 'cancelled', cancelled_at = now()
       where id = o.clan_run_id and status = 'forming';
      perform private.emit('ritual_skipped', v_uid, jsonb_build_object('ritual_id', r.id, 'occurs_on', v_on));
    end if;
  elsif o.skipped_at is not null then
    update public.ritual_occurrences set skipped_at = null, skipped_by = null
     where ritual_id = r.id and occurs_on = v_on;
    perform private.emit('ritual_unskipped', v_uid, jsonb_build_object('ritual_id', r.id, 'occurs_on', v_on));
  end if;
  -- Unskipping (or skipping a week that wasn't prefilled yet) settles through the same path.
  return private.ensure_ritual_week(r.id, v_on);
end;
$$;

-- The crew's Rituals with this week's state: "THIS WEEK · 6 / 10".
create or replace function public.crew_rituals(p_crew_id uuid)
returns table (
  ritual_id uuid,
  title text,
  sport_id text,
  day_of_week integer,
  local_time time,
  time_zone text,
  duration_minutes integer,
  place_id uuid,
  place_name text,
  capacity integer,
  host_id uuid,
  host_name text,
  status public.ritual_status,
  lead_days integer,
  can_edit boolean,
  week_on date,
  week_starts_at timestamptz,
  week_skipped boolean,
  week_plan_id uuid,
  week_member_count integer,
  week_capacity integer,
  week_status public.plan_status,
  week_i_am_in boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not authz.is_crew_member(p_crew_id, v_uid) then
    perform private.fail('crew_not_found');
  end if;
  return query
  select r.id, r.title, r.sport_id, r.day_of_week::integer, r.local_time, r.time_zone, r.duration_minutes, r.place_id,
         pl.name, r.capacity, r.host_id,
         case when r.host_id = v_uid or not authz.is_blocked(r.host_id, v_uid) then hp.display_name end,
         r.status, r.lead_days::integer, private.can_edit_ritual(r, v_uid),
         w.on_date, private.ritual_starts_at(r, w.on_date), o.skipped_at is not null,
         p.id, p.member_count, p.capacity, case when p.id is not null then private.plan_status_now(p) end,
         case when p.id is not null then exists (select 1 from public.plan_members m where m.plan_id = p.id and m.user_id = v_uid) end
  from public.rituals r
  join public.profiles hp on hp.id = r.host_id
  left join public.places pl on pl.id = r.place_id
  cross join lateral (select private.ritual_next_on(r, now() - make_interval(mins => r.duration_minutes)) as on_date) w
  left join public.ritual_occurrences o on o.ritual_id = r.id and o.occurs_on = w.on_date
  left join public.plans p on p.id = o.plan_id and p.status <> 'cancelled'
  where r.crew_id = p_crew_id and r.status in ('active', 'paused')
  order by r.day_of_week, r.local_time, r.id;
end;
$$;
