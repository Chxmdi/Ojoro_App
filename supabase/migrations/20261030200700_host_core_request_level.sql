-- Step 6 (Host OS core): the host deciding a join request sees the requester's self-declared level
-- for the session's sport (owner decision: "Says: beginner"). Only here: user_sports.level stays
-- matching-only everywhere else. Adds session_requests.stated_level (null when they set none).
-- Contract: docs/HOSTS_CONTRACT.md §HostRequests.

drop function public.session_requests(uuid, boolean);

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
  stated_level public.skill_level,
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
         (select us.level from public.user_sports us where us.user_id = r.user_id and us.sport_id = a.sport_id),
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

revoke all on function public.session_requests(uuid, boolean) from public, anon;
grant execute on function public.session_requests(uuid, boolean) to authenticated, service_role;
