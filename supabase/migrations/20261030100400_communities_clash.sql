-- Step 6 (Communities): Ojoro Clash (PRD §9.15). Clan vs clan over several events (six by default),
-- squads, results, crowd support and standings. Contract: docs/COMMUNITIES_CONTRACT.md §Clash.
--
-- Like Call-Outs (Step 5): one clan's captain or organizer proposes, the other clan's accepts; the
-- events are fixed once accepted. Results are insert-only: a captain submits, the other side's
-- captain confirms (captains_confirmed), or an organizer both captains approved records it directly
-- (organizer_verified). Backing is a count per clan and never touches a score; no stakes, no prizes.

create type public.clash_state as (
  clash_id uuid,
  status public.clash_status,
  stage public.clash_stage,
  created boolean
);

create type public.clash_squad_state as (
  clash_event_id uuid,
  side public.team_side,
  squad_count integer,
  squad_size integer,
  i_am_in boolean,
  changed boolean
);

create type public.clash_result_state as (
  clash_event_id uuid,
  status text,              -- 'pending' (waiting for the other captain) | 'final'
  submission_id uuid,
  a_value numeric,
  b_value numeric,
  winner_side public.team_side,
  source public.clash_result_source
);

create type public.clash_backing_state as (
  clash_id uuid,
  my_backing public.team_side,
  backing_a integer,
  backing_b integer
);

-- Stage ------------------------------------------------------------------------------------------------------

create or replace function private.clash_stage(x public.clashes)
returns public.clash_stage
language sql
stable
security definer
set search_path = ''
as $$
  with ev as (
    select min(e.starts_at) as first_at,
           count(*) as n,
           count(r.clash_event_id) as decided,
           bool_or(r.clash_event_id is not null and e.position = (select max(e2.position) from public.clash_events e2
                                                                   where e2.clash_id = x.id)) as final_decided
    from public.clash_events e
    left join public.clash_event_results r on r.clash_event_id = e.id
    where e.clash_id = x.id
  )
  select case
    when x.status = 'declined' then 'declined'::public.clash_stage
    when x.status = 'cancelled' then 'cancelled'
    when x.status = 'proposed' and ev.first_at <= now() then 'cancelled'
    when x.status = 'proposed' then 'proposed'
    when ev.n > 0 and (ev.decided = ev.n or coalesce(ev.final_decided, false)) then 'complete'
    when ev.first_at <= now() then 'live'
    else 'upcoming'
  end
  from ev;
$$;

-- The design system's situation for a stage.
create or replace function private.clash_situation(p_stage public.clash_stage)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_stage
    when 'live' then 'live'
    when 'complete' then 'after'
    when 'upcoming' then 'confirmed'
    when 'proposed' then 'forming'
    else 'calm'
  end;
$$;

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
    when e.starts_at < now() + interval '7 days' then 'this_week'
    else 'upcoming'
  end;
$$;

create or replace function private.clash_state_of(p_clash uuid, p_created boolean)
returns public.clash_state
language sql
stable
security definer
set search_path = ''
as $$
  select row(x.id, x.status, private.clash_stage(x), p_created)::public.clash_state
  from public.clashes x where x.id = p_clash;
$$;

create or replace function private.require_clash(p_clash uuid, p_uid uuid)
returns public.clashes
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  x public.clashes%rowtype;
begin
  select * into x from public.clashes where id = p_clash;
  if not found or not authz.can_see_clash(p_clash, p_uid) then
    perform private.fail('clash_not_found');
  end if;
  return x;
end;
$$;

-- Propose, answer, cancel ------------------------------------------------------------------------------------

