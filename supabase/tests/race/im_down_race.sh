#!/usr/bin/env bash
# Concurrency check for I'M DOWN (not part of `supabase test db`, which runs each file in one
# transaction and so cannot race). Run against the LOCAL stack after `supabase db reset`:
#
#   bash supabase/tests/race/im_down_race.sh
#
# Creates a plan with capacity 4, then fires 13 people (the seed users) at it at the same moment,
# each tapping twice with the same idempotency key from two connections. Checks: exactly 4 members,
# member_count = 4, exactly one activity, 4 attendance rows, and everyone else got plan_full.
# Cleans up after itself. Never point this at a shared database.
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "Refusing to run against a non-local database: $DB_URL" >&2; exit 2 ;;
esac

psql_q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt "$@"; }
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

PLAN=$(psql_q -c "
  insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            source, created_by, host_id, member_count)
  select 'football', now() + interval '1 day', 90, id, 4, 'public', now() + interval '20 hours', 'quick',
         'a0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000012', 0
  from public.places where slug = 'jeanne-mance-park'
  returning id;" | head -n1)

cleanup() {
  psql_q -c "
    delete from public.attendance where activity_id in (select id from public.activities where plan_id = '$PLAN');
    delete from public.activities where plan_id = '$PLAN';
    delete from public.plans where id = '$PLAN';" >/dev/null
  rm -rf "$OUT"
}
trap cleanup EXIT

tap() { # $1 user number, $2 key, $3 output file
  local uid
  uid=$(printf 'a0000000-0000-4000-8000-%012d' "$1")
  psql "$DB_URL" -qAt -c "
    begin;
    select set_config('request.jwt.claims', '{\"sub\":\"$uid\",\"role\":\"authenticated\"}', true);
    set local role authenticated;
    select (public.im_down('$PLAN', '$2')).status;
    commit;" >"$3" 2>&1 || true
}

for n in $(seq 1 13); do
  key=$(cat /proc/sys/kernel/random/uuid)
  tap "$n" "$key" "$OUT/$n.a" &
  tap "$n" "$key" "$OUT/$n.b" &
done
wait

members=$(psql_q -c "select count(*) from public.plan_members where plan_id = '$PLAN'")
count=$(psql_q -c "select member_count from public.plans where id = '$PLAN'")
status=$(psql_q -c "select status from public.plans where id = '$PLAN'")
activities=$(psql_q -c "select count(*) from public.activities where plan_id = '$PLAN'")
attendance=$(psql_q -c "select count(*) from public.attendance t join public.activities a on a.id = t.activity_id where a.plan_id = '$PLAN'")
full=$(grep -l 'plan_full' "$OUT"/*.a "$OUT"/*.b | wc -l)
other=$(grep -L -E 'plan_full|forming|game_on' "$OUT"/*.a "$OUT"/*.b | wc -l)

echo "members=$members member_count=$count status=$status activities=$activities attendance=$attendance plan_full_responses=$full unexpected=$other"
if [ "$members" = 4 ] && [ "$count" = 4 ] && [ "$status" = game_on ] && [ "$activities" = 1 ] \
   && [ "$attendance" = 4 ] && [ "$other" = 0 ] && [ "$full" -ge 18 ]; then
  echo "PASS: capacity held and exactly one activity under 26 concurrent taps"
else
  echo "FAIL"; grep -L -E 'plan_full|forming|game_on' "$OUT"/*.a "$OUT"/*.b | xargs -r cat
  exit 1
fi
