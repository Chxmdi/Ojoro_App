-- Step 5 (Competition): unanswered results are confirmed after 48 hours (owner's call, Step 5
-- backend decisions). If the other captain neither confirms nor requests a correction within
-- result_auto_confirm_hours() of the submission, the minute job finalises the submitted numbers
-- (source 'unanswered_auto_confirmed'), posts a milestone and the result, and notifies both sides.
-- An open correction (disputed) still blocks it. Contract: docs/COMPETITION_CONTRACT.md.

-- The one place the 48 hours lives.
create or replace function private.result_auto_confirm_hours() returns integer
language sql immutable set search_path = '' as $$ select 48 $$;
revoke all on function private.result_auto_confirm_hours() from public, anon, authenticated;

create or replace function private.challenge_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
  v_posts integer := 0;
  v_closed integer := 0;
  v_auto integer := 0;
  v_s record;
begin
  for v_e in
    select e.* from public.challenge_events e
    where e.status = 'scheduled' and e.starts_at > now() - interval '3 hours'
  loop
    if now() >= v_e.starts_at - interval '7 days' and now() < v_e.starts_at - interval '24 hours'
       and v_e.accepted_at < v_e.starts_at - interval '7 days' then
      v_posts := v_posts + private.challenge_milestone(v_e.id, 'week', 'ONE WEEK TO GO.')::integer;
    elsif now() >= v_e.starts_at - interval '24 hours' and now() < v_e.starts_at - interval '3 hours'
       and v_e.accepted_at < v_e.starts_at - interval '24 hours' then
      v_posts := v_posts + private.challenge_milestone(v_e.id, 'tomorrow', 'TOMORROW.')::integer;
    elsif now() >= v_e.starts_at - interval '3 hours' and now() < v_e.starts_at - interval '30 minutes'
       and v_e.accepted_at < v_e.starts_at - interval '3 hours' then
      if private.challenge_milestone(v_e.id, 'today', 'TODAY.') then
        v_posts := v_posts + 1;
        perform private.challenge_announce(v_e.id, 'today');
      end if;
    elsif now() >= v_e.starts_at - interval '30 minutes' and now() < v_e.starts_at then
      v_posts := v_posts + private.challenge_milestone(v_e.id, 'almost', 'ALMOST TIME.')::integer;
    end if;
  end loop;

  for v_e in
    select e.id from public.challenge_events e
    where (e.status = 'scheduled' and e.starts_at <= now() - interval '3 hours')
       or (e.status = 'live' and e.live_at <= now() - interval '24 hours')
    for update skip locked
  loop
    update public.challenge_events
       set cancel_reason = case when status = 'live' then 'no_result' else 'no_show' end,
           status = 'cancelled', cancelled_at = now()
     where id = v_e.id;
    perform private.challenge_milestone(v_e.id, 'called_off', 'CALLED OFF.');
    v_closed := v_closed + 1;
  end loop;

  -- A result nobody answered: the other captain neither confirmed nor asked for a correction within
  -- result_auto_confirm_hours() of the submission. An open correction (status disputed) never
  -- auto-finalises. finalize_challenge posts the result and tells both sides and the followers.
  for v_s in
    select s.id, s.event_id, s.a_value, s.b_value, s.note
    from public.challenge_result_submissions s
    join public.challenge_events e on e.id = s.event_id
    where s.status = 'pending' and e.status = 'verifying'
      and s.created_at <= now() - make_interval(hours => private.result_auto_confirm_hours())
      and not exists (select 1 from public.challenge_corrections c where c.event_id = e.id and c.resolved_at is null)
    for update of e skip locked
  loop
    perform private.challenge_milestone(v_s.event_id, 'auto_confirmed',
      'NO ANSWER IN ' || private.result_auto_confirm_hours() || ' HOURS. THE RESULT STANDS.');
    perform private.finalize_challenge(v_s.event_id, v_s.a_value, v_s.b_value, 'unanswered_auto_confirmed',
                                       v_s.id, v_s.note, null);
    v_auto := v_auto + 1;
  end loop;

  update public.call_outs set status = 'expired' where status = 'proposed' and expires_at <= now();
  return jsonb_build_object('milestones', v_posts, 'closed', v_closed, 'auto_confirmed', v_auto);
end;
$$;
revoke all on function private.challenge_tick() from public, anon, authenticated;
grant execute on function private.challenge_tick() to service_role;

-- Verifying: also says when an unanswered result stands (auto_confirms_at).
drop function public.challenge_verification(uuid);
create function public.challenge_verification(p_event_id uuid)
returns table (
  event_id uuid,
  stage public.challenge_stage,
  submission_id uuid,
  a_value numeric,
  b_value numeric,
  submitted_by uuid,
  submitted_by_name text,
  submitted_at timestamptz,
  note text,
  checks jsonb,
  confirmed_count integer,
  needed_count integer,
  i_need_to_confirm boolean,
  correction_open boolean,
  correction_requested_by_name text,
  correction_note text,
  correction_requested_at timestamptz,
  review_due_at timestamptz,
  auto_confirms_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_s public.challenge_result_submissions%rowtype;
  v_c public.challenge_corrections%rowtype;
begin
  if not authz.is_challenge_competitor(v_e.id, v_uid) and not authz.is_challenge_organizer(v_e.id, v_uid) then
    perform private.fail('not_competitor');
  end if;
  select * into v_s from public.challenge_result_submissions s
   where s.event_id = v_e.id and s.status in ('pending', 'confirmed')
   order by (s.status = 'pending') desc, s.created_at desc limit 1;
  select * into v_c from public.challenge_corrections c where c.event_id = v_e.id and c.resolved_at is null;
  return query
  select v_e.id, private.challenge_stage(v_e), v_s.id, v_s.a_value, v_s.b_value, v_s.submitted_by,
         (select pr.display_name from public.profiles pr where pr.id = v_s.submitted_by), v_s.created_at, v_s.note,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'kind', 'confirmation', 'user_id', cap.uid, 'name', pr.display_name, 'side', cap.side,
                    'is_me', cap.uid = v_uid, 'done', rc.user_id is not null, 'done_at', rc.created_at)
                  order by cap.uid = v_uid, cap.side)
           from (values (v_e.a_captain_id, 'a'), (v_e.b_captain_id, 'b')) cap(uid, side)
           join public.profiles pr on pr.id = cap.uid
           left join public.challenge_result_confirmations rc on rc.submission_id = v_s.id and rc.user_id = cap.uid
         ), '[]'::jsonb),
         (select count(*)::integer from public.challenge_result_confirmations rc
           where rc.submission_id = v_s.id and rc.user_id in (v_e.a_captain_id, v_e.b_captain_id)),
         2,
         v_s.id is not null and v_s.status = 'pending' and v_e.status = 'verifying'
           and v_uid in (v_e.a_captain_id, v_e.b_captain_id)
           and not exists (select 1 from public.challenge_result_confirmations rc
                           where rc.submission_id = v_s.id and rc.user_id = v_uid),
         v_c.id is not null,
         (select pr.display_name from public.profiles pr where pr.id = v_c.requested_by),
         v_c.note, v_c.created_at, v_c.created_at + interval '24 hours',
         case when v_s.status = 'pending' and v_c.id is null
              then v_s.created_at + make_interval(hours => private.result_auto_confirm_hours()) end;
end;
$$;
revoke all on function public.challenge_verification(uuid) from public, anon;
grant execute on function public.challenge_verification(uuid) to authenticated, service_role;
