-- Step 4 (Messaging and feed, PRD M5): in-app notifications, settings, push tokens and the
-- would-send decision (PRD §9.19). Nothing is sent: real delivery needs the owner's OK (CLAUDE.md
-- "Ask first"). private.would_send() decides what *would* go out; docs/MESSAGING_CONTRACT.md has the
-- Edge Function sketch that would read private.delivery_queue().
--
-- Rules:
--   * Generated server-side, by triggers on the objects (so every path that changes them notifies)
--     and inside the Step 4 RPCs (mentions, Make This a Game).
--   * Never across a block (recipient and actor), never for an object the recipient can't see.
--     Visibility is checked again on every read: a row whose object became hidden disappears.
--   * Bundling: one open (unread, not acted on) row per recipient and bundle key. A repeat event
--     updates that row (count, latest actors, updated_at) instead of adding one.
--   * Copy is built at read time from the objects (so counts are current and nothing private is
--     stored): my_notifications() returns title/body as suggested words plus the facts.

create type public.notification_type as enum (
  'need_one_more',
  'game_on',
  'participant_update',
  'activity_changed',
  'check_in_open',
  'live',
  'result_to_confirm',
  'recap_ready',
  'run_it_back_invite',
  'pull_in_invite',
  'waitlist_promoted',
  'crew_poll',
  'crew_plan',
  'mention',
  'crew_member_joined',
  -- M6 (Challenges). Placeholder: nothing generates it yet.
  'challenge_response'
);
create type public.notification_object as enum ('plan', 'activity', 'crew', 'challenge');
create type public.push_platform as enum ('ios', 'android', 'web');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  -- The canonical object the row deep-links to (PRD §8.2).
  object_kind public.notification_object not null,
  object_id uuid not null,
  -- Related objects for the link and the copy (an activity's plan, a mention's message…).
  plan_id uuid,
  activity_id uuid,
  crew_id uuid,
  message_id uuid,
  -- Latest actors first, at most 5. Empty when Ojoro itself is the actor (GAME ON, check-in).
  actor_ids uuid[] not null default '{}',
  actor_count integer not null default 0 check (actor_count >= 0),
  -- Events merged into this row.
  count integer not null default 1 check (count >= 1),
  bundle_key text not null check (char_length(bundle_key) <= 200),
  -- Event facts only (e.g. {"change": "cancelled"}); never message words or meeting points.
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz,
  acted_at timestamptz,
  -- Set by the delivery layer when it pushes this row (not used until delivery is approved).
  pushed_at timestamptz
);
create unique index notifications_open_bundle_idx on public.notifications (recipient_id, bundle_key)
  where read_at is null and acted_at is null;
create index notifications_recipient_idx on public.notifications (recipient_id, updated_at desc);

-- Push on/off per type. No row = on.
create table public.notification_settings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  push boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

-- Quiet hours and lock-screen privacy. No row = the defaults (Notifications: "Quiet hours 11 PM to
-- 7 AM. Lock-screen previews never show who or where.").
create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  quiet_hours_enabled boolean not null default true,
  quiet_start time not null default '23:00',
  quiet_end time not null default '07:00',
  -- false: pushes say what kind of thing happened, never who, what or where (PRD §9.19).
  show_details boolean not null default false,
  updated_at timestamptz not null default now(),
  check (quiet_start <> quiet_end)
);

-- Mute one plan, activity or crew (granular control by object), forever or until a time.
create table public.notification_mutes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  object_kind public.notification_object not null,
  object_id uuid not null,
  until timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, object_kind, object_id)
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$'),
  platform public.push_platform not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id, last_seen_at desc);

-- One-off marks for time-based notifications (check-in opening), so the minute job sends them once.
create table private.notification_marks (
  object_id uuid not null,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (object_id, kind)
);

create trigger set_updated_at before update on public.notification_preferences
  for each row execute function private.set_updated_at();

alter table public.notifications enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_mutes enable row level security;
alter table public.push_tokens enable row level security;

revoke all on public.notifications, public.notification_settings, public.notification_preferences,
  public.notification_mutes, public.push_tokens from anon, authenticated;
grant select on public.notifications, public.notification_settings, public.notification_preferences,
  public.notification_mutes, public.push_tokens to authenticated;

-- Helpers ---------------------------------------------------------------------------------------------

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
    else false
  end;
$$;
revoke all on function authz.can_see_object(public.notification_object, uuid, uuid) from public, anon;
grant execute on function authz.can_see_object(public.notification_object, uuid, uuid) to authenticated, service_role;

create policy "notifications: own, while the object is visible" on public.notifications
  for select to authenticated using (
    recipient_id = (select auth.uid()) and authz.can_see_object(object_kind, object_id, (select auth.uid()))
  );
create policy "notification_settings: own" on public.notification_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notification_preferences: own" on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notification_mutes: own" on public.notification_mutes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "push_tokens: own" on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));

