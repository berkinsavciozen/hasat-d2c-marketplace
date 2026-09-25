# Codex production migration reconciliation

Verified read-only on 2026-09-25 against GitHub `main` at
`ca98c4a928bd8d03108e5389cf89c2f1fb12ec7a` and Supabase project
`efuqpiaavrzimvstpdpm`.

## Canonical production history

The repository filenames and SQL bytes in this change reproduce the versions and
single stored statements already present in `supabase_migrations.schema_migrations`.

| Version | Name | Bytes | SHA-256 |
|---|---|---:|---|
| `20260917102138` | `revoke_authenticated_execute_refresh_draft_nutrition_preview` | 91 | `966c96c7758bc4ce6b41ecf54d7e08af16c6d02a41b9af956092c48d0fb7d3b0` |
| `20260917102142` | `revoke_authenticated_execute_refresh_draft_nutrition_preview` | 91 | `966c96c7758bc4ce6b41ecf54d7e08af16c6d02a41b9af956092c48d0fb7d3b0` |
| `20260918091532` | `ux1b_private_step_photo_preservation` | 7,779 | `ae8f94c7978db6e6a684e7982031197b809e316bf5c4973d7dc58df668795082` |
| `20260921084620` | `ux1c0_disable_private_step_photo_writes` | 1,857 | `387b63dc9f5a62e3db8ee633743d2d04337cfccfb32ff2c07292cb3018bb638a` |
| `20260921093914` | `f2s18_nutrition_culinary_alias_fallback_and_admin_resolve` | 24,973 | `477300bd7e67dae3f6055165b8de28f3a0ac4ee5c9862caa18146f1e286982cb` |
| `20260921095505` | `f2s18_fix_measure_and_reference_not_null_columns` | 7,099 | `17d3f6f23ff212c9b8be3a522fa9b2ff939af482825dc4dd719107cc3f0ae04e` |

The two revoke rows are a real duplicate in production history, not a reporting
artifact: both versions contain one identical 91-byte statement. Keeping two
versioned files is the safe repository representation because migration runners
compare versions, while replay on a fresh database is harmless because `REVOKE`
is idempotent. Do not collapse the pair or repair production history.

The UX sources were already byte-identical and are rename-only. The two F2-S18
sources differed from the stored statements only by repository-only explanatory
comments; those comments are recorded here so the canonical SQL files can match
production byte-for-byte.

## Verification and safety boundary

Run `node --test tests/codexMigrationHistoryReconciliation.test.mjs` to enforce
canonical filenames, absence of retired versions, exact byte counts and SHA-256
fingerprints, and the intentional duplicate pair.

This is repository-only reconciliation. No migration apply, replay, history
repair, schema/data write, Edge Function deploy, application deploy, or merge is
part of this change. Repository rollback is a Git revert of this change. There
is no production rollback: the six history rows already exist, and production
history must remain untouched.
