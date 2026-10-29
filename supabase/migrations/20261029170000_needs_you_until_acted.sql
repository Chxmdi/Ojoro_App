-- Needs you means "not acted on and still valid", not "unread". Updates marks everything read on
-- open, so tying needs_you to read_at dropped every actionable row (and its inline button) the next
-- time the list loaded, and emptied Home's needs-you cards. Unread now only drives the bell and NEW.
-- Mentions have no action to take, so a mention needs you only while it's unread.
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
    case when v.acted_at is null and coalesce(v.still_valid, false) and (v.type <> 'mention' or v.read_at is null) then 'needs_you'
         when v.updated_at >= ((now() at time zone me.tz)::date::timestamp at time zone me.tz) then 'today'
         else 'earlier' end,
    v.acted_at is null and coalesce(v.still_valid, false) and (v.type <> 'mention' or v.read_at is null),
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

