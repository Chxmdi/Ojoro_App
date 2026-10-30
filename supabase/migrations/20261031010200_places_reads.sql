-- Step 7 (Places and Ojoro Pulse, PRD M8: §9.16, §11.2): the reads for Pulse and the Place page.
--
-- Contract for the app: docs/PLACES_CONTRACT.md. Judgment calls: docs/DESIGN_DECISIONS.md
-- ("Step 7 BE-PLACES").
--
-- Reads:
--   pulse(p_sport_id, p_when, p_radius_km)        map markers: places, areas, latent demand (logged, POST)
--   pulse_place(p_place_id, p_sport_id, p_when)   the selected-place sheet on Pulse
--   place_view(p_place_id)                        Place header, facts, busy summary, CREATE ACTIVITY HERE
--                                                 prefill (logged, POST)
--   place_tonight(p_place_id, p_when)             TONIGHT HERE
--   place_groups(p_place_id)                      RITUALS HERE (crew and clan Rituals, host series)
--   place_hosts(p_place_id, p_limit)              HOSTS HERE
--   place_busy_times(p_place_id)                  WHEN IT'S BUSY, by weekday and hour
-- Report: 'place' plugs into private.report_subject_visible.
--
-- Privacy (PRD §11.2, CLAUDE.md):
--   * Aggregate first. Pulse returns places and areas, never people. Only public centroids leave the
--     server (a place's own centroid, an area's 0.01° centroid). Never a meeting point on Pulse; on
--     Place the meeting point label only for people in that plan.
--   * Counts about people (latent demand) show only from private.latent_demand_k() (3) people, with no
--     ids, names, places or exact times, and never include the caller. Counts of activities follow
--     visibility: a plan you can't see (friends, crew, invite-only) is never counted for you.
--   * Sensitive places (places.sensitive) are never a marker of their own; their activities reach the
--     area aggregate only from k of them, and the Place page lists only what you're in.
--   * Busy times come from public plans' and open clans' finished sessions only, as a 0–100 level,
--     and only from PLACE_BUSY_MIN_GAMES (6) sessions in 12 weeks.
--   * Blocks: a blocked host's plans are not visible (authz.can_see_plan); blocked people are never
--     listed as hosts.

-- Small helpers ------------------------------------------------------------------------------------------

-- Fewest finished sessions in 12 weeks before busy times are shown.
create or replace function private.place_busy_min_games()
returns integer
language sql
immutable
set search_path = ''
as $$ select 6 $$;

