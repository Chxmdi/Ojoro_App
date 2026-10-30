# Step 6: Host OS operations backend contract

The data layer for **HostMembership** (passes, memberships, payouts, refund decisions), the roster's
**per-person payment status**, **HostSeason** (league / season operations) and **HostInsights**
(insights, revenue ledger, CSV export). PRD §13, §16.2, §17. It builds on
[`HOSTS_CONTRACT.md`](HOSTS_CONTRACT.md) (programs, series, sessions, members) and every rule in
[`SLICE01_CONTRACT.md`](SLICE01_CONTRACT.md) (write only through RPCs, map errors by code, idempotency
keys). Judgment calls: `docs/DESIGN_DECISIONS.md` ("Step 6 BE-HOST-OPS").

> **No money moves.** The payments provider isn't chosen (owner decision pending; real money is Step 8).
> Passes, charges, refunds and payouts are records with statuses. Every money row has
> `provider = 'none'` (a check constraint allows nothing else), reads return `provider: 'none'` and
> `payments_connected: false`, and nothing calls out of the database.
>
> **The Ojoro service fee is a PLACEHOLDER.** Its rate lives in exactly one place:
> `public.host_service_fee_policy()` (8% of the payout week's gross charges, rounded to the nearest whole
> currency unit), used by `private.host_service_fee_cents()`. The app never computes a fee; it shows
> `fee_cents` from the reads and may say it's a placeholder (`fee_policy.placeholder`).

- Schema: `supabase/migrations/20261030210000_host_ops_schema.sql`, `…210100_host_ops_money.sql`,
  `…210200_host_ops_league.sql`, `…210300_host_ops_insights.sql`, `…210400_host_ops_cascade.sql`.
- Client helpers: `packages/contracts/src/hostsOps.ts` (exported from `@ojoro/contracts`):
  `hostOpsRpcs`, `hostOpsIdempotentRpcs` (also in `idempotentRpcs`), `hostOpsErrorCodes` (also in
  `ojoroErrorCodes`), types for every jsonb read (`HostMoneyView`, `HostDecisionState`,
  `HostLeagueView`, `HostInsights`, …), row types `HostSessionPayment`, `HostPeoplePass`,
  `HostProgramLeague`, `HostStanding`, words (`formatMoney`, `moneyLineLabel`, `payoutSourceSentence`,
  `pastPayoutMeta`, `passPriceLabel`, `passCountLabel`, `decisionSentence`, `percent`, `pointsChange`,
  `relativeChange`, `fillTimeLabel`, `fillTimeChange`, `goalDifferenceLabel`, `fixtureReadiness`,
  `insightsCsvFileName`), realtime descriptors `hostMoneySubscription`, `hostLeagueSubscription`, and
  `HOST_PAYMENTS_PROVIDER`, `HOST_REFUND_UNDO_MINUTES` (10), `HOST_INSIGHTS_DAYS` (30),
  `HOST_INSIGHTS_WEEKS` (12), `HOST_REFUND_NOTE_MAX_LENGTH` (280).
- Tests: `supabase/tests/28_host_money.sql`, `29_host_league.sql`, `30_host_insights.sql`;
  `packages/contracts/src/hostsOps.test.ts`.

