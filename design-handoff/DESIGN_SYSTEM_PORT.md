# Porting OJORO KINETIC to Expo

The design system exists as a working **web** reference (`design-system/web-reference/bundle.js` + `bundle.css`). The app needs the same components as **React Native** components. This guide covers how to translate one into the other. `design-system/README.md` already states the Expo direction (NativeWind v5, Reanimated 4, expo-haptics, Expo Router, Storybook). This file fills in the detail.

## 1. Tokens

- `tokens.json` is the source of truth. Write a small script (`scripts/build-tokens.ts`) that reads it and generates `src/design-system/tokens.ts`. Don't hand-copy values. `tokens.resolved.json` shows the expected output for colour: every reference like `{brand-oxblood}` resolved per situation.
- Colour tokens have one value per situation. In NativeWind, expose them as CSS variables (`--surface`, `--text`, `--signal`…) and give Tailwind colour names that read the variable (`bg-surface`, `text-text-muted`, `border-line-strong`).
- Spacing, radius, size, border and opacity tokens become Tailwind theme keys with the same names (`p-space-5` or a mapped scale, `rounded-pill`, `h-touch`, `h-commit`).
- Duration and easing tokens become constants for Reanimated (`Easing.bezier(0.2, 0, 0, 1)` for `ease-commit`, and so on).
- `shadow-sheet` is the only shadow. On Android, use elevation for sheets only.

### Missing from tokens.json

The web reference uses three text styles that `tokens.json` doesn't list. Add them to the `UI` type group as part of the port, and mention it in the PR:

| Style | Spec |
|---|---|
| `title-sm` | Inter 600, 15/20 |
| `label-sm` | Inter 700, 11/14, letter-spacing 0.1em, uppercase |
| `overline` | Same as `label` (13/16, 700, 0.08em, uppercase) in `text-muted` |

## 2. Situations

Build a `<Situation id="calm|forming|confirmed|live|after">` wrapper. It applies the NativeWind `vars()` for that situation to its subtree and sets a React context, so components can read the current situation (for the status bar style, for example). This replaces `data-theme="…"` in the prototype.

- Situations nest. A `GameOnPoster` wraps itself in `confirmed` even inside a `calm` screen.
- The screen-level situation also sets the status bar (light content on `confirmed` and `live`, dark on the others) and the screen background.
- `ChallengeEventHero` maps `stage` → situation (see the table in `design-system/README.md`).

## 3. Type

- Load **Anton** (display, stand-in for Druk Condensed) and **Inter** 400/500/600/700 with `expo-font` (the `@expo-google-fonts/*` packages work). Keep the display family in one constant so the licensed face can replace it.
- React Native needs absolute numbers: convert `lineHeight` multipliers to px (`fontSize × lineHeight`) and `letterSpacing` from em to px (`fontSize × em`).
- Display styles are always uppercase. Cap their scaling with `maxFontSizeMultiplier={1.3}`; let them wrap, never truncate. UI styles scale with system text size.
- Use `fontVariant: ['tabular-nums']` for counts, scores, times and money.
- **Poster hero:** on the web, `display-hero` inside a poster is `clamp(64px, 29% of poster width, 120px)`. In RN, measure the poster with `onLayout` and compute the size the same way.

## 4. Component API: web → React Native

Keep the component names and props from `index.d.ts`. Change only what the platform forces:

| Web reference | React Native |
|---|---|
| `onClick` | `onPress` |
| `href` (ActivityStrip, PlaceMiniCard, links in screens) | Expo Router `href` via `<Link asChild>` |
| `className` | NativeWind `className` |
| `ButtonHTMLAttributes` / `InputHTMLAttributes` | `PressableProps` / `TextInputProps` |
| `DisplayText as="h1"` | `role="heading"` (`accessibilityRole="header"`); keep `as` only if you need levels |
| `<img>` in `Avatar`, `Image` | `expo-image` |
| inline `<svg>` (Icon, Graphic, Check) | `react-native-svg`, same paths and viewBox |
| `aria-label` | `accessibilityLabel` (keep the exact wording from the reference) |
| `aria-pressed` | `accessibilityState={{ selected }}` (chips) or `{{ checked }}` (switches) |
| `role="progressbar"` + `aria-value*` | `accessibilityRole="progressbar"` + `accessibilityValue={{ min, max, now }}` |
| `role="status"` / `aria-live` | `accessibilityLiveRegion="polite"` (Android) and `AccessibilityInfo.announceForAccessibility` (iOS) |
| `role="timer"` | `accessibilityRole="timer"` |
| `aria-hidden` | `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"` |
| `:focus-visible` ring | Visible focus for keyboard and switch control: 2px `focus` ring, 2px offset |
| CSS `transition` | Reanimated (see Motion) |

