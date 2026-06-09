
## 1. Fix the routing 404

**Root cause:** Route files use the `_farmer` / `_buyer` prefix, which TanStack Router treats as **pathless** layouts. So `_farmer.home.tsx` resolves to URL `/home`, not `/farmer/home`. Every `<Link to="/farmer/home">` etc. throws a `notFound`, which is why the root `NotFoundComponent` ("404 Page not found") flashes after picking a role. Confirmed in `routeTree.gen.ts` (`fullPaths` only contains `/home`, `/journal`, …).

**Fix:** drop the underscore on the layout segment so the URL actually includes `/farmer` and `/buyer`. Architecture, components, and all `to:` strings stay identical.

Rename (using `mv`):
- `src/routes/_farmer.tsx` → `src/routes/farmer.tsx`
- `src/routes/_farmer.home.tsx` → `src/routes/farmer.home.tsx`
- `src/routes/_farmer.journal.tsx` → `src/routes/farmer.journal.tsx`
- `src/routes/_farmer.journal.new.tsx` → `src/routes/farmer.journal.new.tsx`
- `src/routes/_farmer.journal.$entryId.tsx` → `src/routes/farmer.journal.$entryId.tsx`
- `src/routes/_farmer.prices.tsx` → `src/routes/farmer.prices.tsx`
- `src/routes/_farmer.storefront.tsx` → `src/routes/farmer.storefront.tsx`
- `src/routes/_farmer.offers.tsx` → `src/routes/farmer.offers.tsx`
- `src/routes/_farmer.analytics.tsx` → `src/routes/farmer.analytics.tsx`
- `src/routes/_farmer.community.tsx` → `src/routes/farmer.community.tsx`
- Buyer mirror: `_buyer.*` → `buyer.*` (tsx, discover, orders, messages, reports, account)

Inside each renamed file:
- Update `createFileRoute("/_farmer/...")` → `createFileRoute("/farmer/...")` (and `/_buyer/...` → `/buyer/...`).
- Update `import { FarmerHeader } from "./_farmer"` → `from "./farmer"` (same for buyer).
- `beforeLoad` role guard stays as-is.

No changes to existing Link `to:` values, RoleSwitcher targets, or `index.tsx` redirects — they already use `/farmer/home` and `/buyer/discover`.

## 2. A4 — Price Intelligence (`farmer.prices.tsx`)

Replace the current stub. Layout inside the existing `FarmerHeader` dark shell:

- **Header**: title "Fiyat İstihbaratı", subtitle date.
- **Crop pill tabs** (horizontal scroll, snap): Safran / Lavanta / Tıbbi Bitkiler / Fındık / Zeytinyağı. Active = saffron bg, inactive = white/10. Local `useState<string>` for `selectedCrop`.
- **Featured price card** (dark bg, rounded-2xl, inside header area): 3 rows for the selected crop —
  1. "İstanbul Hal (toptan)" — `hal` (₺/unit, mono), ▲/▼ delta vs hal*0.95 baseline (sage/red).
  2. "Hasat D2C Ortalaması" — `d2c`, saffron background highlight + `TrustBadge` "Hasat Alıcıları". Delta = `delta7d`.
  3. "AB İhracat Spot" — `export` in € (mono, e.g. `€12.4/kg`), small ▲/▼.
- **Recharts LineChart** (140px, saffron stroke) showing fabricated 7-day series derived from `d2c` (e.g. `[d2c*0.94, *0.96, *0.97, *0.99, *1.0, *1.01, *1.0]`). Pure visual, no store change.
- **Other crops PriceTicker rows**: map remaining `prices`, each row = crop emoji + name, `d2c` mono, delta colored, mini `Sparkline` (gold). Clicking a row sets `selectedCrop`.
- **AIInsightBanner** at bottom (e.g. "Safran fiyatı 7 günde %8.4 yükseldi — vitrindeki listenizi güncelleyin.").
- **"+ Fiyat Alarmı Kur"** sticky button (saffron) opens a shadcn `Sheet` (side="bottom") containing:
  - crop `Select` (from prices list)
  - target price `Stepper` (₺)
  - above/below toggle (two pill buttons: "Üstüne çıkınca" / "Altına düşünce")
  - channel multi-select chips: WhatsApp / Push / SMS
  - "Kaydet" button → `toast` (sonner) "Alarm kuruldu" + close. Local state only, no store mutation.

No new shared components required; reuse `TrustBadge`, `AIInsightBanner`, `Sparkline`, `Stepper`.

## 3. A5 — Storefront (`farmer.storefront.tsx`)

Replace stub. `FarmerHeader` title "Vitrin", subtitle "Aktif listelemeleriniz".

