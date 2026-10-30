-- Step 6 (Communities): notifications for Ritual weeks and clan join requests (owner decision).
--
-- This file is named after the Host OS migrations on purpose: private.notification_feed and
-- private.generic_copy are whole-function replacements, and Host OS core redefined them in
-- 20261030200300 / 20261030200600. Starting from those latest definitions and sorting after them keeps
-- every type's words on a fresh `db reset`. Anyone redefining these later must start from this file.
--
--   ritual_week   A Ritual put this week's plan (crew: object plan, link /plan/{id}) or club run (clan:
--                 object clan, data.clan_run_id, link /clan/{id}) on the board. To everyone in the crew
--                 or clan except the host. Needs you while it's forming with room and you're not in;
--                 action im_down. "Thursday football · Thu 7:30" / "Thursday FC ritual · 1 / 10 in."
--   clan_request  Someone asked to join a request clan. To the people who can approve (captain,
--                 organizer, moderator, connector), bundled per clan, push-throttled like other repeats.
--                 Needs you while a request is pending. "Maya K asked to join Concordia Run Club." /
--                 "3 people asked to join …" · "Approve or decline on the clan page."
-- Mutes: mute_object('clan', id) or ('crew', id) / ('plan', id) silence them, as for other types.

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
    when 'clan' then authz.can_see_clan(p_id, p_viewer)
    else false
  end;
$$;

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
    when 'challenge_response' then 'Your Call-Out has an answer.'
    when 'call_out' then 'You have a new Call-Out.'
    when 'challenge_posts' then 'An event you follow has new posts.'
    when 'challenge_milestone' then 'An event you follow has an update.'
    when 'challenge_to_confirm' then 'A result is waiting for you to confirm.'
    when 'host_request' then 'Someone asked to join your session.'
    when 'host_update' then 'A session you''re in has an update.'
    when 'host_announcement' then 'Your host sent an update.'
    when 'ritual_week' then 'This week''s ritual is on the board.'
    when 'clan_request' then 'Someone asked to join your clan.'
  end;
$$;

create or replace function private.push_throttled_types()
returns public.notification_type[]
language sql
immutable
set search_path = ''
as $$ select array['participant_update', 'need_one_more', 'crew_member_joined', 'mention',
                   'challenge_posts', 'clan_request']::public.notification_type[] $$;

