-- Step 6 (Communities & hosts, PRD M7): Host OS operations schema: passes and memberships, a
-- provider-agnostic money ledger (charges, refunds, payouts), refund decisions with an audit trail,
-- league / season operations, and the data the insights read (PRD §13, §16.2, §17).
--
-- Contract for the app: docs/HOSTS_OPS_CONTRACT.md. Judgment calls: docs/DESIGN_DECISIONS.md
-- ("Step 6 BE-HOST-OPS"). Builds on BE-HOST-CORE's 20261030200000_host_core.sql (programs, series,
-- sessions, members).
--
-- NO MONEY MOVES. The payments provider is not chosen (owner decision pending; real money is Step 8).
-- Every money row has `provider = 'none'` (a check constraint allows nothing else yet) and the program's
-- payment account reads "not connected". Charges, refunds and payouts are records with statuses so the
-- host screens, the roster's per-person payment status and the insights work end to end. Amounts are
-- integer cents plus an ISO currency.
--
-- The Ojoro service fee is a PLACEHOLDER and lives in exactly one place: private.host_service_fee_cents()
-- (20261030300100). Nothing else knows the rate.
--
-- Model:
--   host_passes             What a program sells: drop-in, 10-pack (pack), monthly, free.
--   host_memberships        A person holding a pass (monthly membership, pack, free pass). Monthly
--                           memberships keep host_program_members (BE-HOST-CORE) in step.
--   host_pass_uses          One pack session used at one session.
--   host_charges            Money owed or paid: a drop-in, a pack, a monthly purchase or renewal.
--   host_refunds            Money given back: automatic (a dropped spot filled from the waitlist), a host
--                           decision on a refund request, or a cancelled session.
--   host_refund_requests    "Could I get some of October back?" and the host's decision (full / partial /
--                           keep).
--   host_payouts            Closed weekly payouts (frozen totals). The next payout is computed live.
--   host_ops_audit          Insert-only trail of every money and league decision (who, what, when, amount).
--   host_leagues ...        League / season: teams, members (players, captains, free agents), rounds,
--                           fixtures, referees, who's in and checked in, captains' result submissions,
--                           insert-only confirmed results, disputes. Standings are computed.

-- Types --------------------------------------------------------------------------------------------------

create type public.host_pass_kind as enum ('drop_in', 'pack', 'monthly', 'free');
create type public.host_membership_status as enum ('active', 'cancelled', 'ended');
create type public.host_charge_kind as enum ('drop_in', 'pack', 'monthly', 'monthly_renewal');
-- due: owed, not collected (pays at the field, or a renewal while no provider is connected).
-- paid: collected (at the field, or by a provider once there is one). void: written off by the host.
create type public.host_charge_status as enum ('due', 'paid', 'failed', 'void');
create type public.host_charge_method as enum ('app', 'at_field', 'host_recorded');
-- pending: recorded, waiting for the provider (none is connected, so recorded refunds stay pending and
-- still come off the payout). succeeded / failed: the provider's answer. cancelled: undone by the host.
create type public.host_refund_status as enum ('pending', 'succeeded', 'failed', 'cancelled');
create type public.host_refund_reason as enum ('spot_filled', 'host_decision', 'session_cancelled');
create type public.host_refund_request_status as enum ('open', 'refunded_full', 'refunded_partial', 'kept', 'withdrawn');
create type public.host_refund_decision as enum ('full', 'partial', 'keep');
-- scheduled: closed, waiting to be sent (no provider: it waits). paid / failed: the provider's answer.
create type public.host_payout_status as enum ('scheduled', 'paid', 'failed');
-- Per person, per session (HostRoster): how their spot is paid.
create type public.host_payment_state as enum (
  'host', 'member', 'pack', 'paid', 'free', 'due', 'refunded'
);
create type public.host_league_status as enum ('draft', 'active', 'complete');
create type public.host_fixture_status as enum ('scheduled', 'postponed', 'played', 'cancelled');
create type public.host_referee_status as enum ('asked', 'accepted', 'declined');
create type public.host_league_result_source as enum ('captains_agree', 'host_entered');

-- Passes and memberships ----------------------------------------------------------------------------------

