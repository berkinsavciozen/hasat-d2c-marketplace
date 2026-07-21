# Plan — P17-F Reorder + Şube Adresleri, Buyer Notif Prefs, Account Fixes

Scope: `src/` only. One migration for `buyer_addresses`.

## 1) Migration — `buyer_addresses`
- Columns: `id`, `buyer_id → auth.users`, `label`, `address`, `city`, `is_default bool default false`, `created_at`, `updated_at`.
- GRANT to `authenticated` + `service_role`; RLS `auth.uid() = buyer_id` for all CRUD.
- `updated_at` trigger.
- Partial unique index `(buyer_id) WHERE is_default` to guarantee at most one default; setting a new default clears the old one via `BEFORE INSERT/UPDATE` trigger.

## 2) Queries (`src/lib/hasat/queries.ts`)
- `useBuyerAddresses()`, `useCreateAddress()`, `useDeleteAddress()`, `useSetDefaultAddress()` (RLS-scoped).
- Reuse `useFarmerActiveListings(farmerId)` for reorder & subscription-to-order.
- No new notif hooks — `useNotifPrefs`/`useUpdateNotifPrefs` already role-agnostic.

## 3) Reorder buttons
- **`buyer.orders.tsx` `DoneOrderRow`** and **`buyer.orders.$orderId.tsx`**: add "🔁 Tekrar Sipariş Ver". Query the order's `listingId` from `listings` (or reuse mapped field); if `status='active'` → `<Link to="/buyer/offer/$listingId">` with `search={{ qty: order.qty }}` (price comes from current listing). If inactive → muted note "Bu ürün artık satışta değil".
- Ensure `buyer.offer.$listingId.tsx` reads `qty` from search and prefills.

## 4) Subscription → order bridge (`buyer.subscriptions.tsx`)
- On each `active` subscription card: "Şimdi Sipariş Ver" opens a small popover/sheet listing `useFarmerActiveListings(s.farmerId)` results. Selecting a listing navigates to `/buyer/offer/$listingId` with `search={{ qty?: undefined, suggestedPrice: s.priceLock ? s.lockedPrice : undefined }}`.
- `buyer.offer.$listingId.tsx`: if `suggestedPrice` search param present, prefill offer price field and show hint "Abonelik sabit fiyatı — teyit edin".

## 5) Buyer addresses UI (`buyer.account.tsx`)
- New "Adreslerim" card: list rows (label · address · city, default rozeti), inline "Ekle" form (label/address/city), "Varsayılan yap" and "Sil" actions. No integration into offer flow yet.

## 6) Buyer notification prefs (new route)
- `src/routes/buyer.settings.notifs.tsx` mirroring `farmer.settings.notifs.tsx` structure (same EVENTS/CHANNELS, same hooks) with `BuyerHeader` and back link `/buyer/account`.
- `buyer.account.tsx`: add "Bildirim Tercihleri" row (Bell icon + ChevronRight) → `/buyer/settings/notifs`.

## 7) Toast feedback on notif toggles
- In both `farmer.settings.notifs.tsx` and new buyer route, wrap `update.mutate(...)` with `mutateAsync` + `toast.success("Tercih güncellendi")` / `toast.error(err.message)`.

## 8) `buyer.account.tsx` stale-data fix
- Replace `useHasat` reads for name/phone/premium with `useProfile()`:
  - Header name → `profile.name ?? "Alıcı"`, initial from `profile.name`.
  - Location → `profile.city`.
  - Phone → `profile.phone`.
  - Premium badge → `isEffectivelyPremium(profile)`.
- Keep `user?.company?.type` label and `user?.crops` only if profile has no equivalent (they don't exist on `ProfileRow`, so drop the "İlgi Alanları" block for now — no fake source).
- Keep `useHasat` only for `reset()` on logout.

## Verification
- `tsgo` typecheck.
- Manual: create address, mark default (old default clears); reorder from a completed order into offer page with prefilled qty; subscription card lists farmer's live listings; toggle a notif → toast; buyer account shows real profile.
