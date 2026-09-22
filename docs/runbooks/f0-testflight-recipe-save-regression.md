# F0 TestFlight recipe ACL reconciliation runbook

Status: correction draft only. No production migration, deploy, merge, or
TestFlight verification has been performed.

## Corrected root cause

The UX-1B recipe RPCs are `SECURITY INVOKER`. Production carries legacy
column-level INSERT/UPDATE ACLs on `recipes` and `recipe_ingredients` for
both `anon` and `authenticated`, but the later `private_edit_version`
column has neither authenticated privilege. The atomic create/update RPCs
therefore fail with `42501`.

Adding only the missing version grant would make the RPCs work but preserve the
legacy anon writes and authenticated owner/state mutation surface. The
correction migration first removes every table- and column-level INSERT/UPDATE
grant for `PUBLIC`, `anon`, and `authenticated`, then grants only the
exact RPC write columns to `authenticated`. Existing SELECT/DELETE and
restrictive RLS policies are not changed.

## Proposed rollout (still pending)

1. Record fresh production ACL, security advisor, and performance advisor
   baselines.
2. Confirm migration `20260922082508` is still absent from production history
   and the merged Git blob matches the reviewed migration.
3. Apply only
   `20260922082508_f0_testflight_recipe_write_grants.sql` through the approved
   production migration path.
4. Read back the complete table/column ACL matrix:
   - no INSERT/UPDATE for `PUBLIC` or `anon`;
   - authenticated recipe INSERT and UPDATE match the migration allow-lists;
   - authenticated ingredient INSERT matches its allow-list and UPDATE is empty;
   - SELECT/DELETE remain unchanged;
   - recipe RPCs remain authenticated-only and `SECURITY INVOKER`;
   - restrictive owner/private/draft/`kullanici` policies remain present.
5. Re-run both advisors. Expected delta: zero new findings. Stop on any new
   warning or error.
6. Run the approved authenticated create/update/clone/T6/ingredient replacement
   and favorite smoke matrix without logging payloads or user data.
7. Re-test TestFlight build 13. Do not start a new build in this rollout.

## Safe containment rollback

Do not restore the legacy broad `anon` grants or authenticated owner/state
grants. If the RPC rollout must be stopped, revoke only the newly required
version privileges:

```sql
revoke insert (private_edit_version)
  on public.recipes from authenticated;
revoke update (private_edit_version)
  on public.recipes from authenticated;
```

This deliberately returns atomic create/update to the pre-fix `42501` state
while leaving the ACL narrowing intact. Investigate and fix forward. Re-run the
ACL matrix and advisors after containment; do not automatically replay the
historical unsafe grants.
