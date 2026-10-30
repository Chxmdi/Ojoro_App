# Step 7: Places and Ojoro Pulse backend contract

The data layer for **Pulse** (the map of areas with activity aggregates, filters and the selected-place
sheet) and **Place** (what a place is, tonight here, regular groups, hosts here, when it's busy, CREATE
ACTIVITY HERE), PRD M8 §9.16 and §11.2. It extends [`SLICE01_CONTRACT.md`](SLICE01_CONTRACT.md) (places
since Slice 01) and [`LIQUIDITY_CONTRACT.md`](LIQUIDITY_CONTRACT.md) (areas, latent demand,
`places_nearby`, `sports_nearby`): every rule there (write only through RPCs, map errors by code,
effective status computed on read, no raw location) still applies. Judgment calls are in
`docs/DESIGN_DECISIONS.md` ("Step 7 BE-PLACES").

- Schema: `supabase/migrations/20261031010000_places_enums.sql` (`place_kind`, `place_verification`,
  report kind `place`), `…010100_places_schema.sql` (place facts, `pulse_ticks`, indexes),
  `…010200_places_reads.sql` (the reads, the report seam).
- Generated types: `@ojoro/contracts` (`Database`), plus row aliases with the nullable columns marked
  `| null` (use these, not the raw `Functions[…]['Returns']`): `PulseMarker`, `PulsePlace`, `PlaceView`,
  `PlaceTonightItem`, `PlaceGroup`, `PlaceHost`, `PlaceBusyTime`; enums `PlaceKind`,
  `PlaceVerification`, `DayPart`; unions `PulseWhen`, `PulseMarkerKind`, `PlaceTonightKind`,
  `PlaceGroupKind`, `PlaceGroupAccess`.