-- A clan's captain or organizer proposes a Clash to another clan. p_events: a JSON array (1 to 12, in
-- order) of {"title", "sport_id", "scoring": "time|distance|score|count", "starts_at", "place_id"?,
-- "squad_size"?}. Each event starts 1 hour to 180 days ahead.
create or replace function public.create_clash(
  p_idempotency_key uuid,
  p_clan_id uuid,
  p_opponent_clan_id uuid,
  p_title text,
  p_events jsonb,
  p_season_label text default null
)
returns public.clash_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_clash uuid;
  v_open uuid;
  v_ev jsonb;
  v_pos integer := 0;
  v_state public.clash_state;
  v_start timestamptz;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_clash');
  if v_prior is not null then
    return jsonb_populate_record(null::public.clash_state, v_prior);
  end if;
  perform private.require_clan_member(p_clan_id, v_uid);
  if not authz.clan_can(p_clan_id, 'clash', v_uid) then
    perform private.fail('clan_role_required');
  end if;
  if p_opponent_clan_id is null or p_opponent_clan_id = p_clan_id
     or not authz.can_see_clan(p_opponent_clan_id, v_uid)
     or exists (select 1 from public.clan_members m where m.clan_id = p_opponent_clan_id
                  and m.role in ('captain', 'organizer') and authz.is_blocked(m.user_id, v_uid)) then
    perform private.fail('clash_not_allowed');
  end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 40 then
    perform private.fail('invalid_argument', 'title');
  end if;
  if p_season_label is not null and char_length(trim(p_season_label)) not between 1 and 40 then
    perform private.fail('invalid_argument', 'season_label');
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) not between 1 and 12 then
    perform private.fail('invalid_argument', 'events');
  end if;
  select x.id into v_open from public.clashes x
   where least(x.a_clan_id, x.b_clan_id) = least(p_clan_id, p_opponent_clan_id)
     and greatest(x.a_clan_id, x.b_clan_id) = greatest(p_clan_id, p_opponent_clan_id)
     and x.status in ('proposed', 'scheduled') and x.cancelled_at is null
     and private.clash_stage(x) in ('proposed', 'upcoming', 'live');
  if v_open is not null then
    perform private.fail('clash_pending', v_open::text);
  end if;
  -- A lapsed or finished one no longer blocks a new one.
  update public.clashes x set status = 'cancelled', cancelled_at = now()
   where least(x.a_clan_id, x.b_clan_id) = least(p_clan_id, p_opponent_clan_id)
     and greatest(x.a_clan_id, x.b_clan_id) = greatest(p_clan_id, p_opponent_clan_id)
     and x.status = 'proposed' and private.clash_stage(x) = 'cancelled';

  insert into public.clashes (title, season_label, a_clan_id, b_clan_id, proposed_by)
  values (trim(p_title), nullif(trim(p_season_label), ''), p_clan_id, p_opponent_clan_id, v_uid)
  returning id into v_clash;

  for v_ev in select * from jsonb_array_elements(p_events) loop
    v_pos := v_pos + 1;
    begin
      v_start := (v_ev ->> 'starts_at')::timestamptz;
    exception when others then
      perform private.fail('invalid_argument', 'events[' || v_pos || '].starts_at');
    end;
    if v_start is null or v_start < now() + interval '1 hour' or v_start > now() + interval '180 days' then
      perform private.fail('starts_at_invalid', v_pos::text);
    end if;
    if not exists (select 1 from public.sports s where s.id = v_ev ->> 'sport_id') then
      perform private.fail('sport_unknown', v_pos::text);
    end if;
    if v_ev ? 'place_id' and v_ev ->> 'place_id' is not null
       and not exists (select 1 from public.places pl where pl.id::text = v_ev ->> 'place_id') then
      perform private.fail('place_unknown', v_pos::text);
    end if;
    begin
      insert into public.clash_events (clash_id, position, title, sport_id, scoring, starts_at, place_id, squad_size)
      values (v_clash, v_pos, trim(v_ev ->> 'title'), v_ev ->> 'sport_id',
              coalesce((v_ev ->> 'scoring')::public.clash_scoring, 'score'), v_start,
              nullif(v_ev ->> 'place_id', '')::uuid, (v_ev ->> 'squad_size')::integer);
    exception when check_violation or not_null_violation or invalid_text_representation then
      perform private.fail('invalid_argument', 'events[' || v_pos || ']');
    end;
  end loop;

  perform private.emit('clash_created', v_uid,
    jsonb_build_object('clash_id', v_clash, 'clan_id', p_clan_id, 'opponent_clan_id', p_opponent_clan_id,
                       'events', v_pos));
  v_state := private.clash_state_of(v_clash, true);
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- The other clan's captain or organizer accepts. Already accepted → the state. Set-to-state.
create or replace function public.accept_clash(p_clash_id uuid)
returns public.clash_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  x public.clashes%rowtype;
begin
  select * into x from public.clashes where id = p_clash_id for update;
  if not found or not authz.can_see_clash(p_clash_id, v_uid) then
    perform private.fail('clash_not_found');
  end if;
  if not authz.clan_can(x.b_clan_id, 'clash', v_uid) then
    perform private.fail('not_clash_captain');
  end if;
  if x.status = 'scheduled' then
    return private.clash_state_of(x.id, false);
  end if;
  if private.clash_stage(x) <> 'proposed' then
    perform private.fail('clash_closed');
  end if;
  update public.clashes set status = 'scheduled', accepted_by = v_uid, accepted_at = now() where id = x.id;
  perform private.emit('clash_accepted', v_uid, jsonb_build_object('clash_id', x.id));
  return private.clash_state_of(x.id, true);
