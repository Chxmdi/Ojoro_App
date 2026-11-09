-- Polish GAPS-SMALL: once a spot is paid, the game screen says what was paid ("Paid $8", "Paid $8 at
-- the field", "Covered by your 10-pack", "Member"), not just "Paid".
--
-- `host_purchase_options(…).session` used to drop `amount_cents` once the state left `due`. It now
-- keeps the amount for `paid` and `refunded`, and says how the spot was settled. The new keys are
-- left out when they're null, so a `due` session reads exactly as before:
--   settled_by     app | at_field | host_recorded (paid), refund (refunded), pack, membership,
--                  free_pass (a free pass covers it), free (the session is free for me); absent when due
--   pass_name      the pack or free pass that covers it
--   sessions_left  pack only: sessions left on it
--   paid_at        paid only
--   refund_cents   refunded only: what went back
-- Same signature, same callers (begin_host_checkout reads only `reason` and `amount_cents` while due).

create or replace function private.payments_session_reason(p_session uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.host_sessions%rowtype;
  v_pay jsonb;
  v_state text;
  v_reason text;
begin
  select * into v_s from public.host_sessions where id = p_session;
  if not found then
    return null;
  end if;
  v_pay := private.host_payment_of(v_s.id, p_user);
  v_state := v_pay ->> 'state';
  v_reason := case
    when v_s.status = 'skipped' then 'session_skipped'
    when not exists (select 1 from public.attendance a where a.activity_id = v_s.activity_id and a.user_id = p_user
                     and a.status in ('confirmed', 'checked_in')) then 'not_attending'
    when v_state <> 'due' then 'nothing_to_pay'
    when not private.payments_connected(v_s.program_id) then 'not_connected'
  end;
  return jsonb_build_object(
    'session_id', v_s.id,
    'program_id', v_s.program_id,
    'state', v_state,
    'amount_cents', case when v_state in ('due', 'paid', 'refunded') then (v_pay ->> 'amount_cents')::int end,
    'currency', coalesce(case when v_state in ('paid', 'refunded') then v_pay ->> 'currency' end, v_s.currency),
    'buyable', v_reason is null,
    'reason', v_reason
  ) || jsonb_strip_nulls(jsonb_build_object(
    'settled_by', case v_state
      when 'paid' then v_pay ->> 'method'
      when 'refunded' then 'refund'
      when 'pack' then 'pack'
      when 'member' then 'membership'
      when 'free' then case when v_pay ? 'membership_id' then 'free_pass' else 'free' end
    end,
    'pass_name', case when v_state in ('pack', 'free') then v_pay ->> 'pass_name' end,
    'sessions_left', case when v_state = 'pack' then (v_pay ->> 'sessions_left')::int end,
    'paid_at', case when v_state = 'paid' then v_pay ->> 'paid_at' end,
    'refund_cents', case when v_state = 'refunded' then (v_pay ->> 'refund_cents')::int end
  ));
end;
$$;

revoke all on function private.payments_session_reason(uuid, uuid) from public, anon, authenticated;
