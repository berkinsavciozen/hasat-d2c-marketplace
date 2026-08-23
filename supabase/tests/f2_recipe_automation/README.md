# F2 Recipe Automation — Step 03/04 SQL test suite

Repeatable, non-destructive tests for the two unapplied F2 migrations:

- `supabase/migrations/20260819120000_f2s03_recipe_automation_schema.sql` (tables)
- `supabase/migrations/20260819150000_f2s04_recipe_validation_rpcs.sql` (validation RPCs)

This suite only ever touches a local, throwaway database (`hasat_f2_test` by default) — it never
connects to, or has any knowledge of, a live Supabase project. Do not point `PGHOST`/`PGPORT` at a
shared or production database when running it.

## Requirements

- A local PostgreSQL 16 server (matching the live project's version) with `createdb`/`dropdb`/
  `psql` on `PATH`, and `CREATEDB` privilege for the connecting role.
- No extensions beyond core Postgres — `gen_random_uuid()` is built in since PG13; nothing here
  depends on `pgcrypto` or `pgTAP` (neither is installed in this project).

## Running

```sh
./supabase/tests/f2_recipe_automation/run.sh
```

Each run drops and recreates the test database from scratch, then applies, in order:

1. `00_fixtures.sql` — minimal, live-shaped stand-ins for the pre-existing tables/roles/functions
   the two migrations reference (`profiles`, `crop_config`, `crop_culinary_meta`, `recipes`,
   `recipe_ingredients`, `set_updated_at()`, and the `anon`/`authenticated`/`service_role` roles).
   This is a deliberate subset, not a full live-schema mirror — only the columns the migrations
   actually touch.
2. Both migrations, unmodified, exactly as they would apply to a real project.
3. A static grep check that neither migration writes to `public.recipes` directly (proof
   `recipes.status` stays untouched by this pipeline).
4. `01_assertions.sql` — the actual test suite: happy path, invalid stage/status values, partial
   lock states, QA imaging-approval-with-blocking-issues, an automated QA decision='approved'
   with safety review still pending (Step 03B: accepted — decision is independent of the later
   human safety sign-off, which stays required at the awaiting_approval/publish stage) alongside
   the still-rejected cases of safety_approved=true with no recorded reviewer identity/timestamp
   at all, with only a timestamp and no reviewer, and with only a reviewer and no timestamp
   (Step 03B follow-up — isolates each conjunct of the identity+timestamp CHECK), cross-job
   draft/QA-result and draft/asset mismatches (relational-integrity fix), duplicate asset
   rejection, RPC hardening (fractional stepNo/servings/timerSeconds, invalid `isKeyIngredient`,
   regex-metacharacter ingredient names, empty-unit normalization), the
   `get_seasonal_crop_candidates` "crop_config stays the full universe" fix, `SECURITY INVOKER`
   on every function, and anon/authenticated-denied/service_role-allowed grants on both the
   automation tables and the RPCs.
5. `02_write_stage_vertical_slice.sql` (F2 Step 06) — the one manually created kabak
   `RecipeBrief`, promoted to a `write`-stage job, run through the SAME Postgres validation RPCs
   `writer/write-stage.ts` calls (`validate_recipe_structure`/`validate_recipe_crop_values`/
   `validate_recipe_ingredient_coverage`/`validate_recipe_slug`/`normalize_recipe_units`), then
   stored as a version-1 `recipe_drafts` row, then a second version-1 insert for the same job
   proven to violate the `recipe_drafts_job_id_version_key` unique constraint (the DB-layer half
   of the write stage's idempotency guarantee). The draft JSON is not synthetic — it is the actual
   captured output of a live OpenAI Structured Outputs call through the real, shipped Writer code,
   run via a throwaway probe against the live project; see the Step 06 completion report for the
   full evidence (trace id, usage, latency).

The script exits non-zero (via `ON_ERROR_STOP`) on the first failing assertion or migration error,
so it is CI-safe as a fail-fast check. Set `F2_TEST_DB` to use a different database name.
