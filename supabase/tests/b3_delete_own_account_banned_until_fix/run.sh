#!/usr/bin/env bash
# B-3 — SQL test runner for the rpc_delete_own_account banned_until fix migration.
#
# Applies fixtures (the pre-fix rpc_delete_own_account body + a minimal auth.users/public.*
# schema, plus one row already stuck on banned_until = 'infinity') to a FRESH local PostgreSQL
# database, then applies the B-3 fix migration, then runs the assertion suite. Same repeatable,
# drop/recreate-every-run convention as the other suites in this repo. Does not touch, and has no
# knowledge of, any live Supabase project.
#
# Note: this suite only proves the Postgres-side fix (banned_until is no longer 'infinity').
# GoTrue's own scan/parse behavior on 'infinity' timestamptz values is Go code outside this repo
# and cannot be exercised from a SQL test -- see PR description for that research and for the
# runtime verification that still needs to happen on the next ChatGPT/Codex turn.
set -euo pipefail

DB_NAME="${B3_DELETE_ACCOUNT_TEST_DB:-hasat_b3_delete_own_account_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

echo "==> Applying 20260904200000_b3_delete_own_account_banned_until_fix.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904200000_b3_delete_own_account_banned_until_fix.sql"

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> B-3 rpc_delete_own_account banned_until fix SQL test suite: PASSED"
