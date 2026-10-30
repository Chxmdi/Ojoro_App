-- Step 8 (Trust): pauses that reach their end date end on their own (and say so); account deletion never
-- fails on a drop-in the placeholder already holds; and notices to a program's hosts about money that
-- needs them (types from 20261031040800). Contract: docs/TRUST_CONTRACT.md ("Notifications",
-- "Account deletion"), docs/PAYMENTS_CONTRACT.md.
--
-- authz.can_see_object, private.generic_copy, private.push_throttled_types and private.notification_feed
-- start from their latest definitions (20261031040600_trust_notifications.sql) and keep every type;
-- anyone redefining them later must start from this file.

-- Money words -----------------------------------------------------------------------------------------------

-- "$20.00" for dollars, "20.00 EUR" otherwise.
create or replace function private.fmt_money(p_cents integer, p_currency text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when upper(coalesce(p_currency, '')) in ('CAD', 'USD', '')
              then '$' || to_char(coalesce(p_cents, 0) / 100.0, 'FM999G999G990D00')
              else to_char(coalesce(p_cents, 0) / 100.0, 'FM999G999G990D00') || ' ' || upper(p_currency) end;
$$;

-- The player a money notice is about, by name, unless a block or a pause hides them ("a player").
create or replace function private.money_person(p_data jsonb, p_viewer uuid, p_capital boolean default false)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select pr.display_name from public.profiles pr
      where pr.id = nullif(p_data ->> 'user_id', '')::uuid and not authz.is_blocked(pr.id, p_viewer)),
    case when p_capital then 'A player' else 'a player' end);
$$;

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
    -- Step 8 trust: your own account only.
    when 'account' then p_id = p_viewer
    -- Step 8 payments notices: the program's owners and co-hosts.
    when 'host_program' then authz.is_program_host(p_id, p_viewer)
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
    -- Step 8 trust.
    when 'account_paused' then 'Your Ojoro account is paused.'
    when 'account_restored' then 'Your Ojoro account is back.'
    when 'appeal_decided' then 'We answered your appeal.'
    when 'host_refund_failed' then 'A refund didn''t go through.'
    when 'host_dispute' then 'A payment to your program has a dispute.'
    when 'host_payouts_paused' then 'Payouts to your program are paused.'
  end;
$$;

create or replace function private.push_throttled_types()
returns public.notification_type[]
language sql
immutable
set search_path = ''
as $$ select array['participant_update', 'need_one_more', 'crew_member_joined', 'mention',
                   'challenge_posts', 'clan_request', 'host_refund_failed', 'host_dispute',
                   'host_payouts_paused']::public.notification_type[] $$;

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
      else null
    end,
    v.data, v.created_at, v.updated_at, v.read_at, v.acted_at
  from valid v
  cross join me;
$$;

-- Payments notices: triggers on the ledger ---------------------------------------------------------------------

create or replace function private.program_hosts(p_program uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(h.user_id), '{}') from public.host_program_hosts h where h.program_id = p_program;
$$;

-- A refund that ends failed (Stripe said so, or the queue gave up after its retries).
create or replace function private.notify_refund_failed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'failed' and old.status is distinct from 'failed' then
    perform private.notify(private.program_hosts(new.program_id), 'host_refund_failed', 'host_program', new.program_id,
                           null, 'host_refund_failed:' || new.program_id,
                           jsonb_build_object('refund_id', new.id, 'user_id', new.user_id,
                                              'amount_cents', new.amount_cents, 'currency', new.currency));
  end if;
  return null;
end;
$$;

drop trigger if exists host_refunds_notify_failed on public.host_refunds;
create trigger host_refunds_notify_failed after update of status on public.host_refunds
  for each row execute function private.notify_refund_failed();

-- A dispute opened, then won or lost (one notice per dispute, updated while unread).
create or replace function private.notify_dispute()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform private.notify(private.program_hosts(new.program_id), 'host_dispute', 'host_program', new.program_id,
                           null, 'host_dispute:' || new.id || ':' || new.status,
                           jsonb_build_object('dispute_id', new.id, 'user_id', new.user_id, 'status', new.status,
                                              'amount_cents', new.amount_cents, 'currency', new.currency));
  end if;
  return null;
end;
$$;

drop trigger if exists host_disputes_notify on public.host_disputes;
create trigger host_disputes_notify after insert or update of status on public.host_disputes
  for each row execute function private.notify_dispute();

