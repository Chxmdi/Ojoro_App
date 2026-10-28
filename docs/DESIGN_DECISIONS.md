# Build decisions

Decisions made while porting the design handoff, where the handoff was silent,
inconsistent, or couldn't be matched exactly. Each one names what we chose and
why, so it can be reviewed and reversed. Newest at the bottom of each section.

## Platform and tooling

| Decision | Why |
|---|---|
| Backend is Supabase | See `docs/adr/0001-backend-supabase.md`. |
| TypeScript pinned to 6.0.x | typescript-eslint supports TS < 6.1; TS 7 broke lint. Dependabot ignores TS ≥ 6.1 until typescript-eslint supports 7. |
| NativeWind 5.0.0-rc.0 | The handoff requires v5; rc is the newest v5 release. Upgrade to 5.0.0 stable when it ships. |
| Local Supabase enables a fake Twilio provider | Supabase Auth refuses phone sign-in with no SMS provider, even for test numbers. The fake credentials can't send anything; hosted projects ignore `config.toml`. |
| No hosted Supabase project yet | Creating one failed: a BMF member account is at the free plan's 2-active-project limit. We don't pause, delete or reuse other projects (`ojoro-festival-2027` is a different product). The owner frees a slot or upgrades the plan, then we create `ojoro` in `ca-central-1` (the sample content is in Montreal). |

## Design system

