-- Step 6 (Host OS core): HostHome, roster and waitlist, join requests, People CRM, announcements, tick.
--
-- Contract: docs/HOSTS_CONTRACT.md. Every RPC here checks server-side that the caller runs the
-- program (authz.is_program_host), except the participant-side ones (ask_to_join,
-- withdraw_join_request, mark_announcement_read, session_pinned_announcement).

-- Shared facts ---------------------------------------------------------------------------------------------

-- The last 12 sessions (ended, not skipped) of the series this person has come to in this program,
-- oldest first, with whether they checked in. "Came to 9 of the last 12."
create or replace function private.host_last12(p_program uuid, p_user uuid)
returns boolean[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(x.came order by x.starts_at), '{}')
  from (
    select s.starts_at,
           exists (select 1 from public.attendance t
                   where t.activity_id = s.activity_id and t.user_id = p_user and t.status = 'checked_in') as came
    from public.host_sessions s
    join public.activities a on a.id = s.activity_id
    where s.program_id = p_program and s.status = 'scheduled' and a.ends_at <= now()
      and s.series_id in (
        select s2.series_id from public.host_sessions s2
        join public.attendance t2 on t2.activity_id = s2.activity_id
        where s2.program_id = p_program and t2.user_id = p_user and t2.status in ('confirmed', 'checked_in')
      )
    order by s.starts_at desc
    limit 12
  ) x;
$$;

create or replace function private.true_count(p bool[])
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer from unnest(p) x where x;
$$;