create or replace function private.notification_feed(p_uid uuid)
returns table (
  id uuid,
  type public.notification_type,
  section text,
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
           p.capacity as p_cap, p.starts_at as p_starts, p.title as p_title, p.poll_closes_at as p_poll_closes, p.host_id as p_host,
           coalesce(ap.name, pp.name) as place_name,
           coalesce(ap.time_zone, pp.time_zone, me.tz) as place_tz,
           s.name as sport_name,
           a.id as a_id, private.activity_status_now(a) as a_eff, a.starts_at as a_starts,
           a.check_in_opens_at as a_ci_opens, a.check_in_closes_at as a_ci_closes, a.after_closes_at as a_after_closes,
           a.team_a_label as a_team_a, a.team_b_label as a_team_b,
           c.name as crew_name,
           cl.name as clan_name,
           cl.time_zone as clan_tz,
           (select r from public.clan_runs r where r.id = nullif(b.data ->> 'clan_run_id', '')::uuid) as run_row,
           exists (select 1 from public.plan_members m where m.plan_id = p.id and m.user_id = p_uid) as i_am_in,
           (select names from (
              select array_agg(pr.display_name order by o) as names
              from unnest(b.visible_actors) with ordinality as x(a, o)
              join public.profiles pr on pr.id = x.a) q) as names,
           co as co_row,
           co.id as co_id,
           (select pl.name from public.places pl where pl.id = co.place_id) as co_place,
           ce as ce_row,
           ce.id as ce_id,
           (select pl.name from public.places pl where pl.id = ce.place_id) as ce_place
    from base b
    cross join me
    left join public.activities a on a.id = coalesce(b.activity_id, case when b.object_kind = 'activity' then b.object_id end)
    left join public.plans p on p.id = coalesce(b.plan_id, a.plan_id, case when b.object_kind = 'plan' then b.object_id end)
    left join public.sports s on s.id = coalesce(a.sport_id, p.sport_id)
    left join public.places pp on pp.id = p.place_id
    left join public.places ap on ap.id = a.place_id
    left join public.crews c on c.id = coalesce(b.crew_id, case when b.object_kind = 'crew' then b.object_id end)
    left join public.clans cl on cl.id = case when b.object_kind = 'clan' then b.object_id end
    left join public.call_outs co on co.id = case when b.object_kind = 'challenge' then b.object_id end
    left join public.challenge_events ce on ce.id = case when b.object_kind = 'challenge_event' then b.object_id end
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
        when 'call_out' then 'reply'
        when 'challenge_to_confirm' then 'confirm_challenge'
        when 'ritual_week' then 'im_down'
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
        when 'call_out' then private.call_out_status_now(x.co_row) = 'proposed' and (x.co_row).starts_at > now()
          and private.can_answer_call_out(x.co_row, p_uid)
        when 'challenge_to_confirm' then (x.ce_row).status = 'verifying'
          and p_uid in ((x.ce_row).a_captain_id, (x.ce_row).b_captain_id)
          and exists (select 1 from public.challenge_result_submissions rs
                      where rs.event_id = x.ce_id and rs.status = 'pending'
                        and not exists (select 1 from public.challenge_result_confirmations rc
                                        where rc.submission_id = rs.id and rc.user_id = p_uid))
        when 'host_request' then x.a_eff = 'confirmed' and exists (
          select 1 from public.host_join_requests r join public.host_sessions hs on hs.id = r.session_id
          where hs.activity_id = x.a_id and r.status = 'pending')
        -- Step 6 communities.
        when 'ritual_week' then
          case when x.p_id is not null then x.p_eff = 'forming' and x.p_count < x.p_cap and not x.i_am_in
               else (x.run_row).id is not null and (x.run_row).status <> 'cancelled' and (x.run_row).starts_at > now()
                    and (x.run_row).down_count < (x.run_row).capacity
                    and not exists (select 1 from public.clan_run_members rm
                                    where rm.run_id = (x.run_row).id and rm.user_id = p_uid) end
        when 'clan_request' then authz.clan_can(x.object_id, 'admit', p_uid)
          and exists (select 1 from public.clan_join_requests q
                      where q.clan_id = x.object_id and q.status = 'pending' and not authz.is_blocked(q.user_id, p_uid))
        else false
      end as still_valid,
      (select hs.id from public.host_sessions hs where hs.activity_id = x.a_id) as hs_id,
      (select hs.program_id from public.host_sessions hs where hs.activity_id = x.a_id) as hs_program,
      (select sum(o.vote_count)::integer from public.plan_time_options o where o.plan_id = x.p_id) as votes,
      (select r from public.recaps r where r.activity_id = x.a_id) as recap,
      case when x.ce_id is not null then private.side_name(x.ce_row, 'a') || ' vs ' || private.side_name(x.ce_row, 'b') end as ce_vs,
      (select r from public.challenge_results r where r.event_id = x.ce_id) as ce_result,
      (select rs from public.challenge_result_submissions rs where rs.event_id = x.ce_id and rs.status = 'pending') as ce_sub
    from ctx x
  )
  select
    v.id,
    v.type,
    case when v.acted_at is null and coalesce(v.still_valid, false) and (v.type <> 'mention' or v.read_at is null) then 'needs_you'
         when v.updated_at >= ((now() at time zone me.tz)::date::timestamp at time zone me.tz) then 'today'
         else 'earlier' end,
    v.acted_at is null and coalesce(v.still_valid, false) and (v.type <> 'mention' or v.read_at is null),
    v.act,
    case
      when v.type = 'host_request' and v.hs_program is not null then '/host/' || v.hs_program || '/session/' || v.hs_id || '/requests'
      when v.type = 'host_announcement' then '/activity/' || v.a_id || '/chat'
      when v.object_kind = 'challenge' then '/challenge/' || v.object_id
      when v.object_kind = 'challenge_event' then '/event/' || v.object_id
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
      when v.object_kind = 'clan' then '/clan/' || v.object_id
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
      when 'call_out' then
        case when (v.data ->> 'counter')::boolean then private.call_out_side_name(v.co_row, true) || ' countered.'
             when (v.data ->> 'rematch')::boolean then private.call_out_side_name(v.co_row, true) || ' wants a rematch.'
             when (v.co_row).format = 'crew_vs_crew' then private.call_out_side_name(v.co_row, true) || ' called '
               || private.call_out_side_name(v.co_row, false) || ' out.'
             else private.call_out_side_name(v.co_row, true) || ' called you out.' end
      when 'challenge_response' then coalesce(v.names[1], 'Someone') || ' accepted.'
      when 'challenge_posts' then
        case when v.count = 1 then 'New post in ' else v.count || ' new posts in ' end || v.ce_vs
      when 'challenge_milestone' then
        case v.data ->> 'milestone'
          when 'live' then v.ce_vs || ' is live.'
          when 'today' then v.ce_vs || ' is today.'
          when 'called_off' then v.ce_vs || ' is called off.'
          when 'result' then
            case when (v.ce_result).event_id is null then v.ce_vs || ': result in.'
                 when (v.ce_result).winner_side is null then v.ce_vs || ': a draw.'
                 else private.side_name(v.ce_row, (v.ce_result).winner_side) || ' wins.' end
        end
      when 'challenge_to_confirm' then 'Confirm the result.'
      when 'host_request' then
        case when v.count > 1 then v.count || ' people asked to join.'
             else coalesce(v.names[1], 'Someone') || ' asked to join.' end
      when 'host_update' then
        case v.data ->> 'change'
          when 'request_approved' then 'You''re in. The host said yes.'
          when 'request_declined' then 'The host couldn''t take you this time.'
          when 'restored' then v.sport_name || ' ' || private.fmt_when(v.a_starts, v.place_tz) || ' is back on.'
          when 'invite_back' then 'You''re invited back.'
          when 'series_updated' then 'Your ' || lower(v.sport_name) || ' session changed.'
          -- Ops ledger updates (refund_decided, refund_reopened, league_result_*, referee_asked…)
          -- carry their own words in data.text.
          else coalesce(nullif(v.data ->> 'text', ''), 'Your ' || lower(v.sport_name) || ' session changed.') end
      when 'host_announcement' then 'From ' || coalesce(v.names[1], 'your host') || ', your host'
      -- Step 6 communities.
      when 'ritual_week' then
        case when v.p_id is not null then coalesce(v.p_title, v.sport_name) || ' · ' || private.fmt_when(v.p_starts, v.place_tz)
             else (v.run_row).title || ' · ' || private.fmt_when((v.run_row).starts_at, v.clan_tz) end
      when 'clan_request' then
        case when v.count > 1 then v.count || ' people asked to join ' || v.clan_name || '.'
             else coalesce(v.names[1], 'Someone') || ' asked to join ' || v.clan_name || '.' end
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
      when 'call_out' then (v.co_row).title || coalesce(' · ' || v.co_place, '') || ' · '
        || private.fmt_when((v.co_row).starts_at, (v.co_row).time_zone)
      when 'challenge_response' then (v.ce_row).title || ' · ' || private.fmt_when((v.ce_row).starts_at, (v.ce_row).time_zone)
        || '. The challenge is set.'
      when 'challenge_posts' then
        private.join_words(coalesce(v.names, '{}') || case when (v.data ->> 'system')::boolean then array['an Ojoro update'] else '{}'::text[] end)
        || case when v.count > 1 then ' · bundled' else '' end
      when 'challenge_milestone' then
        case v.data ->> 'milestone'
          when 'live' then 'Predictions are locked.'
          when 'today' then (v.ce_row).title || ' · ' || to_char((v.ce_row).starts_at at time zone (v.ce_row).time_zone, 'FMHH12:MI')
            || coalesce(' · ' || v.ce_place, '')
          when 'result' then (v.ce_row).title || ' · '
            || private.fmt_value((v.ce_result).a_value, (v.ce_row).scoring, (v.ce_row).unit) || ' – '
            || private.fmt_value((v.ce_result).b_value, (v.ce_row).scoring, (v.ce_row).unit)
          else (v.ce_row).title
        end
      when 'challenge_to_confirm' then coalesce(v.names[1], 'Someone') || ' sent '
        || private.side_name(v.ce_row, 'a') || ' ' || coalesce(private.fmt_value((v.ce_sub).a_value, (v.ce_row).scoring, (v.ce_row).unit), '') || ', '
        || private.side_name(v.ce_row, 'b') || ' ' || coalesce(private.fmt_value((v.ce_sub).b_value, (v.ce_row).scoring, (v.ce_row).unit), '') || '.'
      when 'host_request' then v.sport_name || ' · ' || private.fmt_when(v.a_starts, v.place_tz)
      when 'host_update' then
        case when v.data ->> 'change' = 'request_declined' then 'See what else is on nearby.'
             else v.sport_name || ' · ' || private.fmt_when(v.a_starts, v.place_tz) || coalesce(' · ' || v.place_name, '') end
      when 'host_announcement' then
        (select an.body from public.host_announcements an where an.id = (v.data ->> 'announcement_id')::uuid)
      when 'ritual_week' then
        case when v.p_id is not null then coalesce(v.crew_name || ' ritual · ', '') || v.p_count || ' / ' || v.p_cap || ' in.'
             else coalesce(v.clan_name || ' · ', '') || (v.run_row).down_count || ' / ' || (v.run_row).capacity || ' down.' end
      when 'clan_request' then 'Approve or decline on the clan page.'
      else null
    end,
    v.data, v.created_at, v.updated_at, v.read_at, v.acted_at
  from valid v
  cross join me;
