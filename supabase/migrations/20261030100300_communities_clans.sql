-- Step 6 (Communities): Clans (PRD §9.13): identity, membership and joining, community roles, club
-- runs, the monthly mission and the clan-only leaderboard. Contract: docs/COMMUNITIES_CONTRACT.md §Clans.
--
-- Joining: open clans let anyone in; request clans take a request that a captain, organizer,
-- moderator or connector decides; invite clans need the invite code. A block with the captain hides
-- the clan (never says why). Inside a clan, blocked pairs never see each other in the roles, roster,
-- requests or leaderboard; counts still include everyone.
-- Leaderboard privacy: clan members only, club runs only, and only people who haven't turned
-- on_leaderboard off and whose history visibility isn't "only me".

create type public.clan_join_state as (
  clan_id uuid,
  status text,           -- 'member' | 'requested'
  role public.clan_role,
  request_id uuid,
  changed boolean
);

create type public.clan_run_state as (
  run_id uuid,
  status public.clan_run_status,
  stage public.clan_run_stage,
  down_count integer,
  checked_in_count integer,
  capacity integer,
  min_to_go integer,
  i_am_down boolean,
  i_checked_in boolean,
  changed boolean
);

-- Helpers ---------------------------------------------------------------------------------------------------

create or replace function private.clan_max_members()
returns integer
language sql
immutable
set search_path = ''
as $$ select 2000 $$;