- Client helpers in `@ojoro/contracts` (`places.ts`): `placesRpcs`, `placesLoggedReadRpcs`,
  `placesErrorCodes` (all pre-existing codes), `PULSE_WHEN`, `PULSE_WHEN_WORDS`, `PULSE_WHEN_LABEL`,
  `busyPartLabel`, `busyBars`, `tonightTag`, `groupTag`, `groupCadence`, `hostedHereWords`,
  `placeCreatePrefill`, `pulseTextAlternative`, the DS adapters `pulseMapPoints` / `pulseMapAreas`
  (AreaMap `points` / `areas`), `busyTimesData` (BusyTimes `data` + today's index) and `liveWord`, realtime `pulseSubscription(city)`,
  `placeSubscription(placeId)`, and the limits `PULSE_DEMAND_K` (3), `PLACE_BUSY_MIN_GAMES` (6),
  `PLACE_HOST_MIN_GAMES` (5), `TRUSTED_HOST_GAMES` (20), `TRUSTED_HOST_GREAT_HOST_FROM` (5),
  `PULSE_REFETCH_MS` (60 000).
- Tests: `supabase/tests/31_pulse.sql`, `32_place.sql`, `33_place_privacy_realtime.sql`;
  `packages/contracts/src/places.test.ts`.
- Seed: `supabase/seed_places.sql` (see [Local data](#local-data)).

Contents: [Rules](#rules) · [Errors](#errors) · [Privacy](#privacy) · [Model](#model) ·
[Pulse](#pulse) · [Selected place sheet](#selected-place-sheet) · [Place](#place) ·
[Report](#report) · [Realtime](#realtime) · [Analytics](#analytics) · [Screens](#screens) ·
[Local data](#local-data) · [Not built](#not-built)

---

## Rules

1. **Everything here is a read.** No new writes: CREATE ACTIVITY HERE / CREATE HERE open Create with
   the prefill and the user commits through `create_plan` (Slice 01); joining from a row is `im_down`
   / `join_waitlist` / `join_clan_run` as before.
2. **Logged reads are POST.** `pulse` and `place_view` record an analytics event, so they are
   `volatile`: call them with the default `supabase.rpc(name, args)`, never `{ get: true }`. The
   others are plain reads. All are signed-in only.
3. **Documented nullable columns are `T | null`** even where the generated types say otherwise (Slice 01
   rule 7). Use the aliases above.
4. **Times:** format `starts_at`, `forming_starts_at`, `prefill_starts_at` in the row's `time_zone`
   (the place's). `local_time` / `floodlit_until` are wall-clock times there.
5. **Windows (`p_when`):** `now` (the next hour, live included), `tonight` (default: from now until
   4 AM local, live included), `today` (until midnight), `tomorrow`, `weekend`, `week` (7 days).
   Anything else → `invalid_argument` (detail `when`). Same words as `discover_search`, except that
   `tonight` starts now (Pulse is live), not at 5 PM.
6. **Pulse has no clock of its own:** refetch every `PULSE_REFETCH_MS` while visible, on focus, and on a
   realtime hint.

## Errors

No new codes. Raised here (SQLSTATE `P0001`, code = `error.message`):

| Code | When |
|---|---|
| `place_unknown` | No such place (`pulse_place`, `place_view`, `place_tonight`, `place_groups`, `place_hosts`, `place_busy_times`). Show the place-not-found state with a way back to Pulse. |
| `sport_unknown` | `p_sport_id` isn't a sport (`pulse`, `pulse_place`). |
| `radius_invalid` | `p_radius_km` outside 1–50 (`pulse`). |
| `invalid_argument` | detail `when`: `p_when` isn't one of the windows. |
| `not_authenticated` | Signed out. |

## Privacy

| Rule | How |
|---|---|
| Areas, not people | Pulse returns places, areas and counts. No person's id, name, avatar or position ever. |
| Only public centroids | Place markers carry the place's public centroid (4 decimals); area and demand markers the area's 0.01° centroid (`areas_list`). Never a meeting point on Pulse. |
| Exact spots only inside plans you've joined | `place_tonight.meeting_point` ("North pitch, by the lights") is set only for the host and members of that plan; null for everyone else. |
| Visibility | A plan counts and lists only if `authz.can_see_plan` (friends, crew and invite-only plans stay invisible to others, including in counts); a club run only if you can see its clan; crew Rituals only for crew members; invite-only clans' Rituals only for members. |
| k-anonymity for people counts | Latent demand on Pulse (`kind = 'demand'`) shows only from **3** people (`PULSE_DEMAND_K`, the same k as `latent_demand`), never includes you, never across a block, friends-only signals only from people you've played with, and only when nothing in that sport is forming in that area. Counts only: no ids, names, places or exact times. |
| Sensitive places (PRD §11.2) | `places.sensitive` (set by Ojoro): never a Pulse marker of its own; its activities reach the area aggregate only when the area has at least 3 of them; `pulse_place` returns `suppressed = true` with null counts; `place_view` counts and `place_tonight` list only what you're in. |
| Busy times | From finished sessions of **public** plans and open/request clans' club runs in the last 12 weeks, as 0–100 levels. Nothing until 6 sessions (`PLACE_BUSY_MIN_GAMES`). |
| Hosts here | Listed when they run a host series here (a public role), or hosted at least 5 finished games here **and** their history is visible to you. Never across a block. |
| Realtime | `pulse_ticks` carries only a city, a place id and a time. Private plans and invite-only clans never bump a tick. |

## Model

`public.places` (Slice 01) gains, all set by Ojoro (no client writes):

| Column | Meaning |
|---|---|
| `kind` | `place_kind`: `park`, `pitch`, `court`, `track`, `gym`, `club`, `pool`, `trail`, `studio`, `other`. |
| `description` | One plain line, nullable. |
| `facilities` | Lower-case words, at most 12 (`lights`, `water`, `washrooms`, `changing rooms`). |
| `verification` | `place_verification`: `listed` (from public data), `community_confirmed` (games checked in there), `venue_verified` (the venue confirmed). `verified_at` set unless `listed`. |
| `sensitive` | PRD §11.2 suppression (see Privacy). |
| `photo_path` | Place photo path (no people), nullable: null → the plain hero with the O. |

`public.pulse_ticks(key, city, place_id, ticked_at)`: realtime hints (see [Realtime](#realtime)).
Readable by everyone signed in; no client writes.

## Pulse

**`pulse(p_sport_id text = null, p_when text = 'tonight', p_radius_km int = null) → PulseMarker[]`**
(POST). Within `p_radius_km` of your area (default: your discovery radius; everything when you have
no area, `distance_km` null). One row per marker:

| Column | `place` | `area` | `demand` |
|---|---|---|---|
| `marker_id` | `place:{id}` | `area:{city}:{area}` | `demand:{city}:{area}:{sport}` (stable keys for the map) |
| `place_id`, `place_name` | set | null | null |
| `area`, `city`, `label` | the place's area | the area | the area ("Plateau, Montréal") |
| `lat`, `lng` | the place's public centroid | the area centroid (0.01°) | the area centroid |
| `distance_km` | from your area | to the centroid | to the centroid |
| `activity_count`, `live_count`, `forming_count` | what's on there in the window | the area total (sensitive places only from 3) | null |
| `forming_plan_id`, `forming_sport_name`, `forming_member_count`, `forming_capacity`, `forming_starts_at` | the forming plan with the most people in (then fewest spots left, then soonest): "FORMING 6 / 8" | null | null |
| `live_activity_id`, `live_title` | the first live game or run ("SPARRING") | null | null |
| `sport_id`, `sport_name`, `people_count` | null | null | "5 WANT VOLLEYBALL" |
| `summary` | "Jeanne-Mance Park: 12 activities tonight, football forming at 6 of 8, Sparring rounds live now." | "Plateau: 14 activities tonight." | "5 people want volleyball near Plateau tonight." |

- Places: non-sensitive places with at least one thing on in the window (forming plans before their
  deadline, GAME ON games not started, live games/runs when the window includes now, club runs),
  visible to you. Ordered places (busiest first), then demand (most people first), then areas.
- Demand: active Down For signals whose window overlaps the filter, from people whose coarse point is
  within 2.5 km of the area's centroid (one person can count near two neighbouring areas).
- Marker style (DS `AreaMap`): `live_count > 0` → live pill (`live_title`), `forming_plan_id` → the
  FORMING n / m pill, otherwise the count disc (`activity_count`; big with ACTIVE when it's the busiest);
  `demand` → the dashed disc. Areas are the zoomed-out layer (or labels); a renderer may skip area
  markers whose places are shown.
- Map: `pulseMapPoints(rows)` → AreaMap points (place rows: `activeCount`, `forming {count, capacity,
  sport}`, `live {word}`; demand rows: `wanting {count, sport}` at the area centroid, named "Near Plateau");
  `pulseMapAreas(rows)` → the neighbourhood labels.
- Text alternative: `pulseTextAlternative(markers, { label: 'central Montréal' })` joins the
  summaries (places, then areas without a listed place, then demand) and ends with "Areas, not people."
- Filter chips: Step 3 `sports_nearby()` (Everything = `p_sport_id` null). Header "Tonight · 3 km":
  `PULSE_WHEN_LABEL[when]` · `home_density().radius_km`.

## Selected place sheet

**`pulse_place(p_place_id, p_sport_id = null, p_when = 'tonight') → PulsePlace` (one row)**

| Column | Meaning |
|---|---|
| `name`, `area`, `city`, `kind`, `time_zone` | The place. |
| `main_sport_id`, `main_sport_name` | The filter's sport when the place has it, else the sport most played here (12 weeks), else its first sport. |
| `facts` | "Football · turf · floodlit until 11 PM · 1.2 km" (sport, surface, lights, distance). |
| `surface`, `floodlit_until`, `is_free`, `distance_km` | The parts. |
| `suppressed` | Sensitive place: counts are null and `headline` says why. |
| `activity_count`, `live_count`, `forming_count`, `forming_*` | As on the marker. |
| `headline` | "12 activities tonight. Football is forming at 6 / 8 for 7:30." / "Nothing on tonight yet." |

OPEN PLACE → `/place/{place_id}`; CREATE HERE → Create with `placeCreatePrefill(place_view)` (or just
`p_place_id` and the sheet's `main_sport_id`); the footer "Areas, not people. Exact spots show only
inside plans you've joined." is static copy.

## Place

**`place_view(p_place_id) → PlaceView` (one row, POST)**

| Column | Meaning |
|---|---|
| `slug`, `name`, `area`, `city`, `area_label`, `kind`, `description`, `photo_path` | Header: "PLATEAU · 1.2 KM", "JEANNE-MANCE PARK." |
| `sport_ids`, `sport_names`, `main_sport_id`, `main_sport_name` | Sports (catalog order of the place), the main one. |
| `surface`, `facilities`, `floodlit_until`, `is_free` | Facts. |
| `facts` | "Football · turf · floodlit until 11 PM · free" (the line with the light icon). |
| `verification`, `verified_at` | See Model. Show words, never colour only. |
| `lat`, `lng` | Public centroid, for DIRECTIONS (the OS maps app). |
| `distance_km` | From your area; null without one. |
| `sensitive` | See Privacy. |
| `tonight_count`, `forming_count`, `live_count` | Until 4 AM (sensitive: only what you're in). |
| `has_busy_history`, `busy_part`, `busy_levels int[7]` (Mon..Sun, 0–100), `busiest_day`, `today_day`, `today_rank`, `busy_summary` | WHEN IT'S BUSY · EVENINGS: `busyPartLabel(busy_part)`, `busyTimesData(view)` (DS BusyTimes) or `busyBars(view)`, `busy_summary` ("Busiest Thursday evenings. Tonight (Tuesday) is the second busiest."). No history → hide the block or say "Not enough games here yet to tell." |
| `prefill_sport_id`, `prefill_starts_at`, `prefill_duration_minutes`, `prefill_capacity` | CREATE ACTIVITY HERE: your main sport if the place has it, else the place's; the busiest hour here today (7 PM without history) if at least 2 h away, else the next half hour 2–2.5 h from now; the sport's default length and size. `placeCreatePrefill(view)` maps them to `create_plan` args. |

**`place_tonight(p_place_id, p_when = 'tonight') → PlaceTonightItem[]`** TONIGHT HERE, by start, at most 50.

| Column | Meaning |
|---|---|
| `kind` | `plan` (forming) → `/plan/{plan_id}`; `activity` (GAME ON / live) → `/activity/{activity_id}`; `club_run` → `/clan/{clan_id}` (club runs have no screen of their own). |
| `sport_id`, `sport_name`, `title` | Title nullable: build from the sport. |
| `starts_at`, `ends_at`, `time_zone` | "7:30". |
| `status`, `member_count`, `capacity`, `spots_left` | `tonightTag(item)`: "6 / 8", GAME ON, LIVE. |
| `level_label` | "Mixed level". |
| `meeting_point` | Members and host only ("North pitch, by the lights"); null otherwise: subtitle = level only. |
| `i_am_in` | You're in it (member, attending or waitlisted, or club-run member). |

**`place_groups(p_place_id) → PlaceGroup[]`** RITUALS HERE.

| Column | Meaning |
|---|---|
| `kind` | `crew_ritual` → `/crew/{group_id}`; `clan_ritual` → `/clan/{group_id}`; `host_series` (a host program's series; the participant view of a program isn't designed: show it without a link, or the session via TONIGHT HERE). |
| `id` | Ritual id or series id. |
| `group_id`, `group_name` | Crew / clan / program. |
| `title`, `sport_id`, `sport_name` | "Thursday FC · football" = `title` (or `group_name`) · `sport_name`. |
| `days smallint[]` (1 = Monday), `local_time`, `time_zone` | Day column: the first day ("THU"). |
| `distance_km` | Club-run Rituals' distance ("Sunrise run · 6 km"). |
| `weeks_running` | Weeks in a row the Ritual became a plan or run (since the last skipped week); for a series, sessions held so far. |
| `access` | `crew` · `open` · `request` · `invite` → `groupTag(g)`: CREW, OPEN, ASK TO JOIN, MEMBERS. |
| `i_am_in` | Crew/clan member, or program member/host. |
| `cadence` | "Every week, 7:30" / "Tue and Thu, 7:30". `groupCadence(g)` adds "· 6 weeks running". |

**`place_hosts(p_place_id, p_limit = 3) → PlaceHost[]`** HOSTS HERE, most games first.
`user_id`, `display_name`, `handle`, `avatar_path`, `hosted_here` (finished games hosted here:
`hostedHereWords(n)` → "40 games hosted here"), `trusted_host` (VerificationBadge `host`, "TRUSTED
HOST": 20+ finished games hosted anywhere, "great host" from 5+ different people, no report against
them actioned in 180 days; system-granted only), `program_id`, `program_name` (a series here),
`is_top` (the top host). Tap → `/profile/{user_id}`.

**`place_busy_times(p_place_id) → PlaceBusyTime[]`** `day_of_week` (1 = Monday), `hour` (local),
`part`, `level` (0–100, relative to the busiest hour). Only hours with something; empty without
history. For an hour-level chart; the screen's weekday bars use `place_view.busy_levels`.

## Report

`report('place', place_id, reason, note)` (report kind `place`): wrong details, unsafe, closed. Any
place can be reported (places are public). Through `private.report_subject_visible`; same 20/day limit.
Block isn't relevant to a place; the people on it (hosts, rows) keep their own report/block.

## Realtime

Realtime is a hint: on `SUBSCRIBED`, on a change and on focus, refetch. Also refetch every
`PULSE_REFETCH_MS` (a plan going live or past its deadline changes nothing in a table).

| Screen | Descriptor (channel) | Table · event · filter | Do |
|---|---|---|---|
| Pulse | `pulseSubscription(city)` (`pulse:{city}`) | `pulse_ticks` · * · `city=eq.{city}` | Refetch `pulse` and the open sheet's `pulse_place`. City: the `city` of your area (`areas_list`), or of the markers. |
| Place | `placeSubscription(placeId)` (`place:{id}`) | `pulse_ticks` · * · `place_id=eq.{id}` | Refetch `place_view` (counts) and `place_tonight`. |

Ticks move on public plans (created, joined, status, time, place), their games (status, live, ended,
confirmed count), open/request clans' club runs, and public Down For signals (city row only).

## Analytics

Server events (facts only): `pulse_viewed` {markers, sport_id, when, radius_km}, `place_viewed`
{place_id, sensitive, tonight_count}. Client taps (names in `@ojoro/analytics`, owned by the screens):
marker selected, open place, create here / create activity here, directions, filter changed. PRD
§9.16 metrics: place detail views = `place_viewed`; place → activity conversion = `place_viewed`
followed by `plan_created` with that `place_id` / `im_down_committed`; map → join/create =
`pulse_viewed` followed by the same.

## Screens

| Screen | Route | Reads | Writes | Sub |
|---|---|---|---|---|
| **Pulse** (live) | `/pulse` | `pulse(sport, when)` (markers + text alternative), `sports_nearby()` (chips), `home_density()` (radius, has_area), `pulse_place(id, sport, when)` (sheet) | none (CREATE HERE → Create prefilled; OPEN PLACE → Place) | `pulse:{city}` |
| **Place** (calm) | `/place/[id]` | `place_view`, `place_tonight`, `place_groups`, `place_hosts` (`place_busy_times` optional) | none here: rows → Plan / Activity / Clan / Crew; CREATE ACTIVITY HERE → Create with `placeCreatePrefill`; DIRECTIONS → OS maps with `lat`,`lng`,`name`; share → OS share; menu `report('place', id)` | `place:{id}` |

Every screen has the standard states (skeleton after 300 ms, empty, offline with last-known values and
how old, privacy, errors by code). Empty Pulse: "Nothing on near you tonight." → widen (`p_when =
'week'`, `p_radius_km` up to 50) or Down For; no area → area picker (`areas_list` → `set_area`).

## Local data

`supabase/seed_places.sql` (after `seed_hosts_ops.sql` in `[db.seed] sql_paths`; safe to re-run on the
running stack to refresh the time-relative parts:
`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_places.sql`). Sign in as
Chimdi (+1 555 555 0100). Sample content from Pulse.png and Place.png.

| Thing | Id | Shows |
|---|---|---|
| Jeanne-Mance Park | `b0000000-0000-4000-8000-000000000001` | park, community confirmed, facilities; TONIGHT HERE 7:30 Pickup football 6 / 8 (Step 1's "Football tonight"), 8:00 Women's 5 a side GAME ON, 8:30 Sprint intervals 3 / 10, then more later in the evening (12 tonight for the "12 ACTIVE" marker); RITUALS HERE Thursday FC (crew, weeks running), Sunrise run · 6 km (open clan, Sunday 7:00) and Ade's Plateau Pickup series; HOSTS HERE Ade B, TRUSTED HOST; busiest Thursday evenings, Tuesday second. |
| Hoshino Boxing | `b0000000-0000-4000-8000-000000000005` | gym, venue verified; Sparring rounds live (Step 3) → the SPARRING pill. |
| Hall building | `b0000000-0000-4000-8000-000000000061` | 3 running plans tonight → the small "3" disc (Downtown). |
| Plateau demand | area Plateau, Montréal | 5 want volleyball (Step 3 signals, near Parc La Fontaine). |
| Sunrise Runners | clan `f1000000-0000-4000-8000-000000000071`, ritual `f0000000-0000-4000-8000-000000000071` | Open clan, captain Lena R. |

## Not built

A maps provider (not chosen: the app renders a schematic from the public centroids), place search on
its own (Step 3 `discover_search` finds places), adding or editing places, venue claims (venue
verification is set by Ojoro), place photos upload, approximate personal presence on the map and
trusted temporary live location outside a game (PRD §9.16 presence modes; live location stays Slice
01's one-game share), place following, push for Pulse.
