#!/usr/bin/env bash
# T4-A — SQL test runner for the nutrition contract migrations.
#
# Applies the fixtures (minimal real-shaped recipes/crop_config stand-ins + the pre-existing
# set_updated_at() function + a reproduction of this project's default-privilege posture) to a
# FRESH local PostgreSQL database, then applies both T4-A migrations in order, then runs the
# assertion suite. Same repeatable, drop/recreate-every-run convention as
# supabase/tests/b2_harvest_reminders_revoke/run.sh. Does not touch, and has no knowledge of, any
# live Supabase project.
set -euo pipefail

DB_NAME="${T4A_NUTRITION_TEST_DB:-hasat_t4a_nutrition_schema_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

echo "==> Applying 20260904160000_t4a_recipe_nutrition_columns.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904160000_t4a_recipe_nutrition_columns.sql"

echo "==> Applying 20260904161000_t4a_crop_nutrition_reference_table.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904161000_t4a_crop_nutrition_reference_table.sql"

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> T4-A nutrition contract SQL test suite: PASSED"
