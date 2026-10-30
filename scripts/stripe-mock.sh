#!/usr/bin/env bash
# Local Stripe for development and tests (docs/PAYMENTS_CONTRACT.md §Local development). TEST ONLY.
#
#   scripts/stripe-mock.sh start                       stripe-mock on :12111 (HTTP) and :12112 (HTTPS)
#   scripts/stripe-mock.sh stop | status
#   scripts/stripe-mock.sh complete-checkout <id>      pretend Stripe: this checkout is paid
#   scripts/stripe-mock.sh account-ready <program_id>  pretend Stripe: this program's account is ready
#   scripts/stripe-mock.sh send-event <file.json>      sign any event JSON and post it
#
# stripe-mock answers the API with fixture data but never sends webhooks, so the last three build the
# event Stripe would send from the local database, sign it like Stripe (HMAC-SHA256 of "t.payload")
# with the local webhook secret, and POST it to the local stripe-webhook function. They refuse
# anything that isn't on this machine.
#
# Env: STRIPE_WEBHOOK_SECRET (else supabase/functions/.env, else whsec_ojoro_local_test_only),
#      PAYMENTS_WEBHOOK_URL (default http://127.0.0.1:54321/functions/v1/stripe-webhook),
#      PAYMENTS_DB_URL (default postgresql://postgres:postgres@127.0.0.1:54322/postgres).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
name=stripe-mock
image=stripe/stripe-mock:latest
db="${PAYMENTS_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
hook="${PAYMENTS_WEBHOOK_URL:-http://127.0.0.1:54321/functions/v1/stripe-webhook}"

local_only() {
  case "$1" in
    *://127.0.0.1[:/]* | *://localhost[:/]* | *://host.docker.internal[:/]* | *@127.0.0.1:* | *@localhost:*) ;;
    *) echo "Refusing: $1 is not local. These helpers are for local test runs only." >&2; exit 2 ;;
  esac
}

secret() {
  if [ -n "${STRIPE_WEBHOOK_SECRET:-}" ]; then
    printf '%s' "$STRIPE_WEBHOOK_SECRET"
  elif [ -f "$root/supabase/functions/.env" ] && grep -q '^STRIPE_WEBHOOK_SECRET=' "$root/supabase/functions/.env"; then
    grep '^STRIPE_WEBHOOK_SECRET=' "$root/supabase/functions/.env" | head -1 | cut -d= -f2- | tr -d '"'
  else
    printf '%s' whsec_ojoro_local_test_only
  fi
}

post_event() {
  local payload="$1" t sig s
  local_only "$hook"
  s="$(secret)"
  case "$s" in whsec_*) ;; *) echo "STRIPE_WEBHOOK_SECRET must be a whsec_ secret" >&2; exit 2 ;; esac
  if printf '%s' "$payload" | grep -q '"livemode": *true'; then
    echo "Refusing: live events can't be simulated." >&2; exit 2
  fi
  t="$(date +%s)"
  sig="$(printf '%s.%s' "$t" "$payload" | openssl dgst -sha256 -hmac "$s" -hex | sed 's/^.*= //')"
  curl -sS -X POST "$hook" -H 'Content-Type: application/json' -H "Stripe-Signature: t=$t,v1=$sig" --data-binary "$payload"
  echo
}

sql_json() {
  local_only "$db"
  psql "$db" -qAt -v ON_ERROR_STOP=1 -c "$1"
}

uuid_arg() {
  [[ "${1:-}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] || {
    echo "Expected a uuid, got '${1:-}'" >&2; exit 2; }
}

case "${1:-}" in
  start)
    if docker ps --format '{{.Names}}' | grep -qx "$name"; then
      echo "stripe-mock is running on :12111 / :12112"
      exit 0
    fi
    if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
      docker start "$name" >/dev/null
    else
      docker run -d --name "$name" -p 12111-12112:12111-12112 "$image" >/dev/null
    fi
    for _ in $(seq 1 30); do
      curl -fsS -u sk_test_ojoroLocalStripeMock: http://127.0.0.1:12111/v1/accounts/acct_1 >/dev/null 2>&1 && break
      sleep 1
    done
    echo "stripe-mock is running on :12111 / :12112 (STRIPE_API_BASE=http://host.docker.internal:12111 for the functions)"
    ;;
  stop)
    docker stop "$name" >/dev/null 2>&1 || true
    echo "stripe-mock stopped"
    ;;
  status)
    docker ps --filter "name=^${name}$" --format '{{.Names}} {{.Status}} {{.Ports}}'
    ;;
  complete-checkout)
    uuid_arg "${2:-}"
    payload="$(sql_json "
      select json_build_object(
        'id', 'evt_local_' || md5(random()::text), 'object', 'event', 'api_version', '2026-09-30.endive',
        'type', 'checkout.session.completed', 'livemode', false, 'created', extract(epoch from now())::bigint,
        'data', json_build_object('object', json_build_object(
          'id', c.provider_session_id, 'object', 'checkout.session',
          'mode', case when c.kind = 'monthly' then 'subscription' else 'payment' end,
          'status', 'complete', 'payment_status', 'paid', 'livemode', false,
          'amount_total', c.amount_cents, 'currency', lower(c.currency), 'client_reference_id', c.id,
          'metadata', json_build_object('ojoro_checkout_id', c.id),
          'payment_intent', case when c.kind <> 'monthly' then 'pi_local_' || left(md5(c.id::text), 20) end,
          'subscription', case when c.kind = 'monthly' then 'sub_local_' || left(md5(c.id::text), 20) end,
          'invoice', case when c.kind = 'monthly' then 'in_local_' || left(md5(c.id::text), 20) end)))
      from public.payment_checkouts c where c.id = '$2' and c.provider_session_id is not null")"
    [ -n "$payload" ] || { echo "No open checkout $2 (start one with payments-checkout first)" >&2; exit 1; }
    post_event "$payload"
    ;;
  account-ready)
    uuid_arg "${2:-}"
    payload="$(sql_json "
      select json_build_object(
        'id', 'evt_local_' || md5(random()::text), 'object', 'event', 'api_version', '2026-09-30.endive',
        'type', 'account.updated', 'livemode', false, 'created', extract(epoch from now())::bigint,
        'account', a.account_id,
        'data', json_build_object('object', json_build_object(
          'id', a.account_id, 'object', 'account', 'type', 'express', 'livemode', false,
          'charges_enabled', true, 'payouts_enabled', true, 'details_submitted', true,
          'requirements', json_build_object('currently_due', '[]'::json, 'disabled_reason', null))))
      from public.host_payment_accounts a where a.program_id = '$2'")"
    [ -n "$payload" ] || { echo "Program $2 has no Stripe account yet (payments-connect onboard first)" >&2; exit 1; }
    post_event "$payload"
    ;;
  send-event)
    [ -f "${2:-}" ] || { echo "Usage: $0 send-event <file.json>" >&2; exit 2; }
    post_event "$(tr -d '\n' < "$2")"
    ;;
  *)
    sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
