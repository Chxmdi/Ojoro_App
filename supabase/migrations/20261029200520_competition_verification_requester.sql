-- Step 5 (Competition): Verifying needs to know whether you opened the open correction (only the
-- requester can WITHDRAW THE CORRECTION), without comparing names. Adds correction_requested_by_me.
-- Contract: docs/COMPETITION_CONTRACT.md §Result and verification.

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
  auto_confirms_at timestamptz,
  correction_requested_by_me boolean
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
              then v_s.created_at + make_interval(hours => private.result_auto_confirm_hours()) end,
         coalesce(v_c.requested_by = v_uid, false);
end;
$$;
revoke all on function public.challenge_verification(uuid) from public, anon;
grant execute on function public.challenge_verification(uuid) to authenticated, service_role;
