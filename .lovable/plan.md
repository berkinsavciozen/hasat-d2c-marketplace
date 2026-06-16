# Iteration 5 — Counter-Offer, Wiring & Polish

Purely additive. Existing routes, tokens, and store schema preserved; store gains `counterOffer`, `priceAlerts`, plus tweaks to `setPendingOffer`/offer flow.

## 1. Store extensions (`src/lib/hasat/store.ts` + `types.ts`)
- Add `PriceAlert { id, crop, target, condition: 'above'|'below', channels: {whatsapp,push,sms} }`.
- Add `CounterOffer` fields on `Offer` (counterQty, counterPrice, counterDelivery, counterDate, counterNote) — already partly there via `quantity/pricePerUnit/note` updates; extend rather than break.
- New slices: `priceAlerts: PriceAlert[]`, `addPriceAlert`, `removePriceAlert`.
- `pendingOffer` keeps original snapshot so buyer negotiation screen can diff against counter.

## 2. New route — `src/routes/buyer.negotiation.$offerId.tsx`
- Back arrow + "Müzakere" heading via `BuyerHeader`.
- Two cards side-by-side (`grid-cols-1 md:grid-cols-2`): "Teklifiniz" (original) vs "Çiftçinin Teklifi" (counter). Highlight diffs in saffron.
- Total row per side (`qty × price` via `formatTRY`).
- Three buttons: Reddet (outline destructive), Kabul Et (saffron), Karşı Teklif Yap (secondary).
  - Kabul Et → `updateOffer(id,{status:'accepted'})` + create `Order` + nav `/buyer/orders`.
  - Reddet → `updateOffer(id,{status:'rejected'})` + `router.history.back()`.
  - Karşı Teklif Yap → opens `Sheet` (reuses form pattern from `farmer.orders.$offerId.counter.tsx`) pre-filled with farmer's counter values; submit → `updateOffer` with new buyer counter and toast.

## 3. Wiring fixes
- **A4 Price Alert sheet** (`farmer.prices.tsx`): "Fiyat Alarmı Kur" opens `Sheet` with crop `Select` (pre-filled), ₺ Input, condition `ToggleGroup` (Üzerinde/Altında), 3 channel `Checkbox`. Save → `addPriceAlert` + toast. Existing alerts render as dismissible chips above the button (`Badge` with × → `removePriceAlert`).
- **A5 Storefront delete** (`farmer.storefront.tsx`): trash icon → `AlertDialog` confirm → remove listing + toast "İlan kaldırıldı". (Add `removeListing` to store if missing.)
- **A6 Kabul Et → order** (`farmer.orders.tsx`): on accept, generate `HT-YYYY-XXXX` ref, build 5-step timeline via existing `tlSteps('preparing')`, `addOrder`, then `navigate({to:'/farmer/orders'})` (or detail route if exists — use list since farmer order detail isn't built).
- **Buyer→farmer offer sync**: confirm `buyer.payment.tsx` writes via `addOffer` (not only `addOrder`) so it surfaces in farmer A6. If currently only adds Order, also push an Offer with `status:'pending'` and producer/buyer linkage so farmer sees it incoming.

## 4. RoleSwitcher floating button
- Update `RoleSwitcher.tsx`: always rendered if `import.meta.env.DEV`. Collapsed FAB bottom-right (`fixed bottom-4 right-4 z-50 opacity-80`); tap expands to current pill UI. Mount once in `__root.tsx` (verify it's there for all routes, not only home).

## 5. Visual polish (cross-file)
- Add `line-clamp-2` to producer/listing card titles (discover, storefront, producer profile, offers); `truncate` on price spans.
- Replace all `<ResponsiveContainer height="100%">` with explicit `height={220}` or `height={280}` (analytics, reports, producer profile).
- `__root.tsx`: ensure `<Toaster className="z-[9999]" />`.
- Add `.pb-safe { padding-bottom: env(safe-area-inset-bottom); }` utility in `styles.css`; apply to fixed bottom nav/CTAs (buyer.tsx bottom nav, farmer fixed CTAs, payment, counter, negotiation).
- **B1 empty state** (`buyer.discover.tsx`): when filtered list empty + search non-empty → centered 🌾 (text-6xl), heading "Sonuç bulunamadı", subtext.
- Container widths: audit screen wrappers to use `max-w-md mx-auto md:max-w-2xl lg:max-w-none` pattern. Apply to buyer/farmer route shells where currently fixed.

## Out of scope
No new design tokens, no backend, no real payments/SMS, no farmer order detail route (uses list). No changes to component public APIs.

## Files touched (estimate)
**New:** `src/routes/buyer.negotiation.$offerId.tsx`
**Edit:** `store.ts`, `types.ts`, `RoleSwitcher.tsx`, `__root.tsx`, `styles.css`, `farmer.prices.tsx`, `farmer.storefront.tsx`, `farmer.orders.tsx`, `buyer.discover.tsx`, `buyer.payment.tsx`, `buyer.tsx`, `farmer.analytics.tsx`, `buyer.reports.tsx`, `buyer.producer.$id.tsx`, `routeTree.gen.ts`.
