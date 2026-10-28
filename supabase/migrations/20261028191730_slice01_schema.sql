-- Slice 01 schema: AUTH → PROFILE → DOWN FOR → I'M DOWN → PLAN FORMING → GAME ON → ACTIVITY →
-- ATTENDANCE → RECAP → RUN IT BACK (PRD §18.3, data model §14).
--
-- Tables only, plus their constraints, indexes and bookkeeping triggers. Visibility (RLS) is in
-- the next migration; every mutation goes through the functions in `slice01_mutations`.
-- Contract for the app: docs/SLICE01_CONTRACT.md.

create extension if not exists btree_gist with schema extensions;

-- Enums ---------------------------------------------------------------------------------------------

create type public.skill_level as enum ('learning', 'casual', 'intermediate', 'advanced');
create type public.day_part as enum ('morning', 'midday', 'evening');
-- Who can see one part of a profile (OnboardPrivacy). `friends` and `crews` mean "people you have
-- played with" until Friends (M1) and Crews (M2) exist; see docs/DESIGN_DECISIONS.md.
create type public.visibility as enum ('everyone', 'friends', 'crews', 'only_me');
-- Who can see and join a plan. `friends` = people who have played with the host (same caveat).
create type public.audience as enum ('public', 'friends', 'invite_only');
-- Pull Me In scope: `connections` = people you have played with; `nearby` = anyone in a plan
-- within your radius may invite you.
create type public.pull_scope as enum ('connections', 'nearby');
create type public.report_subject as enum ('profile', 'plan', 'activity', 'moment', 'result');
create type public.report_reason as enum
  ('spam', 'harassment', 'unsafe', 'impersonation', 'inappropriate', 'other');
create type public.signal_status as enum ('active', 'matched', 'withdrawn', 'expired');
create type public.plan_status as enum ('forming', 'game_on', 'expired', 'cancelled');
create type public.plan_source as enum ('down_for', 'quick', 'run_it_back');
create type public.member_via as enum ('host', 'im_down', 'down_for', 'invite');
create type public.invite_kind as enum ('pull_in', 'run_it_back');
create type public.invite_status as enum ('pending', 'accepted', 'declined', 'revoked', 'expired');
create type public.attendance_rule as enum ('check_in', 'check_in_host_confirms');
create type public.activity_status as enum ('confirmed', 'live', 'after', 'complete', 'cancelled');
create type public.attendance_status as enum ('confirmed', 'waitlisted', 'cancelled', 'checked_in');
create type public.check_in_method as enum ('location', 'host');
-- PRD §11.3 verification hierarchy.
create type public.verification_level as enum
  ('self_recorded', 'participant_confirmed', 'organizer_verified', 'device_verified',
   'official_competition_verified');
create type public.proposal_status as enum ('proposed', 'verified', 'superseded');
create type public.reputation_kind as enum
  ('shows_up', 'respectful', 'welcomes_beginners', 'great_host');
create type public.team_side as enum ('a', 'b');

-- Catalog -------------------------------------------------------------------------------------------

create table public.sports (
  id text primary key check (id ~ '^[a-z_]{2,32}$'),
  name text not null check (char_length(name) between 1 and 40),
  -- Sports in one family stand in for each other in "still on" suggestions (volleyball, beach volleyball).
  family text not null check (family ~ '^[a-z_]{2,32}$'),
  default_capacity integer not null check (default_capacity between 2 and 12),
  default_duration_minutes integer not null check (default_duration_minutes between 15 and 480),
  team_based boolean not null default false,
  sort_order integer not null default 100
);
comment on table public.sports is 'Sports catalog. Read-only for clients.';

create table public.places (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,64}$'),
  name text not null check (char_length(name) between 1 and 80),
  -- Neighbourhood, never an address.
  area text not null check (char_length(area) between 1 and 60),
  city text not null check (char_length(city) between 1 and 60),
  -- Public, coarse centroid of a public place (a park, a club). Never a person's location.
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  sport_ids text[] not null default '{}',
  surface text check (char_length(surface) <= 60),
  floodlit_until time,
  is_free boolean not null default true,
  time_zone text not null default 'America/Toronto',
  created_at timestamptz not null default now()
);
comment on table public.places is
  'Public places. lat/lng is the public centroid; exact meeting points live in plan_meeting_points.';

