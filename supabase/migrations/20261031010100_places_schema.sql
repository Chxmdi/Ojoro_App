-- Step 7 (Places and Ojoro Pulse, PRD M8: §9.16, §11.2): what a place is, and realtime hints for
-- Pulse and the Place page.
--
-- Contract for the app: docs/PLACES_CONTRACT.md. Judgment calls: docs/DESIGN_DECISIONS.md
-- ("Step 7 BE-PLACES").
--
-- Places exist since Slice 01 (public.places: name, area, city, public centroid, sports, surface,
-- floodlit_until, is_free, time_zone). This migration extends that table; it does not add another.
--
-- What this adds:
--   1. Place facts: kind, a one-line description, facilities, verification (system-set), a photo, and
--      `sensitive` (PRD §11.2: sensitive places are never shown on their own on Pulse; their counts
--      only reach the area aggregate).
--   2. public.pulse_ticks: one row per city and per place, bumped when something visible on Pulse
--      changes. It carries no ids of people or plans, only "this city / this place changed at". The
--      app subscribes and refetches (realtime as a refetch hint).
--   3. Indexes for the place reads.

-- Place facts --------------------------------------------------------------------------------------------

alter table public.places
  add column kind public.place_kind not null default 'park',
  -- "Floodlit turf with two pitches and a track by the pond." Plain, no adjectives the data doesn't support.
  add column description text check (char_length(description) between 1 and 200),
  -- Lower-case words: 'lights', 'water', 'washrooms', 'changing rooms', 'bike racks'. At most 12.
  add column facilities text[] not null default '{}'
    check (cardinality(facilities) <= 12),
  add column verification public.place_verification not null default 'listed',
  add column verified_at timestamptz,
  -- PRD §11.2: places where showing presence could put people at risk (a shelter, a clinic, a
  -- school yard). Never a Pulse marker of their own; counts only inside their area's aggregate, and
  -- only from LATENT_DEMAND_K activities. Set by Ojoro, never by clients.
  add column sensitive boolean not null default false,
  -- Storage path of the place photo (public places only; no people in it). Null = the plain hero.
  add column photo_path text check (char_length(photo_path) <= 300),
  add constraint places_verified_at_check
    check ((verification = 'listed') = (verified_at is null));

comment on column public.places.sensitive is
  'PRD §11.2 suppression: never its own Pulse marker; counted only in the area aggregate.';
comment on column public.places.verification is
  'System-set. listed → community_confirmed → venue_verified.';

-- Indexes for the place reads (tonight here, regular groups, hosts here, busy times) ------------------------

create index if not exists plans_place_starts_idx on public.plans (place_id, starts_at) where place_id is not null;
create index if not exists activities_place_starts_idx on public.activities (place_id, starts_at)
  where place_id is not null;
create index if not exists clan_runs_place_starts_idx on public.clan_runs (place_id, starts_at)
  where place_id is not null;
create index if not exists rituals_place_idx on public.rituals (place_id) where place_id is not null;
create index if not exists host_series_place_idx on public.host_series (place_id);
create index if not exists intent_signals_active_area_idx on public.intent_signals (status, window_start)
  where status = 'active';

-- Pulse realtime hints ------------------------------------------------------------------------------------
-- One row per city ('<city>:*') and per place ('<city>:<place id>'). Bumped by triggers when a public
-- plan, its game, an open clan's club run, or a Down For signal changes. Subscribers refetch; the
-- reads decide what they may see. Private plans (friends, crew, invite-only) and invite-only clans
-- never bump a tick, so a tick can't reveal that something private happened at a place.

create table public.pulse_ticks (
  key text primary key,
  city text not null check (char_length(city) between 1 and 60),
  place_id uuid references public.places (id) on delete cascade,
  ticked_at timestamptz not null default now(),
  check (key = city || ':' || coalesce(place_id::text, '*'))
);
comment on table public.pulse_ticks is
  'Realtime refetch hints for Pulse (filter city=eq.<city>) and Place (place_id=eq.<id>). No people, no plans.';

alter table public.pulse_ticks enable row level security;
create policy "pulse_ticks: signed-in read" on public.pulse_ticks
  for select to authenticated using (true);
revoke insert, update, delete on public.pulse_ticks from anon, authenticated;

create or replace function private.pulse_tick(p_place uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_city text;
begin
  if p_place is null then
    return;
  end if;
  select pl.city into v_city from public.places pl where pl.id = p_place;
  if v_city is null then
    return;
  end if;
  insert into public.pulse_ticks as t (key, city, place_id, ticked_at)
  values (v_city || ':' || p_place::text, v_city, p_place, now()),
         (v_city || ':*', v_city, null, now())
  on conflict (key) do update set ticked_at = excluded.ticked_at;
end;
$$;

-- A Down For signal only moves the city row: the nearest place's city within 25 km of its coarse point.
create or replace function private.pulse_tick_point(p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_city text;
begin
  if p_lat is null or p_lng is null then
    return;
  end if;
  select pl.city into v_city
  from public.places pl
  where private.distance_m(p_lat, p_lng, pl.lat, pl.lng) <= 25000
  order by private.distance_m(p_lat, p_lng, pl.lat, pl.lng)
  limit 1;
  if v_city is null then
    return;
  end if;
  insert into public.pulse_ticks as t (key, city, place_id, ticked_at)
  values (v_city || ':*', v_city, null, now())
  on conflict (key) do update set ticked_at = excluded.ticked_at;
end;
$$;

create or replace function private.on_plan_pulse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.audience = 'public' then
    perform private.pulse_tick(new.place_id);
    if tg_op = 'UPDATE' and old.place_id is distinct from new.place_id then
      perform private.pulse_tick(old.place_id);
    end if;
  end if;
  return null;
end;
$$;

create or replace function private.on_activity_pulse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.plans p where p.id = new.plan_id and p.audience = 'public') then
    perform private.pulse_tick(new.place_id);
  end if;
  return null;
end;
$$;

create or replace function private.on_clan_run_pulse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.clans c where c.id = new.clan_id and c.join_policy <> 'invite') then
    perform private.pulse_tick(new.place_id);
  end if;
  return null;
end;
$$;

create or replace function private.on_signal_pulse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.audience = 'public' then
    perform private.pulse_tick_point(new.area_lat::double precision, new.area_lng::double precision);
  end if;
  return null;
end;
$$;

create trigger pulse_tick after insert or update of status, member_count, starts_at, place_id, deadline_at, capacity
  on public.plans for each row execute function private.on_plan_pulse();
create trigger pulse_tick after insert or update of status, live_at, ended_at, confirmed_count, starts_at, place_id
  on public.activities for each row execute function private.on_activity_pulse();
create trigger pulse_tick after insert or update of status, down_count, starts_at, place_id
  on public.clan_runs for each row execute function private.on_clan_run_pulse();
create trigger pulse_tick after insert or update of status
  on public.intent_signals for each row execute function private.on_signal_pulse();

revoke all on function private.pulse_tick(uuid) from public, anon, authenticated;
revoke all on function private.pulse_tick_point(double precision, double precision) from public, anon, authenticated;
revoke all on function private.on_plan_pulse() from public, anon, authenticated;
revoke all on function private.on_activity_pulse() from public, anon, authenticated;
revoke all on function private.on_clan_run_pulse() from public, anon, authenticated;
revoke all on function private.on_signal_pulse() from public, anon, authenticated;

alter publication supabase_realtime add table public.pulse_ticks;
