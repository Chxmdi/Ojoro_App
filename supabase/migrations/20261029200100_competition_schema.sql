-- Step 5 (Competition, PRD M6): Call-Outs, Challenge Events, the crowd around them (follow,
-- predictions, backing, posts, comments, polls, cheers), live progress, verification and Rivalries.
--
-- Contract for the app: docs/COMPETITION_CONTRACT.md. Judgment calls: docs/DESIGN_DECISIONS.md
-- ("Step 5 backend").
--
-- Shape (PRD §9.14, §10, §14.1):
--   call_outs            the invitation. ACCEPT creates exactly one challenge_events row (unique
--                        call_out_id, row lock, one transaction). COUNTER makes a new linked
--                        call-out; PASS declines. Rematches are new call-outs linked to the event.
--   challenge_events     the social event. Rules are copied from the call-out at acceptance and never
--                        change. Stored status moves scheduled → live → verifying (⇄ disputed) →
--                        complete, or cancelled; the stage the app shows is computed from time + status.
--   challenge_results    the verified outcome, insert-only. A Rivalry's record is computed from these
--                        rows, so a rematch adds history and never rewrites it.
--
-- No money anywhere: there are no stakes, odds, payouts or points (PRD §10.6, §19). Predictions and
-- backing are social counts and never touch the result.

-- Types -------------------------------------------------------------------------------------------------

