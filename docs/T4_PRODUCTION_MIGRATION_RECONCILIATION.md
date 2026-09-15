# T4 production migration reconciliation

Verified on 2026-09-15 against:

- GitHub repository: `berkinsavciozen/hasat-d2c-marketplace`
- base branch and commit: `main` at `cd81bbd39c03cbf1da580077283d786700681d4e`
- Supabase project: `efuqpiaavrzimvstpdpm`
- historical draft: PR #126 at `2cc40928881a1ad27235310660bf31b2b119072a`

## Reconciliation strategy

The three SQL files in this change are recovered from
`supabase_migrations.schema_migrations.statements` using read-only queries. Their filenames use the
versions already recorded in production migration history:

| Version | Name | Stored source bytes | Stored source MD5 |
|---|---|---:|---|
| 20260911095451 | t4_production_nutrition_debt_closure | 31,861 | `e441db7e863479afa1193039eb2c7c43` |
| 20260911131439 | t4b_close_13_recipes_reference_data | 10,454 | `2f189dc85b162305653d142e5bb757fc` |
| 20260911131555 | t4b_sumak_crop_nutrition | 887 | `2a5731efc8cf2ab71e9510656e99d7d9` |

The two T4-B files are byte-identical to the stored sources. The first repository file adds only a
conventional terminal newline; removing it reproduces the stored byte count and MD5 above. Do not
edit, squash, rename, re-timestamp, or manually execute these historical files.

A normal migration runner compares the filename version with production history. Because all three
versions are already present in production, adding the missing files reconciles source control
without executing them again there. The first migration is one-shot DDL and is intentionally not
idempotent. The two T4-B data-only follow-ups use conflict guards and targeted updates; the local
suite applies those two twice and proves the materialized result is unchanged.

## Live contract recorded, not redesigned

This change deliberately preserves the deployed contract, including values marked
`2026-09-11-t4b-review-required` and the low-confidence sumak row. It does not reinterpret or
replace any D01-D38 decision from PR #126. Improving a source value later requires a new,
forward-only migration and independent review; rewriting applied history would destroy provenance.

The read-only production snapshot on 2026-09-15 showed:

- 34 public/published recipes; 34 have `nutrition_source='computed'` and
  `nutrition_coverage_pct=100`; violations: 0.
- 43 food references, 58 aliases and 66 measure references.
- 20 audit rows: 14 under
  `20260910120000_t4_production_nutrition_debt_closure` and 6 under
  `t4b_close_13_recipes_2026-09-11`.
- Four T4 tables have RLS enabled. `PUBLIC`, `anon` and `authenticated` have no DML privilege;
  `service_role` has the required access.
- The five T4 nutrition functions deny EXECUTE to `PUBLIC`, `anon` and `authenticated`, and
  allow `service_role`.
- `anon` and `authenticated` have no table-level INSERT/UPDATE on `recipe_ingredients`.
  Column-level grants preserve the existing mobile payload while
  `nutrition_food_key` and `nutrition_exclusion_reason` remain server-controlled.

The audit rows describe production-only manual corrections already completed. They are evidence,
not a runnable backfill in this reconciliation. Re-emitting them as an automatic migration would
risk mutating production a second time.

## Verification and rollback boundary

Run:

```bash
supabase/tests/t4_production_migration_reconciliation/run.sh
```

The suite replays the dependency chain and all three recovered files on a fresh PostgreSQL 17
database, verifies source fingerprints, ACL/RLS, the mobile column boundary, service-role access,
a computed/100 calculation, the exact T4-B inventory, all six targeted T4-B corrections, and
idempotent replay of only the two data-only follow-ups.

Repository rollback is a Git revert that removes these source-history files and their tests.
There is no production rollback or down migration in this change: production already contains the
three versions, and destructive rollback of deployed nutrition objects/data is explicitly outside
this reconciliation.
