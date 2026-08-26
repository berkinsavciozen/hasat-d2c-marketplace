#!/usr/bin/env bash
# F2 Recipe Automation — Step 12 SQL test runner.
#
# Applies the Step 03/04/05/11 (prerequisite) and Step 12 (publish RPC) migrations to a FRESH
# local PostgreSQL database, on top of live-shaped fixtures (including the full `recipes`/
# `recipe_ingredients`/`recipe_steps` column set — see 00_fixtures.sql's header for why this
# suite's fixtures are wider than ../f2_recipe_automation's), then runs the vertical-slice suite.
# Repeatable: every run drops and recreates the test database from scratch.
#
# Requires a local PostgreSQL server reachable with the ambient connection settings (PGHOST/
# PGPORT/PGUSER/PGPASSWORD, or a matching ~/.pgpass / peer-auth setup) and CREATE DATABASE
# privilege. Does not touch, and has no knowledge of, any live Supabase project.
set -euo pipefail

DB_NAME="${F2_PUBLISH_TEST_DB:-hasat_f2_publish_test}"
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

echo "==> Applying 20260826120000_f2s11_recipe_admin_reviews.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260826120000_f2s11_recipe_admin_reviews.sql"

echo "==> Applying 20260826130000_f2s12_recipe_publish_rpc.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATIONS_DIR/20260826130000_f2s12_recipe_publish_rpc.sql"

echo "==> Running Step 12 publish-stage vertical slice"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_publish_vertical_slice.sql"

echo "==> F2 recipe publish SQL test suite: PASSED"
