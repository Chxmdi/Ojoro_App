# Step 4: Messaging and feed backend contract

The data layer for Step 4 (PRD M5): **Notifications** (Updates and the bell), **Crews** (the minimum
chat needs), **crew chat and activity chat**, **Make This a Game**, **Live** (score, updates,
reactions, followers) and the **action feed** on Main. It extends
[`SLICE01_CONTRACT.md`](SLICE01_CONTRACT.md) and [`LIQUIDITY_CONTRACT.md`](LIQUIDITY_CONTRACT.md):
every rule there (write only through RPCs, map errors by code, idempotency keys, effective status, no
raw location) still applies. Judgment calls are in `docs/DESIGN_DECISIONS.md` ("Step 4 backend").

- Schema: `supabase/migrations/20261029150000_messaging_enums.sql`, `…150100_messaging_crews_chat.sql`,
  `…150200_messaging_notifications.sql`, `…150300_messaging_live_suggestions_feed.sql`.
- Generated types: `@ojoro/contracts` (`Database`), plus row aliases `NotificationRow`,
  `HomeFeedCard`, `ChatMessage`, `ChatSuggestion`, `LiveState`, `LiveUpdate` and enum aliases
  `NotificationType`, `NotificationObject`, `ReactionWord`, `CrewRole`, `UpdateKind`.
- Client helpers in `@ojoro/contracts` (`messaging.ts`): `messagingRpcs`, `messagingIdempotentRpcs`
  (also in `idempotentRpcs`), `messagingVolatileReadRpcs`, `messagingErrorCodes` (also in
  `ojoroErrorCodes`), `groupNotifications`, `liveClockSeconds`, `liveFreshnessSeconds`,
  `reactionWords`, realtime descriptors `notificationsSubscription`, `crewChatSubscription`,
  `activityLiveSubscription`, `activityChatSubscription`, and the limits `MESSAGES_PER_MINUTE` (20),
  `LIVE_UPDATES_PER_MINUTE` (6), `MESSAGE_MAX_LENGTH` (1000), `LIVE_UPDATE_MAX_LENGTH` (280),
  `CREW_MAX_MEMBERS` (50), `PUSH_THROTTLE_MINUTES` (30), `HOME_FEED_MAX_CARDS` (12).
- Tests: `supabase/tests/12_crews_chat.sql`, `13_notifications.sql`, `14_make_this_a_game.sql`,
  `15_live.sql`, `16_home_feed.sql`.