create table public.host_passes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.host_programs (id) on delete cascade,
  kind public.host_pass_kind not null,
  name text not null check (char_length(name) between 1 and 40),
  -- "One session, any Tuesday or Thursday", "10 sessions, use within 4 months".
  description text check (char_length(description) <= 120),
  price_cents integer not null check (price_cents between 0 and 100000),
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  -- pack: sessions in the pack. Null otherwise.
  sessions_included integer check (sessions_included between 2 and 100),
  -- pack: days to use it. monthly: the period length is one calendar month (null here).
  valid_days integer check (valid_days between 1 and 730),
  -- free: the series it lets people into ("Sunday beginners"). Optional for the others (null = any).
  series_id uuid references public.host_series (id) on delete set null,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'free') = (price_cents = 0)),
  check ((kind = 'pack') = (sessions_included is not null)),
  check (kind = 'pack' or valid_days is null)
);
create index host_passes_program_idx on public.host_passes (program_id, sort_order);

create table public.host_memberships (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.host_programs (id) on delete cascade,
  pass_id uuid not null references public.host_passes (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.host_pass_kind not null check (kind in ('pack', 'monthly', 'free')),
  status public.host_membership_status not null default 'active',
  started_at timestamptz not null default now(),
  -- monthly: the end of the current period (renews here). pack: expiry. free: null (open-ended).
  period_ends_at timestamptz,
  -- monthly: renews at period_ends_at unless cancelled.
  renews boolean not null default false,
  sessions_total integer check (sessions_total between 1 and 100),
  cancelled_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'pack') = (sessions_total is not null)),
  check (kind <> 'monthly' or period_ends_at is not null),
  check (not renews or kind = 'monthly'),
  check ((status = 'ended') = (ended_at is not null))
);
create index host_memberships_program_idx on public.host_memberships (program_id, kind, status);
create index host_memberships_user_idx on public.host_memberships (user_id, program_id);

create table public.host_pass_uses (
  membership_id uuid not null references public.host_memberships (id) on delete cascade,
  session_id uuid not null references public.host_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (membership_id, session_id),
  unique (session_id, user_id)
);

-- Ledger ----------------------------------------------------------------------------------------------------

create table public.host_charges (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.host_programs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.host_charge_kind not null,
  pass_id uuid references public.host_passes (id),
  membership_id uuid references public.host_memberships (id) on delete set null,
  -- drop_in: the session it pays for.
  session_id uuid references public.host_sessions (id) on delete set null,
  amount_cents integer not null check (amount_cents between 1 and 100000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status public.host_charge_status not null default 'due',
  method public.host_charge_method not null,
  -- No payments provider is connected (owner decision pending). Nothing else is allowed yet.
  provider text not null default 'none' check (provider = 'none'),
  provider_ref text,
  paid_at timestamptz,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'paid') = (paid_at is not null)),
  check ((kind = 'drop_in') = (session_id is not null))
);
-- One drop-in per person per session.
create unique index host_charges_drop_in_idx on public.host_charges (session_id, user_id)
  where kind = 'drop_in' and status <> 'void';
create index host_charges_program_paid_idx on public.host_charges (program_id, paid_at) where status = 'paid';
create index host_charges_user_idx on public.host_charges (user_id, program_id);

create table public.host_refund_requests (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.host_programs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  charge_id uuid not null references public.host_charges (id),
  -- Their words to the host ("New job with late shifts…").
  note text check (char_length(note) between 1 and 280),
  status public.host_refund_request_status not null default 'open',
  decision public.host_refund_decision,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('open', 'withdrawn')) = (decision is null)),
  check ((decision is null) = (decided_at is null))
);
create unique index host_refund_requests_one_open_idx on public.host_refund_requests (charge_id) where status = 'open';
create index host_refund_requests_program_idx on public.host_refund_requests (program_id, status, created_at);

