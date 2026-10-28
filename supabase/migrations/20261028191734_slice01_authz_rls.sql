-- Slice 01 visibility: who can read what. Writes are closed here and opened only through the
-- functions in `slice01_mutations` (plus a few own-row column updates).
--
-- `authz` holds the helpers that RLS policies call. Policies run as the caller, so the caller needs
-- USAGE on the schema and EXECUTE on the helpers; `private` stays closed to client roles. `authz`
-- is not in [api].schemas, so the Data API never exposes these helpers as RPCs.

create schema if not exists authz;
comment on schema authz is
  'Row-level-security helpers. Callable by authenticated from policies; not exposed by the Data API.';
revoke all on schema authz from public, anon;
grant usage on schema authz to authenticated, service_role;

-- Helpers ---------------------------------------------------------------------------------------------

-- Blocks hide people from each other in both directions.
create or replace function authz.is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- Games two people both have in their Passport (they both checked in to the same activity).
create or replace function authz.games_together(p_a uuid, p_b uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.passport_entries x
  join public.passport_entries y on y.activity_id = x.activity_id
  where x.user_id = p_a and y.user_id = p_b;
$$;

-- "Connected" = have played together at least once. Stands in for Friends and Crews in Slice 01.
create or replace function authz.connected(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.passport_entries x
    join public.passport_entries y on y.activity_id = x.activity_id
    where x.user_id = p_a and y.user_id = p_b
  );
$$;

-- Can p_viewer see one part ('sports' | 'history' | 'availability') of p_owner's profile?
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

-- In the plan: a member, the host, or (after GAME ON) confirmed on its activity.
create or replace function authz.is_plan_member(p_plan uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.plan_members m where m.plan_id = p_plan and m.user_id = p_viewer)
      or exists (select 1 from public.plans p where p.id = p_plan and p.host_id = p_viewer)
      -- After GAME ON, people confirmed from the waitlist are in the game too.
      or exists (
        select 1 from public.activities a
        join public.attendance t on t.activity_id = a.id
        where a.plan_id = p_plan and t.user_id = p_viewer and t.status in ('confirmed', 'checked_in')
      );
$$;

-- Plan visibility by audience. Members and the host always see it; everyone else needs no block with
-- the host and either an open invite or a matching audience.
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
            or exists (
              select 1 from public.plan_invites i
              where i.plan_id = p.id and i.invitee_id = p_viewer and i.status in ('pending', 'accepted')
            )
          )
        )
      )
  );
$$;

-- In the game: confirmed or checked in, or the host.
create or replace function authz.is_participant(p_activity uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.attendance a
    where a.activity_id = p_activity and a.user_id = p_viewer and a.status in ('confirmed', 'checked_in')
  ) or exists (select 1 from public.activities x where x.id = p_activity and x.host_id = p_viewer);
$$;

-- Played: checked in. Players confirm results, add moments and get the Passport stamp.
create or replace function authz.is_player(p_activity uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.attendance a
    where a.activity_id = p_activity and a.user_id = p_viewer and a.status = 'checked_in'
  );
$$;

create or replace function authz.can_see_activity(p_activity uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.attendance a where a.activity_id = p_activity and a.user_id = p_viewer)
      or exists (
        select 1 from public.activities x
        where x.id = p_activity and (x.host_id = p_viewer or authz.can_see_plan(x.plan_id, p_viewer))
      );
$$;

-- Storage path helper: '<activity_id>/<user_id>/<file>' → activity id, or null if malformed.
create or replace function authz.path_activity_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on all functions in schema authz from public, anon;
grant execute on all functions in schema authz to authenticated, service_role;

-- Table privileges ----------------------------------------------------------------------------------
-- Supabase grants everything on new public tables to anon and authenticated by default. Slice 01:
-- anon gets nothing; authenticated can SELECT (rows filtered by RLS) and can write only the columns
-- granted below. Everything else is written by the mutation functions.

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;

