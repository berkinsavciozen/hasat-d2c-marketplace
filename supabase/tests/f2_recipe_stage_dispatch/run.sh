#!/usr/bin/env bash
# F2 Recipe Automation — Step 05 SQL test runner for dispatch_recipe_stage.
#
# Applies the Step 05 dispatch migration to a FRESH local PostgreSQL database, on top of a
# net.http_post stub (pg_net is not installed locally — see 00_fixtures.sql), then runs the
# assertion suite. Same repeatable, drop/recreate-every-run convention as
# supabase/tests/f2_recipe_automation/run.sh. Does not touch, and has no knowledge of, any live
# Supabase project.
set -euo pipefail

DB_NAME="${F2_DISPATCH_TEST_DB:-hasat_f2_dispatch_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

echo "==> Applying 20260822120000_f2s05_recipe_stage_dispatch.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260822120000_f2s05_recipe_stage_dispatch.sql"

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> F2 recipe stage dispatch SQL test suite: PASSED"
