A kinetic editorial design system for real-world movement. Ojoro should read like **a Nike campaign × a sports magazine × streetwear editorial × a live match broadcast × a premium social network** — never like a fitness dashboard. A screenshot should be recognisable as Ojoro before the logo appears.

NativeWind is the styling engine; Ojoro Kinetic is the design system. No component kit (Material, Paper, NativeBase, Tamagui) supplies Ojoro's look.

## The core idea: situations, not light/dark

Ojoro has no light mode and dark mode. It has five **situations**, and the screen changes because the real-world situation changed. Each is a theme in `tokens.json`:

| Situation | Theme id | Ground (`surface`) | `signal` | Used for |
| --- | --- | --- | --- | --- |
| Calm | `calm` | White | Oxblood | Home, Discover, Crews, profiles, activities |
| Forming | `forming` | Stone-warmed white | Oxblood | A plan gathering people; a Challenge days away |
| Confirmed | `confirmed` | Oxblood | White | GAME ON, Challenge day, threshold reached |
| Live | `live` | Black | White | LIVE, Call-Outs, Clashes, rivalry |
| After | `after` | Stone | Oxblood | Results, recaps, Passport, memory |

- Set the situation with `data-theme="<id>"` on the object's root, not only on the page. Tokens re-resolve inside it, so a `GameOnPoster` turns its own ground oxblood inside a calm feed.
- Always build with the semantic tokens (`surface`, `text`, `text-muted`, `signal`, `on-signal`, `inverse`, `tint`, `track`, `line`, `line-strong`, `focus`). Use the `brand-*` tokens only for brand art (posters, the O).
- Move forward through the situations, never sideways: CALM → FORMING → CONFIRMED → LIVE → AFTER.

## Colour

Six colours. That's the whole palette: `brand-black` #000000, `brand-ink` #141515, `brand-oxblood` #290000, `brand-graphite` #45484A, `brand-stone` #A7A08B, `brand-white` #FFFFFF.

- Do not add blues, greens, reds or purples for statuses. Express status with the ground, the words, the type size, a border, an icon or a pattern.
- **Oxblood means "something is happening."** Use it for I'M DOWN, Plan Forming progress, Need One More, GAME ON and primary CTAs. Don't use it for decoration, links or errors.
- **Oxblood and Black merge (1.09:1).** Never put an oxblood mark on a black or ink ground without `mark-ring` (2px white) around it. On LIVE, the indicator is an oxblood pill with a white ring and the word LIVE in white.
- Stone is never text on white (2.6:1). It's the secondary text colour on black, ink and oxblood, and the ground for the After situation.
- Graphite is secondary text on light grounds only. On black it's decorative (2.3:1).
- Every text token's contrast is checked in all five themes: `text` is at least 7:1 and `text-muted` at least 4.5:1 on `surface` and `surface-raised`.

## Typography

Two faces with two separate jobs. The contrast between them is the look.

- **Display** (`display-*` styles, family `display`): a bold condensed editorial sports face, always UPPERCASE. It carries the emotion: GAME ON, NEED ONE MORE, CHIMDI VS MARCUS, TONIGHT, 7 / 8, LIVE. The production face is in the Druk Condensed territory (licensed). **Anton** stands in until the licence is settled.
- **UI** (`title`, `body`, `body-sm`, `label`, `caption`, `numeric`, family `ui`): **Inter**. It handles chat, descriptions, metadata, forms, settings, timestamps and buttons. Use sentence case except `label`, which is uppercase with 0.08em tracking.
- Use one `display-hero` per screen at most. Never set body copy in display, and never set display below 24px.
- Inside a poster, `display-hero` sizes itself to the poster: 29% of its width, between 64px and 120px. On a 390px phone that is about 100px, so ALMOST TIME. and CHIMDI WINS. never overflow. Posters are full-width blocks; don't put one inside a row that shrinks to fit.
- Display headlines end with a period when they state a fact ("TONIGHT.", "CHIMDI WINS."). Questions keep the question mark ("WHO TAKES IT?").
- Set numbers in UI type with `font-variant-numeric: tabular-nums` so counts don't jitter while they update.

## Voice

Short, physical, spoken. Ojoro talks like a friend at the side of the pitch.

