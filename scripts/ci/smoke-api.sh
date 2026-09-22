#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3001}"
HOST="${HOST:-127.0.0.1}"

node apps/api/dist/server.js &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT

for i in {1..20}; do
  if curl --silent --fail "http://$HOST:$PORT/health" > /tmp/ojoro-health.json; then
    node -e "const x=require('fs').readFileSync('/tmp/ojoro-health.json','utf8');const j=JSON.parse(x);if(j.status!=='ok'||j.service!=='api')process.exit(1);"
    cat /tmp/ojoro-health.json
    exit 0
  fi
  sleep 0.5
done

echo "API health check failed"
exit 1
