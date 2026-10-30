-- Step 6 (Host OS core): programs, series → sessions, joining, approval, the waitlist and the roster log.
--
-- Contract: docs/HOSTS_CONTRACT.md. Schema: 20261030200000_host_core.sql.
--
-- A session is a Slice 01 plan (source 'host_session', locked GAME ON at creation) plus its activity.
-- Joining goes through join_waitlist (Slice 01, now host-aware) or ask_to_join; leaving through
-- cancel_attendance (Slice 01, now honouring the host's auto-fill cutoff). Every roster change on a
-- session's activity is written to host_session_log by a trigger, whichever path made it.

-- Return shapes ------------------------------------------------------------------------------------------

-- Payment status of one person for one session. Filled by the ops ledger (BE-HOST-OPS replaces
-- private.host_payment_for); null until then.
create type public.host_payment as (
  status text,            -- 'member' | 'pass' | 'paid' | 'due_at_field' | 'free' | 'refunded' | …
  label text,             -- badge words, e.g. 'MEMBER', '10-PACK', 'PAID $8', '$8 AT FIELD'
  amount_cents integer,
  currency text,
  detail text             -- e.g. '4 sessions left'
);

-- A person's pass with this program (ops ledger; null until then).
create type public.host_pass_summary as (
  kind text,              -- 'drop_in' | 'ten_pack' | 'monthly' | 'free' | …
  label text,             -- 'Monthly', '10-pack', 'Drop-in'
  renews_on date,
  sessions_left integer
);

-- "13 of 14 settled" (ops ledger; null until then).
create type public.host_settlement as (
  settled integer,
  total integer,
  note_user_id uuid,
  note text
);

-- One "Needs you" row on HostHome.
create type public.host_needs_you_item as (
  kind text,              -- core: 'join_requests', 'waitlist_choice'; ops: 'refund_request', 'league_result', …
  session_id uuid,
  object_id uuid,
  name text,              -- series / session / league name
  starts_at timestamptz,
  count integer,
  user_names text[],
  detail jsonb,
  sort_at timestamptz
);

-- One THIS WEEK row on HostHome.
create type public.host_week_item as (
  kind text,              -- 'session' (core) | 'league' (ops)
  session_id uuid,
  series_id uuid,
  object_id uuid,
  name text,
  starts_at timestamptz,
  time_zone text,
  status text,            -- 'scheduled' | 'skipped' | ops statuses
  capacity integer,
  in_count integer,
  waitlist_count integer,
  asking_count integer,
  price_cents integer,
  member_price_cents integer,
  currency text,
  approval_required boolean,
  members_first boolean,
  detail jsonb            -- ops: {"fixtures": 3, "teams": 6, "round": 3}
);

create type public.host_join_state as (
  session_id uuid,
  activity_id uuid,
  request_id uuid,
  request_status public.host_request_status,
  attendance_status public.attendance_status,
  waitlist_position integer,
  changed boolean
);

create type public.host_series_update as (
  series_id uuid,
  version integer,
  applies_from date,
  sessions_updated integer,
  sessions_added integer,
  people_notified integer
);

-- Seams for the ops ledger (BE-HOST-OPS replaces these with `create or replace`) ---------------------------

create or replace function private.host_payment_for(p_session uuid, p_user uuid)
returns public.host_payment
language sql
stable
security definer
set search_path = ''
as $$
  select null::public.host_payment;
$$;

create or replace function private.host_person_pass(p_program uuid, p_user uuid)
returns public.host_pass_summary
language sql
stable
security definer
set search_path = ''
as $$
  select null::public.host_pass_summary;
$$;

create or replace function private.host_session_settlement(p_session uuid)
returns public.host_settlement
language sql
stable
security definer
set search_path = ''
as $$
  select null::public.host_settlement;
$$;

create or replace function private.host_needs_you_ops(p_program uuid)
returns setof public.host_needs_you_item
language sql
stable
security definer
set search_path = ''
as $$
  select * from (select null::public.host_needs_you_item) x where false;
$$;

create or replace function private.host_week_ops(p_program uuid, p_from timestamptz, p_to timestamptz)
returns setof public.host_week_item
language sql
stable
security definer
set search_path = ''
as $$
  select * from (select null::public.host_week_item) x where false;
$$;

-- Constants -----------------------------------------------------------------------------------------------

-- Checked-in Ojoro games (anywhere) for the "3 or more checked-in games" auto-approve rule.
create or replace function private.host_experienced_games()
returns integer language sql immutable set search_path = '' as $$ select 3 $$;
-- Approve / decline can be undone for this many minutes.
create or replace function private.host_undo_minutes()
returns integer language sql immutable set search_path = '' as $$ select 10 $$;
-- Pushes per session for announcements (logistics only).
create or replace function private.host_pushes_per_session()
returns integer language sql immutable set search_path = '' as $$ select 2 $$;
-- Sessions are generated this many days ahead.
create or replace function private.host_horizon_days()
returns integer language sql immutable set search_path = '' as $$ select 35 $$;

-- Helpers -------------------------------------------------------------------------------------------------

create or replace function private.host_level_label(p_level public.host_level)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_level when 'beginners' then 'Beginners' when 'mixed' then 'Mixed' else 'Competitive' end;
$$;

create or replace function private.host_local_ts(p_date date, p_time time, p_tz text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (p_date + p_time) at time zone coalesce(p_tz, 'America/Toronto');
$$;

-- Fails unless p_uid runs the program.
create or replace function private.host_require(p_program uuid, p_uid uuid)
returns public.host_programs
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.host_programs%rowtype;
begin
  select * into v from public.host_programs where id = p_program;
  if not found then
    perform private.fail('program_not_found');
  end if;
  if not authz.is_program_host(p_program, p_uid) then
    perform private.fail('not_program_host');
  end if;
  return v;
end;
$$;

-- The session, locked, after checking that p_uid runs its program.
create or replace function private.host_session_for_host(p_session uuid, p_uid uuid)
returns public.host_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.host_sessions%rowtype;
begin
  select * into v from public.host_sessions where id = p_session for update;
  if not found then
    perform private.fail('session_not_found');
  end if;
  if not authz.is_program_host(v.program_id, p_uid) then
    perform private.fail('not_program_host');
  end if;
  return v;
end;
$$;

-- Has checked in to one of this program's sessions (before p_before, when given).
create or replace function private.host_has_played(p_program uuid, p_user uuid, p_before timestamptz default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.host_sessions s
    join public.attendance t on t.activity_id = s.activity_id
    where s.program_id = p_program and t.user_id = p_user and t.status = 'checked_in'
      and (p_before is null or s.starts_at < p_before)
  );
$$;

-- Checked-in Ojoro games anywhere.
create or replace function private.ojoro_games(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.attendance t where t.user_id = p_user and t.status = 'checked_in';
$$;

-- Shares a crew with one of the program's hosts.
create or replace function private.host_shares_crew(p_program uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.host_program_hosts h
    join public.crew_members a on a.user_id = h.user_id
    join public.crew_members b on b.crew_id = a.crew_id and b.user_id = p_user
    where h.program_id = p_program
  ) or exists (
    select 1 from public.host_programs p
    join public.crew_members m on m.crew_id = p.crew_id and m.user_id = p_user
    where p.id = p_program
  );
$$;

-- Which auto-approve rule lets this person straight in (null = none; they ask and wait).
create or replace function private.host_auto_approval(p_program uuid, p_user uuid)
returns public.host_approved_via
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when authz.is_program_host(p_program, p_user) then 'host'::public.host_approved_via
    when authz.is_program_member(p_program, p_user) then 'member'
    when p.auto_approve_played_with and private.host_has_played(p_program, p_user) then 'played_with'
    when p.auto_approve_experienced and private.ojoro_games(p_user) >= private.host_experienced_games() then 'experienced'
    when p.auto_approve_crews and private.host_shares_crew(p_program, p_user) then 'crews'
  end
  from public.host_programs p where p.id = p_program;
$$;

-- Does the waitlist fill itself right now? Host sessions: the series switch and its cutoff
-- (2 h before by default). Ordinary activities: until check-in opens (Slice 01).
create or replace function private.waitlist_fills_itself(p_activity uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.id is null then now() < a.check_in_opens_at
    else s.waitlist_auto_fill and now() < s.auto_fill_cutoff_at and now() < a.check_in_opens_at
  end
  from public.activities a
  left join public.host_sessions s on s.activity_id = a.id
  where a.id = p_activity;
$$;

-- First person on the waitlist (same order as Slice 01 promotion).
create or replace function private.first_waitlisted(p_activity uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.user_id from public.attendance t
  where t.activity_id = p_activity and t.status = 'waitlisted'
  order by t.waitlisted_at, t.user_id
  limit 1;
$$;

-- Move one waitlisted person in. Caller holds the activity row lock.
create or replace function private.promote_waitlisted(p_activity uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.attendance set status = 'confirmed', confirmed_at = now()
   where activity_id = p_activity and user_id = p_user and status = 'waitlisted';
  if found then
    update public.activities
       set confirmed_count = confirmed_count + 1, waitlist_count = waitlist_count - 1
     where id = p_activity;
  end if;
end;
$$;

-- Take one person out (confirmed, checked in or waitlisted) and refill from the waitlist when it
-- fills itself. Caller holds the activity row lock. Returns who was promoted, if anyone.
create or replace function private.drop_attendance(p_activity uuid, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cur public.attendance_status;
  v_promoted uuid;
begin
  select t.status into v_cur from public.attendance t
   where t.activity_id = p_activity and t.user_id = p_user for update;
  if v_cur is null or v_cur = 'cancelled' then
    return null;
  end if;
  update public.attendance set status = 'cancelled', cancelled_at = now()
   where activity_id = p_activity and user_id = p_user;
  if v_cur = 'waitlisted' then
    update public.activities set waitlist_count = waitlist_count - 1 where id = p_activity;
    return null;
  end if;
  update public.activities
     set confirmed_count = confirmed_count - 1,
         checked_in_count = checked_in_count - case when v_cur = 'checked_in' then 1 else 0 end
   where id = p_activity;
  delete from public.location_shares where activity_id = p_activity and user_id = p_user;
  if private.waitlist_fills_itself(p_activity) then
    v_promoted := private.first_waitlisted(p_activity);
    if v_promoted is not null then
      perform private.promote_waitlisted(p_activity, v_promoted);
    end if;
  end if;
  return v_promoted;
end;
$$;

-- Session generation ----------------------------------------------------------------------------------------

-- Create the session (plan + activity + session row) for one date. Idempotent per (series, date).
create or replace function private.host_create_session(p_series uuid, p_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.host_series%rowtype;
  v_place public.places%rowtype;
  v_owner uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_plan uuid;
  v_activity uuid;
  v_id uuid;
  v_opens timestamptz;
begin
  select id into v_id from public.host_sessions where series_id = p_series and occurs_on = p_date;
  if v_id is not null then
    return v_id;
  end if;
  select * into s from public.host_series where id = p_series;
  select * into v_place from public.places where id = s.place_id;
  select h.user_id into v_owner from public.host_program_hosts h
   where h.program_id = s.program_id and h.role = 'owner';
  v_start := private.host_local_ts(p_date, s.start_time, v_place.time_zone);
  v_end := v_start + make_interval(mins => s.duration_minutes);
  v_opens := v_start - make_interval(days => s.join_opens_days);

  insert into public.plans (
    sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, deadline_at, status,
    source, created_by, host_id, member_count, level_label, teams_note, kit_note, cost_cents, currency,
    attendance_rule, locked_at
  ) values (
    s.sport_id, s.name, v_start, s.duration_minutes, s.place_id, s.capacity, 'public', v_start, 'game_on',
    'host_session', s.created_by, coalesce(v_owner, s.created_by), 0, private.host_level_label(s.level),
    s.teams_note, s.kit_note, s.price_cents, s.currency, 'check_in_host_confirms', now()
  ) returning id into v_plan;

  insert into public.activities (
    plan_id, sport_id, title, starts_at, ends_at, place_id, capacity, host_id, level_label, teams_note,
    kit_note, cost_cents, currency, attendance_rule, check_in_opens_at, check_in_closes_at, after_closes_at
  ) values (
    v_plan, s.sport_id, s.name, v_start, v_end, s.place_id, s.capacity, coalesce(v_owner, s.created_by),
    private.host_level_label(s.level), s.teams_note, s.kit_note, s.price_cents, s.currency,
    'check_in_host_confirms', v_start - interval '30 minutes', v_end, v_end + interval '24 hours'
  ) returning id into v_activity;

  insert into public.host_sessions (
    program_id, series_id, occurs_on, starts_at, plan_id, activity_id, series_version, opens_at,
    members_open_at, approval_required, waitlist_auto_fill, auto_fill_cutoff_at, members_first,
    price_cents, member_price_cents, currency, refund_window
  ) values (
    s.program_id, s.id, p_date, v_start, v_plan, v_activity, s.version, v_opens,
    case when s.members_first then v_opens - make_interval(hours => s.members_early_hours) else v_opens end,
    s.approval_required, s.waitlist_auto_fill,
    v_start - make_interval(mins => s.auto_fill_cutoff_minutes), s.members_first,
    s.price_cents, s.member_price_cents, s.currency, s.refund_window
  ) returning id into v_id;
  return v_id;
end;
$$;

-- Generate the series' sessions from today up to the horizon. Returns how many were created.
create or replace function private.host_materialize_series(p_series uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.host_series%rowtype;
  v_tz text;
  v_today date;
  v_last date;
  v_d date;
  v_n integer := 0;
begin
  select * into s from public.host_series where id = p_series;
  if not found or s.ended_at is not null then
    return 0;
  end if;
  select pl.time_zone into v_tz from public.places pl where pl.id = s.place_id;
  v_today := (now() at time zone v_tz)::date;
  v_last := least(coalesce(s.until_on, v_today + private.host_horizon_days()), v_today + private.host_horizon_days());
  for v_d in
    select g::date from generate_series(greatest(s.starts_on, v_today)::timestamp, v_last::timestamp, interval '1 day') g
    where extract(isodow from g)::smallint = any (s.repeat_days)
  loop
    if private.host_local_ts(v_d, s.start_time, v_tz) > now()
       and not exists (select 1 from public.host_sessions x where x.series_id = p_series and x.occurs_on = v_d) then
      perform private.host_create_session(p_series, v_d);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- Roster log (every path that changes a session's attendance) ---------------------------------------------

create or replace function private.on_host_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.host_sessions%rowtype;
  v_kind public.host_log_kind;
  v_related uuid;
  v_drop_id bigint;
begin
  select * into v_s from public.host_sessions where activity_id = new.activity_id;
  if not found then
    return null;
  end if;
  if tg_op = 'INSERT' then
    v_kind := case new.status
      when 'confirmed' then 'joined'::public.host_log_kind
      when 'waitlisted' then 'waitlisted'
      when 'checked_in' then 'checked_in'
    end;
  else
    if old.status = new.status then
      return null;
    end if;
    v_kind := case
      when new.status = 'cancelled' and old.status in ('confirmed', 'checked_in') then 'dropped'::public.host_log_kind
      when new.status = 'cancelled' and old.status = 'waitlisted' then 'left_waitlist'
      when new.status = 'confirmed' and old.status = 'waitlisted' then 'promoted'
      when new.status = 'confirmed' then 'joined'
      when new.status = 'waitlisted' then 'waitlisted'
      when new.status = 'checked_in' then 'checked_in'
    end;
  end if;
  if v_kind is null then
    return null;
  end if;

  if v_kind = 'promoted' then
    -- The latest drop nobody has taken yet is the spot this person took.
    select l.id, l.user_id into v_drop_id, v_related from public.host_session_log l
     where l.session_id = v_s.id and l.kind = 'dropped' and l.related_user_id is null
       and l.user_id <> new.user_id
     order by l.id desc limit 1;
    if v_drop_id is not null then
      update public.host_session_log set related_user_id = new.user_id where id = v_drop_id;
    end if;
  end if;

  insert into public.host_session_log (session_id, kind, user_id, related_user_id, actor_id)
  values (v_s.id, v_kind, new.user_id, v_related, auth.uid());

  if v_kind in ('joined', 'waitlisted', 'promoted', 'checked_in') then
    insert into public.host_people (program_id, user_id) values (v_s.program_id, new.user_id)
    on conflict (program_id, user_id) do nothing;
  end if;
  return null;
end;
$$;

create trigger host_attendance_log after insert or update of status on public.attendance
  for each row execute function private.on_host_attendance();

-- Joining ---------------------------------------------------------------------------------------------------

create or replace function private.host_join_state_of(p_session uuid, p_uid uuid, p_changed boolean)
returns public.host_join_state
language sql
stable
security definer
set search_path = ''
as $$
  select row(
    s.id, s.activity_id, r.id, r.status, t.status,
    case when t.status = 'waitlisted' then (
      select count(*)::integer from public.attendance w
      where w.activity_id = s.activity_id and w.status = 'waitlisted'
        and (w.waitlisted_at, w.user_id) <= (t.waitlisted_at, t.user_id)
    ) end,
    p_changed
  )::public.host_join_state
  from public.host_sessions s
  left join public.host_join_requests r on r.session_id = s.id and r.user_id = p_uid
  left join public.attendance t on t.activity_id = s.activity_id and t.user_id = p_uid
  where s.id = p_session;
$$;

-- Put a person into a session (in, or on the waitlist when it's full). p_actor is who acted: the
-- person, or a host approving/adding them (hosts skip the joining window and approval). Caller holds
-- the activity row lock.
create or replace function private.host_join(p_session uuid, p_uid uuid, p_actor uuid)
returns public.attendance_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.host_sessions%rowtype;
  a public.activities%rowtype;
  v_cur public.attendance_status;
  v_by_host boolean;
  v_member boolean;
  v_via public.host_approved_via;
begin
  select * into s from public.host_sessions where id = p_session;
  select * into a from public.activities where id = s.activity_id for update;
  select t.status into v_cur from public.attendance t where t.activity_id = a.id and t.user_id = p_uid;
  if v_cur in ('confirmed', 'checked_in', 'waitlisted') then
    return private.attendance_state_of(a.id, p_uid, false);
  end if;
  if s.status = 'skipped' then
    perform private.fail('session_skipped');
  end if;
  if private.activity_status_now(a) = 'cancelled' then
    perform private.fail('activity_cancelled');
  elsif private.activity_status_now(a) <> 'confirmed' then
    perform private.fail('activity_started');
  end if;

  v_by_host := authz.is_program_host(s.program_id, p_actor);
  if exists (select 1 from public.host_program_hosts h
             where h.program_id = s.program_id and authz.is_blocked(h.user_id, p_uid)) then
    perform private.fail('plan_not_found');
  end if;
  if exists (select 1 from public.attendance t
             where t.activity_id = a.id and t.status in ('confirmed', 'checked_in', 'waitlisted')
               and authz.is_blocked(t.user_id, p_uid)) then
    perform private.fail('plan_unavailable');
  end if;

  if not v_by_host then
    v_member := authz.is_program_member(s.program_id, p_uid);
    if now() < s.members_open_at or (now() < s.opens_at and not (s.members_first and v_member)) then
      perform private.fail('joining_not_open',
        (case when s.members_first and v_member then s.members_open_at else s.opens_at end)::text);
    end if;
    if s.approval_required then
      v_via := private.host_auto_approval(s.program_id, p_uid);
      if v_via is null and not exists (
        select 1 from public.host_join_requests r
        where r.session_id = s.id and r.user_id = p_uid and r.status = 'approved'
      ) then
        perform private.fail('approval_required');
      end if;
      if v_via is not null then
        update public.host_join_requests
           set status = 'approved', approved_via = v_via, decided_at = now()
         where session_id = s.id and user_id = p_uid and status = 'pending';
      end if;
    end if;
  end if;

  -- In when there's room and nobody is already waiting (the queue keeps its order); else waitlist.
  if a.confirmed_count < a.capacity and a.waitlist_count = 0 and now() < a.check_in_opens_at then
    insert into public.attendance (activity_id, user_id, status, confirmed_at)
    values (a.id, p_uid, 'confirmed', now())
    on conflict (activity_id, user_id) do update
      set status = 'confirmed', confirmed_at = now(), cancelled_at = null, waitlisted_at = null,
          checked_in_at = null, check_in_method = null;
    update public.activities set confirmed_count = confirmed_count + 1 where id = a.id;
  else
    insert into public.attendance (activity_id, user_id, status, waitlisted_at)
    values (a.id, p_uid, 'waitlisted', now())
    on conflict (activity_id, user_id) do update
      set status = 'waitlisted', waitlisted_at = now(), cancelled_at = null,
          checked_in_at = null, check_in_method = null;
    update public.activities set waitlist_count = waitlist_count + 1 where id = a.id;
  end if;

  perform private.emit('host_session_joined', p_uid,
    jsonb_build_object('session_id', s.id, 'program_id', s.program_id, 'by_host', v_by_host));
  return private.attendance_state_of(a.id, p_uid, true);
end;
$$;

-- Slice 01 join_waitlist, now host-aware: a host session goes through private.host_join (joining
-- window, members first, approval). Everything else is unchanged.
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
  v_session uuid;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'join_waitlist:' || p_activity_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.attendance_state, v_prior);
  end if;

  select * into v_a from public.activities where id = p_activity_id for update;
  if not found or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;

  select s.id into v_session from public.host_sessions s where s.activity_id = p_activity_id;
  if v_session is not null then
    v_state := private.host_join(v_session, v_uid, v_uid);
    perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
    return v_state;
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

-- Slice 01 cancel_attendance, now with the host's auto-fill rule (private.waitlist_fills_itself):
-- a host session's waitlist fills itself until its cutoff (2 h before), then the host chooses.
-- Ordinary activities behave exactly as before (until check-in opens).
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
  else
    v_promoted := private.drop_attendance(p_activity_id, v_uid);
    v_state := private.attendance_state_of(p_activity_id, v_uid, true, v_promoted);
  end if;

  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- Programs --------------------------------------------------------------------------------------------------

create or replace function public.create_host_program(
  p_name text,
  p_sport_id text default null,
  p_area text default null,
  p_crew_id uuid default null,
  p_idempotency_key uuid default null
)
returns public.host_programs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_row public.host_programs%rowtype;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_host_program');
  if v_prior is not null then
    return jsonb_populate_record(null::public.host_programs, v_prior);
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then
    perform private.fail('invalid_argument', 'name');
  end if;
  if p_sport_id is not null and not exists (select 1 from public.sports s where s.id = p_sport_id) then
    perform private.fail('sport_unknown');
  end if;
  if p_crew_id is not null and not authz.is_crew_member(p_crew_id, v_uid) then
    perform private.fail('invalid_argument', 'crew_id');
  end if;
  insert into public.host_programs (name, sport_id, area, crew_id, created_by)
  values (btrim(p_name), p_sport_id,
          coalesce(nullif(btrim(p_area), ''), (select pr.area from public.profiles pr where pr.id = v_uid)),
          p_crew_id, v_uid)
  returning * into v_row;
  insert into public.host_program_hosts (program_id, user_id, role, added_by)
  values (v_row.id, v_uid, 'owner', v_uid);
  perform private.emit('host_program_created', v_uid, jsonb_build_object('program_id', v_row.id));
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_row));
  return v_row;
end;
$$;

-- Programs I run, for You → "Crews, clans & hosting".
create or replace function public.my_host_programs()
returns table (
  id uuid,
  name text,
  area text,
  sport_id text,
  role public.host_role,
  next_session_at timestamptz,
  upcoming_sessions integer,
  pending_requests integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.area, p.sport_id, h.role,
         (select min(s.starts_at) from public.host_sessions s
           where s.program_id = p.id and s.status = 'scheduled' and s.starts_at > now()),
         (select count(*)::integer from public.host_sessions s
           where s.program_id = p.id and s.status = 'scheduled' and s.starts_at > now()
             and s.starts_at < now() + interval '7 days'),
         (select count(*)::integer from public.host_join_requests r
           join public.host_sessions s on s.id = r.session_id
           where s.program_id = p.id and r.status = 'pending' and s.starts_at > now())
  from public.host_program_hosts h
  join public.host_programs p on p.id = h.program_id
  where h.user_id = auth.uid() and p.archived_at is null
  order by p.name;
$$;

-- LET THESE STRAIGHT IN. Null leaves a rule as it is.
create or replace function public.update_host_rules(
  p_program_id uuid,
  p_played_with boolean default null,
  p_experienced boolean default null,
  p_crews boolean default null
)
returns public.host_programs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_row public.host_programs%rowtype;
begin
  perform private.host_require(p_program_id, v_uid);
  update public.host_programs
     set auto_approve_played_with = coalesce(p_played_with, auto_approve_played_with),
         auto_approve_experienced = coalesce(p_experienced, auto_approve_experienced),
         auto_approve_crews = coalesce(p_crews, auto_approve_crews)
   where id = p_program_id
  returning * into v_row;
  perform private.emit('host_rules_changed', v_uid, jsonb_build_object(
    'program_id', p_program_id, 'played_with', v_row.auto_approve_played_with,
    'experienced', v_row.auto_approve_experienced, 'crews', v_row.auto_approve_crews));
  return v_row;
end;
$$;

create or replace function public.add_co_host(p_program_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.host_require(p_program_id, v_uid);
  if authz.program_role(p_program_id, v_uid) <> 'owner' then
    perform private.fail('owner_required');
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = p_user_id) or authz.is_blocked(v_uid, p_user_id) then
    perform private.fail('user_not_found');
  end if;
  insert into public.host_program_hosts (program_id, user_id, role, added_by)
  values (p_program_id, p_user_id, 'co_host', v_uid)
  on conflict (program_id, user_id) do nothing;
  return found;
end;
$$;

create or replace function public.remove_co_host(p_program_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.host_require(p_program_id, v_uid);
  -- The owner removes anyone but themselves; a co-host may step down.
  if not (authz.program_role(p_program_id, v_uid) = 'owner' or p_user_id = v_uid) then
    perform private.fail('owner_required');
  end if;
  delete from public.host_program_hosts
   where program_id = p_program_id and user_id = p_user_id and role = 'co_host';
  return found;
end;
$$;

-- Members by hand (the ops ledger also writes host_program_members when a monthly pass is bought).
create or replace function public.set_program_member(
  p_program_id uuid, p_user_id uuid, p_member boolean, p_ends_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.host_require(p_program_id, v_uid);
  if not exists (select 1 from public.profiles pr where pr.id = p_user_id) then
    perform private.fail('user_not_found');
  end if;
  if p_ends_at is not null and p_ends_at <= now() then
    perform private.fail('invalid_argument', 'ends_at');
  end if;
  if p_member then
    insert into public.host_program_members (program_id, user_id, ends_at, source)
    values (p_program_id, p_user_id, p_ends_at, 'host')
    on conflict (program_id, user_id) do update
      set ends_at = excluded.ends_at,
          started_at = case when public.host_program_members.ends_at is not null
                                 and public.host_program_members.ends_at <= now()
                            then now() else public.host_program_members.started_at end;
    insert into public.host_people (program_id, user_id) values (p_program_id, p_user_id)
    on conflict (program_id, user_id) do nothing;
  else
    update public.host_program_members set ends_at = now()
     where program_id = p_program_id and user_id = p_user_id and (ends_at is null or ends_at > now());
  end if;
  return true;
end;
$$;

-- Series ------------------------------------------------------------------------------------------------------

-- Keys update_series / create_series accept.
create or replace function private.host_series_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['name', 'sport_id', 'place_id', 'start_time', 'duration_minutes', 'capacity', 'level',
               'repeat_days', 'starts_on', 'until_on', 'join_opens_days', 'approval_required',
               'waitlist_auto_fill', 'members_first', 'price_cents', 'member_price_cents', 'currency',
               'refund_window', 'teams_note', 'kit_note'];
$$;

-- Changes that matter to people already in (they get one message).
create or replace function private.host_notify_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['name', 'place_id', 'start_time', 'duration_minutes', 'level', 'repeat_days', 'until_on',
               'price_cents', 'member_price_cents', 'refund_window', 'teams_note', 'kit_note'];
$$;

-- Merge p_changes into a series row and validate it. Raises series_invalid with the field.
create or replace function private.host_series_merge(p_base public.host_series, p_changes jsonb)
returns public.host_series
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.host_series%rowtype;
  v_bad text;
  v_days smallint[];
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    perform private.fail('series_invalid', 'changes');
  end if;
  select k into v_bad from jsonb_object_keys(p_changes) k where k <> all (private.host_series_keys()) limit 1;
  if v_bad is not null then
    perform private.fail('series_invalid', v_bad);
  end if;
  begin
    v := jsonb_populate_record(p_base, p_changes);
  exception when others then
    -- Which value didn't parse: try each key on its own.
    for v_bad in select k from jsonb_object_keys(p_changes) k loop
      begin
        perform jsonb_populate_record(p_base, jsonb_build_object(v_bad, p_changes -> v_bad));
      exception when others then
        perform private.fail('series_invalid', v_bad);
      end;
    end loop;
    perform private.fail('series_invalid', 'changes');
  end;
  select coalesce(array_agg(distinct d order by d), '{}') into v_days from unnest(v.repeat_days) d;
  v.repeat_days := v_days;
  v.name := btrim(v.name);

  if v.name is null or char_length(v.name) not between 1 and 60 then
    perform private.fail('series_invalid', 'name');
  elsif v.sport_id is null or not exists (select 1 from public.sports s where s.id = v.sport_id) then
    perform private.fail('series_invalid', 'sport_id');
  elsif v.place_id is null or not exists (select 1 from public.places pl where pl.id = v.place_id) then
    perform private.fail('series_invalid', 'place_id');
  elsif v.start_time is null then
    perform private.fail('series_invalid', 'start_time');
  elsif v.duration_minutes is null or v.duration_minutes not between 15 and 480 then
    perform private.fail('series_invalid', 'duration_minutes');
  elsif v.capacity is null or v.capacity not between 2 and 100 then
    perform private.fail('series_invalid', 'capacity');
  elsif cardinality(v.repeat_days) not between 1 and 7 or not (v.repeat_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]) then
    perform private.fail('series_invalid', 'repeat_days');
  elsif v.starts_on is null then
    perform private.fail('series_invalid', 'starts_on');
  elsif v.until_on is not null and v.until_on < v.starts_on then
    perform private.fail('series_invalid', 'until_on');
  elsif v.join_opens_days is null or v.join_opens_days not between 0 and 30 then
    perform private.fail('series_invalid', 'join_opens_days');
  elsif v.price_cents is null or v.price_cents not between 0 and 100000 then
    perform private.fail('series_invalid', 'price_cents');
  elsif v.member_price_cents is null or v.member_price_cents not between 0 and 100000 then
    perform private.fail('series_invalid', 'member_price_cents');
  elsif v.currency is null or v.currency !~ '^[A-Z]{3}$' then
    perform private.fail('series_invalid', 'currency');
  elsif v.teams_note is not null and char_length(v.teams_note) > 200 then
    perform private.fail('series_invalid', 'teams_note');
  elsif v.kit_note is not null and char_length(v.kit_note) > 200 then
    perform private.fail('series_invalid', 'kit_note');
  elsif v.level is null or v.refund_window is null or v.approval_required is null
        or v.waitlist_auto_fill is null or v.members_first is null then
    perform private.fail('series_invalid', 'switches');
  end if;
  return v;
end;
$$;

create or replace function public.create_series(p_program_id uuid, p_settings jsonb, p_idempotency_key uuid)
returns public.host_series
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_prog public.host_programs%rowtype;
  v_base public.host_series%rowtype;
  v public.host_series%rowtype;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_series:' || p_program_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.host_series, v_prior);
  end if;
  v_prog := private.host_require(p_program_id, v_uid);
  v_base.id := gen_random_uuid();
  v_base.program_id := p_program_id;
  v_base.sport_id := v_prog.sport_id;
  v_base.level := 'mixed';
  v_base.join_opens_days := 5;
  v_base.members_early_hours := 48;
  v_base.approval_required := false;
  v_base.waitlist_auto_fill := true;
  v_base.auto_fill_cutoff_minutes := 120;
  v_base.members_first := false;
  v_base.price_cents := 0;
  v_base.member_price_cents := 0;
  v_base.currency := 'CAD';
  v_base.refund_window := 'hours_12';
  v_base.starts_on := (now() at time zone v_prog.time_zone)::date;
  v_base.capacity := coalesce((select sp.default_capacity from public.sports sp where sp.id = v_prog.sport_id), 10);
  v_base.version := 1;
  v_base.created_by := v_uid;
  v_base.created_at := now();
  v_base.updated_at := now();
  v := private.host_series_merge(v_base, p_settings);
  insert into public.host_series select v.*;
  perform private.host_materialize_series(v.id);
  perform private.emit('host_series_created', v_uid,
    jsonb_build_object('program_id', p_program_id, 'series_id', v.id, 'capacity', v.capacity,
                       'approval_required', v.approval_required, 'price_cents', v.price_cents));
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v));
  return v;
end;
$$;

-- Edit a series. Changes apply from the next session that hasn't started; sessions already over
-- keep what they were. People already in a changed session get one message (time and place changes
-- reach them through the activity's own "moved" notification, so they aren't messaged twice).
-- p_expected_version: the version the editor loaded; a stale edit fails with series_version_conflict.
create or replace function public.update_series(
  p_series_id uuid, p_changes jsonb, p_expected_version integer default null
)
returns public.host_series_update
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_old public.host_series%rowtype;
  v public.host_series%rowtype;
  v_tz text;
  v_changed text[];
  v_sess record;
  v_start timestamptz;
  v_end timestamptz;
  v_opens timestamptz;
  v_updated integer := 0;
  v_added integer;
  v_notified integer := 0;
  v_applies date;
  v_time_or_place boolean;
begin
  select * into v_old from public.host_series where id = p_series_id for update;
  if not found then
    perform private.fail('series_not_found');
  end if;
  perform private.host_require(v_old.program_id, v_uid);
  if p_expected_version is not null and p_expected_version <> v_old.version then
    perform private.fail('series_version_conflict', v_old.version::text);
  end if;
  v := private.host_series_merge(v_old, p_changes);

  select coalesce(array_agg(k), '{}') into v_changed
  from unnest(private.host_series_keys()) k
  where (to_jsonb(v) -> k) is distinct from (to_jsonb(v_old) -> k);
  if cardinality(v_changed) = 0 then
    return row(v_old.id, v_old.version, null::date, 0, 0, 0)::public.host_series_update;
  end if;
  v.version := v_old.version + 1;

  update public.host_series set
    name = v.name, sport_id = v.sport_id, place_id = v.place_id, start_time = v.start_time,
    duration_minutes = v.duration_minutes, capacity = v.capacity, level = v.level,
    repeat_days = v.repeat_days, starts_on = v.starts_on, until_on = v.until_on,
    join_opens_days = v.join_opens_days, approval_required = v.approval_required,
    waitlist_auto_fill = v.waitlist_auto_fill, members_first = v.members_first,
    price_cents = v.price_cents, member_price_cents = v.member_price_cents, currency = v.currency,
    refund_window = v.refund_window, teams_note = v.teams_note, kit_note = v.kit_note,
    version = v.version
  where id = p_series_id;

  select pl.time_zone into v_tz from public.places pl where pl.id = v.place_id;
  v_time_or_place := v_changed && array['start_time', 'place_id'];

  for v_sess in
    select s.* from public.host_sessions s
    where s.series_id = p_series_id and s.starts_at > now()
    order by s.starts_at
    for update
  loop
    -- A date that left the schedule (repeat day removed, end date moved) is skipped, not deleted.
    if not (extract(isodow from v_sess.occurs_on)::smallint = any (v.repeat_days))
       or v_sess.occurs_on < v.starts_on or (v.until_on is not null and v_sess.occurs_on > v.until_on) then
      if v_sess.status = 'scheduled' then
        perform private.host_set_skipped(v_sess.id, v_uid, 'Not in the series anymore');
      end if;
      continue;
    end if;

    v_start := private.host_local_ts(v_sess.occurs_on, v.start_time, v_tz);
    v_end := v_start + make_interval(mins => v.duration_minutes);
    v_opens := v_start - make_interval(days => v.join_opens_days);
    v_applies := coalesce(v_applies, v_sess.occurs_on);

    update public.host_sessions set
      starts_at = v_start, series_version = v.version, opens_at = v_opens,
      members_open_at = case when v.members_first then v_opens - make_interval(hours => v.members_early_hours) else v_opens end,
      approval_required = v.approval_required, waitlist_auto_fill = v.waitlist_auto_fill,
      auto_fill_cutoff_at = v_start - make_interval(mins => v.auto_fill_cutoff_minutes),
      members_first = v.members_first, price_cents = v.price_cents,
      member_price_cents = v.member_price_cents, currency = v.currency, refund_window = v.refund_window
    where id = v_sess.id;

    update public.plans p set
      sport_id = v.sport_id, title = v.name, starts_at = v_start, deadline_at = v_start,
      duration_minutes = v.duration_minutes, place_id = v.place_id,
      capacity = greatest(v.capacity, a.confirmed_count), level_label = private.host_level_label(v.level),
      teams_note = v.teams_note, kit_note = v.kit_note, cost_cents = v.price_cents, currency = v.currency
    from public.activities a
    where p.id = v_sess.plan_id and a.id = v_sess.activity_id;

    update public.activities set
      sport_id = v.sport_id, title = v.name, starts_at = v_start, ends_at = v_end, place_id = v.place_id,
      capacity = greatest(v.capacity, confirmed_count), level_label = private.host_level_label(v.level),
      teams_note = v.teams_note, kit_note = v.kit_note, cost_cents = v.price_cents, currency = v.currency,
      check_in_opens_at = v_start - interval '30 minutes', check_in_closes_at = v_end,
      after_closes_at = v_end + interval '24 hours'
    where id = v_sess.activity_id;
    v_updated := v_updated + 1;
  end loop;

  v_added := private.host_materialize_series(p_series_id);

  -- One message per person already in (confirmed or waiting) for a changed future session, when the
  -- change matters to them and the activity's own time/place notification didn't already tell them.
  if v_changed && private.host_notify_keys() and not v_time_or_place then
    select coalesce(sum(private.notify(array[x.user_id], 'host_update', 'activity', x.activity_id, v_uid,
             'host_series:' || p_series_id,
             jsonb_build_object('change', 'series_updated', 'series_id', p_series_id,
                                'fields', to_jsonb(private.text_array_intersect(v_changed, private.host_notify_keys()))),
             p_activity => x.activity_id, p_plan => x.plan_id)), 0)::integer
      into v_notified
    from (
      select distinct on (t.user_id) t.user_id, s.activity_id, s.plan_id
      from public.host_sessions s
      join public.attendance t on t.activity_id = s.activity_id
      where s.series_id = p_series_id and s.status = 'scheduled' and s.starts_at > now()
        and t.status in ('confirmed', 'waitlisted') and t.user_id <> v_uid
      order by t.user_id, s.starts_at
    ) x;
  elsif v_time_or_place then
    select count(distinct t.user_id)::integer into v_notified
    from public.host_sessions s
    join public.attendance t on t.activity_id = s.activity_id
    where s.series_id = p_series_id and s.status = 'scheduled' and s.starts_at > now()
      and t.status in ('confirmed', 'waitlisted') and t.user_id <> v_uid;
  end if;

  perform private.emit('host_series_updated', v_uid, jsonb_build_object(
    'series_id', p_series_id, 'version', v.version, 'fields', to_jsonb(v_changed),
    'sessions_updated', v_updated, 'people_notified', v_notified));
  return row(p_series_id, v.version, v_applies, v_updated, v_added, v_notified)::public.host_series_update;
end;
$$;

-- Intersection of two text arrays, sorted.
create or replace function private.text_array_intersect(p_a text[], p_b text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(x order by x), '{}') from unnest(p_a) x where x = any (p_b);
$$;

-- Skipping a session cancels its plan and activity (people in it are told it's called off by the
-- activity notification) but keeps their attendance, so RESTORE puts everyone back.
create or replace function private.host_set_skipped(p_session uuid, p_actor uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.host_sessions%rowtype;
begin
  select * into s from public.host_sessions where id = p_session for update;
  if s.status = 'skipped' then
    return;
  end if;
  update public.host_sessions
     set status = 'skipped', skipped_at = now(), skipped_by = p_actor,
         skip_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_session;
  update public.activities set status = 'cancelled', cancelled_at = now() where id = s.activity_id;
  update public.plans set status = 'cancelled', cancelled_at = now() where id = s.plan_id;
end;
$$;

create or replace function public.skip_session(p_session_id uuid, p_reason text default null)
returns public.host_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  s public.host_sessions%rowtype;
begin
  s := private.host_session_for_host(p_session_id, v_uid);
  if p_reason is not null and char_length(p_reason) > 120 then
    perform private.fail('invalid_argument', 'reason');
  end if;
  if s.status = 'scheduled' then
    if s.starts_at <= now() then
      perform private.fail('activity_started');
    end if;
    perform private.host_set_skipped(p_session_id, v_uid, p_reason);
    perform private.emit('host_session_skipped', v_uid,
      jsonb_build_object('session_id', p_session_id, 'program_id', s.program_id));
  end if;
  select * into s from public.host_sessions where id = p_session_id;
  return s;
end;
$$;

create or replace function public.restore_session(p_session_id uuid)
returns public.host_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  s public.host_sessions%rowtype;
begin
  s := private.host_session_for_host(p_session_id, v_uid);
  if s.status = 'skipped' then
    if s.starts_at <= now() then
      perform private.fail('activity_started');
    end if;
    update public.host_sessions set status = 'scheduled', skipped_at = null, skipped_by = null, skip_reason = null
     where id = p_session_id;
    update public.activities set status = 'confirmed', cancelled_at = null where id = s.activity_id;
    update public.plans set status = 'game_on', cancelled_at = null where id = s.plan_id;
    perform private.notify(
      (select coalesce(array_agg(t.user_id), '{}') from public.attendance t
        where t.activity_id = s.activity_id and t.status in ('confirmed', 'waitlisted')),
      'host_update', 'activity', s.activity_id, v_uid, 'host_session:' || p_session_id,
      jsonb_build_object('change', 'restored', 'session_id', p_session_id),
      p_activity => s.activity_id, p_plan => s.plan_id);
    perform private.emit('host_session_restored', v_uid,
      jsonb_build_object('session_id', p_session_id, 'program_id', s.program_id));
  end if;
  select * into s from public.host_sessions where id = p_session_id;
  return s;
end;
$$;

-- SAVE AS A TEMPLATE. Same name replaces the template.
create or replace function public.save_series_template(p_series_id uuid, p_name text)
returns public.host_series_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  s public.host_series%rowtype;
  v_row public.host_series_templates%rowtype;
begin
  select * into s from public.host_series where id = p_series_id;
  if not found then
    perform private.fail('series_not_found');
  end if;
  perform private.host_require(s.program_id, v_uid);
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then
    perform private.fail('invalid_argument', 'name');
  end if;
  insert into public.host_series_templates (program_id, name, settings, created_by)
  values (s.program_id, btrim(p_name),
          (select jsonb_object_agg(k, to_jsonb(s) -> k) from unnest(private.host_series_keys()) k
            where k not in ('starts_on', 'until_on')),
          v_uid)
  on conflict (program_id, name) do update set settings = excluded.settings
  returning * into v_row;
  return v_row;
end;
$$;
