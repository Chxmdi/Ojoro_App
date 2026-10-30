# Step 6: Host OS core backend contract

The data layer for the Host and Organizer OS core (PRD §13, M7): **programs** (hosts and co-hosts),
**series** (recurring templates) and the **sessions** they generate, the **roster and waitlist**,
**join requests** (approval workflow), the **People CRM** and **announcements**. Screens: HostHome,
HostSeries, HostRoster, HostRequests, HostPeople, HostAnnounce. Money (passes, payments, refunds,
payouts) and leagues are the ops ledger: [`HOSTS_OPS_CONTRACT.md`](HOSTS_OPS_CONTRACT.md).

It extends [`SLICE01_CONTRACT.md`](SLICE01_CONTRACT.md), [`MESSAGING_CONTRACT.md`](MESSAGING_CONTRACT.md)
and the others: write only through RPCs, map errors by code, idempotency keys per intent, read
`effective_status`, areas never addresses. Judgment calls: `docs/DESIGN_DECISIONS.md`
("Step 6 BE-HOST-CORE").

- Schema: `supabase/migrations/20261030200000_host_core.sql` (enums, tables, RLS, realtime),
  `…200100_host_core_sessions.sql` (programs, series → sessions, joining, waitlist rules, roster log),
  `…200200_host_core_roster_people.sql` (HostHome, roster, requests, People, announcements, tick),
  `…200300_host_core_notifications.sql` (notification words for the new types),
  `…200400_host_core_fixes.sql` (roster order, drifting definition), `…200500_host_core_report.sql`
  (report a program), `…200600_host_core_ops_notification_words.sql` (ops `host_update` words),
  `…200700_host_core_request_level.sql` (`session_requests.stated_level`).
- Client helpers in `@ojoro/contracts` (`hosts.ts`): `hostRpcs`, `hostIdempotentRpcs` (also in
  `idempotentRpcs`), `hostErrorCodes` (also in `ojoroErrorCodes`), row types (`MyHostProgram`,
  `HostHome`, `HostNeedsYouItem`, `HostWeekItem`, `SeriesView`, `SeriesSession`, `SessionView`,
  `RosterRow`, `JoinRequestRow`, `HostPersonRow`, `HostPerson`, `HostPeopleCounts`, `AnnounceContext`,
  `AnnounceTemplate`, `AnnouncementHistoryRow`, `PinnedAnnouncement`, `HostJoinState`,
  `HostSeriesUpdate`, `HostAnnouncementState`), enum aliases, `SeriesSettings` + `seriesChanges()`,
  `formatPrice`, `daysLabel`, `isoDayShort`, `LEVEL_LABEL`, `REFUND_WINDOW_LABEL`, `weekBadge`,
  `last12Label`, `waitlistWords`, `canUndo`, realtime `hostProgramSubscription`,
  `hostSessionSubscription`, and constants `HOST_UNDO_MINUTES` (10), `HOST_PUSHES_PER_SESSION` (2),
  `HOST_EXPERIENCED_GAMES` (3), `HOST_ANNOUNCEMENT_MAX_LENGTH` (280), `HOST_REQUEST_NOTE_MAX_LENGTH`
  (280), `HOST_NOTE_MAX_LENGTH` (1000), `HOST_TAGS_MAX` (8), `HOST_TAG_MAX_LENGTH` (24),
  `HOST_CHECK_IN_MINUTES` (30), `HOST_CAPACITY_MIN`/`MAX` (2/100).
- Tests: `supabase/tests/25_host_series_sessions.sql`, `26_host_requests_people.sql`,
  `27_host_home_announce.sql`.
- Generated types: `returns table` columns are all typed non-null; use the `hosts.ts` row types,
  which mark the nullable ones `| null`.