end;
$$;

-- The other clan says no. Already declined → the state.
create or replace function public.decline_clash(p_clash_id uuid)
returns public.clash_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  x public.clashes%rowtype;
begin
  select * into x from public.clashes where id = p_clash_id for update;
  if not found or not authz.can_see_clash(p_clash_id, v_uid) then
    perform private.fail('clash_not_found');
  end if;
  if not authz.clan_can(x.b_clan_id, 'clash', v_uid) then
    perform private.fail('not_clash_captain');
  end if;
  if x.status = 'declined' then
    return private.clash_state_of(x.id, false);
  end if;
  if private.clash_stage(x) <> 'proposed' then
    perform private.fail('clash_closed');
  end if;
  update public.clashes set status = 'declined', declined_at = now() where id = x.id;
  perform private.emit('clash_declined', v_uid, jsonb_build_object('clash_id', x.id));
  return private.clash_state_of(x.id, true);
end;
$$;

-- Either side's captain or organizer calls it off before the first event. Already → the state.
create or replace function public.cancel_clash(p_clash_id uuid)
returns public.clash_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  x public.clashes%rowtype;
begin
  select * into x from public.clashes where id = p_clash_id for update;
  if not found or not authz.can_see_clash(p_clash_id, v_uid) then
    perform private.fail('clash_not_found');
  end if;
  if authz.clash_captain_side(x.id, v_uid) is null then
    perform private.fail('not_clash_captain');
  end if;
  if x.status = 'cancelled' then
    return private.clash_state_of(x.id, false);
  end if;
  if private.clash_stage(x) not in ('proposed', 'upcoming') then
    perform private.fail('clash_closed');
  end if;
  update public.clashes set status = 'cancelled', cancelled_at = now() where id = x.id;
  perform private.emit('clash_cancelled', v_uid, jsonb_build_object('clash_id', x.id));
  return private.clash_state_of(x.id, true);
end;
$$;

-- Organizers: each side's captain proposes the same person; approved once both have. Not a member of
-- either clan, no block with either captain. p_remove withdraws your side's yes (and the approval).
create or replace function public.propose_clash_organizer(p_clash_id uuid, p_user_id uuid, p_remove boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  x public.clashes%rowtype := private.require_clash(p_clash_id, v_uid);
  v_side public.team_side := authz.clash_captain_side(p_clash_id, v_uid);
begin
  if v_side is null then
    perform private.fail('not_clash_captain');
  end if;
  if coalesce(p_remove, false) then
    update public.clash_organizers
       set proposed_by_a = proposed_by_a and v_side <> 'a', proposed_by_b = proposed_by_b and v_side <> 'b',
           approved_at = null
     where clash_id = p_clash_id and user_id = p_user_id;
    delete from public.clash_organizers where clash_id = p_clash_id and user_id = p_user_id
      and not proposed_by_a and not proposed_by_b;
    return false;
  end if;
  if private.clash_stage(x) not in ('proposed', 'upcoming', 'live') then
    perform private.fail('clash_closed');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id)
     or authz.is_clan_member(x.a_clan_id, p_user_id) or authz.is_clan_member(x.b_clan_id, p_user_id)
     or exists (select 1 from public.clan_members m where m.clan_id in (x.a_clan_id, x.b_clan_id)
                  and m.role in ('captain', 'organizer') and authz.is_blocked(m.user_id, p_user_id)) then
    perform private.fail('organizer_not_allowed');
  end if;
  insert into public.clash_organizers (clash_id, user_id, proposed_by_a, proposed_by_b)
  values (p_clash_id, p_user_id, v_side = 'a', v_side = 'b')
  on conflict (clash_id, user_id) do update
    set proposed_by_a = public.clash_organizers.proposed_by_a or excluded.proposed_by_a,
        proposed_by_b = public.clash_organizers.proposed_by_b or excluded.proposed_by_b;
  update public.clash_organizers set approved_at = coalesce(approved_at, now())
   where clash_id = p_clash_id and user_id = p_user_id and proposed_by_a and proposed_by_b;
  return exists (select 1 from public.clash_organizers o
                 where o.clash_id = p_clash_id and o.user_id = p_user_id and o.approved_at is not null);
end;
$$;

-- Squads -----------------------------------------------------------------------------------------------------

