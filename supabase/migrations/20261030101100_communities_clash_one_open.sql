-- Step 6 (Communities): a finished Clash keeps status 'scheduled' (its stage is computed), so the
-- unique index on open Clashes would block the next one between the same clans forever. The rule
-- (one proposed or running Clash between two clans) is enforced in create_clash, under a lock on both
-- clans so two proposals at once can't both pass.

drop index public.clashes_one_open_idx;

create or replace function public.create_clash(
  p_idempotency_key uuid,
  p_clan_id uuid,
  p_opponent_clan_id uuid,
  p_title text,
  p_events jsonb,
  p_season_label text default null
)
returns public.clash_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  v_clash uuid;
  v_open uuid;
  v_ev jsonb;
  v_pos integer := 0;
  v_state public.clash_state;
  v_start timestamptz;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_clash');
  if v_prior is not null then
    return jsonb_populate_record(null::public.clash_state, v_prior);
  end if;
  perform private.require_clan_member(p_clan_id, v_uid);
  if not authz.clan_can(p_clan_id, 'clash', v_uid) then
    perform private.fail('clan_role_required');
  end if;
  if p_opponent_clan_id is null or p_opponent_clan_id = p_clan_id
     or not authz.can_see_clan(p_opponent_clan_id, v_uid)
     or exists (select 1 from public.clan_members m where m.clan_id = p_opponent_clan_id
                  and m.role in ('captain', 'organizer') and authz.is_blocked(m.user_id, v_uid)) then
    perform private.fail('clash_not_allowed');
  end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 40 then
    perform private.fail('invalid_argument', 'title');
  end if;
  if p_season_label is not null and char_length(trim(p_season_label)) not between 1 and 40 then
    perform private.fail('invalid_argument', 'season_label');
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) not between 1 and 12 then
    perform private.fail('invalid_argument', 'events');
  end if;
  -- Serialize proposals between the same two clans (both rows, in a fixed order).
  perform 1 from public.clans k where k.id in (p_clan_id, p_opponent_clan_id) order by k.id for update;
  select x.id into v_open from public.clashes x
   where least(x.a_clan_id, x.b_clan_id) = least(p_clan_id, p_opponent_clan_id)
     and greatest(x.a_clan_id, x.b_clan_id) = greatest(p_clan_id, p_opponent_clan_id)
     and x.status in ('proposed', 'scheduled') and x.cancelled_at is null
     and private.clash_stage(x) in ('proposed', 'upcoming', 'live');
  if v_open is not null then
    perform private.fail('clash_pending', v_open::text);
  end if;
  -- A lapsed or finished one no longer blocks a new one.
  update public.clashes x set status = 'cancelled', cancelled_at = now()
   where least(x.a_clan_id, x.b_clan_id) = least(p_clan_id, p_opponent_clan_id)
     and greatest(x.a_clan_id, x.b_clan_id) = greatest(p_clan_id, p_opponent_clan_id)
     and x.status = 'proposed' and private.clash_stage(x) = 'cancelled';

  insert into public.clashes (title, season_label, a_clan_id, b_clan_id, proposed_by)
  values (trim(p_title), nullif(trim(p_season_label), ''), p_clan_id, p_opponent_clan_id, v_uid)
  returning id into v_clash;

  for v_ev in select * from jsonb_array_elements(p_events) loop
    v_pos := v_pos + 1;
    begin
      v_start := (v_ev ->> 'starts_at')::timestamptz;
    exception when others then
      perform private.fail('invalid_argument', 'events[' || v_pos || '].starts_at');
    end;
    if v_start is null or v_start < now() + interval '1 hour' or v_start > now() + interval '180 days' then
      perform private.fail('starts_at_invalid', v_pos::text);
    end if;
    if not exists (select 1 from public.sports s where s.id = v_ev ->> 'sport_id') then
      perform private.fail('sport_unknown', v_pos::text);
    end if;
    if v_ev ? 'place_id' and v_ev ->> 'place_id' is not null
       and not exists (select 1 from public.places pl where pl.id::text = v_ev ->> 'place_id') then
      perform private.fail('place_unknown', v_pos::text);
    end if;
    begin
      insert into public.clash_events (clash_id, position, title, sport_id, scoring, starts_at, place_id, squad_size)
      values (v_clash, v_pos, trim(v_ev ->> 'title'), v_ev ->> 'sport_id',
              coalesce((v_ev ->> 'scoring')::public.clash_scoring, 'score'), v_start,
              nullif(v_ev ->> 'place_id', '')::uuid, (v_ev ->> 'squad_size')::integer);
    exception when check_violation or not_null_violation or invalid_text_representation then
      perform private.fail('invalid_argument', 'events[' || v_pos || ']');
    end;
  end loop;

  perform private.emit('clash_created', v_uid,
    jsonb_build_object('clash_id', v_clash, 'clan_id', p_clan_id, 'opponent_clan_id', p_opponent_clan_id,
                       'events', v_pos));
  v_state := private.clash_state_of(v_clash, true);
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(v_state));
  return v_state;
end;
$$;