create type public.challenge_format as enum ('person_vs_person', 'crew_vs_crew');
-- How the result is measured: time (lower wins, seconds), distance (higher wins, km), score and
-- rounds (higher wins).
create type public.challenge_scoring as enum ('time', 'distance', 'score', 'rounds');
-- Who may see an event (and so follow, predict, back, comment): everyone signed in; people
-- connected to a competitor (played together, or in a side's crew); only the competitors, their
-- crews and the organizers.
create type public.challenge_audience as enum ('public', 'friends', 'participants');
create type public.call_out_status as enum ('proposed', 'accepted', 'countered', 'declined', 'withdrawn', 'expired');
create type public.challenge_status as enum ('scheduled', 'live', 'verifying', 'disputed', 'complete', 'cancelled');
-- What the app shows (ChallengeEventHero `stage`, plus the stages after it). Computed, never stored.
create type public.challenge_stage as enum (
  'accepted', 'days', 'today', 'soon', 'live', 'verifying', 'disputed', 'complete', 'cancelled'
);
create type public.challenge_post_kind as enum ('system', 'statement', 'training', 'progress', 'logistics');
create type public.challenge_poll_template as enum ('winner', 'margin', 'performance', 'first_score', 'rematch');
-- How a result is verified. Device data (watches, GPS) is M10; until then participants confirm.
create type public.challenge_verification_method as enum ('participant_confirmation', 'device');
create type public.challenge_result_source as enum ('participant_confirmation', 'organizer_review');
create type public.challenge_submission_status as enum ('pending', 'confirmed', 'superseded');
create type public.rivalry_kind as enum ('people', 'crews');

-- Rivalries ---------------------------------------------------------------------------------------------

-- One row per pair (people or crews), ids in canonical order. The record is computed from
-- challenge_results (see rivalry_view), so nothing here is ever "updated" by a result.
create table public.rivalries (
  id uuid primary key default gen_random_uuid(),
  kind public.rivalry_kind not null,
  low_id uuid not null,
  high_id uuid not null,
  created_at timestamptz not null default now(),
  unique (kind, low_id, high_id),
  check (low_id < high_id)
);
comment on table public.rivalries is
  'Head-to-head pairs. The record is computed from challenge_results; results are never rewritten.';

-- Call-Outs ---------------------------------------------------------------------------------------------

create table public.call_outs (
  id uuid primary key default gen_random_uuid(),
  format public.challenge_format not null,
  sport_id text not null references public.sports (id),
  -- The discipline label on the poster ("5K", "Sparring", "5 a side").
  title text not null check (char_length(title) between 1 and 24),
  scoring public.challenge_scoring not null,
  -- Target and unit for the live lanes and the rules ("5 km", "3 rounds"). Optional.
  target numeric(8, 2) check (target > 0),
  unit text check (unit in ('km', 'min', 'rounds', 'points', 'sets', 'goals')),
  -- A public place (areas, not addresses) and a short course line ("Mount Royal loop, 5.0 km, from
  -- the Cartier monument"). Both optional.
  place_id uuid references public.places (id),
  course_note text check (char_length(course_note) <= 140),
  starts_at timestamptz not null,
  time_zone text not null default 'America/Toronto',
  -- The challenger's line ("Saturday. Mount Royal. Bring your legs.").
  message text check (char_length(message) <= 140),
  audience public.challenge_audience not null default 'public',
  verification public.challenge_verification_method not null default 'participant_confirmation',
  -- Crew-vs-crew: people per side (5 a side). 1 for person vs person.
  side_size integer not null default 1 check (side_size between 1 and 11),
  challenger_id uuid not null references public.profiles (id) on delete cascade,
  challenger_crew_id uuid references public.crews (id) on delete cascade,
  -- Targeted: a person or a crew. Open (both null): anyone who can see it may accept.
  opponent_id uuid references public.profiles (id) on delete cascade,
  opponent_crew_id uuid references public.crews (id) on delete cascade,
  status public.call_out_status not null default 'proposed',
  expires_at timestamptz not null,
  responded_at timestamptz,
  responded_by uuid references public.profiles (id) on delete set null,
  -- A counter is a new call-out that points at the one it answers.
  countered_from uuid references public.call_outs (id) on delete set null,
  -- Rematch: the event it follows, and the rivalry it continues.
  rematch_of_event_id uuid,
  rivalry_id uuid references public.rivalries (id),
  -- Set when accepted: the one Challenge Event.
  event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opponent_id is null or opponent_id <> challenger_id),
  check (opponent_crew_id is null or opponent_crew_id <> challenger_crew_id),
  check (
    (format = 'person_vs_person' and challenger_crew_id is null and opponent_crew_id is null and side_size = 1)
    or (format = 'crew_vs_crew' and challenger_crew_id is not null and opponent_id is null)
  ),
  check (expires_at <= starts_at)
);
create index call_outs_opponent_idx on public.call_outs (opponent_id, status);
create index call_outs_opponent_crew_idx on public.call_outs (opponent_crew_id, status);
create index call_outs_challenger_idx on public.call_outs (challenger_id, created_at desc);
create index call_outs_rematch_idx on public.call_outs (rematch_of_event_id) where rematch_of_event_id is not null;
comment on table public.call_outs is
  'Call-Outs (PRD §9.14). Write through the call-out RPCs. effective status: call_out_cards / call_out_view.';

-- Challenge Events -------------------------------------------------------------------------------------

create table public.challenge_events (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one event per accepted call-out (PRD §10.15, §14.1).
  call_out_id uuid not null unique references public.call_outs (id),
  format public.challenge_format not null,
  sport_id text not null references public.sports (id),
  title text not null,
  scoring public.challenge_scoring not null,
  target numeric(8, 2),
  unit text,
  place_id uuid references public.places (id),
  course_note text,
  starts_at timestamptz not null,
  time_zone text not null,
  audience public.challenge_audience not null,
  verification public.challenge_verification_method not null,
  side_size integer not null,
  rivalry_id uuid not null references public.rivalries (id),
  rematch_of_event_id uuid references public.challenge_events (id),
  -- Side a = the challenger, side b = the one who accepted. Captains speak for a side (the person
  -- themselves, or the crew owner/admin who sent or accepted).
  a_user_id uuid references public.profiles (id),
  b_user_id uuid references public.profiles (id),
  a_crew_id uuid references public.crews (id),
  b_crew_id uuid references public.crews (id),
  a_captain_id uuid not null references public.profiles (id),
  b_captain_id uuid not null references public.profiles (id),
  accepted_at timestamptz not null default now(),
  check_in_opens_at timestamptz not null,
  status public.challenge_status not null default 'scheduled',
  live_at timestamptz,
  ended_at timestamptz,
  disputed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason in ('called_off', 'no_show', 'no_result')),
  -- Live progress, logged by competitors (device data is M10).
  a_progress numeric(10, 2),
  b_progress numeric(10, 2),
  live_period integer check (live_period between 1 and 99),
  progress_updated_at timestamptz,
  progress_logged_by uuid references public.profiles (id) on delete set null,
  -- Counts, kept by the RPCs so realtime subscribers get one UPDATE per change.
  follower_count integer not null default 0,
  prediction_a integer not null default 0,
  prediction_b integer not null default 0,
  backing_a integer not null default 0,
  backing_b integer not null default 0,
  comment_count integer not null default 0,
  reaction_counts jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  check (a_captain_id <> b_captain_id)
);
create index challenge_events_starts_idx on public.challenge_events (status, starts_at);
create index challenge_events_rivalry_idx on public.challenge_events (rivalry_id);
comment on table public.challenge_events is
  'Challenge Events (PRD §10). Rules never change after acceptance. Stage: challenge_event_view().';

