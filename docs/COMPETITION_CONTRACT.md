# Step 5: Competition backend contract

The data layer for Step 5 (PRD M6): **Call-Outs**, **Challenge Events** (build-up, event day, live,
verifying, result), the **crowd** around them (follow, WHO TAKES IT? predictions, backing, the hype
feed, comments, polls, cheers), **Rivalries** and **rematches**. It extends
[`SLICE01_CONTRACT.md`](SLICE01_CONTRACT.md), [`LIQUIDITY_CONTRACT.md`](LIQUIDITY_CONTRACT.md) and
[`MESSAGING_CONTRACT.md`](MESSAGING_CONTRACT.md): every rule there (write only through RPCs, map errors
by code, idempotency keys, effective status, no raw location) still applies. Judgment calls are in
`docs/DESIGN_DECISIONS.md` ("Step 5 backend").

- Schema: `supabase/migrations/20261029200000_competition_enums.sql`, `…200100_competition_schema.sql`,
  `…200200_competition_call_outs.sql`, `…200300_competition_crowd.sql`, `…200400_competition_live_result.sql`,
  `…200500_competition_auto_confirm_enum.sql`, `…200510_competition_auto_confirm.sql`,
  `…200520_competition_verification_requester.sql`, `…200530_competition_rivalry_report_enum.sql`,
  `…200540_competition_rivalry_gaps.sql`, `…200550_competition_poster_backing.sql`.
- Generated types: `@ojoro/contracts` (`Database`), plus row aliases `CallOutView`, `CallOutRow`,
  `ChallengeEventView`, `ChallengeEventRow`, `ChallengeFeedPost`, `ChallengeComment`, `ChallengePoll`,
  `ChallengeVerification`, `VerificationCheck`, `ChallengePoster`, `RivalryView`, `RivalryMeeting`,
  `RivalryRow` and enum aliases `ChallengeFormat`, `ChallengeScoring`, `ChallengeAudience`,
  `ChallengeStage`, `ChallengeStatus`, `CallOutStatus`, `ChallengePostKind`, `ChallengePollTemplate`,
  `ChallengeSide`.
- Client helpers in `@ojoro/contracts` (`competition.ts`): `competitionRpcs`,
  `competitionIdempotentRpcs` (also in `idempotentRpcs`), `competitionToggleRpcs`,
  `competitionErrorCodes` (also in `ojoroErrorCodes`), `situationForStage`, `screenForStage`,
  `challengeCountdown`, `formatChallengeValue`, `formatMargin`, `formCells`, `crowdOutcome`, realtime
  descriptors `challengeEventSubscription`, `callOutSubscription`, `callOutsSubscription`,
  `rivalrySubscription`, the `WithNull<T, K>` helper, and the limits
  `CALL_OUTS_PER_DAY` (10), `PREDICTION_MIN_COUNT` (5), `CHALLENGE_POST_MAX_LENGTH` (280),
  `CHALLENGE_COMMENT_MAX_LENGTH` (500), `CALL_OUT_MESSAGE_MAX_LENGTH` (140), `CHALLENGE_CHECK_IN_MINUTES` (60),
  `RESULT_AUTO_CONFIRM_HOURS` (48).
- Tests: `supabase/tests/17_call_outs.sql`, `18_challenge_crowd.sql`, `19_challenge_result_rivalry.sql`,
  `20_challenge_auto_confirm.sql`,
  plus the local-only concurrency check `supabase/tests/race/accept_call_out_race.sh` (22 concurrent
  ACCEPT taps on one open call-out: exactly one event), and `21_rivalry_gaps.sql`.
- `RivalryView`, `RivalryMeeting` and `RivalryRow` already mark their nullable columns `| null`
  (the generated types say non-null for every `returns table` column); use them, not the raw
  `Functions[…]['Returns']`.
- Enum names: `challenge_format`, `challenge_scoring`, `challenge_audience`, `challenge_stage`,
  `challenge_status`, `call_out_status`, `challenge_post_kind`, `challenge_poll_template`,
  `challenge_verification_method` (not `challenge_verification`, which is the Verifying RPC),
  `challenge_result_source`, `challenge_submission_status`, `rivalry_kind`.

