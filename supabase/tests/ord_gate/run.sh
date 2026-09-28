#!/usr/bin/env bash
# ORD-GATE — SQL test runner for 20260928140000_ord_gate_storefront_mode.sql.
#
# FRESH local PostgreSQL database every build: ORD-1 fixtures (supabase/tests/ord1_order_lifecycle/
# 00_fixtures.sql, live-shaped + baseline function bodies verbatim) + gate fixtures (00_fixtures.sql) ->
# FIN-2 -> FIN-3 -> FIN-3-S -> ORD-1 A -> ORD-1 B -> ORD-GATE (applied twice: must be re-runnable) ->
# assertions G1–G17 (RLS on, real authenticated/anon/service_role roles + request.jwt.claims).
# Then:
#   * ORD-1 / FIN-2 function bodies are byte-identical before and after ORD-GATE (md5 of pg_proc.prosrc);
#   * rollback.sql removes every object, and the migration re-applies cleanly afterwards;
#   * three mutants of the migration must each FAIL a specific assertion (i: one-sided allowlist -> G3,
#     ii: no rejection exemption -> G5, iii: anon counted as service -> G8);
#   * the ORD-1 suite (ord1_order_lifecycle/run.sh) re-runs with ORD-GATE applied and orders_enabled = true
#     (ORD1_WITH_ORD_GATE=1).
# Same drop/recreate convention as ord1_order_lifecycle/run.sh. Never run against a real project.
set -euo pipefail

DB_NAME="${ORD_GATE_TEST_DB:-hasat_ord_gate_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
ORD1_DIR="$REPO_ROOT/supabase/tests/ord1_order_lifecycle"
PREREQS=(
  "20260921113253_fin2_payment_status_state_machine.sql"
  "20260921113432_fin2_revoke_anon_execute_payment_rpcs.sql"
  "20260921124738_fin3_immutable_monetary_snapshot.sql"
  "20260925143009_fin3s_stock_reservation_agreed_quantity.sql"
  "20260925172029_ord1a_order_rpcs_and_guard.sql"
  "20260925175120_ord1b_lock_order_writes.sql"
)
MIGRATION="20260928140000_ord_gate_storefront_mode.sql"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# build_db <db> <migration file>: fresh DB up to (and including, twice) the given ORD-GATE migration file.
build_db() {
  local db="$1" migration_file="$2"
  dropdb --if-exists "$db"
  createdb -E UTF8 -T template0 "$db"
  "${PSQL[@]}" -d "$db" -f "$ORD1_DIR/00_fixtures.sql"
  "${PSQL[@]}" -d "$db" -f "$SCRIPT_DIR/00_fixtures.sql"
  for f in "${PREREQS[@]}"; do
    "${PSQL[@]}" -d "$db" -f "$MIGRATIONS_DIR/$f"
  done
  psql -X -At -d "$db" -f "$SCRIPT_DIR/protected_bodies.sql" >"$WORK_DIR/$db.bodies.before"
  "${PSQL[@]}" -d "$db" -f "$migration_file"
  "${PSQL[@]}" -d "$db" -f "$migration_file"
  psql -X -At -d "$db" -f "$SCRIPT_DIR/protected_bodies.sql" >"$WORK_DIR/$db.bodies.after"
}

echo "==> Building $DB_NAME (fixtures -> FIN-2 -> FIN-3 -> FIN-3-S -> ORD-1 A -> ORD-1 B -> $MIGRATION x2)"
build_db "$DB_NAME" "$MIGRATIONS_DIR/$MIGRATION"

echo "==> ORD-1 / FIN-2 function bodies unchanged by ORD-GATE"
if ! diff -u "$WORK_DIR/$DB_NAME.bodies.before" "$WORK_DIR/$DB_NAME.bodies.after"; then
  echo "FAILED: a protected function body changed" >&2
  exit 1
fi
echo "    $(grep -c '^fn ' "$WORK_DIR/$DB_NAME.bodies.after") functions, $(grep -c '^trg ' "$WORK_DIR/$DB_NAME.bodies.after") triggers, $(grep -c '^pol ' "$WORK_DIR/$DB_NAME.bodies.after") policies identical"

echo "==> Running assertions (G1–G17)"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> Rollback, then re-apply the migration"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/rollback.sql"
"${PSQL[@]}" -d "$DB_NAME" -v expect_present=0 -f "$SCRIPT_DIR/02_objects.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/$MIGRATION"
"${PSQL[@]}" -d "$DB_NAME" -v expect_present=1 -f "$SCRIPT_DIR/02_objects.sql"

# run_mutant <name> <expected assertion prefix> <perl substitution>: the mutant must fail on exactly that
# assertion (ON_ERROR_STOP stops at the first failure).
run_mutant() {
  local name="$1" expect="$2" subst="$3"
  local mutant="$WORK_DIR/mutant_$name.sql" db="${DB_NAME}_mutant"
  perl -0pe "$subst" "$MIGRATIONS_DIR/$MIGRATION" >"$mutant"
  if cmp -s "$mutant" "$MIGRATIONS_DIR/$MIGRATION"; then
    echo "FAILED: mutant $name did not change the migration" >&2
    exit 1
  fi
  build_db "$db" "$mutant"
  if "${PSQL[@]}" -d "$db" -f "$SCRIPT_DIR/01_assertions.sql" >"$WORK_DIR/mutant_$name.out" 2>&1; then
    echo "FAILED: mutant $name passed the suite" >&2
    exit 1
  fi
  if ! grep -q "ASSERTION FAILED: $expect" "$WORK_DIR/mutant_$name.out"; then
    echo "FAILED: mutant $name failed, but not on '$expect':" >&2
    tail -5 "$WORK_DIR/mutant_$name.out" >&2
    exit 1
  fi
  echo "    mutant $name killed: $(grep -o "ASSERTION FAILED: .*" "$WORK_DIR/mutant_$name.out" | head -1)"
  dropdb --if-exists "$db"
}

echo "==> Mutation checks"
run_mutant "i_one_sided_allowlist" "G3" \
  's/\n\s*and exists \(select 1 from public\.orders_allowlist a where a\.user_id = p_counterparty\)//'
run_mutant "ii_no_reject_exemption" "G5" \
  "s/if new\.status = 'rejected' and old\.status is distinct from 'rejected' then/if false then/"
run_mutant "iii_anon_is_service" "G8" \
  "s/and coalesce\(auth\.role\(\), 'service_role'\) = 'service_role'/and true/"

echo "==> ORD-1 suite with ORD-GATE applied and orders_enabled = true"
ORD1_WITH_ORD_GATE=1 ORD1_ORDER_LIFECYCLE_TEST_DB="${DB_NAME}_ord1" bash "$ORD1_DIR/run.sh"
dropdb --if-exists "${DB_NAME}_ord1"

echo "==> ord_gate SQL test suite: PASSED"
