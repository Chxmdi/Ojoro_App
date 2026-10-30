-- Step 6 (Communities & hosts, PRD M7): Host and Organizer OS core schema (PRD §13).
--
-- Contract for the app: docs/HOSTS_CONTRACT.md. Judgment calls: docs/DESIGN_DECISIONS.md
-- ("Step 6 BE-HOST-CORE"). Money (passes, charges, refunds, payouts, the service fee) is
-- BE-HOST-OPS's ledger (docs/HOSTS_OPS_CONTRACT.md); it builds on the tables here.
--
-- Model:
--   host_programs         A host's program ("Plateau Pickup"): hosts and co-hosts, auto-approve rules.
--   host_program_hosts    Who runs it (owner / co_host). Every host RPC checks this server-side.
--   host_program_members  Members (monthly pass holders). Members-first joining and member prices
--                         read it. Hosts add members here; the ops ledger writes it when a pass is bought.
--   host_people           The CRM row per person who has come (tags; first seen).
--   host_person_notes     Private notes: the author only ("Only you see this").
--   host_series           A recurring template: place, start, length, capacity, level, repeat days,
--                         end date, joining window, approval, waitlist, members-first, prices, refunds.
--   host_sessions         One dated occurrence of a series. Each session IS a Slice 01 plan + activity
--                         (plans.source = 'host_session', locked at creation), so attendance, the
--                         waitlist, check-in, chat, recap and the Passport are reused, not duplicated.
--                         The session row snapshots the series rules it was generated with: an edit
--                         applies from the next session that hasn't started.
--   host_join_requests    Approval workflow (note, approve / decline / undo, auto-approved by a rule).
--   host_session_log      What happened to a session's roster (joined, promoted, dropped, approved…).
--                         "Rina took the spot a minute later", and the ops ledger's automatic refund
--                         when a dropped spot is filled from the waitlist.
--   host_series_templates "Save as a template".
--   host_announcements    One message to picked recipients, pinned in the session chat, maybe pushed
--                         (at most 2 pushes per session), with per-recipient read state.
--
-- Enum values are added here; nothing in this file uses them (`alter type … add value` can't be
-- used in the transaction that adds it). Functions are in 20261030200100+.

-- Enum values for other domains ------------------------------------------------------------------------

alter type public.plan_source add value if not exists 'host_session';
alter type public.notification_type add value if not exists 'host_announcement';
alter type public.notification_type add value if not exists 'host_update';
alter type public.notification_type add value if not exists 'host_request';
alter type public.report_subject add value if not exists 'host_program';

-- New enums ----------------------------------------------------------------------------------------------

create type public.host_role as enum ('owner', 'co_host');
create type public.host_level as enum ('beginners', 'mixed', 'competitive');
create type public.host_refund_window as enum ('any_time', 'hours_12', 'hours_24', 'never');
create type public.host_session_status as enum ('scheduled', 'skipped');
create type public.host_request_status as enum ('pending', 'approved', 'declined', 'withdrawn');
-- How a request was approved: by a host, or straight in by an auto-approve rule.
create type public.host_approved_via as enum ('host', 'played_with', 'experienced', 'crews', 'member');
create type public.host_log_kind as enum (
  'joined', 'waitlisted', 'promoted', 'dropped', 'left_waitlist', 'approved', 'declined',
  'checked_in', 'spot_added', 'reordered', 'moved_in'
);
create type public.host_audience as enum ('session', 'waitlist', 'members', 'everyone');

-- Host sessions hold more people than a pickup plan (2–12). Slice 01 RPCs keep their own 2–12 check
-- (`capacity_invalid`); the table bound only stops nonsense.
alter table public.plans drop constraint plans_capacity_check;
alter table public.plans add constraint plans_capacity_check check (capacity between 2 and 100);
alter table public.activities drop constraint activities_capacity_check;
alter table public.activities add constraint activities_capacity_check check (capacity between 2 and 100);

-- Programs -------------------------------------------------------------------------------------------------

