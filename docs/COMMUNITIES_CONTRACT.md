# Step 6: Communities backend contract

The data layer for the community half of Step 6 (PRD M7): **Crew Home** (Crew Momentum, free tonight,
the crew Down For board, Rituals, crew vs crew, memories), **Clans** (identity, roles, joining, club
runs, the monthly mission, the clan-only leaderboard) and **Ojoro Clash** (clan vs clan: score, your
part, the events and their results, squads, crowd support, standings). It extends
[`SLICE01_CONTRACT.md`](SLICE01_CONTRACT.md), [`MESSAGING_CONTRACT.md`](MESSAGING_CONTRACT.md) (crews,
crew chat) and [`COMPETITION_CONTRACT.md`](COMPETITION_CONTRACT.md) (crew vs crew Challenge Events,
rivalries, backing): every rule there (write only through RPCs, map errors by code, idempotency keys,
effective status computed on read, no raw location) still applies. Judgment calls are in
`docs/DESIGN_DECISIONS.md` ("Step 6 BE-COMMUNITIES").

- Schema: `supabase/migrations/20261030100000_communities_enums.sql`, `…100010_communities_report.sql`,
  `…100100_communities_schema.sql`, `…100200_communities_crew_home.sql`, `…100300_communities_clans.sql`,
  `…100400_communities_clash.sql`, `…100500_communities_time_realtime_grants.sql`,
  `…100600_communities_followups.sql` (short names, rolling THIS WEEK, backing counts),
  `…100700_communities_followups.sql` (create/update clan take the short name),
  `…100800_communities_crew_availability.sql` (FREE TONIGHT honours "crews"),
  `…100900_communities_clash_next_event.sql`, `…101000_communities_chat_read_clock.sql`,
  `…101100_communities_clash_one_open.sql`, `…101200_communities_notification_enums.sql`,
  `…101300_communities_rowing_crew_view.sql` (rowing sport; Step 4 `crew_view.free_tonight` now uses the
  same rule as `crew_home`), and **`20261030220000_communities_notifications.sql`** (named after the Host
  OS migrations on purpose: it replaces `private.notification_feed` / `generic_copy` starting from Host
  OS core's 20261030200600 definitions; anyone redefining those later must start from this file).
- Generated types: `@ojoro/contracts` (`Database`), plus row aliases (nullable columns already marked
  `| null`, use these rather than the raw `Functions[…]['Returns']`): `CrewHome`, `CrewFreeTonight`,
  `CrewDownFor`, `CrewRitual`, `CrewVersus`, `CrewRivalry`, `CrewMemory`, `ClanView`, `MyClan`, `ClanRun`,
  `ClanMission`, `ClanRolePerson`, `ClanMember`, `ClanRequest`, `ClanLeaderboardRow`, `ClanClash`,
  `ClashView`, `ClashEvent`, `ClashMyPart`, `ClashStanding`, `RitualRow`, `ClanRow`, `ClanMissionRow`, and
  enum aliases `ClanRole`, `ClanJoinPolicy`, `ClanRequestStatus`, `ClanRunStatus`, `ClanRunStage`,
  `MissionMetric`, `RitualStatus`, `ClashStatus`, `ClashStage`, `ClashScoring`, `ClashResultSource`,
  `ClashEventState`, `MomentumState`.
- Client helpers in `@ojoro/contracts` (`communities.ts`): `communitiesRpcs`,
  `communitiesIdempotentRpcs` (also in `idempotentRpcs`), `communitiesErrorCodes` (also in
  `ojoroErrorCodes`), `situationForClashStage`, `momentumHeadline`, `missionFraction`,
  `formatMissionAmount`, `clashScore`, `clashSides`, `formatClashValue`, realtime descriptors
  `crewHomeSubscription`, `clanSubscription`, `clashSubscription`, and the limits `CREW_RITUALS_MAX` (3),
  `CLAN_RITUALS_MAX` (14), `MOMENTUM_WEEKS` (8), `CLAN_RUN_CAPACITY_MAX` (500),
  `CLAN_RUN_CHECK_IN_RADIUS_M` (300), `CLAN_RUN_CHECK_IN_MINUTES` (30), `CLANS_PER_DAY` (3),
  `CLAN_MAX_MEMBERS` (2000), `CLASH_EVENTS_MAX` (12).
- Tests: `supabase/tests/22_crew_home_rituals.sql`, `23_clans.sql`, `24_clash.sql`.
- Seed: `supabase/seed_communities.sql` (see [Local data](#local-data)).

Contents: [Rules](#rules) · [Errors](#errors) · [Privacy and safety](#privacy-and-safety) ·
[Model](#model) · [Crew Home](#crew-home) · [Rituals](#rituals) · [Clans](#clans) ·
[Club runs](#club-runs) · [Mission and leaderboard](#mission-and-leaderboard) · [Ojoro Clash](#ojoro-clash) ·
[Notifications](#notifications) · [Realtime](#realtime) · [Analytics](#analytics) · [Screens](#screens) · [Local data](#local-data) ·
[Not built](#not-built)

---

## Rules

1. **Write only through the RPCs below.** New tables are readable through RLS as listed; clients have
   no INSERT/UPDATE/DELETE on any of them.
2. **Idempotent with a key** (`p_idempotency_key`, one uuid per user intent, reused on retry):
   `join_down_for`, `create_ritual`, `create_clan`, `create_clan_run`, `create_clash`,
   `submit_clash_result`. **Set-to-state, safe to repeat without a key:** `set_crew_rhythm`,
   `mark_crew_chat_read`, `update_ritual`, `set_ritual_paused`, `skip_ritual_week`, `end_ritual`,
   `update_clan`, `join_clan`, `join_clan_with_code`, `withdraw_clan_request`, `decide_clan_request`,
   `leave_clan`, `remove_clan_member`, `set_clan_role`, `transfer_clan_captaincy`,
   `set_clan_leaderboard`, `set_clan_mission`, `join_clan_run`, `leave_clan_run`, `check_in_clan_run`,
   `mark_clan_run_attendance`, `cancel_clan_run`, `accept_clash`, `decline_clash`, `cancel_clash`,
   `propose_clash_organizer`, `join_clash_squad`, `leave_clash_squad`, `confirm_clash_result`,
   `back_clash`. Each returns the state after the call with `changed`/`created` where it matters, so a
   retry that finds the work done is not an error. No toggles.
3. **Stages are computed on read** (`clan_run_stage`, `clash_stage`, `clash_event_state`, the Ritual's
   week) from stored status and the clock. A 5-minute job (`private.ritual_tick`) only prefills Ritual
   weeks; correctness never depends on it.
4. **Results are never rewritten.** `clash_event_results` is insert-only (a trigger refuses UPDATE and
   DELETE with `result_already_verified`). The score and standings are computed from it. Crew vs crew
   history reads Step 5's insert-only `challenge_results`.
5. **No money, no stakes, no prizes.** Backing a clan is a count that never touches a score. Missions
   and leaderboards count club runs, never points that buy anything.
6. **Nullable columns** of `returns table` RPCs are marked `*` below; the generated types say non-null
   (Slice 01 rule 7). Use the aliases above (they mark them `| null`).
7. **Sides in a Clash:** `a` = the clan that proposed it, `b` = the clan that accepted. `my_side` says
   which is yours; posters put yours first (`clashSides`, `clashScore`).
8. **Times:** a crew's and a clan's `time_zone` decide "this week", "tonight", "this month" and Ritual
   times (`local_time` + `day_of_week`, ISO 1 = Monday).
9. **Links:** `/crew/{id}` (CrewHome), `/crew/{id}/chat`, `/plan/{id}` (a Ritual's week, the next crew
   plan), `/event/{id}` (crew vs crew), `/rivalry/{id}`, `/clan/{id}`, `/clash/{id}`. Club runs have no
   designed screen yet; `clan_run_view(id)` is ready for one.

## Errors

All `P0001`, the code is `error.message` (`toOjoroError`). Words are in
`apps/mobile/src/lib/errorMessages.ts`.

| Code | Raised by | Meaning |
|---|---|---|
| `ritual_not_found` | Ritual writes | No such Ritual, ended, or you can't see it. |
| `ritual_limit` | `create_ritual` | 3 active or paused Rituals a crew, 14 a clan. `detail` = the limit. |
| `ritual_week_locked` | `skip_ritual_week` | That week's plan or club run is GAME ON. Cancel the game instead. |
| `clan_not_found` | clan reads and writes | No such clan, or you can't see it (invite-only, a block with the captain). Never says which. |
| `not_clan_member` | member-only reads and writes, `create_ritual` (host), `set_clan_role` (target), `join_clash_squad` | You (or they) aren't in the clan. |
| `clan_role_required` | role-gated writes | Your role can't do that (see [roles](#roles)). |
| `clan_full` | joining | 2000 members. `detail` = `2000`. |
| `clan_rate_limited` | `create_clan` (3 a day), `join_clan` (10 requests a day) | |
| `clan_invite_only` | `join_clan` | Invite clans need the code (`join_clan_with_code`). |
| `clan_request_not_found` | `decide_clan_request` | Not a request you can decide (or across a block). |
| `captain_must_transfer` | `leave_clan` | The captain hands over first (unless they're the last one in). |
| `cannot_remove_captain` | `remove_clan_member` | |
| `clan_run_not_found` | club-run RPCs | No such run, or you can't see it (a block with its host). |
| `clan_run_full` | `join_clan_run`, `mark_clan_run_attendance` | `detail` = capacity. |
| `clan_run_closed` | `join_clan_run`, `leave_clan_run`, `cancel_clan_run`, check-in | Started, done or called off. |
| `clash_not_found` | Clash RPCs | No such Clash, or you can't see it. |
| `clash_not_allowed` | `create_clash` | Your own clan, a clan you can't see, or a block with its captain/organizers. |
| `clash_pending` | `create_clash` | A Clash between these clans is already proposed or on. `detail` = its id: open it. |
| `clash_closed` | answer/cancel/squads/organizers | Declined, cancelled, lapsed or over. |
| `not_clash_captain` | answer/cancel, organizers, results | Only a side's captain or organizer (`detail` = `other_side` when you try to confirm your own side's submission). |
| `clash_event_not_found` | squads, `submit_clash_result` | |
| `clash_event_started` | `join_clash_squad`, `leave_clash_squad` | Squads are set once the event starts. |
| `clash_event_not_started` | `submit_clash_result` | No result before the event starts (or before the Clash is on). |
| `squad_full` | `join_clash_squad` | `detail` = squad size. |

Reused: `not_authenticated`, `idempotency_key_required`, `idempotency_key_reused`, `invalid_argument`
(detail says which: `per_week`, `title`, `day_of_week`, `local_time`, `min_to_go`, `distance_km`,
`duration_minutes`, `lead_days`, `occurs_on`, `crew_id or clan_id`, `name`, `tagline`, `area`, `city`,
`message`, `note`, `use leave_clan`, `use transfer_clan_captaincy`, `metric`, `target`, `dates`,
`events`, `events[n]`, `value`, `own signal`, `host cancels instead`), `sport_unknown`, `place_unknown`,
`capacity_invalid` (`2-12` crew Rituals, `2-500` club runs), `starts_at_invalid` (club runs 15 min to
60 days; Clash events 1 h to 180 days, `detail` = the event's position), `crew_not_found`,
`not_crew_admin`, `not_crew_member`, `signal_not_found`, `invite_code_invalid`, `not_attending`,
`not_host`, `check_in_not_open` (detail = when it opens), `check_in_closed`, `check_in_unavailable` (the
run has no place with a location: the host marks attendance), `location_required`, `too_far` (detail =
metres, rounded to 50), `organizer_not_allowed`, `submission_not_found`, `proposal_superseded`,
`result_already_verified`, `backing_closed`, `prediction_not_allowed` (a clan member backing the other
clan), `subject_not_found`, `report_rate_limited`.

## Privacy and safety

- **Availability is overlap only.** `crew_home.free_tonight` counts, and `crew_free_tonight` names,
  crew mates usually free this evening whose availability setting includes you (`can_see_part
  ('availability')`, default "crews"). Never which slots, never anyone's calendar, never a time beyond
  "this evening". The UI line under it: "Shown as overlap only. Nobody's calendar is visible."
- **Crews stay private** (members only, Step 4). Everything on Crew Home is members only.
- **Clans:** `open` and `request` clans are visible to everyone signed in (identity, stats, this week's
  runs, the mission total, who runs it, Clashes); `invite` clans to members only. A block with the
  captain hides a clan (reads as `clan_not_found`). Inside a clan, blocked pairs never see each other
  in roles, roster, requests, the leaderboard, run hosts or squads; counts include everyone.
- Step 4's `crew_view.free_tonight` uses the same rule, so the crew header and Crew Home always agree.
- **Areas, not addresses.** Clans have an `area` and `city`; runs and Clash events use public places.
  Club-run check-in uses your position once (within 300 m of the place) and never stores it.
- **Leaderboard** (`clan_leaderboard`): members only, club runs only, this clan only (PRD §9.15:
  scoped, never global). Listed: members who left `on_leaderboard` on (`set_clan_leaderboard`) and whose
  history visibility isn't "only me". You always see your own row.
- **Mission:** totals and the number of people who moved it; only your own share by name.
- **Memories:** a crew session's photo (path, alt text, caption) only for people who played in that
  game (moments are participants only); others get the recap line.
- **Clash:** visible to members of either clan, and to anyone who can see both clans once it's on.
  Pending result submissions (NOT FINAL) only for captains and organizers. Backing: who backs whom is
  never listed (counts and your own row only); members back only their own clan.
- **Report and block** reach every object: `report('crew' | 'clan' | 'clan_run' | 'clash', id, reason,
  note)` (only what you can see), and `block_user` from any person row. Other Step 6 kinds plug into
  `report()` through `private.report_subject_visible(kind, id, viewer)` instead of copying `report()`.

## Model

| Table | Visible to | Notes |
|---|---|---|
| `crews` (+`rhythm_per_week`) | members | Sessions a week the crew aims for (1–7, default 1). |
| `crew_chat_reads` | own | `last_read_at` for "OPEN CREW CHAT · 4 NEW". |
| `rituals` | crew members / anyone who can see the clan | `crew_id`* or `clan_id`*, `sport_id`, `title` (1–40), `day_of_week`, `local_time`, `time_zone`, `duration_minutes`, `place_id`*, `capacity` (crew 2–12, clan 2–500), `min_to_go`* and `distance_km`* (clans), `host_id`, `lead_days` (1–13, default 6: the week is prefilled that many days before), `status` (`active` / `paused` / `ended`). |
| `ritual_occurrences` | as the Ritual | One row per week: `occurs_on` (local date), `starts_at`, `plan_id`* or `clan_run_id`*, `skipped_at`*. |
| `clans` | see Privacy | `name` (1–40), `short_name`* (1–16, posters: CONCORDIA), `tagline`*, `sport_id`*, `area`*, `city`*, `join_policy` (`open` / `request` / `invite`), `time_zone`, `member_count`. |
| `clan_members` | own row; members (minus blocked) | `role` (`captain` / `organizer` / `coach` / `moderator` / `mentor` / `connector` / `member`), `role_note`* ("Sets the calendar and the rules"), `on_leaderboard`, `via`. One captain. |
| `clan_join_requests` | own; people who admit | `status` (`pending` / `approved` / `declined` / `withdrawn`), `message`*. |
| `clan_runs` | anyone who can see the clan | `title` ("Tempo · 6 km"), `starts_at`, `duration_minutes`, `place_id`*, `distance_km`*, `capacity` (2–500), `min_to_go` (GAME ON at), `status` (`forming` / `game_on` / `cancelled`), `down_count`, `checked_in_count`, `ritual_id`*, `host_id`. Read the stage from the RPCs. |
| `clan_run_members` | own; clan members (minus blocked) | Down = a row; `checked_in_at`*, `check_in_method`* (`place` / `host`). |
| `clan_missions` | anyone who can see the clan | `title` ("2,000 km as a clan"), `metric` (`distance_km` / `runs` / `hours`), `target`, `starts_on`, `ends_on`. Progress is computed. |
| `clashes` | see Privacy | `title` ("Fall Clash"), `season_label`* ("Fall 2026"), `a_clan_id`, `b_clan_id`, `status` (`proposed` / `scheduled` / `declined` / `cancelled`), `backing_a`, `backing_b`. |
| `clash_events` | as the Clash | `position` (1–12), `title`, `sport_id`, `scoring` (`time` / `distance` / `score` / `count`), `starts_at`, `place_id`*, `squad_size`* (per clan; null = everyone counts). Fixed once accepted. |
| `clash_squad_members` | as the Clash, minus blocked | `clash_event_id`, `side`, `user_id`. |
| `clash_organizers` | as the Clash | Approved (`approved_at`) when both sides' captains proposed them. |
| `clash_result_submissions` | captains and organizers | NOT FINAL values, `status` (`pending` / `confirmed` / `superseded`). |
| `clash_event_results` | as the Clash | Insert-only: `a_value`, `b_value`, `winner_side`* (null = draw), `source` (`organizer_verified` / `captains_confirmed`), `verified_at`. |
| `clash_backings` | own | One side per person per Clash. |

### Roles

`authz.clan_can(clan, action)`, one place for every permission:

| Action | Roles |
|---|---|
| `manage` (edit the clan, cancel any run, mark attendance on any run) | captain, organizer |
| `mission` (missions, clan Rituals) | captain, organizer, coach |
| `run` (START A CLUB RUN) | every role except member |
| `invite` (the invite code) · `admit` (decide requests) | captain, organizer, moderator, connector |
| `remove` (remove members; only the captain removes people with a role) | captain, organizer, moderator |
| `roles` (give roles and role notes, hand over captaincy) | captain |
| `clash` (propose, answer, cancel a Clash; captain of a side for results and organizers) | captain, organizer |

`clan_view` returns these as `can_manage`, `can_start_run`, `can_invite`, `can_admit`,
`can_set_mission`, `can_set_roles`; show only what the person can do.

## Crew Home

All members only (`crew_not_found` otherwise).

**`crew_home(p_crew_id) → 1 row`** `crew_id`, `name`, `sport_id`*, `member_count`, `my_role`,
`can_manage` (owner/admin), `time_zone`; **Momentum** `rhythm_per_week`, `weeks` (8 counts, oldest
first, this week last: MomentumMeter `weeks`), `this_week`, `streak_weeks`, `momentum`
(`on_rhythm` / `comeback` / `starting`; `momentumHeadline(momentum, streak_weeks)` → "6 WEEK STREAK",
"COMEBACK WEEK", "FIRST WEEK"). A session = a game from one of the crew's plans, any game two or more
crew mates checked in to, or a finished crew vs crew Challenge Event. The streak counts whole weeks in
a row that met the rhythm, ending last week, plus this week once it's met: an unfinished week never
breaks it, and a missed week is a comeback, never shown as a loss. **NEXT** `next_plan_id`*,
`next_sport_id`*, `next_title`*, `next_starts_at`*, `next_place_name`*, `next_member_count`*,
`next_capacity`*, `next_status`* (`forming` / `game_on`), `next_i_am_in`*, `next_ritual_id`* (the
soonest crew plan, forming or GAME ON; I'M DOWN = Slice 01 `im_down(next_plan_id)`). **FREE TONIGHT**
`free_tonight` (count). **Chat** `unread_count` (messages from others after your read mark, max 99),
`last_message_at`*. **Make This a Ritual** `suggest_sport_id`*, `suggest_day_of_week`*,
`suggest_local_time`*, `suggest_place_id`*, `suggest_place_name`*, `suggest_weeks`* (the same sport on
the same weekday around the same half hour in 3 of the last 5 weeks, with no Ritual for it yet;
MAKE THIS A RITUAL = `create_ritual` with these), `server_now`.

**`crew_free_tonight(p_crew_id) → table(user_id, display_name, avatar_path*)`** The names for FREE
TONIGHT ("Ade, Lena, Joel and Sam are free after 7": the "after 7" is the app's word for the evening
part), not you, by name.

**`crew_down_for(p_crew_id) → table(signal_id, user_id, display_name, avatar_path*, sport_id,
sport_name, window_start, window_end, expires_at, down_count, i_am_down, is_mine, matched_plan_id*)`**
DOWN FOR: crew mates' active Down For signals, one row per group (same sport, overlapping windows, led
by the earliest), `down_count` = crew mates in it you can see, you included. Words: "Football, Saturday
morning" from `sport_name` + window, "Lena · 3 down · ends Fri 10 PM" from `expires_at`. I'M DOWN =
`join_down_for(signal_id, key)`; hide it when `i_am_down` or `is_mine`.

**`join_down_for(p_signal_id, p_idempotency_key) → down_for_state`** Your own Down For for the same
sport and window (Slice 01 `create_down_for`, so matching runs and a plan can form; `matched_plan_id`
then opens `/plan/{id}`). Visible signals only (public, someone you've played with, or a crew mate;
never across a block). Errors: `signal_not_found`, `invalid_argument` (`own signal`), and
`create_down_for`'s.

**`crew_rituals(p_crew_id) → table(ritual_id, title, sport_id, day_of_week, local_time, time_zone,
duration_minutes, place_id*, place_name*, capacity, host_id, host_name*, status, lead_days, can_edit,
week_on, week_starts_at, week_skipped, week_plan_id*, week_member_count*, week_capacity*, week_status*,
week_i_am_in*)`** RITUAL card: "THURSDAY FOOTBALL." / "Every Thursday, 7:30, Jeanne-Mance. Prefilled
each week; everyone still taps I'M DOWN." / THIS WEEK · `week_member_count` / `week_capacity` (opens
`/plan/{week_plan_id}`; before the week is prefilled `week_plan_id` is null: "On the board from
{week_starts_at − lead_days}"), SKIP A WEEK (`skip_ritual_week`, editors and the host), PAUSED when
`status = 'paused'`. The week shown is the next one that hasn't finished.

**`crew_versus(p_crew_id, p_limit = 10) → table(event_id, rivalry_id, opponent_crew_id,
opponent_name*, title, sport_id, side_size, starts_at, time_zone, place_name*, stage, in_count, needed,
our_side, our_value*, their_value*, outcome*)`** CREW VS CREW: the crew's Step 5 crew vs crew Challenge
Events, coming first (soonest), then finished (latest). "SUN · vs Plateau Crew · 5 a side ·
Jeanne-Mance · 9 of 10 in · ACCEPTED" (`in_count` of `needed`, `stage`). `outcome` `won` / `lost` /
`draw` once complete. Opens `/event/{event_id}`. New ones: Step 5 `create_call_out` with crews.

**`crew_rivalries(p_crew_id) → table(rivalry_id, opponent_crew_id, opponent_name*, meetings, wins,
losses, draws, last_met_at*, next_event_id*, next_starts_at*)`** Head-to-head records from this crew's
side (Step 5 results, never rewritten). Opens `/rivalry/{rivalry_id}`.

**`crew_memories(p_crew_id, p_limit = 6) → table(activity_id, recap_id, occurred_at, sport_id,
place_name*, team_a_label*, team_b_label*, team_a_score*, team_b_score*, played_count, i_played,
moment_id*, moment_path*, moment_alt*, moment_caption*)`** MEMORIES: recaps of crew sessions, newest
first, one photo each for people who played ("Lights win 5–4 · 6 Oct"; "Game 20 · 1 Oct" when there's no
score). Photo: Slice 01 `moments` bucket signed URL from `moment_path`. Opens `/activity/{id}/recap`.

**`set_crew_rhythm(p_crew_id, p_per_week) → integer`** Owner/admin. 1–7.

**`mark_crew_chat_read(p_crew_id, p_at = now) → timestamptz`** Call when the crew chat is open and on
leaving it. Never moves back.

## Rituals

A Ritual prefills one plan (crews: a Slice 01 plan with `audience = 'crew'`, `source = 'ritual'`, the
host in, everyone else taps I'M DOWN) or one club run (clans) each week, `lead_days` before the start.
Easy to pause, skip, edit or end (PRD §9.12).

| RPC | Who | Does |
|---|---|---|
| `create_ritual(p_idempotency_key, p_sport_id, p_title, p_day_of_week, p_local_time, p_capacity, p_crew_id = null, p_clan_id = null, p_place_id = null, p_duration_minutes = null (the sport's default), p_host_id = me, p_min_to_go = null, p_distance_km = null, p_lead_days = 6) → rituals` | crew owner/admin; clan captain/organizer/coach | Exactly one of crew/clan. The host must be in it. Prefills the first week when it's inside the lead window. |
| `update_ritual(p_ritual_id, …same fields, null = unchanged) → rituals` | editors | Weeks already on the board keep their plan; later weeks follow. |
| `set_ritual_paused(p_ritual_id, p_paused) → ritual_status` | editors | Paused prefills nothing; resuming prefills the next week if it's due. |
| `skip_ritual_week(p_ritual_id, p_occurs_on = next, p_skip = true) → ritual_week_state { ritual_id, occurs_on, starts_at, skipped, plan_id*, clan_run_id* }` | editors and the host | Skipping calls off that week's plan or run while it's forming (members get Step 4's `activity_changed` "called off"); GAME ON → `ritual_week_locked`. `p_skip = false` puts it back (a new plan when it's due). `p_occurs_on` must be that weekday, in the future, ≤ 8 weeks ahead. |
| `end_ritual(p_ritual_id) → ritual_status` | editors | For good; history stays. |

Each new week notifies the crew or clan (`ritual_week`, see [Notifications](#notifications)).

## Clans

**`clan_view(p_clan_id) → 1 row`** `clan_id`, `name` (CONCORDIA RUN CLUB.), `short_name` (falls back to
the name), `tagline`*, `sport_id`*, `area`*, `city`*, `join_policy`, `time_zone`, `member_count` (212
Members), `runs_per_week` (active clan Rituals: 4 Runs a week), `runs_this_week`, `coach_count` (3
Coaches), `is_member`, `my_role`* ("CLAN · YOU'RE A CONNECTOR"), `my_role_note`*, `on_leaderboard`*,
`request_status`* (your latest request), `can_manage`, `can_start_run`, `can_invite`, `can_admit`,
`can_set_mission`, `can_set_roles`, `pending_requests`* (admitters), `created_at`, `server_now`.

**`clan_roles(p_clan_id) → table(user_id, display_name, avatar_path*, role, role_note*, is_me)`** WHO
RUNS IT: everyone with a role, captain first (captain, organizer, coach, moderator, mentor,
connector). Badge = the role word; "You · welcomes new runners" from `is_me` + `role_note`.

**`clan_roster(p_clan_id, p_limit = 200, p_offset = 0)`**, **`clan_requests(p_clan_id)`** (with
`games_with_you`), **`my_clans()`** (You → "Crews, clans & hosting").

**Joining:** `join_clan(p_clan_id, p_message = null) → clan_join_state { clan_id, status ('member' |
'requested'), role*, request_id*, changed }` (open → in; request → a pending request; invite →
`clan_invite_only`), `join_clan_with_code(p_code)`, `withdraw_clan_request(p_clan_id)`,
`decide_clan_request(p_request_id, p_approve) → clan_request_status`, `clan_invite_code(p_clan_id,
p_rotate = false) → text` (INVITE: share `ojoro://clan/join/{code}` or the code), `leave_clan`,
`remove_clan_member`, `set_clan_role(p_clan_id, p_user_id, p_role, p_note = null)`,
`transfer_clan_captaincy`, `set_clan_leaderboard(p_clan_id, p_on)`.

**Create and edit:** `create_clan(p_idempotency_key, p_name, p_join_policy = 'request', p_tagline,
p_sport_id, p_area, p_city, p_short_name) → clans` (the creator is captain; 3 a day),
`update_clan(p_clan_id, …, null = unchanged)` (captain, organizer). Clan creation has no designed
screen yet (HANDOFF.md gap).

**`clan_clashes(p_clan_id) → table(clash_id, title, season_label*, opponent_clan_id, opponent_name*,
opponent_short_name*, our_side, stage, our_wins, their_wins, draws, event_count, decided_count, standing
('leading' | 'trailing' | 'level'), next_event_id*, next_position*, next_title*, next_sport_id*,
next_starts_at*)`** OJORO CLASH row: "2-1 · Fall Clash vs McGill · Event 4 of 6 · football, Sat ·
LEADING". Open ones first. Opens `/clash/{clash_id}`.

## Club runs

**`clan_week(p_clan_id, p_from = today, p_days = 7) → table(run_id, clan_id, ritual_id*, title,
sport_id, starts_at, duration_minutes, place_id*, place_name*, place_area*, distance_km*, down_count,
checked_in_count, capacity, min_to_go, status, stage, host_id, host_name*, i_am_down, i_checked_in,
can_cancel)`** THIS WEEK (the next 7 days from today, local): "TUE · Tempo · 6 km · Hall building ·
6:30 PM · 18 / 30" (`down_count` / `capacity`), GAME ON badge when `stage = 'game_on'`. `stage`:
`forming` → `game_on` (down ≥ `min_to_go`) → `live` (from the start) → `done` (after the end), or
`cancelled`. **`clan_run_view(p_run_id)`** = one row.

| RPC | Who | Does |
|---|---|---|
| `create_clan_run(p_idempotency_key, p_clan_id, p_sport_id, p_title, p_starts_at, p_capacity, p_min_to_go = min(4, capacity), p_place_id, p_duration_minutes, p_distance_km) → clan_run_state` | `run` roles | START A CLUB RUN. Host is down. 15 min to 60 days ahead. |
| `join_clan_run(p_run_id) → clan_run_state` | members | I'M DOWN. Capacity holds under concurrency (row lock). GAME ON at `min_to_go`. |
| `leave_clan_run(p_run_id)` | down, not the host | Before the start. GAME ON stays on. |
| `check_in_clan_run(p_run_id, p_lat, p_lng)` | down | 30 min before the start to the end, within 300 m of the place. Position never stored. |
| `mark_clan_run_attendance(p_run_id, p_user_id, p_present)` | host, captain, organizer | 30 min before to 24 h after the end; adds people who weren't down (if room). |
| `cancel_clan_run(p_run_id)` | host, captain, organizer | Before the start. |

`clan_run_state { run_id, status, stage, down_count, checked_in_count, capacity, min_to_go, i_am_down,
i_checked_in, changed }`.

## Mission and leaderboard

**`clan_mission(p_clan_id, p_on = today) → 0–1 row(mission_id, title, metric, target, starts_on,
ends_on, progress, contributors, my_share*, is_done, can_edit)`** OCTOBER MISSION (month from
`starts_on`) · "2,000 KM AS A CLAN." · bar = `missionFraction(progress, target)` · "1,240 km so far,
from 96 runners. Your share: 46 km." (`formatMissionAmount`; `my_share` null for non-members).
Progress = club runs checked in during the window: `distance_km` sums each run's distance per runner,
`runs` counts them, `hours` sums their durations. The mission block is the `after` situation
(SCREENS.md).

**`set_clan_mission(p_clan_id, p_title, p_metric, p_target, p_starts_on = first of this month,
p_ends_on = end of that month) → clan_missions`** captain/organizer/coach; setting the same start again
edits it. ≤ 92 days, not ending in the past.

**`clan_leaderboard(p_clan_id, p_month = this month, p_limit = 10) → table(rank, user_id,
display_name, avatar_path*, runs, is_me)`** MOST RUNS · OCTOBER · CLAN ONLY: club runs checked in that
local month; ties share a rank; top `p_limit` with at least one run, then your own row if you're further
down (or have none yet). Members only; privacy as above.

## Ojoro Clash

**Lifecycle.** `create_clash(p_idempotency_key, p_clan_id, p_opponent_clan_id, p_title, p_events,
p_season_label = null) → clash_state { clash_id, status, stage, created }` (your clan's captain or
organizer; `p_events` = JSON array, in order, of `{title, sport_id, scoring, starts_at, place_id?,
squad_size?}`, 1–12, each 1 h to 180 days ahead) → `accept_clash` / `decline_clash` (the other clan's
captain or organizer) → `cancel_clash` (either side, before the first event). Stage (`clash_stage`):
`proposed` → `upcoming` (accepted, before the first event) → `live` (from the first event) → `complete`
(every event decided, or the final decided); `declined`, `cancelled` (also a proposal whose first event
passed). Situation: `situationForClashStage` (proposed `forming`, upcoming `confirmed`, live `live`,
complete `after`, else `calm`).

**`clash_view(p_clash_id) → 1 row`** `clash_id`, `title`, `season_label`* (OJORO CLASH · FALL 2026),
`a_clan_id`, `a_name`, `a_short_name`, `b_clan_id`, `b_name`, `b_short_name` (CONCORDIA VS MCGILL:
`clashSides`), `status`, `stage`, `situation`, `my_side`*, `my_captain_side`*, `i_am_organizer`,
`event_count`, `decided_count` (AFTER 3 OF 6), `a_wins`, `b_wins`, `draws` (2-1: `clashScore`),
`leader`* ("Concordia leads"; null = level), `next_event_id`*, `next_position`*, `first_starts_at`*,
`last_starts_at`*, `backing_a`, `backing_b` (THE CROWD 312 / 287), `my_backing`*, `time_zone`,
`server_now`.

**`clash_my_part(p_clash_id) → 0–1 row(clash_event_id, position, title, sport_id, starts_at,
place_name*, place_area*, squad_size*, squad_taken, i_am_in, state)`** YOUR PART · EVENT 4: the next
undecided event you're in a squad for ("You're in the football squad for Saturday." · "7-a-side ·
Jeanne-Mance · 9:00 AM · 9 of 14 squad spots taken" · YOU'RE DOWN), else the next one your clan's
squad has room in (I'M DOWN = `join_clash_squad`). Empty for people outside both clans.

**`clash_events_list(p_clash_id) → table(clash_event_id, position, title, sport_id, scoring,
starts_at, place_id*, place_name*, place_area*, squad_size*, a_squad, b_squad, i_am_in_squad, state,
is_final, a_value*, b_value*, winner_side*, result_source*, pending_submission_id*, pending_side*,
pending_a_value*, pending_b_value*, can_submit, can_confirm)`** THE SIX EVENTS. `state`: `decided`
(badge = the winner's short name, or DRAW; the line = `formatClashValue(a)`–`formatClashValue(b)` or
"Organizer verified" when `result_source = 'organizer_verified'`), `verifying` (NOT FINAL; captains see
`pending_*`), `live`, `this_week` (badge = the weekday: SAT), `upcoming` (UPCOMING); `is_final` (FINAL).

| RPC | Who | Does |
|---|---|---|
| `join_clash_squad(p_clash_event_id) → clash_squad_state { clash_event_id, side, squad_count, squad_size*, i_am_in, changed }` | members of either clan | Before the event starts, while there's room (`squad_full`). |
| `leave_clash_squad(p_clash_event_id)` | in the squad | Before the start. |
| `propose_clash_organizer(p_clash_id, p_user_id, p_remove = false) → boolean (approved)` | a side's captain/organizer | Approved once both sides proposed the same person (not in either clan, no block with their captains). |
| `submit_clash_result(p_clash_event_id, p_a_value, p_b_value, p_idempotency_key) → clash_result_state { clash_event_id, status ('pending' / 'final'), submission_id*, a_value, b_value, winner_side*, source* }` | captains, approved organizers | After the event starts. An organizer's is final at once (`organizer_verified`); a captain's waits for the other side. Values: seconds (time, lower wins), km (distance), counts. |
| `confirm_clash_result(p_submission_id) → clash_result_state` | the other side's captain/organizer | Final (`captains_confirmed`). |
| `back_clash(p_clash_id, p_side = null) → clash_backing_state { clash_id, my_backing*, backing_a, backing_b }` | anyone who can see it | BACK CONCORDIA / BACKING; null stops backing. Members back only their own clan. Open while upcoming or live. "Backing is for fun and never changes a score. No stakes, no prizes." |

**`clash_season_standings(p_season_label) → table(clan_id, name, clashes, won, lost, drawn,
events_won, events_lost)`** Standings across the season's Clashes you can see (finished Clashes for
won/lost/drawn; events from every Clash).

Clash events are not plans: a squad is who takes part. Linking an event to a Slice 01 plan (for
check-in and recap) is not built yet; the event's line opens its place.

## Notifications

Two new `notification_type`s and the `clan` `notification_object` (Step 4's `my_notifications`,
bundling, mutes, quiet hours and would-send rules apply; `mute_object('clan', id)` silences a clan).

| Type | When | To | Object · link | Needs you while | Action |
|---|---|---|---|---|---|
| `ritual_week` | A Ritual puts this week's plan or club run on the board (when created, resumed, put back, or by the 5-minute job) | Everyone in the crew or clan except the host | crew: `plan` · `/plan/{id}`; clan: `clan` · `/clan/{id}` (`data.clan_run_id`) | it's forming (run: not started) with room and you're not in | `im_down` |
| `clan_request` | Someone asks to join a request clan (bundled per clan; push-throttled) | Captain, organizers, moderators, connectors (never across a block with the asker) | `clan` · `/clan/{id}` | a request is pending | `open` |

Words: "Thursday football · Thu 7:30" / "Thursday FC ritual · 1 / 10 in."; club run "Tempo · 6 km · Tue
6:30" / "Concordia Run Club · 18 / 30 down."; "Maya K asked to join Concordia Run Club." / "3 people
asked to join …" · "Approve or decline on the clan page." Locked screens: "This week's ritual is on
the board." / "Someone asked to join your clan."

## Realtime

`postgres_changes`, filtered by RLS. Realtime is a hint: on `SUBSCRIBED` and on foreground, refetch.

| Screen | Descriptor (channel) | Table · event · filter | Do |
|---|---|---|---|
| CrewHome | `crewHomeSubscription(crewId)` (`crew-home:{id}`) | `crew_members` · *, `plans` · *, `rituals` · *, `messages` · INSERT, all `crew_id=eq.{id}` | Members/plans/Rituals: refetch `crew_home`, `crew_rituals`. Messages: refetch `crew_home` (unread). |
| Clan | `clanSubscription(clanId)` (`clan:{id}`) | `clans` · UPDATE · `id=eq.{id}`; `clan_members`, `clan_runs`, `clan_missions`, `clan_join_requests` · * · `clan_id=eq.{id}` | Refetch `clan_view`, `clan_week`, `clan_mission`, `clan_roles`; requests for admitters. |
| Clash | `clashSubscription(clashId)` (`clash:{id}`) | `clashes` · UPDATE · `id=eq.{id}`; `clash_squad_members` · *, `clash_event_results` · INSERT, `clash_result_submissions` · * · `clash_id=eq.{id}` | Refetch `clash_view` (score, crowd), `clash_events_list`, `clash_my_part`. |

Published tables added: `rituals`, `ritual_occurrences`, `clans`, `clan_members`, `clan_runs`,
`clan_run_members`, `clan_missions`, `clan_join_requests`, `clashes`, `clash_events`,
`clash_squad_members`, `clash_event_results`, `clash_result_submissions`. Backings aren't published
(counts arrive on `clashes`).

## Analytics

Server events in `private.analytics_events` (facts only, never words or names): `crew_rhythm_set`
(per_week), `down_for_joined` (sport), `ritual_created` (crew/clan, sport, day), `ritual_edited`,
`ritual_paused`, `ritual_resumed`, `ritual_ended`, `ritual_skipped`, `ritual_unskipped`,
`ritual_plan_created` (a week prefilled), `clan_created` (join_policy), `clan_updated`, `clan_joined`
(via), `clan_join_requested`, `clan_request_decided` (approved), `clan_left`, `clan_member_removed`,
`clan_role_set` (role), `clan_captaincy_transferred`, `clan_run_created`, `clan_run_joined` (count,
capacity), `clan_run_left`, `clan_run_checked_in` (method), `clan_run_cancelled`, `clan_mission_set`
(metric, target), `clash_created` (events), `clash_accepted`, `clash_declined`, `clash_cancelled`,
`clash_squad_joined` (position), `clash_squad_left`, `clash_result_submitted`, `clash_result_verified`
(source), `clash_backed` (side, own_clan). The client sends taps only (names in `@ojoro/analytics`):
`screen_viewed`, `crew_viewed`, `crew_next_joined` (CrewMomentum spec), `ritual_skip_tapped`,
`make_this_a_ritual_tapped`, `crew_chat_opened`, `clan_viewed`, `clan_run_started_tapped`,
`clan_invite_shared`, `clash_viewed`, `clash_shared`, and Step 5's `crowd_backed{side}` (CrowdSupport).

## Screens

| Screen | Route | Reads | Writes | Sub |
|---|---|---|---|---|
| **CrewHome** | `/crew/[id]` (calm) | Header CREW · PRIVATE, CREW · 14 + name: `crew_home`; AvatarCluster: Step 4 `crew_roster` (first 5 + "+9" from `member_count`); CrewMomentum: `weeks`, `momentumHeadline`, NEXT `next_*`; FREE TONIGHT: `crew_free_tonight` + count; DOWN FOR: `crew_down_for`; RITUAL: `crew_rituals` (first); MAKE THIS A RITUAL card when `suggest_*`; CREW VS CREW: `crew_versus` (+ `crew_rivalries` for the record); MEMORIES: `crew_memories`; chat icon badge and OPEN CREW CHAT · 4 NEW: `unread_count` | I'M DOWN (next) `im_down(next_plan_id, key)`; Down For I'M DOWN `join_down_for`; THIS WEEK → `/plan/{week_plan_id}`; SKIP A WEEK `skip_ritual_week`; `create_ritual` (suggestion); CALL OUT (Step 5); chat → `/crew/{id}/chat`; header menu `report('crew', id)`, leave (Step 4 `leave_crew`); people rows `block_user` | `crew-home:{id}` |
| **Clan** | `/clan/[id]` (calm; mission block after) | `clan_view` (header, name, tagline, stats 212 / 4 / 3), `clan_week` (THIS WEEK), `clan_mission`, `clan_clashes` (OJORO CLASH), `clan_roles` (WHO RUNS IT), `clan_leaderboard` (MOST RUNS · {MONTH} · CLAN ONLY; members) | START A CLUB RUN (`can_start_run`) → `create_clan_run` (form not designed: Create-style); INVITE (`can_invite`) → `clan_invite_code` + share; JOIN / REQUEST TO JOIN for non-members `join_clan`; run row I'M DOWN `join_clan_run`; ··· menu `report('clan', id)`, leave `leave_clan`, hide me from the leaderboard `set_clan_leaderboard`; people rows `block_user` | `clan:{id}` |
| **Clash** | `/clash/[id]` (situation from `clash_view.situation`; live in the design) | `clash_view` (poster: names, VS, score, AFTER n OF m, "Concordia leads"), `clash_my_part` (YOUR PART), `clash_events_list` (THE SIX EVENTS), crowd from `clash_view` | YOU'RE DOWN / I'M DOWN `join_clash_squad` (tap again to leave: `leave_clash_squad`); BACK X / BACKING `back_clash`; captains: `submit_clash_result`, `confirm_clash_result`; share (poster); header menu `report('clash', id)` | `clash:{id}` |

Every screen has the standard states (skeleton after 300 ms, empty, offline with last-known values and
how old, privacy, errors by code). Empty states: no Ritual → the suggestion or nothing; no crew vs crew
→ CALL OUT another crew; no mission → "No mission this month" (captains: SET A MISSION); no club runs
this week → START A CLUB RUN for `can_start_run`; no Clash → nothing (the row hides).

## Local data

`supabase/seed_communities.sql` (after `seed_competition.sql` in `[db.seed] sql_paths`; safe to re-run
on the running stack to refresh the time-relative parts:
`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_communities.sql`).
Sign in as Chimdi (+1 555 555 0100). Sample content from the designs.

| Screen | Id | Shows |
|---|---|---|
| CrewHome | crew `c1000000-0000-4000-8000-000000000001` (Thursday FC, Step 4) | 14 members, rhythm 3 a week, 8 weeks `{2,1,3,4,5,3,5,6}` → 6 WEEK STREAK; free tonight Ade, Lena, Joel and Sam; DOWN FOR Lena (football Saturday morning, 3 down, ends Fri 10 PM) and Sam (running, Sunday evening, 1 down); RITUAL Thursday football (`f0000000-0000-4000-8000-000000000001`, Thu 7:30 PM, Jeanne-Mance, this week's plan `f0000000-0000-4000-8000-000000000011` at 6 / 10); CREW VS CREW vs Plateau Crew (Step 5 event `d2000000-0000-4000-8000-000000000002`, 9 of 10 in, ACCEPTED); memories; 4 new in the chat |
| Clan | clan `f1000000-0000-4000-8000-000000000001` (Concordia Run Club, short CONCORDIA) | 212 members, Chimdi a connector, Maya K captain, Theo L coach (3 coaches), 4 Rituals; THIS WEEK Tue tempo 6 km 18 / 30 (`f2000000-0000-4000-8000-000000000001`), Thu easy 8 km 22 / 40 (`…002`), Sat long run Lachine Canal GAME ON (`…003`); mission `f3000000-0000-4000-8000-000000000001` 2,000 km, 1,240 km from 96 runners, Chimdi 46 km; leaderboard Maya 14, Chimdi 11, Theo 10 runs this month |
| Clan (other side) | clan `f1000000-0000-4000-8000-000000000002` (McGill Running Society, short MCGILL) | Marcus T captain |
| Clash | clash `f4000000-0000-4000-8000-000000000001` (Fall Clash, Fall 2026) | 2-1 after 3 of 6; events `f5000000-0000-4000-8000-00000000000{1..6}`: relay CONCORDIA (organizer verified), 3v3 basketball 21–17 MCGILL, bouldering 38–34 CONCORDIA, 7-a-side football next Saturday 9:00 at Jeanne-Mance (Chimdi in the squad, 9 of 14), rowing erg the day after, Final 10K two weeks on at Mount Royal; crowd 312 / 287, Chimdi backs Concordia |

## Not built

Notifications for clan request decisions, club-run changes and Clash moments; a club-run
screen (`clan_run_view` is ready); clan creation and Ritual editing screens (not designed); Clash
events as plans (check-in, recap and Passport for Clash events); ladders and multi-clan leagues (host
leagues are BE-HOST-OPS); public clan discovery in Discover; clan chat; dismissing the Make This a
Ritual suggestion (it disappears once a Ritual covers it); youth/community safety controls by role
(PRD §9.13) beyond the role gates above; moderation audit trail for clan actions (analytics events
only).
