-- Step 7 (Places & Passport): Passport reads. Contract: docs/PASSPORT_CONTRACT.md.
--
-- passport_view (totals, places, sports, months, firsts and milestones, personal bests), passport_stamps
-- (the stamps, filtered by place / sport / month), passport_achievements (derived from history; no points,
-- nothing redeemable), passport_reputation (signals past the evidence threshold, show-up record) and
-- challenge_passport_for_me (the Result screen's PB and Passport row).
--
-- Privacy: everything about someone else's Passport follows their history setting
-- (authz.can_see_part(owner, 'history')), and nothing at all crosses a block. Places are public places
-- (areas, not addresses). Game / Challenge ids are only returned when the viewer can see that object.

-- Tiers -------------------------------------------------------------------------------------------------

-- Milestone tiers. Totals: 10, 25, 50, 100, 250, 500, 1000. Games at one place: 5, 10, 20, 50, 100, then
-- every 50.
create or replace function private.passport_total_tier(p_n bigint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_n in (10, 25, 50, 100, 250, 500, 1000);
$$;

create or replace function private.passport_place_tier(p_n bigint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_n in (5, 10, 20, 50, 100) or (p_n > 100 and p_n % 50 = 0);
$$;

-- Every stamp of one person, oldest first, with ordinals and the milestone it marks (at most one, by
-- priority). Ordinals are computed from history, so they're right even for stamps recorded late.
create or replace function private.passport_stamps_of(p_user uuid)
returns table (
  entry_id uuid,
  kind public.passport_entry_kind,
  occurred_at timestamptz,
  sport_id text,
  place_id uuid,
  minutes integer,
  activity_id uuid,
  challenge_event_id uuid,
  title text,
  scoring public.challenge_scoring,
  unit text,
  value numeric,
  outcome text,
  stamp_number integer,
  sport_number integer,
  place_number integer,
  place_game_number integer,
  challenge_number integer,
  personal_best boolean,
  previous_best numeric,
  milestone text,
  milestone_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select e.*,
           row_number() over (order by e.occurred_at, e.id) as n_all,
           row_number() over (partition by e.sport_id order by e.occurred_at, e.id) as n_sport,
           case when e.place_id is not null
                then row_number() over (partition by e.place_id order by e.occurred_at, e.id) end as n_place,
           case when e.place_id is not null and e.kind = 'game'
                then row_number() over (partition by e.place_id, e.kind order by e.occurred_at, e.id) end as n_place_game,
           case when e.kind = 'challenge'
                then row_number() over (partition by e.kind order by e.occurred_at, e.id) end as n_challenge,
           b.id as pb_id, b.previous_value as pb_prev
    from public.passport_entries e
    left join public.personal_bests b on b.passport_entry_id = e.id
    where e.user_id = p_user
  )
  select s.id, s.kind, s.occurred_at, s.sport_id, s.place_id, s.minutes, s.activity_id, s.challenge_event_id,
         s.challenge_title, s.challenge_scoring, s.challenge_unit, s.challenge_value, s.challenge_outcome,
         s.n_all::integer, s.n_sport::integer, s.n_place::integer, s.n_place_game::integer, s.n_challenge::integer,
         s.pb_id is not null, s.pb_prev,
         case
           when s.n_all = 1 then 'first_stamp'
           when s.n_sport = 1 then 'first_in_sport'
           when s.pb_id is not null and s.pb_prev is null then 'first_in_discipline'
           when s.pb_id is not null then 'personal_best'
           when s.n_challenge = 1 then 'first_challenge'
           when s.n_place = 1 then 'first_at_place'
           when private.passport_place_tier(s.n_place_game) then 'place_games'
           when private.passport_total_tier(s.n_all) then 'stamps'
         end,
         case
           when s.n_all = 1 or s.n_sport = 1 or s.pb_id is not null or s.n_challenge = 1 or s.n_place = 1 then null
           when private.passport_place_tier(s.n_place_game) then s.n_place_game::integer
           when private.passport_total_tier(s.n_all) then s.n_all::integer
         end
  from s
  order by s.occurred_at, s.id;
$$;

-- People someone has moved with: checked in to the same game (same rule as profile_view).
create or replace function private.people_moved_with(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct o.user_id)::integer
  from public.passport_entries e
  join public.passport_entries o on o.activity_id = e.activity_id and o.user_id <> e.user_id
  where e.user_id = p_user;
$$;

-- Show-up record: games kept / games committed to (confirmed at GAME ON, the game has ended, not
-- cancelled). Leaving before the game isn't a miss. Same rule as the host request card.
create or replace function private.show_up_record(p_user uuid)
returns table (showed_up integer, committed integer)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where t.status = 'checked_in')::integer,
         count(*)::integer
  from public.attendance t
  join public.activities x on x.id = t.activity_id
  where t.user_id = p_user and t.status in ('checked_in', 'confirmed') and x.status <> 'cancelled'
    and coalesce(x.ended_at, x.ends_at) <= now();
$$;

revoke all on function private.passport_total_tier(bigint), private.passport_place_tier(bigint),
  private.passport_stamps_of(uuid), private.people_moved_with(uuid), private.show_up_record(uuid)
  from public, anon, authenticated;

-- passport_view ------------------------------------------------------------------------------------------

-- The Passport page. Null when there's no such person or a block either way (never says which). When the
-- owner's history isn't visible to you: `visible` false and nothing else about their history.
create or replace function public.passport_view(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  pr public.profiles%rowtype;
  ps public.privacy_settings%rowtype;
  v_me boolean;
  v_visible boolean;
  v_tz text;
  v_out jsonb;
begin
  select * into pr from public.profiles p where p.id = p_user_id;
  if not found or authz.is_blocked(p_user_id, v_uid) then
    return null;
  end if;
  select * into ps from public.privacy_settings s where s.user_id = p_user_id;
  v_me := p_user_id = v_uid;
  v_visible := authz.can_see_part(p_user_id, 'history', v_uid);
  v_tz := coalesce(pr.time_zone, 'America/Toronto');

  v_out := jsonb_build_object(
    'user_id', pr.id,
    'display_name', pr.display_name,
    'handle', pr.handle,
    'avatar_path', pr.avatar_path,
    'is_me', v_me,
    'visible', v_visible,
    'goals_visible', authz.can_see_part(p_user_id, 'goals', v_uid),
    'time_zone', v_tz,
    'history_visibility', case when v_me then coalesce(ps.history_visibility, 'friends') end,
    'goals_visibility', case when v_me then coalesce(ps.goals_visibility, 'friends') end
  );
  if not v_visible then
    return v_out || jsonb_build_object('totals', null, 'places', '[]'::jsonb, 'sports', '[]'::jsonb,
      'months', '[]'::jsonb, 'milestones', '[]'::jsonb, 'personal_bests', '[]'::jsonb);
  end if;

  with st as (select * from private.passport_stamps_of(p_user_id))
  select v_out || jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'stamps', count(*),
        'games', count(*) filter (where s.kind = 'game'),
        'challenges', count(*) filter (where s.kind = 'challenge'),
        'minutes', coalesce(sum(s.minutes), 0),
        'ojoro_hours', round(coalesce(sum(s.minutes), 0) / 60.0, 1),
        'places', count(distinct s.place_id),
        'sports', count(distinct s.sport_id),
        'people_moved_with', private.people_moved_with(p_user_id),
        'personal_bests', (select count(*) from public.personal_bests b where b.user_id = p_user_id),
        'first_at', min(s.occurred_at),
        'last_at', max(s.occurred_at))
      from st s),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
               'place_id', pl.id, 'name', pl.name, 'area', pl.area, 'city', pl.city, 'time_zone', pl.time_zone,
               'stamps', g.stamps, 'games', g.games, 'first_at', g.first_at, 'last_at', g.last_at)
             order by g.stamps desc, g.last_at desc, pl.name)
      from (select s.place_id, count(*) as stamps, count(*) filter (where s.kind = 'game') as games,
                   min(s.occurred_at) as first_at, max(s.occurred_at) as last_at
            from st s where s.place_id is not null group by s.place_id) g
      join public.places pl on pl.id = g.place_id), '[]'::jsonb),
    'sports', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sport_id', sp.id, 'name', sp.name, 'stamps', g.stamps, 'games', g.games,
               'challenges', g.challenges, 'minutes', g.minutes, 'first_at', g.first_at, 'last_at', g.last_at)
             order by g.stamps desc, g.last_at desc, sp.name)
      from (select s.sport_id, count(*) as stamps, count(*) filter (where s.kind = 'game') as games,
                   count(*) filter (where s.kind = 'challenge') as challenges, sum(s.minutes) as minutes,
                   min(s.occurred_at) as first_at, max(s.occurred_at) as last_at
            from st s group by s.sport_id) g
      join public.sports sp on sp.id = g.sport_id), '[]'::jsonb),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('month', g.month, 'stamps', g.stamps, 'minutes', g.minutes,
                                          'places', g.places)
             order by g.month desc)
      from (select to_char(s.occurred_at at time zone v_tz, 'YYYY-MM') as month, count(*) as stamps,
                   sum(s.minutes) as minutes, count(distinct s.place_id) as places
            from st s group by 1) g), '[]'::jsonb),
    -- Firsts and milestones, newest first (the latest 24).
    'milestones', coalesce((
      select jsonb_agg(m.j order by m.occurred_at desc, m.entry_id)
      from (
        select s.occurred_at, s.entry_id, jsonb_build_object(
                 'entry_id', s.entry_id, 'milestone', s.milestone, 'count', s.milestone_count,
                 'kind', s.kind, 'occurred_at', s.occurred_at, 'sport_id', s.sport_id, 'sport_name', sp.name,
                 'place_id', s.place_id, 'place_name', pl.name, 'place_time_zone', pl.time_zone,
                 'title', s.title, 'value', s.value, 'scoring', s.scoring, 'unit', s.unit, 'outcome', s.outcome) as j
        from st s
        join public.sports sp on sp.id = s.sport_id
        left join public.places pl on pl.id = s.place_id
        where s.milestone is not null
        order by s.occurred_at desc, s.entry_id
        limit 24
      ) m), '[]'::jsonb),
    -- Current best per discipline (the best value; ties: the latest), with where it started.
    'personal_bests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'personal_best_id', b.id, 'sport_id', b.sport_id, 'sport_name', sp.name, 'discipline', b.discipline,
               'scoring', b.scoring, 'unit', b.unit, 'value', b.value, 'previous_value', b.previous_value,
               'first_value', b.first_value, 'improvements', b.improvements, 'set_at', b.set_at,
               'place_name', pl.name,
               'event_id', case when authz.can_see_challenge_event(b.challenge_event_id, v_uid)
                                then b.challenge_event_id end)
             order by b.set_at desc)
      from (
        select distinct on (x.sport_id, x.discipline, x.scoring) x.*,
               first_value(x.value) over w as first_value,
               (count(*) over w - 1)::integer as improvements
        from public.personal_bests x
        where x.user_id = p_user_id
        window w as (partition by x.sport_id, x.discipline, x.scoring order by x.set_at
                     rows between unbounded preceding and unbounded following)
        order by x.sport_id, x.discipline, x.scoring,
                 case when x.scoring = 'time' then x.value else -x.value end, x.set_at desc
      ) b
      join public.sports sp on sp.id = b.sport_id
      left join public.challenge_events ce on ce.id = b.challenge_event_id
      left join public.places pl on pl.id = ce.place_id), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