-- Identity ------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique check (handle ~ '^[a-z0-9_]{2,24}$'),
  display_name text check (char_length(display_name) between 1 and 40),
  -- Coarse area label ("Plateau, Montréal"). Never an address.
  area text check (char_length(area) between 1 and 60),
  avatar_path text check (char_length(avatar_path) <= 300),
  time_zone text not null default 'America/Toronto',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is
  'One row per auth user (created by trigger). Public face of a person; blocked users cannot read it.';

-- Self-only settings. Coarse location is rounded to 0.01° (about 1 km) by the column type.
create table public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  area_lat numeric(5, 2) check (area_lat between -90 and 90),
  area_lng numeric(5, 2) check (area_lng between -180 and 180),
  discovery_radius_km integer not null default 3 check (discovery_radius_km between 1 and 50),
  updated_at timestamptz not null default now()
);
comment on table public.profile_private is
  'Self-only: coarse home area point (0.01°) and discovery radius. Used server-side for matching.';

-- Product defaults from OnboardPrivacy.
create table public.privacy_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  sports_visibility public.visibility not null default 'everyone',
  history_visibility public.visibility not null default 'friends',
  availability_visibility public.visibility not null default 'crews'
    check (availability_visibility <> 'everyone'),
  updated_at timestamptz not null default now()
);
comment on column public.privacy_settings.history_visibility is
  'What you have done and your Passport (passport entries, stats).';
comment on column public.privacy_settings.availability_visibility is
  'When you are free. Only ever exposed as overlap with the viewer, never as a calendar.';

create table public.user_sports (
  user_id uuid not null references public.profiles (id) on delete cascade,
  sport_id text not null references public.sports (id),
  -- Matching only. Never shown to other people, never as a score.
  level public.skill_level not null,
  position text check (char_length(position) between 1 and 40),
  is_main boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, sport_id)
);

-- Recurring free time: day of week (ISO, 1 = Monday) × part of day.
create table public.availability_slots (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  part public.day_part not null,
  primary key (user_id, day_of_week, part)
);
comment on table public.availability_slots is
  'Self-only. Others only ever get availability_overlap(), never these rows.';

create table public.pull_me_in (
  user_id uuid not null references public.profiles (id) on delete cascade,
  sport_id text not null references public.sports (id),
  scope public.pull_scope not null default 'connections',
  created_at timestamptz not null default now(),
  primary key (user_id, sport_id)
);
comment on table public.pull_me_in is
  'Standing permission to be invited when a game needs one more. Delete the row to revoke.';

-- Safety --------------------------------------------------------------------------------------------

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  subject_kind public.report_subject not null,
  subject_id uuid not null,
  reason public.report_reason not null,
  note text check (char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);

-- Down For ------------------------------------------------------------------------------------------

create table public.intent_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  sport_id text not null references public.sports (id),
  window_start timestamptz not null,
  window_end timestamptz not null,
  -- PRD §9.2: every signal expires. No default on purpose.
  expires_at timestamptz not null,
  audience public.audience not null default 'public' check (audience in ('public', 'friends')),
  radius_km integer not null check (radius_km between 1 and 50),
  min_participants integer check (min_participants between 2 and 12),
  place_id uuid references public.places (id),
  -- Copied from profile_private (0.01°). Never exposed to anyone; matching only.
  area_lat numeric(5, 2),
  area_lng numeric(5, 2),
  status public.signal_status not null default 'active',
  matched_plan_id uuid,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (window_end > window_start),
  check (window_end - window_start <= interval '24 hours'),
  check (expires_at > created_at),
  check (expires_at <= window_end),
  -- One active signal per person, sport and overlapping time window (idempotent creation).
  constraint intent_signals_no_duplicate_active exclude using gist (
    user_id with =, sport_id with =, tstzrange(window_start, window_end) with &&
  ) where (status = 'active')
);
create index intent_signals_matching_idx on public.intent_signals (sport_id, status, window_start);

