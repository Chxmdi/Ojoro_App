# Mobile

The Ojoro app: React Native + Expo (SDK 57), Expo Router, NativeWind v5,
Reanimated 4. It follows PRD v3.0 and the OJORO KINETIC design system in
`design-handoff/`. Read the root `CLAUDE.md` before changing anything.

## Layout

```text
src/app/                 Expo Router routes (five tabs, stacks, modals)
src/design-system/       tokens.css (generated), Situation, fonts, Text, Icon,
                         motion, haptics, components and their stories
src/features/<domain>/   product features, one folder per domain
src/lib/                 Supabase client, env, analytics
.rnstorybook/            Storybook for React Native
```

Tokens are generated from `design-handoff/design-system/tokens.json`; run
`pnpm tokens` at the repo root after the token file changes. Never hand-edit
`src/design-system/tokens.css`.

## Environment

Copy `.env.example` to `.env` and fill in the Supabase URL and publishable key.
