#!/usr/bin/env bash
# F2 Recipe Automation — Step 13 SQL test runner.
#
# Applies the Step 03/04/05 (prerequisite) and Step 13 (recipe_plan_briefs table +
# validate_recipe_plan_diversity + fan_out_recipe_plan_batch) migrations to a FRESH local
# PostgreSQL database, on top of live-shaped fixtures, then runs the vertical-slice suite.
# Repeatable: every run drops and recreates the test database from scratch.
#
# Requires a local PostgreSQL server reachable with the ambient connection settings (PGHOST/
# PGPORT/PGUSER/PGPASSWORD, or a matching ~/.pgpass / peer-auth setup) and CREATE DATABASE
# privilege. Does not touch, and has no knowledge of, any live Supabase project.
set -euo pipefail

DB_NAME="${F2_PLAN_TEST_DB:-hasat_f2_plan_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

echo "==> Applying 20260819120000_f2s03_recipe_automation_schema.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260819120000_f2s03_recipe_automation_schema.sql"

echo "==> Applying 20260819150000_f2s04_recipe_validation_rpcs.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260819150000_f2s04_recipe_validation_rpcs.sql"

echo "==> Applying 20260822120000_f2s05_recipe_stage_dispatch.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260822120000_f2s05_recipe_stage_dispatch.sql"

echo "==> Applying 20260831090000_f2s13_recipe_stage_plan.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260831090000_f2s13_recipe_stage_plan.sql"

echo "==> Running Step 13 plan-diversity vertical slice"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_plan_diversity_vertical_slice.sql"

echo "==> Running Step 13 fan-out vertical slice"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/02_fan_out_vertical_slice.sql"

echo "==> F2 recipe plan SQL test suite: PASSED"
