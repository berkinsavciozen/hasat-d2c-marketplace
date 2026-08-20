#!/usr/bin/env bash
# F2 Recipe Automation — Step 03A SQL test runner.
#
# Applies the Step 03 (tables) and Step 04 (RPC) migrations to a FRESH local PostgreSQL database,
# on top of minimal live-shaped fixtures, then runs the assertion suite. Repeatable: every run
# drops and recreates the test database from scratch, so this doubles as the "clean migration
# application against a fresh live-shaped PostgreSQL test database" check.
#
# Requires a local PostgreSQL server reachable with the ambient connection settings (PGHOST/
# PGPORT/PGUSER/PGPASSWORD, or a matching ~/.pgpass / peer-auth setup) and CREATE DATABASE
# privilege. Does not touch, and has no knowledge of, any live Supabase project.
set -euo pipefail

DB_NAME="${F2_TEST_DB:-hasat_f2_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

echo "==> Applying 20260819120000_f2s03_recipe_automation_schema.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260819120000_f2s03_recipe_automation_schema.sql"

echo "==> Applying 20260819150000_f2s04_recipe_validation_rpcs.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260819150000_f2s04_recipe_validation_rpcs.sql"

echo "==> Static check: neither F2 migration writes to recipes.status"
if grep -Eiq 'update[[:space:]]+public\.recipes|insert[[:space:]]+into[[:space:]]+public\.recipes' \
  "$MIGRATIONS_DIR/20260819120000_f2s03_recipe_automation_schema.sql" \
  "$MIGRATIONS_DIR/20260819150000_f2s04_recipe_validation_rpcs.sql"; then
  echo "FAILED: an F2 migration writes to public.recipes directly" >&2
  exit 1
fi

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> F2 recipe automation SQL test suite: PASSED"
