# Ojoro build brief

This is the handoff from design to engineering. The design phase (PRD §18.1, "D0") produced the information architecture, the design system and the main prototype flows. This brief says what exists, what to build first, and what's still open.

## What's in this folder

| Path | What it is |
|---|---|
| `prd/OJORO_PRD_v3.0.md` | The full PRD (the `.docx` original is next to it) |
| `design-system/README.md` | The OJORO KINETIC rules: situations, colour, type, voice, composition, motion, haptics, accessibility, Expo notes |
| `design-system/tokens.json` | Token source of truth (colour per situation, type, spacing, radius, shadow, motion, sizes, borders, opacity) |
| `design-system/tokens.resolved.json` | Same tokens with every colour reference resolved per situation. Generated, convenient for code |
| `design-system/index.d.ts` | TypeScript API of all 44 components |
| `design-system/components/*.md` | One spec per component: variants, props, interactions, states, motion, haptic, accessibility |
| `design-system/web-reference/` | The working web implementation (`bundle.js`, `bundle.css`, `tokens.css`). Use it to read anatomy and exact styles; don't ship it |
| `SCREENS.md` | All 44 screens: purpose, suggested route, PRD section, milestone, situations, components, links in and out |
| `screens/*.png` | Full-length screenshot of every screen at 2x |
| `prototype/` | The clickable prototype. Serve it locally (see `prototype/README.md`) |
| `DESIGN_SYSTEM_PORT.md` | How to turn the web reference into Expo components |

The designs also live in Claude as two artifacts (Blessed has access): **Ojoro App UI** (the canvas) and **OJORO KINETIC** (the design system). If the design changes after this handoff, export a fresh copy rather than editing these files.

## Navigation

Five tabs (PRD §8.1): **Home**, **Discover**, **Create**, **Compete**, **You**. Every other screen is a stack pushed from a tab, a modal, or a deep link. Persistent objects (User, Crew, Clan, Plan, Activity, Challenge, Challenge Event, Place, Passport, Recap, Host) need deep links, notification entry and valid back navigation (§8.2). Suggested Expo Router routes are listed per screen in `SCREENS.md`; treat them as a starting point.

```text
(auth)/welcome → (onboarding)/sports → when → privacy → (tabs)
(tabs)/index | discover | create | compete | you
plan/[id] → plan/[id]/pull-in → game-on (modal) → activity/[id] → check-in → live → after → recap → run-it-back
challenge/[id] → event/[id] (stage: accepted → days → today → live → verifying → complete) → rivalry/[id]
crew/[id] → crew/[id]/chat · clan/[id] → clash/[id] · pulse → place/[id] · updates
host/[programId] → series/[id] · session/[id] · session/[id]/requests · people · payments · announce · league/[id] · insights
```

## Build order

Follow the PRD roadmap (§18.2). The screens and components each step needs:

| Step | PRD | Screens | Design-system work |
|---|---|---|---|
| **0. Foundation** | M0 | none | Expo app, TypeScript, Expo Router, NativeWind theme from tokens, `Situation` scope, fonts, Storybook, CI, environments, analytics and error reporting. Backend chosen and scaffolded. |
| **1. Primitives** | M0 | `States` | Button, DisplayText, Icon, IconButton, Avatar, Badge, Chip, Input, Progress, Divider, Image, Sheet, Modal, Toast, Skeleton, Graphic, plus the screen patterns listed in the porting guide (Strip, TabBar, Switch, Stepper). |
| **2. Vertical Slice 01** | M1–M3 | Welcome, OnboardSports, OnboardWhen, OnboardPrivacy, You, Main (Down For + plans forming only), Plan, GameOn, Activity, CheckIn, After, Recap, RunItBack | AvatarCluster, ParticipantRow, VerificationBadge, DownFor, PlanForming, GameOnPoster, ActivityObject, ActivityStrip, RunItBack, PassportStamp, Comment |
| 3. Liquidity | M4 | Discover, NeedOneMore, FirstHome, Create (without the AI part) | PlaceMiniCard, UserMiniCard |
| 4. Messaging & feed | M5 | Notifications, CrewChat, rest of Main, LiveActivity | Poll, ReactionBar, LiveIndicator |
| 5. Competition | M6 | Compete, CallOut, EventBuildup, Poster, EventToday, EventLive, Verifying, Result, Rivalry | CallOutPoster, ChallengeEventHero, Countdown, PredictionBar, CrowdSupport, HypePost, LiveChallenge, RecapPoster, Rivalry, Rematch |
| 6. Communities & hosts | M7 | CrewHome, Clan, Clash, HostHome, HostSeries, HostRoster, HostRequests, HostPeople, HostMembership, HostAnnounce, HostSeason, HostInsights | CrewMomentum, MomentumMeter; host patterns (Ledger, StatTile, DataTable, Meter, ColumnChart) |
| 7. Places & Passport | M8 | Pulse, Place, Passport detail (not designed) | map layer |
| 8. Concierge, trust, money | M9 | Create (Concierge), host payments for real | — |

Slice 01 must work end to end against the real backend, with realtime plan counts, before step 3 starts (PRD §18.3).

## What isn't designed yet

These are needed for a shippable app but have no artboard. Build them from the design system and the patterns in nearby screens, keep them minimal, and list them in the PR so Blessed can review them. If one is large, ask first.

- Auth details: phone number entry, code verification, sign-in errors, account deletion.
- Settings: notifications, privacy controls after onboarding (the onboarding privacy screen sets the pattern), blocked people, account.
- Report and block flows (entry points are designed; the sheets aren't).
- Sheets referenced by buttons: invite, filter, pick a time, add to calendar, counter a Call-Out, edit a Down For.
- Creation forms: Down For, Quick Plan, Activity, Call-Out composer, Crew and Clan creation.
- Full-screen chat and direct messages (CrewChat shows the pattern).
- Passport detail, goals, ladders, season pages for spectators.
- Participant-side payment (buying a drop-in or pass). Only the host side is designed.
- Permission prompts (location, notifications) and their denied states.
- Moderation and admin tooling.

## Open decisions

| Decision | Notes |
|---|---|
| Backend | Not in the PRD. Needs auth, Postgres-style relational data, realtime counts, server-side authorization, file storage, push. Propose 2–3 options with trade-offs. |
| Display typeface | Druk Condensed (licensed) is the target; Anton is the free stand-in until the licence is settled. Keep the family swappable in one place. |
| Ojoro service fee | Host screens show placeholder amounts (−$36, −$84). The fee model isn't set (PRD §16). |
| Payments provider | For host passes, drop-ins, payouts and refunds. |
| Maps provider | For Pulse and Place. Must support aggregate (area-level) display. |
| Watch / GPS verification | Challenge results use device data (PRD M10 for integrations). Until then, participant confirmation. |
| Analytics provider | Events per PRD §15. |

## Definition of done

A screen or feature is done when:

- It meets PRD §20.1 (and §20.2 for Challenge Events).
- It matches its PNG at 390pt width: same situation, type sizes, spacing, copy and order. Differences are listed and agreed.
- Every state from the `States` screen applies where relevant.
- VoiceOver and TalkBack read it in visual order with labels that state the situation in words (each component spec gives the wording).
- Reduced motion and large text work.
