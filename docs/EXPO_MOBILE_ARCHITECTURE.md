# React Native + Expo Mobile Architecture

## Decision

Ojoro mobile is standardized on **React Native + Expo**.

For the current September 2026 foundation, the repository uses **Expo SDK 57**, React Native 0.86.3 and React 19.2.3. SDK 58 is currently beta, so Ojoro stays on the current stable SDK for the production foundation.

## Navigation

Use Expo Router as the canonical navigation layer.

Current top-level product shell:

- Home
- Discover
- Create
- Compete
- You

The D0 design phase owns the final interaction design, but engineering now has a real routable shell to build against.

## Project location

The Expo app lives at:

`apps/mobile`

All EAS CLI commands must be run from that directory.

## Native-generation strategy

Use Expo Continuous Native Generation (CNG). Do not commit `ios/` or `android/` until a documented native-code requirement makes that necessary.

## Environments

EAS profiles:

- `development` — development client, internal distribution
- `preview` — stakeholder/QA internal distribution
- `production` — store build with automatic build-number increment

Channels:

- development
- preview
- production

## Development client

Use an Expo development build rather than treating Expo Go as the production development environment. This gives Ojoro access to native modules, EAS Update previews and production-like native behavior.

## EAS Workflows

The app contains:

- `.eas/workflows/pr-preview.yml` — publishes a preview update for PR review
- `.eas/workflows/development-builds.yml` — creates Android/iOS development clients
- `.eas/workflows/production.yml` — builds and submits store binaries from `release/*`

The Expo project must be connected to `Chxmdi/Ojoro_App` in the EAS dashboard and the project root must be set to `apps/mobile`.

## First-time EAS setup

From `apps/mobile`:

1. `pnpm dlx eas-cli@latest login`
2. `pnpm dlx eas-cli@latest init`
3. `pnpm dlx eas-cli@latest build:configure`
4. `pnpm dlx eas-cli@latest update:configure`
5. configure Android/iOS credentials
6. connect the GitHub repository in the EAS project settings
7. create the development build once for both platforms
8. enable preview updates after compatible development builds exist

The generated EAS project ID should be provided as `EAS_PROJECT_ID`; do not hard-code account-specific IDs in source.

## Store identifiers

Provisional defaults:

- iOS: `com.ojoro.app`
- Android: `com.ojoro.app`

These must be confirmed before registering the applications in App Store Connect / Google Play Console.

## Design integration

The shared Ojoro palette is already encoded in `src/theme/tokens.ts`:

- #000000
- #141515
- #290000
- #45484A
- #A7A08B
- #FFFFFF

The current shell is deliberately minimal. D0 remains the source of truth for production UI.
