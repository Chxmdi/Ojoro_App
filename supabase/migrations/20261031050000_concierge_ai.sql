-- Step 8 CONCIERGE: the server side of the AI Movement Concierge (PRD §12.1, §12.3).
-- docs/CONCIERGE_CONTRACT.md. The Edge Function `concierge` is the only caller of the AI path:
--   1. private.concierge_parse(text): the rules-based reading of "Tell Ojoro" (minutes, sport,
--      "meet people"), shared by the rules stub and the AI path so they read text the same way.
--   2. public.concierge_suggest(...) keeps its contract (docs/LIQUIDITY_CONTRACT.md), now built on
--      the shared parse. It stays the fallback when the AI path is off or fails.
--   3. public.concierge_candidates(text, limit): what the model is allowed to see, called with the
--      person's own JWT, so it is exactly what they could see through concierge_suggest (visibility,
--      blocks, radius, level), widened to other sports when a sport was read. No people, no ids of
--      people, areas and public place names only. Not logged here (the function logs the decision).
--   4. public.concierge_ai_gate(user) / public.concierge_ai_record(user, payload): the per-person
--      rate limit and the decision log. service_role only (the Edge Function); the payload keeps an
--      allow-list of short facts and never the text.

-- 1. The shared parse ---------------------------------------------------------------------------------

