-- Polish (GAPS-FEED): reply and @mention notifications for Challenge comments (the gap listed in
-- docs/COMPETITION_CONTRACT.md "Not built" and docs/DESIGN_DECISIONS.md "Step 5 backend").
--   challenge_reply   the author of the comment you replied to (bundled per event: challenge_reply:{event})
--   challenge_mention people you @handle in a comment who can see the event (challenge_mention:{event})
-- Both are push-throttled like chat mentions (once per bundle per 30 min), link to /event/{id}, never
-- need you, and go away when the comment is deleted. Contract: docs/COMPETITION_CONTRACT.md ("Notifications").
--
-- private.generic_copy, private.push_throttled_types and private.notification_feed start from their
-- latest definitions (20261031040900_trust_followups.sql) and keep every type; anyone redefining them
-- later must start from this file. comment_on_challenge starts from 20261029200300_competition_crowd.sql.

-- Whether p_uid follows the event with MUTE COMMENTS on.
create or replace function private.comments_muted(p_event uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.challenge_followers f
                 where f.event_id = p_event and f.user_id = p_uid and f.comments_muted);
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
    -- Step 8 trust.
    when 'account_paused' then 'Your Ojoro account is paused.'
    when 'account_restored' then 'Your Ojoro account is back.'
    when 'appeal_decided' then 'We answered your appeal.'
    when 'host_refund_failed' then 'A refund didn''t go through.'
    when 'host_dispute' then 'A payment to your program has a dispute.'
    when 'host_payouts_paused' then 'Payouts to your program are paused.'
    -- Polish (GAPS-FEED): the crowd under a Challenge Event.
    when 'challenge_reply' then 'Someone replied to your comment.'
    when 'challenge_mention' then 'You were mentioned in a comment.'
  end;
$$;

create or replace function private.push_throttled_types()
returns public.notification_type[]
language sql
immutable
set search_path = ''
as $$ select array['participant_update', 'need_one_more', 'crew_member_joined', 'mention',
                   'challenge_posts', 'clan_request', 'host_refund_failed', 'host_dispute',
                   'host_payouts_paused', 'challenge_reply', 'challenge_mention']::public.notification_type[] $$;

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
      -- Polish (GAPS-FEED): a reply or mention goes away with its comment.
      and not (n.type in ('challenge_reply', 'challenge_mention') and exists (
                 select 1 from public.challenge_comments cc
                 where cc.id = nullif(n.data ->> 'comment_id', '')::uuid and cc.deleted_at is not null))
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
      -- Step 8 trust: the paused screen shows itself; the rest open You.
      when v.type in ('account_restored', 'appeal_decided') then '/you'
      when v.object_kind = 'host_program' then '/host/' || v.object_id || '/payments'
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
      -- Step 8 trust.
      when 'account_paused' then 'Your account is paused.'
      when 'account_restored' then 'Your account is back.'
      when 'appeal_decided' then
        case v.data ->> 'decision' when 'upheld' then 'We agreed with your appeal.'
             else 'We looked again and kept our decision.' end
      -- Step 8 payments notices (the player by name unless a block says otherwise).
      when 'host_refund_failed' then
        case when v.count > 1 then v.count || ' refunds didn''t go through.'
             else 'A refund to ' || private.money_person(v.data, p_uid) || ' didn''t go through.' end
      when 'host_dispute' then
        case v.data ->> 'status'
          when 'won' then 'You won the dispute with ' || private.money_person(v.data, p_uid) || '.'
          when 'lost' then 'The dispute with ' || private.money_person(v.data, p_uid) || ' went their way.'
          else private.money_person(v.data, p_uid, true) || ' disputed a payment.' end
      when 'host_payouts_paused' then 'Payouts are paused for ' || coalesce(
        (select hp.name from public.host_programs hp where hp.id = v.object_id), 'your program') || '.'
      -- Polish (GAPS-FEED): replies and mentions in a Challenge Event's crowd (bundled per event).
      when 'challenge_reply' then
        case when greatest(v.actor_count - (cardinality(v.actor_ids) - cardinality(v.visible_actors)), 1) > 1
               then coalesce(v.names[1], 'Someone') || ' and '
                    || (greatest(v.actor_count - (cardinality(v.actor_ids) - cardinality(v.visible_actors)), 1) - 1)
                    || ' more replied to you.'
             when v.count > 1 then coalesce(v.names[1], 'Someone') || ' replied to you ' || v.count || ' times.'
             else coalesce(v.names[1], 'Someone') || ' replied to your comment.' end
      when 'challenge_mention' then
        case when greatest(v.actor_count - (cardinality(v.actor_ids) - cardinality(v.visible_actors)), 1) > 1
               then coalesce(v.names[1], 'Someone') || ' and '
                    || (greatest(v.actor_count - (cardinality(v.actor_ids) - cardinality(v.visible_actors)), 1) - 1)
                    || ' more mentioned you.'
             else coalesce(v.names[1], 'Someone') || ' mentioned you.' end
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
      -- Step 8 trust.
      when 'account_paused' then
        case when nullif(v.data ->> 'ends_at', '') is null then 'Until Ojoro restores it. You can appeal in the app.'
             else 'Until ' || to_char((v.data ->> 'ends_at')::timestamptz at time zone me.tz, 'FMDD FMMonth')
                  || '. You can appeal in the app.' end
      when 'account_restored' then 'Everything is as you left it.'
      when 'appeal_decided' then coalesce(nullif(v.data ->> 'note', ''),
        case v.data ->> 'kind'
          when 'show_up' then case v.data ->> 'decision' when 'upheld' then 'Your show-up record is corrected.'
                                   else 'Your show-up record stays as it was.' end
          when 'content_hidden' then case v.data ->> 'decision' when 'upheld' then 'What you posted is back.'
                                          else 'What you posted stays hidden.' end
          else case v.data ->> 'decision' when 'upheld' then 'Your account is back.'
                    else 'Your account stays paused.' end end)
      when 'host_refund_failed' then
        private.fmt_money((v.data ->> 'amount_cents')::integer, v.data ->> 'currency')
        || '. Stripe couldn''t send it and Ojoro has stopped trying. Sort it out with them, then record it in your ledger.'
      when 'host_dispute' then
        private.fmt_money((v.data ->> 'amount_cents')::integer, v.data ->> 'currency') || case v.data ->> 'status'
          when 'won' then ' stays in your payout.'
          when 'lost' then ' comes off your next payout.'
          else ' is held until their bank decides. Answer in your Stripe dashboard.' end
      when 'host_payouts_paused' then 'Stripe needs more information. Open payments to finish it.'
      when 'challenge_reply' then v.ce_vs || ' · ' || (v.ce_row).title || '. Open the crowd to reply.'
      when 'challenge_mention' then v.ce_vs || ' · ' || (v.ce_row).title || '. Open the crowd to reply.'
      else null
    end,
    v.data, v.created_at, v.updated_at, v.read_at, v.acted_at
  from valid v
  cross join me;
