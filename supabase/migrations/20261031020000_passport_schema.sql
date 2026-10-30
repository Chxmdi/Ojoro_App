-- Step 7 (Places & Passport, PRD M8): Passport detail, Challenge stamps and personal bests, goals.
-- PRD §9.17 (Passport, Goals, Achievements and Reputation), §9.1 (goals visibility is configurable on
-- its own). Contract: docs/PASSPORT_CONTRACT.md. Judgment calls: docs/DESIGN_DECISIONS.md
-- ("Step 7 BE-PASSPORT").
--
-- This file: enums, the Passport entry extension for Challenge results, personal bests (insert-only),
-- goals (one active per person), goals visibility, RLS, the result trigger and the backfill of results
-- that were already complete.

-- Enums -----------------------------------------------------------------------------------------------

-- A stamp from a game (Slice 01 recap) or from a complete Challenge Event (Step 5 result).
create type public.passport_entry_kind as enum ('game', 'challenge');
-- personal_best: beat a time / reach a distance in one discipline ("Sub-22 5K by December").
-- sessions: N sessions (optionally in one sport) from when the goal was set.
-- places: N places you have never moved at before, from when the goal was set.
create type public.goal_kind as enum ('personal_best', 'sessions', 'places');
create type public.goal_status as enum ('active', 'replaced', 'cleared');

-- Passport entries: Challenge stamps --------------------------------------------------------------------

alter table public.passport_entries
  add column kind public.passport_entry_kind not null default 'game',
  add column challenge_event_id uuid references public.challenge_events (id) on delete cascade,
  -- Snapshot of the result at the time it was recorded. A stamp is never rewritten.
  add column challenge_title text,
  add column challenge_scoring public.challenge_scoring,
  add column challenge_unit text,
  add column challenge_side public.team_side,
  add column challenge_value numeric(10, 2),
  add column challenge_outcome text check (challenge_outcome in ('won', 'lost', 'draw'));

alter table public.passport_entries alter column activity_id drop not null;
alter table public.passport_entries
  add constraint passport_entries_kind_source check (
    (kind = 'game' and activity_id is not null and challenge_event_id is null)
    or (kind = 'challenge' and challenge_event_id is not null and activity_id is null
        and challenge_title is not null and challenge_scoring is not null and challenge_outcome is not null)
  ),
  -- Once per result per person.
  add constraint passport_entries_user_challenge_key unique (user_id, challenge_event_id);
create index passport_entries_user_time_idx on public.passport_entries (user_id, occurred_at desc);
create index passport_entries_user_sport_idx on public.passport_entries (user_id, sport_id);

comment on column public.passport_entries.kind is
  'game: a checked-in Slice 01 activity (activity_id). challenge: a complete Challenge Event (challenge_event_id).';
comment on column public.passport_entries.sport_game_number is
  'Ordinal at creation: games in this sport for a game stamp, Challenges in this sport for a challenge stamp.';

-- Personal bests ----------------------------------------------------------------------------------------

-- A row each time someone beats their own best in one discipline (sport + title + scoring). The current
-- best is the latest row. Insert-only: a personal best is never rewritten (PRD §20.2), not even when a
-- later result is better (that adds a new row).
create table public.personal_bests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  sport_id text not null references public.sports (id),
  -- Upper-cased Challenge title ("5K", "10K").
  discipline text not null check (char_length(discipline) between 1 and 24),
  -- time: lower is better (seconds). distance: higher is better (in `unit`).
  scoring public.challenge_scoring not null check (scoring in ('time', 'distance')),
  unit text,
  value numeric(10, 2) not null check (value > 0),
  -- The best before this one; null = the first result in this discipline ("FIRST 10K").
  previous_value numeric(10, 2),
  passport_entry_id uuid not null references public.passport_entries (id) on delete cascade,
  challenge_event_id uuid not null references public.challenge_events (id) on delete cascade,
  set_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, challenge_event_id)
);
create index personal_bests_user_discipline_idx
  on public.personal_bests (user_id, sport_id, discipline, scoring, set_at desc);
comment on table public.personal_bests is
  'Personal bests from verified Challenge results. Insert-only; the current best is the latest row per discipline.';