Contents: [Rules](#rules) · [Errors](#errors) · [Privacy](#privacy) ·
[Notifications](#notifications) · [Delivery (not built)](#delivery-would-send-only) ·
[Crews](#crews) · [Chat](#chat) · [Make This a Game](#make-this-a-game) · [Live](#live) ·
[Main: home_feed](#main-home_feed) · [Changes to Slice 01 objects](#changes-to-slice-01-objects) ·
[Realtime](#realtime) · [Analytics](#analytics) · [Screens](#screens) · [Local data](#local-data) ·
[Not built](#not-built)

---

## Rules

1. **Write only through the RPCs below.** New tables are readable through RLS (members only, own rows
   only, as listed); clients have no INSERT/UPDATE/DELETE on any of them.
2. **Idempotent:** `create_crew`, `send_message`, `make_this_a_game`, `post_update` take
   `p_idempotency_key` (one uuid per user intent; reuse it on every retry). Set-to-state operations
   (`join_crew`, `leave_crew`, `remove_crew_member`, `dismiss_suggestion`, `follow_activity`,
   `unfollow_activity`, `log_score` per value, `delete_message`, `mark_notifications_read`,
   `act_on_notification`) are safe to repeat without a key. `react` **toggles**: don't retry it
   blindly; refetch and compare.
3. **`chat_suggestions` is VOLATILE** (it runs detection): call `supabase.rpc('chat_suggestions', …)`
   (POST), never `{ get: true }`.
4. **Nullable columns** in `returns table` RPCs are marked below; the generated types say non-null
   (Slice 01 rule 7). Treat them as `T | null`.
5. **Words are suggestions.** `my_notifications().title/body` and `home_feed().title/reason` are plain
   English built from facts; the app may show them or compose its own from the other columns. Never
   add adjectives the data doesn't support. No emoji, no exclamation marks.
6. **Links:** every notification and feed card carries `href`, a route in the app
   (`/plan/{id}`, `/plan/{id}/game-on`, `/plan/{id}/pull-in`, `/activity/{id}`,
   `/activity/{id}/check-in`, `/activity/{id}/live`, `/activity/{id}/after`, `/activity/{id}/recap`,
   `/activity/{id}/chat`, `/crew/{id}`, `/crew/{id}/chat`). Back from any of them goes to Updates or
   Home (PRD §8.2).

## Errors

All `P0001`, the code is `error.message` (`toOjoroError`). Suggested words for
`apps/mobile/src/lib/errorMessages.ts`:

| Code | Raised by | Meaning | Suggested words |
|---|---|---|---|
| `crew_not_found` | crew RPCs, `send_message`, `crew_messages`, `chat_suggestions` | No such crew, or you're not in it (never says which). | "This crew isn't available." |
| `not_crew_member` | `transfer_crew_ownership`, `set_crew_role` | The person isn't in the crew. | "They're not in this crew." |
| `not_crew_admin` | `crew_invite_code`, `remove_crew_member`, `transfer_crew_ownership`, `set_crew_role` | Your role can't do that. | "Only the crew's owner or admins can do that." |
| `cannot_remove_owner` | `remove_crew_member` | The owner can't be removed. | "The owner can't be removed. They can hand the crew over first." |
| `owner_must_transfer` | `leave_crew` | Owners hand over before leaving (unless they're the last one in). | "Hand the crew to someone else before you leave." |
| `crew_full` | `create_crew`, `add_crew_members`, `join_crew` | 50 members. `detail` = `50`. | "Crews hold up to 50 people." |
| `crew_member_not_allowed` | `create_crew`, `add_crew_members` | Not someone you've played with, or a block. Never says which. `detail` = their id: remove them and retry. | "You can only add people you've played with." |
| `crew_rate_limited` | `create_crew` | More than 5 crews in 24 h. | "You've started a lot of crews today. Try again tomorrow." |
| `invite_code_invalid` | `join_crew` | Wrong or rotated code, archived crew, or a block (never says which). | "That invite code doesn't work." |
| `message_not_found` | `delete_message`, `edit_message`, `send_message` (`p_reply_to`) | Gone, deleted, or not in a chat you can read. | "That message isn't available." |
| `message_invalid` | `send_message`, `edit_message`, `post_update` | Empty or too long. `detail` = `1-1000` (messages) or `1-280` (live updates). | "Messages are 1 to 1,000 characters." / "Updates are 1 to 280 characters." |
| `message_rate_limited` | `send_message`, `post_update` | Over 20 messages (or 6 live updates) a minute. `detail` = the limit. | "Slow down a little. Try again in a minute." |
| `chat_closed` | `send_message` (activity chat) | The game is complete or cancelled. | "This game's chat is closed." |
| `suggestion_not_found` | `make_this_a_game`, `dismiss_suggestion` | No such suggestion in a crew you're in. | "That suggestion isn't available anymore." |
| `suggestion_expired` | `make_this_a_game` | Its times passed or it was replaced. | "That plan's time has passed. Suggest a new one in the chat." |
| `not_scorekeeper` | `log_score` | Only the host keeps score (players too when the game is check-in only). | "Only the host logs the score for this game." |
| `update_not_found` | `delete_update`, `react` | The update is gone or hidden from you. | "That update isn't available." |
| `notification_not_found` | `act_on_notification` | Not your notification. | "That update isn't available anymore." |
| `push_token_invalid` | `register_push_token` | Not an Expo push token, or no platform. | "Notifications couldn't be turned on for this device." |

Existing codes reused here: `not_authenticated`, `idempotency_key_required`,
`idempotency_key_reused`, `invalid_argument` (detail says which), `sport_unknown`, `activity_not_found`,
`activity_cancelled`, `activity_not_live` (also "can't follow a finished game" and "reactions are for
Live and After"), `not_attending` (activity chat and live updates for people not in the game),
`not_author` (edit/delete someone else's message or update), `not_member`, `plan_not_found`,
`time_options_invalid`, `starts_at_invalid`, `deadline_invalid`, `capacity_invalid`, `place_unknown`,
`subject_not_found`.

## Privacy

- **Blocks.** Blocked pairs never see each other's messages, live posts, crew membership rows,
  notifications or names in notifications, in either direction. In a chat, the **blocker** gets a
  placeholder row (`is_hidden = true`, no sender, no words) so the conversation doesn't look broken;
  show runs of them collapsed ("1 message hidden" / "3 messages hidden"). The **blocked** person gets
  no trace (no placeholder), so a block is never revealed. Realtime follows RLS (neither side gets
  the other's events). Nobody can be added to, or join, a crew where someone has a block with them,
  and mentions never cross a block. There are no direct messages, so "can't DM" holds by construction.
- **Notifications** are created only for people who can see the object at that moment, never for
  the actor, never across a block with the actor. Every read re-checks: if the object becomes hidden
  (invite declined, removed from the crew, plan cancelled for invitees) or every actor is now blocked,
  the row disappears from `my_notifications`, `unread_count` and RLS. Rows store event facts only
  (`data`, e.g. `{"change": "cancelled"}`), never message words or meeting points. Words are built at
  read time from objects the reader can see.
- **Locked screens.** Pushes default to no details: title "Ojoro" and a generic sentence per type
  ("A plan you're in is on."), never who, what or where (PRD §9.19), until the person turns
  `show_details` on.
- **Chat words stay in the chat.** Make This a Game reads the last 20 messages of the last 6 hours
  and stores only derived facts (sport, times, place ids, member ids). Analytics never get message
  words, recipients or mention targets.
- **Live.** Followers see the score, the clock, posts and reaction counts. They never see
  attendance, check-ins (check-in posts are participants-only), or location (`location_shares` RLS
  is unchanged: people in the game only). Who reacted and who follows are never listed; only counts.
- **Crews** are private: members only (RLS). Availability shows as overlap counts ("4 free tonight",
  "9 of 14 are free Saturday"), counting only people whose availability setting includes you.

## Notifications

### Tables

| Table | Visible to | Notes |
|---|---|---|
| `notifications` | Recipient, while the object is visible | `id`, `recipient_id`, `type` (enum below), `object_kind` (`plan` / `activity` / `crew` / `challenge`), `object_id` (the canonical object), `plan_id`, `activity_id`, `crew_id`, `message_id` (nullable helpers for the link), `actor_ids` (latest first, ≤ 5; empty when Ojoro is the actor), `actor_count`, `count` (events merged into this row), `bundle_key`, `data` (jsonb facts), `created_at`, `updated_at` (last event; sort by it), `read_at`, `acted_at`, `pushed_at` (delivery layer). Prefer `my_notifications()`, which filters blocked actors and adds words, section, action and link. |
| `notification_settings` | Own | `type`, `push` (no row = on). |
| `notification_preferences` | Own | `quiet_hours_enabled` (true), `quiet_start` (23:00), `quiet_end` (07:00), `show_details` (false). No row = these defaults. |
| `notification_mutes` | Own | `object_kind`, `object_id`, `until` (null = until unmuted). |
| `push_tokens` | Own | `token` (Expo), `platform` (`ios`/`android`/`web`), `last_seen_at`. |

### Types (`notification_type`)

| Type | When (generated by) | To | Object · link | Section `needs_you` while | Action |
|---|---|---|---|---|---|
| `need_one_more` | Plan reaches capacity − 1 (trigger on `plans`) | Members, and up to 20 Pull Me In people for the sport who can see the plan, have no block with anyone in it, and are connected to someone in it (`connections`) or within their radius of the place (`nearby`); `data.pull_me_in = true` for them | plan · `/plan/{id}` (members: `/plan/{id}/pull-in`) | forming with a spot left | members `pull_in`, others `im_down` |
| `game_on` | Plan forming → GAME ON | Members | plan · `/plan/{id}/game-on` | never | `open` |
| `participant_update` | Someone joins/leaves a forming plan (bundled per plan); someone cancels attendance (bundled per activity) | Host | plan or activity | never | `open` |
| `activity_changed` | Host cancels a forming plan (`data.change = 'cancelled'`); an activity is cancelled, or its time or place changes (`'time'`/`'place'`) | Members / people in the game and waitlist | plan or activity | never | `open` |
| `check_in_open` | 15 min before check-in opens (minute job) | Confirmed attendees | activity · `/activity/{id}/check-in` | window open and you're confirmed (not checked in) | `check_in` |
| `live` | Activity goes live | Followers | activity · `/activity/{id}/live` | never | `open` |
| `result_to_confirm` | A score is proposed | Players (checked in) except the proposer | activity · `/activity/{id}/after` | current proposal unconfirmed by you, Live/After | `confirm_result` |
| `recap_ready` | Recap created | Players | activity · `/activity/{id}/recap` | never | `open` |
| `pull_in_invite` / `run_it_back_invite` | Invite created | Invitee | plan · `/plan/{id}` | invite pending, plan forming with a spot | `im_down` |
| `waitlist_promoted` | Waitlisted → confirmed | That person | activity · `/activity/{id}` | never | `open` |
| `crew_poll` | MAKE THIS A GAME with 2+ times | Crew members except the tapper | plan · `/crew/{id}/chat` | poll open and you haven't voted | `vote` |
| `crew_plan` | MAKE THIS A GAME with one time | Crew members except the tapper | plan · `/plan/{id}` | forming with a spot, you're not in | `im_down` |
| `mention` | `@handle` or `p_mention_ids` in `send_message` (bundled per thread) | Mentioned people in the thread | crew · `/crew/{id}/chat`, or activity · `/activity/{id}/chat` | unread | `reply` |
| `crew_member_joined` | Someone is added or joins with a code (bundled per crew) | Other members | crew · `/crew/{id}` | never | `open` |
| `challenge_response` | Placeholder for M6. Nothing generates it. | | | | |

**Bundling:** one open (unread, not acted on) row per person and `bundle_key`; a repeat event updates
it (`count + 1`, actor first, `updated_at = now()`) instead of adding a row. Keys:
`participant_update:{plan|activity}`, `need_one_more:{plan}`, `game_on:{plan}`, `invite:{plan}`,
`changed:{plan|activity}`, `check_in:{activity}`, `live:{activity}`, `result:{activity}`,
`recap:{activity}`, `waitlist:{activity}`, `crew_plan:{plan}`, `mention:{crew|activity}`,
`crew_joined:{crew}`. Once read, the next event starts a new row.

**Rate limit (PRD §9.19):** threshold-type types (`participant_update`, `need_one_more`,
`crew_member_joined`, `mention`) are bundled in-app and pushed at most once per bundle per 30 min
(`would_send` → `rate_limited`). Members are not told about every join, only the host is.

### RPCs

**`my_notifications(p_limit = 50) → table(…)`** Updates. Sorted needs_you first, then today, then
earlier; newest first within each. Columns: `id`, `type`, `section` (`needs_you` | `today` |
`earlier`; today = updated since local midnight in your profile time zone), `needs_you` (bool),
`action` (table above), `href`, `object_kind`, `object_id`, `plan_id`*, `activity_id`*, `crew_id`*,
`message_id`*, `actor_ids` (blocked removed), `actor_names`, `actor_count`, `count`, `title`*,
`body`*, `data`, `created_at`, `updated_at`, `read_at`*, `acted_at`*. (* nullable.) Group with
`groupNotifications(rows)`. Examples of the words: "Basketball needs one more." / "Sat 10:00 · Parc La
Fontaine · 7 / 8. You have Pull Me In on for basketball."; "Thursday FC: what time Saturday?" /
"Lena R started a poll · 9 votes so far"; "GAME ON · football Thu 6:30" / "All 8 are in. 6:30,
Jeanne-Mance Park."; "Recap ready: Lights win 5–4" / "Add photos until Wed 9:00"; "Lena R joined
Thursday FC" / "Invited by Ade B".

**`unread_count() → integer`** The bell: unread rows you can still see.

**`mark_notifications_read(p_ids uuid[] = null, p_before timestamptz = null) → integer`** Exactly
one of them: the ids, or everything updated at or before the time (opening Updates: pass the
newest `updated_at` you rendered). Returns rows changed. Error: `invalid_argument`.

**`act_on_notification(p_id) → notifications`** After the inline action succeeds (the action itself
is the existing RPC: `im_down`, `vote_time`, `check_in`, `confirm_result`, `pull_in` sheet, open the
chat for `reply`), or to dismiss. Marks it acted and read. Idempotent. Error:
`notification_not_found`. A row whose action is done also leaves needs_you by itself (validity is
recomputed on every read), so a missed `act_on_notification` doesn't leave stale buttons.

**`notification_preferences() → notification_prefs_state`** `{ quiet_hours_enabled, quiet_start,
quiet_end, show_details, time_zone, push_off: notification_type[] }`.
**`set_notification_preferences(p_quiet_hours_enabled, p_quiet_start, p_quiet_end, p_show_details)`**
(each optional; null = unchanged; start ≠ end) `→ notification_prefs_state`. Error: `invalid_argument`.
**`set_notification_type(p_type, p_push bool) → notification_prefs_state`** Push on/off per type.
**`mute_object(p_object_kind, p_object_id, p_until = null) → bool`** / **`unmute_object(p_object_kind,
p_object_id) → bool`** Mute one plan, activity or crew (you must be able to see it).
**`register_push_token(p_token, p_platform) → uuid`** Call after `getExpoPushTokenAsync()` on every
app start (refreshes `last_seen_at`; a token used by another account moves to you; at most 10 devices).
Error: `push_token_invalid`. **`unregister_push_token(p_token) → bool`** On sign-out. Idempotent.

## Delivery (would-send only)

Sending real notifications needs the owner's OK (CLAUDE.md "Ask first"). What exists:

- **`private.would_send(p_notification_id, p_at = now()) → (send, reason, title, body, tokens,
  collapse_id, deliver_after)`** decides without sending. Reasons in order: `not_found`,
  `already_seen` (read or acted), `not_visible`, `type_off`, `object_muted`, `no_device`,
  `rate_limited` (pushed within 30 min, throttled types), `quiet_hours` (`deliver_after` = when they
  end, in the person's time zone; quiet start > end wraps midnight), `ok`. `title`/`body` are the
  detailed words only when `show_details` is on; otherwise "Ojoro" + a generic sentence.
  `collapse_id` = the bundle key, so a device replaces rather than stacks.
- **`private.delivery_queue(p_limit = 100)`** rows changed since they were last pushed (last 24 h,
  unread) with their would-send decision. **`private.mark_pushed(p_ids uuid[])`** starts the throttle.
- Both are in `private` (service role only, not exposed by the Data API).

Edge Function sketch (not deployed; needs the owner's OK, an Expo access token and a schedule):

```ts
// supabase/functions/push-dispatch/index.ts (sketch, do not deploy without the owner's OK)
import postgres from 'npm:postgres@3.4.5';
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

Deno.serve(async () => {
  const rows = await sql`select * from private.delivery_queue(200)`;
  const due = rows.filter((r) => r.send);
  const messages = due.flatMap((r) =>
    r.tokens.map((to: string) => ({
      to, title: r.title, body: r.body, collapseId: r.collapse_id, threadId: r.collapse_id,
      data: { notificationId: r.notification_id }, // the app fetches my_notifications for the link
    })),
  );
  for (let i = 0; i < messages.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` },
      body: JSON.stringify(messages.slice(i, i + 100)),
    }); // then read receipts and delete tokens that report DeviceNotRegistered
  }
  await sql`select private.mark_pushed(${due.map((r) => r.notification_id)}::uuid[])`;
  return new Response(JSON.stringify({ sent: due.length }));
});
```

Rows held for `quiet_hours` stay in the queue and go after `deliver_after` (call it every minute
from pg_cron + `net.http_post`, or a scheduled function). The push carries only the notification id;
the app opens Updates or the row's `href` after fetching it (no details in the payload).

## Crews

The minimum chat needs. CrewHome's momentum, rituals and crew-vs-crew are step 6.

| Table | Visible to | Notes |
|---|---|---|
| `crews` | Members | `id`, `name` (1–40), `sport_id` (usual sport, nullable), `is_private` (always true), `time_zone`, `created_by`, `member_count` (includes people hidden from you), `archived_at`, `created_at`. |
| `crew_members` | Members, minus blocked people | `crew_id`, `user_id`, `role` (`owner` / `admin` / `member`; exactly one owner), `via` (`created` / `added` / `code`), `invited_by`, `joined_at`. |

Rules (PRD §9.10, explicit): any member adds people **they've played with**; owners and admins see
and rotate the **invite code**, which anyone can use; owners remove admins and members, admins remove
members, nobody removes the owner; the owner leaves only after `transfer_crew_ownership` (the last
person out archives the crew); only the owner sets roles. 50 members at most; 5 new crews a day.

**`create_crew(p_idempotency_key, p_name, p_sport_id = null, p_member_ids uuid[] = '{}') → crews`**
You own it. Errors: `invalid_argument` (name), `sport_unknown`, `crew_member_not_allowed` (detail: id),
`crew_full`, `crew_rate_limited`.
**`add_crew_members(p_crew_id, p_user_ids uuid[]) → integer`** (added; people already in are skipped).
All or nothing. Errors: `crew_not_found`, `crew_member_not_allowed`, `crew_full`, `invalid_argument`.
**`crew_invite_code(p_crew_id, p_rotate = false) → text`** 8 characters (`A–Z`, `2–9`, no look-alikes).
Errors: `crew_not_found`, `not_crew_admin`. Share it in a link the app builds (no public crew page yet).
**`join_crew(p_code) → uuid`** (crew id; already in → same id). Errors: `invite_code_invalid`, `crew_full`.
**`leave_crew(p_crew_id) → bool`** Errors: `owner_must_transfer`.
**`remove_crew_member(p_crew_id, p_user_id) → bool`** Errors: `crew_not_found`, `not_crew_admin`,
`cannot_remove_owner`, `invalid_argument` (yourself: use `leave_crew`).
**`transfer_crew_ownership(p_crew_id, p_user_id) → bool`** Owner only; you become an admin.
Errors: `crew_not_found`, `not_crew_admin`, `not_crew_member`.
**`set_crew_role(p_crew_id, p_user_id, p_role 'admin'|'member') → crew_role`** Owner only.
**`my_crews() → table(crew_id, name, sport_id*, role, member_count, joined_at, last_message_at*)`**
Most recently active first.
**`crew_view(p_crew_id) → table(crew_id, name, sport_id*, member_count, my_role, free_tonight,
time_zone, created_at)`** CrewChat header "14 members · 4 free tonight" (`free_tonight`: members
usually free this evening whose availability setting includes you). Error: `crew_not_found`.
**`crew_roster(p_crew_id) → table(user_id, display_name, avatar_path*, role, joined_at, is_me,
games_with_me*)`** Owner, admins, you, then by join date; blocked people omitted.

## Chat

| Table | Visible to | Notes |
|---|---|---|
| `messages` | Crew members (crew chat) or people in the game (activity chat: confirmed, checked in, host), minus blocked senders | `id`, `crew_id` or `activity_id` (exactly one), `sender_id`, `kind` (`text` / `system`), `body` (null once deleted), `reply_to`, `mention_ids`, `payload` (system lines: `{"event": "make_this_a_game", "plan_id", "suggestion_id"}`), `created_at`, `edited_at`, `deleted_at`. Read pages with the RPCs (they add names and placeholders). |

**`send_message(p_idempotency_key, p_body, p_crew_id = null, p_activity_id = null, p_reply_to = null,
p_mention_ids uuid[] = null) → messages`** One thread (`invalid_argument` otherwise). Body 1–1000
(trimmed). 20 a minute. Mentions: `@handle` in the body plus `p_mention_ids`, kept only for people
who can read the thread and have no block with you (≤ 10); they get a `mention` notification. A crew
message also refreshes Make This a Game (the reply doesn't wait for anything else). Activity chat:
people in the game, until the game is complete or cancelled.
Errors: `crew_not_found`, `activity_not_found`, `not_attending`, `chat_closed`, `message_invalid`,
`message_rate_limited`, `message_not_found` (reply_to), `invalid_argument`.

**`crew_messages(p_crew_id, p_before uuid = null, p_limit = 50)`** and **`activity_messages(p_activity_id,
p_before = null, p_limit = 50)`** `→ table(id, sender_id*, sender_name*, sender_avatar_path*, kind,
body*, reply_to*, payload*, created_at, edited_at*, is_deleted, is_hidden, is_mine, mentions_me)`.
Newest first; pass the oldest id you hold as `p_before` for the next page (≤ 100). Deleted:
`is_deleted` with no body ("Message deleted."). Hidden: `is_hidden` with no sender and no body (see
Privacy). Group consecutive messages per sender and show a time label between gaps as in CrewChat
("TODAY · 2:14 PM"). System lines (`kind = 'system'`) are centred captions ("2:20 PM · Lena tapped
MAKE THIS A GAME"). Errors: `crew_not_found` / `activity_not_found`, `not_attending`.

**`edit_message(p_message_id, p_body) → messages`** Your text messages; sets `edited_at` ("Edited").
Mentions aren't re-sent. Errors: `message_not_found`, `not_author`, `message_invalid`.
**`delete_message(p_message_id) → bool`** Yours; crew owners/admins and the activity host may
delete others' (moderation). Soft: words removed. Idempotent. Errors: `message_not_found`, `not_author`.
**Report:** `report('message', id, reason, note)` (only a message you can read). **Block:** `block_user`
from the sender's row or profile.

## Make This a Game

| Table | Visible to | Notes |
|---|---|---|
| `chat_suggestions` | Crew members | `id`, `crew_id`, `sport_id`, `day_label` ("Saturday morning", "tomorrow evening", "tonight"), `day_key`, `proposed_times` (≤ 4, ascending), `place_ids` (in the order named), `interested_ids` (crew members who spoke about it), `status` (`open` / `accepted` / `expired`), `plan_id`, `accepted_by`, `accepted_at`, `expires_at`. At most one open per crew. Use `chat_suggestions()` for names and counts. |
| `chat_suggestion_dismissals` | Own | NOT NOW, per person. |

**Detection (rules, no AI)** runs inside `send_message` for crew text messages and again in
`chat_suggestions`. It reads the last 20 messages of the last 6 hours and needs: a **sport** (words
like football/soccer/5-a-side, run/5k, boxing/sparring, hoops, volleyball, tennis, climbing, bike; the
newest message naming one wins; else the crew's usual sport), a **day** (tonight, today, tomorrow,
weekday names and short forms, weekend; the newest message naming one, and in it the last day named:
"Thursday's a washout… Saturday instead?" → Saturday), and **at least 2 members showing interest**
(in, same, down, works, yes, who's in, anyone, up for, or naming the sport, a day or a time).
**Times:** hours named ("at 7", "7:30", "8pm", "thursday 7"; no am/pm → evening for 1–8, morning
for 9–11, or by the part of day named); "before 11" → 10:30, 10:00 and 9:00; otherwise morning 9/10/11,
afternoon 1/2/3, evening 6:30/7/7:30. In the crew's time zone, at least 75 minutes ahead (a weekday
that's already past today means next week). **Places:** public places whose first distinctive word
appears in the chat ("Jeanne-Mance", "indoor", "La Fontaine"). A new day or sport replaces the open
suggestion; once one became a plan, the same day isn't suggested again.

**`chat_suggestions(p_crew_id) → table(id, crew_id, status, sport_id, sport_name, day_label,
proposed_times, place_ids, place_names, interested_ids, interested_names, interested_count,
member_count, free_count, plan_id*, accepted_by*, accepted_by_name*, accepted_at*, expires_at,
created_at, updated_at)`** VOLATILE (POST). Open suggestions you haven't dismissed, plus ones accepted
in the last 24 h (so the chat shows "Lena tapped MAKE THIS A GAME" and the poll from `plan_id`).
CrewChat copy from the facts: "OJORO NOTICED A PLAN" / "FOOTBALL, SATURDAY MORNING?" / "4 of you want
in." (`interested_count`) / "9 of 14 are free Saturday between 9 and 11." (`free_count` of
`member_count`: members usually free that day and part of day whose availability includes you; the
hour range is the first and last proposed time). Error: `crew_not_found`.

**`dismiss_suggestion(p_suggestion_id) → bool`** NOT NOW: hidden for you, still there for others.
Idempotent. Error: `suggestion_not_found`.

**`make_this_a_game(p_suggestion_id, p_time_options timestamptz[] = null, p_place_id = null,
p_capacity = null, p_idempotency_key, p_poll_closes_at = null) → make_game_state { plan_id,
suggestion_id, crew_id, created, starts_at, time_option_count, message_id }`** MAKE THIS A GAME.
Times default to the suggestion's (1–4; the earliest becomes the start, the rest a time poll that
closes at `p_poll_closes_at`, default the deadline = an hour before the start). `p_place_id` null =
place to be agreed (pick one of `place_ids`, or any place). Capacity defaults to the sport's. Same
rules as `create_plan` (its errors apply), then the plan becomes `audience = 'crew'`,
`crew_id`, `source = 'chat'`. **Only the tapper is in** (and hosts); the rest of the crew get
`crew_poll` (or `crew_plan`) and tap I'M DOWN themselves. A system line goes into the chat. A second
tap by anyone returns the same plan with `created: false`. Then open `/plan/{plan_id}` or show the
poll in the chat. Errors: `suggestion_not_found`, `suggestion_expired`, `time_options_invalid`,
`idempotency_key_required`, plus `create_plan`'s.

**Place poll:** CrewChat's WHERE? has no backend (plans have one place). Show `place_names` as the
choices for the person tapping MAKE THIS A GAME, or let the host set the place later. See decisions.

## Live

| Table | Visible to | Notes |
|---|---|---|
| `activity_live` | Anyone who can see the activity | One row per activity once anything live happens: `team_a_score`*, `team_b_score`*, `score_logged_by`*, `score_updated_at`*, `last_update_at`* (latest public change), `follower_count`, `reaction_counts` (game-level, `{"lets_go": 9, "respect": 4}`). |
| `activity_updates` | Anyone who can see the activity; `check_in` posts only for people in the game; minus blocked authors | `id`, `activity_id`, `author_id`* (null for Ojoro's posts), `kind` (`kick_off`, `score`, `check_in`, `full_time`, `post`), `audience`, `body`*, `team_a_score`*, `team_b_score`*, `reaction_counts`, `created_at`, `deleted_at`*. Kick-off is posted when the game goes live, full time when it ends, a score post on each score change, a check-in post per arrival. |
| `activity_reactions` | Own | Your reaction per post (`update_id`) or to the game (`update_id` null). |
| `activity_followers` | Own | Whether you follow; counts come from `activity_live.follower_count`. |

**`activity_live(p_activity_id) → table(1 row)`** `activity_id`, `effective_status`, `starts_at`,
`live_at`*, `ends_at`, `ended_at`*, `server_now`, `sport_id`, `place_name`*, `team_a_label`*,
`team_b_label`*, `team_a_score`*, `team_b_score`*, `score_logged_by`*, `score_logged_by_name`*,
`score_logged_by_host`*, `score_updated_at`*, `last_update_at`*, `follower_count`, `i_follow`,
`crew_following`* (one of your crews with 2+ members following: "THURSDAY FC IS FOLLOWING"),
`playing_count` ("8 PLAYING"), `is_host`, `can_log_score`, `can_post`, `reaction_counts`,
`my_reaction`*. **Clock:** `liveClockSeconds(row, receivedAt)` → "34:12". **Freshness:**
`liveFreshnessSeconds(row, receivedAt)` → "Updated 20 s ago · logged by Ade (host)". Both run on the
server's clock (`server_now`), so a wrong device clock doesn't matter; keep ticking locally and
re-anchor on every fetch. Offline, keep the last values and say how old they are. Error:
`activity_not_found`.

**`activity_updates_feed(p_activity_id, p_before = null, p_limit = 30) → table(id, kind, author_id*,
author_name*, author_avatar_path*, author_is_host*, body*, team_a_score*, team_b_score*,
reaction_counts, my_reaction*, is_deleted, created_at)`** Newest first. Render `post` and
`score`/`kick_off`/`full_time` as HypePost cards ("UPDATE · 8:01" + body), a participant's `post`
as a Comment (name, time, REPLY → activity chat, RESPECT → `react`). Error: `activity_not_found`.

**`log_score(p_activity_id, p_team_a, p_team_b) → activity_live`** While live. The host always;
checked-in players too when `attendance_rule = 'check_in'` (self-run). Same value again → nothing
changes, no post. 0–99. Errors: `activity_not_found`, `not_scorekeeper`, `activity_not_live`,
`invalid_argument`. The final result is still `propose_result` / `confirm_result` in After (prefill
it from the live score).

**`post_update(p_activity_id, p_body, p_idempotency_key) → activity_updates`** People in the game,
while live. 1–280, 6 a minute. Errors: `activity_not_found`, `not_attending`, `activity_not_live`,
`message_invalid`, `message_rate_limited`. **`delete_update(p_update_id) → bool`** Author or host;
system posts stay. Errors: `update_not_found`, `not_author`. **Report:** `report('update', id, …)`.

**`react(p_activity_id, p_reaction, p_update_id = null) → reaction_state { activity_id, update_id,
reaction_counts, my_reaction }`** Words only (`lets_go`, `respect`, `hold_that`, `run_it_back`;
labels in `reactionWords`). One per person per post (or per game when `p_update_id` is null): the
same word again takes it back, another word replaces it. Live and After. Anyone who can see the
game. Errors: `activity_not_found`, `activity_not_live`, `update_not_found`, `invalid_argument`.

**`follow_activity(p_activity_id) → true`** / **`unfollow_activity(p_activity_id) → false`**
Idempotent. Anyone who can see the activity (Slice 01 visibility), until it's complete. Followers
get `live`. Errors: `activity_not_found`, `activity_cancelled`, `activity_not_live` (finished).

FULL TIME is Slice 01's `end_activity` (host): it posts the full-time update and opens After.

## Main: `home_feed`

**`home_feed() → table(position, card, action, object_kind*, object_id*, plan_id*, activity_id*,
crew_id*, sport_id*, sport_name*, title, reason*, starts_at*, place_name*, member_count*, capacity*,
people*, notification_id*, href*)`** The finite action feed (PRD §9.18). Each source is filtered for
safety and visibility first (blocks either way with the host or anyone in it, plan and crew
visibility, things you can't join), then everything is ranked, one card per object, at most 12, and
always a last `caught_up` card ("YOU'RE CAUGHT UP." / "Go do something.").

| `card` | Source | `action` |
|---|---|---|
| `needs_you` | `my_notifications` rows in needs_you (`notification_id`, `href`) | as the notification |
| `your_plan` | Plans you're in, forming or on, starting within 48 h (live → `/activity/{id}/live`) | `pull_in` at one spot left, else `open` |
| `crew_suggestion` | Open Make This a Game suggestions in your crews | `make_this_a_game` (open the chat) |
| `crew_plan` | Forming crew plans of your crews you're not in | `im_down` |
| `plan_forming` | Forming plans you can join near you (`private.opportunities`, 7 days) | `im_down` |
| `down_for` | The sport most people near you are down for (`people`), unless you're down for it | `down_for` (`create_down_for`) |
| `recap` | Your latest recap from the last 7 days | `run_it_back` |
| `caught_up` | Always last | `none` |

Upcoming Challenge Events are M6: nothing is returned for them. Ojoro Daily (TONIGHT. + the best move)
stays as built in Step 3 (`home_density`, `ojoro_now`); the bell is `unread_count()`.

## Changes to Slice 01 objects

- `audience` enum: `crew`. `plans.crew_id` (set exactly when `audience = 'crew'`). **Plan visibility**
  adds: crew plans are visible to that crew's members (plus, as before, the host, members and open
  invitees). Only `make_this_a_game` makes crew plans; `create_plan(p_audience => 'crew')` fails with
  `invalid_argument`.
- `plan_source` enum: `chat`. `plan_cards` appends `crew_id` and `crew_name` (the name only for that
  crew's members).
- `vote_time`: on a crew plan, every member of that crew may vote (not only plan members);
  `plan_time_votes` RLS also shows you your own vote.
- `report_subject` enum: `message`, `update`.
- Triggers on `plans`, `plan_invites`, `attendance`, `activities`, `result_proposals`, `recaps`,
  `crew_members` create notifications and live posts; a second minute job (`ojoro_notify_tick`)
  sends `check_in_open`.

## Realtime

`postgres_changes`, filtered by RLS. Use the descriptors from `@ojoro/contracts`:

| Screen | Descriptor (channel) | Table · event · filter | Do |
|---|---|---|---|
| Updates, Main bell | `notificationsSubscription(me)` (`notifications:{me}`) | `notifications` · * · `recipient_id=eq.{me}` | INSERT/UPDATE (bundles update the same row): refetch `my_notifications` / `unread_count`. |
| CrewChat, CrewHome | `crewChatSubscription(crewId)` (`crew:{crewId}`) | `messages` · INSERT/UPDATE · `crew_id=eq.{id}`; `chat_suggestions` · *; `crew_members` · * | New message: append (fetch the page if you need names); UPDATE: edited/deleted. Suggestion changes: refetch `chat_suggestions`. |
| LiveActivity | `activityLiveSubscription(activityId)` (`live:{activityId}`) | `activities` · UPDATE · `id=eq.{id}`; `activity_live` · *; `activity_updates` · INSERT/UPDATE · `activity_id=eq.{id}` | Score, freshness, followers, game reactions; new posts and their reaction counts; status (after → FULL TIME). |
| Activity chat | `activityChatSubscription(activityId)` (`activity-chat:{activityId}`) | `messages` · INSERT/UPDATE · `activity_id=eq.{id}` | As crew chat. |

Rules as Slice 01: realtime is a hint; on `SUBSCRIBED` and on foreground, refetch. Published tables
added: `notifications`, `messages`, `crew_members`, `chat_suggestions`, `activity_live`,
`activity_updates`. Reactions and followers aren't published (counts arrive on `activity_live` and
`activity_updates`).

## Analytics

Server events in `private.analytics_events` (facts only, never words): `crew_created`,
`crew_members_added`, `crew_joined`, `crew_left`, `crew_member_removed`, `message_sent` (`thread`,
`mentions` count, `reply`), `chat_suggestion_created` (`crew_id`, `sport_id`, `interested`),
`chat_suggestion_dismissed`, `make_this_a_game`, `score_logged`, `live_update_posted`,
`activity_followed`, `notification_acted` (`type`). The client sends taps only (`screen_viewed`,
`notification_opened`, `make_this_a_game_tapped`, `reaction_tapped`, …), never a copy of these.

## Screens

| Screen | Reads | Writes | Sub |
|---|---|---|---|
| **Notifications** (Updates, `/updates`) | `my_notifications()` grouped with `groupNotifications`: NEEDS YOU · n / TODAY / EARLIER, each row `title`, `body`, a time from `updated_at`, an icon by `type`, the avatar of `actor_ids[0]` for people events; tap → `href`. Footer: "Quiet hours 11 PM to 7 AM. Lock-screen previews never show who or where." from `notification_preferences()`. | Inline button by `action`: `im_down` (I'M DOWN), `vote` (VOTE → `href`, the poll), `check_in`, `confirm_result` (CONFIRM), `pull_in`, `reply` (REPLY → chat); then `act_on_notification(id)`. On open: `mark_notifications_read(p_before => newest updated_at)`. Overflow: settings (`set_notification_preferences`, `set_notification_type`). | `notifications:{me}` |
| **Main** | `home_feed()` (cards in order, `caught_up` last), `unread_count()` (bell badge), Step 3 `home_density`/`ojoro_now` for the Daily headline | Card actions: `im_down`, `create_down_for`, `run_it_back`, open chat/plan | `notifications:{me}` (bell), `invites:{me}` |
| **CrewChat** (`/crew/[id]/chat`) | `crew_view(id)` (header), `crew_messages(id)` (pages), `chat_suggestions(id)` (POST), the accepted suggestion's plan: `plan_cards`, `plan_time_options` + own `plan_time_votes` (poll), `places` for `place_ids` | `send_message` (MESSAGE), `make_this_a_game` (MAKE THIS A GAME), `dismiss_suggestion` (NOT NOW), `vote_time` (poll), `edit_message`, `delete_message`, `report('message')`, `block_user` | `crew:{id}` + `plan:{planId}` for the poll |
| **CrewHome** (step 6) | `crew_view`, `crew_roster`, `my_crews`; invite: `crew_invite_code` | `add_crew_members`, `leave_crew`, `remove_crew_member`, `transfer_crew_ownership`, `set_crew_role`, `join_crew` (from a link) | `crew:{id}` |
| **LiveActivity** (`/activity/[id]/live`) | `activity_live(id)` (clock, score, freshness, followers, `crew_following`, game reactions), `activity_updates_feed(id)`; `activity_cards` for the header ("FOOTBALL · JEANNE-MANCE · 8 PLAYING") | Host/scorekeeper: `log_score`; people in the game: `post_update`; everyone who can see it: `react` (ReactionBar), `follow_activity`/`unfollow_activity`; host: FULL TIME = `end_activity`; `report('update')` | `live:{id}` |
| **Activity** chat (no design yet) | `activity_messages(id)` | `send_message(p_activity_id)` | `activity-chat:{id}` |
| **Settings → Notifications** (no design) | `notification_preferences()` | `set_notification_preferences`, `set_notification_type`, `mute_object`/`unmute_object`; on sign-in `register_push_token`, on sign-out `unregister_push_token` | none |

## Local data

`seed_messaging.sql` (third in `[db.seed] sql_paths`; safe to re-run on the running stack to refresh
the times: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed_messaging.sql`).
Sign in as Chimdi (+1 555 555 0100):

- **Thursday FC** (`c1000000-0000-4000-8000-000000000001`, 14 members, Ade owns it, Chimdi is an
  admin, code `THURSDAY`): today Lena, Ade, Sam and Chimdi move Thursday to Saturday morning; the
  suggestion (football, Saturday 9:00 / 10:00 / 10:30, Jeanne-Mance Park or Indoor dome, 4
  interested) was accepted by Lena: a crew plan with a poll at 5 / 3 / 1 votes; Chimdi hasn't voted.
- **Plateau Runners** (`c1000000-0000-4000-8000-000000000002`): an **open** suggestion (running,
  tomorrow 6:30 PM, Lachine Canal, 3 interested) to try MAKE THIS A GAME and NOT NOW on.
- **Live now** (activity `c3000000-0000-4000-8000-000000000002`): football at Jeanne-Mance, started
  34 min ago, Lights 3–2 Darks logged by Ade 20 s ago, kick-off, score posts, HALF TIME, GOAL ·
  MARCUS, Yara's comment, 8 playing (Chimdi among them), 6 Thursday FC followers, reactions (LET'S GO
  from Chimdi). Re-run the seed to reset the clock.
- **Updates** for Chimdi: Needs you · 3 (basketball needs one more 7 / 8 with Pull Me In, the
  Thursday FC poll, the score to confirm from the After game), Today (GAME ON and check-in for the
  live game), Earlier (Recap ready: Lights win 5–4, Lena joined Thursday FC). The Call-Out rows in
  the design are M6.
- The seed's basketball plan now has 7 of 8 (was 5 of 8), and a place "Indoor dome" (Plateau) exists.

## Not built

Real push delivery (owner's OK), the place poll, direct messages, public crews, crew discovery,
CrewHome momentum/rituals/crew-vs-crew (step 6), Challenge notifications (M6), media in chat, typing
indicators and read receipts, unread counts per chat, moderation tooling for reports.
