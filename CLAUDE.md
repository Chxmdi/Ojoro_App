# Ojoro: guide for Claude Code

Ojoro is a social network for real-world movement: people say what they're down for, plans form, the plan locks at GAME ON, people show up, and it becomes a recap, a rivalry, a Passport stamp. The product is fully specified and designed. Your job is to build it as a **React Native + Expo** app that matches the design.

Owner: Blessed. Ask him before anything in "Ask first" below.

## Sources of truth

Read these before writing code. They live in `design-handoff/` (imported from the design handoff; `design-handoff/KICKOFF_PROMPT.md` has the build prompts in order).

This repo is a pnpm + Turborepo monorepo that predates the handoff. The Expo app lives in `apps/mobile`, not at the repo root. `docs/design/*` and the current `apps/mobile` screens are the earlier D0 prototype (PRD v2.0, fake in-memory data); where they disagree with `design-handoff/`, the handoff wins.

| What | Where | Wins on |
|---|---|---|
| Product requirements v3.0 | `design-handoff/prd/OJORO_PRD_v3.0.md` | Behaviour, rules, data model, roadmap |
| Design system "OJORO KINETIC" | `design-handoff/design-system/` (`README.md`, `tokens.json`, `index.d.ts`, `components/*.md`) | Visuals, tokens, component API, motion, haptics, a11y |
| Screens (44) | `design-handoff/SCREENS.md` + `screens/*.png` + `prototype/*.dc.html` | Layout and copy of each screen, and how screens link |
| Build brief | `design-handoff/HANDOFF.md` | Build order, open decisions, what isn't designed yet |
| Porting guide | `design-handoff/DESIGN_SYSTEM_PORT.md` | How the web reference maps to Expo |

If two of these disagree, the PRD wins on behaviour and the design system wins on visuals. For anything else, ask.

## Stack

- Expo (current stable SDK), TypeScript `strict`, Expo Router.
- Styling: NativeWind v5, themed from `tokens.json`. One CSS-variable scope per **situation** (see below).
- Motion: Reanimated 4. Haptics: `expo-haptics`. Fonts: `expo-font` with Anton (stand-in for the licensed Druk Condensed) and Inter.
- Images: `expo-image`. Vector art and icons: `react-native-svg`.
- Expo UI only for platform-native controls (date/time pickers).
- Storybook for the component gallery.
- **Backend is not chosen.** The PRD doesn't name one. Propose options with trade-offs and get a decision before building the data layer.
- **Never** use a UI kit for visuals: no Material, React Native Paper, NativeBase, Tamagui, gluestack, or an icon font. Ojoro draws its own components and icons.

## Design rules (non-negotiable)

- **Six colours only:** black, ink, oxblood, graphite, stone, white. Components use semantic tokens (`surface`, `text`, `text-muted`, `signal`, `on-signal`, `inverse`, `tint`, `track`, `line`, `line-strong`, `focus`). `brand-*` tokens are for brand art only.
- **Situations, not light/dark:** `calm`, `forming`, `confirmed`, `live`, `after`. Set the situation on the object's root, not only on the page (a GAME ON poster turns oxblood inside a calm feed). Move forward through them, never sideways.
- **Oxblood on black or ink needs `mark-ring`** (2px white). They merge at 1.09:1.
- **Status is never colour-only.** Use words, icons, gaps, borders or ground changes. No red, green or blue for status. Errors are words + the alert icon + a heavier rule.
- **Type:** display face is always UPPERCASE, never below 24px, one `display-hero` per screen at most. UI face is Inter in sentence case, except `label`, which is uppercase with 0.08em tracking. Counts use tabular numerals.
- **Corners are square.** Round only for people and the O (`radius-disc`), things you press (`radius-pill`), and sheets (`radius-sheet`). Separate things with ground changes and hairlines, not shadows.
- **Touch targets ≥ 44pt.** The commit button (I'M DOWN) is 56pt.
- **Voice:** product verbs are fixed and always written the same way: I'M DOWN, PLAN FORMING, NEED ONE MORE, PULL SOMEONE IN, GAME ON, CALL OUT, RUN IT BACK. Write counts, not adjectives. No emoji. No exclamation marks except in user posts.
- **Privacy wording and behaviour:** areas, not addresses; availability is overlap, never a calendar; live location only for one game, until it ends.
- **No gambling adjacency:** predictions and backing never involve money, odds, stakes, payouts or redeemable points.
- **Reduced motion:** every duration becomes 0, and state changes become cross-fades of 120ms or less. The headline still changes.

## Engineering rules (from the PRD)

- Build **vertical slices end to end** (real API, DB, realtime, permissions, analytics, tests). Don't build the whole frontend on fake data first. Slice 01: AUTH → PROFILE → DOWN FOR → I'M DOWN → PLAN FORMING → GAME ON → ACTIVITY → ATTENDANCE → RECAP → RUN IT BACK.
- Join, leave, capacity and check-in mutations are idempotent and safely retryable.
- Accepting a Challenge creates exactly one Challenge Event, in one transaction. Rematches create new linked records; past results are never rewritten.
- Authorization is server-side for visibility, participants, payments and moderation.
- Every feature ships with happy, loading (skeleton after 300ms), empty, validation, offline (last-known state + how old), privacy and error states. See the `States` screen.
- Report and block are reachable from every profile, chat, plan and Challenge.
- Each feature emits analytics events and has tests at the right layer. Accessibility is verified with VoiceOver and TalkBack, large text and reduced motion.

## How to work here

1. Before a screen: open `design-handoff/screens/<Name>.png`, read its entry in `SCREENS.md`, and list the design-system components it uses.
2. Build design-system components before screens, in the order in `DESIGN_SYSTEM_PORT.md`. Each one gets a Storybook story for every variant and state.
3. Port the web reference components one-to-one: same names, same props, except the web→RN changes listed in the porting guide.
4. Check visuals: run the app at 390pt width and compare against the PNG. Fix differences in spacing, type and situation before calling a screen done.
5. Names, places, counts and dollar amounts in the designs are sample content. Use them for seed data; never hard-code them in components.
6. The Ojoro service fee shown in the host screens is a placeholder. The fee isn't decided.

## Ask first

- Choosing the backend, payments provider, maps provider or analytics provider.
- Adding any dependency that draws UI.
- Changing a token value or adding a colour.
- Designing a screen that isn't in `SCREENS.md` (list of known gaps in `HANDOFF.md`).
- Anything irreversible or shared: database migrations on shared environments, pushing to `main`, deploying, sending real notifications or payments.

## Commands

Run from the repo root (Node ≥ 22.13, pnpm 10):

```bash
pnpm install
pnpm lint          # eslint apps packages
pnpm typecheck     # turbo run typecheck
pnpm test          # vitest with coverage
pnpm ci            # everything CI runs
pnpm --filter @ojoro/mobile start
```

Storybook and the token build script are added in step 0; record their commands here.

## Layout (target)

```text
apps/mobile/src/app/                    Expo Router routes (tabs, plan, activity, event, crew, host…)
apps/mobile/src/design-system/          tokens (generated from tokens.json), Situation, fonts, components, stories
apps/mobile/src/features/<domain>/      plans, activities, challenges, crews, clans, places, passport, host…
apps/mobile/src/lib/                    api client, realtime, analytics, haptics, permissions
apps/api, apps/web                      backend and host/admin web app
packages/{contracts,analytics,design-tokens,config}   shared code
design-handoff/                         the design handoff (read-only reference; don't edit)
```
