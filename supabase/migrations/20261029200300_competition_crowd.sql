-- Step 5 (Competition, PRD M6): the Challenge Event page and its crowd: follow, WHO TAKES IT?
-- (predictions), THE CROWD (backing), the hype feed (posts and milestones), comments, polls, cheers,
-- organizers and crew lineups. Contract: docs/COMPETITION_CONTRACT.md §Event page.

create type public.challenge_follow_state as (
  event_id uuid,
  following boolean,
  quiet boolean,
  comments_muted boolean,
  follower_count integer
);

create type public.challenge_crowd_state as (
  event_id uuid,
  prediction_count integer,
  -- Null until prediction_min_count people have predicted (privacy threshold).
  prediction_a_pct integer,
  prediction_b_pct integer,
  my_prediction public.team_side,
  predictions_locked boolean,
  backing_a integer,
  backing_b integer,
  my_backing public.team_side,
  changed boolean
);

create type public.challenge_reaction_state as (
  event_id uuid,
  reaction_counts jsonb,
  my_reaction public.reaction_word
);

create type public.comment_respect_state as (
  comment_id uuid,
  respect_count integer,
  respected boolean
);

create type public.challenge_poll_state as (
  poll_id uuid,
  vote_counts integer[],
  total_votes integer,
  my_vote integer,
  closes_at timestamptz
);

-- Helpers ------------------------------------------------------------------------------------------------

create or replace function private.event_for(p_event uuid, p_uid uuid)
returns public.challenge_events
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e public.challenge_events%rowtype;
begin
  select * into v_e from public.challenge_events where id = p_event;
  if not found or not authz.can_see_challenge_event(p_event, p_uid) then
    perform private.fail('challenge_event_not_found');
  end if;
  return v_e;
end;
$$;

create or replace function private.pct(p_part integer, p_total integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_total >= private.prediction_min_count() then round(100.0 * p_part / p_total)::integer end;
$$;

create or replace function private.crowd_state_of(p_event uuid, p_uid uuid, p_changed boolean)
returns public.challenge_crowd_state
language sql
stable
security definer
set search_path = ''
as $$
  select row(
    e.id, e.prediction_a + e.prediction_b,
    private.pct(e.prediction_a, e.prediction_a + e.prediction_b),
    case when private.pct(e.prediction_a, e.prediction_a + e.prediction_b) is not null
         then 100 - private.pct(e.prediction_a, e.prediction_a + e.prediction_b) end,
    (select p.side from public.challenge_predictions p where p.event_id = e.id and p.user_id = p_uid),
    private.predictions_locked(e),
    e.backing_a, e.backing_b,
    (select b.side from public.challenge_backings b where b.event_id = e.id and b.user_id = p_uid),
    p_changed
  )::public.challenge_crowd_state
  from public.challenge_events e where e.id = p_event;
$$;

-- "6 of your Crew back Chimdi": people in any crew with you (not you) who back a side.
create or replace function private.crew_backing(p_event uuid, p_uid uuid, p_side public.team_side)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct b.user_id)::integer
  from public.challenge_backings b
  join public.crew_members m1 on m1.user_id = b.user_id
  join public.crew_members m2 on m2.crew_id = m1.crew_id and m2.user_id = p_uid
  where b.event_id = p_event and b.side = p_side and b.user_id <> p_uid
    and not authz.is_blocked(b.user_id, p_uid);
$$;

