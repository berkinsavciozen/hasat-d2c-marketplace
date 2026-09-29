# DATA-0 — production test data isolation

## Decision

The two `orders_allowlist` principals are retained for ORD-1/runtime acceptance and marked as
`profiles.is_test_account`. Their rows are not deleted. Normal users and anonymous visitors must not
see the test farmer, parcel, certification or listing; product KPI views must not count activity by
either marked principal. Marked test principals retain listing visibility so the controlled order
acceptance path remains usable.

## Read-only preflight snapshot (2026-09-29)

- profiles: 2
- listings: 1
- parcels: 1
- offers involving either principal: 1
- orders involving either principal: 1
- reviews: 0
- crop requests: 1
- harvest subscriptions: 1
- notifications: 6
- order-intent events: 0
- recipe views: 87
- recipe saves: 2
- recipe-sourced offers: 1

Historical cleanup was already materially complete: production had 3 profiles, 1 offer, 1 order,
0 reviews and 0 order-linked `price_history` rows. No `data0_backup_20260924` table was present in the
live catalog during the audit; this migration therefore creates no destructive dependency on that
unverified claim.

## Controlled rollout

1. Confirm the migration blob reviewed in Git is the blob being applied.
2. Record row counts and fingerprints for the two marked profiles and their listing, parcel, offer,
   order, crop request, subscription and recipe engagement rows.
3. Apply the migration once. Do not delete or rewrite the fixture records.
4. Read back the migration history, helper security attributes, grants, listing policies and view
   definitions.
5. As anon and a normal authenticated account, verify that the test farmer/listing/public parcel
   projections are absent. As each marked test account, verify the controlled listing remains visible.
6. Verify all direct KPI views listed in the migration exclude the marked principals and that
   downstream order KPIs inherit the filtered `v_kpi_order_base`.
7. Run security and performance advisors. Any new WARN/ERROR is a stop condition.
8. Run the ORD-1 test-pair flow. The preserved offer/order may progress; normal users remain in
   storefront mode.

## Rollback

Rollback is fix-forward only. If isolation blocks a required acceptance path, first leave the marker
and test data intact, then adjust the restrictive listing policy or affected view in a reviewed
forward migration. Do not restore test data to customer-facing KPI or storefront surfaces as a
rollback shortcut.

