# CI/CD and Deployment Architecture

## Current state

The repository now has executable quality gates rather than placeholder echo commands.

### CI on every PR / main push
1. install dependencies
2. formatting validation
3. ESLint
4. TypeScript typecheck
5. migration naming/integrity check
6. environment-contract check
7. unit tests with coverage thresholds
8. production TypeScript builds
9. build/coverage artifacts
10. API process health smoke test

### Security
- CodeQL
- Dependency Review
- scheduled and PR dependency audit
- Dependabot
- repository Security Policy

### Delivery
- PR preview artifact build
- optional preview deployment hook
- staging deployment after successful main CI
- production deployment on a published GitHub Release
- post-deployment health verification
- manual Expo/EAS mobile delivery workflow

## Deployment adapter

Ojoro has not yet committed to a final hosting provider. Instead of hard-coding a provider prematurely, preview/staging/production workflows use a deployment-hook contract:

- `PREVIEW_DEPLOY_HOOK_URL`
- `STAGING_DEPLOY_HOOK_URL`
- `PRODUCTION_DEPLOY_HOOK_URL`

The final hosting provider can expose a deploy hook or the hook step can later be replaced with a native Vercel/Netlify/AWS/etc. action without changing release semantics.

Enable using repository/environment variables:
- `PREVIEW_DEPLOY_ENABLED=true`
- `STAGING_DEPLOY_ENABLED=true`
- `PRODUCTION_DEPLOY_ENABLED=true`
- `STAGING_BASE_URL=https://...`
- `PRODUCTION_BASE_URL=https://...`

## GitHub Environment protections

Create:
- `preview`
- `staging`
- `production`

Recommended production protection:
- required reviewer
- no self-approval if team size permits
- deployment branch restricted to tags/releases
- environment secrets scoped only to production

## Mobile

`mobile-delivery.yml` is intentionally disabled until the Expo app is initialized. When ready:
- set `MOBILE_DELIVERY_ENABLED=true`
- add `EXPO_TOKEN`
- add `apps/mobile/eas.json`
- configure Apple/Google signing through EAS

## Remaining platform administration

The GitHub connector cannot mutate every repository-admin setting. Complete:
- protected `main` ruleset
- required checks
- secret scanning / push protection where available
- GitHub Project fields/milestones
- environment reviewers/secrets

Track this in issue #82.

## Lockfile policy

CI currently uses `pnpm install --no-frozen-lockfile` because a generated `pnpm-lock.yaml` is not yet committed. Before production application dependencies are introduced, generate and commit the lockfile, then switch all workflows to `--frozen-lockfile`. This is a release-readiness gate, not optional production hygiene.
