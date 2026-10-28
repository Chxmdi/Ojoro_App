# Slice 01 backend contract

The data layer for Vertical Slice 01 (PRD §18.3): **AUTH → PROFILE → DOWN FOR → I'M DOWN → PLAN
FORMING → GAME ON → ACTIVITY → ATTENDANCE → RECAP → RUN IT BACK**. Build the mobile data layer and
screens from this document. The backend is Supabase (ADR 0001); the choices this document relies on
are in ADR 0002 and in `docs/DESIGN_DECISIONS.md` ("Slice 01 backend").

- Schema: `supabase/migrations/2026102819*_slice01_*.sql`
- Generated types: `@ojoro/contracts` (`Database`, `Tables<'plans'>`, `Enums<'plan_status'>`,
  `CompositeTypes<'plan_state'>`, `Constants`). Refresh with `pnpm db:types` (local stack running).
- Client helpers in `@ojoro/contracts`: `toOjoroError`, `ojoroErrorCodes`, `slice01Rpcs`,
  `idempotentRpcs`, `planSubscription`, `activitySubscription`, `invitesSubscription`,
  `effectivePlanStatus`, `effectiveActivityStatus`, `checkInWindowState`.
- Tests: `npx supabase test db` (pgTAP, `supabase/tests/*.sql`); concurrency check:
  `bash supabase/tests/race/im_down_race.sh` (local only).

