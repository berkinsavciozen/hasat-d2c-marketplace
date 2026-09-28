#!/usr/bin/env bash
# L0-03 (a) — SQL test runner for 20260928120000_l003a_public_views_hide_deleted_farmers.sql.
#
# FRESH local PostgreSQL database every run (same drop/recreate convention as
# ord1_order_lifecycle/run.sh): fixtures -> baseline objects extracted VERBATIM from
# 20260917120000_baseline_consolidated_schema_2026-09-17.sql (the three pre-fix views + their grants,
# protect_profile_deleted_at + trigger, rpc_delete_own_account) -> farmer B deletes own account and the
# pre-fix leak is asserted + view columns/grants snapshotted -> migration applied TWICE (must be
# re-runnable) -> assertions.
# Then two mutation checks, each on a fresh database with a mutated copy of the migration:
#   - public_parcel_cards filter removed  -> the "yalnız A'nın parseli" assertion must fail;
#   - section 5 revoke removed            -> the "anon UPDATE public_parcel_cards -> 42501" assertion must fail.
# Never run against a real project.
set -euo pipefail

DB_NAME="${L003A_PUBLIC_VIEWS_TEST_DB:-hasat_l003a_public_views_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
BASELINE="$MIGRATIONS_DIR/20260917120000_baseline_consolidated_schema_2026-09-17.sql"
MIGRATION="$MIGRATIONS_DIR/20260928120000_l003a_public_views_hide_deleted_farmers.sql"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q -o /dev/null)

baseline_objects() {
  # Pre-fix views, created as the BYPASSRLS non-superuser owner (live: postgres); they read/write as it.
  echo "set role hasat_owner;"
  sed -n '/^CREATE OR REPLACE VIEW public.public_certifications AS$/,/^   FROM parcels;$/p' "$BASELINE"
  grep -E '^GRANT .* ON TABLE public\.public_(certifications|farmer_profiles|parcel_cards) TO ' "$BASELINE"
  # Live Supabase default privileges: anon/authenticated hold every table privilege on the views.
  echo "grant all on public.public_farmer_profiles, public.public_parcel_cards, public.public_certifications to anon, authenticated;"
  echo "reset role;"
  sed -n '/^CREATE OR REPLACE FUNCTION public.protect_profile_deleted_at()$/,/^\$function\$;$/p' "$BASELINE"
  grep -E '^CREATE TRIGGER protect_profile_deleted_at ' "$BASELINE"
  sed -n '/^CREATE OR REPLACE FUNCTION public.rpc_delete_own_account()$/,/^\$function\$;$/p' "$BASELINE"
  echo "revoke all on function public.rpc_delete_own_account() from public;"
  grep -E '^GRANT EXECUTE ON FUNCTION public\.rpc_delete_own_account\(\) TO ' "$BASELINE"
}

prepare_db() {
  dropdb --if-exists "$DB_NAME"
  createdb -E UTF8 -T template0 "$DB_NAME"
  "${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"
  baseline_objects | "${PSQL[@]}" -d "$DB_NAME"
  "${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/01_before_migration.sql"
}

echo "==> Recreating $DB_NAME, fixtures + baseline objects, B deletes own account (pre-fix leak asserted)"
prepare_db

echo "==> Applying $(basename "$MIGRATION") (migration under test)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATION"
echo "==> Re-applying $(basename "$MIGRATION") (must be re-runnable)"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATION"

echo "==> Running assertions"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/02_assertions.sql"

MUTANT="$(mktemp)"
trap 'rm -f "$MUTANT"' EXIT

# mutation_check <label> <expected assertion message> <sed script> <grep pattern that must vanish>
mutation_check() {
  local label="$1" expected="$2" script="$3" target="$4" out
  echo "==> Mutation check: $label -> assertions must fail"
  [ "$(grep -c "$target" "$MIGRATION")" -ge 1 ] || { echo "mutation target not found"; exit 1; }
  sed "$script" "$MIGRATION" > "$MUTANT"
  if grep -q "$target" "$MUTANT"; then echo "mutation not applied"; exit 1; fi
  prepare_db
  "${PSQL[@]}" -d "$DB_NAME" -f "$MUTANT"
  if out="$("${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/02_assertions.sql" 2>&1)"; then
    echo "mutation survived: assertions passed ($label)"; exit 1
  fi
  echo "$out" | grep -q "L003A: $expected" || { echo "$out"; echo "mutant failed for the wrong reason"; exit 1; }
  echo "    mutant killed: $(echo "$out" | grep -o "L003A: .*")"
}

FILTER='^where exists (select 1 from public.profiles pr where pr.id = pc.farmer_id and pr.deleted_at is null);$'
mutation_check "public_parcel_cards filter removed" \
  "public_parcel_cards: yalnız A'nın parseli" "s/$FILTER/;/" "$FILTER"

REVOKE='^revoke insert, update, delete, truncate$'
mutation_check "write revoke removed" \
  "anon UPDATE public_parcel_cards -> 42501" "/$REVOKE/,/^  from public, anon, authenticated;\$/d" "$REVOKE"

dropdb --if-exists "$DB_NAME"
echo "==> l003a_public_views SQL test suite: PASSED"
