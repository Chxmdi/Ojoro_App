-- Step 6 BE-HOST-OPS: let a whole program or league be deleted (local seeds rebuild Plateau Pickup by
-- deleting the program). Confirmed league results and the audit trail stay insert-only for every direct
-- UPDATE or DELETE; a row may only go when its program, league or fixture is deleted (a cascade, which
-- runs the trigger one level deeper).

create or replace function private.host_ops_insert_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and (current_setting('ojoro.seed_reset', true) = 'on' or pg_trigger_depth() > 1) then
    return old;
  end if;
  raise exception using errcode = 'P0001', message = case tg_table_name
      when 'host_league_results' then 'result_already_verified' else 'audit_immutable' end,
    detail = tg_table_name || ' rows are final';
end;
$$;

revoke all on function private.host_ops_insert_only() from public, anon, authenticated;