-- Plans ---------------------------------------------------------------------------------------------

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  sport_id text not null references public.sports (id),
  title text check (char_length(title) between 1 and 80),
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 15 and 480),
  place_id uuid references public.places (id),
  -- The lock threshold: the plan goes GAME ON when member_count reaches capacity.
  capacity integer not null check (capacity between 2 and 12),
  audience public.audience not null default 'public',
  deadline_at timestamptz not null,
  poll_closes_at timestamptz,
  status public.plan_status not null default 'forming',
  source public.plan_source not null,
  source_activity_id uuid,
  created_by uuid not null references public.profiles (id),
  host_id uuid not null references public.profiles (id),
  -- Maintained in the same transaction as plan_members writes. Realtime clients read this.
  member_count integer not null default 0 check (member_count >= 0),
  -- Configuration copied to the Activity at GAME ON (and from it by Run It Back).
  level_label text check (char_length(level_label) <= 40),
  team_a_label text check (char_length(team_a_label) <= 24),
  team_b_label text check (char_length(team_b_label) <= 24),
  teams_note text check (char_length(teams_note) <= 200),
  kit_note text check (char_length(kit_note) <= 200),
  cost_cents integer not null default 0 check (cost_cents >= 0),
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  attendance_rule public.attendance_rule not null default 'check_in_host_confirms',
  locked_at timestamptz,
  expired_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (member_count <= capacity),
  check (deadline_at <= starts_at),
  check (source <> 'run_it_back' or source_activity_id is not null)
);
create index plans_forming_idx on public.plans (sport_id, starts_at) where status = 'forming';
create index plans_host_idx on public.plans (host_id);
-- Two people running back the same game at the same time land in the same plan.
create unique index plans_run_it_back_once_idx on public.plans (source_activity_id, starts_at)
  where source = 'run_it_back' and status in ('forming', 'game_on');

