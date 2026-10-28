-- Integration fixes found while wiring the Slice 01 screens:
-- 1. activity_cards gains what the Activity and Check-in screens otherwise read separately: the
--    place's public centroid and time zone, and the caller's own waitlist position.
-- 2. Waitlist positions break ties the way promotion does (waitlisted_at, then user_id). People who
--    joined in the same transaction previously both counted each other.
-- 3. Calling a game off cancels its plan, so plan_cards stops reporting GAME ON for it.

-- The caller's 1-based place in the waitlist, or null when not waitlisted. Definer so a waitlisted
-- person can count the people ahead of them without being able to read who they are.
create or replace function authz.my_waitlist_position(p_activity uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(*)::integer
    from public.attendance o
    where o.activity_id = p_activity
      and o.status = 'waitlisted'
      -- Same order as promotion: waitlisted_at, then user_id for ties.
      and (o.waitlisted_at, o.user_id) <= (me.waitlisted_at, me.user_id)
  )
  from public.attendance me
  where me.activity_id = p_activity
    and me.user_id = (select auth.uid())
    and me.status = 'waitlisted';
$$;
revoke all on function authz.my_waitlist_position(uuid) from public;
grant execute on function authz.my_waitlist_position(uuid) to authenticated;

create or replace view public.activity_cards with (security_invoker = true) as
select
  a.id,
  a.plan_id,
  a.sport_id,
  s.name as sport_name,
  a.title,
  a.starts_at,
  a.ends_at,
  a.capacity,
  a.confirmed_count,
  a.waitlist_count,
  a.checked_in_count,
  a.host_id,
  a.place_id,
  pl.name as place_name,
  pl.area as place_area,
  pl.surface as place_surface,
  pl.floodlit_until as place_floodlit_until,
  a.level_label,
  a.team_a_label,
  a.team_b_label,
  a.teams_note,
  a.kit_note,
  a.cost_cents,
  a.currency,
  a.attendance_rule,
  a.check_in_opens_at,
  a.check_in_closes_at,
  a.check_in_radius_m,
  a.status,
  case
    when a.status = 'cancelled' then 'cancelled'::public.activity_status
    when a.status = 'complete' or a.after_closes_at <= now() then 'complete'::public.activity_status
    when coalesce(a.ended_at, a.ends_at) <= now() then 'after'::public.activity_status
    when coalesce(a.live_at, a.starts_at) <= now() then 'live'::public.activity_status
    else 'confirmed'::public.activity_status
  end as effective_status,
  a.live_at,
  a.ended_at,
  a.after_closes_at,
  a.cancelled_at,
  (select t.status from public.attendance t
    where t.activity_id = a.id and t.user_id = (select auth.uid())) as my_attendance,
  -- Appended columns (create or replace view can only add at the end).
  pl.lat as place_lat,
  pl.lng as place_lng,
  pl.time_zone as place_time_zone,
  authz.my_waitlist_position(a.id) as my_waitlist_position
from public.activities a
join public.sports s on s.id = a.sport_id
left join public.places pl on pl.id = a.place_id;

-- 2. The position returned by join_waitlist / cancel_attendance, same tie-break as promotion.
create or replace function private.attendance_state_of(
  p_activity uuid, p_uid uuid, p_changed boolean, p_promoted uuid default null
)
returns public.attendance_state
language sql
stable
security definer
set search_path = ''
as $$
  select row(
    a.id,
    t.status,
    case when t.status = 'waitlisted' then (
      select count(*)::integer from public.attendance w
      where w.activity_id = a.id and w.status = 'waitlisted'
        and (w.waitlisted_at, w.user_id) <= (t.waitlisted_at, t.user_id)
    ) end,
    a.confirmed_count,
    a.waitlist_count,
    a.checked_in_count,
    a.capacity,
    p_changed,
    p_promoted
  )::public.attendance_state
  from public.activities a
  left join public.attendance t on t.activity_id = a.id and t.user_id = p_uid
  where a.id = p_activity;
$$;

-- 3. Host calls the game off: the activity and its plan are both cancelled.
create or replace function public.cancel_activity(p_activity_id uuid)
returns public.activity_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_a public.activities%rowtype;
begin
  select * into v_a from public.activities where id = p_activity_id for update;
  if not found or v_a.host_id <> v_uid then
    perform private.fail('not_host');
  end if;
  if v_a.status = 'cancelled' then
    return 'cancelled'::public.activity_status;
  end if;
  if private.activity_status_now(v_a) <> 'confirmed' then
    perform private.fail('activity_started');
  end if;
  update public.activities set status = 'cancelled', cancelled_at = now() where id = p_activity_id;
  update public.plans set status = 'cancelled' where id = v_a.plan_id and status = 'game_on';
  delete from public.location_shares where activity_id = p_activity_id;
  return 'cancelled'::public.activity_status;
end;
$$;

-- Games already called off before this migration.
update public.plans p set status = 'cancelled'
where p.status = 'game_on'
  and exists (select 1 from public.activities a where a.plan_id = p.id and a.status = 'cancelled');
