-- Step 6 (Communities): create_clan and update_clan take the short name (posters and badges).

drop function public.create_clan(uuid, text, public.clan_join_policy, text, text, text, text);
drop function public.update_clan(uuid, text, text, text, text, text, public.clan_join_policy);

create or replace function public.create_clan(
  p_idempotency_key uuid,
  p_name text,
  p_join_policy public.clan_join_policy default 'request',
  p_tagline text default null,
  p_sport_id text default null,
  p_area text default null,
  p_city text default null,
  p_short_name text default null
)
returns public.clans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prior jsonb;
  c public.clans%rowtype;
begin
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'create_clan');
  if v_prior is not null then
    return jsonb_populate_record(null::public.clans, v_prior);
  end if;
  if p_name is null then
    perform private.fail('invalid_argument', 'name');
  end if;
  perform private.validate_clan_fields(p_name, p_tagline, p_sport_id, p_area, p_city);
  if p_short_name is not null and char_length(trim(p_short_name)) not between 1 and 16 then
    perform private.fail('invalid_argument', 'short_name');
  end if;
  if (select count(*) from public.clans x where x.created_by = v_uid and x.created_at > now() - interval '24 hours') >= 3 then
    perform private.fail('clan_rate_limited');
  end if;
  insert into public.clans (name, short_name, tagline, sport_id, area, city, join_policy, time_zone, created_by)
  values (trim(p_name), nullif(trim(p_short_name), ''), nullif(trim(p_tagline), ''), p_sport_id, nullif(trim(p_area), ''), nullif(trim(p_city), ''),
          coalesce(p_join_policy, 'request'),
          coalesce((select pr.time_zone from public.profiles pr where pr.id = v_uid), 'America/Toronto'), v_uid)
  returning * into c;
  perform private.add_to_clan(c.id, v_uid, 'captain', 'created');
  select * into c from public.clans where id = c.id;
  perform private.emit('clan_created', v_uid, jsonb_build_object('clan_id', c.id, 'join_policy', c.join_policy));
  perform private.idem_store(v_uid, p_idempotency_key, to_jsonb(c));
  return c;
end;
$$;

create or replace function public.update_clan(
  p_clan_id uuid,
  p_name text default null,
  p_tagline text default null,
  p_sport_id text default null,
  p_area text default null,
  p_city text default null,
  p_join_policy public.clan_join_policy default null,
  p_short_name text default null
)
returns public.clans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  c public.clans%rowtype := private.require_clan_member(p_clan_id, v_uid);
begin
  if not authz.clan_can(p_clan_id, 'manage', v_uid) then
    perform private.fail('clan_role_required');
  end if;
  perform private.validate_clan_fields(p_name, p_tagline, p_sport_id, p_area, p_city);
  if p_short_name is not null and char_length(trim(p_short_name)) not between 1 and 16 then
    perform private.fail('invalid_argument', 'short_name');
  end if;
  update public.clans set
    name = coalesce(trim(p_name), name),
    short_name = coalesce(nullif(trim(p_short_name), ''), short_name),
    tagline = coalesce(nullif(trim(p_tagline), ''), tagline),
    sport_id = coalesce(p_sport_id, sport_id),
    area = coalesce(nullif(trim(p_area), ''), area),
    city = coalesce(nullif(trim(p_city), ''), city),
    join_policy = coalesce(p_join_policy, join_policy)
  where id = p_clan_id
  returning * into c;
  perform private.emit('clan_updated', v_uid, jsonb_build_object('clan_id', p_clan_id));
  return c;
end;
$$;

revoke all on function public.create_clan(uuid, text, public.clan_join_policy, text, text, text, text, text) from public, anon;
grant execute on function public.create_clan(uuid, text, public.clan_join_policy, text, text, text, text, text) to authenticated, service_role;
revoke all on function public.update_clan(uuid, text, text, text, text, text, public.clan_join_policy, text) from public, anon;
grant execute on function public.update_clan(uuid, text, text, text, text, text, public.clan_join_policy, text) to authenticated, service_role;
