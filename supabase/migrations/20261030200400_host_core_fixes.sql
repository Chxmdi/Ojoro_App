-- Step 6 (Host OS core) fixes after the first seed run:
--   * session_roster: IN is ordered by when people got in (hosts first), WAITLIST by position.
--   * Drifting means a regular who stopped coming (2+ visits in the 30 days up to their last one,
--     none for 3 weeks), not anyone with 3 visits who hasn't been back.
-- Contract: docs/HOSTS_CONTRACT.md.

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
         -- Drifting: was a regular (2+ visits in the 30 days up to their last one) and hasn't been in
         -- for 3 weeks or more. Occasional players aren't nagged.
         coalesce(f.sessions_total, 0) >= 3 and f.last_came_at < now() - interval '21 days'
           and (select count(*) from public.host_sessions s2
                join public.attendance t2 on t2.activity_id = s2.activity_id
                where s2.program_id = p_program and t2.user_id = i.user_id and t2.status = 'checked_in'
                  and s2.starts_at > f.last_came_at - interval '30 days') >= 2,
         coalesce(hp.tags, '{}'), hp.invited_back_at
  from ids i
  join public.profiles pr on pr.id = i.user_id
  left join facts f on f.user_id = i.user_id
  left join public.host_people hp on hp.program_id = p_program and hp.user_id = i.user_id
  where not authz.is_blocked(i.user_id, p_viewer) and not authz.is_program_host(p_program, i.user_id);
$$;

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
           case when pp.sect = 'waitlist' then pp.waitlisted_at end,
           case when pp.sect = 'in' then pp.confirmed_at end,
           pp.cancelled_at desc, pp.user_id;
end;
$$;