grant update (display_name, handle, area, avatar_path) on public.profiles to authenticated;
grant update (sports_visibility, history_visibility, availability_visibility)
  on public.privacy_settings to authenticated;

-- RLS on every table --------------------------------------------------------------------------------

alter table public.sports enable row level security;
alter table public.places enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.privacy_settings enable row level security;
alter table public.user_sports enable row level security;
alter table public.availability_slots enable row level security;
alter table public.pull_me_in enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.intent_signals enable row level security;
alter table public.plans enable row level security;
alter table public.plan_meeting_points enable row level security;
alter table public.plan_time_options enable row level security;
alter table public.plan_time_votes enable row level security;
alter table public.plan_members enable row level security;
alter table public.plan_invites enable row level security;
alter table public.activities enable row level security;
alter table public.attendance enable row level security;
alter table public.location_shares enable row level security;
alter table public.result_proposals enable row level security;
alter table public.result_confirmations enable row level security;
alter table public.moments enable row level security;
alter table public.moment_tags enable row level security;
alter table public.recaps enable row level security;
alter table public.passport_entries enable row level security;
alter table public.reputation_signals enable row level security;

-- Catalog: everyone signed in.
create policy "sports: signed-in read" on public.sports
  for select to authenticated using (true);
create policy "places: signed-in read" on public.places
  for select to authenticated using (true);

-- Profiles: anyone signed in except across a block. Own row editable (granted columns only).
create policy "profiles: read unless blocked" on public.profiles
  for select to authenticated using (not authz.is_blocked(id, (select auth.uid())));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Self-only rows.
create policy "profile_private: own" on public.profile_private
  for select to authenticated using (user_id = (select auth.uid()));
create policy "privacy_settings: own" on public.privacy_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "privacy_settings: update own" on public.privacy_settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Levels are matching-only, so even the sports list is self-only here; others use profile_sports().
create policy "user_sports: own" on public.user_sports
  for select to authenticated using (user_id = (select auth.uid()));
create policy "availability_slots: own" on public.availability_slots
  for select to authenticated using (user_id = (select auth.uid()));
create policy "pull_me_in: own" on public.pull_me_in
  for select to authenticated using (user_id = (select auth.uid()));
create policy "blocks: own" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy "reports: own" on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()));
-- Signals are never readable row by row by anyone else (no location inference); see down_for_nearby().
create policy "intent_signals: own" on public.intent_signals
  for select to authenticated using (user_id = (select auth.uid()));

-- Plans by audience.
create policy "plans: visible by audience" on public.plans
  for select to authenticated using (authz.can_see_plan(id, (select auth.uid())));
create policy "plan_meeting_points: members only" on public.plan_meeting_points
  for select to authenticated using (authz.is_plan_member(plan_id, (select auth.uid())));
create policy "plan_time_options: visible plan" on public.plan_time_options
  for select to authenticated using (authz.can_see_plan(plan_id, (select auth.uid())));
create policy "plan_time_votes: members only" on public.plan_time_votes
  for select to authenticated using (authz.is_plan_member(plan_id, (select auth.uid())));
create policy "plan_members: visible plan, minus blocked people" on public.plan_members
  for select to authenticated using (
    authz.can_see_plan(plan_id, (select auth.uid()))
    and not authz.is_blocked(user_id, (select auth.uid()))
  );
create policy "plan_invites: inviter or invitee" on public.plan_invites
  for select to authenticated using (
    inviter_id = (select auth.uid()) or invitee_id = (select auth.uid())
  );

-- Activities.
create policy "activities: visible plan or attending" on public.activities
  for select to authenticated using (authz.can_see_activity(id, (select auth.uid())));
-- Attendance (presence, arrival times) is for people in the game. Everyone sees their own row.
create policy "attendance: own row or fellow participants" on public.attendance
  for select to authenticated using (
    user_id = (select auth.uid())
    or (
      authz.is_participant(activity_id, (select auth.uid()))
      and not authz.is_blocked(user_id, (select auth.uid()))
    )
  );