alter table public.call_outs
  add constraint call_outs_event_fk foreign key (event_id) references public.challenge_events (id),
  add constraint call_outs_rematch_fk foreign key (rematch_of_event_id) references public.challenge_events (id);

-- Who competes. Person vs person: the two captains. Crew vs crew: the captains plus crew members who
-- join the lineup (up to side_size).
create table public.challenge_competitors (
  event_id uuid not null references public.challenge_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  side public.team_side not null,
  is_captain boolean not null default false,
  joined_at timestamptz not null default now(),
  checked_in_at timestamptz,
  ready_at timestamptz,
  primary key (event_id, user_id)
);
create index challenge_competitors_user_idx on public.challenge_competitors (user_id);

-- Organizers both sides approved: they may post updates (PRD §10.4). Never competitors.
create table public.challenge_organizers (
  event_id uuid not null references public.challenge_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  proposed_by uuid not null references public.profiles (id) on delete cascade,
  proposed_side public.team_side not null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- The crowd ------------------------------------------------------------------------------------------

create table public.challenge_followers (
  event_id uuid not null references public.challenge_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Quiet follow: no notifications. Comments muted: the crowd is hidden for you, state still shows.
  quiet boolean not null default false,
  comments_muted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index challenge_followers_user_idx on public.challenge_followers (user_id);

-- WHO TAKES IT? One per person per event; changeable until the start, locked at LIVE.
create table public.challenge_predictions (
  event_id uuid not null references public.challenge_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  side public.team_side not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- WHO ARE YOU SUPPORTING? Stored apart from predictions (PRD §10.7). Never affects scoring.
create table public.challenge_backings (
  event_id uuid not null references public.challenge_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  side public.team_side not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- Event feed: competitor and organizer posts, and Ojoro's milestones (author null).
create table public.challenge_posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.challenge_events (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete cascade,
  kind public.challenge_post_kind not null,
  body text check (char_length(body) between 1 and 280),
  -- Training / progress numbers the author chose to share: {"distance_km": 5.2, "time_seconds": 1428}.
  stats jsonb,
  -- System posts: the milestone key ('set', 'week', 'tomorrow', 'today', 'almost', 'both_here',
  -- 'crowd_shift', 'followers_100', 'live', 'result', 'called_off', 'correction').
  milestone text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((kind = 'system') = (author_id is null)),
  check ((kind = 'system') = (milestone is not null))
);
create index challenge_posts_event_idx on public.challenge_posts (event_id, created_at desc);
-- Each milestone once per event (the crowd may change its mind more than once).
create unique index challenge_posts_milestone_idx on public.challenge_posts (event_id, milestone)
  where milestone is not null and milestone not in ('crowd_shift', 'correction');

-- The Crowd: comments on the event or on a post, replies one level deep.
create table public.challenge_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.challenge_events (id) on delete cascade,
  post_id uuid references public.challenge_posts (id) on delete cascade,
  parent_id uuid references public.challenge_comments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text check (char_length(body) between 1 and 500),
  respect_count integer not null default 0,
  reply_count integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index challenge_comments_event_idx on public.challenge_comments (event_id, created_at desc);
create index challenge_comments_parent_idx on public.challenge_comments (parent_id) where parent_id is not null;

create table public.challenge_comment_respects (
  comment_id uuid not null references public.challenge_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- CHEER THEM ON: one word per person per event (lets_go, respect, hold_that, run_it_back).
create table public.challenge_reactions (
  event_id uuid not null references public.challenge_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction public.reaction_word not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- Event polls from an allowlist of templates (PRD §10.8). Questions and options are built by the
-- server, so nobody can write a wagering or humiliating poll.
create table public.challenge_polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.challenge_events (id) on delete cascade,
  template public.challenge_poll_template not null,
  question text not null,
  options text[] not null check (cardinality(options) between 2 and 4),
  vote_counts integer[] not null,
  threshold numeric(10, 2),
  created_by uuid not null references public.profiles (id) on delete cascade,
  closes_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, template)
);

create table public.challenge_poll_votes (
  poll_id uuid not null references public.challenge_polls (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  option_index integer not null check (option_index between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

-- Verification -----------------------------------------------------------------------------------------

create table public.challenge_result_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.challenge_events (id) on delete cascade,
  submitted_by uuid not null references public.profiles (id) on delete cascade,
  a_value numeric(10, 2) not null check (a_value >= 0),
  b_value numeric(10, 2) not null check (b_value >= 0),
  -- One line for the recap ("Out hard, held it through the last climb on Camillien-Houde.").
  note text check (char_length(note) <= 280),
  status public.challenge_submission_status not null default 'pending',
  created_at timestamptz not null default now()
);
create unique index challenge_submissions_one_pending_idx on public.challenge_result_submissions (event_id)
  where status = 'pending';

create table public.challenge_result_confirmations (
  submission_id uuid not null references public.challenge_result_submissions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (submission_id, user_id)
);

-- REQUEST A CORRECTION: pauses the result (disputed) until a new submission or an organizer review.
create table public.challenge_corrections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.challenge_events (id) on delete cascade,
  submission_id uuid references public.challenge_result_submissions (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution in ('resubmitted', 'withdrawn', 'organizer_review'))
);
create unique index challenge_corrections_one_open_idx on public.challenge_corrections (event_id)
  where resolved_at is null;

-- The verified outcome. Insert-only: a result is never rewritten (PRD §10.15, §20.2).
create table public.challenge_results (
  event_id uuid primary key references public.challenge_events (id) on delete cascade,
  rivalry_id uuid not null references public.rivalries (id),
  a_value numeric(10, 2) not null,
  b_value numeric(10, 2) not null,
  -- null = a draw.
  winner_side public.team_side,
  -- |a − b| in the scoring's unit (seconds, km, points, rounds).
  margin numeric(10, 2) not null,
  source public.challenge_result_source not null,
  submission_id uuid references public.challenge_result_submissions (id),
  note text,
  -- The crowd at the moment predictions locked (they can't change after LIVE).
  predicted_a integer not null default 0,
  predicted_b integer not null default 0,
  -- true: the side most people picked won; false: it lost; null: a draw, a tie in predictions, or
  -- too few predictions to say.
  crowd_called_it boolean,
  watched_count integer not null default 0,
  verified_at timestamptz not null default now()
);
create index challenge_results_rivalry_idx on public.challenge_results (rivalry_id, verified_at);

create or replace function private.challenge_results_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Local seed files may clear their own sample rows; nothing else may change or remove a result.
  if tg_op = 'DELETE' and current_setting('ojoro.seed_reset', true) = 'on' then
    return old;
  end if;
  raise exception using errcode = 'P0001', message = 'result_already_verified',
    detail = 'challenge results are final';
end;
$$;

create trigger challenge_results_immutable before update or delete on public.challenge_results
  for each row execute function private.challenge_results_immutable();

create trigger set_updated_at before update on public.call_outs
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.challenge_events
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.challenge_polls
  for each row execute function private.set_updated_at();

-- Visibility helpers ----------------------------------------------------------------------------------

create or replace function authz.is_challenge_competitor(p_event uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.challenge_competitors c where c.event_id = p_event and c.user_id = p_viewer);
$$;

create or replace function authz.is_challenge_organizer(p_event uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.challenge_organizers o
                 where o.event_id = p_event and o.user_id = p_viewer and o.approved_at is not null);
$$;

-- Competitors and approved organizers see their event. Everyone else needs no block with any
-- competitor, and the audience: public (anyone signed in), friends (played with a competitor, or in
-- a side's crew), participants (a side's crew only).
create or replace function authz.can_see_challenge_event(p_event uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and exists (
    select 1 from public.challenge_events e
    where e.id = p_event
      and (
        exists (select 1 from public.challenge_competitors c where c.event_id = e.id and c.user_id = p_viewer)
        or authz.is_challenge_organizer(e.id, p_viewer)
        or (
          not exists (select 1 from public.challenge_competitors c
                      where c.event_id = e.id and authz.is_blocked(c.user_id, p_viewer))
          and (
            e.audience = 'public'
            or authz.is_crew_member(e.a_crew_id, p_viewer)
            or authz.is_crew_member(e.b_crew_id, p_viewer)
            or (e.audience = 'friends' and exists (
                  select 1 from public.challenge_competitors c
                  where c.event_id = e.id and authz.connected(c.user_id, p_viewer)))
          )
        )
      )
  );
$$;

-- A call-out is seen by its challenger, its target (the person, or members of the crews involved),
-- and, when it is open, by anyone its audience allows. Never across a block with the challenger.
create or replace function authz.can_see_call_out(p_call_out uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and exists (
    select 1 from public.call_outs o
    where o.id = p_call_out
      and (
        o.challenger_id = p_viewer
        or (
          not authz.is_blocked(o.challenger_id, p_viewer)
          and (
            o.opponent_id = p_viewer
            or authz.is_crew_member(o.challenger_crew_id, p_viewer)
            or authz.is_crew_member(o.opponent_crew_id, p_viewer)
            or (o.event_id is not null and authz.can_see_challenge_event(o.event_id, p_viewer))
            or (
              o.opponent_id is null and o.opponent_crew_id is null
              and (o.audience = 'public' or (o.audience = 'friends' and authz.connected(o.challenger_id, p_viewer)))
            )
          )
        )
      )
  );
$$;

-- Notifications: a Call-Out ('challenge') and a Challenge Event are objects too.
create or replace function authz.can_see_object(
  p_kind public.notification_object, p_id uuid, p_viewer uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and case p_kind
    when 'plan' then authz.can_see_plan(p_id, p_viewer)
    when 'activity' then authz.can_see_activity(p_id, p_viewer)
    when 'crew' then authz.is_crew_member(p_id, p_viewer)
    when 'challenge' then authz.can_see_call_out(p_id, p_viewer)
    when 'challenge_event' then authz.can_see_challenge_event(p_id, p_viewer)
    else false
  end;
$$;

revoke all on all functions in schema authz from public, anon;
grant execute on all functions in schema authz to authenticated, service_role;

-- RLS ---------------------------------------------------------------------------------------------------

alter table public.rivalries enable row level security;
alter table public.call_outs enable row level security;
alter table public.challenge_events enable row level security;
alter table public.challenge_competitors enable row level security;
alter table public.challenge_organizers enable row level security;
alter table public.challenge_followers enable row level security;
alter table public.challenge_predictions enable row level security;
alter table public.challenge_backings enable row level security;
alter table public.challenge_posts enable row level security;
alter table public.challenge_comments enable row level security;
alter table public.challenge_comment_respects enable row level security;
alter table public.challenge_reactions enable row level security;
alter table public.challenge_polls enable row level security;
alter table public.challenge_poll_votes enable row level security;
alter table public.challenge_result_submissions enable row level security;
alter table public.challenge_result_confirmations enable row level security;
alter table public.challenge_corrections enable row level security;
alter table public.challenge_results enable row level security;

revoke all on public.rivalries, public.call_outs, public.challenge_events, public.challenge_competitors,
  public.challenge_organizers, public.challenge_followers, public.challenge_predictions,
  public.challenge_backings, public.challenge_posts, public.challenge_comments,
  public.challenge_comment_respects, public.challenge_reactions, public.challenge_polls,
  public.challenge_poll_votes, public.challenge_result_submissions, public.challenge_result_confirmations,
  public.challenge_corrections, public.challenge_results
  from anon, authenticated;
grant select on public.rivalries, public.call_outs, public.challenge_events, public.challenge_competitors,
  public.challenge_organizers, public.challenge_followers, public.challenge_predictions,
  public.challenge_backings, public.challenge_posts, public.challenge_comments,
  public.challenge_comment_respects, public.challenge_reactions, public.challenge_polls,
  public.challenge_poll_votes, public.challenge_result_submissions, public.challenge_result_confirmations,
  public.challenge_corrections, public.challenge_results
  to authenticated;

-- A rivalry is visible when one of its events is.
create policy "rivalries: a visible event" on public.rivalries
  for select to authenticated using (
    exists (select 1 from public.challenge_events e
            where e.rivalry_id = rivalries.id and authz.can_see_challenge_event(e.id, (select auth.uid())))
  );
create policy "call_outs: challenger, target, or open to you" on public.call_outs
  for select to authenticated using (authz.can_see_call_out(id, (select auth.uid())));
create policy "challenge_events: by audience" on public.challenge_events
  for select to authenticated using (authz.can_see_challenge_event(id, (select auth.uid())));
-- Who competes is public to the event's audience; check-in and ready times only to competitors.
create policy "challenge_competitors: visible event" on public.challenge_competitors
  for select to authenticated using (authz.can_see_challenge_event(event_id, (select auth.uid())));
create policy "challenge_organizers: visible event" on public.challenge_organizers
  for select to authenticated using (authz.can_see_challenge_event(event_id, (select auth.uid())));
-- Who follows, predicts, backs, cheers and votes is never listed: own rows only, counts elsewhere.
create policy "challenge_followers: own" on public.challenge_followers
  for select to authenticated using (user_id = (select auth.uid()));
create policy "challenge_predictions: own" on public.challenge_predictions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "challenge_backings: own" on public.challenge_backings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "challenge_comment_respects: own" on public.challenge_comment_respects
  for select to authenticated using (user_id = (select auth.uid()));
create policy "challenge_reactions: own" on public.challenge_reactions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "challenge_poll_votes: own" on public.challenge_poll_votes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "challenge_posts: visible event, minus blocked authors" on public.challenge_posts
  for select to authenticated using (
    authz.can_see_challenge_event(event_id, (select auth.uid()))
    and (author_id is null or not authz.is_blocked(author_id, (select auth.uid())))
  );
create policy "challenge_comments: visible event, minus blocked authors" on public.challenge_comments
  for select to authenticated using (
    authz.can_see_challenge_event(event_id, (select auth.uid()))
    and not authz.is_blocked(author_id, (select auth.uid()))
  );
create policy "challenge_polls: visible event" on public.challenge_polls
  for select to authenticated using (authz.can_see_challenge_event(event_id, (select auth.uid())));
-- Submitted values are NOT FINAL: competitors and organizers only. Spectators see VERIFYING.
create policy "challenge_result_submissions: competitors and organizers" on public.challenge_result_submissions
  for select to authenticated using (
    authz.is_challenge_competitor(event_id, (select auth.uid()))
    or authz.is_challenge_organizer(event_id, (select auth.uid()))
  );
create policy "challenge_result_confirmations: competitors and organizers" on public.challenge_result_confirmations
  for select to authenticated using (
    exists (select 1 from public.challenge_result_submissions s
            where s.id = submission_id
              and (authz.is_challenge_competitor(s.event_id, (select auth.uid()))
                   or authz.is_challenge_organizer(s.event_id, (select auth.uid()))))
  );
create policy "challenge_corrections: competitors and organizers" on public.challenge_corrections
  for select to authenticated using (
    authz.is_challenge_competitor(event_id, (select auth.uid()))
    or authz.is_challenge_organizer(event_id, (select auth.uid()))
  );
create policy "challenge_results: visible event" on public.challenge_results
  for select to authenticated using (authz.can_see_challenge_event(event_id, (select auth.uid())));
