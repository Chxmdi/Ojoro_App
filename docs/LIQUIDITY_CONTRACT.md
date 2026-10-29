# Step 3: Liquidity backend contract

The data layer for Step 3 (PRD M4): **Ojoro Now**, **latent demand and Create From Demand**,
**Surprise Me** and the rules-based **Concierge**, **Discover**, the low-density **FirstHome**, and the
reworked **Need One More** ranking. It extends [`SLICE01_CONTRACT.md`](SLICE01_CONTRACT.md): every rule
there (write only through RPCs, map errors by code, idempotency keys, effective status, no raw
location) still applies. Judgment calls are in `docs/DESIGN_DECISIONS.md` ("Step 3 backend").

- Schema: `supabase/migrations/20261029124500_liquidity.sql`
- Generated types: `@ojoro/contracts` (`Database['public']['Functions']['ojoro_now']` …), plus row
  aliases `OjoroNowItem`, `LatentDemandBucket`, `Suggestion`, `DiscoverResult`, `PersonToMoveWith`,
  `PlaceNearby`, `HomeDensity`, `PullInCandidate`.
- Client helpers in `@ojoro/contracts` (`liquidity.ts`): `liquidityRpcs`, `liquidityIdempotentRpcs`,
  `loggedReadRpcs`, `liquidityErrorCodes` (also inside `ojoroErrorCodes`), `createFromDemandArgs`,
  `discoverWhen`, `LATENT_DEMAND_K` (3), `DEMAND_PLANS_PER_DAY` (5), `LOW_DENSITY_THRESHOLD` (2).
- Tests: `supabase/tests/10_latent_demand.sql`, `supabase/tests/11_ojoro_now_discover.sql`.

