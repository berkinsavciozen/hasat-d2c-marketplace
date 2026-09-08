#!/usr/bin/env bash
# Disposable local PostgreSQL only; never consumes a production connection URL.
set -euo pipefail
cd "$(dirname "$0")/../../.."
B9_DOCKER="${B9_DOCKER:-docker}"
B9_CONTAINER="hasat-b9-contract-${RANDOM}-$$"
"$B9_DOCKER" run --rm -d --name "$B9_CONTAINER" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
trap '"$B9_DOCKER" stop "$B9_CONTAINER" >/dev/null' EXIT
for attempt in {1..30}; do
  if "$B9_DOCKER" exec "$B9_CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
psql_test() { "$B9_DOCKER" exec -i "$B9_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -X -q; }
psql_test < supabase/tests/b3_delete_own_account_banned_until_fix/00_fixtures.sql
psql_test < supabase/migrations/20260904200000_b3_delete_own_account_banned_until_fix.sql
psql_test < supabase/tests/b9_profile_deleted_at/00_fixtures.sql
# Install the actual existing self-update restriction trigger, not a rewritten stand-in.
sed -n '/CREATE OR REPLACE FUNCTION public.enforce_profile_self_update_restrictions()/,/FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_self_update_restrictions();/p' \
  supabase/migrations/20260710081633_2a682c67-994a-4213-85c5-0cb8688ae265.sql | psql_test
psql_test < supabase/migrations/20260907135903_b9_profile_deleted_at.sql
psql_test < supabase/tests/b9_profile_deleted_at/01_assertions.sql