-- Create or bundle one notification per recipient. Skips the actor, anyone with a block with the
-- actor, and anyone who can't see the object. Returns how many rows were created or updated.
create or replace function private.notify(
  p_recipients uuid[],
  p_type public.notification_type,
  p_kind public.notification_object,
  p_object uuid,
  p_actor uuid,
  p_bundle_key text,
  p_data jsonb default '{}',
  p_plan uuid default null,
  p_activity uuid default null,
  p_crew uuid default null,
  p_message uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if p_recipients is null or cardinality(p_recipients) = 0 then
    return 0;
  end if;
  insert into public.notifications as n (
    recipient_id, type, object_kind, object_id, plan_id, activity_id, crew_id, message_id,
    actor_ids, actor_count, bundle_key, data
  )
  select r, p_type, p_kind, p_object, p_plan, p_activity, p_crew, p_message,
         case when p_actor is null then '{}'::uuid[] else array[p_actor] end,
         case when p_actor is null then 0 else 1 end,
         p_bundle_key, coalesce(p_data, '{}')
  from (select distinct x as r from unnest(p_recipients) x) t
  where t.r is not null
    and t.r is distinct from p_actor
    and exists (select 1 from public.profiles pr where pr.id = t.r)
    and (p_actor is null or not authz.is_blocked(t.r, p_actor))
    and authz.can_see_object(p_kind, p_object, t.r)
  on conflict (recipient_id, bundle_key) where read_at is null and acted_at is null
  do update set
    type = excluded.type,
    count = n.count + 1,
    actor_ids = case when p_actor is null then n.actor_ids
                     else (array[p_actor] || array_remove(n.actor_ids, p_actor))[1:5] end,
    actor_count = n.actor_count
                  + case when p_actor is null or p_actor = any (n.actor_ids) then 0 else 1 end,
    data = n.data || excluded.data,
    message_id = coalesce(excluded.message_id, n.message_id),
    updated_at = now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- "Sat 10:00" in a time zone.
create or replace function private.fmt_when(p_at timestamptz, p_tz text)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p_at is null then null
              else to_char(p_at at time zone coalesce(p_tz, 'America/Toronto'), 'Dy FMHH12:MI') end;
$$;

-- What a push says on a locked screen when details are off: the kind of thing, never who or where.
create or replace function private.generic_copy(p_type public.notification_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'need_one_more' then 'A game needs one more.'
    when 'game_on' then 'A plan you''re in is on.'
    when 'participant_update' then 'Your plan has an update.'
    when 'activity_changed' then 'A game you''re in changed.'
    when 'check_in_open' then 'Check-in is opening for your game.'
    when 'live' then 'A game you follow is live.'
    when 'result_to_confirm' then 'A score is waiting for you to confirm.'
    when 'recap_ready' then 'Your recap is ready.'
    when 'run_it_back_invite' then 'You''re invited to run it back.'
    when 'pull_in_invite' then 'Someone pulled you into a plan.'
    when 'waitlist_promoted' then 'A spot opened. You''re in.'
    when 'crew_poll' then 'Your crew started a poll.'
    when 'crew_plan' then 'Your crew is making a game.'
    when 'mention' then 'You were mentioned in a chat.'
    when 'crew_member_joined' then 'Your crew has a new member.'
    when 'challenge_response' then 'Your challenge has an update.'
  end;
$$;

-- Every visible notification of one person, with its group, action, link and words.
--   group: needs_you (unread, not acted on, and its action still makes sense), today, earlier.
--   action: what the inline button does; call the existing RPC (im_down, vote_time, check_in,
--           confirm_result, pull_in) and then act_on_notification(). 'open' = just navigate.
create or replace function private.notification_feed(p_uid uuid)
returns table (
  id uuid,
  type public.notification_type,
  "group" text,
  needs_you boolean,
  action text,
  href text,
  object_kind public.notification_object,
  object_id uuid,
  plan_id uuid,
  activity_id uuid,
  crew_id uuid,
  message_id uuid,
  actor_ids uuid[],
  actor_names text[],
  actor_count integer,
  count integer,
  title text,
  body text,
  data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  read_at timestamptz,
  acted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select coalesce((select pr.time_zone from public.profiles pr where pr.id = p_uid), 'America/Toronto') as tz
  ),
  base as (
    select n.*,
           (select coalesce(array_agg(a order by o), '{}')
              from unnest(n.actor_ids) with ordinality as x(a, o)
             where not authz.is_blocked(a, p_uid)) as visible_actors
    from public.notifications n
    where n.recipient_id = p_uid
      and authz.can_see_object(n.object_kind, n.object_id, p_uid)
  ),
  ctx as (
    select b.*,
           p.id as p_id, p.status as p_status, private.plan_status_now(p) as p_eff, p.member_count as p_count,
           p.capacity as p_cap, p.starts_at as p_starts, p.poll_closes_at as p_poll_closes, p.host_id as p_host,
           coalesce(ap.name, pp.name) as place_name,
           coalesce(ap.time_zone, pp.time_zone, me.tz) as place_tz,
           s.name as sport_name,
           a.id as a_id, private.activity_status_now(a) as a_eff, a.starts_at as a_starts,
           a.check_in_opens_at as a_ci_opens, a.check_in_closes_at as a_ci_closes, a.after_closes_at as a_after_closes,
           a.team_a_label as a_team_a, a.team_b_label as a_team_b,
           c.name as crew_name,
           exists (select 1 from public.plan_members m where m.plan_id = p.id and m.user_id = p_uid) as i_am_in,
           (select names from (
              select array_agg(pr.display_name order by o) as names
              from unnest(b.visible_actors) with ordinality as x(a, o)
              join public.profiles pr on pr.id = x.a) q) as names
    from base b
    cross join me
    left join public.activities a on a.id = coalesce(b.activity_id, case when b.object_kind = 'activity' then b.object_id end)
    left join public.plans p on p.id = coalesce(b.plan_id, a.plan_id, case when b.object_kind = 'plan' then b.object_id end)
    left join public.sports s on s.id = coalesce(a.sport_id, p.sport_id)
    left join public.places pp on pp.id = p.place_id
    left join public.places ap on ap.id = a.place_id
    left join public.crews c on c.id = coalesce(b.crew_id, case when b.object_kind = 'crew' then b.object_id end)
    -- A row whose only actors are now blocked goes away.
    where cardinality(b.actor_ids) = 0 or cardinality(b.visible_actors) > 0
  ),
  valid as (
    select x.*,
      case x.type
        when 'need_one_more' then case when x.i_am_in then 'pull_in' else 'im_down' end
        when 'pull_in_invite' then 'im_down'
        when 'run_it_back_invite' then 'im_down'
        when 'crew_plan' then 'im_down'
        when 'crew_poll' then 'vote'
        when 'check_in_open' then 'check_in'
        when 'result_to_confirm' then 'confirm_result'
        when 'mention' then 'reply'
        else 'open'
      end as act,
      case x.type
        when 'need_one_more' then x.p_eff = 'forming' and x.p_count < x.p_cap
        when 'pull_in_invite' then x.p_eff = 'forming' and x.p_count < x.p_cap and not x.i_am_in
          and exists (select 1 from public.plan_invites i where i.plan_id = x.p_id and i.invitee_id = p_uid and i.status = 'pending')
        when 'run_it_back_invite' then x.p_eff = 'forming' and x.p_count < x.p_cap and not x.i_am_in
          and exists (select 1 from public.plan_invites i where i.plan_id = x.p_id and i.invitee_id = p_uid and i.status = 'pending')
        when 'crew_plan' then x.p_eff = 'forming' and x.p_count < x.p_cap and not x.i_am_in
        when 'crew_poll' then x.p_eff = 'forming' and coalesce(x.p_poll_closes > now(), false)
          and not exists (select 1 from public.plan_time_votes v where v.plan_id = x.p_id and v.user_id = p_uid)
        when 'check_in_open' then x.a_eff in ('confirmed', 'live') and now() < x.a_ci_closes
          and exists (select 1 from public.attendance t where t.activity_id = x.a_id and t.user_id = p_uid and t.status = 'confirmed')
        when 'result_to_confirm' then x.a_eff in ('live', 'after')
          and exists (select 1 from public.result_proposals r
                      where r.activity_id = x.a_id and r.status = 'proposed'
                        and not exists (select 1 from public.result_confirmations rc
                                        where rc.proposal_id = r.id and rc.user_id = p_uid))
          and authz.is_player(x.a_id, p_uid)
        when 'mention' then true
        else false
      end as still_valid,
      (select sum(o.vote_count)::integer from public.plan_time_options o where o.plan_id = x.p_id) as votes,
      (select r from public.recaps r where r.activity_id = x.a_id) as recap
    from ctx x
  )
  select
    v.id,
    v.type,
    case when v.read_at is null and v.acted_at is null and coalesce(v.still_valid, false) then 'needs_you'
         when v.updated_at >= ((now() at time zone me.tz)::date::timestamp at time zone me.tz) then 'today'
         else 'earlier' end,
    v.read_at is null and v.acted_at is null and coalesce(v.still_valid, false),
    v.act,
    case
      when v.type = 'crew_poll' or (v.type = 'mention' and v.object_kind = 'crew') then '/crew/' || v.crew_id || '/chat'
      when v.type = 'crew_member_joined' then '/crew/' || v.object_id
      when v.type = 'mention' then '/activity/' || v.a_id || '/chat'
      when v.type = 'game_on' then '/plan/' || v.p_id || '/game-on'
      when v.type = 'need_one_more' and v.i_am_in then '/plan/' || v.p_id || '/pull-in'
      when v.type = 'check_in_open' then '/activity/' || v.a_id || '/check-in'
      when v.type = 'live' then '/activity/' || v.a_id || '/live'
      when v.type = 'result_to_confirm' then '/activity/' || v.a_id || '/after'
      when v.type = 'recap_ready' then '/activity/' || v.a_id || '/recap'
      when v.object_kind = 'activity' then '/activity/' || v.a_id
      when v.object_kind = 'plan' then '/plan/' || v.p_id
      else null
    end,
    v.object_kind, v.object_id, v.p_id, v.a_id, coalesce(v.crew_id, case when v.object_kind = 'crew' then v.object_id end),
    v.message_id,
    v.visible_actors,
    coalesce(v.names, '{}'),
    greatest(v.actor_count - (cardinality(v.actor_ids) - cardinality(v.visible_actors)), 0),
    v.count,
    -- Title (suggested words; the app may compose its own from the facts).
    case v.type
      when 'need_one_more' then v.sport_name || ' needs one more.'
      when 'game_on' then 'GAME ON · ' || lower(v.sport_name) || ' ' || private.fmt_when(v.p_starts, v.place_tz)
      when 'participant_update' then
        case when cardinality(v.names) = 1 and v.count = 1 then v.names[1] || ' ' || case when (v.data ->> 'left')::boolean then 'left' else 'joined' end
             else v.count || ' changes' end || ' · ' || lower(v.sport_name)
      when 'activity_changed' then
        case v.data ->> 'change' when 'cancelled' then v.sport_name || ' ' || private.fmt_when(coalesce(v.a_starts, v.p_starts), v.place_tz) || ' is called off.'
             else v.sport_name || ' moved to ' || private.fmt_when(coalesce(v.a_starts, v.p_starts), v.place_tz) end
      when 'check_in_open' then 'Check-in opens at ' || to_char(v.a_ci_opens at time zone v.place_tz, 'FMHH12:MI')
      when 'live' then v.sport_name || ' is live.'
      when 'result_to_confirm' then 'Confirm the score.'
      when 'recap_ready' then
        case when (v.recap).team_a_score is null then 'Recap ready: ' || lower(v.sport_name)
             when (v.recap).team_a_score = (v.recap).team_b_score then 'Recap ready: ' || (v.recap).team_a_score || '–' || (v.recap).team_b_score
             when (v.recap).team_a_score > (v.recap).team_b_score then 'Recap ready: ' || coalesce((v.recap).team_a_label, 'Team A') || ' win ' || (v.recap).team_a_score || '–' || (v.recap).team_b_score
             else 'Recap ready: ' || coalesce((v.recap).team_b_label, 'Team B') || ' win ' || (v.recap).team_b_score || '–' || (v.recap).team_a_score end
      when 'run_it_back_invite' then coalesce(v.names[1], 'Someone') || ' wants to run it back.'
      when 'pull_in_invite' then coalesce(v.names[1], 'Someone') || ' pulled you in.'
      when 'waitlist_promoted' then 'You''re in. A spot opened.'
      when 'crew_poll' then v.crew_name || ': what time ' || to_char(v.p_starts at time zone v.place_tz, 'FMDay') || '?'
      when 'crew_plan' then v.crew_name || ': ' || lower(v.sport_name) || ' ' || to_char(v.p_starts at time zone v.place_tz, 'FMDay') || '?'
      when 'mention' then
        case when cardinality(v.names) > 1 then v.names[1] || ' and ' || (cardinality(v.names) - 1) || ' more mentioned you'
             else coalesce(v.names[1], 'Someone') || ' mentioned you' end
        || ' in ' || coalesce(v.crew_name, lower(v.sport_name) || ' chat') || '.'
      when 'crew_member_joined' then
        case when v.count > 1 then v.count || ' people joined ' || v.crew_name
             else coalesce(v.names[1], 'Someone') || ' joined ' || v.crew_name end
      when 'challenge_response' then 'Challenge update.'
    end,
    -- Body.
    case v.type
      when 'need_one_more' then private.fmt_when(v.p_starts, v.place_tz) || coalesce(' · ' || v.place_name, '')
        || ' · ' || v.p_count || ' / ' || v.p_cap || '.'
        || case when (v.data ->> 'pull_me_in')::boolean then ' You have Pull Me In on for ' || lower(v.sport_name) || '.' else '' end
      when 'game_on' then 'All ' || v.p_cap || ' are in. ' || to_char(v.p_starts at time zone v.place_tz, 'FMHH12:MI') || coalesce(', ' || v.place_name, '') || '.'
      when 'participant_update' then v.p_count || ' / ' || v.p_cap || ' in.'
      when 'activity_changed' then coalesce(v.place_name, '')
      when 'check_in_open' then v.sport_name || coalesce(' · ' || v.place_name, '')
      when 'live' then coalesce(v.place_name, '')
      when 'result_to_confirm' then coalesce(v.names[1] || ' logged it. ', '')
        || coalesce((select coalesce(v.a_team_a, 'Team A') || ' ' || r.team_a_score || '–' || r.team_b_score || ' ' || coalesce(v.a_team_b, 'Team B')
                       || ' · ' || r.confirmations_count || ' of ' || r.threshold || ' confirmed.'
                     from public.result_proposals r where r.activity_id = v.a_id and r.status in ('proposed', 'verified')), '')
      when 'recap_ready' then
        case when v.a_after_closes > now() then 'Add photos until ' || private.fmt_when(v.a_after_closes, v.place_tz)
             else (v.recap).played_count || ' played · ' || (v.recap).duration_minutes || ' min' end
      when 'run_it_back_invite' then v.sport_name || ' · ' || private.fmt_when(v.p_starts, v.place_tz) || coalesce(' · ' || v.place_name, '')
      when 'pull_in_invite' then v.sport_name || ' · ' || private.fmt_when(v.p_starts, v.place_tz) || coalesce(' · ' || v.place_name, '')
        || ' · ' || v.p_count || ' / ' || v.p_cap
      when 'waitlist_promoted' then v.sport_name || ' · ' || private.fmt_when(v.a_starts, v.place_tz) || coalesce(' · ' || v.place_name, '')
      when 'crew_poll' then coalesce(v.names[1], 'Someone') || ' started a poll · ' || coalesce(v.votes, 0)
        || case when coalesce(v.votes, 0) = 1 then ' vote so far' else ' votes so far' end
      when 'crew_plan' then coalesce(v.names[1], 'Someone') || ' tapped MAKE THIS A GAME'
      when 'mention' then 'Open the chat to reply.'
      when 'crew_member_joined' then
        coalesce('Invited by ' || (select pr.display_name from public.profiles pr
                                    where pr.id = (v.data ->> 'invited_by')::uuid and not authz.is_blocked(pr.id, p_uid)), 'Joined with the invite code')
      else null
    end,
    v.data, v.created_at, v.updated_at, v.read_at, v.acted_at
  from valid v
  cross join me;
$$;

-- Notifications RPCs -----------------------------------------------------------------------------------

create or replace function public.my_notifications(p_limit integer default 50)
returns table (
  id uuid,
  type public.notification_type,
  "group" text,
  needs_you boolean,
  action text,
  href text,
  object_kind public.notification_object,
  object_id uuid,
  plan_id uuid,
  activity_id uuid,
  crew_id uuid,
  message_id uuid,
  actor_ids uuid[],
  actor_names text[],
  actor_count integer,
  count integer,
  title text,
  body text,
  data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  read_at timestamptz,
  acted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  return query
  select f.* from private.notification_feed(v_uid) f
  order by case f."group" when 'needs_you' then 0 when 'today' then 1 else 2 end, f.updated_at desc, f.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- The bell: unread rows you can still see.
create or replace function public.unread_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  return (select count(*)::integer from private.notification_feed(v_uid) f where f.read_at is null);
end;
$$;

-- Mark read: the given ids, or everything updated at or before p_before. Returns rows changed.
create or replace function public.mark_notifications_read(p_ids uuid[] default null, p_before timestamptz default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_n integer;
begin
  if (p_ids is null) = (p_before is null) then
    perform private.fail('invalid_argument', 'p_ids or p_before');
  end if;
  update public.notifications n set read_at = now()
   where n.recipient_id = v_uid and n.read_at is null
     and ((p_ids is not null and n.id = any (p_ids)) or (p_before is not null and n.updated_at <= p_before));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- The inline action was taken (or dismissed): marks the row acted on and read. The action itself is
-- the existing RPC (im_down, vote_time, check_in, confirm_result…). Idempotent.
create or replace function public.act_on_notification(p_id uuid)
returns public.notifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_n public.notifications%rowtype;
begin
  update public.notifications n
     set acted_at = coalesce(n.acted_at, now()), read_at = coalesce(n.read_at, now())
   where n.id = p_id and n.recipient_id = v_uid
  returning * into v_n;
  if v_n.id is null then
    perform private.fail('notification_not_found');
  end if;
  perform private.emit('notification_acted', v_uid, jsonb_build_object('type', v_n.type));
  return v_n;
end;
$$;

-- Settings ---------------------------------------------------------------------------------------------

create type public.notification_prefs_state as (
  quiet_hours_enabled boolean,
  quiet_start time,
  quiet_end time,
  show_details boolean,
  time_zone text,
  push_off public.notification_type[]
);

create or replace function private.prefs_of(p_uid uuid)
returns public.notification_prefs_state
language sql
stable
security definer
set search_path = ''
as $$
  select row(
    coalesce(np.quiet_hours_enabled, true),
    coalesce(np.quiet_start, '23:00'::time),
    coalesce(np.quiet_end, '07:00'::time),
    coalesce(np.show_details, false),
    pr.time_zone,
    coalesce((select array_agg(s.type order by s.type) from public.notification_settings s
              where s.user_id = p_uid and not s.push), '{}')
  )::public.notification_prefs_state
  from public.profiles pr
  left join public.notification_preferences np on np.user_id = pr.id
  where pr.id = p_uid;
$$;

create or replace function public.notification_preferences()
returns public.notification_prefs_state
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  return private.prefs_of(v_uid);
end;
$$;

-- Null leaves a setting unchanged.
create or replace function public.set_notification_preferences(
  p_quiet_hours_enabled boolean default null,
  p_quiet_start time default null,
  p_quiet_end time default null,
  p_show_details boolean default null
)
returns public.notification_prefs_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  insert into public.notification_preferences (user_id) values (v_uid) on conflict (user_id) do nothing;
  begin
    update public.notification_preferences
       set quiet_hours_enabled = coalesce(p_quiet_hours_enabled, quiet_hours_enabled),
           quiet_start = coalesce(p_quiet_start, quiet_start),
           quiet_end = coalesce(p_quiet_end, quiet_end),
           show_details = coalesce(p_show_details, show_details)
     where user_id = v_uid;
  exception when check_violation then
    perform private.fail('invalid_argument', 'quiet hours');
  end;
  return private.prefs_of(v_uid);
end;
$$;

-- Push on or off for one type.
create or replace function public.set_notification_type(p_type public.notification_type, p_push boolean)
returns public.notification_prefs_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if p_type is null or p_push is null then
    perform private.fail('invalid_argument', 'type and push');
  end if;
  insert into public.notification_settings (user_id, type, push) values (v_uid, p_type, p_push)
  on conflict (user_id, type) do update set push = excluded.push, updated_at = now();
  return private.prefs_of(v_uid);
end;
$$;

-- Mute one plan, activity or crew (p_until null = until unmuted).
create or replace function public.mute_object(
  p_object_kind public.notification_object, p_object_id uuid, p_until timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not authz.can_see_object(p_object_kind, p_object_id, v_uid) then
    perform private.fail('invalid_argument', 'object');
  end if;
  insert into public.notification_mutes (user_id, object_kind, object_id, until)
  values (v_uid, p_object_kind, p_object_id, p_until)
  on conflict (user_id, object_kind, object_id) do update set until = excluded.until;
  return true;
end;
$$;

create or replace function public.unmute_object(p_object_kind public.notification_object, p_object_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  delete from public.notification_mutes
   where user_id = v_uid and object_kind = p_object_kind and object_id = p_object_id;
  return true;
end;
$$;

-- Push tokens ------------------------------------------------------------------------------------------

-- Register (or refresh) this device's Expo push token. A token seen under another account moves to
-- this one (the device signed in as someone else). At most 10 devices per person; the oldest go.
create or replace function public.register_push_token(p_token text, p_platform public.push_platform)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
begin
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$' or p_platform is null then
    perform private.fail('push_token_invalid');
  end if;
  insert into public.push_tokens (user_id, token, platform) values (v_uid, p_token, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now()
  returning id into v_id;
  delete from public.push_tokens t
   where t.user_id = v_uid
     and t.id not in (select x.id from public.push_tokens x where x.user_id = v_uid
                      order by x.last_seen_at desc, x.id limit 10);
  return v_id;
end;
$$;

-- Sign out on this device / turn push off. Idempotent.
create or replace function public.unregister_push_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  delete from public.push_tokens where token = p_token and user_id = v_uid;
  return true;
end;
$$;

-- Would-send (no delivery) -----------------------------------------------------------------------------

-- Types whose repeats are throttled on push: at most one push per bundle per 30 minutes (PRD §9.19
-- "rate-limit repeated plan threshold updates"). In-app, the row just updates its count.
create or replace function private.push_throttled_types()
returns public.notification_type[]
language sql
immutable
set search_path = ''
as $$ select array['participant_update', 'need_one_more', 'crew_member_joined', 'mention']::public.notification_type[] $$;

-- Decide what a push for one notification would be, without sending it. Reasons, in order:
-- not_found, already_seen, not_visible, type_off, object_muted, no_device, rate_limited,
-- quiet_hours (deliver_after = when quiet hours end), ok. Title/body respect show_details: off →
-- "Ojoro" + private.generic_copy(type), never who, what or where.
create or replace function private.would_send(p_notification_id uuid, p_at timestamptz default now())
returns table (
  send boolean,
  reason text,
  title text,
  body text,
  tokens text[],
  collapse_id text,
  deliver_after timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_n public.notifications%rowtype;
  v_f record;
  v_visible boolean;
  v_prefs public.notification_prefs_state;
  v_tokens text[];
  v_local time;
  v_quiet boolean;
  v_title text;
  v_body text;
  v_after timestamptz;
begin
  select * into v_n from public.notifications where id = p_notification_id;
  if not found then
    return query select false, 'not_found', null::text, null::text, '{}'::text[], null::text, null::timestamptz;
    return;
  end if;
  v_prefs := private.prefs_of(v_n.recipient_id);
  select f.* into v_f from private.notification_feed(v_n.recipient_id) f where f.id = v_n.id;
  v_visible := found;
  v_tokens := coalesce((select array_agg(t.token order by t.last_seen_at desc) from public.push_tokens t
                        where t.user_id = v_n.recipient_id), '{}');
  if v_prefs.show_details and v_visible then
    v_title := v_f.title;
    v_body := v_f.body;
  else
    v_title := 'Ojoro';
    v_body := private.generic_copy(v_n.type);
  end if;

  v_local := (p_at at time zone coalesce(v_prefs.time_zone, 'America/Toronto'))::time;
  v_quiet := v_prefs.quiet_hours_enabled and case
    when v_prefs.quiet_start < v_prefs.quiet_end then v_local >= v_prefs.quiet_start and v_local < v_prefs.quiet_end
    else v_local >= v_prefs.quiet_start or v_local < v_prefs.quiet_end
  end;
  if v_quiet then
    v_after := ((p_at at time zone v_prefs.time_zone)::date
                + case when v_local >= v_prefs.quiet_end then 1 else 0 end
                + v_prefs.quiet_end) at time zone v_prefs.time_zone;
  end if;

  return query select
    r.reason = 'ok', r.reason, v_title, v_body, v_tokens, v_n.bundle_key,
    case when r.reason = 'quiet_hours' then v_after end
  from (select case
    when v_n.read_at is not null or v_n.acted_at is not null then 'already_seen'
    when not v_visible then 'not_visible'
    when v_n.type = any (v_prefs.push_off) then 'type_off'
    when exists (select 1 from public.notification_mutes m
                 where m.user_id = v_n.recipient_id and (m.until is null or m.until > p_at)
                   and ((m.object_kind = v_n.object_kind and m.object_id = v_n.object_id)
                        or (m.object_kind = 'plan' and m.object_id = v_n.plan_id)
                        or (m.object_kind = 'activity' and m.object_id = v_n.activity_id)
                        or (m.object_kind = 'crew' and m.object_id = v_n.crew_id))) then 'object_muted'
    when cardinality(v_tokens) = 0 then 'no_device'
    when v_n.type = any (private.push_throttled_types()) and v_n.pushed_at is not null
         and v_n.pushed_at > p_at - interval '30 minutes' then 'rate_limited'
    when v_quiet then 'quiet_hours'
    else 'ok'
  end as reason) r;
end;
$$;

-- What the delivery layer would push now: rows changed since they were last pushed, in the last day.
create or replace function private.delivery_queue(p_limit integer default 100)
returns table (
  notification_id uuid, recipient_id uuid, send boolean, reason text, title text, body text,
  tokens text[], collapse_id text, deliver_after timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.recipient_id, w.send, w.reason, w.title, w.body, w.tokens, w.collapse_id, w.deliver_after
  from public.notifications n
  cross join lateral private.would_send(n.id, now()) w
  where n.updated_at > now() - interval '24 hours'
    and (n.pushed_at is null or n.updated_at > n.pushed_at)
    and n.read_at is null and n.acted_at is null
  order by n.updated_at
  limit least(greatest(coalesce(p_limit, 100), 1), 1000);
$$;

-- The delivery layer marks what it pushed (and the throttle starts from here).
create or replace function private.mark_pushed(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.notifications set pushed_at = now() where id = any (p_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Generation: triggers on existing objects -----------------------------------------------------------

-- Plans: threshold updates (to the host), NEED ONE MORE (members and Pull Me In people), GAME ON
-- (members), called off (members).
create or replace function private.on_plan_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_members uuid[];
  v_place public.places%rowtype;
begin
  select coalesce(array_agg(m.user_id), '{}') into v_members from public.plan_members m where m.plan_id = new.id;

  if new.member_count <> old.member_count and old.status = 'forming' and new.status = 'forming' then
    if v_actor is distinct from new.host_id then
      perform private.notify(array[new.host_id], 'participant_update', 'plan', new.id, v_actor,
        'participant_update:' || new.id, jsonb_build_object('left', new.member_count < old.member_count),
        p_plan => new.id);
    end if;
    if new.member_count = new.capacity - 1 and old.member_count < new.capacity - 1 then
      perform private.notify(v_members, 'need_one_more', 'plan', new.id, null,
        'need_one_more:' || new.id, '{}', p_plan => new.id);
      -- Pull Me In: the standing permission to be asked when a game needs one more (PRD §9.5).
      select * into v_place from public.places where id = new.place_id;
      perform private.notify(
        (select coalesce(array_agg(x.user_id), '{}') from (
           select pm.user_id
           from public.pull_me_in pm
           where pm.sport_id = new.sport_id
             and not (pm.user_id = any (v_members))
             and authz.can_see_plan(new.id, pm.user_id)
             and not exists (select 1 from public.plan_members m
                             where m.plan_id = new.id and authz.is_blocked(m.user_id, pm.user_id))
             and (
               (pm.scope = 'connections'
                and exists (select 1 from public.plan_members m
                            where m.plan_id = new.id and authz.connected(m.user_id, pm.user_id)))
               or (pm.scope = 'nearby' and v_place.id is not null
                   and exists (select 1 from public.profile_private pp
                               where pp.user_id = pm.user_id and pp.area_lat is not null
                                 and private.distance_m(pp.area_lat::double precision, pp.area_lng::double precision,
                                                        v_place.lat, v_place.lng) <= pp.discovery_radius_km * 1000))
             )
           order by authz.games_together(pm.user_id, new.host_id) desc, pm.user_id
           limit 20) x),
        'need_one_more', 'plan', new.id, null, 'need_one_more:' || new.id,
        jsonb_build_object('pull_me_in', true), p_plan => new.id);
    end if;
  end if;

  if old.status = 'forming' and new.status = 'game_on' then
    perform private.notify(v_members, 'game_on', 'plan', new.id, null, 'game_on:' || new.id, '{}', p_plan => new.id);
  end if;

  if old.status = 'forming' and new.status = 'cancelled' then
    perform private.notify(v_members, 'activity_changed', 'plan', new.id, v_actor, 'changed:' || new.id,
      jsonb_build_object('change', 'cancelled'), p_plan => new.id);
  end if;
  return null;
end;
$$;

create trigger notify_plan_changed after update on public.plans
  for each row
  when (old.member_count is distinct from new.member_count or old.status is distinct from new.status)
  execute function private.on_plan_changed();

-- Invites: Pull Someone In and Run It Back.
create or replace function private.on_invite_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    perform private.notify(array[new.invitee_id],
      case new.kind when 'run_it_back' then 'run_it_back_invite'::public.notification_type
                    else 'pull_in_invite'::public.notification_type end,
      'plan', new.plan_id, new.inviter_id, 'invite:' || new.plan_id, '{}', p_plan => new.plan_id);
  end if;
  return null;
end;
$$;

create trigger notify_invite_created after insert on public.plan_invites
  for each row execute function private.on_invite_created();

-- Attendance: waitlist promotion (to the person) and cancellations (to the host).
create or replace function private.on_attendance_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.activities%rowtype;
begin
  select * into v_a from public.activities where id = new.activity_id;
  if old.status = 'waitlisted' and new.status = 'confirmed' then
    perform private.notify(array[new.user_id], 'waitlist_promoted', 'activity', new.activity_id, null,
      'waitlist:' || new.activity_id, '{}', p_activity => new.activity_id, p_plan => v_a.plan_id);
  elsif old.status in ('confirmed', 'checked_in') and new.status = 'cancelled' and new.user_id <> v_a.host_id then
    perform private.notify(array[v_a.host_id], 'participant_update', 'activity', new.activity_id, new.user_id,
      'participant_update:' || new.activity_id, jsonb_build_object('left', true),
      p_activity => new.activity_id, p_plan => v_a.plan_id);
  end if;
  return null;
end;
$$;

create trigger notify_attendance_changed after update of status on public.attendance
  for each row when (old.status is distinct from new.status)
  execute function private.on_attendance_changed();

-- A score was logged: the other players confirm it.
create or replace function private.on_result_proposed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
begin
  if new.status = 'proposed' then
    select a.plan_id into v_plan from public.activities a where a.id = new.activity_id;
    perform private.notify(
      (select coalesce(array_agg(t.user_id), '{}') from public.attendance t
        where t.activity_id = new.activity_id and t.status = 'checked_in'),
      'result_to_confirm', 'activity', new.activity_id, new.proposed_by, 'result:' || new.activity_id, '{}',
      p_activity => new.activity_id, p_plan => v_plan);
  end if;
  return null;
end;
$$;

create trigger notify_result_proposed after insert on public.result_proposals
  for each row execute function private.on_result_proposed();

-- The Recap exists: every player.
create or replace function private.on_recap_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
begin
  select a.plan_id into v_plan from public.activities a where a.id = new.activity_id;
  perform private.notify(
    (select coalesce(array_agg(t.user_id), '{}') from public.attendance t
      where t.activity_id = new.activity_id and t.status = 'checked_in'),
    'recap_ready', 'activity', new.activity_id, null, 'recap:' || new.activity_id, '{}',
    p_activity => new.activity_id, p_plan => v_plan);
  return null;
end;
$$;

create trigger notify_recap_created after insert on public.recaps
  for each row execute function private.on_recap_created();

-- Someone joined a crew: the other members (bundled per crew).
create or replace function private.on_crew_member_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.via <> 'created' then
    perform private.notify(
      (select coalesce(array_agg(m.user_id), '{}') from public.crew_members m
        where m.crew_id = new.crew_id and m.user_id <> new.user_id),
      'crew_member_joined', 'crew', new.crew_id, new.user_id, 'crew_joined:' || new.crew_id,
      case when new.invited_by is not null then jsonb_build_object('invited_by', new.invited_by) else '{}'::jsonb end,
      p_crew => new.crew_id);
  end if;
  return null;
end;
$$;

create trigger notify_crew_member_added after insert on public.crew_members
  for each row execute function private.on_crew_member_added();

-- Time-based: check-in opening (15 minutes ahead), once per activity. Runs every minute.
create or replace function private.notify_tick()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a record;
  v_n integer := 0;
begin
  for v_a in
    select a.id, a.plan_id from public.activities a
    where a.status in ('confirmed', 'live')
      and a.check_in_opens_at <= now() + interval '15 minutes'
      and a.check_in_closes_at > now()
      and not exists (select 1 from private.notification_marks k where k.object_id = a.id and k.kind = 'check_in_open')
  loop
    insert into private.notification_marks (object_id, kind) values (v_a.id, 'check_in_open') on conflict do nothing;
    v_n := v_n + private.notify(
      (select coalesce(array_agg(t.user_id), '{}') from public.attendance t
        where t.activity_id = v_a.id and t.status = 'confirmed'),
      'check_in_open', 'activity', v_a.id, null, 'check_in:' || v_a.id, '{}',
      p_activity => v_a.id, p_plan => v_a.plan_id);
  end loop;
  delete from private.notification_marks where created_at < now() - interval '3 days';
  return v_n;
end;
$$;
revoke all on function private.notify_tick() from public, anon, authenticated;
grant execute on function private.notify_tick() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ojoro_notify_tick', '* * * * *', 'select private.notify_tick()');
  else
    raise notice 'pg_cron not available: call private.notify_tick() from a scheduler';
  end if;
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
