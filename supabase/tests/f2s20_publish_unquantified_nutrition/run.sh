#!/usr/bin/env bash
# F2-S20 SQL suite: publish_recipe_draft must mark quantity+unit-less draft ingredients with
# nutrition_exclusion_reason, so calculate_recipe_nutrition agrees with the approval-time
# refresh_draft_nutrition_preview (which skips them) and the publish gate doesn't roll back.
#
# Applies the same prerequisite chain as ../allergen_nutrition_publish_gate plus the T4 debt
# closure (adds nutrition_exclusion_reason + the v2 calculator), reproduces the failure against the
# pre-fix publish_recipe_draft, then applies the F2-S20 migration and proves the fix.
# Uses only ambient libpq settings and never knows or touches a production Supabase project.
set -euo pipefail

DB_NAME="${F2S20_TEST_DB:-hasat_f2s20_publish_unquantified_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

"${PSQL[@]}" -d "$DB_NAME" -f "$REPO_ROOT/supabase/tests/f2_recipe_publish/00_fixtures.sql"
for migration in \
  20260819120000_f2s03_recipe_automation_schema.sql \
  20260819150000_f2s04_recipe_validation_rpcs.sql \
  20260822120000_f2s05_recipe_stage_dispatch.sql \
  20260826120000_f2s11_recipe_admin_reviews.sql \
  20260826130000_f2s12_recipe_publish_rpc.sql \
  20260904160000_t4a_recipe_nutrition_columns.sql \
  20260904161000_t4a_crop_nutrition_reference_table.sql \
  20260904170000_t4a2_recipes_nutrition_allergen_column_lock.sql \
  20260904180000_t3a_allergen_contract_schema.sql \
  20260904190000_t3a2_allergen_labels_taxonomy_remap.sql \
  20260909120000_f024_recipe_nutrition_calc_engine.sql \
  20260909123000_f024b_revoke_nutrition_calc_public_execute.sql \
  20260909130000_f024t4b_recipe_nutrition_trigger_wiring.sql \
  20260910073732_allergen_nutrition_publish_gate.sql
do
  "${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/$migration"
done

"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260911095451_t4_production_nutrition_debt_closure.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_before_fix.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260925083137_f2s20_publish_unquantified_nutrition_exclusion.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/02_after_fix.sql"

echo "F2-S20 publish unquantified nutrition exclusion SQL suite: PASSED"
