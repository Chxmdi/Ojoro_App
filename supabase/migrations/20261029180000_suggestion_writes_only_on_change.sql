-- detect_suggestion rewrote the open suggestion on every call (expires_at moved each time), so every
-- chat_suggestions() read fired a realtime UPDATE, and each client's refetch fired another: a loop
-- across the whole crew. Now the open row is only written when something material changed (times,
-- places, interested people, the latest message considered, the label); a plain re-read is silent.
create or replace function private.detect_suggestion(p_crew uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew public.crews%rowtype;
  v_tz text;
  v_msgs record;
  v_texts text[] := '{}'::text[];
  v_senders uuid[] := '{}'::uuid[];
  v_last uuid;
  v_all text;
  v_sport text;
  v_day text;
  v_part text;
  v_hours numeric[] := '{}'::numeric[];
  v_before numeric;
  v_m text[];
  v_h numeric;
  v_date date;
  v_today date;
  v_dow integer;
  v_times timestamptz[] := '{}'::timestamptz[];
  v_interested uuid[] := '{}'::uuid[];
  v_places uuid[];
  v_day_key text;
  v_label text;
  v_open public.chat_suggestions%rowtype;
  v_id uuid;
  c_days constant text := '\m(tonight|today|tomorrow|tmrw|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\M';
  c_interest constant text := '\m(in|i''m in|im in|down|same|me too|count me|works|yes|yep|yeah|let''s|lets|who''s in|whos in|anyone|up for|keen)\M';
begin
  select * into v_crew from public.crews where id = p_crew and archived_at is null;
  if not found then
    return null;
  end if;
  v_tz := v_crew.time_zone;
  v_today := (now() at time zone v_tz)::date;

  -- Oldest first. Text only, live members only, words never leave this function.
  for v_msgs in
    select x.id, x.sender_id, private.fold(x.body) as t
    from (select m.id, m.sender_id, m.body, m.created_at from public.messages m
           where m.crew_id = p_crew and m.kind = 'text' and m.deleted_at is null
             and m.created_at > now() - interval '6 hours'
             and exists (select 1 from public.crew_members cm where cm.crew_id = p_crew and cm.user_id = m.sender_id)
           order by m.created_at desc, m.id desc limit 20) x
    order by x.created_at, x.id
  loop
    v_texts := v_texts || v_msgs.t;
    v_senders := v_senders || v_msgs.sender_id;
    v_last := v_msgs.id;
  end loop;
  if cardinality(v_texts) < 2 then
    return null;
  end if;
  v_all := array_to_string(v_texts, ' ');

  -- Sport: the newest message naming one; else the crew's usual sport.
  for v_i in reverse cardinality(v_texts) .. 1 loop
    select w.sport_id into v_sport from private.sport_words() w where v_texts[v_i] ~ w.pattern limit 1;
    exit when v_sport is not null;
  end loop;
  v_sport := coalesce(v_sport, v_crew.sport_id);

  -- Day: the newest message naming a day; within it, the last day named ("Thursday's a washout…
  -- Saturday instead?" → Saturday).
  for v_i in reverse cardinality(v_texts) .. 1 loop
    select (array_agg(m[1]))[count(*)] into v_day from regexp_matches(v_texts[v_i], c_days, 'g') m;
    if v_day is not null then
      exit;
    end if;
  end loop;
  if v_sport is null or v_day is null then
    return null;
  end if;

  -- Part of day: the newest message with one.
  for v_i in reverse cardinality(v_texts) .. 1 loop
    v_part := substring(v_texts[v_i] from '\m(morning|afternoon|evening|night|tonight)\M');
    exit when v_part is not null;
  end loop;
  if v_day = 'tonight' then
    v_part := 'evening';
  end if;
  if v_part in ('night', 'tonight') then
    v_part := 'evening';
  end if;

  -- Hours: "before 11", "at 7", "7:30", "8pm", "thursday 7".
  v_before := (select max(m[1]::numeric) from regexp_matches(v_all, '\mbefore (\d{1,2})\M', 'g') m);
  for v_m in select m from regexp_matches(v_all,
      '(?:\m(?:at|around|from|for|by|tonight|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun) ?@? ?(\d{1,2})(?::(\d{2}))? ?(am|pm)?\M)|(?:\m(\d{1,2}):(\d{2}) ?(am|pm)?)|(?:\m(\d{1,2}) ?(am|pm)\M)', 'g') m
  loop
    v_h := coalesce(v_m[1], v_m[4], v_m[7])::numeric;
    if v_h is null or v_h > 23 then
      continue;
    end if;
    v_h := v_h + coalesce(coalesce(v_m[2], v_m[5])::numeric, 0) / 60;
    if coalesce(v_m[3], v_m[6], v_m[8]) = 'pm' and v_h < 12 then
      v_h := v_h + 12;
    elsif coalesce(v_m[3], v_m[6], v_m[8]) is null and v_h < 12 then
      if v_part in ('evening', 'afternoon') or (v_part is null and v_h < 9) then
        v_h := v_h + 12;
      end if;
    end if;
    v_hours := v_hours || v_h;
  end loop;
  if cardinality(v_hours) = 0 then
    if v_before is not null then
      if v_part in ('evening', 'afternoon') and v_before < 12 then
        v_before := v_before + 12;
      end if;
      v_hours := array[v_before - 2, v_before - 1, v_before - 0.5];
    else
      v_hours := case v_part when 'morning' then array[9, 10, 11]::numeric[]
                             when 'afternoon' then array[13, 14, 15]::numeric[]
                             else array[18.5, 19, 19.5]::numeric[] end;
    end if;
  end if;
  v_part := coalesce(v_part, case when (select min(h) from unnest(v_hours) h) < 12 then 'morning'
                                  when (select min(h) from unnest(v_hours) h) < 17 then 'afternoon'
                                  else 'evening' end);

  -- The date in the crew's time zone.
  v_dow := case v_day
    when 'monday' then 1 when 'mon' then 1 when 'tuesday' then 2 when 'tue' then 2 when 'tues' then 2
    when 'wednesday' then 3 when 'wed' then 3 when 'thursday' then 4 when 'thu' then 4 when 'thur' then 4
    when 'thurs' then 4 when 'friday' then 5 when 'fri' then 5 when 'saturday' then 6 when 'sat' then 6
    when 'weekend' then 6 when 'sunday' then 7 when 'sun' then 7 end;
  v_date := case
    when v_day in ('today', 'tonight') then v_today
    when v_day in ('tomorrow', 'tmrw') then v_today + 1
    else v_today + ((v_dow - extract(isodow from v_today)::integer + 7) % 7)
  end;
  select coalesce(array_agg(t order by t), '{}') into v_times
  from (select distinct ((v_date + make_interval(mins => (h * 60)::integer))::timestamp at time zone v_tz) as t
          from unnest(v_hours) h where h >= 0 and h < 24) x
  where t > now() + interval '75 minutes';
  -- A weekday that's today but already past means next week.
  if cardinality(v_times) = 0 and v_dow is not null and v_date = v_today then
    v_date := v_date + 7;
    select coalesce(array_agg(t order by t), '{}') into v_times
    from (select distinct ((v_date + make_interval(mins => (h * 60)::integer))::timestamp at time zone v_tz) as t
            from unnest(v_hours) h where h >= 0 and h < 24) x;
  end if;
  v_times := v_times[1:4];
  if cardinality(v_times) = 0 then
    return null;
  end if;

  -- Interest: members whose message shows planning (a sport, a day, a time, or "in"/"same"/…).
  select coalesce(array_agg(distinct s), '{}') into v_interested
  from unnest(v_texts, v_senders) as x(t, s)
  where t ~ c_interest or t ~ c_days or exists (select 1 from private.sport_words() w where w.sport_id = v_sport and t ~ w.pattern);
  if cardinality(v_interested) < 2 then
    return null;
  end if;

  -- Places named in the chat, in the order first named. Key: the first distinctive word of the name
  -- ("Jeanne-Mance", "Indoor", "La Fontaine").
  select coalesce(array_agg(x.id order by x.pos), '{}') into v_places
  from (
    select pl.id, position(k.key in v_all) as pos
    from public.places pl
    cross join lateral (
      select case when char_length(split_part(n, ' ', 1)) < 4 then split_part(n, ' ', 1) || ' ' || split_part(n, ' ', 2)
                  else split_part(n, ' ', 1) end as key
      from (select regexp_replace(private.fold(pl.name), '^(parc|park|the|le|la place) ', '') as n) q
    ) k
    where char_length(k.key) >= 4 and position(k.key in v_all) > 0
  ) x;

  v_day_key := v_sport || ':' || v_date || ':' || v_part;
  v_label := trim(to_char(v_date, 'FMDay')) || ' ' || v_part;
  if v_date = v_today and v_part = 'evening' then
    v_label := 'tonight';
  elsif v_date = v_today + 1 then
    v_label := 'tomorrow ' || v_part;
  end if;

  select * into v_open from public.chat_suggestions s where s.crew_id = p_crew and s.status = 'open' for update;
  if found and (v_open.day_key <> v_day_key or v_open.expires_at <= now()) then
    update public.chat_suggestions set status = 'expired' where id = v_open.id;
    v_open := null;
  end if;

  if v_open.id is not null then
    update public.chat_suggestions
       set proposed_times = v_times, place_ids = v_places,
           interested_ids = (select coalesce(array_agg(distinct u), '{}') from unnest(v_open.interested_ids || v_interested) u),
           last_message_id = v_last, day_label = v_label,
           expires_at = least(now() + interval '12 hours', v_times[cardinality(v_times)] - interval '75 minutes')
     where id = v_open.id
       and (proposed_times, place_ids, last_message_id, day_label, interested_ids)
           is distinct from
           (v_times, v_places, v_last, v_label,
            (select coalesce(array_agg(distinct u), '{}') from unnest(v_open.interested_ids || v_interested) u));
    v_id := v_open.id;
  else
    -- An accepted suggestion for the same thing already became a plan: don't offer it again.
    if exists (select 1 from public.chat_suggestions s
               where s.crew_id = p_crew and s.day_key = v_day_key and s.status = 'accepted') then
      return null;
    end if;
    insert into public.chat_suggestions (crew_id, sport_id, day_label, day_key, proposed_times, place_ids,
                                         interested_ids, last_message_id, expires_at)
    values (p_crew, v_sport, v_label, v_day_key, v_times, v_places, v_interested, v_last,
            least(now() + interval '12 hours', v_times[cardinality(v_times)] - interval '75 minutes'))
    returning id into v_id;
    -- Facts only: never the words.
    perform private.emit('chat_suggestion_created', null,
      jsonb_build_object('crew_id', p_crew, 'sport_id', v_sport, 'interested', cardinality(v_interested)));
  end if;
  return v_id;
end;
$$;