-- Fewest finished games hosted at a place to be listed under HOSTS HERE (one-off hosts aren't listed).
create or replace function private.place_host_min_games()
returns integer
language sql
immutable
set search_path = ''
as $$ select 5 $$;

-- The time window for a Pulse / Place filter, in the given time zone. Same words as discover_search:
-- now (the next hour), tonight (until 4 AM, the default), today, tomorrow, weekend, week. Live games
-- count when the window includes now.
create or replace function private.pulse_window(p_when text, p_tz text)
returns table (w_from timestamptz, w_until timestamptz, includes_now boolean, words text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text := coalesce(p_tz, 'America/Toronto');
  v_today date := (now() at time zone v_tz)::date;
  v_dow integer := extract(isodow from now() at time zone v_tz)::integer;
begin
  case coalesce(p_when, 'tonight')
    when 'now' then
      return query select now(), now() + interval '60 minutes', true, 'in the next hour';
    when 'tonight' then
      return query select now(), private.tonight_end(v_tz), true, 'tonight';
    when 'today' then
      return query select now(), (v_today + 1)::timestamp at time zone v_tz, true, 'today';
    when 'tomorrow' then
      return query select (v_today + 1)::timestamp at time zone v_tz, (v_today + 2)::timestamp at time zone v_tz,
                          false, 'tomorrow';
    when 'weekend' then
      if v_dow >= 6 then
        return query select now(), (v_today + (8 - v_dow))::timestamp at time zone v_tz, true, 'this weekend';
      else
        return query select (v_today + (6 - v_dow))::timestamp at time zone v_tz,
                            (v_today + (8 - v_dow))::timestamp at time zone v_tz, false, 'this weekend';
      end if;
    when 'week' then
      return query select now(), now() + interval '7 days', true, 'this week';
    else
      perform private.fail('invalid_argument', 'when');
  end case;
end;
$$;

-- "7:30", "8 PM" style local times.
create or replace function private.fmt_clock(p_at timestamptz, p_tz text)
returns text
language sql
stable
set search_path = ''
as $$ select to_char(p_at at time zone p_tz, 'FMHH12:MI') $$;

-- "11 PM", "10:30 PM".
create or replace function private.fmt_time_of_day(p_time time)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_time is null then null
              when extract(minute from p_time) = 0 then to_char(p_time, 'FMHH12 AM')
              else to_char(p_time, 'FMHH12:MI AM') end
$$;

-- Everything on at places that the viewer may see, in a window: forming plans (before their deadline,
-- starting in the window), GAME ON games not finished (starting in the window, or live when
-- p_include_live), and club runs of clans the viewer can see. Only places (p_place_id = null: all).
create or replace function private.place_items(
  p_uid uuid,
  p_from timestamptz,
  p_until timestamptz,
  p_include_live boolean,
  p_sport_id text,
  p_place_id uuid
)
returns table (
  kind text,
  plan_id uuid,
  activity_id uuid,
  clan_run_id uuid,
  clan_id uuid,
  sport_id text,
  sport_name text,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  member_count integer,
  capacity integer,
  level_label text,
  meeting_point text,
  i_am_in boolean,
  is_public boolean,
  place_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select case when a.id is null then 'plan' else 'activity' end,
           p.id, a.id, null::uuid, null::uuid, p.sport_id, s.name,
           coalesce(a.title, p.title),
           coalesce(a.starts_at, p.starts_at),
           case when a.id is not null then coalesce(a.ended_at, a.ends_at)
                else p.starts_at + make_interval(mins => p.duration_minutes) end,
           case when a.id is null then 'forming'
                when private.activity_status_now(a) = 'live' then 'live'
                else 'game_on' end,
           case when a.id is null then p.member_count else a.confirmed_count end,
           p.capacity,
           coalesce(a.level_label, p.level_label),
           case when authz.is_plan_member(p.id, p_uid) or p.host_id = p_uid
                then (select mp.label from public.plan_meeting_points mp where mp.plan_id = p.id) end,
           (p.host_id = p_uid or authz.is_plan_member(p.id, p_uid)
            or (a.id is not null and exists (select 1 from public.attendance t
                                            where t.activity_id = a.id and t.user_id = p_uid
                                              and t.status in ('confirmed', 'checked_in', 'waitlisted')))),
           p.audience = 'public',
           p.place_id
    from public.plans p
    join public.sports s on s.id = p.sport_id
    left join public.activities a on a.plan_id = p.id
    where p.place_id is not null
      and (p_place_id is null or p.place_id = p_place_id)
      and (p_sport_id is null or p.sport_id = p_sport_id)
      and p.starts_at < p_until + interval '1 day'
      and (
        (a.id is null and p.status = 'forming' and p.deadline_at > now()
         and p.starts_at > now() and p.starts_at >= p_from and p.starts_at < p_until)
        or (a.id is not null and p.status = 'game_on' and private.activity_status_now(a) = 'confirmed'
            and a.starts_at >= p_from and a.starts_at < p_until)
        or (p_include_live and a.id is not null and p.status = 'game_on'
            and private.activity_status_now(a) = 'live')
      )
      and authz.can_see_plan(p.id, p_uid)
    union all
    select 'club_run', null::uuid, null::uuid, r.id, r.clan_id, r.sport_id, s.name, r.title, r.starts_at,
           r.starts_at + make_interval(mins => r.duration_minutes),
           case private.clan_run_stage(r) when 'live' then 'live' when 'game_on' then 'game_on' else 'forming' end,
           r.down_count, r.capacity, null::text, null::text,
           exists (select 1 from public.clan_run_members m where m.run_id = r.id and m.user_id = p_uid),
           c.join_policy <> 'invite',
           r.place_id
    from public.clan_runs r
    join public.clans c on c.id = r.clan_id
    join public.sports s on s.id = r.sport_id
    where r.place_id is not null
      and (p_place_id is null or r.place_id = p_place_id)
      and (p_sport_id is null or r.sport_id = p_sport_id)
      and r.status <> 'cancelled'
      and (
        (private.clan_run_stage(r) in ('forming', 'game_on') and r.starts_at >= p_from and r.starts_at < p_until)
        or (p_include_live and private.clan_run_stage(r) = 'live')
      )
      and authz.can_see_clan(r.clan_id, p_uid)
      and not authz.is_blocked(r.host_id, p_uid)
  ) x
  order by 9, 1, 2, 4;
$$;

-- The sport most played at a place over the last 12 weeks (finished public sessions), else its first sport.
create or replace function private.place_main_sport(p_place uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a.sport_id
     from public.activities a
     join public.plans p on p.id = a.plan_id
     where a.place_id = p_place and a.status <> 'cancelled' and p.audience = 'public'
       and coalesce(a.ended_at, a.ends_at) <= now() and a.starts_at > now() - interval '12 weeks'
     group by a.sport_id
     order by count(*) desc, a.sport_id
     limit 1),
    (select pl.sport_ids[1] from public.places pl where pl.id = p_place)
  );
$$;

-- Finished sessions at a place in the last 12 weeks, with how many showed up, at local weekday and hour.
-- Public plans' games and open/request clans' club runs only.
create or replace function private.place_history(p_place uuid)
returns table (day_of_week smallint, hour smallint, part public.day_part, people integer)
language sql
stable
security definer
set search_path = ''
as $$
  with pl as (select * from public.places where id = p_place),
  sessions as (
    select a.starts_at as st,
           greatest(a.checked_in_count, case when a.checked_in_count = 0 then a.confirmed_count else 0 end) as n
    from public.activities a
    join public.plans p on p.id = a.plan_id
    where a.place_id = p_place and a.status <> 'cancelled' and p.audience = 'public'
      and coalesce(a.ended_at, a.ends_at) <= now() and a.starts_at > now() - interval '12 weeks'
    union all
    select r.starts_at, greatest(r.checked_in_count, case when r.checked_in_count = 0 then r.down_count else 0 end)
    from public.clan_runs r
    join public.clans c on c.id = r.clan_id
    where r.place_id = p_place and r.status <> 'cancelled' and c.join_policy <> 'invite'
      and r.starts_at + make_interval(mins => r.duration_minutes) <= now()
      and r.starts_at > now() - interval '12 weeks'
  )
  select extract(isodow from s.st at time zone pl.time_zone)::smallint,
         extract(hour from s.st at time zone pl.time_zone)::smallint,
         private.day_part_of(s.st, pl.time_zone),
         s.n::integer
  from sessions s cross join pl;
$$;

-- Busy summary for a place: the busiest part of the day, Mon..Sun levels (0–100) in it, the busiest
-- day, and where today stands. Null part (and no levels) without enough history.
create or replace function private.place_busy(p_place uuid)
returns table (
  has_history boolean,
  busy_part public.day_part,
  busy_levels integer[],
  busy_hour smallint,
  busiest_day smallint,
  today_day smallint,
  today_rank integer,
  summary text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_games integer;
  v_part public.day_part;
  v_levels integer[];
  v_max integer;
  v_best smallint;
  v_hour smallint;
  v_today smallint;
  v_rank integer;
  v_part_words text;
  v_now_words text;
  v_days text[] := array['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  v_summary text;
begin
  select pl.time_zone into v_tz from public.places pl where pl.id = p_place;
  v_today := extract(isodow from now() at time zone coalesce(v_tz, 'America/Toronto'))::smallint;
  select count(*) into v_games from private.place_history(p_place);
  if v_games < private.place_busy_min_games() then
    return query select false, null::public.day_part, null::integer[], null::smallint, null::smallint,
                        v_today, null::integer, null::text;
    return;
  end if;

  select h.part into v_part from private.place_history(p_place) h
  group by h.part order by sum(h.people) desc, count(*) desc, h.part desc limit 1;

  select array_agg(coalesce(d.n, 0) order by g.dow) into v_levels
  from generate_series(1, 7) g(dow)
  left join (select h.day_of_week as dow, sum(h.people)::integer as n
             from private.place_history(p_place) h where h.part = v_part group by h.day_of_week) d
    on d.dow = g.dow;
  select max(x) into v_max from unnest(v_levels) x;
  v_max := greatest(v_max, 1);
  select array_agg(round(100.0 * x / v_max)::integer order by i) into v_levels
  from unnest(v_levels) with ordinality u(x, i);

  select i::smallint into v_best from unnest(v_levels) with ordinality u(x, i) order by x desc, i limit 1;
  select h.hour into v_hour from private.place_history(p_place) h
  where h.part = v_part and h.day_of_week = v_best
  group by h.hour order by sum(h.people) desc, h.hour limit 1;
  select 1 + count(*)::integer into v_rank
  from unnest(v_levels) x where x > v_levels[v_today];

  v_part_words := case v_part when 'morning' then 'mornings' when 'midday' then 'afternoons' else 'evenings' end;
  v_now_words := case v_part when 'morning' then 'This morning' when 'midday' then 'This afternoon' else 'Tonight' end;
  v_summary := 'Busiest ' || v_days[v_best] || ' ' || v_part_words || '. ' ||
    case
      when v_today = v_best then 'That''s ' || lower(v_now_words) || '.'
      when v_levels[v_today] = 0 then 'Usually nothing on ' || v_days[v_today] || ' ' || v_part_words || '.'
      when v_rank = 2 then v_now_words || ' (' || v_days[v_today] || ') is the second busiest.'
      when v_rank = 3 then v_now_words || ' (' || v_days[v_today] || ') is the third busiest.'
      else v_now_words || ' (' || v_days[v_today] || ') is usually quieter.'
    end;
  return query select true, v_part, v_levels, v_hour, v_best, v_today, v_rank, v_summary;
end;
$$;

-- TRUSTED HOST (VerificationBadge level 'host': only the system grants it). 20 or more finished games
-- hosted, "great host" from at least REPUTATION_THRESHOLD (5) different people, and no report against
-- them actioned by moderation in the last 180 days.
create or replace function private.trusted_host(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.hosted_count(p_user) >= 20
     and (select count(distinct r.giver_id) from public.reputation_signals r
          where r.subject_id = p_user and r.kind = 'great_host') >= 5
     and not exists (select 1 from public.reports rp
                     where rp.subject_kind = 'profile' and rp.subject_id = p_user and rp.status = 'actioned'
                       and rp.created_at > now() - interval '180 days');
$$;

-- Area centroids (0.01°) and labels, for every area with places.
-- (private.areas() from Step 3 already does this; reused below.)

-- Pulse -------------------------------------------------------------------------------------------------

create or replace function public.pulse(
  p_sport_id text default null,
  p_when text default 'tonight',
  p_radius_km integer default null
)
returns table (
  marker_id text,
  kind text,
  place_id uuid,
  place_name text,
  area text,
  city text,
  label text,
  lat double precision,
  lng double precision,
  distance_km numeric,
  activity_count integer,
  live_count integer,
  forming_count integer,
  forming_plan_id uuid,
  forming_sport_name text,
  forming_member_count integer,
  forming_capacity integer,
  forming_starts_at timestamptz,
  live_activity_id uuid,
  live_title text,
  sport_id text,
  sport_name text,
  people_count integer,
  summary text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_lat double precision;
  v_lng double precision;
  v_tz text;
  v_radius integer;
  v_from timestamptz;
  v_until timestamptz;
  v_now boolean;
  v_words text;
  v_k integer := private.latent_demand_k();
  v_n integer;
begin
  if p_sport_id is not null and not exists (select 1 from public.sports s where s.id = p_sport_id) then
    perform private.fail('sport_unknown');
  end if;
  if p_radius_km is not null and p_radius_km not between 1 and 50 then
    perform private.fail('radius_invalid');
  end if;
  select me.lat, me.lng, me.tz, me.radius_km into v_lat, v_lng, v_tz, v_radius from private.viewer(v_uid) me;
  v_radius := coalesce(p_radius_km, v_radius, 3);
  select w.w_from, w.w_until, w.includes_now, w.words into v_from, v_until, v_now, v_words
  from private.pulse_window(p_when, v_tz) w;

  return query
  with pls as (
    select pl.*,
           case when v_lat is not null
                then round((private.distance_m(v_lat, v_lng, pl.lat, pl.lng) / 1000)::numeric, 1) end as km
    from public.places pl
  ),
  near as (select * from pls where v_lat is null or pls.km <= v_radius),
  items as (
    select i.*, n.sensitive, n.area as iarea, n.city as icity
    from private.place_items(v_uid, v_from, v_until, v_now, p_sport_id, null) i
    join near n on n.id = i.place_id
  ),
  per_place as (
    select n.id as pid, n.name as pname, n.area as parea, n.city as pcity, n.lat as plat, n.lng as plng, n.km,
           count(i.*)::integer as cnt,
           count(i.*) filter (where i.status = 'live')::integer as live_n,
           count(i.*) filter (where i.status = 'forming')::integer as forming_n
    from near n
    join items i on i.place_id = n.id
    where not n.sensitive
    group by n.id, n.name, n.area, n.city, n.lat, n.lng, n.km
  ),
  top_forming as (
    select distinct on (i.place_id) i.place_id, i.plan_id, i.sport_name, i.member_count, i.capacity, i.starts_at
    from items i
    where i.status = 'forming' and i.kind = 'plan'
    order by i.place_id, i.member_count desc, i.capacity - i.member_count, i.starts_at, i.plan_id
  ),
  top_live as (
    select distinct on (i.place_id) i.place_id, i.activity_id,
           coalesce(i.title, i.sport_name) as ttl
    from items i
    where i.status = 'live'
    order by i.place_id, i.starts_at, i.activity_id, i.clan_run_id
  ),
  -- Sensitive places reach the area only from k items.
  area_items as (
    select i.* from items i where not i.sensitive
    union all
    select i.* from items i
    where i.sensitive
      and (select count(*) from items j where j.sensitive and j.iarea = i.iarea and j.icity = i.icity) >= v_k
  ),
  per_area as (
    select ar.area as aarea, ar.city as acity, ar.label as alabel, ar.lat::double precision as alat,
           ar.lng::double precision as alng,
           count(*)::integer as cnt,
           count(*) filter (where ai.status = 'live')::integer as live_n,
           count(*) filter (where ai.status = 'forming')::integer as forming_n
    from area_items ai
    join private.areas() ar on ar.area = ai.iarea and ar.city = ai.icity
    group by ar.area, ar.city, ar.label, ar.lat, ar.lng
  ),
  -- Latent demand per area and sport: active Down For signals (not yours, audience allows you, no
  -- block) whose window overlaps the filter, from people whose coarse point is near the area (within
  -- 2.5 km of its centroid; one person can be near two areas), in areas within your radius. Only from
  -- k people, and only where nothing you could join in that sport is forming in that area.
  sig as (
    select s.id, s.user_id, s.sport_id as sid, ar.area as sarea, ar.city as scity
    from public.intent_signals s
    join private.areas() ar
      on private.distance_m(s.area_lat::double precision, s.area_lng::double precision,
                            ar.lat::double precision, ar.lng::double precision) <= 2500
    where s.status = 'active' and s.expires_at > now() and s.window_end > greatest(now(), v_from)
      and s.window_start < v_until
      and s.user_id <> v_uid
      and s.area_lat is not null
      and (p_sport_id is null or s.sport_id = p_sport_id)
      and not authz.is_blocked(s.user_id, v_uid)
      and (s.audience = 'public' or authz.connected(s.user_id, v_uid))
  ),
  demand as (
    select ar.area as darea, ar.city as dcity, ar.label as dlabel, ar.lat::double precision as dlat,
           ar.lng::double precision as dlng, sg.sid, sp.name as sname, count(distinct sg.user_id)::integer as n
    from sig sg
    join private.areas() ar on ar.area = sg.sarea and ar.city = sg.scity
    join public.sports sp on sp.id = sg.sid
    where v_lat is null
       or private.distance_m(v_lat, v_lng, ar.lat::double precision, ar.lng::double precision) <= v_radius * 1000
    group by ar.area, ar.city, ar.label, ar.lat, ar.lng, sg.sid, sp.name
    having count(distinct sg.user_id) >= v_k
  )
  select 'place:' || pp.pid::text, 'place', pp.pid, pp.pname, pp.parea, pp.pcity, pp.parea || ', ' || pp.pcity,
         round(pp.plat::numeric, 4)::double precision, round(pp.plng::numeric, 4)::double precision, pp.km,
         pp.cnt, pp.live_n, pp.forming_n,
         tf.plan_id, tf.sport_name, tf.member_count, tf.capacity, tf.starts_at,
         tl.activity_id, tl.ttl,
         null::text, null::text, null::integer,
         pp.pname || ': ' || pp.cnt || case when pp.cnt = 1 then ' activity ' else ' activities ' end || v_words
           || case when tf.plan_id is not null
                   then ', ' || lower(tf.sport_name) || ' forming at ' || tf.member_count || ' of ' || tf.capacity
                   else '' end
           || case when tl.ttl is not null then ', ' || tl.ttl || ' live now' else '' end || '.'
  from per_place pp
  left join top_forming tf on tf.place_id = pp.pid
  left join top_live tl on tl.place_id = pp.pid
  union all
  select 'area:' || pa.acity || ':' || pa.aarea, 'area', null::uuid, null::text, pa.aarea, pa.acity, pa.alabel,
         pa.alat, pa.alng,
         case when v_lat is not null
              then round((private.distance_m(v_lat, v_lng, pa.alat, pa.alng) / 1000)::numeric, 1) end,
         pa.cnt, pa.live_n, pa.forming_n,
         null::uuid, null::text, null::integer, null::integer, null::timestamptz, null::uuid, null::text,
         null::text, null::text, null::integer,
         pa.aarea || ': ' || pa.cnt || case when pa.cnt = 1 then ' activity ' else ' activities ' end || v_words || '.'
  from per_area pa
  union all
  select 'demand:' || d.dcity || ':' || d.darea || ':' || d.sid, 'demand', null::uuid, null::text, d.darea, d.dcity,
         d.dlabel, d.dlat, d.dlng,
         case when v_lat is not null
              then round((private.distance_m(v_lat, v_lng, d.dlat, d.dlng) / 1000)::numeric, 1) end,
         null::integer, null::integer, null::integer,
         null::uuid, null::text, null::integer, null::integer, null::timestamptz, null::uuid, null::text,
         d.sid, d.sname, d.n,
         d.n || ' people want ' || lower(d.sname) || ' near ' || d.darea || ' ' || v_words || '.'
  from demand d
  where not exists (
    select 1 from items i
    where i.iarea = d.darea and i.icity = d.dcity and i.sport_id = d.sid and i.status = 'forming'
      and i.member_count < i.capacity
  )
  order by 2 desc, 11 desc nulls last, 23 desc nulls last, 1;

  get diagnostics v_n = row_count;
  perform private.emit('pulse_viewed', v_uid,
    jsonb_build_object('markers', v_n, 'sport_id', p_sport_id, 'when', coalesce(p_when, 'tonight'),
                       'radius_km', v_radius));
end;
$$;

-- The selected-place sheet on Pulse: facts and what's on there in the filter's window.
create or replace function public.pulse_place(
  p_place_id uuid,
  p_sport_id text default null,
  p_when text default 'tonight'
)
returns table (
  place_id uuid,
  name text,
  area text,
  city text,
  kind public.place_kind,
  main_sport_id text,
  main_sport_name text,
  surface text,
  floodlit_until time,
  is_free boolean,
  time_zone text,
  distance_km numeric,
  facts text,
  suppressed boolean,
  activity_count integer,
  live_count integer,
  forming_count integer,
  forming_plan_id uuid,
  forming_sport_name text,
  forming_member_count integer,
  forming_capacity integer,
  forming_starts_at timestamptz,
  headline text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_pl public.places;
  v_lat double precision;
  v_lng double precision;
  v_km numeric;
  v_from timestamptz;
  v_until timestamptz;
  v_now boolean;
  v_words text;
  v_main text;
  v_main_name text;
  v_cnt integer;
  v_live integer;
  v_forming integer;
  v_top_plan uuid;
  v_top_sport text;
  v_top_members integer;
  v_top_cap integer;
  v_top_at timestamptz;
  v_headline text;
begin
  select * into v_pl from public.places pl where pl.id = p_place_id;
  if not found then
    perform private.fail('place_unknown');
  end if;
  if p_sport_id is not null and not exists (select 1 from public.sports s where s.id = p_sport_id) then
    perform private.fail('sport_unknown');
  end if;
  select me.lat, me.lng into v_lat, v_lng from private.viewer(v_uid) me;
  if v_lat is not null then
    v_km := round((private.distance_m(v_lat, v_lng, v_pl.lat, v_pl.lng) / 1000)::numeric, 1);
  end if;
  select w.w_from, w.w_until, w.includes_now, w.words into v_from, v_until, v_now, v_words
  from private.pulse_window(p_when, v_pl.time_zone) w;
  v_main := case when p_sport_id is not null and p_sport_id = any (v_pl.sport_ids) then p_sport_id
                 else private.place_main_sport(v_pl.id) end;
  select s.name into v_main_name from public.sports s where s.id = v_main;

  if not v_pl.sensitive then
    select count(*)::integer, count(*) filter (where i.status = 'live')::integer,
           count(*) filter (where i.status = 'forming')::integer
      into v_cnt, v_live, v_forming
    from private.place_items(v_uid, v_from, v_until, v_now, p_sport_id, v_pl.id) i;
    select i.plan_id, i.sport_name, i.member_count, i.capacity, i.starts_at
      into v_top_plan, v_top_sport, v_top_members, v_top_cap, v_top_at
    from private.place_items(v_uid, v_from, v_until, v_now, p_sport_id, v_pl.id) i
    where i.status = 'forming' and i.kind = 'plan'
    order by i.member_count desc, i.capacity - i.member_count, i.starts_at, i.plan_id
    limit 1;
    v_headline := case
      when v_cnt = 0 then 'Nothing on ' || v_words || ' yet.'
      else v_cnt || case when v_cnt = 1 then ' activity ' else ' activities ' end || v_words || '.' end
      || case when v_top_plan is not null
              then ' ' || v_top_sport || ' is forming at ' || v_top_members || ' / ' || v_top_cap
                   || ' for ' || private.fmt_clock(v_top_at, v_pl.time_zone) || '.'
              else '' end;
  else
    v_headline := 'Activity here is only shown to the people in it.';
  end if;

  return query select
    v_pl.id, v_pl.name, v_pl.area, v_pl.city, v_pl.kind, v_main, v_main_name, v_pl.surface, v_pl.floodlit_until,
    v_pl.is_free, v_pl.time_zone, v_km,
    array_to_string(array_remove(array[
      v_main_name,
      lower(v_pl.surface),
      case when v_pl.floodlit_until is not null
           then 'floodlit until ' || private.fmt_time_of_day(v_pl.floodlit_until) end,
      case when v_km is not null then private.fmt_km(v_km) end
    ], null), ' · '),
    v_pl.sensitive,
    v_cnt, v_live, v_forming,
    v_top_plan, v_top_sport, v_top_members, v_top_cap, v_top_at,
    v_headline;
end;
$$;

-- Place ------------------------------------------------------------------------------------------------

create or replace function public.place_view(p_place_id uuid)
returns table (
  place_id uuid,
  slug text,
  name text,
  area text,
  city text,
  area_label text,
  kind public.place_kind,
  description text,
  sport_ids text[],
  sport_names text[],
  main_sport_id text,
  main_sport_name text,
  surface text,
  facilities text[],
  floodlit_until time,
  is_free boolean,
  verification public.place_verification,
  verified_at timestamptz,
  photo_path text,
  time_zone text,
  lat double precision,
  lng double precision,
  distance_km numeric,
  sensitive boolean,
  facts text,
  tonight_count integer,
  forming_count integer,
  live_count integer,
  has_busy_history boolean,
  busy_part public.day_part,
  busy_levels integer[],
  busiest_day smallint,
  today_day smallint,
  today_rank integer,
  busy_summary text,
  prefill_sport_id text,
  prefill_starts_at timestamptz,
  prefill_duration_minutes integer,
  prefill_capacity integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_pl public.places;
  v_lat double precision;
  v_lng double precision;
  v_km numeric;
  v_main text;
  v_main_name text;
  v_names text[];
  v_busy record;
  v_tonight integer;
  v_forming integer;
  v_live integer;
  v_prefill_sport text;
  v_sport public.sports;
  v_start timestamptz;
  v_local_day date;
begin
  select * into v_pl from public.places pl where pl.id = p_place_id;
  if not found then
    perform private.fail('place_unknown');
  end if;
  select me.lat, me.lng into v_lat, v_lng from private.viewer(v_uid) me;
  if v_lat is not null then
    v_km := round((private.distance_m(v_lat, v_lng, v_pl.lat, v_pl.lng) / 1000)::numeric, 1);
  end if;
  v_main := private.place_main_sport(v_pl.id);
  select s.name into v_main_name from public.sports s where s.id = v_main;
  select array_agg(s.name order by array_position(v_pl.sport_ids, s.id)) into v_names
  from public.sports s where s.id = any (v_pl.sport_ids);
  select * into v_busy from private.place_busy(v_pl.id);

  -- Sensitive places: counts only of what you're in.
  select count(*)::integer, count(*) filter (where i.status = 'forming')::integer,
         count(*) filter (where i.status = 'live')::integer
    into v_tonight, v_forming, v_live
  from private.place_items(v_uid, now(), private.tonight_end(v_pl.time_zone), true, null, v_pl.id) i
  where not v_pl.sensitive or i.i_am_in;

  -- CREATE ACTIVITY HERE: your main sport when the place has it, else the place's main sport; the
  -- sport's default size and length; the busiest hour here (or 7 PM) on the next day it is at least
  -- 2 hours away, else the next half hour 2 hours from now.
  select us.sport_id into v_prefill_sport from public.user_sports us
  where us.user_id = v_uid and us.is_main and us.sport_id = any (v_pl.sport_ids) limit 1;
  v_prefill_sport := coalesce(v_prefill_sport, v_main);
  select * into v_sport from public.sports s where s.id = v_prefill_sport;
  v_local_day := (now() at time zone v_pl.time_zone)::date;
  v_start := (v_local_day + make_time(coalesce(v_busy.busy_hour, 19)::integer, 0, 0)) at time zone v_pl.time_zone;
  if v_start < now() + interval '2 hours' then
    v_start := date_bin('30 minutes', now() + interval '2 hours 29 minutes', timestamptz '2000-01-01');
  end if;

  perform private.emit('place_viewed', v_uid,
    jsonb_build_object('place_id', v_pl.id, 'sensitive', v_pl.sensitive, 'tonight_count', v_tonight));

  return query select
    v_pl.id, v_pl.slug, v_pl.name, v_pl.area, v_pl.city, v_pl.area || ', ' || v_pl.city, v_pl.kind,
    v_pl.description, v_pl.sport_ids, coalesce(v_names, '{}'), v_main, v_main_name, v_pl.surface, v_pl.facilities,
    v_pl.floodlit_until, v_pl.is_free, v_pl.verification, v_pl.verified_at, v_pl.photo_path, v_pl.time_zone,
    round(v_pl.lat::numeric, 4)::double precision, round(v_pl.lng::numeric, 4)::double precision, v_km,
    v_pl.sensitive,
    array_to_string(array_remove(array[
      v_main_name,
      lower(v_pl.surface),
      case when v_pl.floodlit_until is not null
           then 'floodlit until ' || private.fmt_time_of_day(v_pl.floodlit_until) end,
      case when v_pl.is_free then 'free' else 'paid entry' end
    ], null), ' · '),
    v_tonight, v_forming, v_live,
    v_busy.has_history, v_busy.busy_part, v_busy.busy_levels, v_busy.busiest_day, v_busy.today_day,
    v_busy.today_rank, v_busy.summary,
    v_sport.id, v_start, v_sport.default_duration_minutes, v_sport.default_capacity;
end;
$$;

-- TONIGHT HERE (or another window): what's on at the place that you may see. On a sensitive place only
-- what you're in.
create or replace function public.place_tonight(p_place_id uuid, p_when text default 'tonight')
returns table (
  kind text,
  plan_id uuid,
  activity_id uuid,
  clan_run_id uuid,
  clan_id uuid,
  sport_id text,
  sport_name text,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  member_count integer,
  capacity integer,
  spots_left integer,
  level_label text,
  meeting_point text,
  i_am_in boolean,
  time_zone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_pl public.places;
  v_from timestamptz;
  v_until timestamptz;
  v_now boolean;
begin
  select * into v_pl from public.places pl where pl.id = p_place_id;
  if not found then
    perform private.fail('place_unknown');
  end if;
  select w.w_from, w.w_until, w.includes_now into v_from, v_until, v_now
  from private.pulse_window(p_when, v_pl.time_zone) w;
  return query
    select i.kind, i.plan_id, i.activity_id, i.clan_run_id, i.clan_id, i.sport_id, i.sport_name, i.title,
           i.starts_at, i.ends_at, i.status, i.member_count, i.capacity, greatest(i.capacity - i.member_count, 0),
           i.level_label, i.meeting_point, i.i_am_in, v_pl.time_zone
    from private.place_items(v_uid, v_from, v_until, v_now, null, v_pl.id) i
    where not v_pl.sensitive or i.i_am_in
    order by i.starts_at, i.kind, i.plan_id, i.clan_run_id
    limit 50;
end;
$$;

-- RITUALS HERE: the regular groups that play at the place, each only if you may see it:
--   crew_ritual  an active Ritual of a crew you're in (crews are private)
--   clan_ritual  an active Ritual of a clan you can see (open and request clans; invite clans: members)
--   host_series  a running series of a host program (programs are public; not across a block)
create or replace function public.place_groups(p_place_id uuid)
returns table (
  kind text,
  id uuid,
  group_id uuid,
  group_name text,
  title text,
  sport_id text,
  sport_name text,
  days smallint[],
  local_time time,
  time_zone text,
  distance_km numeric,
  weeks_running integer,
  access text,
  i_am_in boolean,
  cadence text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
begin
  if not exists (select 1 from public.places pl where pl.id = p_place_id) then
    perform private.fail('place_unknown');
  end if;
  return query
  with g as (
    select 'crew_ritual'::text as k, r.id as rid, cr.id as gid, cr.name as gname, r.title as ttl, r.sport_id as sid,
           array[r.day_of_week]::smallint[] as dd, r.local_time as lt, r.time_zone as tz, r.distance_km as km,
           'crew'::text as acc, true as mine
    from public.rituals r
    join public.crews cr on cr.id = r.crew_id
    where r.place_id = p_place_id and r.status = 'active' and cr.archived_at is null
      and authz.is_crew_member(cr.id, v_uid)
    union all
    select 'clan_ritual', r.id, c.id, c.name, r.title, r.sport_id, array[r.day_of_week]::smallint[], r.local_time,
           r.time_zone, r.distance_km, c.join_policy::text, authz.is_clan_member(c.id, v_uid)
    from public.rituals r
    join public.clans c on c.id = r.clan_id
    where r.place_id = p_place_id and r.status = 'active'
      and authz.can_see_clan(c.id, v_uid)
      and not authz.is_blocked(r.host_id, v_uid)
    union all
    select 'host_series', s.id, hp.id, hp.name, s.name, s.sport_id, s.repeat_days, s.start_time,
           pl.time_zone, null::numeric,
           case when s.approval_required then 'request' else 'open' end,
           (authz.is_program_member(hp.id, v_uid) or authz.is_program_host(hp.id, v_uid))
    from public.host_series s
    join public.host_programs hp on hp.id = s.program_id
    join public.places pl on pl.id = s.place_id
    where s.place_id = p_place_id and s.ended_at is null and hp.archived_at is null
      and (s.until_on is null or s.until_on >= (now() at time zone pl.time_zone)::date)
      and not authz.is_blocked(hp.created_by, v_uid)
  ),
  weeks as (
    -- Weeks in a row the Ritual happened: past weeks that became a plan or club run, since the last
    -- skipped one.
    select g.rid,
           (select count(*)::integer from public.ritual_occurrences o
             where o.ritual_id = g.rid and o.starts_at < now() and o.skipped_at is null
               and (o.plan_id is not null or o.clan_run_id is not null)
               and o.occurs_on > coalesce((select max(o2.occurs_on) from public.ritual_occurrences o2
                                           where o2.ritual_id = g.rid and o2.starts_at < now()
                                             and o2.skipped_at is not null), '-infinity'::date)) as n
    from g where g.k <> 'host_series'
  )
  select g.k, g.rid, g.gid, g.gname, g.ttl, g.sid, sp.name, g.dd, g.lt, g.tz, g.km,
         case when g.k = 'host_series'
              then (select count(*)::integer from public.host_sessions hs
                    where hs.series_id = g.rid and hs.status <> 'skipped' and hs.starts_at < now())
              else coalesce(w.n, 0) end,
         g.acc, g.mine,
         case when cardinality(g.dd) = 1 then 'Every week, ' else private.join_words(
                (select array_agg(to_char(date '2024-01-01' + (d - 1), 'Dy') order by d) from unnest(g.dd) d))
                || ', ' end
           || to_char(g.lt, 'FMHH12:MI')
  from g
  join public.sports sp on sp.id = g.sid
  left join weeks w on w.rid = g.rid
  order by g.dd[1], g.lt, g.k, g.rid;
end;
$$;

-- HOSTS HERE: people who host here, most games first. Listed: they run a series here (a public role),
-- or they hosted at least place_host_min_games() finished games here and let you see their history.
-- Never across a block. `hosted_here` = finished games they hosted here (not cancelled).
create or replace function public.place_hosts(p_place_id uuid, p_limit integer default 3)
returns table (
  user_id uuid,
  display_name text,
  handle text,
  avatar_path text,
  hosted_here integer,
  trusted_host boolean,
  program_id uuid,
  program_name text,
  is_top boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
begin
  if not exists (select 1 from public.places pl where pl.id = p_place_id) then
    perform private.fail('place_unknown');
  end if;
  return query
  with hosted as (
    select a.host_id as hid, count(*)::integer as n
    from public.activities a
    where a.place_id = p_place_id and a.status <> 'cancelled' and coalesce(a.ended_at, a.ends_at) <= now()
    group by a.host_id
  ),
  programs as (
    select distinct on (h.user_id) h.user_id as hid, hp.id as prog_id, hp.name as prog_name
    from public.host_series s
    join public.host_programs hp on hp.id = s.program_id
    join public.host_program_hosts h on h.program_id = hp.id
    where s.place_id = p_place_id and s.ended_at is null and hp.archived_at is null
    order by h.user_id, (h.role = 'owner') desc, hp.created_at
  ),
  cand as (
    select coalesce(ho.hid, pr.hid) as hid, coalesce(ho.n, 0) as n, pr.prog_id, pr.prog_name
    from hosted ho
    full join programs pr on pr.hid = ho.hid
  ),
  listed as (
    select c.*, pf.display_name as dn, pf.handle as hd, pf.avatar_path as av
    from cand c
    join public.profiles pf on pf.id = c.hid
    where not authz.is_blocked(c.hid, v_uid)
      and (c.prog_id is not null
           or (c.n >= private.place_host_min_games() and authz.can_see_part(c.hid, 'history', v_uid)))
  )
  select l.hid, l.dn, l.hd, l.av, l.n, private.trusted_host(l.hid), l.prog_id, l.prog_name,
         row_number() over (order by l.n desc, l.dn, l.hid) = 1
  from listed l
  order by l.n desc, l.dn, l.hid
  limit least(greatest(coalesce(p_limit, 3), 1), 10);
end;
$$;

-- WHEN IT'S BUSY by weekday and hour: 0–100 levels from finished sessions in the last 12 weeks
-- (public plans' games and open clans' club runs). Empty without enough history. Hours with nothing
-- are not returned.
create or replace function public.place_busy_times(p_place_id uuid)
returns table (day_of_week smallint, hour smallint, part public.day_part, level integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
begin
  if not exists (select 1 from public.places pl where pl.id = p_place_id) then
    perform private.fail('place_unknown');
  end if;
  if (select count(*) from private.place_history(p_place_id)) < private.place_busy_min_games() then
    return;
  end if;
  return query
  with c as (
    select h.day_of_week as d, h.hour as hr, h.part as pt, sum(h.people)::integer as n
    from private.place_history(p_place_id) h
    group by h.day_of_week, h.hour, h.part
  )
  select c.d, c.hr, c.pt, round(100.0 * c.n / greatest((select max(n) from c), 1))::integer
  from c
  where c.n > 0
  order by c.d, c.hr;
end;
$$;

-- Report: places --------------------------------------------------------------------------------------------
-- Plugs 'place' into the seam (20261030100010_communities_report.sql). Keeps the Host OS kind
-- ('host_program', 20261030200500_host_core_report.sql) exactly as it was.

create or replace function private.report_subject_visible(p_kind text, p_id uuid, p_viewer uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_kind = 'host_program' then
    return exists (
      select 1 from public.host_programs p
      where p.id = p_id and p.archived_at is null and not authz.is_blocked(p.created_by, p_viewer)
    );
  end if;
  if p_kind = 'place' then
    return exists (select 1 from public.places pl where pl.id = p_id);
  end if;
  return null;
end;
$$;

-- Privileges -------------------------------------------------------------------------------------------------

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.prokind = 'f'
      and p.proname in ('place_busy_min_games', 'place_host_min_games', 'pulse_window', 'fmt_clock',
                        'fmt_time_of_day', 'place_items', 'place_main_sport', 'place_history', 'place_busy',
                        'trusted_host', 'report_subject_visible')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in ('pulse', 'pulse_place', 'place_view', 'place_tonight', 'place_groups', 'place_hosts',
                        'place_busy_times')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end;
$$;
