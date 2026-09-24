#!/usr/bin/env bash
# DQ-2 — SQL test runner for 20260924120000_dq2_recipe_quality_issues.sql.
#
# FRESH local PostgreSQL database every run: fixtures (live-shaped tables) -> the real T10 migration
# (DQ-2 replaces its view and its admin_update_ingredient_nutrition signature) -> the real DQ-2
# migration -> assertions. Same drop/recreate convention as t10_admin_recipe_quality/run.sh.
set -euo pipefail

DB_NAME="${DQ2_RECIPE_QUALITY_ISSUES_TEST_DB:-hasat_dq2_recipe_quality_issues_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb -E UTF8 -T template0 "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

echo "==> Applying 20260911140000_t10_admin_recipe_quality_overview.sql (T10, dependency)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260911140000_t10_admin_recipe_quality_overview.sql"

echo "==> Applying 20260924120000_dq2_recipe_quality_issues.sql (migration under test)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260924120000_dq2_recipe_quality_issues.sql"

echo "==> Re-applying the DQ-2 migration (must be re-runnable)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260924120000_dq2_recipe_quality_issues.sql"

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> DQ-2 recipe quality-issues SQL test suite: PASSED"