Contents: [Rules](#rules) · [Errors](#errors) · [Privacy and safety](#privacy-and-safety) ·
[Model](#model) · [Stages](#stages) · [Call-Outs](#call-outs) · [Event page](#event-page) ·
[Event day and live](#event-day-and-live) · [Result and verification](#result-and-verification) ·
[Rivalries and rematch](#rivalries-and-rematch) · [Poster](#poster) · [Notifications](#notifications) ·
[Realtime](#realtime) · [Analytics](#analytics) · [Screens](#screens) · [Local data](#local-data) ·
[Not built](#not-built)

---

## Rules

1. **Write only through the RPCs below.** New tables are readable through RLS as listed; clients have
   no INSERT/UPDATE/DELETE on any of them.
2. **Idempotent with a key** (`p_idempotency_key`, one uuid per user intent, reused on retry):
   `create_call_out`, `accept_call_out`, `counter_call_out`, `post_challenge_update`,
   `comment_on_challenge`, `submit_challenge_result`, `confirm_challenge_result`, `run_it_back_challenge`.
   **Set-to-state, safe to repeat:** `decline_call_out`, `withdraw_call_out`, `follow_challenge_event`,
   `unfollow_challenge_event`, `predict_challenge`, `back_challenge`, `vote_challenge_poll`,
   `check_in_challenge`, `ready_challenge`, `log_challenge_progress`, `request_challenge_correction`,
   `withdraw_challenge_correction`, `cancel_challenge_event`, `join_challenge_lineup`,
   `leave_challenge_lineup`, `delete_challenge_post`, `delete_challenge_comment`,
   `propose_challenge_organizer`, `remove_challenge_organizer`. **Toggles** (don't retry blindly;
   refetch and compare): `respect_challenge_comment`, `react_challenge`.
3. **ACCEPT makes exactly one Challenge Event** (PRD §10.15, §14.1): the call-out row is locked, the
   event is inserted in the same transaction, and `challenge_events.call_out_id` is unique. A double tap
   (same or new key), the challenger tapping too, or two people accepting an open call-out at once all
   end with one event: callers who are in it get it back with `created: false`; anyone else gets
   `call_out_closed`.
4. **Stage is computed** from the stored status and the clock on every read (`challenge_event_view`,
   `my_challenge_events`) and in every mutation. A minute job (`private.challenge_tick`) only adds the
   countdown milestones and closes no-shows; correctness never depends on it.
5. **Rules never change after acceptance** (PRD §9.14): format, sport, title, scoring, target, place,
   course and start are copied from the call-out at ACCEPT and no RPC edits them. Change = COUNTER
   (before acceptance) or cancel and call out again. Logistics changes are posts.
6. **Results are never rewritten.** `challenge_results` is insert-only (a trigger refuses UPDATE and
   DELETE with `result_already_verified`). Rivalry records are computed from it, so a rematch adds a
   row and leaves the earlier ones exactly as they were.
7. **No money anywhere.** No stakes, odds, payouts or points. Predictions and backing are counts; the
   call-out's STAKES row is always "None. Bragging rights only." (copy, not data).
8. **Nullable columns** of `returns table` RPCs are marked `*` below; the generated types say
   non-null (Slice 01 rule 7). Treat them as `T | null`.
9. **Sides:** `a` = the challenger, `b` = the one who accepted. Screens put **your** side first
   (`my_side`), e.g. CHIMDI VS MARCUS when Chimdi was called out by Marcus.
10. **Values:** `time` scoring in **seconds** (lower wins), `distance` in **km** (higher wins), `score`
    and `rounds` as counts (higher wins). Format with `formatChallengeValue`.
11. **Links:** `/challenge/{call_out_id}` (CallOut), `/event/{event_id}` (all event stages; switch the
    screen with `screenForStage(stage)`), `/rivalry/{rivalry_id}`.

## Errors

All `P0001`, the code is `error.message` (`toOjoroError`). Words are in
`apps/mobile/src/lib/errorMessages.ts`.

| Code | Raised by | Meaning |
|---|---|---|
| `call_out_not_found` | call-out RPCs, `call_out_view` | No such call-out, or you can't see it (never says which). |
| `call_out_not_allowed` | `create_call_out`, `accept_call_out`, `counter_call_out`, `decline_call_out`, `withdraw_call_out` | Yourself, a block either way (never says which), not the target, not the challenger (withdraw), or the other crew's owner/admin has a block with you. |
| `call_out_closed` | accept/counter/decline/withdraw | Already accepted (by someone else), countered, declined or withdrawn. |
| `call_out_expired` | accept/counter | Past `expires_at` or its start. |
| `call_out_pending` | `create_call_out` | A call-out between the same two sides is already waiting. `detail` = its id: open it. |
| `call_out_rate_limited` | `create_call_out` | 10 call-outs in 24 h. `detail` = `10`. |
| `challenge_event_not_found` | every event RPC | No such event, or you can't see it. |
| `not_competitor` | posts, polls, check-in, ready, progress, result, correction, cancel, organizers, lineup, rematch, `challenge_verification` | Only competitors (captains where noted) or approved organizers may. |
| `predictions_locked` | `predict_challenge` | It's LIVE (or past the start). |
| `prediction_not_allowed` | `predict_challenge`, `back_challenge` | A competitor picking the other side. |
| `backing_closed` | `back_challenge` | The result is being verified, final, or the event was cancelled. |
| `challenge_not_live` | `log_challenge_progress`, `submit_challenge_result`, `request_challenge_correction` | Not LIVE yet (or nothing to correct). |
| `challenge_closed` | follow, posts, comments, reactions, check-in, ready, organizers, poster | Complete or cancelled (as the RPC says). |
| `challenge_started` | `create_challenge_poll`, `cancel_challenge_event`, lineup | Already started; can't change now. |
| `lineup_full` | `join_challenge_lineup` | `detail` = side size. |
| `not_checked_in` | `ready_challenge` | Check in first. |
| `post_not_found` | `delete_challenge_post`, `comment_on_challenge` (`p_post_id`) | |
| `comment_not_found` | comment RPCs | Gone, deleted, or by someone blocked. |
| `poll_exists` | `create_challenge_poll` | One poll per template per event. |
| `submission_not_found` | `confirm_challenge_result` | |
| `correction_open` | `confirm_challenge_result` | A correction pauses confirmation. |
| `rematch_not_available` | `run_it_back_challenge` | The event isn't complete. |
| `organizer_not_allowed` | `propose_challenge_organizer` | A competitor, unknown, or a block with a captain. |
| `rivalry_not_found` | `rivalry_view`, `rivalry_meetings` | |
| `poster_not_allowed` | `challenge_poster` | Not a public event and you don't compete in it. |

Reused: `not_authenticated`, `idempotency_key_required`, `idempotency_key_reused`, `invalid_argument`
(detail says which: `title`, `scoring`, `format`, `target`, `unit`, `course_note`, `open`, `nothing
changed`, `side`, `kind`, `stats`, `threshold`, `template`, `closes_at`, `value`, `reaction`, …),
`sport_unknown`, `place_unknown`, `starts_at_invalid` (1 h to 90 days ahead), `expiry_invalid`,
`user_not_found`, `crew_not_found`, `not_crew_admin`, `message_invalid` (detail `0-140`, `1-280`,
`1-500`), `message_rate_limited` (detail `6` posts or `10` comments a minute), `poll_closed`,
`option_not_found`, `check_in_not_open` (detail = when it opens), `check_in_closed`,
`result_already_verified`, `proposal_superseded` (a replaced submission), `not_author`,
`subject_not_found`, `report_rate_limited`.

## Privacy and safety

- **Areas, not addresses.** A challenge's place is a public place (`places`: name, area, city); the
  course is a short line the challenger writes. No positions are stored or returned.
- **Visibility** (`authz.can_see_challenge_event`): competitors and approved organizers always; anyone
  else needs **no block with any competitor** and the audience: `public` (anyone signed in),
  `friends` (played with a competitor, or in a side's crew), `participants` (a side's crew only).
  Call-outs (`authz.can_see_call_out`): the challenger, the target person, members of the crews
  involved, and, for open call-outs, the audience; never across a block with the challenger.
- **Never listed:** who follows, predicts, backs, cheers or votes. Only counts, and your own rows.
  Prediction percentages show only from **5** predictions (`PREDICTION_MIN_COUNT`); below that,
  `prediction_*_pct` is null and only the count shows. "6 of your Crew back Chimdi" counts people in
  your crews (blocked people never counted).
- **Check-in** shows to the audience as a yes/no per side (`a_checked_in`); the times are on
  `challenge_competitors`, readable by the audience, but nothing about where.
- **Submitted results are NOT FINAL** and only competitors and organizers see them
  (`challenge_result_submissions` RLS); everyone else sees VERIFYING until it's final.
- **Blocks:** blocked authors' posts and comments are left out (RLS and RPCs); blocking someone ends
  pending call-outs between you (as withdrawn, so nobody is told). Report from every call-out, event,
  post and comment: `report('call_out' | 'challenge_event' | 'challenge_post' | 'challenge_comment', id,
  reason, note)`. Block: `block_user` from the header menu or a comment's author. Rivalry's header menu:
  `report('rivalry', rivalry_id, …)` (anyone who can see one of its events) and `block_user(a/b id)`.
- **No gambling adjacency:** see rule 7. Poll questions and options are written by the server from an
  allowlist; nobody can write a wagering or humiliating poll.
- **Spectators never affect the result:** predictions, backing, polls and cheers are stored apart and
  never read by verification.

## Model

| Table | Visible to | Notes |
|---|---|---|
| `call_outs` | see above | `id`, `format` (`person_vs_person` / `crew_vs_crew`), `sport_id`, `title` ("5K", 1–24), `scoring` (`time` / `distance` / `score` / `rounds`), `target`*, `unit`* (`km`, `min`, `rounds`, `points`, `sets`, `goals`), `place_id`*, `course_note`* (≤ 140), `starts_at`, `time_zone`, `message`* (≤ 140), `audience` (`public` / `friends` / `participants`), `verification` (`participant_confirmation`; `device` is M10), `side_size` (1, or 2–11 for crews), `challenger_id`, `challenger_crew_id`*, `opponent_id`*, `opponent_crew_id`* (both null = open), `status` (stored; read `call_out_view().status` for the effective one), `expires_at`, `responded_at`*, `responded_by`*, `countered_from`*, `rematch_of_event_id`*, `rivalry_id`*, `event_id`* (once accepted). |
| `challenge_events` | audience | Rules copied from the call-out, plus `call_out_id` (unique), `rivalry_id`, `rematch_of_event_id`*, `a_user_id`*/`b_user_id`* (people) or `a_crew_id`*/`b_crew_id`* (crews), `a_captain_id`, `b_captain_id`, `accepted_at`, `check_in_opens_at` (start − 60 min), `status` (`scheduled` / `live` / `verifying` / `disputed` / `complete` / `cancelled`), `live_at`*, `ended_at`*, `completed_at`*, `cancelled_at`*, `cancel_reason`* (`called_off` / `no_show` / `no_result`), live `a_progress`*, `b_progress`*, `live_period`*, `progress_updated_at`*, `progress_logged_by`*, counts `follower_count`, `prediction_a`, `prediction_b`, `backing_a`, `backing_b`, `comment_count`, `reaction_counts` (`{"lets_go": 88, …}`). Prefer `challenge_event_view`. |
| `challenge_competitors` | audience | `event_id`, `user_id`, `side`, `is_captain`, `joined_at`, `checked_in_at`*, `ready_at`*. |
| `challenge_organizers` | audience | Approved when both sides' captains proposed them (`approved_at`). |
| `challenge_followers`, `challenge_predictions`, `challenge_backings`, `challenge_reactions`, `challenge_poll_votes`, `challenge_comment_respects` | Own rows | Counts are on the event / poll / comment. |
| `challenge_posts` | audience, minus blocked authors | `kind` (`system` / `statement` / `training` / `progress` / `logistics`), `author_id`* (null for Ojoro), `body`*, `stats`* (`{"distance_km", "time_seconds"}`), `milestone`* (system), `deleted_at`*. |
| `challenge_comments` | audience, minus blocked authors | `post_id`*, `parent_id`* (one level), `author_id`, `body`*, `respect_count`, `reply_count`, `deleted_at`*. |
| `challenge_polls` | audience | `template`, `question`, `options`, `vote_counts`, `threshold`*, `closes_at`. |
| `challenge_result_submissions`, `challenge_result_confirmations`, `challenge_corrections` | Competitors and organizers | NOT FINAL values and the checks. |
| `challenge_results` | audience | Insert-only: `a_value`, `b_value`, `winner_side`* (null = draw), `margin`, `source` (`participant_confirmation` / `organizer_review` / `unanswered_auto_confirmed`), `note`*, `predicted_a`, `predicted_b` (at lock), `crowd_called_it`*, `watched_count`, `verified_at`. |
| `rivalries` | When one of its events is visible | `kind` (`people` / `crews`), `low_id`, `high_id`. One per pair. The record is computed. |

## Stages

`challenge_stage` (what the app shows; `situation` comes with it, or `situationForStage`):

| Stage | When (computed) | Situation | Screen (`screenForStage`) | Hero |
|---|---|---|---|---|
| `accepted` | scheduled, accepted in the last 24 h, not today | forming | EventBuildup | CHIMDI / VS / MARCUS poster |
| `days` | scheduled, otherwise | forming | EventBuildup | Countdown leads (3 DAYS) |
| `today` | scheduled, the event's local date is today, or the start is ≤ 3 h away | confirmed | EventToday | TODAY. |
| `soon` | scheduled, from 30 min before the start (and after it, until someone starts it) | confirmed | EventToday | ALMOST TIME. (check-in open from 60 min) |
| `live` | both captains checked in and pressed I'M READY | live | EventLive | progress takes over |
| `verifying` | a result was submitted and isn't confirmed by both captains | after | Verifying | VERIFYING. |
| `disputed` | a correction was requested | after | Verifying | VERIFYING. (paused) |
| `complete` | both captains confirmed, the other side didn't answer within 48 h (auto-confirmed), or an organizer review settled it | after | Result | CHIMDI WINS. |
| `cancelled` | a captain called it off before LIVE, nobody started it within 3 h of the start (`no_show`), or LIVE for 24 h with no result (`no_result`) | calm | EventBuildup (CALLED OFF.) | |

Predictions lock when the stored status leaves `scheduled` **or** the start time passes
(`predictions_locked`). Backing stays open through LIVE.

Call-out status (`call_out_view().status`): `proposed` (PENDING) → `accepted` · `countered` ·
`declined` · `withdrawn` · `expired` (computed from `expires_at`: default the earlier of 72 h after
sending and 30 min before the start).

## Call-Outs

**`create_call_out(p_idempotency_key, p_sport_id, p_title, p_scoring, p_starts_at, p_opponent_id = null,
p_opponent_crew_id = null, p_challenger_crew_id = null, p_target = null, p_unit = null, p_place_id = null,
p_course_note = null, p_message = null, p_audience = 'public', p_side_size = null, p_expires_at = null)
→ call_out_state { call_out_id, status, created, expires_at, countered_from*, event_id* }`**
Person: `p_opponent_id`. Crew: `p_challenger_crew_id` (you're its owner/admin) + `p_opponent_crew_id`
(side size defaults to 5). Open: no opponent. Start 1 h–90 days ahead. Sends `call_out` to the person
(or the other crew's owner and admins). Errors: `sport_unknown`, `invalid_argument`,
`starts_at_invalid`, `place_unknown`, `expiry_invalid`, `message_invalid`, `call_out_not_allowed`,
`user_not_found`, `crew_not_found`, `not_crew_admin`, `call_out_rate_limited`, `call_out_pending`.

**`accept_call_out(p_call_out_id, p_idempotency_key, p_as_crew_id = null) → challenge_accept_state {
call_out_id, event_id, rivalry_id, created }`** ACCEPT (haptic Heavy). Creates the event (rule 3), the
rivalry if new, the competitors (captains), and the first milestone THE CHALLENGE IS SET. The
challenger gets `challenge_response`. `p_as_crew_id` only for an open crew call-out. Then open
`/event/{event_id}`. Errors: `call_out_not_found`, `call_out_closed`, `call_out_expired`,
`call_out_not_allowed`.

**`counter_call_out(p_call_out_id, p_idempotency_key, p_starts_at = null, p_title = null, p_target = null,
p_unit = null, p_place_id = null, p_course_note = null, p_message = null) → call_out_state`** COUNTER:
a new call-out from you back to the challenger with what changed (time, distance, course, title);
sides, format, scoring and audience stay. The original becomes `countered` and `call_out_view` of it
returns `counter_id`. The challenger gets a `call_out` ("Tester countered."). Open call-outs can't be
countered (`invalid_argument` `open`). Errors as accept, plus `invalid_argument` (`nothing changed`).

**`decline_call_out(p_call_out_id) → call_out_state`** PASS. Quiet: no notification; the challenger
sees DECLINED on their call-out. **`withdraw_call_out(p_call_out_id) → call_out_state`** The challenger
takes it back.

**`call_out_view(p_call_out_id) → 1 row`** `id`, `status`, `format`, `sport_id`, `sport_name`, `title`,
`scoring`, `target`*, `unit`*, `place_id`*, `place_name`*, `place_area`*, `place_city`*, `course_note`*,
`starts_at`, `time_zone`, `message`*, `audience`, `verification`, `side_size`, `is_open`,
`challenger_id`, `challenger_name`, `challenger_avatar_path`*, `challenger_crew_id`*, `opponent_id`*,
`opponent_name`*, `opponent_avatar_path`*, `opponent_crew_id`*, `is_mine`, `can_answer` (show ACCEPT /
COUNTER / PASS), `games_together`* ("12 games together"), `rivalry_id`*, `rivalry_challenger_wins`,
`rivalry_opponent_wins`, `rivalry_draws` ("rivalry 3–4", challenger first), `countered_from`*,
`counter_id`*, `rematch_of_event_id`* (REMATCH badge), `event_id`* (accepted: open it), `expires_at`,
`responded_at`*, `created_at` ("RECEIVED 2H AGO"), `server_now`.

**`my_call_outs(p_box = 'incoming' | 'outgoing' | 'all', p_limit = 20) → table(id, status, direction,
format, sport_id, title, starts_at, time_zone, place_name*, challenger_id, challenger_name,
opponent_name*, is_rematch, is_counter, event_id*, expires_at, created_at)`** Pending first, newest
first; answered ones for 7 days. Incoming = to you, or to a crew you own/admin.

## Event page

**`challenge_event_view(p_event_id) → 1 row`** Everything the hero, Countdown, PredictionBar,
CrowdSupport, LiveChallenge and RecapPoster need:

| Group | Columns |
|---|---|
| State | `id`, `call_out_id`, `stage`, `situation`, `status`, `server_now` (anchor the countdown and the live clock to it: `challengeCountdown`) |
| Rules | `format`, `sport_id`, `sport_name`, `title`, `scoring`, `target`*, `unit`*, `place_id`*, `place_name`*, `place_area`*, `place_city`*, `course_note`*, `starts_at`, `time_zone`, `check_in_opens_at`, `audience`, `verification`, `side_size`, `rivalry_id`, `rematch_of_event_id`* |
| Sides | `a_name`, `a_user_id`*, `a_crew_id`*, `a_avatar_path`*, `a_checked_in`, `a_ready`, `a_lineup_count`, and the same for `b_` |
| Times | `accepted_at`, `live_at`*, `ended_at`*, `completed_at`*, `cancelled_at`*, `cancel_reason`* |
| Live | `a_progress`*, `b_progress`*, `live_period`* ("round 2 of 3" with `target`), `progress_updated_at`* ("Updated 8 s ago"), `progress_logged_by_name`*, `progress_source`* (`participant` until M10) |
| Follow | `follower_count` ("142 following" / "212 watching"), `i_follow`, `follow_quiet`, `comments_muted` |
| WHO TAKES IT? | `prediction_count`, `prediction_a_pct`*, `prediction_b_pct`* (null under 5), `my_prediction`* (YOUR PICK), `predictions_locked` (LOCKED) |
| THE CROWD | `backing_a`, `backing_b`, `my_backing`* (BACKING), `backing_open`, `crew_backing_a`, `crew_backing_b` ("6 of your Crew back Chimdi") |
| Cheers, comments | `reaction_counts` (LET'S GO 88 …), `my_reaction`*, `comment_count` ("THE CROWD · 38") |
| You | `my_side`* (competitor, or a member of a side's crew), `is_competitor`, `is_captain`, `is_organizer`, `can_post`, `can_comment` |
| Rivalry | `rivalry_a_wins`, `rivalry_b_wins`, `rivalry_draws`, `rivalry_meetings` (including this event once complete) |
| Result (complete) | `result_a`*, `result_b`*, `winner_side`*, `is_draw`*, `margin`* ("43 seconds": `formatMargin`), `result_note`*, `result_source`*, `verified_at`*, `crowd_called_it`* (`crowdOutcome`), `crowd_pick_side`*, `crowd_pick_pct`* ("54% picked Marcus"), `watched_count` ("212 WATCHED") |
| Rematch | `pending_rematch_call_out_id`*, `rematch_event_id`* |

Error: `challenge_event_not_found`.

**`my_challenge_events(p_limit = 20) → table(event_id, stage, situation, relation ('competitor' |
'organizer' | 'crew' | 'following'), format, sport_id, title, starts_at, time_zone, place_name*, a_name,
b_name, my_side*, side_size, follower_count, scoring, target*, unit*, a_progress*, b_progress*,
live_period*, winner_side*)`** Compete · YOUR EVENTS: live first, then upcoming by start, then
finished/cancelled in the last 7 days. Row label: SAT / SUN / NOW from `starts_at` (NOW when live);
tag 3 DAYS / ACCEPTED / LIVE from `stage`; sub line "Build-up · 142 following", "Crew-vs-Crew · 5 a side",
"You follow · round 2 of 3".

**`follow_challenge_event(p_event_id, p_quiet = null, p_comments_muted = null) →
challenge_follow_state { event_id, following, quiet, comments_muted, follower_count }`** FOLLOW EVENT /
Following; also MUTE COMMENTS (`p_comments_muted => true`: hide The Crowd for you; state still shows)
and quiet follow (`p_quiet`: no notifications). **`unfollow_challenge_event(p_event_id)`**. At 100
followers: milestone 100 PEOPLE ARE FOLLOWING.

**`predict_challenge(p_event_id, p_side) → challenge_crowd_state { event_id, prediction_count,
prediction_a_pct*, prediction_b_pct*, my_prediction*, predictions_locked, backing_a, backing_b,
my_backing*, changed }`** One per person, change any time before the start; competitors may only pick
themselves. When the favourite flips with 20+ predictions: milestone THE CROWD IS CHANGING ITS MIND (at
most every 6 h). Errors: `predictions_locked`, `prediction_not_allowed`, `invalid_argument`.

**`back_challenge(p_event_id, p_side = null) → challenge_crowd_state`** BACK CHIMDI / BACKING. Leave
`p_side` out (or pass null) to stop backing. Open until verifying. Errors: `backing_closed`, `prediction_not_allowed`.

**`post_challenge_update(p_event_id, p_kind, p_body, p_idempotency_key, p_stats = null) →
challenge_posts`** Competitors and approved organizers (organizers: no `training`), until complete. Kinds
`statement`, `training`, `progress`, `logistics`; `p_stats` only for training/progress:
`{"distance_km": 5.2, "time_seconds": 1428}`. 1–280, 6 a minute. Errors: `not_competitor`,
`challenge_closed`, `invalid_argument`, `message_invalid`, `message_rate_limited`.
**`delete_challenge_post(p_post_id) → true`** Author (or a captain, for an organizer's post);
milestones stay. Errors: `post_not_found`, `not_author`.

**`challenge_feed(p_event_id, p_before = null, p_limit = 30) → table(id, kind, milestone*, author_id*,
author_name*, author_avatar_path*, author_role ('system' | 'competitor' | 'organizer'), author_side*,
body*, stats*, comment_count, is_mine, is_deleted, created_at)`** BUILD-UP feed, newest first. HypePost
variants: `system` → system ("UPDATE · 1H AGO" + body), competitor post → competitor (badge
"TRAINING · MARCUS" from `kind` + name), `stats` → evidence block (5.2 KM / 23:48), organizer →
supporter. Milestone keys and bodies: `set` THE CHALLENGE IS SET. · `week` ONE WEEK TO GO. · `tomorrow`
TOMORROW. · `today` TODAY. · `almost` ALMOST TIME. · `both_here` BOTH ARE HERE. · `crowd_shift` THE
CROWD IS CHANGING ITS MIND. · `followers_100` 100 PEOPLE ARE FOLLOWING. · `live` PREDICTIONS LOCKED.
THE CHALLENGE IS LIVE. · `result` CHIMDI WINS. / IT'S A DRAW. · `called_off` CALLED OFF.

**`comment_on_challenge(p_event_id, p_body, p_idempotency_key, p_parent_id = null, p_post_id = null) →
challenge_comments`** ADD TO THE CROWD ("Say something. Keep it friendly."). Anyone who can see the
event, until cancelled. Replies one level deep. 1–500, 10 a minute. Errors: `challenge_closed`,
`message_invalid`, `message_rate_limited`, `comment_not_found`, `post_not_found`, `invalid_argument`.
**`delete_challenge_comment(p_comment_id) → true`** Author, or a captain (moderation).
**`respect_challenge_comment(p_comment_id) → comment_respect_state { comment_id, respect_count,
respected }`** RESPECT / RESPECTED · 14 (toggle).

**`challenge_comments(p_event_id, p_before = null, p_limit = 20, p_post_id = null) → table(id,
parent_id*, post_id*, author_id, author_name, author_avatar_path*, author_badge* ('competitor' |
'organizer'), author_side*, body*, respect_count, respected, reply_count, is_mine, is_deleted,
created_at)`** A page of top-level comments, newest first, each followed by its replies (oldest
first). Pass the oldest top-level id as `p_before`. Comment: badge COMPETITOR, "3 REPLIES".

**`react_challenge(p_event_id, p_reaction) → challenge_reaction_state { event_id, reaction_counts,
my_reaction* }`** CHEER THEM ON (ReactionBar: `lets_go`, `respect`, `hold_that`). One word per person;
the same again takes it back.

**`create_challenge_poll(p_event_id, p_template, p_threshold = null, p_closes_at = null) →
challenge_polls`** Competitors/organizers, before predictions lock. Templates: `winner` (Who wins?),
`margin` (How close will it be?), `performance` (Anyone under 23 minutes? needs `p_threshold`: seconds,
km or points), `first_score` (score only), `rematch` (Does the loser ask for a rematch?). Closes at the
start by default. Errors: `not_competitor`, `challenge_started`, `invalid_argument`, `poll_exists`.
**`vote_challenge_poll(p_poll_id, p_option) → challenge_poll_state { poll_id, vote_counts,
total_votes, my_vote, closes_at }`** Change allowed until it closes. Errors: `poll_closed`,
`option_not_found`. **`challenge_polls(p_event_id) → table(id, template, question, options,
vote_counts, total_votes, my_vote*, closes_at, is_closed)`** Poll: open / voted / closed, "Closes Sat
9:00", "0 votes".

**`propose_challenge_organizer(p_event_id, p_user_id) → approved bool`** A captain proposes; the
other side's captain proposing the same person approves. **`remove_challenge_organizer(p_event_id,
p_user_id) → true`**. **`join_challenge_lineup(p_event_id) → side count`** /
**`leave_challenge_lineup(p_event_id)`** Crew vs crew: members of a side's crew, before LIVE, up to
`side_size` (`lineup_full`). Joining drops a prediction or backing for the other side.

## Event day and live

**`check_in_challenge(p_event_id) → challenge_presence_state { event_id, stage, my_checked_in_at*,
my_ready_at*, a_checked_in, b_checked_in, a_ready, b_ready, live_at* }`** Competitors, from
`check_in_opens_at` (start − 60 min) until 3 h after the start. Idempotent. When both captains are in:
milestone BOTH ARE HERE (haptic Medium on the client). Errors: `not_competitor`, `check_in_not_open`
(detail = opening time), `check_in_closed`, `challenge_closed`.

**`ready_challenge(p_event_id) → challenge_presence_state`** I'M READY ("The race goes live when you
both press start"): a checked-in captain. When both captains are ready, the event goes **LIVE**:
predictions lock, milestone `live`, followers get `challenge_milestone`. Errors: `not_competitor`,
`not_checked_in`, `check_in_not_open`, `challenge_closed`.

**`log_challenge_progress(p_event_id, p_a_value = null, p_b_value = null, p_period = null) →
challenge_progress_state { event_id, a_progress*, b_progress*, live_period*, progress_updated_at*,
changed }`** LiveChallenge lanes: any competitor, while LIVE. Freshness line: "Updated 8 s ago ·
logged by Chimdi" from `progress_updated_at` + `server_now` (use Step 4's `liveFreshnessSeconds` with
`last_update_at = progress_updated_at`); the clock is `liveClockSeconds` with `live_at`. Errors:
`not_competitor`, `challenge_not_live`, `invalid_argument`.

## Result and verification

Verification is **participant confirmation** until device data (M10): both captains must confirm the
same numbers. Nobody is called the winner before that.

**Unanswered results stand after 48 hours** (`RESULT_AUTO_CONFIRM_HOURS`, one constant in
`private.result_auto_confirm_hours()`): if the other captain neither confirms nor requests a correction
within 48 h of the submission, the minute job finalises the submitted numbers with `result_source =
'unanswered_auto_confirmed'`, posts the milestone `auto_confirmed` ("NO ANSWER IN 48 HOURS. THE RESULT
STANDS.") and the result, and notifies both sides and the followers (`challenge_milestone`, `result`).
An open correction (`disputed`) never auto-finalises. A new submission restarts the 48 h. Result: show
the source in words ("Confirmed after 48 hours without an answer").

**`submit_challenge_result(p_event_id, p_a_value, p_b_value, p_idempotency_key, p_note = null) →
challenge_result_state { event_id, submission_id*, stage, a_value*, b_value*, confirmed_count,
needed_count (2), i_confirmed, verified, winner_side* }`** A captain, once LIVE (also from VERIFYING /
DISPUTED: a new submission replaces the pending one and closes an open correction). The submitter's
confirmation is recorded; the other captain gets `challenge_to_confirm`. The same numbers sent by the
other captain count as their confirmation. `p_note` is the recap line ("Out hard, held it through the
last climb on Camillien-Houde."). Errors: `not_competitor`, `challenge_not_live`,
`result_already_verified`, `invalid_argument`, `message_invalid`.

**`confirm_challenge_result(p_submission_id, p_idempotency_key) → challenge_result_state`** CONFIRM
BOTH TIMES. When both captains have confirmed: COMPLETE (insert-only `challenge_results`, milestone
`result`, followers notified, haptic Success on the client). Errors: `submission_not_found`,
`not_competitor`, `proposal_superseded`, `correction_open`.

**`request_challenge_correction(p_event_id, p_note = null) → challenge_result_state`** REQUEST A
CORRECTION ("A correction pauses the result. An organizer reviews it within 24 hours."): stage
`disputed`. Ends by a new submission (then confirm), **`withdraw_challenge_correction(p_event_id)`**
(the requester), or an organizer review (`private.resolve_challenge_dispute`, service role only; no
staff tooling yet). While it's open the 48 h auto-confirm doesn't run. Errors: `not_competitor`, `result_already_verified`, `challenge_not_live`.

**`challenge_verification(p_event_id) → 1 row`** Verifying: `event_id`, `stage`, `submission_id`*,
`a_value`*, `b_value`* (SUBMITTED · NOT FINAL), `submitted_by`*, `submitted_by_name`*, `submitted_at`*,
`note`*, `checks` (jsonb `VerificationCheck[]`: one confirmation row per captain, yours last: "Marcus
confirmed both times · DONE", "Your confirmation · WAITING"), `confirmed_count`, `needed_count`,
`i_need_to_confirm` (show CONFIRM BOTH TIMES), `correction_open`, `correction_requested_by_name`*,
`correction_note`*, `correction_requested_at`*, `review_due_at`*, `auto_confirms_at`* (when the pending
numbers stand if nobody answers: "Final at Sat 9:23 unless you confirm or ask for a correction"; null
while a correction is open), `correction_requested_by_me` (you opened the open correction: show
WITHDRAW THE CORRECTION; false otherwise, including when none is open). Competitors and organizers only
(`not_competitor`). There is no device check row until M10 (the design's "GPS data received" row isn't
returned).

**`cancel_challenge_event(p_event_id) → 'cancelled'`** A captain, before LIVE. Errors:
`not_competitor`, `challenge_started`.

## Rivalries and rematch

**`rivalry_view(p_rivalry_id) → 1 row`** `rivalry_id`, `kind`, `a_id`, `a_name`, `b_id`, `b_name`
(**you are `a`** when you're in it), `i_am_in`, `meetings`, `a_wins`, `b_wins`, `draws`, `form`
(last 8, oldest first, `'a' | 'b' | 'd'`: `formCells(form, a_name, b_name)`), `streak_side`*,
`streak_length`, `last_event_id`*, `last_winner`* ("LAST TIME · CHIMDI BY 43S" with `last_margin`,
`last_scoring`, `last_unit`, `last_title`), `next_event_id`*, `next_title`*, `next_starts_at`*,
`next_time_zone`*, `next_stage`* ("NEXT · 5K · Sat 12 Oct"), `rematch_call_out_id`*, `rematch_from`*
('a' | 'b'), `rematch_from_name`*, `rematch_message`* ("Same loop, two weeks. Best of three?"),
`rematch_title`*, `rematch_starts_at`*, `rematch_can_answer`, `rematch_of_event_id`* (the event the
pending rematch follows). **The caller is always side `a`** when they're in the rivalry (as the person,
or a member of the crew); spectators get the lower id as `a`. Error: `rivalry_not_found`.

**`rivalry_meetings(p_rivalry_id, p_limit = 20) → table(event_id, starts_at, time_zone, title,
sport_id, place_name*, scoring, unit*, a_value, b_value, winner ('a' | 'b' | 'd'), margin, source,
verified_at)`** RECENT MEETINGS, newest first ("12.10 · 5K · Mount Royal loop · 22:48 vs 23:31 ·
participant confirmed · CHIMDI").

**`my_rivalries(p_limit = 10) → table(rivalry_id, kind, a_name, b_name, meetings, a_wins, b_wins,
draws, form, next_event_id*, next_title*, next_starts_at*, next_time_zone*, last_active_at*,
opponent_user_id*, opponent_crew_id*)`** Compete · RIVALRIES (yours and your crews'), most recently
active first. **You are always side `a`**; the opponent is `b`: `opponent_user_id` for a person rivalry
(null for crews), `opponent_crew_id` for a crew rivalry (null for people).

**`run_it_back_challenge(p_event_id, p_idempotency_key, p_starts_at = null, p_message = null) →
rematch_state { call_out_id, event_id*, created, accepted }`** RUN IT BACK on Result and Rivalry
(captains of a complete event). If the other side already asked → accepts it (`accepted: true`,
`event_id` = the new linked event). If you already asked → returns that call-out. Otherwise sends a
**new call-out marked REMATCH** (`rematch_of_event_id`, same rivalry, same rules, two weeks on at the
same time unless `p_starts_at`). NOT YET = `decline_call_out(rematch_call_out_id)`. The finished
event and its result never change. Errors: `challenge_event_not_found`, `not_competitor`,
`rematch_not_available`, plus `create_call_out`'s.

## Poster

**`challenge_poster(p_event_id) → 1 row(event_id, kind ('accepted' | 'result'), a_name, b_name, title,
sport_name, starts_at, time_zone, place_name*, place_city*, winner_side*, is_draw*, a_value*, b_value*,
scoring, unit*, link_path, target*)`** The 540×675 share image (render it client-side): OJORO · CALL-OUT
ACCEPTED, names, title ("5K"; `target`/`unit` = 5 km), "Sat 12 Oct · 9:00", "Mount Royal loop, Montréal", "WHO TAKES IT? FOLLOW,
PREDICT AND BACK ON OJORO"; after verification the result. Only for `public` events (or your own);
never counts, avatars, or anything beyond the public place and city. `link_path` = `/event/{id}`.
Errors: `poster_not_allowed`, `challenge_closed`.

## Notifications

New `notification_type`s (Step 4's `my_notifications`, `groupNotifications`, bundling and would-send
rules apply; `notification_object` adds `challenge_event`; `'challenge'` is a call-out):

| Type | When | To | Link | Needs you while | Action |
|---|---|---|---|---|---|
| `call_out` | A call-out is sent (also a counter: `data.counter`, a rematch: `data.rematch`) | The person, or the crew's owner and admins | `/challenge/{id}` | pending and you can answer | `reply` (opens CallOut) |
| `challenge_response` | Your call-out was accepted | The challenger | `/event/{id}` | never | `open` |
| `challenge_posts` | A competitor/organizer post or a milestone (bundled per event, `data.system` for Ojoro's) | Competitors and followers (not quiet), not the author | `/event/{id}` | never | `open` |
| `challenge_milestone` | `data.milestone`: `today` (event-day reminder), `live`, `result`, `called_off` | Competitors and followers (not quiet) | `/event/{id}` | never | `open` |
| `challenge_to_confirm` | A result was submitted | The other captain | `/event/{id}` | the submission is pending and you haven't confirmed | `confirm_challenge` (open; CONFIRM is on Verifying) |

Words, e.g. "Marcus T called you out." / "5K · Mount Royal loop · Sat 9:00"; "3 new posts in Marcus T vs
Chimdi O" / "Marcus T, Ade B and an Ojoro update · bundled"; "Chimdi O wins." / "5K · 22:48 – 23:31".
A pass is never notified. `challenge_posts` pushes are throttled like other threshold types. Mute an
event with `mute_object('challenge_event', id)`.

## Realtime

`postgres_changes`, filtered by RLS. Realtime is a hint: on `SUBSCRIBED` and on foreground, refetch.

| Screen | Descriptor (channel) | Table · event · filter | Do |
|---|---|---|---|
| Event pages (Buildup, Today, Live, Verifying, Result) | `challengeEventSubscription(eventId)` (`challenge:{id}`) | `challenge_events` · UPDATE · `id=eq.{id}`; `challenge_competitors` · *; `challenge_posts` · INSERT/UPDATE; `challenge_comments` · INSERT/UPDATE; `challenge_polls` · *; `challenge_result_submissions` · * (competitors only) — all `event_id=eq.{id}` | Event UPDATE: refetch `challenge_event_view` (stage, counts, progress). Competitors: check-ins. Posts/comments/polls: refetch the list. Submissions: refetch `challenge_verification`. |
| CallOut | `callOutSubscription(callOutId)` (`call-out:{id}`) | `call_outs` · UPDATE · `id=eq.{id}` | Status changed (accepted → open the event; countered → open `counter_id`). |
| Compete | `callOutsSubscription(me)` (`call-outs:{me}`) + Step 4 `notificationsSubscription(me)` | `call_outs` · * · `opponent_id=eq.{me}` and `challenger_id=eq.{me}` | Refetch `my_call_outs`, `my_challenge_events`. |
| Rivalry (and Compete's rivalry block) | `rivalrySubscription(rivalryId)` (`rivalry:{id}`) | `call_outs` · * and `challenge_events` · * · `rivalry_id=eq.{id}` | A rematch asked/answered or an event's stage changed (a result changes the record): refetch `rivalry_view`, `rivalry_meetings`. |

Published tables added: `call_outs`, `challenge_events`, `challenge_competitors`, `challenge_posts`,
`challenge_comments`, `challenge_polls`, `challenge_result_submissions`. Predictions, backing,
followers, reactions and votes aren't published (counts arrive on `challenge_events` and
`challenge_polls`).

## Analytics

Server events in `private.analytics_events` (facts only, never words): `callout_sent` (format, sport,
scoring, open, counter, rematch), `callout_accepted`, `callout_countered`, `callout_declined`,
`challenge_event_created`, `challenge_event_followed` (quiet), `prediction_cast`, `prediction_changed`
(side, competitor), `backing_selected` (side, changed), `challenge_post_created` (kind, role,
has_stats), `challenge_comment_created` (reply, on_post, competitor), `challenge_poll_voted`
(template), `challenge_lineup_joined` (was_following: spectator → participant), `challenge_checked_in`,
`challenge_live` (predictions, followers), `challenge_progress_logged`, `challenge_result_submitted`,
`challenge_correction_requested`, `challenge_result_verified` (source, draw, crowd_called_it,
minutes_to_verify), `challenge_rematch_requested`, `challenge_rematch_accepted`, `challenge_cancelled`.
The client sends taps only (names in `@ojoro/analytics`): `screen_viewed`, `cta_tapped` (Call-Out taps:
`call_out_accept`, `call_out_counter`, `call_out_pass`, `call_out_withdraw`, `call_out_send`),
`challenge_shared` (poster), `challenge_live_viewed`, `prediction_made{side}` (PredictionBar),
`crowd_backed{side}` (CrowdSupport), `rematch_requested` / `rematch_accepted` (Rematch), never a copy
of the server events.

## Screens

| Screen | Route | Reads | Writes | Sub |
|---|---|---|---|---|
| **Compete** | `/(tabs)/compete` | INCOMING CALL-OUT: `my_call_outs('incoming')` first pending row (+ `call_out_view` for the line "5K · Mount Royal loop · Sat 12 Oct, 9:00", "2H AGO" from `created_at`), REPLY → `/challenge/{id}`. YOUR EVENTS: `my_challenge_events()`. RIVALRIES: `my_rivalries()` (Rivalry component: record, `formCells`, NEXT), OPEN RIVALRY → `/rivalry/{id}`. Ladders & seasons: not built (empty state). | none | `call-outs:{me}`, `notifications:{me}` |
| **CallOut** | `/challenge/[id]` | `call_out_view(id)`: CallOutPoster (challenger vs opponent, PENDING / ACCEPTED / COUNTERED / DECLINED from `status`), title + `starts_at`, the line (`message`, "Marcus T · 12 games together · rivalry 3–4"), THE RULES: FORMAT (`format` + `sport_name`), COURSE (`course_note` or `place_name`), START, VERIFIED BY (`verification`: "Both of you confirm"), AUDIENCE (`audience`), STAKES "None. Bragging rights only." | `accept_call_out` (then `/event/{event_id}`), `counter_call_out` (sheet: time, distance, course), `decline_call_out` (PASS), `withdraw_call_out` (yours); header menu `report('call_out')`, `block_user(challenger_id)` | `call-out:{id}` |
| **EventBuildup** | `/event/[id]` (stage `accepted` / `days`) | `challenge_event_view` (hero, countdown via `challengeCountdown`, BUILD-UP badge, "142 following", PredictionBar, CrowdSupport + "6 of your Crew back Chimdi. Backing never affects the result.", "Social only: no money, no points, no odds."), `challenge_polls`, `challenge_feed`, `challenge_comments` | `follow_challenge_event` / `unfollow_challenge_event`, MUTE COMMENTS (`follow_challenge_event(p_comments_muted => true)`), `predict_challenge`, `back_challenge`, `vote_challenge_poll`, `comment_on_challenge`, `respect_challenge_comment`, competitors: `post_challenge_update`, `create_challenge_poll`; POSTER → Poster; `report('challenge_event' | 'challenge_post' | 'challenge_comment')`, `block_user` | `challenge:{id}` |
| **Poster** | share image | `challenge_poster(id)` | none (client renders and shares) | none |
| **EventToday** | `/event/[id]` (stage `today` / `soon`) | `challenge_event_view` (TODAY. / ALMOST TIME., "CHECK-IN OPEN" when `server_now ≥ check_in_opens_at`, PredictionBar "212 predictions. They lock the moment the race goes live."), check-in rows: `challenge_competitors` (+ names from the view), latest milestone from `challenge_feed` (BOTH ARE HERE.) | competitors: `check_in_challenge`, `ready_challenge` (I'M READY) | `challenge:{id}` |
| **EventLive** | `/event/[id]` (stage `live`) | `challenge_event_view` (LiveChallenge lanes: `a_progress`/`b_progress` of `target` `unit`, `a_checked_in`, clock from `live_at`, "212 watching" = `follower_count`, freshness + "participant logged"), LOCKED PREDICTIONS (`prediction_*_pct`, `my_prediction`), `challenge_comments` | `react_challenge` (CHEER THEM ON), `comment_on_challenge`, `respect_challenge_comment`; competitors: `log_challenge_progress`, `submit_challenge_result` (FINISH) | `challenge:{id}` |
| **Verifying** | `/event/[id]` (stage `verifying` / `disputed`) | `challenge_verification(id)` (competitors/organizers); spectators: `challenge_event_view` only ("Verifying. Nobody is called the winner until it's done.") | `confirm_challenge_result` (CONFIRM BOTH TIMES), `request_challenge_correction`, `withdraw_challenge_correction`, `submit_challenge_result` (corrected numbers) | `challenge:{id}` |
| **Result** | `/event/[id]` (stage `complete`) | `challenge_event_view` (RecapPoster: winner, `result_a`/`result_b`, `watched_count`, `result_note` + `formatMargin(margin)`, VERIFIED + `result_source`; PREDICTIONS: `crowdOutcome(crowd_called_it)` "THE CROWD GOT IT WRONG." / "54% picked Marcus. You called it." from `crowd_pick_*` and `my_prediction`; rivalry row from `rivalry_a_wins`…/`rivalry_meetings` with UPDATED), `challenge_poster` (SHARE RECAP) | `run_it_back_challenge` (RUN IT BACK) | `challenge:{id}` |
| **Rivalry** | `/rivalry/[id]` (sub `rivalry:{id}`) | `rivalry_view(id)`, `rivalry_meetings(id)` (RECENT MEETINGS: date, title · place, values or "Marcus by 1:02", source "participant confirmed", winner tag or DRAW); Rematch block from `rematch_*` and `last_*` | RUN IT BACK = `run_it_back_challenge(last_event_id)` (accepts their rematch, or asks for one); NOT YET = `decline_call_out(rematch_call_out_id)`; "See the Call-Out flow" → `/challenge/{rematch_call_out_id}`; header menu report/block | none |

Every screen has the standard states (skeleton after 300 ms, empty, offline with last-known values and
how old, errors by code).

## Local data

`supabase/seed_competition.sql` (fourth in `[db.seed] sql_paths`; safe to re-run on the running stack
to refresh the time-relative parts:
`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_competition.sql`).
See the ids and what each one shows at the top of that file and in the table below. Sign in as Chimdi
(+1 555 555 0100). It adds 220 "crowd" accounts (no sign-in) so the counts in the designs are real
rows.

| Screen | Id |
|---|---|
| Compete | (tab) |
| CallOut (Marcus called you out, pending) | call-out `d1000000-0000-4000-8000-000000000001` |
| EventBuildup (`days`) · Poster | event `d2000000-0000-4000-8000-000000000001` |
| Crew vs crew (`accepted`) | event `d2000000-0000-4000-8000-000000000002` |
| Ife vs Sam sparring (`live`, you follow) | event `d2000000-0000-4000-8000-000000000003` |
| EventToday (`soon`, both checked in) | event `d2000000-0000-4000-8000-000000000004` |
| EventLive (`live`) | event `d2000000-0000-4000-8000-000000000005` |
| Verifying (`verifying`, your confirmation waiting) | event `d2000000-0000-4000-8000-000000000006` |
| Result (`complete`, Chimdi wins) | event `d2000000-0000-4000-8000-000000000007` |
| Rivalry Chimdi–Marcus (9 meetings, 5–3, pending rematch from Marcus) | rivalry `d0000000-0000-4000-8000-000000000001`, rematch call-out `d1000000-0000-4000-8000-000000000008` |

## Not built

Device/GPS verification and "watch connected" (M10), organizer review tooling (only the service-role
function), ladders, seasons, Ojoro Clash and best-of series (PRD §9.15; rematches link through the
rivalry), Clan-vs-Clan, cooperative, relay, handicap and other formats (person vs person and crew vs
crew only), challenge template safety allowlist beyond the scoring kinds, reply and mention
notifications for comments, comment pinning, media in posts, Challenge Events on Home (`home_feed`),
Passport entries and personal bests for challenges (M8), external web share pages.
