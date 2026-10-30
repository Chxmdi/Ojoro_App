-- Step 6 (Communities, PRD M7): the tables for Crew Home, Rituals, Clans, club runs, missions and
-- Ojoro Clash, their visibility helpers and RLS.
--
-- Contract for the app: docs/COMMUNITIES_CONTRACT.md. Judgment calls: docs/DESIGN_DECISIONS.md
-- ("Step 6 BE-COMMUNITIES").
--
-- What this adds:
--   1. Crews (Step 4) get a rhythm (sessions a week, PRD §9.12) and a per-person chat read mark.
--   2. Rituals: a recurring crew plan ("Thursday football") or a recurring club run. Each week the
--      Ritual prefills one plan (crews) or club run (clans); everyone still taps I'M DOWN.
--   3. Clans (PRD §9.13): identity, members with community roles, join requests, invite codes.
--   4. Club runs: a clan's own sessions (bigger than a plan's 12), with I'M DOWN, GAME ON at a
--      minimum, and check-in at the place (no position stored). They feed missions and the
--      clan-only leaderboard.
--   5. Missions: a clan goal for a month, measured from club-run check-ins.
--   6. Ojoro Clash (PRD §9.15): clan vs clan, six events, squads, results that are never rewritten,
--      backing that never changes a score.
--
-- Everything is written through RPCs (next migrations); clients read through RLS and the read RPCs.

-- Enums ---------------------------------------------------------------------------------------------

create type public.clan_role as enum
  ('captain', 'organizer', 'coach', 'moderator', 'mentor', 'connector', 'member');
create type public.clan_join_policy as enum ('open', 'request', 'invite');
create type public.clan_join_via as enum ('created', 'open', 'approved', 'code');
create type public.clan_request_status as enum ('pending', 'approved', 'declined', 'withdrawn');
create type public.clan_run_status as enum ('forming', 'game_on', 'cancelled');
create type public.clan_run_stage as enum ('forming', 'game_on', 'live', 'done', 'cancelled');
create type public.mission_metric as enum ('distance_km', 'runs', 'hours');
create type public.ritual_status as enum ('active', 'paused', 'ended');
create type public.clash_status as enum ('proposed', 'scheduled', 'declined', 'cancelled');
create type public.clash_stage as enum ('proposed', 'upcoming', 'live', 'complete', 'declined', 'cancelled');
create type public.clash_scoring as enum ('time', 'distance', 'score', 'count');
create type public.clash_result_source as enum ('organizer_verified', 'captains_confirmed');
create type public.clash_event_state as enum ('upcoming', 'this_week', 'live', 'verifying', 'decided');

-- Crews: rhythm and chat read marks ----------------------------------------------------------------------

-- PRD §9.12: "Crews can choose a rhythm such as once per week." Missing it is a comeback, never a loss.
alter table public.crews
  add column rhythm_per_week smallint not null default 1 check (rhythm_per_week between 1 and 7);