$$;

create or replace function private.ensure_ritual_week(p_ritual uuid, p_on date)
returns public.ritual_week_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rituals%rowtype;
  o public.ritual_occurrences%rowtype;
  v_start timestamptz;
  v_plan uuid;
  v_run uuid;
  v_live boolean;
begin
  select * into r from public.rituals where id = p_ritual for update;
  if not found then
    return null;
  end if;
  v_start := private.ritual_starts_at(r, p_on);
  select * into o from public.ritual_occurrences where ritual_id = p_ritual and occurs_on = p_on;

  -- Is the existing week's plan/run still standing?
  v_live := (o.plan_id is not null and exists (select 1 from public.plans p where p.id = o.plan_id and p.status <> 'cancelled'))
         or (o.clan_run_id is not null and exists (select 1 from public.clan_runs x where x.id = o.clan_run_id and x.status <> 'cancelled'));

  if r.status = 'active' and o.skipped_at is null and not coalesce(v_live, false)
     and v_start > now() + interval '30 minutes' and v_start - make_interval(days => r.lead_days) <= now() then
    if r.crew_id is not null and authz.is_crew_member(r.crew_id, r.host_id) then
      insert into public.plans (
        sport_id, title, starts_at, duration_minutes, place_id, capacity, audience, crew_id, deadline_at,
        source, created_by, host_id, member_count
      ) values (
        r.sport_id, r.title, v_start, r.duration_minutes, r.place_id, r.capacity, 'crew', r.crew_id,
        least(v_start, greatest(now() + interval '5 minutes', v_start - interval '1 hour')),
        'ritual', r.host_id, r.host_id, 1
      ) returning id into v_plan;
      insert into public.plan_members (plan_id, user_id, via) values (v_plan, r.host_id, 'host');
      -- Tell the crew (not the host): this week's ritual is on the board.
      perform private.notify(
        (select coalesce(array_agg(m.user_id), '{}') from public.crew_members m
          where m.crew_id = r.crew_id and m.user_id <> r.host_id),
        'ritual_week', 'plan', v_plan, null, 'ritual_week:' || v_plan,
        jsonb_build_object('ritual_id', r.id), p_plan => v_plan, p_crew => r.crew_id);
      perform private.emit('ritual_plan_created', r.host_id,
        jsonb_build_object('ritual_id', r.id, 'crew_id', r.crew_id, 'plan_id', v_plan, 'sport_id', r.sport_id));
    elsif r.clan_id is not null and authz.is_clan_member(r.clan_id, r.host_id) then
      insert into public.clan_runs (
        clan_id, ritual_id, sport_id, title, starts_at, duration_minutes, place_id, distance_km, capacity,
        min_to_go, host_id, created_by, down_count
      ) values (
        r.clan_id, r.id, r.sport_id, r.title, v_start, r.duration_minutes, r.place_id, r.distance_km, r.capacity,
        coalesce(r.min_to_go, least(r.capacity, 4)), r.host_id, r.host_id, 1
      )
      on conflict (ritual_id, starts_at) where ritual_id is not null do nothing
      returning id into v_run;
      if v_run is not null then
        insert into public.clan_run_members (run_id, user_id) values (v_run, r.host_id);
        perform private.notify(
          (select coalesce(array_agg(m.user_id), '{}') from public.clan_members m
            where m.clan_id = r.clan_id and m.user_id <> r.host_id),
          'ritual_week', 'clan', r.clan_id, null, 'ritual_week:' || v_run,
          jsonb_build_object('ritual_id', r.id, 'clan_run_id', v_run));
        perform private.emit('ritual_plan_created', r.host_id,
          jsonb_build_object('ritual_id', r.id, 'clan_id', r.clan_id, 'clan_run_id', v_run, 'sport_id', r.sport_id));
      end if;
    end if;
    insert into public.ritual_occurrences (ritual_id, occurs_on, starts_at, plan_id, clan_run_id)
    values (r.id, p_on, v_start, v_plan, v_run)
    on conflict (ritual_id, occurs_on) do update
      set plan_id = coalesce(excluded.plan_id, public.ritual_occurrences.plan_id),
          clan_run_id = coalesce(excluded.clan_run_id, public.ritual_occurrences.clan_run_id),
          starts_at = excluded.starts_at;
    select * into o from public.ritual_occurrences where ritual_id = p_ritual and occurs_on = p_on;
  end if;

  return row(r.id, p_on, coalesce(o.starts_at, v_start), o.skipped_at is not null, o.plan_id, o.clan_run_id)::public.ritual_week_state;
