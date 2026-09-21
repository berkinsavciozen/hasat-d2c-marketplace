#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATION="$REPO_ROOT/supabase/migrations/20260921081414_ux1c0_disable_private_step_photo_writes.sql"
CONTAINER="hasat-ux1c0-pg17-$RANDOM"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Production preflight: 20260918091532 is already applied, while the canonical
# repository source remains 20260918090000. Never replay/repair either here.
test -f "$REPO_ROOT/supabase/migrations/20260918090000_ux1b_private_step_photo_preservation.sql"
test ! -e "$REPO_ROOT/supabase/migrations/20260918091532_ux1b_private_step_photo_preservation.sql"

docker run --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ux1c0 -d postgres:17 >/dev/null
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d ux1c0 >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$CONTAINER" psql -U postgres -d ux1c0 -Atc 'show server_version;'
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1c0 < "$REPO_ROOT/supabase/tests/ux1b_atomic_private_recipe_writes/00_fixtures.sql"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1c0 < "$SCRIPT_DIR/00_fixtures.sql"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1c0 < "$REPO_ROOT/supabase/migrations/20260917081905_ux1b_atomic_private_recipe_writes.sql"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1c0 < "$REPO_ROOT/supabase/migrations/20260918090000_ux1b_private_step_photo_preservation.sql"

# PostgreSQL DDL is transactional: prove the migration can be rolled back
# before recording it, then apply it once as the forward-stop state.
{
  echo 'begin;'
  cat "$MIGRATION"
  cat "$SCRIPT_DIR/01_containment_assertions.sql"
  echo 'rollback;'
  cat "$SCRIPT_DIR/02_rollback_assertions.sql"
} | docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1c0

docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1c0 < "$MIGRATION"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1c0 < "$SCRIPT_DIR/01_containment_assertions.sql"

# Full UX-1B create/update/idempotency/clone regression suite after containment.
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -X -U postgres -d ux1c0 < "$REPO_ROOT/supabase/tests/ux1b_atomic_private_recipe_writes/01_assertions.sql"
echo 'UX-1C-0 disposable PostgreSQL 17 suite: PASSED'
