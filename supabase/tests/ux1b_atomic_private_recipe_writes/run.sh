#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONTAINER="hasat-ux1b-pg17-$RANDOM"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ux1b -d postgres:17 >/dev/null
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d ux1b >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$CONTAINER" psql -U postgres -d ux1b -Atc 'show server_version;'
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1b < "$SCRIPT_DIR/00_fixtures.sql"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1b < "$REPO_ROOT/supabase/migrations/20260917081905_ux1b_atomic_private_recipe_writes.sql"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1b < "$REPO_ROOT/supabase/migrations/20260918091532_ux1b_private_step_photo_preservation.sql"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1b < "$SCRIPT_DIR/02_f0_live_acl_regression.sql"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1b < "$REPO_ROOT/supabase/migrations/20260922124009_f0_testflight_recipe_write_grants.sql"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1b < "$SCRIPT_DIR/03_f0_write_contract_assertions.sql"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1b < "$SCRIPT_DIR/01_assertions.sql"
echo 'UX-1B disposable PostgreSQL 17 suite: PASSED'
