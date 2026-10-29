#!/usr/bin/env bash
# Concurrency check for ACCEPT (not part of `supabase test db`, which runs each file in one
# transaction and so cannot race). Run against the LOCAL stack after `supabase db reset`:
#
#   bash supabase/tests/race/accept_call_out_race.sh
#
# Theo (seed user 12) sends an OPEN call-out; 11 other seed users each tap ACCEPT twice at the same
# moment (two connections, different keys). Checks: exactly one Challenge Event for the call-out, the
# call-out is accepted and points at it, one taker got it (both of their taps return the same event)
# and everyone else got call_out_closed. Cleans up after itself. Never point this at a shared database.
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "Refusing to run against a non-local database: $DB_URL" >&2; exit 2 ;;
esac

psql_q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt "$@"; }
OUT="$(mktemp -d)"

CO=$(psql_q -c "
  insert into public.call_outs (format, sport_id, title, scoring, starts_at, challenger_id, expires_at)
  values ('person_vs_person', 'running', 'RACE', 'time', now() + interval '2 days',
          'a0000000-0000-4000-8000-000000000012', now() + interval '1 day')
  returning id;" | head -n1)

cleanup() {
  psql_q -c "
    begin;
    set local ojoro.seed_reset = 'on';
    update public.call_outs set event_id = null where id = '$CO';
    delete from public.challenge_events where call_out_id = '$CO';
    delete from public.notifications where object_id = '$CO';
    delete from public.call_outs where id = '$CO';
    commit;" >/dev/null
  rm -rf "$OUT"
}
trap cleanup EXIT

tap() { # $1 user number, $2 output file
  local uid key
  uid=$(printf 'a0000000-0000-4000-8000-%012d' "$1")
  key=$(cat /proc/sys/kernel/random/uuid)
  psql "$DB_URL" -qAt -c "
    begin;
    select set_config('request.jwt.claims', '{\"sub\":\"$uid\",\"role\":\"authenticated\"}', true);
    set local role authenticated;
    select (public.accept_call_out('$CO', '$key')).event_id;
    commit;" >"$2" 2>&1 || true
}

for n in $(seq 1 11); do
  tap "$n" "$OUT/$n.a" &
  tap "$n" "$OUT/$n.b" &
done
wait

events=$(psql_q -c "select count(*) from public.challenge_events where call_out_id = '$CO'")
event=$(psql_q -c "select coalesce(event_id::text, '') from public.call_outs where id = '$CO' and status = 'accepted'")
winners=$(grep -l -F "$event" "$OUT"/*.a "$OUT"/*.b 2>/dev/null | wc -l)
closed=$(grep -l 'call_out_closed' "$OUT"/*.a "$OUT"/*.b | wc -l)

echo "events=$events accepted_event=${event:-none} winner_taps=$winners closed_taps=$closed"
if [ "$events" = 1 ] && [ -n "$event" ] && [ "$winners" = 2 ] && [ "$closed" = 20 ]; then
  echo "PASS: exactly one Challenge Event under 22 concurrent ACCEPT taps"
else
  echo "FAIL"; cat "$OUT"/*
  exit 1
fi