| Decision | Why |
|---|---|
| Added `title-sm`, `label-sm`, `overline` text styles | The web reference uses them and `tokens.json` doesn't list them (DESIGN_SYSTEM_PORT §1). |
| Added `home`, `compete`, `person` icons | Drawn inline in the tab bar of the screen designs; moved into `Icon` on the same grid. |
| `Text` has a `tone` prop | Lets labels on signal/inverse grounds take `on-signal`/`on-inverse` without fighting the default colour. |
| Switch knob follows the intent, not the CSS | The web `.sw` CSS swaps its paddings, clipping OFF (visible in HostRequests/HostSeries PNGs). The knob sits 3px in and the word 10px from the edge. |
| Switch, Toast: `mark-ring` when the fill merges with the ground | On `confirmed`, `inverse` (black) on `surface` (oxblood) is 1.09:1. The design rule for oxblood/black adjacency applies: a 2px white `mark-ring`. No token changed. |
| Error toast has no heavier rule | Neither the web reference nor the States design draws one on the toast. The error is carried by the alert icon (labelled "Error") and the words. The heavier rule appears on inline errors (Input). |
| Toast action isn't `TextButton` | `TextButton` is muted text; on the inverse strip it would vanish. The web styles `.oj-toast-action` separately too. |
| Modal: tapping the scrim does nothing | Modals are for irreversible or costly choices; they need an explicit answer. Sheets do close on scrim tap. |
| Button labels wrap; Chip labels don't | Display labels must never truncate. Chips sit in horizontal scrollers. |
| Commit label line height 28 | Anton is clipped on Android at the web's 16. Button height is unchanged. |
| Counts use tabular numerals everywhere | CLAUDE.md rule; the web reference's IconButton badge doesn't, so "9+" is ~0.5px narrower. |
| Empty Avatar keeps the token size | The web adds its 1px border outside (no `box-sizing`), drawing 30/42/74. Token sizes keep open spots aligned with filled discs. |
| Skeleton drops the `label` prop | Skeletons are hidden from screen readers; the loading container announces via `loadingProps(label)`. |
| Strip pressed state: `surface-raised` | The web has no pressed look; a ground change is the system's way to show state without colour. |
| Primitives never send analytics | Features send events. `im_down_tapped` and `cta_tapped` (Button.md) are in `@ojoro/analytics`. |
| Native underline offset | iOS/Android can't offset underlines; ghost/TextButton underlines sit at the font default there. Web matches. |
| PlanForming accepts `privacy` but draws nothing | The web reference doesn't draw it and no copy exists. Adding a privacy line means new copy; decide when Plan (Slice 01) is built. |
| No stale-count state on PlanForming yet | The spec mentions "stale (count greyed until refresh)" but `index.d.ts` has no prop for it. Add with the realtime layer in Slice 01. |
| ActivityStrip draws its own LIVE tag | `LiveIndicator` arrives in step 4 (M5). Swap it in then. Same anatomy: oxblood pill, 2px mark-ring, word LIVE. |
| Open spot in AvatarCluster is padded to 30pt | Matches the web's 28pt disc plus its outside border, so cluster widths line up with the designs. |
| PlanForming at one spot left keeps the commit button | The web reference shows only PULL SOMEONE IN at NEED ONE MORE, so someone not in can't take the last spot and someone in loses YOU'RE DOWN. PRD §9.3 (tentative vs confirmed always clear) wins on behaviour: not in → I'M DOWN; in → YOU'RE DOWN with PULL SOMEONE IN under it. |
| ParticipantRow: trailing slot, leading slot, `onPress`/`href` | Porting guide §8 asks for a custom trailing slot (HostRoster's PAID, HostPeople's chevron, Dropped with none: pass `null`). `leading` and `avatarSize="sm"` cover the waitlist row. `onPress`/`href` open the profile, where report and block live. The host action stays a separate button beside the pressable part so both are reachable. |
| ParticipantRow is 68pt before its hairline | `.oj-prow`'s `min-height: 44px` is content-box on the web, so rows are 44 + 2×12 + 1 = 69. RN is border-box; the row sets 68 to match. |
| ParticipantRow reads the context line too | The web's `aria-label` is "name, role" and hides the meta ("12 games with you", the check-in time). RN reads name, role, meta, then any trailing words. |
| VerificationBadge reads in sentence case | The word on screen stays in caps ("ID VERIFIED"); the label is "ID verified" so screen readers don't spell the caps. |
| Poll has a `closed` prop | The spec lists a closed state (results, no check) but `index.d.ts` has no prop. `closed` shows results to everyone, hides your check, and replaces "Closes …" with "Closed". |
| Poll vote count is singular at one; tabular | "1 vote", not the web's "1 votes". Counts use tabular numerals (the web's caption doesn't, ~1px narrower). |
| Poll result fills don't animate | The web has no transition on `.oj-poll-fill`. Add one with the motion pass if the design asks for it. |
| PlaceMiniCard label includes surface and lights | The web reads name, kind, distance and count; surface and "floodlit until" are visible, so they're read too. "1 plan tonight" in the singular. |
| Comment actions aren't `TextButton` | The web uses `oj-textbtn` in `label-sm`; `TextButton` is `label`. Comment draws the same pattern (32pt box, 44pt hit area, `is-on` underline) in `label-sm`. |
| Comment: REPLY, RESPECT and n REPLIES have spoken labels | "Reply to Ade B", "Respected, 14" (the middle dot isn't read). RESPECT is a toggle (`aria-pressed`). `onReplies` added: the web's n REPLIES button has no handler. |
| AvailabilityGrid value is a list of `day-part` keys | Controlled (`value`, `onChange`), returned in week order. Days of the week × morning/midday/evening only: no dates or hours, so it can't become a calendar. Cells are buttons with `aria-pressed` (as the prototype), labelled "Tuesday evening, free" / "… not set"; free cells say FREE. |
| Quote has `note` and `callout` variants | `note` is `.req-note` (2px `line-strong` bar, body). `callout` is the CallOut blockquote (4px `text` bar, title, 16pt in and above/below, caption attribution). The web paints the callout bar as an inset box-shadow; RN uses a 4pt left border and 12pt padding so the words still start 16pt in. Curly quotes are added unless present. |
| GameOnPoster has a `celebrate` prop | Not in `index.d.ts`. The spec says the poster "arrives via Breakthrough" with the success haptic, but a poster in a feed or on revisit must not buzz. `celebrate` plays the wipe, the hero scale-in, the haptic and an iOS announcement on mount or when it turns on. The web poster has no entrance animation; the wipe is the web's `oj-break` from PlanForming. |
| GameOnPoster overline without a count reads CONFIRMED | The web writes "CONFIRMED ·  IN" when `count` is missing. |
| ActivityObject full while forming: FULL badge, no I'M DOWN | The spec lists a "full" state but the web has none (it keeps "10 / 10" and I'M DOWN). Those not in see FULL and no button they can't use; those in keep YOU'RE DOWN. Spoken label ends "Full." |
| ActivityObject speaks its status | One element carries the spec sentence plus " Game on." / " Live now." / " Full.", since the tag sits inside it. An all-caps day ("TONIGHT") is spoken as "Tonight". |
| ActivityObject I'M DOWN plays the light haptic | It's a `primary` button in the web, not `commit`, so Button doesn't buzz; the object plays `imDownAccepted` itself. Pressed state is `aria-pressed` on web, selected on native. |
| ActivityObject Breakthrough only forming → confirmed | Spec: "Breakthrough when it fills". Confirmed → live is a start, not a threshold, and plays nothing. |
| ActivityStrip exports `LiveTag` | ActivityObject's live variant needs the same LIVE pill. One `export` keyword added; nothing else changed. Swap both for `LiveIndicator` when it's ported. |
| RunItBack: the new-plan rule is the button's accessibility hint | The object's copy is the web's; the RunItBack screen states "a new plan opens… nobody is in until they tap I'M DOWN" in its own list. Screen-reader users get it on the button: "Opens a new plan and invites the same people. Nobody is in until they tap I'M DOWN." |
| PassportStamp sets after on its root, without a ground | The spec says it lives on the after ground; the web doesn't set a theme. `Situation id="after" ground={false}` keeps the ink oxblood wherever it's placed; the gap between the rings is left transparent (the web paints it in `surface`, which is the same ground). |
| DownFor says "1 person down" | Same singular rule as AvatarCluster; the web says "1 people down." |

