-- Step 7 (Places and Ojoro Pulse): owner decisions after the first contract (docs/DESIGN_DECISIONS.md,
-- "Step 7 BE-PLACES"). Contract: docs/PLACES_CONTRACT.md.
--
--   1. "Tonight" means the same everywhere: from 5 PM local (or now, if later) until 4 AM, exactly as
--      discover_search's 'tonight' (20261029124500_liquidity.sql). One helper, private.tonight_window(),
--      now feeds Pulse, the selected-place sheet, TONIGHT HERE and place_view's counts. Live games count
--      only when that window has started. discover_search keeps its own inline copy (same rule, not
--      rewritten here so Discover's behaviour can't change).
--   2. Latent demand: each person counts once, in the area nearest their coarse point (within 5 km).
--   3. places.sensitive is set by Ojoro staff only (moderation). Clients have no write on places; until
--      admin tooling exists it is set with the service role / SQL.

create or replace function private.tonight_window(p_tz text)
returns table (w_from timestamptz, w_until timestamptz)
language sql
stable
set search_path = ''
as $$
  select greatest(now(), (((now() at time zone coalesce(p_tz, 'America/Toronto'))::date + interval '17 hours')
                          at time zone coalesce(p_tz, 'America/Toronto'))),
         private.tonight_end(coalesce(p_tz, 'America/Toronto'));
$$;
revoke all on function private.tonight_window(text) from public, anon, authenticated;

comment on column public.places.sensitive is
  'PRD §11.2 suppression, set by Ojoro staff (moderation) only, via the service role until admin tooling exists. Never its own Pulse marker; counted in the area aggregate only from 3 activities.';

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
      return query select t.w_from, t.w_until, t.w_from <= now(), 'tonight' from private.tonight_window(v_tz) t;
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
  -- block) whose window overlaps the filter. Each person counts once, in the area nearest their
  -- coarse point (within 5 km), in areas within your radius. Only from k people, and only where
  -- nothing you could join in that sport is forming in that area.
  sig as (
    select s.id, s.user_id, s.sport_id as sid, ar.area as sarea, ar.city as scity
    from public.intent_signals s
    cross join lateral (
      select a2.area, a2.city from private.areas() a2
      where private.distance_m(s.area_lat::double precision, s.area_lng::double precision,
                               a2.lat::double precision, a2.lng::double precision) <= 5000
      order by private.distance_m(s.area_lat::double precision, s.area_lng::double precision,
                                  a2.lat::double precision, a2.lng::double precision), a2.city, a2.area
      limit 1
    ) ar
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

  -- TONIGHT (Discover's definition, private.tonight_window). Sensitive places: only what you're in.
  select count(*)::integer, count(*) filter (where i.status = 'forming')::integer,
         count(*) filter (where i.status = 'live')::integer
    into v_tonight, v_forming, v_live
  from private.pulse_window('tonight', v_pl.time_zone) w
  cross join lateral private.place_items(v_uid, w.w_from, w.w_until, w.includes_now, null, v_pl.id) i
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
