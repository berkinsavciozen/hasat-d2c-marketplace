## Bug fixes (5 targeted)

### B11 — Listing price/unit consistency
- **Storefront form** (`src/routes/farmer.storefront.tsx`): in `ListingSheet.save()`, if `unit === 'g'` and `price > 500`, show a `toast` warning + `window.confirm("₺{price}/g doğru mu? Kilogram fiyatı girmediğinizden emin olun.")`; abort if not confirmed. Purely client-side validation, no DB writes.
- **Displays** — audit that unit shown always uses the listing's `unit` field (no hardcoded `/g` or `/kg`):
  - `buyer.discover.tsx` — already uses `l.unit` ✓ (no change).
  - `buyer.offer.$listingId.tsx` — verify all price/unit strings use `listing.unit`; patch any hardcoded literal.
  - `farmer.prices.tsx` — remove `unitFor()` inference (Safran='g' is misleading for `price_points` values that are kg-level). Since `price_points` has no unit column, default to `"kg"` for all crops so display matches stored magnitudes. No auto-conversion of stored numbers.

### B12 — Buyer name shows as "Alıcı"
Root cause: RLS on `profiles` blocks farmers from reading buyer rows (mirror policy for buyers exists, farmer side missing). Join returns null → `dbToOffer` falls back to "Alıcı".
- **Migration**: add SELECT policy on `profiles`:
  ```
  Farmers read related buyer profiles
    role = 'buyer' AND get_my_role() = 'farmer'
    AND EXISTS (offers|orders|harvest_subscriptions where buyer_id = profiles.id AND farmer_id = auth.uid())
  ```
- No client change needed; existing joins in `useFarmerOffers`/`useFarmerOrders` already select `buyer:profiles(name)`.

### B15 — Turkish date input
- `src/routes/buyer.offer.$listingId.tsx` line 135: add `lang="tr"` to the `<Input type="date" …>`. No component swap.

### B16 — Mask seller phone in buyer Aktif tab
- `src/routes/buyer.orders.tsx` `formatPhone()`: return masked form `+90 5** *** ** {last2}{last2}`, e.g. `+90 5** *** ** 11`. Also change the `<a href="tel:{raw}">` to use the masked string as label and either drop the `tel:` link or keep raw href but display masked text (per bug: mask what's visible). Keep raw only in href.

### B19 — Category counts on Keşfet
- `src/routes/buyer.discover.tsx`:
  - Case-insensitive match: `listings.filter(l => l.crop.toLowerCase() === c.l.toLowerCase()).length`.
  - Same normalization for the category-click filter so "safran" listings appear when clicking "Safran".
  - Search filter (`filtered`) already lowercases query ✓.

### Verification
- Typecheck.
- Refresh Discover: "Safran" count = 1, listing visible.
- Farmer Teklifler tab: buyer name = "Zeynep Kaya".
- Buyer Aktif: phone masked.
- Buyer Teklif Ver: date input renders dd.mm.yyyy (tr locale).
- Farmer Storefront: entering 850 with unit=g triggers confirm.

No changes to business logic, offer state machine, or unrelated files.