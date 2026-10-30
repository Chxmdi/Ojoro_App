-- Step 6 (Communities): follow-ups after the first pass.
--   1. Clans get a short name for posters and badges ("CONCORDIA" for Concordia Run Club). clan_view,
--      clash_view and clan_clashes return it (falls back to the name).
--   2. clan_week is a rolling window from today (THIS WEEK lists what's coming in the next 7 days, so
--      on a Friday it still shows next Tuesday's run), not the calendar week.
--   3. back_clash keeps the counts by adding and taking away (like back_challenge), not by recounting.

alter table public.clans add column short_name text check (char_length(short_name) between 1 and 16);
comment on column public.clans.short_name is 'Poster and badge name, e.g. CONCORDIA. Null = the name.';

drop function public.clan_view(uuid);
drop function public.clan_week(uuid, date);
drop function public.clash_view(uuid);
drop function public.clan_clashes(uuid);

create or replace function public.clan_view(p_clan_id uuid)
returns table (
  clan_id uuid,
  name text,
  short_name text,
  tagline text,
  sport_id text,
  area text,
  city text,
  join_policy public.clan_join_policy,
  time_zone text,
  member_count integer,
  runs_per_week integer,
  runs_this_week integer,
  coach_count integer,
  is_member boolean,
  my_role public.clan_role,
  my_role_note text,
  on_leaderboard boolean,
  request_status public.clan_request_status,
  can_manage boolean,
  can_start_run boolean,
  can_invite boolean,
  can_admit boolean,
  can_set_mission boolean,
  can_set_roles boolean,
  pending_requests integer,
  created_at timestamptz,
  server_now timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  c public.clans%rowtype := private.require_clan(p_clan_id, v_uid);
  m public.clan_members%rowtype;
  v_monday date := private.local_week_start(now(), c.time_zone);
begin
  select * into m from public.clan_members x where x.clan_id = p_clan_id and x.user_id = v_uid;
  return query
  select c.id, c.name, coalesce(c.short_name, c.name), c.tagline, c.sport_id, c.area, c.city, c.join_policy, c.time_zone, c.member_count,
         (select count(*)::integer from public.rituals r where r.clan_id = c.id and r.status = 'active'),
         (select count(*)::integer from public.clan_runs r
           where r.clan_id = c.id and r.status <> 'cancelled'
             and (r.starts_at at time zone c.time_zone)::date between v_monday and v_monday + 6),
         (select count(*)::integer from public.clan_members x where x.clan_id = c.id and x.role = 'coach'),
         m.user_id is not null, m.role, m.role_note, m.on_leaderboard,
         (select q.status from public.clan_join_requests q where q.clan_id = c.id and q.user_id = v_uid
           order by q.created_at desc limit 1),
         authz.clan_can(c.id, 'manage', v_uid), authz.clan_can(c.id, 'run', v_uid),
         authz.clan_can(c.id, 'invite', v_uid), authz.clan_can(c.id, 'admit', v_uid),
         authz.clan_can(c.id, 'mission', v_uid), authz.clan_can(c.id, 'roles', v_uid),
         case when authz.clan_can(c.id, 'admit', v_uid) then
           (select count(*)::integer from public.clan_join_requests q
             where q.clan_id = c.id and q.status = 'pending' and not authz.is_blocked(q.user_id, v_uid)) end,
         c.created_at, now();
end;
$$;

-- THIS WEEK: the clan's runs from p_from (default today, local) for p_days days (default 7), soonest
-- first. Cancelled runs are listed (stage 'cancelled') so the app can say so.
create or replace function public.clan_week(p_clan_id uuid, p_from date default null, p_days integer default 7)
returns table (
  run_id uuid, clan_id uuid, ritual_id uuid, title text, sport_id text, starts_at timestamptz,
  duration_minutes integer, place_id uuid, place_name text, place_area text, distance_km numeric,
  down_count integer, checked_in_count integer, capacity integer, min_to_go integer,
  status public.clan_run_status, stage public.clan_run_stage, host_id uuid, host_name text,
  i_am_down boolean, i_checked_in boolean, can_cancel boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  c public.clans%rowtype := private.require_clan(p_clan_id, v_uid);
  v_from date := coalesce(p_from, (now() at time zone c.time_zone)::date);
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 31);
begin
  return query select * from private.clan_run_rows(v_uid, p_clan_id, null,
    v_from::timestamp at time zone c.time_zone, (v_from + v_days)::timestamp at time zone c.time_zone);
end;
$$;

create or replace function public.clash_view(p_clash_id uuid)
returns table (
  clash_id uuid,
  title text,
  season_label text,
  a_clan_id uuid,
  a_name text,
  a_short_name text,
  b_clan_id uuid,
  b_name text,
  b_short_name text,
  status public.clash_status,
  stage public.clash_stage,
  situation text,
  my_side public.team_side,
  my_captain_side public.team_side,
  i_am_organizer boolean,
  event_count integer,
  decided_count integer,
  a_wins integer,
  b_wins integer,
  draws integer,
  leader public.team_side,
  next_event_id uuid,
  next_position integer,
  first_starts_at timestamptz,
  last_starts_at timestamptz,
  backing_a integer,
  backing_b integer,
  my_backing public.team_side,
  time_zone text,
  server_now timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  x public.clashes%rowtype := private.require_clash(p_clash_id, v_uid);
  v_stage public.clash_stage := private.clash_stage(x);
begin
  return query
  with ev as (
    select e.*, r.winner_side, r.clash_event_id as decided
    from public.clash_events e
    left join public.clash_event_results r on r.clash_event_id = e.id
    where e.clash_id = x.id
  ),
  score as (
    select count(*)::integer as n, count(ev.decided)::integer as d,
           count(*) filter (where ev.winner_side = 'a')::integer as aw,
           count(*) filter (where ev.winner_side = 'b')::integer as bw,
           count(*) filter (where ev.decided is not null and ev.winner_side is null)::integer as dr,
           min(ev.starts_at) as first_at, max(ev.starts_at) as last_at
    from ev
  ),
  nxt as (
    select ev.id, ev.position from ev where ev.decided is null order by ev.position limit 1
  )
  select x.id, x.title, x.season_label, x.a_clan_id, ca.name, coalesce(ca.short_name, ca.name), x.b_clan_id, cb.name, coalesce(cb.short_name, cb.name), x.status, v_stage,
         private.clash_situation(v_stage), authz.clash_side(x.id, v_uid), authz.clash_captain_side(x.id, v_uid),
         authz.is_clash_organizer(x.id, v_uid),
         score.n, score.d, score.aw, score.bw, score.dr,
         case when score.aw > score.bw then 'a'::public.team_side when score.bw > score.aw then 'b'::public.team_side end,
         (select nxt.id from nxt), (select nxt.position::integer from nxt), score.first_at, score.last_at,
         x.backing_a, x.backing_b,
         (select b.side from public.clash_backings b where b.clash_id = x.id and b.user_id = v_uid),
         ca.time_zone, now()
  from score
  join public.clans ca on ca.id = x.a_clan_id
  join public.clans cb on cb.id = x.b_clan_id;
end;
$$;

create or replace function public.clan_clashes(p_clan_id uuid)
returns table (
  clash_id uuid,
  title text,
  season_label text,
  opponent_clan_id uuid,
  opponent_name text,
  opponent_short_name text,
  our_side public.team_side,
  stage public.clash_stage,
  our_wins integer,
  their_wins integer,
  draws integer,
  event_count integer,
  decided_count integer,
  standing text,
  next_event_id uuid,
  next_position integer,
  next_title text,
  next_sport_id text,
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
  perform private.require_clan(p_clan_id, v_uid);
  return query
  select y.id, y.title, y.season_label, y.opp_id, y.opp_name, y.opp_short, y.side, y.stg, y.ours, y.theirs, y.dr, y.n, y.d,
         case when y.ours > y.theirs then 'leading' when y.ours < y.theirs then 'trailing' else 'level' end,
         y.nid, y.npos, y.ntitle, y.nsport, y.nstart
  from (
    select x.id, x.title, x.season_label,
           case when x.a_clan_id = p_clan_id then x.b_clan_id else x.a_clan_id end as opp_id,
           (select c.name from public.clans c
             where c.id = case when x.a_clan_id = p_clan_id then x.b_clan_id else x.a_clan_id end) as opp_name,
           (select coalesce(c.short_name, c.name) from public.clans c
             where c.id = case when x.a_clan_id = p_clan_id then x.b_clan_id else x.a_clan_id end) as opp_short,
           case when x.a_clan_id = p_clan_id then 'a'::public.team_side else 'b'::public.team_side end as side,
           private.clash_stage(x) as stg,
           (select count(*)::integer from public.clash_event_results r where r.clash_id = x.id
              and r.winner_side = case when x.a_clan_id = p_clan_id then 'a'::public.team_side else 'b'::public.team_side end) as ours,
           (select count(*)::integer from public.clash_event_results r where r.clash_id = x.id
              and r.winner_side = case when x.a_clan_id = p_clan_id then 'b'::public.team_side else 'a'::public.team_side end) as theirs,
           (select count(*)::integer from public.clash_event_results r where r.clash_id = x.id and r.winner_side is null) as dr,
           (select count(*)::integer from public.clash_events e where e.clash_id = x.id) as n,
           (select count(*)::integer from public.clash_event_results r where r.clash_id = x.id) as d,
           nx.id as nid, nx.position::integer as npos, nx.title as ntitle, nx.sport_id as nsport, nx.starts_at as nstart
    from public.clashes x
    left join lateral (
      select e.id, e.position, e.title, e.sport_id, e.starts_at from public.clash_events e
      where e.clash_id = x.id and not exists (select 1 from public.clash_event_results r where r.clash_event_id = e.id)
      order by e.position limit 1
    ) nx on true
    where (x.a_clan_id = p_clan_id or x.b_clan_id = p_clan_id) and authz.can_see_clash(x.id, v_uid)
  ) y
  order by (y.stg in ('complete', 'declined', 'cancelled')), y.nstart nulls last, y.id;
end;
$$;

create or replace function public.back_clash(p_clash_id uuid, p_side public.team_side default null)
returns public.clash_backing_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  x public.clashes%rowtype;
  v_old public.team_side;
  v_mine public.team_side;
begin
  select * into x from public.clashes where id = p_clash_id for update;
  if not found or not authz.can_see_clash(p_clash_id, v_uid) then
    perform private.fail('clash_not_found');
  end if;
  if private.clash_stage(x) not in ('upcoming', 'live') then
    perform private.fail('backing_closed');
  end if;
  v_mine := authz.clash_side(x.id, v_uid);
  if p_side is not null and v_mine is not null and p_side <> v_mine then
    perform private.fail('prediction_not_allowed');
  end if;
  select b.side into v_old from public.clash_backings b where b.clash_id = x.id and b.user_id = v_uid;
  if v_old is not distinct from p_side then
    return row(x.id, v_old, x.backing_a, x.backing_b)::public.clash_backing_state;
  end if;
  if v_old is not null then
    delete from public.clash_backings where clash_id = x.id and user_id = v_uid;
  end if;
  if p_side is not null then
    insert into public.clash_backings (clash_id, user_id, side) values (x.id, v_uid, p_side);
  end if;
  update public.clashes
     set backing_a = greatest(backing_a - case when v_old = 'a' then 1 else 0 end + case when p_side = 'a' then 1 else 0 end, 0),
         backing_b = greatest(backing_b - case when v_old = 'b' then 1 else 0 end + case when p_side = 'b' then 1 else 0 end, 0)
   where id = x.id;
  select * into x from public.clashes where id = p_clash_id;
  perform private.emit('clash_backed', v_uid,
    jsonb_build_object('clash_id', x.id, 'side', p_side, 'own_clan', v_mine is not null));
  return row(x.id, p_side, x.backing_a, x.backing_b)::public.clash_backing_state;
end;
$$;


do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in ('clan_view', 'clan_week', 'clash_view', 'clan_clashes', 'back_clash')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end;
$$;
