# Release Gates

## Pull request gate
- formatting/linting
- typecheck
- unit tests
- integration tests
- API contract tests when applicable
- dependency review
- static security analysis
- migration validation
- accessibility for critical flows
- E2E/visual evidence for user-facing changes

## Staging gate
- immutable build artifact
- migration preflight
- critical journey E2E
- challenge flow E2E
- block/report flow E2E
- observability green

## Production gate
- zero open P0/P1
- no unaccepted critical/high security finding
- rollback owner and procedure
- feature flag / kill switch for high-risk changes
- post-deploy smoke check
- release notes and support brief
