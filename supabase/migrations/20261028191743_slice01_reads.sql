-- Slice 01 read functions: the shaped reads screens need that plain table selects can't give
-- without leaking (counts across people, overlap instead of calendars, context like "12 games with
-- you"). Each one applies the same visibility rules as RLS, and never returns a person's location.

-- Part of day for a timestamp in a time zone: morning before 11:00, midday 11:00–16:59, evening after.
create or replace function private.day_part_of(p_at timestamptz, p_tz text)
returns public.day_part
language sql
stable
set search_path = ''
as $$
  select case
    when extract(hour from p_at at time zone p_tz) < 11 then 'morning'::public.day_part
    when extract(hour from p_at at time zone p_tz) < 17 then 'midday'::public.day_part
    else 'evening'::public.day_part
  end;
$$;

create or replace function private.hosted_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.activities a
  where a.host_id = p_user and a.status <> 'cancelled' and coalesce(a.ended_at, a.ends_at) <= now();
$$;

-- Is p_user free at p_at (by their usual free times), and may p_viewer know it?
create or replace function private.free_at(p_user uuid, p_at timestamptz, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.can_see_part(p_user, 'availability', p_viewer) and exists (
    select 1 from public.availability_slots s
    join public.profiles pr on pr.id = s.user_id
    where s.user_id = p_user
      and s.day_of_week = extract(isodow from p_at at time zone pr.time_zone)
      and s.part = private.day_part_of(p_at, pr.time_zone)
  );
$$;

revoke all on function private.day_part_of(timestamptz, text) from public, anon, authenticated;
revoke all on function private.hosted_count(uuid) from public, anon, authenticated;
revoke all on function private.free_at(uuid, timestamptz, uuid) from public, anon, authenticated;

-- Profiles ------------------------------------------------------------------------------------------------

-- One person as the caller may see them (You screen for yourself, profile for others). No row when
-- either has blocked the other. Stats are null unless their history is visible to you.
create or replace function public.profile_view(p_user_id uuid)
returns table (
  user_id uuid,
  handle text,
  display_name text,
  area text,
  avatar_path text,
  is_me boolean,
  onboarding_completed_at timestamptz,
  ojoro_hours numeric,
  sessions integer,
  places integer,
  people_moved_with integer,
  games_with_me integer,
  hosted_count integer,
  sports_visible boolean,
  history_visible boolean,
  availability_visible boolean,
  sports_visibility public.visibility,
  history_visibility public.visibility,
  availability_visibility public.visibility
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_history boolean;
begin
  if authz.is_blocked(p_user_id, v_uid) then
    return;
  end if;
  v_history := authz.can_see_part(p_user_id, 'history', v_uid);
  return query
  select
    p.id, p.handle, p.display_name, p.area, p.avatar_path, p.id = v_uid,
    case when p.id = v_uid then p.onboarding_completed_at end,
    case when v_history then (select round(coalesce(sum(e.minutes), 0) / 60.0, 1)
                              from public.passport_entries e where e.user_id = p.id) end,
    case when v_history then (select count(*)::integer from public.passport_entries e where e.user_id = p.id) end,
    case when v_history then (select count(distinct e.place_id)::integer
                              from public.passport_entries e where e.user_id = p.id) end,
    case when v_history then (select count(distinct o.user_id)::integer
                              from public.passport_entries e
                              join public.passport_entries o on o.activity_id = e.activity_id and o.user_id <> e.user_id
                              where e.user_id = p.id) end,
    case when p.id = v_uid then null else authz.games_together(p.id, v_uid) end,
    private.hosted_count(p.id),
    authz.can_see_part(p.id, 'sports', v_uid),
    v_history,
    authz.can_see_part(p.id, 'availability', v_uid),
    case when p.id = v_uid then s.sports_visibility end,
    case when p.id = v_uid then s.history_visibility end,
    case when p.id = v_uid then s.availability_visibility end
  from public.profiles p
  left join public.privacy_settings s on s.user_id = p.id
  where p.id = p_user_id;
end;
$$;

-- What someone plays. Levels only for yourself (they are for matching, never shown as a score).
create or replace function public.profile_sports(p_user_id uuid)
returns table (
  sport_id text,
  sport_name text,
  level public.skill_level,
  "position" text,
  is_main boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select us.sport_id, s.name, case when us.user_id = auth.uid() then us.level end, us.position, us.is_main
  from public.user_sports us
  join public.sports s on s.id = us.sport_id
  where us.user_id = p_user_id
    and auth.uid() is not null
    and authz.can_see_part(p_user_id, 'sports', auth.uid())
  order by us.is_main desc, s.sort_order, s.name;
$$;

-- Reputation signals with at least 5 confirmations from people they played with.
create or replace function public.profile_reputation(p_user_id uuid)
returns table (kind public.reputation_kind, confirmations integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.kind, count(*)::integer
  from public.reputation_signals r
  where r.subject_id = p_user_id
    and auth.uid() is not null
    and not authz.is_blocked(p_user_id, auth.uid())
  group by r.kind
  having count(*) >= 5
  order by count(*) desc, r.kind;
$$;

-- Usual free times that overlap with yours. Never their calendar: only slots you share, and only if
-- their availability setting includes you. For yourself, your own slots.
create or replace function public.availability_overlap(p_user_id uuid)
returns table (day_of_week smallint, part public.day_part)
language sql
stable
security definer
set search_path = ''
as $$
  select a.day_of_week, a.part
  from public.availability_slots a
  where a.user_id = p_user_id
    and auth.uid() is not null
    and authz.can_see_part(p_user_id, 'availability', auth.uid())
    and (p_user_id = auth.uid() or exists (
      select 1 from public.availability_slots b
      where b.user_id = auth.uid() and b.day_of_week = a.day_of_week and b.part = a.part))
  order by a.day_of_week, a.part;
$$;

-- People you blocked (their profiles are hidden from you everywhere else).
create or replace function public.my_blocks()
returns table (user_id uuid, display_name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id, p.display_name, b.created_at
  from public.blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

-- Plans -------------------------------------------------------------------------------------------------

-- Who's in, with context: "12 games with you", "New to the area · first game", "40 games hosted".
create or replace function public.plan_roster(p_plan_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_path text,
  via public.member_via,
  joined_at timestamptz,
  is_host boolean,
  is_me boolean,
  games_with_me integer,
  is_first_game boolean,
  hosted_count integer,
  "position" text,
  invited_by_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_plan public.plans%rowtype;
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if not found or not authz.can_see_plan(p_plan_id, v_uid) then
    perform private.fail('plan_not_found');
  end if;
  return query
  select
    m.user_id, p.display_name, p.avatar_path, m.via, m.joined_at,
    m.user_id = v_plan.host_id,
    m.user_id = v_uid,
    case when m.user_id = v_uid then null else authz.games_together(m.user_id, v_uid) end,
    -- A welcome cue for fellow members, not history: shown whatever the history setting.
    not exists (select 1 from public.passport_entries e where e.user_id = m.user_id),
    private.hosted_count(m.user_id),
    case when authz.can_see_part(m.user_id, 'sports', v_uid)
         then (select us.position from public.user_sports us
               where us.user_id = m.user_id and us.sport_id = v_plan.sport_id) end,
    exists (select 1 from public.plan_invites i
            where i.plan_id = p_plan_id and i.invitee_id = m.user_id and i.inviter_id = v_uid)
  from public.plan_members m
  join public.profiles p on p.id = m.user_id
  where m.plan_id = p_plan_id and not authz.is_blocked(m.user_id, v_uid)
  order by (m.user_id = v_plan.host_id) desc, (m.user_id = v_uid) desc, m.joined_at, m.user_id;
end;
$$;

-- PULL SOMEONE IN: invites left for the caller on this plan.
create or replace function public.pull_in_quota(p_plan_id uuid)
returns table (used integer, remaining integer, quota integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.n, greatest(3 - c.n, 0), 3
  from (select count(*)::integer as n from public.plan_invites i
        where i.plan_id = p_plan_id and i.inviter_id = auth.uid() and i.kind = 'pull_in') c
  where authz.is_plan_member(p_plan_id, auth.uid());
$$;

-- Need One More: people the caller may invite, ranked by how likely they are to say yes. Only people
-- pull_in() would accept are listed. Reasons are facts the UI turns into words.
create or replace function public.pull_in_candidates(p_plan_id uuid, p_limit integer default 20)
returns table (
  user_id uuid,
  display_name text,
  avatar_path text,
  games_with_me integer,
  pull_me_in boolean,
  free_at_plan_time boolean,
  plays_sport boolean,
  already_invited boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_plan public.plans%rowtype;
  v_place public.places%rowtype;
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if not found or not authz.can_see_plan(p_plan_id, v_uid) then
    perform private.fail('plan_not_found');
  end if;
  if not authz.is_plan_member(p_plan_id, v_uid) then
    perform private.fail('not_member');
  end if;
  select * into v_place from public.places where id = v_plan.place_id;

  return query
  with pool as (
    -- People you have played with.
    select distinct o.user_id as id
    from public.passport_entries e
    join public.passport_entries o on o.activity_id = e.activity_id and o.user_id <> e.user_id
    where e.user_id = v_uid
    union
    -- People who said anyone nearby may pull them in for this sport.
    select pm.user_id
    from public.pull_me_in pm
    join public.profile_private pp on pp.user_id = pm.user_id
    where pm.sport_id = v_plan.sport_id and pm.scope = 'nearby'
      and v_place.id is not null and pp.area_lat is not null
      and private.distance_m(pp.area_lat::double precision, pp.area_lng::double precision, v_place.lat, v_place.lng)
          <= pp.discovery_radius_km * 1000
  )
  select
    pr.id,
    pr.display_name,
    pr.avatar_path,
    authz.games_together(pr.id, v_uid),
    exists (select 1 from public.pull_me_in pm where pm.user_id = pr.id and pm.sport_id = v_plan.sport_id),
    private.free_at(pr.id, v_plan.starts_at, v_uid),
    authz.can_see_part(pr.id, 'sports', v_uid)
      and exists (select 1 from public.user_sports us where us.user_id = pr.id and us.sport_id = v_plan.sport_id),
    exists (select 1 from public.plan_invites i where i.plan_id = p_plan_id and i.invitee_id = pr.id)
  from pool
  join public.profiles pr on pr.id = pool.id
  where pr.id <> v_uid
    and not exists (select 1 from public.plan_members m where m.plan_id = p_plan_id and m.user_id = pr.id)
    and not authz.is_blocked(pr.id, v_uid)
    and not authz.is_blocked(pr.id, v_plan.host_id)
  order by
    exists (select 1 from public.pull_me_in pm where pm.user_id = pr.id and pm.sport_id = v_plan.sport_id) desc,
    private.free_at(pr.id, v_plan.starts_at, v_uid) desc,
    authz.games_together(pr.id, v_uid) desc,
    pr.display_name, pr.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

-- Plans forming near the caller (by their coarse area and radius), soonest first. Visibility comes from
-- the plan_cards view (RLS of the caller), so this runs as the caller.
create or replace function public.plans_nearby(
  p_sport_id text default null,
  p_until timestamptz default null,
  p_limit integer default 20,
  p_max_km numeric default null
)
returns table (
  plan_id uuid,
  sport_id text,
  sport_name text,
  title text,
  starts_at timestamptz,
  capacity integer,
  member_count integer,
  effective_status public.plan_status,
  place_id uuid,
  place_name text,
  place_area text,
  host_id uuid,
  i_am_in boolean,
  distance_km numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select pp.area_lat::double precision as lat, pp.area_lng::double precision as lng, pp.discovery_radius_km as r
    from public.profile_private pp where pp.user_id = auth.uid()
  ), cards as (
    select c.*,
      case when me.lat is not null and c.place_lat is not null
           then round((private_distance.m / 1000)::numeric, 1) end as km,
      me.r
    from public.plan_cards c
    left join me on true
    left join lateral (
      select 2 * 6371000 * asin(sqrt(
        power(sin(radians(c.place_lat - me.lat) / 2), 2)
        + cos(radians(me.lat)) * cos(radians(c.place_lat)) * power(sin(radians(c.place_lng - me.lng) / 2), 2)
      )) as m
    ) private_distance on true
  )
  select id, sport_id, sport_name, title, starts_at, capacity, member_count, effective_status, place_id,
         place_name, place_area, host_id, i_am_in, km
  from cards
  where effective_status = 'forming'
    and starts_at > now()
    and starts_at <= coalesce(p_until, now() + interval '7 days')
    and (p_sport_id is null or sport_id = p_sport_id)
    and (km is null or km <= coalesce(p_max_km, r))
  order by starts_at, km nulls last, id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- STILL ON TONIGHT: after a plan expires (or fills), what's still on in the same sport family, within
-- twice the caller's radius, with spots left, in the next p_within_hours. Never a dead end.
create or replace function public.still_on_nearby(
  p_plan_id uuid,
  p_within_hours integer default 24,
  p_limit integer default 5
)
returns table (
  plan_id uuid,
  sport_id text,
  sport_name text,
  title text,
  starts_at timestamptz,
  capacity integer,
  member_count integer,
  effective_status public.plan_status,
  place_id uuid,
  place_name text,
  place_area text,
  host_id uuid,
  i_am_in boolean,
  distance_km numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select n.*
  from public.plan_cards ref
  cross join lateral public.plans_nearby(
    null,
    now() + make_interval(hours => least(greatest(coalesce(p_within_hours, 24), 1), 168)),
    50,
    -- A bit further out than usual: twice the caller's radius.
    (select 2 * pp.discovery_radius_km from public.profile_private pp where pp.user_id = auth.uid())
  ) n
  join public.sports s on s.id = n.sport_id
  where ref.id = p_plan_id
    and n.plan_id <> ref.id
    and s.family = ref.sport_family
    and n.member_count < n.capacity
    and not n.i_am_in
  order by n.starts_at, n.distance_km nulls last, n.plan_id
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

-- Down For near you: people who want to play, without where they are. Public signals, or friends-only
-- signals from people you've played with; both areas inside each other's radius. Your own are excluded.
create or replace function public.down_for_nearby(p_sport_id text default null, p_limit integer default 50)
returns table (
  signal_id uuid,
  sport_id text,
  user_id uuid,
  display_name text,
  avatar_path text,
  window_start timestamptz,
  window_end timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.sport_id, s.user_id, p.display_name, p.avatar_path, s.window_start, s.window_end, s.expires_at
  from public.intent_signals s
  join public.profiles p on p.id = s.user_id
  join public.profile_private me on me.user_id = auth.uid()
  where s.status = 'active' and s.expires_at > now() and s.window_end > now()
    and s.user_id <> auth.uid()
    and (p_sport_id is null or s.sport_id = p_sport_id)
    and not authz.is_blocked(s.user_id, auth.uid())
    and (s.audience = 'public' or authz.connected(s.user_id, auth.uid()))
    and me.area_lat is not null and s.area_lat is not null
    and private.distance_m(me.area_lat::double precision, me.area_lng::double precision,
                           s.area_lat::double precision, s.area_lng::double precision)
        <= least(s.radius_km, me.discovery_radius_km) * 1000
  order by s.window_start, s.created_at, s.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- Activities ----------------------------------------------------------------------------------------------

-- Who's playing. Arrival times only for people in the game; the waitlist only for the host and yourself.
create or replace function public.activity_roster(p_activity_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_path text,
  status public.attendance_status,
  team public.team_side,
  is_host boolean,
  is_me boolean,
  checked_in_at timestamptz,
  waitlisted_at timestamptz,
  games_with_me integer,
  invited_by_me boolean,
  "position" text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_a public.activities%rowtype;
  v_inside boolean;
begin
  select * into v_a from public.activities where id = p_activity_id;
  if not found or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  v_inside := authz.is_participant(p_activity_id, v_uid);
  return query
  select
    t.user_id, p.display_name, p.avatar_path,
    case when v_inside or t.user_id = v_uid or t.status <> 'checked_in' then t.status
         else 'confirmed'::public.attendance_status end,
    t.team,
    t.user_id = v_a.host_id,
    t.user_id = v_uid,
    case when v_inside or t.user_id = v_uid then t.checked_in_at end,
    case when t.status = 'waitlisted' then t.waitlisted_at end,
    case when t.user_id = v_uid then null else authz.games_together(t.user_id, v_uid) end,
    exists (select 1 from public.plan_invites i
            where i.plan_id = v_a.plan_id and i.invitee_id = t.user_id and i.inviter_id = v_uid
              and i.status = 'accepted'),
    case when authz.can_see_part(t.user_id, 'sports', v_uid)
         then (select us.position from public.user_sports us
               where us.user_id = t.user_id and us.sport_id = v_a.sport_id) end
  from public.attendance t
  join public.profiles p on p.id = t.user_id
  where t.activity_id = p_activity_id
    and not authz.is_blocked(t.user_id, v_uid)
    and (t.status in ('confirmed', 'checked_in')
         or (t.status = 'waitlisted' and (v_a.host_id = v_uid or t.user_id = v_uid)))
  order by (t.user_id = v_a.host_id) desc, (t.user_id = v_uid) desc, t.checked_in_at nulls last,
           t.confirmed_at, t.waitlisted_at, t.user_id;
end;
$$;

-- Recap: who you played with, with firsts and milestones ("First game with Lena. 12th with Marcus").
-- Players (and the host) only.
create or replace function public.recap_people(p_activity_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_path text,
  team public.team_side,
  games_with_me integer,
  is_first_with_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not (authz.is_player(p_activity_id, v_uid)
          or exists (select 1 from public.activities a where a.id = p_activity_id and a.host_id = v_uid)) then
    perform private.fail('not_player');
  end if;
  return query
  select t.user_id, p.display_name, p.avatar_path, t.team,
         authz.games_together(t.user_id, v_uid),
         authz.games_together(t.user_id, v_uid) = 1
  from public.attendance t
  join public.profiles p on p.id = t.user_id
  where t.activity_id = p_activity_id and t.status = 'checked_in' and t.user_id <> v_uid
    and not authz.is_blocked(t.user_id, v_uid)
  order by authz.games_together(t.user_id, v_uid) desc, p.display_name, t.user_id;
end;
$$;

-- Recap: the caller's Passport stamp for this game ("21 games at Jeanne-Mance since March").
create or replace function public.recap_for_me(p_activity_id uuid)
returns table (
  passport_entry_id uuid,
  occurred_at timestamptz,
  minutes integer,
  ojoro_hours numeric,
  place_id uuid,
  place_name text,
  place_game_number integer,
  sport_game_number integer,
  first_at_place timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.occurred_at, e.minutes, round(e.minutes / 60.0, 1), e.place_id, pl.name,
         e.place_game_number, e.sport_game_number,
         (select min(f.occurred_at) from public.passport_entries f
          where f.user_id = e.user_id and f.place_id = e.place_id)
  from public.passport_entries e
  left join public.places pl on pl.id = e.place_id
  where e.activity_id = p_activity_id and e.user_id = auth.uid();
$$;

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