create or replace function private.clash_squad_state_of(p_event uuid, p_uid uuid, p_side public.team_side, p_changed boolean)
returns public.clash_squad_state
language sql
stable
security definer
set search_path = ''
as $$
  select row(e.id, p_side,
             (select count(*)::integer from public.clash_squad_members s where s.clash_event_id = e.id and s.side = p_side),
             e.squad_size,
             exists (select 1 from public.clash_squad_members s where s.clash_event_id = e.id and s.user_id = p_uid),
             p_changed)::public.clash_squad_state
  from public.clash_events e where e.id = p_event;
$$;

-- I'M DOWN for your clan's squad in one event (members of either clan, before it starts, while
-- there's room). Already in → the state. Set-to-state.
create or replace function public.join_clash_squad(p_clash_event_id uuid)
returns public.clash_squad_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  e public.clash_events%rowtype;
  x public.clashes%rowtype;
  v_side public.team_side;
begin
  select * into e from public.clash_events where id = p_clash_event_id for update;
  if not found or not authz.can_see_clash(e.clash_id, v_uid) then
    perform private.fail('clash_event_not_found');
  end if;
  select * into x from public.clashes where id = e.clash_id;
  v_side := authz.clash_side(x.id, v_uid);
  if v_side is null then
    perform private.fail('not_clan_member');
  end if;
  if exists (select 1 from public.clash_squad_members s where s.clash_event_id = e.id and s.user_id = v_uid) then
    return private.clash_squad_state_of(e.id, v_uid, v_side, false);
  end if;
  if private.clash_stage(x) not in ('upcoming', 'live') then
    perform private.fail('clash_closed');
  end if;
  if e.starts_at <= now() then
    perform private.fail('clash_event_started');
  end if;
  if e.squad_size is not null
     and (select count(*) from public.clash_squad_members s where s.clash_event_id = e.id and s.side = v_side) >= e.squad_size then
    perform private.fail('squad_full', e.squad_size::text);
  end if;
  insert into public.clash_squad_members (clash_event_id, clash_id, user_id, side) values (e.id, x.id, v_uid, v_side);
  perform private.emit('clash_squad_joined', v_uid,
    jsonb_build_object('clash_id', x.id, 'clash_event_id', e.id, 'position', e.position));
  return private.clash_squad_state_of(e.id, v_uid, v_side, true);
end;
$$;

-- Out of the squad, before the event starts. Not in → the state.
create or replace function public.leave_clash_squad(p_clash_event_id uuid)
returns public.clash_squad_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  e public.clash_events%rowtype;
  v_side public.team_side;
begin
  select * into e from public.clash_events where id = p_clash_event_id for update;
  if not found or not authz.can_see_clash(e.clash_id, v_uid) then
    perform private.fail('clash_event_not_found');
  end if;
  v_side := authz.clash_side(e.clash_id, v_uid);
  if not exists (select 1 from public.clash_squad_members s where s.clash_event_id = e.id and s.user_id = v_uid) then
    return private.clash_squad_state_of(e.id, v_uid, v_side, false);
  end if;
  if e.starts_at <= now() then
    perform private.fail('clash_event_started');
  end if;
  delete from public.clash_squad_members where clash_event_id = e.id and user_id = v_uid;
  perform private.emit('clash_squad_left', v_uid, jsonb_build_object('clash_id', e.clash_id, 'clash_event_id', e.id));
  return private.clash_squad_state_of(e.id, v_uid, v_side, true);
end;
$$;

-- Results ----------------------------------------------------------------------------------------------------

create or replace function private.clash_winner(p_scoring public.clash_scoring, p_a numeric, p_b numeric)
returns public.team_side
language sql
immutable
set search_path = ''
as $$
  select case
    when p_a = p_b then null
    when p_scoring = 'time' then case when p_a < p_b then 'a'::public.team_side else 'b' end
    else case when p_a > p_b then 'a'::public.team_side else 'b' end
  end;
$$;

-- Submit an event's result once it has started. An approved organizer's result is final at once
-- (organizer_verified). A captain's waits for the other side's captain (confirm_clash_result); a new
-- submission replaces a pending one. Values: seconds for time (lower wins), km for distance, counts
-- for score and count. Idempotent with the key.
create or replace function public.submit_clash_result(
  p_clash_event_id uuid, p_a_value numeric, p_b_value numeric, p_idempotency_key uuid
)
returns public.clash_result_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  e public.clash_events%rowtype;
  x public.clashes%rowtype;
  v_side public.team_side;
  v_sub uuid;
  v_winner public.team_side;
  v_state public.clash_result_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'submit_clash_result');
  if v_prior is not null then
    return jsonb_populate_record(null::public.clash_result_state, v_prior);
  end if;
  select * into e from public.clash_events where id = p_clash_event_id for update;
  if not found or not authz.can_see_clash(e.clash_id, v_uid) then
    perform private.fail('clash_event_not_found');
  end if;
  select * into x from public.clashes where id = e.clash_id;
  v_side := authz.clash_captain_side(x.id, v_uid);
  if v_side is null and not authz.is_clash_organizer(x.id, v_uid) then
    perform private.fail('not_clash_captain');
  end if;
  if exists (select 1 from public.clash_event_results r where r.clash_event_id = e.id) then
    perform private.fail('result_already_verified');
  end if;
  if x.status <> 'scheduled' or private.clash_stage(x) not in ('live', 'complete') or e.starts_at > now() then
    perform private.fail('clash_event_not_started');
  end if;
  if p_a_value is null or p_b_value is null or p_a_value < 0 or p_b_value < 0
     or p_a_value > 99999999 or p_b_value > 99999999 then
    perform private.fail('invalid_argument', 'value');
  end if;
  v_winner := private.clash_winner(e.scoring, p_a_value, p_b_value);

  if authz.is_clash_organizer(x.id, v_uid) then
    update public.clash_result_submissions set status = 'superseded' where clash_event_id = e.id and status = 'pending';
    insert into public.clash_event_results (clash_event_id, clash_id, a_value, b_value, winner_side, source, recorded_by)
    values (e.id, x.id, p_a_value, p_b_value, v_winner, 'organizer_verified', v_uid);
    v_state := row(e.id, 'final', null, p_a_value, p_b_value, v_winner, 'organizer_verified')::public.clash_result_state;
    perform private.emit('clash_result_verified', v_uid,
      jsonb_build_object('clash_id', x.id, 'clash_event_id', e.id, 'source', 'organizer_verified'));
  else
    update public.clash_result_submissions set status = 'superseded' where clash_event_id = e.id and status = 'pending';
    insert into public.clash_result_submissions (clash_event_id, clash_id, submitted_by, submitted_side, a_value, b_value)
    values (e.id, x.id, v_uid, v_side, p_a_value, p_b_value)
    returning id into v_sub;
    v_state := row(e.id, 'pending', v_sub, p_a_value, p_b_value, v_winner, null)::public.clash_result_state;
    perform private.emit('clash_result_submitted', v_uid, jsonb_build_object('clash_id', x.id, 'clash_event_id', e.id));
  end if;
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- The other side's captain confirms a pending result; it becomes final. Already final from this
-- submission → the state. Set-to-state.
create or replace function public.confirm_clash_result(p_submission_id uuid)
returns public.clash_result_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  s public.clash_result_submissions%rowtype;
  e public.clash_events%rowtype;
  r public.clash_event_results%rowtype;
  v_side public.team_side;
  v_winner public.team_side;
