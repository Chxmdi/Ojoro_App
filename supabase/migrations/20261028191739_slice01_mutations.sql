-- Slice 01 mutations. Every write a client makes goes through one of these functions.
--
-- Conventions (docs/SLICE01_CONTRACT.md):
--   * Errors are raised with SQLSTATE P0001 and a stable lower_snake code as the message
--     (`error.message` in supabase-js). `detail` may carry a value the UI shows (a time, a count).
--   * Functions that change membership, capacity or attendance take p_idempotency_key (uuid, made by
--     the client once per user intent and reused on retry). A retry returns the first result.
--   * SECURITY DEFINER with search_path = '' and an explicit auth.uid() check, because clients have
--     no write privileges on these tables.

-- Return shapes -------------------------------------------------------------------------------------

create type public.plan_state as (
  plan_id uuid,
  status public.plan_status,
  member_count integer,
  capacity integer,
  is_member boolean,
  changed boolean,
  activity_id uuid,
  starts_at timestamptz
);

create type public.attendance_state as (
  activity_id uuid,
  status public.attendance_status,
  waitlist_position integer,
  confirmed_count integer,
  waitlist_count integer,
  checked_in_count integer,
  capacity integer,
  changed boolean,
  promoted_user_id uuid
);

create type public.down_for_state as (
  signal_id uuid,
  status public.signal_status,
  created boolean,
  expires_at timestamptz,
  matched_plan_id uuid,
  plan_created boolean
);

create type public.pull_in_result as (
  sent integer,
  skipped integer,
  remaining integer
);

create type public.result_state as (
  proposal_id uuid,
  activity_id uuid,
  status public.proposal_status,
  team_a_score integer,
  team_b_score integer,
  confirmations_count integer,
  threshold integer,
  verification_level public.verification_level,
  recap_id uuid
);

create type public.location_share_state as (
  activity_id uuid,
  sharing boolean,
  expires_at timestamptz
);

create type public.run_it_back_state as (
  plan_id uuid,
  created boolean,
  invites_sent integer,
  starts_at timestamptz,
  chain_length integer
);

-- Private helpers -----------------------------------------------------------------------------------

create or replace function private.fail(p_code text, p_detail text default null)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = coalesce(p_detail, '');
end;
$$;

create or replace function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    perform private.fail('not_authenticated');
  end if;
  return v_uid;
end;
$$;