create or replace function private.personal_bests_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Cascades (an account or a seed's sample event going away) may remove rows; nothing else may.
  if tg_op = 'DELETE' and (pg_trigger_depth() > 1 or current_setting('ojoro.seed_reset', true) = 'on') then
    return old;
  end if;
  raise exception using errcode = 'P0001', message = 'result_already_verified',
    detail = 'personal bests are final';
end;
$$;

create trigger personal_bests_immutable before update or delete on public.personal_bests
  for each row execute function private.personal_bests_immutable();

-- Goals -------------------------------------------------------------------------------------------------

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.goal_kind not null,
  sport_id text references public.sports (id),
  discipline text check (char_length(discipline) between 1 and 24),
  scoring public.challenge_scoring check (scoring in ('time', 'distance')),
  -- personal_best: seconds (time) or the unit (distance); sessions / places: a count.
  target_value numeric(10, 2) not null check (target_value > 0),
  -- "by December": the last day, in the owner's time zone. Optional.
  target_date date,
  status public.goal_status not null default 'active',
  -- Set once, when progress first reaches the target (by the Passport triggers).
  achieved_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'personal_best' or (sport_id is not null and discipline is not null and scoring is not null)),
  check (kind = 'personal_best' or (discipline is null and scoring is null)),
  check ((status = 'active') = (ended_at is null))
);
-- One active goal at a time.
create unique index goals_one_active_idx on public.goals (user_id) where status = 'active';
create index goals_user_idx on public.goals (user_id, created_at desc);
comment on table public.goals is
  'Goals (PRD §9.17). One active per person. Write through set_goal / clear_goal; progress is computed.';

create trigger set_updated_at before update on public.goals
  for each row execute function private.set_updated_at();

-- Goals visibility (PRD §9.1: history, goals and availability are configured independently) -------------

alter table public.privacy_settings
  add column goals_visibility public.visibility not null default 'friends';
comment on column public.privacy_settings.goals_visibility is
  'Who can see your current goal and its progress.';
grant update (goals_visibility) on public.privacy_settings to authenticated;