-- "Anyone under 23 minutes?" / "22:48" / "5.2 km".
create or replace function private.fmt_value(p_value numeric, p_scoring public.challenge_scoring, p_unit text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    when p_scoring = 'time' and p_value >= 3600 then
      (floor(p_value / 3600))::integer || ':' || lpad((floor(mod(p_value, 3600) / 60))::integer::text, 2, '0')
      || ':' || lpad((floor(mod(p_value, 60)))::integer::text, 2, '0')
    when p_scoring = 'time' then
      (floor(p_value / 60))::integer || ':' || lpad((floor(mod(p_value, 60)))::integer::text, 2, '0')
    when p_scoring = 'distance' then trim(to_char(p_value, 'FM999990.0')) || ' km'
    else trim(to_char(p_value, 'FM999990')) || coalesce(' ' || p_unit, '')
  end;
$$;

-- Read: the event page ------------------------------------------------------------------------------------

-- Everything ChallengeEventHero, Countdown, PredictionBar, CrowdSupport, LiveChallenge, Verifying's
-- header and RecapPoster need, for one event. Stage and situation are computed now.
create or replace function public.challenge_event_view(p_event_id uuid)
returns table (
  id uuid,
  call_out_id uuid,
  stage public.challenge_stage,
  situation text,
  status public.challenge_status,
  server_now timestamptz,
  format public.challenge_format,
  sport_id text,
  sport_name text,
  title text,
  scoring public.challenge_scoring,
  target numeric,
  unit text,
  place_id uuid,
  place_name text,
  place_area text,
  place_city text,
  course_note text,
  starts_at timestamptz,
  time_zone text,
  check_in_opens_at timestamptz,
  audience public.challenge_audience,
  verification public.challenge_verification_method,
  side_size integer,
  rivalry_id uuid,
  rematch_of_event_id uuid,
  a_name text,
  a_user_id uuid,
  a_crew_id uuid,
  a_avatar_path text,
  a_checked_in boolean,
  a_ready boolean,
  a_lineup_count integer,
  b_name text,
  b_user_id uuid,
  b_crew_id uuid,
  b_avatar_path text,
  b_checked_in boolean,
  b_ready boolean,
  b_lineup_count integer,
  accepted_at timestamptz,
  live_at timestamptz,
  ended_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  a_progress numeric,
  b_progress numeric,
  live_period integer,
  progress_updated_at timestamptz,
  progress_logged_by_name text,
  progress_source text,
  follower_count integer,
  i_follow boolean,
  follow_quiet boolean,
  comments_muted boolean,
  prediction_count integer,
  prediction_a_pct integer,
  prediction_b_pct integer,
  my_prediction public.team_side,
  predictions_locked boolean,
  backing_a integer,
  backing_b integer,
  my_backing public.team_side,
  backing_open boolean,
  crew_backing_a integer,
  crew_backing_b integer,
  reaction_counts jsonb,
  my_reaction public.reaction_word,
  comment_count integer,
  my_side public.team_side,
  is_competitor boolean,
  is_captain boolean,
  is_organizer boolean,
  can_post boolean,
  can_comment boolean,
  rivalry_a_wins integer,
  rivalry_b_wins integer,
  rivalry_draws integer,
  rivalry_meetings integer,
  result_a numeric,
  result_b numeric,
  winner_side public.team_side,
  is_draw boolean,
  margin numeric,
  result_note text,
  result_source public.challenge_result_source,
  verified_at timestamptz,
  crowd_called_it boolean,
  crowd_pick_side public.team_side,
  crowd_pick_pct integer,
  watched_count integer,
  pending_rematch_call_out_id uuid,
  rematch_event_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_stage public.challenge_stage := private.challenge_stage(v_e);
  v_low boolean;
  v_lw integer := 0;
  v_hw integer := 0;
  v_dr integer := 0;
  v_n integer := 0;
  v_res public.challenge_results%rowtype;
  v_competitor boolean := authz.is_challenge_competitor(v_e.id, v_uid);
  v_organizer boolean := authz.is_challenge_organizer(v_e.id, v_uid);
begin
  select x.low_wins, x.high_wins, x.draws, x.meetings into v_lw, v_hw, v_dr, v_n
  from private.rivalry_record(v_e.rivalry_id) x;
  v_low := (select r.low_id from public.rivalries r where r.id = v_e.rivalry_id) = coalesce(v_e.a_user_id, v_e.a_crew_id);
  select * into v_res from public.challenge_results r where r.event_id = v_e.id;

  return query
  select
    v_e.id, v_e.call_out_id, v_stage, private.challenge_situation(v_stage), v_e.status, now(),
    v_e.format, v_e.sport_id, s.name, v_e.title, v_e.scoring, v_e.target, v_e.unit,
    v_e.place_id, pl.name, pl.area, pl.city, v_e.course_note, v_e.starts_at, v_e.time_zone, v_e.check_in_opens_at,
    v_e.audience, v_e.verification, v_e.side_size, v_e.rivalry_id, v_e.rematch_of_event_id,
    private.side_name(v_e, 'a'), v_e.a_user_id, v_e.a_crew_id,
    (select pr.avatar_path from public.profiles pr where pr.id = v_e.a_user_id),
    exists (select 1 from public.challenge_competitors c where c.event_id = v_e.id and c.user_id = v_e.a_captain_id and c.checked_in_at is not null),
    exists (select 1 from public.challenge_competitors c where c.event_id = v_e.id and c.user_id = v_e.a_captain_id and c.ready_at is not null),
    (select count(*)::integer from public.challenge_competitors c where c.event_id = v_e.id and c.side = 'a'),
    private.side_name(v_e, 'b'), v_e.b_user_id, v_e.b_crew_id,
    (select pr.avatar_path from public.profiles pr where pr.id = v_e.b_user_id),
    exists (select 1 from public.challenge_competitors c where c.event_id = v_e.id and c.user_id = v_e.b_captain_id and c.checked_in_at is not null),
    exists (select 1 from public.challenge_competitors c where c.event_id = v_e.id and c.user_id = v_e.b_captain_id and c.ready_at is not null),
    (select count(*)::integer from public.challenge_competitors c where c.event_id = v_e.id and c.side = 'b'),
    v_e.accepted_at, v_e.live_at, v_e.ended_at, v_e.completed_at,
    coalesce(v_e.cancelled_at, case when v_stage = 'cancelled' then v_e.starts_at + interval '3 hours' end),
    coalesce(v_e.cancel_reason, case when v_stage = 'cancelled' then 'no_show' end),
    v_e.a_progress, v_e.b_progress, v_e.live_period, v_e.progress_updated_at,
    (select pr.display_name from public.profiles pr where pr.id = v_e.progress_logged_by and not authz.is_blocked(pr.id, v_uid)),
    case when v_e.progress_updated_at is not null then 'participant' end,
    v_e.follower_count,
    f.user_id is not null, coalesce(f.quiet, false), coalesce(f.comments_muted, false),
    v_e.prediction_a + v_e.prediction_b,
    private.pct(v_e.prediction_a, v_e.prediction_a + v_e.prediction_b),
    case when private.pct(v_e.prediction_a, v_e.prediction_a + v_e.prediction_b) is not null
         then 100 - private.pct(v_e.prediction_a, v_e.prediction_a + v_e.prediction_b) end,
    (select p.side from public.challenge_predictions p where p.event_id = v_e.id and p.user_id = v_uid),
    private.predictions_locked(v_e),
    v_e.backing_a, v_e.backing_b,
    (select b.side from public.challenge_backings b where b.event_id = v_e.id and b.user_id = v_uid),
    v_stage not in ('verifying', 'disputed', 'complete', 'cancelled'),
    private.crew_backing(v_e.id, v_uid, 'a'), private.crew_backing(v_e.id, v_uid, 'b'),
    v_e.reaction_counts,
    (select r.reaction from public.challenge_reactions r where r.event_id = v_e.id and r.user_id = v_uid),
    v_e.comment_count,
    private.my_side(v_e, v_uid), v_competitor, v_uid in (v_e.a_captain_id, v_e.b_captain_id), v_organizer,
    (v_competitor or v_organizer) and v_stage not in ('complete', 'cancelled'),
    v_stage <> 'cancelled',
    case when v_low then v_lw else v_hw end, case when v_low then v_hw else v_lw end, v_dr, v_n,
    v_res.a_value, v_res.b_value, v_res.winner_side,
    case when v_res.event_id is not null then v_res.winner_side is null end,
    v_res.margin, v_res.note, v_res.source, v_res.verified_at, v_res.crowd_called_it,
    case when v_res.predicted_a > v_res.predicted_b then 'a'::public.team_side
         when v_res.predicted_b > v_res.predicted_a then 'b'::public.team_side end,
    case when v_res.event_id is not null then
      private.pct(greatest(v_res.predicted_a, v_res.predicted_b), v_res.predicted_a + v_res.predicted_b) end,
    case when v_res.event_id is not null then v_res.watched_count else v_e.follower_count end,
    (select o.id from public.call_outs o
      where o.rematch_of_event_id = v_e.id and o.status = 'proposed' and o.expires_at > now()
        and authz.can_see_call_out(o.id, v_uid)
      order by o.created_at desc limit 1),
    (select x.id from public.challenge_events x where x.rematch_of_event_id = v_e.id order by x.accepted_at desc limit 1)
  from public.sports s
  left join public.places pl on pl.id = v_e.place_id
  left join public.challenge_followers f on f.event_id = v_e.id and f.user_id = v_uid
  where s.id = v_e.sport_id;
end;
$$;

-- Compete · YOUR EVENTS: events you compete in, organize, follow, or your crews are in. Live first,
-- then upcoming by start, then finished in the last 7 days.
create or replace function public.my_challenge_events(p_limit integer default 20)
returns table (
  event_id uuid,
  stage public.challenge_stage,
  situation text,
  relation text,
  format public.challenge_format,
  sport_id text,
  title text,
  starts_at timestamptz,
  time_zone text,
  place_name text,
  a_name text,
  b_name text,
  my_side public.team_side,
  side_size integer,
  follower_count integer,
  scoring public.challenge_scoring,
  target numeric,
  unit text,
  a_progress numeric,
  b_progress numeric,
  live_period integer,
  winner_side public.team_side
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
  select e.id, private.challenge_stage(e), private.challenge_situation(private.challenge_stage(e)),
         case when exists (select 1 from public.challenge_competitors c where c.event_id = e.id and c.user_id = v_uid) then 'competitor'
              when authz.is_challenge_organizer(e.id, v_uid) then 'organizer'
              when authz.is_crew_member(e.a_crew_id, v_uid) or authz.is_crew_member(e.b_crew_id, v_uid) then 'crew'
              else 'following' end,
         e.format, e.sport_id, e.title, e.starts_at, e.time_zone, pl.name,
         private.side_name(e, 'a'), private.side_name(e, 'b'), private.my_side(e, v_uid), e.side_size,
         e.follower_count, e.scoring, e.target, e.unit, e.a_progress, e.b_progress, e.live_period,
         (select r.winner_side from public.challenge_results r where r.event_id = e.id)
  from public.challenge_events e
  left join public.places pl on pl.id = e.place_id
  where (exists (select 1 from public.challenge_competitors c where c.event_id = e.id and c.user_id = v_uid)
         or authz.is_challenge_organizer(e.id, v_uid)
         or authz.is_crew_member(e.a_crew_id, v_uid) or authz.is_crew_member(e.b_crew_id, v_uid)
         or exists (select 1 from public.challenge_followers f where f.event_id = e.id and f.user_id = v_uid))
    and authz.can_see_challenge_event(e.id, v_uid)
    and (e.status in ('scheduled', 'live', 'verifying', 'disputed')
         or coalesce(e.completed_at, e.cancelled_at, e.starts_at) > now() - interval '7 days')
    and (private.challenge_stage(e) <> 'cancelled' or e.starts_at > now() - interval '7 days')
  order by case private.challenge_stage(e) when 'live' then 0 when 'verifying' then 1 when 'disputed' then 1
                                          when 'complete' then 3 when 'cancelled' then 4 else 2 end,
           case when private.challenge_stage(e) in ('complete', 'cancelled') then null else e.starts_at end asc nulls last,
           e.starts_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

-- Follow ------------------------------------------------------------------------------------------------

-- FOLLOW EVENT, or change how: p_quiet (no notifications), p_comments_muted (MUTE COMMENTS). Null
-- leaves a setting as it is. Idempotent.
create or replace function public.follow_challenge_event(
  p_event_id uuid, p_quiet boolean default null, p_comments_muted boolean default null
)
returns public.challenge_follow_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_new boolean;
  v_f public.challenge_followers%rowtype;
begin
  if private.challenge_stage(v_e) in ('cancelled') then
    perform private.fail('challenge_closed');
  end if;
  insert into public.challenge_followers (event_id, user_id, quiet, comments_muted)
  values (v_e.id, v_uid, coalesce(p_quiet, false), coalesce(p_comments_muted, false))
  on conflict (event_id, user_id) do nothing;
  v_new := found;
  if not v_new then
    update public.challenge_followers
       set quiet = coalesce(p_quiet, quiet), comments_muted = coalesce(p_comments_muted, comments_muted)
     where event_id = v_e.id and user_id = v_uid;
  end if;
  select * into v_f from public.challenge_followers where event_id = v_e.id and user_id = v_uid;
  if v_new then
    perform private.challenge_recount(v_e.id);
    perform private.emit('challenge_event_followed', v_uid, jsonb_build_object('event_id', v_e.id, 'quiet', v_f.quiet));
    if (select e.follower_count from public.challenge_events e where e.id = v_e.id) >= 100 then
      perform private.challenge_milestone(v_e.id, 'followers_100', '100 PEOPLE ARE FOLLOWING.');
    end if;
  end if;
  return row(v_e.id, true, v_f.quiet, v_f.comments_muted,
             (select e.follower_count from public.challenge_events e where e.id = v_e.id))::public.challenge_follow_state;
end;
$$;

create or replace function public.unfollow_challenge_event(p_event_id uuid)
returns public.challenge_follow_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
begin
  delete from public.challenge_followers where event_id = v_e.id and user_id = v_uid;
  if found then
    perform private.challenge_recount(v_e.id);
  end if;
  return row(v_e.id, false, false, false,
             (select e.follower_count from public.challenge_events e where e.id = v_e.id))::public.challenge_follow_state;
end;
$$;

-- Predictions and backing ----------------------------------------------------------------------------------

-- WHO TAKES IT? One per person, changeable until the start, locked at LIVE (predictions_locked).
-- Competitors may only pick their own side. Same side again changes nothing. Never money, odds or
-- points: it is a count.
create or replace function public.predict_challenge(p_event_id uuid, p_side public.team_side)
returns public.challenge_crowd_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype;
  v_mine public.team_side;
  v_old public.team_side;
  v_lead_before public.team_side;
  v_lead_after public.team_side;
begin
  perform private.event_for(p_event_id, v_uid);
  if p_side is null then
    perform private.fail('invalid_argument', 'side');
  end if;
  -- Lock the event so the lock-at-LIVE check and the counts can't race with ready_challenge.
  select * into v_e from public.challenge_events where id = p_event_id for update;
  if private.predictions_locked(v_e) then
    perform private.fail('predictions_locked');
  end if;
  v_mine := (select c.side from public.challenge_competitors c where c.event_id = v_e.id and c.user_id = v_uid);
  if v_mine is not null and v_mine <> p_side then
    perform private.fail('prediction_not_allowed');
  end if;
  select p.side into v_old from public.challenge_predictions p where p.event_id = v_e.id and p.user_id = v_uid;
  if v_old = p_side then
    return private.crowd_state_of(v_e.id, v_uid, false);
  end if;
  v_lead_before := case when v_e.prediction_a > v_e.prediction_b then 'a'::public.team_side
                        when v_e.prediction_b > v_e.prediction_a then 'b'::public.team_side end;
  insert into public.challenge_predictions (event_id, user_id, side) values (v_e.id, v_uid, p_side)
  on conflict (event_id, user_id) do update set side = excluded.side, updated_at = now();
  perform private.challenge_recount(v_e.id);
  select * into v_e from public.challenge_events where id = v_e.id;
  v_lead_after := case when v_e.prediction_a > v_e.prediction_b then 'a'::public.team_side
                       when v_e.prediction_b > v_e.prediction_a then 'b'::public.team_side end;
  perform private.emit(case when v_old is null then 'prediction_cast' else 'prediction_changed' end, v_uid,
                       jsonb_build_object('event_id', v_e.id, 'side', p_side, 'competitor', v_mine is not null));
  -- THE CROWD IS CHANGING ITS MIND: the favourite flipped, with 20+ predictions, at most every 6 h.
  if v_lead_before is not null and v_lead_after is not null and v_lead_before <> v_lead_after
     and v_e.prediction_a + v_e.prediction_b >= 20
     and not exists (select 1 from public.challenge_posts p
                     where p.event_id = v_e.id and p.milestone = 'crowd_shift' and p.created_at > now() - interval '6 hours') then
    perform private.challenge_milestone(v_e.id, 'crowd_shift', 'THE CROWD IS CHANGING ITS MIND.');
  end if;
  return private.crowd_state_of(v_e.id, v_uid, true);
end;
$$;

-- BACK (support), separate from the prediction. p_side null stops backing. Open until the result is
-- being verified. Never affects scoring.
create or replace function public.back_challenge(p_event_id uuid, p_side public.team_side)
returns public.challenge_crowd_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_mine public.team_side;
  v_old public.team_side;
begin
  if private.challenge_stage(v_e) in ('verifying', 'disputed', 'complete', 'cancelled') then
    perform private.fail('backing_closed');
  end if;
  v_mine := (select c.side from public.challenge_competitors c where c.event_id = v_e.id and c.user_id = v_uid);
  if v_mine is not null and p_side is not null and v_mine <> p_side then
    perform private.fail('prediction_not_allowed');
  end if;
  select b.side into v_old from public.challenge_backings b where b.event_id = v_e.id and b.user_id = v_uid;
  if v_old is not distinct from p_side then
    return private.crowd_state_of(v_e.id, v_uid, false);
  end if;
  if p_side is null then
    delete from public.challenge_backings where event_id = v_e.id and user_id = v_uid;
  else
    insert into public.challenge_backings (event_id, user_id, side) values (v_e.id, v_uid, p_side)
    on conflict (event_id, user_id) do update set side = excluded.side, updated_at = now();
  end if;
  perform private.challenge_recount(v_e.id);
  perform private.emit('backing_selected', v_uid, jsonb_build_object('event_id', v_e.id, 'side', p_side,
                                                                     'changed', v_old is not null));
  return private.crowd_state_of(v_e.id, v_uid, true);
end;
$$;

-- Hype feed ------------------------------------------------------------------------------------------------

-- Competitors and approved organizers post (statement, training, progress, logistics), from
-- acceptance until the result is final. Training/progress may carry the numbers the author chose:
-- {"distance_km": 5.2, "time_seconds": 1428}. 6 a minute. Followers get one bundled notification.
create or replace function public.post_challenge_update(
  p_event_id uuid,
  p_kind public.challenge_post_kind,
  p_body text,
  p_idempotency_key uuid,
  p_stats jsonb default null
)
returns public.challenge_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_e public.challenge_events%rowtype;
  v_competitor boolean;
  v_p public.challenge_posts%rowtype;
  v_key text;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'post_challenge_update:' || p_event_id);
  if v_prior is not null then
    return jsonb_populate_record(null::public.challenge_posts, v_prior);
  end if;
  v_e := private.event_for(p_event_id, v_uid);
  v_competitor := authz.is_challenge_competitor(v_e.id, v_uid);
  if not v_competitor and not authz.is_challenge_organizer(v_e.id, v_uid) then
    perform private.fail('not_competitor');
  end if;
  if private.challenge_stage(v_e) in ('complete', 'cancelled') then
    perform private.fail('challenge_closed');
  end if;
  if p_kind is null or p_kind = 'system' or (not v_competitor and p_kind = 'training') then
    perform private.fail('invalid_argument', 'kind');
  end if;
  if p_body is null or char_length(trim(p_body)) not between 1 and 280 then
    perform private.fail('message_invalid', '1-280');
  end if;
  if p_stats is not null then
    if p_kind not in ('training', 'progress') or jsonb_typeof(p_stats) <> 'object' then
      perform private.fail('invalid_argument', 'stats');
    end if;
    for v_key in select jsonb_object_keys(p_stats) loop
      if v_key not in ('distance_km', 'time_seconds') or jsonb_typeof(p_stats -> v_key) <> 'number' then
        perform private.fail('invalid_argument', 'stats');
      end if;
    end loop;
    if (p_stats ->> 'distance_km')::numeric not between 0 and 1000
       or (p_stats ->> 'time_seconds')::numeric not between 0 and 86400 then
      perform private.fail('invalid_argument', 'stats');
    end if;
  end if;
  if (select count(*) from public.challenge_posts p
      where p.author_id = v_uid and p.created_at > now() - interval '1 minute') >= 6 then
    perform private.fail('message_rate_limited', '6');
  end if;
  insert into public.challenge_posts (event_id, author_id, kind, body, stats)
  values (v_e.id, v_uid, p_kind, trim(p_body), p_stats)
  returning * into v_p;
  perform private.notify(private.challenge_audience_ids(v_e.id), 'challenge_posts', 'challenge_event', v_e.id,
                         v_uid, 'challenge_posts:' || v_e.id, '{}');
  perform private.emit('challenge_post_created', v_uid, jsonb_build_object(
    'event_id', v_e.id, 'kind', p_kind, 'role', case when v_competitor then 'competitor' else 'organizer' end,
    'has_stats', p_stats is not null));
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_p));
  return v_p;
