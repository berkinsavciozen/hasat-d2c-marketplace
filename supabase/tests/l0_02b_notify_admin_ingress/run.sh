#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${L0_02B_NOTIFY_ADMIN_TEST_DB:-hasat_l0_02b_notify_admin_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATION="$REPO_ROOT/supabase/migrations/20260916111542_l0_02b_secure_notify_admin_ingress.sql"

shopt -s nullglob
MIGRATION_CANDIDATES=(
  "$REPO_ROOT"/supabase/migrations/*_l0_02b_secure_notify_admin_ingress.sql
)
if [[ ${#MIGRATION_CANDIDATES[@]} -ne 1 || "${MIGRATION_CANDIDATES[0]}" != "$MIGRATION" ]]; then
  echo "Expected exactly one L0-02B migration at the production history version" >&2
  exit 1
fi

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

echo "==> Running multi-session concurrency regression"
bash "$SCRIPT_DIR/02_concurrency.sh" "$DB_NAME"

echo "==> L0-02B notify-admin SQL contract suite: PASSED"
