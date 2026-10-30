-- Step 6 (Communities): FREE TONIGHT honours "crews" as the availability setting says.
--
-- Slice 01's can_see_part treats both "friends" and "crews" as "people I've played with" (crews didn't
-- exist yet). On Crew Home the viewer is a crew mate, so a crew mate whose availability is set to
-- "crews" (the default) is counted; "friends" still needs a game together; "only me" never shows.
-- Blocks always hide. Still overlap only: a name and "this evening", never a slot.

create or replace function private.crew_free_tonight(p_crew uuid, p_uid uuid)
returns table (user_id uuid, display_name text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.display_name, pr.avatar_path
  from public.crew_members m
  join public.profiles pr on pr.id = m.user_id
  left join public.privacy_settings ps on ps.user_id = m.user_id
  where m.crew_id = p_crew and m.user_id <> p_uid
    and authz.is_crew_member(p_crew, p_uid)
    and not authz.is_blocked(m.user_id, p_uid)
    and case coalesce(ps.availability_visibility, 'crews')
          when 'crews' then true
          when 'friends' then authz.connected(m.user_id, p_uid)
          else false
        end
    and exists (select 1 from public.availability_slots s
                where s.user_id = m.user_id
                  and s.day_of_week = extract(isodow from now() at time zone pr.time_zone)
                  and s.part = 'evening')
  order by pr.display_name, pr.id;
$$;
revoke all on function private.crew_free_tonight(uuid, uuid) from public, anon, authenticated;