-- Claim an idempotency key. Returns the stored result if this key already completed, or null if
-- the caller now owns the key and must call private.idem_store() before returning. A concurrent call
-- with the same key waits on the insert and then reads the first call's result.
create or replace function private.idem_claim(p_uid uuid, p_key uuid, p_operation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.idempotency_keys%rowtype;
begin
  if p_key is null then
    perform private.fail('idempotency_key_required');
  end if;
  insert into private.idempotency_keys (user_id, key, operation)
  values (p_uid, p_key, p_operation)
  on conflict (user_id, key) do nothing;
  if found then
    return null;
  end if;
  select * into v_row from private.idempotency_keys k where k.user_id = p_uid and k.key = p_key;
  if v_row.operation <> p_operation then
    perform private.fail('idempotency_key_reused');
  end if;
  return v_row.result;
end;
$$;

create or replace function private.idem_store(p_uid uuid, p_key uuid, p_result jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.idempotency_keys set result = p_result where user_id = p_uid and key = p_key;
$$;

create or replace function private.emit(p_name text, p_user uuid, p_payload jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.analytics_events (name, user_id, payload) values (p_name, p_user, p_payload);
$$;

-- Great-circle distance in metres.
create or replace function private.distance_m(
  p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision
)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  ));
$$;

-- Effective statuses from timestamps (same rules as the plan_cards / activity_cards views).
create or replace function private.plan_status_now(p public.plans)
returns public.plan_status
language sql
stable
set search_path = ''
as $$
  select case when p.status = 'forming' and p.deadline_at <= now() then 'expired'::public.plan_status
              else p.status end;
$$;

create or replace function private.activity_status_now(a public.activities)
returns public.activity_status
language sql
stable
set search_path = ''
as $$
  select case
    when a.status = 'cancelled' then 'cancelled'::public.activity_status
    when a.status = 'complete' or a.after_closes_at <= now() then 'complete'::public.activity_status
    when coalesce(a.ended_at, a.ends_at) <= now() then 'after'::public.activity_status
    when coalesce(a.live_at, a.starts_at) <= now() then 'live'::public.activity_status
    else 'confirmed'::public.activity_status
  end;
$$;

create or replace function private.plan_state_of(p_plan uuid, p_uid uuid, p_changed boolean)
returns public.plan_state
language sql
stable
security definer
set search_path = ''
as $$
  select row(
    p.id,
    private.plan_status_now(p),
    p.member_count,
    p.capacity,
    exists (select 1 from public.plan_members m where m.plan_id = p.id and m.user_id = p_uid),
    p_changed,
    (select a.id from public.activities a where a.plan_id = p.id),
    p.starts_at
  )::public.plan_state
  from public.plans p
  where p.id = p_plan;
$$;

create or replace function private.attendance_state_of(
  p_activity uuid, p_uid uuid, p_changed boolean, p_promoted uuid default null
)
returns public.attendance_state
language sql
stable
security definer
set search_path = ''
as $$
  select row(
    a.id,
    t.status,
    case when t.status = 'waitlisted' then (
      select count(*)::integer from public.attendance w
      where w.activity_id = a.id and w.status = 'waitlisted' and w.waitlisted_at <= t.waitlisted_at
    ) end,
    a.confirmed_count,
    a.waitlist_count,
    a.checked_in_count,
    a.capacity,
    p_changed,
    p_promoted
  )::public.attendance_state
  from public.activities a
  left join public.attendance t on t.activity_id = a.id and t.user_id = p_uid
  where a.id = p_activity;
$$;

-- GAME ON: lock the plan and create exactly one Activity with attendance for every member.
-- Called with the plan row already locked by the caller (FOR UPDATE).
create or replace function private.promote_plan(p_plan uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_start timestamptz;
  v_activity uuid;
begin
  select * into v_plan from public.plans where id = p_plan for update;
  if v_plan.status <> 'forming' then
    select a.id into v_activity from public.activities a where a.plan_id = p_plan;
    return v_activity;
  end if;

  -- The time poll decides: most votes, earliest on a tie. No votes keeps the proposed time.
  select o.starts_at into v_start
  from public.plan_time_options o
  where o.plan_id = p_plan and o.vote_count > 0
  order by o.vote_count desc, o.starts_at asc
  limit 1;
  v_start := coalesce(v_start, v_plan.starts_at);

  update public.plans
     set status = 'game_on', locked_at = now(), starts_at = v_start,
         deadline_at = least(deadline_at, v_start)
   where id = p_plan;

  insert into public.activities (
    plan_id, sport_id, title, starts_at, ends_at, place_id, capacity, host_id,
    level_label, team_a_label, team_b_label, teams_note, kit_note, cost_cents, currency,
    attendance_rule, check_in_opens_at, check_in_closes_at, after_closes_at
  ) values (
    p_plan, v_plan.sport_id, v_plan.title, v_start,
    v_start + make_interval(mins => v_plan.duration_minutes),
    v_plan.place_id, v_plan.capacity, v_plan.host_id,
    v_plan.level_label, v_plan.team_a_label, v_plan.team_b_label, v_plan.teams_note,
    v_plan.kit_note, v_plan.cost_cents, v_plan.currency, v_plan.attendance_rule,
    v_start - interval '30 minutes',
    v_start + make_interval(mins => v_plan.duration_minutes),
    v_start + make_interval(mins => v_plan.duration_minutes) + interval '24 hours'
  )
  on conflict (plan_id) do nothing
  returning id into v_activity;

  if v_activity is null then
    select a.id into v_activity from public.activities a where a.plan_id = p_plan;
    return v_activity;
  end if;

  insert into public.attendance (activity_id, user_id, status, confirmed_at)
  select v_activity, m.user_id, 'confirmed', now()
  from public.plan_members m
  where m.plan_id = p_plan
  on conflict (activity_id, user_id) do nothing;

  update public.activities
     set confirmed_count = (select count(*) from public.attendance t
                            where t.activity_id = v_activity and t.status in ('confirmed', 'checked_in'))
   where id = v_activity;

  update public.plan_invites set status = 'expired', responded_at = now()
   where plan_id = p_plan and status = 'pending';

  perform private.emit('game_on_reached', v_plan.host_id,
    jsonb_build_object('plan_id', p_plan, 'activity_id', v_activity, 'capacity', v_plan.capacity,
                       'source', v_plan.source));
  return v_activity;
end;
$$;

-- Join a plan (I'M DOWN). Locks the plan row, so concurrent joins are serialized and capacity holds.
create or replace function private.join_plan(p_plan uuid, p_uid uuid, p_via public.member_via)
returns public.plan_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_via public.member_via := p_via;
  v_count integer;
begin
  select * into v_plan from public.plans where id = p_plan for update;
  if not found or not authz.can_see_plan(p_plan, p_uid) then
    perform private.fail('plan_not_found');
  end if;

  if exists (select 1 from public.plan_members m where m.plan_id = p_plan and m.user_id = p_uid) then
    return private.plan_state_of(p_plan, p_uid, false);
  end if;

  if v_plan.status = 'cancelled' then
    perform private.fail('plan_cancelled');
  elsif v_plan.status = 'game_on' then
    perform private.fail('plan_full',
      (select a.id::text from public.activities a where a.plan_id = p_plan));
  elsif private.plan_status_now(v_plan) = 'expired' then
    perform private.fail('plan_expired');
  end if;

  if exists (
    select 1 from public.plan_members m where m.plan_id = p_plan and authz.is_blocked(m.user_id, p_uid)
  ) then
    perform private.fail('plan_unavailable');
  end if;

  if v_plan.member_count >= v_plan.capacity then
    perform private.fail('plan_full');
  end if;

  update public.plan_invites
     set status = 'accepted', responded_at = now()
   where plan_id = p_plan and invitee_id = p_uid and status = 'pending';
  if found and v_via = 'im_down' then
    v_via := 'invite';
  end if;

  insert into public.plan_members (plan_id, user_id, via) values (p_plan, p_uid, v_via);
  update public.plans set member_count = member_count + 1 where id = p_plan
    returning member_count into v_count;

  -- The person's matching Down For is now spoken for.
  update public.intent_signals
     set status = 'matched', matched_plan_id = p_plan
   where user_id = p_uid and sport_id = v_plan.sport_id and status = 'active'
     and window_start <= v_plan.starts_at and window_end > v_plan.starts_at;

  perform private.emit('im_down_committed', p_uid,
    jsonb_build_object('plan_id', p_plan, 'via', v_via, 'count', v_count, 'capacity', v_plan.capacity));
  perform private.emit('plan_threshold_changed', p_uid,
    jsonb_build_object('plan_id', p_plan, 'count', v_count, 'capacity', v_plan.capacity));

  if v_count >= v_plan.capacity then
    perform private.promote_plan(p_plan);
  end if;

  return private.plan_state_of(p_plan, p_uid, true);
end;
$$;

-- Profile and onboarding ------------------------------------------------------------------------------

-- Saves the three onboarding steps in one transaction. Re-callable later to edit them (each list
-- replaces what was there). Arguments:
--   p_sports        [{ "sport_id": "football", "level": "intermediate", "position": "Midfield", "is_main": true }]
--   p_availability  [{ "day_of_week": 2, "part": "evening" }]
--   p_pull_me_in    [{ "sport_id": "football", "scope": "connections" }]
--   p_privacy       { "sports": "everyone", "history": "friends", "availability": "crews" }
create or replace function public.save_onboarding(
  p_sports jsonb,
  p_availability jsonb,
  p_discovery_radius_km integer,
  p_pull_me_in jsonb default '[]',
  p_privacy jsonb default null,
  p_display_name text default null,
  p_area text default null,
  p_area_lat double precision default null,
  p_area_lng double precision default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_profile public.profiles%rowtype;
begin
  if jsonb_typeof(coalesce(p_sports, '[]')) <> 'array'
     or jsonb_typeof(coalesce(p_availability, '[]')) <> 'array'
     or jsonb_typeof(coalesce(p_pull_me_in, '[]')) <> 'array' then
    perform private.fail('invalid_argument', 'sports, availability and pull_me_in are arrays');
  end if;
  if p_discovery_radius_km is null or p_discovery_radius_km not between 1 and 50 then
    perform private.fail('radius_invalid');
  end if;
  if (p_area_lat is null) <> (p_area_lng is null) then
    perform private.fail('invalid_argument', 'area_lat and area_lng go together');
  end if;

  begin
    delete from public.user_sports where user_id = v_uid;
    insert into public.user_sports (user_id, sport_id, level, position, is_main)
    select v_uid, x.sport_id, x.level, nullif(trim(x.position), ''), coalesce(x.is_main, false)
    from jsonb_to_recordset(coalesce(p_sports, '[]'))
      as x(sport_id text, level public.skill_level, position text, is_main boolean);

    delete from public.availability_slots where user_id = v_uid;
    insert into public.availability_slots (user_id, day_of_week, part)
    select distinct v_uid, x.day_of_week, x.part
    from jsonb_to_recordset(coalesce(p_availability, '[]')) as x(day_of_week smallint, part public.day_part);

    delete from public.pull_me_in where user_id = v_uid;
    insert into public.pull_me_in (user_id, sport_id, scope)
    select v_uid, x.sport_id, coalesce(x.scope, 'connections')
    from jsonb_to_recordset(coalesce(p_pull_me_in, '[]')) as x(sport_id text, scope public.pull_scope);
  exception
    when foreign_key_violation then perform private.fail('sport_unknown');
    when not_null_violation or invalid_text_representation or check_violation then
      perform private.fail('invalid_argument');
    when unique_violation then perform private.fail('invalid_argument', 'duplicate sport');
  end;

  if exists (select 1 from public.user_sports where user_id = v_uid and is_main group by user_id having count(*) > 1) then
    perform private.fail('invalid_argument', 'one main sport');
  end if;

  if p_privacy is not null then
    begin
      update public.privacy_settings
         set sports_visibility = coalesce((p_privacy ->> 'sports')::public.visibility, sports_visibility),
             history_visibility = coalesce((p_privacy ->> 'history')::public.visibility, history_visibility),
             availability_visibility =
               coalesce((p_privacy ->> 'availability')::public.visibility, availability_visibility)
       where user_id = v_uid;
    exception when invalid_text_representation or check_violation then
      perform private.fail('invalid_argument', 'privacy');
    end;
  end if;

  update public.profile_private
     set discovery_radius_km = p_discovery_radius_km,
         area_lat = coalesce(round(p_area_lat::numeric, 2), area_lat),
         area_lng = coalesce(round(p_area_lng::numeric, 2), area_lng)
   where user_id = v_uid;

  begin
    update public.profiles
       set display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
           area = coalesce(nullif(trim(p_area), ''), area),
           onboarding_completed_at = coalesce(onboarding_completed_at, now())
     where id = v_uid
    returning * into v_profile;
  exception when check_violation then
    perform private.fail('invalid_argument', 'display_name or area');
  end;
  return v_profile;
end;
$$;

-- Edit the public face and coarse area. Null leaves a field unchanged.
create or replace function public.update_profile(
  p_display_name text default null,
  p_handle text default null,
  p_area text default null,
  p_area_lat double precision default null,
  p_area_lng double precision default null,
  p_discovery_radius_km integer default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_profile public.profiles%rowtype;
begin
  if (p_area_lat is null) <> (p_area_lng is null) then
    perform private.fail('invalid_argument', 'area_lat and area_lng go together');
  end if;
  if p_discovery_radius_km is not null and p_discovery_radius_km not between 1 and 50 then
    perform private.fail('radius_invalid');
  end if;
  begin
    update public.profiles
       set display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
           handle = coalesce(nullif(lower(trim(p_handle)), ''), handle),
           area = coalesce(nullif(trim(p_area), ''), area)
     where id = v_uid
    returning * into v_profile;
  exception
    when unique_violation then perform private.fail('handle_taken');
    when check_violation then perform private.fail('invalid_argument');
  end;
  update public.profile_private
     set area_lat = coalesce(round(p_area_lat::numeric, 2), area_lat),
         area_lng = coalesce(round(p_area_lng::numeric, 2), area_lng),
         discovery_radius_km = coalesce(p_discovery_radius_km, discovery_radius_km)
   where user_id = v_uid;
  return v_profile;
end;
$$;

-- Pull Me In on or off for one sport (revocable, scoped).
create or replace function public.set_pull_me_in(
  p_sport_id text, p_enabled boolean, p_scope public.pull_scope default 'connections'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not exists (select 1 from public.sports s where s.id = p_sport_id) then
    perform private.fail('sport_unknown');
  end if;
  if coalesce(p_enabled, false) then
    insert into public.pull_me_in (user_id, sport_id, scope) values (v_uid, p_sport_id, p_scope)
    on conflict (user_id, sport_id) do update set scope = excluded.scope;
  else
    delete from public.pull_me_in where user_id = v_uid and sport_id = p_sport_id;
  end if;
  return coalesce(p_enabled, false);
end;
$$;

-- Safety ------------------------------------------------------------------------------------------------

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
  return true;
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  delete from public.blocks where blocker_id = v_uid and blocked_id = p_user_id;
  return true;
end;
$$;

-- Report a profile, plan, activity, moment or result. 20 per day per person.
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

-- Plans ---------------------------------------------------------------------------------------------

-- Quick create (Create screen). The creator hosts and is in.
create or replace function public.create_plan(
  p_idempotency_key uuid,
  p_sport_id text,
  p_starts_at timestamptz,
  p_capacity integer,
  p_place_id uuid default null,
  p_audience public.audience default 'public',
  p_title text default null,
  p_deadline_at timestamptz default null,
  p_time_options timestamptz[] default null,
  p_poll_closes_at timestamptz default null,
  p_duration_minutes integer default null,
  p_meeting_point text default null,
  p_meeting_lat double precision default null,
  p_meeting_lng double precision default null,
  p_level_label text default null,
  p_team_a_label text default null,
  p_team_b_label text default null,
  p_teams_note text default null,
  p_kit_note text default null,
  p_cost_cents integer default 0,
  p_attendance_rule public.attendance_rule default 'check_in_host_confirms'
)
returns public.plan_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_sport public.sports%rowtype;
  v_deadline timestamptz;
  v_plan uuid;
  v_state public.plan_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_plan');
  if v_prior is not null then
    return jsonb_populate_record(null::public.plan_state, v_prior);
  end if;

  select * into v_sport from public.sports where id = p_sport_id;
  if not found then
    perform private.fail('sport_unknown');
  end if;
  if p_place_id is not null and not exists (select 1 from public.places where id = p_place_id) then
    perform private.fail('place_unknown');
  end if;
  if p_capacity is null or p_capacity not between 2 and 12 then
    perform private.fail('capacity_invalid', '2-12');
  end if;
  if p_starts_at is null or p_starts_at < now() + interval '15 minutes'
     or p_starts_at > now() + interval '30 days' then
    perform private.fail('starts_at_invalid');
  end if;
  if p_time_options is not null and (
       cardinality(p_time_options) > 4
       or exists (select 1 from unnest(p_time_options) t where t < now() + interval '15 minutes'
                                                         or t > now() + interval '30 days')) then
    perform private.fail('time_options_invalid');
  end if;
  v_deadline := coalesce(p_deadline_at, greatest(now() + interval '5 minutes', p_starts_at - interval '1 hour'));
  if v_deadline <= now() or v_deadline > p_starts_at
     or (p_time_options is not null
         and v_deadline > (select min(t) from unnest(p_time_options) t)) then
    perform private.fail('deadline_invalid');
  end if;
  if p_poll_closes_at is not null and (p_poll_closes_at <= now() or p_poll_closes_at > v_deadline) then
    perform private.fail('deadline_invalid', 'poll');
  end if;
  if (p_meeting_lat is null) <> (p_meeting_lng is null) then
    perform private.fail('invalid_argument', 'meeting_lat and meeting_lng go together');
  end if;

  begin
    insert into public.plans (
      sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
      poll_closes_at, source, created_by, host_id, member_count, level_label, team_a_label,
      team_b_label, teams_note, kit_note, cost_cents, attendance_rule
    ) values (
      p_sport_id, nullif(trim(p_title), ''), p_starts_at,
      coalesce(p_duration_minutes, v_sport.default_duration_minutes), p_place_id, p_capacity,
      coalesce(p_audience, 'public'), v_deadline,
      case when p_time_options is not null then coalesce(p_poll_closes_at, v_deadline) end,
      'quick', v_uid, v_uid, 1, p_level_label, p_team_a_label, p_team_b_label, p_teams_note,
      p_kit_note, coalesce(p_cost_cents, 0), coalesce(p_attendance_rule, 'check_in_host_confirms')
    ) returning id into v_plan;
  exception when check_violation then
    perform private.fail('invalid_argument');
  end;

  insert into public.plan_members (plan_id, user_id, via) values (v_plan, v_uid, 'host');

  if p_time_options is not null then
    insert into public.plan_time_options (plan_id, starts_at, created_by)
    select distinct v_plan, t, v_uid from unnest(p_time_options || p_starts_at) t;
  end if;

  if p_meeting_point is not null and trim(p_meeting_point) <> '' then
    insert into public.plan_meeting_points (plan_id, label, lat, lng)
    values (v_plan, left(trim(p_meeting_point), 120), p_meeting_lat, p_meeting_lng);
  end if;

  perform private.emit('plan_created', v_uid,
    jsonb_build_object('plan_id', v_plan, 'sport_id', p_sport_id, 'capacity', p_capacity, 'source', 'quick'));

  v_state := private.plan_state_of(v_plan, v_uid, true);
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- I'M DOWN.
create or replace function public.im_down(p_plan_id uuid, p_idempotency_key uuid)
returns public.plan_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_state public.plan_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'im_down:' || p_plan_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.plan_state, v_prior);
  end if;
  v_state := private.join_plan(p_plan_id, v_uid, 'im_down');
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- I CAN'T MAKE IT (before GAME ON). Idempotent: leaving a plan you're not in is a no-op.
create or replace function public.leave_plan(p_plan_id uuid, p_idempotency_key uuid)
returns public.plan_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_plan public.plans%rowtype;
  v_count integer;
  v_next_host uuid;
  v_state public.plan_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'leave_plan:' || p_plan_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.plan_state, v_prior);
  end if;

  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found or not authz.can_see_plan(p_plan_id, v_uid) then
    perform private.fail('plan_not_found');
  end if;

  if not exists (select 1 from public.plan_members m where m.plan_id = p_plan_id and m.user_id = v_uid) then
    v_state := private.plan_state_of(p_plan_id, v_uid, false);
  elsif v_plan.status = 'game_on' then
    perform private.fail('plan_locked', (select a.id::text from public.activities a where a.plan_id = p_plan_id));
  else
    -- Take back this person's vote.
    update public.plan_time_options o set vote_count = o.vote_count - 1
      from public.plan_time_votes v
     where v.plan_id = p_plan_id and v.user_id = v_uid and o.id = v.option_id;
    delete from public.plan_time_votes where plan_id = p_plan_id and user_id = v_uid;

    delete from public.plan_members where plan_id = p_plan_id and user_id = v_uid;
    update public.plans set member_count = member_count - 1 where id = p_plan_id
      returning member_count into v_count;

    update public.intent_signals set status = 'withdrawn', withdrawn_at = now()
     where user_id = v_uid and matched_plan_id = p_plan_id and status = 'matched';

    if v_count = 0 and v_plan.status = 'forming' then
      update public.plans set status = 'cancelled', cancelled_at = now() where id = p_plan_id;
    elsif v_plan.host_id = v_uid then
      -- The longest-standing member hosts next.
      select m.user_id into v_next_host from public.plan_members m
       where m.plan_id = p_plan_id order by m.joined_at, m.user_id limit 1;
      update public.plans set host_id = v_next_host where id = p_plan_id;
    end if;

    perform private.emit('plan_threshold_changed', v_uid,
      jsonb_build_object('plan_id', p_plan_id, 'count', v_count, 'capacity', v_plan.capacity, 'left', true));
    v_state := private.plan_state_of(p_plan_id, v_uid, true);
  end if;

  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- Host calls the plan off before GAME ON.
create or replace function public.cancel_plan(p_plan_id uuid)
returns public.plan_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_plan public.plans%rowtype;
begin
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found or not authz.can_see_plan(p_plan_id, v_uid) then
    perform private.fail('plan_not_found');
  end if;
  if v_plan.host_id <> v_uid then
    perform private.fail('not_host');
  end if;
  if v_plan.status = 'cancelled' then
    return private.plan_state_of(p_plan_id, v_uid, false);
  end if;
  if v_plan.status = 'game_on' then
    perform private.fail('plan_locked');
  end if;
  update public.plans set status = 'cancelled', cancelled_at = now() where id = p_plan_id;
  update public.plan_invites set status = 'revoked', responded_at = now()
   where plan_id = p_plan_id and status = 'pending';
  return private.plan_state_of(p_plan_id, v_uid, true);
end;
$$;

-- Time poll: one vote per member, changeable until the poll closes. Returns the poll.
create or replace function public.vote_time(p_plan_id uuid, p_option_id uuid)
returns table (option_id uuid, starts_at timestamptz, vote_count integer, is_mine boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_plan public.plans%rowtype;
  v_old uuid;
begin
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found or not authz.can_see_plan(p_plan_id, v_uid) then
    perform private.fail('plan_not_found');
  end if;
  if not exists (select 1 from public.plan_members m where m.plan_id = p_plan_id and m.user_id = v_uid) then
    perform private.fail('not_member');
  end if;
  if private.plan_status_now(v_plan) <> 'forming'
     or (v_plan.poll_closes_at is not null and v_plan.poll_closes_at <= now()) then
    perform private.fail('poll_closed');
  end if;
  if not exists (select 1 from public.plan_time_options o where o.plan_id = p_plan_id and o.id = p_option_id) then
    perform private.fail('option_not_found');
  end if;

  select v.option_id into v_old from public.plan_time_votes v where v.plan_id = p_plan_id and v.user_id = v_uid;
  if v_old is distinct from p_option_id then
    if v_old is not null then
      update public.plan_time_options o set vote_count = o.vote_count - 1 where o.id = v_old;
    end if;
    insert into public.plan_time_votes (plan_id, user_id, option_id) values (p_plan_id, v_uid, p_option_id)
    on conflict (plan_id, user_id) do update set option_id = excluded.option_id, created_at = now();
    update public.plan_time_options o set vote_count = o.vote_count + 1 where o.id = p_option_id;
  end if;

  return query
    select o.id, o.starts_at, o.vote_count, o.id = p_option_id
    from public.plan_time_options o where o.plan_id = p_plan_id order by o.starts_at;
end;
$$;

-- A member proposes another time (at most 4 options per plan).
create or replace function public.propose_time(p_plan_id uuid, p_starts_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_plan public.plans%rowtype;
  v_id uuid;
begin
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found or not authz.can_see_plan(p_plan_id, v_uid) then
    perform private.fail('plan_not_found');
  end if;
  if not exists (select 1 from public.plan_members m where m.plan_id = p_plan_id and m.user_id = v_uid) then
    perform private.fail('not_member');
  end if;
  if private.plan_status_now(v_plan) <> 'forming'
     or (v_plan.poll_closes_at is not null and v_plan.poll_closes_at <= now()) then
    perform private.fail('poll_closed');
  end if;
  if p_starts_at is null or p_starts_at < v_plan.deadline_at or p_starts_at > now() + interval '30 days' then
    perform private.fail('time_options_invalid');
  end if;
  select o.id into v_id from public.plan_time_options o where o.plan_id = p_plan_id and o.starts_at = p_starts_at;
  if v_id is not null then
    return v_id;
  end if;
  if (select count(*) from public.plan_time_options o where o.plan_id = p_plan_id) = 0 then
    -- First extra option: the original time becomes an option too.
    insert into public.plan_time_options (plan_id, starts_at, created_by)
    values (p_plan_id, v_plan.starts_at, v_plan.host_id);
    update public.plans set poll_closes_at = coalesce(poll_closes_at, deadline_at) where id = p_plan_id;
  elsif (select count(*) from public.plan_time_options o where o.plan_id = p_plan_id) >= 4 then
    perform private.fail('time_options_invalid', 'max 4');
  end if;
  insert into public.plan_time_options (plan_id, starts_at, created_by)
  values (p_plan_id, p_starts_at, v_uid) returning id into v_id;
  return v_id;
end;
$$;

-- PULL SOMEONE IN. All or nothing. Each inviter has 3 pull-in invites per plan (and 20 a day).
-- Allowed invitees: not blocked either way, and either connected to the inviter (played together)
-- or Pull Me In is on for this sport with scope 'nearby'. People already in or already invited are
-- skipped, not counted.
create or replace function public.pull_in(p_plan_id uuid, p_invitee_ids uuid[], p_idempotency_key uuid)
returns public.pull_in_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_plan public.plans%rowtype;
  v_used integer;
  v_new uuid[];
  v_result public.pull_in_result;
  v_invitee uuid;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'pull_in:' || p_plan_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.pull_in_result, v_prior);
  end if;

  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found or not authz.can_see_plan(p_plan_id, v_uid) then
    perform private.fail('plan_not_found');
  end if;
  if not exists (select 1 from public.plan_members m where m.plan_id = p_plan_id and m.user_id = v_uid) then
    perform private.fail('not_member');
  end if;
  if v_plan.status = 'game_on' then
    perform private.fail('plan_full');
  elsif private.plan_status_now(v_plan) <> 'forming' then
    perform private.fail('plan_expired');
  end if;
  if p_invitee_ids is null or cardinality(p_invitee_ids) = 0 then
    perform private.fail('invalid_argument', 'no invitees');
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_new
  from unnest(p_invitee_ids) x
  where x <> v_uid
    and not exists (select 1 from public.plan_members m where m.plan_id = p_plan_id and m.user_id = x)
    and not exists (select 1 from public.plan_invites i where i.plan_id = p_plan_id and i.invitee_id = x);

  foreach v_invitee in array v_new loop
    if not exists (select 1 from public.profiles where id = v_invitee)
       or authz.is_blocked(v_invitee, v_uid)
       or authz.is_blocked(v_invitee, v_plan.host_id)
       or not (
         authz.connected(v_uid, v_invitee)
         or exists (select 1 from public.pull_me_in p
                    where p.user_id = v_invitee and p.sport_id = v_plan.sport_id and p.scope = 'nearby')
       ) then
      perform private.fail('invite_not_allowed', v_invitee::text);
    end if;
  end loop;

  select count(*) into v_used from public.plan_invites i
   where i.plan_id = p_plan_id and i.inviter_id = v_uid and i.kind = 'pull_in';
  if v_used + cardinality(v_new) > 3 then
    perform private.fail('invite_quota_exceeded', greatest(3 - v_used, 0)::text);
  end if;
  if (select count(*) from public.plan_invites i
      where i.inviter_id = v_uid and i.kind = 'pull_in' and i.created_at > now() - interval '24 hours')
     + cardinality(v_new) > 20 then
    perform private.fail('invite_rate_limited');
  end if;

  insert into public.plan_invites (plan_id, inviter_id, invitee_id, kind)
  select p_plan_id, v_uid, x, 'pull_in' from unnest(v_new) x;

  if cardinality(v_new) > 0 then
    perform private.emit('friend_pulled_in', v_uid,
      jsonb_build_object('plan_id', p_plan_id, 'count', cardinality(v_new)));
  end if;

  v_result := row(cardinality(v_new), cardinality(p_invitee_ids) - cardinality(v_new),
                  3 - v_used - cardinality(v_new))::public.pull_in_result;
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_result));
  return v_result;
end;
$$;

create or replace function public.decline_invite(p_invite_id uuid)
returns public.invite_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_status public.invite_status;
begin
  update public.plan_invites set status = 'declined', responded_at = now()
   where id = p_invite_id and invitee_id = v_uid and status = 'pending'
  returning status into v_status;
  if v_status is null then
    select i.status into v_status from public.plan_invites i where i.id = p_invite_id and i.invitee_id = v_uid;
    if v_status is null then
      perform private.fail('invite_not_found');
    end if;
  end if;
  return v_status;
end;
$$;

-- Down For --------------------------------------------------------------------------------------------

-- Matching (deterministic; documented in docs/SLICE01_CONTRACT.md §Down For matching):
--   A. Join the best existing forming plan: same sport, starts inside the signal window, not full,
--      visible, no block with any member, place within the signal radius of the person's area (or at
--      the preferred place). Best = most members, then earliest, then id.
--   B. Otherwise group compatible active signals into a new plan: same sport, window covering the
--      start time t, both areas within the smaller of the two radii, audiences allow each other, no
--      blocks inside the group. Oldest signals first, up to the sport's default capacity. Needs at
--      least 2 people and every member's min_participants.
--      t starts as the later of the new signal's window start and now + ~1 hour (15-minute
--      boundary), and moves to the latest window start in the group; a signal joins only if every
--      window in the group still contains t.
--   C. Otherwise the signal stays active and shows in down_for_nearby().
create or replace function private.match_signal(p_signal uuid)
returns table (plan_id uuid, plan_created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.intent_signals%rowtype;
  v_sport public.sports%rowtype;
  v_plan uuid;
  v_t timestamptz;
  v_end timestamptz;
  v_group uuid[];
  v_signals uuid[];
  v_mins integer[];
  v_c record;
  v_n integer;
  v_place uuid;
  v_audience public.audience := 'public'::public.audience;
begin
  select * into v_s from public.intent_signals where id = p_signal;
  select * into v_sport from public.sports where id = v_s.sport_id;
  perform pg_advisory_xact_lock(hashtext('ojoro_match:' || v_s.sport_id));

  -- A. An existing plan.
  select p.id into v_plan
  from public.plans p
  left join public.places pl on pl.id = p.place_id
  where p.sport_id = v_s.sport_id
    and p.status = 'forming' and p.deadline_at > now() and p.member_count < p.capacity
    and p.starts_at >= v_s.window_start and p.starts_at < v_s.window_end
    and authz.can_see_plan(p.id, v_s.user_id)
    and not exists (select 1 from public.plan_members m
                    where m.plan_id = p.id and authz.is_blocked(m.user_id, v_s.user_id))
    and (v_s.place_id is null or p.place_id = v_s.place_id)
    and (
      (v_s.place_id is not null and p.place_id = v_s.place_id)
      or (pl.id is not null and v_s.area_lat is not null
          and private.distance_m(v_s.area_lat::double precision, v_s.area_lng::double precision, pl.lat, pl.lng)
              <= v_s.radius_km * 1000)
    )
  order by p.member_count desc, p.starts_at, p.id
  limit 1;

  if v_plan is not null then
    if exists (select 1 from public.plan_members m where m.plan_id = v_plan and m.user_id = v_s.user_id) then
      update public.intent_signals set status = 'matched', matched_plan_id = v_plan where id = p_signal;
    else
      perform private.join_plan(v_plan, v_s.user_id, 'down_for');
      update public.intent_signals set status = 'matched', matched_plan_id = v_plan
       where id = p_signal and status = 'active';
    end if;
    return query select v_plan, false;
    return;
  end if;

  -- B. Group signals.
  if v_s.area_lat is null then
    return;
  end if;
  v_t := greatest(v_s.window_start, date_bin('15 minutes', now() + interval '59 minutes', timestamptz '2000-01-01'));
  if v_t >= v_s.window_end then
    return;
  end if;

  v_group := array[v_s.user_id];
  v_signals := array[v_s.id];
  v_mins := array[coalesce(v_s.min_participants, 2)];
  v_end := v_s.window_end;
  for v_c in
    select o.id, o.user_id, o.min_participants, o.audience, o.window_start, o.window_end
    from public.intent_signals o
    where o.status = 'active' and o.expires_at > now() and o.id <> v_s.id and o.user_id <> v_s.user_id
      and o.sport_id = v_s.sport_id
      and o.window_start < v_s.window_end and o.window_end > v_t
      and o.area_lat is not null
      and private.distance_m(v_s.area_lat::double precision, v_s.area_lng::double precision,
                             o.area_lat::double precision, o.area_lng::double precision)
          <= least(o.radius_km, v_s.radius_km) * 1000
      and (o.audience = 'public' or authz.connected(o.user_id, v_s.user_id))
      and (v_s.audience = 'public' or authz.connected(o.user_id, v_s.user_id))
    order by o.created_at, o.id
  loop
    exit when cardinality(v_group) >= v_sport.default_capacity;
    -- Every window in the group must contain the start: the latest window start so far.
    if greatest(v_t, v_c.window_start) >= least(v_end, v_c.window_end) then
      continue;
    end if;
    if exists (select 1 from unnest(v_group) g where authz.is_blocked(g, v_c.user_id)) then
      continue;
    end if;
    v_t := greatest(v_t, v_c.window_start);
    v_end := least(v_end, v_c.window_end);
    v_group := v_group || v_c.user_id;
    v_signals := v_signals || v_c.id;
    v_mins := v_mins || coalesce(v_c.min_participants, 2);
    if v_c.audience = 'friends' then
      v_audience := 'friends';
    end if;
  end loop;
  if v_s.audience = 'friends' then
    v_audience := 'friends';
  end if;

  -- Drop people whose minimum the group can't meet (one pass), then check what's left.
  v_n := cardinality(v_group);
  for v_i in reverse v_n .. 2 loop
    if v_mins[v_i] > v_n then
      v_group := v_group[1:v_i - 1] || v_group[v_i + 1:];
      v_signals := v_signals[1:v_i - 1] || v_signals[v_i + 1:];
      v_mins := v_mins[1:v_i - 1] || v_mins[v_i + 1:];
    end if;
  end loop;
  v_n := cardinality(v_group);
  if v_n < 2 or exists (select 1 from unnest(v_mins) m where m > v_n) then
    return;
  end if;

  -- Place: the preferred one, else the nearest place for this sport within the radius, else none yet.
  v_place := v_s.place_id;
  if v_place is null then
    select pl.id into v_place from public.places pl
    where v_s.sport_id = any (pl.sport_ids)
      and private.distance_m(v_s.area_lat::double precision, v_s.area_lng::double precision, pl.lat, pl.lng)
          <= v_s.radius_km * 1000
    order by private.distance_m(v_s.area_lat::double precision, v_s.area_lng::double precision, pl.lat, pl.lng),
             pl.id
    limit 1;
  end if;

  insert into public.plans (
    sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at, source,
    created_by, host_id, member_count
  ) values (
    v_s.sport_id, v_t, v_sport.default_duration_minutes, v_place, v_sport.default_capacity, v_audience,
    least(v_t, greatest(now() + interval '10 minutes', v_t - interval '1 hour')),
    'down_for', v_s.user_id, v_s.user_id, v_n
  ) returning id into v_plan;

  insert into public.plan_members (plan_id, user_id, via)
  select v_plan, g, 'down_for' from unnest(v_group) g;
  update public.intent_signals set status = 'matched', matched_plan_id = v_plan where id = any (v_signals);

  perform private.emit('plan_created', v_s.user_id,
    jsonb_build_object('plan_id', v_plan, 'sport_id', v_s.sport_id, 'count', v_n, 'source', 'down_for'));
  if v_n >= v_sport.default_capacity then
    perform private.promote_plan(v_plan);
  end if;
  return query select v_plan, true;
end;
$$;

-- Down For: publish temporary intent. Idempotent: an active signal for the same sport and an
-- overlapping window is returned instead of a new one (created = false).
create or replace function public.create_down_for(
  p_idempotency_key uuid,
  p_sport_id text,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_expires_at timestamptz,
  p_audience public.audience default 'public',
  p_radius_km integer default null,
  p_min_participants integer default null,
  p_place_id uuid default null
)
returns public.down_for_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_private public.profile_private%rowtype;
  v_signal public.intent_signals%rowtype;
  v_match record;
  v_state public.down_for_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_down_for');
  if v_prior is not null then
    return jsonb_populate_record(null::public.down_for_state, v_prior);
  end if;

  if not exists (select 1 from public.sports where id = p_sport_id) then
    perform private.fail('sport_unknown');
  end if;
  if p_expires_at is null then
    perform private.fail('expiry_required');
  end if;
  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start
     or p_window_end <= now() or p_window_end - p_window_start > interval '24 hours'
     or p_window_start > now() + interval '14 days' then
    perform private.fail('window_invalid');
  end if;
  if p_expires_at <= now() or p_expires_at > p_window_end then
    perform private.fail('expiry_invalid');
  end if;
  if p_audience not in ('public', 'friends') then
    perform private.fail('invalid_argument', 'audience');
  end if;
  if p_radius_km is not null and p_radius_km not between 1 and 50 then
    perform private.fail('radius_invalid');
  end if;
  if p_min_participants is not null and p_min_participants not between 2 and 12 then
    perform private.fail('invalid_argument', 'min_participants');
  end if;
  if p_place_id is not null and not exists (select 1 from public.places where id = p_place_id) then
    perform private.fail('place_unknown');
  end if;

  -- Stale signals of this person no longer count as active.
  update public.intent_signals set status = 'expired'
   where user_id = v_uid and status = 'active' and expires_at <= now();

  select * into v_signal from public.intent_signals s
   where s.user_id = v_uid and s.sport_id = p_sport_id and s.status = 'active'
     and tstzrange(s.window_start, s.window_end) && tstzrange(p_window_start, p_window_end)
   for update;

  if found then
    v_state := row(v_signal.id, v_signal.status, false, v_signal.expires_at, v_signal.matched_plan_id, false)::public.down_for_state;
  else
    select * into v_private from public.profile_private where user_id = v_uid;
    insert into public.intent_signals (
      user_id, sport_id, window_start, window_end, expires_at, audience, radius_km,
      min_participants, place_id, area_lat, area_lng
    ) values (
      v_uid, p_sport_id, p_window_start, p_window_end, p_expires_at, p_audience,
      coalesce(p_radius_km, v_private.discovery_radius_km, 3), p_min_participants, p_place_id,
      v_private.area_lat, v_private.area_lng
    ) returning * into v_signal;

    perform private.emit('down_for_created', v_uid,
      jsonb_build_object('signal_id', v_signal.id, 'sport_id', p_sport_id));

    select * into v_match from private.match_signal(v_signal.id);
    select * into v_signal from public.intent_signals where id = v_signal.id;
    v_state := row(v_signal.id, v_signal.status, true, v_signal.expires_at, v_signal.matched_plan_id,
                   coalesce(v_match.plan_created, false))::public.down_for_state;
  end if;

  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

create or replace function public.withdraw_down_for(p_signal_id uuid)
returns public.signal_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_status public.signal_status;
begin
  update public.intent_signals set status = 'withdrawn', withdrawn_at = now()
   where id = p_signal_id and user_id = v_uid and status = 'active'
  returning status into v_status;
  if v_status is null then
    select s.status into v_status from public.intent_signals s where s.id = p_signal_id and s.user_id = v_uid;
    if v_status is null then
      perform private.fail('signal_not_found');
    end if;
  end if;
  return v_status;
end;
$$;

-- Attendance ------------------------------------------------------------------------------------------

-- Join an activity after GAME ON. A free spot (before check-in opens) confirms you; otherwise you go
-- on the waitlist and are promoted automatically if a spot opens before check-in opens.
create or replace function public.join_waitlist(p_activity_id uuid, p_idempotency_key uuid)
returns public.attendance_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_a public.activities%rowtype;
  v_cur public.attendance_status;
  v_state public.attendance_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'join_waitlist:' || p_activity_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.attendance_state, v_prior);
  end if;

  select * into v_a from public.activities where id = p_activity_id for update;
  if not found or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  select t.status into v_cur from public.attendance t where t.activity_id = p_activity_id and t.user_id = v_uid;

  if v_cur in ('confirmed', 'checked_in', 'waitlisted') then
    v_state := private.attendance_state_of(p_activity_id, v_uid, false);
  else
    if private.activity_status_now(v_a) = 'cancelled' then
      perform private.fail('activity_cancelled');
    elsif private.activity_status_now(v_a) <> 'confirmed' then
      perform private.fail('activity_started');
    end if;
    if exists (select 1 from public.attendance t
               where t.activity_id = p_activity_id and t.status in ('confirmed', 'checked_in', 'waitlisted')
                 and authz.is_blocked(t.user_id, v_uid)) then
      perform private.fail('plan_unavailable');
    end if;

    if v_a.confirmed_count < v_a.capacity and now() < v_a.check_in_opens_at then
      insert into public.attendance (activity_id, user_id, status, confirmed_at)
      values (p_activity_id, v_uid, 'confirmed', now())
      on conflict (activity_id, user_id) do update
        set status = 'confirmed', confirmed_at = now(), cancelled_at = null, waitlisted_at = null,
            checked_in_at = null, check_in_method = null;
      update public.activities set confirmed_count = confirmed_count + 1 where id = p_activity_id;
    else
      insert into public.attendance (activity_id, user_id, status, waitlisted_at)
      values (p_activity_id, v_uid, 'waitlisted', now())
      on conflict (activity_id, user_id) do update
        set status = 'waitlisted', waitlisted_at = now(), cancelled_at = null,
            checked_in_at = null, check_in_method = null;
      update public.activities set waitlist_count = waitlist_count + 1 where id = p_activity_id;
    end if;
    v_state := private.attendance_state_of(p_activity_id, v_uid, true);
  end if;

  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- I CAN'T MAKE IT ANYMORE. Frees the spot and promotes the first person on the waitlist in the same
-- transaction (until check-in opens). Idempotent.
create or replace function public.cancel_attendance(p_activity_id uuid, p_idempotency_key uuid)
returns public.attendance_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_a public.activities%rowtype;
  v_cur public.attendance_status;
  v_promoted uuid;
  v_state public.attendance_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'cancel_attendance:' || p_activity_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.attendance_state, v_prior);
  end if;

  select * into v_a from public.activities where id = p_activity_id for update;
  if not found then
    perform private.fail('activity_not_found');
  end if;
  select t.status into v_cur from public.attendance t
   where t.activity_id = p_activity_id and t.user_id = v_uid for update;
  if v_cur is null then
    perform private.fail('not_attending');
  end if;

  if v_cur = 'cancelled' or private.activity_status_now(v_a) = 'cancelled' then
    v_state := private.attendance_state_of(p_activity_id, v_uid, false);
  elsif private.activity_status_now(v_a) <> 'confirmed' then
    perform private.fail('activity_started');
  elsif v_cur = 'waitlisted' then
    update public.attendance set status = 'cancelled', cancelled_at = now()
     where activity_id = p_activity_id and user_id = v_uid;
    update public.activities set waitlist_count = waitlist_count - 1 where id = p_activity_id;
    v_state := private.attendance_state_of(p_activity_id, v_uid, true);
  else
    update public.attendance set status = 'cancelled', cancelled_at = now()
     where activity_id = p_activity_id and user_id = v_uid;
    update public.activities
       set confirmed_count = confirmed_count - 1,
           checked_in_count = checked_in_count - case when v_cur = 'checked_in' then 1 else 0 end
     where id = p_activity_id;
    delete from public.location_shares where activity_id = p_activity_id and user_id = v_uid;

    if now() < v_a.check_in_opens_at then
      select t.user_id into v_promoted from public.attendance t
       where t.activity_id = p_activity_id and t.status = 'waitlisted'
       order by t.waitlisted_at, t.user_id
       limit 1
       for update;
      if v_promoted is not null then
        update public.attendance set status = 'confirmed', confirmed_at = now()
         where activity_id = p_activity_id and user_id = v_promoted;
        update public.activities
           set confirmed_count = confirmed_count + 1, waitlist_count = waitlist_count - 1
         where id = p_activity_id;
      end if;
    end if;
    v_state := private.attendance_state_of(p_activity_id, v_uid, true, v_promoted);
  end if;

  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- CHECK IN: inside the check-in window and within check_in_radius_m (150 m) of the meeting point,
