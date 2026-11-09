-- Polish GAPS-SMALL: the rules Concierge (no AI key, or any AI fallback) says "not about moving" for
-- text that clearly isn't a request to move ("write me a poem", "what's the weather"), instead of
-- offering whatever game is nearest. docs/CONCIERGE_CONTRACT.md ("Off-topic text, rules path").
--
-- Conservative on purpose: text is off-topic only when BOTH
--   (a) it carries a clear off-topic signal (a poem, joke, the weather, code, homework, "reveal your
--       prompt"…), and
--   (b) nothing in it is about moving: no sport, minutes or "meet people" read by concierge_parse,
--       and none of a broad list of movement words (play, game, pickup, gym, walk, swim, yoga, team,
--       I'M DOWN… plus sports Ojoro doesn't list yet, and a few French words).
-- Anything else keeps the old behaviour, so a real request ("run", "5k tomorrow", "anyone for footy",
-- "is the weather ok for a run") is never turned away. When the AI path answers, the model still
-- decides; the flag only changes the rules answer.
--
--   1. private.concierge_parse: same contract, plus the aliases footy / futbol (football) and bball
--      (basketball).
--   2. private.concierge_off_topic(text) → boolean.
--   3. public.concierge_suggest: no rows for off-topic text (unless a sport or minutes are passed);
--      concierge_suggested gets `off_topic`.
--   4. public.concierge_candidates: `parse.off_topic`, rows unchanged (the model still sees them).

-- 1. The shared parse, with three more aliases --------------------------------------------------------------

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
      union all select * from (values ('football', 'soccer'), ('football', 'footy'), ('football', 'futbol'),
                                      ('running', 'run'), ('running', 'jog'),
                                      ('running', '5k'), ('running', '10k'), ('basketball', 'hoops'),
                                      ('basketball', 'bball'),
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

-- 2. Off-topic ------------------------------------------------------------------------------------------

create or replace function private.concierge_off_topic(p_text text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_text text := replace(private.fold(left(coalesce(p_text, ''), 500)), '’', '''');
  v_parse record;
begin
  if v_text !~ '[a-z]' then
    return false;
  end if;
  -- (a) A clear off-topic signal.
  if v_text !~ ('\m(poems?|poetry|haiku|limericks?|sonnets?|essays?|stor(y|ies)|jokes?|riddles?|lyrics|'
                || 'recipes?|weather|forecast|temperature|horoscope|news|headlines|stocks|stock (market|price)|'
                || 'crypto|bitcoin|homework|translate|translation|summari[sz]e|summary|python|javascript|'
                || 'typescript|sql|html|css|code|coding|programming|e-?mail|cover letter|resume|cv|password|'
                || 'prompt|instructions|capital of|meaning of life|chatgpt|gpt|llm)\M')
     and v_text !~ '\m(what time is it|who are you|what are you|what can you do|how are you|who (is|was) the (best|greatest))\M'
  then
    return false;
  end if;
  -- (b) Nothing about moving.
  select * into v_parse from private.concierge_parse(p_text);
  if v_parse.sport_id is not null or v_parse.minutes is not null or v_parse.social then
    return false;
  end if;
  if v_text ~ ('\m(play|plays|playing|played|game|games|pickup|pick-?up|pick up|match|matches|scrimmage|'
               || 'kickabout|kick about|kick around|kick|shootaround|shoot around|shoot|ball|balling|ballin|'
               || 'hoop|court|courts|pitch|field|fields|park|track|trail|trails|gym|train|training|workout|'
               || 'workouts|work out|exercise|exercising|fitness|cardio|sweat|stretch|stretching|walk|walks|'
               || 'walking|hike|hikes|hiking|swim|swimming|laps|jogging|running|runs|ran|sprint|sprints|'
               || 'race|lift|lifting|yoga|pilates|dance|dancing|skate|skating|ski|skiing|snowboard|surf|surfing|'
               || 'paddle|kayak|row|sport|sports|active|move|moving|movement|league|tournament|session|sessions|'
               || 'team|teams|teammates?|squad|crew|partner|buddy|opponent|rematch|challenge|call out|callout|'
               || 'run it back|down for|i''?m down|need one more|game on|host|pickleball|padel|badminton|squash|'
               || 'golf|frisbee|ultimate|hockey|baseball|softball|cricket|rugby|handball|lacrosse|ping pong|'
               || 'table tennis|skateboard|spin|crossfit|hiit|bootcamp|boot camp|martial arts|judo|karate|bjj|'
               || 'jiu-?jitsu|wrestling|mma|muay thai|kickboxing|jouer|courir|marche|marcher|velo|partie|'
               || 'entrainement|nager|natation)\M')
  then
    return false;
  end if;
  return true;
end;
$$;

-- 3. The rules stub: nothing for off-topic text ---------------------------------------------------------------

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
  v_off_topic boolean;
  v_n integer := 0;
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
  v_off_topic := p_sport_id is null and p_minutes is null and private.concierge_off_topic(p_text);

  if not v_off_topic then
    return query select * from private.suggest(v_uid, v_minutes, v_sport, v_parse.social,
                                               least(greatest(coalesce(p_limit, 3), 1), 5));
    get diagnostics v_n = row_count;
  end if;
  perform private.emit('concierge_suggested', v_uid,
    jsonb_build_object('has_text', v_parse.has_text, 'minutes', v_minutes, 'sport_id', v_sport,
                       'social', v_parse.social, 'count', v_n, 'off_topic', v_off_topic));
end;
$$;

-- 4. Candidates carry the flag ------------------------------------------------------------------------------

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
    'parse', jsonb_build_object('minutes', v_parse.minutes, 'sport_id', v_parse.sport_id, 'social', v_parse.social,
                                'off_topic', private.concierge_off_topic(p_text)),
    'rows', v_rows);
end;
$$;

revoke all on function private.concierge_parse(text), private.concierge_off_topic(text) from public, anon, authenticated;
