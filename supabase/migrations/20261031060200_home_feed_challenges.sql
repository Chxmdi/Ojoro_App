-- Polish (GAPS-FEED): Challenge Events on Main (home_feed), the gap listed in
-- docs/COMPETITION_CONTRACT.md "Not built" and docs/MESSAGING_CONTRACT.md "Main: home_feed".
-- A new card kind `challenge_event` and three columns at the end, so the function is dropped and
-- recreated (the return type changes). Starts from 20261029150300_messaging_live_suggestions_feed.sql,
-- the only earlier definition; every other card is unchanged.
--   card: needs_you | your_plan | crew_suggestion | crew_plan | plan_forming | down_for | recap |
--         challenge_event | caught_up
--   stage*, event*: challenge_event cards only (the stage, and the facts the strip draws);
--   situation*: the object's situation where it has one (forming / confirmed / live / after).

drop function if exists public.home_feed();

create function public.home_feed()
returns table (
  "position" integer,
  card text,
  action text,
  object_kind text,
  object_id uuid,
  plan_id uuid,
  activity_id uuid,
  crew_id uuid,
  sport_id text,
  sport_name text,
  title text,
  reason text,
  starts_at timestamptz,
  place_name text,
  member_count integer,
  capacity integer,
  people integer,
  notification_id uuid,
  href text,
  stage public.challenge_stage,
  situation text,
  event jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_radius integer;
begin
  select pp.discovery_radius_km into v_radius from public.profile_private pp where pp.user_id = v_uid;
  return query
  with
  -- 1. Things that need you (already filtered by visibility and blocks in notification_feed).
  needs as (
    select 'needs_you'::text as card, f.action as act, f.object_kind::text as okind, f.object_id as oid,
           f.plan_id as pid, f.activity_id as aid, f.crew_id as cid, null::text as sid,
           f.title as ttl, f.body as why, null::timestamptz as st, null::text as plname,
           null::integer as cnt, null::integer as cap, null::integer as ppl, f.id as nid, f.href as link,
           1000 - least(extract(epoch from now() - f.updated_at) / 3600, 99)::integer as score,
           null::public.challenge_stage as stg, null::text as sit, null::jsonb as ev
    from private.notification_feed(v_uid) f
    where f.needs_you
  ),
  -- 2. Your plans and games in the next 48 hours (forming or on, not finished).
  mine as (
    select 'your_plan', case when private.plan_status_now(p) = 'forming' and p.capacity - p.member_count = 1 then 'pull_in'
                             else 'open' end,
           'plan', p.id, p.id, a.id, p.crew_id, p.sport_id,
           coalesce(p.title, s.name),
           case when private.plan_status_now(p) = 'forming' then p.member_count || ' / ' || p.capacity || ' in'
                when private.activity_status_now(a) = 'live' then 'LIVE' else 'GAME ON' end,
           coalesce(a.starts_at, p.starts_at), pl.name, p.member_count, p.capacity, null::integer, null::uuid,
           case when a.id is not null and private.activity_status_now(a) = 'live' then '/activity/' || a.id || '/live'
                when a.id is not null then '/activity/' || a.id else '/plan/' || p.id end,
           case when coalesce(a.starts_at, p.starts_at) <= now() + interval '24 hours' then 900 else 600 end,
           null::public.challenge_stage,
           case when private.plan_status_now(p) = 'forming' then 'forming'
                when a.id is not null and private.activity_status_now(a) = 'live' then 'live' else 'confirmed' end,
           null::jsonb
    from public.plan_members m
    join public.plans p on p.id = m.plan_id
    join public.sports s on s.id = p.sport_id
    left join public.places pl on pl.id = p.place_id
    left join public.activities a on a.plan_id = p.id
    where m.user_id = v_uid
      and (private.plan_status_now(p) = 'forming'
           or (p.status = 'game_on' and a.id is not null and private.activity_status_now(a) in ('confirmed', 'live')
               and exists (select 1 from public.attendance t where t.activity_id = a.id and t.user_id = v_uid
                           and t.status in ('confirmed', 'checked_in'))))
      and coalesce(a.starts_at, p.starts_at) <= now() + interval '48 hours'
  ),
  -- 3. Crew opportunities: open suggestions and forming crew plans you're not in.
  crew_sugg as (
    select 'crew_suggestion', 'make_this_a_game', 'crew', s.crew_id, null::uuid, null::uuid, s.crew_id, s.sport_id,
           c.name || ': ' || lower(sp.name) || ' ' || s.day_label || '?',
           cardinality(s.interested_ids) || ' of you want in',
           s.proposed_times[1], null::text, null::integer, null::integer, cardinality(s.interested_ids), null::uuid,
           '/crew/' || s.crew_id || '/chat', 800, null::public.challenge_stage, null::text, null::jsonb
    from public.chat_suggestions s
    join public.crews c on c.id = s.crew_id
    join public.sports sp on sp.id = s.sport_id
    where s.status = 'open' and s.expires_at > now()
      and authz.is_crew_member(s.crew_id, v_uid)
      and not exists (select 1 from public.chat_suggestion_dismissals d where d.suggestion_id = s.id and d.user_id = v_uid)
  ),
  crew_plans as (
    select 'crew_plan', 'im_down', 'plan', p.id, p.id, null::uuid, p.crew_id, p.sport_id,
           c.name || ' · ' || coalesce(p.title, sp.name), p.member_count || ' / ' || p.capacity || ' in',
           p.starts_at, pl.name, p.member_count, p.capacity, null::integer, null::uuid, '/plan/' || p.id,
           750, null::public.challenge_stage, 'forming', null::jsonb
    from public.plans p
    join public.crews c on c.id = p.crew_id
    join public.sports sp on sp.id = p.sport_id
    left join public.places pl on pl.id = p.place_id
    where p.audience = 'crew' and private.plan_status_now(p) = 'forming' and p.member_count < p.capacity
      and p.starts_at > now()
      and authz.is_crew_member(p.crew_id, v_uid)
      and not exists (select 1 from public.plan_members m
                      where m.plan_id = p.id and (m.user_id = v_uid or authz.is_blocked(m.user_id, v_uid)))
  ),
  -- 4. Plans forming near you that you can join (visibility and blocks filtered in opportunities()).
  forming as (
    select 'plan_forming', 'im_down', 'plan', o.plan_id, o.plan_id, null::uuid, null::uuid, o.sport_id,
           coalesce(o.title, o.sport_name), o.reason, o.starts_at, o.place_name, o.member_count, o.capacity,
           null::integer, null::uuid, '/plan/' || o.plan_id,
           case when o.spots_left = 1 then 700 else 500 end
             - least(extract(epoch from o.starts_at - now()) / 3600, 168)::integer,
           null::public.challenge_stage, 'forming', null::jsonb
    from private.opportunities(v_uid, now() + interval '7 days', null, coalesce(v_radius, 3)::numeric, false, null) o
    where o.kind = 'plan'
  ),
  -- 5. Down For: the sport most people near you are down for (none if you're already down for it).
  downs as (
    select 'down_for', 'down_for', 'sport', null::uuid, null::uuid, null::uuid, null::uuid, d.sport_id,
           sp.name, count(*) || case when count(*) = 1 then ' person near you is down' else ' people near you are down' end,
           min(d.window_start), null::text, null::integer, null::integer, count(*)::integer, null::uuid, null::text,
           650, null::public.challenge_stage, null::text, null::jsonb
    from public.down_for_nearby(null, 100) d
    join public.sports sp on sp.id = d.sport_id
    where auth.uid() = v_uid
      and not exists (select 1 from public.intent_signals i
                      where i.user_id = v_uid and i.sport_id = d.sport_id and i.status = 'active' and i.expires_at > now())
    group by d.sport_id, sp.name
    order by count(*) desc, d.sport_id
    limit 1
  ),
  -- 6. Your latest recap (last 7 days).
  recap as (
    select 'recap', case when private.activity_status_now(a) in ('after', 'complete') then 'run_it_back' else 'open' end,
           'activity', a.id, a.plan_id, a.id, null::uuid, a.sport_id,
           coalesce(a.title, sp.name),
           r.played_count || ' played · ' || r.duration_minutes || ' min',
           r.occurred_at, pl.name, null::integer, null::integer, r.played_count, null::uuid,
           '/activity/' || a.id || '/recap', 300, null::public.challenge_stage, 'after', null::jsonb
    from public.recaps r
    join public.activities a on a.id = r.activity_id
    join public.sports sp on sp.id = a.sport_id
    left join public.places pl on pl.id = a.place_id
    where authz.is_player(a.id, v_uid) and r.occurred_at > now() - interval '7 days'
    order by r.occurred_at desc
    limit 1
  ),
  -- 7. Polish (GAPS-FEED): Challenge Events you compete in, organize, follow, or that involve your
  --    crew (a side), a rival, a crew-mate or a clan-mate. Audience and blocks (pauses included)
  --    through authz.can_see_challenge_event; upcoming within 14 days, live, being verified, or
  --    final in the last 48 hours; never called off. At most 4, so the feed stays a mix.
  ev_base as (
    select e, private.challenge_stage(e) as stg,
      case
        when exists (select 1 from public.challenge_competitors c where c.event_id = e.id and c.user_id = v_uid) then 'competitor'
        when authz.is_challenge_organizer(e.id, v_uid) then 'organizer'
        when authz.is_crew_member(e.a_crew_id, v_uid) or authz.is_crew_member(e.b_crew_id, v_uid) then 'your_crew'
        when exists (select 1 from public.challenge_followers f where f.event_id = e.id and f.user_id = v_uid) then 'following'
        when exists (select 1 from public.challenge_competitors c join public.rivalries r
                       on r.kind = 'people' and r.low_id = least(c.user_id, v_uid) and r.high_id = greatest(c.user_id, v_uid)
                     where c.event_id = e.id and c.user_id <> v_uid)
          or exists (select 1 from public.rivalries r join public.crew_members m on m.user_id = v_uid
                     where r.kind = 'crews'
                       and ((r.low_id = m.crew_id and r.high_id in (e.a_crew_id, e.b_crew_id))
                            or (r.high_id = m.crew_id and r.low_id in (e.a_crew_id, e.b_crew_id)))) then 'rival'
        when exists (select 1 from public.challenge_competitors c
                     join public.crew_members m2 on m2.user_id = c.user_id
                     join public.crew_members m1 on m1.crew_id = m2.crew_id and m1.user_id = v_uid
                     where c.event_id = e.id and c.user_id <> v_uid) then 'crew'
        when exists (select 1 from public.challenge_competitors c
                     join public.clan_members k2 on k2.user_id = c.user_id
                     join public.clan_members k1 on k1.clan_id = k2.clan_id and k1.user_id = v_uid
                     where c.event_id = e.id and c.user_id <> v_uid) then 'clan'
      end as rel
    from public.challenge_events e
    where (e.status in ('scheduled', 'live', 'verifying', 'disputed')
           or (e.status = 'complete' and e.completed_at > now() - interval '48 hours'))
      and e.starts_at <= now() + interval '14 days'
  ),
  ev_rows as (
    select b.*, (b.e).id as eid, private.my_side(b.e, v_uid) as side,
           private.side_name(b.e, 'a') as a_name, private.side_name(b.e, 'b') as b_name
    from ev_base b
    where b.rel is not null and b.stg <> 'cancelled'
      and authz.can_see_challenge_event((b.e).id, v_uid)
  ),
  ev_scored as (
    select x.*,
      case
        when x.stg = 'live' then case when x.rel in ('competitor', 'organizer', 'your_crew') then 950
                                      when x.rel = 'following' then 850 else 700 end
        when x.stg in ('today', 'soon') then case when x.rel in ('competitor', 'organizer') then 880
                                                  when x.rel in ('your_crew', 'following') then 720 else 600 end
        when x.stg in ('verifying', 'disputed') then case when x.rel in ('competitor', 'organizer') then 860 else 350 end
        when x.stg = 'complete' then case when x.rel in ('competitor', 'organizer', 'your_crew', 'following') then 320 else 310 end
        else case when x.rel in ('competitor', 'organizer') then 640
                  when x.rel in ('your_crew', 'following') then 560 else 450 end
             - (least(extract(epoch from (x.e).starts_at - now()) / 3600, 336) / 24)::integer
      end as score
    from ev_rows x
  ),
  challenges as (
    select 'challenge_event'::text, 'open'::text, 'challenge_event'::text, x.eid, null::uuid, null::uuid,
           case when authz.is_crew_member((x.e).a_crew_id, v_uid) then (x.e).a_crew_id
                when authz.is_crew_member((x.e).b_crew_id, v_uid) then (x.e).b_crew_id end,
           (x.e).sport_id,
           -- Your side first (contract rule 9).
           case when x.side = 'b' then x.b_name || ' vs ' || x.a_name else x.a_name || ' vs ' || x.b_name end
             || case when (x.e).format = 'person_vs_person' then ' · ' || (x.e).title else '' end,
           case x.stg
             when 'accepted' then 'Accepted' when 'days' then 'Build-up' when 'today' then 'Event day'
             when 'soon' then 'Almost time' when 'live' then 'Live' when 'verifying' then 'Verifying'
             when 'disputed' then 'Correction open' else 'Final' end
           || ' · ' || case x.rel
             when 'competitor' then 'you''re in it' when 'organizer' then 'you''re organizing'
             when 'your_crew' then 'your crew' when 'following' then 'you follow'
             when 'rival' then 'your rival' when 'crew' then 'from your crew' else 'from your clan' end,
           (x.e).starts_at, (select pl.name from public.places pl where pl.id = (x.e).place_id),
           null::integer, null::integer, (x.e).follower_count, null::uuid, '/event/' || x.eid,
           x.score, x.stg, private.challenge_situation(x.stg),
           jsonb_build_object(
             'event_id', x.eid, 'stage', x.stg, 'relation', x.rel, 'format', (x.e).format,
             'title', (x.e).title, 'starts_at', (x.e).starts_at, 'time_zone', (x.e).time_zone,
             'a_name', x.a_name, 'b_name', x.b_name, 'my_side', x.side, 'side_size', (x.e).side_size,
             'follower_count', (x.e).follower_count, 'scoring', (x.e).scoring, 'target', (x.e).target,
             'unit', (x.e).unit, 'live_period', (x.e).live_period,
             'winner_side', (select r.winner_side from public.challenge_results r where r.event_id = x.eid))
    from ev_scored x
    order by x.score desc, (x.e).starts_at, x.eid
    limit 4
  ),
  candidates as (
    select * from needs
    union all select * from mine
    union all select * from crew_sugg
    union all select * from crew_plans
    union all select * from forming
    union all select * from downs
    union all select * from recap
    union all select * from challenges
  ),
  -- One card per object: the best one.
  deduped as (
    select distinct on (coalesce(x.pid, x.oid, x.nid)) x.*
    from candidates x
    order by coalesce(x.pid, x.oid, x.nid), x.score desc
  ),
  ranked as (
    select d.*, row_number() over (order by d.score desc, d.st nulls last, d.oid)::integer as pos
    from deduped d
  )
  select r.pos, r.card, r.act, r.okind, r.oid, r.pid, r.aid, r.cid, r.sid,
         (select sp.name from public.sports sp where sp.id = r.sid), r.ttl, r.why, r.st, r.plname, r.cnt, r.cap,
         r.ppl, r.nid, r.link, r.stg, r.sit, r.ev
  from ranked r where r.pos <= 12
  union all
  select (select least(count(*), 12)::integer + 1 from ranked), 'caught_up', 'none', null, null, null, null, null,
         null, null, 'YOU''RE CAUGHT UP.', 'Go do something.', null, null, null, null, null, null, null,
         null, null, null
  order by 1;
end;
$$;

revoke all on function public.home_feed() from public, anon;
grant execute on function public.home_feed() to authenticated, service_role;
