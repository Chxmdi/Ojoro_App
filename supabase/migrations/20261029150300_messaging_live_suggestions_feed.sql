-- Step 4 (Messaging and feed, PRD M5): sending chat messages, Make This a Game, Live, and the action
-- feed. Contract: docs/MESSAGING_CONTRACT.md.
--
-- What this adds:
--   1. send_message() (idempotent, rate-limited, mentions → notifications) and report() on messages
--      and live updates.
--   2. Make This a Game (PRD §9.11): a rules-based detector over recent crew messages writes a
--      suggestion row (sport, proposed times, place candidates, who seemed interested). Nothing is
--      created until someone taps: make_this_a_game() makes a crew plan with a time poll;
--      dismiss_suggestion() hides it for you. Message words are read, never copied or logged.
--   3. Live (PRD §9.8): the score (log_score), an updates feed (system posts + post_update), word
--      reactions (one per person per post), followers (never presence or location), and
--      activity_live() for the freshness line.
--   4. home_feed(): the finite action feed (PRD §9.18). Safety and visibility filters run before
--      ranking; it ends with a stopping cue.

-- Live ------------------------------------------------------------------------------------------------

create type public.update_kind as enum ('kick_off', 'score', 'check_in', 'full_time', 'post');
create type public.update_audience as enum ('everyone', 'participants');
-- ReactionBar words: LET'S GO, RESPECT, HOLD THAT, RUN IT BACK. Words only, never a score or money.
create type public.reaction_word as enum ('lets_go', 'respect', 'hold_that', 'run_it_back');

-- One row per activity once anything live happens. Realtime: freshness, score, followers, reactions.
create table public.activity_live (
  activity_id uuid primary key references public.activities (id) on delete cascade,
  team_a_score integer check (team_a_score between 0 and 99),
  team_b_score integer check (team_b_score between 0 and 99),
  score_logged_by uuid references public.profiles (id) on delete set null,
  score_updated_at timestamptz,
  -- Latest change of any kind (score, post): the "Updated 20 s ago" line.
  last_update_at timestamptz,
  follower_count integer not null default 0 check (follower_count >= 0),
  -- Game-level reactions (the bar under "… IS FOLLOWING"): {"lets_go": 9, "respect": 4}.
  reaction_counts jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  check ((team_a_score is null) = (team_b_score is null))
);

create table public.activity_updates (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  -- Null for Ojoro's own posts (kick-off, score, check-in, full time).
  author_id uuid references public.profiles (id) on delete cascade,
  kind public.update_kind not null,
  -- check_in posts are for people in the game only: followers never see presence.
  audience public.update_audience not null default 'everyone',
  body text check (char_length(body) between 1 and 280),
  team_a_score integer,
  team_b_score integer,
  reaction_counts jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  check ((deleted_at is null) = (body is not null)),
  check (kind <> 'check_in' or audience = 'participants'),
  check ((kind = 'post') = (author_id is not null) or kind = 'score')
);
create index activity_updates_activity_idx on public.activity_updates (activity_id, created_at desc, id desc);
create unique index activity_updates_kick_off_idx on public.activity_updates (activity_id) where kind = 'kick_off';
create unique index activity_updates_full_time_idx on public.activity_updates (activity_id) where kind = 'full_time';

