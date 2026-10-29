-- Step 5 (Competition, PRD M6): Call-Outs, acceptance (exactly one Challenge Event) and rematches.
-- Contract: docs/COMPETITION_CONTRACT.md §Call-Outs.

-- Return shapes -------------------------------------------------------------------------------------------

create type public.call_out_state as (
  call_out_id uuid,
  status public.call_out_status,
  created boolean,
  expires_at timestamptz,
  countered_from uuid,
  event_id uuid
);

create type public.challenge_accept_state as (
  call_out_id uuid,
  event_id uuid,
  rivalry_id uuid,
  created boolean
);

create type public.rematch_state as (
  call_out_id uuid,
  event_id uuid,
  -- true: a new rematch call-out was sent; false: one was already pending (yours or theirs).
  created boolean,
  -- true: the other side had already asked, so this accepted it and made the new event.
  accepted boolean
);

-- Limits --------------------------------------------------------------------------------------------------

create or replace function private.call_outs_per_day() returns integer
language sql immutable set search_path = '' as $$ select 10 $$;
-- WHO TAKES IT? percentages are shown once this many people have predicted (PRD §10.6).
create or replace function private.prediction_min_count() returns integer
language sql immutable set search_path = '' as $$ select 5 $$;

-- Effective state -------------------------------------------------------------------------------------------

create or replace function private.call_out_status_now(o public.call_outs)
returns public.call_out_status
language sql
stable
set search_path = ''
as $$
  select case when o.status = 'proposed' and o.expires_at <= now() then 'expired'::public.call_out_status
              else o.status end;
$$;

-- The stage the app shows (ChallengeEventHero), from the stored status and the clock:
--   scheduled → accepted (first 24 h after acceptance) · days · today (event day in its time zone,
--   or within 3 h) · soon (from 30 min before the start: ALMOST TIME, check-in open) ·
--   cancelled when nobody started it within 3 h of the start time.
create or replace function private.challenge_stage(e public.challenge_events)
returns public.challenge_stage
language sql
stable
set search_path = ''
as $$
  select case
    when e.status = 'cancelled' then 'cancelled'::public.challenge_stage
    when e.status = 'complete' then 'complete'
    when e.status = 'disputed' then 'disputed'
    when e.status = 'verifying' then 'verifying'
    when e.status = 'live' then 'live'
    when now() >= e.starts_at + interval '3 hours' then 'cancelled'
    when now() >= e.starts_at - interval '30 minutes' then 'soon'
    when e.starts_at - now() <= interval '3 hours'
      or (now() at time zone e.time_zone)::date = (e.starts_at at time zone e.time_zone)::date then 'today'
    when e.accepted_at > now() - interval '24 hours' then 'accepted'
    else 'days'
  end;
$$;

-- The design system's situation for a stage (forming → confirmed → live → after).
create or replace function private.challenge_situation(p_stage public.challenge_stage)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_stage
    when 'accepted' then 'forming'
    when 'days' then 'forming'
    when 'today' then 'confirmed'
    when 'soon' then 'confirmed'
    when 'live' then 'live'
    when 'cancelled' then 'calm'
    else 'after'
  end;
$$;

-- Predictions lock at LIVE, or at the start time if it comes first (PRD §10.6).
create or replace function private.predictions_locked(e public.challenge_events)
returns boolean
language sql
stable
set search_path = ''
as $$
  select e.status <> 'scheduled' or now() >= e.starts_at or e.live_at is not null;
$$;

-- Names --------------------------------------------------------------------------------------------------

create or replace function private.side_name(e public.challenge_events, p_side public.team_side)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when e.format = 'crew_vs_crew' then
      (select c.name from public.crews c where c.id = case when p_side = 'a' then e.a_crew_id else e.b_crew_id end)
    else
      (select p.display_name from public.profiles p where p.id = case when p_side = 'a' then e.a_user_id else e.b_user_id end)
  end;
$$;

create or replace function private.call_out_side_name(o public.call_outs, p_challenger boolean)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_challenger and o.format = 'crew_vs_crew' then (select c.name from public.crews c where c.id = o.challenger_crew_id)
    when p_challenger then (select p.display_name from public.profiles p where p.id = o.challenger_id)
    when o.format = 'crew_vs_crew' then (select c.name from public.crews c where c.id = o.opponent_crew_id)
    else (select p.display_name from public.profiles p where p.id = o.opponent_id)
  end;
$$;

-- Your side in an event: as a competitor, else as a member of a side's crew (null for spectators).
create or replace function private.my_side(e public.challenge_events, p_uid uuid)
returns public.team_side
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.side from public.challenge_competitors c where c.event_id = e.id and c.user_id = p_uid),
    case when authz.is_crew_member(e.a_crew_id, p_uid) then 'a'::public.team_side
         when authz.is_crew_member(e.b_crew_id, p_uid) then 'b'::public.team_side end
  );
$$;