end;
$$;

-- The author removes a post (soft). A captain may remove an organizer's post. Milestones stay.
create or replace function public.delete_challenge_post(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_p public.challenge_posts%rowtype;
  v_e public.challenge_events%rowtype;
begin
  select * into v_p from public.challenge_posts where id = p_post_id for update;
  if not found or not authz.can_see_challenge_event(v_p.event_id, v_uid) then
    perform private.fail('post_not_found');
  end if;
  if v_p.deleted_at is not null then
    return true;
  end if;
  select * into v_e from public.challenge_events where id = v_p.event_id;
  if v_p.kind = 'system'
     or (v_p.author_id <> v_uid
         and not (v_uid in (v_e.a_captain_id, v_e.b_captain_id) and authz.is_challenge_organizer(v_e.id, v_p.author_id))) then
    perform private.fail('not_author');
  end if;
  update public.challenge_posts set deleted_at = now(), body = null, stats = null where id = v_p.id;
  return true;
end;
$$;

-- The BUILD-UP feed: posts and milestones, newest first. Pass the oldest id you hold as p_before.
create or replace function public.challenge_feed(p_event_id uuid, p_before uuid default null, p_limit integer default 30)
returns table (
  id uuid,
  kind public.challenge_post_kind,
  milestone text,
  author_id uuid,
  author_name text,
  author_avatar_path text,
  author_role text,
  author_side public.team_side,
  body text,
  stats jsonb,
  comment_count integer,
  is_mine boolean,
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
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_before timestamptz;
begin
  if p_before is not null then
    select p.created_at into v_before from public.challenge_posts p where p.id = p_before and p.event_id = v_e.id;
  end if;
  return query
  select p.id, p.kind, p.milestone, p.author_id, pr.display_name, pr.avatar_path,
         case when p.author_id is null then 'system'
              when c.user_id is not null then 'competitor' else 'organizer' end,
         c.side, p.body, p.stats,
         (select count(*)::integer from public.challenge_comments x
           where x.post_id = p.id and x.deleted_at is null and not authz.is_blocked(x.author_id, v_uid)),
         p.author_id = v_uid, p.deleted_at is not null, p.created_at
  from public.challenge_posts p
  left join public.profiles pr on pr.id = p.author_id
  left join public.challenge_competitors c on c.event_id = p.event_id and c.user_id = p.author_id
  where p.event_id = v_e.id
    and (p.author_id is null or not authz.is_blocked(p.author_id, v_uid))
    and (v_before is null or p.created_at < v_before)
  order by p.created_at desc, p.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

-- The Crowd (comments) -------------------------------------------------------------------------------------

-- Anyone who can see the event comments on it or on a post (p_post_id), and replies one level deep
-- (p_parent_id). 1–500 characters, 10 a minute. Until the event is cancelled.
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
  perform private.emit('challenge_comment_created', v_uid, jsonb_build_object(
    'event_id', v_e.id, 'reply', p_parent_id is not null, 'on_post', p_post_id is not null,
    'competitor', authz.is_challenge_competitor(v_e.id, v_uid)));
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_c));
  return v_c;