-- Where you stopped reading a crew's chat: "OPEN CREW CHAT · 4 NEW". Own rows only.
create table public.crew_chat_reads (
  crew_id uuid not null references public.crews (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);

-- Clans ------------------------------------------------------------------------------------------------

create table public.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  -- "Four runs a week from the Hall building. Every pace, nobody left at the back."
  tagline text check (char_length(tagline) between 1 and 200),
  sport_id text references public.sports (id),
  -- An area, never an address (CLAUDE.md privacy rule).
  area text check (char_length(area) between 1 and 60),
  city text check (char_length(city) between 1 and 60),
  join_policy public.clan_join_policy not null default 'request',
  time_zone text not null default 'America/Toronto',
  created_by uuid not null references public.profiles (id),
  -- Maintained with clan_members writes (includes people hidden from you by a block).
  member_count integer not null default 0 check (member_count >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.clans is
  'Persistent larger communities (PRD §9.13). Open and request clans are visible to everyone signed in; invite clans to members only.';

create table public.clan_members (
  clan_id uuid not null references public.clans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.clan_role not null default 'member',
  -- What they do, in a line: "Sets the calendar and the rules".
  role_note text check (char_length(role_note) between 1 and 80),
  -- Clan-only leaderboard opt-out (PRD §9.15: scoped leaderboards, never global by default).
  on_leaderboard boolean not null default true,
  via public.clan_join_via not null,
  joined_at timestamptz not null default now(),
  primary key (clan_id, user_id)
);
create index clan_members_user_idx on public.clan_members (user_id);
-- Exactly one captain per clan (captaincy moves only by transfer).
create unique index clan_members_one_captain_idx on public.clan_members (clan_id) where role = 'captain';

create table public.clan_join_requests (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.clans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.clan_request_status not null default 'pending',
  message text check (char_length(message) between 1 and 200),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index clan_join_requests_one_pending_idx on public.clan_join_requests (clan_id, user_id)
  where status = 'pending';
create index clan_join_requests_clan_idx on public.clan_join_requests (clan_id, status, created_at);

create table private.clan_invite_codes (
  clan_id uuid primary key references public.clans (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.clans
  for each row execute function private.set_updated_at();

-- Rituals ------------------------------------------------------------------------------------------------

-- A recurring crew plan or club run. Each week it prefills one plan (crew) or club run (clan) on
-- day_of_week at local_time; nobody is in except the host until they tap I'M DOWN (PRD §9.12:
-- "Rituals prefill future plans but require renewed commitment").
create table public.rituals (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid references public.crews (id) on delete cascade,
  clan_id uuid references public.clans (id) on delete cascade,
  sport_id text not null references public.sports (id),
  title text not null check (char_length(title) between 1 and 40),
  -- ISO day of week, 1 = Monday.
  day_of_week smallint not null check (day_of_week between 1 and 7),
  local_time time not null,
  time_zone text not null,
  duration_minutes integer not null check (duration_minutes between 15 and 480),
  place_id uuid references public.places (id),
  -- Crew plans hold 2–12; club runs up to 500.
  capacity integer not null check (capacity between 2 and 500),
  -- Club runs only: the GAME ON minimum and the distance for missions.
  min_to_go integer check (min_to_go between 2 and 500),
  distance_km numeric(6, 2) check (distance_km > 0 and distance_km <= 500),
  -- Who hosts each week's plan. Must be in the crew / clan when the week is prefilled.
  host_id uuid not null references public.profiles (id),
  -- The plan is prefilled this many days before the start.
  lead_days smallint not null default 6 check (lead_days between 1 and 13),
  status public.ritual_status not null default 'active',
  created_by uuid not null references public.profiles (id),
  paused_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(crew_id, clan_id) = 1),
  check (crew_id is null or capacity <= 12),
  check (crew_id is null or (min_to_go is null and distance_km is null)),
  check (min_to_go is null or min_to_go <= capacity)
);
create index rituals_crew_idx on public.rituals (crew_id) where crew_id is not null;
create index rituals_clan_idx on public.rituals (clan_id) where clan_id is not null;
create index rituals_active_idx on public.rituals (status) where status = 'active';

create trigger set_updated_at before update on public.rituals
  for each row execute function private.set_updated_at();

-- Club runs -----------------------------------------------------------------------------------------------

create table public.clan_runs (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.clans (id) on delete cascade,
  ritual_id uuid references public.rituals (id) on delete set null,
  sport_id text not null references public.sports (id),
  -- "Tempo · 6 km", "Long run · Lachine Canal".
  title text not null check (char_length(title) between 1 and 60),
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 15 and 480),
  place_id uuid references public.places (id),
  -- Counts towards distance missions per runner who checks in.
  distance_km numeric(6, 2) check (distance_km > 0 and distance_km <= 500),
  capacity integer not null check (capacity between 2 and 500),
  -- GAME ON when this many are down.
  min_to_go integer not null check (min_to_go between 2 and 500),
  host_id uuid not null references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  status public.clan_run_status not null default 'forming',
  -- Maintained in the same transaction as clan_run_members writes.
  down_count integer not null default 0 check (down_count >= 0),
  checked_in_count integer not null default 0 check (checked_in_count >= 0),
  game_on_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_to_go <= capacity),
  check (down_count <= capacity)
);
create index clan_runs_clan_idx on public.clan_runs (clan_id, starts_at);
-- A Ritual prefills one run per start.
create unique index clan_runs_ritual_once_idx on public.clan_runs (ritual_id, starts_at) where ritual_id is not null;

create table public.clan_run_members (
  run_id uuid not null references public.clan_runs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  checked_in_at timestamptz,
  -- 'place' (within the place's radius, position not stored) or 'host' (marked by the host or an official).
  check_in_method text check (check_in_method in ('place', 'host')),
  primary key (run_id, user_id),
  check ((checked_in_at is null) = (check_in_method is null))
);
create index clan_run_members_user_idx on public.clan_run_members (user_id);

create trigger set_updated_at before update on public.clan_runs
  for each row execute function private.set_updated_at();

-- Ritual weeks: what each week of a Ritual became (a plan, a club run) or that it was skipped.
create table public.ritual_occurrences (
  ritual_id uuid not null references public.rituals (id) on delete cascade,
  -- The local date of that week's session.
  occurs_on date not null,
  starts_at timestamptz not null,
  plan_id uuid references public.plans (id) on delete set null,
  clan_run_id uuid references public.clan_runs (id) on delete set null,
  skipped_at timestamptz,
  skipped_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (ritual_id, occurs_on)
);
create index ritual_occurrences_plan_idx on public.ritual_occurrences (plan_id) where plan_id is not null;

-- Missions ------------------------------------------------------------------------------------------------

-- "OCTOBER MISSION · 2,000 KM AS A CLAN." Progress is computed from club-run check-ins in the window.
create table public.clan_missions (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.clans (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  metric public.mission_metric not null,
  target numeric(10, 2) not null check (target > 0),
  starts_on date not null,
  ends_on date not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 92),
  unique (clan_id, starts_on)
);

create trigger set_updated_at before update on public.clan_missions
  for each row execute function private.set_updated_at();

-- Ojoro Clash ---------------------------------------------------------------------------------------------

-- Clan vs clan. Side a = the clan that proposed it, side b = the clan that accepted.
create table public.clashes (
  id uuid primary key default gen_random_uuid(),
  -- "Fall Clash"; the season label is "Fall 2026".
  title text not null check (char_length(title) between 1 and 40),
  season_label text check (char_length(season_label) between 1 and 40),
  a_clan_id uuid not null references public.clans (id),
  b_clan_id uuid not null references public.clans (id),
  proposed_by uuid not null references public.profiles (id),
  accepted_by uuid references public.profiles (id),
  status public.clash_status not null default 'proposed',
  accepted_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  -- Crowd support: counts only, never who (and never a stake or a prize).
  backing_a integer not null default 0 check (backing_a >= 0),
  backing_b integer not null default 0 check (backing_b >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (a_clan_id <> b_clan_id)
);
create index clashes_a_idx on public.clashes (a_clan_id);
create index clashes_b_idx on public.clashes (b_clan_id);
-- One open Clash between the same two clans at a time.
create unique index clashes_one_open_idx on public.clashes
  (least(a_clan_id, b_clan_id), greatest(a_clan_id, b_clan_id))
  where status in ('proposed', 'scheduled') and cancelled_at is null;

create trigger set_updated_at before update on public.clashes
  for each row execute function private.set_updated_at();

-- The events (six by default). Rules are fixed once the Clash is accepted.
create table public.clash_events (
  id uuid primary key default gen_random_uuid(),
  clash_id uuid not null references public.clashes (id) on delete cascade,
  position smallint not null check (position between 1 and 12),
  -- "4 × 1 km relay", "7-a-side football", "Final · 10K, every runner counts".
  title text not null check (char_length(title) between 1 and 60),
  sport_id text not null references public.sports (id),
  scoring public.clash_scoring not null,
  starts_at timestamptz not null,
  place_id uuid references public.places (id),
  -- People per clan in the squad; null = everyone in the clan can take part.
  squad_size integer check (squad_size between 1 and 200),
  unique (clash_id, position)
);
create index clash_events_starts_idx on public.clash_events (clash_id, starts_at);

create table public.clash_squad_members (
  clash_event_id uuid not null references public.clash_events (id) on delete cascade,
  clash_id uuid not null references public.clashes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  side public.team_side not null,
  joined_at timestamptz not null default now(),
  primary key (clash_event_id, user_id)
);
create index clash_squad_members_clash_idx on public.clash_squad_members (clash_id);

-- Organizers both captains approved: their result is final at once ("Organizer verified").
create table public.clash_organizers (
  clash_id uuid not null references public.clashes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  proposed_by_a boolean not null default false,
  proposed_by_b boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (clash_id, user_id)
);

-- A captain's submitted result waits for the other captain (NOT FINAL until then).
create table public.clash_result_submissions (
  id uuid primary key default gen_random_uuid(),
  clash_event_id uuid not null references public.clash_events (id) on delete cascade,
  clash_id uuid not null references public.clashes (id) on delete cascade,
  submitted_by uuid not null references public.profiles (id),
  submitted_side public.team_side not null,
  a_value numeric(10, 2) not null check (a_value >= 0),
  b_value numeric(10, 2) not null check (b_value >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'superseded')),
  created_at timestamptz not null default now()
);
create unique index clash_result_submissions_pending_idx on public.clash_result_submissions (clash_event_id)
  where status = 'pending';

-- Results are insert-only: never rewritten (CLAUDE.md engineering rules).
create table public.clash_event_results (
  clash_event_id uuid primary key references public.clash_events (id) on delete cascade,
  clash_id uuid not null references public.clashes (id) on delete cascade,
  a_value numeric(10, 2) not null,
  b_value numeric(10, 2) not null,
  -- Null = a draw.
  winner_side public.team_side,
  source public.clash_result_source not null,
  recorded_by uuid not null references public.profiles (id),
  confirmed_by uuid references public.profiles (id),
  verified_at timestamptz not null default now()
);
create index clash_event_results_clash_idx on public.clash_event_results (clash_id);

create or replace function private.refuse_result_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('ojoro.seed_reset', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception using errcode = 'P0001', message = 'result_already_verified', detail = '';
end;
$$;
create trigger clash_event_results_insert_only before update or delete on public.clash_event_results
  for each row execute function private.refuse_result_change();

-- Crowd support for one clan. Own rows only; counts on clashes.
create table public.clash_backings (
  clash_id uuid not null references public.clashes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  side public.team_side not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clash_id, user_id)
);

-- Visibility helpers -------------------------------------------------------------------------------------

create or replace function authz.is_clan_member(p_clan uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and exists (
    select 1 from public.clan_members m
    join public.clans c on c.id = m.clan_id
    where m.clan_id = p_clan and m.user_id = p_viewer and c.archived_at is null
  );
$$;

create or replace function authz.clan_role(p_clan uuid, p_viewer uuid default auth.uid())
returns public.clan_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.clan_members m
  join public.clans c on c.id = m.clan_id
  where m.clan_id = p_clan and m.user_id = p_viewer and c.archived_at is null;
$$;

-- Members always; anyone signed in for open and request clans, unless the captain and you have a
-- block (either way). Invite clans: members only. Never says why.
create or replace function authz.can_see_clan(p_clan uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and exists (
    select 1 from public.clans c
    where c.id = p_clan and c.archived_at is null
      and (
        exists (select 1 from public.clan_members m where m.clan_id = c.id and m.user_id = p_viewer)
        or (
          c.join_policy in ('open', 'request')
          and not exists (select 1 from public.clan_members m
                          where m.clan_id = c.id and m.role = 'captain' and authz.is_blocked(m.user_id, p_viewer))
        )
      )
  );
$$;

-- What a role may do in a clan (one place for every permission).
--   manage: edit the clan, missions, Rituals, cancel any run, approve organizers of a Clash
--   run:    start a club run (every role except member)
--   invite: read the invite code
--   admit:  decide join requests
--   remove: remove members (never the captain, never an official unless captain)
create or replace function authz.clan_can(p_clan uuid, p_action text, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_action
      when 'manage' then r in ('captain', 'organizer')
      when 'mission' then r in ('captain', 'organizer', 'coach')
      when 'run' then r <> 'member'
      when 'invite' then r in ('captain', 'organizer', 'moderator', 'connector')
      when 'admit' then r in ('captain', 'organizer', 'moderator', 'connector')
      when 'remove' then r in ('captain', 'organizer', 'moderator')
      when 'roles' then r = 'captain'
      when 'clash' then r in ('captain', 'organizer')
      else false
    end
    from (select authz.clan_role(p_clan, p_viewer) as r) x
    where x.r is not null
  ), false);
$$;

-- A Clash is visible when you can see either clan. Members of either clan always.
create or replace function authz.can_see_clash(p_clash uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and exists (
    select 1 from public.clashes x
    where x.id = p_clash
      and (authz.is_clan_member(x.a_clan_id, p_viewer) or authz.is_clan_member(x.b_clan_id, p_viewer)
           or (x.status in ('scheduled') and authz.can_see_clan(x.a_clan_id, p_viewer)
               and authz.can_see_clan(x.b_clan_id, p_viewer)))
  );
$$;

-- Your side in a Clash ('a' / 'b'), from clan membership. Null when you're in neither.
create or replace function authz.clash_side(p_clash uuid, p_viewer uuid default auth.uid())
returns public.team_side
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when authz.is_clan_member(x.a_clan_id, p_viewer) then 'a'::public.team_side
    when authz.is_clan_member(x.b_clan_id, p_viewer) then 'b'::public.team_side
  end
  from public.clashes x where x.id = p_clash;
$$;

-- Captains speak for a side: the clan's captain or organizer.
create or replace function authz.clash_captain_side(p_clash uuid, p_viewer uuid default auth.uid())
returns public.team_side
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when authz.clan_can(x.a_clan_id, 'clash', p_viewer) then 'a'::public.team_side
    when authz.clan_can(x.b_clan_id, 'clash', p_viewer) then 'b'::public.team_side
  end
  from public.clashes x where x.id = p_clash;
$$;

create or replace function authz.is_clash_organizer(p_clash uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and exists (
    select 1 from public.clash_organizers o
    where o.clash_id = p_clash and o.user_id = p_viewer and o.approved_at is not null
  );
$$;

create or replace function authz.can_see_ritual(p_ritual uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rituals r
    where r.id = p_ritual
      and ((r.crew_id is not null and authz.is_crew_member(r.crew_id, p_viewer))
           or (r.clan_id is not null and authz.can_see_clan(r.clan_id, p_viewer)))
  );
$$;

revoke all on all functions in schema authz from public, anon;
grant execute on all functions in schema authz to authenticated, service_role;

-- RLS ------------------------------------------------------------------------------------------------------

alter table public.crew_chat_reads enable row level security;
alter table public.clans enable row level security;
alter table public.clan_members enable row level security;
alter table public.clan_join_requests enable row level security;
alter table public.rituals enable row level security;
alter table public.ritual_occurrences enable row level security;
alter table public.clan_runs enable row level security;
alter table public.clan_run_members enable row level security;
alter table public.clan_missions enable row level security;
alter table public.clashes enable row level security;
alter table public.clash_events enable row level security;
alter table public.clash_squad_members enable row level security;
alter table public.clash_organizers enable row level security;
alter table public.clash_result_submissions enable row level security;
alter table public.clash_event_results enable row level security;
alter table public.clash_backings enable row level security;

revoke all on public.crew_chat_reads, public.clans, public.clan_members, public.clan_join_requests,
  public.rituals, public.ritual_occurrences, public.clan_runs, public.clan_run_members, public.clan_missions,
  public.clashes, public.clash_events, public.clash_squad_members, public.clash_organizers,
  public.clash_result_submissions, public.clash_event_results, public.clash_backings
  from anon, authenticated;
grant select on public.crew_chat_reads, public.clans, public.clan_members, public.clan_join_requests,
  public.rituals, public.ritual_occurrences, public.clan_runs, public.clan_run_members, public.clan_missions,
  public.clashes, public.clash_events, public.clash_squad_members, public.clash_organizers,
  public.clash_result_submissions, public.clash_event_results, public.clash_backings
  to authenticated;

create policy "crew_chat_reads: own" on public.crew_chat_reads
  for select to authenticated using (user_id = (select auth.uid()));
create policy "clans: visible" on public.clans
  for select to authenticated using (authz.can_see_clan(id, (select auth.uid())));
create policy "clan_members: fellow members, minus blocked" on public.clan_members
  for select to authenticated using (
    user_id = (select auth.uid())
    or (authz.is_clan_member(clan_id, (select auth.uid())) and not authz.is_blocked(user_id, (select auth.uid())))
  );
create policy "clan_join_requests: own, or people who admit" on public.clan_join_requests
  for select to authenticated using (
    user_id = (select auth.uid())
    or (authz.clan_can(clan_id, 'admit', (select auth.uid())) and not authz.is_blocked(user_id, (select auth.uid())))
  );
create policy "rituals: crew members or visible clan" on public.rituals
  for select to authenticated using (authz.can_see_ritual(id, (select auth.uid())));
create policy "ritual_occurrences: as the ritual" on public.ritual_occurrences
  for select to authenticated using (authz.can_see_ritual(ritual_id, (select auth.uid())));
create policy "clan_runs: visible clan" on public.clan_runs
  for select to authenticated using (authz.can_see_clan(clan_id, (select auth.uid())));
create policy "clan_run_members: own, or members minus blocked" on public.clan_run_members
  for select to authenticated using (
    user_id = (select auth.uid())
    or (exists (select 1 from public.clan_runs r where r.id = run_id
                and authz.is_clan_member(r.clan_id, (select auth.uid())))
        and not authz.is_blocked(user_id, (select auth.uid())))
  );
create policy "clan_missions: visible clan" on public.clan_missions
  for select to authenticated using (authz.can_see_clan(clan_id, (select auth.uid())));
create policy "clashes: visible" on public.clashes
  for select to authenticated using (authz.can_see_clash(id, (select auth.uid())));
create policy "clash_events: visible clash" on public.clash_events
  for select to authenticated using (authz.can_see_clash(clash_id, (select auth.uid())));
create policy "clash_squad_members: visible clash, minus blocked" on public.clash_squad_members
  for select to authenticated using (
    user_id = (select auth.uid())
    or (authz.can_see_clash(clash_id, (select auth.uid())) and not authz.is_blocked(user_id, (select auth.uid())))
  );
create policy "clash_organizers: visible clash" on public.clash_organizers
  for select to authenticated using (authz.can_see_clash(clash_id, (select auth.uid())));
create policy "clash_result_submissions: captains and organizers" on public.clash_result_submissions
  for select to authenticated using (
    authz.clash_captain_side(clash_id, (select auth.uid())) is not null
    or authz.is_clash_organizer(clash_id, (select auth.uid()))
  );
create policy "clash_event_results: visible clash" on public.clash_event_results
  for select to authenticated using (authz.can_see_clash(clash_id, (select auth.uid())));
create policy "clash_backings: own" on public.clash_backings
  for select to authenticated using (user_id = (select auth.uid()));
