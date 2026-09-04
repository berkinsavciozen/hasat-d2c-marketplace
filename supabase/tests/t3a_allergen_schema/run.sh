#!/usr/bin/env bash
# T3-A — SQL test runner for the allergen contract schema migration.
#
# Applies fixtures to a FRESH local PostgreSQL database, then applies the real T4-A migrations
# (20260904160000, 20260904161000) and the real T4-A2 migration (20260904170000 -- this migration
# depends on T4-A2's column-lock allow-list already being in place, see the migration file header),
# followed by the real T3-A migration (20260904180000), then runs the assertion suite. Same
# repeatable, drop/recreate-every-run convention as the other suites in this repo. Does not touch,
# and has no knowledge of, any live Supabase project.
set -euo pipefail

DB_NAME="${T3A_ALLERGEN_SCHEMA_TEST_DB:-hasat_t3a_allergen_schema_test}"
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

echo "==> Applying 20260904180000_t3a_allergen_contract_schema.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904180000_t3a_allergen_contract_schema.sql"

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> T3-A allergen contract schema SQL test suite: PASSED"
