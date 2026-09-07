# B-9: deleted profile contract

The account deletion RPC retains `profiles` and `auth.users` for reference integrity. A matching profile ID and role therefore do not establish active-account status. JWT access tokens can also remain valid until expiry after sign-out ([Supabase sign-out documentation](https://supabase.com/docs/guides/auth/signout)). PR #99's route guard and PR #101's finite ban fix are preserved and extended here.

## Data and mobile contract

- `public.profiles.deleted_at`: nullable `timestamptz`. Explicit `null` means not marked deleted; any timestamp means deleted. Missing status must fail closed.
- `rpc_delete_own_account()` keeps its no-argument, void-returning API, uses `auth.uid()`, and sets the marker in the same transaction as anonymization and identity scrubbing. A repeat call preserves the first timestamp.
- Buyer and farmer use the same marker. Farmer active-listing and open-order blockers remain unchanged; a rejected call leaves the marker and personal data unchanged.
- Mobile must select `deleted_at` in bootstrap/protected access checks, reject non-null or missing status before hydrating persisted user state, and retain local session/store/query cleanup after successful RPC completion. Deploy this migration before the coordinated web/mobile clients. No second mobile schema migration is needed.
- Both canonical web Supabase type files include Row/Insert/Update shapes for the new column. They were updated against this migration without querying or changing production.

## Security and RLS

The RPC remains `SECURITY DEFINER`, with the existing fixed search path and authentication check. `PUBLIC`/`anon` cannot execute it; `authenticated` can. A separate `SECURITY INVOKER` trigger prevents direct `anon`/`authenticated` inserts or changes to `deleted_at`, including clearing it with a retained JWT. It observes `current_user`, so the authorized definer RPC can set the marker even while `auth.uid()` is populated. The existing self-update restriction trigger is preserved and included in the local tests.

Existing table RLS policies and unrelated fields are unchanged. This is a web navigation/bootstrapping guard and a protected database marker, not a claim of universal API revocation: existing RLS/RPC policies do not automatically acquire a `deleted_at` predicate. No new grants, production queries, migration application, deployment or account deletion are part of this PR. The existing public buyer producer-profile route remains public.

## Legacy remediation decision

Migration history shows deleted users were identified through anonymized fields and a long ban. The B-3 migration replaced infinity bans with finite timestamps. Neither a display name, null personal fields, nor a ban is exclusive proof that this RPC deleted the account; all can result from other actions. There is no durable deletion event in the reviewed RPC/migrations that safely attributes every legacy row. **No automatic backfill is included.**

A separate privileged remediation must use independently verified deletion records to prepare an exact approved ID set. It should record the evidence and use an explicitly labelled remediation timestamp if the original deletion time is unknown. Do not backfill from names or bans alone. Until remediation, historical deleted rows with `deleted_at IS NULL` are not covered by the new marker; existing Auth rejection remains their only guard. No claim of complete historical-account coverage is made.

## Local verification

```sh
node --test src/lib/hasat/*.test.ts tests/*.test.mjs
node_modules/.bin/tsc --noEmit
npm run build
bash supabase/tests/b9_profile_deleted_at/run.sh
```

The SQL runner creates a disposable PostgreSQL 17 Docker container with no published port, uses only synthetic fixtures, and removes it on exit. Set `B9_DOCKER` to the Docker executable if it is not on PATH. It reuses B-3 fixtures and the actual prior self-update restriction trigger, then applies this forward migration. Assertions cover schema shape, RPC privileges, buyer/farmer anonymization, retained foreign keys, personal-row cleanup, repeated calls, farmer blockers, transaction rollback, no legacy backfill, and direct marker tampering.

Web tests cover active/deleted/missing/mismatched profiles, valid and stale JWT results, lookup failures, cleanup order (RPC → local sign-out → Zustand reset → React Query clear → hard redirect), and negative route loads. TanStack Router memory-history tests represent refresh, direct deep links and back navigation and assert that protected child loaders never run. Source wiring checks connect the tested access helper to both real parent routes and bootstrap. These are not live browser or GoTrue end-to-end tests.

## Post-deploy production acceptance matrix (not executed)

Use only separately authorized disposable accounts; do not record contacts, credentials or OTPs in evidence.

| Scenario | Buyer | Farmer | Expected evidence |
| --- | --- | --- | --- |
| Active profile, matching role, `deleted_at = null` | Allow | Allow | Normal protected navigation |
| Successful deletion | Test | Test without blockers | Timestamp + anonymization commit atomically; local session/store/cache cleared; hard redirect `/` |
| Retained valid JWT + marked profile, direct protected deep link | Deny | Deny | Public redirect; no protected view/data hydration |
| Same session, refresh and browser back/forward | Deny | Deny | No restored protected account state |
| Stale/expired JWT or missing profile | Deny | Deny | No protected loader access |
| Profile query fails | Deny | Deny | No authorization from persisted store |
| Attempt to clear/forge marker via Data API | Deny | Deny | Permission error; marker unchanged |
| Active listing or open order prevents deletion | N/A | Deny deletion | Timestamp stays null; account data unchanged |
| Repeat successful deletion RPC | Test | Test | Original deletion timestamp retained |
| Verified legacy deletions | Pending separate remediation | Pending separate remediation | Exact evidence-backed backfill required before historical coverage sign-off |

The production matrix must run only after a separately authorized merge/deploy and schema-cache refresh. Actual browser back-forward cache behavior and GoTrue responses remain deployment acceptance checks.