-- or of the place if the plan has no meeting point. The coordinates are only compared, never stored.
create or replace function public.check_in(
  p_activity_id uuid, p_lat double precision, p_lng double precision, p_idempotency_key uuid
)
returns public.attendance_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_a public.activities%rowtype;
  v_cur public.attendance_status;
  v_lat double precision;
  v_lng double precision;
  v_distance double precision;
  v_state public.attendance_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'check_in:' || p_activity_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.attendance_state, v_prior);
  end if;

  select * into v_a from public.activities where id = p_activity_id for update;
  if not found or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  select t.status into v_cur from public.attendance t where t.activity_id = p_activity_id and t.user_id = v_uid;

  if v_cur = 'checked_in' then
    v_state := private.attendance_state_of(p_activity_id, v_uid, false);
  else
    if v_cur is distinct from 'confirmed' then
      perform private.fail('not_attending');
    end if;
    if v_a.status = 'cancelled' then
      perform private.fail('activity_cancelled');
    end if;
    if now() < v_a.check_in_opens_at then
      perform private.fail('check_in_not_open', v_a.check_in_opens_at::text);
    end if;
    if now() >= v_a.check_in_closes_at or private.activity_status_now(v_a) in ('after', 'complete') then
      perform private.fail('check_in_closed');
    end if;
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      perform private.fail('location_required');
    end if;

    select mp.lat, mp.lng into v_lat, v_lng
    from public.plans p join public.plan_meeting_points mp on mp.plan_id = p.id
    where p.id = v_a.plan_id and mp.lat is not null;
    if v_lat is null then
      select pl.lat, pl.lng into v_lat, v_lng from public.places pl where pl.id = v_a.place_id;
    end if;
    if v_lat is null then
      perform private.fail('check_in_unavailable');
    end if;
    v_distance := private.distance_m(p_lat, p_lng, v_lat, v_lng);
    if v_distance > v_a.check_in_radius_m then
      -- Rounded to 50 m so the UI can say how far; the person's own position, never stored.
      perform private.fail('too_far', (round(v_distance / 50) * 50)::integer::text);
    end if;

    update public.attendance set status = 'checked_in', checked_in_at = now(), check_in_method = 'location'
     where activity_id = p_activity_id and user_id = v_uid;
    update public.activities set checked_in_count = checked_in_count + 1 where id = p_activity_id;
    v_state := private.attendance_state_of(p_activity_id, v_uid, true);
  end if;

  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- Host confirms someone is there ("Host confirms"). Allowed from check-in opening until After closes.