Contents: [Rules](#rules) · [Errors](#errors) · [Model](#model) · [Authorization and privacy](#authorization-and-privacy) ·
[Programs](#programs) · [HostHome](#hosthome) · [HostSeries](#hostseries) · [HostRoster](#hostroster) ·
[Joining (participant side)](#joining-participant-side) · [HostRequests](#hostrequests) · [HostPeople](#hostpeople) ·
[HostAnnounce](#hostannounce) · [Seams for the ops ledger](#seams-for-the-ops-ledger) ·
[Notifications](#notifications) · [Realtime](#realtime) · [Analytics](#analytics) · [Local data](#local-data) ·
[Not built](#not-built)

---

## Rules

1. **Write only through the RPCs below.** New tables are readable through RLS as listed; clients have
   no INSERT/UPDATE/DELETE on them.
2. **Idempotent with a key** (`p_idempotency_key`): `create_host_program`, `create_series`,
   `promote_from_waitlist`, `add_session_spot`, `ask_to_join`, `decide_join_request`,
   `send_announcement`. Slice 01's `join_waitlist` and `cancel_attendance` keep their keys.
   **Set-to-state, safe to repeat:** `update_host_rules`, `add_co_host`, `remove_co_host`,
   `set_program_member`, `update_series` (with `p_expected_version`), `skip_session`,
   `restore_session`, `save_series_template`, `host_session_check_in`, `reorder_waitlist`,
   `withdraw_join_request`, `undo_join_decision`, `set_person_tags`, `set_person_note`,
   `invite_back` (a person is invited back at most once a week), `unpin_announcement`,
   `mark_announcement_read`.
3. **Hosts are authorized server-side for everything.** Every host RPC checks that the caller is an
   owner or co-host of the program (`not_program_host` otherwise).
4. Times: series times are local wall-clock in the **place's** time zone (`time_zone` on every read);
   format with it. Session status: read `effective_status` (activity) and `status` (`scheduled` /
   `skipped`).
5. Money values are integer cents + `currency`. Payment status columns are **null until the ops
   ledger fills them** (see [Seams](#seams-for-the-ops-ledger)); show nothing (not "unpaid") when null.

## Errors

New codes (words in `apps/mobile/src/lib/errorMessages.ts`):

| Code | Meaning | `detail` |
|---|---|---|
| `program_not_found` | Unknown program. | |
| `not_program_host` | Caller doesn't run this program. | |
| `owner_required` | Owner only (add/remove co-hosts). | |
| `series_not_found` | Unknown series. | |
| `series_invalid` | A setting is out of range, unknown or didn't parse. | The key (`capacity`, `repeat_days`, `start_time`…) |
| `series_version_conflict` | `p_expected_version` is stale: someone else saved. Reload. | Current version |
| `session_not_found` | Unknown session, or you can't see it. | |
| `session_skipped` | The session is skipped. | |
| `session_full` | `promote_from_waitlist` with no spot open: ADD A SPOT first. | |
| `joining_not_open` | Before the joining window ("Opens to everyone Oct 15"). | When it opens for you (timestamptz text) |
| `approval_required` | `join_waitlist` on a session that needs the host's OK: call `ask_to_join`. | |
| `not_waitlisted` | Promote someone who isn't waiting. | |
| `request_not_found` | Unknown request. | |
| `request_decided` | Answered the other way already (undo first). | Current status |
| `undo_expired` | Over 10 minutes, auto-approved, or they've checked in. | |
| `person_not_found` | Not someone this program knows. | |
| `tag_invalid` | Tags: up to 8, each 1–24 letters/digits/space/hyphen. | |
| `announce_no_recipients` | No audience picked, or nobody in it. | |
| `announce_push_limit` | Both pushes for this session are used. Send with `p_notify = false`. | `2` |
| `announcement_not_found` | Unknown announcement. | |

Also used: `invalid_argument` (detail = argument), `sport_unknown`, `user_not_found`,
`activity_started`, `activity_cancelled`, `check_in_not_open`, `check_in_closed`, `not_attending`,
`plan_unavailable`, `capacity_invalid` (add a spot past 100).

## Model

| Table | Visible to | Notes |
|---|---|---|
| `host_programs` | Signed in (minus a block with the owner); hosts always | `name`, `sport_id`, `area` (coarse), `time_zone`, `crew_id` (the program's crew, optional), auto-approve rules `auto_approve_played_with` (default on), `auto_approve_experienced` (off), `auto_approve_crews` (on). |
| `host_program_hosts` | Signed in | `role`: `owner` (exactly one) / `co_host`. |
| `host_program_members` | Self and hosts | Members (monthly). Active while `started_at <= now < ends_at` (null = open). `source`: `host` / `pass` (written by the ops ledger). |
| `host_people` | Hosts | CRM row per person who has come: `tags`, `first_seen_at`, `invited_back_at`. |
| `host_person_notes` | **The author only** | Private host notes: never shown to the person or to other hosts. Read via `host_person().my_note`. |
| `host_series` | Like the program | The recurring template (all HostSeries fields). `version` increments on every edit. |
| `host_sessions` | Like the program | One dated occurrence. `plan_id` + `activity_id` are the Slice 01 objects it **is**; the rule snapshot (`opens_at`, `members_open_at`, `approval_required`, `waitlist_auto_fill`, `auto_fill_cutoff_at`, `members_first`, prices, `refund_window`) applies to that session. |
| `host_join_requests` | Own row; hosts | `note`, `status` (`pending`/`approved`/`declined`/`withdrawn`), `approved_via` (`host`, `played_with`, `experienced`, `crews`, `member`). |
| `host_session_log` | Hosts | Every roster change on the session's activity (`joined`, `waitlisted`, `promoted`, `dropped`, `left_waitlist`, `checked_in`, `spot_added`, `reordered`…), written by a trigger whichever path made it. A `dropped` row's `related_user_id` is who took the spot; a `promoted` row's is whose spot they took. |
| `host_series_templates` | Hosts | SAVE AS A TEMPLATE: `name`, `settings` (series keys without dates). |
| `host_announcements` | Hosts and recipients | `body` (≤ 280), `audiences`, `template`, `recipient_count`, `read_count`, `pinned`, `pinned_until`, `notify`, `message_id` (the chat line). |
| `host_announcement_recipients` | Self and hosts | `read_at`. |

**A session is a Slice 01 plan + activity.** The plan has `source = 'host_session'`, `audience =
'public'`, status `game_on` from creation; the activity carries capacity, price (`cost_cents`), level
(`level_label`), check-in (opens 30 min before), chat, live, recap and Passport exactly as any game.
So people find, join, leave, check in, chat and get a recap with the existing screens and RPCs.
Sessions are generated 35 days ahead (`private.host_tick()`, hourly, and on create/edit).

Host sessions hold **2–100** players (pickup plans keep 2–12; Slice 01 RPCs still say
`capacity_invalid` for 2–12).

## Authorization and privacy

- Host RPCs: owner or co-host of the program. Co-hosts can do everything except add/remove co-hosts.
- Slice 01's `host_check_in`, `start_activity`, `cancel_activity` stay activity-host (owner) only; use
  `host_session_check_in` for any host.
- **Attendance at your own sessions only** (HostPeople): every People/roster number is computed from
  this program's sessions; nothing else of a person's Ojoro life except the join-request history the
  design shows (games checked in anywhere, show-up record), which they share by asking to join.
- **Areas, not addresses:** requests show `profiles.area` and `distance_km` (their coarse 0.01° home
  area to the place, rounded to a whole km, at least 1). Never coordinates.
- Blocked pairs never see each other in rosters, requests, People or announcements; a person blocked
  by a host can't join or ask (`plan_not_found` / `session_not_found`, never says why).
- Declining is quiet: the person is told the host couldn't take them this time; no reason, no name.
- **Report and block:** `report('host_program', <program id>, …)` reports a program you can see (not
  across a block with its owner); a person's profile, the session's plan/activity and its chat are
  reported with the existing kinds. Blocking a host hides their programs' sessions from you.

## Programs

| RPC | Returns | Notes |
|---|---|---|
| `create_host_program(p_name, p_sport_id?, p_area?, p_crew_id?, p_idempotency_key)` | `host_programs` | Caller becomes owner. `p_area` defaults to their profile area. |
| `my_host_programs()` | rows | You → "Crews, clans & hosting": `id`, `name`, `area`, `sport_id`, `role`, `next_session_at`, `upcoming_sessions` (next 7 days), `pending_requests`. |
| `update_host_rules(p_program_id, p_played_with?, p_experienced?, p_crews?)` | `host_programs` | LET THESE STRAIGHT IN switches. Null keeps a rule. |
| `add_co_host(p_program_id, p_user_id)` / `remove_co_host(…)` | boolean | Owner only (a co-host may remove themselves). |
| `set_program_member(p_program_id, p_user_id, p_member, p_ends_at?)` | boolean | Hand-managed membership (the ops ledger manages pass-based ones). |

## HostHome

`/host/[programId]`. Three reads; refetch on `hostProgramSubscription`.

**`host_home(p_program_id)`** → one row: `name`, `area`, `time_zone`, `role`, `week_from`/`week_to`
(start of today + 7 days, program time zone), `sessions_this_week` (scheduled), `ops_items_this_week`
(league rounds from the ops ledger), `spots_taken`, `spots_total`, `waiting`, `needs_you_count`,
`last30_sessions`, `last30_showed_up_pct` (null with no data), `last30_ojoro_hours`.
Headline: "3 sessions and a league round. 31 of 36 spots taken, 3 people waiting."

**`host_needs_you(p_program_id)`** → `HostNeedsYouItem` rows, oldest first. NEEDS YOU · <rows>.

| `kind` | From | Fields | Button |
|---|---|---|---|
| `join_requests` | core | `session_id`, `name` (series), `starts_at`, `count` ("2 people asked to join"), `user_names` (up to 3), `detail.approval_required` | REVIEW → HostRequests |
| `waitlist_choice` | core | `count` (spots you can fill), `detail.open`, `detail.waiting` | CHOOSE → HostRoster |
| `refund_request`, `league_result`, … | ops ledger | see HOSTS_OPS_CONTRACT | DECIDE / CONFIRM |

**`host_week(p_program_id)`** → `HostWeekItem` rows by time: `kind` (`session` / `league`),
`session_id`, `series_id`, `object_id` (activity id for sessions), `name`, `starts_at`, `time_zone`,
`status` (`scheduled` / `skipped`), `capacity`, `in_count`, `waitlist_count`, `asking_count`,
`price_cents`, `member_price_cents`, `currency`, `approval_required`, `members_first`, `detail`
(`level`, `place_name`; league rows: fixtures/teams/round). Badge: `weekBadge()` (FULL / 8 / 10 /
2 ASKING / SKIPPED / LEAGUE). Sub-line words: "14 / 14 · 3 waiting · drop-in", "members free"
(`member_price_cents = 0` with a price), "free" (`price_cents = 0`), "approval on".

## HostSeries

`/host/[programId]/series/[id]`.

**`series_view(p_series_id)`** → every setting plus `place_name`, `place_area`, `time_zone`,
`version` (send it back as `p_expected_version`), `first_session_on` ("Every Tuesday since March"),
`sessions_run` (31 SESSIONS RUN), `skipped_upcoming` (dates: "Skipping Dec 22 and Dec 29"),
`applies_from` (next session date: "Applies from Oct 13"), `people_in_upcoming` ("The 9 people
already in get one message"), `host_verified` (always false: no host verification exists yet).

**`series_sessions(p_series_id, p_limit = 4)`** → NEXT 4 SESSIONS: `session_id`, `activity_id`,
`occurs_on`, `starts_at`, `status`, `skip_reason`, `capacity`, `in_count`, `open_count`,
`waitlist_count`, `asking_count`, `opens_at`, `members_open_at`, `members_first`.
"9 in · 5 open"; "Members are already in" when `members_open_at <= now < opens_at`; "Opens to
everyone Oct 15" when `now < opens_at`.

**`update_series(p_series_id, p_changes jsonb, p_expected_version)`** → `HostSeriesUpdate`
(`version`, `applies_from`, `sessions_updated`, `sessions_added`, `people_notified`). Send only what
changed: `seriesChanges(loaded, edited)`. Keys (`SERIES_SETTING_KEYS`): `name`, `sport_id`,
`place_id`, `start_time` ('19:30'), `duration_minutes` (15–480), `capacity` (2–100), `level`
(`beginners`/`mixed`/`competitive`), `repeat_days` (ISO 1–7), `starts_on`, `until_on` (null = no
end), `join_opens_days` (0–30; members get 48 h earlier when `members_first`), `approval_required`
("Approve first-timers"), `waitlist_auto_fill` ("Waitlist that fills itself", stops 2 h before),
`members_first`, `price_cents` (DROP-IN), `member_price_cents` (0 = "Included"), `currency`,
`refund_window` (`any_time`/`hours_12`/`hours_24`/`never`), `teams_note`, `kit_note`.
**Changes apply from the next session that hasn't started**; past sessions keep what they were.
Dates that leave the schedule are skipped ("Not in the series anymore"), new dates are generated.
People already in get one message: time/place changes reach them through the activity's own
"moved" notification; other changes (price, length, level, refund window…) through one `host_update`
notification per person.

**`create_series(p_program_id, p_settings, p_idempotency_key)`** → `host_series` (same keys;
defaults: mixed, 5 days, auto-fill on, 12 h refunds, CAD, free, capacity from the sport).

**`skip_session(p_session_id, p_reason?)`** / **`restore_session(p_session_id)`** → `host_sessions`.
Skipping cancels the session's plan and activity (people in it get the usual "called off"
notification) but keeps their places; RESTORE brings everyone back and tells them. Only before
the start (`activity_started`).

**`save_series_template(p_series_id, p_name)`** → `host_series_templates` (same name replaces).

## HostRoster

`/host/[programId]/session/[id]`. Refetch on `hostSessionSubscription(sessionId, activityId)`.

**`session_view(p_session_id)`** → header: `name`, `program_name`, `place_name`, `place_area`,
`time_zone`, `starts_at`, `ends_at`, `check_in_opens_at` ("Check-in opens at 7:00"), `status`,
`effective_status`, `capacity`, `in_count`, `checked_in_count`, `waitlist_count`, `asking_count`,
`approval_required`, `waitlist_auto_fill`, `auto_fill_cutoff_at`, `auto_fill_active` ("The waitlist
stopped filling itself at 5:30" when false and it was on), `members_first`, `opens_at`,
`members_open_at`, prices, `refund_window`, the program's rules (`rule_played_with`,
`rule_experienced`, `rule_crews`, `crew_names`: "Members of Plateau Pickup and Thursday FC"),
`settled`/`settle_total`/`settle_note_user_id`/`settle_note` (ops ledger; null until then:
"13 of 14 settled"), `chat_new_today` ("23 new since this morning").

**`session_roster(p_session_id)`** → `RosterRow`s in order IN (hosts first), WAITLIST (by
`waitlist_position`), DROPPED: `section`, `user_id`, `display_name`, `avatar_path`, `is_host`
(HOST badge), `is_member`, `attendance_status`, `team`, `first_time` (never checked in to this
program before), `last12_count`/`last12_total` ("11 of the last 12"), `plays_most_dow` ("plays most
Thursdays"), `joined_at`, `waitlisted_at` ("Waiting since Saturday"), `promoted_at` ("In from the
waitlist at 2:31"), `checked_in_at`, `check_in_method`, `approved_at`/`approved_via` ("you approved
him Saturday"), `dropped_at`, `replaced_by`/`replaced_by_name`/`replaced_at` ("Rina took the spot a
minute later"), `payment_status`/`payment_label`/`payment_amount_cents`/`payment_detail` (ops
ledger; null until then: MEMBER, 10-PACK, PAID $8, $8 AT FIELD, "4 sessions left").

Actions:

| RPC | Notes |
|---|---|
| `host_session_check_in(p_session_id, p_user_id)` → `attendance_state` | CHECK-IN by any host (from check-in opening). |
| `promote_from_waitlist(p_session_id, p_user_id, p_idempotency_key)` → `attendance_state` | The host chooses (after the cutoff this is the only way in). `session_full` when no spot. |
| `reorder_waitlist(p_session_id, p_user_ids)` → integer | REORDER: the whole waitlist, in the new order. |
| `add_session_spot(p_session_id, p_idempotency_key)` → `attendance_state` | ADD A 15TH SPOT. Before the cutoff, the first waiting person takes it at once (`promoted_user_id`). |

**Waitlist rule.** A host session's waitlist fills itself while `waitlist_auto_fill` and
`now < auto_fill_cutoff_at` (2 h before kick-off): when someone drops (`cancel_attendance`), the
first person waiting is in, in the same transaction, and told (`waitlist_promoted`). After the cutoff
the spot stays open and HostHome shows `waitlist_choice`. New joiners never jump the queue: with
anyone waiting they go to the waitlist even if a spot is open. MESSAGE ALL → HostAnnounce.

## Joining (participant side)

- **`join_waitlist(p_activity_id, p_idempotency_key)`** (Slice 01) now handles host sessions: in when
  there's room, otherwise the waitlist; checks the joining window (`joining_not_open`, detail = when
  it opens for you; members first get `members_open_at`), and approval (`approval_required`).
- **`ask_to_join(p_session_id, p_note, p_idempotency_key)`** → `HostJoinState` (`request_status`,
  `attendance_status`, `waitlist_position`). Joins straight away when no approval is needed or a rule
  lets them in (member; played with you; 3+ checked-in games; shares a crew with a host); otherwise
  a pending request (hosts get `host_request`). A declined request stays declined.
- **`withdraw_join_request(p_session_id)`**.
- **`cancel_attendance`** (Slice 01) refills from the waitlist under the rule above.
- Their own request: `host_join_requests` (RLS: own row).

## HostRequests

`/host/[programId]/session/[id]/requests`. Header from `session_view` ("9 / 12 IN · 3 OPEN · 2 ASKING"),
rules from `session_view.rule_*` + `update_host_rules`.

**`session_requests(p_session_id, p_include_decided = true)`** → `JoinRequestRow`s, pending first:
`request_id`, `user_id`, `display_name`, `avatar_path`, `area`, `distance_km` ("Verdun · about 3 km
away"), `id_verified` (false: no ID verification exists yet; don't show the badge), `new_to_ojoro`
(joined in the last 14 days: NEW TO OJORO), `ojoro_games` (14 OJORO GAMES), `showed_up`/`show_up_of`
(SHOWED UP 14 OF 14), `stated_level` (their self-declared `skill_level` for the session's sport,
null if none; show in words, e.g. "Says: beginner"; shown to the host deciding only, nowhere else), `note`, `shared_names` (up to 3) / `shared_count` ("You both play with
Chimdi O." / "Nobody you know."), `status`, `approved_via`, `decided_at`, `undo_until`.

| RPC | Notes |
|---|---|
| `decide_join_request(p_request_id, p_approve, p_idempotency_key)` → `HostJoinState` | APPROVE puts them in (or on the waitlist when full) and tells them; DECLINE is quiet. `request_decided` if answered the other way. |
| `undo_join_decision(p_request_id)` → `HostJoinState` | Within 10 minutes (`canUndo(undo_until)`): back to pending; an approval's spot goes (refilled by the waitlist rule); their unread answer is withdrawn. |
| `update_host_rules(…)` | The three switches. |

## HostPeople

`/host/[programId]/people`.

Definitions (this program's sessions only): **played** = checked in at least once ("86 people have
played with you"); **regular** = checked in 2+ times in the last 30 days ("23 came at least twice
this month"); **member** = active membership; **new** = first came in the last 30 days;
**drifting** = 3+ sessions in all and none in the last 21 days. Hosts are not listed.
**Last 12** = the last 12 ended, not-skipped sessions of the series this person comes to, oldest
first, filled = checked in. **No-show** = confirmed at a session that ended without checking in.

| RPC | Returns |
|---|---|
| `host_people_counts(p_program_id)` | `all_count`, `played_count`, `regulars`, `members`, `new_count`, `drifting` (chips: All 86 · Regulars 23 · Members 18 · New 9 · Drifting 6). |
| `host_people(p_program_id, p_filter = 'all', p_query?)` | `HostPersonRow`s most-attending first: `days` (ISO, `daysLabel` → "Tue · Thu"), `last12_count`/`last12_total`, `sessions_total`, `first_came_at`, `last_came_at`, `is_member`, `is_regular`, `is_new`, `is_drifting`, `tags`, `invited_back_at`, `pass_kind`/`pass_label` (ops ledger; null until then: MEMBER / DROP-IN / 10-PACK). `p_query` matches name or tag, case and accents ignored. |
| `host_person(p_program_id, p_user_id)` | Expanded: `last12` (boolean[], oldest first), `sessions_total` (34 SESSIONS), `first_came_at` (APR FIRST CAME), `no_shows`, membership dates, `tags`, `my_note` (yours only), `pass_*` (ops: "Monthly · renews Nov 1"). |
| `set_person_tags(p_program_id, p_user_id, p_tags)` | The new list (lowercased, sorted). |
| `set_person_note(p_program_id, p_user_id, p_body)` | Empty clears. "Only you see this. Never shown to them or other hosts." |
| `invite_back(p_program_id, p_session_id, p_user_ids?)` | `sent`, `skipped`. INVITE THEM BACK: null = everyone drifting. One nudge (`host_update`, change `invite_back`) to that session; once a week per person. |

MESSAGE → the person's DM is not built; use the crew chat or HostAnnounce. INVITE TO… → `invite_back`
with one id.

## HostAnnounce

`/host/[programId]/announce?session=<id>`. Announcements are always about one session (pinned in its
chat); audiences widen who receives it.

| RPC | Returns |
|---|---|
| `announce_context(p_session_id)` | `session_name`, `starts_at`, `time_zone`, `author_name`, counts per audience (`session_count` "Tonight's 14", `waitlist_count`, `members_count`, `everyone_count`), `pushes_used`, `pushes_left`, `max_length` (280), `chat_new_today`. Counts include the author when they're in the group. |
| `announce_recipient_count(p_session_id, p_audiences)` | Live count for the selection ("SEND TO 17"). |
| `announce_templates(p_session_id)` | `key`, `label`, `body`: Pitch moved, Running late, Weather call, Bring kit (worded "tonight" when today). |
| `send_announcement(p_session_id, p_audiences, p_body, p_template?, p_pin = true, p_notify = false, p_idempotency_key)` | `HostAnnouncementState` (`announcement_id`, `recipient_count`, `pinned`, `notified`, `pushes_left`, `message_id`). Pin: posted in the session chat (message `payload = {host_announcement, pinned: true}`) and pinned until the session ends; one pinned at a time. Notify: `host_announcement` push to recipients, **at most 2 per session** (`announce_push_limit`). |
| `host_announcement_history(p_program_id, p_limit = 20)` | SENT BEFORE: `body`, `audiences` ("everyone"), `session_name`, `session_starts_at`, `created_at`, `recipient_count`, `read_count` ("14 / 14 READ"), `pinned`, `notify`. |
| `unpin_announcement(p_announcement_id)` | boolean. |
| `mark_announcement_read(p_announcement_id)` | Recipient side: call when the pinned line or the notification is seen. Idempotent. |
| `session_pinned_announcement(p_activity_id)` | The chat's pinned line (PINNED · FROM ADE, YOUR HOST) for participants, hosts and recipients. |

## Seams for the ops ledger

These private functions return null / nothing in the core migration; **the ops ledger replaces them**
(it has: all five are live as of `20261030210*`; see HOSTS_OPS_CONTRACT for exact values) (`create or
replace`, same signature) to fill the money columns without the core reading ledger tables:

| Function | Fills |
|---|---|
| `private.host_payment_for(p_session uuid, p_user uuid) returns public.host_payment` (`status`: `host`, `member`, `pass`, `paid`, `free`, `due_at_field`, `refunded`; `label`, `amount_cents`, `currency`, `detail`) | `session_roster.payment_*` |
| `private.host_person_pass(p_program uuid, p_user uuid) returns public.host_pass_summary` (`kind`: `drop_in`, `pack`, `monthly`, `free`; `label`, `renews_on`, `sessions_left`) | `host_people.pass_*`, `host_person.pass_*` |
| `private.host_session_settlement(p_session uuid) returns public.host_settlement` (`settled`, `total`, `note_user_id`, `note`) | `session_view.settled…` |
| `private.host_needs_you_ops(p_program uuid) returns setof public.host_needs_you_item` | `host_needs_you` rows (refunds, league results) and `host_home.needs_you_count` |
| `private.host_week_ops(p_program uuid, p_from timestamptz, p_to timestamptz) returns setof public.host_week_item` | `host_week` league rows and `host_home.ops_items_this_week` |

Automatic refunds: add a trigger on `host_session_log` (a `promoted` row whose `related_user_id` is
the person who dropped = their spot was filled). Monthly memberships: write
`host_program_members` (`source = 'pass'`).

## Notifications

New `notification_type` values (copy in `my_notifications`, deep link to the session's activity):

| Type | To | `data` |
|---|---|---|
| `host_request` | Hosts | `session_id`: someone asked to join (bundled per session). |
| `host_update` | People in / asking | `change`: `series_updated` (`fields`), `restored`, `request_approved`, `request_declined` ("couldn't take you this time"), `invite_back`; `session_id`. Ops ledger changes (`refund_decided`, `refund_reopened`, `league_result_confirmed`, `league_result_disputed`, `referee_asked`) carry their words in `data.text`, which becomes the title. |
| `host_announcement` | Recipients | `announcement_id`, `session_id` (push, at most 2 per session). |

Existing types also fire: `waitlist_promoted`, `activity_changed` (`cancelled` on skip, `time` /
`place` on edits), `participant_update` (to the owner when someone drops).

## Realtime

`hostProgramSubscription(programId)`: `host_programs`, `host_series`, `host_sessions`,
`host_announcements` (INSERT). `hostSessionSubscription(sessionId, activityId)`: the session row,
the activity, its `attendance` (the program **owner** receives these; co-hosts refetch on the others)
and `host_join_requests`. Treat events as refetch hints.

## Analytics

Server-recorded (`private.analytics_events`): `host_program_created`, `host_series_created`,
`host_series_updated` (fields, sessions_updated, people_notified), `host_session_skipped`,
`host_session_restored`, `host_session_joined` (by_host), `host_join_requested` (has_note),
`host_join_decided` (approved), `host_waitlist_promoted`, `host_spot_added`, `host_checked_in`,
`host_rules_changed`, `host_tags_set` (count), `host_note_saved` (cleared; never the words),
`host_invite_back_sent` (sent), `host_announcement_sent` (recipients, audiences, pinned, notified,
template; never the words). Client names are in `@ojoro/analytics` (`host*`).

## Local data

`supabase/seed_hosts.sql` (re-runnable; in `config.toml`'s seed list). **Plateau Pickup**, run by
Ade B (`a0000000-…-000000000002`, phone `15555550101`, code 123456):

| Object | Id |
|---|---|
| Program Plateau Pickup | `c6000000-0000-4000-8000-000000000001` |
| Series Tuesday 7-a-side (Jeanne-Mance Park, 7:30 PM, 90 min, 14, mixed, approval, $8, members included, 12 h) | `c6000000-0000-4000-8000-000000000011` |
| Series Thursday Mixed 5s (10, members free, members first) | `c6000000-0000-4000-8000-000000000012` |
| Series Sunday Beginners (10:00, 12, free, approval on) | `c6000000-0000-4000-8000-000000000013` |
| Tonight's Tuesday session (next Tuesday when today isn't): 14 / 14 in, 3 waiting, Dayo dropped, Rina took the spot | first upcoming session of `…011` |
| Sunday Beginners: 9 / 12 in, 2 asking (Grace N, Omar S) | first upcoming session of `…013` |
| Seed people (Plateau Pickup regulars, members, newcomers, drifting) | `c6100000-0000-4000-8000-0000000000NN` |

Sessions are generated from the series, so ids differ per database; look them up with
`host_week(…)`. History (12 weeks of past sessions with attendance) is seeded so People, last 12 and
LAST 30 DAYS have numbers.

## Not built

- Host verification (HOST VERIFIED badge) and ID verification (ID VERIFIED): no data; reads return false.
- Direct messages to one person (People MESSAGE) — use crew chat / announcements.
- Program-wide announcements without a session, and announcement scheduling.
- Waitlist auto-promotion is immediate on a drop (not "a minute later").
- Money, passes, refunds, payouts, leagues: the ops ledger.