end;
$$;

-- The author, or a captain of the event (moderation), removes a comment (soft). Idempotent.
create or replace function public.delete_challenge_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_c public.challenge_comments%rowtype;
  v_e public.challenge_events%rowtype;
begin
  select * into v_c from public.challenge_comments where id = p_comment_id for update;
  if not found or not authz.can_see_challenge_event(v_c.event_id, v_uid) or authz.is_blocked(v_c.author_id, v_uid) then
    perform private.fail('comment_not_found');
  end if;
  if v_c.deleted_at is not null then
    return true;
  end if;
  select * into v_e from public.challenge_events where id = v_c.event_id;
  if v_c.author_id <> v_uid and v_uid not in (v_e.a_captain_id, v_e.b_captain_id) then
    perform private.fail('not_author');
  end if;
  update public.challenge_comments set deleted_at = now(), body = null where id = v_c.id;
  if v_c.parent_id is not null then
    update public.challenge_comments set reply_count = greatest(reply_count - 1, 0) where id = v_c.parent_id;
  end if;
  perform private.challenge_recount(v_e.id);
  return true;
end;
$$;

-- RESPECT (the only like). Toggles: tap again to take it back. Don't retry blindly.
create or replace function public.respect_challenge_comment(p_comment_id uuid)
returns public.comment_respect_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_c public.challenge_comments%rowtype;
  v_on boolean;
