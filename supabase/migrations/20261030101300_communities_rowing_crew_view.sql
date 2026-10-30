-- Step 6 (Communities), owner decisions:
--   1. Rowing joins the sports list (the Clash's "Rowing erg · 2 km team").
--   2. Step 4's crew_view.free_tonight uses the same rule as crew_home / crew_free_tonight
--      (20261030100800): crew mates sharing availability with "crews" count, "friends" needs a game
--      together, "only me" never, never across a block. The two never disagree.

insert into public.sports (id, name, family, default_capacity, default_duration_minutes, team_based, sort_order)
values ('rowing', 'Rowing', 'rowing', 4, 60, false, 100)
on conflict (id) do nothing;

create or replace function public.crew_view(p_crew_id uuid)
returns table (
  crew_id uuid, name text, sport_id text, member_count integer, my_role public.crew_role,
  free_tonight integer, time_zone text, created_at timestamptz
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
  select c.id, c.name, c.sport_id, c.member_count, authz.crew_role(c.id, v_uid),
         (select count(*)::integer from private.crew_free_tonight(c.id, v_uid)),
         c.time_zone, c.created_at
  from public.crews c where c.id = p_crew_id;
end;
$$;