-- passport_stamps ----------------------------------------------------------------------------------------

-- The stamps, newest first, optionally only one place / sport / month ('YYYY-MM' in the owner's time
-- zone) or only milestones. Page with p_before = the last row's occurred_at. Empty when the owner's
-- history isn't visible to you.
create or replace function public.passport_stamps(
  p_user_id uuid,
  p_place_id uuid default null,
  p_sport_id text default null,
  p_month text default null,
  p_milestones_only boolean default false,
  p_before timestamptz default null,
  p_limit integer default 30
)
returns table (
  entry_id uuid,
  kind public.passport_entry_kind,
  occurred_at timestamptz,
  sport_id text,
  sport_name text,
  place_id uuid,
  place_name text,
  place_area text,
  place_time_zone text,
  minutes integer,
  activity_id uuid,
  challenge_event_id uuid,
  title text,
  scoring public.challenge_scoring,
  unit text,
  value numeric,
  outcome text,
  stamp_number integer,
  sport_number integer,
  place_number integer,
  place_game_number integer,
  personal_best boolean,
  previous_best numeric,
  milestone text,
  milestone_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_tz text;
begin
  if p_month is not null and p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    perform private.fail('invalid_argument', 'month');
  end if;
  if not authz.can_see_part(p_user_id, 'history', v_uid) then
    return;
  end if;
  select coalesce(p.time_zone, 'America/Toronto') into v_tz from public.profiles p where p.id = p_user_id;
  return query
  select s.entry_id, s.kind, s.occurred_at, s.sport_id, sp.name, s.place_id, pl.name, pl.area, pl.time_zone,
         s.minutes,
         case when s.activity_id is not null and authz.can_see_activity(s.activity_id, v_uid) then s.activity_id end,
         case when s.challenge_event_id is not null and authz.can_see_challenge_event(s.challenge_event_id, v_uid)
              then s.challenge_event_id end,
         s.title, s.scoring, s.unit, s.value, s.outcome,
         s.stamp_number, s.sport_number, s.place_number, s.place_game_number, s.personal_best, s.previous_best,
         s.milestone, s.milestone_count
  from private.passport_stamps_of(p_user_id) s
  join public.sports sp on sp.id = s.sport_id
  left join public.places pl on pl.id = s.place_id
  where (p_place_id is null or s.place_id = p_place_id)
    and (p_sport_id is null or s.sport_id = p_sport_id)
    and (p_month is null or to_char(s.occurred_at at time zone v_tz, 'YYYY-MM') = p_month)
    and (not coalesce(p_milestones_only, false) or s.milestone is not null)
    and (p_before is null or s.occurred_at < p_before)
  order by s.occurred_at desc, s.entry_id
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

-- passport_achievements ------------------------------------------------------------------------------------

-- Achievements, derived from history every time (nothing stored, no points, nothing to redeem). One row
-- per reached tier, with when it was reached; for yourself also the next tier of each ladder
-- (achieved = false, `current` of `threshold`). Empty when the owner's history isn't visible to you.
create or replace function public.passport_achievements(p_user_id uuid)
returns table (
  ladder text,
  family text,
  threshold integer,
  achieved boolean,
  achieved_at timestamptz,
  current integer,
  context text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_me boolean := p_user_id = v_uid;
begin
  if not authz.can_see_part(p_user_id, 'history', v_uid) then
    return;
  end if;
  return query
  with tiers(ladder, family, thresholds, sort) as (
    values ('sessions', 'participation', array[1, 10, 25, 50, 100, 250, 500], 1),
           ('regular', 'participation', array[10, 25, 50, 100], 2),
           ('challenges', 'participation', array[1, 5, 10, 25], 3),
           ('people', 'participation', array[10, 25, 50, 100], 4),
           ('places', 'exploration', array[3, 5, 10, 25], 5),
           ('sports', 'exploration', array[2, 3, 5], 6),
           ('personal_bests', 'improvement', array[1, 5, 10], 7),
           ('goals', 'improvement', array[1, 3, 10], 8),
           ('hosted', 'contribution', array[1, 10, 25, 50, 100], 9)
  ),
  e as (select * from public.passport_entries x where x.user_id = p_user_id),
  -- (ladder, n, at, context): the n-th time something on the ladder happened.
  ev as (
    select 'sessions' as ladder, row_number() over (order by e.occurred_at, e.id) as n, e.occurred_at as at,
           null::text as context
    from e
    union all
    select 'regular', row_number() over (partition by e.place_id order by e.occurred_at, e.id), e.occurred_at, pl.name
    from e join public.places pl on pl.id = e.place_id
    where e.kind = 'game'
    union all
    select 'challenges', row_number() over (order by e.occurred_at, e.id), e.occurred_at, null
    from e where e.kind = 'challenge'
    union all
    select 'places', row_number() over (order by f.at, f.place_id), f.at, null
    from (select e.place_id, min(e.occurred_at) as at from e where e.place_id is not null group by e.place_id) f
    union all
    select 'sports', row_number() over (order by f.at, f.sport_id), f.at, null
    from (select e.sport_id, min(e.occurred_at) as at from e group by e.sport_id) f
    union all
    select 'people', row_number() over (order by f.at, f.user_id), f.at, null
    from (select o.user_id, min(e.occurred_at) as at
          from e join public.passport_entries o on o.activity_id = e.activity_id and o.user_id <> e.user_id
          group by o.user_id) f
    union all
    select 'personal_bests', row_number() over (order by b.set_at, b.id), b.set_at, null
    from public.personal_bests b where b.user_id = p_user_id
    union all
    select 'goals', row_number() over (order by g.achieved_at, g.id), g.achieved_at, null
    from public.goals g where g.user_id = p_user_id and g.achieved_at is not null
    union all
    select 'hosted', row_number() over (order by coalesce(a.ended_at, a.ends_at), a.id), coalesce(a.ended_at, a.ends_at), null
    from public.activities a
    where a.host_id = p_user_id and a.status <> 'cancelled' and coalesce(a.ended_at, a.ends_at) <= now()
  ),
  cur as (select ev.ladder, max(ev.n)::integer as current from ev group by ev.ladder),
  rows_ as (
    select t.ladder, t.family, t.sort, th.threshold,
           (select min(ev.at) from ev where ev.ladder = t.ladder and ev.n = th.threshold) as at,
           (select ev.context from ev where ev.ladder = t.ladder and ev.n = th.threshold
             order by ev.at, ev.context limit 1) as context,
           coalesce(c.current, 0) as current
    from tiers t
    cross join lateral unnest(t.thresholds) as th(threshold)
    left join cur c on c.ladder = t.ladder
  )
  select r.ladder, r.family, r.threshold, r.at is not null, r.at,
         case when r.ladder = 'regular' then
           -- Most games at one place.
           coalesce((select max(cnt)::integer from (select count(*) as cnt from e where e.kind = 'game'
                                                     and e.place_id is not null group by e.place_id) z), 0)
         else r.current end,
         r.context
  from rows_ r
  where r.at is not null
     or (v_me and r.threshold = (select min(r2.threshold) from rows_ r2 where r2.ladder = r.ladder and r2.at is null))
  order by (r.at is null), r.at desc nulls last, (select t.sort from tiers t where t.ladder = r.ladder), r.threshold;
end;
$$;

-- passport_reputation -------------------------------------------------------------------------------------

-- Reputation (PRD §9.17): structured, positive signals from people who played with them, shown only past
-- 5 confirmations (no star ratings, no negative signals). The show-up record is history: yours always;
-- someone else's when their history is visible to you and it rests on at least 5 games. Null across a
-- block.
create or replace function public.passport_reputation(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_me boolean := p_user_id = v_uid;
  v_history boolean;
  v_show record;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user_id) or authz.is_blocked(p_user_id, v_uid) then
    return null;
  end if;
  v_history := authz.can_see_part(p_user_id, 'history', v_uid);
  select * into v_show from private.show_up_record(p_user_id);
  return jsonb_build_object(
    'threshold', 5,
    'signals', coalesce((
      select jsonb_agg(jsonb_build_object('kind', x.kind, 'confirmations', x.n) order by x.n desc, x.kind)
      from (select r.kind, count(*)::integer as n from public.reputation_signals r
            where r.subject_id = p_user_id group by r.kind having count(*) >= 5) x), '[]'::jsonb),
    -- Yours only: kinds people have started to confirm (1 to 4), without the count.
    'building', case when v_me then coalesce((
      select jsonb_agg(x.kind order by x.kind)
      from (select r.kind from public.reputation_signals r
            where r.subject_id = p_user_id group by r.kind having count(*) < 5) x), '[]'::jsonb)
      else '[]'::jsonb end,
    'show_up', case when v_me or (v_history and v_show.committed >= 5)
                    then jsonb_build_object('showed_up', v_show.showed_up, 'committed', v_show.committed) end,
    'hosted', private.hosted_count(p_user_id),
    'history_visible', v_history
  );
end;
$$;

-- challenge_passport_for_me ---------------------------------------------------------------------------------

-- The Result screen's YOU row: the caller's stamp for this Challenge, whether it's a personal best, and
-- how far it is from their goal in this discipline. No row when the caller didn't compete or the result
-- isn't final yet.
create or replace function public.challenge_passport_for_me(p_event_id uuid)
returns table (
  passport_entry_id uuid,
  occurred_at timestamptz,
  sport_id text,
  title text,
  scoring public.challenge_scoring,
  unit text,
  value numeric,
  outcome text,
  place_name text,
  place_time_zone text,
  personal_best boolean,
  first_in_discipline boolean,
  previous_best numeric,
  best_value numeric,
  goal_id uuid,
  goal_target numeric,
  goal_target_date date,
  goal_gap numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.occurred_at, e.sport_id, e.challenge_title, e.challenge_scoring, e.challenge_unit,
         e.challenge_value, e.challenge_outcome, pl.name, pl.time_zone,
         b.id is not null, b.id is not null and b.previous_value is null, b.previous_value,
         case when e.challenge_scoring in ('time', 'distance')
              then private.personal_best_value(e.user_id, e.sport_id, upper(btrim(e.challenge_title)), e.challenge_scoring) end,
         g.id, g.target_value, g.target_date,
         -- Time: seconds still to cut (≤ 0 = under the target). Distance: still to add.
         case when g.id is not null then
           case when e.challenge_scoring = 'time' then e.challenge_value - g.target_value
                else g.target_value - e.challenge_value end end
  from public.passport_entries e
  left join public.places pl on pl.id = e.place_id
  left join public.personal_bests b on b.passport_entry_id = e.id
  left join public.goals g on g.user_id = e.user_id and g.status = 'active' and g.kind = 'personal_best'
                          and g.sport_id = e.sport_id and g.discipline = upper(btrim(e.challenge_title))
                          and g.scoring = e.challenge_scoring
  where e.challenge_event_id = p_event_id and e.user_id = auth.uid();
$$;

revoke all on function public.passport_view(uuid),
  public.passport_stamps(uuid, uuid, text, text, boolean, timestamptz, integer),
  public.passport_achievements(uuid), public.passport_reputation(uuid), public.challenge_passport_for_me(uuid)
  from public, anon;
grant execute on function public.passport_view(uuid),
  public.passport_stamps(uuid, uuid, text, text, boolean, timestamptz, integer),
  public.passport_achievements(uuid), public.passport_reputation(uuid), public.challenge_passport_for_me(uuid)
  to authenticated, service_role;