create or replace function private.concierge_parse(p_text text)
returns table (minutes integer, sport_id text, social boolean, has_text boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_text text := private.fold(left(coalesce(p_text, ''), 500));
  v_minutes integer;
  v_hours text;
  v_sport text;
begin
  v_minutes := nullif(substring(v_text from '(\d{2,3})\s*(?:min|mins|minutes)\M'), '')::integer;
  if v_minutes is null then
    v_hours := substring(v_text from '(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\M');
    if v_hours is not null then
      v_minutes := round(v_hours::numeric * 60)::integer;
    elsif v_text ~ 'half an hour' then
      v_minutes := 30;
    elsif v_text ~ '\m(an|one) hour\M' then
      v_minutes := 60;
    end if;
  end if;
  if v_minutes is not null then
    v_minutes := least(greatest(v_minutes, 15), 480);
  end if;
  if v_text <> '' then
    select x.sid into v_sport
    from (
      select s.id as sid, private.fold(s.name) as word from public.sports s
      union all select s.id, replace(s.id, '_', ' ') from public.sports s
      union all select * from (values ('football', 'soccer'), ('running', 'run'), ('running', 'jog'),
                                      ('running', '5k'), ('running', '10k'), ('basketball', 'hoops'),
                                      ('boxing', 'box'), ('boxing', 'sparring'), ('climbing', 'climb'),
                                      ('climbing', 'boulder'), ('cycling', 'ride'), ('cycling', 'bike'),
                                      ('volleyball', 'volley')) a (sid, word)
    ) x
    where v_text ~ ('\m' || x.word || '\M')
    order by char_length(x.word) desc, x.sid
    limit 1;
  end if;
  return query select v_minutes, v_sport, v_text ~ '(meet|new) (people|someone|friends)|make friends', v_text <> '';
end;
$$;

-- 2. The rules stub, same contract, on the shared parse ------------------------------------------------

create or replace function public.concierge_suggest(
  p_text text default null,
  p_sport_id text default null,
  p_minutes integer default null,
  p_limit integer default 3
)
returns table (
  kind text,
  plan_id uuid,
  sport_id text,
  sport_name text,
  title text,
  starts_at timestamptz,
  duration_minutes integer,
  place_id uuid,
  place_name text,
  place_area text,
  distance_km numeric,
  member_count integer,
  capacity integer,
  played_with_count integer,
  demand_count integer,
  window_start timestamptz,
  window_end timestamptz,
  reasons text[],
  reason text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_parse record;
  v_minutes integer;
  v_sport text;
  v_n integer;
begin
  if p_minutes is not null and p_minutes not between 15 and 480 then
    perform private.fail('invalid_argument', 'minutes');
  end if;
  if p_sport_id is not null and not exists (select 1 from public.sports s where s.id = p_sport_id) then
    perform private.fail('sport_unknown');
  end if;
  select * into v_parse from private.concierge_parse(p_text);
  v_minutes := coalesce(p_minutes, v_parse.minutes);
  v_sport := coalesce(p_sport_id, v_parse.sport_id);

  return query select * from private.suggest(v_uid, v_minutes, v_sport, v_parse.social,
                                             least(greatest(coalesce(p_limit, 3), 1), 5));
  get diagnostics v_n = row_count;
  perform private.emit('concierge_suggested', v_uid,
    jsonb_build_object('has_text', v_parse.has_text, 'minutes', v_minutes, 'sport_id', v_sport,
                       'social', v_parse.social, 'count', v_n));
end;
$$;

-- 3. What the model may see ------------------------------------------------------------------------------
-- { "parse": { minutes, sport_id, social }, "rows": [ Suggestion + "matched" ] }. Rows that match the
-- parse come first, in concierge_suggest's order (so rows where matched = true are exactly what the
-- stub would return); when a sport was read and fewer than p_limit match, the same search without
-- the sport fills up (matched = false), so the model can say "nothing fits" honestly or notice the
-- parse was wrong ("not football"). Same constraints as concierge_suggest, run as the caller.

create or replace function public.concierge_candidates(p_text text default null, p_limit integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_limit integer := least(greatest(coalesce(p_limit, 6), 1), 8);
  v_parse record;
  v_rows jsonb;
begin
  if p_text is not null and char_length(p_text) > 500 then
    perform private.fail('invalid_argument', 'text');
  end if;
  select * into v_parse from private.concierge_parse(p_text);

  with matched as (
    select s.kind, s.plan_id, s.sport_id, s.sport_name, s.title, s.starts_at, s.duration_minutes,
           s.place_id, s.place_name, s.place_area, s.distance_km, s.member_count, s.capacity,
           s.played_with_count, s.demand_count, s.window_start, s.window_end, s.reasons, s.reason,
           true as matched, s.ordinality as ord
    from private.suggest(v_uid, v_parse.minutes, v_parse.sport_id, v_parse.social, v_limit)
         with ordinality s
  ),
  extra as (
    select s.kind, s.plan_id, s.sport_id, s.sport_name, s.title, s.starts_at, s.duration_minutes,
           s.place_id, s.place_name, s.place_area, s.distance_km, s.member_count, s.capacity,
           s.played_with_count, s.demand_count, s.window_start, s.window_end, s.reasons, s.reason,
           false as matched, 100 + s.ordinality as ord
    from private.suggest(v_uid, v_parse.minutes, null, v_parse.social, v_limit) with ordinality s
    where v_parse.sport_id is not null
      and not exists (select 1 from matched m
                      where m.kind = s.kind
                        and coalesce(m.plan_id::text, m.sport_id || '@' || m.starts_at::text)
                          = coalesce(s.plan_id::text, s.sport_id || '@' || s.starts_at::text))
  ),
  both_sets as (
    select * from matched
    union all
    select * from extra
  )
  select coalesce(jsonb_agg(to_jsonb(b) - 'ord' order by b.ord), '[]'::jsonb) into v_rows
  from (select * from both_sets order by ord limit v_limit) b;

  return jsonb_build_object(
    'parse', jsonb_build_object('minutes', v_parse.minutes, 'sport_id', v_parse.sport_id, 'social', v_parse.social),
    'rows', v_rows);
end;
$$;

-- 4. Rate limit and decision log (service_role only) -----------------------------------------------------

create table private.concierge_ai_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  called_at timestamptz not null default now()
);
create index concierge_ai_calls_user_at on private.concierge_ai_calls (user_id, called_at desc);
alter table private.concierge_ai_calls enable row level security;

-- Per person: 6 AI answers a minute, 100 a day. Past that the function answers with the rules stub.
create or replace function private.concierge_ai_limits()
returns table (per_minute integer, per_day integer)
language sql
immutable
set search_path = ''
as $$ select 6, 100 $$;

create or replace function private.require_service_role()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    perform private.fail('not_authenticated');
  end if;
end;
$$;

-- { allowed, reason ('per_minute' | 'per_day' | null), retry_after_seconds }. Counts the call when
-- allowed. Rows older than a day are dropped as we go (nothing else is kept about the call).
create or replace function public.concierge_ai_gate(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lim record;
  v_minute integer;
  v_day integer;
  v_oldest timestamptz;
begin
  perform private.require_service_role();
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    perform private.fail('user_not_found');
  end if;
  -- One gate at a time per person, so two parallel calls can't both take the last slot.
  perform pg_advisory_xact_lock(hashtextextended('concierge_ai:' || p_user_id::text, 0));
  delete from private.concierge_ai_calls c where c.user_id = p_user_id and c.called_at < now() - interval '1 day';
  select * into v_lim from private.concierge_ai_limits();
  select count(*) filter (where c.called_at > now() - interval '1 minute'), count(*)
    into v_minute, v_day
  from private.concierge_ai_calls c where c.user_id = p_user_id;

  if v_day >= v_lim.per_day then
    select min(c.called_at) into v_oldest from private.concierge_ai_calls c where c.user_id = p_user_id;
    return jsonb_build_object('allowed', false, 'reason', 'per_day',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 day' - now())))::integer));
  end if;
  if v_minute >= v_lim.per_minute then
    select min(c.called_at) into v_oldest from private.concierge_ai_calls c
     where c.user_id = p_user_id and c.called_at > now() - interval '1 minute';
    return jsonb_build_object('allowed', false, 'reason', 'per_minute',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 minute' - now())))::integer));
  end if;
  insert into private.concierge_ai_calls (user_id) values (p_user_id);
  return jsonb_build_object('allowed', true, 'reason', null, 'retry_after_seconds', 0);
end;
$$;

-- Records `concierge_ai_decided`. Only these keys survive, strings cut to 40 characters, so the
-- person's words can't reach the log even by mistake:
--   source ('ai' | 'rules'), fallback_reason, outcome ('match' | 'nothing_fits' | 'not_movement'),
--   kind ('plan' | 'demand'), sport_id, start, model, candidates, matched_candidates, picked_rank,
--   latency_ms, has_text, minutes, social, why_source ('ai' | 'rules').
create or replace function public.concierge_ai_record(p_user_id uuid, p_payload jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_clean jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
begin
  perform private.require_service_role();
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    perform private.fail('user_not_found');
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    perform private.fail('invalid_argument', 'payload');
  end if;
  for v_key, v_val in select * from jsonb_each(p_payload) loop
    if v_key = any (array['source', 'fallback_reason', 'outcome', 'kind', 'sport_id', 'start', 'model', 'why_source']) then
      if jsonb_typeof(v_val) = 'string' then
        v_clean := v_clean || jsonb_build_object(v_key, left(v_val #>> '{}', 40));
      end if;
    elsif v_key = any (array['candidates', 'matched_candidates', 'picked_rank', 'latency_ms', 'minutes']) then
      if jsonb_typeof(v_val) = 'number' then
        v_clean := v_clean || jsonb_build_object(v_key, v_val);
      end if;
    elsif v_key = any (array['has_text', 'social']) then
      if jsonb_typeof(v_val) = 'boolean' then
        v_clean := v_clean || jsonb_build_object(v_key, v_val);
      end if;
    end if;
  end loop;
  perform private.emit('concierge_ai_decided', p_user_id, v_clean);
end;
$$;

-- Privileges ------------------------------------------------------------------------------------------------

revoke all on table private.concierge_ai_calls from public, anon, authenticated;
revoke all on function private.concierge_parse(text), private.concierge_ai_limits(),
  private.require_service_role() from public, anon, authenticated;

-- concierge_suggest keeps its grants (create or replace leaves them as they are).
revoke all on function public.concierge_candidates(text, integer) from public, anon;
grant execute on function public.concierge_candidates(text, integer) to authenticated, service_role;

revoke all on function public.concierge_ai_gate(uuid), public.concierge_ai_record(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.concierge_ai_gate(uuid), public.concierge_ai_record(uuid, jsonb) to service_role;