begin
  select * into s from public.clash_result_submissions where id = p_submission_id;
  if not found or not authz.can_see_clash(s.clash_id, v_uid) then
    perform private.fail('submission_not_found');
  end if;
  select * into e from public.clash_events where id = s.clash_event_id for update;
  select * into s from public.clash_result_submissions where id = p_submission_id;
  v_side := authz.clash_captain_side(s.clash_id, v_uid);
  if v_side is null then
    perform private.fail('not_clash_captain');
  end if;
  if s.status = 'confirmed' then
    select * into r from public.clash_event_results where clash_event_id = e.id;
    return row(e.id, 'final', s.id, r.a_value, r.b_value, r.winner_side, r.source)::public.clash_result_state;
  end if;
  if s.status = 'superseded' then
    perform private.fail('proposal_superseded');
  end if;
  if v_side = s.submitted_side then
    perform private.fail('not_clash_captain', 'other_side');
  end if;
  v_winner := private.clash_winner(e.scoring, s.a_value, s.b_value);
  update public.clash_result_submissions set status = 'confirmed' where id = s.id;
  insert into public.clash_event_results (clash_event_id, clash_id, a_value, b_value, winner_side, source, recorded_by, confirmed_by)
  values (e.id, s.clash_id, s.a_value, s.b_value, v_winner, 'captains_confirmed', s.submitted_by, v_uid);
  perform private.emit('clash_result_verified', v_uid,
    jsonb_build_object('clash_id', s.clash_id, 'clash_event_id', e.id, 'source', 'captains_confirmed'));
  return row(e.id, 'final', s.id, s.a_value, s.b_value, v_winner, 'captains_confirmed')::public.clash_result_state;
end;
$$;

-- Crowd support ----------------------------------------------------------------------------------------------