create or replace function public.host_check_in(p_activity_id uuid, p_user_id uuid)
returns public.attendance_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_a public.activities%rowtype;
  v_cur public.attendance_status;
begin
  select * into v_a from public.activities where id = p_activity_id for update;
  if not found or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  if v_a.host_id <> v_uid then
    perform private.fail('not_host');
  end if;
  if now() < v_a.check_in_opens_at then
    perform private.fail('check_in_not_open', v_a.check_in_opens_at::text);
  end if;
  if private.activity_status_now(v_a) in ('complete', 'cancelled') then
    perform private.fail('check_in_closed');
  end if;
  select t.status into v_cur from public.attendance t where t.activity_id = p_activity_id and t.user_id = p_user_id;
  if v_cur = 'checked_in' then
    return private.attendance_state_of(p_activity_id, p_user_id, false);
  end if;
  if v_cur is distinct from 'confirmed' then
    perform private.fail('not_attending');
  end if;
  update public.attendance set status = 'checked_in', checked_in_at = now(), check_in_method = 'host'
   where activity_id = p_activity_id and user_id = p_user_id;
  update public.activities set checked_in_count = checked_in_count + 1 where id = p_activity_id;
  return private.attendance_state_of(p_activity_id, p_user_id, true);
end;
$$;

-- Host puts a participant on a team (Lights / Darks).
create or replace function public.assign_team(p_activity_id uuid, p_user_id uuid, p_team public.team_side)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not exists (select 1 from public.activities a where a.id = p_activity_id and a.host_id = v_uid) then
    perform private.fail('not_host');
  end if;
  update public.attendance set team = p_team
   where activity_id = p_activity_id and user_id = p_user_id and status in ('confirmed', 'checked_in');
  if not found then
    perform private.fail('not_attending');
  end if;
  return true;
