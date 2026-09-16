#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${1:?database name is required}"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q)
RESULT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/l0-02b-concurrency.XXXXXX")"
trap 'rm -rf "$RESULT_DIR"' EXIT

"${PSQL[@]}" -d "$DB_NAME" <<'SQL'
delete from private.admin_sms_outbox;

insert into private.admin_sms_outbox(event_key, event_type, payload)
select
  'concurrency:' || test_index,
  'crop_request.catalog_gap.created',
  jsonb_build_object(
    'sourceId', gen_random_uuid()::text,
    'cropName', 'Concurrent Test ' || test_index
  )
from generate_series(1, 8) as test_index;
SQL

EVENT_IDS=()
while IFS= read -r event_id; do
  EVENT_IDS+=("$event_id")
done < <(
  "${PSQL[@]}" -A -t -d "$DB_NAME" \
    -c "select id from private.admin_sms_outbox order by event_key"
)

if [[ "${#EVENT_IDS[@]}" -ne 8 ]]; then
  echo "expected eight concurrency fixtures, found ${#EVENT_IDS[@]}" >&2
  exit 1
fi

# All eight independent sessions enter claim_admin_sms_event at the same wall-clock time. Each
# successful claimant deliberately keeps its transaction open briefly, amplifying the original
# race: without the global transaction lock, all sessions can observe the same recent count.
START_AT="$(
  "${PSQL[@]}" -A -t -d "$DB_NAME" \
    -c "select (clock_timestamp() + interval '2 seconds')::text"
)"

PIDS=()
for index in "${!EVENT_IDS[@]}"; do
  event_id="${EVENT_IDS[$index]}"
  (
    "${PSQL[@]}" -A -t -d "$DB_NAME" \
      -v event_id="$event_id" \
      -v start_at="$START_AT" <<'SQL'
begin;
set local lock_timeout = '10s';
set role service_role;
select pg_sleep(greatest(
  0,
  extract(epoch from (:'start_at')::timestamptz - clock_timestamp())
));
select public.claim_admin_sms_event((:'event_id')::uuid) ->> 'outcome';
select pg_sleep(0.25);
commit;
SQL
  ) >"$RESULT_DIR/$index.out" 2>"$RESULT_DIR/$index.err" &
  PIDS+=("$!")
done

session_failure=0
for pid in "${PIDS[@]}"; do
  if ! wait "$pid"; then
    session_failure=1
  fi
done

if [[ "$session_failure" -ne 0 ]]; then
  echo "one or more concurrent database sessions failed" >&2
  for error_file in "$RESULT_DIR"/*.err; do
    if [[ -s "$error_file" ]]; then
      cat "$error_file" >&2
    fi
  done
  exit 1
fi

claimed=0
rate_limited=0
for index in "${!EVENT_IDS[@]}"; do
  outcome="$(grep -E '^(claimed|rate_limited)$' "$RESULT_DIR/$index.out" | tail -n 1 || true)"
  case "$outcome" in
    claimed) claimed=$((claimed + 1)) ;;
    rate_limited) rate_limited=$((rate_limited + 1)) ;;
    *)
      echo "session $index produced unexpected outcome: ${outcome:-<none>}" >&2
      cat "$RESULT_DIR/$index.err" >&2
      exit 1
      ;;
  esac
done

if [[ "$claimed" -ne 5 || "$rate_limited" -ne 3 ]]; then
  echo "expected 5 claimed and 3 rate_limited; got $claimed and $rate_limited" >&2
  exit 1
fi

sending_count="$(
  "${PSQL[@]}" -A -t -d "$DB_NAME" \
    -c "select count(*) from private.admin_sms_outbox where status = 'sending'"
)"
if [[ "$sending_count" -ne 5 ]]; then
  echo "expected exactly five sending rows, found $sending_count" >&2
  exit 1
fi

echo "L0-02B concurrency regression: 5 claimed, 3 rate_limited across 8 sessions"
