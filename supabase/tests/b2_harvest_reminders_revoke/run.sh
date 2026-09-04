#!/usr/bin/env bash
# B-2 — SQL test runner for the send_subscription_harvest_reminders REVOKE migration.
#
# Applies the fixtures (real send_subscription_harvest_reminders/dispatch_sms/dispatch_push
# bodies + a net.http_post stub, pg_net is not installed locally) to a FRESH local
# PostgreSQL database, then applies the B-2 REVOKE migration, then runs the assertion
# suite. Same repeatable, drop/recreate-every-run convention as
# supabase/tests/b1_dispatch_push_revoke/run.sh. Does not touch, and has no knowledge of,
# any live Supabase project.
set -euo pipefail

DB_NAME="${B2_HARVEST_REMINDERS_TEST_DB:-hasat_b2_harvest_reminders_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

echo "==> Applying 20260904150000_b2_revoke_harvest_reminders_public_execute.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904150000_b2_revoke_harvest_reminders_public_execute.sql"

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> B-2 send_subscription_harvest_reminders REVOKE SQL test suite: PASSED"