Contents: [Rules for clients](#rules-for-clients) · [Errors](#errors) · [Idempotency](#idempotency) ·
[Tables and views](#tables-and-views) · [RPCs](#rpcs) · [Down For matching](#down-for-matching) ·
[Realtime](#realtime) · [Time rules](#time-rules) · [Storage: moments](#storage-moments) ·
[Analytics](#analytics) · [Screens](#screens) · [Local data](#local-data) · [Not in Slice 01](#not-in-slice-01)

---

## Rules for clients

1. **Read** with `supabase.from(table_or_view).select()` (rows are filtered by RLS) or with a read RPC.
   **Write only through RPCs.** Clients have no INSERT/UPDATE/DELETE privilege on any table, except
   updating their own `profiles` (`display_name`, `handle`, `area`, `avatar_path`) and own
   `privacy_settings` row. Prefer the RPCs for those too (`update_profile`, `save_onboarding`).
2. **Status: read `effective_status`** (from `plan_cards` / `activity_cards`), never the stored `status`.
   The stored status is moved forward by a job once a minute; `effective_status` is computed from
   timestamps and is always right. Offline, compute it with `effectivePlanStatus` /
   `effectiveActivityStatus` from `@ojoro/contracts`.
3. **Mutations that change membership, capacity or attendance need `p_idempotency_key`** (a uuid v4
   the client makes once per user intent and reuses for every retry of that intent). See
   [Idempotency](#idempotency).
4. **Map errors by code**, never by message text: `toOjoroError(error).code`. The words the UI shows
   are the app's job.
5. **Never send or keep raw location** beyond the two calls that take it (`check_in`, `share_location`).
   Areas are labels (`profiles.area`, `places.area`) and a coarse point the server rounds to 0.01°.
6. **Signed-in only.** `anon` can read nothing and call nothing.
7. Generated types for RPCs that `returns table (...)` mark every column non-null. Columns documented
   below as nullable can be `null`; treat them as `T | null`.

## Errors

Raised with SQLSTATE `P0001`; the stable code is the error **message**. supabase-js gives
`{ code: 'P0001', message: '<code>', details: '<detail or empty>' }`. `toOjoroError()` returns
`{ kind: 'ojoro', code, detail }` (and `permission`, `network`, `unknown` for other failures).

| Code | Meaning | `detail` |
|---|---|---|
| `not_authenticated` | No session. | |
| `idempotency_key_required` | Missing key on an idempotent RPC. | |
| `idempotency_key_reused` | Same key used for a different operation or object. Make a new key. | |
| `invalid_argument` | Bad input not covered by a specific code. | Which argument |
| `user_not_found` | Unknown user. | |
| `subject_not_found` | Report target doesn't exist. | |
| `report_rate_limited` | More than 20 reports in 24 h. | |
| `handle_taken` | Handle in use. | |
| `radius_invalid` | Radius not 1–50 km. | |
| `sport_unknown` | Not in the sports catalog. | |
| `place_unknown` | Unknown place. | |
| `capacity_invalid` | Capacity not 2–12 ("Plans hold 2 to 12 people."). | `2-12` |
| `starts_at_invalid` | Start not between 15 min and 30 days ahead (Run It Back: at least 1 h ahead). | |
| `deadline_invalid` | Deadline in the past or after the start (or poll close after deadline). | |
| `time_options_invalid` | Poll option out of range, or more than 4 options. | |
| `expiry_required` | Down For without `p_expires_at`. | |
| `expiry_invalid` | Expiry in the past or after the window ends. | |
| `window_invalid` | Window empty, over, longer than 24 h, or more than 14 days out. | |
| `signal_not_found` | Not your signal. | |
| `plan_not_found` | Plan doesn't exist **or you can't see it** (audience, block). Never says which. | |
| `plan_unavailable` | You can see it but can't join (someone in it has a block with you). Show as "You can't join this plan." | |
| `plan_full` | Plan locked at capacity (GAME ON) or the last spot just went. Offer `join_waitlist`. | Activity id when there is one |
| `plan_expired` | Deadline passed. Show "IT DIDN'T COME TOGETHER." and `still_on_nearby`. | |
| `plan_cancelled` | Host called it off. | |
| `plan_locked` | `leave_plan` after GAME ON. Use `cancel_attendance` on the activity. | Activity id |
| `not_member` | Members only (vote, propose time, pull in, candidates). | |
| `not_host` | Host only. | |
| `poll_closed` | Poll closed or plan not forming. | |
| `option_not_found` | Not an option of this plan. | |
| `invite_not_allowed` | You can't invite that person (not connected and no Pull Me In, or a block). Never says which. | Invitee id |
| `invite_quota_exceeded` | Over 3 pull-in invites for this plan. | Invites left |
| `invite_rate_limited` | Over 20 pull-in invites in 24 h. | |
| `invite_not_found` | Not your invite. | |
| `activity_not_found` | Activity doesn't exist or you can't see it. | |
| `activity_cancelled` | Activity cancelled. | |
| `activity_started` | Too late: the game has started (cancel, waitlist, host start). | |
| `activity_not_live` | `end_activity` before it's live. | |
| `activity_not_finished` | Run It Back before the game ended. | |
| `not_attending` | You (or the person) aren't confirmed for this activity. | |
| `check_in_not_open` | Check-in hasn't opened. | `check_in_opens_at` (timestamptz text) |
| `check_in_closed` | Check-in window over. | |
| `check_in_unavailable` | No meeting point or place coordinates to check against. | |
| `location_required` | `check_in` without a valid position. | |
| `too_far` | More than `check_in_radius_m` (150 m) away. | Distance in metres, rounded to 50 |
| `share_not_allowed` | Live location outside this game's window. | |
| `not_player` | Only people who checked in (results, moments, recap people, reputation, Run It Back). | |
| `result_not_open` | Results open in After (host may log during Live). | |
| `result_already_verified` | Verified results aren't replaced. | |
| `proposal_not_found` | Unknown proposal. | |
| `proposal_superseded` | Someone suggested a fix; confirm the current proposal. | |
| `moments_closed` | Moments are added during Live and After only. | |
| `moment_path_invalid` | No uploaded object at `<activity_id>/<your id>/<file>` in bucket `moments`. | |
| `not_author` | Only the author removes a moment. | |

Permission errors (`42501`) mean the client tried a direct write or anon access: a bug, not a user state.

## Idempotency

RPCs with `p_idempotency_key uuid`: `create_plan`, `im_down`, `leave_plan`, `pull_in`,
`create_down_for`, `join_waitlist`, `cancel_attendance`, `check_in`, `propose_result`,
`confirm_result`, `run_it_back`.

- One key per **user intent** (one tap on I'M DOWN). Store it with the queued mutation; reuse it for
  every retry, including after the app restarts offline.
- A retry with the same key returns **exactly the first result** (same row, same `changed` flag), even
  if it races the first call. Keys are kept 7 days.
- If the first call failed with an error, nothing was stored; the retry runs again.
- A key is bound to the operation and object (`im_down` on plan X). Reusing it elsewhere fails with
  `idempotency_key_reused`.
- The operations are also naturally idempotent: tapping I'M DOWN when already in, leaving when not in,
  cancelling twice, checking in twice, confirming twice return `changed: false` and change nothing.
- Retry only `toOjoroError(e).kind === 'network'` (`isRetryable`). An `ojoro` error is an answer.

Other mutations (`vote_time`, `propose_time`, `decline_invite`, `withdraw_down_for`, `block_user`,
`unblock_user`, `set_pull_me_in`, `share_location`, `stop_sharing_location`, `untag_me`,
`remove_moment`, `give_reputation`, `host_check_in`, `assign_team`, `start_activity`, `end_activity`,
`cancel_plan`, `cancel_activity`) are set-to-state operations: safe to repeat, no key.

## Tables and views

"Visible to" is enforced by RLS. "Signed in" = any authenticated user. "Blocked" = either person
blocked the other; blocked pairs never see each other's rows anywhere.

### Catalog

| Table | Visible to | Notes |
|---|---|---|
| `sports` | Signed in | `id` (`football`, `running`, `boxing`, `basketball`, `volleyball`, `beach_volleyball`, `climbing`, `cycling`, `tennis`), `name`, `family` (volleyball ≈ beach volleyball), `default_capacity`, `default_duration_minutes`, `team_based`, `sort_order`. Reference data (in a migration). |
| `places` | Signed in | `name`, `area` (neighbourhood), `city`, `lat`/`lng` (**public centroid of a public place**), `sport_ids`, `surface`, `floodlit_until` (time, e.g. `23:00` → "Floodlit until 11 PM"), `is_free`, `time_zone`. |

### Identity

| Table / RPC | Visible to | Notes |
|---|---|---|
| `profiles` | Signed in, minus blocked | `id` (= auth user id), `handle`, `display_name`, `area` ("Plateau, Montréal"), `avatar_path`, `time_zone`, `onboarding_completed_at`. Created by trigger at sign-up (`display_name` from `user_metadata.display_name` / `full_name`). Route to onboarding while `onboarding_completed_at` is null. |
| `profile_private` | Self | `area_lat`/`area_lng` (0.01°), `discovery_radius_km` (default 3). |
| `privacy_settings` | Self | `sports_visibility` (default `everyone`), `history_visibility` (default `friends`), `availability_visibility` (default `crews`; never `everyone`). Enum `visibility`: `everyone`, `friends`, `crews`, `only_me`. Until Friends and Crews exist, `friends` and `crews` both mean **people you have played with** (checked in to the same game). |
| `user_sports` | Self | `sport_id`, `level` (`learning`/`casual`/`intermediate`/`advanced`), `position`, `is_main`. Others use `profile_sports()` (no level). |
| `availability_slots` | Self | `day_of_week` (1 = Monday … 7), `part` (`morning` < 11:00, `midday` 11:00–16:59, `evening` ≥ 17:00, local time). Others use `availability_overlap()`. |
| `pull_me_in` | Self | `sport_id`, `scope` (`connections` = people you've played with may invite you; `nearby` = anyone in a plan within your radius may). Row exists = on. |
| `blocks` | Self (as blocker) | Use `my_blocks()` for names (blocked profiles are hidden from `profiles`). |
| `reports` | Self (as reporter) | Write with `report()`. |

### Down For

| Table | Visible to | Notes |
|---|---|---|
| `intent_signals` | Self only | `sport_id`, `window_start`, `window_end`, `expires_at` (required), `audience` (`public`/`friends`), `radius_km`, `min_participants`, `place_id`, `status` (`active`/`matched`/`withdrawn`/`expired`), `matched_plan_id`. `area_lat`/`area_lng` are server-only copies of your coarse point; nobody else ever reads signal rows. Others see `down_for_nearby()`. |

### Plans

| Table / view | Visible to | Notes |
|---|---|---|
| `plan_cards` (view) | Plans you can see | Everything a plan card or the Plan screen header needs: `id`, `sport_id`, `sport_name`, `sport_family`, `title` (nullable; build "FOOTBALL TONIGHT" from sport + time when null), `starts_at`, `duration_minutes`, `capacity` (the lock threshold), `member_count`, `spots_left`, `audience`, `deadline_at`, `poll_closes_at`, `status`, **`effective_status`**, `source` (`down_for`/`quick`/`run_it_back`), `source_activity_id`, `host_id`, `created_by`, `place_id`, `place_name`, `place_area`, `place_surface`, `place_floodlit_until`, `place_is_free`, `place_lat`, `place_lng`, `level_label`, `team_a_label`, `team_b_label`, `teams_note`, `kit_note`, `cost_cents`, `currency`, `attendance_rule`, `locked_at`, `created_at`, `activity_id` (set after GAME ON), `i_am_in`. |
| `plans` | Same | Base table (subscribe to it for realtime). |
| `plan_meeting_points` | **Members and the host only** | `label` ("North pitch, by the lights"), `lat`/`lng` (nullable). The exact spot. Non-members and invitees get nothing; show "The exact pitch is shared with people in the plan only." |
| `plan_time_options` | Plans you can see | Time poll: `id`, `starts_at`, `vote_count`. No rows = no poll. |
| `plan_time_votes` | Members | `option_id` per member. Your vote: the row with your `user_id`. |
| `plan_members` | Plans you can see, minus blocked people | `user_id`, `via` (`host`/`im_down`/`down_for`/`invite`), `joined_at`. Use `plan_roster()` for the Who's In list. `member_count` can exceed the visible rows when someone in it blocked you; show the count from `plans`. |
| `plan_invites` | Inviter and invitee | `plan_id`, `inviter_id`, `invitee_id`, `kind` (`pull_in`/`run_it_back`), `status` (`pending`/`accepted`/`declined`/`revoked`/`expired`). Pending/accepted invites make the plan visible to the invitee (who's in, time, place; not the meeting point). |

**Plan visibility:** the host and members always; otherwise no block with the host and one of:
`audience = 'public'`; `audience = 'friends'` and you've played with the host; an open invite.
`invite_only` plans are visible only through an invite.

### Activities

| Table / view | Visible to | Notes |
|---|---|---|
| `activity_cards` (view) | Anyone who can see the plan, or has an attendance row | `id`, `plan_id`, `sport_id`, `sport_name`, `title`, `starts_at`, `ends_at`, `capacity`, `confirmed_count` (spots taken), `waitlist_count`, `checked_in_count`, `host_id`, `place_*`, `level_label`, `team_a_label`, `team_b_label`, `teams_note` ("Lights vs Darks. Bring both shirts."), `kit_note` ("Ball and bibs: Ade. Turf boots."), `cost_cents` (0 = Free), `currency`, `attendance_rule` (`check_in` / `check_in_host_confirms` = "Check-in at the pitch. Host confirms."), `check_in_opens_at`, `check_in_closes_at`, `check_in_radius_m` (150), `status`, **`effective_status`** (`confirmed`/`live`/`after`/`complete`/`cancelled`), `live_at`, `ended_at`, `after_closes_at` ("AFTER · OPEN UNTIL WED 9 PM"), `cancelled_at`, `my_attendance`, `place_lat`, `place_lng` (public centroid), `place_time_zone` (format times in it), `my_waitlist_position` (1-based, null unless you're waitlisted; "2 people ahead of you" = position − 1). |
| `activities` | Same | Base table (realtime). Exactly one per plan (`plan_id` unique). |
| `attendance` | Your own row; all rows of a game you're in (confirmed / checked in / host), minus blocked | `status` (`confirmed`/`waitlisted`/`cancelled`/`checked_in`), `team` (`a`/`b`), `confirmed_at`, `waitlisted_at`, `cancelled_at`, `checked_in_at` ("Host · 6:52"), `check_in_method` (`location`/`host`). No location is stored. Use `activity_roster()` for lists. |
| `location_shares` | People in that game (confirmed/checked in/host), minus blocked, **only while `expires_at` > now** | `user_id`, `lat`, `lng` (5 decimals), `started_at`, `expires_at`. Deleted when stopped, when the game ends + 30 min, or when cancelled. |
| `result_proposals` | Anyone who can see the activity | `team_a_score`, `team_b_score`, `proposed_by`, `status` (`proposed`/`verified`/`superseded`), `verification_level` (`self_recorded` → `participant_confirmed`), `confirmations_count`, `threshold`, `verified_at`. The current one has status `proposed` or `verified` (at most one). |
| `result_confirmations` | People in the game | `proposal_id`, `user_id`. Did I confirm: my row exists. |
| `moments` | People in the game, minus blocked authors | `storage_path`, `alt_text`, `caption`, `author_id`. |
| `moment_tags` | People in the game | `moment_id`, `user_id`, `tagged_by`. |
| `recaps` | Anyone who can see the activity | Permanent. `occurred_at`, `duration_minutes`, `played_count`, `team_a_label`, `team_b_label`, `team_a_score`, `team_b_score` (null when nothing was logged), `verification_level` (null, `self_recorded` or `participant_confirmed`), `confirmed_count` ("Confirmed by 6 of 8 players"), `moments_count`, `finalized_at` (set when After closes; then it never changes). |
| `passport_entries` | By the owner's `history_visibility` | One durable stamp per player per game: `activity_id`, `sport_id`, `place_id`, `occurred_at`, `minutes`, `place_game_number` ("21 GAMES" at that place), `sport_game_number`. |
| `reputation_signals` | The giver only | Profiles show counts ≥ 5 via `profile_reputation()`. |

## RPCs

Call with `supabase.rpc(name, args)`. Argument names are as listed (named arguments; defaults may be
omitted). Composite returns come back as one object; `returns table` come back as an array.

### Profile and onboarding

**`save_onboarding(p_sports jsonb, p_availability jsonb, p_discovery_radius_km int, p_pull_me_in jsonb = '[]', p_privacy jsonb = null, p_display_name text = null, p_area text = null, p_area_lat float = null, p_area_lng float = null) → profiles`**
All three onboarding steps in one transaction. Each list **replaces** what was there, so it can be
called again from settings. Sets `onboarding_completed_at` on first call.
- `p_sports`: `[{ "sport_id": "football", "level": "intermediate", "position": "Midfield", "is_main": true }]` (at most one `is_main`).
- `p_availability`: `[{ "day_of_week": 2, "part": "evening" }]` (OnboardWhen grid: Mon=1, MORNING/MIDDAY/EVENING).
- `p_discovery_radius_km`: 1, 3, 5 or 10 from the chips (1–50 accepted).
- `p_pull_me_in`: `[{ "sport_id": "football", "scope": "connections" }]`.
- `p_privacy`: `{ "sports": "everyone", "history": "friends", "availability": "crews" }` (any key may be omitted). The OnboardPrivacy chips map: Everyone → `everyone`, Friends → `friends`, My Crews → `crews`, Just me → `only_me`.
- `p_area` + `p_area_lat`/`p_area_lng`: an area label and a coarse point (the server rounds to 0.01°). Ask for the area, not the address.
- Errors: `radius_invalid`, `sport_unknown`, `invalid_argument`.
"SKIP FOR NOW" on OnboardSports: send `p_sports = []`.

**`update_profile(p_display_name, p_handle, p_area, p_area_lat, p_area_lng, p_discovery_radius_km)`** (all optional; null = unchanged) `→ profiles`. Errors: `handle_taken`, `radius_invalid`, `invalid_argument`. Handles: `^[a-z0-9_]{2,24}$`.

**`set_pull_me_in(p_sport_id, p_enabled bool, p_scope = 'connections') → bool`** Turn Pull Me In on/off for one sport ("Turn it off any time").

**`profile_view(p_user_id) → table(1 row or none)`** For the You screen (yourself) and other profiles.
Columns: `user_id`, `handle`, `display_name`, `area`, `avatar_path`, `is_me`, `onboarding_completed_at` (self only),
`ojoro_hours` (numeric, 1 decimal), `sessions`, `places`, `people_moved_with` (all null unless their
history is visible to you), `games_with_me` (null for yourself), `hosted_count`, `sports_visible`,
`history_visible`, `availability_visible`, and for yourself `sports_visibility`, `history_visibility`,
`availability_visibility` (the "Friends see your sports, Crews and Passport…" line and Edit visibility).
No row: blocked either way, or no such user; show the blocked/unavailable profile state.

**`profile_sports(p_user_id) → table(sport_id, sport_name, level, position, is_main)`** Empty when their sports aren't visible to you. `level` is null except for yourself: never render it for others, never as a score.

**`profile_reputation(p_user_id) → table(kind, confirmations)`** Kinds with ≥ 5 confirmations (`shows_up` → "SHOWS UP · 31", `respectful`, `welcomes_beginners`, `great_host`). Empty = show nothing (or the "appears after 5 confirmations" note on your own profile).

**`availability_overlap(p_user_id) → table(day_of_week, part)`** Slots you both have free, only if their availability setting includes you. For yourself: your own slots. Never show it as a calendar; show it as shared times ("You're both usually free Tue evenings").

### Safety

**`block_user(p_user_id) → bool`** Idempotent. Hides both people from each other everywhere; revokes pending invites between them. Error: `user_not_found`, `invalid_argument` (yourself).
**`unblock_user(p_user_id) → bool`** **`my_blocks() → table(user_id, display_name, blocked_at)`**
**`report(p_subject_kind, p_subject_id, p_reason, p_note = null) → uuid`** `p_subject_kind`: `profile`, `plan`, `activity`, `moment`, `result`. `p_reason`: `spam`, `harassment`, `unsafe`, `impersonation`, `inappropriate`, `other`. Errors: `subject_not_found`, `report_rate_limited`.

Report and block must be reachable from every profile, plan, activity and chat (CLAUDE.md).

### Down For

**`create_down_for(p_idempotency_key, p_sport_id, p_window_start, p_window_end, p_expires_at, p_audience = 'public', p_radius_km = null, p_min_participants = null, p_place_id = null) → down_for_state`**
`down_for_state = { signal_id, status, created, expires_at, matched_plan_id, plan_created }`.
- `p_expires_at` is required (`expiry_required`) and must be ≤ `p_window_end`. "Tonight" chips: window
  = now (or 6 PM) to 11 PM, expiry = window end.
- `p_radius_km` defaults to the profile radius. `p_audience`: `public` or `friends`.
- Idempotent twice over: the key, and "same intent" = an active signal for the same sport with an
  overlapping window → returned with `created: false`.
- May match you straight into a plan: `status: 'matched'`, `matched_plan_id` set, `plan_created` true
  when a new plan was formed. Navigate to that plan ("Ojoro matched you into a plan"). You're a
  member (via `down_for`) and can leave like anyone else.
- Errors: `sport_unknown`, `expiry_required`, `expiry_invalid`, `window_invalid`, `radius_invalid`, `place_unknown`, `invalid_argument`.

**`withdraw_down_for(p_signal_id) → signal_status`** Idempotent. A matched signal stays matched (leave the plan instead).

**`down_for_nearby(p_sport_id = null, p_limit = 50) → table(signal_id, sport_id, user_id, display_name, avatar_path, window_start, window_end, expires_at)`** People near you who are down (public signals, or friends-only from people you've played with), excluding yours and blocked people. No location, ever. Requires your coarse area (else empty). Main: "11 people near you want to play" = count of rows for the sport; `DownFor.downs` = the people.

### Plans

**`create_plan(p_idempotency_key, p_sport_id, p_starts_at, p_capacity, p_place_id, p_audience = 'public', p_title, p_deadline_at, p_time_options timestamptz[], p_poll_closes_at, p_duration_minutes, p_meeting_point text, p_meeting_lat, p_meeting_lng, p_level_label, p_team_a_label, p_team_b_label, p_teams_note, p_kit_note, p_cost_cents = 0, p_attendance_rule = 'check_in_host_confirms') → plan_state`**
Quick create. The caller hosts and is in (`member_count` 1). Capacity 2–12. Deadline defaults to an
hour before the start. `p_time_options` (≤ 4) creates a time poll that also includes `p_starts_at`;
it closes at `p_poll_closes_at` (default: the deadline).
Errors: `sport_unknown`, `place_unknown`, `capacity_invalid`, `starts_at_invalid`, `time_options_invalid`, `deadline_invalid`, `invalid_argument`.

`plan_state = { plan_id, status (effective), member_count, capacity, is_member, changed, activity_id, starts_at }`.

**`im_down(p_plan_id, p_idempotency_key) → plan_state`** I'M DOWN.
Locks the plan, checks visibility, blocks and capacity, adds you (an open invite becomes `accepted`,
`via = 'invite'`), bumps `member_count`, marks your matching Down For as matched. **At capacity it
promotes the plan in the same transaction**: `status = 'game_on'`, the time poll's winner (most votes,
earliest on ties) becomes `starts_at`, exactly one activity is created, and every member gets a
`confirmed` attendance row. The returned state then has `status: 'game_on'` and `activity_id`.
Already in → `changed: false`, nothing changes.
Errors: `plan_not_found`, `plan_unavailable`, `plan_full` (detail: activity id → offer the waitlist), `plan_expired`, `plan_cancelled`.

**`leave_plan(p_plan_id, p_idempotency_key) → plan_state`** I CAN'T MAKE IT (before GAME ON). Frees the
spot, takes back your poll vote, withdraws a Down For matched to it. If the host leaves, the
longest-standing member hosts. The last person out cancels the plan. Not in → `changed: false`.
Errors: `plan_not_found`, `plan_locked` (after GAME ON; detail: activity id → `cancel_attendance`).

**`cancel_plan(p_plan_id) → plan_state`** Host only, before GAME ON. Errors: `not_host`, `plan_locked`.

**`vote_time(p_plan_id, p_option_id) → table(option_id, starts_at, vote_count, is_mine)`** One vote per member, changeable until the poll closes. Errors: `not_member`, `poll_closed`, `option_not_found`.

**`propose_time(p_plan_id, p_starts_at) → uuid`** A member adds a time (≤ 4 options; the first extra option also adds the original time). Errors: `not_member`, `poll_closed`, `time_options_invalid`.

**`plan_roster(p_plan_id) → table(user_id, display_name, avatar_path, via, joined_at, is_host, is_me, games_with_me, is_first_game, hosted_count, position, invited_by_me)`**
Host first, then you, then by join time; blocked people omitted. Copy from the facts:
`is_host` + `hosted_count` → "Started the plan · 40 games hosted"; `is_me` + `position` → "You · midfield";
`games_with_me` → "12 games with you" (null for you); `is_first_game` → "first game";
`invited_by_me` → "joined from your invite". `avatar_path`, `position`, `games_with_me` may be null.
Errors: `plan_not_found`.

**`plans_nearby(p_sport_id = null, p_until = now + 7 days, p_limit = 20, p_max_km = your radius) → table(plan_id, sport_id, sport_name, title, starts_at, capacity, member_count, effective_status, place_id, place_name, place_area, host_id, i_am_in, distance_km)`** Forming plans you can see, starting before `p_until`, within your radius of your coarse area (all visible plans if you have no area), soonest first. `distance_km` is from your area, 1 decimal (null without an area). "FORMING NEAR YOU".

**`still_on_nearby(p_plan_id, p_within_hours = 24, p_limit = 5) → same columns`** For an expired (or full) plan: forming plans in the same sport family (volleyball ↔ beach volleyball), with spots, starting within `p_within_hours`, within **twice** your radius, that you can see and aren't in. "STILL ON TONIGHT". If empty, show "TRY AGAIN THIS WEEKEND" (Create).

### Need One More / Pull Someone In

**`pull_in_quota(p_plan_id) → table(used, remaining, quota)`** "You can send 3 more invites for this plan." Members only (no row otherwise).

**`pull_in_candidates(p_plan_id, p_limit = 20) → table(user_id, display_name, avatar_path, games_with_me, pull_me_in, free_at_plan_time, plays_sport, already_invited)`**
People you may invite, ranked by likelihood to say yes: Pull Me In on for this sport first, then free
at the plan's time (only when their availability setting includes you), then games together. Only
people `pull_in` accepts are listed (connections, or Pull Me In `nearby` within their radius of the
place); members and blocked people never. Reason line from the facts: "6 games with you",
"Pull Me In is on for football", "free tonight". Errors: `plan_not_found`, `not_member`.

**`pull_in(p_plan_id, p_invitee_ids uuid[], p_idempotency_key) → pull_in_result { sent, skipped, remaining }`**
All or nothing. 3 pull-in invites per plan per inviter (and 20 a day). People already in or already
invited are skipped (`skipped`), not counted. Allowed invitee: no block with you or the host, and
either connected to you (played together) or Pull Me In `nearby` for the sport. The invitee sees who's
in, the time and the place, nothing else (no meeting point, no chat).
Errors: `plan_not_found`, `not_member`, `plan_full`, `plan_expired`, `invite_not_allowed` (detail: invitee id; remove them and retry), `invite_quota_exceeded` (detail: invites left), `invite_rate_limited`.

**`decline_invite(p_invite_id) → invite_status`** Invitee only, idempotent. Accepting = `im_down`.

### Activity and attendance

`attendance_state = { activity_id, status, waitlist_position, confirmed_count, waitlist_count, checked_in_count, capacity, changed, promoted_user_id }` (`status` is yours; null if you have no row).

**`join_waitlist(p_activity_id, p_idempotency_key) → attendance_state`** After GAME ON. A free spot before check-in opens → `confirmed`; otherwise `waitlisted` with `waitlist_position` ("2 people ahead of you" = position − 1). Already confirmed/waitlisted → `changed: false`. Errors: `activity_not_found`, `activity_cancelled`, `activity_started`, `plan_unavailable`.

**`cancel_attendance(p_activity_id, p_idempotency_key) → attendance_state`** I CAN'T MAKE IT ANYMORE, or leave the waitlist. Frees the spot and, **until check-in opens**, promotes the first person on the waitlist in the same transaction (`promoted_user_id`). Stops your location share. Repeat → `changed: false`. Errors: `activity_not_found`, `not_attending`, `activity_started`.

**`check_in(p_activity_id, p_lat, p_lng, p_idempotency_key) → attendance_state`** CHECK IN. Inside `[check_in_opens_at, check_in_closes_at)` (opens 30 min before the start, closes at the end) and within `check_in_radius_m` (150 m) of the meeting point (or the place centroid when the plan has no meeting point coordinates). The position is compared and discarded; only `check_in_method = 'location'` and the time are stored. Errors: `activity_not_found`, `not_attending`, `activity_cancelled`, `check_in_not_open` (detail: opens at), `check_in_closed`, `location_required`, `check_in_unavailable`, `too_far` (detail: metres).

**`host_check_in(p_activity_id, p_user_id) → attendance_state`** Host confirms someone ("Host confirms"), from check-in opening until After closes. Errors: `not_host`, `not_attending`, `check_in_not_open`, `check_in_closed`.

**`assign_team(p_activity_id, p_user_id, p_team 'a'|'b') → bool`** Host only.

**`start_activity(p_activity_id) → activity_status`** Host starts the game (from check-in opening). **`end_activity(p_activity_id)`** FULL TIME: After starts now and stays open 24 h; location shares end. **`cancel_activity(p_activity_id)`** Host, before the start. Also cancels the plan, so `plan_cards.effective_status` reads `cancelled`. Errors: `not_host`, `activity_started`, `activity_not_live`, `check_in_not_open`.

**`activity_roster(p_activity_id) → table(user_id, display_name, avatar_path, status, team, is_host, is_me, checked_in_at, waitlisted_at, games_with_me, invited_by_me, position)`**
Confirmed and checked-in people (waitlisted only for the host and yourself), host first, then you,
then by arrival. `checked_in_at` and the `checked_in` status are shown only to people in the game
(others see `confirmed`). Activity: "Host · Lights", "You · Darks", "joined from your invite";
CheckIn arrivals: `checked_in_at` → "Host · 6:52", else "Not checked in yet". "2 on the waitlist"
comes from `activity_cards.waitlist_count`.

**`share_location(p_activity_id, p_lat = null, p_lng = null, p_until = null) → location_share_state { activity_id, sharing, expires_at }`**
Start or move your live location for this game only. Ends by itself at `expires_at` = the game's end
+ 30 minutes at the latest ("until 9:30. Then it stops by itself."); `p_until` can only shorten it.
Call again with a new position to move it (the end time never extends). Confirmed/checked-in people
only, from an hour before check-in opens until the end + 30 min. Errors: `activity_not_found`,
`not_attending`, `share_not_allowed`, `invalid_argument`.

**`stop_sharing_location(p_activity_id) → location_share_state`** STOP SHARING. Idempotent.

### After, Recap, Run It Back

`result_state = { proposal_id, activity_id, status, team_a_score, team_b_score, confirmations_count, threshold, verification_level, recap_id }`.

**`propose_result(p_activity_id, p_team_a_score, p_team_b_score, p_idempotency_key) → result_state`**
Host during Live, any player in After. A new proposal supersedes an unverified one (SUGGEST A FIX).
The proposer's own confirmation counts when they played. Errors: `not_player`, `result_not_open`, `result_already_verified`, `invalid_argument`.

**`confirm_result(p_proposal_id, p_idempotency_key) → result_state`** CONFIRM. Players only, Live or After.
`threshold` = half the players who checked in, rounded up, minimum 2 ("3 of 8 confirmed. At 4 it
becomes Participant confirmed."). At the threshold: `status = 'verified'`, `verification_level =
'participant_confirmed'`, and the **Recap and every player's Passport stamp are created**
(`recap_id`). Confirmations keep counting until After closes. Errors: `proposal_not_found`, `not_player`, `proposal_superseded`, `result_not_open`.

**`add_moment(p_activity_id, p_storage_path, p_alt_text = null, p_caption = null, p_tagged_user_ids = '{}') → uuid`** Register a photo after uploading it (see [Storage](#storage-moments)). Players only, during Live and After; tags must be players. Errors: `not_player`, `moments_closed`, `moment_path_invalid`, `invalid_argument`. Always send `p_alt_text` (the Image component needs it).
**`untag_me(p_moment_id) → bool`** Anyone tagged, any time. **`remove_moment(p_moment_id) → bool`** Author; then delete the storage object.

**`give_reputation(p_activity_id, p_subject_id, p_kind) → bool`** A player vouches for another player of that game during After. Idempotent.

**`recap_people(p_activity_id) → table(user_id, display_name, avatar_path, team, games_with_me, is_first_with_me)`** Players and the host only. "First game with Lena and Joel. 12th with Marcus." (`games_with_me` includes this game). PLAYED WITH = these rows. Error: `not_player`.

**`recap_for_me(p_activity_id) → table(passport_entry_id, occurred_at, minutes, ojoro_hours, place_id, place_name, place_game_number, sport_game_number, first_at_place)`** Your stamp: "ADDED TO YOUR PASSPORT · 21 games at Jeanne-Mance since March" (`place_game_number`, `first_at_place`), "+1.5 Ojoro hours". Empty if you didn't play or the recap isn't created yet.

**`run_it_back(p_activity_id, p_starts_at, p_idempotency_key) → run_it_back_state { plan_id, created, invites_sent, starts_at, chain_length }`**
A **new** plan from a finished game (After or complete): same sport, place, capacity, audience,
details and meeting point, at `p_starts_at` (≥ 1 h ahead). Everyone who played (except the caller)
gets a `run_it_back` invite. **Nobody is a member, not even the caller, and no attendance is copied**:
everyone, the caller included, taps I'M DOWN on the new plan. If another player already ran it back
to the same time, that plan is returned (`created: false`). `chain_length` = games in this chain
including the new one; at 3 the screen offers a Ritual (not built in Slice 01).
Errors: `not_player`, `activity_not_finished`, `starts_at_invalid`, `activity_not_found`.

## Down For matching

Deterministic, in `private.match_signal`, run inside `create_down_for` under a per-sport advisory
lock (so two signals can't form two plans at once):

1. **Join an existing plan.** A forming plan, same sport, not full, before its deadline, starting
   inside the signal window, visible to you, with no block between you and any member, and at your
   preferred place or within your radius of your coarse area. Best = most members, then earliest
   start, then id. You join it as if you tapped I'M DOWN (`via = 'down_for'`; it can lock the plan).
2. **Otherwise form a plan from compatible signals.** Other active signals for the same sport whose
   area is within the smaller of the two radii, whose audience allows you (and yours them), and with
   no block inside the group. Oldest first, up to the sport's default capacity. The start `t` begins
   as the later of your window start and about an hour from now (15-minute boundary) and moves to
   the latest window start in the group; a signal joins only if every window in the group contains
   `t`. People whose `min_participants` the group can't meet are dropped once; the plan needs at
   least 2 people and everyone's minimum. Place: your preferred one, else the nearest place for the
   sport within your radius, else none yet ("place to be agreed"). Audience: `friends` if any signal
   is friends-only, else `public`. Host: you. Deadline: an hour before `t` (at least 10 minutes from
   now). All matched signals become `matched`.
3. **Otherwise** your signal stays active and appears in `down_for_nearby()` for others.

A signal without a coarse area (no area in the profile) only matches plans at its preferred place.

## Realtime

Supabase Realtime `postgres_changes`. RLS applies: a subscriber receives only rows it can select.
Use the descriptors from `@ojoro/contracts` (`planSubscription(id)` etc.):

```ts
const sub = planSubscription(planId);
const channel = supabase.channel(sub.channel);
for (const change of sub.changes) channel.on('postgres_changes', change, onChange);
channel.subscribe((status) => { if (status === 'SUBSCRIBED') refetchPlan(); });
```

| Screen | Channel | Table · event · filter | Do |
|---|---|---|---|
| Plan, NeedOneMore | `plan:{planId}` | `plans` · UPDATE · `id=eq.{planId}` | New `member_count` (count ticks, gather motion), `status`. **`status` becoming `game_on` is the GAME ON signal**: every member gets this same UPDATE from the same commit. Show the GameOn takeover, then fetch `plan_cards.activity_id`. `expired`/`cancelled` → expired state. |
| | | `plan_members` · INSERT · `plan_id=eq.{planId}` | Someone joined ("JUST NOW · JOEL MADE IT 8"); refetch `plan_roster`. Leaves arrive as the `plans` UPDATE (DELETE events can't be filtered); refetch the roster when `member_count` drops. |
| | | `plan_time_options` · UPDATE · `plan_id=eq.{planId}` | Poll counts. |
| Activity, CheckIn, Live, After, Recap | `activity:{activityId}` | `activities` · UPDATE · `id=eq.{activityId}` | Status (live, after, complete), counts, `after_closes_at`. |
| | | `attendance` · * · `activity_id=eq.{activityId}` | Arrivals, cancellations, waitlist promotion (yours: your row turns `confirmed`). |
| | | `location_shares` · * · `activity_id=eq.{activityId}` | Live positions in this game. Drop a share locally at its `expires_at` even without an event. |
| | | `result_proposals` · * · `activity_id=eq.{activityId}` | Score logged, confirmations count, verified. |
| | | `moments` · INSERT · `activity_id=eq.{activityId}` | New photo. |
| | | `recaps` · * · `activity_id=eq.{activityId}` | Recap created / finalized. |
| Home, Updates | `invites:{userId}` | `plan_invites` · * · `invitee_id=eq.{userId}` | Pull-in and Run It Back invites. |

Rules: realtime is a hint, not the source of truth. On `SUBSCRIBED` (including every reconnect) and
when the app returns to the foreground, refetch the screen's reads. While disconnected, show the last
count with its age (States: "Offline. Showing the last count from 7:02."). Time-based changes (plan
expiry, live/after/complete) reach subscribers within about a minute (the job), so also schedule a
local re-render at `deadline_at`, `starts_at`, `ends_at` and `after_closes_at` using the effective
status helpers. Published tables: `plans`, `plan_members`, `plan_time_options`, `plan_invites`,
`activities`, `attendance`, `location_shares`, `result_proposals`, `moments`, `recaps`.

## Time rules

All times are `timestamptz` (ISO strings). Show them in the place's `time_zone` (America/Toronto for
Montréal).

| Object | Rule |
|---|---|
| Down For | Every signal has `expires_at` ≤ `window_end` (required). Window ≤ 24 h, starts within 14 days. Expired signals stop matching and showing immediately; the job marks them `expired`. |
| Plan | `forming` until `member_count = capacity` (→ `game_on`, atomic) or `deadline_at` passes (→ `expired`, effective immediately, stored by the job). Default deadline: an hour before the start. Run It Back plans: an hour before. Poll closes at `poll_closes_at` (default: the deadline); the winner becomes the start time at GAME ON. Nobody is charged or marked as a no-show when a plan expires. |
| Activity | `confirmed` → `live` at `starts_at` (or when the host starts it) → `after` at `ends_at` (or FULL TIME) → `complete` at `after_closes_at` (end + 24 h); `cancelled` by the host before the start. Check-in: `starts_at − 30 min` until `ends_at`. Waitlist auto-promotion: until check-in opens. Cancelling attendance: until the start. |
| Location share | Only while `expires_at` > now; at most the game's end + 30 min. RLS hides expired rows; the job deletes them. |
| Results | Host may log during Live; anyone who played during After. Closed when After closes. |
| Recap | Created when the result is verified, or when After closes (with or without a result). Frozen (`finalized_at`) when After closes. Passport stamps are created with the recap for everyone who checked in. |
| Job | `private.tick()` every minute (pg_cron job `ojoro_tick`): expires plans, invites and signals, moves activities to live/after/complete, creates and freezes recaps, deletes expired location shares, drops idempotency keys older than 7 days. Correctness never depends on it; realtime timing does. |

## Storage: moments

Bucket `moments` (private, 10 MB, JPEG/PNG/WebP/HEIC). Object name:
`{activityId}/{yourUserId}/{uuid}.jpg`.

1. Upload: `supabase.storage.from('moments').upload(path, file)`. Allowed for people who checked in to
   that game, while it's Live or in After, into their own folder only.
2. Register: `rpc('add_moment', { p_activity_id, p_storage_path: path, p_alt_text, p_caption, p_tagged_user_ids })`.
3. Show: `createSignedUrl(path, ttl)`; readable by people in the game (confirmed, checked in, host).
4. Remove: `rpc('remove_moment')`, then `storage.remove([path])` (uploader only).

"Only the 8 who played can add photos. Anyone can be untagged." → `untag_me`.

## Analytics

The server records the authoritative events in `private.analytics_events` (not readable by clients;
drained once an analytics provider is chosen): `down_for_created`, `plan_created`, `im_down_committed`,
`plan_threshold_changed`, `game_on_reached`, `friend_pulled_in`, `activity_started`,
`activity_completed`, `run_it_back`. The client still sends UI events from `@ojoro/analytics`
(`screen_viewed`, `im_down_tapped`, `cta_tapped`, `need_one_more_shown`, `activity_opened`,
`recap_viewed`, …). Don't send a client copy of a server event; send the tap (`im_down_tapped`) and
let the server send the commit (`im_down_committed`).

## Screens

What each Slice 01 screen calls. "Sub" = realtime channel. Every screen also needs the loading
(skeleton after 300 ms), empty, offline (last-known state + age), privacy and error states.

| Screen | Reads | Writes | Sub |
|---|---|---|---|
| **Welcome** | none | Phone: `auth.signInWithOtp({ phone })` → `auth.verifyOtp({ phone, token, type: 'sms' })`. Apple/Google: not configured locally. After sign-in: `profiles.onboarding_completed_at` null → onboarding. | none |
| **OnboardSports** | `sports` (order by `sort_order`) | Kept in memory; sent with `save_onboarding` at the end. | none |
| **OnboardWhen** | none | In memory: availability grid, radius chip, Pull Me In per chosen sport. | none |
| **OnboardPrivacy** | Defaults from `privacy_settings` (own row) | **LET'S MOVE** → `save_onboarding(...)` with all three steps (and area if collected). | none |
| **Main** (Home) | `down_for_nearby(sport)` (count + people), own `intent_signals` (active), `plans_nearby()` (FORMING NEAR YOU), `plan_cards` where `i_am_in` and effective forming/game on, latest `recaps` for your last game (via `activity_cards` + `recaps`) | `create_down_for` from the DownFor block | `invites:{me}` |
| **Plan** | `plan_cards` (id), `plan_roster`, `plan_time_options` + own `plan_time_votes`, `plan_meeting_points` (members), `places` details through `plan_cards`; expired → `still_on_nearby` | `im_down`, `leave_plan` (I CAN'T MAKE IT), `vote_time`, `propose_time`, `report`, `block_user` | `plan:{id}` |
| **NeedOneMore** | `pull_in_quota`, `pull_in_candidates` | `pull_in` (SEND n INVITES) | `plan:{id}` |
| **GameOn** | `plan_cards` (`activity_id`, time, place), `plan_roster` | none (OPEN THE GAME → Activity; ADD TO CALENDAR / DIRECTIONS are device actions using `starts_at`, `ends_at`, place name and, for members, the meeting point) | `plan:{id}` |
| **Activity** | `activity_cards`, `activity_roster`, `plan_meeting_points` (via `plan_id`), `checkInWindowState()` for the CHECK IN button ("Opens at 7:00 when you're within 150 m") | `check_in`, `cancel_attendance` (I CAN'T MAKE IT ANYMORE), `join_waitlist` (non-members), host: `assign_team`, `start_activity`, `cancel_activity` | `activity:{id}` |
| **CheckIn** | `activity_cards` (counts: "6 of 8 have arrived"), `activity_roster` (arrivals with `checked_in_at`), own `location_shares` row (`expires_at` → "until 9:30") | `check_in`, `share_location`, `stop_sharing_location`, host: `host_check_in` | `activity:{id}` |
| **After** | `activity_cards` (`after_closes_at`), current `result_proposals` (status in proposed/verified), own `result_confirmations`, `moments` + `moment_tags` (signed URLs) | `confirm_result` (CONFIRM), `propose_result` (SUGGEST A FIX), storage upload + `add_moment` (ADD PHOTOS), `untag_me`, `give_reputation` | `activity:{id}` |
| **Recap** | `recaps` (score, `played_count`, `duration_minutes`, `confirmed_count`, `verification_level`), `recap_people`, `recap_for_me`, `moments` | RUN IT BACK → RunItBack; SHARE RECAP is a device share | `activity:{id}` |
| **RunItBack** | `activity_cards` (last time and place), `recap_people` (the same 8) | `run_it_back(activity_id, starts_at)` then open the new plan (`plan:{newId}`); the caller taps I'M DOWN there like everyone else | none |
| **You** | `profile_view(me)`, `profile_sports(me)`, `profile_reputation(me)`, `availability_overlap(me)` (your own slots: "Usually free Tue and Thu evenings"), `passport_entries` (own, recent), `privacy_settings` | `update_profile`, `save_onboarding` (edit), `set_pull_me_in`, privacy edits | none |
| **States** | Expired: `still_on_nearby`; couldn't join: `plan_full` → `join_waitlist` with `waitlist_position` | | |

## Local data

`supabase db reset` loads `supabase/seed.sql` (local only; times relative to now, Montréal):

| Sign in as | Phone (code 123456) |
|---|---|
| Chimdi O (the "you" user) | +1 555 555 0100 |
| Ade B (host) | +1 555 555 0101 |
| Marcus T | +1 555 555 0102 |
| Lena R (new; onboarding not finished) | +1 555 555 0103 |

Seeded: places (Jeanne-Mance Park, Parc La Fontaine, Parc Jarry, Lachine Canal, Hoshino Boxing);
**Football tonight** at Jeanne-Mance, 6/8 forming, poll 7:30 (4) vs 8:00 (2), meeting point "North
pitch, by the lights", Down For from Joel, Tolu and Ife; **Volleyball** last night at Parc La Fontaine,
3/8 expired (Chimdi was in) → STILL ON TONIGHT shows **Beach volleyball** 7:00 at Parc Jarry, 5/8;
**Basketball** Saturday 10:00, 5/8; a football game that ended about two hours ago in **After**
(Ade logged 5–4, 3 of 8 confirmed, Chimdi hasn't); last week's **LIGHTS WIN 5–4**, complete with a
recap; eleven earlier Thursday FC games (history, "12 games with you", Passport, reputation).
"Tonight" is 7:30 PM Montréal time, or three hours from now when 7:30 PM is less than two hours away.

## Not in Slice 01

Chat (Activity chat preview), notifications/push, payments (cost is display-only), Crews, Clans,
Friends (stand-in: people you've played with), Challenges, Rituals, live score updates and spectators
(LiveActivity beyond start/end), Apple/Google sign-in configuration, appeals for reputation and
moderation tooling (reports are stored, not reviewed).
