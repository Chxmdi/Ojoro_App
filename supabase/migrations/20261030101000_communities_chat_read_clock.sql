-- Step 6 (Communities): the crew chat read mark uses the wall clock (messages are stamped with
-- clock_timestamp(), so a mark at the transaction start could sit before a message sent in it).

create or replace function public.mark_crew_chat_read(p_crew_id uuid, p_at timestamptz default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_at timestamptz := least(coalesce(p_at, clock_timestamp()), clock_timestamp());
begin
  if not authz.is_crew_member(p_crew_id, v_uid) then
    perform private.fail('crew_not_found');
  end if;
  insert into public.crew_chat_reads (crew_id, user_id, last_read_at) values (p_crew_id, v_uid, v_at)
  on conflict on constraint crew_chat_reads_pkey
  do update set last_read_at = greatest(public.crew_chat_reads.last_read_at, excluded.last_read_at)
  returning last_read_at into v_at;
  return v_at;
end;
$$;