create table public.host_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  sport_id text references public.sports (id),
  -- Coarse area label ("Plateau, Montréal"). Never an address.
  area text check (char_length(area) between 1 and 60),
  time_zone text not null default 'America/Toronto',
  -- The program's crew, when it has one (its chat; "Your Crews" auto-approve rule).
  crew_id uuid references public.crews (id) on delete set null,
  -- LET THESE STRAIGHT IN (HostRequests). Program-wide rules for sessions that need approval.
  auto_approve_played_with boolean not null default true,
  auto_approve_experienced boolean not null default false,
  auto_approve_crews boolean not null default true,
  created_by uuid not null references public.profiles (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.host_programs is
  'A host''s program (PRD §13). Signed-in users read name/area; hosts manage it through the host RPCs.';

create table public.host_program_hosts (
  program_id uuid not null references public.host_programs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.host_role not null default 'co_host',
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (program_id, user_id)
);
create index host_program_hosts_user_idx on public.host_program_hosts (user_id);
create unique index host_program_hosts_one_owner_idx on public.host_program_hosts (program_id)
  where role = 'owner';

create table public.host_program_members (
  program_id uuid not null references public.host_programs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  -- Null = open-ended. A member is active while started_at <= now() < coalesce(ends_at, infinity).
  ends_at timestamptz,
  -- Who made it: 'host' (added by hand) or 'pass' (the ops ledger, when a monthly pass is bought).
  source text not null default 'host' check (source in ('host', 'pass')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (program_id, user_id),
  check (ends_at is null or ends_at > started_at)
);
create index host_program_members_user_idx on public.host_program_members (user_id);

create table public.host_people (
  program_id uuid not null references public.host_programs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Host-visible tags ("centre-back", "spare bibs"). Lowercase, at most 8, each 1–24 characters.
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  first_seen_at timestamptz not null default now(),
  -- Last time a host sent this person a Drifting invite-back (one per week at most).
  invited_back_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (program_id, user_id)
);

create table public.host_person_notes (
  program_id uuid not null references public.host_programs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The host who wrote it. Only they ever read it: not the person, not other hosts.
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  updated_at timestamptz not null default now(),
  primary key (program_id, user_id, author_id)
);

-- Series and sessions ----------------------------------------------------------------------------------

create table public.host_series (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.host_programs (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  sport_id text not null references public.sports (id),
  place_id uuid not null references public.places (id),
  -- Local wall-clock start in the place's time zone; sessions are generated per date.
  start_time time not null,
  duration_minutes integer not null check (duration_minutes between 15 and 480),
  capacity integer not null check (capacity between 2 and 100),
  level public.host_level not null default 'mixed',
  -- ISO days (1 = Monday … 7 = Sunday), sorted, no repeats.
  repeat_days smallint[] not null check (cardinality(repeat_days) between 1 and 7
    and repeat_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  starts_on date not null,
  -- WEEKLY UNTIL. Null = no end date.
  until_on date,
  -- OPENS FOR JOINING: days before the start. Members get members_early_hours earlier.
  join_opens_days integer not null default 5 check (join_opens_days between 0 and 30),
  members_early_hours integer not null default 48 check (members_early_hours between 0 and 336),
  -- WHO GETS IN.
  approval_required boolean not null default false,
  waitlist_auto_fill boolean not null default true,
  -- The waitlist stops filling itself this many minutes before kick-off; then the host chooses.
  auto_fill_cutoff_minutes integer not null default 120 check (auto_fill_cutoff_minutes between 0 and 1440),
  members_first boolean not null default false,
  -- PRICE & CANCELLING. Integer cents. member_price_cents 0 = included in membership.
  price_cents integer not null default 0 check (price_cents between 0 and 100000),
  member_price_cents integer not null default 0 check (member_price_cents between 0 and 100000),
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  refund_window public.host_refund_window not null default 'hours_12',
  -- Copied to each session's plan/activity.
  teams_note text check (char_length(teams_note) <= 200),
  kit_note text check (char_length(kit_note) <= 200),
  -- Incremented on every edit; sessions record the version they follow.
  version integer not null default 1,
  ended_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (until_on is null or until_on >= starts_on)
);
create index host_series_program_idx on public.host_series (program_id);

create table public.host_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.host_programs (id) on delete cascade,
  series_id uuid references public.host_series (id) on delete set null,
  -- Local date of the session (the series' repeat day).
  occurs_on date not null,
  starts_at timestamptz not null,
  -- The Slice 01 objects this session is. Exactly one each.
  plan_id uuid not null unique references public.plans (id),
  activity_id uuid not null unique references public.activities (id),
  status public.host_session_status not null default 'scheduled',
  skipped_at timestamptz,
  skipped_by uuid references public.profiles (id),
  skip_reason text check (char_length(skip_reason) <= 120),
  -- Rules snapshot (from the series version that generated or last updated this session).
  series_version integer not null default 1,
  opens_at timestamptz not null,
  members_open_at timestamptz not null,
  approval_required boolean not null,
  waitlist_auto_fill boolean not null,
  auto_fill_cutoff_at timestamptz not null,
  members_first boolean not null,
  price_cents integer not null check (price_cents >= 0),
  member_price_cents integer not null check (member_price_cents >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  refund_window public.host_refund_window not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'skipped') = (skipped_at is not null)),
  check (members_open_at <= opens_at),
  check (auto_fill_cutoff_at <= starts_at)
);
create unique index host_sessions_series_date_idx on public.host_sessions (series_id, occurs_on)
  where series_id is not null;
create index host_sessions_program_idx on public.host_sessions (program_id, starts_at);

create table public.host_join_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.host_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Their note to the host ("Haven't played football since school…").
  note text check (char_length(note) between 1 and 280),
  status public.host_request_status not null default 'pending',
  approved_via public.host_approved_via,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id),
  check ((status in ('approved', 'declined')) = (decided_at is not null)),
  check ((status = 'approved') = (approved_via is not null))
);
create index host_join_requests_pending_idx on public.host_join_requests (session_id, created_at)
  where status = 'pending';
create index host_join_requests_user_idx on public.host_join_requests (user_id);

create table public.host_session_log (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.host_sessions (id) on delete cascade,
  kind public.host_log_kind not null,
  user_id uuid references public.profiles (id) on delete cascade,
  -- The other person in the event: who took a dropped spot, who dropped for a promotion.
  related_user_id uuid references public.profiles (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  data jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
create index host_session_log_session_idx on public.host_session_log (session_id, created_at);

create table public.host_series_templates (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.host_programs (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  -- The series settings (same keys as update_series' p_changes), without dates.
  settings jsonb not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (program_id, name)
);

-- Announcements ---------------------------------------------------------------------------------------

create table public.host_announcements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.host_programs (id) on delete cascade,
  -- The session it is about (pinned in that session's chat). Null for program-wide announcements.
  session_id uuid references public.host_sessions (id) on delete set null,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 280),
  audiences public.host_audience[] not null check (cardinality(audiences) between 1 and 4),
  template text check (template in ('pitch_moved', 'running_late', 'weather_call', 'bring_kit')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  read_count integer not null default 0 check (read_count >= 0),
  pinned boolean not null default false,
  pinned_until timestamptz,
  notify boolean not null default false,
  -- The chat line it was pinned as (activity chat of the session).
  message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now()
);
create index host_announcements_program_idx on public.host_announcements (program_id, created_at desc);
create index host_announcements_session_idx on public.host_announcements (session_id) where session_id is not null;

create table public.host_announcement_recipients (
  announcement_id uuid not null references public.host_announcements (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz,
  primary key (announcement_id, user_id)
);
create index host_announcement_recipients_user_idx on public.host_announcement_recipients (user_id);

-- updated_at ---------------------------------------------------------------------------------------------

create trigger set_updated_at before update on public.host_programs
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_program_members
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_people
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_person_notes
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_series
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_sessions
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_join_requests
  for each row execute function private.set_updated_at();

-- Authorization helpers ----------------------------------------------------------------------------------

-- Runs the program: owner or co-host.
create or replace function authz.is_program_host(p_program uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and exists (
    select 1 from public.host_program_hosts h where h.program_id = p_program and h.user_id = p_viewer
  );
$$;

create or replace function authz.program_role(p_program uuid, p_viewer uuid default auth.uid())
returns public.host_role
language sql
stable
security definer
set search_path = ''
as $$
  select h.role from public.host_program_hosts h where h.program_id = p_program and h.user_id = p_viewer;
$$;

-- An active member (monthly pass) right now.
create or replace function authz.is_program_member(p_program uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.host_program_members m
    where m.program_id = p_program and m.user_id = p_user
      and m.started_at <= now() and (m.ends_at is null or m.ends_at > now())
  );
$$;

-- The program a session's activity belongs to (null for an ordinary activity).
create or replace function authz.activity_program(p_activity uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.program_id from public.host_sessions s where s.activity_id = p_activity;
$$;

-- Announcement helpers (security definer so the two policies below don't recurse into each other).
create or replace function authz.is_announcement_recipient(p_announcement uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.host_announcement_recipients r
    where r.announcement_id = p_announcement and r.user_id = p_viewer
  );
$$;

create or replace function authz.announcement_program(p_announcement uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.program_id from public.host_announcements a where a.id = p_announcement;
$$;

revoke all on function authz.is_program_host(uuid, uuid), authz.program_role(uuid, uuid),
  authz.is_program_member(uuid, uuid), authz.activity_program(uuid),
  authz.is_announcement_recipient(uuid, uuid), authz.announcement_program(uuid) from public, anon;
grant execute on function authz.is_program_host(uuid, uuid), authz.program_role(uuid, uuid),
  authz.is_program_member(uuid, uuid), authz.activity_program(uuid),
  authz.is_announcement_recipient(uuid, uuid), authz.announcement_program(uuid)
  to authenticated, service_role;

-- RLS -------------------------------------------------------------------------------------------------------
-- Reads only; every write goes through an RPC (security definer, host checked server-side).

alter table public.host_programs enable row level security;
alter table public.host_program_hosts enable row level security;
alter table public.host_program_members enable row level security;
alter table public.host_people enable row level security;
alter table public.host_person_notes enable row level security;
alter table public.host_series enable row level security;
alter table public.host_sessions enable row level security;
alter table public.host_join_requests enable row level security;
alter table public.host_session_log enable row level security;
alter table public.host_series_templates enable row level security;
alter table public.host_announcements enable row level security;
alter table public.host_announcement_recipients enable row level security;

revoke all on public.host_programs, public.host_program_hosts, public.host_program_members,
  public.host_people, public.host_person_notes, public.host_series, public.host_sessions,
  public.host_join_requests, public.host_session_log, public.host_series_templates,
  public.host_announcements, public.host_announcement_recipients from anon, authenticated;
grant select on public.host_programs, public.host_program_hosts, public.host_program_members,
  public.host_people, public.host_person_notes, public.host_series, public.host_sessions,
  public.host_join_requests, public.host_session_log, public.host_series_templates,
  public.host_announcements, public.host_announcement_recipients to authenticated;

-- A program and its public schedule are visible to signed-in people (sessions are public plans),
-- minus a block with the owner. Hosts always see their own.
create policy "host_programs: signed in, minus blocked owner" on public.host_programs
  for select to authenticated using (
    authz.is_program_host(id, (select auth.uid()))
    or (archived_at is null and not authz.is_blocked(created_by, (select auth.uid())))
  );
create policy "host_program_hosts: signed in" on public.host_program_hosts
  for select to authenticated using (not authz.is_blocked(user_id, (select auth.uid())));
create policy "host_program_members: self and hosts" on public.host_program_members
  for select to authenticated using (
    user_id = (select auth.uid()) or authz.is_program_host(program_id, (select auth.uid()))
  );
create policy "host_people: hosts" on public.host_people
  for select to authenticated using (authz.is_program_host(program_id, (select auth.uid())));
create policy "host_person_notes: author only" on public.host_person_notes
  for select to authenticated using (
    author_id = (select auth.uid()) and authz.is_program_host(program_id, (select auth.uid()))
  );
create policy "host_series: like the program" on public.host_series
  for select to authenticated using (
    exists (select 1 from public.host_programs p where p.id = program_id)
  );
create policy "host_sessions: like the program" on public.host_sessions
  for select to authenticated using (
    exists (select 1 from public.host_programs p where p.id = program_id)
  );
create policy "host_join_requests: own and hosts" on public.host_join_requests
  for select to authenticated using (
    user_id = (select auth.uid())
    or exists (select 1 from public.host_sessions s
               where s.id = session_id and authz.is_program_host(s.program_id, (select auth.uid()))
                 and not authz.is_blocked(user_id, (select auth.uid())))
  );
create policy "host_session_log: hosts" on public.host_session_log
  for select to authenticated using (
    exists (select 1 from public.host_sessions s
            where s.id = session_id and authz.is_program_host(s.program_id, (select auth.uid())))
  );
create policy "host_series_templates: hosts" on public.host_series_templates
  for select to authenticated using (authz.is_program_host(program_id, (select auth.uid())));
create policy "host_announcements: hosts and recipients" on public.host_announcements
  for select to authenticated using (
    authz.is_program_host(program_id, (select auth.uid()))
    or authz.is_announcement_recipient(id, (select auth.uid()))
  );
create policy "host_announcement_recipients: self and hosts" on public.host_announcement_recipients
  for select to authenticated using (
    user_id = (select auth.uid())
    or authz.is_program_host(authz.announcement_program(announcement_id), (select auth.uid()))
  );

-- Realtime (postgres_changes respects RLS) ------------------------------------------------------------

alter publication supabase_realtime add table
  public.host_programs,
  public.host_series,
  public.host_sessions,
  public.host_join_requests,
  public.host_announcements;
