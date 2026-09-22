#!/usr/bin/env bash
set -euo pipefail
: "${BASE_URL:?BASE_URL is required}"

url="${BASE_URL%/}/health"
for i in {1..20}; do
  if curl --fail --silent --show-error "$url"; then
    echo
    echo "Health check passed: $url"
    exit 0
  fi
  sleep 3
done

echo "Health check failed: $url"
exit 1
