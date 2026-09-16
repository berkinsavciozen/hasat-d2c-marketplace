#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${L0_02B_NOTIFY_ADMIN_TEST_DB:-hasat_l0_02b_notify_admin_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATION="$REPO_ROOT/supabase/migrations/20260915141507_l0_02b_secure_notify_admin_ingress.sql"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

echo "==> Applying L0-02B migration"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATION"

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> L0-02B notify-admin SQL contract suite: PASSED"