-- Per-person attendance facts at this program's sessions (checked in = came; confirmed at an ended
-- session = no-show). Hosts see attendance at their own sessions only.
create or replace function private.host_person_facts(p_program uuid)
returns table (
  user_id uuid,
  sessions_total integer,
  first_came_at timestamptz,
  last_came_at timestamptz,
  came_30d integer,
  no_shows integer,
  days smallint[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.user_id,
         count(*) filter (where t.status = 'checked_in')::integer,
         min(s.starts_at) filter (where t.status = 'checked_in'),
         max(s.starts_at) filter (where t.status = 'checked_in'),
         count(*) filter (where t.status = 'checked_in' and s.starts_at > now() - interval '30 days')::integer,
         count(*) filter (where t.status = 'confirmed' and a.ends_at <= now())::integer,
         coalesce((
           select array_agg(distinct extract(isodow from (s2.starts_at at time zone p.time_zone))::smallint
                            order by extract(isodow from (s2.starts_at at time zone p.time_zone))::smallint)
           from public.host_sessions s2
           join public.attendance t2 on t2.activity_id = s2.activity_id
           where s2.program_id = p_program and t2.user_id = t.user_id and t2.status = 'checked_in'
             and s2.starts_at > now() - interval '90 days'
         ), '{}')
  from public.host_sessions s
  join public.activities a on a.id = s.activity_id
  join public.attendance t on t.activity_id = s.activity_id
  join public.host_programs p on p.id = s.program_id
  where s.program_id = p_program and s.status = 'scheduled'
  group by t.user_id, p.time_zone;
$$;

-- HostHome ----------------------------------------------------------------------------------------------

-- Header and LAST 30 DAYS. The week is [start of today, +7 days) in the program's time zone.
create or replace function public.host_home(p_program_id uuid)
returns table (
  program_id uuid,
  name text,
  area text,
  time_zone text,
  role public.host_role,
  week_from timestamptz,
  week_to timestamptz,
  sessions_this_week integer,
  ops_items_this_week integer,
  spots_taken integer,
  spots_total integer,
  waiting integer,
  needs_you_count integer,
  last30_sessions integer,
  last30_showed_up_pct integer,
  last30_ojoro_hours integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_prog public.host_programs%rowtype;
  v_from timestamptz;
begin
  v_prog := private.host_require(p_program_id, v_uid);
  v_from := ((now() at time zone v_prog.time_zone)::date)::timestamp at time zone v_prog.time_zone;
  return query
  with week as (
    select s.*, a.capacity, a.confirmed_count, a.waitlist_count
    from public.host_sessions s join public.activities a on a.id = s.activity_id
    where s.program_id = p_program_id and s.status = 'scheduled'
      and s.starts_at >= v_from and s.starts_at < v_from + interval '7 days'
  ),
  done as (
    select a.id, a.ends_at, a.starts_at, s.id as session_id
    from public.host_sessions s join public.activities a on a.id = s.activity_id
    where s.program_id = p_program_id and s.status = 'scheduled'
      and a.ends_at <= now() and a.ends_at > now() - interval '30 days'
  ),
  att as (
    select count(*) filter (where t.status = 'checked_in') as came,
           count(*) filter (where t.status in ('checked_in', 'confirmed')) as expected,
           coalesce(sum(extract(epoch from (d.ends_at - d.starts_at)) / 3600)
                    filter (where t.status = 'checked_in'), 0) as hours
    from done d join public.attendance t on t.activity_id = d.id
  )
  select v_prog.id, v_prog.name, v_prog.area, v_prog.time_zone,
         authz.program_role(p_program_id, v_uid),
         v_from, v_from + interval '7 days',
         (select count(*)::integer from week),
         (select count(*)::integer from private.host_week_ops(p_program_id, v_from, v_from + interval '7 days')),
         (select coalesce(sum(w.confirmed_count), 0)::integer from week w),
         (select coalesce(sum(w.capacity), 0)::integer from week w),
         (select coalesce(sum(w.waitlist_count), 0)::integer from week w),
         (select coalesce(sum(n.count), 0)::integer from public.host_needs_you(p_program_id) n),
         (select count(*)::integer from done),
         (select case when att.expected = 0 then null else round(100.0 * att.came / att.expected)::integer end from att),
         (select round(att.hours)::integer from att);
end;
$$;

-- NEEDS YOU: join requests waiting (per session), waitlists that need the host to choose (after the
-- cutoff with a spot open), then the ops ledger's items (refunds, league results). `count` is how
-- many things the row stands for (the header says NEEDS YOU · <rows>).
create or replace function public.host_needs_you(p_program_id uuid)
returns setof public.host_needs_you_item
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
begin
  perform private.host_require(p_program_id, v_uid);
  return query
  select * from (
    select 'join_requests'::text as kind, s.id as session_id, s.id as object_id, a.title as name,
           s.starts_at as starts_at, count(r.*)::integer as count,
           (array_agg(pr.display_name order by r.created_at))[1:3] as user_names,
           jsonb_build_object('approval_required', s.approval_required) as detail,
           min(r.created_at) as sort_at
    from public.host_sessions s
    join public.activities a on a.id = s.activity_id
    join public.host_join_requests r on r.session_id = s.id and r.status = 'pending'
    join public.profiles pr on pr.id = r.user_id
    where s.program_id = p_program_id and s.status = 'scheduled' and s.starts_at > now()
      and not authz.is_blocked(r.user_id, v_uid)
    group by s.id, a.title
    union all
    select 'waitlist_choice'::text, s.id, s.id, a.title, s.starts_at,
           least(a.capacity - a.confirmed_count, a.waitlist_count)::integer,
           null::text[],
           jsonb_build_object('open', a.capacity - a.confirmed_count, 'waiting', a.waitlist_count),
           s.auto_fill_cutoff_at
    from public.host_sessions s
    join public.activities a on a.id = s.activity_id
    where s.program_id = p_program_id and s.status = 'scheduled' and a.status = 'confirmed'
      and a.starts_at > now() and not private.waitlist_fills_itself(a.id)
      and a.confirmed_count < a.capacity and a.waitlist_count > 0
    union all
    select * from private.host_needs_you_ops(p_program_id)
  ) x
  order by x.sort_at nulls last;
end;
$$;

-- THIS WEEK: sessions (and the ops ledger's league rounds) from the start of today for 7 days.
create or replace function public.host_week(p_program_id uuid)
returns setof public.host_week_item
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_prog public.host_programs%rowtype;
  v_from timestamptz;
begin
  v_prog := private.host_require(p_program_id, v_uid);
  v_from := ((now() at time zone v_prog.time_zone)::date)::timestamp at time zone v_prog.time_zone;
  return query
  select * from (
    select 'session'::text as kind, s.id as session_id, s.series_id as series_id, s.activity_id as object_id,
           a.title as name, s.starts_at as starts_at,
           coalesce(pl.time_zone, v_prog.time_zone) as time_zone, s.status::text as status, a.capacity as capacity,
           a.confirmed_count as in_count, a.waitlist_count as waitlist_count,
           (select count(*)::integer from public.host_join_requests r where r.session_id = s.id and r.status = 'pending') as asking_count,
           s.price_cents as price_cents, s.member_price_cents as member_price_cents, s.currency as currency,
           s.approval_required as approval_required, s.members_first as members_first,
           jsonb_build_object('level', a.level_label, 'place_name', pl.name) as detail
    from public.host_sessions s
    join public.activities a on a.id = s.activity_id
    left join public.places pl on pl.id = a.place_id
    where s.program_id = p_program_id and s.starts_at >= v_from and s.starts_at < v_from + interval '7 days'
    union all
    select * from private.host_week_ops(p_program_id, v_from, v_from + interval '7 days')
  ) x
  order by x.starts_at;
end;
$$;

-- Series reads --------------------------------------------------------------------------------------------------

create or replace function public.series_view(p_series_id uuid)
returns table (
  id uuid,
  program_id uuid,
  name text,
  sport_id text,
  place_id uuid,
  place_name text,
  place_area text,
  time_zone text,
  start_time time,
  duration_minutes integer,
  capacity integer,
  level public.host_level,
  repeat_days smallint[],
  starts_on date,
  until_on date,
  join_opens_days integer,
  members_early_hours integer,
  approval_required boolean,
  waitlist_auto_fill boolean,
  auto_fill_cutoff_minutes integer,
  members_first boolean,
  price_cents integer,
  member_price_cents integer,
  currency text,
  refund_window public.host_refund_window,
  teams_note text,
  kit_note text,
  version integer,
  first_session_on date,
  sessions_run integer,
  skipped_upcoming date[],
  applies_from date,
  people_in_upcoming integer,
  host_verified boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_prog uuid;
begin
  select s.program_id into v_prog from public.host_series s where s.id = p_series_id;
  if v_prog is null then
    perform private.fail('series_not_found');
  end if;
  perform private.host_require(v_prog, v_uid);
  return query
  select s.id, s.program_id, s.name, s.sport_id, s.place_id, pl.name, pl.area, pl.time_zone,
         s.start_time, s.duration_minutes, s.capacity, s.level, s.repeat_days, s.starts_on, s.until_on,
         s.join_opens_days, s.members_early_hours, s.approval_required, s.waitlist_auto_fill,
         s.auto_fill_cutoff_minutes, s.members_first, s.price_cents, s.member_price_cents, s.currency,
         s.refund_window, s.teams_note, s.kit_note, s.version,
         (select min(x.occurs_on) from public.host_sessions x where x.series_id = s.id),
         (select count(*)::integer from public.host_sessions x join public.activities a on a.id = x.activity_id
           where x.series_id = s.id and x.status = 'scheduled' and a.ends_at <= now()),
         (select coalesce(array_agg(x.occurs_on order by x.occurs_on), '{}') from public.host_sessions x
           where x.series_id = s.id and x.status = 'skipped' and x.starts_at > now()),
         (select min(x.occurs_on) from public.host_sessions x
           where x.series_id = s.id and x.status = 'scheduled' and x.starts_at > now()),
         (select count(distinct t.user_id)::integer from public.host_sessions x
           join public.attendance t on t.activity_id = x.activity_id
           where x.series_id = s.id and x.status = 'scheduled' and x.starts_at > now()
             and t.status in ('confirmed', 'waitlisted')),
         -- No host verification exists yet (docs/DESIGN_DECISIONS.md).
         false
  from public.host_series s
  join public.places pl on pl.id = s.place_id
  where s.id = p_series_id;
end;
$$;

-- NEXT N SESSIONS (skip / restore).
create or replace function public.series_sessions(p_series_id uuid, p_limit integer default 4)
returns table (
  session_id uuid,
  activity_id uuid,
  occurs_on date,
  starts_at timestamptz,
  status public.host_session_status,
  skip_reason text,
  capacity integer,
  in_count integer,
  open_count integer,
  waitlist_count integer,
  asking_count integer,
  opens_at timestamptz,
  members_open_at timestamptz,
  members_first boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_prog uuid;
begin
  select s.program_id into v_prog from public.host_series s where s.id = p_series_id;
  if v_prog is null then
    perform private.fail('series_not_found');
  end if;
  perform private.host_require(v_prog, v_uid);
  return query
  select x.id, x.activity_id, x.occurs_on, x.starts_at, x.status, x.skip_reason, a.capacity,
         a.confirmed_count, greatest(a.capacity - a.confirmed_count, 0), a.waitlist_count,
         (select count(*)::integer from public.host_join_requests r where r.session_id = x.id and r.status = 'pending'),
         x.opens_at, x.members_open_at, x.members_first
  from public.host_sessions x
  join public.activities a on a.id = x.activity_id
  where x.series_id = p_series_id and x.starts_at > now()
  order by x.starts_at
  limit greatest(1, least(coalesce(p_limit, 4), 20));
end;
$$;

-- Session (roster) ---------------------------------------------------------------------------------------------

create or replace function public.session_view(p_session_id uuid)
returns table (
  session_id uuid,
  program_id uuid,
  program_name text,
  series_id uuid,
  plan_id uuid,
  activity_id uuid,
  name text,
  sport_id text,
  place_name text,
  place_area text,
  time_zone text,
  starts_at timestamptz,
  ends_at timestamptz,
  check_in_opens_at timestamptz,
  status public.host_session_status,
  effective_status public.activity_status,
  skip_reason text,
  capacity integer,
  in_count integer,
  checked_in_count integer,
  waitlist_count integer,
  asking_count integer,
  approval_required boolean,
  waitlist_auto_fill boolean,
  auto_fill_cutoff_at timestamptz,
  auto_fill_active boolean,
  members_first boolean,
  opens_at timestamptz,
  members_open_at timestamptz,
  price_cents integer,
  member_price_cents integer,
  currency text,
  refund_window public.host_refund_window,
  rule_played_with boolean,
  rule_experienced boolean,
  rule_crews boolean,
  crew_names text[],
  settled integer,
  settle_total integer,
  settle_note_user_id uuid,
  settle_note text,
  chat_new_today integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_prog uuid;
begin
  select s.program_id into v_prog from public.host_sessions s where s.id = p_session_id;
  if v_prog is null then
    perform private.fail('session_not_found');
  end if;
  perform private.host_require(v_prog, v_uid);
  return query
  select s.id, s.program_id, p.name, s.series_id, s.plan_id, s.activity_id, a.title, a.sport_id, pl.name, pl.area,
         coalesce(pl.time_zone, p.time_zone), a.starts_at, a.ends_at, a.check_in_opens_at, s.status,
         private.activity_status_now(a), s.skip_reason, a.capacity, a.confirmed_count, a.checked_in_count,
         a.waitlist_count,
         (select count(*)::integer from public.host_join_requests r where r.session_id = s.id and r.status = 'pending'),
         s.approval_required, s.waitlist_auto_fill, s.auto_fill_cutoff_at,
         coalesce(private.waitlist_fills_itself(a.id), false), s.members_first, s.opens_at, s.members_open_at,
         s.price_cents, s.member_price_cents, s.currency, s.refund_window,
         p.auto_approve_played_with, p.auto_approve_experienced, p.auto_approve_crews,
         (select coalesce(array_agg(distinct c.name order by c.name), '{}')
            from public.crews c
           where c.archived_at is null
             and (c.id = p.crew_id or exists (select 1 from public.crew_members m
                                              where m.crew_id = c.id and m.user_id = v_uid))),
         (st).settled, (st).total, (st).note_user_id, (st).note,
         (select count(*)::integer from public.messages m
           where m.activity_id = s.activity_id and m.deleted_at is null
             and m.created_at >= ((now() at time zone coalesce(pl.time_zone, p.time_zone))::date)::timestamp
                                 at time zone coalesce(pl.time_zone, p.time_zone))
  from public.host_sessions s
  join public.host_programs p on p.id = s.program_id
  join public.activities a on a.id = s.activity_id
  left join public.places pl on pl.id = a.place_id
  cross join lateral (select private.host_session_settlement(s.id) as st) x
  where s.id = p_session_id;
end;
$$;

-- IN / WAITLIST / DROPPED. Blocked people are left out for the viewer.
create or replace function public.session_roster(p_session_id uuid)
returns table (
  section text,               -- 'in' | 'waitlist' | 'dropped'
  waitlist_position integer,
  user_id uuid,
  display_name text,
  avatar_path text,
  is_host boolean,
  is_member boolean,
  attendance_status public.attendance_status,
  team public.team_side,
  first_time boolean,
  last12_count integer,
  last12_total integer,
  plays_most_dow smallint,
  joined_at timestamptz,
  waitlisted_at timestamptz,
  promoted_at timestamptz,
  checked_in_at timestamptz,
  check_in_method public.check_in_method,
  approved_at timestamptz,
  approved_via public.host_approved_via,
  dropped_at timestamptz,
  replaced_by uuid,
  replaced_by_name text,
  replaced_at timestamptz,
  payment_status text,
  payment_label text,
  payment_amount_cents integer,
  payment_detail text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  s public.host_sessions%rowtype;
begin
  select * into s from public.host_sessions x where x.id = p_session_id;
  if not found then
    perform private.fail('session_not_found');
  end if;
  perform private.host_require(s.program_id, v_uid);
  return query
  with people as (
    select t.*,
           case when t.status in ('confirmed', 'checked_in') then 'in'
                when t.status = 'waitlisted' then 'waitlist'
                else 'dropped' end as sect
    from public.attendance t
    where t.activity_id = s.activity_id and not authz.is_blocked(t.user_id, v_uid)
      -- Dropped = left after being in (not people who only left the waitlist).
      and (t.status <> 'cancelled' or exists (
        select 1 from public.host_session_log l
        where l.session_id = s.id and l.user_id = t.user_id and l.kind = 'dropped'))
  )
  select pp.sect,
         case when pp.status = 'waitlisted' then (
           select count(*)::integer from public.attendance w
           where w.activity_id = s.activity_id and w.status = 'waitlisted'
             and (w.waitlisted_at, w.user_id) <= (pp.waitlisted_at, pp.user_id)) end,
         pp.user_id, pr.display_name, pr.avatar_path,
         authz.is_program_host(s.program_id, pp.user_id),
         authz.is_program_member(s.program_id, pp.user_id),
         pp.status, pp.team,
         not private.host_has_played(s.program_id, pp.user_id, s.starts_at),
         private.true_count(l12.cells), cardinality(l12.cells),
         (select extract(isodow from (s2.starts_at at time zone p.time_zone))::smallint
            from public.host_sessions s2 join public.attendance t2 on t2.activity_id = s2.activity_id
           where s2.program_id = s.program_id and t2.user_id = pp.user_id and t2.status = 'checked_in'
           group by 1 order by count(*) desc, 1 limit 1),
         (select min(l.created_at) from public.host_session_log l
           where l.session_id = s.id and l.user_id = pp.user_id and l.kind in ('joined', 'waitlisted', 'promoted')),
         pp.waitlisted_at,
         (select max(l.created_at) from public.host_session_log l
           where l.session_id = s.id and l.user_id = pp.user_id and l.kind = 'promoted'),
         pp.checked_in_at, pp.check_in_method,
         r.decided_at, r.approved_via,
         case when pp.sect = 'dropped' then pp.cancelled_at end,
         d.related_user_id,
         (select pr2.display_name from public.profiles pr2 where pr2.id = d.related_user_id
            and not authz.is_blocked(pr2.id, v_uid)),
         (select min(l.created_at) from public.host_session_log l
           where l.session_id = s.id and l.user_id = d.related_user_id and l.kind = 'promoted'
             and l.created_at >= d.created_at),
         (pay).status, (pay).label, (pay).amount_cents, (pay).detail
  from people pp
  join public.profiles pr on pr.id = pp.user_id
  join public.host_programs p on p.id = s.program_id
  left join public.host_join_requests r on r.session_id = s.id and r.user_id = pp.user_id and r.status = 'approved'
  left join lateral (
    select l.related_user_id, l.created_at from public.host_session_log l
    where l.session_id = s.id and l.user_id = pp.user_id and l.kind = 'dropped'
    order by l.id desc limit 1
  ) d on pp.sect = 'dropped'
  cross join lateral (select private.host_last12(s.program_id, pp.user_id) as cells) l12
  cross join lateral (select private.host_payment_for(s.id, pp.user_id) as pay) py
  order by case pp.sect when 'in' then 0 when 'waitlist' then 1 else 2 end,
           authz.is_program_host(s.program_id, pp.user_id) desc,
           (pp.waitlisted_at, pp.user_id),
           pp.confirmed_at, pp.cancelled_at desc;
end;
$$;

-- CHECK-IN by any host of the program (Slice 01 host_check_in is the activity host only).
create or replace function public.host_session_check_in(p_session_id uuid, p_user_id uuid)
returns public.attendance_state
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  s public.host_sessions%rowtype;
  v_a public.activities%rowtype;
  v_cur public.attendance_status;
begin
  s := private.host_session_for_host(p_session_id, v_uid);
  select * into v_a from public.activities where id = s.activity_id for update;
  if now() < v_a.check_in_opens_at then
    perform private.fail('check_in_not_open', v_a.check_in_opens_at::text);
  end if;
  if private.activity_status_now(v_a) in ('complete', 'cancelled') then
    perform private.fail('check_in_closed');
  end if;
  select t.status into v_cur from public.attendance t where t.activity_id = v_a.id and t.user_id = p_user_id;
  if v_cur = 'checked_in' then
    return private.attendance_state_of(v_a.id, p_user_id, false);
  end if;
  if v_cur is distinct from 'confirmed' then
    perform private.fail('not_attending');
  end if;
  update public.attendance set status = 'checked_in', checked_in_at = now(), check_in_method = 'host'
   where activity_id = v_a.id and user_id = p_user_id;
  update public.activities set checked_in_count = checked_in_count + 1 where id = v_a.id;
  perform private.emit('host_checked_in', v_uid,
    jsonb_build_object('session_id', p_session_id, 'activity_id', v_a.id));
  return private.attendance_state_of(v_a.id, p_user_id, true);
end;
$$;

-- The host chooses who's in from the waitlist (any time before kick-off; after the cutoff this is
-- the only way in). Needs a free spot: ADD A SPOT first when full.
create or replace function public.promote_from_waitlist(p_session_id uuid, p_user_id uuid, p_idempotency_key uuid)
returns public.attendance_state
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  s public.host_sessions%rowtype;
  v_a public.activities%rowtype;
  v_cur public.attendance_status;
  v_state public.attendance_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'promote_from_waitlist:' || p_session_id || ':' || p_user_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.attendance_state, v_prior);
  end if;
  s := private.host_session_for_host(p_session_id, v_uid);
  select * into v_a from public.activities where id = s.activity_id for update;
  select t.status into v_cur from public.attendance t where t.activity_id = v_a.id and t.user_id = p_user_id;
  if v_cur in ('confirmed', 'checked_in') then
    v_state := private.attendance_state_of(v_a.id, p_user_id, false);
  else
    if v_cur is distinct from 'waitlisted' then
      perform private.fail('not_waitlisted');
    end if;
    if private.activity_status_now(v_a) <> 'confirmed' then
      perform private.fail('activity_started');
    end if;
    if v_a.confirmed_count >= v_a.capacity then
      perform private.fail('session_full');
    end if;
    perform private.promote_waitlisted(v_a.id, p_user_id);
    perform private.emit('host_waitlist_promoted', v_uid,
      jsonb_build_object('session_id', p_session_id, 'by_host', true));
    v_state := private.attendance_state_of(v_a.id, p_user_id, true, p_user_id);
  end if;
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- REORDER: p_user_ids is the whole waitlist in the new order.
create or replace function public.reorder_waitlist(p_session_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  s public.host_sessions%rowtype;
  v_base timestamptz;
  v_current uuid[];
begin
  s := private.host_session_for_host(p_session_id, v_uid);
  perform 1 from public.activities where id = s.activity_id for update;
  select coalesce(array_agg(t.user_id order by t.user_id), '{}'), min(t.waitlisted_at) into v_current, v_base
  from public.attendance t where t.activity_id = s.activity_id and t.status = 'waitlisted';
  if p_user_ids is null or cardinality(p_user_ids) <> cardinality(v_current)
     or (select array_agg(x order by x) from (select distinct unnest(p_user_ids) x) q) is distinct from v_current then
    perform private.fail('invalid_argument', 'user_ids');
  end if;
  if cardinality(v_current) = 0 then
    return 0;
  end if;
  update public.attendance t
     set waitlisted_at = v_base + make_interval(secs => (o.ord - 1) / 1000.0)
    from unnest(p_user_ids) with ordinality as o(user_id, ord)
   where t.activity_id = s.activity_id and t.user_id = o.user_id;
  insert into public.host_session_log (session_id, kind, actor_id, data)
  values (p_session_id, 'reordered', v_uid, jsonb_build_object('order', to_jsonb(p_user_ids)));
  return cardinality(p_user_ids);
end;
$$;

-- ADD A SPOT (this session only). Before the cutoff the waitlist fills it straight away.
create or replace function public.add_session_spot(p_session_id uuid, p_idempotency_key uuid)
returns public.attendance_state
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  s public.host_sessions%rowtype;
  v_a public.activities%rowtype;
  v_promoted uuid;
  v_state public.attendance_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'add_session_spot:' || p_session_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.attendance_state, v_prior);
  end if;
  s := private.host_session_for_host(p_session_id, v_uid);
  select * into v_a from public.activities where id = s.activity_id for update;
  if private.activity_status_now(v_a) <> 'confirmed' then
    perform private.fail('activity_started');
  end if;
  if v_a.capacity >= 100 then
    perform private.fail('capacity_invalid', '2-100');
  end if;
  update public.activities set capacity = capacity + 1 where id = v_a.id;
  update public.plans set capacity = capacity + 1 where id = s.plan_id;
  insert into public.host_session_log (session_id, kind, actor_id, data)
  values (p_session_id, 'spot_added', v_uid, jsonb_build_object('capacity', v_a.capacity + 1));
  if private.waitlist_fills_itself(v_a.id) then
    v_promoted := private.first_waitlisted(v_a.id);
    if v_promoted is not null then
      perform private.promote_waitlisted(v_a.id, v_promoted);
    end if;
  end if;
  perform private.emit('host_spot_added', v_uid, jsonb_build_object('session_id', p_session_id));
  v_state := private.attendance_state_of(v_a.id, v_uid, true, v_promoted);
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- Join requests -------------------------------------------------------------------------------------------------

-- Ask to join a session that needs approval. If no approval is needed (or a rule lets them straight
-- in) this joins like join_waitlist. A declined request stays declined (quiet: no reason given).
create or replace function public.ask_to_join(p_session_id uuid, p_note text, p_idempotency_key uuid)
returns public.host_join_state
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  s public.host_sessions%rowtype;
  v_a public.activities%rowtype;
  v_req public.host_join_requests%rowtype;
  v_member boolean;
  v_state public.host_join_state;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'ask_to_join:' || p_session_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.host_join_state, v_prior);
  end if;
  select * into s from public.host_sessions where id = p_session_id;
  if not found or not authz.can_see_activity(s.activity_id, v_uid) then
    perform private.fail('session_not_found');
  end if;
  if v_note is not null and char_length(v_note) > 280 then
    perform private.fail('invalid_argument', 'note');
  end if;
  select * into v_a from public.activities where id = s.activity_id for update;

  if exists (select 1 from public.attendance t where t.activity_id = s.activity_id and t.user_id = v_uid
             and t.status in ('confirmed', 'checked_in', 'waitlisted')) then
    v_state := private.host_join_state_of(p_session_id, v_uid, false);
  elsif not s.approval_required or private.host_auto_approval(s.program_id, v_uid) is not null
        or exists (select 1 from public.host_join_requests r
                   where r.session_id = s.id and r.user_id = v_uid and r.status = 'approved') then
    perform private.host_join(p_session_id, v_uid, v_uid);
    v_state := private.host_join_state_of(p_session_id, v_uid, true);
  else
    select * into v_req from public.host_join_requests r where r.session_id = s.id and r.user_id = v_uid;
    if v_req.status in ('pending', 'declined') then
      v_state := private.host_join_state_of(p_session_id, v_uid, false);
    else
      if s.status = 'skipped' then
        perform private.fail('session_skipped');
      end if;
      if private.activity_status_now(v_a) <> 'confirmed' then
        perform private.fail('activity_started');
      end if;
      if exists (select 1 from public.host_program_hosts h
                 where h.program_id = s.program_id and authz.is_blocked(h.user_id, v_uid)) then
        perform private.fail('session_not_found');
      end if;
      v_member := authz.is_program_member(s.program_id, v_uid);
      if now() < s.members_open_at or (now() < s.opens_at and not (s.members_first and v_member)) then
        perform private.fail('joining_not_open', s.opens_at::text);
      end if;
      insert into public.host_join_requests (session_id, user_id, note, status)
      values (s.id, v_uid, v_note, 'pending')
      on conflict (session_id, user_id) do update
        set note = excluded.note, status = 'pending', decided_at = null, decided_by = null,
            approved_via = null, created_at = now();
      perform private.notify(
        (select array_agg(h.user_id) from public.host_program_hosts h where h.program_id = s.program_id),
        'host_request', 'activity', s.activity_id, v_uid, 'host_request:' || s.id,
        jsonb_build_object('session_id', s.id), p_activity => s.activity_id, p_plan => s.plan_id);
      perform private.emit('host_join_requested', v_uid,
        jsonb_build_object('session_id', s.id, 'program_id', s.program_id, 'has_note', v_note is not null));
      v_state := private.host_join_state_of(p_session_id, v_uid, true);
    end if;
  end if;
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

create or replace function public.withdraw_join_request(p_session_id uuid)
returns public.host_join_state
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
begin
  update public.host_join_requests set status = 'withdrawn'
   where session_id = p_session_id and user_id = v_uid and status = 'pending';
  return private.host_join_state_of(p_session_id, v_uid, found);
end;
$$;

-- Requests with Ojoro history. Area only (never an address); distance is the person's coarse home
-- area (0.01°) to the place, rounded to whole km.
create or replace function public.session_requests(p_session_id uuid, p_include_decided boolean default true)
returns table (
  request_id uuid,
  user_id uuid,
  display_name text,
  avatar_path text,
  area text,
  distance_km integer,
  id_verified boolean,
  new_to_ojoro boolean,
  ojoro_games integer,
  showed_up integer,
  show_up_of integer,
  note text,
  shared_names text[],
  shared_count integer,
  status public.host_request_status,
  approved_via public.host_approved_via,
  decided_at timestamptz,
  undo_until timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  s public.host_sessions%rowtype;
begin
  select * into s from public.host_sessions x where x.id = p_session_id;
  if not found then
    perform private.fail('session_not_found');
  end if;
  perform private.host_require(s.program_id, v_uid);
  return query
  select r.id, r.user_id, pr.display_name, pr.avatar_path, pr.area,
         (select greatest(1, round(private.distance_m(pp.area_lat::double precision, pp.area_lng::double precision,
                                                       pl.lat, pl.lng) / 1000))::integer
            from public.profile_private pp, public.places pl
           where pp.user_id = r.user_id and pp.area_lat is not null and pl.id = a.place_id),
         false,
         pr.created_at > now() - interval '14 days',
         private.ojoro_games(r.user_id),
         (select count(*)::integer from public.attendance t join public.activities x on x.id = t.activity_id
           where t.user_id = r.user_id and t.status = 'checked_in'),
         (select count(*)::integer from public.attendance t join public.activities x on x.id = t.activity_id
           where t.user_id = r.user_id and x.status <> 'cancelled' and x.ends_at <= now()
             and t.status in ('checked_in', 'confirmed')),
         r.note,
         sh.names[1:3], coalesce(cardinality(sh.names), 0),
         r.status, r.approved_via, r.decided_at,
         case when r.decided_at is not null then r.decided_at + make_interval(mins => private.host_undo_minutes()) end,
         r.created_at
  from public.host_join_requests r
  join public.profiles pr on pr.id = r.user_id
  join public.activities a on a.id = s.activity_id
  cross join lateral (
    select array_agg(c.display_name order by c.display_name) as names
    from public.profiles c
    where c.id not in (r.user_id, v_uid)
      and not authz.is_blocked(c.id, v_uid) and not authz.is_blocked(c.id, r.user_id)
      and authz.connected(c.id, v_uid) and authz.connected(c.id, r.user_id)
  ) sh
  where r.session_id = p_session_id and not authz.is_blocked(r.user_id, v_uid)
    and (r.status = 'pending' or (p_include_decided and r.status in ('approved', 'declined')))
  order by (r.status <> 'pending'), r.created_at;
end;
$$;

-- APPROVE / DECLINE. Approving puts them in (or on the waitlist when full). Declining is quiet: they
-- are told the host couldn't take them this time, never why.
create or replace function public.decide_join_request(p_request_id uuid, p_approve boolean, p_idempotency_key uuid)
returns public.host_join_state
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_req public.host_join_requests%rowtype;
  s public.host_sessions%rowtype;
  v_state public.host_join_state;
  v_target public.host_request_status := case when p_approve then 'approved' else 'declined' end;
begin
  if p_approve is null then
    perform private.fail('invalid_argument', 'approve');
  end if;
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'decide_join_request:' || p_request_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.host_join_state, v_prior);
  end if;
  select * into v_req from public.host_join_requests where id = p_request_id for update;
  if not found then
    perform private.fail('request_not_found');
  end if;
  s := private.host_session_for_host(v_req.session_id, v_uid);
  if v_req.status = v_target then
    v_state := private.host_join_state_of(s.id, v_req.user_id, false);
  elsif v_req.status <> 'pending' then
    perform private.fail('request_decided', v_req.status::text);
  else
    perform 1 from public.activities where id = s.activity_id for update;
    update public.host_join_requests
       set status = v_target, decided_at = now(), decided_by = v_uid,
           approved_via = case when p_approve then 'host'::public.host_approved_via end
     where id = p_request_id;
    if p_approve then
      perform private.host_join(s.id, v_req.user_id, v_uid);
    end if;
    perform private.notify(array[v_req.user_id], 'host_update', 'activity', s.activity_id, null,
      'host_request_answer:' || p_request_id,
      jsonb_build_object('change', case when p_approve then 'request_approved' else 'request_declined' end,
                         'session_id', s.id),
      p_activity => s.activity_id, p_plan => s.plan_id);
    perform private.emit('host_join_decided', v_uid,
      jsonb_build_object('session_id', s.id, 'approved', p_approve));
    v_state := private.host_join_state_of(s.id, v_req.user_id, true);
  end if;
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- UNDO within private.host_undo_minutes() (10). An approval is taken back (their spot or waitlist
-- place goes, unless they've already checked in); the request is pending again.
create or replace function public.undo_join_decision(p_request_id uuid)
returns public.host_join_state
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_req public.host_join_requests%rowtype;
  s public.host_sessions%rowtype;
  v_cur public.attendance_status;
begin
  select * into v_req from public.host_join_requests where id = p_request_id for update;
  if not found then
    perform private.fail('request_not_found');
  end if;
  s := private.host_session_for_host(v_req.session_id, v_uid);
  if v_req.status = 'pending' then
    return private.host_join_state_of(s.id, v_req.user_id, false);
  end if;
  if v_req.status not in ('approved', 'declined') or v_req.approved_via is distinct from
       (case when v_req.status = 'approved' then 'host'::public.host_approved_via end)
     or v_req.decided_at < now() - make_interval(mins => private.host_undo_minutes()) then
    perform private.fail('undo_expired');
  end if;
  perform 1 from public.activities where id = s.activity_id for update;
  if v_req.status = 'approved' then
    select t.status into v_cur from public.attendance t where t.activity_id = s.activity_id and t.user_id = v_req.user_id;
    if v_cur = 'checked_in' then
      perform private.fail('undo_expired');
    end if;
    perform private.drop_attendance(s.activity_id, v_req.user_id);
  end if;
  update public.host_join_requests
     set status = 'pending', decided_at = null, decided_by = null, approved_via = null
   where id = p_request_id;
  -- The answer they haven't opened yet is taken back with it.
  delete from public.notifications
   where recipient_id = v_req.user_id and bundle_key = 'host_request_answer:' || p_request_id and read_at is null;
  return private.host_join_state_of(s.id, v_req.user_id, true);
end;
$$;

-- People CRM ---------------------------------------------------------------------------------------------------

-- Everyone this program knows: people who have checked in to its sessions, and members.
create or replace function private.host_people_rows(p_program uuid, p_viewer uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_path text,
  days smallint[],
  last12 boolean[],
  sessions_total integer,
  first_came_at timestamptz,
  last_came_at timestamptz,
  no_shows integer,
  came_30d integer,
  is_member boolean,
  is_regular boolean,
  is_new boolean,
  is_drifting boolean,
  tags text[],
  invited_back_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with facts as (select * from private.host_person_facts(p_program)),
  ids as (
    select f.user_id from facts f where f.sessions_total > 0
    union
    select m.user_id from public.host_program_members m
    where m.program_id = p_program and m.started_at <= now() and (m.ends_at is null or m.ends_at > now())
  )
  select i.user_id, pr.display_name, pr.avatar_path,
         coalesce(f.days, '{}'), private.host_last12(p_program, i.user_id),
         coalesce(f.sessions_total, 0), f.first_came_at, f.last_came_at, coalesce(f.no_shows, 0),
         coalesce(f.came_30d, 0),
         authz.is_program_member(p_program, i.user_id),
         coalesce(f.came_30d, 0) >= 2,
         f.first_came_at > now() - interval '30 days',
         coalesce(f.sessions_total, 0) >= 3 and f.last_came_at < now() - interval '21 days',
         coalesce(hp.tags, '{}'), hp.invited_back_at
  from ids i
  join public.profiles pr on pr.id = i.user_id
  left join facts f on f.user_id = i.user_id
  left join public.host_people hp on hp.program_id = p_program and hp.user_id = i.user_id
  where not authz.is_blocked(i.user_id, p_viewer) and not authz.is_program_host(p_program, i.user_id);
$$;

create or replace function public.host_people_counts(p_program_id uuid)
returns table (
  all_count integer,
  played_count integer,
  regulars integer,
  members integer,
  new_count integer,
  drifting integer
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
  perform private.host_require(p_program_id, v_uid);
  return query
  select count(*)::integer,
         count(*) filter (where r.sessions_total > 0)::integer,
         count(*) filter (where r.is_regular)::integer,
         count(*) filter (where r.is_member)::integer,
         count(*) filter (where r.is_new)::integer,
         count(*) filter (where r.is_drifting)::integer
  from private.host_people_rows(p_program_id, v_uid) r;
end;
$$;

-- p_filter: 'all' | 'regulars' | 'members' | 'new' | 'drifting'. p_query matches name or tag
-- (case and accents ignored). Most-attending first.
create or replace function public.host_people(p_program_id uuid, p_filter text default 'all', p_query text default null)
returns table (
  user_id uuid,
  display_name text,
  avatar_path text,
  days smallint[],
  last12_count integer,
  last12_total integer,
  sessions_total integer,
  first_came_at timestamptz,
  last_came_at timestamptz,
  is_member boolean,
  is_regular boolean,
  is_new boolean,
  is_drifting boolean,
  tags text[],
  invited_back_at timestamptz,
  pass_kind text,
  pass_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_q text := nullif(private.fold(btrim(coalesce(p_query, ''))), '');
begin
  perform private.host_require(p_program_id, v_uid);
  if coalesce(p_filter, 'all') not in ('all', 'regulars', 'members', 'new', 'drifting') then
    perform private.fail('invalid_argument', 'filter');
  end if;
  return query
  select r.user_id, r.display_name, r.avatar_path, r.days, private.true_count(r.last12), cardinality(r.last12),
         r.sessions_total, r.first_came_at, r.last_came_at, r.is_member, r.is_regular, r.is_new, r.is_drifting,
         r.tags, r.invited_back_at, (ps).kind, (ps).label
  from private.host_people_rows(p_program_id, v_uid) r
  cross join lateral (select private.host_person_pass(p_program_id, r.user_id) as ps) x
  where case coalesce(p_filter, 'all')
          when 'regulars' then r.is_regular
          when 'members' then r.is_member
          when 'new' then r.is_new
          when 'drifting' then r.is_drifting
          else true end
    and (v_q is null or private.fold(r.display_name) like '%' || v_q || '%'
         or exists (select 1 from unnest(r.tags) tg where private.fold(tg) like '%' || v_q || '%'))
  order by private.true_count(r.last12) desc, r.sessions_total desc, r.display_name, r.user_id;
end;
$$;

-- One person, expanded. Notes are the caller's own (host-only, never shown to them or other hosts).
create or replace function public.host_person(p_program_id uuid, p_user_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_path text,
  area text,
  days smallint[],
  last12 boolean[],
  sessions_total integer,
  first_came_at timestamptz,
  last_came_at timestamptz,
  no_shows integer,
  is_member boolean,
  member_since timestamptz,
  member_until timestamptz,
  is_regular boolean,
  is_new boolean,
  is_drifting boolean,
  tags text[],
  my_note text,
  pass_kind text,
  pass_label text,
  pass_renews_on date,
  pass_sessions_left integer
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
  perform private.host_require(p_program_id, v_uid);
  return query
  select r.user_id, r.display_name, r.avatar_path, pr.area, r.days, r.last12, r.sessions_total,
         r.first_came_at, r.last_came_at, r.no_shows, r.is_member, m.started_at, m.ends_at,
         r.is_regular, r.is_new, r.is_drifting, r.tags,
         (select n.body from public.host_person_notes n
           where n.program_id = p_program_id and n.user_id = r.user_id and n.author_id = v_uid),
         (ps).kind, (ps).label, (ps).renews_on, (ps).sessions_left
  from private.host_people_rows(p_program_id, v_uid) r
  join public.profiles pr on pr.id = r.user_id
  left join public.host_program_members m on m.program_id = p_program_id and m.user_id = r.user_id
  cross join lateral (select private.host_person_pass(p_program_id, r.user_id) as ps) x
  where r.user_id = p_user_id;
  if not found then
    perform private.fail('person_not_found');
  end if;
end;
$$;

-- Someone this program knows (came, member, asked, or on a roster), for tags and notes.
create or replace function private.host_knows(p_program uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.host_people hp where hp.program_id = p_program and hp.user_id = p_user)
      or exists (select 1 from public.host_program_members m where m.program_id = p_program and m.user_id = p_user)
      or exists (select 1 from public.host_join_requests r join public.host_sessions s on s.id = r.session_id
                 where s.program_id = p_program and r.user_id = p_user);
$$;

-- Tags: lowercase, 1–24 characters (letters, digits, space, hyphen), at most 8. Replaces the list.
create or replace function public.set_person_tags(p_program_id uuid, p_user_id uuid, p_tags text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_tags text[];
begin
  perform private.host_require(p_program_id, v_uid);
  if not private.host_knows(p_program_id, p_user_id) or authz.is_blocked(p_user_id, v_uid) then
    perform private.fail('person_not_found');
  end if;
  select coalesce(array_agg(distinct t order by t), '{}') into v_tags
  from (select lower(btrim(x)) as t from unnest(coalesce(p_tags, '{}')) x) q where t <> '';
  if cardinality(v_tags) > 8 or exists (select 1 from unnest(v_tags) t where t !~ '^[[:alnum:] -]{1,24}$') then
    perform private.fail('tag_invalid');
  end if;
  insert into public.host_people (program_id, user_id, tags) values (p_program_id, p_user_id, v_tags)
  on conflict (program_id, user_id) do update set tags = excluded.tags;
  perform private.emit('host_tags_set', v_uid, jsonb_build_object('program_id', p_program_id, 'count', cardinality(v_tags)));
  return v_tags;
end;
$$;

-- YOUR NOTES. Empty clears it.
create or replace function public.set_person_note(p_program_id uuid, p_user_id uuid, p_body text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  perform private.host_require(p_program_id, v_uid);
  if not private.host_knows(p_program_id, p_user_id) or authz.is_blocked(p_user_id, v_uid) then
    perform private.fail('person_not_found');
  end if;
  if v_body is not null and char_length(v_body) > 1000 then
    perform private.fail('invalid_argument', 'body');
  end if;
  if v_body is null then
    delete from public.host_person_notes
     where program_id = p_program_id and user_id = p_user_id and author_id = v_uid;
  else
    insert into public.host_person_notes (program_id, user_id, author_id, body)
    values (p_program_id, p_user_id, v_uid, v_body)
    on conflict (program_id, user_id, author_id) do update set body = excluded.body;
  end if;
  perform private.emit('host_note_saved', v_uid, jsonb_build_object('program_id', p_program_id, 'cleared', v_body is null));
  return v_body;
end;
$$;

-- INVITE THEM BACK: a nudge to one upcoming session. No streaks, no guilt, just the invite. Each
-- person at most once a week; people already in or waiting, blocked, or not drifting/known are skipped.
-- p_user_ids null = everyone currently drifting.
create or replace function public.invite_back(p_program_id uuid, p_session_id uuid, p_user_ids uuid[] default null)
returns table (sent integer, skipped integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  s public.host_sessions%rowtype;
  v_targets uuid[];
  v_ok uuid[];
begin
  perform private.host_require(p_program_id, v_uid);
  select * into s from public.host_sessions x where x.id = p_session_id and x.program_id = p_program_id;
  if not found or s.status <> 'scheduled' or s.starts_at <= now() then
    perform private.fail('session_not_found');
  end if;
  if p_user_ids is null then
    select coalesce(array_agg(r.user_id), '{}') into v_targets
    from private.host_people_rows(p_program_id, v_uid) r where r.is_drifting;
  else
    v_targets := p_user_ids;
  end if;
  select coalesce(array_agg(t), '{}') into v_ok
  from (select distinct unnest(v_targets) t) q
  where private.host_knows(p_program_id, t)
    and not authz.is_blocked(t, v_uid)
    and not exists (select 1 from public.host_people hp where hp.program_id = p_program_id and hp.user_id = t
                    and hp.invited_back_at > now() - interval '7 days')
    and not exists (select 1 from public.attendance a where a.activity_id = s.activity_id and a.user_id = t
                    and a.status in ('confirmed', 'checked_in', 'waitlisted'));
  perform private.notify(v_ok, 'host_update', 'activity', s.activity_id, v_uid, 'host_invite_back:' || s.id,
    jsonb_build_object('change', 'invite_back', 'session_id', s.id), p_activity => s.activity_id, p_plan => s.plan_id);
  update public.host_people set invited_back_at = now() where program_id = p_program_id and user_id = any (v_ok);
  perform private.emit('host_invite_back_sent', v_uid,
    jsonb_build_object('program_id', p_program_id, 'session_id', s.id, 'sent', cardinality(v_ok)));
  return query select cardinality(v_ok), cardinality(v_targets) - cardinality(v_ok);
end;
$$;

-- Announcements ------------------------------------------------------------------------------------------------

-- Recipients for a session announcement, the author included (they see it pinned too).
create or replace function private.host_recipients(p_session uuid, p_audiences public.host_audience[], p_author uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select * from public.host_sessions where id = p_session),
  pool as (
    select t.user_id from s join public.attendance t on t.activity_id = s.activity_id
    where 'session' = any (p_audiences) and t.status in ('confirmed', 'checked_in')
    union
    select t.user_id from s join public.attendance t on t.activity_id = s.activity_id
    where 'waitlist' = any (p_audiences) and t.status = 'waitlisted'
    union
    select m.user_id from s join public.host_program_members m on m.program_id = s.program_id
    where 'members' = any (p_audiences) and m.started_at <= now() and (m.ends_at is null or m.ends_at > now())
    union
    select f.user_id from s cross join lateral private.host_person_facts(s.program_id) f
    where 'everyone' = any (p_audiences) and f.sessions_total > 0
    union
    select m.user_id from s join public.host_program_members m on m.program_id = s.program_id
    where 'everyone' = any (p_audiences) and m.started_at <= now() and (m.ends_at is null or m.ends_at > now())
  )
  select coalesce(array_agg(distinct p.user_id), '{}')
  from pool p
  where p.user_id = p_author or not authz.is_blocked(p.user_id, p_author);
$$;

-- TO: counts per audience (and how many pushes are left for this session) for the compose screen.
create or replace function public.announce_context(p_session_id uuid)
returns table (
  session_id uuid,
  program_id uuid,
  activity_id uuid,
  session_name text,
  starts_at timestamptz,
  time_zone text,
  author_name text,
  session_count integer,
  waitlist_count integer,
  members_count integer,
  everyone_count integer,
  pushes_used integer,
  pushes_left integer,
  max_length integer,
  chat_new_today integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  s public.host_sessions%rowtype;
  v_used integer;
begin
  select * into s from public.host_sessions x where x.id = p_session_id;
  if not found then
    perform private.fail('session_not_found');
  end if;
  perform private.host_require(s.program_id, v_uid);
  select count(*)::integer into v_used from public.host_announcements a where a.session_id = s.id and a.notify;
  return query
  select s.id, s.program_id, s.activity_id, a.title, a.starts_at, coalesce(pl.time_zone, 'America/Toronto'),
         (select pr.display_name from public.profiles pr where pr.id = v_uid),
         cardinality(private.host_recipients(s.id, array['session']::public.host_audience[], v_uid)),
         cardinality(private.host_recipients(s.id, array['waitlist']::public.host_audience[], v_uid)),
         cardinality(private.host_recipients(s.id, array['members']::public.host_audience[], v_uid)),
         cardinality(private.host_recipients(s.id, array['everyone']::public.host_audience[], v_uid)),
         v_used, greatest(private.host_pushes_per_session() - v_used, 0), 280,
         (select count(*)::integer from public.messages m
           where m.activity_id = s.activity_id and m.deleted_at is null
             and m.created_at >= ((now() at time zone coalesce(pl.time_zone, 'America/Toronto'))::date)::timestamp
                                 at time zone coalesce(pl.time_zone, 'America/Toronto'))
  from public.activities a
  left join public.places pl on pl.id = a.place_id
  where a.id = s.activity_id;
end;
$$;

-- The live count for a multi-select ("SEND TO 17").
create or replace function public.announce_recipient_count(p_session_id uuid, p_audiences public.host_audience[])
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  s public.host_sessions%rowtype;
begin
  select * into s from public.host_sessions x where x.id = p_session_id;
  if not found then
    perform private.fail('session_not_found');
  end if;
  perform private.host_require(s.program_id, v_uid);
  return cardinality(private.host_recipients(s.id, coalesce(p_audiences, '{}'), v_uid));
end;
$$;

-- START FROM templates, worded for this session ("tonight" when it's today).
create or replace function public.announce_templates(p_session_id uuid)
returns table (key text, label text, body text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  s public.host_sessions%rowtype;
  v_place text;
  v_tz text;
  v_when text;
begin
  select * into s from public.host_sessions x where x.id = p_session_id;
  if not found then
    perform private.fail('session_not_found');
  end if;
  perform private.host_require(s.program_id, v_uid);
  select pl.name, pl.time_zone into v_place, v_tz
  from public.activities a left join public.places pl on pl.id = a.place_id where a.id = s.activity_id;
  v_tz := coalesce(v_tz, 'America/Toronto');
  v_when := case when (s.starts_at at time zone v_tz)::date = (now() at time zone v_tz)::date then 'tonight'
                 else 'on ' || to_char(s.starts_at at time zone v_tz, 'FMDay') end;
  return query values
    ('pitch_moved', 'Pitch moved',
     'Pitch moved ' || v_when || coalesce(' at ' || v_place, '') || '. Same time, look for the cones.'),
    ('running_late', 'Running late',
     'Running about 10 minutes late ' || v_when || '. Warm up and we start when I''m there.'),
    ('weather_call', 'Weather call',
     'Weather check: we''re on ' || v_when || '. Same time, same place.'),
    ('bring_kit', 'Bring kit',
     'Bring a light shirt and a dark shirt ' || v_when || '.');
end;
$$;

create type public.host_announcement_state as (
  announcement_id uuid,
  recipient_count integer,
  pinned boolean,
  notified boolean,
  pushes_left integer,
  message_id uuid
);

-- SEND. Pinned: posted in the session chat and kept at the top until the session ends (one pinned
-- at a time). Notify: a push for logistics, at most private.host_pushes_per_session() (2) per session.
create or replace function public.send_announcement(
  p_session_id uuid,
  p_audiences public.host_audience[],
  p_body text,
  p_template text default null,
  p_pin boolean default true,
  p_notify boolean default false,
  p_idempotency_key uuid default null
)
returns public.host_announcement_state
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  s public.host_sessions%rowtype;
  v_a public.activities%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_recipients uuid[];
  v_used integer;
  v_id uuid := gen_random_uuid();
  v_msg uuid;
  v_state public.host_announcement_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'send_announcement:' || p_session_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.host_announcement_state, v_prior);
  end if;
  s := private.host_session_for_host(p_session_id, v_uid);
  select * into v_a from public.activities where id = s.activity_id;
  if char_length(v_body) not between 1 and 280 then
    perform private.fail('invalid_argument', 'body');
  end if;
  if p_template is not null and p_template not in ('pitch_moved', 'running_late', 'weather_call', 'bring_kit') then
    perform private.fail('invalid_argument', 'template');
  end if;
  if p_audiences is null or cardinality(p_audiences) = 0 then
    perform private.fail('announce_no_recipients');
  end if;
  v_recipients := private.host_recipients(s.id, p_audiences, v_uid);
  if cardinality(array_remove(v_recipients, v_uid)) = 0 then
    perform private.fail('announce_no_recipients');
  end if;
  -- Serialize pushes per session so two sends can't both take the last one.
  perform 1 from public.host_sessions where id = s.id for update;
  select count(*)::integer into v_used from public.host_announcements a where a.session_id = s.id and a.notify;
  if coalesce(p_notify, false) and v_used >= private.host_pushes_per_session() then
    perform private.fail('announce_push_limit', private.host_pushes_per_session()::text);
  end if;

  if coalesce(p_pin, false) then
    update public.host_announcements set pinned = false where session_id = s.id and pinned;
    insert into public.messages (activity_id, sender_id, kind, body, payload)
    values (s.activity_id, v_uid, 'text', v_body,
            jsonb_build_object('host_announcement', v_id, 'pinned', true))
    returning id into v_msg;
  end if;

  insert into public.host_announcements (
    id, program_id, session_id, author_id, body, audiences, template, recipient_count, read_count,
    pinned, pinned_until, notify, message_id
  ) values (
    v_id, s.program_id, s.id, v_uid, v_body, (select array_agg(distinct x) from unnest(p_audiences) x),
    p_template, cardinality(v_recipients), case when v_uid = any (v_recipients) then 1 else 0 end,
    coalesce(p_pin, false), case when coalesce(p_pin, false) then v_a.ends_at end, coalesce(p_notify, false), v_msg
  );
  insert into public.host_announcement_recipients (announcement_id, user_id, read_at)
  select v_id, r, case when r = v_uid then now() end from unnest(v_recipients) r;

  if coalesce(p_notify, false) then
    perform private.notify(array_remove(v_recipients, v_uid), 'host_announcement', 'activity', s.activity_id, v_uid,
      'host_announcement:' || v_id, jsonb_build_object('announcement_id', v_id, 'session_id', s.id),
      p_activity => s.activity_id, p_plan => s.plan_id);
  end if;
  perform private.emit('host_announcement_sent', v_uid, jsonb_build_object(
    'session_id', s.id, 'program_id', s.program_id, 'recipients', cardinality(v_recipients),
    'audiences', to_jsonb(p_audiences), 'pinned', coalesce(p_pin, false), 'notified', coalesce(p_notify, false),
    'template', p_template));
  v_state := row(v_id, cardinality(v_recipients), coalesce(p_pin, false), coalesce(p_notify, false),
                 greatest(private.host_pushes_per_session() - v_used - case when p_notify then 1 else 0 end, 0),
                 v_msg)::public.host_announcement_state;
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- SENT BEFORE with read counts.
create or replace function public.host_announcement_history(p_program_id uuid, p_limit integer default 20)
returns table (
  announcement_id uuid,
  session_id uuid,
  activity_id uuid,
  session_name text,
  session_starts_at timestamptz,
  time_zone text,
  body text,
  audiences public.host_audience[],
  template text,
  created_at timestamptz,
  recipient_count integer,
  read_count integer,
  pinned boolean,
  pinned_until timestamptz,
  notify boolean
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
  perform private.host_require(p_program_id, v_uid);
  return query
  select an.id, an.session_id, s.activity_id, a.title, a.starts_at, coalesce(pl.time_zone, 'America/Toronto'),
         an.body, an.audiences, an.template, an.created_at, an.recipient_count, an.read_count,
         an.pinned and coalesce(an.pinned_until > now(), true), an.pinned_until, an.notify
  from public.host_announcements an
  left join public.host_sessions s on s.id = an.session_id
  left join public.activities a on a.id = s.activity_id
  left join public.places pl on pl.id = a.place_id
  where an.program_id = p_program_id
  order by an.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

-- A recipient read it (opened the chat, the notification or the pinned line). Idempotent.
create or replace function public.mark_announcement_read(p_announcement_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
begin
  update public.host_announcement_recipients set read_at = now()
   where announcement_id = p_announcement_id and user_id = v_uid and read_at is null;
  if found then
    update public.host_announcements set read_count = read_count + 1 where id = p_announcement_id;
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.unpin_announcement(p_announcement_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_prog uuid;
begin
  select a.program_id into v_prog from public.host_announcements a where a.id = p_announcement_id;
  if v_prog is null then
    perform private.fail('announcement_not_found');
  end if;
  perform private.host_require(v_prog, v_uid);
  update public.host_announcements set pinned = false where id = p_announcement_id and pinned;
  return found;
end;
$$;

-- The pinned line at the top of a session chat ("PINNED · FROM ADE, YOUR HOST"). Anyone who can read
-- the activity chat (participants and the host), plus recipients.
create or replace function public.session_pinned_announcement(p_activity_id uuid)
returns table (
  announcement_id uuid,
  message_id uuid,
  body text,
  author_id uuid,
  author_name text,
  created_at timestamptz,
  pinned_until timestamptz,
  session_name text,
  starts_at timestamptz,
  time_zone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select an.id, an.message_id, an.body, an.author_id, pr.display_name, an.created_at, an.pinned_until,
         a.title, a.starts_at, coalesce(pl.time_zone, 'America/Toronto')
  from public.host_sessions s
  join public.host_announcements an on an.session_id = s.id
  join public.activities a on a.id = s.activity_id
  join public.profiles pr on pr.id = an.author_id
  left join public.places pl on pl.id = a.place_id
  where s.activity_id = p_activity_id and an.pinned and coalesce(an.pinned_until > now(), true)
    and auth.uid() is not null
    and (authz.is_participant(p_activity_id, auth.uid()) or authz.is_program_host(s.program_id, auth.uid())
         or authz.is_announcement_recipient(an.id, auth.uid()))
    and not authz.is_blocked(an.author_id, auth.uid())
  order by an.created_at desc
  limit 1;
$$;

-- Time: generate sessions ahead (hourly) ------------------------------------------------------------------------

create or replace function private.host_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_series uuid;
  v_n integer := 0;
begin
  for v_series in
    select s.id from public.host_series s
    join public.host_programs p on p.id = s.program_id
    where s.ended_at is null and p.archived_at is null
      and (s.until_on is null or s.until_on >= current_date - 1)
  loop
    v_n := v_n + private.host_materialize_series(v_series);
  end loop;
  return jsonb_build_object('sessions_created', v_n);
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('ojoro_host_tick', '17 * * * *', 'select private.host_tick()');
  else
    raise notice 'pg_cron not available: call private.host_tick() hourly from a scheduler';
  end if;
end;
$$;

-- Privileges --------------------------------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
grant execute on function private.host_tick() to service_role;

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
