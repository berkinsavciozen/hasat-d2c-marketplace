#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${T4_NUTRITION_ACL_TEST_DB:-hasat_t4_nutrition_acl_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

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
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260910120000_t4_production_nutrition_debt_closure.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"
echo "T4 nutrition ACL + F7 PostgreSQL suite: PASSED"