-- BACK a clan, or stop backing (p_side null). Anyone who can see the Clash; members of a clan back
-- only their own. Open until the Clash is complete. Never changes a score. Set-to-state.
create or replace function public.back_clash(p_clash_id uuid, p_side public.team_side default null)
returns public.clash_backing_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  x public.clashes%rowtype;
  v_old public.team_side;
  v_mine public.team_side;
begin
  select * into x from public.clashes where id = p_clash_id for update;
  if not found or not authz.can_see_clash(p_clash_id, v_uid) then
    perform private.fail('clash_not_found');
  end if;
  if private.clash_stage(x) not in ('upcoming', 'live') then
    perform private.fail('backing_closed');
  end if;
  v_mine := authz.clash_side(x.id, v_uid);
  if p_side is not null and v_mine is not null and p_side <> v_mine then
    perform private.fail('prediction_not_allowed');
  end if;
  select b.side into v_old from public.clash_backings b where b.clash_id = x.id and b.user_id = v_uid;
  if v_old is not distinct from p_side then
    return row(x.id, v_old, x.backing_a, x.backing_b)::public.clash_backing_state;
  end if;
  if v_old is not null then
    delete from public.clash_backings where clash_id = x.id and user_id = v_uid;
  end if;
  if p_side is not null then
    insert into public.clash_backings (clash_id, user_id, side) values (x.id, v_uid, p_side);
  end if;
  update public.clashes
     set backing_a = (select count(*) from public.clash_backings b where b.clash_id = x.id and b.side = 'a'),
         backing_b = (select count(*) from public.clash_backings b where b.clash_id = x.id and b.side = 'b')
   where id = x.id;
  select * into x from public.clashes where id = p_clash_id;
  perform private.emit('clash_backed', v_uid,
    jsonb_build_object('clash_id', x.id, 'side', p_side, 'own_clan', v_mine is not null));
  return row(x.id, p_side, x.backing_a, x.backing_b)::public.clash_backing_state;
end;
$$;

-- Reads ----------------------------------------------------------------------------------------------------