begin
  select * into v_c from public.challenge_comments where id = p_comment_id for update;
  if not found or v_c.deleted_at is not null or not authz.can_see_challenge_event(v_c.event_id, v_uid)
     or authz.is_blocked(v_c.author_id, v_uid) then
    perform private.fail('comment_not_found');
  end if;
  delete from public.challenge_comment_respects where comment_id = v_c.id and user_id = v_uid;
  v_on := not found;
  if v_on then
    insert into public.challenge_comment_respects (comment_id, user_id) values (v_c.id, v_uid);
  end if;
  update public.challenge_comments
     set respect_count = (select count(*) from public.challenge_comment_respects r where r.comment_id = v_c.id)
   where id = v_c.id
  returning respect_count into v_c.respect_count;
  return row(v_c.id, v_c.respect_count, v_on)::public.comment_respect_state;
end;
$$;

-- THE CROWD · n. A page of top-level comments (newest first; p_post_id for one post's thread), each
-- followed by its replies (oldest first). Blocked authors, and replies under them, are left out.
create or replace function public.challenge_comments(
  p_event_id uuid, p_before uuid default null, p_limit integer default 20, p_post_id uuid default null
)
returns table (
  id uuid,
  parent_id uuid,
  post_id uuid,
  author_id uuid,
  author_name text,
  author_avatar_path text,
  author_badge text,
  author_side public.team_side,
  body text,
  respect_count integer,
  respected boolean,
  reply_count integer,
  is_mine boolean,
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
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_before timestamptz;
begin
  if p_before is not null then
    select c.created_at into v_before from public.challenge_comments c where c.id = p_before and c.event_id = v_e.id;
  end if;
  return query
  with top as (
    select c.* from public.challenge_comments c
    where c.event_id = v_e.id and c.parent_id is null
      and (p_post_id is null or c.post_id = p_post_id)
      and not authz.is_blocked(c.author_id, v_uid)
      and (v_before is null or c.created_at < v_before)
    order by c.created_at desc, c.id
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  ),
  thread as (
    select t.*, t.created_at as thread_at, t.id as thread_id, 0 as depth from top t
    union all
    select r.*, t.created_at, t.id, 1 from public.challenge_comments r
    join top t on r.parent_id = t.id
    where not authz.is_blocked(r.author_id, v_uid)
  )
  select x.id, x.parent_id, x.post_id, x.author_id, pr.display_name, pr.avatar_path,
         case when cc.user_id is not null then 'competitor'
              when authz.is_challenge_organizer(v_e.id, x.author_id) then 'organizer' end,
         cc.side, x.body, x.respect_count,
         exists (select 1 from public.challenge_comment_respects r where r.comment_id = x.id and r.user_id = v_uid),
         x.reply_count, x.author_id = v_uid, x.deleted_at is not null, x.created_at
  from thread x
  join public.profiles pr on pr.id = x.author_id
  left join public.challenge_competitors cc on cc.event_id = x.event_id and cc.user_id = x.author_id
  order by x.thread_at desc, x.thread_id, x.depth, x.created_at;
end;
$$;

-- CHEER THEM ON -------------------------------------------------------------------------------------------

-- One word per person per event; the same word again takes it back. Toggles: don't retry blindly.
create or replace function public.react_challenge(p_event_id uuid, p_reaction public.reaction_word)
returns public.challenge_reaction_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_old public.reaction_word;
begin
  if p_reaction is null then
    perform private.fail('invalid_argument', 'reaction');
  end if;
  if private.challenge_stage(v_e) = 'cancelled' then
    perform private.fail('challenge_closed');
  end if;
  select r.reaction into v_old from public.challenge_reactions r where r.event_id = v_e.id and r.user_id = v_uid;
  if v_old = p_reaction then
    delete from public.challenge_reactions where event_id = v_e.id and user_id = v_uid;
  else
    insert into public.challenge_reactions (event_id, user_id, reaction) values (v_e.id, v_uid, p_reaction)
    on conflict (event_id, user_id) do update set reaction = excluded.reaction, created_at = now();
  end if;
  perform private.challenge_recount(v_e.id);
  return row(v_e.id, (select e.reaction_counts from public.challenge_events e where e.id = v_e.id),
             case when v_old = p_reaction then null else p_reaction end)::public.challenge_reaction_state;
end;
$$;

-- Polls ----------------------------------------------------------------------------------------------------

-- A poll from the allowlist (PRD §10.8), by a competitor or organizer, before predictions lock.
-- The server writes the question and options:
--   winner       "Who wins?"                         · the two names
--   margin       "How close will it be?"             · three bands for the scoring
--   performance  "Anyone under 23 minutes?" (time) / "Anyone past 10 km?" / "Anyone past 5 points?"
--                · "Yes, at least one" / "Neither"; needs p_threshold (seconds, km or points)
--   first_score  "Who scores first?" (score only)   · the two names
--   rematch      "Does the loser ask for a rematch?" · "Yes" / "No"
-- Closes at p_closes_at (default and latest: the start). One poll per template per event.
create or replace function public.create_challenge_poll(
  p_event_id uuid,
  p_template public.challenge_poll_template,
  p_threshold numeric default null,
  p_closes_at timestamptz default null
)
returns public.challenge_polls
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_q text;
  v_opts text[];
  v_poll public.challenge_polls%rowtype;
  v_closes timestamptz := coalesce(p_closes_at, v_e.starts_at);
begin
  if not authz.is_challenge_competitor(v_e.id, v_uid) and not authz.is_challenge_organizer(v_e.id, v_uid) then
    perform private.fail('not_competitor');
  end if;
  if private.predictions_locked(v_e) then
    perform private.fail('challenge_started');
  end if;
  if v_closes <= now() or v_closes > v_e.starts_at then
    perform private.fail('invalid_argument', 'closes_at');
  end if;
  case p_template
    when 'winner' then
      v_q := 'Who wins?';
      v_opts := array[private.side_name(v_e, 'a'), private.side_name(v_e, 'b')];
    when 'margin' then
      v_q := 'How close will it be?';
      v_opts := case v_e.scoring
        when 'time' then array['Under 30 s', '30 s to 2 min', 'Over 2 min']
        when 'distance' then array['Under 0.5 km', '0.5 to 2 km', 'Over 2 km']
        else array['One in it', 'Two or three', 'Four or more'] end;
    when 'performance' then
      if p_threshold is null or p_threshold <= 0 or v_e.scoring = 'rounds' then
        perform private.fail('invalid_argument', 'threshold');
      end if;
      v_q := case v_e.scoring
        when 'time' then 'Anyone under ' ||
          case when mod(p_threshold, 60) = 0 then (p_threshold / 60)::integer || ' minutes'
               else private.fmt_value(p_threshold, 'time', null) end || '?'
        when 'distance' then 'Anyone past ' || private.fmt_value(p_threshold, 'distance', null) || '?'
        else 'Anyone past ' || trim(to_char(p_threshold, 'FM999990')) || ' points?' end;
      v_opts := array['Yes, at least one', 'Neither'];
    when 'first_score' then
      if v_e.scoring <> 'score' then
        perform private.fail('invalid_argument', 'template');
      end if;
      v_q := 'Who scores first?';
      v_opts := array[private.side_name(v_e, 'a'), private.side_name(v_e, 'b')];
    when 'rematch' then
      v_q := 'Does the loser ask for a rematch?';
      v_opts := array['Yes', 'No'];
  end case;
  insert into public.challenge_polls (event_id, template, question, options, vote_counts, threshold, created_by, closes_at)
  values (v_e.id, p_template, v_q, v_opts, array_fill(0, array[cardinality(v_opts)]),
          case when p_template = 'performance' then p_threshold end, v_uid, v_closes)
  on conflict (event_id, template) do nothing
  returning * into v_poll;
  if v_poll.id is null then
    perform private.fail('poll_exists');
  end if;
  return v_poll;
end;
$$;

-- Vote, or change your vote, until the poll closes.
create or replace function public.vote_challenge_poll(p_poll_id uuid, p_option integer)
returns public.challenge_poll_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_poll public.challenge_polls%rowtype;
begin
  select * into v_poll from public.challenge_polls where id = p_poll_id for update;
  if not found or not authz.can_see_challenge_event(v_poll.event_id, v_uid) then
    perform private.fail('option_not_found');
  end if;
  if v_poll.closes_at <= now() then
    perform private.fail('poll_closed');
  end if;
  if p_option is null or p_option < 0 or p_option >= cardinality(v_poll.options) then
    perform private.fail('option_not_found');
  end if;
  insert into public.challenge_poll_votes (poll_id, user_id, option_index) values (v_poll.id, v_uid, p_option)
  on conflict (poll_id, user_id) do update set option_index = excluded.option_index, created_at = now();
  update public.challenge_polls p
     set vote_counts = (select array_agg((select count(*) from public.challenge_poll_votes v
                                           where v.poll_id = p.id and v.option_index = i - 1)::integer order by i)
                          from generate_series(1, cardinality(p.options)) i)
   where p.id = v_poll.id
  returning * into v_poll;
  perform private.emit('challenge_poll_voted', v_uid, jsonb_build_object('poll_id', v_poll.id, 'template', v_poll.template));
  return row(v_poll.id, v_poll.vote_counts, (select sum(x)::integer from unnest(v_poll.vote_counts) x),
             p_option, v_poll.closes_at)::public.challenge_poll_state;
end;
$$;

create or replace function public.challenge_polls(p_event_id uuid)
returns table (
  id uuid,
  template public.challenge_poll_template,
  question text,
  options text[],
  vote_counts integer[],
  total_votes integer,
  my_vote integer,
  closes_at timestamptz,
  is_closed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
begin
  return query
  select p.id, p.template, p.question, p.options, p.vote_counts,
         coalesce((select sum(x)::integer from unnest(p.vote_counts) x), 0),
         (select v.option_index from public.challenge_poll_votes v where v.poll_id = p.id and v.user_id = v_uid),
         p.closes_at, p.closes_at <= now()
  from public.challenge_polls p
  where p.event_id = v_e.id
  order by p.created_at;
end;
$$;

-- Organizers and lineups ------------------------------------------------------------------------------------

-- A captain proposes an organizer; the other side's captain proposing the same person approves
-- them. Returns true once approved. Organizers post updates; they never compete or verify.
create or replace function public.propose_challenge_organizer(p_event_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_side public.team_side := private.captain_side(v_e, v_uid);
  v_o public.challenge_organizers%rowtype;
begin
  if v_side is null then
    perform private.fail('not_competitor');
  end if;
  if private.challenge_stage(v_e) in ('complete', 'cancelled') then
    perform private.fail('challenge_closed');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id)
     or authz.is_challenge_competitor(v_e.id, p_user_id)
     or authz.is_blocked(p_user_id, v_e.a_captain_id) or authz.is_blocked(p_user_id, v_e.b_captain_id) then
    perform private.fail('organizer_not_allowed');
  end if;
  select * into v_o from public.challenge_organizers where event_id = v_e.id and user_id = p_user_id for update;
  if not found then
    insert into public.challenge_organizers (event_id, user_id, proposed_by, proposed_side)
    values (v_e.id, p_user_id, v_uid, v_side);
    return false;
  end if;
  if v_o.approved_at is null and v_o.proposed_side <> v_side then
    update public.challenge_organizers set approved_at = now() where event_id = v_e.id and user_id = p_user_id;
    return true;
  end if;
  return v_o.approved_at is not null;
end;
$$;

-- Either captain removes an organizer (or withdraws a proposal). Idempotent.
create or replace function public.remove_challenge_organizer(p_event_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
begin
  if private.captain_side(v_e, v_uid) is null and v_uid <> p_user_id then
    perform private.fail('not_competitor');
  end if;
  delete from public.challenge_organizers where event_id = v_e.id and user_id = p_user_id;
  return true;
end;
$$;

-- Crew vs crew: a member of a side's crew joins that side's lineup (up to side_size) before LIVE.
create or replace function public.join_challenge_lineup(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_side public.team_side;
  v_n integer;
begin
  if v_e.format <> 'crew_vs_crew' then
    perform private.fail('invalid_argument', 'format');
  end if;
  v_side := case when authz.is_crew_member(v_e.a_crew_id, v_uid) then 'a'::public.team_side
                 when authz.is_crew_member(v_e.b_crew_id, v_uid) then 'b'::public.team_side end;
  if v_side is null then
    perform private.fail('not_competitor');
  end if;
  if v_e.status <> 'scheduled' or private.challenge_stage(v_e) = 'cancelled' then
    perform private.fail('challenge_started');
  end if;
  -- Serialize joins per event so the lineup can't overfill.
  perform 1 from public.challenge_events where id = v_e.id for update;
  if not exists (select 1 from public.challenge_competitors c where c.event_id = v_e.id and c.user_id = v_uid) then
    if (select count(*) from public.challenge_competitors c where c.event_id = v_e.id and c.side = v_side) >= v_e.side_size then
      perform private.fail('lineup_full', v_e.side_size::text);
    end if;
    insert into public.challenge_competitors (event_id, user_id, side) values (v_e.id, v_uid, v_side);
    -- Competitors don't predict the other side: a pick for the other side goes.
    delete from public.challenge_predictions where event_id = v_e.id and user_id = v_uid and side <> v_side;
    delete from public.challenge_backings where event_id = v_e.id and user_id = v_uid and side <> v_side;
    perform private.challenge_recount(v_e.id);
    perform private.emit('challenge_lineup_joined', v_uid, jsonb_build_object(
      'event_id', v_e.id, 'was_following', exists (select 1 from public.challenge_followers f
                                                  where f.event_id = v_e.id and f.user_id = v_uid)));
  end if;
  return (select count(*)::integer from public.challenge_competitors c where c.event_id = v_e.id and c.side = v_side);
end;
$$;

create or replace function public.leave_challenge_lineup(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
begin
  if v_uid in (v_e.a_captain_id, v_e.b_captain_id) then
    perform private.fail('invalid_argument', 'captains stay in the lineup');
  end if;
  if v_e.status <> 'scheduled' then
    perform private.fail('challenge_started');
  end if;
  delete from public.challenge_competitors where event_id = v_e.id and user_id = v_uid;
  return true;
end;
$$;
