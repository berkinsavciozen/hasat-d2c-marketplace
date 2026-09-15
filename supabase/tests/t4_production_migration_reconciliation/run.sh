#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${T4_RECONCILIATION_TEST_DB:-hasat_t4_production_migration_reconciliation_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

assert_live_source() {
  local file="$1" expected="$2" actual
  actual="$(md5sum "$file" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "Recovered migration source mismatch: $file" >&2
    exit 1
  fi
}

assert_live_source "$MIGRATIONS_DIR/20260911095451_t4_production_nutrition_debt_closure.sql" 8fa56c884ad1df71327e6e8a6337ed95
assert_live_source "$MIGRATIONS_DIR/20260911131439_t4b_close_13_recipes_reference_data.sql" 2f189dc85b162305653d142e5bb757fc
assert_live_source "$MIGRATIONS_DIR/20260911131555_t4b_sumak_crop_nutrition.sql" 2a5731efc8cf2ab71e9510656e99d7d9

dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"
"${PSQL[@]}" -d "$DB_NAME" -f "$REPO_ROOT/supabase/tests/f024t4b_recipe_nutrition_trigger/00_fixtures.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904160000_t4a_recipe_nutrition_columns.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904161000_t4a_crop_nutrition_reference_table.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904170000_t4a2_recipes_nutrition_allergen_column_lock.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260909120000_f024_recipe_nutrition_calc_engine.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260909123000_f024b_revoke_nutrition_calc_public_execute.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260909130000_f024t4b_recipe_nutrition_trigger_wiring.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_pre_migration.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260911095451_t4_production_nutrition_debt_closure.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260911131439_t4b_close_13_recipes_reference_data.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260911131555_t4b_sumak_crop_nutrition.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_before_replay.sql"

# Only the two data-only follow-ups are idempotent. The one-shot schema migration is intentionally
# never replayed; its version already exists in production migration history.
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260911131439_t4b_close_13_recipes_reference_data.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260911131555_t4b_sumak_crop_nutrition.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/02_assertions.sql"

echo "T4 production migration reconciliation PostgreSQL suite: PASSED"