create table public.host_refunds (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.host_programs (id) on delete cascade,
  charge_id uuid not null references public.host_charges (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents between 1 and 100000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reason public.host_refund_reason not null,
  request_id uuid references public.host_refund_requests (id),
  status public.host_refund_status not null default 'pending',
  provider text not null default 'none' check (provider = 'none'),
  provider_ref text,
  -- spot_filled: who took the spot ("Rina took the spot a minute later").
  related_user_id uuid references public.profiles (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one automatic refund per charge.
create unique index host_refunds_auto_idx on public.host_refunds (charge_id)
  where reason in ('spot_filled', 'session_cancelled') and status <> 'cancelled';
create index host_refunds_program_idx on public.host_refunds (program_id, created_at);

-- A closed week. Totals are frozen when the week closes; the next payout is computed live
-- (host_money_view). period_end is exclusive and is the morning the payout lands (pays_on).
create table public.host_payouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.host_programs (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  pays_on date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  gross_cents bigint not null check (gross_cents >= 0),
  refunds_cents bigint not null check (refunds_cents >= 0),
  fee_cents bigint not null check (fee_cents >= 0),
  net_cents bigint not null,
  session_count integer not null default 0,
  pass_count integer not null default 0,
  refund_count integer not null default 0,
  -- The host's line ("rain-out on Thursday"), from skipped sessions in the week.
  note text check (char_length(note) <= 120),
  lines jsonb not null default '[]',
  status public.host_payout_status not null default 'scheduled',
  provider text not null default 'none' check (provider = 'none'),
  provider_ref text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, period_start),
  check (period_end > period_start),
  check (net_cents = gross_cents - refunds_cents - fee_cents),
  check ((status = 'paid') = (paid_at is not null))
);

-- Audit ---------------------------------------------------------------------------------------------------

create table public.host_ops_audit (
  id bigint generated always as identity primary key,
  program_id uuid not null references public.host_programs (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  subject_type text not null,
  subject_id uuid,
  amount_cents integer,
  detail jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
create index host_ops_audit_program_idx on public.host_ops_audit (program_id, created_at desc);

create or replace function private.host_ops_insert_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('ojoro.seed_reset', true) = 'on' then
    return old;
  end if;
  raise exception using errcode = 'P0001', message = case tg_table_name
      when 'host_league_results' then 'result_already_verified' else 'audit_immutable' end,
    detail = tg_table_name || ' rows are final';
end;
$$;

create trigger host_ops_audit_immutable before update or delete on public.host_ops_audit
  for each row execute function private.host_ops_insert_only();

-- Leagues -------------------------------------------------------------------------------------------------

create table public.host_leagues (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.host_programs (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  sport_id text not null references public.sports (id),
  place_id uuid references public.places (id),
  -- "Jeanne-Mance" (an area-level venue name, never an address).
  venue_label text check (char_length(venue_label) <= 60),
  rounds_total integer not null check (rounds_total between 1 and 60),
  -- "everyone plays everyone twice".
  meetings integer not null default 2 check (meetings between 1 and 4),
  starts_on date not null,
  points_win integer not null default 3 check (points_win between 1 and 10),
  points_draw integer not null default 1 check (points_draw between 0 and 10),
  -- Teams need this many in by kick-off ("Teams need 7 checked in").
  min_players integer not null default 7 check (min_players between 1 and 30),
  status public.host_league_status not null default 'active',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index host_leagues_program_idx on public.host_leagues (program_id);

create table public.host_league_teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.host_leagues (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  crew_id uuid references public.crews (id) on delete set null,
  captain_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (league_id, name)
);

-- Players (team_id set) and free agents (team_id null) on the league list.
create table public.host_league_members (
  league_id uuid not null references public.host_leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid references public.host_league_teams (id) on delete set null,
  -- Can referee ("Yara M is free and has reffed twice").
  can_referee boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index host_league_members_team_idx on public.host_league_members (team_id);

create table public.host_league_rounds (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.host_leagues (id) on delete cascade,
  number integer not null check (number between 1 and 60),
  plays_on date not null,
  unique (league_id, number)
);

create table public.host_league_fixtures (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.host_leagues (id) on delete cascade,
  round_id uuid not null references public.host_league_rounds (id) on delete cascade,
  home_team_id uuid not null references public.host_league_teams (id),
  away_team_id uuid not null references public.host_league_teams (id),
  kicks_off_at timestamptz not null,
  -- "Turf 1".
  pitch text check (char_length(pitch) <= 30),
  status public.host_fixture_status not null default 'scheduled',
  -- Moved after a rain-out: the original kick-off.
  rescheduled_from timestamptz,
  referee_id uuid references public.profiles (id) on delete set null,
  referee_status public.host_referee_status,
  referee_asked_at timestamptz,
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  check ((referee_id is null) = (referee_status is null))
);
create index host_league_fixtures_league_idx on public.host_league_fixtures (league_id, kicks_off_at);

-- "7 + 8 IN": who said they're in for a fixture, and who checked in at the pitch.
create table public.host_league_fixture_players (
  fixture_id uuid not null references public.host_league_fixtures (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.host_league_teams (id) on delete cascade,
  in_at timestamptz not null default now(),
  checked_in_at timestamptz,
  primary key (fixture_id, user_id)
);

-- A captain's score. Both captains sending the same score is "both captains agree".
create table public.host_league_result_submissions (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.host_league_fixtures (id) on delete cascade,
  team_id uuid not null references public.host_league_teams (id) on delete cascade,
  submitted_by uuid not null references public.profiles (id) on delete cascade,
  home_goals integer not null check (home_goals between 0 and 99),
  away_goals integer not null check (away_goals between 0 and 99),
  -- Superseded by a newer submission from the same team, or cleared by a dispute.
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index host_league_submissions_current_idx on public.host_league_result_submissions (fixture_id, team_id)
  where superseded_at is null;

create table public.host_league_disputes (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.host_league_fixtures (id) on delete cascade,
  raised_by uuid not null references public.profiles (id) on delete cascade,
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index host_league_disputes_open_idx on public.host_league_disputes (fixture_id) where resolved_at is null;

-- Confirmed by the host. Insert-only: standings are computed from these rows, so a result is never
-- rewritten (like challenge_results in Step 5).
create table public.host_league_results (
  fixture_id uuid primary key references public.host_league_fixtures (id) on delete cascade,
  league_id uuid not null references public.host_leagues (id) on delete cascade,
  home_team_id uuid not null references public.host_league_teams (id),
  away_team_id uuid not null references public.host_league_teams (id),
  home_goals integer not null check (home_goals between 0 and 99),
  away_goals integer not null check (away_goals between 0 and 99),
  source public.host_league_result_source not null,
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz not null default now()
);
create index host_league_results_league_idx on public.host_league_results (league_id);

create trigger host_league_results_immutable before update or delete on public.host_league_results
  for each row execute function private.host_ops_insert_only();

-- updated_at --------------------------------------------------------------------------------------------

create trigger set_updated_at before update on public.host_passes
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_memberships
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_charges
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_refunds
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_refund_requests
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_payouts
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_leagues
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.host_league_fixtures
  for each row execute function private.set_updated_at();

-- Authorization helpers --------------------------------------------------------------------------------

create or replace function authz.league_program(p_league uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.program_id from public.host_leagues l where l.id = p_league;
$$;

-- Plays in, captains, referees or is a free agent in the league, or hosts it.
create or replace function authz.can_see_league(p_league uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and exists (
    select 1 from public.host_leagues l
    where l.id = p_league
      and (authz.is_program_host(l.program_id, p_viewer)
           or l.status <> 'draft')
  );
$$;

-- The viewer's team in a league (null for free agents and outsiders).
create or replace function authz.league_team(p_league uuid, p_viewer uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.team_id from public.host_league_members m where m.league_id = p_league and m.user_id = p_viewer;
$$;

revoke all on function authz.league_program(uuid), authz.can_see_league(uuid, uuid),
  authz.league_team(uuid, uuid) from public, anon;
grant execute on function authz.league_program(uuid), authz.can_see_league(uuid, uuid),
  authz.league_team(uuid, uuid) to authenticated, service_role;

-- RLS -------------------------------------------------------------------------------------------------------
-- Reads only. Money rows: the program's hosts, and the person's own rows. Every write is an RPC.

alter table public.host_passes enable row level security;
alter table public.host_memberships enable row level security;
alter table public.host_pass_uses enable row level security;
alter table public.host_charges enable row level security;
alter table public.host_refunds enable row level security;
alter table public.host_refund_requests enable row level security;
alter table public.host_payouts enable row level security;
alter table public.host_ops_audit enable row level security;
alter table public.host_leagues enable row level security;
alter table public.host_league_teams enable row level security;
alter table public.host_league_members enable row level security;
alter table public.host_league_rounds enable row level security;
alter table public.host_league_fixtures enable row level security;
alter table public.host_league_fixture_players enable row level security;
alter table public.host_league_result_submissions enable row level security;
alter table public.host_league_disputes enable row level security;
alter table public.host_league_results enable row level security;

revoke all on public.host_passes, public.host_memberships, public.host_pass_uses, public.host_charges,
  public.host_refunds, public.host_refund_requests, public.host_payouts, public.host_ops_audit,
  public.host_leagues, public.host_league_teams, public.host_league_members, public.host_league_rounds,
  public.host_league_fixtures, public.host_league_fixture_players, public.host_league_result_submissions,
  public.host_league_disputes, public.host_league_results from anon, authenticated;
grant select on public.host_passes, public.host_memberships, public.host_pass_uses, public.host_charges,
  public.host_refunds, public.host_refund_requests, public.host_payouts, public.host_ops_audit,
  public.host_leagues, public.host_league_teams, public.host_league_members, public.host_league_rounds,
  public.host_league_fixtures, public.host_league_fixture_players, public.host_league_result_submissions,
  public.host_league_disputes, public.host_league_results to authenticated;

-- What a program sells is public to signed-in people (like its schedule).
create policy "host_passes: like the program" on public.host_passes
  for select to authenticated using (
    archived_at is null and exists (select 1 from public.host_programs p where p.id = program_id)
    or authz.is_program_host(program_id, (select auth.uid()))
  );
create policy "host_memberships: self and hosts" on public.host_memberships
  for select to authenticated using (
    user_id = (select auth.uid()) or authz.is_program_host(program_id, (select auth.uid()))
  );
create policy "host_pass_uses: self and hosts" on public.host_pass_uses
  for select to authenticated using (
    user_id = (select auth.uid())
    or exists (select 1 from public.host_sessions s
               where s.id = session_id and authz.is_program_host(s.program_id, (select auth.uid())))
  );
create policy "host_charges: self and hosts" on public.host_charges
  for select to authenticated using (
    user_id = (select auth.uid()) or authz.is_program_host(program_id, (select auth.uid()))
  );
create policy "host_refunds: self and hosts" on public.host_refunds
  for select to authenticated using (
    user_id = (select auth.uid()) or authz.is_program_host(program_id, (select auth.uid()))
  );
create policy "host_refund_requests: self and hosts" on public.host_refund_requests
  for select to authenticated using (
    user_id = (select auth.uid()) or authz.is_program_host(program_id, (select auth.uid()))
  );
create policy "host_payouts: hosts" on public.host_payouts
  for select to authenticated using (authz.is_program_host(program_id, (select auth.uid())));
create policy "host_ops_audit: hosts" on public.host_ops_audit
  for select to authenticated using (authz.is_program_host(program_id, (select auth.uid())));

-- A league's standings, fixtures and results are public to signed-in people once it is active
-- ("Season page: public standings, results and the final"). Captains' raw submissions, disputes and
-- who is in for a fixture: the hosts and the teams in the fixture.
create policy "host_leagues: visible" on public.host_leagues
  for select to authenticated using (authz.can_see_league(id, (select auth.uid())));
create policy "host_league_teams: visible league" on public.host_league_teams
  for select to authenticated using (authz.can_see_league(league_id, (select auth.uid())));
create policy "host_league_members: self, teammates and hosts" on public.host_league_members
  for select to authenticated using (
    user_id = (select auth.uid())
    or authz.is_program_host(authz.league_program(league_id), (select auth.uid()))
    or (team_id is not null and team_id = authz.league_team(league_id, (select auth.uid())))
  );
create policy "host_league_rounds: visible league" on public.host_league_rounds
  for select to authenticated using (authz.can_see_league(league_id, (select auth.uid())));
create policy "host_league_fixtures: visible league" on public.host_league_fixtures
  for select to authenticated using (authz.can_see_league(league_id, (select auth.uid())));
create policy "host_league_results: visible league" on public.host_league_results
  for select to authenticated using (authz.can_see_league(league_id, (select auth.uid())));
create policy "host_league_fixture_players: self and hosts" on public.host_league_fixture_players
  for select to authenticated using (
    user_id = (select auth.uid())
    or exists (select 1 from public.host_league_fixtures f
               where f.id = fixture_id
                 and authz.is_program_host(authz.league_program(f.league_id), (select auth.uid())))
  );
create policy "host_league_result_submissions: hosts and the submitter" on public.host_league_result_submissions
  for select to authenticated using (
    submitted_by = (select auth.uid())
    or exists (select 1 from public.host_league_fixtures f
               where f.id = fixture_id
                 and authz.is_program_host(authz.league_program(f.league_id), (select auth.uid())))
  );
create policy "host_league_disputes: hosts and the raiser" on public.host_league_disputes
  for select to authenticated using (
    raised_by = (select auth.uid())
    or exists (select 1 from public.host_league_fixtures f
               where f.id = fixture_id
                 and authz.is_program_host(authz.league_program(f.league_id), (select auth.uid())))
  );

-- Realtime (postgres_changes respects RLS) ------------------------------------------------------------

alter publication supabase_realtime add table
  public.host_charges,
  public.host_refunds,
  public.host_refund_requests,
  public.host_memberships,
  public.host_passes,
  public.host_league_fixtures,
  public.host_league_results,
  public.host_league_result_submissions;
