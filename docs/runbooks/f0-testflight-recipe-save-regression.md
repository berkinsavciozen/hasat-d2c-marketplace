# F0 TestFlight recipe write regression runbook

Status: draft PR only. No production migration, deploy, merge, or TestFlight verification has been performed.

## Root cause

The UX-1B recipe RPCs are `SECURITY INVOKER`. Production grants allow
`authenticated` to execute them, but omit the table/column `INSERT` and
`UPDATE` privileges that their bodies need on `public.recipes` and
`public.recipe_ingredients`. PostgreSQL therefore raises `42501` before the
existing restrictive owner/private/draft/`kullanici` RLS policies can decide
the row operation.

The `recipe_saves` contract is separate: production has authenticated CRUD,
RLS is enabled, and all four policies bind `user_id` to `auth.uid()`. This
migration intentionally does not change favorites.

## Proposed rollout (still pending)

1. Review the migration and the PostgreSQL 17 test evidence in this PR.
2. Record fresh security and performance advisor results immediately before
   applying the migration.
3. Apply only `20260922082508_f0_testflight_recipe_write_grants.sql` through the
   approved production migration path.
4. Re-run both advisors. Expected delta: zero findings, because the migration
   creates no schema objects, functions, policies, or indexes and only grants
   named columns to `authenticated`. Stop if any new finding appears.
5. Run authenticated smoke checks for create, update, clone, T6 customization,
   ingredient replacement, and favorite/unfavorite. Confirm cross-owner and
   public/published attempts remain denied. Do not log payloads or user data.
6. Only after the production contract is verified, build a new mobile binary
   from the current mobile `main`; do not reuse TestFlight build 12 or 13.

The 2026-09-22 preflight advisor scan contains unrelated existing findings.
This PR does not broaden scope to remediate them. Relevant reference:
https://supabase.com/docs/guides/database/database-linter

## Rollback

Rollback recreates the launch-blocking `42501` behavior for clients using the
atomic RPCs. Revert dependent clients first and confirm no fixed binary remains
in use before considering it.

```sql
revoke insert (
  id, slug, title, description, cover_photo_url, servings, prep_minutes,
  cook_minutes, rest_minutes, difficulty, cuisine, diet_tags,
  required_equipment, extraction_confidence, status, visibility, source_type,
  owner_id, author_type, cloned_from_recipe_id, private_edit_version
) on public.recipes from authenticated;

revoke update (
  title, description, servings, prep_minutes, cook_minutes, rest_minutes,
  difficulty, private_edit_version, updated_at
) on public.recipes from authenticated;

revoke insert (
  recipe_id, sort_order, crop, free_text_name, quantity, unit, note,
  is_key_ingredient, ingredient_class
) on public.recipe_ingredients from authenticated;
```

After rollback, re-run the advisors and the same authenticated/denied smoke
matrix. `anon`, `PUBLIC`, `service_role`, RPC definitions, and client payloads
must remain unchanged throughout rollout and rollback.
