# Mobile Responsiveness Audit

Audited every route + shared component at 360 px viewport. Most of the app is fine — mobile-first patterns (`flex-wrap`, `overflow-x-auto + shrink-0`, `pb-safe`, bottom sheets) are used consistently. Below is the prioritized list of what actually breaks vs. what needs polish.

## MUST-FIX (broken/unusable at 360 px)

### 1. OTP inputs overflow viewport — `src/routes/login.tsx:214`
6 inputs × `w-12` (48px) + `gap-2` = 328 px required, but content width at 360 px is ~312 px → last box clipped off-screen.
**Fix:** `gap-1` + `w-10 h-12` (or `flex-1 min-w-0` on inputs).

### 2. Buyer bottom nav has 6 tabs in `grid-cols-5` — `src/routes/buyer.tsx:20,53`
6th tab ("Hesap") wraps to a second row, making the bottom nav double-height and shoving page content up. Farmer nav already handles this with a "Daha" overflow sheet.
**Fix (recommended):** collapse to 5 slots with a "Daha" sheet — Mesajlar + Hesap behind the overflow — matching `farmer.tsx` pattern. Alternative: `grid-cols-6` (cheap, cramped labels).

### 3. AI FAB collides with page FABs — `FarmerAIChat.tsx:199` vs `farmer.storefront.tsx:163` / `farmer.prices.tsx:100`
AI FAB occupies right:16, bottom ~72–128 px. Storefront "+ Yeni Ürün" and Prices "Fiyat Güncelle" both sit at `right-4 bottom-20` (~80–124 px) — same rectangle, both untappable.
**Fix:** raise page FABs to `bottom-36` on mobile, keep `md:bottom-6`. Apply to both storefront and prices FABs.

### 4. Header title rows lack `min-w-0` / `truncate` — `farmer.tsx:251`, `BuyerHeader.tsx:5`
Long titles ("Merhaba, Abdurrahman 👋") push `<NotificationBell>` off-screen because the flex child has no width constraint.
**Fix:** wrap title in `<div className="min-w-0 flex-1">` and add `truncate` to the `<h1>`; add `gap-2` on the flex parent.

## NICE-TO-HAVE (works but not polished)

5. **Negotiation bottom bar** (`buyer.negotiation.$offerId.tsx:103`) — 3-column button row with "Karşı Teklif Yap" label is too wide for ~107 px cells. Shorten middle label to "Karşı Teklif" or stack vertically < sm.
6. **Landing hero text** (`index.tsx:166`) — `text-4xl` on 360 px is dense; add `text-3xl sm:text-4xl md:text-6xl` for a gentler mobile scale.
7. **Indoor form interest buttons** (`index.tsx:585`) — `grid-cols-3` fits but the "danışmanlık" label at `px-2` is tight; collapse to `grid-cols-1 sm:grid-cols-3`.
8. **Parcel info row** (`farmer.storefront.tsx:138`) — parcel name + long location can wrap badly; add `min-w-0 truncate` to both children.
9. **RoleSwitcher DEV widget** (`RoleSwitcher.tsx:18`) — `bottom-24 right-3` sits inside the AI FAB rectangle. Dev-only, low risk. Move to `left-3` or `bottom-40`.
10. **Login splash** (`login.tsx:180`) — inline `fontSize: 38` bypasses Tailwind scaling. Cosmetic; replace with `text-4xl`.

## OK (no changes needed)

Terms, Privacy, Join, both onboarding pages, farmer bottom nav, farmer.home quick-actions, farmer.journal.new chip rows, farmer.analytics, buyer.discover sort pills + categories, buyer.offer, buyer.orders detail, s.$slug, batch.$listingId, CropChips, Stepper, all bottom Sheets/Dialogs, `__root.tsx` viewport meta. No `<table>` elements anywhere.

## Proposed implementation order

Batch A (must-fix, ~1 focused pass):
- login.tsx OTP row
- buyer.tsx nav → 5 slots + "Daha" sheet
- storefront + prices FABs → `bottom-36 md:bottom-6`
- farmer.tsx `FarmerHeader` + `BuyerHeader` → `min-w-0` + `truncate` pattern

Batch B (nice-to-have, optional second pass):
- items 5–10 above

Then `bunx tsgo --noEmit`.

**Awaiting approval** — confirm whether to ship Batch A only or Batch A + B, and confirm the buyer-nav collapse choice (Daha sheet vs. `grid-cols-6`).
