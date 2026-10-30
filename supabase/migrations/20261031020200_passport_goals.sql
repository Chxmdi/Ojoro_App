-- Step 7 (Places & Passport): goals. One active goal at a time (PRD §9.17: goals connect long-term intent
-- to real recommended activities). Progress is computed from the Passport, never typed in. Contract:
-- docs/PASSPORT_CONTRACT.md §Goals.

-- The goal as the viewer may see it (null: none, blocked, or not visible to them).
create or replace function private.goal_view(p_user uuid, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  g public.goals%rowtype;
  v_me boolean := p_user = p_viewer;
  v_current numeric;
  v_achieved boolean;
  v_best_at timestamptz;
  v_unit text;
  v_radius integer;
  v_next jsonb;
  v_test jsonb;
begin
  if p_viewer is null or authz.is_blocked(p_user, p_viewer) or not authz.can_see_part(p_user, 'goals', p_viewer) then
    return null;
  end if;
  select * into g from public.goals x where x.user_id = p_user and x.status = 'active';
  if not found then
    return null;
  end if;
  select p.current_value, p.achieved into v_current, v_achieved from private.goal_progress(g) p;
  if g.kind = 'personal_best' then
    select b.set_at, b.unit into v_best_at, v_unit from public.personal_bests b
     where b.user_id = g.user_id and b.sport_id = g.sport_id and b.discipline = g.discipline and b.scoring = g.scoring
     order by b.set_at desc limit 1;
  end if;

  if v_me then
    -- NEXT STEP: the soonest game you could join in the goal's sport within your radius, next 14 days.
    select pp.discovery_radius_km into v_radius from public.profile_private pp where pp.user_id = p_user;
    select jsonb_build_object(
             'kind', o.kind, 'plan_id', o.plan_id, 'activity_id', o.activity_id, 'sport_id', o.sport_id,
             'sport_name', o.sport_name, 'title', o.title, 'starts_at', o.starts_at, 'status', o.status,
             'member_count', o.member_count, 'capacity', o.capacity, 'spots_left', o.spots_left,
             'place_id', o.place_id, 'place_name', o.place_name, 'place_area', o.place_area,
             'place_time_zone', o.place_time_zone, 'action', o.action, 'reason', o.reason)
      into v_next
    from private.opportunities(p_user, now() + interval '14 days', null, coalesce(v_radius, 3)::numeric, false,
                               g.sport_id) o
    order by o.starts_at
    limit 1;
    -- The next real test: your next scheduled Challenge in this sport (and discipline, for a time or
    -- distance goal).
    select jsonb_build_object(
             'event_id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'time_zone', e.time_zone,
             'place_name', pl.name,
             'opponent_name', case when c.side = 'a' then coalesce(bp.display_name, bc.name)
                                   else coalesce(ap.display_name, ac.name) end)
      into v_test
    from public.challenge_events e
    join public.challenge_competitors c on c.event_id = e.id and c.user_id = p_user
    left join public.places pl on pl.id = e.place_id
    left join public.profiles ap on ap.id = e.a_user_id
    left join public.profiles bp on bp.id = e.b_user_id
    left join public.crews ac on ac.id = e.a_crew_id
    left join public.crews bc on bc.id = e.b_crew_id
    where e.status = 'scheduled' and e.starts_at > now()
      and (g.sport_id is null or e.sport_id = g.sport_id)
      and (g.kind <> 'personal_best' or (upper(btrim(e.title)) = g.discipline and e.scoring = g.scoring))
    order by e.starts_at
    limit 1;
  end if;

  return jsonb_build_object(
    'goal_id', g.id,
    'user_id', g.user_id,
    'is_me', v_me,
    'kind', g.kind,
    'sport_id', g.sport_id,
    'sport_name', (select s.name from public.sports s where s.id = g.sport_id),
    'discipline', g.discipline,
    'scoring', g.scoring,
    'unit', case when g.scoring = 'distance' then coalesce(v_unit, 'km') end,
    'target_value', g.target_value,
    'target_date', g.target_date,
    'created_at', g.created_at,
    'updated_at', g.updated_at,
    'achieved_at', g.achieved_at,
    'current_value', v_current,
    'best_at', v_best_at,
    'achieved', coalesce(v_achieved, false),
    'fraction', round(case
      when v_current is null or v_current <= 0 then 0
      when g.kind = 'personal_best' and g.scoring = 'time' then least(1, g.target_value / v_current)
      else least(1, v_current / g.target_value) end, 3),
    'next_step', v_next,
    'next_test', v_test
  );
end;
$$;

revoke all on function private.goal_view(uuid, uuid) from public, anon, authenticated;

-- Someone's current goal: yours (with NEXT STEP and the next test), or someone else's when their goals
-- setting includes you. Null when there's none or it isn't visible to you.
create or replace function public.passport_goal(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.goal_view(p_user_id, private.require_uid());
$$;

-- SET A GOAL / change it. One active goal: the same kind (and sport and discipline) updates the target and
-- date in place; anything else replaces it (the old one is kept as `replaced`). Returns passport_goal.
--   personal_best: p_sport_id, p_discipline ("5K"), p_scoring ('time' | 'distance'), p_target_value
--                  (seconds: 60–86400; distance: 0.1–1000).
--   sessions:      p_target_value 1–500 whole sessions, from now; p_sport_id optional.
--   places:        p_target_value 1–100 new places, from now; no sport.
-- p_target_date (optional): from today to 3 years ahead, in your time zone.
create or replace function public.set_goal(
  p_kind public.goal_kind,
  p_target_value numeric,
  p_idempotency_key uuid,
  p_sport_id text default null,
  p_discipline text default null,
  p_scoring public.challenge_scoring default null,
  p_target_date date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_today date;
  v_discipline text := nullif(upper(btrim(p_discipline)), '');
  g public.goals%rowtype;
  v_id uuid;
  v_out jsonb;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'set_goal');
  if v_prior is not null then
    return v_prior;
  end if;
  if p_kind is null then
    perform private.fail('goal_invalid', 'kind');
  end if;
  if p_sport_id is not null and not exists (select 1 from public.sports s where s.id = p_sport_id) then
    perform private.fail('sport_unknown');
  end if;
  if p_kind = 'personal_best' then
    if p_sport_id is null then
      perform private.fail('goal_invalid', 'sport');
    end if;
    if v_discipline is null or char_length(v_discipline) > 24 then
      perform private.fail('goal_invalid', 'discipline');
    end if;
    if p_scoring is null or p_scoring not in ('time', 'distance') then
      perform private.fail('goal_invalid', 'scoring');
    end if;
    if p_target_value is null
       or (p_scoring = 'time' and (p_target_value < 60 or p_target_value > 86400 or p_target_value <> trunc(p_target_value)))
       or (p_scoring = 'distance' and (p_target_value < 0.1 or p_target_value > 1000)) then
      perform private.fail('goal_invalid', 'target_value');
    end if;
  else
    if v_discipline is not null or p_scoring is not null then
      perform private.fail('goal_invalid', 'discipline');
    end if;
    if p_kind = 'places' and p_sport_id is not null then
      perform private.fail('goal_invalid', 'sport');
    end if;
    if p_target_value is null or p_target_value <> trunc(p_target_value) or p_target_value < 1
       or p_target_value > (case when p_kind = 'sessions' then 500 else 100 end) then
      perform private.fail('goal_invalid', 'target_value');
    end if;
  end if;
  select (now() at time zone coalesce(p.time_zone, 'America/Toronto'))::date into v_today
  from public.profiles p where p.id = v_uid;
  if p_target_date is not null and (p_target_date < v_today or p_target_date > v_today + interval '3 years') then
    perform private.fail('goal_invalid', 'target_date');
  end if;

  select * into g from public.goals x where x.user_id = v_uid and x.status = 'active' for update;
  if found and g.kind = p_kind and g.sport_id is not distinct from p_sport_id
     and g.discipline is not distinct from v_discipline and g.scoring is not distinct from p_scoring then
    if g.target_value <> p_target_value or g.target_date is distinct from p_target_date then
      update public.goals
         set target_value = p_target_value, target_date = p_target_date,
             achieved_at = case when g.target_value = p_target_value then g.achieved_at end
       where id = g.id;
      perform private.emit('goal_updated', v_uid, jsonb_build_object('goal_id', g.id, 'kind', p_kind,
        'sport_id', p_sport_id, 'has_date', p_target_date is not null));
    end if;
    v_id := g.id;
  else
    if found then
      update public.goals set status = 'replaced', ended_at = now() where id = g.id;
    end if;
    insert into public.goals (user_id, kind, sport_id, discipline, scoring, target_value, target_date)
    values (v_uid, p_kind, p_sport_id, v_discipline, p_scoring, p_target_value, p_target_date)
    returning id into v_id;
    perform private.emit('goal_set', v_uid, jsonb_build_object('goal_id', v_id, 'kind', p_kind,
      'sport_id', p_sport_id, 'has_date', p_target_date is not null, 'replaced', g.id is not null));
  end if;
  perform private.goal_check(v_uid);

  v_out := private.goal_view(v_uid, v_uid);
  perform private.idem_store(v_uid, p_idempotency_key, v_out);
  return v_out;
end;
$$;

-- CLEAR GOAL. Set-to-state: safe to repeat (cleared = false when there was none).
create or replace function public.clear_goal()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
begin
  update public.goals set status = 'cleared', ended_at = now()
   where user_id = v_uid and status = 'active'
  returning id into v_id;
  if v_id is not null then
    perform private.emit('goal_cleared', v_uid, jsonb_build_object('goal_id', v_id));
  end if;
  return jsonb_build_object('cleared', v_id is not null, 'goal_id', v_id);
end;
$$;

-- Who can see your goal. Set-to-state.
create or replace function public.set_goals_visibility(p_visibility public.visibility)
returns public.visibility
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if p_visibility is null then
    perform private.fail('invalid_argument', 'visibility');
  end if;
  insert into public.privacy_settings (user_id, goals_visibility) values (v_uid, p_visibility)
  on conflict (user_id) do update set goals_visibility = excluded.goals_visibility, updated_at = now();
  perform private.emit('goals_visibility_set', v_uid, jsonb_build_object('visibility', p_visibility));
  return p_visibility;
end;
$$;

revoke all on function public.passport_goal(uuid),
  public.set_goal(public.goal_kind, numeric, uuid, text, text, public.challenge_scoring, date),
  public.clear_goal(), public.set_goals_visibility(public.visibility)
  from public, anon;
grant execute on function public.passport_goal(uuid),
  public.set_goal(public.goal_kind, numeric, uuid, text, text, public.challenge_scoring, date),
  public.clear_goal(), public.set_goals_visibility(public.visibility)
  to authenticated, service_role;
