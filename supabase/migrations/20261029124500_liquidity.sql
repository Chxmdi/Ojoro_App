-- Step 3: Liquidity (PRD M4: §9.5 Need One More, §9.6 Ojoro Now, discovery, low-density Home).
--
-- Contract for the app: docs/LIQUIDITY_CONTRACT.md. Judgment calls: docs/DESIGN_DECISIONS.md
-- ("Step 3 backend").
--
-- What this adds:
--   1. Areas without location permission: areas_list(), set_area().
--   2. Ojoro Now: ojoro_now(), further_out(), home_density().
--   3. Latent demand (counts only, k-anonymous): latent_demand(), create_from_demand().
--   4. Suggestions: surprise_me(), concierge_suggest() (the rules-based Concierge stub).
--   5. Discover: discover_search(), people_to_move_with(), places_nearby(), sports_nearby().
--   6. pull_in_candidates() ranked by relationship tier (PRD §9.5), with a reason per person.
--   7. plan_cards.place_time_zone.
--
-- Privacy rules applied everywhere below:
--   * Nobody's location leaves the server. People's coarse points (0.01°) are only compared; the
--     only distances returned are to public places (0.1 km) and, for Pull Someone In candidates,
--     whole kilometres (at least 1) between two coarse points.
--   * Latent demand is a count per sport and part of day, shown only from LATENT_DEMAND_K people
--     (private.latent_demand_k() = 3), never with ids, names, places or exact times.
--   * Blocked people are excluded in both directions; visibility is authz.can_see_plan.
--   * Read RPCs that record an analytics event are VOLATILE: call them with supabase.rpc() (POST),
--     never with { get: true }.

-- Return shapes ---------------------------------------------------------------------------------

create type public.area_state as (
  area text,
  area_lat numeric,
  area_lng numeric,
  discovery_radius_km integer
);

-- Small helpers ---------------------------------------------------------------------------------

-- k for latent demand: a bucket shows only when at least this many other people are in it.
create or replace function private.latent_demand_k()
returns integer
language sql
immutable
set search_path = ''
as $$ select 3 $$;

