# UX-1F-A secure private recipe share contract

Status: draft PR contract only. No production migration, history repair, Edge
deploy, application deploy, merge, or user-data write has been performed.
UX-1F-B web/mobile work is explicitly out of scope.

## 1. Audited production delta

Read-only checks on 2026-09-23 established the following starting point:

- production runs PostgreSQL 17 and records both
  `20260917090000_recipe_private_share_link_rpcs` and
  `20260917090100_revoke_anon_execute_recipe_share_rpcs`;
- production records the F0 ACL reconciliation as
  `20260922124009_f0_testflight_recipe_write_grants`, matching PRs #146/#148;
- F0 removes direct `share_token` UPDATE from authenticated users and leaves no
  recipe/ingredient writes to `anon` or `PUBLIC`;
- the legacy share contract stores a raw UUID in `recipes.share_token`, allows
  anonymous preview, has no expiry or rotation, exposes step photo URLs, and has
  no clone operation key;
- repository callers still use the four legacy RPCs. They are intentionally not
  changed in UX-1F-A; UX-1F-B must cut them over before enablement.

The current Supabase breaking-change scan found no blocker for this migration.
The upcoming default that stops automatically exposing new `public` tables is
irrelevant because both new ledgers are in the non-exposed `private` schema and
receive no client table grants.

## 2. Storage and lifecycle

`private.recipe_share_grants` is the grant ledger. It stores owner/source IDs,
timestamps, rotation ancestry, revocation state, and only a 32-byte SHA-256
digest. The raw token is 32 random bytes encoded as 64 lowercase hexadecimal
characters and is returned only in a successful create/rotate response.

`private.recipe_share_clone_operations` binds `(owner_id, operation_key)` to a
32-byte SHA-256 fingerprint of the presented token plus a canonical digest of
contract version, grant ID, and source recipe ID. It never stores the raw token.
Grant and source IDs are intentionally not foreign keys in this
completed-operation ledger. A completed clone receipt therefore remains
independent if its grant is revoked or expires, or if its source/grant is later
deleted.

Grant states are:

- `active`: not revoked and `expires_at` is in the future;
- `expired`: time has passed; it can never resolve or clone;
- `rotated`: the old row is revoked with reason `rotated`; its successor has a
  new ID, digest, token, and mandatory expiry;
- `revoked`: owner revoked; repeated revoke is idempotent.

Create and rotate require expiry at least 5 minutes and at most 30 days in the
future. Only an owned `private` + `draft` + `kullanici` recipe is eligible.
Every resolve/clone rechecks that invariant, so a later publish/state change
fails closed.

## 3. UX-1F-B API handoff

All RPCs are authenticated-only. Times are RFC 3339 `timestamptz` strings and
IDs/operation keys are UUID strings. JSON examples below show field shape, not
real values.

### Owner management

`rpc_create_recipe_share_grant(p_recipe_id uuid, p_expires_at timestamptz)`
returns:

```json
{"grant_id":"uuid","token":"64-lowercase-hex","expires_at":"timestamp"}
```

`rpc_list_recipe_share_grants(p_recipe_id uuid default null)` returns an array
of metadata objects. It never returns token or digest:

```json
[{"grant_id":"uuid","source_recipe_id":"uuid","created_at":"timestamp","expires_at":"timestamp","revoked_at":null,"status":"active"}]
```

`rpc_rotate_recipe_share_grant(p_grant_id uuid, p_expires_at timestamptz)`
returns a new one-time token:

```json
{"grant_id":"new-uuid","rotated_from_grant_id":"old-uuid","token":"64-lowercase-hex","expires_at":"timestamp"}
```

`rpc_revoke_recipe_share_grant(p_grant_id uuid)` returns:

```json
{"grant_id":"uuid","status":"revoked"}
```

### Recipient read and clone

`rpc_resolve_recipe_share(p_token text)` returns only expiry, recipe display
fields, ingredients, and steps. It omits owner/source/grant IDs, cover media,
step media, editorial/review fields, and token/digest.

`rpc_clone_shared_recipe(p_token text, p_operation_key uuid)` returns:

```json
{"recipe_id":"uuid","replayed":false}
```

After authentication and token-shape validation, an exact completed retry for
the same owner + operation key + token fingerprint returns the same `recipe_id`
with `replayed: true` before mutable grant/source state is consulted. This is
deliberate: revoke, expiry, and source/grant deletion block every new clone but
cannot invalidate an already committed receipt. Reusing the same operation key
with a different token (and therefore a different grant/source request) yields
the deterministic `recipe_share_idempotency_conflict`, even if the original
grant/source no longer exists. The clone transaction inserts the recipe,
ingredients, steps, and completed operation record atomically; any child
failure rolls everything back and creates no replayable receipt. A later retry
of that rolled-back attempt is evaluated as a new clone and must pass all active
grant/source checks.

The clone is always `private` + `draft` + `kullanici` + `shared_clone`, owned by
the recipient. It copies no cover/step media and sets `cloned_from_recipe_id` to
null. Source edits/deletion and grant deletion cannot change or delete it.

