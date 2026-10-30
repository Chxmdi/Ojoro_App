-- Step 8 BE-PAYMENTS: the remaining Step 6 reads that said provider 'none' report the program's real
-- provider. Contract: docs/PAYMENTS_CONTRACT.md §Reads.
--   public.host_insights   + provider, payments_connected (body unchanged, moved to private.host_insights_base)
--   host_ops_audit         an automatic refund's audit row names the refund's real provider

alter function public.host_insights(uuid, integer) set schema private;
alter function private.host_insights(uuid, integer) rename to host_insights_base;

create or replace function public.host_insights(p_program_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return private.host_insights_base(p_program_id, p_days) || jsonb_build_object(
    'provider', case when exists (select 1 from public.host_payment_accounts where program_id = p_program_id)
                     then 'stripe' else 'none' end,
    'payments_connected', private.payments_connected(p_program_id));
end;
$$;

revoke all on function private.host_insights_base(uuid, integer) from public, anon, authenticated;
revoke all on function public.host_insights(uuid, integer) from public, anon;
grant execute on function public.host_insights(uuid, integer) to authenticated, service_role;

-- private.host_auto_refund (Step 6) audits refund_auto with provider 'none'; the refund row itself may
-- be a Stripe refund (payments_refund_provider). Correct the audit detail as it is written.
create or replace function private.payments_audit_provider()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.action = 'refund_auto' and new.subject_type = 'host_refund' and new.subject_id is not null then
    new.detail := new.detail || jsonb_build_object('provider',
      coalesce((select r.provider from public.host_refunds r where r.id = new.subject_id), new.detail ->> 'provider', 'none'));
  end if;
  return new;
end;
$$;

create trigger payments_audit_provider before insert on public.host_ops_audit
  for each row execute function private.payments_audit_provider();

revoke all on function private.payments_audit_provider() from public, anon, authenticated;