- Product verbs are fixed and always written the same way: **I'M DOWN**, **PLAN FORMING**, **NEED ONE MORE**, **PULL SOMEONE IN**, **GAME ON**, **CALL OUT**, **RUN IT BACK**.
- Write counts and stakes, not adjectives: "11 people near you want to play.", not "Lots of activity nearby!"
- No emoji in product UI. Exclamation marks only inside user-generated posts.

## Composition: not a wall of cards

Use the form the content calls for. Cards are the last resort.

1. **Editorial blocks.** Display type set straight on the page, with a `body` line under it. This is the default for Home.
2. **Posters.** A full-bleed object on its own situation ground. Use them for Challenges, Clashes and confirmed plans (`GameOnPoster`, `CallOutPoster`, `RecapPoster`).
3. **Strips.** Compact, one-line live information separated by `line` hairlines (`ActivityStrip`).
4. **Full-bleed photography** with an `opacity-scrim` black scrim under display type.
5. **Cards.** `surface-raised` with `radius-none`, only when an object really needs containment.

Corners are square (`radius-none`). Round is kept for people and commitment: avatars and the O use `radius-disc`, buttons and chips use `radius-pill`, and sheets use `radius-sheet`. Separate things with ground changes and `line`, not shadows. `shadow-sheet` is only for sheets.

Spacing is on a 4px grid. Use `space-5` as the phone gutter, `space-10` between feed blocks and `space-20` around full takeovers.

## Motion: four families

Motion shows physical meaning and is never decoration. Build it with Reanimated 4 on the UI thread.

| Family | When | Tokens | What moves |
| --- | --- | --- | --- |
| **Commit** | Pressing I'M DOWN, accepting a challenge | `dur-commit`, `ease-commit` | Press → compress to 0.96 → haptic → state locks (label becomes YOU'RE DOWN) |
| **Gather** | Someone joins a plan | `dur-gather`, `ease-gather` | The avatar flies into the cluster, the count ticks 4 / 8 → 5 / 8, and the object gets denser |
| **Breakthrough** | A threshold is crossed (7 / 8 → 8 / 8) | `dur-breakthrough`, `ease-breakthrough` | The ground takes over to `confirmed`, and GAME ON scales in at `display-hero` |
| **Live** | Scores, countdowns, check-ins, LIVE | `dur-live`, `ease-live` | A subtle pulse of the LIVE dot and counters, never the whole layout |

**Reduced motion:** every duration becomes 0, and state changes become cross-fades of 120ms or less. The headline still changes, so the meaning survives without movement.

## Haptics

Use haptics only when meaning changes. Most presses don't vibrate.

| Moment | Haptic (expo-haptics) |
| --- | --- |
| I'M DOWN accepted | `impactAsync(Light)` |
| Need One More → GAME ON | `notificationAsync(Success)` |
| Challenge accepted | `impactAsync(Heavy)` |
| Both competitors checked in | `impactAsync(Medium)` |
| Result verified | `notificationAsync(Success)` |

## Challenge Events: the escalation

A Challenge Event is a sporting-event page, not a post. Its situation escalates as the event gets closer. `ChallengeEventHero` maps `stage` to theme:

| Stage | Theme | Headline |
| --- | --- | --- |
| `accepted` | forming | CHIMDI / VS / MARCUS poster |
| `days` | forming | Countdown leads: 3 DAYS |
| `today` | confirmed | TODAY. |
| `soon` | confirmed | ALMOST TIME. |
| `live` | live | LIVE, and progress takes over |
| `complete` | after | CHIMDI WINS. |

Below the hero: WHO TAKES IT? (`PredictionBar`), THE CROWD (`CrowdSupport`), then the hype feed (`HypePost`).

## Photography

Documentary photography, not fitness-ad clichés. It should look imperfect, sweaty, local, human, often at night, urban and candid: boots being tied, a floodlit community court, rain on a running route, friends laughing after a game, motion blur, tape on gloves, shoes beside a park bench. The message is *this actually happened*. Don't use stock athletes smiling at the camera. Put an `opacity-scrim` black scrim under any display type set over a photo.

## Graphic language

These brand primitives live in the `Graphic` component. Each draws in `currentColor`.

- **The O**: a circle that means person, place, pulse, gathering or completion. It frames avatars, stamps and the empty slot in a plan.
- **The Trail**: a kinetic movement line that connects people → place → event.
- **The Mark**: a slash or strike for competition, ranking, separation and VS.
- **Scribbles**: handwritten circles, underlines, arrows and crowns, used sparingly. The feel is a sports notebook or a street poster, never a children's game.