end;
$$;

-- Host starts the game early or on time (Live), and ends it (FULL TIME → After).
create or replace function public.start_activity(p_activity_id uuid)
returns public.activity_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_a public.activities%rowtype;
begin
  select * into v_a from public.activities where id = p_activity_id for update;
  if not found or v_a.host_id <> v_uid then
    perform private.fail('not_host');
  end if;
  if private.activity_status_now(v_a) = 'live' then
    return 'live'::public.activity_status;
  end if;
  if private.activity_status_now(v_a) <> 'confirmed' then
    perform private.fail('activity_started');
  end if;
  if now() < v_a.check_in_opens_at then
    perform private.fail('check_in_not_open', v_a.check_in_opens_at::text);
  end if;
  update public.activities set status = 'live', live_at = now() where id = p_activity_id;
  perform private.emit('activity_started', v_uid, jsonb_build_object('activity_id', p_activity_id));
  return 'live'::public.activity_status;
end;
$$;

create or replace function public.end_activity(p_activity_id uuid)
returns public.activity_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_a public.activities%rowtype;
begin
  select * into v_a from public.activities where id = p_activity_id for update;
  if not found or v_a.host_id <> v_uid then
    perform private.fail('not_host');
  end if;
  if private.activity_status_now(v_a) in ('after', 'complete') then
    return private.activity_status_now(v_a);
  end if;
  if private.activity_status_now(v_a) <> 'live' then
    perform private.fail('activity_not_live');
  end if;
  update public.activities
     set status = 'after', ended_at = now(), check_in_closes_at = greatest(check_in_opens_at + interval '1 minute', now()),
         after_closes_at = now() + interval '24 hours'
   where id = p_activity_id;
  delete from public.location_shares where activity_id = p_activity_id;
  return 'after'::public.activity_status;