create or replace function private.add_to_clan(
  p_clan uuid, p_user uuid, p_role public.clan_role, p_via public.clan_join_via
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if exists (select 1 from public.clan_members m where m.clan_id = p_clan and m.user_id = p_user) then
    return false;
  end if;
  select member_count into v_count from public.clans where id = p_clan for update;
  if v_count >= private.clan_max_members() then
    perform private.fail('clan_full', private.clan_max_members()::text);
  end if;
  insert into public.clan_members (clan_id, user_id, role, via) values (p_clan, p_user, p_role, p_via);
  update public.clans set member_count = member_count + 1 where id = p_clan;
  -- A pending request is answered by joining.
  update public.clan_join_requests set status = 'approved', decided_at = now()
   where clan_id = p_clan and user_id = p_user and status = 'pending';
  return true;
end;
$$;

-- Not found unless you can see it (never says why).
create or replace function private.require_clan(p_clan uuid, p_uid uuid)
returns public.clans
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.clans%rowtype;
begin
  select * into c from public.clans where id = p_clan;
  if not found or not authz.can_see_clan(p_clan, p_uid) then
    perform private.fail('clan_not_found');
  end if;
  return c;
end;
$$;

create or replace function private.require_clan_member(p_clan uuid, p_uid uuid)
returns public.clans
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.clans%rowtype := private.require_clan(p_clan, p_uid);
begin
  if not authz.is_clan_member(p_clan, p_uid) then
    perform private.fail('not_clan_member');
  end if;
  return c;
end;
$$;

create or replace function private.clan_run_stage(r public.clan_runs)
returns public.clan_run_stage
language sql
stable
set search_path = ''
as $$
  select case
    when r.status = 'cancelled' then 'cancelled'::public.clan_run_stage
    when now() >= r.starts_at + make_interval(mins => r.duration_minutes) then 'done'
    when now() >= r.starts_at then 'live'
    when r.status = 'game_on' then 'game_on'
    else 'forming'
  end;
$$;

create or replace function private.clan_run_state_of(p_run uuid, p_uid uuid, p_changed boolean)
returns public.clan_run_state
language sql
stable
security definer
set search_path = ''
as $$
  select row(r.id, r.status, private.clan_run_stage(r), r.down_count, r.checked_in_count, r.capacity, r.min_to_go,
             m.user_id is not null, m.checked_in_at is not null, p_changed)::public.clan_run_state
  from public.clan_runs r
  left join public.clan_run_members m on m.run_id = r.id and m.user_id = p_uid
  where r.id = p_run;
$$;

-- Mission progress from club-run check-ins in the window (local dates of the clan).
create or replace function private.mission_progress(p_mission uuid, p_uid uuid)
returns table (progress numeric, contributors integer, my_share numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with mi as (
    select x.*, c.time_zone from public.clan_missions x join public.clans c on c.id = x.clan_id where x.id = p_mission
  ),
  done as (
    select m.user_id,
           case mi.metric
             when 'distance_km' then coalesce(r.distance_km, 0)
             when 'runs' then 1
             else r.duration_minutes / 60.0
           end as amount
    from mi
    join public.clan_runs r on r.clan_id = mi.clan_id and r.status <> 'cancelled'
    join public.clan_run_members m on m.run_id = r.id and m.checked_in_at is not null
    where (r.starts_at at time zone mi.time_zone)::date between mi.starts_on and mi.ends_on
  )
  select round(coalesce(sum(amount), 0), 2), count(distinct user_id)::integer,
         round(coalesce(sum(amount) filter (where user_id = p_uid), 0), 2)
  from done;
$$;

-- Someone who leaves (or is removed) is out of the clan's runs that haven't started. Runs they host
-- are called off.
create or replace function private.drop_future_clan_runs(p_clan uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.clan_runs set status = 'cancelled', cancelled_at = now()
   where clan_id = p_clan and host_id = p_user and starts_at > now() and status <> 'cancelled';
  with d as (
    delete from public.clan_run_members m using public.clan_runs r
     where m.run_id = r.id and r.clan_id = p_clan and m.user_id = p_user
       and r.starts_at > now() and m.checked_in_at is null
    returning m.run_id
  )
  update public.clan_runs x set down_count = x.down_count - 1 where x.id in (select d.run_id from d);
end;
$$;

-- Create and edit -------------------------------------------------------------------------------------------

create or replace function private.validate_clan_fields(
  p_name text, p_tagline text, p_sport_id text, p_area text, p_city text
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_name is not null and char_length(trim(p_name)) not between 1 and 40 then
    perform private.fail('invalid_argument', 'name');
  end if;
  if p_tagline is not null and char_length(trim(p_tagline)) > 200 then
    perform private.fail('invalid_argument', 'tagline');
  end if;
  if p_sport_id is not null and not exists (select 1 from public.sports where id = p_sport_id) then
    perform private.fail('sport_unknown');
  end if;
  if p_area is not null and char_length(trim(p_area)) > 60 then
    perform private.fail('invalid_argument', 'area');
  end if;
  if p_city is not null and char_length(trim(p_city)) > 60 then
    perform private.fail('invalid_argument', 'city');
  end if;
end;
$$;

-- START A CLAN. The creator is the captain. 3 a day.
create or replace function public.create_clan(
  p_idempotency_key uuid,
  p_name text,
  p_join_policy public.clan_join_policy default 'request',
  p_tagline text default null,
  p_sport_id text default null,
  p_area text default null,
  p_city text default null
)
returns public.clans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  c public.clans%rowtype;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_clan');
  if v_prior is not null then
    return jsonb_populate_record(null::public.clans, v_prior);
  end if;
  if p_name is null then
    perform private.fail('invalid_argument', 'name');
  end if;
  perform private.validate_clan_fields(p_name, p_tagline, p_sport_id, p_area, p_city);
  if (select count(*) from public.clans x where x.created_by = v_uid and x.created_at > now() - interval '24 hours') >= 3 then
    perform private.fail('clan_rate_limited');
  end if;
  insert into public.clans (name, tagline, sport_id, area, city, join_policy, time_zone, created_by)
  values (trim(p_name), nullif(trim(p_tagline), ''), p_sport_id, nullif(trim(p_area), ''), nullif(trim(p_city), ''),
          coalesce(p_join_policy, 'request'),
          coalesce((select pr.time_zone from public.profiles pr where pr.id = v_uid), 'America/Toronto'), v_uid)
  returning * into c;
  perform private.add_to_clan(c.id, v_uid, 'captain', 'created');
  select * into c from public.clans where id = c.id;
  perform private.emit('clan_created', v_uid, jsonb_build_object('clan_id', c.id, 'join_policy', c.join_policy));
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(c));
  return c;
end;
$$;

-- Captain and organizers edit the identity and the joining model. Nulls leave a field as it is.
create or replace function public.update_clan(
  p_clan_id uuid,
  p_name text default null,
  p_tagline text default null,
  p_sport_id text default null,
  p_area text default null,
  p_city text default null,
  p_join_policy public.clan_join_policy default null
)
returns public.clans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  c public.clans%rowtype := private.require_clan_member(p_clan_id, v_uid);
begin
  if not authz.clan_can(p_clan_id, 'manage', v_uid) then
    perform private.fail('clan_role_required');
  end if;
  perform private.validate_clan_fields(p_name, p_tagline, p_sport_id, p_area, p_city);
  update public.clans set
    name = coalesce(trim(p_name), name),
    tagline = coalesce(nullif(trim(p_tagline), ''), tagline),
    sport_id = coalesce(p_sport_id, sport_id),
    area = coalesce(nullif(trim(p_area), ''), area),
    city = coalesce(nullif(trim(p_city), ''), city),
    join_policy = coalesce(p_join_policy, join_policy)
  where id = p_clan_id
  returning * into c;
  perform private.emit('clan_updated', v_uid, jsonb_build_object('clan_id', p_clan_id));
  return c;
end;
$$;

-- Joining ---------------------------------------------------------------------------------------------------

-- JOIN. Open → you're in. Request → a pending request (again → the same one). Invite → needs the code
-- (clan_invite_only). Already in → your membership. Set-to-state.
create or replace function public.join_clan(p_clan_id uuid, p_message text default null)
returns public.clan_join_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  c public.clans%rowtype := private.require_clan(p_clan_id, v_uid);
  v_req uuid;
begin
  if authz.is_clan_member(p_clan_id, v_uid) then
    return row(p_clan_id, 'member', authz.clan_role(p_clan_id, v_uid), null, false)::public.clan_join_state;
  end if;
  if c.join_policy = 'invite' then
    perform private.fail('clan_invite_only');
  end if;
  if p_message is not null and char_length(trim(p_message)) > 200 then
    perform private.fail('invalid_argument', 'message');
  end if;
  if c.join_policy = 'open' then
    perform private.add_to_clan(p_clan_id, v_uid, 'member', 'open');
    perform private.emit('clan_joined', v_uid, jsonb_build_object('clan_id', p_clan_id, 'via', 'open'));
    return row(p_clan_id, 'member', 'member'::public.clan_role, null, true)::public.clan_join_state;
  end if;
  select r.id into v_req from public.clan_join_requests r
   where r.clan_id = p_clan_id and r.user_id = v_uid and r.status = 'pending';
  if v_req is not null then
    return row(p_clan_id, 'requested', null, v_req, false)::public.clan_join_state;
  end if;
  if (select count(*) from public.clan_join_requests r
       where r.user_id = v_uid and r.created_at > now() - interval '24 hours') >= 10 then
    perform private.fail('clan_rate_limited');
  end if;
  insert into public.clan_join_requests (clan_id, user_id, message)
  values (p_clan_id, v_uid, nullif(trim(p_message), ''))
  returning id into v_req;
  perform private.emit('clan_join_requested', v_uid, jsonb_build_object('clan_id', p_clan_id));
  return row(p_clan_id, 'requested', null, v_req, true)::public.clan_join_state;
end;
$$;

-- Join with an invite code (any joining model). A block with the captain reads as an invalid code.
create or replace function public.join_clan_with_code(p_code text)
returns public.clan_join_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_clan uuid;
begin
  select k.clan_id into v_clan
  from private.clan_invite_codes k
  join public.clans c on c.id = k.clan_id
  where k.code = upper(trim(coalesce(p_code, ''))) and c.archived_at is null;
  if v_clan is null then
    perform private.fail('invite_code_invalid');
  end if;
  if authz.is_clan_member(v_clan, v_uid) then
    return row(v_clan, 'member', authz.clan_role(v_clan, v_uid), null, false)::public.clan_join_state;
  end if;
  if exists (select 1 from public.clan_members m
             where m.clan_id = v_clan and m.role = 'captain' and authz.is_blocked(m.user_id, v_uid)) then
    perform private.fail('invite_code_invalid');
  end if;
  perform private.add_to_clan(v_clan, v_uid, 'member', 'code');
  perform private.emit('clan_joined', v_uid, jsonb_build_object('clan_id', v_clan, 'via', 'code'));
  return row(v_clan, 'member', 'member'::public.clan_role, null, true)::public.clan_join_state;
end;
$$;

-- Take back a pending request. Nothing pending → true.
create or replace function public.withdraw_clan_request(p_clan_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  update public.clan_join_requests set status = 'withdrawn', decided_at = now()
   where clan_id = p_clan_id and user_id = v_uid and status = 'pending';
  return true;
end;
$$;

-- Approve or decline a request (captain, organizer, moderator, connector). Answering again with the
-- same answer is a no-op; a request already answered the other way stays as it is.
create or replace function public.decide_clan_request(p_request_id uuid, p_approve boolean)
returns public.clan_request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  q public.clan_join_requests%rowtype;
begin
  select * into q from public.clan_join_requests where id = p_request_id for update;
  if not found or not authz.clan_can(q.clan_id, 'admit', v_uid) or authz.is_blocked(q.user_id, v_uid) then
    perform private.fail('clan_request_not_found');
  end if;
  if q.status <> 'pending' then
    return q.status;
  end if;
  if coalesce(p_approve, false) then
    perform private.add_to_clan(q.clan_id, q.user_id, 'member', 'approved');
    update public.clan_join_requests set status = 'approved', decided_by = v_uid, decided_at = now() where id = q.id;
  else
    update public.clan_join_requests set status = 'declined', decided_by = v_uid, decided_at = now() where id = q.id;
  end if;
  perform private.emit('clan_request_decided', v_uid,
    jsonb_build_object('clan_id', q.clan_id, 'approved', coalesce(p_approve, false)));
  return case when coalesce(p_approve, false) then 'approved'::public.clan_request_status else 'declined' end;
end;
$$;

-- The invite code (captain, organizer, moderator, connector). p_rotate makes a new one.
create or replace function public.clan_invite_code(p_clan_id uuid, p_rotate boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_code text;
begin
  perform private.require_clan_member(p_clan_id, v_uid);
  if not authz.clan_can(p_clan_id, 'invite', v_uid) then
    perform private.fail('clan_role_required');
  end if;
  select k.code into v_code from private.clan_invite_codes k where k.clan_id = p_clan_id;
  if v_code is null or coalesce(p_rotate, false) then
    loop
      v_code := private.new_crew_code();
      begin
        insert into private.clan_invite_codes (clan_id, code, created_by) values (p_clan_id, v_code, v_uid)
        on conflict (clan_id) do update set code = excluded.code, created_by = excluded.created_by, created_at = now();
        exit;
      exception when unique_violation then
        -- Taken; draw again.
      end;
    end loop;
  end if;
  return v_code;
end;
$$;

-- Leave. The captain hands over first unless they're the last one in; the last one out archives
-- the clan. Not in → true.
create or replace function public.leave_clan(p_clan_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_role public.clan_role;
  v_count integer;
begin
  perform 1 from public.clans where id = p_clan_id for update;
  select m.role into v_role from public.clan_members m where m.clan_id = p_clan_id and m.user_id = v_uid;
  if v_role is null then
    return true;
  end if;
  select member_count into v_count from public.clans where id = p_clan_id;
  if v_role = 'captain' and v_count > 1 then
    perform private.fail('captain_must_transfer');
  end if;
  delete from public.clan_members where clan_id = p_clan_id and user_id = v_uid;
  perform private.drop_future_clan_runs(p_clan_id, v_uid);
  update public.clans set member_count = member_count - 1,
                          archived_at = case when member_count - 1 = 0 then now() else archived_at end
   where id = p_clan_id;
  perform private.emit('clan_left', v_uid, jsonb_build_object('clan_id', p_clan_id));
  return true;
end;
$$;

-- Remove someone (captain, organizer, moderator). Nobody removes the captain; only the captain
-- removes people with a role. Not in → true.
create or replace function public.remove_clan_member(p_clan_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_theirs public.clan_role;
begin
  perform private.require_clan_member(p_clan_id, v_uid);
  if p_user_id = v_uid then
    perform private.fail('invalid_argument', 'use leave_clan');
  end if;
  if not authz.clan_can(p_clan_id, 'remove', v_uid) then
    perform private.fail('clan_role_required');
  end if;
  perform 1 from public.clans where id = p_clan_id for update;
  select m.role into v_theirs from public.clan_members m where m.clan_id = p_clan_id and m.user_id = p_user_id;
  if v_theirs is null then
    return true;
  end if;
  if v_theirs = 'captain' then
    perform private.fail('cannot_remove_captain');
  end if;
  if v_theirs <> 'member' and authz.clan_role(p_clan_id, v_uid) <> 'captain' then
    perform private.fail('clan_role_required');
  end if;
  delete from public.clan_members where clan_id = p_clan_id and user_id = p_user_id;
  update public.clans set member_count = member_count - 1 where id = p_clan_id;
  perform private.drop_future_clan_runs(p_clan_id, p_user_id);
  perform private.emit('clan_member_removed', v_uid, jsonb_build_object('clan_id', p_clan_id));
  return true;
end;
$$;

-- The captain gives someone a role (organizer, coach, moderator, mentor, connector, or member again)
-- and a one-line note of what they do. Set-to-state.
create or replace function public.set_clan_role(
  p_clan_id uuid, p_user_id uuid, p_role public.clan_role, p_note text default null
)
returns public.clan_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.require_clan_member(p_clan_id, v_uid);
  if not authz.clan_can(p_clan_id, 'roles', v_uid) then
    perform private.fail('clan_role_required');
  end if;
  if p_role is null or p_role = 'captain' then
    perform private.fail('invalid_argument', 'use transfer_clan_captaincy');
  end if;
  if p_user_id = v_uid then
    perform private.fail('invalid_argument', 'captain');
  end if;
  if p_note is not null and char_length(trim(p_note)) > 80 then
    perform private.fail('invalid_argument', 'note');
  end if;
  update public.clan_members
     set role = p_role,
         role_note = case when p_role = 'member' then null else coalesce(nullif(trim(p_note), ''), role_note) end
   where clan_id = p_clan_id and user_id = p_user_id;
  if not found then
    perform private.fail('not_clan_member');
  end if;
  perform private.emit('clan_role_set', v_uid, jsonb_build_object('clan_id', p_clan_id, 'role', p_role));
  return p_role;
end;
$$;

-- The captain hands the clan over; they become an organizer.
create or replace function public.transfer_clan_captaincy(p_clan_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.require_clan_member(p_clan_id, v_uid);
  if authz.clan_role(p_clan_id, v_uid) <> 'captain' then
    perform private.fail('clan_role_required');
  end if;
  if p_user_id = v_uid then
    return true;
  end if;
  if not exists (select 1 from public.clan_members m where m.clan_id = p_clan_id and m.user_id = p_user_id) then
    perform private.fail('not_clan_member');
  end if;
  update public.clan_members set role = 'organizer' where clan_id = p_clan_id and user_id = v_uid;
  update public.clan_members set role = 'captain' where clan_id = p_clan_id and user_id = p_user_id;
  perform private.emit('clan_captaincy_transferred', v_uid, jsonb_build_object('clan_id', p_clan_id));
  return true;
end;
$$;

-- Show or hide yourself on the clan-only leaderboard. Set-to-state.
create or replace function public.set_clan_leaderboard(p_clan_id uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.require_clan_member(p_clan_id, v_uid);
  update public.clan_members set on_leaderboard = coalesce(p_on, true)
   where clan_id = p_clan_id and user_id = v_uid;
  return coalesce(p_on, true);
end;
$$;

-- Club runs ------------------------------------------------------------------------------------------------

-- START A CLUB RUN (any role except member). The creator hosts and is down. GAME ON at p_min_to_go
-- (default 4, or the capacity if smaller). Starts 15 minutes to 60 days ahead.
create or replace function public.create_clan_run(
  p_idempotency_key uuid,
  p_clan_id uuid,
  p_sport_id text,
  p_title text,
  p_starts_at timestamptz,
  p_capacity integer,
  p_min_to_go integer default null,
  p_place_id uuid default null,
  p_duration_minutes integer default null,
  p_distance_km numeric default null
)
returns public.clan_run_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_sport public.sports%rowtype;
  v_min integer;
  v_run uuid;
  v_state public.clan_run_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_clan_run');
  if v_prior is not null then
    return jsonb_populate_record(null::public.clan_run_state, v_prior);
  end if;
  perform private.require_clan_member(p_clan_id, v_uid);
  if not authz.clan_can(p_clan_id, 'run', v_uid) then
    perform private.fail('clan_role_required');
  end if;
  select * into v_sport from public.sports where id = p_sport_id;
  if not found then
    perform private.fail('sport_unknown');
  end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 60 then
    perform private.fail('invalid_argument', 'title');
  end if;
  if p_capacity is null or p_capacity not between 2 and 500 then
    perform private.fail('capacity_invalid', '2-500');
  end if;
  v_min := coalesce(p_min_to_go, least(p_capacity, 4));
  if v_min < 2 or v_min > p_capacity then
    perform private.fail('invalid_argument', 'min_to_go');
  end if;
  if p_starts_at is null or p_starts_at < now() + interval '15 minutes' or p_starts_at > now() + interval '60 days' then
    perform private.fail('starts_at_invalid');
  end if;
  if p_place_id is not null and not exists (select 1 from public.places where id = p_place_id) then
    perform private.fail('place_unknown');
  end if;
  if p_distance_km is not null and (p_distance_km <= 0 or p_distance_km > 500) then
    perform private.fail('invalid_argument', 'distance_km');
  end if;
  if p_duration_minutes is not null and p_duration_minutes not between 15 and 480 then
    perform private.fail('invalid_argument', 'duration_minutes');
  end if;

  insert into public.clan_runs (clan_id, sport_id, title, starts_at, duration_minutes, place_id, distance_km,
                                capacity, min_to_go, host_id, created_by, down_count)
  values (p_clan_id, p_sport_id, trim(p_title), p_starts_at, coalesce(p_duration_minutes, v_sport.default_duration_minutes),
          p_place_id, p_distance_km, p_capacity, v_min, v_uid, v_uid, 1)
  returning id into v_run;
  insert into public.clan_run_members (run_id, user_id) values (v_run, v_uid);

  perform private.emit('clan_run_created', v_uid,
    jsonb_build_object('clan_id', p_clan_id, 'run_id', v_run, 'sport_id', p_sport_id, 'capacity', p_capacity));
  v_state := private.clan_run_state_of(v_run, v_uid, true);
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- I'M DOWN for a club run (clan members). Locks the run, so capacity holds. GAME ON when enough are
-- down. Already down → the same state. Set-to-state.
create or replace function public.join_clan_run(p_run_id uuid)
returns public.clan_run_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  r public.clan_runs%rowtype;
begin
  select * into r from public.clan_runs where id = p_run_id for update;
  if not found or not authz.can_see_clan(r.clan_id, v_uid) or authz.is_blocked(r.host_id, v_uid) then
    perform private.fail('clan_run_not_found');
  end if;
  if not authz.is_clan_member(r.clan_id, v_uid) then
    perform private.fail('not_clan_member');
  end if;
  if exists (select 1 from public.clan_run_members m where m.run_id = r.id and m.user_id = v_uid) then
    return private.clan_run_state_of(r.id, v_uid, false);
  end if;
  if private.clan_run_stage(r) not in ('forming', 'game_on') then
    perform private.fail('clan_run_closed');
  end if;
  if r.down_count >= r.capacity then
    perform private.fail('clan_run_full', r.capacity::text);
  end if;
  insert into public.clan_run_members (run_id, user_id) values (r.id, v_uid);
  update public.clan_runs
     set down_count = down_count + 1,
         status = case when status = 'forming' and down_count + 1 >= min_to_go then 'game_on'::public.clan_run_status else status end,
         game_on_at = case when status = 'forming' and down_count + 1 >= min_to_go then now() else game_on_at end
   where id = r.id;
  perform private.emit('clan_run_joined', v_uid,
    jsonb_build_object('clan_id', r.clan_id, 'run_id', r.id, 'count', r.down_count + 1, 'capacity', r.capacity));
  return private.clan_run_state_of(r.id, v_uid, true);
end;
$$;

-- Not going after all. Before the start only; the host cancels instead. GAME ON stays on. Not in →
-- the state.
create or replace function public.leave_clan_run(p_run_id uuid)
returns public.clan_run_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  r public.clan_runs%rowtype;
begin
  select * into r from public.clan_runs where id = p_run_id for update;
  if not found or not authz.can_see_clan(r.clan_id, v_uid) then
    perform private.fail('clan_run_not_found');
  end if;
  if not exists (select 1 from public.clan_run_members m where m.run_id = r.id and m.user_id = v_uid) then
    return private.clan_run_state_of(r.id, v_uid, false);
  end if;
  if r.host_id = v_uid then
    perform private.fail('invalid_argument', 'host cancels instead');
  end if;
  if now() >= r.starts_at or r.status = 'cancelled' then
    perform private.fail('clan_run_closed');
  end if;
  delete from public.clan_run_members where run_id = r.id and user_id = v_uid;
  update public.clan_runs set down_count = down_count - 1 where id = r.id;
  perform private.emit('clan_run_left', v_uid, jsonb_build_object('clan_id', r.clan_id, 'run_id', r.id));
  return private.clan_run_state_of(r.id, v_uid, true);
end;
$$;

-- Check in at the place: from 30 minutes before the start to the end, within 300 m of the place.
-- The position is used once and never stored. Already in → the state.
create or replace function public.check_in_clan_run(p_run_id uuid, p_lat double precision, p_lng double precision)
returns public.clan_run_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  r public.clan_runs%rowtype;
  m public.clan_run_members%rowtype;
  v_place public.places%rowtype;
  v_d double precision;
begin
  select * into r from public.clan_runs where id = p_run_id for update;
  if not found or not authz.can_see_clan(r.clan_id, v_uid) then
    perform private.fail('clan_run_not_found');
  end if;
  select * into m from public.clan_run_members where run_id = r.id and user_id = v_uid for update;
  if not found then
    perform private.fail('not_attending');
  end if;
  if m.checked_in_at is not null then
    return private.clan_run_state_of(r.id, v_uid, false);
  end if;
  if r.status = 'cancelled' then
    perform private.fail('clan_run_closed');
  end if;
  if now() < r.starts_at - interval '30 minutes' then
    perform private.fail('check_in_not_open', (r.starts_at - interval '30 minutes')::text);
  end if;
  if now() > r.starts_at + make_interval(mins => r.duration_minutes) then
    perform private.fail('check_in_closed');
  end if;
  select * into v_place from public.places where id = r.place_id;
  if v_place.id is null or v_place.lat is null then
    perform private.fail('check_in_unavailable');
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    perform private.fail('location_required');
  end if;
  v_d := private.distance_m(p_lat, p_lng, v_place.lat, v_place.lng);
  if v_d > 300 then
    perform private.fail('too_far', (round(v_d / 50) * 50)::integer::text);
  end if;
  update public.clan_run_members set checked_in_at = now(), check_in_method = 'place'
   where run_id = r.id and user_id = v_uid;
  update public.clan_runs set checked_in_count = checked_in_count + 1 where id = r.id;
  perform private.emit('clan_run_checked_in', v_uid, jsonb_build_object('clan_id', r.clan_id, 'run_id', r.id, 'method', 'place'));
  return private.clan_run_state_of(r.id, v_uid, true);
end;
$$;

-- The host (or a captain/organizer) marks who was there, from 30 minutes before the start until a day
-- after the end. Marking someone present who wasn't down adds them (if there's room). Set-to-state.
create or replace function public.mark_clan_run_attendance(p_run_id uuid, p_user_id uuid, p_present boolean)
returns public.clan_run_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  r public.clan_runs%rowtype;
  m public.clan_run_members%rowtype;
begin
  select * into r from public.clan_runs where id = p_run_id for update;
  if not found or not authz.can_see_clan(r.clan_id, v_uid) then
    perform private.fail('clan_run_not_found');
  end if;
  if r.host_id <> v_uid and not authz.clan_can(r.clan_id, 'manage', v_uid) then
    perform private.fail('not_host');
  end if;
  if r.status = 'cancelled' then
    perform private.fail('clan_run_closed');
  end if;
  if now() < r.starts_at - interval '30 minutes' then
    perform private.fail('check_in_not_open', (r.starts_at - interval '30 minutes')::text);
  end if;
  if now() > r.starts_at + make_interval(mins => r.duration_minutes) + interval '24 hours' then
    perform private.fail('check_in_closed');
  end if;
  if not authz.is_clan_member(r.clan_id, p_user_id) or authz.is_blocked(p_user_id, v_uid) then
    perform private.fail('not_clan_member');
  end if;
  select * into m from public.clan_run_members where run_id = r.id and user_id = p_user_id for update;
  if coalesce(p_present, true) then
    if m.user_id is null then
      if r.down_count >= r.capacity then
        perform private.fail('clan_run_full', r.capacity::text);
      end if;
      insert into public.clan_run_members (run_id, user_id, checked_in_at, check_in_method)
      values (r.id, p_user_id, now(), 'host');
      update public.clan_runs set down_count = down_count + 1, checked_in_count = checked_in_count + 1 where id = r.id;
    elsif m.checked_in_at is null then
      update public.clan_run_members set checked_in_at = now(), check_in_method = 'host'
       where run_id = r.id and user_id = p_user_id;
      update public.clan_runs set checked_in_count = checked_in_count + 1 where id = r.id;
    end if;
  elsif m.checked_in_at is not null then
    update public.clan_run_members set checked_in_at = null, check_in_method = null
     where run_id = r.id and user_id = p_user_id;
    update public.clan_runs set checked_in_count = checked_in_count - 1 where id = r.id;
  end if;
  return private.clan_run_state_of(r.id, v_uid, true);
end;
$$;

-- Call a run off before it starts (host, captain, organizer). Already cancelled → the state.
create or replace function public.cancel_clan_run(p_run_id uuid)
returns public.clan_run_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  r public.clan_runs%rowtype;
begin
  select * into r from public.clan_runs where id = p_run_id for update;
  if not found or not authz.can_see_clan(r.clan_id, v_uid) then
    perform private.fail('clan_run_not_found');
  end if;
  if r.host_id <> v_uid and not authz.clan_can(r.clan_id, 'manage', v_uid) then
    perform private.fail('not_host');
  end if;
  if r.status = 'cancelled' then
    return private.clan_run_state_of(r.id, v_uid, false);
  end if;
  if now() >= r.starts_at then
    perform private.fail('clan_run_closed');
  end if;
  update public.clan_runs set status = 'cancelled', cancelled_at = now() where id = r.id;
  perform private.emit('clan_run_cancelled', v_uid, jsonb_build_object('clan_id', r.clan_id, 'run_id', r.id));
  return private.clan_run_state_of(r.id, v_uid, true);
end;
$$;

-- Missions --------------------------------------------------------------------------------------------------

-- Set (or change) the mission for a window, by default this month. Captain, organizer, coach.
-- One mission per start date; setting it again edits it. Set-to-state.
create or replace function public.set_clan_mission(
  p_clan_id uuid,
  p_title text,
  p_metric public.mission_metric,
  p_target numeric,
  p_starts_on date default null,
  p_ends_on date default null
)
returns public.clan_missions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  c public.clans%rowtype := private.require_clan_member(p_clan_id, v_uid);
  v_start date := coalesce(p_starts_on, date_trunc('month', now() at time zone c.time_zone)::date);
  v_end date := coalesce(p_ends_on, (date_trunc('month', v_start::timestamp) + interval '1 month - 1 day')::date);
  mi public.clan_missions%rowtype;
begin
  if not authz.clan_can(p_clan_id, 'mission', v_uid) then
    perform private.fail('clan_role_required');
  end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 60 then
    perform private.fail('invalid_argument', 'title');
  end if;
  if p_metric is null then
    perform private.fail('invalid_argument', 'metric');
  end if;
  if p_target is null or p_target <= 0 or p_target > 10000000 then
    perform private.fail('invalid_argument', 'target');
  end if;
  if v_end < v_start or v_end - v_start > 92 or v_end < (now() at time zone c.time_zone)::date then
    perform private.fail('invalid_argument', 'dates');
  end if;
  insert into public.clan_missions (clan_id, title, metric, target, starts_on, ends_on, created_by)
  values (p_clan_id, trim(p_title), p_metric, p_target, v_start, v_end, v_uid)
  on conflict (clan_id, starts_on) do update
    set title = excluded.title, metric = excluded.metric, target = excluded.target, ends_on = excluded.ends_on
  returning * into mi;
  perform private.emit('clan_mission_set', v_uid,
    jsonb_build_object('clan_id', p_clan_id, 'mission_id', mi.id, 'metric', p_metric, 'target', p_target));
  return mi;
end;
$$;

-- Reads -----------------------------------------------------------------------------------------------------

create or replace function public.my_clans()
returns table (
  clan_id uuid, name text, sport_id text, role public.clan_role, member_count integer, joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.sport_id, m.role, c.member_count, m.joined_at
  from public.clan_members m
  join public.clans c on c.id = m.clan_id
  where m.user_id = auth.uid() and c.archived_at is null
  order by (m.role <> 'member') desc, c.name, c.id;
$$;

-- The clan page header: identity, stats, your role and what you can do.
create or replace function public.clan_view(p_clan_id uuid)
returns table (
  clan_id uuid,
  name text,
  tagline text,
  sport_id text,
  area text,
  city text,
  join_policy public.clan_join_policy,
  time_zone text,
  member_count integer,
  runs_per_week integer,
  runs_this_week integer,
  coach_count integer,
  is_member boolean,
  my_role public.clan_role,
  my_role_note text,
  on_leaderboard boolean,
  request_status public.clan_request_status,
  can_manage boolean,
  can_start_run boolean,
  can_invite boolean,
  can_admit boolean,
  can_set_mission boolean,
  can_set_roles boolean,
  pending_requests integer,
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
  c public.clans%rowtype := private.require_clan(p_clan_id, v_uid);
  m public.clan_members%rowtype;
  v_monday date := private.local_week_start(now(), c.time_zone);
begin
  select * into m from public.clan_members x where x.clan_id = p_clan_id and x.user_id = v_uid;
  return query
  select c.id, c.name, c.tagline, c.sport_id, c.area, c.city, c.join_policy, c.time_zone, c.member_count,
         (select count(*)::integer from public.rituals r where r.clan_id = c.id and r.status = 'active'),
         (select count(*)::integer from public.clan_runs r
           where r.clan_id = c.id and r.status <> 'cancelled'
             and (r.starts_at at time zone c.time_zone)::date between v_monday and v_monday + 6),
         (select count(*)::integer from public.clan_members x where x.clan_id = c.id and x.role = 'coach'),
         m.user_id is not null, m.role, m.role_note, m.on_leaderboard,
         (select q.status from public.clan_join_requests q where q.clan_id = c.id and q.user_id = v_uid
           order by q.created_at desc limit 1),
         authz.clan_can(c.id, 'manage', v_uid), authz.clan_can(c.id, 'run', v_uid),
         authz.clan_can(c.id, 'invite', v_uid), authz.clan_can(c.id, 'admit', v_uid),
         authz.clan_can(c.id, 'mission', v_uid), authz.clan_can(c.id, 'roles', v_uid),
         case when authz.clan_can(c.id, 'admit', v_uid) then
           (select count(*)::integer from public.clan_join_requests q
             where q.clan_id = c.id and q.status = 'pending' and not authz.is_blocked(q.user_id, v_uid)) end,
         c.created_at, now();
end;
$$;

-- One club run (for a run page, a deep link or a refetch after a tap).
create or replace function private.clan_run_rows(p_uid uuid, p_clan uuid, p_run uuid, p_from timestamptz, p_to timestamptz)
returns table (
  run_id uuid, clan_id uuid, ritual_id uuid, title text, sport_id text, starts_at timestamptz,
  duration_minutes integer, place_id uuid, place_name text, place_area text, distance_km numeric,
  down_count integer, checked_in_count integer, capacity integer, min_to_go integer,
  status public.clan_run_status, stage public.clan_run_stage, host_id uuid, host_name text,
  i_am_down boolean, i_checked_in boolean, can_cancel boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.clan_id, r.ritual_id, r.title, r.sport_id, r.starts_at, r.duration_minutes, r.place_id, pl.name, pl.area,
         r.distance_km, r.down_count, r.checked_in_count, r.capacity, r.min_to_go, r.status, private.clan_run_stage(r),
         r.host_id, case when r.host_id = p_uid or not authz.is_blocked(r.host_id, p_uid) then hp.display_name end,
         m.user_id is not null, m.checked_in_at is not null,
         r.status <> 'cancelled' and r.starts_at > now() and (r.host_id = p_uid or authz.clan_can(r.clan_id, 'manage', p_uid))
  from public.clan_runs r
  join public.profiles hp on hp.id = r.host_id
  left join public.places pl on pl.id = r.place_id
  left join public.clan_run_members m on m.run_id = r.id and m.user_id = p_uid
  where (p_run is null or r.id = p_run)
    and (p_clan is null or r.clan_id = p_clan)
    and (p_from is null or r.starts_at >= p_from)
    and (p_to is null or r.starts_at < p_to)
    and not authz.is_blocked(r.host_id, p_uid)
  order by r.starts_at, r.id;
$$;

-- THIS WEEK: the clan's runs in a local week (Monday to Sunday). p_week_start null = this week.
-- Cancelled runs are listed (stage 'cancelled') so the app can say so.
create or replace function public.clan_week(p_clan_id uuid, p_week_start date default null)
returns table (
  run_id uuid, clan_id uuid, ritual_id uuid, title text, sport_id text, starts_at timestamptz,
  duration_minutes integer, place_id uuid, place_name text, place_area text, distance_km numeric,
  down_count integer, checked_in_count integer, capacity integer, min_to_go integer,
  status public.clan_run_status, stage public.clan_run_stage, host_id uuid, host_name text,
  i_am_down boolean, i_checked_in boolean, can_cancel boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  c public.clans%rowtype := private.require_clan(p_clan_id, v_uid);
  v_monday date := coalesce(p_week_start, private.local_week_start(now(), c.time_zone));
begin
  return query select * from private.clan_run_rows(v_uid, p_clan_id, null,
    v_monday::timestamp at time zone c.time_zone, (v_monday + 7)::timestamp at time zone c.time_zone);
end;
$$;

create or replace function public.clan_run_view(p_run_id uuid)
returns table (
  run_id uuid, clan_id uuid, ritual_id uuid, title text, sport_id text, starts_at timestamptz,
  duration_minutes integer, place_id uuid, place_name text, place_area text, distance_km numeric,
  down_count integer, checked_in_count integer, capacity integer, min_to_go integer,
  status public.clan_run_status, stage public.clan_run_stage, host_id uuid, host_name text,
  i_am_down boolean, i_checked_in boolean, can_cancel boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_clan uuid;
begin
  select r.clan_id into v_clan from public.clan_runs r where r.id = p_run_id;
  if v_clan is null or not authz.can_see_clan(v_clan, v_uid) then
    perform private.fail('clan_run_not_found');
  end if;
  return query select * from private.clan_run_rows(v_uid, null, p_run_id, null, null);
  if not found then
    perform private.fail('clan_run_not_found');
  end if;
end;
$$;

-- The mission on p_on (default today): progress, people who moved it, and your share.
create or replace function public.clan_mission(p_clan_id uuid, p_on date default null)
returns table (
  mission_id uuid,
  title text,
  metric public.mission_metric,
  target numeric,
  starts_on date,
  ends_on date,
  progress numeric,
  contributors integer,
  my_share numeric,
  is_done boolean,
  can_edit boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  c public.clans%rowtype := private.require_clan(p_clan_id, v_uid);
  v_on date := coalesce(p_on, (now() at time zone c.time_zone)::date);
begin
  return query
  select mi.id, mi.title, mi.metric, mi.target, mi.starts_on, mi.ends_on, p.progress, p.contributors,
         case when authz.is_clan_member(p_clan_id, v_uid) then p.my_share end,
         p.progress >= mi.target, authz.clan_can(p_clan_id, 'mission', v_uid)
  from public.clan_missions mi
  cross join lateral private.mission_progress(mi.id, v_uid) p
  where mi.clan_id = p_clan_id and v_on between mi.starts_on and mi.ends_on
  order by mi.starts_on desc
  limit 1;
end;
$$;

-- WHO RUNS IT: everyone with a role, captain first. Visible to anyone who can see the clan.
create or replace function public.clan_roles(p_clan_id uuid)
returns table (
  user_id uuid, display_name text, avatar_path text, role public.clan_role, role_note text, is_me boolean
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
  select pr.id, pr.display_name, pr.avatar_path, m.role, m.role_note, pr.id = v_uid
  from public.clan_members m
  join public.profiles pr on pr.id = m.user_id
  where m.clan_id = p_clan_id and m.role <> 'member'
    and (pr.id = v_uid or not authz.is_blocked(pr.id, v_uid))
  order by array_position(array['captain', 'organizer', 'coach', 'moderator', 'mentor', 'connector']::public.clan_role[], m.role),
           m.joined_at, pr.id;
end;
$$;

-- Members (members only), roles first, then by when they joined.
create or replace function public.clan_roster(p_clan_id uuid, p_limit integer default 200, p_offset integer default 0)
returns table (
  user_id uuid, display_name text, avatar_path text, role public.clan_role, joined_at timestamptz, is_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.require_clan_member(p_clan_id, v_uid);
  return query
  select pr.id, pr.display_name, pr.avatar_path, m.role, m.joined_at, pr.id = v_uid
  from public.clan_members m
  join public.profiles pr on pr.id = m.user_id
  where m.clan_id = p_clan_id and (pr.id = v_uid or not authz.is_blocked(pr.id, v_uid))
  order by (m.role <> 'member') desc, m.joined_at, pr.id
  limit least(greatest(coalesce(p_limit, 200), 1), 500) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Pending requests (captain, organizer, moderator, connector). games_with_you helps decide.
create or replace function public.clan_requests(p_clan_id uuid)
returns table (
  request_id uuid, user_id uuid, display_name text, avatar_path text, message text, created_at timestamptz,
  games_with_you integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.require_clan_member(p_clan_id, v_uid);
  if not authz.clan_can(p_clan_id, 'admit', v_uid) then
    perform private.fail('clan_role_required');
  end if;
  return query
  select q.id, pr.id, pr.display_name, pr.avatar_path, q.message, q.created_at, authz.games_together(pr.id, v_uid)
  from public.clan_join_requests q
  join public.profiles pr on pr.id = q.user_id
  where q.clan_id = p_clan_id and q.status = 'pending' and not authz.is_blocked(pr.id, v_uid)
  order by q.created_at, q.id;
end;
$$;

-- MOST RUNS · <MONTH> · CLAN ONLY. Club runs checked in during the clan's local month. Members only.
-- Listed: members who left on_leaderboard on and whose history visibility isn't "only me", minus
-- anyone with a block with you. Top p_limit, then your own row if you're further down (or 0 runs).
create or replace function public.clan_leaderboard(p_clan_id uuid, p_month date default null, p_limit integer default 10)
returns table (
  rank integer, user_id uuid, display_name text, avatar_path text, runs integer, is_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  c public.clans%rowtype := private.require_clan_member(p_clan_id, v_uid);
  v_from date := date_trunc('month', coalesce(p_month, (now() at time zone c.time_zone)::date)::timestamp)::date;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  return query
  with counts as (
    select m.user_id, count(*)::integer as n
    from public.clan_run_members m
    join public.clan_runs r on r.id = m.run_id
    where r.clan_id = p_clan_id and r.status <> 'cancelled' and m.checked_in_at is not null
      and (r.starts_at at time zone c.time_zone)::date >= v_from
      and (r.starts_at at time zone c.time_zone)::date < (v_from + interval '1 month')::date
    group by m.user_id
  ),
  board as (
    select cm.user_id, coalesce(k.n, 0) as n
    from public.clan_members cm
    left join counts k on k.user_id = cm.user_id
    left join public.privacy_settings ps on ps.user_id = cm.user_id
    where cm.clan_id = p_clan_id
      and (cm.user_id = v_uid
           or (cm.on_leaderboard and coalesce(ps.history_visibility, 'friends') <> 'only_me'
               and not authz.is_blocked(cm.user_id, v_uid)))
  ),
  ranked as (
    select (rank() over (order by b.n desc))::integer as rk, b.user_id, b.n
    from board b
    where b.n > 0 or b.user_id = v_uid
  )
  select x.rk, x.user_id, pr.display_name, pr.avatar_path, x.n, x.user_id = v_uid
  from ranked x
  join public.profiles pr on pr.id = x.user_id
  where (x.n > 0 and x.rk <= v_limit) or x.user_id = v_uid
  order by x.n desc, x.rk, pr.display_name, x.user_id
  limit v_limit + 1;
end;
$$;
