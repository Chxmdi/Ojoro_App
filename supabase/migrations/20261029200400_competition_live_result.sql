-- Step 5 (Competition, PRD M6): event day (check-in, I'M READY), LIVE progress, result submission
-- and participant confirmation, corrections, Rivalries, the share poster, the minute job, and the
-- notifications, report and realtime wiring. Contract: docs/COMPETITION_CONTRACT.md.

create type public.challenge_presence_state as (
  event_id uuid,
  stage public.challenge_stage,
  my_checked_in_at timestamptz,
  my_ready_at timestamptz,
  a_checked_in boolean,
  b_checked_in boolean,
  a_ready boolean,
  b_ready boolean,
  live_at timestamptz
);

create type public.challenge_progress_state as (
  event_id uuid,
  a_progress numeric,
  b_progress numeric,
  live_period integer,
  progress_updated_at timestamptz,
  changed boolean
);

create type public.challenge_result_state as (
  event_id uuid,
  submission_id uuid,
  stage public.challenge_stage,
  a_value numeric,
  b_value numeric,
  confirmed_count integer,
  needed_count integer,
  i_confirmed boolean,
  verified boolean,
  winner_side public.team_side
);

-- Helpers ------------------------------------------------------------------------------------------------

create or replace function private.presence_of(p_event uuid, p_uid uuid)
returns public.challenge_presence_state
language sql
stable
security definer
set search_path = ''
as $$
  select row(
    e.id, private.challenge_stage(e),
    (select c.checked_in_at from public.challenge_competitors c where c.event_id = e.id and c.user_id = p_uid),
    (select c.ready_at from public.challenge_competitors c where c.event_id = e.id and c.user_id = p_uid),
    exists (select 1 from public.challenge_competitors c where c.event_id = e.id and c.user_id = e.a_captain_id and c.checked_in_at is not null),
    exists (select 1 from public.challenge_competitors c where c.event_id = e.id and c.user_id = e.b_captain_id and c.checked_in_at is not null),
    exists (select 1 from public.challenge_competitors c where c.event_id = e.id and c.user_id = e.a_captain_id and c.ready_at is not null),
    exists (select 1 from public.challenge_competitors c where c.event_id = e.id and c.user_id = e.b_captain_id and c.ready_at is not null),
    e.live_at
  )::public.challenge_presence_state
  from public.challenge_events e where e.id = p_event;
$$;

-- Both captains confirm the result (participant confirmation; device data is M10).
create or replace function private.result_state_of(p_event uuid, p_submission uuid, p_uid uuid)
returns public.challenge_result_state
language sql
stable
security definer
set search_path = ''
as $$
  select row(
    e.id, s.id, private.challenge_stage(e), s.a_value, s.b_value,
    (select count(*)::integer from public.challenge_result_confirmations rc
      where rc.submission_id = s.id and rc.user_id in (e.a_captain_id, e.b_captain_id)),
    2,
    exists (select 1 from public.challenge_result_confirmations rc where rc.submission_id = s.id and rc.user_id = p_uid),
    e.status = 'complete',
    (select r.winner_side from public.challenge_results r where r.event_id = e.id)
  )::public.challenge_result_state
  from public.challenge_events e
  left join public.challenge_result_submissions s on s.id = p_submission
  where e.id = p_event;
$$;

-- Tell the competitors and followers (not quiet) about LIVE, the result, event day or a call-off.
create or replace function private.challenge_announce(p_event uuid, p_milestone text)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.notify(private.challenge_audience_ids(p_event), 'challenge_milestone', 'challenge_event', p_event,
                        null, 'challenge_milestone:' || p_event || ':' || p_milestone,
                        jsonb_build_object('milestone', p_milestone));
$$;

-- Verified: write the final result (insert-only), close the event, tell everyone. The crowd's call is
-- read from predictions, which have been locked since LIVE.
create or replace function private.finalize_challenge(
  p_event uuid, p_a numeric, p_b numeric, p_source public.challenge_result_source,
  p_submission uuid, p_note text, p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.challenge_events%rowtype;
  v_winner public.team_side;
  v_called boolean;
begin
  select * into v_e from public.challenge_events where id = p_event for update;
  if v_e.status = 'complete' then
    return;
  end if;
  v_winner := case
    when p_a = p_b then null
    when v_e.scoring = 'time' then case when p_a < p_b then 'a'::public.team_side else 'b'::public.team_side end
    else case when p_a > p_b then 'a'::public.team_side else 'b'::public.team_side end
  end;
  v_called := case
    when v_winner is null or v_e.prediction_a = v_e.prediction_b
         or v_e.prediction_a + v_e.prediction_b < private.prediction_min_count() then null
    else (v_e.prediction_a > v_e.prediction_b) = (v_winner = 'a')
  end;
  insert into public.challenge_results (event_id, rivalry_id, a_value, b_value, winner_side, margin, source,
                                        submission_id, note, predicted_a, predicted_b, crowd_called_it, watched_count,
                                        verified_at)
  values (v_e.id, v_e.rivalry_id, p_a, p_b, v_winner, abs(p_a - p_b), p_source, p_submission, p_note,
          v_e.prediction_a, v_e.prediction_b, v_called, v_e.follower_count, clock_timestamp());
  update public.challenge_result_submissions set status = 'confirmed' where id = p_submission;
  update public.challenge_events
     set status = 'complete', completed_at = now(), ended_at = coalesce(ended_at, now())
   where id = v_e.id;
  perform private.challenge_milestone(v_e.id, 'result',
    case when v_winner is null then 'IT''S A DRAW.' else upper(private.side_name(v_e, v_winner)) || ' WINS.' end);
  perform private.challenge_announce(v_e.id, 'result');
  perform private.emit('challenge_result_verified', p_actor, jsonb_build_object(
    'event_id', v_e.id, 'source', p_source, 'draw', v_winner is null, 'crowd_called_it', v_called,
    'minutes_to_verify', round(extract(epoch from now() - coalesce(v_e.ended_at, now())) / 60)));
end;
$$;

-- Event day ---------------------------------------------------------------------------------------------

-- CHECK IN: competitors, from an hour before the start until 3 h after it. Idempotent. When both
-- captains are here, BOTH ARE HERE. (Device/location checks come with M10; this is the person's word.)
create or replace function public.check_in_challenge(p_event_id uuid)
returns public.challenge_presence_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_stage public.challenge_stage := private.challenge_stage(v_e);
  v_p public.challenge_presence_state;
begin
  if not authz.is_challenge_competitor(v_e.id, v_uid) then
    perform private.fail('not_competitor');
  end if;
  if v_stage = 'cancelled' then
    perform private.fail('challenge_closed');
  end if;
  if now() < v_e.check_in_opens_at then
    perform private.fail('check_in_not_open', v_e.check_in_opens_at::text);
  end if;
  if v_e.status not in ('scheduled', 'live') then
    perform private.fail('check_in_closed');
  end if;
  update public.challenge_competitors set checked_in_at = now()
   where event_id = v_e.id and user_id = v_uid and checked_in_at is null;
  if found then
    perform private.emit('challenge_checked_in', v_uid, jsonb_build_object('event_id', v_e.id));
  end if;
  v_p := private.presence_of(v_e.id, v_uid);
  if v_p.a_checked_in and v_p.b_checked_in then
    perform private.challenge_milestone(v_e.id, 'both_here', 'BOTH ARE HERE.');
  end if;
  return v_p;
end;
$$;

-- I'M READY: a checked-in captain is ready to start. When both captains are ready the event goes LIVE
-- (predictions lock, followers hear). Idempotent.
create or replace function public.ready_challenge(p_event_id uuid)
returns public.challenge_presence_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_p public.challenge_presence_state;
begin
  if private.captain_side(v_e, v_uid) is null then
    perform private.fail('not_competitor');
  end if;
  select * into v_e from public.challenge_events where id = p_event_id for update;
  if v_e.status = 'live' then
    return private.presence_of(v_e.id, v_uid);
  end if;
  if v_e.status <> 'scheduled' or private.challenge_stage(v_e) = 'cancelled' then
    perform private.fail('challenge_closed');
  end if;
  if now() < v_e.check_in_opens_at then
    perform private.fail('check_in_not_open', v_e.check_in_opens_at::text);
  end if;
  if not exists (select 1 from public.challenge_competitors c
                 where c.event_id = v_e.id and c.user_id = v_uid and c.checked_in_at is not null) then
    perform private.fail('not_checked_in');
  end if;
  update public.challenge_competitors set ready_at = now()
   where event_id = v_e.id and user_id = v_uid and ready_at is null;
  v_p := private.presence_of(v_e.id, v_uid);
  if v_p.a_ready and v_p.b_ready then
    update public.challenge_events set status = 'live', live_at = now() where id = v_e.id;
    perform private.challenge_milestone(v_e.id, 'live', 'PREDICTIONS LOCKED. THE CHALLENGE IS LIVE.');
    perform private.challenge_announce(v_e.id, 'live');
    perform private.emit('challenge_live', v_uid, jsonb_build_object(
      'event_id', v_e.id, 'predictions', v_e.prediction_a + v_e.prediction_b, 'followers', v_e.follower_count));
    v_p := private.presence_of(v_e.id, v_uid);
  end if;
  return v_p;
end;
$$;

-- LIVE progress (distance, score, rounds or elapsed time per side, and the round/set/half). Any
-- competitor, while live. Null keeps a value. The same values again change nothing. Labelled as
-- logged by a participant (device data is M10).
create or replace function public.log_challenge_progress(
  p_event_id uuid, p_a_value numeric default null, p_b_value numeric default null, p_period integer default null
)
returns public.challenge_progress_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
begin
  if not authz.is_challenge_competitor(v_e.id, v_uid) then
    perform private.fail('not_competitor');
  end if;
  if v_e.status <> 'live' then
    perform private.fail('challenge_not_live');
  end if;
  if (p_a_value is not null and p_a_value not between 0 and 99999)
     or (p_b_value is not null and p_b_value not between 0 and 99999)
     or (p_period is not null and p_period not between 1 and 99) then
    perform private.fail('invalid_argument', 'value');
  end if;
  if coalesce(p_a_value, v_e.a_progress) is not distinct from v_e.a_progress
     and coalesce(p_b_value, v_e.b_progress) is not distinct from v_e.b_progress
     and coalesce(p_period, v_e.live_period) is not distinct from v_e.live_period then
    return row(v_e.id, v_e.a_progress, v_e.b_progress, v_e.live_period, v_e.progress_updated_at, false)::public.challenge_progress_state;
  end if;
  update public.challenge_events
     set a_progress = coalesce(p_a_value, a_progress), b_progress = coalesce(p_b_value, b_progress),
         live_period = coalesce(p_period, live_period), progress_updated_at = now(), progress_logged_by = v_uid
   where id = v_e.id
  returning * into v_e;
  perform private.emit('challenge_progress_logged', v_uid, jsonb_build_object('event_id', v_e.id));
  return row(v_e.id, v_e.a_progress, v_e.b_progress, v_e.live_period, v_e.progress_updated_at, true)::public.challenge_progress_state;
end;
$$;

-- Result and verification -----------------------------------------------------------------------------

-- A captain submits the result (times in seconds, distance in km, score, rounds) once the event is
-- LIVE. It is NOT FINAL: the event moves to VERIFYING and the other captain confirms. A new
-- submission replaces a pending one (and answers an open correction). The submitter's own
-- confirmation is recorded. Results are never edited after COMPLETE.
create or replace function public.submit_challenge_result(
  p_event_id uuid, p_a_value numeric, p_b_value numeric, p_idempotency_key uuid, p_note text default null
)
returns public.challenge_result_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_e public.challenge_events%rowtype;
  v_s public.challenge_result_submissions%rowtype;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'submit_challenge_result:' || p_event_id);
  if v_prior is not null then
    return private.result_state_of(p_event_id, (v_prior ->> 'submission_id')::uuid, v_uid);
  end if;
  v_e := private.event_for(p_event_id, v_uid);
  if private.captain_side(v_e, v_uid) is null then
    perform private.fail('not_competitor');
  end if;
  select * into v_e from public.challenge_events where id = p_event_id for update;
  if v_e.status = 'complete' then
    perform private.fail('result_already_verified');
  end if;
  if v_e.status not in ('live', 'verifying', 'disputed') then
    perform private.fail('challenge_not_live');
  end if;
  if p_a_value is null or p_b_value is null or p_a_value not between 0 and 99999 or p_b_value not between 0 and 99999
     or (v_e.scoring = 'time' and (p_a_value <= 0 or p_b_value <= 0)) then
    perform private.fail('invalid_argument', 'value');
  end if;
  if char_length(p_note) > 280 then
    perform private.fail('message_invalid', '0-280');
  end if;
  select * into v_s from public.challenge_result_submissions
   where event_id = v_e.id and status = 'pending' for update;
  if found and v_s.a_value = p_a_value and v_s.b_value = p_b_value and v_e.status = 'verifying' then
    -- The same numbers again: it's a confirmation.
    insert into public.challenge_result_confirmations (submission_id, user_id) values (v_s.id, v_uid)
    on conflict do nothing;
  else
    update public.challenge_result_submissions set status = 'superseded' where event_id = v_e.id and status = 'pending';
    insert into public.challenge_result_submissions (event_id, submitted_by, a_value, b_value, note)
    values (v_e.id, v_uid, p_a_value, p_b_value, nullif(trim(p_note), ''))
    returning * into v_s;
    insert into public.challenge_result_confirmations (submission_id, user_id) values (v_s.id, v_uid);
    update public.challenge_corrections set resolved_at = now(), resolution = 'resubmitted'
     where event_id = v_e.id and resolved_at is null;
    update public.challenge_events set status = 'verifying', ended_at = coalesce(ended_at, now()), disputed_at = null
     where id = v_e.id;
    perform private.notify(array[case when v_uid = v_e.a_captain_id then v_e.b_captain_id else v_e.a_captain_id end],
                           'challenge_to_confirm', 'challenge_event', v_e.id, v_uid, 'challenge_confirm:' || v_e.id, '{}');
    perform private.emit('challenge_result_submitted', v_uid, jsonb_build_object('event_id', v_e.id,
                                                                                'resubmitted', v_e.status <> 'live'));
  end if;
  if (select count(*) from public.challenge_result_confirmations rc
      where rc.submission_id = v_s.id and rc.user_id in (v_e.a_captain_id, v_e.b_captain_id)) >= 2 then
    perform private.finalize_challenge(v_e.id, v_s.a_value, v_s.b_value, 'participant_confirmation', v_s.id, v_s.note, v_uid);
  end if;
  perform private.idem_store(v_uid, p_idempotency_key, jsonb_build_object('submission_id', v_s.id));
  return private.result_state_of(v_e.id, v_s.id, v_uid);
end;
$$;

-- CONFIRM BOTH TIMES: the other captain confirms the pending submission. When both have, the result is
-- final (COMPLETE): the winner is named, the crowd's call is shown, the rivalry record includes it.
create or replace function public.confirm_challenge_result(p_submission_id uuid, p_idempotency_key uuid)
returns public.challenge_result_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_s public.challenge_result_submissions%rowtype;
  v_e public.challenge_events%rowtype;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'confirm_challenge_result:' || p_submission_id);
  select * into v_s from public.challenge_result_submissions where id = p_submission_id;
  if not found or not (authz.is_challenge_competitor(v_s.event_id, v_uid) or authz.is_challenge_organizer(v_s.event_id, v_uid)) then
    perform private.fail('submission_not_found');
  end if;
  if v_prior is not null then
    return private.result_state_of(v_s.event_id, v_s.id, v_uid);
  end if;
  select * into v_e from public.challenge_events where id = v_s.event_id for update;
  if private.captain_side(v_e, v_uid) is null then
    perform private.fail('not_competitor');
  end if;
  select * into v_s from public.challenge_result_submissions where id = p_submission_id;
  if v_s.status = 'confirmed' or v_e.status = 'complete' then
    perform private.idem_store(v_uid, p_idempotency_key, '{}');
    return private.result_state_of(v_e.id, v_s.id, v_uid);
  end if;
  if v_s.status = 'superseded' then
    perform private.fail('proposal_superseded');
  end if;
  if v_e.status = 'disputed' then
    perform private.fail('correction_open');
  end if;
  insert into public.challenge_result_confirmations (submission_id, user_id) values (v_s.id, v_uid)
  on conflict do nothing;
  if (select count(*) from public.challenge_result_confirmations rc
      where rc.submission_id = v_s.id and rc.user_id in (v_e.a_captain_id, v_e.b_captain_id)) >= 2 then
    perform private.finalize_challenge(v_e.id, v_s.a_value, v_s.b_value, 'participant_confirmation', v_s.id, v_s.note, v_uid);
  end if;
  perform private.idem_store(v_uid, p_idempotency_key, '{}');
  return private.result_state_of(v_e.id, v_s.id, v_uid);
end;
$$;

-- REQUEST A CORRECTION: pauses the result (stage `disputed`). It ends when a captain submits new
-- numbers (the other confirms), the requester withdraws it, or an organizer review settles it
-- (private.resolve_challenge_dispute, service role). Idempotent while open.
create or replace function public.request_challenge_correction(p_event_id uuid, p_note text default null)
returns public.challenge_result_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_s uuid;
begin
  if private.captain_side(v_e, v_uid) is null then
    perform private.fail('not_competitor');
  end if;
  select * into v_e from public.challenge_events where id = p_event_id for update;
  if v_e.status = 'complete' then
    perform private.fail('result_already_verified');
  end if;
  select s.id into v_s from public.challenge_result_submissions s where s.event_id = v_e.id and s.status = 'pending';
  if v_e.status = 'disputed' then
    return private.result_state_of(v_e.id, v_s, v_uid);
  end if;
  if v_e.status <> 'verifying' or v_s is null then
    perform private.fail('challenge_not_live');
  end if;
  if char_length(p_note) > 280 then
    perform private.fail('message_invalid', '0-280');
  end if;
  insert into public.challenge_corrections (event_id, submission_id, requested_by, note)
  values (v_e.id, v_s, v_uid, nullif(trim(p_note), ''));
  update public.challenge_events set status = 'disputed', disputed_at = now() where id = v_e.id;
  perform private.emit('challenge_correction_requested', v_uid, jsonb_build_object('event_id', v_e.id));
  return private.result_state_of(v_e.id, v_s, v_uid);
end;
$$;

-- The requester takes the correction back: VERIFYING again. Idempotent.
create or replace function public.withdraw_challenge_correction(p_event_id uuid)
returns public.challenge_result_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_c public.challenge_corrections%rowtype;
begin
  select * into v_e from public.challenge_events where id = p_event_id for update;
  select * into v_c from public.challenge_corrections c where c.event_id = v_e.id and c.resolved_at is null;
  if found then
    if v_c.requested_by <> v_uid then
      perform private.fail('not_author');
    end if;
    update public.challenge_corrections set resolved_at = now(), resolution = 'withdrawn' where id = v_c.id;
    update public.challenge_events set status = 'verifying', disputed_at = null where id = v_e.id;
  end if;
  return private.result_state_of(v_e.id,
    (select s.id from public.challenge_result_submissions s where s.event_id = v_e.id and s.status = 'pending'), v_uid);
end;
$$;

-- Organizer review (Ojoro staff, service role only): settles a disputed result with the reviewed
-- values. Not callable by clients.
create or replace function private.resolve_challenge_dispute(p_event_id uuid, p_a_value numeric, p_b_value numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.challenge_result_submissions set status = 'superseded' where event_id = p_event_id and status = 'pending';
  update public.challenge_corrections set resolved_at = now(), resolution = 'organizer_review'
   where event_id = p_event_id and resolved_at is null;
  perform private.finalize_challenge(p_event_id, p_a_value, p_b_value, 'organizer_review', null, null, null);
end;
$$;

-- Verifying screen: the pending numbers and every check, for competitors and organizers.
--   checks: [{kind: 'confirmation', user_id, name, side, is_me, done, done_at}]. (Device data: M10.)
create or replace function public.challenge_verification(p_event_id uuid)
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
  review_due_at timestamptz
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
         v_c.note, v_c.created_at, v_c.created_at + interval '24 hours';
end;
$$;

-- A captain calls the event off before it goes LIVE. Rivalries don't change.
create or replace function public.cancel_challenge_event(p_event_id uuid)
returns public.challenge_stage
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
begin
  if private.captain_side(v_e, v_uid) is null then
    perform private.fail('not_competitor');
  end if;
  select * into v_e from public.challenge_events where id = p_event_id for update;
  if v_e.status = 'cancelled' then
    return 'cancelled';
  end if;
  if v_e.status <> 'scheduled' then
    perform private.fail('challenge_started');
  end if;
  update public.challenge_events set status = 'cancelled', cancelled_at = now(), cancel_reason = 'called_off'
   where id = v_e.id;
  perform private.challenge_milestone(v_e.id, 'called_off', 'CALLED OFF.');
  perform private.challenge_announce(v_e.id, 'called_off');
  perform private.emit('challenge_cancelled', v_uid, jsonb_build_object('event_id', v_e.id, 'reason', 'called_off'));
  return 'cancelled';
end;
$$;

-- Rivalries ---------------------------------------------------------------------------------------------

-- Orientation: the viewer's side is `a` when they're in the rivalry (as the person, or a member of
-- the crew); otherwise the low id is `a`.
create or replace function private.rivalry_a_is_low(r public.rivalries, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.kind = 'people' then r.high_id <> p_uid
    else not (authz.is_crew_member(r.high_id, p_uid) and not authz.is_crew_member(r.low_id, p_uid))
  end;
$$;

create or replace function private.rivalry_side_name(r public.rivalries, p_low boolean)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when r.kind = 'people'
              then (select p.display_name from public.profiles p where p.id = case when p_low then r.low_id else r.high_id end)
              else (select c.name from public.crews c where c.id = case when p_low then r.low_id else r.high_id end) end;
$$;

-- Each verified meeting, oriented to the rivalry's a/b for the viewer.
create or replace function private.rivalry_results(p_rivalry uuid, p_uid uuid)
returns table (
  event_id uuid, starts_at timestamptz, time_zone text, title text, sport_id text, place_name text,
  scoring public.challenge_scoring, unit text, a_value numeric, b_value numeric, winner text, margin numeric,
  source public.challenge_result_source, verified_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with r as (select x.*, private.rivalry_a_is_low(x, p_uid) as a_low from public.rivalries x where x.id = p_rivalry),
  m as (
    select e.*, res.a_value as ra, res.b_value as rb, res.winner_side, res.margin as rmargin, res.source as rsource,
           res.verified_at as rverified,
           -- true when the event's side a is the rivalry's a
           (coalesce(e.a_user_id, e.a_crew_id) = case when r.a_low then r.low_id else r.high_id end) as same
    from public.challenge_results res
    join public.challenge_events e on e.id = res.event_id
    cross join r
    where res.rivalry_id = p_rivalry
  )
  select m.id, m.starts_at, m.time_zone, m.title, m.sport_id, pl.name, m.scoring, m.unit,
         case when m.same then m.ra else m.rb end, case when m.same then m.rb else m.ra end,
         case when m.winner_side is null then 'd'
              when (m.winner_side = 'a') = m.same then 'a' else 'b' end,
         m.rmargin, m.rsource, m.rverified
  from m left join public.places pl on pl.id = m.place_id;
$$;

-- Rivalry screen (and the Rivalry block on Compete): the record, form (last 8, oldest first:
-- 'a' | 'b' | 'd'), the current streak, the last meeting, the next event and a pending rematch.
create or replace function public.rivalry_view(p_rivalry_id uuid)
returns table (
  rivalry_id uuid,
  kind public.rivalry_kind,
  a_id uuid,
  a_name text,
  b_id uuid,
  b_name text,
  i_am_in boolean,
  meetings integer,
  a_wins integer,
  b_wins integer,
  draws integer,
  form text[],
  streak_side text,
  streak_length integer,
  last_event_id uuid,
  last_winner text,
  last_margin numeric,
  last_scoring public.challenge_scoring,
  last_unit text,
  last_title text,
  next_event_id uuid,
  next_title text,
  next_starts_at timestamptz,
  next_time_zone text,
  next_stage public.challenge_stage,
  rematch_call_out_id uuid,
  rematch_from text,
  rematch_from_name text,
  rematch_message text,
  rematch_title text,
  rematch_starts_at timestamptz,
  rematch_can_answer boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_r public.rivalries%rowtype;
  v_low boolean;
  v_a uuid;
  v_b uuid;
  v_ws text[];
  v_streak_side text;
  v_streak integer := 0;
  v_next public.challenge_events%rowtype;
  v_reb public.call_outs%rowtype;
  v_last_event uuid;
  v_last_winner text;
  v_last_margin numeric;
  v_last_scoring public.challenge_scoring;
  v_last_unit text;
  v_last_title text;
begin
  select * into v_r from public.rivalries x where x.id = p_rivalry_id;
  if not found or not exists (select 1 from public.challenge_events e
                              where e.rivalry_id = v_r.id and authz.can_see_challenge_event(e.id, v_uid)) then
    perform private.fail('rivalry_not_found');
  end if;
  v_low := private.rivalry_a_is_low(v_r, v_uid);
  v_a := case when v_low then v_r.low_id else v_r.high_id end;
  v_b := case when v_low then v_r.high_id else v_r.low_id end;
  select coalesce(array_agg(q.winner order by q.verified_at, q.starts_at), '{}') into v_ws
  from private.rivalry_results(v_r.id, v_uid) q;
  -- Streak: the run of the same winner from the latest meeting back (a draw ends it).
  if cardinality(v_ws) > 0 and v_ws[cardinality(v_ws)] <> 'd' then
    v_streak_side := v_ws[cardinality(v_ws)];
    for i in reverse cardinality(v_ws)..1 loop
      exit when v_ws[i] <> v_streak_side;
      v_streak := v_streak + 1;
    end loop;
  end if;
  select q.event_id, q.winner, q.margin, q.scoring, q.unit, q.title
    into v_last_event, v_last_winner, v_last_margin, v_last_scoring, v_last_unit, v_last_title
  from private.rivalry_results(v_r.id, v_uid) q order by q.verified_at desc, q.starts_at desc limit 1;
  select * into v_next from public.challenge_events e
   where e.rivalry_id = v_r.id and e.status in ('scheduled', 'live', 'verifying', 'disputed')
     and private.challenge_stage(e) <> 'cancelled' and authz.can_see_challenge_event(e.id, v_uid)
   order by e.starts_at limit 1;
  select * into v_reb from public.call_outs o
   where o.rivalry_id = v_r.id and o.rematch_of_event_id is not null and o.status = 'proposed' and o.expires_at > now()
     and authz.can_see_call_out(o.id, v_uid)
   order by o.created_at desc limit 1;

  return query
  select v_r.id, v_r.kind, v_a, private.rivalry_side_name(v_r, v_low), v_b, private.rivalry_side_name(v_r, not v_low),
         case when v_r.kind = 'people' then v_uid in (v_r.low_id, v_r.high_id)
              else authz.is_crew_member(v_r.low_id, v_uid) or authz.is_crew_member(v_r.high_id, v_uid) end,
         cardinality(v_ws),
         (select count(*)::integer from unnest(v_ws) w where w = 'a'),
         (select count(*)::integer from unnest(v_ws) w where w = 'b'),
         (select count(*)::integer from unnest(v_ws) w where w = 'd'),
         case when cardinality(v_ws) > 8 then v_ws[cardinality(v_ws) - 7:cardinality(v_ws)] else v_ws end,
         v_streak_side, v_streak,
         v_last_event, v_last_winner, v_last_margin, v_last_scoring, v_last_unit, v_last_title,
         v_next.id, v_next.title, v_next.starts_at, v_next.time_zone,
         case when v_next.id is not null then private.challenge_stage(v_next) end,
         v_reb.id,
         case when v_reb.id is null then null
              when coalesce(v_reb.challenger_crew_id, v_reb.challenger_id) = v_a then 'a' else 'b' end,
         case when v_reb.id is not null then private.call_out_side_name(v_reb, true) end,
         v_reb.message, v_reb.title, v_reb.starts_at,
         case when v_reb.id is not null then private.can_answer_call_out(v_reb, v_uid) else false end;
end;
$$;

-- RECENT MEETINGS, newest first.
create or replace function public.rivalry_meetings(p_rivalry_id uuid, p_limit integer default 20)
returns table (
  event_id uuid,
  starts_at timestamptz,
  time_zone text,
  title text,
  sport_id text,
  place_name text,
  scoring public.challenge_scoring,
  unit text,
  a_value numeric,
  b_value numeric,
  winner text,
  margin numeric,
  source public.challenge_result_source,
  verified_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform 1 from public.rivalry_view(p_rivalry_id);
  return query
  select q.* from private.rivalry_results(p_rivalry_id, v_uid) q
  where authz.can_see_challenge_event(q.event_id, v_uid)
  order by q.verified_at desc, q.starts_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

-- Compete · RIVALRIES: yours (you, or your crews), most recently active first.
create or replace function public.my_rivalries(p_limit integer default 10)
returns table (
  rivalry_id uuid,
  kind public.rivalry_kind,
  a_name text,
  b_name text,
  meetings integer,
  a_wins integer,
  b_wins integer,
  draws integer,
  form text[],
  next_event_id uuid,
  next_title text,
  next_starts_at timestamptz,
  next_time_zone text,
  last_active_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  return query
  with mine as materialized (
    select r.id as rid,
           (select max(greatest(e.accepted_at, coalesce(e.completed_at, e.accepted_at)))
              from public.challenge_events e where e.rivalry_id = r.id) as active_at
    from public.rivalries r
    where ((r.kind = 'people' and v_uid in (r.low_id, r.high_id))
           or (r.kind = 'crews' and (authz.is_crew_member(r.low_id, v_uid) or authz.is_crew_member(r.high_id, v_uid))))
      and exists (select 1 from public.challenge_events e
                  where e.rivalry_id = r.id and authz.can_see_challenge_event(e.id, v_uid))
    order by 2 desc nulls last
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
  )
  select v.rivalry_id, v.kind, v.a_name, v.b_name, v.meetings, v.a_wins, v.b_wins, v.draws, v.form,
         v.next_event_id, v.next_title, v.next_starts_at, v.next_time_zone, m.active_at
  from mine m
  cross join lateral public.rivalry_view(m.rid) v
  order by m.active_at desc nulls last;
end;
$$;

-- Share poster ------------------------------------------------------------------------------------------

-- The 540×675 poster (before: CALL-OUT ACCEPTED; after: the result). Only for events anyone may see
-- (audience public), unless you compete in it; the place is the public place and its city, never
-- more. Watched/follower counts aren't on it.
create or replace function public.challenge_poster(p_event_id uuid)
returns table (
  event_id uuid,
  kind text,
  a_name text,
  b_name text,
  title text,
  sport_name text,
  starts_at timestamptz,
  time_zone text,
  place_name text,
  place_city text,
  winner_side public.team_side,
  is_draw boolean,
  a_value numeric,
  b_value numeric,
  scoring public.challenge_scoring,
  unit text,
  link_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_res public.challenge_results%rowtype;
begin
  if v_e.audience <> 'public' and not authz.is_challenge_competitor(v_e.id, v_uid) then
    perform private.fail('poster_not_allowed');
  end if;
  if private.challenge_stage(v_e) = 'cancelled' then
    perform private.fail('challenge_closed');
  end if;
  select * into v_res from public.challenge_results r where r.event_id = v_e.id;
  return query
  select v_e.id, case when v_res.event_id is not null then 'result' else 'accepted' end,
         private.side_name(v_e, 'a'), private.side_name(v_e, 'b'), v_e.title, s.name, v_e.starts_at, v_e.time_zone,
         pl.name, pl.city, v_res.winner_side,
         case when v_res.event_id is not null then v_res.winner_side is null end,
         v_res.a_value, v_res.b_value, v_e.scoring, v_e.unit, '/event/' || v_e.id
  from public.sports s
  left join public.places pl on pl.id = v_e.place_id
  where s.id = v_e.sport_id;
end;
$$;

-- Minute job ----------------------------------------------------------------------------------------------

-- Countdown milestones (ONE WEEK TO GO, TOMORROW, TODAY, ALMOST TIME), the event-day reminder to
-- followers, and closing events nobody started (no_show, 3 h after the start) or finished
-- (no_result, live for 24 h with no result). Correctness never depends on it: stages are computed.
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

  update public.call_outs set status = 'expired' where status = 'proposed' and expires_at <= now();
  return jsonb_build_object('milestones', v_posts, 'closed', v_closed);
end;
$$;
revoke all on function private.challenge_tick() from public, anon, authenticated;
grant execute on function private.challenge_tick() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ojoro_challenge_tick', '* * * * *', 'select private.challenge_tick()');
  else
    raise notice 'pg_cron not available: call private.challenge_tick() from a scheduler';
  end if;
end;
$$;

-- Report: Call-Outs, Challenge Events, event posts and comments too (PRD §10.5, §11.1) ------------------

create or replace function public.report(
  p_subject_kind public.report_subject,
  p_subject_id uuid,
  p_reason public.report_reason,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
  v_exists boolean;
begin
  if (select count(*) from public.reports r
      where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours') >= 20 then
    perform private.fail('report_rate_limited');
  end if;
  v_exists := case p_subject_kind
    when 'profile' then exists (select 1 from public.profiles where id = p_subject_id)
    when 'plan' then exists (select 1 from public.plans where id = p_subject_id)
    when 'activity' then exists (select 1 from public.activities where id = p_subject_id)
    when 'moment' then exists (select 1 from public.moments where id = p_subject_id)
    when 'result' then exists (select 1 from public.result_proposals where id = p_subject_id)
    -- Only a message you can read (or wrote) can be reported.
    when 'message' then exists (select 1 from public.messages m where m.id = p_subject_id
                                  and (m.sender_id = v_uid or authz.can_read_thread(m.crew_id, m.activity_id, v_uid)))
    when 'update' then exists (select 1 from public.activity_updates u where u.id = p_subject_id
                                 and authz.can_see_activity(u.activity_id, v_uid))
    -- Step 5: only what you can see.
    when 'call_out' then authz.can_see_call_out(p_subject_id, v_uid)
    when 'challenge_event' then authz.can_see_challenge_event(p_subject_id, v_uid)
    when 'challenge_post' then exists (select 1 from public.challenge_posts p where p.id = p_subject_id
                                         and p.author_id is not null
                                         and authz.can_see_challenge_event(p.event_id, v_uid))
    when 'challenge_comment' then exists (select 1 from public.challenge_comments c where c.id = p_subject_id
                                            and authz.can_see_challenge_event(c.event_id, v_uid))
  end;
  if not coalesce(v_exists, false) then
    perform private.fail('subject_not_found');
  end if;
  if char_length(p_note) > 1000 then
    perform private.fail('invalid_argument', 'note');
  end if;
  insert into public.reports (reporter_id, subject_kind, subject_id, reason, note)
  values (v_uid, p_subject_kind, p_subject_id, p_reason, nullif(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Block also ends pending call-outs between the two people ----------------------------------------------

create or replace function public.block_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if p_user_id = v_uid then
    perform private.fail('invalid_argument', 'cannot block yourself');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform private.fail('user_not_found');
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_uid, p_user_id)
  on conflict do nothing;
  -- Pending invites between the two stop, and neither keeps a live location in front of the other
  -- (RLS hides it already; this removes the rows of shared games).
  update public.plan_invites set status = 'revoked', responded_at = now()
   where status = 'pending'
     and ((inviter_id = v_uid and invitee_id = p_user_id) or (inviter_id = p_user_id and invitee_id = v_uid));
  -- Pending call-outs between the two end (as withdrawn, so neither is told anything new).
  update public.call_outs set status = 'withdrawn', responded_at = now()
   where status = 'proposed'
     and ((challenger_id = v_uid and opponent_id = p_user_id) or (challenger_id = p_user_id and opponent_id = v_uid));
  return true;
end;
$$;

-- Notifications ----------------------------------------------------------------------------------------

create or replace function private.generic_copy(p_type public.notification_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'need_one_more' then 'A game needs one more.'
    when 'game_on' then 'A plan you''re in is on.'
    when 'participant_update' then 'Your plan has an update.'
    when 'activity_changed' then 'A game you''re in changed.'
    when 'check_in_open' then 'Check-in is opening for your game.'
    when 'live' then 'A game you follow is live.'
    when 'result_to_confirm' then 'A score is waiting for you to confirm.'
    when 'recap_ready' then 'Your recap is ready.'
    when 'run_it_back_invite' then 'You''re invited to run it back.'
    when 'pull_in_invite' then 'Someone pulled you into a plan.'
    when 'waitlist_promoted' then 'A spot opened. You''re in.'
    when 'crew_poll' then 'Your crew started a poll.'
    when 'crew_plan' then 'Your crew is making a game.'
    when 'mention' then 'You were mentioned in a chat.'
    when 'crew_member_joined' then 'Your crew has a new member.'
    when 'challenge_response' then 'Your Call-Out has an answer.'
    when 'call_out' then 'You have a new Call-Out.'
    when 'challenge_posts' then 'An event you follow has new posts.'
    when 'challenge_milestone' then 'An event you follow has an update.'
    when 'challenge_to_confirm' then 'A result is waiting for you to confirm.'
  end;
$$;

create or replace function private.push_throttled_types()
returns public.notification_type[]
language sql
immutable
set search_path = ''
as $$ select array['participant_update', 'need_one_more', 'crew_member_joined', 'mention',
                   'challenge_posts']::public.notification_type[] $$;

-- Step 4's feed plus the Step 5 types (Call-Outs and Challenge Events):
--   call_out              "Marcus called you out." / "5K · Mount Royal loop · Sat 9:00"   reply → /challenge/{id}
--   challenge_response    "Marcus accepted." (→ /event/{id})
--   challenge_posts       "3 new posts in Chimdi O vs Marcus T" / "Marcus T, Ade B and an Ojoro update · bundled"
--   challenge_milestone   live / result / today / called_off                              → /event/{id}
--   challenge_to_confirm  "Confirm the result."  needs you while the submission is unconfirmed by you
create or replace function private.notification_feed(p_uid uuid)
returns table (
  id uuid,
  type public.notification_type,
  section text,
  needs_you boolean,
  action text,
  href text,
  object_kind public.notification_object,
  object_id uuid,
  plan_id uuid,
  activity_id uuid,
  crew_id uuid,
  message_id uuid,
  actor_ids uuid[],
  actor_names text[],
  actor_count integer,
  count integer,
  title text,
  body text,
  data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  read_at timestamptz,
  acted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select coalesce((select pr.time_zone from public.profiles pr where pr.id = p_uid), 'America/Toronto') as tz
  ),
  base as (
    select n.*,
           (select coalesce(array_agg(a order by o), '{}')
              from unnest(n.actor_ids) with ordinality as x(a, o)
             where not authz.is_blocked(a, p_uid)) as visible_actors
    from public.notifications n
    where n.recipient_id = p_uid
      and authz.can_see_object(n.object_kind, n.object_id, p_uid)
  ),
  ctx as (
    select b.*,
           p.id as p_id, p.status as p_status, private.plan_status_now(p) as p_eff, p.member_count as p_count,
           p.capacity as p_cap, p.starts_at as p_starts, p.poll_closes_at as p_poll_closes, p.host_id as p_host,
           coalesce(ap.name, pp.name) as place_name,
           coalesce(ap.time_zone, pp.time_zone, me.tz) as place_tz,
           s.name as sport_name,
           a.id as a_id, private.activity_status_now(a) as a_eff, a.starts_at as a_starts,
           a.check_in_opens_at as a_ci_opens, a.check_in_closes_at as a_ci_closes, a.after_closes_at as a_after_closes,
           a.team_a_label as a_team_a, a.team_b_label as a_team_b,
           c.name as crew_name,
           exists (select 1 from public.plan_members m where m.plan_id = p.id and m.user_id = p_uid) as i_am_in,
           (select names from (
              select array_agg(pr.display_name order by o) as names
              from unnest(b.visible_actors) with ordinality as x(a, o)
              join public.profiles pr on pr.id = x.a) q) as names,
           co as co_row,
           co.id as co_id,
           (select pl.name from public.places pl where pl.id = co.place_id) as co_place,
           ce as ce_row,
           ce.id as ce_id,
           (select pl.name from public.places pl where pl.id = ce.place_id) as ce_place
    from base b
    cross join me
    left join public.activities a on a.id = coalesce(b.activity_id, case when b.object_kind = 'activity' then b.object_id end)
    left join public.plans p on p.id = coalesce(b.plan_id, a.plan_id, case when b.object_kind = 'plan' then b.object_id end)
    left join public.sports s on s.id = coalesce(a.sport_id, p.sport_id)
    left join public.places pp on pp.id = p.place_id
    left join public.places ap on ap.id = a.place_id
    left join public.crews c on c.id = coalesce(b.crew_id, case when b.object_kind = 'crew' then b.object_id end)
    left join public.call_outs co on co.id = case when b.object_kind = 'challenge' then b.object_id end
    left join public.challenge_events ce on ce.id = case when b.object_kind = 'challenge_event' then b.object_id end
    -- A row whose only actors are now blocked goes away.
    where cardinality(b.actor_ids) = 0 or cardinality(b.visible_actors) > 0
  ),
  valid as (
    select x.*,
      case x.type
        when 'need_one_more' then case when x.i_am_in then 'pull_in' else 'im_down' end
        when 'pull_in_invite' then 'im_down'
        when 'run_it_back_invite' then 'im_down'
        when 'crew_plan' then 'im_down'
        when 'crew_poll' then 'vote'
        when 'check_in_open' then 'check_in'
        when 'result_to_confirm' then 'confirm_result'
        when 'mention' then 'reply'
        when 'call_out' then 'reply'
        when 'challenge_to_confirm' then 'confirm_challenge'
        else 'open'
      end as act,
      case x.type
        when 'need_one_more' then x.p_eff = 'forming' and x.p_count < x.p_cap
        when 'pull_in_invite' then x.p_eff = 'forming' and x.p_count < x.p_cap and not x.i_am_in
          and exists (select 1 from public.plan_invites i where i.plan_id = x.p_id and i.invitee_id = p_uid and i.status = 'pending')
        when 'run_it_back_invite' then x.p_eff = 'forming' and x.p_count < x.p_cap and not x.i_am_in
          and exists (select 1 from public.plan_invites i where i.plan_id = x.p_id and i.invitee_id = p_uid and i.status = 'pending')
        when 'crew_plan' then x.p_eff = 'forming' and x.p_count < x.p_cap and not x.i_am_in
        when 'crew_poll' then x.p_eff = 'forming' and coalesce(x.p_poll_closes > now(), false)
          and not exists (select 1 from public.plan_time_votes v where v.plan_id = x.p_id and v.user_id = p_uid)
        when 'check_in_open' then x.a_eff in ('confirmed', 'live') and now() < x.a_ci_closes
          and exists (select 1 from public.attendance t where t.activity_id = x.a_id and t.user_id = p_uid and t.status = 'confirmed')
        when 'result_to_confirm' then x.a_eff in ('live', 'after')
          and exists (select 1 from public.result_proposals r
                      where r.activity_id = x.a_id and r.status = 'proposed'
                        and not exists (select 1 from public.result_confirmations rc
                                        where rc.proposal_id = r.id and rc.user_id = p_uid))
          and authz.is_player(x.a_id, p_uid)
        when 'mention' then true
        when 'call_out' then private.call_out_status_now(x.co_row) = 'proposed' and (x.co_row).starts_at > now()
          and private.can_answer_call_out(x.co_row, p_uid)
        when 'challenge_to_confirm' then (x.ce_row).status = 'verifying'
          and p_uid in ((x.ce_row).a_captain_id, (x.ce_row).b_captain_id)
          and exists (select 1 from public.challenge_result_submissions rs
                      where rs.event_id = x.ce_id and rs.status = 'pending'
                        and not exists (select 1 from public.challenge_result_confirmations rc
                                        where rc.submission_id = rs.id and rc.user_id = p_uid))
        else false
      end as still_valid,
      (select sum(o.vote_count)::integer from public.plan_time_options o where o.plan_id = x.p_id) as votes,
      (select r from public.recaps r where r.activity_id = x.a_id) as recap,
      case when x.ce_id is not null then private.side_name(x.ce_row, 'a') || ' vs ' || private.side_name(x.ce_row, 'b') end as ce_vs,
      (select r from public.challenge_results r where r.event_id = x.ce_id) as ce_result,
      (select rs from public.challenge_result_submissions rs where rs.event_id = x.ce_id and rs.status = 'pending') as ce_sub
    from ctx x
  )
  select
    v.id,
    v.type,
    case when v.acted_at is null and coalesce(v.still_valid, false) and (v.type <> 'mention' or v.read_at is null) then 'needs_you'
         when v.updated_at >= ((now() at time zone me.tz)::date::timestamp at time zone me.tz) then 'today'
         else 'earlier' end,
    v.acted_at is null and coalesce(v.still_valid, false) and (v.type <> 'mention' or v.read_at is null),
    v.act,
    case
      when v.object_kind = 'challenge' then '/challenge/' || v.object_id
      when v.object_kind = 'challenge_event' then '/event/' || v.object_id
      when v.type = 'crew_poll' or (v.type = 'mention' and v.object_kind = 'crew') then '/crew/' || v.crew_id || '/chat'
      when v.type = 'crew_member_joined' then '/crew/' || v.object_id
      when v.type = 'mention' then '/activity/' || v.a_id || '/chat'
      when v.type = 'game_on' then '/plan/' || v.p_id || '/game-on'
      when v.type = 'need_one_more' and v.i_am_in then '/plan/' || v.p_id || '/pull-in'
      when v.type = 'check_in_open' then '/activity/' || v.a_id || '/check-in'
      when v.type = 'live' then '/activity/' || v.a_id || '/live'
      when v.type = 'result_to_confirm' then '/activity/' || v.a_id || '/after'
      when v.type = 'recap_ready' then '/activity/' || v.a_id || '/recap'
      when v.object_kind = 'activity' then '/activity/' || v.a_id
      when v.object_kind = 'plan' then '/plan/' || v.p_id
      else null
    end,
    v.object_kind, v.object_id, v.p_id, v.a_id, coalesce(v.crew_id, case when v.object_kind = 'crew' then v.object_id end),
    v.message_id,
    v.visible_actors,
    coalesce(v.names, '{}'),
    greatest(v.actor_count - (cardinality(v.actor_ids) - cardinality(v.visible_actors)), 0),
    v.count,
    -- Title (suggested words; the app may compose its own from the facts).
    case v.type
      when 'need_one_more' then v.sport_name || ' needs one more.'
      when 'game_on' then 'GAME ON · ' || lower(v.sport_name) || ' ' || private.fmt_when(v.p_starts, v.place_tz)
      when 'participant_update' then
        case when cardinality(v.names) = 1 and v.count = 1 then v.names[1] || ' ' || case when (v.data ->> 'left')::boolean then 'left' else 'joined' end
             else v.count || ' changes' end || ' · ' || lower(v.sport_name)
      when 'activity_changed' then
        case v.data ->> 'change' when 'cancelled' then v.sport_name || ' ' || private.fmt_when(coalesce(v.a_starts, v.p_starts), v.place_tz) || ' is called off.'
             else v.sport_name || ' moved to ' || private.fmt_when(coalesce(v.a_starts, v.p_starts), v.place_tz) end
      when 'check_in_open' then 'Check-in opens at ' || to_char(v.a_ci_opens at time zone v.place_tz, 'FMHH12:MI')
      when 'live' then v.sport_name || ' is live.'
      when 'result_to_confirm' then 'Confirm the score.'
      when 'recap_ready' then
        case when (v.recap).team_a_score is null then 'Recap ready: ' || lower(v.sport_name)
             when (v.recap).team_a_score = (v.recap).team_b_score then 'Recap ready: ' || (v.recap).team_a_score || '–' || (v.recap).team_b_score
             when (v.recap).team_a_score > (v.recap).team_b_score then 'Recap ready: ' || coalesce((v.recap).team_a_label, 'Team A') || ' win ' || (v.recap).team_a_score || '–' || (v.recap).team_b_score
             else 'Recap ready: ' || coalesce((v.recap).team_b_label, 'Team B') || ' win ' || (v.recap).team_b_score || '–' || (v.recap).team_a_score end
      when 'run_it_back_invite' then coalesce(v.names[1], 'Someone') || ' wants to run it back.'
      when 'pull_in_invite' then coalesce(v.names[1], 'Someone') || ' pulled you in.'
      when 'waitlist_promoted' then 'You''re in. A spot opened.'
      when 'crew_poll' then v.crew_name || ': what time ' || to_char(v.p_starts at time zone v.place_tz, 'FMDay') || '?'
      when 'crew_plan' then v.crew_name || ': ' || lower(v.sport_name) || ' ' || to_char(v.p_starts at time zone v.place_tz, 'FMDay') || '?'
      when 'mention' then
        case when cardinality(v.names) > 1 then v.names[1] || ' and ' || (cardinality(v.names) - 1) || ' more mentioned you'
             else coalesce(v.names[1], 'Someone') || ' mentioned you' end
        || ' in ' || coalesce(v.crew_name, lower(v.sport_name) || ' chat') || '.'
      when 'crew_member_joined' then
        case when v.count > 1 then v.count || ' people joined ' || v.crew_name
             else coalesce(v.names[1], 'Someone') || ' joined ' || v.crew_name end
      when 'call_out' then
        case when (v.data ->> 'counter')::boolean then private.call_out_side_name(v.co_row, true) || ' countered.'
             when (v.data ->> 'rematch')::boolean then private.call_out_side_name(v.co_row, true) || ' wants a rematch.'
             when (v.co_row).format = 'crew_vs_crew' then private.call_out_side_name(v.co_row, true) || ' called '
               || private.call_out_side_name(v.co_row, false) || ' out.'
             else private.call_out_side_name(v.co_row, true) || ' called you out.' end
      when 'challenge_response' then coalesce(v.names[1], 'Someone') || ' accepted.'
      when 'challenge_posts' then
        case when v.count = 1 then 'New post in ' else v.count || ' new posts in ' end || v.ce_vs
      when 'challenge_milestone' then
        case v.data ->> 'milestone'
          when 'live' then v.ce_vs || ' is live.'
          when 'today' then v.ce_vs || ' is today.'
          when 'called_off' then v.ce_vs || ' is called off.'
          when 'result' then
            case when (v.ce_result).event_id is null then v.ce_vs || ': result in.'
                 when (v.ce_result).winner_side is null then v.ce_vs || ': a draw.'
                 else private.side_name(v.ce_row, (v.ce_result).winner_side) || ' wins.' end
        end
      when 'challenge_to_confirm' then 'Confirm the result.'
    end,
    -- Body.
    case v.type
      when 'need_one_more' then private.fmt_when(v.p_starts, v.place_tz) || coalesce(' · ' || v.place_name, '')
        || ' · ' || v.p_count || ' / ' || v.p_cap || '.'
        || case when (v.data ->> 'pull_me_in')::boolean then ' You have Pull Me In on for ' || lower(v.sport_name) || '.' else '' end
      when 'game_on' then 'All ' || v.p_cap || ' are in. ' || to_char(v.p_starts at time zone v.place_tz, 'FMHH12:MI') || coalesce(', ' || v.place_name, '') || '.'
      when 'participant_update' then v.p_count || ' / ' || v.p_cap || ' in.'
      when 'activity_changed' then coalesce(v.place_name, '')
      when 'check_in_open' then v.sport_name || coalesce(' · ' || v.place_name, '')
      when 'live' then coalesce(v.place_name, '')
      when 'result_to_confirm' then coalesce(v.names[1] || ' logged it. ', '')
        || coalesce((select coalesce(v.a_team_a, 'Team A') || ' ' || r.team_a_score || '–' || r.team_b_score || ' ' || coalesce(v.a_team_b, 'Team B')
                       || ' · ' || r.confirmations_count || ' of ' || r.threshold || ' confirmed.'
                     from public.result_proposals r where r.activity_id = v.a_id and r.status in ('proposed', 'verified')), '')
      when 'recap_ready' then
        case when v.a_after_closes > now() then 'Add photos until ' || private.fmt_when(v.a_after_closes, v.place_tz)
             else (v.recap).played_count || ' played · ' || (v.recap).duration_minutes || ' min' end
      when 'run_it_back_invite' then v.sport_name || ' · ' || private.fmt_when(v.p_starts, v.place_tz) || coalesce(' · ' || v.place_name, '')
      when 'pull_in_invite' then v.sport_name || ' · ' || private.fmt_when(v.p_starts, v.place_tz) || coalesce(' · ' || v.place_name, '')
        || ' · ' || v.p_count || ' / ' || v.p_cap
      when 'waitlist_promoted' then v.sport_name || ' · ' || private.fmt_when(v.a_starts, v.place_tz) || coalesce(' · ' || v.place_name, '')
      when 'crew_poll' then coalesce(v.names[1], 'Someone') || ' started a poll · ' || coalesce(v.votes, 0)
        || case when coalesce(v.votes, 0) = 1 then ' vote so far' else ' votes so far' end
      when 'crew_plan' then coalesce(v.names[1], 'Someone') || ' tapped MAKE THIS A GAME'
      when 'mention' then 'Open the chat to reply.'
      when 'crew_member_joined' then
        coalesce('Invited by ' || (select pr.display_name from public.profiles pr
                                    where pr.id = (v.data ->> 'invited_by')::uuid and not authz.is_blocked(pr.id, p_uid)), 'Joined with the invite code')
      when 'call_out' then (v.co_row).title || coalesce(' · ' || v.co_place, '') || ' · '
        || private.fmt_when((v.co_row).starts_at, (v.co_row).time_zone)
      when 'challenge_response' then (v.ce_row).title || ' · ' || private.fmt_when((v.ce_row).starts_at, (v.ce_row).time_zone)
        || '. The challenge is set.'
      when 'challenge_posts' then
        private.join_words(coalesce(v.names, '{}') || case when (v.data ->> 'system')::boolean then array['an Ojoro update'] else '{}'::text[] end)
        || case when v.count > 1 then ' · bundled' else '' end
      when 'challenge_milestone' then
        case v.data ->> 'milestone'
          when 'live' then 'Predictions are locked.'
          when 'today' then (v.ce_row).title || ' · ' || to_char((v.ce_row).starts_at at time zone (v.ce_row).time_zone, 'FMHH12:MI')
            || coalesce(' · ' || v.ce_place, '')
          when 'result' then (v.ce_row).title || ' · '
            || private.fmt_value((v.ce_result).a_value, (v.ce_row).scoring, (v.ce_row).unit) || ' – '
            || private.fmt_value((v.ce_result).b_value, (v.ce_row).scoring, (v.ce_row).unit)
          else (v.ce_row).title
        end
      when 'challenge_to_confirm' then coalesce(v.names[1], 'Someone') || ' sent '
        || private.side_name(v.ce_row, 'a') || ' ' || coalesce(private.fmt_value((v.ce_sub).a_value, (v.ce_row).scoring, (v.ce_row).unit), '') || ', '
        || private.side_name(v.ce_row, 'b') || ' ' || coalesce(private.fmt_value((v.ce_sub).b_value, (v.ce_row).scoring, (v.ce_row).unit), '') || '.'
      else null
    end,
    v.data, v.created_at, v.updated_at, v.read_at, v.acted_at
  from valid v
  cross join me;
$$;

-- Realtime --------------------------------------------------------------------------------------------------
-- postgres_changes respects RLS. Channels and filters: docs/COMPETITION_CONTRACT.md §Realtime.

alter publication supabase_realtime add table
  public.call_outs,
  public.challenge_events,
  public.challenge_competitors,
  public.challenge_posts,
  public.challenge_comments,
  public.challenge_polls,
  public.challenge_result_submissions;

-- Privileges -------------------------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end;
$$;