end;
$$;

-- Host cancels a confirmed activity before it starts. Everyone's attendance stays as a record.
create or replace function public.cancel_activity(p_activity_id uuid)
returns public.activity_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_a public.activities%rowtype;
begin
  select * into v_a from public.activities where id = p_activity_id for update;
  if not found or v_a.host_id <> v_uid then
    perform private.fail('not_host');
  end if;
  if v_a.status = 'cancelled' then
    return 'cancelled'::public.activity_status;
  end if;
  if private.activity_status_now(v_a) <> 'confirmed' then
    perform private.fail('activity_started');
  end if;
  update public.activities set status = 'cancelled', cancelled_at = now() where id = p_activity_id;
  delete from public.location_shares where activity_id = p_activity_id;
  return 'cancelled'::public.activity_status;
end;
$$;

-- Live location for this game only -----------------------------------------------------------------------

-- Start (or move) your live location for one game. It ends by itself at expires_at: the end of the
-- game plus 30 minutes at the latest ("until 9:30. Then it stops by itself").
create or replace function public.share_location(
  p_activity_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_until timestamptz default null
)
returns public.location_share_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_a public.activities%rowtype;
  v_max timestamptz;
  v_until timestamptz;
begin
  select * into v_a from public.activities where id = p_activity_id;
  if not found or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  if not exists (select 1 from public.attendance t where t.activity_id = p_activity_id and t.user_id = v_uid
                   and t.status in ('confirmed', 'checked_in')) then
    perform private.fail('not_attending');
  end if;
  v_max := coalesce(v_a.ended_at, v_a.ends_at) + interval '30 minutes';
  if private.activity_status_now(v_a) not in ('confirmed', 'live') or now() >= v_max
     or now() < v_a.check_in_opens_at - interval '60 minutes' then
    perform private.fail('share_not_allowed');
  end if;
  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    perform private.fail('invalid_argument', 'lat/lng');
  end if;
  v_until := least(coalesce(p_until, v_max), v_max);
  if v_until <= now() then
    perform private.fail('share_not_allowed');
  end if;

  insert into public.location_shares (activity_id, user_id, lat, lng, expires_at)
  values (p_activity_id, v_uid, round(p_lat::numeric, 5), round(p_lng::numeric, 5), v_until)
  on conflict (activity_id, user_id) do update
    set lat = coalesce(excluded.lat, public.location_shares.lat),
        lng = coalesce(excluded.lng, public.location_shares.lng),
        expires_at = case when public.location_shares.expires_at > now()
                          then least(public.location_shares.expires_at, excluded.expires_at)
                          else excluded.expires_at end,
        started_at = case when public.location_shares.expires_at > now()
                          then public.location_shares.started_at else now() end;
  return (select row(s.activity_id, true, s.expires_at)::public.location_share_state
            from public.location_shares s where s.activity_id = p_activity_id and s.user_id = v_uid);
