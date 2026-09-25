#!/usr/bin/env bash
# Admin cover regeneration — SQL test runner for 20260925120000_admin_set_recipe_cover.sql.
#
# FRESH local PostgreSQL database every run: fixtures (live-shaped tables) -> the migration under
# test (applied twice: must be re-runnable) -> assertions. Same drop/recreate convention as
# dq2_recipe_quality_issues/run.sh. Never run against a real project.
set -euo pipefail

DB_NAME="${ADMIN_SET_RECIPE_COVER_TEST_DB:-hasat_admin_set_recipe_cover_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb -E UTF8 -T template0 "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

echo "==> Applying 20260925120000_admin_set_recipe_cover.sql (migration under test)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260925120000_admin_set_recipe_cover.sql"

echo "==> Re-applying the migration (must be re-runnable)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260925120000_admin_set_recipe_cover.sql"

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> admin_set_recipe_cover SQL test suite: PASSED"