create table public.activity_reactions (
  activity_id uuid not null references public.activities (id) on delete cascade,
  -- Null = a reaction to the game itself.
  update_id uuid references public.activity_updates (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction public.reaction_word not null,
  created_at timestamptz not null default now()
);
-- One reaction per person per post (and per game).
create unique index activity_reactions_one_idx on public.activity_reactions
  (activity_id, (coalesce(update_id, '00000000-0000-0000-0000-000000000000'::uuid)), user_id);

create table public.activity_followers (
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);
create index activity_followers_user_idx on public.activity_followers (user_id);

create trigger set_updated_at before update on public.activity_live
  for each row execute function private.set_updated_at();

-- Make This a Game ----------------------------------------------------------------------------------

create type public.suggestion_status as enum ('open', 'accepted', 'expired');

-- Derived facts only: no message words, no message ids beyond the last one looked at.
create table public.chat_suggestions (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  sport_id text not null references public.sports (id),
  -- "Saturday morning": the day and part of day the chat settled on (local to the crew).
  day_label text not null check (char_length(day_label) <= 40),
  day_key text not null check (char_length(day_key) <= 40),
  proposed_times timestamptz[] not null default '{}',
  place_ids uuid[] not null default '{}',
  -- Crew members who spoke about it (never anyone outside the crew).
  interested_ids uuid[] not null default '{}',
  status public.suggestion_status not null default 'open',
  plan_id uuid references public.plans (id) on delete set null,
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  last_message_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (cardinality(proposed_times) <= 4)
);
create unique index chat_suggestions_open_idx on public.chat_suggestions (crew_id) where status = 'open';

create table public.chat_suggestion_dismissals (
  suggestion_id uuid not null references public.chat_suggestions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (suggestion_id, user_id)
);

create trigger set_updated_at before update on public.chat_suggestions
  for each row execute function private.set_updated_at();

create type public.make_game_state as (
  plan_id uuid,
  suggestion_id uuid,
  crew_id uuid,
  created boolean,
  starts_at timestamptz,
  time_option_count integer,
  message_id uuid
);

create type public.reaction_state as (
  activity_id uuid,
  update_id uuid,
  reaction_counts jsonb,
  my_reaction public.reaction_word
);

-- RLS -------------------------------------------------------------------------------------------------

alter table public.activity_live enable row level security;
alter table public.activity_updates enable row level security;
alter table public.activity_reactions enable row level security;
alter table public.activity_followers enable row level security;
alter table public.chat_suggestions enable row level security;
alter table public.chat_suggestion_dismissals enable row level security;

revoke all on public.activity_live, public.activity_updates, public.activity_reactions,
  public.activity_followers, public.chat_suggestions, public.chat_suggestion_dismissals from anon, authenticated;
grant select on public.activity_live, public.activity_updates, public.activity_reactions,
  public.activity_followers, public.chat_suggestions, public.chat_suggestion_dismissals to authenticated;

create policy "activity_live: visible activity" on public.activity_live
  for select to authenticated using (authz.can_see_activity(activity_id, (select auth.uid())));
create policy "activity_updates: visible activity, presence for participants, minus blocked" on public.activity_updates
  for select to authenticated using (
    authz.can_see_activity(activity_id, (select auth.uid()))
    and (audience = 'everyone' or authz.is_participant(activity_id, (select auth.uid())))
    and (author_id is null or author_id = (select auth.uid()) or not authz.is_blocked(author_id, (select auth.uid())))
  );
-- Who reacted and who follows aren't listed to anyone; only counts are shared.
create policy "activity_reactions: own" on public.activity_reactions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "activity_followers: own" on public.activity_followers
  for select to authenticated using (user_id = (select auth.uid()));
create policy "chat_suggestions: crew members" on public.chat_suggestions
  for select to authenticated using (authz.is_crew_member(crew_id, (select auth.uid())));
create policy "chat_suggestion_dismissals: own" on public.chat_suggestion_dismissals
  for select to authenticated using (user_id = (select auth.uid()));

-- Live helpers ------------------------------------------------------------------------------------------

create or replace function private.ensure_live(p_activity uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_live (activity_id) values (p_activity) on conflict (activity_id) do nothing;
$$;

-- "LIGHTS LEAD 3–2." / "LEVEL 2–2."
create or replace function private.score_line(p_a text, p_b text, p_sa integer, p_sb integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_sa = p_sb then 'LEVEL ' || p_sa || '–' || p_sb || '.'
    when p_sa > p_sb then upper(coalesce(p_a, 'Team A')) || ' LEAD ' || p_sa || '–' || p_sb || '.'
    else upper(coalesce(p_b, 'Team B')) || ' LEAD ' || p_sb || '–' || p_sa || '.'
  end;
$$;

-- Who may log the live score: the host always; checked-in players too when the game is self-run
-- (attendance_rule = 'check_in'). With "Host confirms" only the host keeps score.
create or replace function private.can_log_score(p_a public.activities, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_a.host_id = p_uid or (p_a.attendance_rule = 'check_in' and authz.is_player(p_a.id, p_uid));
$$;

-- Freshness: any new update moves last_update_at.
create or replace function private.on_activity_update_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_live(new.activity_id);
  if new.audience = 'everyone' then
    update public.activity_live set last_update_at = greatest(coalesce(last_update_at, new.created_at), new.created_at)
     where activity_id = new.activity_id;
  end if;
  return null;
end;
$$;

create trigger live_update_created after insert on public.activity_updates
  for each row execute function private.on_activity_update_created();

-- Activities: kick-off and full-time posts, LIVE to followers, changes and cancellation to the people
-- in the game.
create or replace function private.on_activity_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live public.activity_live%rowtype;
  v_team boolean;
begin
  if new.status = 'live' and old.status = 'confirmed' then
    select s.team_based into v_team from public.sports s where s.id = new.sport_id;
    insert into public.activity_updates (activity_id, kind, body, created_at)
    values (new.id, 'kick_off', case when v_team then 'KICK-OFF.' else 'UNDER WAY.' end, coalesce(new.live_at, now()))
    on conflict do nothing;
    perform private.notify(
      (select coalesce(array_agg(f.user_id), '{}') from public.activity_followers f where f.activity_id = new.id),
      'live', 'activity', new.id, null, 'live:' || new.id, '{}', p_activity => new.id, p_plan => new.plan_id);
  end if;

  if new.status = 'after' and old.status in ('confirmed', 'live') then
    select * into v_live from public.activity_live where activity_id = new.id;
    insert into public.activity_updates (activity_id, kind, body, team_a_score, team_b_score, created_at)
    values (new.id, 'full_time',
            case when v_live.team_a_score is null then 'FULL TIME.'
                 else 'FULL TIME. ' || upper(coalesce(new.team_a_label, 'Team A')) || ' ' || v_live.team_a_score || '–'
                      || v_live.team_b_score || ' ' || upper(coalesce(new.team_b_label, 'Team B')) || '.' end,
            v_live.team_a_score, v_live.team_b_score, coalesce(new.ended_at, now()))
    on conflict do nothing;
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    perform private.notify(
      (select coalesce(array_agg(t.user_id), '{}') from public.attendance t
        where t.activity_id = new.id and t.status in ('confirmed', 'checked_in', 'waitlisted')),
      'activity_changed', 'activity', new.id, auth.uid(), 'changed:' || new.id,
      jsonb_build_object('change', 'cancelled'), p_activity => new.id, p_plan => new.plan_id);
  elsif new.status <> 'cancelled'
        and (new.starts_at is distinct from old.starts_at or new.place_id is distinct from old.place_id) then
    perform private.notify(
      (select coalesce(array_agg(t.user_id), '{}') from public.attendance t
        where t.activity_id = new.id and t.status in ('confirmed', 'checked_in', 'waitlisted')),
      'activity_changed', 'activity', new.id, auth.uid(), 'changed:' || new.id,
      jsonb_build_object('change', case when new.starts_at is distinct from old.starts_at then 'time' else 'place' end),
      p_activity => new.id, p_plan => new.plan_id);
  end if;
  return null;
end;
$$;

create trigger live_activity_changed after update on public.activities
  for each row
  when (old.status is distinct from new.status or old.starts_at is distinct from new.starts_at
        or old.place_id is distinct from new.place_id)
  execute function private.on_activity_changed();

-- Check-ins appear in the feed for people in the game only.
create or replace function private.on_checked_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_count integer;
  v_cap integer;
begin
  select pr.display_name into v_name from public.profiles pr where pr.id = new.user_id;
  select a.checked_in_count, a.capacity into v_count, v_cap from public.activities a where a.id = new.activity_id;
  insert into public.activity_updates (activity_id, kind, audience, body, created_at)
  values (new.activity_id, 'check_in', 'participants',
          left(coalesce(v_name, 'Someone') || ' checked in.', 280), coalesce(new.checked_in_at, now()));
  return null;
end;
$$;

create trigger live_checked_in after update of status on public.attendance
  for each row when (new.status = 'checked_in' and old.status is distinct from 'checked_in')
  execute function private.on_checked_in();

-- Live RPCs ---------------------------------------------------------------------------------------------

-- The host (or a player in a self-run game) logs the live score. Idempotent per value: the same score
-- again changes nothing and posts nothing. Scores 0–99.
create or replace function public.log_score(p_activity_id uuid, p_team_a integer, p_team_b integer)
returns public.activity_live
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_a public.activities%rowtype;
  v_live public.activity_live%rowtype;
begin
  select * into v_a from public.activities where id = p_activity_id;
  if not found or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  if not private.can_log_score(v_a, v_uid) then
    perform private.fail('not_scorekeeper');
  end if;
  if private.activity_status_now(v_a) <> 'live' then
    perform private.fail('activity_not_live');
  end if;
  if p_team_a is null or p_team_b is null or p_team_a not between 0 and 99 or p_team_b not between 0 and 99 then
    perform private.fail('invalid_argument', 'score');
  end if;

  perform private.ensure_live(p_activity_id);
  select * into v_live from public.activity_live where activity_id = p_activity_id for update;
  if v_live.team_a_score is not distinct from p_team_a and v_live.team_b_score is not distinct from p_team_b then
    return v_live;
  end if;
  update public.activity_live
     set team_a_score = p_team_a, team_b_score = p_team_b, score_logged_by = v_uid, score_updated_at = now()
   where activity_id = p_activity_id;
  insert into public.activity_updates (activity_id, author_id, kind, body, team_a_score, team_b_score)
  values (p_activity_id, v_uid, 'score',
          private.score_line(v_a.team_a_label, v_a.team_b_label, p_team_a, p_team_b), p_team_a, p_team_b);
  perform private.emit('score_logged', v_uid, jsonb_build_object('activity_id', p_activity_id));
  select * into v_live from public.activity_live where activity_id = p_activity_id;
  return v_live;
end;
$$;

-- A short update from the host or someone in the game ("GOAL · MARCUS."), while it's live.
-- Idempotent with the key. 6 a minute.
create or replace function public.post_update(p_activity_id uuid, p_body text, p_idempotency_key uuid)
returns public.activity_updates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_a public.activities%rowtype;
  v_u public.activity_updates%rowtype;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'post_update:' || p_activity_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.activity_updates, v_prior);
  end if;
  select * into v_a from public.activities where id = p_activity_id;
  if not found or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  if not authz.is_participant(p_activity_id, v_uid) then
    perform private.fail('not_attending');
  end if;
  if private.activity_status_now(v_a) <> 'live' then
    perform private.fail('activity_not_live');
  end if;
  if p_body is null or char_length(trim(p_body)) not between 1 and 280 then
    perform private.fail('message_invalid', '1-280');
  end if;
  if (select count(*) from public.activity_updates u
      where u.author_id = v_uid and u.kind = 'post' and u.created_at > now() - interval '1 minute') >= 6 then
    perform private.fail('message_rate_limited', '6');
  end if;
  insert into public.activity_updates (activity_id, author_id, kind, body)
  values (p_activity_id, v_uid, 'post', trim(p_body))
  returning * into v_u;
  perform private.emit('live_update_posted', v_uid, jsonb_build_object('activity_id', p_activity_id));
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_u));
  return v_u;
end;
$$;

-- The author or the host removes a post (soft). System posts stay. Idempotent.
create or replace function public.delete_update(p_update_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_u public.activity_updates%rowtype;
begin
  select * into v_u from public.activity_updates where id = p_update_id for update;
  if not found or not authz.can_see_activity(v_u.activity_id, v_uid) then
    perform private.fail('update_not_found');
  end if;
  if v_u.deleted_at is not null then
    return true;
  end if;
  if v_u.kind <> 'post' or (v_u.author_id <> v_uid
     and not exists (select 1 from public.activities a where a.id = v_u.activity_id and a.host_id = v_uid)) then
    perform private.fail('not_author');
  end if;
  update public.activity_updates set body = null, deleted_at = now() where id = p_update_id;
  return true;
end;
$$;

create or replace function private.reaction_counts(p_activity uuid, p_update uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(x.reaction, x.n), '{}')
  from (select r.reaction, count(*)::integer as n
          from public.activity_reactions r
         where r.activity_id = p_activity and r.update_id is not distinct from p_update
         group by r.reaction) x;
$$;

-- React with a word. One reaction per person per post (p_update_id) or for the game (null). The
-- same word again takes it back; another word replaces it. Live and After only.
create or replace function public.react(
  p_activity_id uuid, p_reaction public.reaction_word, p_update_id uuid default null
)
returns public.reaction_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_a public.activities%rowtype;
  v_cur public.reaction_word;
  v_counts jsonb;
  v_mine public.reaction_word;
begin
  select * into v_a from public.activities where id = p_activity_id;
  if not found or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  if p_reaction is null then
    perform private.fail('invalid_argument', 'reaction');
  end if;
  if private.activity_status_now(v_a) not in ('live', 'after') then
    perform private.fail('activity_not_live');
  end if;
  if p_update_id is not null and not exists (
       select 1 from public.activity_updates u
       where u.id = p_update_id and u.activity_id = p_activity_id and u.deleted_at is null
         and (u.audience = 'everyone' or authz.is_participant(p_activity_id, v_uid))
         and (u.author_id is null or not authz.is_blocked(u.author_id, v_uid))) then
    perform private.fail('update_not_found');
  end if;

  perform private.ensure_live(p_activity_id);
  -- Serialize reactions on one target so counts stay exact.
  perform pg_advisory_xact_lock(hashtext('ojoro_react:' || p_activity_id || ':' || coalesce(p_update_id::text, 'game')));
  select r.reaction into v_cur from public.activity_reactions r
   where r.activity_id = p_activity_id and r.update_id is not distinct from p_update_id and r.user_id = v_uid;
  if v_cur = p_reaction then
    delete from public.activity_reactions r
     where r.activity_id = p_activity_id and r.update_id is not distinct from p_update_id and r.user_id = v_uid;
    v_mine := null;
  elsif v_cur is not null then
    update public.activity_reactions r set reaction = p_reaction, created_at = now()
     where r.activity_id = p_activity_id and r.update_id is not distinct from p_update_id and r.user_id = v_uid;
    v_mine := p_reaction;
  else
    insert into public.activity_reactions (activity_id, update_id, user_id, reaction)
    values (p_activity_id, p_update_id, v_uid, p_reaction);
    v_mine := p_reaction;
  end if;

  v_counts := private.reaction_counts(p_activity_id, p_update_id);
  if p_update_id is null then
    update public.activity_live set reaction_counts = v_counts where activity_id = p_activity_id;
  else
    update public.activity_updates set reaction_counts = v_counts where id = p_update_id;
  end if;
  return row(p_activity_id, p_update_id, v_counts, v_mine)::public.reaction_state;
end;
$$;

-- Follow a game you can see (spectators). Followers get LIVE and see the score and updates; never
-- who has arrived, who's checked in, or anyone's location. Idempotent.
create or replace function public.follow_activity(p_activity_id uuid)
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
  if not found or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  if private.activity_status_now(v_a) = 'cancelled' then
    perform private.fail('activity_cancelled');
  end if;
  if private.activity_status_now(v_a) = 'complete' then
    perform private.fail('activity_not_live');
  end if;
  perform private.ensure_live(p_activity_id);
  perform 1 from public.activity_live where activity_id = p_activity_id for update;
  insert into public.activity_followers (activity_id, user_id) values (p_activity_id, v_uid) on conflict do nothing;
  if found then
    update public.activity_live set follower_count = follower_count + 1 where activity_id = p_activity_id;
    perform private.emit('activity_followed', v_uid, jsonb_build_object('activity_id', p_activity_id));
  end if;
  return true;
end;
$$;

create or replace function public.unfollow_activity(p_activity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform 1 from public.activity_live where activity_id = p_activity_id for update;
  delete from public.activity_followers where activity_id = p_activity_id and user_id = v_uid;
  if found then
    update public.activity_live set follower_count = greatest(follower_count - 1, 0) where activity_id = p_activity_id;
  end if;
  return false;
end;
$$;

-- Everything LiveActivity needs except the feed. server_now lets the app run the clock from live_at
-- and say "Updated 20 s ago" from last_update_at without trusting the device clock.
create or replace function public.activity_live(p_activity_id uuid)
returns table (
  activity_id uuid,
  effective_status public.activity_status,
  starts_at timestamptz,
  live_at timestamptz,
  ends_at timestamptz,
  ended_at timestamptz,
  server_now timestamptz,
  sport_id text,
  place_name text,
  team_a_label text,
  team_b_label text,
  team_a_score integer,
  team_b_score integer,
  score_logged_by uuid,
  score_logged_by_name text,
  score_logged_by_host boolean,
  score_updated_at timestamptz,
  last_update_at timestamptz,
  follower_count integer,
  i_follow boolean,
  crew_following text,
  playing_count integer,
  is_host boolean,
  can_log_score boolean,
  can_post boolean,
  reaction_counts jsonb,
  my_reaction public.reaction_word
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_a public.activities%rowtype;
begin
  select * into v_a from public.activities where id = p_activity_id;
  if not found or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  return query
  select v_a.id,
         private.activity_status_now(v_a),
         v_a.starts_at,
         coalesce(v_a.live_at, case when v_a.starts_at <= now() then v_a.starts_at end),
         v_a.ends_at,
         v_a.ended_at,
         now(),
         v_a.sport_id,
         (select pl.name from public.places pl where pl.id = v_a.place_id),
         v_a.team_a_label,
         v_a.team_b_label,
         l.team_a_score,
         l.team_b_score,
         case when l.score_logged_by is not null and not authz.is_blocked(l.score_logged_by, v_uid) then l.score_logged_by end,
         case when l.score_logged_by is not null and not authz.is_blocked(l.score_logged_by, v_uid)
              then (select pr.display_name from public.profiles pr where pr.id = l.score_logged_by) end,
         l.score_logged_by = v_a.host_id,
         l.score_updated_at,
         coalesce(l.last_update_at, l.score_updated_at),
         coalesce(l.follower_count, 0),
         exists (select 1 from public.activity_followers f where f.activity_id = v_a.id and f.user_id = v_uid),
         -- "THURSDAY FC IS FOLLOWING": one of your crews with at least 2 members following.
         (select c.name from public.crews c
            join public.crew_members cm on cm.crew_id = c.id
            join public.activity_followers f on f.user_id = cm.user_id and f.activity_id = v_a.id
           where c.archived_at is null and authz.is_crew_member(c.id, v_uid)
           group by c.id, c.name having count(*) >= 2
           order by count(*) desc, c.name limit 1),
         v_a.checked_in_count,
         v_a.host_id = v_uid,
         private.can_log_score(v_a, v_uid),
         authz.is_participant(v_a.id, v_uid),
         coalesce(l.reaction_counts, '{}'),
         (select r.reaction from public.activity_reactions r
           where r.activity_id = v_a.id and r.update_id is null and r.user_id = v_uid)
  from (select 1) one
  left join public.activity_live l on l.activity_id = v_a.id;
end;
$$;

-- The updates feed, newest first, before p_before (exclusive).
create or replace function public.activity_updates_feed(
  p_activity_id uuid, p_before uuid default null, p_limit integer default 30
)
returns table (
  id uuid,
  kind public.update_kind,
  author_id uuid,
  author_name text,
  author_avatar_path text,
  author_is_host boolean,
  body text,
  team_a_score integer,
  team_b_score integer,
  reaction_counts jsonb,
  my_reaction public.reaction_word,
  is_deleted boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_host uuid;
  v_participant boolean;
begin
  select a.host_id into v_host from public.activities a where a.id = p_activity_id;
  if v_host is null or not authz.can_see_activity(p_activity_id, v_uid) then
    perform private.fail('activity_not_found');
  end if;
  v_participant := authz.is_participant(p_activity_id, v_uid);
  return query
  select u.id, u.kind, u.author_id, pr.display_name, pr.avatar_path, u.author_id = v_host, u.body,
         u.team_a_score, u.team_b_score, u.reaction_counts,
         (select r.reaction from public.activity_reactions r where r.update_id = u.id and r.user_id = v_uid),
         u.deleted_at is not null, u.created_at
  from public.activity_updates u
  left join public.profiles pr on pr.id = u.author_id
  where u.activity_id = p_activity_id
    and (u.audience = 'everyone' or v_participant)
    and (u.author_id is null or u.author_id = v_uid or not authz.is_blocked(u.author_id, v_uid))
    and (p_before is null or (u.created_at, u.id) < (select b.created_at, b.id from public.activity_updates b where b.id = p_before))
  order by u.created_at desc, u.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

-- Make This a Game: detection ----------------------------------------------------------------------

-- Sport words (rules, not AI). First match in the newest message that names a sport wins.
create or replace function private.sport_words()
returns table (sport_id text, pattern text)
language sql
immutable
set search_path = ''
as $$
  values
    ('beach_volleyball', '\mbeach ?volley'),
    ('football', '\m(football|soccer|footy|futbol|five a side|5 a side|5-a-side|kickabout|pickup)\M'),
    ('running', '\m(run|running|jog|jogging|5k|10k|parkrun)\M'),
    ('boxing', '\m(boxing|sparring|spar|pads)\M'),
    ('basketball', '\m(basketball|hoops|bball)\M'),
    ('volleyball', '\m(volleyball|volley)\M'),
    ('tennis', '\m(tennis|doubles|rally)\M'),
    ('climbing', '\m(climb|climbing|bouldering)\M'),
    ('cycling', '\m(cycling|bike|biking|ride|cycle)\M')
$$;

-- Read the crew's recent chat and keep one open suggestion up to date. Signals: a sport (or the
-- crew's usual sport), a day ("tonight", "tomorrow", "thursday", "this weekend"), optional part of
-- day and hours ("7", "7:30", "8pm", "before 11"), and at least 2 members showing interest ("in",
-- "same", "who's in", "works"…). Looks at the last 20 messages of the last 6 hours. Stores only the
-- derived facts. Returns the open suggestion id (or null).
create or replace function private.detect_suggestion(p_crew uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew public.crews%rowtype;
  v_tz text;
  v_msgs record;
  v_texts text[] := '{}'::text[];
  v_senders uuid[] := '{}'::uuid[];
  v_last uuid;
  v_all text;
  v_sport text;
  v_day text;
  v_part text;
  v_hours numeric[] := '{}'::numeric[];
  v_before numeric;
  v_m text[];
  v_h numeric;
  v_date date;
  v_today date;
  v_dow integer;
  v_times timestamptz[] := '{}'::timestamptz[];
  v_interested uuid[] := '{}'::uuid[];
  v_places uuid[];
  v_day_key text;
  v_label text;
  v_open public.chat_suggestions%rowtype;
  v_id uuid;
  c_days constant text := '\m(tonight|today|tomorrow|tmrw|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\M';
  c_interest constant text := '\m(in|i''m in|im in|down|same|me too|count me|works|yes|yep|yeah|let''s|lets|who''s in|whos in|anyone|up for|keen)\M';
begin
  select * into v_crew from public.crews where id = p_crew and archived_at is null;
  if not found then
    return null;
  end if;
  v_tz := v_crew.time_zone;
  v_today := (now() at time zone v_tz)::date;

  -- Oldest first. Text only, live members only, words never leave this function.
  for v_msgs in
    select x.id, x.sender_id, private.fold(x.body) as t
    from (select m.id, m.sender_id, m.body, m.created_at from public.messages m
           where m.crew_id = p_crew and m.kind = 'text' and m.deleted_at is null
             and m.created_at > now() - interval '6 hours'
             and exists (select 1 from public.crew_members cm where cm.crew_id = p_crew and cm.user_id = m.sender_id)
           order by m.created_at desc, m.id desc limit 20) x
    order by x.created_at, x.id
  loop
    v_texts := v_texts || v_msgs.t;
    v_senders := v_senders || v_msgs.sender_id;
    v_last := v_msgs.id;
  end loop;
  if cardinality(v_texts) < 2 then
    return null;
  end if;
  v_all := array_to_string(v_texts, ' ');

  -- Sport: the newest message naming one; else the crew's usual sport.
  for v_i in reverse cardinality(v_texts) .. 1 loop
    select w.sport_id into v_sport from private.sport_words() w where v_texts[v_i] ~ w.pattern limit 1;
    exit when v_sport is not null;
  end loop;
  v_sport := coalesce(v_sport, v_crew.sport_id);

  -- Day: the newest message naming a day; within it, the last day named ("Thursday's a washout…
  -- Saturday instead?" → Saturday).
  for v_i in reverse cardinality(v_texts) .. 1 loop
    select (array_agg(m[1]))[count(*)] into v_day from regexp_matches(v_texts[v_i], c_days, 'g') m;
    if v_day is not null then
      exit;
    end if;
  end loop;
  if v_sport is null or v_day is null then
    return null;
  end if;

  -- Part of day: the newest message with one.
  for v_i in reverse cardinality(v_texts) .. 1 loop
    v_part := substring(v_texts[v_i] from '\m(morning|afternoon|evening|night|tonight)\M');
    exit when v_part is not null;
  end loop;
  if v_day = 'tonight' then
    v_part := 'evening';
  end if;
  if v_part in ('night', 'tonight') then
    v_part := 'evening';
  end if;

  -- Hours: "before 11", "at 7", "7:30", "8pm", "thursday 7".
  v_before := (select max(m[1]::numeric) from regexp_matches(v_all, '\mbefore (\d{1,2})\M', 'g') m);
  for v_m in select m from regexp_matches(v_all,
      '(?:\m(?:at|around|from|for|by|tonight|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun) ?@? ?(\d{1,2})(?::(\d{2}))? ?(am|pm)?\M)|(?:\m(\d{1,2}):(\d{2}) ?(am|pm)?)|(?:\m(\d{1,2}) ?(am|pm)\M)', 'g') m
  loop
    v_h := coalesce(v_m[1], v_m[4], v_m[7])::numeric;
    if v_h is null or v_h > 23 then
      continue;
    end if;
    v_h := v_h + coalesce(coalesce(v_m[2], v_m[5])::numeric, 0) / 60;
    if coalesce(v_m[3], v_m[6], v_m[8]) = 'pm' and v_h < 12 then
      v_h := v_h + 12;
    elsif coalesce(v_m[3], v_m[6], v_m[8]) is null and v_h < 12 then
      if v_part in ('evening', 'afternoon') or (v_part is null and v_h < 9) then
        v_h := v_h + 12;
      end if;
    end if;
    v_hours := v_hours || v_h;
  end loop;
  if cardinality(v_hours) = 0 then
    if v_before is not null then
      if v_part in ('evening', 'afternoon') and v_before < 12 then
        v_before := v_before + 12;
      end if;
      v_hours := array[v_before - 2, v_before - 1, v_before - 0.5];
    else
      v_hours := case v_part when 'morning' then array[9, 10, 11]::numeric[]
                             when 'afternoon' then array[13, 14, 15]::numeric[]
                             else array[18.5, 19, 19.5]::numeric[] end;
    end if;
  end if;
  v_part := coalesce(v_part, case when (select min(h) from unnest(v_hours) h) < 12 then 'morning'
                                  when (select min(h) from unnest(v_hours) h) < 17 then 'afternoon'
                                  else 'evening' end);

  -- The date in the crew's time zone.
  v_dow := case v_day
    when 'monday' then 1 when 'mon' then 1 when 'tuesday' then 2 when 'tue' then 2 when 'tues' then 2
    when 'wednesday' then 3 when 'wed' then 3 when 'thursday' then 4 when 'thu' then 4 when 'thur' then 4
    when 'thurs' then 4 when 'friday' then 5 when 'fri' then 5 when 'saturday' then 6 when 'sat' then 6
    when 'weekend' then 6 when 'sunday' then 7 when 'sun' then 7 end;
  v_date := case
    when v_day in ('today', 'tonight') then v_today
    when v_day in ('tomorrow', 'tmrw') then v_today + 1
    else v_today + ((v_dow - extract(isodow from v_today)::integer + 7) % 7)
  end;
  select coalesce(array_agg(t order by t), '{}') into v_times
  from (select distinct ((v_date + make_interval(mins => (h * 60)::integer))::timestamp at time zone v_tz) as t
          from unnest(v_hours) h where h >= 0 and h < 24) x
  where t > now() + interval '75 minutes';
  -- A weekday that's today but already past means next week.
  if cardinality(v_times) = 0 and v_dow is not null and v_date = v_today then
    v_date := v_date + 7;
    select coalesce(array_agg(t order by t), '{}') into v_times
    from (select distinct ((v_date + make_interval(mins => (h * 60)::integer))::timestamp at time zone v_tz) as t
            from unnest(v_hours) h where h >= 0 and h < 24) x;
  end if;
  v_times := v_times[1:4];
  if cardinality(v_times) = 0 then
    return null;
  end if;

  -- Interest: members whose message shows planning (a sport, a day, a time, or "in"/"same"/…).
  select coalesce(array_agg(distinct s), '{}') into v_interested
  from unnest(v_texts, v_senders) as x(t, s)
  where t ~ c_interest or t ~ c_days or exists (select 1 from private.sport_words() w where w.sport_id = v_sport and t ~ w.pattern);
  if cardinality(v_interested) < 2 then
    return null;
  end if;

  -- Places named in the chat, in the order first named. Key: the first distinctive word of the name
  -- ("Jeanne-Mance", "Indoor", "La Fontaine").
  select coalesce(array_agg(x.id order by x.pos), '{}') into v_places
  from (
    select pl.id, position(k.key in v_all) as pos
    from public.places pl
    cross join lateral (
      select case when char_length(split_part(n, ' ', 1)) < 4 then split_part(n, ' ', 1) || ' ' || split_part(n, ' ', 2)
                  else split_part(n, ' ', 1) end as key
      from (select regexp_replace(private.fold(pl.name), '^(parc|park|the|le|la place) ', '') as n) q
    ) k
    where char_length(k.key) >= 4 and position(k.key in v_all) > 0
  ) x;

  v_day_key := v_sport || ':' || v_date || ':' || v_part;
  v_label := trim(to_char(v_date, 'FMDay')) || ' ' || v_part;
  if v_date = v_today and v_part = 'evening' then
    v_label := 'tonight';
  elsif v_date = v_today + 1 then
    v_label := 'tomorrow ' || v_part;
  end if;

  select * into v_open from public.chat_suggestions s where s.crew_id = p_crew and s.status = 'open' for update;
  if found and (v_open.day_key <> v_day_key or v_open.expires_at <= now()) then
    update public.chat_suggestions set status = 'expired' where id = v_open.id;
    v_open := null;
  end if;

  if v_open.id is not null then
    update public.chat_suggestions
       set proposed_times = v_times, place_ids = v_places,
           interested_ids = (select coalesce(array_agg(distinct u), '{}') from unnest(v_open.interested_ids || v_interested) u),
           last_message_id = v_last, day_label = v_label,
           expires_at = least(now() + interval '12 hours', v_times[cardinality(v_times)] - interval '75 minutes')
     where id = v_open.id;
    v_id := v_open.id;
  else
    -- An accepted suggestion for the same thing already became a plan: don't offer it again.
    if exists (select 1 from public.chat_suggestions s
               where s.crew_id = p_crew and s.day_key = v_day_key and s.status = 'accepted') then
      return null;
    end if;
    insert into public.chat_suggestions (crew_id, sport_id, day_label, day_key, proposed_times, place_ids,
                                         interested_ids, last_message_id, expires_at)
    values (p_crew, v_sport, v_label, v_day_key, v_times, v_places, v_interested, v_last,
            least(now() + interval '12 hours', v_times[cardinality(v_times)] - interval '75 minutes'))
    returning id into v_id;
    -- Facts only: never the words.
    perform private.emit('chat_suggestion_created', null,
      jsonb_build_object('crew_id', p_crew, 'sport_id', v_sport, 'interested', cardinality(v_interested)));
  end if;
  return v_id;
end;
$$;

-- Open suggestions in a crew (not dismissed by you), and ones accepted in the last day (so the chat
-- can show the plan). Runs detection first (cheap), so it's VOLATILE: call it with POST.
create or replace function public.chat_suggestions(p_crew_id uuid)
returns table (
  id uuid,
  crew_id uuid,
  status public.suggestion_status,
  sport_id text,
  sport_name text,
  day_label text,
  proposed_times timestamptz[],
  place_ids uuid[],
  place_names text[],
  interested_ids uuid[],
  interested_names text[],
  interested_count integer,
  member_count integer,
  free_count integer,
  plan_id uuid,
  accepted_by uuid,
  accepted_by_name text,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not authz.is_crew_member(p_crew_id, v_uid) then
    perform private.fail('crew_not_found');
  end if;
  perform private.detect_suggestion(p_crew_id);
  return query
  select s.id, s.crew_id, case when s.status = 'open' and s.expires_at <= now() then 'expired'::public.suggestion_status else s.status end,
         s.sport_id, sp.name, s.day_label, s.proposed_times, s.place_ids,
         (select coalesce(array_agg(pl.name order by o), '{}') from unnest(s.place_ids) with ordinality as x(pid, o)
            join public.places pl on pl.id = x.pid),
         vis.ids, vis.names, cardinality(s.interested_ids),
         c.member_count,
         -- "9 of 14 are free Saturday between 9 and 11": overlap only, and only people whose
         -- availability setting includes you.
         (select count(*)::integer from public.crew_members cm
            join public.profiles pr on pr.id = cm.user_id
           where cm.crew_id = s.crew_id
             and (cm.user_id = v_uid or (not authz.is_blocked(cm.user_id, v_uid)
                                          and authz.can_see_part(cm.user_id, 'availability', v_uid)))
             and exists (select 1 from public.availability_slots a
                         where a.user_id = cm.user_id
                           and a.day_of_week = extract(isodow from s.proposed_times[1] at time zone c.time_zone)
                           and a.part = private.day_part_of(s.proposed_times[1], c.time_zone))),
         s.plan_id, s.accepted_by,
         case when s.accepted_by is not null and not authz.is_blocked(s.accepted_by, v_uid)
              then (select pr.display_name from public.profiles pr where pr.id = s.accepted_by) end,
         s.accepted_at, s.expires_at, s.created_at, s.updated_at
  from public.chat_suggestions s
  join public.sports sp on sp.id = s.sport_id
  join public.crews c on c.id = s.crew_id
  cross join lateral (
    select coalesce(array_agg(pr.id order by pr.display_name), '{}') as ids,
           coalesce(array_agg(pr.display_name order by pr.display_name), '{}') as names
    from unnest(s.interested_ids) u
    join public.profiles pr on pr.id = u
    where u = v_uid or not authz.is_blocked(u, v_uid)
  ) vis
  where s.crew_id = p_crew_id
    and ((s.status = 'open' and s.expires_at > now()
          and not exists (select 1 from public.chat_suggestion_dismissals d where d.suggestion_id = s.id and d.user_id = v_uid))
         or (s.status = 'accepted' and s.accepted_at > now() - interval '24 hours'))
  order by s.updated_at desc;
end;
$$;

-- NOT NOW: hides the suggestion for you. Others still see it. Idempotent.
create or replace function public.dismiss_suggestion(p_suggestion_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_crew uuid;
begin
  select s.crew_id into v_crew from public.chat_suggestions s where s.id = p_suggestion_id;
  if v_crew is null or not authz.is_crew_member(v_crew, v_uid) then
    perform private.fail('suggestion_not_found');
  end if;
  insert into public.chat_suggestion_dismissals (suggestion_id, user_id) values (p_suggestion_id, v_uid)
  on conflict do nothing;
  if found then
    perform private.emit('chat_suggestion_dismissed', v_uid, jsonb_build_object('crew_id', v_crew));
  end if;
  return true;
end;
$$;

-- MAKE THIS A GAME: a crew plan (audience 'crew') from a suggestion, with a time poll when there is
-- more than one time. The tapper hosts and is in; everyone else in the crew is told and taps
-- I'M DOWN themselves (nobody is committed silently). A second tap by anyone returns the same plan
-- (created = false). Times default to the suggestion's; the first is the plan's start.
create or replace function public.make_this_a_game(
  p_suggestion_id uuid,
  p_time_options timestamptz[] default null,
  p_place_id uuid default null,
  p_capacity integer default null,
  p_idempotency_key uuid default null,
  p_poll_closes_at timestamptz default null
)
returns public.make_game_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_s public.chat_suggestions%rowtype;
  v_times timestamptz[];
  v_plan public.plan_state;
  v_msg uuid;
  v_name text;
  v_state public.make_game_state;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'make_this_a_game:' || p_suggestion_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.make_game_state, v_prior);
  end if;

  select * into v_s from public.chat_suggestions where id = p_suggestion_id for update;
  if not found or not authz.is_crew_member(v_s.crew_id, v_uid) then
    perform private.fail('suggestion_not_found');
  end if;

  if v_s.status = 'accepted' and v_s.plan_id is not null then
    v_state := row(v_s.plan_id, v_s.id, v_s.crew_id, false,
                   (select p.starts_at from public.plans p where p.id = v_s.plan_id),
                   (select count(*)::integer from public.plan_time_options o where o.plan_id = v_s.plan_id),
                   null)::public.make_game_state;
    perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
    return v_state;
  end if;
  if v_s.status <> 'open' or v_s.expires_at <= now() then
    perform private.fail('suggestion_expired');
  end if;

  select coalesce(array_agg(distinct t order by t), '{}') into v_times
  from unnest(coalesce(p_time_options, v_s.proposed_times)) t where t is not null;
  if cardinality(v_times) = 0 or cardinality(v_times) > 4 then
    perform private.fail('time_options_invalid');
  end if;

  -- Same rules as Quick create (create_plan), then the plan becomes the crew's.
  v_plan := public.create_plan(
    p_idempotency_key => md5(p_idempotency_key::text || ':make_this_a_game')::uuid,
    p_sport_id => v_s.sport_id,
    p_starts_at => v_times[1],
    p_capacity => coalesce(p_capacity, (select sp.default_capacity from public.sports sp where sp.id = v_s.sport_id)),
    p_place_id => p_place_id,
    p_time_options => case when cardinality(v_times) > 1 then v_times[2:] end,
    p_poll_closes_at => case when cardinality(v_times) > 1 then p_poll_closes_at end
  );
  update public.plans set audience = 'crew', crew_id = v_s.crew_id, source = 'chat' where id = v_plan.plan_id;
  update public.chat_suggestions
     set status = 'accepted', plan_id = v_plan.plan_id, accepted_by = v_uid, accepted_at = now()
   where id = v_s.id;

  -- "2:20 PM · Lena tapped MAKE THIS A GAME" in the chat.
  select pr.display_name into v_name from public.profiles pr where pr.id = v_uid;
  insert into public.messages (crew_id, sender_id, kind, body, payload)
  values (v_s.crew_id, v_uid, 'system', left(coalesce(v_name, 'Someone') || ' tapped MAKE THIS A GAME', 1000),
          jsonb_build_object('event', 'make_this_a_game', 'plan_id', v_plan.plan_id, 'suggestion_id', v_s.id))
  returning id into v_msg;

  perform private.notify(
    (select coalesce(array_agg(cm.user_id), '{}') from public.crew_members cm where cm.crew_id = v_s.crew_id),
    case when cardinality(v_times) > 1 then 'crew_poll'::public.notification_type else 'crew_plan'::public.notification_type end,
    'plan', v_plan.plan_id, v_uid, 'crew_plan:' || v_plan.plan_id, '{}',
    p_plan => v_plan.plan_id, p_crew => v_s.crew_id);

  perform private.emit('make_this_a_game', v_uid,
    jsonb_build_object('crew_id', v_s.crew_id, 'plan_id', v_plan.plan_id, 'sport_id', v_s.sport_id,
                       'time_options', cardinality(v_times), 'place_set', p_place_id is not null));

  v_state := row(v_plan.plan_id, v_s.id, v_s.crew_id, true, v_times[1], cardinality(v_times), v_msg)::public.make_game_state;
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;

-- Chat: sending ------------------------------------------------------------------------------------------

-- Send to a crew chat (p_crew_id) or an activity chat (p_activity_id). Idempotent with the key.
-- 20 messages a minute. Mentions: @handle in the body and/or p_mention_ids; only people in the
-- thread, never across a block. A crew message also refreshes Make This a Game.
create or replace function public.send_message(
  p_idempotency_key uuid,
  p_body text,
  p_crew_id uuid default null,
  p_activity_id uuid default null,
  p_reply_to uuid default null,
  p_mention_ids uuid[] default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_a public.activities%rowtype;
  v_body text := trim(coalesce(p_body, ''));
  v_mentions uuid[];
  v_m public.messages%rowtype;
begin
  if (p_crew_id is null) = (p_activity_id is null) then
    perform private.fail('invalid_argument', 'p_crew_id or p_activity_id');
  end if;
  v_prior := private.idem_claim(v_uid, p_idempotency_key,
    'send_message:' || coalesce(p_crew_id, p_activity_id));
  if v_prior is not null then
    return jsonb_populate_record(null::public.messages, v_prior);
  end if;

  if p_crew_id is not null then
    if not authz.is_crew_member(p_crew_id, v_uid) then
      perform private.fail('crew_not_found');
    end if;
  else
    select * into v_a from public.activities where id = p_activity_id;
    if not found or not authz.can_see_activity(p_activity_id, v_uid) then
      perform private.fail('activity_not_found');
    end if;
    if not authz.is_participant(p_activity_id, v_uid) then
      perform private.fail('not_attending');
    end if;
    if private.activity_status_now(v_a) in ('complete', 'cancelled') then
      perform private.fail('chat_closed');
    end if;
  end if;

  if char_length(v_body) not between 1 and 1000 then
    perform private.fail('message_invalid', '1-1000');
  end if;
  if (select count(*) from public.messages m
      where m.sender_id = v_uid and m.kind = 'text' and m.created_at > now() - interval '1 minute') >= 20 then
    perform private.fail('message_rate_limited', '20');
  end if;
  if p_reply_to is not null and not exists (
       select 1 from public.messages r
       where r.id = p_reply_to and r.crew_id is not distinct from p_crew_id
         and r.activity_id is not distinct from p_activity_id) then
    perform private.fail('message_not_found');
  end if;

  select coalesce(array_agg(distinct u), '{}') into v_mentions
  from (
    select pr.id as u from public.profiles pr
    where pr.handle in (select lower(m[1]) from regexp_matches(v_body, '@([A-Za-z0-9_]{2,24})', 'g') m)
    union
    select x from unnest(coalesce(p_mention_ids, '{}')) x
  ) c
  where u <> v_uid
    and authz.can_read_thread(p_crew_id, p_activity_id, u)
    and not authz.is_blocked(u, v_uid);
  v_mentions := v_mentions[1:10];

  insert into public.messages (crew_id, activity_id, sender_id, kind, body, reply_to, mention_ids)
  values (p_crew_id, p_activity_id, v_uid, 'text', v_body, p_reply_to, v_mentions)
  returning * into v_m;

  if cardinality(v_mentions) > 0 then
    if p_crew_id is not null then
      perform private.notify(v_mentions, 'mention', 'crew', p_crew_id, v_uid, 'mention:' || p_crew_id, '{}',
        p_crew => p_crew_id, p_message => v_m.id);
    else
      perform private.notify(v_mentions, 'mention', 'activity', p_activity_id, v_uid, 'mention:' || p_activity_id, '{}',
        p_activity => p_activity_id, p_plan => v_a.plan_id, p_message => v_m.id);
    end if;
  end if;

  if p_crew_id is not null then
    perform private.detect_suggestion(p_crew_id);
  end if;

  -- No words, no recipients: just that a message was sent and where.
  perform private.emit('message_sent', v_uid,
    jsonb_build_object('thread', case when p_crew_id is not null then 'crew' else 'activity' end,
                       'mentions', cardinality(v_mentions), 'reply', p_reply_to is not null));
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_m));
  return v_m;
end;
$$;

-- Report: now also messages and live updates (PRD §11.1) ------------------------------------------------

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
    -- Only a message you can read (or wrote) can be reported.
    when 'message' then exists (select 1 from public.messages m where m.id = p_subject_id
                                  and (m.sender_id = v_uid or authz.can_read_thread(m.crew_id, m.activity_id, v_uid)))
    when 'update' then exists (select 1 from public.activity_updates u where u.id = p_subject_id
                                 and authz.can_see_activity(u.activity_id, v_uid))
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

-- Home: the finite action feed (PRD §9.18) ----------------------------------------------------------

-- Cards, best first. Every source is filtered for safety and visibility before anything is ranked
-- (blocks either way, plan and crew visibility, nothing you can't join). At most 12 cards, then
-- always a 'caught_up' card: the stopping cue.
--   card: needs_you | your_plan | crew_suggestion | crew_plan | plan_forming | down_for | recap | caught_up
--   action: im_down | pull_in | vote | check_in | confirm_result | reply | make_this_a_game |
--           down_for (create_down_for) | run_it_back | open | none
create or replace function public.home_feed()
returns table (
  "position" integer,
  card text,
  action text,
  object_kind text,
  object_id uuid,
  plan_id uuid,
  activity_id uuid,
  crew_id uuid,
  sport_id text,
  sport_name text,
  title text,
  reason text,
  starts_at timestamptz,
  place_name text,
  member_count integer,
  capacity integer,
  people integer,
  notification_id uuid,
  href text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_radius integer;
begin
  select pp.discovery_radius_km into v_radius from public.profile_private pp where pp.user_id = v_uid;
  return query
  with
  -- 1. Things that need you (already filtered by visibility and blocks in notification_feed).
  needs as (
    select 'needs_you'::text as card, f.action as act, f.object_kind::text as okind, f.object_id as oid,
           f.plan_id as pid, f.activity_id as aid, f.crew_id as cid, null::text as sid,
           f.title as ttl, f.body as why, null::timestamptz as st, null::text as plname,
           null::integer as cnt, null::integer as cap, null::integer as ppl, f.id as nid, f.href as link,
           1000 - least(extract(epoch from now() - f.updated_at) / 3600, 99)::integer as score
    from private.notification_feed(v_uid) f
    where f.needs_you
  ),
  -- 2. Your plans and games in the next 48 hours (forming or on, not finished).
  mine as (
    select 'your_plan', case when private.plan_status_now(p) = 'forming' and p.capacity - p.member_count = 1 then 'pull_in'
                             else 'open' end,
           'plan', p.id, p.id, a.id, p.crew_id, p.sport_id,
           coalesce(p.title, s.name),
           case when private.plan_status_now(p) = 'forming' then p.member_count || ' / ' || p.capacity || ' in'
                when private.activity_status_now(a) = 'live' then 'LIVE' else 'GAME ON' end,
           coalesce(a.starts_at, p.starts_at), pl.name, p.member_count, p.capacity, null::integer, null::uuid,
           case when a.id is not null and private.activity_status_now(a) = 'live' then '/activity/' || a.id || '/live'
                when a.id is not null then '/activity/' || a.id else '/plan/' || p.id end,
           case when coalesce(a.starts_at, p.starts_at) <= now() + interval '24 hours' then 900 else 600 end
    from public.plan_members m
    join public.plans p on p.id = m.plan_id
    join public.sports s on s.id = p.sport_id
    left join public.places pl on pl.id = p.place_id
    left join public.activities a on a.plan_id = p.id
    where m.user_id = v_uid
      and (private.plan_status_now(p) = 'forming'
           or (p.status = 'game_on' and a.id is not null and private.activity_status_now(a) in ('confirmed', 'live')
               and exists (select 1 from public.attendance t where t.activity_id = a.id and t.user_id = v_uid
                           and t.status in ('confirmed', 'checked_in'))))
      and coalesce(a.starts_at, p.starts_at) <= now() + interval '48 hours'
  ),
  -- 3. Crew opportunities: open suggestions and forming crew plans you're not in.
  crew_sugg as (
    select 'crew_suggestion', 'make_this_a_game', 'crew', s.crew_id, null::uuid, null::uuid, s.crew_id, s.sport_id,
           c.name || ': ' || lower(sp.name) || ' ' || s.day_label || '?',
           cardinality(s.interested_ids) || ' of you want in',
           s.proposed_times[1], null::text, null::integer, null::integer, cardinality(s.interested_ids), null::uuid,
           '/crew/' || s.crew_id || '/chat', 800
    from public.chat_suggestions s
    join public.crews c on c.id = s.crew_id
    join public.sports sp on sp.id = s.sport_id
    where s.status = 'open' and s.expires_at > now()
      and authz.is_crew_member(s.crew_id, v_uid)
      and not exists (select 1 from public.chat_suggestion_dismissals d where d.suggestion_id = s.id and d.user_id = v_uid)
  ),
  crew_plans as (
    select 'crew_plan', 'im_down', 'plan', p.id, p.id, null::uuid, p.crew_id, p.sport_id,
           c.name || ' · ' || coalesce(p.title, sp.name), p.member_count || ' / ' || p.capacity || ' in',
           p.starts_at, pl.name, p.member_count, p.capacity, null::integer, null::uuid, '/plan/' || p.id,
           750
    from public.plans p
    join public.crews c on c.id = p.crew_id
    join public.sports sp on sp.id = p.sport_id
    left join public.places pl on pl.id = p.place_id
    where p.audience = 'crew' and private.plan_status_now(p) = 'forming' and p.member_count < p.capacity
      and p.starts_at > now()
      and authz.is_crew_member(p.crew_id, v_uid)
      and not exists (select 1 from public.plan_members m
                      where m.plan_id = p.id and (m.user_id = v_uid or authz.is_blocked(m.user_id, v_uid)))
  ),
  -- 4. Plans forming near you that you can join (visibility and blocks filtered in opportunities()).
  forming as (
    select 'plan_forming', 'im_down', 'plan', o.plan_id, o.plan_id, null::uuid, null::uuid, o.sport_id,
           coalesce(o.title, o.sport_name), o.reason, o.starts_at, o.place_name, o.member_count, o.capacity,
           null::integer, null::uuid, '/plan/' || o.plan_id,
           case when o.spots_left = 1 then 700 else 500 end
             - least(extract(epoch from o.starts_at - now()) / 3600, 168)::integer
    from private.opportunities(v_uid, now() + interval '7 days', null, coalesce(v_radius, 3)::numeric, false, null) o
    where o.kind = 'plan'
  ),
  -- 5. Down For: the sport most people near you are down for (none if you're already down for it).
  downs as (
    select 'down_for', 'down_for', 'sport', null::uuid, null::uuid, null::uuid, null::uuid, d.sport_id,
           sp.name, count(*) || case when count(*) = 1 then ' person near you is down' else ' people near you are down' end,
           min(d.window_start), null::text, null::integer, null::integer, count(*)::integer, null::uuid, null::text,
           650
    from public.down_for_nearby(null, 100) d
    join public.sports sp on sp.id = d.sport_id
    where auth.uid() = v_uid
      and not exists (select 1 from public.intent_signals i
                      where i.user_id = v_uid and i.sport_id = d.sport_id and i.status = 'active' and i.expires_at > now())
    group by d.sport_id, sp.name
    order by count(*) desc, d.sport_id
    limit 1
  ),
  -- 6. Your latest recap (last 7 days).
  recap as (
    select 'recap', case when private.activity_status_now(a) in ('after', 'complete') then 'run_it_back' else 'open' end,
           'activity', a.id, a.plan_id, a.id, null::uuid, a.sport_id,
           coalesce(a.title, sp.name),
           r.played_count || ' played · ' || r.duration_minutes || ' min',
           r.occurred_at, pl.name, null::integer, null::integer, r.played_count, null::uuid,
           '/activity/' || a.id || '/recap', 300
    from public.recaps r
    join public.activities a on a.id = r.activity_id
    join public.sports sp on sp.id = a.sport_id
    left join public.places pl on pl.id = a.place_id
    where authz.is_player(a.id, v_uid) and r.occurred_at > now() - interval '7 days'
    order by r.occurred_at desc
    limit 1
  ),
  candidates as (
    select * from needs
    union all select * from mine
    union all select * from crew_sugg
    union all select * from crew_plans
    union all select * from forming
    union all select * from downs
    union all select * from recap
  ),
  -- One card per object: the best one.
  deduped as (
    select distinct on (coalesce(x.pid, x.oid, x.nid)) x.*
    from candidates x
    order by coalesce(x.pid, x.oid, x.nid), x.score desc
  ),
  ranked as (
    select d.*, row_number() over (order by d.score desc, d.st nulls last, d.oid)::integer as pos
    from deduped d
  )
  select r.pos, r.card, r.act, r.okind, r.oid, r.pid, r.aid, r.cid, r.sid,
         (select sp.name from public.sports sp where sp.id = r.sid), r.ttl, r.why, r.st, r.plname, r.cnt, r.cap,
         r.ppl, r.nid, r.link
  from ranked r where r.pos <= 12
  union all
  select (select least(count(*), 12)::integer + 1 from ranked), 'caught_up', 'none', null, null, null, null, null,
         null, null, 'YOU''RE CAUGHT UP.', 'Go do something.', null, null, null, null, null, null, null
  order by 1;
end;
$$;

-- Realtime ----------------------------------------------------------------------------------------------
-- postgres_changes respects RLS. Channels and filters: docs/MESSAGING_CONTRACT.md §Realtime.

alter publication supabase_realtime add table
  public.notifications,
  public.messages,
  public.crew_members,
  public.chat_suggestions,
  public.activity_live,
  public.activity_updates;

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