end;
$$;

-- STOP SHARING. Idempotent.
create or replace function public.stop_sharing_location(p_activity_id uuid)
returns public.location_share_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  delete from public.location_shares where activity_id = p_activity_id and user_id = v_uid;
  return row(p_activity_id, false, null)::public.location_share_state;
end;
$$;

-- Results -----------------------------------------------------------------------------------------------

create or replace function private.result_threshold(p_activity uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  -- Half the players, rounded up, and at least 2 (PRD §11.3 "multiple participants confirm").
  select greatest(least(2, n), ceil(n / 2.0)::integer, 1)
  from (select count(*)::integer as n from public.attendance t
        where t.activity_id = p_activity and t.status = 'checked_in') c;
$$;

create or replace function private.result_state_of(p_proposal uuid)
returns public.result_state
language sql
stable
security definer
set search_path = ''
as $$
  select row(r.id, r.activity_id, r.status, r.team_a_score, r.team_b_score, r.confirmations_count,
             r.threshold, r.verification_level,
             (select c.id from public.recaps c where c.activity_id = r.activity_id))::public.result_state
  from public.result_proposals r where r.id = p_proposal;
$$;

-- Recap + Passport. Created when the result is verified or when the After window closes; finalized
-- (frozen) when the After window closes.
create or replace function private.ensure_recap(p_activity uuid, p_finalize boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.activities%rowtype;
  v_r public.result_proposals%rowtype;
  v_recap uuid;
begin
  select * into v_a from public.activities where id = p_activity;
  select * into v_r from public.result_proposals r
   where r.activity_id = p_activity and r.status in ('proposed', 'verified');

  insert into public.recaps (activity_id, sport_id, place_id, occurred_at, duration_minutes, team_a_label, team_b_label)
  values (p_activity, v_a.sport_id, v_a.place_id, coalesce(v_a.live_at, v_a.starts_at),
          greatest(1, (extract(epoch from coalesce(v_a.ended_at, v_a.ends_at) - coalesce(v_a.live_at, v_a.starts_at)) / 60)::integer),
          v_a.team_a_label, v_a.team_b_label)
  on conflict (activity_id) do nothing;

  update public.recaps c
     set played_count = v_a.checked_in_count,
         team_a_score = v_r.team_a_score,
         team_b_score = v_r.team_b_score,
         result_proposal_id = v_r.id,
         verification_level = v_r.verification_level,
         confirmed_count = coalesce(v_r.confirmations_count, 0),
         moments_count = (select count(*) from public.moments m where m.activity_id = p_activity),
         finalized_at = case when p_finalize then now() end
   where c.activity_id = p_activity and c.finalized_at is null
  returning c.id into v_recap;

  if v_recap is null then
    select c.id into v_recap from public.recaps c where c.activity_id = p_activity;
  end if;

  -- One durable stamp per player.
  insert into public.passport_entries (user_id, activity_id, sport_id, place_id, occurred_at, minutes,
                                       place_game_number, sport_game_number)
  select t.user_id, p_activity, v_a.sport_id, v_a.place_id, coalesce(v_a.live_at, v_a.starts_at),
         (select c.duration_minutes from public.recaps c where c.id = v_recap),
         case when v_a.place_id is not null then 1 + (select count(*) from public.passport_entries e
                where e.user_id = t.user_id and e.place_id = v_a.place_id) end,
         1 + (select count(*) from public.passport_entries e where e.user_id = t.user_id and e.sport_id = v_a.sport_id)
  from public.attendance t
  where t.activity_id = p_activity and t.status = 'checked_in'
  on conflict (user_id, activity_id) do nothing;

  return v_recap;
end;
$$;

-- Log the score (host during Live; any player in After). A new proposal replaces an unverified one
-- ("SUGGEST A FIX"). The proposer's confirmation counts.
create or replace function public.propose_result(
  p_activity_id uuid, p_team_a_score integer, p_team_b_score integer, p_idempotency_key uuid
)
returns public.result_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_a public.activities%rowtype;
  v_status public.activity_status;
  v_current public.result_proposals%rowtype;
  v_id uuid;
  v_state public.result_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'propose_result:' || p_activity_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.result_state, v_prior);
  end if;

  select * into v_a from public.activities where id = p_activity_id for update;
  if not found or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  v_status := private.activity_status_now(v_a);
  if not authz.is_player(p_activity_id, v_uid) and v_a.host_id <> v_uid then
    perform private.fail('not_player');
  end if;
  if not (v_status = 'after' or (v_status = 'live' and v_a.host_id = v_uid)) then
    perform private.fail('result_not_open');
  end if;
  if p_team_a_score is null or p_team_b_score is null or p_team_a_score not between 0 and 999
     or p_team_b_score not between 0 and 999 then
    perform private.fail('invalid_argument', 'score');
  end if;

  select * into v_current from public.result_proposals r
   where r.activity_id = p_activity_id and r.status in ('proposed', 'verified') for update;
  if v_current.status = 'verified' then
    perform private.fail('result_already_verified');
  end if;
  if v_current.id is not null then
    update public.result_proposals set status = 'superseded', superseded_at = now() where id = v_current.id;
  end if;

  insert into public.result_proposals (activity_id, proposed_by, team_a_score, team_b_score, threshold, confirmations_count)
  values (p_activity_id, v_uid, p_team_a_score, p_team_b_score, private.result_threshold(p_activity_id), 0)
  returning id into v_id;
  if authz.is_player(p_activity_id, v_uid) then
    insert into public.result_confirmations (proposal_id, user_id) values (v_id, v_uid);
    update public.result_proposals set confirmations_count = 1 where id = v_id;
  end if;
  update public.result_proposals
     set status = 'verified', verification_level = 'participant_confirmed', verified_at = now()
   where id = v_id and confirmations_count >= threshold;
  if exists (select 1 from public.result_proposals where id = v_id and status = 'verified') then
    perform private.ensure_recap(p_activity_id);
  end if;

  v_state := private.result_state_of(v_id);
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- CONFIRM. At the threshold the result becomes Participant Confirmed and the Recap is created.
-- Confirmations keep counting after that, until the After window closes.
create or replace function public.confirm_result(p_proposal_id uuid, p_idempotency_key uuid)
returns public.result_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_r public.result_proposals%rowtype;
  v_a public.activities%rowtype;
  v_threshold integer;
  v_state public.result_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'confirm_result:' || p_proposal_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.result_state, v_prior);
  end if;

  select * into v_r from public.result_proposals where id = p_proposal_id for update;
  if not found or not authz.can_see_activity(v_r.activity_id, v_uid) then
    perform private.fail('proposal_not_found');
  end if;
  select * into v_a from public.activities where id = v_r.activity_id;
  if not authz.is_player(v_r.activity_id, v_uid) then
    perform private.fail('not_player');
  end if;
  if v_r.status = 'superseded' then
    perform private.fail('proposal_superseded');
  end if;
  if private.activity_status_now(v_a) not in ('live', 'after') then
    perform private.fail('result_not_open');
  end if;

  insert into public.result_confirmations (proposal_id, user_id) values (p_proposal_id, v_uid)
  on conflict do nothing;
  if found then
    v_threshold := greatest(v_r.threshold, private.result_threshold(v_r.activity_id));
    update public.result_proposals
       set confirmations_count = confirmations_count + 1,
           threshold = case when status = 'verified' then threshold else v_threshold end
     where id = p_proposal_id;
    update public.result_proposals
       set status = 'verified', verification_level = 'participant_confirmed', verified_at = now()
     where id = p_proposal_id and status = 'proposed' and confirmations_count >= threshold;
    if exists (select 1 from public.result_proposals where id = p_proposal_id and status = 'verified') then
      perform private.ensure_recap(v_r.activity_id);
    end if;
  end if;

  v_state := private.result_state_of(p_proposal_id);
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- Moments -----------------------------------------------------------------------------------------------

