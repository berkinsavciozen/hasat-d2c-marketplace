#!/usr/bin/env bash
# T10 — SQL test runner for the admin recipe quality-overview migration.
#
# Applies fixtures to a FRESH local PostgreSQL database, then the real dependency migrations in
# their real order (T4-A nutrition columns, T4-A crop_nutrition table, T4-A2 column lock, T3-A
# allergen contract, F0-24 calc engine, F0-24b public-execute revoke, T4-B trigger wiring), then
# the real migration under test (20260911140000), then runs the assertion suite. Same repeatable,
# drop/recreate-every-run convention as the other suites in this repo.
set -euo pipefail

DB_NAME="${T10_ADMIN_RECIPE_QUALITY_TEST_DB:-hasat_t10_admin_recipe_quality_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

echo "==> Applying 20260904160000_t4a_recipe_nutrition_columns.sql (T4-A, dependency)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904160000_t4a_recipe_nutrition_columns.sql"

echo "==> Applying 20260904161000_t4a_crop_nutrition_reference_table.sql (T4-A, dependency)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904161000_t4a_crop_nutrition_reference_table.sql"

echo "==> Applying 20260904170000_t4a2_recipes_nutrition_allergen_column_lock.sql (T4-A2, dependency)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904170000_t4a2_recipes_nutrition_allergen_column_lock.sql"

echo "==> Applying 20260904180000_t3a_allergen_contract_schema.sql (T3-A, dependency)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904180000_t3a_allergen_contract_schema.sql"

echo "==> Applying 20260909120000_f024_recipe_nutrition_calc_engine.sql (F0-24, dependency)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260909120000_f024_recipe_nutrition_calc_engine.sql"

echo "==> Applying 20260909123000_f024b_revoke_nutrition_calc_public_execute.sql (F0-24b, dependency)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260909123000_f024b_revoke_nutrition_calc_public_execute.sql"

echo "==> Applying 20260909130000_f024t4b_recipe_nutrition_trigger_wiring.sql (T4-B, dependency)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260909130000_f024t4b_recipe_nutrition_trigger_wiring.sql"

echo "==> Applying 20260911140000_t10_admin_recipe_quality_overview.sql (migration under test)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260911140000_t10_admin_recipe_quality_overview.sql"

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> T10 admin recipe quality-overview SQL test suite: PASSED"
