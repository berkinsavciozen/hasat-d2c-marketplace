+# UX-1F-B web/mobile dormant rollout handoff

Status: draft client work only. Backend migration `20260923071622_ux1f_a_secure_private_recipe_share.sql` is merged but is not applied to production. Do not enable either client yet.

## Client contract

Both clients use only the six UX-1F-A RPCs: create/list/rotate/revoke/resolve/keyed clone. The retired generate/get/revoke/UUID-clone signatures have no caller or fallback. Sharing is limited to owner-owned `private + draft + kullanici` recipes. A clone remains `private + draft + kullanici + shared_clone`; neither client offers a publish action.

The external URL is exactly `/tarif-paylasim#share=<64-lowercase-hex>`. Web reads the fragment on the client, immediately removes it with `history.replaceState`, and retains it only in module memory for the lifetime of that tab. It never enters a loader, route parameter, query/search parameter, login `next`, query-cache key, persistent store, analytics, console, breadcrumb, or error payload. A reload or closed tab deliberately loses the capability and asks the user to reopen the link. Sentry recursively redacts `share`, `p_token`, and matching share fragments as defense in depth.

Mobile creates and manages grants natively and shares only the HTTPS fragment URL through the system share sheet. The current native-link proof is fail-closed: iOS `associatedDomains` exists, but the deployed AASA contract only claims public recipe paths; Android has no HTTPS intent filter. Therefore a private share opens the hardened `hasat-ai.com` web landing. If Expo receives the route in development or via an unexpected platform handoff, `+native-intent` sends the unchanged fragment to that landing and never converts it to query form. The token is never written to AsyncStorage, SecureStore, SQLite, TanStack cache keys, logs, analytics, or Sentry. Offline owner calls are disabled; recipient resolution/cloning stays on web and is never cached by mobile.

## Dormant flags

- Web: `VITE_UX1F_PRIVATE_RECIPE_SHARE=true`
- Mobile: `EXPO_PUBLIC_UX1F_PRIVATE_RECIPE_SHARE=true`

Both default to OFF when absent. OFF hides owner entry points and suppresses all six new RPC calls. A direct web landing shows an unavailable state and makes no RPC. These are build-time public environment flags, so enablement requires a reviewed production web build/deploy and reviewed iOS/Android build respectively; do not change source code. No package or lockfile changed.

## Coordinated rollout

1. Merge both dormant UX-1F-B draft PRs with flags absent/false.
2. Record the production baseline: migration history, exact migration blob, function/table ACLs, RLS, F0 grants, security/performance advisors, deployed web/mobile build versions, and both flags OFF.
3. Apply only the reviewed UX-1F-A migration through the approved production path.
4. Perform read-only history/function/table/RLS/F0 ACL/advisor checks, then the synthetic create → resolve → clone → exact replay lifecycle smoke from the UX-1F-A runbook. Do not log the token or RPC body.
5. Enable the web flag, then the mobile flag, only after all gates pass. Mobile enablement requires a new signed build because Expo public values are baked into the binary.
6. Run real browser/device acceptance: web keyboard/focus/200% zoom and fragment removal; iOS Dynamic Type/safe area/VoiceOver; Android font scale/safe area/TalkBack; authenticated and same-tab unauthenticated handoff; owner create/list/rotate/revoke; recipient neutral invalid state and clone retry matrix.
7. If containment is needed, turn both flags OFF first, then follow UX-1F-A by revoking EXECUTE on the six public wrappers/private helpers, preserving ledgers for investigation, and fixing forward. Never restore legacy UUID signatures, anonymous preview, raw `share_token`, or broad column grants.

## Intentional legacy-link invalidation

Migration invalidates every old raw link permanently. Before enablement, customer support and release notes must say: “Güvenli paylaşım yenilendi. Daha önce gönderdiğin tarif linkleri artık açılmaz; Defterim’den yeni bir link oluştur.” There is no compatibility fallback.

## Acceptance and scope

Required evidence: feature OFF/ON tests; token-boundary static checks; fragment capture/removal behavior; authenticated/unauthenticated/reopen paths; owner lifecycle; neutral expired/revoked/invalid/stale presentation; own-clone, conflict, in-progress and exact retry handling; private Defterim destination; responsive/accessibility checks; repository tests, typecheck delta, web production build, iOS/Android production export, and diff-check.

Out of scope: backend migration edits or apply/repair, deployment, real user data or share links, feature enablement, TestFlight, merge, public recipe publishing, and UX-1G.