-- The caller's coarse point, radius, time zone and area label. No row without a profile.
create or replace function private.viewer(p_uid uuid)
returns table (lat double precision, lng double precision, radius_km integer, tz text, area text,
               joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.area_lat::double precision, pp.area_lng::double precision, pp.discovery_radius_km,
         pr.time_zone, pr.area, coalesce(pr.onboarding_completed_at, pr.created_at)
  from public.profiles pr
  join public.profile_private pp on pp.user_id = pr.id
  where pr.id = p_uid;
$$;

-- "1.2 km", "4 km".
create or replace function private.fmt_km(p_km numeric)
returns text
language sql
immutable
set search_path = ''
as $$ select trim_scale(p_km)::text || ' km' $$;

-- "40 min", "1 h 10 min", "2 h", "3 days".
create or replace function private.fmt_minutes(p_minutes integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_minutes < 60 then greatest(p_minutes, 1) || ' min'
    when p_minutes < 1440 then (p_minutes / 60) || ' h' || case when p_minutes % 60 > 0 then ' ' || (p_minutes % 60) || ' min' else '' end
    when p_minutes < 2880 then '1 day'
    else (p_minutes / 1440) || ' days'
  end;
$$;

-- ['a', 'b', 'c'] → 'a, b and c'.
create or replace function private.join_words(p_words text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(cardinality(p_words), 0) = 0 then null
    when cardinality(p_words) = 1 then p_words[1]
    else array_to_string(p_words[1:cardinality(p_words) - 1], ', ') || ' and ' || p_words[cardinality(p_words)]
  end;
$$;

-- Lower-case and fold common accents, for search ("montreal" finds "Montréal").
create or replace function private.fold(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(lower(coalesce(p_text, '')), 'àáâäãåçèéêëìíîïñòóôöõùúûüýÿœ', 'aaaaaaceeeeiiiinooooouuuuyyo');
$$;

-- End of "tonight" in a time zone: 4 AM the next local morning (02:00 still belongs to last night).
create or replace function private.tonight_end(p_tz text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((((now() at time zone p_tz) - interval '4 hours')::date + 1) + interval '4 hours') at time zone p_tz;
$$;

-- Areas ---------------------------------------------------------------------------------------------
-- Neighbourhoods are derived from public places: the label "Plateau, Montréal" and the centroid of
-- that neighbourhood's places, rounded to 0.01° (about 1 km). Picking one never needs device location.

create or replace function private.areas()
returns table (area text, city text, label text, lat numeric, lng numeric, place_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select pl.area, pl.city, pl.area || ', ' || pl.city,
         round(avg(pl.lat)::numeric, 2), round(avg(pl.lng)::numeric, 2), count(*)::integer
  from public.places pl
  group by pl.area, pl.city;
$$;

create or replace function public.areas_list()
returns table (area text, city text, label text, lat numeric, lng numeric, place_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.area, a.city, a.label, a.lat, a.lng, a.place_count
  from private.areas() a
  where auth.uid() is not null
  order by a.city, a.area;
$$;

-- Set your area from the list: the label goes on the profile and the neighbourhood's coarse
-- centroid into profile_private (0.01°). Optionally sets the discovery radius too.
create or replace function public.set_area(p_area text, p_discovery_radius_km integer default null)
returns public.area_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_q text := lower(trim(coalesce(p_area, '')));
  v_label text;
  v_lat numeric;
  v_lng numeric;
  v_state public.area_state;
begin
  if p_discovery_radius_km is not null and p_discovery_radius_km not between 1 and 50 then
    perform private.fail('radius_invalid');
  end if;
  select a.label, a.lat, a.lng into v_label, v_lat, v_lng
  from private.areas() a
  where lower(a.label) = v_q
     or (lower(a.area) = v_q and (select count(*) from private.areas() b where lower(b.area) = v_q) = 1)
  limit 1;
  if v_label is null then
    perform private.fail('area_unknown');
  end if;

  update public.profiles set area = left(v_label, 60) where id = v_uid;
  update public.profile_private
     set area_lat = round(v_lat, 2), area_lng = round(v_lng, 2),
         discovery_radius_km = coalesce(p_discovery_radius_km, discovery_radius_km)
   where user_id = v_uid;

  select pr.area, pp.area_lat, pp.area_lng, pp.discovery_radius_km into v_state
  from public.profiles pr join public.profile_private pp on pp.user_id = pr.id
  where pr.id = v_uid;

  perform private.emit('area_set', v_uid, jsonb_build_object('method', 'list'));
  return v_state;
end;
$$;

-- plan_cards: the place's time zone (appended; a view can only grow at the end) -------------------

create or replace view public.plan_cards with (security_invoker = true) as
select
  p.id,
  p.sport_id,
  s.name as sport_name,
  s.family as sport_family,
  p.title,
  p.starts_at,
  p.duration_minutes,
  p.capacity,
  p.member_count,
  greatest(p.capacity - p.member_count, 0) as spots_left,
  p.audience,
  p.deadline_at,
  p.poll_closes_at,
  p.status,
  case
    when p.status = 'forming' and p.deadline_at <= now() then 'expired'::public.plan_status
    else p.status
  end as effective_status,
  p.source,
  p.source_activity_id,
  p.created_by,
  p.host_id,
  p.place_id,
  pl.name as place_name,
  pl.area as place_area,
  pl.surface as place_surface,
  pl.floodlit_until as place_floodlit_until,
  pl.is_free as place_is_free,
  pl.lat as place_lat,
  pl.lng as place_lng,
  p.level_label,
  p.team_a_label,
  p.team_b_label,
  p.teams_note,
  p.kit_note,
  p.cost_cents,
  p.currency,
  p.attendance_rule,
  p.locked_at,
  p.created_at,
  (select a.id from public.activities a where a.plan_id = p.id) as activity_id,
  exists (
    select 1 from public.plan_members m where m.plan_id = p.id and m.user_id = (select auth.uid())
  ) as i_am_in,
  pl.time_zone as place_time_zone
from public.plans p
join public.sports s on s.id = p.sport_id
left join public.places pl on pl.id = p.place_id;

-- Opportunities: what the caller can join or watch ------------------------------------------------
-- Forming plans with spots, GAME ON games that haven't started, and (optionally) live games, that
-- the caller can see and isn't in, with nobody in them blocked either way. Distance is from the
-- caller's coarse area to the public place: only places with a distance in (p_min_km, p_max_km]
-- when the caller has an area; everything visible when they don't (distance null).

create or replace function private.opportunities(
  p_uid uuid,
  p_until timestamptz,
  p_min_km numeric,
  p_max_km numeric,
  p_include_live boolean,
  p_sport_id text
)
returns table (
  kind text,
  plan_id uuid,
  activity_id uuid,
  sport_id text,
  sport_name text,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  member_count integer,
  capacity integer,
  spots_left integer,
  place_id uuid,
  place_name text,
  place_area text,
  place_time_zone text,
  distance_km numeric,
  minutes_to_start integer,
  played_with_count integer,
  action text,
  reasons text[],
  reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select * from private.viewer(p_uid)),
  base as (
    select p.id as pid, a.id as aid, p.sport_id as sid, s.name as sname,
           coalesce(a.title, p.title) as ttl,
           coalesce(a.starts_at, p.starts_at) as st,
           case when a.id is not null then coalesce(a.ended_at, a.ends_at)
                else p.starts_at + make_interval(mins => p.duration_minutes) end as en,
           case when a.id is null then 'forming'
                when private.activity_status_now(a) = 'live' then 'live'
                else 'game_on' end as stat,
           case when a.id is null then p.member_count else a.confirmed_count end as cnt,
           p.capacity as cap,
           a.check_in_opens_at as cio,
           pl.id as plid, pl.name as plname, pl.area as plarea, pl.time_zone as pltz,
           case when me.lat is not null and pl.id is not null
                then round((private.distance_m(me.lat, me.lng, pl.lat, pl.lng) / 1000)::numeric, 1) end as km,
           me.lat as mlat
    from public.plans p
    cross join me
    join public.sports s on s.id = p.sport_id
    left join public.places pl on pl.id = p.place_id
    left join public.activities a on a.plan_id = p.id
    where (p_sport_id is null or p.sport_id = p_sport_id)
      and p.status in ('forming', 'game_on')
      and (
        (a.id is null and p.status = 'forming' and p.deadline_at > now() and p.member_count < p.capacity
         and p.starts_at > now() and p.starts_at <= p_until)
        or (a.id is not null and a.status <> 'cancelled' and a.live_at is null
            and a.starts_at > now() and a.starts_at <= p_until)
        or (p_include_live and a.id is not null and private.activity_status_now(a) = 'live')
      )
  ),
  vis as (
    select b.*,
           (select count(*)::integer from public.plan_members m
             where m.plan_id = b.pid and m.user_id <> p_uid
               and authz.connected(m.user_id, p_uid) and not authz.is_blocked(m.user_id, p_uid)) as pw
    from base b
    where authz.can_see_plan(b.pid, p_uid)
      and not exists (select 1 from public.plan_members m
                      where m.plan_id = b.pid and (m.user_id = p_uid or authz.is_blocked(m.user_id, p_uid)))
      and (b.aid is null or not exists (
            select 1 from public.attendance t
            where t.activity_id = b.aid
              and ((t.user_id = p_uid and t.status <> 'cancelled')
                   or (t.status in ('confirmed', 'checked_in') and authz.is_blocked(t.user_id, p_uid)))))
      and (b.mlat is null
           or (b.km is not null and b.km <= p_max_km and (p_min_km is null or b.km > p_min_km)))
  )
  select
    case when v.aid is null then 'plan' else 'activity' end,
    v.pid, v.aid, v.sid, v.sname, v.ttl, v.st, v.en, v.stat, v.cnt, v.cap, greatest(v.cap - v.cnt, 0),
    v.plid, v.plname, v.plarea, v.pltz, v.km,
    ceil(extract(epoch from v.st - now()) / 60)::integer,
    v.pw,
    case when v.stat = 'live' then 'watch'
         when v.stat = 'forming' then 'join'
         when v.cnt < v.cap and now() < v.cio then 'join'
         else 'waitlist' end,
    r.reasons,
    array_to_string(r.reasons, ' · ')
  from vis v
  cross join lateral (
    select array_remove(array[
      case when v.stat = 'live' then 'on now'
           else 'starts in ' || private.fmt_minutes(ceil(extract(epoch from v.st - now()) / 60)::integer) end,
      case when v.km is not null then private.fmt_km(v.km) end,
      case when v.pw = 1 then '1 person you''ve played with'
           when v.pw > 1 then v.pw || ' people you''ve played with' end,
      case when v.stat = 'forming' and v.cap - v.cnt = 1 then 'needs one more' end
    ], null) as reasons
  ) r
  order by v.st, v.km nulls last, v.pid;
$$;

-- OJORO NOW · WITHIN THE HOUR: what starts soon (and what's live) within your radius.
create or replace function public.ojoro_now(p_within_minutes integer default 60, p_sport_id text default null)
returns table (
  kind text,
  plan_id uuid,
  activity_id uuid,
  sport_id text,
  sport_name text,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  member_count integer,
  capacity integer,
  spots_left integer,
  place_id uuid,
  place_name text,
  place_area text,
  place_time_zone text,
  distance_km numeric,
  minutes_to_start integer,
  played_with_count integer,
  action text,
  reasons text[],
  reason text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_minutes integer := least(greatest(coalesce(p_within_minutes, 60), 15), 240);
  v_radius integer;
  v_n integer;
begin
  select pp.discovery_radius_km into v_radius from public.profile_private pp where pp.user_id = v_uid;
  return query
    select * from private.opportunities(v_uid, now() + make_interval(mins => v_minutes), null,
                                        coalesce(v_radius, 3), true, p_sport_id);
  get diagnostics v_n = row_count;
  perform private.emit('ojoro_now_served', v_uid,
    jsonb_build_object('count', v_n, 'within_minutes', v_minutes, 'sport_id', p_sport_id));
end;
$$;

-- A BIT FURTHER OUT: plans beyond your radius, up to twice it (at most 25 km), in the next 7 days.
-- Needs an area (empty without one).
create or replace function public.further_out(p_limit integer default 5)
returns table (
  kind text,
  plan_id uuid,
  activity_id uuid,
  sport_id text,
  sport_name text,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  member_count integer,
  capacity integer,
  spots_left integer,
  place_id uuid,
  place_name text,
  place_area text,
  place_time_zone text,
  distance_km numeric,
  minutes_to_start integer,
  played_with_count integer,
  action text,
  reasons text[],
  reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.*
  from private.viewer(auth.uid()) me
  cross join lateral private.opportunities(
    auth.uid(), now() + interval '7 days', me.radius_km::numeric,
    least(2 * me.radius_km, 25)::numeric, false, null) o
  where me.lat is not null
  order by o.starts_at, o.distance_km, o.plan_id
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

-- Latent demand --------------------------------------------------------------------------------------
-- Active Down For signals near the caller (both inside each other's radius, audience allows the
-- caller, no block), grouped by sport and part of day (morning before 11:00, midday 11:00–16:59,
-- evening from 17:00, in the caller's time zone), over the next 7 days. For each bucket the start
-- time that most of them can make (15-minute boundary, at least ~1 hour from now) and how many can
-- make it. Buckets with an open plan the caller could join (same sport, starts in the bucket, spots
-- left, place within the radius) and buckets under k people are dropped. The caller's own signals
-- never count.

create or replace function private.latent_buckets(p_uid uuid, p_sport_id text)
returns table (
  sport_id text,
  sport_name text,
  day date,
  part public.day_part,
  window_start timestamptz,
  window_end timestamptz,
  suggested_start timestamptz,
  people_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select * from private.viewer(p_uid)),
  sig as (
    select s.id, s.user_id, s.sport_id as sid, s.window_start as ws, s.window_end as we
    from public.intent_signals s
    cross join me
    where me.lat is not null
      and s.status = 'active' and s.expires_at > now() and s.window_end > now()
      and s.window_start < now() + interval '7 days'
      and s.user_id <> p_uid
      and (p_sport_id is null or s.sport_id = p_sport_id)
      and s.area_lat is not null
      and not authz.is_blocked(s.user_id, p_uid)
      and (s.audience = 'public' or authz.connected(s.user_id, p_uid))
      and private.distance_m(me.lat, me.lng, s.area_lat::double precision, s.area_lng::double precision)
          <= least(s.radius_km, me.radius_km) * 1000
  ),
  parts (part, off_start, off_end) as (
    values ('morning'::public.day_part, interval '0 hours', interval '11 hours'),
           ('midday'::public.day_part, interval '11 hours', interval '17 hours'),
           ('evening'::public.day_part, interval '17 hours', interval '24 hours')
  ),
  inb as (
    select s.*, d.day, pt.part,
           ((d.day + pt.off_start) at time zone me.tz) as b_start,
           ((d.day + pt.off_end) at time zone me.tz) as b_end
    from sig s
    cross join me
    cross join lateral (
      select g::date as day
      from generate_series((greatest(s.ws, now()) at time zone me.tz)::date,
                           (s.we at time zone me.tz)::date, interval '1 day') g
    ) d
    cross join parts pt
  ),
  inside as (
    select * from inb i where i.b_start < i.we and i.b_end > greatest(i.ws, now())
  ),
  cand as (
    select distinct i.sid, i.day, i.part, i.b_start, i.b_end,
           greatest(i.ws, i.b_start,
                    date_bin('15 minutes', now() + interval '59 minutes', timestamptz '2000-01-01')) as t
    from inside i
  ),
  scored as (
    select c.*,
           (select count(distinct x.user_id)::integer from inside x
             where x.sid = c.sid and x.day = c.day and x.part = c.part and x.ws <= c.t and x.we > c.t) as n
    from cand c
    where c.t < c.b_end
  ),
  best as (
    select distinct on (sc.sid, sc.day, sc.part) sc.*
    from scored sc
    order by sc.sid, sc.day, sc.part, sc.n desc, sc.t
  )
  select b.sid, sp.name, b.day, b.part, greatest(b.b_start, now()), b.b_end, b.t, b.n
  from best b
  join public.sports sp on sp.id = b.sid
  cross join me
  where b.n >= private.latent_demand_k()
    and not exists (
      select 1 from public.plans p
      left join public.places pl on pl.id = p.place_id
      where p.sport_id = b.sid and p.status = 'forming' and p.deadline_at > now()
        and p.member_count < p.capacity and p.starts_at >= b.b_start and p.starts_at < b.b_end
        and authz.can_see_plan(p.id, p_uid)
        and (pl.id is null or private.distance_m(me.lat, me.lng, pl.lat, pl.lng) <= me.radius_km * 1000)
    )
  order by b.t, sp.sort_order, b.sid;
$$;

-- NOTHING ON FOR VOLLEYBALL · "5 people within 3 km want to play volleyball after 7". Counts only.
create or replace function public.latent_demand(p_sport_id text default null)
returns table (
  sport_id text,
  sport_name text,
  day date,
  part public.day_part,
  window_start timestamptz,
  window_end timestamptz,
  suggested_start timestamptz,
  people_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_n integer;
begin
  return query select * from private.latent_buckets(v_uid, p_sport_id);
  get diagnostics v_n = row_count;
  perform private.emit('latent_demand_shown', v_uid, jsonb_build_object('buckets', v_n, 'sport_id', p_sport_id));
end;
$$;

-- MAKE IT HAPPEN / I'M DOWN on latent demand. Publishes the caller's Down For for the window (or
-- reuses an active one for the same sport and an overlapping window) and runs the same matching as
-- create_down_for (docs/SLICE01_CONTRACT.md §Down For matching): join an open plan if one appeared,
-- otherwise form a plan from the compatible signals with the caller as host. Everyone matched is a
-- member (via down_for). Nothing matched → demand_unavailable, and nothing is kept.
create or replace function public.create_from_demand(
  p_sport_id text,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_idempotency_key uuid
)
returns public.plan_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_private public.profile_private%rowtype;
  v_signal uuid;
  v_match record;
  v_plan uuid;
  v_state public.plan_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_from_demand');
  if v_prior is not null then
    return jsonb_populate_record(null::public.plan_state, v_prior);
  end if;

  if not exists (select 1 from public.sports where id = p_sport_id) then
    perform private.fail('sport_unknown');
  end if;
  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start
     or p_window_end <= now() or p_window_end - p_window_start > interval '24 hours'
     or p_window_start > now() + interval '14 days' then
    perform private.fail('window_invalid');
  end if;
  select * into v_private from public.profile_private where user_id = v_uid;
  if v_private.area_lat is null then
    perform private.fail('area_required');
  end if;
  -- Plans this person formed from signals in the last 24 h (Down For matches included).
  if (select count(*) from public.plans p
      where p.created_by = v_uid and p.source = 'down_for' and p.created_at > now() - interval '24 hours') >= 5 then
    perform private.fail('demand_rate_limited');
  end if;

  update public.intent_signals set status = 'expired'
   where user_id = v_uid and status = 'active' and expires_at <= now();

  select s.id into v_signal from public.intent_signals s
   where s.user_id = v_uid and s.sport_id = p_sport_id and s.status = 'active'
     and tstzrange(s.window_start, s.window_end) && tstzrange(p_window_start, p_window_end)
   for update;

  if v_signal is null then
    insert into public.intent_signals (
      user_id, sport_id, window_start, window_end, expires_at, audience, radius_km, area_lat, area_lng
    ) values (
      v_uid, p_sport_id, p_window_start, p_window_end, p_window_end, 'public',
      v_private.discovery_radius_km, v_private.area_lat, v_private.area_lng
    ) returning id into v_signal;
    perform private.emit('down_for_created', v_uid,
      jsonb_build_object('signal_id', v_signal, 'sport_id', p_sport_id, 'source', 'demand'));
  end if;

  select * into v_match from private.match_signal(v_signal);
  select s.matched_plan_id into v_plan from public.intent_signals s where s.id = v_signal;
  if v_plan is null then
    perform private.fail('demand_unavailable');
  end if;

  v_state := private.plan_state_of(v_plan, v_uid, true);
  perform private.emit('demand_plan_created', v_uid,
    jsonb_build_object('plan_id', v_plan, 'sport_id', p_sport_id,
                       'plan_created', coalesce(v_match.plan_created, false),
                       'member_count', v_state.member_count));
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- Suggestions (Surprise Me, Concierge) -------------------------------------------------------------
-- Hard constraints: visible, nobody blocked either way, within the radius, close to the caller's
-- level (the average level of members who play the sport is within 1.5 steps of theirs; levels are
-- never returned), and p_sport_id / p_minutes when given. Preference orders: plans in the caller's
-- sports, then latent demand in their sports, then plans in other sports ("something different"),
-- then other demand. Within plans: main sport, then (p_social) bigger plans, then people they've
-- played with, then soonest, nearest, id. Deterministic for the same data.

create or replace function private.suggest(
  p_uid uuid, p_minutes integer, p_sport_id text, p_social boolean, p_limit integer
)
returns table (
  kind text,
  plan_id uuid,
  sport_id text,
  sport_name text,
  title text,
  starts_at timestamptz,
  duration_minutes integer,
  place_id uuid,
  place_name text,
  place_area text,
  distance_km numeric,
  member_count integer,
  capacity integer,
  played_with_count integer,
  demand_count integer,
  window_start timestamptz,
  window_end timestamptz,
  reasons text[],
  reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select * from private.viewer(p_uid)),
  mine as (select us.sport_id as sid, us.level, us.is_main from public.user_sports us where us.user_id = p_uid),
  lv (level, n) as (
    values ('learning'::public.skill_level, 0), ('casual'::public.skill_level, 1),
           ('intermediate'::public.skill_level, 2), ('advanced'::public.skill_level, 3)
  ),
  cands as (
    select p.id as pid, p.sport_id as sid, s.name as sname, s.sort_order, p.title as ttl, p.starts_at as st,
           p.duration_minutes as dur, pl.id as plid, pl.name as plname, pl.area as plarea,
           p.member_count as cnt, p.capacity as cap,
           case when me.lat is not null and pl.id is not null
                then round((private.distance_m(me.lat, me.lng, pl.lat, pl.lng) / 1000)::numeric, 1) end as km,
           (select count(*)::integer from public.plan_members m
             where m.plan_id = p.id and authz.connected(m.user_id, p_uid)) as pw,
           (select avg(l.n) from public.plan_members m
              join public.user_sports us on us.user_id = m.user_id and us.sport_id = p.sport_id
              join lv l on l.level = us.level
             where m.plan_id = p.id) as avg_level,
           (select l.n from mine join lv l on l.level = mine.level where mine.sid = p.sport_id) as my_level,
           coalesce((select mine.is_main from mine where mine.sid = p.sport_id), false) as is_main,
           (p_sport_id is not null or not exists (select 1 from mine)
            or p.sport_id in (select mine.sid from mine)) as pref
    from public.plans p
    cross join me
    join public.sports s on s.id = p.sport_id
    left join public.places pl on pl.id = p.place_id
    where p.status = 'forming' and p.deadline_at > now() and p.member_count < p.capacity
      and p.starts_at > now() + interval '10 minutes'
      and p.starts_at <= now() + case when p_minutes is not null then interval '6 hours' else interval '48 hours' end
      and (p_minutes is null or p.duration_minutes <= p_minutes)
      and (p_sport_id is null or p.sport_id = p_sport_id)
      and authz.can_see_plan(p.id, p_uid)
      and not exists (select 1 from public.plan_members m
                      where m.plan_id = p.id and (m.user_id = p_uid or authz.is_blocked(m.user_id, p_uid)))
      and (me.lat is null
           or (pl.id is not null
               and private.distance_m(me.lat, me.lng, pl.lat, pl.lng) <= me.radius_km * 1000))
  ),
  plan_rows as (
    select c.*,
           array_remove(array[
             case when p_minutes is not null then 'it fits your ' || p_minutes || ' minutes' end,
             case when c.km is not null then 'it''s ' || private.fmt_km(c.km) || ' away' end,
             case when c.pw = 1 then '1 person you''ve played with is in'
                  when c.pw > 1 then c.pw || ' people you''ve played with are in' end,
             case when c.avg_level is not null and c.my_level is not null then 'it''s close to your level' end,
             case when c.cap - c.cnt = 1 then 'it needs one more' end,
             case when not c.pref then 'it''s something different from your usual' end
           ], null) as rs,
           row_number() over (order by c.is_main desc,
                                       case when p_social then c.cnt end desc nulls last,
                                       c.pw desc, c.st, c.km nulls last, c.pid) as rn
    from cands c
    where c.avg_level is null or c.my_level is null or abs(c.avg_level - c.my_level) <= 1.5
  ),
  demand_rows as (
    select d.*,
           (p_sport_id is not null or not exists (select 1 from mine)
            or d.sport_id in (select mine.sid from mine)) as pref,
           array[d.people_count || ' people near you are down for ' || lower(d.sport_name) || ' then',
                 'it becomes a plan when you say yes'] as rs,
           row_number() over (order by coalesce((select mine.is_main from mine where mine.sid = d.sport_id), false) desc,
                                       d.people_count desc, d.suggested_start, d.sport_id) as rn
    from private.latent_buckets(p_uid, p_sport_id) d
    where (p_minutes is null or d.suggested_start <= now() + interval '6 hours')
  ),
  all_rows as (
    select case when pr.pref then 1 else 3 end as grp, pr.rn, 'plan'::text as k, pr.pid, pr.sid, pr.sname, pr.ttl, pr.st, pr.dur, pr.plid,
           pr.plname, pr.plarea, pr.km, pr.cnt, pr.cap, pr.pw, null::integer as dc,
           null::timestamptz as ws, null::timestamptz as we, pr.rs
    from plan_rows pr
    union all
    select case when dr.pref then 2 else 4 end, dr.rn, 'demand', null, dr.sport_id, dr.sport_name, null, dr.suggested_start, null, null,
           null, null, null, null, null, null, dr.people_count, dr.window_start, dr.window_end, dr.rs
    from demand_rows dr
  )
  select a.k, a.pid, a.sid, a.sname, a.ttl, a.st, a.dur, a.plid, a.plname, a.plarea, a.km, a.cnt, a.cap,
         a.pw, a.dc, a.ws, a.we, a.rs, private.join_words(a.rs)
  from all_rows a
  order by a.grp, a.rn
  limit least(greatest(coalesce(p_limit, 1), 1), 10);
$$;

-- SURPRISE ME: one suggestion (or none: offer Down For).
create or replace function public.surprise_me()
returns table (
  kind text,
  plan_id uuid,
  sport_id text,
  sport_name text,
  title text,
  starts_at timestamptz,
  duration_minutes integer,
  place_id uuid,
  place_name text,
  place_area text,
  distance_km numeric,
  member_count integer,
  capacity integer,
  played_with_count integer,
  demand_count integer,
  window_start timestamptz,
  window_end timestamptz,
  reasons text[],
  reason text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_n integer;
begin
  return query select * from private.suggest(v_uid, null, null, false, 1);
  get diagnostics v_n = row_count;
  perform private.emit('surprise_me_served', v_uid, jsonb_build_object('found', v_n > 0));
end;
$$;

-- TELL OJORO (Concierge, rules-based stub). Reads minutes ("90 minutes", "an hour", "2h"), a sport
-- ("football", "soccer", "a run") and "meet people" from p_text; explicit p_sport_id / p_minutes win.
-- Suggests only: nothing is joined until the user taps I'M DOWN (or MAKE IT HAPPEN). The text is
-- never stored.
create or replace function public.concierge_suggest(
  p_text text default null,
  p_sport_id text default null,
  p_minutes integer default null,
  p_limit integer default 3
)
returns table (
  kind text,
  plan_id uuid,
  sport_id text,
  sport_name text,
  title text,
  starts_at timestamptz,
  duration_minutes integer,
  place_id uuid,
  place_name text,
  place_area text,
  distance_km numeric,
  member_count integer,
  capacity integer,
  played_with_count integer,
  demand_count integer,
  window_start timestamptz,
  window_end timestamptz,
  reasons text[],
  reason text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_text text := private.fold(left(coalesce(p_text, ''), 500));
  v_minutes integer := p_minutes;
  v_sport text := p_sport_id;
  v_hours text;
  v_social boolean;
  v_n integer;
begin
  if p_minutes is not null and p_minutes not between 15 and 480 then
    perform private.fail('invalid_argument', 'minutes');
  end if;
  if p_sport_id is not null and not exists (select 1 from public.sports s where s.id = p_sport_id) then
    perform private.fail('sport_unknown');
  end if;
  if v_minutes is null then
    v_minutes := nullif(substring(v_text from '(\d{2,3})\s*(?:min|mins|minutes)\M'), '')::integer;
  end if;
  if v_minutes is null then
    v_hours := substring(v_text from '(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\M');
    if v_hours is not null then
      v_minutes := round(v_hours::numeric * 60)::integer;
    elsif v_text ~ 'half an hour' then
      v_minutes := 30;
    elsif v_text ~ '\m(an|one) hour\M' then
      v_minutes := 60;
    end if;
  end if;
  if v_minutes is not null then
    v_minutes := least(greatest(v_minutes, 15), 480);
  end if;
  if v_sport is null and v_text <> '' then
    select x.sid into v_sport
    from (
      select s.id as sid, private.fold(s.name) as word from public.sports s
      union all select s.id, replace(s.id, '_', ' ') from public.sports s
      union all select * from (values ('football', 'soccer'), ('running', 'run'), ('running', 'jog'),
                                      ('running', '5k'), ('running', '10k'), ('basketball', 'hoops'),
                                      ('boxing', 'box'), ('boxing', 'sparring'), ('climbing', 'climb'),
                                      ('climbing', 'boulder'), ('cycling', 'ride'), ('cycling', 'bike'),
                                      ('volleyball', 'volley')) a (sid, word)
    ) x
    where v_text ~ ('\m' || x.word || '\M')
    order by char_length(x.word) desc, x.sid
    limit 1;
  end if;
  v_social := v_text ~ '(meet|new) (people|someone|friends)|make friends';

  return query select * from private.suggest(v_uid, v_minutes, v_sport, v_social, least(greatest(coalesce(p_limit, 3), 1), 5));
  get diagnostics v_n = row_count;
  perform private.emit('concierge_suggested', v_uid,
    jsonb_build_object('has_text', v_text <> '', 'minutes', v_minutes, 'sport_id', v_sport,
                       'social', v_social, 'count', v_n));
end;
$$;

-- Discover -----------------------------------------------------------------------------------------

-- Search plans and places (and people you've played with) by sport, title, place name and area.
-- p_when: null/'any', 'now' (next hour, and live), 'today', 'tonight', 'tomorrow', 'weekend', 'week'.
-- People are searchable by name only by people they have played with (no "find me by name" setting
-- exists yet); never across a block.
create or replace function public.discover_search(
  p_query text default null,
  p_sport_id text default null,
  p_when text default null,
  p_limit integer default 20
)
returns table (
  kind text,
  id uuid,
  title text,
  sport_id text,
  sport_name text,
  starts_at timestamptz,
  effective_status text,
  member_count integer,
  capacity integer,
  place_id uuid,
  place_name text,
  place_area text,
  distance_km numeric,
  plans_tonight integer,
  handle text,
  avatar_path text,
  games_with_me integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_q text := nullif(private.fold(trim(coalesce(p_query, ''))), '');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_tz text;
  v_today date;
  v_dow integer;
  v_from timestamptz := now();
  v_until timestamptz := now() + interval '30 days';
  v_lat double precision;
  v_lng double precision;
  v_n integer;
begin
  if char_length(coalesce(p_query, '')) > 80 then
    perform private.fail('invalid_argument', 'query');
  end if;
  if p_sport_id is not null and not exists (select 1 from public.sports s where s.id = p_sport_id) then
    perform private.fail('sport_unknown');
  end if;
  select me.tz, me.lat, me.lng into v_tz, v_lat, v_lng from private.viewer(v_uid) me;
  v_tz := coalesce(v_tz, 'America/Toronto');
  v_today := (now() at time zone v_tz)::date;
  v_dow := extract(isodow from now() at time zone v_tz)::integer;
  case coalesce(p_when, 'any')
    when 'any' then null;
    when 'now' then v_until := now() + interval '60 minutes';
    when 'today' then v_until := (v_today + 1)::timestamp at time zone v_tz;
    when 'tonight' then
      v_from := greatest(now(), (v_today + interval '17 hours') at time zone v_tz);
      v_until := private.tonight_end(v_tz);
    when 'tomorrow' then
      v_from := (v_today + 1)::timestamp at time zone v_tz;
      v_until := (v_today + 2)::timestamp at time zone v_tz;
    when 'weekend' then
      if v_dow >= 6 then
        v_until := (v_today + (8 - v_dow))::timestamp at time zone v_tz;
      else
        v_from := (v_today + (6 - v_dow))::timestamp at time zone v_tz;
        v_until := (v_today + (8 - v_dow))::timestamp at time zone v_tz;
      end if;
    when 'week' then v_until := now() + interval '7 days';
    else perform private.fail('invalid_argument', 'when');
  end case;

  return query
  (
    select 'plan'::text, p.id, p.title, p.sport_id, s.name, coalesce(a.starts_at, p.starts_at),
           case when a.id is null then 'forming' when private.activity_status_now(a) = 'live' then 'live'
                else 'game_on' end,
           case when a.id is null then p.member_count else a.confirmed_count end, p.capacity,
           pl.id, pl.name, pl.area,
           case when v_lat is not null and pl.id is not null
                then round((private.distance_m(v_lat, v_lng, pl.lat, pl.lng) / 1000)::numeric, 1) end,
           null::integer, null::text, null::text, null::integer
    from public.plans p
    join public.sports s on s.id = p.sport_id
    left join public.places pl on pl.id = p.place_id
    left join public.activities a on a.plan_id = p.id
    where ((p.status = 'forming' and p.deadline_at > now())
           or (p.status = 'game_on' and a.id is not null
               and private.activity_status_now(a) in ('confirmed', 'live')))
      and (p_sport_id is null or p.sport_id = p_sport_id)
      and coalesce(a.starts_at, p.starts_at) < v_until
      and (coalesce(a.starts_at, p.starts_at) >= v_from
           or (v_from <= now() and coalesce(a.ended_at, a.ends_at,
                                            p.starts_at + make_interval(mins => p.duration_minutes)) > now()))
      and (v_q is null
           or position(v_q in private.fold(s.name)) > 0
           or position(v_q in replace(s.id, '_', ' ')) > 0
           or position(v_q in private.fold(p.title)) > 0
           or position(v_q in private.fold(pl.name)) > 0
           or position(v_q in private.fold(pl.area)) > 0
           or position(v_q in private.fold(pl.city)) > 0)
      and authz.can_see_plan(p.id, v_uid)
      and not exists (select 1 from public.plan_members m
                      where m.plan_id = p.id and authz.is_blocked(m.user_id, v_uid))
    order by coalesce(a.starts_at, p.starts_at), p.id
    limit v_limit
  )
  union all
  (
    select 'place'::text, pl.id, pl.name, null::text, null::text, null::timestamptz, null::text,
           null::integer, null::integer, pl.id, pl.name, pl.area,
           case when v_lat is not null
                then round((private.distance_m(v_lat, v_lng, pl.lat, pl.lng) / 1000)::numeric, 1) end,
           (select count(*)::integer from public.plans p
              left join public.activities a on a.plan_id = p.id
             where p.place_id = pl.id
               and ((p.status = 'forming' and p.deadline_at > now())
                    or (p.status = 'game_on' and a.id is not null
                        and private.activity_status_now(a) in ('confirmed', 'live')))
               and coalesce(a.ended_at, a.ends_at, p.starts_at + make_interval(mins => p.duration_minutes)) > now()
               and coalesce(a.starts_at, p.starts_at) < private.tonight_end(pl.time_zone)
               and authz.can_see_plan(p.id, v_uid)),
           null::text, null::text, null::integer
    from public.places pl
    where (p_sport_id is null or p_sport_id = any (pl.sport_ids))
      and (v_q is null
           or position(v_q in private.fold(pl.name)) > 0
           or position(v_q in private.fold(pl.area)) > 0
           or position(v_q in private.fold(pl.city)) > 0
           or exists (select 1 from public.sports s
                      where s.id = any (pl.sport_ids) and position(v_q in private.fold(s.name)) > 0))
    order by 13 nulls last, pl.name, pl.id
    limit v_limit
  )
  union all
  (
    select 'person'::text, pr.id, pr.display_name, null::text, null::text, null::timestamptz, null::text,
           null::integer, null::integer, null::uuid, null::text, null::text, null::numeric, null::integer,
           pr.handle, pr.avatar_path, authz.games_together(pr.id, v_uid)
    from public.profiles pr
    where v_q is not null and char_length(v_q) >= 2
      and pr.id <> v_uid
      and (position(v_q in private.fold(pr.display_name)) > 0 or position(v_q in coalesce(pr.handle, '')) > 0)
      and authz.connected(pr.id, v_uid)
      and not authz.is_blocked(pr.id, v_uid)
    order by 17 desc, pr.display_name, pr.id
    limit v_limit
  );
  get diagnostics v_n = row_count;
  perform private.emit('discover_searched', v_uid,
    jsonb_build_object('query_length', char_length(coalesce(v_q, '')), 'sport_id', p_sport_id,
                       'when', p_when, 'results', v_n));
end;
$$;

-- PEOPLE TO MOVE WITH (UserMiniCard). People you've played with, then people who share a sport, are
-- near you (both inside each other's radius) and said anyone nearby may pull them in for it. Each
-- part of the card follows the person's privacy settings; availability is only ever an overlap.
create or replace function public.people_to_move_with(p_limit integer default 10)
returns table (
  user_id uuid,
  display_name text,
  handle text,
  avatar_path text,
  area text,
  sports text[],
  sessions integer,
  games_with_me integer,
  crews integer,
  played_together boolean,
  shared_sports text[],
  overlap_day_of_week smallint,
  overlap_part public.day_part,
  reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select * from private.viewer(auth.uid())),
  mine as (select us.sport_id as sid from public.user_sports us where us.user_id = auth.uid()),
  conn as (
    select distinct o.user_id as uid
    from public.passport_entries e
    join public.passport_entries o on o.activity_id = e.activity_id and o.user_id <> e.user_id
    where e.user_id = auth.uid()
  ),
  near as (
    select distinct pm.user_id as uid
    from public.pull_me_in pm
    join public.profile_private pp on pp.user_id = pm.user_id
    cross join me
    where pm.scope = 'nearby' and pm.sport_id in (select mine.sid from mine)
      and pm.user_id <> auth.uid()
      and pm.user_id not in (select conn.uid from conn)
      and me.lat is not null and pp.area_lat is not null
      and private.distance_m(me.lat, me.lng, pp.area_lat::double precision, pp.area_lng::double precision)
          <= least(me.radius_km, pp.discovery_radius_km) * 1000
      and authz.can_see_part(pm.user_id, 'sports', auth.uid())
  ),
  pool as (
    select uid, true as played from conn
    union all
    select uid, false from near
  ),
  facts as (
    select pr.id, pr.display_name, pr.handle, pr.avatar_path, pr.area, pool.played,
           authz.can_see_part(pr.id, 'sports', auth.uid()) as sports_ok,
           authz.can_see_part(pr.id, 'history', auth.uid()) as history_ok,
           authz.can_see_part(pr.id, 'availability', auth.uid()) as avail_ok,
           authz.games_together(pr.id, auth.uid()) as games
    from pool
    join public.profiles pr on pr.id = pool.uid
    where not authz.is_blocked(pr.id, auth.uid())
  ),
  cards as (
    select f.*,
           case when f.sports_ok then (
             select array_agg(s.name order by us.is_main desc, s.sort_order)
             from public.user_sports us join public.sports s on s.id = us.sport_id
             where us.user_id = f.id) end as sport_names,
           case when f.sports_ok then (
             select array_agg(s.name order by s.sort_order)
             from public.user_sports us join public.sports s on s.id = us.sport_id
             where us.user_id = f.id and us.sport_id in (select mine.sid from mine)) end as shared,
           case when f.history_ok then (
             select count(*)::integer from public.passport_entries e where e.user_id = f.id) end as sessions
    from facts f
  ),
  slots as (
    select c.*,
           (select a.day_of_week from public.availability_slots a
              join public.availability_slots b on b.user_id = auth.uid()
                                              and b.day_of_week = a.day_of_week and b.part = a.part
             where c.avail_ok and a.user_id = c.id order by a.day_of_week, a.part limit 1) as dow,
           (select a.part from public.availability_slots a
              join public.availability_slots b on b.user_id = auth.uid()
                                              and b.day_of_week = a.day_of_week and b.part = a.part
             where c.avail_ok and a.user_id = c.id order by a.day_of_week, a.part limit 1) as prt
    from cards c
  )
  select s.id, s.display_name, s.handle, s.avatar_path, s.area, coalesce(s.sport_names, '{}'), s.sessions,
         s.games, null::integer, s.played, coalesce(s.shared, '{}'), s.dow, s.prt,
         case
           when s.played then
             'You''ve played ' || case when s.games = 1 then '1 game' else s.games || ' games' end || ' together'
             || coalesce(' and you''re both usually free '
                         || (array['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])[s.dow]
                         || ' ' || case s.prt when 'morning' then 'mornings' when 'midday' then 'middays' else 'evenings' end, '')
             || '.'
           else
             'Also plays ' || coalesce(lower(s.shared[1]), 'your sports') || ' near you and is open to being pulled in.'
         end
  from slots s
  where auth.uid() is not null
    and (s.played or cardinality(coalesce(s.shared, '{}')) > 0)
  order by s.games desc, cardinality(coalesce(s.shared, '{}')) desc, (s.dow is not null) desc,
           s.display_name, s.id
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- PLACES NEAR YOU (PlaceMiniCard). plans_tonight counts only plans that are forming (before their
-- deadline) or GAME ON (game not cancelled, not finished), that you can see, and that start before
-- 4 AM local. Cancelled and expired plans never count.
create or replace function public.places_nearby(p_sport_id text default null, p_limit integer default 20)
returns table (
  place_id uuid,
  name text,
  area text,
  city text,
  sport_ids text[],
  surface text,
  floodlit_until time,
  is_free boolean,
  time_zone text,
  distance_km numeric,
  plans_tonight integer,
  plans_forming integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select * from private.viewer(auth.uid())),
  pls as (
    select pl.*,
           case when me.lat is not null
                then round((private.distance_m(me.lat, me.lng, pl.lat, pl.lng) / 1000)::numeric, 1) end as km,
           me.radius_km as r, me.lat as mlat
    from public.places pl cross join me
    where p_sport_id is null or p_sport_id = any (pl.sport_ids)
  )
  select x.id, x.name, x.area, x.city, x.sport_ids, x.surface, x.floodlit_until, x.is_free, x.time_zone, x.km,
         (select count(*)::integer from public.plans p
            left join public.activities a on a.plan_id = p.id
           where p.place_id = x.id
             and (p_sport_id is null or p.sport_id = p_sport_id)
             and ((p.status = 'forming' and p.deadline_at > now())
                  or (p.status = 'game_on' and a.id is not null
                      and private.activity_status_now(a) in ('confirmed', 'live')))
             and coalesce(a.ended_at, a.ends_at, p.starts_at + make_interval(mins => p.duration_minutes)) > now()
             and coalesce(a.starts_at, p.starts_at) < private.tonight_end(x.time_zone)
             and authz.can_see_plan(p.id, auth.uid())),
         (select count(*)::integer from public.plans p
           where p.place_id = x.id
             and (p_sport_id is null or p.sport_id = p_sport_id)
             and p.status = 'forming' and p.deadline_at > now() and p.starts_at <= now() + interval '7 days'
             and authz.can_see_plan(p.id, auth.uid()))
  from pls x
  where auth.uid() is not null
    and (x.mlat is null or x.km <= x.r)
  order by x.km nulls last, x.name, x.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- Filter chips: sports with something on near you (plans in the next 7 days, or latent demand).
create or replace function public.sports_nearby()
returns table (sport_id text, sport_name text, plan_count integer, place_count integer, has_demand boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select * from private.viewer(auth.uid())),
  opp as (
    select o.sport_id as sid, count(*)::integer as n
    from private.opportunities(auth.uid(), now() + interval '7 days', null,
                               (select me.radius_km from me)::numeric, true, null) o
    group by o.sport_id
  ),
  dem as (select distinct d.sport_id as sid from private.latent_buckets(auth.uid(), null) d),
  plc as (
    select s.id as sid, count(*)::integer as n
    from public.sports s
    join public.places pl on s.id = any (pl.sport_ids)
    cross join me
    where me.lat is null or private.distance_m(me.lat, me.lng, pl.lat, pl.lng) <= me.radius_km * 1000
    group by s.id
  )
  select s.id, s.name, coalesce(opp.n, 0), coalesce(plc.n, 0), dem.sid is not null
  from public.sports s
  left join opp on opp.sid = s.id
  left join dem on dem.sid = s.id
  left join plc on plc.sid = s.id
  where auth.uid() is not null and (opp.n > 0 or dem.sid is not null)
  order by coalesce(opp.n, 0) desc, s.sort_order, s.id;
$$;

-- Home density: lets Home choose the normal feed or the honest low-density FirstHome.
-- low_density = fewer than 2 joinable plans and games near you in the next 7 days.
create or replace function public.home_density()
returns table (
  has_area boolean,
  area text,
  radius_km integer,
  day_number integer,
  plans_near integer,
  games_near integer,
  starting_soon integer,
  people_down_near integer,
  friends_free_now integer,
  demand_buckets integer,
  further_out_count integer,
  low_density boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select * from private.viewer(auth.uid())),
  opp as (
    select o.* from me, private.opportunities(auth.uid(), now() + interval '7 days', null,
                                              me.radius_km::numeric, false, null) o
  ),
  counts as (
    select
      (select count(*)::integer from opp where opp.status = 'forming') as plans_near,
      (select count(*)::integer from opp where opp.status = 'game_on') as games_near,
      (select count(*)::integer from opp where opp.starts_at <= now() + interval '60 minutes') as soon,
      (select count(distinct d.user_id)::integer from public.down_for_nearby(null, 100) d) as down,
      (select count(distinct o.user_id)::integer
         from public.passport_entries e
         join public.passport_entries o on o.activity_id = e.activity_id and o.user_id <> e.user_id
         join public.profiles op on op.id = o.user_id
        where e.user_id = auth.uid()
          and not authz.is_blocked(o.user_id, auth.uid())
          and authz.can_see_part(o.user_id, 'availability', auth.uid())
          and exists (select 1 from public.availability_slots s
                      where s.user_id = o.user_id
                        and s.day_of_week = extract(isodow from now() at time zone op.time_zone)
                        and s.part = private.day_part_of(now(), op.time_zone))) as free_now,
      (select count(*)::integer from private.latent_buckets(auth.uid(), null)) as buckets,
      (select count(*)::integer from public.further_out(20)) as further
  )
  select me.lat is not null, me.area, me.radius_km,
         ((now() at time zone me.tz)::date - (me.joined_at at time zone me.tz)::date) + 1,
         c.plans_near, c.games_near, c.soon, c.down, c.free_now, c.buckets, c.further,
         (c.plans_near + c.games_near) < 2
  from me cross join counts c
  where auth.uid() is not null;
$$;

-- Need One More: candidates ranked by relationship (PRD §9.5) ---------------------------------------
-- Tiers: played_together (stands in for friends, Crew and previous participants until Friends and
-- Crews exist), friend_of_friend (Pull Me In `nearby`, and plays with someone you play with), nearby
-- (Pull Me In `nearby` within their radius of the place). Within a tier: Pull Me In on for this
-- sport, free at the plan's time (if their availability setting includes you), games together.
-- Only people pull_in() accepts are listed. New columns are appended after the Slice 01 ones.

drop function public.pull_in_candidates(uuid, integer);
create function public.pull_in_candidates(p_plan_id uuid, p_limit integer default 20)
returns table (
  user_id uuid,
  display_name text,
  avatar_path text,
  games_with_me integer,
  pull_me_in boolean,
  free_at_plan_time boolean,
  plays_sport boolean,
  already_invited boolean,
  tier text,
  shared_title text,
  "position" text,
  distance_km integer,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_plan public.plans%rowtype;
  v_place public.places%rowtype;
  v_sport text;
  v_me public.profile_private%rowtype;
  v_tz text;
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if not found or not authz.can_see_plan(p_plan_id, v_uid) then
    perform private.fail('plan_not_found');
  end if;
  if not authz.is_plan_member(p_plan_id, v_uid) then
    perform private.fail('not_member');
  end if;
  select * into v_place from public.places where id = v_plan.place_id;
  select s.name into v_sport from public.sports s where s.id = v_plan.sport_id;
  select * into v_me from public.profile_private where user_id = v_uid;
  v_tz := coalesce(v_place.time_zone, 'America/Toronto');

  return query
  with conn as (
    select distinct o.user_id as uid
    from public.passport_entries e
    join public.passport_entries o on o.activity_id = e.activity_id and o.user_id <> e.user_id
    where e.user_id = v_uid
  ),
  near as (
    select pm.user_id as uid
    from public.pull_me_in pm
    join public.profile_private pp on pp.user_id = pm.user_id
    where pm.sport_id = v_plan.sport_id and pm.scope = 'nearby'
      and v_place.id is not null and pp.area_lat is not null
      and private.distance_m(pp.area_lat::double precision, pp.area_lng::double precision, v_place.lat, v_place.lng)
          <= pp.discovery_radius_km * 1000
      and pm.user_id not in (select conn.uid from conn)
  ),
  pool as (
    select conn.uid, 'played_together'::text as tier, 1 as tier_rank from conn
    union all
    select n.uid,
           case when exists (select 1 from conn c where authz.connected(c.uid, n.uid))
                then 'friend_of_friend' else 'nearby' end,
           case when exists (select 1 from conn c where authz.connected(c.uid, n.uid)) then 2 else 3 end
    from near n
  ),
  facts as (
    select pr.id, pr.display_name, pr.avatar_path, pool.tier, pool.tier_rank,
           authz.games_together(pr.id, v_uid) as games,
           exists (select 1 from public.pull_me_in pm where pm.user_id = pr.id and pm.sport_id = v_plan.sport_id) as pmi,
           private.free_at(pr.id, v_plan.starts_at, v_uid) as free,
           authz.can_see_part(pr.id, 'sports', v_uid)
             and exists (select 1 from public.user_sports us where us.user_id = pr.id and us.sport_id = v_plan.sport_id) as plays,
           exists (select 1 from public.plan_invites i where i.plan_id = p_plan_id and i.invitee_id = pr.id) as invited,
           (select coalesce(a.title, sp.name)
              from public.passport_entries x
              join public.passport_entries y on y.activity_id = x.activity_id and y.user_id = pr.id
              join public.activities a on a.id = x.activity_id
              join public.sports sp on sp.id = a.sport_id
             where x.user_id = v_uid
             order by x.occurred_at desc, x.activity_id limit 1) as title,
           case when authz.can_see_part(pr.id, 'sports', v_uid)
                then (select us.position from public.user_sports us
                      where us.user_id = pr.id and us.sport_id = v_plan.sport_id) end as pos,
           (select greatest(1, ceil(private.distance_m(v_me.area_lat::double precision, v_me.area_lng::double precision,
                                                       pp.area_lat::double precision, pp.area_lng::double precision) / 1000))::integer
              from public.profile_private pp
             where pp.user_id = pr.id and pp.area_lat is not null and v_me.area_lat is not null) as km
    from pool
    join public.profiles pr on pr.id = pool.uid
    where pr.id <> v_uid
      and not exists (select 1 from public.plan_members m where m.plan_id = p_plan_id and m.user_id = pr.id)
      and not authz.is_blocked(pr.id, v_uid)
      and not authz.is_blocked(pr.id, v_plan.host_id)
  )
  select f.id, f.display_name, f.avatar_path, f.games, f.pmi, f.free, f.plays, f.invited, f.tier, f.title,
         f.pos, f.km,
         array_to_string((array_remove(array[
           case when f.games >= 2 then f.games || ' games with you'
                when f.games = 1 then coalesce(f.title, '1 game with you')
                when f.tier = 'friend_of_friend' then 'Plays with people you''ve played with' end,
           case when f.pos is not null then 'plays ' || lower(f.pos) end,
           case when f.free then
                  case when (v_plan.starts_at at time zone v_tz)::date = (now() at time zone v_tz)::date
                            and private.day_part_of(v_plan.starts_at, v_tz) = 'evening' then 'free tonight'
                       else 'usually free then' end end,
           case when f.pmi then 'Pull Me In is on for ' || lower(v_sport) end,
           case when f.km is not null then f.km || ' km away' end
         ], null))[1:3], ' · ')
  from facts f
  order by f.tier_rank, f.pmi desc, f.free desc, f.games desc, f.display_name, f.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

-- Privileges -------------------------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
grant select on public.plan_cards to authenticated;
revoke all on public.plan_cards from anon;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end;
$$;