Contents: [Rules](#rules) · [Errors](#errors) · [Privacy](#privacy) · [Areas](#areas) ·
[Ojoro Now and FirstHome](#ojoro-now-and-firsthome) · [Latent demand](#latent-demand) ·
[Suggestions](#suggestions-surprise-me-and-the-concierge) · [Discover](#discover) ·
[Need One More](#need-one-more-ranking) · [Create](#create) · [Analytics](#analytics) ·
[Screens](#screens) · [Local data](#local-data) · [Not built](#not-built)

---

## Rules

1. **Logged reads are POST.** `ojoro_now`, `latent_demand`, `surprise_me`, `concierge_suggest` and
   `discover_search` record an analytics event, so they are `volatile`. Call them with the default
   `supabase.rpc(name, args)`; never pass `{ get: true }` (a GET runs read-only and fails). The others
   are plain reads. All of them are signed-in only.
2. **Every column of these `returns table` RPCs can be null** where it says so below, even though the
   generated types mark them non-null (Slice 01 rule 7). Treat documented nullables as `T | null`.
3. **Reasons come two ways:** `reasons text[]` (the facts, in order) and `reason text` (them joined:
   `' · '` for Ojoro Now / further out, "a, b and c" for suggestions). They are plain English for now;
   the app may render `reason` as is or build its own words from the numeric columns next to it.
   Never add adjectives the data doesn't support.
4. Argument names follow Slice 01: `p_sport_id` (not `p_sport`), `p_limit`, `p_idempotency_key`.
5. Nothing here sends anything or joins anyone without a tap. Suggestions suggest; the commit is
   `im_down`, `join_waitlist`, `create_down_for` or `create_from_demand`.

## Errors

New codes (SQLSTATE `P0001`, code = `error.message`, same as Slice 01):

| Code | Meaning | Raised by |
|---|---|---|
| `area_unknown` | Not one of `areas_list()`. | `set_area` |
| `area_required` | You have no area yet. Offer the area picker (`areas_list` → `set_area`). | `create_from_demand` |
| `demand_unavailable` | Nobody compatible is left (they matched elsewhere, withdrew, expired, or a block). Nothing was created or kept. Refetch `latent_demand`; offer Down For. | `create_from_demand` |
| `demand_rate_limited` | 5 plans formed from signals in 24 h (MAKE IT HAPPEN and Down For matches you formed). | `create_from_demand` |

Reused: `sport_unknown`, `radius_invalid`, `window_invalid`, `invalid_argument` (detail `when`, `query`,
`minutes`), `idempotency_key_required`, `idempotency_key_reused`, `plan_not_found`, `not_member`.

## Privacy

| Rule | How |
|---|---|
| No device location, ever, in Step 3 | Areas come from `areas_list()` (neighbourhoods of public places). |
| Never finer than 0.01° | `set_area` stores the neighbourhood centroid rounded to 0.01° (`numeric(5,2)` columns). |
| People's points never leave the server | Only distances to **public places** (0.1 km) are returned, plus whole kilometres (≥ 1) between two coarse points for Pull Someone In candidates. |
| Latent demand is a count | No ids, names, avatars, places or exact signal times. A bucket shows only with **≥ 3** other people (k-anonymity) who can all make the suggested start. Your own signal never counts. Blocked people and friends-only signals from people you haven't played with don't count. |
| Blocks | Anything with a blocked person in it (host, member, attendee) is left out of every read here, in both directions. |
| Visibility | Plans: `authz.can_see_plan` (audience, invites, host block). Invite-only and friends plans stay hidden from people who can't see them, including in place counts. |
| People are not searchable by strangers | `discover_search` matches people by name only for people who have played with you. |
| People to move with | Played with you, or (strangers) share a sport, live inside each other's radius **and** turned Pull Me In `nearby` on for it **and** let you see their sports. Each card part follows their settings: sports (`sports_visibility`), sessions (`history_visibility`), shared free time (`availability_visibility`, overlap only, never a calendar). |
| Levels | Used to filter suggestions ("close to your level"); never returned. |
| Concierge text | Parsed in the call, never stored or logged (analytics get `has_text`, minutes, sport). |

## Areas

**`areas_list() → table(area, city, label, lat, lng, place_count)`** Neighbourhoods derived from
places, e.g. `Plateau · Montréal · "Plateau, Montréal" · 45.52 · -73.58 · 2`. `lat`/`lng` are the
neighbourhood's coarse centroid (public data). Order: city, area. Use it for an area picker when the
person has no area (`home_density().has_area = false`) or from settings.

**`set_area(p_area text, p_discovery_radius_km int = null) → area_state { area, area_lat, area_lng, discovery_radius_km }`**
Takes a `label` from `areas_list` ("Plateau, Montréal", any case) or an unambiguous neighbourhood name
("Verdun"). Sets `profiles.area` to the label and `profile_private` to the centroid (0.01°), and
optionally the radius. Errors: `area_unknown`, `radius_invalid`. Existing Down For signals keep the
point they were created with.

## Ojoro Now and FirstHome

Rows of `ojoro_now` and `further_out` share one shape (`OjoroNowItem`):

| Column | Meaning |
|---|---|
| `kind` | `plan` (forming) or `activity` (GAME ON or live). |
| `plan_id`, `activity_id` | `activity_id` null for `plan`. Open Plan with `plan_id`, Activity with `activity_id`. |
| `sport_id`, `sport_name`, `title` | `title` nullable ("Pickup football"; build it from the sport when null). |
| `starts_at`, `ends_at` | Format in `place_time_zone`. |
| `status` | `forming` · `game_on` · `live`. Drives the ActivityStrip tag (`6 / 8`, GAME ON, LIVE). |
| `member_count`, `capacity`, `spots_left` | Plan members, or the activity's confirmed count. |
| `place_id`, `place_name`, `place_area`, `place_time_zone` | Nullable when the plan has no place yet. |
| `distance_km` | From your area to the place, 1 decimal. Null without an area or a place. |
| `minutes_to_start` | Negative when live. |
| `played_with_count` | People in it you've played with (blocked people never counted). |
| `action` | `join` → `im_down(plan_id)` (forming) or `join_waitlist(activity_id)` (GAME ON with a free spot before check-in: it confirms you); `waitlist` → `join_waitlist(activity_id)`; `watch` → open Activity (live; spectating isn't built). |
| `reasons`, `reason` | e.g. `starts in 40 min · 1.2 km · 2 people you've played with`, `on now · 2.8 km`, `… · needs one more`. |

Included: forming plans with spots (before their deadline), GAME ON games that haven't started, and
(Ojoro Now only) live games, that you can see and aren't in (no attendance other than cancelled),
with nobody in them blocked either way. Ordered by start, then distance.

**`ojoro_now(p_within_minutes int = 60, p_sport_id text = null) → OjoroNowItem[]`** RIGHT NOW. Starting
within `p_within_minutes` (15–240) and live now, within your radius (all visible if you have no area).
Discover: "3 things start soon." = the number of rows that aren't live (or all rows; the design counts
everything listed).

**`further_out(p_limit int = 5) → OjoroNowItem[]`** A BIT FURTHER OUT. Beyond your radius, up to twice
it (at most 25 km), in the next 7 days, no live games. Empty without an area.

**`home_density() → table(1 row)`** Lets Home choose the normal Main feed or FirstHome, honestly.

| Column | Meaning |
|---|---|
| `has_area`, `area`, `radius_km` | No area → show the area picker before anything "near you". |
| `day_number` | Days since onboarding finished, from 1 ("DAY 1 · SAINT-HENRI"). |
| `plans_near`, `games_near` | Forming plans / GAME ON games you could join within your radius, next 7 days. |
| `starting_soon` | Of those, starting within the hour. |
| `people_down_near` | People with a visible Down For near you (`down_for_nearby`, capped at 100). |
| `friends_free_now` | People you've played with whose usual free times include now and who let you see that ("4 of your friends are free"). A count only. |
| `demand_buckets` | Latent demand buckets you could complete. |
| `further_out_count` | Rows `further_out(20)` would return. |
| `low_density` | `plans_near + games_near < 2`. Show FirstHome: honest headline ("QUIET HERE. FOR NOW."; "Nothing's scheduled near you yet" only when both are 0), latent demand, quick Down For chips, bring your people, further out, end of feed. |

## Latent demand

**`latent_demand(p_sport_id text = null) → table(sport_id, sport_name, day, part, window_start, window_end, suggested_start, people_count)`**
Active Down For signals near you (both inside each other's radius), grouped by **sport and part of
day** in your time zone (`morning` before 11:00, `midday` 11:00–16:59, `evening` from 17:00) over the
next 7 days. Per bucket: `window_start`/`window_end` = the bucket (start clipped to now),
`suggested_start` = the start most of them can make (15-minute boundary, about an hour from now at
the earliest), `people_count` = how many can make it. Only buckets with **`people_count ≥ 3`** and
**no open plan you could join** (same sport, starting in the bucket, spots left, place within your
radius; show that plan instead). Ordered by `suggested_start`.

Copy from the facts: "NOTHING ON FOR VOLLEYBALL" (no `ojoro_now` row in that sport), "5 people within
{radius_km} km want to play volleyball after 7. That's a game." (`people_count`, `suggested_start`),
"Shown as a count. Nobody's name or location is shared until they join." FirstHome: "Add yourself and
it becomes a plan at {people_count + 1}"; the Progress shows `people_count` of `people_count + 1`.

**`create_from_demand(p_sport_id, p_window_start, p_window_end, p_idempotency_key) → plan_state`**
MAKE IT HAPPEN / I'M DOWN on a bucket. Pass `createFromDemandArgs(bucket, key)`: start =
`suggested_start`, end = `window_end`. It publishes your Down For for that window (public, your
radius, expires at the window end; or reuses your active one for the sport and an overlapping window)
and runs **the same matching as `create_down_for`** (SLICE01_CONTRACT §Down For matching): join an
open plan if one appeared since, otherwise form a plan from the compatible signals with **you as
host**. Everyone matched is a **member** (`via = 'down_for'`) and sees the plan; nobody else learns
anything. Then open Plan with `plan_id` (`status` may already be `game_on` if it filled).
Idempotent (same key → same result). A second tap with a new key returns the same plan.
Errors: `sport_unknown`, `window_invalid`, `area_required`, `demand_unavailable`,
`demand_rate_limited`, `idempotency_key_required`, `idempotency_key_reused`.

## Suggestions (Surprise Me and the Concierge)

Rows (`Suggestion`): `kind` (`plan` | `demand`), `plan_id` (plan only), `sport_id`, `sport_name`,
`title`, `starts_at` (plan start, or the bucket's `suggested_start`), `duration_minutes`, `place_id`,
`place_name`, `place_area`, `distance_km`, `member_count`, `capacity`, `played_with_count` (plan
only), `demand_count`, `window_start`, `window_end` (demand only), `reasons`, `reason`.

Hard constraints: visible, nobody blocked either way, not yours, forming with spots, within your
radius, close to your level (members' average level within 1.5 steps of yours, when both are known),
plus the sport and minutes when given. Order: plans in your sports → demand in your sports → plans in
other sports (reason "it's something different from your usual") → other demand. Within plans: main
sport, (Concierge "meet people") bigger plans, people you've played with, soonest, nearest. Same data
→ same answer.

**`surprise_me() → Suggestion (0 or 1 row)`** SURPRISE ME. Plans in the next 48 h. No row → "Nothing
fits right now" and offer Down For.

**`concierge_suggest(p_text = null, p_sport_id = null, p_minutes = null, p_limit = 3) → Suggestion[]`**
TELL OJORO (rules-based stub; the AI Concierge is M9). Reads minutes ("90 minutes", "2h", "an hour"),
a sport ("football", "soccer", "a run", "hoops", "sparring"…) and "meet people" from `p_text`;
explicit `p_sport_id` / `p_minutes` (15–480) win. With minutes: plans no longer than that, starting
in the next 6 hours. BEST MATCH = row 1 ("Why: " + `reason` + "."), "2 MORE IDEAS" = rows 2–3. Buttons:
`plan` → I'M DOWN = `im_down(plan_id)`; `demand` → MAKE IT HAPPEN = `create_from_demand`. Copy stays
"Ojoro suggests. Nothing is sent or joined until you confirm." Errors: `invalid_argument` (minutes),
`sport_unknown`.

## Discover

**`discover_search(p_query = null, p_sport_id = null, p_when = null, p_limit = 20) → DiscoverResult[]`**
Up to `p_limit` (≤ 50) of **each** kind, plans first, then places, then people.

| Column | plan | place | person |
|---|---|---|---|
| `kind` | `plan` | `place` | `person` |
| `id` | plan id | place id | user id |
| `title` | plan title (nullable) | place name | display name |
| `sport_id`, `sport_name`, `starts_at`, `effective_status` (`forming`/`game_on`/`live`), `member_count`, `capacity` | set | null | null |
| `place_id`, `place_name`, `place_area`, `distance_km` | set (nullable) | set | null |
| `plans_tonight` | null | same rule as `places_nearby` | null |
| `handle`, `avatar_path`, `games_with_me` | null | null | set |

- `p_query` (≤ 80 chars) matches, case- and accent-insensitively ("montreal" finds Montréal): plans
  on sport, title, place name, area, city; places on name, area, city and their sports; **people only
  you've played with**, by name or handle, from 2 characters.
- `p_sport_id`: filter chips (from `sports_nearby`). `p_when`: `any` (null), `now` (next hour, and
  live), `today`, `tonight` (17:00–4:00), `tomorrow`, `weekend`, `week`. Anything else →
  `invalid_argument` (detail `when`).
- Plans: forming before their deadline, or GAME ON / live and not finished; visible to you; nobody
  in them blocked either way. Not limited to your radius (it's search); `distance_km` tells.
- The Everything / Activities / People chips filter `kind` client-side. Clans: nothing (M7).

**`people_to_move_with(p_limit = 10) → PersonToMoveWith[]`** UserMiniCard data: `user_id`,
`display_name`, `handle`, `avatar_path`, `area` (their profile label), `sports text[]` (names, main
first; empty when hidden), `sessions` (games in their Passport; null when their history is hidden),
`games_with_me`, `crews` (always null until Crews exist; don't show the stat), `played_together`,
`shared_sports text[]`, `overlap_day_of_week` (1 = Monday) and `overlap_part` (first usual free time you
share; null when hidden or none), `reason` ("You've played 6 games together and you're both usually
free Saturday mornings." / "Also plays football near you and is open to being pulled in."). Ranked:
games together, shared sports, shared free time, name. Never blocked people. FOLLOW and CALL OUT have
no backend yet (Friends M1, Call-Out M6); ID VERIFIED isn't a thing yet.

**`places_nearby(p_sport_id = null, p_limit = 20) → PlaceNearby[]`** PlaceMiniCard: `place_id`, `name`,
`area`, `city`, `sport_ids`, `surface`, `floodlit_until` ("Floodlit until 11 PM"), `is_free`,
`time_zone`, `distance_km`, `plans_tonight` ("4 TONIGHT"), `plans_forming` (next 7 days). Within your
radius (all places without an area), nearest first. **`plans_tonight` counts only plans that are
forming (before their deadline) or GAME ON with the game not cancelled and not finished, that you can
see, starting before 4 AM local.** Cancelled and expired plans never count (the "20 TONIGHT" bug).

**`sports_nearby() → table(sport_id, sport_name, plan_count, place_count, has_demand)`** Filter chips:
sports with something you could join near you in the next 7 days (`plan_count`, live included) or
latent demand (`has_demand`). `place_count` = places for it within your radius. Busiest first.

## Need One More ranking

`pull_in_candidates(p_plan_id, p_limit = 20)` keeps its Slice 01 columns and adds: `tier`,
`shared_title`, `position`, `distance_km`, `reason`.

| `tier` | Who | PRD §9.5 |
|---|---|---|
| `played_together` | People you've played with | friends, Crew, previous participants (all the same thing until Friends and Crews exist) |
| `friend_of_friend` | Pull Me In `nearby` for this sport, within their radius of the place, and played with someone you've played with | friends-of-friends |
| `nearby` | Pull Me In `nearby` for this sport, within their radius of the place | compatible nearby users with Pull Me In |

Ranked by tier, then Pull Me In on for this sport, then free at the plan's time (only when their
availability setting includes you), then games together. Only people `pull_in` accepts are listed.
`shared_title` = the latest game you played together ("Thursday FC"); `position` only when their
sports are visible to you; `distance_km` = whole km (≥ 1) between your area and theirs.
`reason` = up to three of: relationship ("6 games with you" / "Thursday FC" / "Plays with people
you've played with"), "plays midfield", "free tonight" / "usually free then", "Pull Me In is on for
football", "2 km away". NeedOneMore: "Ranked by who's most likely to say yes. You can send
{pull_in_quota.remaining} more invites for this plan."

## Create

| Create row | Backend |
|---|---|
| TELL OJORO + BEST MATCH | `concierge_suggest(p_text)`; I'M DOWN → `im_down` / `create_from_demand`. |
| DOWN FOR | `create_down_for` (Slice 01). |
| QUICK PLAN | `create_plan` with sport, time, place, capacity (and `p_time_options` for a poll). |
| ACTIVITY | `create_plan` with the full details: `p_capacity`, `p_team_a_label`/`p_team_b_label`/`p_teams_note`, `p_cost_cents` (display only; payments not decided), `p_kit_note`, `p_level_label`, `p_meeting_point`/`p_meeting_lat`/`p_meeting_lng`, `p_attendance_rule`, `p_duration_minutes`, `p_audience`, `p_deadline_at`. It is a plan that becomes the Activity at GAME ON (capacity reached). **"Repeats" isn't supported** (Rituals/Series are later milestones): don't show the control, or show it disabled with words. |
| CALL OUT | M6, not built. |
| CREW / CLAN | M7, not built. |
| ROUTE | Not designed for the backend; not built. |

`plan_cards` now also has **`place_time_zone`** (appended): format plan times in it.

## Analytics

Server events in `private.analytics_events` (no client copies):

| Event | When | Payload |
|---|---|---|
| `area_set` | `set_area` | `method` (`list`) |
| `ojoro_now_served` | `ojoro_now` | `count`, `within_minutes`, `sport_id` |
| `latent_demand_shown` | `latent_demand` | `buckets`, `sport_id` |
| `down_for_created` | `create_from_demand` made a new signal | `signal_id`, `sport_id`, `source: demand` |
| `plan_created` | matching formed the plan | as Slice 01 (`source: down_for`) |
| `demand_plan_created` | `create_from_demand` succeeded | `plan_id`, `sport_id`, `plan_created`, `member_count` |
| `surprise_me_served` | `surprise_me` | `found` |
| `concierge_suggested` | `concierge_suggest` | `has_text`, `minutes`, `sport_id`, `social`, `count` (never the text) |
| `discover_searched` | `discover_search` | `query_length`, `sport_id`, `when`, `results` (never the text) |

Client UI events stay in `@ojoro/analytics` (taps: `make_it_happen_tapped`, `surprise_me_tapped`,
`ojoro_now_item_opened`, …). PRD §9.6 metrics: opens = `ojoro_now_served`; no-result recovery =
`ojoro_now_served` with `count: 0` followed by `demand_plan_created`/`im_down_committed`.

## Screens

| Screen | Reads | Writes | Sub |
|---|---|---|---|
| **Home** (router) | `home_density()`: `low_density` → FirstHome, else Main (SLICE01) | none | `invites:{me}` |
| **FirstHome** | `home_density` (DAY n · AREA, headline counts), `latent_demand()` (PEOPLE WANT THIS: first bucket in your sports, else first), `further_out()`, no area → `areas_list` | `create_from_demand` (I'M DOWN), `create_down_for` (quick chips: Football tonight, Run this week, Boxing this weekend; Something else → Down For sheet), `set_area`. START A CREW: not built (M2); INVITE FRIENDS: OS share | `invites:{me}` |
| **Discover** | `discover_search` (search + chips), `sports_nearby` (chips), `ojoro_now()` (RIGHT NOW.), `home_density().friends_free_now`, `latent_demand()` (NOTHING ON FOR …), `people_to_move_with()`, `places_nearby()`; Clans: none (M7) | `create_from_demand` (MAKE IT HAPPEN), `surprise_me` (SURPRISE ME, then open the plan or the demand), rows: `im_down` / `join_waitlist` | none |
| **Create** | `concierge_suggest(p_text)` (debounce typing; BEST MATCH + 2 MORE IDEAS) | `im_down`, `create_from_demand`, `create_down_for`, `create_plan` (Quick Plan, Activity) | none |
| **NeedOneMore** | `pull_in_quota`, `pull_in_candidates` (`reason` per row, ranked) | `pull_in` | `plan:{id}` |
| **Place** (later) | `places_nearby`, `discover_search(p_query => place name)` | | |

Every screen still needs loading (skeleton after 300 ms), empty, offline (last-known + age), privacy
and error states. Empty states never dead-end: Ojoro Now empty → latent demand → SURPRISE ME → Down
For.

## Local data

`supabase db reset` loads `seed.sql` then **`seed_liquidity.sql`**. On a running stack, refresh the
time-relative Step 3 data at any time (idempotent; "starts in 40 min" goes stale within the hour):

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_liquidity.sql
```

| Sign in as | Phone (code 123456) | Shows |
|---|---|---|
| Chimdi O | +1 555 555 0100 | Discover: RIGHT NOW: Sparring rounds (Hoshino, LIVE), Evening 5K (Parc La Fontaine, GAME ON 4/4 in 40 min), Tennis doubles (Jeanne-Mance, 2/4 in 50 min); NOTHING ON FOR VOLLEYBALL: 5 people, from 7 PM (each needs 6; MAKE IT HAPPEN forms a plan of 6, re-run the seed to reset it); people to move with (Ade: "12 games together… Saturday mornings"); places with tonight counts. |
| Nneka B (new, Saint-Henri, 3 km) | +1 555 555 0120 | FirstHome: DAY 1 · SAINT-HENRI, low density, 3 runners down for tomorrow evening (each needs 4: I'M DOWN makes a plan at 4), further out: Evening 5K, Tennis doubles, the Plateau plans. |

+1 555 555 0120 is in `config.toml` `[auth.sms.test_otp]`; Auth reads it at `supabase start`, so it
works after the stack restarts. Until then, impersonate in SQL:
`select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000020","role":"authenticated"}', false); set role authenticated;`

## Not built

Crews, Clans, Friends (stand-in: played together), Follow, Call-Out, ID verification, spectating a
live game, Routes, recurring Activities, the Pulse map (maps provider not chosen), push for latent
demand, the AI Concierge (M9).
