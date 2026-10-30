# Step 7: Passport backend contract

The data layer for **Passport detail** (`/passport`, `/profile/[id]/passport`), the **goal** and the
**reputation** blocks on You, and the **PB · Passport** row on Result. PRD §9.17 (Passport, Goals,
Achievements and Reputation), §9.1 (Physical Identity: goals visibility configured on its own), §20.2
(results are never rewritten). It builds on every rule in [`SLICE01_CONTRACT.md`](SLICE01_CONTRACT.md)
(write only through RPCs, map errors by code, idempotency keys) and on Step 5's results
([`COMPETITION_CONTRACT.md`](COMPETITION_CONTRACT.md)). Judgment calls: `docs/DESIGN_DECISIONS.md`
("Step 7 BE-PASSPORT").

Passport detail isn't designed (HANDOFF.md "What isn't designed yet"); this contract gives the screen
everything You.png, Recap.png and Result.png show about a Passport, plus the groupings PRD §9.17 asks for.

> **No points, nothing redeemable, no money.** Achievements are history put into words ("10 GAMES AT ONE
> PLACE"), derived on every read. Nothing accrues, nothing can be spent, nothing is ranked against other
> people. Reputation is positive, structured and aggregate: no star ratings, no negative signals.

- Schema: `supabase/migrations/20261031020000_passport_schema.sql` (Challenge stamps, personal bests,
  goals, goals visibility, the result trigger and the backfill), `…020100_passport_reads.sql`,
  `…020200_passport_goals.sql`.
- Client helpers: `packages/contracts/src/passport.ts` (exported from `@ojoro/contracts`):
  `passportRpcs`, `passportIdempotentRpcs` (also in `idempotentRpcs`), `passportErrorCodes` (also in
  `ojoroErrorCodes`), types `PassportView`, `PassportStamp`, `PassportAchievement`, `PassportReputation`,
  `GoalView`, `ClearGoalResult`, `ChallengePassportForMe`, args `passportStampsArgs(filter)`, words
  (`stampHeadline`, `monthLabel`, `formatDuration`, `formatResultValue`, `formatGap`, `achievementTitle`,
  `achievementProgress`, `reputationLabel`, `showUpSentence`, `goalHeadline`, `goalDateLabel`,
  `goalProgressLine`, `goalGapSentence`), realtime `passportSubscription(userId)`, constants
  `SHOW_UP_MIN_GAMES` (5), `PASSPORT_STAMPS_PAGE` (30), `GOAL_LIMITS`.
- Tests: `supabase/tests/34_passport_challenge_stamps.sql`, `35_passport_reads.sql`,
  `36_passport_goals.sql`; `packages/contracts/src/passport.test.ts`.
- Seed: `supabase/seed_passport.sql` (Chimdi's full Passport; see [Local data](#local-data)).

Contents: [Rules](#rules) · [Errors](#errors) · [Model](#model) · [Passport detail](#passport-detail) ·
[Stamps](#stamps) · [Milestones](#milestones) · [Personal bests](#personal-bests) ·
[Achievements](#achievements) · [Reputation](#reputation) · [Goals](#goals) ·
[Result screen](#result-screen) · [Realtime](#realtime) · [Analytics](#analytics) ·
[Local data](#local-data) · [Not built](#not-built)

---

## Rules

1. **Write only through the RPCs below.** `personal_bests` and `goals` are readable through RLS;
   clients have no INSERT/UPDATE/DELETE. Stamps and personal bests are written by the server only.
2. **Idempotent with a key:** `set_goal` (`p_idempotency_key`, one uuid per intention, reused on retry;
   a retry returns the first result). **Set-to-state, safe to repeat:** `clear_goal`,
   `set_goals_visibility`.
3. **Privacy (server-side).** Someone else's Passport (stamps, totals, places, months, milestones,
   personal bests, achievements, their show-up record) follows **their history setting**
   (`privacy_settings.history_visibility`, OnboardPrivacy). Their goal follows **their goals setting**
   (`goals_visibility`, new, default `friends`). Nothing crosses a block: `passport_view`,
   `passport_reputation` and `passport_goal` return null, the lists return nothing. A Game / Challenge id
   on a stamp is null unless the viewer can see that game / Challenge. Places are public places with
   their area, never an address or a person's location.
4. **One stamp per game per player, one stamp per Challenge result per competitor.** Never rewritten.
   A personal best is a new row each time a best is beaten; past rows are never changed
   (UPDATE/DELETE raise `result_already_verified`).
5. **One active goal.** Setting a goal of the same kind (and sport and discipline) changes its target /
   date in place; anything else replaces it (kept as `replaced`). Progress is computed from the Passport,
   never typed in.
6. **Status is never colour-only.** Every state has words: `stampHeadline`, `goalProgressLine`
   ("Reached."), `achievementProgress` ("6 of 10"), `showUpSentence`.
7. **Counts, not adjectives.** Tabular numerals for every count. Display-face headlines are UPPERCASE
   (the helpers return them that way).

## Errors

New codes (words in `apps/mobile/src/lib/errorMessages.ts`):

| Code | Meaning | `detail` |
|---|---|---|
| `goal_invalid` | A goal that doesn't add up (see [Goals](#goals)). | `kind` / `sport` / `discipline` / `scoring` / `target_value` / `target_date` |

Also used: `sport_unknown` (unknown `p_sport_id`), `invalid_argument` (`passport_stamps` month not
`YYYY-MM`: detail `month`; `set_goals_visibility(null)`: detail `visibility`), `idempotency_key_required`,
`idempotency_key_reused`, `not_authenticated`.

## Model

| Table | Visible to | Notes |
|---|---|---|
| `passport_entries` (extended) | owner's history setting | New: `kind` (`game` / `challenge`), `challenge_event_id`* (unique per person), `challenge_title`*, `challenge_scoring`*, `challenge_unit`*, `challenge_side`*, `challenge_value`* (seconds for time), `challenge_outcome`* (`won` / `lost` / `draw`). `activity_id` is now null for Challenge stamps. `place_game_number` / `sport_game_number` count games only for game stamps; for a Challenge stamp `sport_game_number` is its ordinal among Challenges in that sport and `place_game_number` is null. Prefer `passport_stamps`, which computes ordinals from history. |
| `personal_bests` | owner's history setting | Insert-only. `user_id`, `sport_id`, `discipline` (upper-cased Challenge title: "5K"), `scoring` (`time` lower is better, seconds / `distance` higher is better), `unit`* (course unit), `value`, `previous_value`* (null = first in the discipline), `passport_entry_id`, `challenge_event_id`, `set_at`. Current best = latest row per discipline. |
| `goals` | owner; others while active and their goals setting includes them | `kind` (`personal_best` / `sessions` / `places`), `sport_id`*, `discipline`*, `scoring`*, `target_value`, `target_date`*, `status` (`active` / `replaced` / `cleared`), `achieved_at`* (set once by the server), `ended_at`*. Prefer `passport_goal`. |
| `privacy_settings.goals_visibility` | owner | `everyone` / `friends` / `crews` / `only_me`, default `friends`. Also grant-updatable directly, like the other three. |

Personal bests only come from **person-vs-person** Challenges scored by **time** or **distance** (a
team's score isn't a personal best). Who gets a Challenge stamp: both people (person vs person); for
crews, the captains and everyone in the lineup who checked in.

## Passport detail

**`passport_view(p_user_id) → jsonb PassportView | null`** One call for the page. Null: no such person or
a block either way (never says which; show the same not-found state as the profile).

| Field | Notes |
|---|---|
| `user_id`, `display_name`, `handle`, `avatar_path`, `is_me` | Header. |
| `visible` | The owner's history setting includes you. **False:** show the privacy state in words ("Ade keeps their games and Passport to a smaller circle."); `totals` is null and every list is empty. |
| `goals_visible` | Their goals setting includes you (then call `passport_goal`). |
| `time_zone` | The owner's; months and stamp dates use it. |
| `history_visibility`, `goals_visibility` | Yours only (null for others): the visibility line and Edit visibility. |
| `totals` | `stamps`, `games`, `challenges`, `minutes`, `ojoro_hours` (1 dp; the same number as `profile_view`), `places`, `sports`, `people_moved_with` (checked in to the same game; same as `profile_view`), `personal_bests` (rows, i.e. times a best was set), `first_at`*, `last_at`*. Headline: "14 STAMPS. 6 PLACES. 23 PEOPLE." (`passportHeadline` in features/profile). |
| `places[]` | By place: `place_id`, `name`, `area`, `city`, `time_zone`, `stamps`, `games`, `first_at`, `last_at`. Most stamps first. |
| `sports[]` | By sport: `sport_id`, `name`, `stamps`, `games`, `challenges`, `minutes`, `first_at`, `last_at`. |
| `months[]` | By month in the owner's time zone: `month` (`YYYY-MM`; `monthLabel` → "OCTOBER 2026"), `stamps`, `minutes`, `places`. Newest first. Months with nothing are left out. |
| `milestones[]` | Firsts and milestones, the latest 24, newest first: `entry_id`, `milestone` (see [Milestones](#milestones)), `count`*, `kind`, `occurred_at`, `sport_id`, `sport_name`, `place_id`*, `place_name`*, `place_time_zone`*, `title`*, `value`*, `scoring`*, `unit`*, `outcome`*. Each renders as a `PassportStamp` (`stampHeadline`, place, date). |
| `personal_bests[]` | Current best per discipline, latest first: `personal_best_id`, `sport_id`, `sport_name`, `discipline`, `scoring`, `unit`*, `value` (`formatResultValue`), `previous_value`*, `first_value`, `improvements` (times beaten after the first), `set_at`, `place_name`*, `event_id`* (null unless you can see that Challenge). |

## Stamps

**`passport_stamps(p_user_id, p_place_id = null, p_sport_id = null, p_month = null,
p_milestones_only = false, p_before = null, p_limit = 30) → PassportStamp[]`** Newest first, at most 100.
Filter by one place, sport or month (`YYYY-MM`, owner's time zone) or only milestones; page with
`p_before` = the last row's `occurred_at`. `passportStampsArgs(userId, filter, before)` builds the args.
Empty when the owner's history isn't visible to you.

Row: `entry_id`, `kind`, `occurred_at`, `sport_id`, `sport_name`, `place_id`*, `place_name`*,
`place_area`*, `place_time_zone`*, `minutes`, `activity_id`* / `challenge_event_id`* (only when you can
see it: the stamp links to the Recap / Result), `title`*, `scoring`*, `unit`*, `value`*, `outcome`*,
`stamp_number` (n-th stamp), `sport_number` (n-th in the sport), `place_number`* (n-th stamp at the
place), `place_game_number`* (n-th game at the place; game stamps only), `personal_best`,
`previous_best`*, `milestone`*, `milestone_count`*.

## Milestones

At most one per stamp, by priority, computed from history (so it's right even for stamps recorded late):

| `milestone` | When | `stampHeadline` |
|---|---|---|
| `first_stamp` | Their first stamp ever | FIRST GAME / FIRST CHALLENGE |
| `first_in_sport` | First in this sport | FIRST BOXING |
| `first_in_discipline` | First result in a time / distance discipline (a first personal best) | FIRST 10K |
| `personal_best` | Beat their best in the discipline | NEW 5K PB |
| `first_challenge` | First Challenge | FIRST CHALLENGE |
| `first_at_place` | First stamp at this place | FIRST TIME HERE |
| `place_games` | 5th, 10th, 20th, 50th, 100th game at this place, then every 50th (`count`) | 20 GAMES |
| `stamps` | 10th, 25th, 50th, 100th, 250th, 500th, 1000th stamp (`count`) | 50 STAMPS |

Plain stamps: "5K · WON" (Challenge), "GAME 12" (game).

## Personal bests

Written by the server when a Challenge result is final (an AFTER INSERT trigger on `challenge_results`,
which is itself insert-only). Every competitor gets their stamp in the same transaction as the result;
a person-vs-person time / distance adds a `personal_bests` row when it beats their best in that
discipline (or is their first). Results that were already complete when this shipped were backfilled
oldest first. The value is the person's own number from the result (`a_value` / `b_value`).

## Achievements

**`passport_achievements(p_user_id) → PassportAchievement[]`** Derived on every read; nothing is stored,
nothing accrues. One row per **reached tier** (`achieved` true, `achieved_at` = when it happened), newest
first; **for yourself** also the next tier of every ladder (`achieved` false, `current` of `threshold`:
`achievementProgress` → "6 of 10"). Empty when the owner's history isn't visible to you. Row: `ladder`,
`family`, `threshold`, `achieved`, `achieved_at`*, `current`, `context`* (the place, for `regular`).
Title: `achievementTitle(ladder, threshold)`.

| Ladder | Family | Tiers | Counts |
|---|---|---|---|
| `sessions` | participation | 1, 10, 25, 50, 100, 250, 500 | stamps |
| `regular` | participation | 10, 25, 50, 100 | games at one place (`context` = the place) |
| `challenges` | participation | 1, 5, 10, 25 | Challenge stamps |
| `people` | participation | 10, 25, 50, 100 | people moved with |
| `places` | exploration | 3, 5, 10, 25 | places |
| `sports` | exploration | 2, 3, 5 | sports |
| `personal_bests` | improvement | 1, 5, 10 | personal bests set |
| `goals` | improvement | 1, 3, 10 | goals reached |
| `hosted` | contribution | 1, 10, 25, 50, 100 | games hosted that ended |

## Reputation

**`passport_reputation(p_user_id) → jsonb PassportReputation | null`** (null across a block):

| Field | Notes |
|---|---|
| `threshold` | 5. "From people you've played with. A signal only appears after 5 confirmations." |
| `signals[]` | `kind` (`shows_up` / `respectful` / `welcomes_beginners` / `great_host`), `confirmations` (≥ 5), most first. Chips: `reputationLabel(kind, n)` → "SHOWS UP · 31". Same as `profile_reputation`. |
| `building[]` | Yours only: kinds people have started to confirm, without the count ("On the way: …"). Empty for others. |
| `show_up` | `{ showed_up, committed }`: games checked in to / games confirmed for that have ended (not cancelled; leaving before GAME ON isn't a miss). Yours always; someone else's only when their history is visible to you and `committed ≥ 5`, else null. `showUpSentence` → "Showed up to 46 of 48 games." |
| `hosted` | Games hosted that ended. |
| `history_visible` | Their history setting includes you. |

Signals are given with `give_reputation` (Slice 01). Correcting a signal: report the profile
(`report('profile', …)`) for now; see [Not built](#not-built).

## Goals

**`passport_goal(p_user_id) → jsonb GoalView | null`** Yours, or someone else's while their goals
setting includes you. Null: no active goal, not visible, or a block.

| Field | Notes |
|---|---|
| `goal_id`, `user_id`, `is_me`, `kind`, `sport_id`*, `sport_name`*, `discipline`*, `scoring`*, `unit`* | `unit` only for distance. |
| `target_value`, `target_date`* | Seconds (time) / the unit (distance) / a count. `target_date` is the last day (`YYYY-MM-DD`). Headline: `goalHeadline` → "SUB-22 5K BY DECEMBER." |
| `current_value`*, `best_at`*, `achieved`, `achieved_at`*, `fraction` (0–1) | personal_best: best so far, ever (null: no result yet). sessions: stamps since the goal was set (in the sport, if any). places: places first visited since the goal was set. `goalProgressLine` → "Best so far: 23:05." / "4 of 10 so far." / "Reached." `achieved_at` is set once, the first time progress reaches the target. |
| `next_step`* | Yours only. NEXT STEP: the soonest game you could join in the goal's sport (any sport if none), within your radius, next 14 days. Same shape as an `ojoro_now` row: `kind`, `plan_id`, `activity_id`*, `title`, `starts_at`, `place_name`*, `place_area`*, `place_time_zone`*, `spots_left`, `action` (`join` → I'M DOWN via `im_down` / `waitlist` → `join_waitlist`), `reason`. |
| `next_test`* | Yours only. Your next scheduled Challenge in the sport (and discipline, for a personal_best goal): `event_id`, `title`, `starts_at`, `time_zone`, `place_name`*, `opponent_name`*. "The Call-Out on Saturday is your next real test." |

**`set_goal(p_kind, p_target_value, p_idempotency_key, p_sport_id = null, p_discipline = null,
p_scoring = null, p_target_date = null) → jsonb GoalView`** SET GOAL / change it.

| `p_kind` | Needs | `p_target_value` |
|---|---|---|
| `personal_best` | `p_sport_id`, `p_discipline` ("5K", ≤ 24; upper-cased), `p_scoring` (`time` / `distance`) | time: whole seconds 60–86400; distance: 0.1–1000 |
| `sessions` | `p_sport_id` optional | whole number 1–500 |
| `places` | no sport | whole number 1–100 |

`p_target_date`: optional, from today to 3 years ahead (your time zone). Same kind + sport + discipline as
the active goal: target / date change in place (`achieved_at` resets when the target changes); otherwise
the active goal is replaced. Errors: `goal_invalid` (detail as above), `sport_unknown`.

**`clear_goal() → { cleared, goal_id }`** CLEAR GOAL. Safe to repeat (`cleared: false` when none).

**`set_goals_visibility(p_visibility) → visibility`** Who sees your goal.

## Result screen

**`challenge_passport_for_me(p_event_id) → ChallengePassportForMe[]`** (0 or 1 row): the caller's stamp
for a complete Challenge. No row when you didn't compete or the result isn't final. `passport_entry_id`,
`occurred_at`, `sport_id`, `title`, `scoring`, `unit`*, `value`, `outcome`, `place_name`*,
`place_time_zone`*, `personal_best` (this result set a best), `first_in_discipline`, `previous_best`*,
`best_value`* (your best now), `goal_id`*, `goal_target`*, `goal_target_date`*, `goal_gap`* (time:
seconds still to cut, ≤ 0 = under the target; distance: still to add). Row: "YOU · 5K · 22:48 · NEW PB ·
49 s off your goal" (`formatResultValue`, `goalGapSentence`).

## Realtime

`passportSubscription(userId)`: INSERT on `passport_entries` and `personal_bests`, any change on `goals`,
filtered by `user_id` (RLS applies). A refetch hint for `passport_view`, `passport_stamps`,
`passport_achievements` and `passport_goal`. A new stamp lands when a Recap is created or a Challenge
result is final.

## Analytics

Server-emitted (`private.analytics_events`): `passport_entry_added` (Challenge stamps: `kind`,
`event_id`, `sport_id`), `personal_best_set` (`event_id`, `sport_id`, `discipline`, `first`,
`improvement`), `goal_set` (`goal_id`, `kind`, `sport_id`, `has_date`, `replaced`), `goal_updated`,
`goal_cleared`, `goal_achieved` (`goal_id`, `kind`, `days_to_achieve`), `goals_visibility_set`. The
client sends views and taps (`passport_viewed`, `passport_filter_changed`, `goal_sheet_opened`; see
`packages/analytics`). PRD metrics: Passport entries / user, goal-progress activity joins (join from
`next_step`: send `source: 'goal'` with the join tap), reputation coverage.

## Local data

`supabase/seed_passport.sql` (after `seed.sql` and `seed_competition.sql`; safe to re-run). Sign in as
Chimdi (+1 555 555 0100, code 123456):

- Stamps across football (Jeanne-Mance, Lachine Canal), running (Mount Royal loop, Parc La Fontaine,
  Lachine Canal), boxing (Hoshino Boxing), basketball (Parc Jarry), volleyball (Parc La Fontaine),
  months back to March; 6 places, 5 sports, 23+ people moved with.
- Challenge stamps and personal bests from Step 5's Marcus rivalry (5K best 22:48, 10K).
- Goal: SUB-22 5K BY DECEMBER (personal_best, running, 5K, 1320 s, 31 December), best so far shown,
  next test = the 5K Call-Out event.
- Reputation: all four signals past 5; games Chimdi hosted.

## Not built

- Appeals / corrections of a reputation signal as its own flow (PRD §9.17 core requirement): report the
  profile for now. Needs a staff review tool (owner decision).
- Manual personal bests (outside a Challenge), device-verified results (M10).
- Goal reminders / notifications, goal history page (replaced and cleared goals are kept for it).
- Passport export / sharing a Passport page (premium, PRD §19).
