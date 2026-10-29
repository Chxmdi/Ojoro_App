-- Step 4 (Messaging and feed, PRD M5): Crews (minimum for chat), crew-audience plans, chat messages.
--
-- Contract for the app: docs/MESSAGING_CONTRACT.md. Judgment calls: docs/DESIGN_DECISIONS.md
-- ("Step 4 backend").
--
-- What this adds:
--   1. crews, crew_members (owner / admin / member) and private invite codes. Private by default:
--      only members see a crew, its members and its chat (PRD §9.10).
--   2. Plans for one crew: plans.audience = 'crew' + plans.crew_id; authz.can_see_plan honours it.
--      Crew members may vote in a crew plan's time poll (CrewChat: the poll is the crew's).
--   3. messages for crew chat and activity chat (PRD §9.7), with soft delete and edit. Reads go
--      through crew_messages() / activity_messages(); sending is send_message() (next migrations,
--      because it generates notifications and runs Make This a Game detection).
--
-- Blocks: a blocked pair never sees each other's messages. The blocker gets a "hidden" placeholder
-- (so the conversation doesn't look broken); the blocked person gets no trace of the block.

-- Crews -----------------------------------------------------------------------------------------------

create type public.crew_role as enum ('owner', 'admin', 'member');
create type public.crew_join_via as enum ('created', 'added', 'code');
create type public.message_kind as enum ('text', 'system');

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  -- The crew's usual sport. Make This a Game falls back to it when the chat doesn't name one.
  sport_id text references public.sports (id),
  -- PRD §9.10: private by default. There is no public crew yet.
  is_private boolean not null default true check (is_private),
  time_zone text not null default 'America/Toronto',
  created_by uuid not null references public.profiles (id),
  -- Maintained with crew_members writes (the count includes people hidden from you by a block).
  member_count integer not null default 0 check (member_count >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.crews is 'Private groups. Members only (RLS). Write through the crew RPCs.';

create table public.crew_members (
  crew_id uuid not null references public.crews (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.crew_role not null default 'member',
  via public.crew_join_via not null,
  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);
create index crew_members_user_idx on public.crew_members (user_id);
-- Exactly one owner per crew (ownership moves only by transfer).
create unique index crew_members_one_owner_idx on public.crew_members (crew_id) where role = 'owner';

-- Invite codes are readable by owners and admins only, through crew_invite_code().
create table private.crew_invite_codes (
  crew_id uuid primary key references public.crews (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.crews
  for each row execute function private.set_updated_at();

-- Crew-audience plans -----------------------------------------------------------------------------

alter table public.plans add column crew_id uuid references public.crews (id);
alter table public.plans add constraint plans_crew_audience_check
  check ((audience = 'crew') = (crew_id is not null));
create index plans_crew_idx on public.plans (crew_id) where crew_id is not null;

-- Messages ------------------------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one thread: a crew's chat or an activity's chat.
  crew_id uuid references public.crews (id) on delete cascade,
  activity_id uuid references public.activities (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  -- 'system' lines are written by Ojoro for an action someone took ("Lena tapped MAKE THIS A GAME").
  kind public.message_kind not null default 'text',
  -- Null once deleted (soft delete keeps the row so replies and order survive; the words don't).
  body text check (char_length(body) between 1 and 1000),
  reply_to uuid references public.messages (id) on delete set null,
  -- People mentioned (resolved server-side; members of the thread only).
  mention_ids uuid[] not null default '{}',
  -- Structured facts for system lines, e.g. {"event": "make_this_a_game", "plan_id": "…"}.
  payload jsonb,
  -- clock_timestamp: messages written in one transaction (a system line after a send) keep order.
  created_at timestamptz not null default clock_timestamp(),
  edited_at timestamptz,
  deleted_at timestamptz,
  check (num_nonnulls(crew_id, activity_id) = 1),
  check ((deleted_at is null) = (body is not null))
);
create index messages_crew_idx on public.messages (crew_id, created_at desc, id desc) where crew_id is not null;
create index messages_activity_idx on public.messages (activity_id, created_at desc, id desc)
  where activity_id is not null;
create index messages_sender_idx on public.messages (sender_id, created_at desc);

-- Helpers ---------------------------------------------------------------------------------------------

create or replace function private.crew_max_members()
returns integer
language sql
immutable
set search_path = ''
as $$ select 50 $$;

create or replace function authz.is_crew_member(p_crew uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and exists (
    select 1 from public.crew_members m
    join public.crews c on c.id = m.crew_id
    where m.crew_id = p_crew and m.user_id = p_viewer and c.archived_at is null
  );
$$;

create or replace function authz.crew_role(p_crew uuid, p_viewer uuid default auth.uid())
returns public.crew_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.crew_members m
  join public.crews c on c.id = m.crew_id
  where m.crew_id = p_crew and m.user_id = p_viewer and c.archived_at is null;
$$;

-- Who may read a chat thread: crew members, or people in the game (confirmed, checked in, host).
create or replace function authz.can_read_thread(p_crew uuid, p_activity uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_crew is not null then authz.is_crew_member(p_crew, p_viewer)
    when p_activity is not null then authz.is_participant(p_activity, p_viewer)
    else false
  end;
$$;

-- Plan visibility, now with crew plans: members of that crew (and, as before, the host, members and
-- open invitees). Same signature as Slice 01, so every policy and RPC picks it up.
create or replace function authz.can_see_plan(p_plan uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and exists (
    select 1 from public.plans p
    where p.id = p_plan
      and (
        p.host_id = p_viewer
        or exists (select 1 from public.plan_members m where m.plan_id = p.id and m.user_id = p_viewer)
        or (
          not authz.is_blocked(p.host_id, p_viewer)
          and (
            p.audience = 'public'
            or (p.audience = 'friends' and authz.connected(p.host_id, p_viewer))
            or (p.audience = 'crew' and authz.is_crew_member(p.crew_id, p_viewer))
            or exists (
              select 1 from public.plan_invites i
              where i.plan_id = p.id and i.invitee_id = p_viewer and i.status in ('pending', 'accepted')
            )
          )
        )
      )
  );
$$;

revoke all on all functions in schema authz from public, anon;
grant execute on all functions in schema authz to authenticated, service_role;

-- RLS -------------------------------------------------------------------------------------------------

alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.messages enable row level security;

revoke all on public.crews, public.crew_members, public.messages from anon, authenticated;
grant select on public.crews, public.crew_members, public.messages to authenticated;

create policy "crews: members only" on public.crews
  for select to authenticated using (authz.is_crew_member(id, (select auth.uid())));
create policy "crew_members: fellow members, minus blocked" on public.crew_members
  for select to authenticated using (
    authz.is_crew_member(crew_id, (select auth.uid()))
    and (user_id = (select auth.uid()) or not authz.is_blocked(user_id, (select auth.uid())))
  );
create policy "messages: thread members, minus blocked senders" on public.messages
  for select to authenticated using (
    authz.can_read_thread(crew_id, activity_id, (select auth.uid()))
    and (sender_id = (select auth.uid()) or not authz.is_blocked(sender_id, (select auth.uid())))
  );

-- plan_cards: the crew of a crew plan (appended; the name only for that crew's members) ------------

create or replace view public.plan_cards with (security_invoker = true) as
select
  p.id,
  p.sport_id,
  s.name as sport_name,
  s.family as sport_family,
  p.title,
  p.starts_at,
  p.duration_minutes,
  p.capacity,
  p.member_count,
  greatest(p.capacity - p.member_count, 0) as spots_left,
  p.audience,
  p.deadline_at,
  p.poll_closes_at,
  p.status,
  case
    when p.status = 'forming' and p.deadline_at <= now() then 'expired'::public.plan_status
    else p.status
  end as effective_status,
  p.source,
  p.source_activity_id,
  p.created_by,
  p.host_id,
  p.place_id,
  pl.name as place_name,
  pl.area as place_area,
  pl.surface as place_surface,
  pl.floodlit_until as place_floodlit_until,
  pl.is_free as place_is_free,
  pl.lat as place_lat,
  pl.lng as place_lng,
  p.level_label,
  p.team_a_label,
  p.team_b_label,
  p.teams_note,
  p.kit_note,
  p.cost_cents,
  p.currency,
  p.attendance_rule,
  p.locked_at,
  p.created_at,
  (select a.id from public.activities a where a.plan_id = p.id) as activity_id,
  exists (
    select 1 from public.plan_members m where m.plan_id = p.id and m.user_id = (select auth.uid())
  ) as i_am_in,
  pl.time_zone as place_time_zone,
  p.crew_id,
  case when authz.is_crew_member(p.crew_id, (select auth.uid()))
       then (select c.name from public.crews c where c.id = p.crew_id) end as crew_name
from public.plans p
join public.sports s on s.id = p.sport_id
left join public.places pl on pl.id = p.place_id;

grant select on public.plan_cards to authenticated;
revoke all on public.plan_cards from anon;

-- Time poll: members vote; on a crew plan, every member of that crew votes too ---------------------

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
  if not exists (select 1 from public.plan_members m where m.plan_id = p_plan_id and m.user_id = v_uid)
     and not (v_plan.audience = 'crew' and authz.is_crew_member(v_plan.crew_id, v_uid)) then
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

-- plan_time_votes RLS: crew voters see their own vote too.
drop policy "plan_time_votes: members only" on public.plan_time_votes;
create policy "plan_time_votes: members and own vote" on public.plan_time_votes
  for select to authenticated using (
    user_id = (select auth.uid()) or authz.is_plan_member(plan_id, (select auth.uid()))
  );

-- Crew RPCs ---------------------------------------------------------------------------------------------

create or replace function private.new_crew_code()
returns text
language sql
volatile
set search_path = ''
as $$
  -- 8 characters from an alphabet without look-alikes (no 0/O, 1/I).
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '')
  from (select extensions.gen_random_bytes(8) as b) r, generate_series(0, 7) i;
$$;

-- Adds people to a crew. Callers check permissions; this checks blocks and size, and counts.
create or replace function private.add_to_crew(
  p_crew uuid, p_user uuid, p_role public.crew_role, p_via public.crew_join_via, p_invited_by uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if exists (select 1 from public.crew_members m where m.crew_id = p_crew and m.user_id = p_user) then
    return false;
  end if;
  select member_count into v_count from public.crews where id = p_crew for update;
  if v_count >= private.crew_max_members() then
    perform private.fail('crew_full', private.crew_max_members()::text);
  end if;
  insert into public.crew_members (crew_id, user_id, role, via, invited_by)
  values (p_crew, p_user, p_role, p_via, p_invited_by);
  update public.crews set member_count = member_count + 1 where id = p_crew;
  return true;
end;
$$;

-- Someone may join a crew only if nobody in it has a block with them (either way). Never says who.
create or replace function private.crew_blocked_for(p_crew uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.crew_members m
    where m.crew_id = p_crew and m.user_id <> p_user and authz.is_blocked(m.user_id, p_user)
  );
$$;

-- START A CREW. The creator owns it. p_member_ids: people you've played with (no blocks).
create or replace function public.create_crew(
  p_idempotency_key uuid,
  p_name text,
  p_sport_id text default null,
  p_member_ids uuid[] default '{}'
)
returns public.crews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_crew public.crews%rowtype;
  v_member uuid;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_crew');
  if v_prior is not null then
    return jsonb_populate_record(null::public.crews, v_prior);
  end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 40 then
    perform private.fail('invalid_argument', 'name');
  end if;
  if p_sport_id is not null and not exists (select 1 from public.sports where id = p_sport_id) then
    perform private.fail('sport_unknown');
  end if;
  if (select count(*) from public.crews c where c.created_by = v_uid and c.created_at > now() - interval '24 hours') >= 5 then
    perform private.fail('crew_rate_limited');
  end if;
  if cardinality(coalesce(p_member_ids, '{}')) + 1 > private.crew_max_members() then
    perform private.fail('crew_full', private.crew_max_members()::text);
  end if;

  insert into public.crews (name, sport_id, created_by, time_zone)
  values (trim(p_name), p_sport_id, v_uid,
          coalesce((select pr.time_zone from public.profiles pr where pr.id = v_uid), 'America/Toronto'))
  returning * into v_crew;
  perform private.add_to_crew(v_crew.id, v_uid, 'owner', 'created', null);

  foreach v_member in array coalesce(p_member_ids, '{}') loop
    if v_member = v_uid then
      continue;
    end if;
    if not exists (select 1 from public.profiles where id = v_member)
       or not authz.connected(v_uid, v_member)
       or private.crew_blocked_for(v_crew.id, v_member) then
      perform private.fail('crew_member_not_allowed', v_member::text);
    end if;
    perform private.add_to_crew(v_crew.id, v_member, 'member', 'added', v_uid);
  end loop;

  select * into v_crew from public.crews where id = v_crew.id;
  perform private.emit('crew_created', v_uid,
    jsonb_build_object('crew_id', v_crew.id, 'members', v_crew.member_count));
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_crew));
  return v_crew;
end;
$$;

-- Any member adds people they've played with. All or nothing; people already in are skipped.
create or replace function public.add_crew_members(p_crew_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_member uuid;
  v_added integer := 0;
begin
  if not authz.is_crew_member(p_crew_id, v_uid) then
    perform private.fail('crew_not_found');
  end if;
  perform 1 from public.crews where id = p_crew_id for update;
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    perform private.fail('invalid_argument', 'no people');
  end if;
  foreach v_member in array p_user_ids loop
    if v_member = v_uid or exists (select 1 from public.crew_members m
                                   where m.crew_id = p_crew_id and m.user_id = v_member) then
      continue;
    end if;
    if not exists (select 1 from public.profiles where id = v_member)
       or not authz.connected(v_uid, v_member)
       or private.crew_blocked_for(p_crew_id, v_member) then
      perform private.fail('crew_member_not_allowed', v_member::text);
    end if;
    if private.add_to_crew(p_crew_id, v_member, 'member', 'added', v_uid) then
      v_added := v_added + 1;
    end if;
  end loop;
  if v_added > 0 then
    perform private.emit('crew_members_added', v_uid, jsonb_build_object('crew_id', p_crew_id, 'count', v_added));
  end if;
  return v_added;
end;
$$;

-- The crew's invite code (owners and admins). p_rotate makes a new one; the old one stops working.
create or replace function public.crew_invite_code(p_crew_id uuid, p_rotate boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_role public.crew_role := authz.crew_role(p_crew_id, v_uid);
  v_code text;
begin
  if v_role is null then
    perform private.fail('crew_not_found');
  end if;
  if v_role = 'member' then
    perform private.fail('not_crew_admin');
  end if;
  select c.code into v_code from private.crew_invite_codes c where c.crew_id = p_crew_id;
  if v_code is null or coalesce(p_rotate, false) then
    loop
      v_code := private.new_crew_code();
      begin
        insert into private.crew_invite_codes (crew_id, code, created_by) values (p_crew_id, v_code, v_uid)
        on conflict (crew_id) do update set code = excluded.code, created_by = excluded.created_by, created_at = now();
        exit;
      exception when unique_violation then
        -- Another crew has this code; draw again.
      end;
    end loop;
  end if;
  return v_code;
end;
$$;

-- Join with an invite code. Already in → the crew id (idempotent). A block with anyone in the crew
-- reads as an invalid code (never reveals the block).
create or replace function public.join_crew(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_crew uuid;
  v_by uuid;
begin
  select c.crew_id, c.created_by into v_crew, v_by
  from private.crew_invite_codes c
  join public.crews k on k.id = c.crew_id
  where c.code = upper(trim(coalesce(p_code, ''))) and k.archived_at is null;
  if v_crew is null then
    perform private.fail('invite_code_invalid');
  end if;
  if authz.is_crew_member(v_crew, v_uid) then
    return v_crew;
  end if;
  if private.crew_blocked_for(v_crew, v_uid) then
    perform private.fail('invite_code_invalid');
  end if;
  perform private.add_to_crew(v_crew, v_uid, 'member', 'code', v_by);
  perform private.emit('crew_joined', v_uid, jsonb_build_object('crew_id', v_crew, 'via', 'code'));
  return v_crew;
end;
$$;

-- Leave. Owners hand the crew over first (transfer_crew_ownership) unless they're the last one in;
-- the last person out archives the crew. Not in → true (idempotent).
create or replace function public.leave_crew(p_crew_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_role public.crew_role;
  v_count integer;
begin
  perform 1 from public.crews where id = p_crew_id for update;
  select m.role into v_role from public.crew_members m where m.crew_id = p_crew_id and m.user_id = v_uid;
  if v_role is null then
    return true;
  end if;
  select member_count into v_count from public.crews where id = p_crew_id;
  if v_role = 'owner' and v_count > 1 then
    perform private.fail('owner_must_transfer');
  end if;
  delete from public.crew_members where crew_id = p_crew_id and user_id = v_uid;
  update public.crews set member_count = member_count - 1,
                          archived_at = case when member_count - 1 = 0 then now() else archived_at end
   where id = p_crew_id;
  perform private.emit('crew_left', v_uid, jsonb_build_object('crew_id', p_crew_id));
  return true;
end;
$$;

-- Remove someone. Owners remove admins and members; admins remove members; nobody removes the
-- owner (ownership only moves by transfer). Not in → true.
create or replace function public.remove_crew_member(p_crew_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_mine public.crew_role := authz.crew_role(p_crew_id, v_uid);
  v_theirs public.crew_role;
begin
  if v_mine is null then
    perform private.fail('crew_not_found');
  end if;
  if p_user_id = v_uid then
    perform private.fail('invalid_argument', 'use leave_crew');
  end if;
  perform 1 from public.crews where id = p_crew_id for update;
  select m.role into v_theirs from public.crew_members m where m.crew_id = p_crew_id and m.user_id = p_user_id;
  if v_theirs is null then
    return true;
  end if;
  if v_theirs = 'owner' then
    perform private.fail('cannot_remove_owner');
  end if;
  if v_mine = 'member' or (v_mine = 'admin' and v_theirs = 'admin') then
    perform private.fail('not_crew_admin');
  end if;
  delete from public.crew_members where crew_id = p_crew_id and user_id = p_user_id;
  update public.crews set member_count = member_count - 1 where id = p_crew_id;
  perform private.emit('crew_member_removed', v_uid, jsonb_build_object('crew_id', p_crew_id));
  return true;
end;
$$;

-- Owner hands the crew to another member; the old owner becomes an admin.
create or replace function public.transfer_crew_ownership(p_crew_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_mine public.crew_role := authz.crew_role(p_crew_id, v_uid);
begin
  if v_mine is null then
    perform private.fail('crew_not_found');
  end if;
  if v_mine <> 'owner' then
    perform private.fail('not_crew_admin');
  end if;
  if p_user_id = v_uid then
    return true;
  end if;
  if not exists (select 1 from public.crew_members m where m.crew_id = p_crew_id and m.user_id = p_user_id) then
    perform private.fail('not_crew_member');
  end if;
  update public.crew_members set role = 'admin' where crew_id = p_crew_id and user_id = v_uid;
  update public.crew_members set role = 'owner' where crew_id = p_crew_id and user_id = p_user_id;
  return true;
end;
$$;

-- Owner makes someone an admin or a member again.
create or replace function public.set_crew_role(p_crew_id uuid, p_user_id uuid, p_role public.crew_role)
returns public.crew_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_mine public.crew_role := authz.crew_role(p_crew_id, v_uid);
begin
  if v_mine is null then
    perform private.fail('crew_not_found');
  end if;
  if v_mine <> 'owner' then
    perform private.fail('not_crew_admin');
  end if;
  if p_role is null or p_role = 'owner' then
    perform private.fail('invalid_argument', 'use transfer_crew_ownership');
  end if;
  if p_user_id = v_uid then
    perform private.fail('invalid_argument', 'owner');
  end if;
  update public.crew_members set role = p_role where crew_id = p_crew_id and user_id = p_user_id;
  if not found then
    perform private.fail('not_crew_member');
  end if;
  return p_role;
end;
$$;

-- Crew reads ------------------------------------------------------------------------------------------

create or replace function public.my_crews()
returns table (
  crew_id uuid, name text, sport_id text, role public.crew_role, member_count integer,
  joined_at timestamptz, last_message_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.sport_id, m.role, c.member_count, m.joined_at,
         (select max(x.created_at) from public.messages x
           where x.crew_id = c.id and not authz.is_blocked(x.sender_id, auth.uid()))
  from public.crew_members m
  join public.crews c on c.id = m.crew_id
  where m.user_id = auth.uid() and c.archived_at is null
  order by 7 desc nulls last, c.name, c.id;
$$;

-- Crew header: "14 members · 4 free tonight". free_tonight counts members who are usually free this
-- part of today (evening after 5 PM), only those whose availability setting includes you.
create or replace function public.crew_view(p_crew_id uuid)
returns table (
  crew_id uuid, name text, sport_id text, member_count integer, my_role public.crew_role,
  free_tonight integer, time_zone text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not authz.is_crew_member(p_crew_id, v_uid) then
    perform private.fail('crew_not_found');
  end if;
  return query
  select c.id, c.name, c.sport_id, c.member_count, authz.crew_role(c.id, v_uid),
         (select count(*)::integer
            from public.crew_members m
            join public.profiles pr on pr.id = m.user_id
           where m.crew_id = c.id and m.user_id <> v_uid
             and not authz.is_blocked(m.user_id, v_uid)
             and authz.can_see_part(m.user_id, 'availability', v_uid)
             and exists (select 1 from public.availability_slots s
                         where s.user_id = m.user_id
                           and s.day_of_week = extract(isodow from now() at time zone pr.time_zone)
                           and s.part = 'evening')),
         c.time_zone, c.created_at
  from public.crews c where c.id = p_crew_id;
end;
$$;

create or replace function public.crew_roster(p_crew_id uuid)
returns table (
  user_id uuid, display_name text, avatar_path text, role public.crew_role, joined_at timestamptz,
  is_me boolean, games_with_me integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not authz.is_crew_member(p_crew_id, v_uid) then
    perform private.fail('crew_not_found');
  end if;
  return query
  select pr.id, pr.display_name, pr.avatar_path, m.role, m.joined_at, pr.id = v_uid,
         case when pr.id <> v_uid then authz.games_together(pr.id, v_uid) end
  from public.crew_members m
  join public.profiles pr on pr.id = m.user_id
  where m.crew_id = p_crew_id and (pr.id = v_uid or not authz.is_blocked(pr.id, v_uid))
  order by (m.role = 'owner') desc, (m.role = 'admin') desc, pr.id = v_uid desc, m.joined_at, pr.id;
end;
$$;

-- Chat reads --------------------------------------------------------------------------------------------

-- One page of a thread, newest first, before the message p_before (exclusive). Messages from someone
-- who blocked you are left out entirely; messages from someone you blocked come back as hidden
-- placeholders (no sender, no words) so the UI can say "1 message hidden".
create or replace function private.thread_page(
  p_uid uuid, p_crew uuid, p_activity uuid, p_before uuid, p_limit integer
)
returns table (
  id uuid, sender_id uuid, sender_name text, sender_avatar_path text, kind public.message_kind,
  body text, reply_to uuid, payload jsonb, created_at timestamptz, edited_at timestamptz,
  is_deleted boolean, is_hidden boolean, is_mine boolean, mentions_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with cursor_row as (
    select c.created_at, c.id from public.messages c where c.id = p_before
  ),
  page as (
    select m.*, exists (select 1 from public.blocks b where b.blocker_id = p_uid and b.blocked_id = m.sender_id) as hidden
    from public.messages m
    where (m.crew_id = p_crew or m.activity_id = p_activity)
      and not exists (select 1 from public.blocks b where b.blocker_id = m.sender_id and b.blocked_id = p_uid)
      and (p_before is null or (m.created_at, m.id) < (select cr.created_at, cr.id from cursor_row cr))
    order by m.created_at desc, m.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select p.id,
         case when p.hidden then null else p.sender_id end,
         case when p.hidden then null else pr.display_name end,
         case when p.hidden then null else pr.avatar_path end,
         p.kind,
         case when p.hidden then null else p.body end,
         p.reply_to,
         case when p.hidden then null else p.payload end,
         p.created_at,
         p.edited_at,
         p.deleted_at is not null,
         p.hidden,
         p.sender_id = p_uid,
         (not p.hidden and p_uid = any (p.mention_ids))
  from page p
  join public.profiles pr on pr.id = p.sender_id
  order by p.created_at desc, p.id desc;
$$;

create or replace function public.crew_messages(p_crew_id uuid, p_before uuid default null, p_limit integer default 50)
returns table (
  id uuid, sender_id uuid, sender_name text, sender_avatar_path text, kind public.message_kind,
  body text, reply_to uuid, payload jsonb, created_at timestamptz, edited_at timestamptz,
  is_deleted boolean, is_hidden boolean, is_mine boolean, mentions_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not authz.is_crew_member(p_crew_id, v_uid) then
    perform private.fail('crew_not_found');
  end if;
  return query select * from private.thread_page(v_uid, p_crew_id, null, p_before, p_limit);
end;
$$;

create or replace function public.activity_messages(p_activity_id uuid, p_before uuid default null, p_limit integer default 50)
returns table (
  id uuid, sender_id uuid, sender_name text, sender_avatar_path text, kind public.message_kind,
  body text, reply_to uuid, payload jsonb, created_at timestamptz, edited_at timestamptz,
  is_deleted boolean, is_hidden boolean, is_mine boolean, mentions_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  if not authz.is_participant(p_activity_id, v_uid) then
    perform private.fail('not_attending');
  end if;
  return query select * from private.thread_page(v_uid, null, p_activity_id, p_before, p_limit);
end;
$$;

-- Delete (soft): the words go, the row stays so replies and order hold. The sender, a crew owner or
-- admin (crew chat) or the host (activity chat) may delete. Already deleted → true.
create or replace function public.delete_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_m public.messages%rowtype;
begin
  select * into v_m from public.messages where id = p_message_id for update;
  if not found or not authz.can_read_thread(v_m.crew_id, v_m.activity_id, v_uid)
     or (v_m.sender_id <> v_uid and authz.is_blocked(v_m.sender_id, v_uid)) then
    perform private.fail('message_not_found');
  end if;
  if v_m.deleted_at is not null then
    return true;
  end if;
  if v_m.sender_id <> v_uid
     and not (v_m.crew_id is not null and authz.crew_role(v_m.crew_id, v_uid) in ('owner', 'admin'))
     and not (v_m.activity_id is not null
              and exists (select 1 from public.activities a where a.id = v_m.activity_id and a.host_id = v_uid)) then
    perform private.fail('not_author');
  end if;
  update public.messages set body = null, deleted_at = now(), mention_ids = '{}', payload = null
   where id = p_message_id;
  return true;
end;
$$;

-- Edit your own text message. Mentions aren't re-sent.
create or replace function public.edit_message(p_message_id uuid, p_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_m public.messages%rowtype;
begin
  select * into v_m from public.messages where id = p_message_id for update;
  if not found or not authz.can_read_thread(v_m.crew_id, v_m.activity_id, v_uid) then
    perform private.fail('message_not_found');
  end if;
  if v_m.sender_id <> v_uid or v_m.kind <> 'text' then
    perform private.fail('not_author');
  end if;
  if v_m.deleted_at is not null then
    perform private.fail('message_not_found');
  end if;
  if p_body is null or char_length(trim(p_body)) not between 1 and 1000 then
    perform private.fail('message_invalid', '1-1000');
  end if;
  if trim(p_body) is distinct from v_m.body then
    update public.messages set body = trim(p_body), edited_at = now() where id = p_message_id
    returning * into v_m;
  end if;
  return v_m;
end;
$$;

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
