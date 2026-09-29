#!/usr/bin/env bash
# SEC-EDGE — dispatch_sms HMAC contract suite.
#
# Applies local stand-ins (roles, Vault table, real pgcrypto, pg_net-faithful net.http_post stub) to a
# FRESH local PostgreSQL database, applies the SEC-EDGE migration, runs the SQL assertions, exports the
# captured pg_net request and verifies it end-to-end with the real send-sms handler (Deno).
# Does not touch, and has no knowledge of, any live Supabase project.
set -euo pipefail

DB_NAME="${SEC_EDGE_DISPATCH_SMS_TEST_DB:-hasat_sec_edge_dispatch_sms_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATION="$REPO_ROOT/supabase/migrations/20260929120000_sec_edge_dispatch_sms_hmac.sql"
SECRET="local-sec-edge-test-secret-$(date +%s)-0123456789abcdef"
CAPTURE="$(mktemp)"
trap 'rm -f "$CAPTURE"' EXIT

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "==> Recreating $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

echo "==> Applying fixtures"
"${PSQL[@]}" -d "$DB_NAME" -f "$SCRIPT_DIR/00_fixtures.sql"

echo "==> Applying $(basename "$MIGRATION")"
"${PSQL[@]}" -d "$DB_NAME" -f "$MIGRATION"

echo "==> Running SQL assertions"
"${PSQL[@]}" -d "$DB_NAME" -v secret="$SECRET" -v export_path="$CAPTURE" -f "$SCRIPT_DIR/01_assertions.sql"

echo "==> Verifying the captured request with the send-sms handler"
SEC_EDGE_CAPTURE="$CAPTURE" SEC_EDGE_SECRET="$SECRET" DENO_NO_PACKAGE_JSON=1 \
  deno test --allow-env --allow-read "$SCRIPT_DIR/e2e.test.ts"

echo "==> SEC-EDGE dispatch_sms HMAC suite: PASSED"
