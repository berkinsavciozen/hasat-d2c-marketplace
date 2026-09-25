#!/usr/bin/env bash
# FIN-3-S — SQL test runner for 20260925143009_fin3s_stock_reservation_agreed_quantity.sql.
#
# FRESH local PostgreSQL database every run: fixtures (live-shaped tables + baseline
# enforce_offer_stock / rpc_create_offer verbatim) -> FIN-3 (20260921124738, real file) ->
# pre-migration rows -> the migration under test (applied twice: must be re-runnable) ->
# assertions. Same drop/recreate convention as admin_set_recipe_cover/run.sh. Never run against
# a real project.
set -euo pipefail

DB_NAME="${FIN3S_STOCK_RESERVATION_TEST_DB:-hasat_fin3s_stock_reservation_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
FIN3="20260921124738_fin3_immutable_monetary_snapshot.sql"
MIGRATION="20260925143009_fin3s_stock_reservation_agreed_quantity.sql"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb -E UTF8 -T template0 "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

echo "==> Applying $FIN3 (prerequisite)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/$FIN3"

echo "==> Seeding pre-migration rows"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00b_pre_migration.sql"

echo "==> Applying $MIGRATION (migration under test)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/$MIGRATION"

echo "==> Re-applying the migration (must be re-runnable)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/$MIGRATION"

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> fin3s_stock_reservation SQL test suite: PASSED"