`Rematch` has deprecated `from`/`to` props. Use `requester`/`opponent` only.

## 5. Icons and graphics

- `Icon`: copy the path data from `ICONS` in `bundle.js` into an RN component with `react-native-svg`. 24 grid, 2px stroke, square caps, miter joins, `currentColor` → a `color` prop defaulting to the situation's `text`.
- `Graphic` (the O, the Trail, the Mark, scribbles): same approach with the 48 viewBox paths from `bundle.js`.
- Never put meaning in an icon alone. `IconButton` requires `label`.

## 6. Motion

| Family | Tokens | Reanimated |
|---|---|---|
| Commit | `dur-commit` 140ms, `ease-commit` | press → `scale` 0.96 → haptic → label locks |
| Gather | `dur-gather` 320ms, `ease-gather` (overshoot) | new avatar flies into the cluster; count ticks |
| Breakthrough | `dur-breakthrough` 600ms, `ease-breakthrough` | ground takes over to `confirmed`; GAME ON scales in |
| Live | `dur-live` 1600ms loop, `ease-live` | LIVE dot and live counters pulse; layout never moves |

Use `useReducedMotion()`. When it's on, durations are 0 and state changes are cross-fades of 120ms or less.

## 7. Haptics

Only when meaning changes (table in `design-system/README.md`): I'M DOWN accepted → light impact; Need One More → GAME ON → success; Challenge accepted → heavy impact; both competitors checked in → medium impact; result verified → success. Put these in one `haptics.ts` so they're consistent.

## 8. Screen patterns that aren't components yet

The screens use some repeated patterns built from CSS classes, not from components. Make them proper components in `src/design-system/` so screens don't restyle them:

| Pattern | Web source | Make it |
|---|---|---|
| Text styles (`oj-display-*`, `oj-title`, `oj-body`, `oj-label`, `oj-caption`, `oj-overline`, `oj-muted`) | `bundle.css` | `<Text variant="…" muted>` |
| Buttons as links (`oj-btn oj-btn-primary oj-btn-block`) | `bundle.css` | `Button` with `href` |
| Strip row (time · title + meta · trailing badge or chevron) | `oj-strip`, ~58 uses | `Strip` |
| Participant-style row | `oj-prow` | already `ParticipantRow`; add a custom trailing slot |
| Bottom tab bar (5 tabs, centre Create disc) | inline `<nav>` on the tab screens | `TabBar` for Expo Router tabs |
| Switch with ON / OFF word | `.sw` in HostSeries, HostRequests, HostAnnounce | `Switch` (role switch, the word is part of the control). The design-system README allows Expo UI's native switch, but the screens draw this one so the state reads without colour. Use it wherever a switch appears. |
| Stepper (− value +) | `.step` in HostSeries | `Stepper` |
| Free-time grid | `.slot` in OnboardWhen | `AvailabilityGrid` |
| Stat tiles, ledger rows, meter bar, standings table, column chart | HostInsights, HostMembership, HostSeason | `StatTile`, `Ledger`, `Meter`, `DataTable`, `ColumnChart` |
| Quote block | `.req-note`, CallOut blockquote | `Quote` |
| Text button (UNDO, SKIP, EDIT) | `oj-textbtn` | `TextButton` (44pt hit area) |

## 9. Order

1. Foundations: token script, `Situation`, fonts, `Text`, `Icon`, `Graphic`, haptics, motion constants.
2. Primitives: Button, DisplayText, IconButton, Avatar, Badge, Chip, Input, Progress, Divider, Image, Sheet, Modal, Toast, Skeleton, Strip, TabBar, Switch, Stepper, TextButton.
3. Slice 01 objects: AvatarCluster, ParticipantRow, VerificationBadge, DownFor, PlanForming, GameOnPoster, ActivityObject, ActivityStrip, RunItBack, PassportStamp, Comment.
4. The rest, when their milestone comes (see `HANDOFF.md`).

For each component: a Storybook story for every variant and every state in its spec (`components/<Name>.md`), on each situation it can appear in. Check it against the web reference side by side before using it in a screen.
