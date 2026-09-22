# F0 TestFlight recipe ACL reconciliation runbook

Status: production SQL was applied and runtime-verified as migration
`20260922124009_f0_testflight_recipe_write_grants`. This repository-only
follow-up aligns the migration filename with that recorded production version.

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

## Production verification (completed)

1. Production ACL, security advisor, and performance advisor baselines were
   recorded before rollout.
2. Confirm migration `20260922124009` is present in production history and
   the repository Git blob still matches the reviewed/applied SQL byte-for-byte.
3. The reviewed SQL was applied once through the approved production migration
   path and recorded as
   `20260922124009_f0_testflight_recipe_write_grants.sql`. Do not reapply it.
4. The complete table/column ACL matrix was read back:
   - no INSERT/UPDATE for `PUBLIC` or `anon`;
   - authenticated recipe INSERT and UPDATE match the migration allow-lists;
   - authenticated ingredient INSERT matches its allow-list and UPDATE is empty;
   - SELECT/DELETE remain unchanged;
   - recipe RPCs remain authenticated-only and `SECURITY INVOKER`;
   - restrictive owner/private/draft/`kullanici` policies remain present.
5. Both advisors were re-run with zero new findings.
6. The approved authenticated create/update/clone/T6/ingredient replacement
   and favorite runtime matrix passed without logging payloads or user data.
7. TestFlight build 13 remains the client verification target; this repository
   history reconciliation does not start a new build.

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