$$;

create or replace function public.comment_on_challenge(
  p_event_id uuid,
  p_body text,
  p_idempotency_key uuid,
  p_parent_id uuid default null,
  p_post_id uuid default null
)
returns public.challenge_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_e public.challenge_events%rowtype;
  v_parent public.challenge_comments%rowtype;
  v_c public.challenge_comments%rowtype;
  v_mentions uuid[];
  v_replied uuid;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'comment_on_challenge:' || p_event_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.challenge_comments, v_prior);
  end if;
  v_e := private.event_for(p_event_id, v_uid);
  if private.challenge_stage(v_e) = 'cancelled' then
    perform private.fail('challenge_closed');
  end if;
  if p_body is null or char_length(trim(p_body)) not between 1 and 500 then
    perform private.fail('message_invalid', '1-500');
  end if;
  if p_parent_id is not null then
    select * into v_parent from public.challenge_comments where id = p_parent_id for update;
    if not found or v_parent.event_id <> v_e.id or v_parent.deleted_at is not null
       or authz.is_blocked(v_parent.author_id, v_uid) then
      perform private.fail('comment_not_found');
    end if;
    if v_parent.parent_id is not null then
      perform private.fail('invalid_argument', 'replies are one level deep');
    end if;
  end if;
  if p_post_id is not null and not exists (
       select 1 from public.challenge_posts p where p.id = p_post_id and p.event_id = v_e.id and p.deleted_at is null) then
    perform private.fail('post_not_found');
  end if;
  if (select count(*) from public.challenge_comments c
      where c.author_id = v_uid and c.created_at > now() - interval '1 minute') >= 10 then
    perform private.fail('message_rate_limited', '10');
  end if;
  insert into public.challenge_comments (event_id, post_id, parent_id, author_id, body)
  values (v_e.id, coalesce(p_post_id, v_parent.post_id), p_parent_id, v_uid, trim(p_body))
  returning * into v_c;
  if p_parent_id is not null then
    update public.challenge_comments set reply_count = reply_count + 1 where id = p_parent_id;
  end if;
  perform private.challenge_recount(v_e.id);

  -- Polish (GAPS-FEED): the person replied to, and anyone @mentioned, hears about it. private.notify
  -- skips the author, blocks either way (and pauses) and anyone who can't see the event; MUTE COMMENTS
  -- on the event means no comment notifications either. A reply that also mentions its parent's
  -- author notifies once, as a reply.
  if p_parent_id is not null and v_parent.author_id <> v_uid
     and not private.comments_muted(v_e.id, v_parent.author_id) then
    v_replied := v_parent.author_id;
    perform private.notify(array[v_parent.author_id], 'challenge_reply', 'challenge_event', v_e.id, v_uid,
      'challenge_reply:' || v_e.id, jsonb_build_object('comment_id', v_c.id, 'parent_id', p_parent_id));
  end if;
  select coalesce(array_agg(distinct pr.id), '{}') into v_mentions
  from public.profiles pr
  where pr.handle in (select lower(m[1]) from regexp_matches(v_c.body, '@([A-Za-z0-9_]{2,24})', 'g') m)
    and pr.id <> v_uid
    and pr.id is distinct from v_replied
    and not private.comments_muted(v_e.id, pr.id);
  v_mentions := v_mentions[1:10];
  if cardinality(v_mentions) > 0 then
    perform private.notify(v_mentions, 'challenge_mention', 'challenge_event', v_e.id, v_uid,
      'challenge_mention:' || v_e.id, jsonb_build_object('comment_id', v_c.id));
  end if;

  -- No words, no recipients.
  perform private.emit('challenge_comment_created', v_uid, jsonb_build_object(
    'event_id', v_e.id, 'reply', p_parent_id is not null, 'on_post', p_post_id is not null,
    'competitor', authz.is_challenge_competitor(v_e.id, v_uid), 'mentions', cardinality(v_mentions)));
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_c));
  return v_c;
end;
$$;

revoke all on function private.comments_muted(uuid, uuid) from public, anon, authenticated;
revoke all on function private.notification_feed(uuid) from public, anon, authenticated;
revoke all on function private.generic_copy(public.notification_type) from public, anon, authenticated;
revoke all on function private.push_throttled_types() from public, anon, authenticated;
