-- Step 7 (Places & Passport): one stamp by id, the stamp for a game / Challenge, and ids on the
-- milestones in passport_view (for links from Passport detail to the Recap / Result). Contract:
-- docs/PASSPORT_CONTRACT.md §Stamps. Same privacy as passport_stamps: the owner's history setting, no
-- block, and game / Challenge ids only when the viewer can see that game / Challenge.

-- Every stamp of p_user as p_viewer may see it (no visibility check on the owner here; callers do it).
create or replace function private.passport_stamp_rows(p_user uuid, p_viewer uuid)
returns table (
  entry_id uuid,
  user_id uuid,
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
language sql
stable
security definer
set search_path = ''
as $$
  select s.entry_id, p_user, s.kind, s.occurred_at, s.sport_id, sp.name, s.place_id, pl.name, pl.area, pl.time_zone,
         s.minutes,
         case when s.activity_id is not null and authz.can_see_activity(s.activity_id, p_viewer) then s.activity_id end,
         case when s.challenge_event_id is not null and authz.can_see_challenge_event(s.challenge_event_id, p_viewer)
              then s.challenge_event_id end,
         s.title, s.scoring, s.unit, s.value, s.outcome,
         s.stamp_number, s.sport_number, s.place_number, s.place_game_number, s.personal_best, s.previous_best,
         s.milestone, s.milestone_count
  from private.passport_stamps_of(p_user) s
  join public.sports sp on sp.id = s.sport_id
  left join public.places pl on pl.id = s.place_id;
$$;

revoke all on function private.passport_stamp_rows(uuid, uuid) from public, anon, authenticated;

-- One stamp (the Passport stamp detail). No row when unknown, blocked or the owner's history isn't
-- visible to you.
create or replace function public.passport_entry(p_entry_id uuid)
returns table (
  entry_id uuid,
  user_id uuid,
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
  v_owner uuid;
begin
  select e.user_id into v_owner from public.passport_entries e where e.id = p_entry_id;
  if v_owner is null or not authz.can_see_part(v_owner, 'history', v_uid) then
    return;
  end if;
  return query select * from private.passport_stamp_rows(v_owner, v_uid) r where r.entry_id = p_entry_id;
end;
$$;

-- The stamp for one game (p_activity_id) or one Challenge (p_event_id): yours by default, or p_user_id's
-- when their history is visible to you. Exactly one of p_activity_id / p_event_id. No row when there's
-- no such stamp (didn't play, the recap isn't made yet, the result isn't final) or it isn't visible.
create or replace function public.passport_entry_for(
  p_activity_id uuid default null,
  p_event_id uuid default null,
  p_user_id uuid default null
)
returns table (
  entry_id uuid,
  user_id uuid,
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
  v_owner uuid := coalesce(p_user_id, v_uid);
  v_entry uuid;
begin
  if num_nonnulls(p_activity_id, p_event_id) <> 1 then
    perform private.fail('invalid_argument', 'activity_id or event_id');
  end if;
  if not authz.can_see_part(v_owner, 'history', v_uid) then
    return;
  end if;
  select e.id into v_entry from public.passport_entries e
   where e.user_id = v_owner
     and (e.activity_id = p_activity_id or e.challenge_event_id = p_event_id);
  if v_entry is null then
    return;
  end if;
  return query select * from private.passport_stamp_rows(v_owner, v_uid) r where r.entry_id = v_entry;
end;
$$;

revoke all on function public.passport_entry(uuid), public.passport_entry_for(uuid, uuid, uuid) from public, anon;
grant execute on function public.passport_entry(uuid), public.passport_entry_for(uuid, uuid, uuid)
  to authenticated, service_role;

-- passport_view: milestones carry activity_id / challenge_event_id (null unless the viewer can see them).
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
                 'activity_id', case when s.activity_id is not null and authz.can_see_activity(s.activity_id, v_uid)
                                     then s.activity_id end,
                 'challenge_event_id', case when s.challenge_event_id is not null
                                             and authz.can_see_challenge_event(s.challenge_event_id, v_uid)
                                            then s.challenge_event_id end,
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
