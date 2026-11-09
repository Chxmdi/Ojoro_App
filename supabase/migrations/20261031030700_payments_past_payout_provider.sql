-- HostMembership's past payouts didn't say who paid them: Step 6's `past_payouts` rows have no `provider`,
-- so a week Stripe paid (host_payouts.status 'paid', provider 'stripe', written by the webhook) still read
-- NOT SENT in the app, which says PAID only when Stripe paid the week. Each past payout now carries
-- `provider` ('none' / 'stripe') and `provider_ref` (Stripe's po_…, or null). Everything else as
-- 20261031030400_payments_queue.sql.

create or replace function public.host_money_view(p_program_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_base jsonb;
  v_account jsonb;
begin
  v_base := private.host_money_view_base(p_program_id);
  v_account := private.payments_account_json(p_program_id, v_uid);
  if jsonb_typeof(v_base -> 'past_payouts') = 'array' then
    v_base := jsonb_set(v_base, '{past_payouts}', coalesce((
      select jsonb_agg(e.payout || jsonb_build_object(
               'provider', coalesce(p.provider, 'none'), 'provider_ref', p.provider_ref) order by e.ord)
      from jsonb_array_elements(v_base -> 'past_payouts') with ordinality as e(payout, ord)
      left join public.host_payouts p on p.id = (e.payout ->> 'id')::uuid and p.program_id = p_program_id
    ), '[]'::jsonb));
  end if;
  return v_base || jsonb_build_object(
    'provider', v_account ->> 'provider',
    'payments_connected', private.payments_connected(p_program_id),
    'payment_account', v_account,
    'disputes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'charge_id', d.charge_id, 'person', private.host_person(d.user_id),
        'amount_cents', d.amount_cents, 'currency', d.currency, 'reason', d.reason, 'status', d.status,
        'opened_at', d.opened_at) order by d.opened_at desc)
      from public.host_disputes d
      where d.program_id = p_program_id and d.status = 'open'), '[]'::jsonb),
    'provider_payouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'provider_ref', x.provider_ref, 'amount_cents', x.amount_cents, 'currency', x.currency,
        'status', x.status, 'arrival_date', x.arrival_date, 'payout_id', x.payout_id) order by x.arrival_date desc)
      from (select * from public.host_provider_payouts where program_id = p_program_id
            order by arrival_date desc nulls last limit 6) x), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.host_money_view(uuid) from public, anon;
grant execute on function public.host_money_view(uuid) to authenticated, service_role;
