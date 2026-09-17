#!/usr/bin/env bash
# UX-1A — local-only T7a/F11 reconciliation suite. Never points at production.
set -euo pipefail

DB_NAME="${UX1A_TEST_DB:-hasat_ux1a_reconciliation_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

assert_live_source() {
  local file="$1" expected="$2" actual
  actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "Recovered production source mismatch: $file" >&2
    exit 1
  fi
}

assert_live_source "$MIGRATIONS_DIR/20260910132550_t7a_f11_source_type_and_clone_rpc.sql" \
  73b0fa21ad708151a0f72a85885de13f43609996bb8fd08ccf0f0512b86130eb
assert_live_source "$MIGRATIONS_DIR/20260910132725_t7a_f11_revoke_anon_execute_clone_recipe.sql" \
  bb854e3e308871ef2c3d4a20f18b4da7a67c0d6d9073f90508e388870061cc87

dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260910132550_t7a_f11_source_type_and_clone_rpc.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260910132725_t7a_f11_revoke_anon_execute_clone_recipe.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "UX-1A T7a/F11 reconciliation PostgreSQL suite: PASSED"