## 4. Error contract

Clients must branch on the exact database message, not localized text:

| Message | Meaning / UX action |
| --- | --- |
| `recipe_share_authentication_required` | Start/restore authenticated session |
| `recipe_share_invalid_expiry` | Expiry is missing, under 5 minutes, or over 30 days |
| `recipe_share_source_not_eligible` | Create target is absent, cross-owner, public, published, or editorial |
| `recipe_share_source_not_owned` | Owner grant-list filter is not owned |
| `recipe_share_grant_not_active` | Rotate target is absent, expired, revoked, rotated, or source is no longer eligible |
| `recipe_share_grant_not_found` | Revoke target is absent or cross-owner |
| `recipe_share_invalid_or_inactive` | Resolve token, or a first-time clone token, is malformed, forged, expired, revoked, rotated, deleted, or stale; do not distinguish these cases in UI. A completed exact clone retry is the sole lifecycle-independent exception after token-shape validation |
| `recipe_share_operation_key_required` | Clone requires a UUID operation key |
| `recipe_share_idempotency_conflict` | Same key was already bound to a different grant/source; generate a new key only for a genuinely new action |
| `recipe_share_cannot_clone_own` | Owner cannot clone their own share |
| `recipe_share_operation_in_progress` | Serializable retry signal; retry the identical request |

## 5. Token and redirect boundary

The backend accepts the token only as a JSON RPC-body parameter. UX-1F-B must
not put it in a path, query string, analytics event, error report, console,
breadcrumb, cache key, referrer, or persisted application state.

The external share URL contract is a fragment, for example
`/tarif-paylasim#share=<token>`, because fragments are not sent in HTTP request
lines or referrers. UX-1F-B owns immediate fragment removal and temporary
same-tab preservation across authentication. The login `next` URL must never
contain the token. The backend deliberately offers no anonymous resolve and no
token exchange endpoint; this prevents a server redirect from receiving or
logging the capability.

## 6. ACL, RLS, and advisor contract

- both private tables have RLS enabled plus explicit deny-all authenticated
  policies; `PUBLIC`, `anon`, `authenticated`, and `service_role` have no table
  privilege;
- public RPC wrappers are `SECURITY INVOKER` and executable only by
  `authenticated`;
- privileged helpers are in the non-exposed `private` schema, use
  `SECURITY DEFINER`, `search_path = ''`, fully-qualified relations, and repeat
  `auth.uid()` / ownership checks;
- old anon resolve and old non-idempotent signatures are dropped;
- F0's recipe/ingredient column ACL allow-lists remain unchanged and
  authenticated never regains `share_token` UPDATE.

The production pre-apply security-advisor baseline has existing findings (3
`security_definer_view` ERROR, 1 mutable-search-path WARN, 14 anon-definer WARN,
23 authenticated-definer WARN, and 1 leaked-password-protection WARN). This PR
does not claim to fix them. Post-apply must show no new WARN/ERROR finding or
count. The new definers are non-exposed private helpers; the public wrappers are
invokers.

## 7. Production rollout and read-only verification

1. Obtain ACCEPTED on this draft; merge separately. Do not apply from the PR.
2. UX-1F-B prepares a dormant/feature-flagged client using exactly this API.
3. Record fresh migration-history, function ACL, table ACL/RLS, and security/
   performance advisor baselines. Stop if `20260923071622` already exists or
   the reviewed Git blob differs.
4. Disable the legacy share entry point. Existing raw links are intentionally
   invalidated by the migration and must not remain advertised.
5. Apply only
   `20260923071622_ux1f_a_secure_private_recipe_share.sql` through the approved
   production migration path.
6. Read-only verify:
   - migration history has the exact version/name once;
   - legacy four signatures are absent;
   - six new public wrappers are invokers and authenticated-only;
   - private helpers have empty search paths and no anon/service-role execute;
   - both ledgers have RLS, deny policies, and zero client table grants;
   - every existing `recipes.share_token` is null and the retirement constraint
     is validated;
   - F0 recipe/ingredient ACL allow-lists are unchanged;
   - security/performance advisor delta contains no new WARN/ERROR.
7. Run synthetic owner/recipient smoke tests without logging token or payload.
   Verify in order that a completed clone replays the same recipe after grant
   revoke, grant expiry, and source/grant deletion; a different token on the
   same key conflicts; and a rolled-back first attempt is not treated as replay.
8. Enable UX-1F-B only after every gate passes.

## 8. Safe rollback / containment

Do not restore old raw tokens, anonymous preview, legacy UUID signatures, or a
broad `share_token` UPDATE grant. Token invalidation is intentionally one-way.

If rollout must stop, first disable UX-1F-B, then revoke execute on all six new
public wrappers and private helpers. Keep the ledgers for investigation and fix
forward. Re-run ACL/advisor checks. A later reviewed cleanup migration may drop
the new functions/tables, but application rollback must leave sharing disabled;
deploying the legacy client alone is not a safe rollback.
