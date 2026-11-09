-- Stripe sends a payout's arrival_date as midnight UTC of the arrival day. Converting it to the program's time
-- zone made it the previous evening west of UTC, so a payout never matched the week it pays and the week never
-- turned PAID. Read it as a UTC date, and let a payout that lands a few days late (weekend, bank holiday) match
-- the latest week due up to 4 days before it that no payout has claimed yet.

create or replace function private.payments_on_payout(p_account text, p_obj jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.host_payment_accounts%rowtype;
  v_arrival date;
  v_week public.host_payouts%rowtype;
  v_id uuid;
  v_status text := coalesce(p_obj ->> 'status', 'pending');
begin
  select * into v_a from public.host_payment_accounts where account_id = p_account;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_status not in ('pending', 'in_transit', 'paid', 'failed', 'canceled') then
    v_status := 'pending';
  end if;
  v_arrival := (private.payments_ts(p_obj ->> 'arrival_date') at time zone 'UTC')::date;
  -- The week this payout already claimed (a later event for the same payout), else its due day, else the latest
  -- unclaimed week due up to 4 days before it arrived.
  select w.* into v_week from public.host_payouts w
   where w.program_id = v_a.program_id
     and (w.provider_ref = p_obj ->> 'id'
          or w.id = (select pp.payout_id from public.host_provider_payouts pp where pp.provider_ref = p_obj ->> 'id'))
   limit 1 for update;
  if v_week.id is null then
    select w.* into v_week from public.host_payouts w
     where w.program_id = v_a.program_id and w.pays_on = v_arrival and w.provider_ref is null
     order by w.period_start desc limit 1 for update;
  end if;
  if v_week.id is null then
    select w.* into v_week from public.host_payouts w
     where w.program_id = v_a.program_id and w.provider_ref is null
       and w.pays_on between v_arrival - 4 and v_arrival
       and not exists (select 1 from public.host_provider_payouts pp where pp.payout_id = w.id)
     order by w.pays_on desc, w.period_start desc limit 1 for update;
  end if;
  insert into public.host_provider_payouts (program_id, provider_ref, amount_cents, currency, status, arrival_date,
                                            failure_code, payout_id)
  values (v_a.program_id, p_obj ->> 'id', coalesce((p_obj ->> 'amount')::bigint, 0),
          upper(coalesce(p_obj ->> 'currency', 'cad')), v_status, v_arrival, p_obj ->> 'failure_code', v_week.id)
  on conflict (provider_ref) do update
    set status = excluded.status, amount_cents = excluded.amount_cents, arrival_date = excluded.arrival_date,
        failure_code = excluded.failure_code,
        payout_id = coalesce(public.host_provider_payouts.payout_id, excluded.payout_id)
  returning id into v_id;
  if v_week.id is not null and v_status in ('paid', 'failed') then
    update public.host_payouts
       set status = v_status::public.host_payout_status, provider = 'stripe', provider_ref = p_obj ->> 'id',
           paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) end
     where id = v_week.id;
  end if;
  perform private.emit('payments_payout_recorded', v_a.created_by,
    jsonb_build_object('program_id', v_a.program_id, 'status', v_status));
  return jsonb_build_object('result', 'processed', 'provider_payout_id', v_id, 'payout_id', v_week.id);
end;
$$;
