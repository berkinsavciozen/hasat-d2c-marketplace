#!/usr/bin/env bash
# F0-24 — SQL test runner for the nutrition calculation engine migration.
#
# Applies fixtures to a FRESH local PostgreSQL database, then the real T4-A migrations (this
# migration depends on the nutrition_* columns + crop_nutrition table they add), then the real
# F0-24 calc engine migration, then runs the assertion suite. Same repeatable, drop/recreate-every-
# run convention as the other suites in this repo. Does not touch, and has no knowledge of, any live
# Supabase project. Does NOT apply the T4-A3 seed data or backfill migrations (20260909121000/
# 20260909122000) — those are exercised against the live project's real 26-crop data instead; this
# suite proves the calculation function itself against small, hand-computable fixture data.
set -euo pipefail

DB_NAME="${F024_NUTRITION_CALC_TEST_DB:-hasat_f024_nutrition_calc_engine_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

echo "==> Applying 20260904160000_t4a_recipe_nutrition_columns.sql (T4-A, dependency)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904160000_t4a_recipe_nutrition_columns.sql"

echo "==> Applying 20260904161000_t4a_crop_nutrition_reference_table.sql (T4-A, dependency)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260904161000_t4a_crop_nutrition_reference_table.sql"

echo "==> Applying 20260909120000_f024_recipe_nutrition_calc_engine.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260909120000_f024_recipe_nutrition_calc_engine.sql"

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> F0-24 nutrition calculation engine SQL test suite: PASSED"