-- Live location: participants of that game, only while the share is running.
create policy "location_shares: game participants while active" on public.location_shares
  for select to authenticated using (
    expires_at > now()
    and (
      user_id = (select auth.uid())
      or (
        authz.is_participant(activity_id, (select auth.uid()))
        and not authz.is_blocked(user_id, (select auth.uid()))
      )
    )
  );

create policy "result_proposals: visible activity" on public.result_proposals
  for select to authenticated using (authz.can_see_activity(activity_id, (select auth.uid())));
create policy "result_confirmations: participants" on public.result_confirmations
  for select to authenticated using (
    exists (
      select 1 from public.result_proposals r
      where r.id = proposal_id and authz.is_participant(r.activity_id, (select auth.uid()))
    )
  );

create policy "moments: participants, minus blocked authors" on public.moments
  for select to authenticated using (
    authz.is_participant(activity_id, (select auth.uid()))
    and not authz.is_blocked(author_id, (select auth.uid()))
  );
create policy "moment_tags: participants" on public.moment_tags
  for select to authenticated using (
    exists (
      select 1 from public.moments m
      where m.id = moment_id and authz.is_participant(m.activity_id, (select auth.uid()))
    )
  );

create policy "recaps: visible activity" on public.recaps
  for select to authenticated using (authz.can_see_activity(activity_id, (select auth.uid())));
create policy "passport_entries: by history visibility" on public.passport_entries
  for select to authenticated using (authz.can_see_part(user_id, 'history', (select auth.uid())));
-- Raw endorsements are visible to the giver only; profiles show counts past the threshold.
create policy "reputation_signals: own given" on public.reputation_signals
  for select to authenticated using (giver_id = (select auth.uid()));

-- Read models (security_invoker: RLS of the caller applies) -------------------------------------------

-- Plan card with the place and a status computed from timestamps, so an expired plan reads as
-- expired even if the minute job hasn't run yet.
create view public.plan_cards with (security_invoker = true) as
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
  ) as i_am_in
from public.plans p
join public.sports s on s.id = p.sport_id
left join public.places pl on pl.id = p.place_id;

comment on view public.plan_cards is
  'Plans the caller can see, with place details and effective_status computed from deadline_at.';

create view public.activity_cards with (security_invoker = true) as
select
  a.id,
  a.plan_id,
  a.sport_id,
  s.name as sport_name,
  a.title,
  a.starts_at,
  a.ends_at,
  a.capacity,
  a.confirmed_count,
  a.waitlist_count,
  a.checked_in_count,
  a.host_id,
  a.place_id,
  pl.name as place_name,
  pl.area as place_area,
  pl.surface as place_surface,
  pl.floodlit_until as place_floodlit_until,
  a.level_label,
  a.team_a_label,
  a.team_b_label,
  a.teams_note,
  a.kit_note,
  a.cost_cents,
  a.currency,
  a.attendance_rule,
  a.check_in_opens_at,
  a.check_in_closes_at,
  a.check_in_radius_m,
  a.status,
  case
    when a.status = 'cancelled' then 'cancelled'::public.activity_status
    when a.status = 'complete' or a.after_closes_at <= now() then 'complete'::public.activity_status
    when coalesce(a.ended_at, a.ends_at) <= now() then 'after'::public.activity_status
    when coalesce(a.live_at, a.starts_at) <= now() then 'live'::public.activity_status
    else 'confirmed'::public.activity_status
  end as effective_status,
  a.live_at,
  a.ended_at,
  a.after_closes_at,
  a.cancelled_at,
  (select t.status from public.attendance t
    where t.activity_id = a.id and t.user_id = (select auth.uid())) as my_attendance
from public.activities a
join public.sports s on s.id = a.sport_id
left join public.places pl on pl.id = a.place_id;

comment on view public.activity_cards is
  'Activities the caller can see, with effective_status computed from timestamps.';

grant select on public.plan_cards, public.activity_cards to authenticated;
