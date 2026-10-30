-- Step 6 (Host OS core): report reaches host programs (CLAUDE.md: report and block from every object).
-- Plugs 'host_program' into the communities seam private.report_subject_visible (20261030100010):
-- a program you can see (not archived, no block with its owner) can be reported. Contract:
-- docs/HOSTS_CONTRACT.md. Other kinds keep returning null ("not found").

create or replace function private.report_subject_visible(p_kind text, p_id uuid, p_viewer uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_kind = 'host_program' then
    return exists (
      select 1 from public.host_programs p
      where p.id = p_id and p.archived_at is null and not authz.is_blocked(p.created_by, p_viewer)
    );
  end if;
  return null;
end;
$$;
revoke all on function private.report_subject_visible(text, uuid, uuid) from public, anon, authenticated;
