-- Step 6 (Communities): only the next undecided Clash event reads as this week's (its badge is the
-- weekday, SAT); later ones stay UPCOMING even when they're within 7 days (Clash.png: event 4 SAT,
-- event 5 UPCOMING).

create or replace function private.clash_event_state(e public.clash_events, p_tz text)
returns public.clash_event_state
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.clash_event_results r where r.clash_event_id = e.id) then 'decided'::public.clash_event_state
    when exists (select 1 from public.clash_result_submissions s where s.clash_event_id = e.id and s.status = 'pending') then 'verifying'
    when e.starts_at <= now() then 'live'
    when e.starts_at < now() + interval '7 days'
         and not exists (select 1 from public.clash_events o
                         where o.clash_id = e.clash_id and o.position < e.position and o.starts_at > now()
                           and not exists (select 1 from public.clash_event_results r where r.clash_event_id = o.id))
      then 'this_week'
    else 'upcoming'
  end;
$$;
revoke all on function private.clash_event_state(public.clash_events, text) from public, anon, authenticated;
