#!/usr/bin/env bash
# B-1 — SQL test runner for the dispatch_push REVOKE migration.
#
# Applies the fixtures (real dispatch_push/dispatch_sms/notify_offer_received bodies + a net.http_post
# stub, pg_net is not installed locally) to a FRESH local PostgreSQL database, then applies the B-1
# REVOKE migration, then runs the assertion suite. Same repeatable, drop/recreate-every-run convention
# as supabase/tests/f2_recipe_stage_dispatch/run.sh. Does not touch, and has no knowledge of, any live
# Supabase project.
set -euo pipefail

DB_NAME="${B1_DISPATCH_PUSH_TEST_DB:-hasat_b1_dispatch_push_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

echo "==> Applying 20260904140000_b1_revoke_dispatch_push_public_execute.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904140000_b1_revoke_dispatch_push_public_execute.sql"

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> B-1 dispatch_push REVOKE SQL test suite: PASSED"
