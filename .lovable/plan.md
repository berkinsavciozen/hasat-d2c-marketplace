
## Bug 1 — Offer status enum crash on payment

`useSimulatePayment` in `src/lib/hasat/queries.ts` (line ~924) sets `status: "active"`, which isn't in the `offer_status` enum → crash.

- Change the update to `{ payment_status: "paid", status: "accepted" }`.
- Update the comment above (line 915) accordingly.
- Leave `listings.status = "active"` and `harvest_subscriptions.status = "active"` alone — those are different enums and valid.
- No changes needed in `dbToOrder` / `useBuyerOrders` / Aktif tab filter: the Aktif tab already filters `orders` by order status (`preparing/shipped/delivered`) — never by the string `"active"`. The URL param `?tab=active` is just a tab id, not a DB value.
- Result: paying an accepted offer no longer errors; buyer is redirected to `/buyer/orders?tab=active` where the newly created order appears with the unmasked farmer name + `tel:` link + crop/qty/total/estimated delivery (already implemented).

## Bug 2 — formatCrop missing on home + discover

`formatCrop` (in `src/lib/hasat/format.ts`) already title-cases slugs like `safran_soğanı` → `Safran Soğanı`. Apply it where crop names render raw:

- `src/routes/farmer.home.tsx` line 92 — wrap `l.crop` in `formatCrop(...)`.
- `src/routes/buyer.discover.tsx`:
  - Line 123 card title — wrap `l.crop` in `formatCrop(...)`.
  - Line 116 image `alt` — same.
  - Search filter (line 37) and category count (line 76) already lowercase both sides, so they keep matching regardless of display formatting; no change to filter logic.

## P16-B — Complete public vitrin (`/s/$slug`)

### a. RLS for unauthenticated read

Currently anon can't read `profiles`, `listings`, or `parcels` → the fallback `slugify` lookup returns empty for logged-out visitors. Add narrow public policies via one migration:

- `profiles`: `CREATE POLICY "Public read farmer profiles" ON public.profiles FOR SELECT TO anon, authenticated USING (role = 'farmer');`
- `listings`: `CREATE POLICY "Public read active listings" ON public.listings FOR SELECT TO anon USING (status = 'active');` (authenticated already covered).
- `parcels`: `CREATE POLICY "Public read parcels" ON public.parcels FOR SELECT TO anon, authenticated USING (true);` (photos + name/area only exposed via query projection).
- `GRANT SELECT ON public.profiles, public.listings, public.parcels TO anon;`
- `certifications` already has public SELECT — no change; `GRANT SELECT ... TO anon` if missing.

### b. Enhance `src/routes/s.$slug.tsx`

- Extend `useStorefront` to also fetch `certifications` for the farmer (`type, verified_at, expires_at`).
- Add a **Sertifikalar** section under the header rendering each active/non-expired cert as a chip (reuse the existing badge styling from `farmer.settings.tsx`).
- Read auth state via `supabase.auth.getUser()` (or existing `useAuthUserId` hook) and:
  - If **not logged in**: render a sticky bottom CTA button "Teklif göndermek için giriş yapın" → `Link to="/login" search={{ role: "buyer" }}`.
  - If **logged in**: no CTA in this phase (offer button comes later).
- Remove the misleading "Giriş yapmalısınız" error branch — with public RLS, errors are real errors.
- Keep the existing listings + Tarlalarım grid.
- Add `head()` with dynamic `title` and `og:title/og:description` derived from farmer name/city.

### c. "Vitrin Linkini Kopyala" buttons

Add a shared helper: `const vitrinUrl = (profile) => \`https://hasat.lovable.app/s/${slugify(profile.name ?? profile.id)}\``; if `name` empty, fall back to `profile.id`.

- **`src/routes/farmer.settings.tsx`** — new row inside the Profil section (below Kaydet): button "Vitrin Linkini Kopyala" using `navigator.clipboard.writeText(url)` + `toast.success("Kopyalandı")`, and small monospace preview text of the URL below.
- **`src/routes/farmer.storefront.tsx`** — same button near the page header.

## Files touched

- `src/lib/hasat/queries.ts` (bug 1)
- `src/routes/farmer.home.tsx` (bug 2)
- `src/routes/buyer.discover.tsx` (bug 2)
- `src/routes/s.$slug.tsx` (P16-B b)
- `src/routes/farmer.settings.tsx` (P16-B c)
- `src/routes/farmer.storefront.tsx` (P16-B c)
- One Supabase migration for public-read RLS + grants (P16-B a)

## Order of execution

1. Run the RLS migration (needs approval first).
2. Apply the three code batches in parallel writes.
3. Verify: log out → open `/s/<farmer-name-slug>` → see profile, certs, listings, parcels, and login CTA.