-- Payouts stop (Stripe turned payouts off, usually because it needs information).
create or replace function private.notify_payouts_paused()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.payouts_enabled and not new.payouts_enabled then
    perform private.notify(private.program_hosts(new.program_id), 'host_payouts_paused', 'host_program',
                           new.program_id, null, 'host_payouts_paused:' || new.program_id,
                           jsonb_build_object('requirements_due', to_jsonb(new.requirements_due),
                                              'disabled_reason', new.disabled_reason));
  end if;
  return null;
end;
$$;

drop trigger if exists host_payment_accounts_notify on public.host_payment_accounts;
create trigger host_payment_accounts_notify after update of payouts_enabled on public.host_payment_accounts
  for each row execute function private.notify_payouts_paused();

-- Pauses that reach their end date ------------------------------------------------------------------------------

-- Ends every pause past its end date (idempotent): the restore notice goes out through the pause trigger,
-- and it is audited with no actor.
create or replace function private.trust_tick()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
  r record;
begin
  for r in
    update private.account_pauses
       set restored_at = now(), restore_reason = 'Ended on its end date'
     where restored_at is null and ends_at is not null and ends_at <= now()
    returning id, user_id, case_id
  loop
    perform private.audit(null, 'restore_account', 'profile', r.user_id, r.user_id, r.case_id, null,
                          'Ended on its end date', jsonb_build_object('pause_id', r.id, 'automatic', true));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ojoro_trust_tick', '*/5 * * * *', 'select private.trust_tick()');
  else
    raise notice 'pg_cron not available: call private.trust_tick() from a scheduler';
  end if;
end;
$$;

-- Account deletion: the placeholder may hold several drop-ins for one session -----------------------------------
-- (host_charges_drop_in_idx from the host ops schema keeps "one active drop-in per person per session" for
-- everyone else.)

drop index if exists public.host_charges_drop_in_idx;
create unique index host_charges_drop_in_idx on public.host_charges (session_id, user_id)
  where kind = 'drop_in' and status <> 'void' and user_id <> 'f0000000-0000-4000-8000-000000000000'::uuid;

-- Starts from 20261031040700_trust_account_deletion.sql.
create or replace function private.prepare_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_former uuid := private.former_member();
  f record;
begin
  if old.id = v_former then
    raise exception using errcode = 'P0001', message = 'invalid_argument', detail = 'the placeholder stays';
  end if;
  perform set_config('ojoro.account_deletion', old.id::text, true);

  -- What hasn't happened yet is called off (the members are told, as for any cancellation).
  update public.plans set status = 'cancelled', cancelled_at = now()
   where host_id = old.id and status = 'forming';
  update public.activities set status = 'cancelled', cancelled_at = now()
   where host_id = old.id and status = 'confirmed' and starts_at > now();
  update public.clan_runs set status = 'cancelled', cancelled_at = now()
   where coalesce(host_id, created_by) = old.id and status <> 'cancelled' and starts_at > now();
  update public.host_programs set archived_at = now() where created_by = old.id and archived_at is null;

  -- History that would otherwise cascade away with them, and that other rows still point at, stays under
  -- the placeholder: Call-Outs that became Challenge Events, result submissions behind a result, and the
  -- hosts' ledger (charges, refund requests, refunds; the placeholder may hold several drop-ins per session).
  update public.call_outs o set challenger_id = v_former
   where o.challenger_id = old.id and exists (select 1 from public.challenge_events e where e.call_out_id = o.id);
  update public.call_outs o set opponent_id = v_former
   where o.opponent_id = old.id and exists (select 1 from public.challenge_events e where e.call_out_id = o.id);
  update public.challenge_result_submissions set submitted_by = v_former where submitted_by = old.id;
  update public.host_charges set user_id = v_former where user_id = old.id;
  update public.host_refund_requests set user_id = v_former where user_id = old.id;
  update public.host_refunds set user_id = v_former where user_id = old.id;

  -- Every NO ACTION reference: the placeholder where a person is required, null where it is optional.
  for f in
    select c.conrelid::regclass as tbl, a.attname as col, a.attnotnull as required
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and c.confdeltype = 'a'
      and cardinality(c.conkey) = 1
  loop
    execute format('update %s set %I = %L where %I = %L', f.tbl, f.col,
                   case when f.required then v_former end, f.col, old.id);
  end loop;
  return old;
end;
$$;

revoke all on function private.fmt_money(integer, text), private.money_person(jsonb, uuid, boolean),
  private.program_hosts(uuid), private.notify_refund_failed(), private.notify_dispute(), private.notify_payouts_paused(),
  private.trust_tick(), private.prepare_account_deletion(),
  private.generic_copy(public.notification_type), private.push_throttled_types(), private.notification_feed(uuid)
  from public, anon, authenticated;
grant execute on function private.trust_tick() to service_role;