create or replace function private.captain_side(e public.challenge_events, p_uid uuid)
returns public.team_side
language sql
immutable
set search_path = ''
as $$
  select case when e.a_captain_id = p_uid then 'a'::public.team_side
              when e.b_captain_id = p_uid then 'b'::public.team_side end;
$$;

-- People who hear about an event: its competitors, plus followers who didn't choose quiet.
create or replace function private.challenge_audience_ids(p_event uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select c.user_id as x from public.challenge_competitors c where c.event_id = p_event
    union
    select f.user_id from public.challenge_followers f where f.event_id = p_event and not f.quiet
  ) q;
$$;

-- Counters ---------------------------------------------------------------------------------------------

create or replace function private.challenge_recount(p_event uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.challenge_events e set
    follower_count = (select count(*) from public.challenge_followers f where f.event_id = e.id),
    prediction_a = (select count(*) from public.challenge_predictions p where p.event_id = e.id and p.side = 'a'),
    prediction_b = (select count(*) from public.challenge_predictions p where p.event_id = e.id and p.side = 'b'),
    backing_a = (select count(*) from public.challenge_backings b where b.event_id = e.id and b.side = 'a'),
    backing_b = (select count(*) from public.challenge_backings b where b.event_id = e.id and b.side = 'b'),
    comment_count = (select count(*) from public.challenge_comments c where c.event_id = e.id and c.deleted_at is null),
    reaction_counts = coalesce((select jsonb_object_agg(r.reaction, r.n)
                                  from (select reaction, count(*) as n from public.challenge_reactions
                                        where event_id = e.id group by reaction) r), '{}')
  where e.id = p_event;
$$;

-- System posts (milestones). Once per milestone per event (except crowd shifts and corrections).
-- Followers hear about them in a bundled "new posts" notification.
create or replace function private.challenge_milestone(p_event uuid, p_milestone text, p_body text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.challenge_posts (event_id, kind, body, milestone)
  values (p_event, 'system', p_body, p_milestone)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    return false;
  end if;
  perform private.notify(private.challenge_audience_ids(p_event), 'challenge_posts', 'challenge_event', p_event,
                         null, 'challenge_posts:' || p_event, jsonb_build_object('system', true));
  return true;
end;
$$;

-- Find or create the rivalry between two people or two crews.
create or replace function private.rivalry_for(p_kind public.rivalry_kind, p_x uuid, p_y uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.rivalries (kind, low_id, high_id)
  values (p_kind, least(p_x, p_y), greatest(p_x, p_y))
  on conflict (kind, low_id, high_id) do nothing
  returning id into v_id;
  if v_id is null then
    select r.id into v_id from public.rivalries r
     where r.kind = p_kind and r.low_id = least(p_x, p_y) and r.high_id = greatest(p_x, p_y);
  end if;
  return v_id;
end;
$$;

-- Wins per side of a rivalry, as (low, high, draws, meetings).
create or replace function private.rivalry_record(p_rivalry uuid)
returns table (low_wins integer, high_wins integer, draws integer, meetings integer)
language sql
stable
security definer
set search_path = ''
as $$
  with x as (
    select case
             when res.winner_side is null then null
             when (res.winner_side = 'a') = (coalesce(e.a_user_id, e.a_crew_id) = r.low_id) then 'low'
             else 'high' end as w
    from public.challenge_results res
    join public.challenge_events e on e.id = res.event_id
    join public.rivalries r on r.id = res.rivalry_id
    where res.rivalry_id = p_rivalry
  )
  select count(*) filter (where w = 'low')::integer, count(*) filter (where w = 'high')::integer,
         count(*) filter (where w is null)::integer, count(*)::integer
  from x;
$$;

-- Can p_uid answer this call-out (ACCEPT / COUNTER / PASS)? p_as_crew: the crew accepting an open
-- crew call-out.
create or replace function private.can_answer_call_out(o public.call_outs, p_uid uuid, p_as_crew uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_uid <> o.challenger_id
     and not authz.is_blocked(o.challenger_id, p_uid)
     and case
       when o.format = 'person_vs_person' and o.opponent_id is not null then o.opponent_id = p_uid
       when o.format = 'person_vs_person' then authz.can_see_call_out(o.id, p_uid)
       when o.opponent_crew_id is not null then authz.crew_role(o.opponent_crew_id, p_uid) in ('owner', 'admin')
       else p_as_crew is not null and p_as_crew <> o.challenger_crew_id
            and authz.crew_role(p_as_crew, p_uid) in ('owner', 'admin')
            and authz.can_see_call_out(o.id, p_uid)
     end;
$$;

-- Who hears about a new call-out: the person, or the target crew's owner and admins.
create or replace function private.call_out_recipients(o public.call_outs)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when o.opponent_id is not null then array[o.opponent_id]
    when o.opponent_crew_id is not null then
      (select coalesce(array_agg(m.user_id), '{}') from public.crew_members m
        where m.crew_id = o.opponent_crew_id and m.role in ('owner', 'admin'))
    else '{}'::uuid[]
  end;
$$;

-- Create (shared by create_call_out, counter_call_out and the rematch) -----------------------------------

create or replace function private.create_call_out(
  p_uid uuid,
  p_sport_id text,
  p_title text,
  p_scoring public.challenge_scoring,
  p_starts_at timestamptz,
  p_opponent_id uuid,
  p_opponent_crew_id uuid,
  p_challenger_crew_id uuid,
  p_target numeric,
  p_unit text,
  p_place_id uuid,
  p_course_note text,
  p_message text,
  p_audience public.challenge_audience,
  p_side_size integer,
  p_expires_at timestamptz,
  p_countered_from uuid default null,
  p_rematch_of uuid default null,
  p_rivalry uuid default null
)
returns public.call_outs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.call_outs%rowtype;
  v_format public.challenge_format :=
    case when p_challenger_crew_id is not null then 'crew_vs_crew' else 'person_vs_person' end;
  v_tz text;
  v_pending uuid;
begin
  if not exists (select 1 from public.sports where id = p_sport_id) then
    perform private.fail('sport_unknown');
  end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 24 then
    perform private.fail('invalid_argument', 'title');
  end if;
  if p_scoring is null then
    perform private.fail('invalid_argument', 'scoring');
  end if;
  if p_starts_at is null or p_starts_at < now() + interval '1 hour' or p_starts_at > now() + interval '90 days' then
    perform private.fail('starts_at_invalid');
  end if;
  if p_target is not null and (p_target <= 0 or p_target > 999999) then
    perform private.fail('invalid_argument', 'target');
  end if;
  if p_unit is not null and p_unit not in ('km', 'min', 'rounds', 'points', 'sets', 'goals') then
    perform private.fail('invalid_argument', 'unit');
  end if;
  if char_length(p_course_note) > 140 then
    perform private.fail('invalid_argument', 'course_note');
  end if;
  if char_length(p_message) > 140 then
    perform private.fail('message_invalid', '0-140');
  end if;
  if p_place_id is not null and not exists (select 1 from public.places where id = p_place_id) then
    perform private.fail('place_unknown');
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > p_starts_at) then
    perform private.fail('expiry_invalid');
  end if;

  if v_format = 'person_vs_person' then
    if p_opponent_crew_id is not null or coalesce(p_side_size, 1) <> 1 then
      perform private.fail('invalid_argument', 'format');
    end if;
    if p_opponent_id is not null then
      if p_opponent_id = p_uid then
        perform private.fail('call_out_not_allowed');
      end if;
      if not exists (select 1 from public.profiles where id = p_opponent_id) then
        perform private.fail('user_not_found');
      end if;
      -- A block in either direction: never says which.
      if authz.is_blocked(p_uid, p_opponent_id) then
        perform private.fail('call_out_not_allowed');
      end if;
    end if;
  else
    if p_opponent_id is not null or coalesce(p_side_size, 1) not between 2 and 11 then
      perform private.fail('invalid_argument', 'format');
    end if;
    if authz.crew_role(p_challenger_crew_id, p_uid) is null then
      perform private.fail('crew_not_found');
    end if;
    if authz.crew_role(p_challenger_crew_id, p_uid) not in ('owner', 'admin') then
      perform private.fail('not_crew_admin');
    end if;
    if p_opponent_crew_id is not null then
      if p_opponent_crew_id = p_challenger_crew_id
         or not exists (select 1 from public.crews c where c.id = p_opponent_crew_id and c.archived_at is null) then
        perform private.fail('call_out_not_allowed');
      end if;
      -- Nobody who speaks for the other crew has a block with you.
      if exists (select 1 from public.crew_members m
                 where m.crew_id = p_opponent_crew_id and m.role in ('owner', 'admin')
                   and authz.is_blocked(m.user_id, p_uid)) then
        perform private.fail('call_out_not_allowed');
      end if;
    end if;
  end if;

  if (select count(*) from public.call_outs o
      where o.challenger_id = p_uid and o.created_at > now() - interval '24 hours') >= private.call_outs_per_day() then
    perform private.fail('call_out_rate_limited', private.call_outs_per_day()::text);
  end if;
  -- One open call-out at a time between the same two sides.
  select o.id into v_pending from public.call_outs o
   where o.status = 'proposed' and o.expires_at > now()
     and ((v_format = 'person_vs_person' and p_opponent_id is not null
           and ((o.challenger_id = p_uid and o.opponent_id = p_opponent_id)
                or (o.challenger_id = p_opponent_id and o.opponent_id = p_uid)))
          or (v_format = 'crew_vs_crew' and p_opponent_crew_id is not null
              and ((o.challenger_crew_id = p_challenger_crew_id and o.opponent_crew_id = p_opponent_crew_id)
                   or (o.challenger_crew_id = p_opponent_crew_id and o.opponent_crew_id = p_challenger_crew_id))))
     and o.id is distinct from p_countered_from
   limit 1;
  if v_pending is not null then
    perform private.fail('call_out_pending', v_pending::text);
  end if;

  v_tz := coalesce((select pl.time_zone from public.places pl where pl.id = p_place_id),
                   (select pr.time_zone from public.profiles pr where pr.id = p_uid), 'America/Toronto');

  insert into public.call_outs (
    format, sport_id, title, scoring, target, unit, place_id, course_note, starts_at, time_zone, message,
    audience, side_size, challenger_id, challenger_crew_id, opponent_id, opponent_crew_id, expires_at,
    countered_from, rematch_of_event_id, rivalry_id
  ) values (
    v_format, p_sport_id, trim(p_title), p_scoring, p_target, p_unit, p_place_id, nullif(trim(p_course_note), ''),
    p_starts_at, v_tz, nullif(trim(p_message), ''), coalesce(p_audience, 'public'), coalesce(p_side_size, 1), p_uid,
    p_challenger_crew_id, p_opponent_id, p_opponent_crew_id,
    coalesce(p_expires_at, least(p_starts_at - interval '30 minutes', now() + interval '72 hours')),
    p_countered_from, p_rematch_of, p_rivalry
  )
  returning * into v_o;

  perform private.notify(private.call_out_recipients(v_o), 'call_out', 'challenge', v_o.id, p_uid,
                         'call_out:' || v_o.id, jsonb_build_object('rematch', p_rematch_of is not null,
                                                                  'counter', p_countered_from is not null),
                         p_crew => v_o.opponent_crew_id);
  perform private.emit('callout_sent', p_uid, jsonb_build_object(
    'call_out_id', v_o.id, 'format', v_format, 'sport_id', p_sport_id, 'scoring', p_scoring,
    'open', p_opponent_id is null and p_opponent_crew_id is null, 'counter', p_countered_from is not null,
    'rematch', p_rematch_of is not null));
  return v_o;
end;
$$;

-- Accept (shared by accept_call_out and the rematch) -----------------------------------------------------
-- Locks the call-out row, so a double tap or two people accepting an open call-out at once make
-- exactly one event: the second call sees `accepted` and gets the same event (if it's theirs) or
-- call_out_closed. challenge_events.call_out_id is unique as a second guard.
create or replace function private.accept_call_out(p_call_out uuid, p_uid uuid, p_as_crew uuid)
returns public.challenge_accept_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.call_outs%rowtype;
  v_e public.challenge_events%rowtype;
  v_b_crew uuid;
  v_rivalry uuid;
  v_event uuid;
begin
  select * into v_o from public.call_outs where id = p_call_out for update;
  if not found or not authz.can_see_call_out(p_call_out, p_uid) then
    perform private.fail('call_out_not_found');
  end if;
  if v_o.status = 'accepted' then
    select * into v_e from public.challenge_events where id = v_o.event_id;
    if p_uid in (v_e.a_captain_id, v_e.b_captain_id) or authz.is_challenge_competitor(v_e.id, p_uid) then
      return row(v_o.id, v_e.id, v_e.rivalry_id, false)::public.challenge_accept_state;
    end if;
    perform private.fail('call_out_closed');
  end if;
  if v_o.status <> 'proposed' then
    perform private.fail('call_out_closed');
  end if;
  if private.call_out_status_now(v_o) = 'expired' or v_o.starts_at <= now() then
    perform private.fail('call_out_expired');
  end if;
  if not private.can_answer_call_out(v_o, p_uid, p_as_crew) then
    perform private.fail('call_out_not_allowed');
  end if;

  if v_o.format = 'crew_vs_crew' then
    v_b_crew := coalesce(v_o.opponent_crew_id, p_as_crew);
    v_rivalry := coalesce(v_o.rivalry_id, private.rivalry_for('crews', v_o.challenger_crew_id, v_b_crew));
  else
    v_rivalry := coalesce(v_o.rivalry_id, private.rivalry_for('people', v_o.challenger_id, p_uid));
  end if;

  insert into public.challenge_events (
    call_out_id, format, sport_id, title, scoring, target, unit, place_id, course_note, starts_at, time_zone,
    audience, verification, side_size, rivalry_id, rematch_of_event_id,
    a_user_id, b_user_id, a_crew_id, b_crew_id, a_captain_id, b_captain_id, check_in_opens_at
  ) values (
    v_o.id, v_o.format, v_o.sport_id, v_o.title, v_o.scoring, v_o.target, v_o.unit, v_o.place_id, v_o.course_note,
    v_o.starts_at, v_o.time_zone, v_o.audience, v_o.verification, v_o.side_size, v_rivalry, v_o.rematch_of_event_id,
    case when v_o.format = 'person_vs_person' then v_o.challenger_id end,
    case when v_o.format = 'person_vs_person' then p_uid end,
    v_o.challenger_crew_id, v_b_crew, v_o.challenger_id, p_uid, v_o.starts_at - interval '60 minutes'
  )
  on conflict (call_out_id) do nothing
  returning id into v_event;
  if v_event is null then
    -- Unreachable while the row lock holds; kept so a duplicate can never be made.
    select id into v_event from public.challenge_events where call_out_id = v_o.id;
    return row(v_o.id, v_event, v_rivalry, false)::public.challenge_accept_state;
  end if;

  insert into public.challenge_competitors (event_id, user_id, side, is_captain)
  values (v_event, v_o.challenger_id, 'a', true), (v_event, p_uid, 'b', true);

  update public.call_outs
     set status = 'accepted', responded_at = now(), responded_by = p_uid, event_id = v_event, rivalry_id = v_rivalry
   where id = v_o.id;

  perform private.challenge_milestone(v_event, 'set', 'THE CHALLENGE IS SET.');
  perform private.notify(array[v_o.challenger_id], 'challenge_response', 'challenge_event', v_event, p_uid,
                         'challenge_response:' || v_o.id, jsonb_build_object('response', 'accepted'));
  perform private.emit('callout_accepted', p_uid, jsonb_build_object('call_out_id', v_o.id, 'event_id', v_event));
  perform private.emit('challenge_event_created', p_uid, jsonb_build_object(
    'event_id', v_event, 'call_out_id', v_o.id, 'format', v_o.format, 'sport_id', v_o.sport_id,
    'rematch', v_o.rematch_of_event_id is not null));
  if v_o.rematch_of_event_id is not null then
    perform private.emit('challenge_rematch_accepted', p_uid, jsonb_build_object(
      'event_id', v_event, 'rematch_of_event_id', v_o.rematch_of_event_id));
  end if;
  return row(v_o.id, v_event, v_rivalry, true)::public.challenge_accept_state;
end;
$$;

-- Public RPCs -----------------------------------------------------------------------------------------------

-- Send a Call-Out to a person (p_opponent_id), a crew (p_challenger_crew_id + p_opponent_crew_id),
-- or open (no opponent). Verification is participant confirmation until device data (M10).
create or replace function public.create_call_out(
  p_idempotency_key uuid,
  p_sport_id text,
  p_title text,
  p_scoring public.challenge_scoring,
  p_starts_at timestamptz,
  p_opponent_id uuid default null,
  p_opponent_crew_id uuid default null,
  p_challenger_crew_id uuid default null,
  p_target numeric default null,
  p_unit text default null,
  p_place_id uuid default null,
  p_course_note text default null,
  p_message text default null,
  p_audience public.challenge_audience default 'public',
  p_side_size integer default null,
  p_expires_at timestamptz default null
)
returns public.call_out_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_o public.call_outs%rowtype;
  v_state public.call_out_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_call_out');
  if v_prior is not null then
    v_state := jsonb_populate_record(null::public.call_out_state, v_prior);
    v_state.created := false;
    return v_state;
  end if;
  v_o := private.create_call_out(
    v_uid, p_sport_id, p_title, p_scoring, p_starts_at, p_opponent_id, p_opponent_crew_id, p_challenger_crew_id,
    p_target, p_unit, p_place_id, p_course_note, p_message, p_audience,
    coalesce(p_side_size, case when p_challenger_crew_id is not null then 5 else 1 end), p_expires_at);
  v_state := row(v_o.id, v_o.status, true, v_o.expires_at, null, null)::public.call_out_state;
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- ACCEPT. Creates the Challenge Event in this transaction, exactly once. p_as_crew_id: the crew you
-- accept for, only for an open crew call-out.
create or replace function public.accept_call_out(
  p_call_out_id uuid, p_idempotency_key uuid, p_as_crew_id uuid default null
)
returns public.challenge_accept_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_state public.challenge_accept_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'accept_call_out:' || p_call_out_id);
  if v_prior is not null then
    v_state := jsonb_populate_record(null::public.challenge_accept_state, v_prior);
    v_state.created := false;
    return v_state;
  end if;
  v_state := private.accept_call_out(p_call_out_id, v_uid, p_as_crew_id);
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- COUNTER: a new call-out back to the challenger with the changes (time, distance, course, rules);
-- the original becomes `countered`. Sides and format don't change. Pass only what changes.
create or replace function public.counter_call_out(
  p_call_out_id uuid,
  p_idempotency_key uuid,
  p_starts_at timestamptz default null,
  p_title text default null,
  p_target numeric default null,
  p_unit text default null,
  p_place_id uuid default null,
  p_course_note text default null,
  p_message text default null
)
returns public.call_out_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_o public.call_outs%rowtype;
  v_new public.call_outs%rowtype;
  v_state public.call_out_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'counter_call_out:' || p_call_out_id);
  if v_prior is not null then
    v_state := jsonb_populate_record(null::public.call_out_state, v_prior);
    v_state.created := false;
    return v_state;
  end if;
  select * into v_o from public.call_outs where id = p_call_out_id for update;
  if not found or not authz.can_see_call_out(p_call_out_id, v_uid) then
    perform private.fail('call_out_not_found');
  end if;
  if v_o.status <> 'proposed' then
    perform private.fail('call_out_closed');
  end if;
  if private.call_out_status_now(v_o) = 'expired' then
    perform private.fail('call_out_expired');
  end if;
  -- Open call-outs have nobody to counter them: accept or leave them.
  if v_o.opponent_id is null and v_o.opponent_crew_id is null then
    perform private.fail('invalid_argument', 'open');
  end if;
  if not private.can_answer_call_out(v_o, v_uid) then
    perform private.fail('call_out_not_allowed');
  end if;
  if (p_starts_at is null or p_starts_at = v_o.starts_at)
     and (p_title is null or trim(p_title) = v_o.title)
     and (p_target is null or p_target = v_o.target)
     and (p_unit is null or p_unit = v_o.unit)
     and (p_place_id is null or p_place_id = v_o.place_id)
     and (p_course_note is null or trim(p_course_note) = coalesce(v_o.course_note, '')) then
    perform private.fail('invalid_argument', 'nothing changed');
  end if;

  update public.call_outs set status = 'countered', responded_at = now(), responded_by = v_uid where id = v_o.id;
  v_new := private.create_call_out(
    v_uid, v_o.sport_id, coalesce(p_title, v_o.title), v_o.scoring, coalesce(p_starts_at, v_o.starts_at),
    case when v_o.format = 'person_vs_person' then v_o.challenger_id end,
    v_o.challenger_crew_id,
    v_o.opponent_crew_id,
    coalesce(p_target, v_o.target), coalesce(p_unit, v_o.unit), coalesce(p_place_id, v_o.place_id),
    coalesce(p_course_note, v_o.course_note), p_message, v_o.audience, v_o.side_size, null,
    v_o.id, v_o.rematch_of_event_id, v_o.rivalry_id);

  -- The challenger hears about it as a call-out (data.counter = true): COUNTERED, then REPLY.
  perform private.emit('callout_countered', v_uid, jsonb_build_object('call_out_id', v_o.id, 'counter_id', v_new.id));
  v_state := row(v_new.id, v_new.status, true, v_new.expires_at, v_o.id, null)::public.call_out_state;
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- PASS. Declines quietly: the challenger sees the status, nobody gets a notification. Idempotent.
create or replace function public.decline_call_out(p_call_out_id uuid)
returns public.call_out_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_o public.call_outs%rowtype;
begin
  select * into v_o from public.call_outs where id = p_call_out_id for update;
  if not found or not authz.can_see_call_out(p_call_out_id, v_uid) then
    perform private.fail('call_out_not_found');
  end if;
  if v_o.status = 'declined' and v_o.responded_by = v_uid then
    return row(v_o.id, v_o.status, false, v_o.expires_at, v_o.countered_from, v_o.event_id)::public.call_out_state;
  end if;
  if v_o.status <> 'proposed' or private.call_out_status_now(v_o) = 'expired' then
    perform private.fail('call_out_closed');
  end if;
  if v_o.opponent_id is null and v_o.opponent_crew_id is null then
    perform private.fail('invalid_argument', 'open');
  end if;
  if not private.can_answer_call_out(v_o, v_uid) then
    perform private.fail('call_out_not_allowed');
  end if;
  update public.call_outs set status = 'declined', responded_at = now(), responded_by = v_uid
   where id = v_o.id returning * into v_o;
  perform private.emit('callout_declined', v_uid, jsonb_build_object('call_out_id', v_o.id,
                                                                     'rematch', v_o.rematch_of_event_id is not null));
  return row(v_o.id, v_o.status, true, v_o.expires_at, v_o.countered_from, v_o.event_id)::public.call_out_state;
end;
$$;

-- The challenger takes a pending call-out back. Idempotent.
create or replace function public.withdraw_call_out(p_call_out_id uuid)
returns public.call_out_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_o public.call_outs%rowtype;
begin
  select * into v_o from public.call_outs where id = p_call_out_id for update;
  if not found or not authz.can_see_call_out(p_call_out_id, v_uid) then
    perform private.fail('call_out_not_found');
  end if;
  if v_o.challenger_id <> v_uid then
    perform private.fail('call_out_not_allowed');
  end if;
  if v_o.status = 'withdrawn' then
    return row(v_o.id, v_o.status, false, v_o.expires_at, v_o.countered_from, v_o.event_id)::public.call_out_state;
  end if;
  if v_o.status <> 'proposed' then
    perform private.fail('call_out_closed');
  end if;
  update public.call_outs set status = 'withdrawn', responded_at = now(), responded_by = v_uid
   where id = v_o.id returning * into v_o;
  return row(v_o.id, v_o.status, true, v_o.expires_at, v_o.countered_from, v_o.event_id)::public.call_out_state;
end;
$$;

-- RUN IT BACK after a complete event (Result, Rivalry). Captains only. If the other side already
-- asked for a rematch, this accepts it (a new linked Challenge Event); if you already asked, it
-- returns that call-out; otherwise it sends a new call-out with the same rules, linked to the event
-- and the rivalry, two weeks on at the same time (or p_starts_at). The finished event is untouched.
create or replace function public.run_it_back_challenge(
  p_event_id uuid,
  p_idempotency_key uuid,
  p_starts_at timestamptz default null,
  p_message text default null
)
returns public.rematch_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_e public.challenge_events%rowtype;
  v_side public.team_side;
  v_o public.call_outs%rowtype;
  v_acc public.challenge_accept_state;
  v_state public.rematch_state;
  v_start timestamptz;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'run_it_back_challenge:' || p_event_id);
  if v_prior is not null then
    v_state := jsonb_populate_record(null::public.rematch_state, v_prior);
    v_state.created := false;
    return v_state;
  end if;
  select * into v_e from public.challenge_events where id = p_event_id;
  if not found or not authz.can_see_challenge_event(p_event_id, v_uid) then
    perform private.fail('challenge_event_not_found');
  end if;
  v_side := private.captain_side(v_e, v_uid);
  if v_side is null then
    perform private.fail('not_competitor');
  end if;
  if v_e.status <> 'complete' then
    perform private.fail('rematch_not_available');
  end if;
  -- Serialize rematch requests for this event.
  perform 1 from public.challenge_events where id = v_e.id for update;

  -- Theirs, waiting for you: accept it.
  select * into v_o from public.call_outs o
   where o.rematch_of_event_id = v_e.id and o.status = 'proposed' and o.expires_at > now()
     and o.challenger_id <> v_uid and private.can_answer_call_out(o, v_uid)
   order by o.created_at desc limit 1;
  if found then
    v_acc := private.accept_call_out(v_o.id, v_uid, null);
    v_state := row(v_o.id, v_acc.event_id, false, true)::public.rematch_state;
    perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
    return v_state;
  end if;
  -- Yours, still pending.
  select * into v_o from public.call_outs o
   where o.rematch_of_event_id = v_e.id and o.status = 'proposed' and o.expires_at > now()
     and o.challenger_id = v_uid
   order by o.created_at desc limit 1;
  if found then
    v_state := row(v_o.id, null, false, false)::public.rematch_state;
    perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
    return v_state;
  end if;

  -- Two weeks on at the same local time (DST-safe), a week later at a time until it's a day away.
  v_start := coalesce(p_starts_at, ((v_e.starts_at at time zone v_e.time_zone) + interval '14 days') at time zone v_e.time_zone);
  while p_starts_at is null and v_start < now() + interval '1 day' loop
    v_start := ((v_start at time zone v_e.time_zone) + interval '7 days') at time zone v_e.time_zone;
  end loop;
  v_o := private.create_call_out(
    v_uid, v_e.sport_id, v_e.title, v_e.scoring, v_start,
    case when v_e.format = 'person_vs_person' then case when v_side = 'a' then v_e.b_user_id else v_e.a_user_id end end,
    case when v_e.format = 'crew_vs_crew' then case when v_side = 'a' then v_e.b_crew_id else v_e.a_crew_id end end,
    case when v_e.format = 'crew_vs_crew' then case when v_side = 'a' then v_e.a_crew_id else v_e.b_crew_id end end,
    v_e.target, v_e.unit, v_e.place_id, v_e.course_note, p_message, v_e.audience, v_e.side_size, null,
    null, v_e.id, v_e.rivalry_id);
  perform private.emit('challenge_rematch_requested', v_uid, jsonb_build_object('event_id', v_e.id, 'call_out_id', v_o.id));
  v_state := row(v_o.id, null, true, false)::public.rematch_state;
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- Reads -------------------------------------------------------------------------------------------------

-- CallOut screen, and every call-out row (Compete's INCOMING CALL-OUT, Rivalry's REMATCH?).
-- Record and games together are from the challenger's side ("rivalry 3–4" = challenger 3, them 4).
create or replace function public.call_out_view(p_call_out_id uuid)
returns table (
  id uuid,
  status public.call_out_status,
  format public.challenge_format,
  sport_id text,
  sport_name text,
  title text,
  scoring public.challenge_scoring,
  target numeric,
  unit text,
  place_id uuid,
  place_name text,
  place_area text,
  place_city text,
  course_note text,
  starts_at timestamptz,
  time_zone text,
  message text,
  audience public.challenge_audience,
  verification public.challenge_verification_method,
  side_size integer,
  is_open boolean,
  challenger_id uuid,
  challenger_name text,
  challenger_avatar_path text,
  challenger_crew_id uuid,
  opponent_id uuid,
  opponent_name text,
  opponent_avatar_path text,
  opponent_crew_id uuid,
  is_mine boolean,
  can_answer boolean,
  games_together integer,
  rivalry_id uuid,
  rivalry_challenger_wins integer,
  rivalry_opponent_wins integer,
  rivalry_draws integer,
  countered_from uuid,
  counter_id uuid,
  rematch_of_event_id uuid,
  event_id uuid,
  expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz,
  server_now timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_o public.call_outs%rowtype;
  v_riv uuid;
  v_low boolean;
  v_lw integer := 0;
  v_hw integer := 0;
  v_dr integer := 0;
begin
  select * into v_o from public.call_outs o where o.id = p_call_out_id;
  if not found or not authz.can_see_call_out(p_call_out_id, v_uid) then
    perform private.fail('call_out_not_found');
  end if;
  v_riv := coalesce(v_o.rivalry_id, (
    select r.id from public.rivalries r
     where (v_o.format = 'person_vs_person' and r.kind = 'people'
            and r.low_id = least(v_o.challenger_id, v_o.opponent_id) and r.high_id = greatest(v_o.challenger_id, v_o.opponent_id))
        or (v_o.format = 'crew_vs_crew' and r.kind = 'crews'
            and r.low_id = least(v_o.challenger_crew_id, v_o.opponent_crew_id)
            and r.high_id = greatest(v_o.challenger_crew_id, v_o.opponent_crew_id))));
  if v_riv is not null then
    select x.low_wins, x.high_wins, x.draws into v_lw, v_hw, v_dr from private.rivalry_record(v_riv) x;
    v_low := (select r.low_id from public.rivalries r where r.id = v_riv)
             = coalesce(v_o.challenger_crew_id, v_o.challenger_id);
  end if;
  return query
  select v_o.id, private.call_out_status_now(v_o), v_o.format, v_o.sport_id, s.name, v_o.title, v_o.scoring, v_o.target,
         v_o.unit, v_o.place_id, pl.name, pl.area, pl.city, v_o.course_note, v_o.starts_at, v_o.time_zone, v_o.message,
         v_o.audience, v_o.verification, v_o.side_size, v_o.opponent_id is null and v_o.opponent_crew_id is null,
         v_o.challenger_id, private.call_out_side_name(v_o, true),
         (select pr.avatar_path from public.profiles pr where pr.id = v_o.challenger_id),
         v_o.challenger_crew_id, v_o.opponent_id, private.call_out_side_name(v_o, false),
         (select pr.avatar_path from public.profiles pr where pr.id = v_o.opponent_id),
         v_o.opponent_crew_id, v_o.challenger_id = v_uid,
         private.call_out_status_now(v_o) = 'proposed' and v_o.starts_at > now()
           and private.can_answer_call_out(v_o, v_uid,
                 case when v_o.format = 'crew_vs_crew' and v_o.opponent_crew_id is null then
                   (select m.crew_id from public.crew_members m
                     where m.user_id = v_uid and m.role in ('owner', 'admin') and m.crew_id <> v_o.challenger_crew_id
                     limit 1) end),
         case when v_o.opponent_id is not null then authz.games_together(v_o.challenger_id, v_o.opponent_id) end,
         v_riv,
         case when v_low then v_lw else v_hw end,
         case when v_low then v_hw else v_lw end,
         v_dr,
         v_o.countered_from,
         (select c.id from public.call_outs c where c.countered_from = v_o.id order by c.created_at desc limit 1),
         v_o.rematch_of_event_id, v_o.event_id, v_o.expires_at, v_o.responded_at, v_o.created_at, now()
  from public.sports s
  left join public.places pl on pl.id = v_o.place_id
  where s.id = v_o.sport_id;
end;
$$;

-- Compete: call-outs to you (or your crews, if you speak for them) and from you.
--   p_box: 'incoming' (default) · 'outgoing' · 'all'. Pending first, newest first.
create or replace function public.my_call_outs(p_box text default 'incoming', p_limit integer default 20)
returns table (
  id uuid,
  status public.call_out_status,
  direction text,
  format public.challenge_format,
  sport_id text,
  title text,
  starts_at timestamptz,
  time_zone text,
  place_name text,
  challenger_id uuid,
  challenger_name text,
  opponent_name text,
  is_rematch boolean,
  is_counter boolean,
  event_id uuid,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if p_box not in ('incoming', 'outgoing', 'all') then
    perform private.fail('invalid_argument', 'box');
  end if;
  return query
  select o.id, private.call_out_status_now(o),
         case when o.challenger_id = v_uid then 'outgoing' else 'incoming' end,
         o.format, o.sport_id, o.title, o.starts_at, o.time_zone, pl.name, o.challenger_id,
         private.call_out_side_name(o, true), private.call_out_side_name(o, false),
         o.rematch_of_event_id is not null, o.countered_from is not null, o.event_id, o.expires_at, o.created_at
  from public.call_outs o
  left join public.places pl on pl.id = o.place_id
  where authz.can_see_call_out(o.id, v_uid)
    and (
      (p_box in ('outgoing', 'all') and o.challenger_id = v_uid)
      or (p_box in ('incoming', 'all') and o.challenger_id <> v_uid
          and (o.opponent_id = v_uid
               or authz.crew_role(o.opponent_crew_id, v_uid) in ('owner', 'admin')))
    )
    and (o.status = 'proposed' or coalesce(o.responded_at, o.expires_at) > now() - interval '7 days')
  order by (private.call_out_status_now(o) = 'proposed') desc, o.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;