-- The Clash poster: both clans, the score, your side, the crowd, what's next.
create or replace function public.clash_view(p_clash_id uuid)
returns table (
  clash_id uuid,
  title text,
  season_label text,
  a_clan_id uuid,
  a_name text,
  b_clan_id uuid,
  b_name text,
  status public.clash_status,
  stage public.clash_stage,
  situation text,
  my_side public.team_side,
  my_captain_side public.team_side,
  i_am_organizer boolean,
  event_count integer,
  decided_count integer,
  a_wins integer,
  b_wins integer,
  draws integer,
  leader public.team_side,
  next_event_id uuid,
  next_position integer,
  first_starts_at timestamptz,
  last_starts_at timestamptz,
  backing_a integer,
  backing_b integer,
  my_backing public.team_side,
  time_zone text,
  server_now timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  x public.clashes%rowtype := private.require_clash(p_clash_id, v_uid);
  v_stage public.clash_stage := private.clash_stage(x);
begin
  return query
  with ev as (
    select e.*, r.winner_side, r.clash_event_id as decided
    from public.clash_events e
    left join public.clash_event_results r on r.clash_event_id = e.id
    where e.clash_id = x.id
  ),
  score as (
    select count(*)::integer as n, count(ev.decided)::integer as d,
           count(*) filter (where ev.winner_side = 'a')::integer as aw,
           count(*) filter (where ev.winner_side = 'b')::integer as bw,
           count(*) filter (where ev.decided is not null and ev.winner_side is null)::integer as dr,
           min(ev.starts_at) as first_at, max(ev.starts_at) as last_at
    from ev
  ),
  nxt as (
    select ev.id, ev.position from ev where ev.decided is null order by ev.position limit 1
  )
  select x.id, x.title, x.season_label, x.a_clan_id, ca.name, x.b_clan_id, cb.name, x.status, v_stage,
         private.clash_situation(v_stage), authz.clash_side(x.id, v_uid), authz.clash_captain_side(x.id, v_uid),
         authz.is_clash_organizer(x.id, v_uid),
         score.n, score.d, score.aw, score.bw, score.dr,
         case when score.aw > score.bw then 'a'::public.team_side when score.bw > score.aw then 'b'::public.team_side end,
         (select nxt.id from nxt), (select nxt.position::integer from nxt), score.first_at, score.last_at,
         x.backing_a, x.backing_b,
         (select b.side from public.clash_backings b where b.clash_id = x.id and b.user_id = v_uid),
         ca.time_zone, now()
  from score
  join public.clans ca on ca.id = x.a_clan_id
  join public.clans cb on cb.id = x.b_clan_id;
end;
$$;

-- THE SIX EVENTS, in order, each with its state and result. Squad counts per side; the pending
-- submission only for captains and organizers (NOT FINAL until confirmed).
create or replace function public.clash_events_list(p_clash_id uuid)
returns table (
  clash_event_id uuid,
  "position" integer,
  title text,
  sport_id text,
  scoring public.clash_scoring,
  starts_at timestamptz,
  place_id uuid,
  place_name text,
  place_area text,
  squad_size integer,
  a_squad integer,
  b_squad integer,
  i_am_in_squad boolean,
  state public.clash_event_state,
  is_final boolean,
  a_value numeric,
  b_value numeric,
  winner_side public.team_side,
  result_source public.clash_result_source,
  pending_submission_id uuid,
  pending_side public.team_side,
  pending_a_value numeric,
  pending_b_value numeric,
  can_submit boolean,
  can_confirm boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  x public.clashes%rowtype := private.require_clash(p_clash_id, v_uid);
  v_cap public.team_side := authz.clash_captain_side(p_clash_id, v_uid);
  v_org boolean := authz.is_clash_organizer(p_clash_id, v_uid);
  v_tz text := (select c.time_zone from public.clans c where c.id = x.a_clan_id);
  v_max integer := (select max(e.position) from public.clash_events e where e.clash_id = p_clash_id);
begin
  return query
  select e.id, e.position::integer, e.title, e.sport_id, e.scoring, e.starts_at, e.place_id, pl.name, pl.area, e.squad_size,
         (select count(*)::integer from public.clash_squad_members s where s.clash_event_id = e.id and s.side = 'a'),
         (select count(*)::integer from public.clash_squad_members s where s.clash_event_id = e.id and s.side = 'b'),
         exists (select 1 from public.clash_squad_members s where s.clash_event_id = e.id and s.user_id = v_uid),
         private.clash_event_state(e, v_tz),
         e.position = v_max,
         r.a_value, r.b_value, r.winner_side, r.source,
         case when v_cap is not null or v_org then ps.id end,
         case when v_cap is not null or v_org then ps.submitted_side end,
         case when v_cap is not null or v_org then ps.a_value end,
         case when v_cap is not null or v_org then ps.b_value end,
         r.clash_event_id is null and x.status = 'scheduled' and e.starts_at <= now() and (v_cap is not null or v_org),
         r.clash_event_id is null and ps.id is not null and v_cap is not null and v_cap <> ps.submitted_side
  from public.clash_events e
  left join public.places pl on pl.id = e.place_id
  left join public.clash_event_results r on r.clash_event_id = e.id
  left join public.clash_result_submissions ps on ps.clash_event_id = e.id and ps.status = 'pending'
  where e.clash_id = p_clash_id
  order by e.position;
end;
$$;

-- YOUR PART: the next undecided event you're in a squad for; else the next one your clan's squad
-- still has room in (so you can tap I'M DOWN). Nothing for people outside both clans.
create or replace function public.clash_my_part(p_clash_id uuid)
returns table (
  clash_event_id uuid,
  "position" integer,
  title text,
  sport_id text,
  starts_at timestamptz,
  place_name text,
  place_area text,
  squad_size integer,
  squad_taken integer,
  i_am_in boolean,
  state public.clash_event_state
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  x public.clashes%rowtype := private.require_clash(p_clash_id, v_uid);
  v_side public.team_side := authz.clash_side(p_clash_id, v_uid);
  v_tz text := (select c.time_zone from public.clans c where c.id = x.a_clan_id);
begin
  if v_side is null or x.status <> 'scheduled' then
    return;
  end if;
  return query
  select e.id, e.position::integer, e.title, e.sport_id, e.starts_at, pl.name, pl.area, e.squad_size,
         (select count(*)::integer from public.clash_squad_members s where s.clash_event_id = e.id and s.side = v_side),
         exists (select 1 from public.clash_squad_members s where s.clash_event_id = e.id and s.user_id = v_uid),
         private.clash_event_state(e, v_tz)
  from public.clash_events e
  left join public.places pl on pl.id = e.place_id
  where e.clash_id = p_clash_id
    and not exists (select 1 from public.clash_event_results r where r.clash_event_id = e.id)
    and (exists (select 1 from public.clash_squad_members s where s.clash_event_id = e.id and s.user_id = v_uid)
         or (e.starts_at > now()
             and (e.squad_size is null
                  or (select count(*) from public.clash_squad_members s
                      where s.clash_event_id = e.id and s.side = v_side) < e.squad_size)))
  order by exists (select 1 from public.clash_squad_members s where s.clash_event_id = e.id and s.user_id = v_uid) desc,
           e.starts_at, e.position
  limit 1;
end;
$$;

-- A clan's Clashes (the Clan page's OJORO CLASH row): open ones first, then finished.
create or replace function public.clan_clashes(p_clan_id uuid)
returns table (
  clash_id uuid,
  title text,
  season_label text,
  opponent_clan_id uuid,
  opponent_name text,
  our_side public.team_side,
  stage public.clash_stage,
  our_wins integer,
  their_wins integer,
  draws integer,
  event_count integer,
  decided_count integer,
  standing text,
  next_event_id uuid,
  next_position integer,
  next_title text,
  next_sport_id text,
  next_starts_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.require_clan(p_clan_id, v_uid);
  return query
  select y.id, y.title, y.season_label, y.opp_id, y.opp_name, y.side, y.stg, y.ours, y.theirs, y.dr, y.n, y.d,
         case when y.ours > y.theirs then 'leading' when y.ours < y.theirs then 'trailing' else 'level' end,
         y.nid, y.npos, y.ntitle, y.nsport, y.nstart
  from (
    select x.id, x.title, x.season_label,
           case when x.a_clan_id = p_clan_id then x.b_clan_id else x.a_clan_id end as opp_id,
           (select c.name from public.clans c
             where c.id = case when x.a_clan_id = p_clan_id then x.b_clan_id else x.a_clan_id end) as opp_name,
           case when x.a_clan_id = p_clan_id then 'a'::public.team_side else 'b'::public.team_side end as side,
           private.clash_stage(x) as stg,
           (select count(*)::integer from public.clash_event_results r where r.clash_id = x.id
              and r.winner_side = case when x.a_clan_id = p_clan_id then 'a'::public.team_side else 'b'::public.team_side end) as ours,
           (select count(*)::integer from public.clash_event_results r where r.clash_id = x.id
              and r.winner_side = case when x.a_clan_id = p_clan_id then 'b'::public.team_side else 'a'::public.team_side end) as theirs,
           (select count(*)::integer from public.clash_event_results r where r.clash_id = x.id and r.winner_side is null) as dr,
           (select count(*)::integer from public.clash_events e where e.clash_id = x.id) as n,
           (select count(*)::integer from public.clash_event_results r where r.clash_id = x.id) as d,
           nx.id as nid, nx.position::integer as npos, nx.title as ntitle, nx.sport_id as nsport, nx.starts_at as nstart
    from public.clashes x
    left join lateral (
      select e.id, e.position, e.title, e.sport_id, e.starts_at from public.clash_events e
      where e.clash_id = x.id and not exists (select 1 from public.clash_event_results r where r.clash_event_id = e.id)
      order by e.position limit 1
    ) nx on true
    where (x.a_clan_id = p_clan_id or x.b_clan_id = p_clan_id) and authz.can_see_clash(x.id, v_uid)
  ) y
  order by (y.stg in ('complete', 'declined', 'cancelled')), y.nstart nulls last, y.id;
end;
$$;

-- Season standings: every clan in Clashes with this season label you can see. Clashes won/lost/drawn
-- (finished ones only) and events won/lost across all of them.
create or replace function public.clash_season_standings(p_season_label text)
returns table (
  clan_id uuid,
  name text,
  clashes integer,
  won integer,
  lost integer,
  drawn integer,
  events_won integer,
  events_lost integer
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
  with cl as (
    select x.*, private.clash_stage(x) as stg from public.clashes x
    where x.season_label = p_season_label and x.status = 'scheduled' and authz.can_see_clash(x.id, v_uid)
  ),
  per_side as (
    select cl.id, cl.stg, cl.a_clan_id as clan, 'a'::public.team_side as side from cl
    union all
    select cl.id, cl.stg, cl.b_clan_id, 'b'::public.team_side from cl
  ),
  tally as (
    select p.clan, p.id, p.stg,
           (select count(*) from public.clash_event_results r where r.clash_id = p.id and r.winner_side = p.side) as ew,
           (select count(*) from public.clash_event_results r where r.clash_id = p.id
              and r.winner_side is not null and r.winner_side <> p.side) as el
    from per_side p
  )
  select t.clan, c.name, count(*)::integer,
         count(*) filter (where t.stg = 'complete' and t.ew > t.el)::integer,
         count(*) filter (where t.stg = 'complete' and t.ew < t.el)::integer,
         count(*) filter (where t.stg = 'complete' and t.ew = t.el)::integer,
         sum(t.ew)::integer, sum(t.el)::integer
  from tally t
  join public.clans c on c.id = t.clan
  group by t.clan, c.name
  order by 4 desc, 7 desc, 8, c.name;
end;
$$;
