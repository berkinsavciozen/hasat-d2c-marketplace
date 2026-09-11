#!/usr/bin/env bash
set -euo pipefail
DB_NAME="${T4_NUTRITION_TEST_DB:-hasat_t4_nutrition_debt_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"
"${PSQL[@]}" -d "$DB_NAME" -f "$REPO_ROOT/supabase/tests/f024_nutrition_calc_engine/00_fixtures.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904160000_t4a_recipe_nutrition_columns.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904161000_t4a_crop_nutrition_reference_table.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260909120000_f024_recipe_nutrition_calc_engine.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_pre_migration.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260910120000_t4_production_nutrition_debt_closure.sql"
if "${PSQL[@]}" -d "$DB_NAME" -f "$REPO_ROOT/supabase/backfills/t4_production_nutrition_debt_closure.sql"; then
  echo "T4 approval gate test failed: unapproved backfill unexpectedly succeeded" >&2
  exit 1
fi
"${PSQL[@]}" -v BERKIN_T4_NUTRITION_DECISIONS_APPROVED=1 -d "$DB_NAME" \
  -f "$REPO_ROOT/supabase/backfills/t4_production_nutrition_debt_closure.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"
echo "T4 nutrition debt closure PostgreSQL suite: PASSED"
"${PSQL[@]}" -d "$DB_NAME" -f "$REPO_ROOT/supabase/rollbacks/20260910120000_t4_production_nutrition_debt_closure.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/03_full_rollback_assertions.sql"
echo "T4 nutrition debt full rollback: PASSED"

DRY_DB="${DB_NAME}_dry_run"
dropdb --if-exists "$DRY_DB"
createdb "$DRY_DB"
"${PSQL[@]}" -d "$DRY_DB" -f "$REPO_ROOT/supabase/tests/f024_nutrition_calc_engine/00_fixtures.sql"
"${PSQL[@]}" -d "$DRY_DB" -f "$MIGRATIONS_DIR/20260904160000_t4a_recipe_nutrition_columns.sql"
"${PSQL[@]}" -d "$DRY_DB" -f "$MIGRATIONS_DIR/20260904161000_t4a_crop_nutrition_reference_table.sql"
"${PSQL[@]}" -d "$DRY_DB" -f "$MIGRATIONS_DIR/20260909120000_f024_recipe_nutrition_calc_engine.sql"
"${PSQL[@]}" -d "$DRY_DB" -f "$SCRIPT_DIR/00_pre_migration.sql"
"${PSQL[@]}" -d "$DRY_DB" -f "$MIGRATIONS_DIR/20260910120000_t4_production_nutrition_debt_closure.sql"
"${PSQL[@]}" -d "$DRY_DB" -f "$REPO_ROOT/supabase/backfills/t4_production_nutrition_debt_dry_run.sql"
"${PSQL[@]}" -d "$DRY_DB" -f "$SCRIPT_DIR/02_rollback_assertions.sql"
echo "T4 nutrition debt rollback-only dry run: PASSED"