- shadcn `Tabs`: "Ürünlerim" / "Geçmiş".
- **Ürünlerim**: filter `listings` where `status==="active"`. Each card = crop emoji (Safran 🌸, Lavanta 💜, Tıbbi 🌿, Fındık 🌰, Zeytinyağı 🫒, fallback 🌾) + name, quantity + unit, `formatTRY(pricePerUnit)`/unit, `TrustBadge` for quality (A/B/C), status chip "Aktif" (sage). Actions: "Düzenle" (opens BottomSheet pre-filled) and "Kaldır" (sets `status="expired"` in store via new `updateListing` action).
- Empty state: 🏪 + "Henüz ürün listelemediniz" + saffron "Ürün Listele" CTA opens the same sheet.
- **FAB** "+ Yeni Ürün" (fixed bottom-right above tab bar, saffron, rounded-full).
- **Listing form Sheet** (side="bottom"): crop `Select`, `Stepper` qty with g/kg/L unit toggle, `₺` input for price/unit, `Stepper` min order, quality grid (A/B/C as 3 buttons, saffron when selected), description `Textarea`, "Yayınla ✓" button → `addListing` or `updateListing`, close + toast.
- **Geçmiş**: listings where `status !== "active"` rendered greyed (opacity-60) with status badge "Satıldı" (gold) / "Süresi Doldu" (muted). No actions.

**Store additions** (extend `useHasat`, non-breaking):
- `addListing(l: Omit<Listing, "id">) => Listing`
- `updateListing(id: string, patch: Partial<Listing>) => void`
- Seed two extra `status:"sold"` and `status:"expired"` rows for Geçmiş demo.

Schema of `Listing` type is unchanged.

## 4. A6 — Offers & Orders (`farmer.orders.tsx`, new route)

New file `src/routes/farmer.orders.tsx`, registered automatically by router plugin. Sidebar/bottom-nav unchanged (Teklifler badge already points to `/farmer/offers` which exists as a stub — leave existing offers route; the new `/farmer/orders` route is what badge will eventually use, but per spec the user asked to split into `_farmer.orders.tsx` — we create `farmer.orders.tsx`).

- `FarmerHeader` "Siparişler".
- shadcn `Tabs`: "Gelen Teklifler" / "Aktif Siparişler" / "Tamamlanan".
- Offer card: buyer name (e.g. "Mikla Restaurant") + chip ("Restoran" / "Otel" / "Market" / "İhracatçı"), product line ("Safran · 50 g"), offered `₺/unit`, total `formatTRY(qty*price)`, time ago ("2 saat önce"), `OrderChip` status pill (sage="Kabul edildi", saffron="Beklemede", gold="Karşı teklif", muted="Tamamlandı").
- Buttons (only on "pending"): "Kabul Et" (sage bg) → `updateOffer(id,{status:"accepted"})`; "Müzakere Et" (outline saffron) → `navigate({ to: "/farmer/orders/$offerId/counter", params: { offerId: id } })`.

**New types & store**:
```ts
export interface Offer {
  id: string;
  buyerName: string;
  buyerType: "restoran"|"otel"|"market"|"ihracatci";
  crop: string; unit: "g"|"kg"|"L";
  quantity: number; pricePerUnit: number;
  createdAt: string; // ISO
  status: "pending"|"accepted"|"counter"|"active"|"completed"|"rejected";
}
```
Add to `Store`: `offers: Offer[]`, `updateOffer(id, patch)`, `addOffer(o)`, seeded with 4–5 offers across the three tab buckets. Tabs map: Gelen=pending+counter, Aktif=accepted+active, Tamamlanan=completed.

Tiny new `OrderChip` component under `src/components/hasat/OrderChip.tsx` (single file, status→color map).

## 5. A6-COUNTER (`farmer.orders.$offerId.counter.tsx`)

Dynamic route. Loader reads from store (`useHasat.getState().offers.find(...)`) — if missing `throw notFound()`. Provide `notFoundComponent` + `errorComponent` per template rules.

UI:
- `FarmerHeader` "Karşı Teklif".
- Muted summary card: original buyer / product / qty / price / total (read-only, opacity-70).
- Form:
  - `Stepper` proposed qty (pre-filled, unit shown).
  - ₺ input proposed price (pre-filled).
  - 3 radio pills delivery: "Kapıda Teslim" / "Kargo" / "Alıcı Alır".
  - `<input type="date">` delivery date.
  - `Textarea` optional note.
  - Live total = `formatTRY(qty * price)`.
- "Karşı Teklif Gönder" saffron button → `updateOffer(id, { status:"counter", quantity, pricePerUnit })` + `toast` + `navigate({ to:"/farmer/orders" })`.

## Out of scope (unchanged)

- A1 auth/OTP, A1-ONB, A7 community, A8 analytics, A9 premium, A10 settings.
- All Buyer screens beyond existing shells.
- `_farmer.offers.tsx` stub: kept as-is (badge still routes there); spec puts offers inside the new `/farmer/orders` route. I will not delete the stub to avoid breaking the sidebar badge link, but will repoint the sidebar "Teklifler" item to `/farmer/orders` so users land on the real screen.

## Technical notes

- All renames are pure file moves + the `createFileRoute("/_farmer/x")` → `createFileRoute("/farmer/x")` string update + the `./_farmer` import path fix. The TanStack Router Vite plugin regenerates `routeTree.gen.ts` automatically.
- No design tokens, no shared component signatures, no existing Zustand fields changed — only additive (`addListing`, `updateListing`, `offers`, `updateOffer`, `addOffer`).
- Recharts already installed; reuse for prices chart.
- BottomSheet = shadcn `Sheet` with `side="bottom"`, rounded-t-2xl.