## Slice 01 backend

| Decision | Why |
|---|---|
| Friends and Crews mean "people you have played with" for now | Privacy settings offer Friends and My Crews, plans and Down For have a friends audience, but neither Friends (M1) nor Crews (M2) exist yet. Played-together (both checked in to the same game, so both have the Passport stamp) is the closest real relationship. Replace `authz.connected()` when they land. |
| Levels are self-only | "Levels are only used to match you fairly. They never show as a score." `profile_sports()` returns the level to the owner only; others see sport, position and main sport. |
| A Down For match makes you a member | Main says "Ojoro matched 6 of them into a plan" and Plan says "You're down, but it's not on yet": a Down For is an advance, conditional I'M DOWN. Matched people join with `via = 'down_for'` and can leave. Run It Back, by contrast, only invites (PRD §9.8). |
| Down For matching rules | PRD §9.2 only says signals "can" be matched. Rules in docs/SLICE01_CONTRACT.md §Down For matching: join the fullest compatible forming plan, else group signals (oldest first, shared start time, mutual radius, no blocks, everyone's minimum met), else stay active. |
| "Same intent" = same person, sport and overlapping window | PRD requires idempotent creation without duplicate active signals; an exclusion constraint enforces it and a repeat returns the existing signal. |
| Plans lock at capacity, then join the waitlist | "The plan locks at 8"; States shows "Couldn't join… WAITLIST". `im_down` on a locked plan returns `plan_full` and the app offers `join_waitlist`. |
| Waitlist auto-promotion stops when check-in opens | States: "If a spot opens before 7:00 you're in automatically" (7:00 = check-in opening for a 7:30 game). |
| Check-in opens 30 min before the start and closes at the end; 150 m from the meeting point | Activity: "Opens at 7:00 when you're within 150 m" for a 7:30 game. The meeting point coordinates are used when set (parks are larger than 150 m), else the place centroid. |
| After stays open 24 h; location sharing ends at the game's end + 30 min | After: "OPEN UNTIL WED 9 PM" for a Tue game ending 9:00; CheckIn: sharing "until 9:30" for a game ending 9:00. |
| Participant Confirmed threshold = half of the players, rounded up, at least 2 | After: "3 of 8 confirmed. At 4 it becomes Participant confirmed." PRD §11.3: "multiple participants confirm". Players = people who checked in. |
| Recap without a result | When After closes with no verified result, the Recap is still created (attendance, minutes) with the unverified score marked `self_recorded`, or no score. A recap is a permanent object (§9.8). |
| The Run It Back caller is not a member either | "Nobody is in until they tap I'M DOWN." The caller hosts the new plan but taps I'M DOWN like everyone else. Two players running it back to the same time get the same plan. |
| Pull-in permission | Allowed for people you've played with, or people with Pull Me In `nearby` for the sport. Quota 3 per plan per inviter (NeedOneMore: "You can send 3 more invites") plus 20 a day. Refusals don't say why (blocks stay private). |
| "first game" shows to fellow members whatever the history setting | Plan shows "New to the area · first game". It says the person has no history, which isn't history; gating it on `history_visibility` (default Friends) would hide it from exactly the people meeting them for the first time. |
| Games hosted is public (minus blocked) | Plan shows "Started the plan · 40 games hosted" to everyone in the plan. It's host reputation, not personal history. |
| Reputation: a table of endorsements, shown from 5 | You: "A signal only appears after 5 confirmations." `give_reputation` exists for After; no UI is designed for giving yet. |
| Sports catalog is a migration, places are seed | Sports are reference data every environment needs; places, people and plans are sample content. |
| Day parts: morning < 11:00, midday 11:00–16:59, evening ≥ 17:00 local | OnboardWhen has MORNING / MIDDAY / EVENING without boundaries. |
| STILL ON TONIGHT looks twice as far as your radius | States shows Parc Jarry at 4 km for a 3 km radius ("a bit further out", FirstHome). |
| Hosts can start and end a game early | CheckIn: "Ade starts the game once the teams are set"; Live: FULL TIME (host). Without the host, times decide. |
| Live score updates, chat, notifications and payments are out of the backend for now | Not in Slice 01 (PRD §18.3) or not decided (payments). Cost is stored for display only. |