-- Exact meeting point: plan members only (and the host).
create table public.plan_meeting_points (
  plan_id uuid primary key references public.plans (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  check ((lat is null) = (lng is null))
);

create table public.plan_time_options (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  starts_at timestamptz not null,
  vote_count integer not null default 0 check (vote_count >= 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (plan_id, starts_at),
  unique (plan_id, id)
);

create table public.plan_time_votes (
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  option_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id),
  foreign key (plan_id, option_id) references public.plan_time_options (plan_id, id) on delete cascade
);

create table public.plan_members (
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  via public.member_via not null,
  joined_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create index plan_members_user_idx on public.plan_members (user_id);

create table public.plan_invites (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  kind public.invite_kind not null,
  status public.invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (plan_id, invitee_id),
  check (inviter_id <> invitee_id)
);
create index plan_invites_invitee_idx on public.plan_invites (invitee_id, status);
create index plan_invites_inviter_idx on public.plan_invites (inviter_id, created_at desc);

-- Activities ----------------------------------------------------------------------------------------

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one Activity per Plan (PRD §9.4).
  plan_id uuid not null unique references public.plans (id),
  sport_id text not null references public.sports (id),
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  place_id uuid references public.places (id),
  capacity integer not null check (capacity between 2 and 12),
  host_id uuid not null references public.profiles (id),
  -- Spots taken (confirmed + checked in), waitlist length, arrivals. Maintained transactionally.
  confirmed_count integer not null default 0 check (confirmed_count >= 0),
  waitlist_count integer not null default 0 check (waitlist_count >= 0),
  checked_in_count integer not null default 0 check (checked_in_count >= 0),
  level_label text,
  team_a_label text,
  team_b_label text,
  teams_note text,
  kit_note text,
  cost_cents integer not null default 0 check (cost_cents >= 0),
  currency text not null default 'CAD',
  attendance_rule public.attendance_rule not null,
  check_in_opens_at timestamptz not null,
  check_in_closes_at timestamptz not null,
  check_in_radius_m integer not null default 150 check (check_in_radius_m between 25 and 2000),
  -- Stored status is advanced by private.tick(); readers use activity_cards.effective_status.
  status public.activity_status not null default 'confirmed',
  live_at timestamptz,
  ended_at timestamptz,
  after_closes_at timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (check_in_closes_at > check_in_opens_at),
  check (after_closes_at > ends_at),
  check (confirmed_count <= capacity)
);
create index activities_status_idx on public.activities (status, starts_at);

alter table public.plans
  add constraint plans_source_activity_fk foreign key (source_activity_id)
  references public.activities (id);
alter table public.intent_signals
  add constraint intent_signals_matched_plan_fk foreign key (matched_plan_id)
  references public.plans (id) on delete set null;

create table public.attendance (
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.attendance_status not null,
  team public.team_side,
  confirmed_at timestamptz,
  waitlisted_at timestamptz,
  cancelled_at timestamptz,
  checked_in_at timestamptz,
  -- How the check-in passed. The raw location is never stored.
  check_in_method public.check_in_method,
  updated_at timestamptz not null default now(),
  primary key (activity_id, user_id),
  check ((status = 'checked_in') = (checked_in_at is not null and check_in_method is not null)
         or status = 'cancelled')
);
create index attendance_user_idx on public.attendance (user_id, status);
create index attendance_waitlist_idx on public.attendance (activity_id, waitlisted_at)
  where status = 'waitlisted';

-- Live location for one game only, until expires_at. Rows are deleted when they expire or stop.
create table public.location_shares (
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (activity_id, user_id),
  check (expires_at > started_at),
  check ((lat is null) = (lng is null))
);
create index location_shares_expiry_idx on public.location_shares (expires_at);

-- Results -------------------------------------------------------------------------------------------

create table public.result_proposals (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  proposed_by uuid not null references public.profiles (id),
  team_a_score integer not null check (team_a_score between 0 and 999),
  team_b_score integer not null check (team_b_score between 0 and 999),
  status public.proposal_status not null default 'proposed',
  verification_level public.verification_level not null default 'self_recorded',
  confirmations_count integer not null default 0 check (confirmations_count >= 0),
  -- Confirmations needed for Participant Confirmed, computed from players who checked in.
  threshold integer not null check (threshold >= 1),
  verified_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);
-- One current (proposed or verified) result per activity.
create unique index result_proposals_current_idx on public.result_proposals (activity_id)
  where status in ('proposed', 'verified');

create table public.result_confirmations (
  proposal_id uuid not null references public.result_proposals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

-- Moments -------------------------------------------------------------------------------------------

create table public.moments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  -- Object name in the private `moments` bucket: <activity_id>/<author_id>/<file>.
  storage_path text not null unique check (char_length(storage_path) <= 300),
  alt_text text check (char_length(alt_text) between 1 and 300),
  caption text check (char_length(caption) <= 300),
  created_at timestamptz not null default now()
);
create index moments_activity_idx on public.moments (activity_id, created_at);

create table public.moment_tags (
  moment_id uuid not null references public.moments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  tagged_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (moment_id, user_id)
);

-- Recap, Passport, Reputation -------------------------------------------------------------------------

create table public.recaps (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null unique references public.activities (id) on delete cascade,
  sport_id text not null references public.sports (id),
  place_id uuid references public.places (id),
  occurred_at timestamptz not null,
  duration_minutes integer not null,
  played_count integer not null default 0,
  team_a_label text,
  team_b_label text,
  team_a_score integer,
  team_b_score integer,
  result_proposal_id uuid references public.result_proposals (id),
  -- Null when no result was logged.
  verification_level public.verification_level,
  confirmed_count integer not null default 0,
  moments_count integer not null default 0,
  created_at timestamptz not null default now(),
  -- Set when the After window closes. A finalized recap never changes again.
  finalized_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.passport_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  sport_id text not null references public.sports (id),
  place_id uuid references public.places (id),
  occurred_at timestamptz not null,
  minutes integer not null check (minutes >= 0),
  -- Ordinals at creation: "21 games at Jeanne-Mance".
  place_game_number integer,
  sport_game_number integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, activity_id)
);
create index passport_entries_activity_idx on public.passport_entries (activity_id);
create index passport_entries_user_place_idx on public.passport_entries (user_id, place_id);

create table public.reputation_signals (
  giver_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.profiles (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  kind public.reputation_kind not null,
  created_at timestamptz not null default now(),
  primary key (giver_id, subject_id, activity_id, kind),
  check (giver_id <> subject_id)
);
create index reputation_signals_subject_idx on public.reputation_signals (subject_id, kind);

-- Private bookkeeping ---------------------------------------------------------------------------------

-- Retried mutations return the first result. Keys are per user and per operation.
create table private.idempotency_keys (
  user_id uuid not null,
  key uuid not null,
  operation text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Server-truth analytics events (PRD §15), drained by the analytics provider once one is chosen.
create table private.analytics_events (
  id bigint generated always as identity primary key,
  name text not null,
  user_id uuid,
  payload jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

-- updated_at triggers ---------------------------------------------------------------------------------

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.profile_private
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.privacy_settings
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.intent_signals
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.plans
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.activities
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.attendance
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.location_shares
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.recaps
  for each row execute function private.set_updated_at();

-- Profile rows for every auth user ------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', ''), 40), '')
  )
  on conflict (id) do nothing;
  insert into public.profile_private (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.privacy_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