Contents: [Rules](#rules) · [Errors](#errors) · [Model](#model) · [HostMembership](#hostmembership) ·
[Payment status (HostRoster, HostPeople)](#payment-status-hostroster-hostpeople) ·
[Refunds](#refunds) · [Payouts](#payouts) · [HostSeason](#hostseason) · [HostInsights](#hostinsights) ·
[Seams filled for BE-HOST-CORE](#seams-filled-for-be-host-core) · [Notifications](#notifications) ·
[Realtime](#realtime) · [Analytics](#analytics) · [Local data](#local-data) · [Not built](#not-built)

---

## Rules

1. **Write only through the RPCs below.** Every new table is readable through RLS as listed in
   [Model](#model); clients have no INSERT/UPDATE/DELETE.
2. **Idempotent with a key** (`p_idempotency_key`, one uuid per intention, reused on retry):
   `create_host_pass`, `grant_host_pass`, `mark_paid_at_field`, `decide_host_refund`,
   `request_host_refund`, `cancel_host_membership`, `create_host_league`,
   `generate_host_league_fixtures`, `schedule_host_league_fixture`, `submit_league_result`,
   `confirm_league_result`, `ask_league_referee`. **Set-to-state, safe to repeat:** `update_host_pass`,
   `archive_host_pass`, `undo_host_refund_decision`, `upsert_host_league_team`, `set_host_league_member`,
   `reschedule_host_league_fixture`, `dispute_league_result`, `respond_league_referee`,
   `clear_league_referee`, `set_league_fixture_in`, `check_in_league_fixture`.
   `mark_paid_at_field` is also naturally idempotent (one drop-in charge per person per session).
3. **Authorization is server-side** (PRD §17). Every host RPC and read checks the caller is an owner or
   co-host of the program (`not_program_host`). People can only read their own charges, refunds,
   requests and memberships. Refund decisions, marking paid and confirming results are host-only.
4. **Money is integer cents + an ISO currency** (`CAD` in the seed). Display with `formatMoney` (true
   minus sign, whole units drop the cents). Counts use tabular numerals.
5. **Results are never rewritten.** `host_league_results` is insert-only (UPDATE/DELETE raise
   `result_already_verified`); standings are computed from it on every read. The audit trail
   `host_ops_audit` is insert-only too (`audit_immutable`). Both go only when their whole program /
   league is deleted.
6. **Status is never colour-only.** Every status comes with words: payment `label`s
   (`MEMBER`, `PAID $8`, `$8 AT FIELD`…), result `status` (`agreed`, `differ`…), payout `status`.

## Errors

New codes (words in `apps/mobile/src/lib/errorMessages.ts`):

| Code | Meaning | `detail` |
|---|---|---|
| `pass_not_found` | Unknown pass. | |
| `pass_invalid` | Name 1–40, description ≤ 120; a pack has 2–100 sessions and ≤ 730 days; drop-ins can't be granted. | `name` / `sessions` / `kind` |
| `price_invalid` | Free = 0; others 1–100000 cents. | |
| `already_member` | `grant_host_pass` of a monthly pass to someone with an active monthly membership. | |
| `charge_not_found` | Unknown charge, or not yours. | |
| `refund_not_allowed` | The charge isn't paid, or is fully refunded. | |
| `membership_not_found` | Unknown membership, or not yours. | |
| `refund_request_not_found` | Unknown refund request. | |
| `refund_already_decided` | Decided another way already (UNDO first). | Current status |
| `refund_amount_invalid` | Partial must be 1 .. refundable − 1. | Refundable cents |
| `refund_undo_closed` | Over 10 minutes, or the provider already answered. | |
| `audit_immutable` | (Trigger, not reachable from the app.) The audit trail can't be changed. | |
| `league_not_found` | Unknown league, or you can't see it. | |
| `league_invalid` | Bad league settings, fixtures already generated, fewer than 2 teams, bad slot. | The part |
| `team_not_found` | Unknown team in this league. | |
| `fixture_not_found` | Unknown fixture (or you aren't the asked referee). | |
| `fixture_closed` | The fixture has a confirmed result or is cancelled. | |
| `fixture_not_played` | No score before kick-off. | |
| `not_on_team` | IN / check-in by someone not on either team. | |
| `not_captain` | Only the two captains send a score. | |
| `result_not_agreed` | CONFIRM RESULT without a score while the captains haven't sent the same one. | `waiting` / `one_sent` / `differ` / `disputed` |
| `referee_unavailable` | Not marked as a referee, on a team in the fixture, or busy within 75 minutes. | |

Also used: `program_not_found`, `not_program_host`, `session_not_found` (BE-HOST-CORE),
`invalid_argument` (detail = argument), `user_not_found`, `sport_unknown`, `not_attending`,
`message_invalid` (`0-280`), `check_in_not_open`, `result_already_verified`.

## Model

| Table | Visible to | Notes |
|---|---|---|
| `host_passes` | Signed in (active passes); hosts (all) | `kind`: `drop_in`, `pack`, `monthly`, `free`. `price_cents`, `currency`, `sessions_included` (pack), `valid_days` (pack), `series_id` (free: the series it lets people into). |
| `host_memberships` | Self, hosts | A person holding a `pack`, `monthly` or `free` pass. `status`: `active` → `cancelled` (won't renew, still valid to `period_ends_at`) → `ended`. Monthly memberships keep `host_program_members` in step (`source = 'pass'`). |
| `host_pass_uses` | Self, hosts | One pack session used at one session (recorded automatically at check-in when nothing else covers the person). |
| `host_charges` | Self, hosts | `kind`: `drop_in` (has `session_id`), `pack`, `monthly`, `monthly_renewal`. `status`: `due`, `paid`, `failed`, `void`. `method`: `app`, `at_field`, `host_recorded`. `provider = 'none'`. |
| `host_refunds` | Self, hosts | `reason`: `spot_filled`, `host_decision`, `session_cancelled`. `status`: `pending` (recorded; no provider), `succeeded`, `failed`, `cancelled` (undone). Pending and succeeded refunds come off the payout. |
| `host_refund_requests` | Self, hosts | `status`: `open`, `refunded_full`, `refunded_partial`, `kept`, `withdrawn`; `decision`: `full`, `partial`, `keep`. |
| `host_payouts` | Hosts | Closed weeks, frozen totals (`gross_cents`, `refunds_cents`, `fee_cents`, `net_cents`, `lines`, `session_count`, `pass_count`, `refund_count`, `note`). `status`: `scheduled` (waits for a provider), `paid`, `failed`. |
| `host_ops_audit` | Hosts | Insert-only: `action` (`pass_created`, `pass_updated`, `pass_archived`, `pass_granted`, `charge_marked_paid`, `refund_requested`, `refund_decided`, `refund_decision_undone`, `refund_auto`, `membership_cancelled`, `payout_closed`, `league_created`, `fixtures_generated`, `fixture_rescheduled`, `result_confirmed`, `result_disputed`, `referee_asked`, `referee_accepted`, `referee_declined`, `referee_cleared`), `actor_id` (null = Ojoro), `amount_cents`, `detail`. |
| `host_leagues` | Signed in unless `draft`; hosts | `rounds_total`, `meetings` (2 = everyone plays everyone twice), `points_win` 3, `points_draw` 1, `min_players` 7, `venue_label`. |
| `host_league_teams`, `host_league_rounds`, `host_league_fixtures`, `host_league_results` | Like the league (public season page) | Fixtures: `kicks_off_at`, `pitch`, `status` (`scheduled`, `postponed`, `played`, `cancelled`), `rescheduled_from`, `referee_id` + `referee_status` (`asked`, `accepted`, `declined`). |
| `host_league_members` | Self, teammates, hosts | Players (`team_id`) and free agents (`team_id` null); `can_referee`. |
| `host_league_fixture_players` | Self, hosts | Who's IN for a fixture (`in_at`) and checked in at the pitch (`checked_in_at`). Counts are in `host_league_view`. |
| `host_league_result_submissions` | The submitter, hosts | Captains' scores; `superseded_at` set by a newer one or a dispute. |
| `host_league_disputes` | The raiser, hosts | One open per fixture. |

## HostMembership

**`host_money_view(p_program_id) → HostMoneyView`** (hosts):

- `next_payout`: the current payout week (Friday 00:00 → next Friday 00:00, program time zone),
  computed live: `lines` (grouped by charge kind and unit price: "Drop-ins · 22 × $8"), `refunds_cents`,
  `fee_cents` (PLACEHOLDER), `net_cents` (YOU GET = gross − refunds − fee), `session_count`,
  `pass_count` ("From 4 sessions and 7 passes this week." via `payoutSourceSentence`), `pays_on`.
- `decisions`: open refund requests (NEEDS A DECISION) with the person, their `note`, `pass_name`,
  `paid_at` (renewed), `cancelled_at`, `last_played_at` ("Hasn't played since"), `refundable_cents`
  (REFUND ALL $35) and `suggested_partial_cents` (the unused part of the period in whole units, or null;
  the design's REFUND $25 button).
- `recent_decisions`: decisions in the last 10 minutes (show the decided sentence and UNDO).
- `passes`: active passes with `count` and `count_kind` (`sold_this_month` = drop-ins paid in the last
  30 days, `active` packs with sessions left, `members`, `in_next_session` of a free pass's series) →
  `passCountLabel`.
- `members`: `count`, `renewing_count`, `renews_on`, `cancelled_count`, first 7 `faces`, and sessions a
  week for members vs drop-in people over 4 weeks ("Members come to 2.4 sessions a week, drop-ins to 0.8").
- `past_payouts`: last 6 closed weeks (`pastPayoutMeta`: "5 sessions · 1 refund").
- `provider: 'none'`, `payments_connected: false`, `fee_policy`.

Passes (hosts): `create_host_pass(p_program_id, p_kind, p_name, p_price_cents, p_idempotency_key,
p_description?, p_sessions_included?, p_valid_days?, p_series_id?, p_currency = 'CAD') → uuid`,
`update_host_pass(p_pass_id, p_name, p_price_cents, p_description?, p_sessions_included?, p_valid_days?)`
(new sales only; charges keep their amount), `archive_host_pass(p_pass_id)` (NEW PASS / EDIT).

`grant_host_pass(p_pass_id, p_user_id, p_paid, p_idempotency_key) → membership id` (hosts): records a
pass sold outside the app (cash, transfer) or given away: the membership plus, for a priced pass, a
charge `paid` (`method = host_recorded`) or `due`. Participant-side buying isn't designed (HANDOFF.md).

## Payment status (HostRoster, HostPeople)

**`host_session_payments(p_session_id) → HostSessionPayment[]`** (hosts), keyed by
`(session_id, user_id)`: everyone in (confirmed / checked in) plus dropped people who were refunded.
`state` (`host_payment_state`) in priority order:

| `state` | When | Badge (core's `label`) |
|---|---|---|
| `host` | Runs the program | HOST |
| `member` | Active member and the session's member price is 0 | MEMBER |
| `pack` | Used a pack here, or holds one with sessions left (used at check-in) | the pass name, e.g. 10-PACK; `sessions_left` |
| `paid` | Paid drop-in (`method`, `paid_at`) | PAID $8 |
| `refunded` | Paid and refunded (`refund_cents`) | REFUNDED |
| `free` | Free session, or a free pass for this series | FREE |
| `due` | Nothing covers them: pays `amount_cents` at the field | $8 AT FIELD |

`settled` = not `due`. BE-HOST-CORE's `session_roster` / `session_view` read the same through the seams
below (`payment`, "13 of 14 settled").

**`mark_paid_at_field(p_session_id, p_user_id, p_idempotency_key) → jsonb`** (hosts): "Mark it when he
does". Records the drop-in as `paid` (`method = at_field`). Returns the new state (`{state:'paid',…}`).
`not_attending` if they aren't in the session.

**`host_people_passes(p_program_id) → HostPeoplePass[]`** (hosts): each person's current pass
(monthly first, then pack, then free) for People's pass line and Members filter.

Automatic ledger rows (no RPC): a pack session is used when its holder checks in; a dropped spot filled
from the waitlist refunds the dropper's paid drop-in (`spot_filled`, `related_user_id` = who took the
spot, from core's `host_session_log` 'promoted' row); a skipped session refunds its paid drop-ins
(`session_cancelled`).

## Refunds

- Participant side: `request_host_refund(p_charge_id, p_note, p_idempotency_key) → request id`;
  `cancel_host_membership(p_membership_id, p_idempotency_key, p_refund_note?) → {membership_id, status,
  period_ends_at, refund_request_id}` (stops renewal; with a note, asks for the latest payment back).
- **`decide_host_refund(p_request_id, p_decision, p_idempotency_key, p_amount_cents?) → HostDecisionState`**
  (hosts). `full` refunds everything not yet refunded; `partial` refunds `p_amount_cents`
  (1 .. refundable − 1); `keep` refunds nothing. A refunded membership/pack ends now; a kept one doesn't
  renew and stays active to its period end. The refund is recorded `pending` with `provider = 'none'`;
  the person gets a `host_update` notification ("Plateau Pickup is refunding $25. Your membership ends
  today."). Audited with the prior membership state.
- **`undo_host_refund_decision(p_request_id) → HostDecisionState`** (hosts): within 10 minutes and while
  the refund is still pending: the refund is `cancelled`, the request is `open` again and the membership
  is restored. `refund_undo_closed` otherwise.

## Payouts

The next payout is computed on every read. An hourly job (`private.host_ops_tick`, pg_cron
`ojoro_host_ops_tick`) closes finished weeks into `host_payouts` (status `scheduled`: with no provider it
waits there), renews monthly memberships (the renewal charge is `due`: nothing can collect it yet) and
ends cancelled / expired / used-up holdings. Correctness of the screens doesn't depend on the job.

## HostSeason

Reads (anyone who can see the league; host-only parts are empty for others):

- **`host_league_view(p_league_id) → HostLeagueView`**: `league` (name, venue, rounds, meetings,
  tie-breaks `['points','goal_difference','goals_scored']`, team / player / free-agent counts),
  `is_host`, `to_confirm` (hosts: fixtures past kick-off with a captain's score or an open dispute:
  teams, round, `rescheduled_from`, `result` with `status` and the agreed score, `players_in`,
  `checked_in`: "Both captains sent 4–2 and 13 of 14 players checked in"), `standings`, `round` (the
  next round to play: `number`, `plays_on`, fixtures with `kicks_off_at`, `pitch`, `home_in` /
  `away_in` (readiness via `fixtureReadiness`), checked-in counts, `referee` and, for hosts when there's
  no referee, `referee_suggestion` {person, refs_count}: "Yara M is free and has reffed twice").
- **`host_league_standings(p_league_id) → HostStanding[]`**: `position`, P W D L, goals for/against,
  `goal_difference`, `points`, `pending_count` (games past kick-off without a confirmed result: "a game
  in hand until you confirm"). Order: points, goal difference, goals scored, then name.
- **`host_program_leagues(p_program_id) → HostProgramLeague[]`**: leagues with current round and
  `to_confirm_count` (HostHome's LEAGUE tool).

Writes:

- Hosts: `create_host_league(p_program_id, p_name, p_sport_id, p_starts_on, p_rounds_total,
  p_idempotency_key, p_venue_label?, p_place_id?, p_meetings = 2, p_min_players = 7)` (makes weekly
  rounds), `upsert_host_league_team(p_league_id, p_name, p_captain_id?, p_crew_id?)`,
  `set_host_league_member(p_league_id, p_user_id, p_team_id?, p_can_referee = false)`,
  `generate_host_league_fixtures(p_league_id, p_first_kickoff time, p_slot_minutes, p_idempotency_key,
  p_pitch?)` (round robin × meetings), `schedule_host_league_fixture(…)`,
  `reschedule_host_league_fixture(p_fixture_id, p_kicks_off_at)` (rain-out).
- **CONFIRM RESULT**: `confirm_league_result(p_fixture_id, p_idempotency_key, p_home_goals?,
  p_away_goals?) → HostFixtureResultState`. Without a score: the captains' agreed score
  (`result_not_agreed` otherwise). With one: the host's score. Inserts the one result; standings
  recompute on the next read; captains are told. Confirming again with the same score returns the state;
  with a different one fails `result_already_verified`. **No undo**: results are final (the prototype's
  UNDO isn't offered; see DESIGN_DECISIONS).
- **DISPUTE**: `dispute_league_result(p_fixture_id, p_note?)` clears both captains' scores and asks them
  to send it again.
- Captains: `submit_league_result(p_fixture_id, p_home_goals, p_away_goals, p_idempotency_key)` after
  kick-off; a newer score from the same team replaces the older one.
- Referees: `ask_league_referee(p_fixture_id, p_user_id, p_idempotency_key)` (hosts; ASK YARA TO REF),
  `respond_league_referee(p_fixture_id, p_accept)` (the asked person), `clear_league_referee`.
- Players: `set_league_fixture_in(p_fixture_id, p_in)`, `check_in_league_fixture(p_fixture_id,
  p_user_id?)` (from 60 minutes before kick-off; hosts can mark anyone on the two teams any time).

## HostInsights

**`host_insights(p_program_id, p_days = 30) → HostInsights`** (hosts; 7–365 days). Rates are 0..1;
"before" values cover the same length just before the window.

| Field | Meaning |
|---|---|
| `ojoro_hours` (+ `_before`) | Sum over check-ins at the program's held sessions of the session length, rounded. Change: `relativeChange`. |
| `show_up_rate` (+ `_before`) | Checked in ÷ (checked in + confirmed no-shows) at ended sessions. Change: `pointsChange`. |
| `return_rate` (+ `_before`) | Of people whose first check-in in the window was ≥ 14 days ago, the share who checked in again within 14 days. |
| `fill` | The series that fills best (most filled sessions): `median_seconds` from opening to the last spot, and `median_seconds_before` → `fillTimeLabel`, `fillTimeChange`. Null when nothing filled. |
| `payout_cents` (+ `_before`) | Net of the revenue ledger over the window (gross − refunds − placeholder fee). |
| `weeks` | 12 local Monday weeks: distinct `people` checked in, `sessions` held, `skipped` sessions (rain-outs) with reasons. |
| `by_series` | Per series: `fill_rate`, `no_show_rate`, `typical_in`, `typical_waitlist`, `median_fill_seconds`, `first_timers`, `first_timer_return_rate` (back within 8 days). |
| `revenue` | `HostMoneyTotals` over the window (lines, refunds, fee, net). |

**`host_insights_csv(p_program_id, p_days = 30) → text`** (hosts): DOWNLOAD CSV. Header
`date,record,kind,description,person,amount,currency,status,method,provider,id`; one row per charge,
refund, closed payout and its placeholder fee (negative), oldest first; amounts with two decimals;
spreadsheet formulas defused. Save it with `insightsCsvFileName(programName)`.

## Seams filled for BE-HOST-CORE

`20261030210100` / `300200` replace core's placeholders (same signatures):

| Seam | Fills |
|---|---|
| `private.host_payment_for(session, user) → host_payment` | `status` `host` / `member` / `pass` / `paid` / `free` / `due_at_field` / `refunded`; `label` (badge words); `amount_cents`, `currency`; `detail` ("4 sessions left", "Refunded $8"). |
| `private.host_person_pass(program, user) → host_pass_summary` | `kind` `monthly` / `pack` / `free` / `drop_in` (paid a drop-in in 60 days); `label` (pass name); `renews_on`; `sessions_left`. |
| `private.host_session_settlement(session) → host_settlement` | `settled`, `total`, the first person still to pay and the note ("Tomás is new and pays $8 at the field."). |
| `private.host_needs_you_ops(program)` | `refund_request` (`object_id` = request, `name` = pass, `user_names`, `detail` {user_id, pass_name, charge_kind, amount_cents, paid_at, cancelled_at, days_in}); `league_result` (`object_id` = fixture, `name` = league, `user_names` = [home, away], `detail` {league_id, round, home, away, home_goals, away_goals, both_agree, result_status}). |
| `private.host_week_ops(program, from, to)` | `league` rows: `object_id` = league, `name`, `starts_at` = first kick-off, `detail` {round, fixtures, teams, plays_on}. |

## Notifications

`host_update` (BE-HOST-CORE's type) with `data.change` = `refund_decided`, `refund_reopened`,
`league_result_confirmed`, `league_result_disputed`, `referee_asked`, plus `data.text` (the sentence)
and `data.program_id`. The object is the activity of the person's latest session in the program (a
person who has never been to one isn't notified; the decision still stands). Core's
`notification_feed` needs to show `data.text` for these changes (see the final report).

## Realtime

Treat every event as a refetch hint.

- `hostMoneySubscription(programId)`: `host_charges`, `host_refunds`, `host_refund_requests`,
  `host_memberships`, `host_passes` filtered by `program_id`. HostMembership, and HostRoster's badges.
- `hostLeagueSubscription(leagueId)`: `host_league_fixtures`, `host_league_results` (INSERT) by
  `league_id`, and `host_league_result_submissions` (RLS limits it to hosts and submitters).

## Analytics

Server-recorded (`private.analytics_events`): `host_pass_created`, `host_pass_granted`,
`host_paid_at_field`, `host_refund_requested`, `host_refund_decided` {decision, charge_kind},
`host_membership_cancelled`, `host_league_created`, `host_league_result_submitted`,
`host_league_result_confirmed` {source}, `host_league_result_disputed`, `host_league_referee_asked`,
`host_insights_exported`. Payloads carry ids and kinds, never names or amounts per person.
Client (`@ojoro/analytics`): `host_money_viewed`, `host_refund_decision_undone`,
`host_season_viewed`, `host_insights_viewed`, `host_insights_table_toggled`.

## Local data

`supabase/seed_hosts_ops.sql` (re-runnable; after `seed_hosts.sql` in `config.toml`'s seed list; run it
again whenever `seed_hosts.sql` is re-run, which rebuilds the program and everything here). Sign in as
Ade B (`+1 555 555 0101`, code 123456). Times are relative to now.

| Object | Id / content |
|---|---|
| Program Plateau Pickup | `c6000000-0000-4000-8000-000000000001` (BE-HOST-CORE) |
| Pass Drop-in $8 | `c7200000-0000-4000-8000-000000000001` (41 sold in 30 days) |
| Pass 10-pack $70 | `c7200000-0000-4000-8000-000000000002` (7 active; Priya S has 4 left) |
| Pass Monthly $35 | `c7200000-0000-4000-8000-000000000003` (18 members, 17 renew on the 1st, Lena cancelled) |
| Pass Sunday beginners (free) | `c7200000-0000-4000-8000-000000000004` |
| Lena R's refund request | `c7300000-0000-4000-8000-000000000001` (renewed on the 1st for $35, cancelled 3 days in, her note) |
| Next payout | 22 drop-ins × $8, 6 renewals × $35, 1 × 10-pack, −$8 (Dayo's automatic refund), −$36 placeholder fee → **$412** |
| Past payouts | last 3 Fridays: $386 (5 sessions · 1 refund), $402 (5 sessions), $344 (4 sessions · rain-out on Thursday), `scheduled` (no provider: never PAID) |
| Tonight's Tuesday roster | 13 of 14 settled; Sam K and Rina K PAID $8; Priya 10-PACK 4 left; Tomás $8 AT FIELD; Dayo REFUNDED |
| League Winter League | `c7000000-0000-4000-8000-000000000001`: 6 teams (`c7100000-…-000000000001`..`06`: Mile End Strikers, Thursday FC, Lachine Locos, Plateau Crew, Saint-Henri United, Concordia Old Boys), 10 Saturdays at Jeanne-Mance, 30 fixtures, round 3 this Saturday, 64 players + 9 free agents (Yara M, Kofi A, Chimdi O referee) |
| Result to confirm | Round 2 Thursday FC 4–2 Plateau Crew, played last Thursday after the rain-out, both captains sent 4–2, 13 of 14 checked in |
| Round 3 | 9:00 Mile End v Thursday FC (ref Kofi A, 7 + 8 in), 10:15 Lachine v Concordia (no ref; Yara M suggested, reffed twice; 9 + 6 in), 11:30 Plateau Crew v Saint-Henri (ref Chimdi O, 8 + 7 in) |

Insights read core's 12 weeks of seeded attendance plus this ledger, so their numbers differ from the
PNG (412 hours, $1,544): the sample design figures aren't consistent with one fee rate.

## Not built

- Any payments provider, payout bank details, real charges or refunds (Step 8). Renewals are recorded
  `due`; nothing collects them.
- Participant-side buying of a drop-in or pass (not designed; HANDOFF.md).
- Offering a short team's spot to free agents automatically ("Ojoro offers the spot to free agents"):
  readiness and the free-agent list are there; the offer isn't.
- Season page, Fixtures, Teams and captains, Rules sub-screens (rows on HostSeason; not designed).
- Undo of a confirmed league result (results are final).
