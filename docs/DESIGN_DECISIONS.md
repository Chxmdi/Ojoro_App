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
