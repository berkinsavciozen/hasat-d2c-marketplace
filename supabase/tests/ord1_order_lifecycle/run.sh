#!/usr/bin/env bash
# ORD-1 — SQL test runner for 20260925172029_ord1a_order_rpcs_and_guard.sql (A) and
# 20260925180000_ord1b_lock_order_writes.sql (B).
#
# FRESH local PostgreSQL database every run: fixtures (live-shaped tables + RLS + baseline function
# bodies verbatim) -> FIN-2 (20260921113253 + 20260921113432) -> FIN-3 (20260921124738) -> FIN-3-S
# (20260925143009) -> A, then B on top (each applied twice: must be re-runnable) -> assertions
# (RLS on, real authenticated/anon/service_role roles + request.jwt.claims) -> a two-connection
# concurrent-accept test (N4). Same drop/recreate convention as fin3s_stock_reservation/run.sh.
# Never run against a real project.
set -euo pipefail

DB_NAME="${ORD1_ORDER_LIFECYCLE_TEST_DB:-hasat_ord1_order_lifecycle_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
PREREQS=(
  "20260921113253_fin2_payment_status_state_machine.sql"
  "20260921113432_fin2_revoke_anon_execute_payment_rpcs.sql"
  "20260921124738_fin3_immutable_monetary_snapshot.sql"
  "20260925143009_fin3s_stock_reservation_agreed_quantity.sql"
)
MIGRATIONS=(
  "20260925172029_ord1a_order_rpcs_and_guard.sql"
  "20260925180000_ord1b_lock_order_writes.sql"
)

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb -E UTF8 -T template0 "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

for f in "${PREREQS[@]}"; do
  echo "==> Applying $f (prerequisite)"
  "${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/$f"
done

for f in "${MIGRATIONS[@]}"; do
  echo "==> Applying $f (migration under test)"
  "${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/$f"
  echo "==> Re-applying $f (must be re-runnable)"
  "${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/$f"
done

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> N4: two concurrent rpc_accept_offer calls on two connections"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/02_concurrency_setup.sql"
CLAIMS='{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}'
OFFER="$(psql -X -At -d "$DB_NAME" -c "select id from public.offers where note = 'N4'")"
OUT_DIR="$(mktemp -d)"
trap 'rm -rf "$OUT_DIR"' EXIT
# Connection A takes the offers row lock inside rpc_accept_offer and holds its transaction open.
psql -X -At -v ON_ERROR_STOP=1 -d "$DB_NAME" >"$OUT_DIR/a.out" <<SQL &
begin;
select set_config('request.jwt.claims', '$CLAIMS', true);
set local role authenticated;
select public.rpc_accept_offer('$OFFER');
select pg_sleep(2);
commit;
SQL
PID_A=$!
sleep 0.7
# Connection B blocks on the same row lock, then sees the committed acceptance.
psql -X -At -v ON_ERROR_STOP=1 -d "$DB_NAME" >"$OUT_DIR/b.out" <<SQL &
begin;
select set_config('request.jwt.claims', '$CLAIMS', true);
set local role authenticated;
select public.rpc_accept_offer('$OFFER');
commit;
SQL
PID_B=$!
wait "$PID_A"
wait "$PID_B"
RES_A="$(grep '"ok"' "$OUT_DIR/a.out")"
RES_B="$(grep '"ok"' "$OUT_DIR/b.out")"
echo "    A: $RES_A"
echo "    B: $RES_B"
"${PSQL[@]}" -d "$DB_NAME" \
  -v res_a="$RES_A" -v res_b="$RES_B" -v offer="$OFFER" \
  -f "$SCRIPT_DIR/03_concurrency_assertions.sql"

echo "==> ord1_order_lifecycle SQL test suite: PASSED"
