#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_HOOK_URL:?DEPLOY_HOOK_URL is required}"
: "${DEPLOY_ENVIRONMENT:?DEPLOY_ENVIRONMENT is required}"
: "${DEPLOY_REF:?DEPLOY_REF is required}"

payload=$(printf '{"environment":"%s","ref":"%s","repository":"%s"}'   "$DEPLOY_ENVIRONMENT" "$DEPLOY_REF" "${GITHUB_REPOSITORY:-unknown}")

curl --fail --silent --show-error   --retry 3 --retry-delay 3   -X POST "$DEPLOY_HOOK_URL"   -H "content-type: application/json"   --data "$payload"

echo "Deployment hook accepted for $DEPLOY_ENVIRONMENT @ $DEPLOY_REF"