end;
$$;

create or replace function public.join_clan(p_clan_id uuid, p_message text default null)
returns public.clan_join_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  c public.clans%rowtype := private.require_clan(p_clan_id, v_uid);
  v_req uuid;
begin
  if authz.is_clan_member(p_clan_id, v_uid) then
    return row(p_clan_id, 'member', authz.clan_role(p_clan_id, v_uid), null, false)::public.clan_join_state;
  end if;
  if c.join_policy = 'invite' then
    perform private.fail('clan_invite_only');
  end if;
  if p_message is not null and char_length(trim(p_message)) > 200 then
    perform private.fail('invalid_argument', 'message');
  end if;
  if c.join_policy = 'open' then
    perform private.add_to_clan(p_clan_id, v_uid, 'member', 'open');
    perform private.emit('clan_joined', v_uid, jsonb_build_object('clan_id', p_clan_id, 'via', 'open'));
    return row(p_clan_id, 'member', 'member'::public.clan_role, null, true)::public.clan_join_state;
  end if;
  select r.id into v_req from public.clan_join_requests r
   where r.clan_id = p_clan_id and r.user_id = v_uid and r.status = 'pending';
  if v_req is not null then
    return row(p_clan_id, 'requested', null, v_req, false)::public.clan_join_state;
  end if;
  if (select count(*) from public.clan_join_requests r
       where r.user_id = v_uid and r.created_at > now() - interval '24 hours') >= 10 then
    perform private.fail('clan_rate_limited');
  end if;
  insert into public.clan_join_requests (clan_id, user_id, message)
  values (p_clan_id, v_uid, nullif(trim(p_message), ''))
  returning id into v_req;
  perform private.emit('clan_join_requested', v_uid, jsonb_build_object('clan_id', p_clan_id));
  -- Tell the people who can approve it (bundled per clan; never across a block with the asker).
  perform private.notify(
    (select coalesce(array_agg(m.user_id), '{}') from public.clan_members m
      where m.clan_id = p_clan_id and authz.clan_can(p_clan_id, 'admit', m.user_id)),
    'clan_request', 'clan', p_clan_id, v_uid, 'clan_request:' || p_clan_id,
    jsonb_build_object('request_id', v_req));
  return row(p_clan_id, 'requested', null, v_req, true)::public.clan_join_state;
end;
$$;

revoke all on function private.notification_feed(uuid) from public, anon, authenticated;
revoke all on function private.generic_copy(public.notification_type) from public, anon, authenticated;
revoke all on function private.push_throttled_types() from public, anon, authenticated;
revoke all on function private.ensure_ritual_week(uuid, date) from public, anon, authenticated;
revoke all on function authz.can_see_object(public.notification_object, uuid, uuid) from public, anon;
grant execute on function authz.can_see_object(public.notification_object, uuid, uuid) to authenticated, service_role;
