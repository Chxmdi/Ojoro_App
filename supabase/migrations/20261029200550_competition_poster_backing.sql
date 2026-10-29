-- Step 5 (Competition): Poster and backing gaps.
--   * challenge_poster adds `target` (5 for "5K · TARGET 5 KM"; the label is `title`).
--   * back_challenge: p_side defaults to null, so the generated types allow leaving it out: calling
--     back_challenge(p_event_id) with no side stops backing.
-- Contract: docs/COMPETITION_CONTRACT.md §Poster, §Event page.

drop function public.challenge_poster(uuid);
create function public.challenge_poster(p_event_id uuid)
returns table (
  event_id uuid,
  kind text,
  a_name text,
  b_name text,
  title text,
  sport_name text,
  starts_at timestamptz,
  time_zone text,
  place_name text,
  place_city text,
  winner_side public.team_side,
  is_draw boolean,
  a_value numeric,
  b_value numeric,
  scoring public.challenge_scoring,
  unit text,
  link_path text,
  target numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_e public.challenge_events%rowtype := private.event_for(p_event_id, v_uid);
  v_res public.challenge_results%rowtype;
begin
  if v_e.audience <> 'public' and not authz.is_challenge_competitor(v_e.id, v_uid) then
    perform private.fail('poster_not_allowed');
  end if;
  if private.challenge_stage(v_e) = 'cancelled' then
    perform private.fail('challenge_closed');
  end if;
  select * into v_res from public.challenge_results r where r.event_id = v_e.id;
  return query
  select v_e.id, case when v_res.event_id is not null then 'result' else 'accepted' end,
         private.side_name(v_e, 'a'), private.side_name(v_e, 'b'), v_e.title, s.name, v_e.starts_at, v_e.time_zone,
         pl.name, pl.city, v_res.winner_side,
         case when v_res.event_id is not null then v_res.winner_side is null end,
         v_res.a_value, v_res.b_value, v_e.scoring, v_e.unit, '/event/' || v_e.id, v_e.target
  from public.sports s
  left join public.places pl on pl.id = v_e.place_id
  where s.id = v_e.sport_id;
end;
$$;
revoke all on function public.challenge_poster(uuid) from public, anon;
grant execute on function public.challenge_poster(uuid) to authenticated, service_role;

-- Stop backing: leave p_side out (or pass null).
create or replace function public.back_challenge(p_event_id uuid, p_side public.team_side default null)
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