There is no logo file yet. Set the name in the `display` face until one exists.

## Iconography

Ojoro draws its own line icons (`Icon`): a 24px grid, 2px stroke, square caps and mitred joins, in `currentColor`. They match the square, editorial build of the rest of the system.

- Use 24px in buttons and headers, and 16–20px inside text lines.
- Never put meaning in an icon alone. Pair it with a word, or give its `IconButton` a `label`.
- Don't use emoji, filled icons, or a third-party icon font next to these. Draw a new glyph on the same grid and stroke.
- Reactions are words (LET'S GO, RESPECT, HOLD THAT, RUN IT BACK), not icons.

## Feedback and overlays

- **Toast** confirms what just happened, in one sentence with at most one action. **Modal** is only for irreversible or socially costly choices, and its safe option is focused first. **Sheet** handles focused tasks (invite, filter, pick a time). Never stack overlays.
- Errors use words, the alert icon and a heavier rule, not red. Offline states keep the last known count and say so.
- Show a **Skeleton** shaped like the coming object only after 300ms.

## Progression

Progression should feel prestigious, not like a game. Don't use glowing XP bars, gems, coins, cartoon trophies or RPG HUDs. The Passport is a passport crossed with a sports archive and an editorial yearbook: achievements are stamps, patches, commemorative marks and event posters (`PassportStamp`, set in the `after` situation).

## Accessibility (built in, not checked at the end)

Every component specifies all of the following:

- A hit target of at least `size-touch` (44px). The commit button is `size-commit` (56px).
- An accessible label that states the situation in words, for example: "Football plan forming. Seven of eight participants committed. One more participant needed."
- A status that doesn't rely on colour. Segments are separated by gaps, statuses carry words, and LIVE carries the word and a ring.
- Keyboard and switch focus: a 2px solid `focus` ring with a 2px offset. It's at least 7:1 on every surface of its theme.
- Dynamic type: UI styles scale. Display styles scale up to 1.3× and then wrap; they never truncate a headline.
- Screen-reader order matches visual order: headline, status, people, actions.
- A reduced-motion equivalent for each motion family, as described in the motion section.

## Component spec template

Every component README follows the same structure: **Variants · Properties · Interactions · States · Motion · Haptic · Analytics · Accessibility**. States always cover loading, offline, stale, full and error where they apply.

## Building it in Expo

- Use React Native primitives with **NativeWind v5**. Map `tokens.json` into the Tailwind theme, and create one CSS-variable scope per situation so `data-theme` maps to a `vars()` wrapper around the object.
- Use **Expo UI** only for platform-native controls such as pickers, switches and date/time.
- Use **Reanimated 4** for the four motion families, **expo-haptics** for the haptics table, **Expo Router** for navigation, and **Storybook** for the component gallery.
- The components in this system are web React references for each object's anatomy, states and copy. Port them one-to-one to RN components with the same names and props.

The architecture, in levels:

```text
Foundations   colour · type · spacing · radius · motion · haptics · photography · graphic language · iconography
Primitives    Button · DisplayText · Icon · IconButton · Avatar · Badge · Chip · Input · Progress · Divider
              Image · Sheet · Modal · Toast · Skeleton
Social        AvatarCluster · ParticipantRow · UserMiniCard · PlaceMiniCard · VerificationBadge · ReactionBar
              Comment · Poll · LiveIndicator · Countdown · PredictionBar · CrowdSupport · MomentumMeter · CrewMomentum
Movement      DownFor · PlanForming · GameOnPoster · ActivityObject · ActivityStrip · RunItBack
Competition   CallOutPoster · ChallengeEventHero · LiveChallenge · HypePost · RecapPoster · Rivalry · Rematch
Identity      PassportStamp
Graphic       Graphic (the O, the Trail, the Mark, scribbles)
```

The competition loop runs through the objects in order: `CallOutPoster` → `ChallengeEventHero` (accepted → today) → `LiveChallenge` → `RecapPoster` → `Rematch` → a new `CallOutPoster`, with `Rivalry` keeping the head-to-head record. The movement loop runs: `DownFor` → `PlanForming` → `GameOnPoster` → `RunItBack`.

Primitives don't know anything about football, Crews or Challenges. Movement, Competition and Identity objects are Ojoro's proprietary vocabulary, as much part of the product as I'M DOWN itself.