-- Register a photo uploaded to storage at moments/<activity_id>/<your user id>/<file>. Players only,
-- while the game is Live or in After. Tags must be players too.
create or replace function public.add_moment(
  p_activity_id uuid,
  p_storage_path text,
  p_alt_text text default null,
  p_caption text default null,
  p_tagged_user_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_a public.activities%rowtype;
  v_id uuid;
begin
  select * into v_a from public.activities where id = p_activity_id;
  if not found or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  if not authz.is_player(p_activity_id, v_uid) then
    perform private.fail('not_player');
  end if;
  if private.activity_status_now(v_a) not in ('live', 'after') then
    perform private.fail('moments_closed');
  end if;
  if p_storage_path is null
     or p_storage_path not like p_activity_id::text || '/' || v_uid::text || '/%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'moments' and o.name = p_storage_path) then
    perform private.fail('moment_path_invalid');
  end if;
  if exists (select 1 from unnest(coalesce(p_tagged_user_ids, '{}')) x
             where not authz.is_player(p_activity_id, x) or authz.is_blocked(x, v_uid)) then
    perform private.fail('invalid_argument', 'tags must be players');
  end if;

  begin
    insert into public.moments (activity_id, author_id, storage_path, alt_text, caption)
    values (p_activity_id, v_uid, p_storage_path, nullif(trim(p_alt_text), ''), nullif(trim(p_caption), ''))
    returning id into v_id;
  exception
    when unique_violation then
      select m.id into v_id from public.moments m where m.storage_path = p_storage_path;
      return v_id;
    when check_violation then
      perform private.fail('invalid_argument', 'alt_text or caption');
  end;
  insert into public.moment_tags (moment_id, user_id, tagged_by)
  select distinct v_id, x, v_uid from unnest(coalesce(p_tagged_user_ids, '{}')) x
  on conflict do nothing;
  update public.recaps set moments_count = moments_count + 1
   where activity_id = p_activity_id and finalized_at is null;
  return v_id;
end;
$$;

-- Anyone tagged can untag themselves, any time. Idempotent.
create or replace function public.untag_me(p_moment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  delete from public.moment_tags where moment_id = p_moment_id and user_id = v_uid;
  return true;
end;
$$;

-- The author removes a moment (delete the storage object too, with the storage API).
create or replace function public.remove_moment(p_moment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_activity uuid;
begin
  delete from public.moments where id = p_moment_id and author_id = v_uid returning activity_id into v_activity;
  if v_activity is null then
    if exists (select 1 from public.moments where id = p_moment_id) then
      perform private.fail('not_author');
    end if;
    return true;
  end if;
  update public.recaps set moments_count = greatest(moments_count - 1, 0)
   where activity_id = v_activity and finalized_at is null;
  return true;
end;
$$;

-- Reputation (structured evidence; profiles show a signal from 5 confirmations) -----------------------------

create or replace function public.give_reputation(
  p_activity_id uuid, p_subject_id uuid, p_kind public.reputation_kind
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_a public.activities%rowtype;
begin
  select * into v_a from public.activities where id = p_activity_id;
  if not found or not authz.is_player(p_activity_id, v_uid) then
    perform private.fail('not_player');
  end if;
  if p_subject_id = v_uid or not authz.is_player(p_activity_id, p_subject_id)
     or authz.is_blocked(p_subject_id, v_uid) then
    perform private.fail('invalid_argument', 'subject');
  end if;
  if private.activity_status_now(v_a) <> 'after' then
    perform private.fail('result_not_open');
  end if;
  insert into public.reputation_signals (giver_id, subject_id, activity_id, kind)
  values (v_uid, p_subject_id, p_activity_id, p_kind)
  on conflict do nothing;
  return true;
end;
$$;

-- Run It Back -----------------------------------------------------------------------------------------------

-- A NEW plan from a played activity: same sport, place, capacity, details and meeting point, at a new
-- time. The previous players get an invite. Nobody is a member, not even the caller, until they tap
-- I'M DOWN. Attendance is never copied. If someone already ran it back to the same time, that plan is
-- returned (created = false).
create or replace function public.run_it_back(
  p_activity_id uuid, p_starts_at timestamptz, p_idempotency_key uuid
)
returns public.run_it_back_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_a public.activities%rowtype;
  v_p public.plans%rowtype;
  v_plan uuid;
  v_created boolean := false;
  v_sent integer := 0;
  v_chain integer;
  v_state public.run_it_back_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'run_it_back:' || p_activity_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.run_it_back_state, v_prior);
  end if;

  select * into v_a from public.activities where id = p_activity_id;
  if not found or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  if not authz.is_player(p_activity_id, v_uid) and v_a.host_id <> v_uid then
    perform private.fail('not_player');
  end if;
  if private.activity_status_now(v_a) not in ('after', 'complete') then
    perform private.fail('activity_not_finished');
  end if;
  if p_starts_at is null or p_starts_at < now() + interval '1 hour' or p_starts_at > now() + interval '30 days' then
    perform private.fail('starts_at_invalid');
  end if;
  select * into v_p from public.plans where id = v_a.plan_id;

  perform pg_advisory_xact_lock(hashtext('ojoro_run_it_back:' || p_activity_id));
  select p.id into v_plan from public.plans p
   where p.source = 'run_it_back' and p.source_activity_id = p_activity_id and p.starts_at = p_starts_at
     and p.status in ('forming', 'game_on');

  if v_plan is null then
    insert into public.plans (
      sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
      source, source_activity_id, created_by, host_id, member_count, level_label, team_a_label,
      team_b_label, teams_note, kit_note, cost_cents, currency, attendance_rule
    ) values (
      v_p.sport_id, v_p.title, p_starts_at, v_p.duration_minutes, v_a.place_id, v_a.capacity, v_p.audience,
      p_starts_at - interval '1 hour', 'run_it_back', p_activity_id, v_uid, v_uid, 0,
      v_a.level_label, v_a.team_a_label, v_a.team_b_label, v_a.teams_note, v_a.kit_note,
      v_a.cost_cents, v_a.currency, v_a.attendance_rule
    ) returning id into v_plan;
    v_created := true;

    insert into public.plan_meeting_points (plan_id, label, lat, lng)
    select v_plan, mp.label, mp.lat, mp.lng from public.plan_meeting_points mp where mp.plan_id = v_a.plan_id;
  end if;

  -- Invites (not memberships) for everyone who played, except the caller and blocked pairs.
  insert into public.plan_invites (plan_id, inviter_id, invitee_id, kind)
  select v_plan, v_uid, t.user_id, 'run_it_back'
  from public.attendance t
  where t.activity_id = p_activity_id and t.status = 'checked_in' and t.user_id <> v_uid
    and not authz.is_blocked(t.user_id, v_uid)
  on conflict (plan_id, invitee_id) do nothing;
  get diagnostics v_sent = row_count;

  -- How many games in a row this chain has run (3 offers a Ritual).
  with recursive chain as (
    select v_plan as plan_id, 1 as n
    union all
    select a.plan_id, c.n + 1
    from chain c
    join public.plans p on p.id = c.plan_id
    join public.activities a on a.id = p.source_activity_id
    where p.source = 'run_it_back' and c.n < 52
  )
  select max(n) into v_chain from chain;

  if v_created then
    perform private.emit('run_it_back', v_uid,
      jsonb_build_object('plan_id', v_plan, 'source_activity_id', p_activity_id, 'invites', v_sent));
  end if;

  v_state := row(v_plan, v_created, v_sent, p_starts_at, v_chain)::public.run_it_back_state;
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- Privileges --------------------------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;

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
