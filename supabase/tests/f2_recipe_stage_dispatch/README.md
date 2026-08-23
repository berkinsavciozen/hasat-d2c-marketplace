# F2 Recipe Automation — Step 05 SQL test suite

Repeatable, non-destructive tests for the one unapplied F2 Step 05 migration:

- `supabase/migrations/20260822120000_f2s05_recipe_stage_dispatch.sql` (`dispatch_recipe_stage`)

Like `supabase/tests/f2_recipe_automation/`, this suite only ever touches a local, throwaway
database (`hasat_f2_dispatch_test` by default) — it never connects to, or has any knowledge of, a
live Supabase project. Do not point `PGHOST`/`PGPORT` at a shared or production database when
running it.

## Requirements

Same as `f2_recipe_automation`: a local PostgreSQL 16 server with `createdb`/`dropdb`/`psql` on
`PATH` and `CREATEDB` privilege. No extensions beyond core Postgres — `pg_net` is not installed
locally, so `00_fixtures.sql` stubs a `net.http_post` function that records its calls instead.

## Running

```sh
./supabase/tests/f2_recipe_stage_dispatch/run.sh
```

Each run drops and recreates the test database, applies `00_fixtures.sql`, applies the migration
unmodified, then `01_assertions.sql`:

1. Happy path — `dispatch_recipe_stage` fires exactly one `net.http_post` call, targeting
   `.../functions/v1/<function_name>`, with the dispatch key forwarded as `x-admin-key` and the
   job id plus any extra payload fields merged into the body.
1b. P2 regression — a `_payload` carrying its own `jobId` key can never override the real job id
    (`jsonb_build_object('jobId', _job_id)` must win the `||` merge, not lose to it).
1c. P3 — an allow-listed `_function_name` (e.g. `recipe-stage-write`, `recipe-stage-qa`) dispatches
    normally; a non-allow-listed name is refused with no HTTP call at all.
1d. P4 — `app.dispatch_base_url`, when set, overrides the hard-coded default URL; when unset, the
    hard-coded default still applies (today's behavior, unchanged).
2. Negative — a null `job_id`/`function_name`/`dispatch_key` short-circuits with no HTTP call.
3. Exception isolation — a `net.http_post` that raises does not propagate out of
   `dispatch_recipe_stage` (the function's own `exception when others` catches it), proving the
   dispatch_sms/dispatch_push mirror actually holds.
4. Grants — `anon`/`authenticated` denied `execute`, `service_role` allowed.

The script exits non-zero on the first failing assertion or migration error. Set
`F2_DISPATCH_TEST_DB` to use a different database name.
