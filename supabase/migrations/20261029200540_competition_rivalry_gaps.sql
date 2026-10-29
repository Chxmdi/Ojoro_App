-- Step 5 (Competition): Rivalry and Compete gaps.
--   * rivalry_view adds rematch_of_event_id for a pending rematch. (Generated types still say
--     non-null; `RivalryView` in @ojoro/contracts marks the nullable columns.)
--   * my_rivalries adds the opponent: opponent_user_id (people) / opponent_crew_id (crews). The
--     caller is always side `a` in both.
--   * report('rivalry', id): anyone who can see one of its events.
-- Contract: docs/COMPETITION_CONTRACT.md §Rivalries and rematch.

drop function if exists public.my_rivalries(integer);
drop function if exists public.rivalry_view(uuid);


create function public.rivalry_view(p_rivalry_id uuid)
returns table (
  rivalry_id uuid,
  kind public.rivalry_kind,
  a_id uuid,
  a_name text,
  b_id uuid,
  b_name text,
  i_am_in boolean,
  meetings integer,
  a_wins integer,
  b_wins integer,
  draws integer,
  form text[],
  streak_side text,
  streak_length integer,
  last_event_id uuid,
  last_winner text,
  last_margin numeric,
  last_scoring public.challenge_scoring,
  last_unit text,
  last_title text,
  next_event_id uuid,
  next_title text,
  next_starts_at timestamptz,
  next_time_zone text,
  next_stage public.challenge_stage,
  rematch_call_out_id uuid,
  rematch_from text,
  rematch_from_name text,
  rematch_message text,
  rematch_title text,
  rematch_starts_at timestamptz,
  rematch_can_answer boolean,
  rematch_of_event_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_r public.rivalries%rowtype;
  v_low boolean;
  v_a uuid;
  v_b uuid;
  v_ws text[];
  v_streak_side text;
  v_streak integer := 0;
  v_next public.challenge_events%rowtype;
  v_reb public.call_outs%rowtype;
  v_last_event uuid;
  v_last_winner text;
  v_last_margin numeric;
  v_last_scoring public.challenge_scoring;
  v_last_unit text;
  v_last_title text;
begin
  select * into v_r from public.rivalries x where x.id = p_rivalry_id;
  if not found or not exists (select 1 from public.challenge_events e
                              where e.rivalry_id = v_r.id and authz.can_see_challenge_event(e.id, v_uid)) then
    perform private.fail('rivalry_not_found');
  end if;
  v_low := private.rivalry_a_is_low(v_r, v_uid);
  v_a := case when v_low then v_r.low_id else v_r.high_id end;
  v_b := case when v_low then v_r.high_id else v_r.low_id end;
  select coalesce(array_agg(q.winner order by q.verified_at, q.starts_at), '{}') into v_ws
  from private.rivalry_results(v_r.id, v_uid) q;
  -- Streak: the run of the same winner from the latest meeting back (a draw ends it).
  if cardinality(v_ws) > 0 and v_ws[cardinality(v_ws)] <> 'd' then
    v_streak_side := v_ws[cardinality(v_ws)];
    for i in reverse cardinality(v_ws)..1 loop
      exit when v_ws[i] <> v_streak_side;
      v_streak := v_streak + 1;
    end loop;
  end if;
  select q.event_id, q.winner, q.margin, q.scoring, q.unit, q.title
    into v_last_event, v_last_winner, v_last_margin, v_last_scoring, v_last_unit, v_last_title
  from private.rivalry_results(v_r.id, v_uid) q order by q.verified_at desc, q.starts_at desc limit 1;
  select * into v_next from public.challenge_events e
   where e.rivalry_id = v_r.id and e.status in ('scheduled', 'live', 'verifying', 'disputed')
     and private.challenge_stage(e) <> 'cancelled' and authz.can_see_challenge_event(e.id, v_uid)
   order by e.starts_at limit 1;
  select * into v_reb from public.call_outs o
   where o.rivalry_id = v_r.id and o.rematch_of_event_id is not null and o.status = 'proposed' and o.expires_at > now()
     and authz.can_see_call_out(o.id, v_uid)
   order by o.created_at desc limit 1;

  return query
  select v_r.id, v_r.kind, v_a, private.rivalry_side_name(v_r, v_low), v_b, private.rivalry_side_name(v_r, not v_low),
         case when v_r.kind = 'people' then v_uid in (v_r.low_id, v_r.high_id)
              else authz.is_crew_member(v_r.low_id, v_uid) or authz.is_crew_member(v_r.high_id, v_uid) end,
         cardinality(v_ws),
         (select count(*)::integer from unnest(v_ws) w where w = 'a'),
         (select count(*)::integer from unnest(v_ws) w where w = 'b'),
         (select count(*)::integer from unnest(v_ws) w where w = 'd'),
         case when cardinality(v_ws) > 8 then v_ws[cardinality(v_ws) - 7:cardinality(v_ws)] else v_ws end,
         v_streak_side, v_streak,
         v_last_event, v_last_winner, v_last_margin, v_last_scoring, v_last_unit, v_last_title,
         v_next.id, v_next.title, v_next.starts_at, v_next.time_zone,
         case when v_next.id is not null then private.challenge_stage(v_next) end,
         v_reb.id,
         case when v_reb.id is null then null
              when coalesce(v_reb.challenger_crew_id, v_reb.challenger_id) = v_a then 'a' else 'b' end,
         case when v_reb.id is not null then private.call_out_side_name(v_reb, true) end,
         v_reb.message, v_reb.title, v_reb.starts_at,
         case when v_reb.id is not null then private.can_answer_call_out(v_reb, v_uid) else false end,
         v_reb.rematch_of_event_id;
end;
$$;

create function public.my_rivalries(p_limit integer default 10)
returns table (
  rivalry_id uuid,
  kind public.rivalry_kind,
  a_name text,
  b_name text,
  meetings integer,
  a_wins integer,
  b_wins integer,
  draws integer,
  form text[],
  next_event_id uuid,
  next_title text,
  next_starts_at timestamptz,
  next_time_zone text,
  last_active_at timestamptz,
  opponent_user_id uuid,
  opponent_crew_id uuid
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
  with mine as materialized (
    select r.id as rid,
           (select max(greatest(e.accepted_at, coalesce(e.completed_at, e.accepted_at)))
              from public.challenge_events e where e.rivalry_id = r.id) as active_at
    from public.rivalries r
    where ((r.kind = 'people' and v_uid in (r.low_id, r.high_id))
           or (r.kind = 'crews' and (authz.is_crew_member(r.low_id, v_uid) or authz.is_crew_member(r.high_id, v_uid))))
      and exists (select 1 from public.challenge_events e
                  where e.rivalry_id = r.id and authz.can_see_challenge_event(e.id, v_uid))
    order by 2 desc nulls last
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
  )
  select v.rivalry_id, v.kind, v.a_name, v.b_name, v.meetings, v.a_wins, v.b_wins, v.draws, v.form,
         v.next_event_id, v.next_title, v.next_starts_at, v.next_time_zone, m.active_at,
         case when v.kind = 'people' then v.b_id end, case when v.kind = 'crews' then v.b_id end
  from mine m
  cross join lateral public.rivalry_view(m.rid) v
  order by m.active_at desc nulls last;
end;
$$;

create or replace function public.report(
  p_subject_kind public.report_subject,
  p_subject_id uuid,
  p_reason public.report_reason,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
  v_exists boolean;
begin
  if (select count(*) from public.reports r
      where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours') >= 20 then
    perform private.fail('report_rate_limited');
  end if;
  v_exists := case p_subject_kind
    when 'profile' then exists (select 1 from public.profiles where id = p_subject_id)
    when 'plan' then exists (select 1 from public.plans where id = p_subject_id)
    when 'activity' then exists (select 1 from public.activities where id = p_subject_id)
    when 'moment' then exists (select 1 from public.moments where id = p_subject_id)
    when 'result' then exists (select 1 from public.result_proposals where id = p_subject_id)
    -- Only a message you can read (or wrote) can be reported.
    when 'message' then exists (select 1 from public.messages m where m.id = p_subject_id
                                  and (m.sender_id = v_uid or authz.can_read_thread(m.crew_id, m.activity_id, v_uid)))
    when 'update' then exists (select 1 from public.activity_updates u where u.id = p_subject_id
                                 and authz.can_see_activity(u.activity_id, v_uid))
    -- Step 5: only what you can see.
    when 'call_out' then authz.can_see_call_out(p_subject_id, v_uid)
    when 'challenge_event' then authz.can_see_challenge_event(p_subject_id, v_uid)
    when 'challenge_post' then exists (select 1 from public.challenge_posts p where p.id = p_subject_id
                                         and p.author_id is not null
                                         and authz.can_see_challenge_event(p.event_id, v_uid))
    when 'challenge_comment' then exists (select 1 from public.challenge_comments c where c.id = p_subject_id
                                            and authz.can_see_challenge_event(c.event_id, v_uid))
    when 'rivalry' then exists (select 1 from public.challenge_events e
                                 where e.rivalry_id = p_subject_id and authz.can_see_challenge_event(e.id, v_uid))
  end;
  if not coalesce(v_exists, false) then
    perform private.fail('subject_not_found');
  end if;
  if char_length(p_note) > 1000 then
    perform private.fail('invalid_argument', 'note');
  end if;
  insert into public.reports (reporter_id, subject_kind, subject_id, reason, note)
  values (v_uid, p_subject_kind, p_subject_id, p_reason, nullif(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.rivalry_view(uuid) from public, anon;
grant execute on function public.rivalry_view(uuid) to authenticated, service_role;
revoke all on function public.my_rivalries(integer) from public, anon;
grant execute on function public.my_rivalries(integer) to authenticated, service_role;