-- can_see_part learns 'goals'. Same rules as before for the other parts.
create or replace function authz.can_see_part(p_owner uuid, p_part text, p_viewer uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vis public.visibility;
begin
  if p_viewer is null then
    return false;
  end if;
  if p_owner = p_viewer then
    return true;
  end if;
  if authz.is_blocked(p_owner, p_viewer) then
    return false;
  end if;
  select case p_part
           when 'sports' then s.sports_visibility
           when 'history' then s.history_visibility
           when 'availability' then s.availability_visibility
           when 'goals' then s.goals_visibility
         end
    into v_vis
  from public.privacy_settings s
  where s.user_id = p_owner;
  return case coalesce(v_vis, 'only_me')
           when 'everyone' then true
           when 'only_me' then false
           else authz.connected(p_owner, p_viewer)
         end;
end;
$$;

-- RLS ---------------------------------------------------------------------------------------------------

alter table public.personal_bests enable row level security;
alter table public.goals enable row level security;

revoke all on public.personal_bests, public.goals from anon, authenticated;
grant select on public.personal_bests, public.goals to authenticated;

create policy "personal_bests: by history visibility" on public.personal_bests
  for select to authenticated using (authz.can_see_part(user_id, 'history', (select auth.uid())));
create policy "goals: own, or by goals visibility while active" on public.goals
  for select to authenticated using (
    user_id = (select auth.uid())
    or (status = 'active' and authz.can_see_part(user_id, 'goals', (select auth.uid())))
  );

-- Goal progress ------------------------------------------------------------------------------------------

-- The best value so far in one discipline (null = never recorded).
create or replace function private.personal_best_value(
  p_user uuid, p_sport text, p_discipline text, p_scoring public.challenge_scoring
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_scoring = 'time' then min(b.value) else max(b.value) end
  from public.personal_bests b
  where b.user_id = p_user and b.sport_id = p_sport and b.discipline = p_discipline and b.scoring = p_scoring;
$$;

-- Progress of one goal: current value, target, whether it's reached. Computed from the Passport only.
create or replace function private.goal_progress(g public.goals)
returns table (current_value numeric, achieved boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current numeric;
begin
  if g.kind = 'personal_best' then
    v_current := private.personal_best_value(g.user_id, g.sport_id, g.discipline, g.scoring);
    return query select v_current,
      v_current is not null and case when g.scoring = 'time' then v_current <= g.target_value
                                     else v_current >= g.target_value end;
  elsif g.kind = 'sessions' then
    select count(*) into v_current from public.passport_entries e
     where e.user_id = g.user_id and e.occurred_at >= g.created_at
       and (g.sport_id is null or e.sport_id = g.sport_id);
    return query select v_current, v_current >= g.target_value;
  else
    -- New places: first visited after the goal was set.
    select count(*) into v_current from (
      select e.place_id from public.passport_entries e
       where e.user_id = g.user_id and e.place_id is not null
       group by e.place_id
      having min(e.occurred_at) >= g.created_at
    ) x;
    return query select v_current, v_current >= g.target_value;
  end if;
end;
$$;

-- Marks the active goal achieved the first time its progress reaches the target. Called by the Passport
-- triggers and by set_goal (a goal can be reached the moment it's set).
create or replace function private.goal_check(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.goals%rowtype;
  v_achieved boolean;
begin
  select * into g from public.goals x where x.user_id = p_user and x.status = 'active' and x.achieved_at is null
  for update;
  if not found then
    return;
  end if;
  select p.achieved into v_achieved from private.goal_progress(g) p;
  if v_achieved then
    update public.goals set achieved_at = now() where id = g.id;
    perform private.emit('goal_achieved', p_user, jsonb_build_object('goal_id', g.id, 'kind', g.kind,
      'days_to_achieve', floor(extract(epoch from now() - g.created_at) / 86400)));
  end if;
end;
$$;

create or replace function private.passport_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.goal_check(new.user_id);
  return null;
end;
$$;

create trigger passport_entries_goal_check after insert on public.passport_entries
  for each row execute function private.passport_after_insert();
create trigger personal_bests_goal_check after insert on public.personal_bests
  for each row execute function private.passport_after_insert();

-- Challenge results → Passport ----------------------------------------------------------------------------

-- One stamp per competitor per complete Challenge Event; a personal best when a person-vs-person time or
-- distance beats their own best in that discipline. Safe to call again (once per result per person).
create or replace function private.passport_record_challenge(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.challenge_events%rowtype;
  r public.challenge_results%rowtype;
  c record;
  v_entry uuid;
  v_value numeric;
  v_best numeric;
  v_discipline text;
  v_minutes integer;
begin
  select * into e from public.challenge_events where id = p_event;
  select * into r from public.challenge_results where event_id = p_event;
  if e.id is null or r.event_id is null then
    return;
  end if;
  v_discipline := upper(btrim(e.title));
  for c in
    select x.user_id, x.side from public.challenge_competitors x
    where x.event_id = e.id
      -- Person vs person: the two people. Crews: the captains and everyone in the lineup who checked in.
      and (x.is_captain or x.checked_in_at is not null)
    order by x.user_id
  loop
    v_value := case when c.side = 'a' then r.a_value else r.b_value end;
    v_minutes := case
      when e.format = 'person_vs_person' and e.scoring = 'time' and v_value > 0
        then least(480, greatest(1, ceil(v_value / 60)))::integer
      when e.live_at is not null and e.ended_at is not null
        then least(480, greatest(1, round(extract(epoch from e.ended_at - e.live_at) / 60)))::integer
      else 0 end;
    insert into public.passport_entries (user_id, kind, challenge_event_id, sport_id, place_id, occurred_at, minutes,
                                         place_game_number, sport_game_number, challenge_title, challenge_scoring,
                                         challenge_unit, challenge_side, challenge_value, challenge_outcome)
    values (c.user_id, 'challenge', e.id, e.sport_id, e.place_id, coalesce(e.live_at, e.starts_at), v_minutes, null,
            1 + (select count(*) from public.passport_entries x
                  where x.user_id = c.user_id and x.sport_id = e.sport_id and x.kind = 'challenge'),
            e.title, e.scoring, e.unit, c.side, v_value,
            case when r.winner_side is null then 'draw' when r.winner_side = c.side then 'won' else 'lost' end)
    on conflict (user_id, challenge_event_id) do nothing
    returning id into v_entry;
    if v_entry is null then
      continue;
    end if;
    perform private.emit('passport_entry_added', c.user_id, jsonb_build_object(
      'kind', 'challenge', 'event_id', e.id, 'sport_id', e.sport_id));

    if e.format = 'person_vs_person' and e.scoring in ('time', 'distance') and v_value > 0 then
      v_best := private.personal_best_value(c.user_id, e.sport_id, v_discipline, e.scoring);
      if v_best is null or (e.scoring = 'time' and v_value < v_best) or (e.scoring = 'distance' and v_value > v_best) then
        insert into public.personal_bests (user_id, sport_id, discipline, scoring, unit, value, previous_value,
                                           passport_entry_id, challenge_event_id, set_at)
        values (c.user_id, e.sport_id, v_discipline, e.scoring, e.unit, v_value, v_best, v_entry, e.id,
                coalesce(e.live_at, e.starts_at))
        on conflict (user_id, challenge_event_id) do nothing;
        perform private.emit('personal_best_set', c.user_id, jsonb_build_object(
          'event_id', e.id, 'sport_id', e.sport_id, 'discipline', v_discipline, 'first', v_best is null,
          'improvement', case when v_best is null then null else abs(v_best - v_value) end));
      end if;
    end if;
  end loop;
end;
$$;

create or replace function private.challenge_results_to_passport()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.passport_record_challenge(new.event_id);
  return null;
end;
$$;

create trigger challenge_results_to_passport after insert on public.challenge_results
  for each row execute function private.challenge_results_to_passport();

-- Game stamps: ordinals count games only (a Challenge at the same park isn't "a game there"). Same as
-- the Slice 01 definition otherwise.
create or replace function private.ensure_recap(p_activity uuid, p_finalize boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.activities%rowtype;
  v_r public.result_proposals%rowtype;
  v_recap uuid;
begin
  select * into v_a from public.activities where id = p_activity;
  select * into v_r from public.result_proposals r
   where r.activity_id = p_activity and r.status in ('proposed', 'verified');

  insert into public.recaps (activity_id, sport_id, place_id, occurred_at, duration_minutes, team_a_label, team_b_label)
  values (p_activity, v_a.sport_id, v_a.place_id, coalesce(v_a.live_at, v_a.starts_at),
          greatest(1, (extract(epoch from coalesce(v_a.ended_at, v_a.ends_at) - coalesce(v_a.live_at, v_a.starts_at)) / 60)::integer),
          v_a.team_a_label, v_a.team_b_label)
  on conflict (activity_id) do nothing;

  update public.recaps c
     set played_count = v_a.checked_in_count,
         team_a_score = v_r.team_a_score,
         team_b_score = v_r.team_b_score,
         result_proposal_id = v_r.id,
         verification_level = v_r.verification_level,
         confirmed_count = coalesce(v_r.confirmations_count, 0),
         moments_count = (select count(*) from public.moments m where m.activity_id = p_activity),
         finalized_at = case when p_finalize then now() end
   where c.activity_id = p_activity and c.finalized_at is null
  returning c.id into v_recap;

  if v_recap is null then
    select c.id into v_recap from public.recaps c where c.activity_id = p_activity;
  end if;

  -- One durable stamp per player.
  insert into public.passport_entries (user_id, activity_id, sport_id, place_id, occurred_at, minutes,
                                       place_game_number, sport_game_number)
  select t.user_id, p_activity, v_a.sport_id, v_a.place_id, coalesce(v_a.live_at, v_a.starts_at),
         (select c.duration_minutes from public.recaps c where c.id = v_recap),
         case when v_a.place_id is not null then 1 + (select count(*) from public.passport_entries e
                where e.user_id = t.user_id and e.place_id = v_a.place_id and e.kind = 'game') end,
         1 + (select count(*) from public.passport_entries e
               where e.user_id = t.user_id and e.sport_id = v_a.sport_id and e.kind = 'game')
  from public.attendance t
  where t.activity_id = p_activity and t.status = 'checked_in'
  on conflict (user_id, activity_id) do nothing;

  return v_recap;
end;
$$;

revoke all on function private.personal_best_value(uuid, text, text, public.challenge_scoring),
  private.goal_progress(public.goals), private.goal_check(uuid), private.passport_record_challenge(uuid)
  from public, anon, authenticated;

-- Backfill: results that were already complete, oldest first, so personal bests build up in order. ------

do $$
declare
  v_event uuid;
begin
  for v_event in select r.event_id from public.challenge_results r
                 join public.challenge_events e on e.id = r.event_id
                 order by coalesce(e.live_at, e.starts_at), r.verified_at, r.event_id
  loop
    perform private.passport_record_challenge(v_event);
  end loop;
end;
$$;

-- Realtime: a new stamp or personal best (RLS applies) ---------------------------------------------------

alter publication supabase_realtime add table public.passport_entries, public.personal_bests, public.goals;
