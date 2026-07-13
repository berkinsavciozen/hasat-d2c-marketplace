## Investigation summary

- `useHasat((s) => s.producers)` is used in exactly **two** routes: `buyer.producer.$id.tsx` (this fix) and `buyer.subscription.$producerId.tsx`. The store initializes `producers: []`, so both routes are currently broken/404 for any real farmer id. `buyer.discover.tsx` does NOT use it. I'll flag `buyer.subscription.$producerId.tsx` but leave it untouched per your instructions.
- `useCreateEntry()` hardcodes `photo_urls: []`. Existing `uploadParcelPhotos` / `uploadListingPhotos` in `queries.ts` are the exact pattern to mirror against the `harvest-photos` bucket.
- `useListing()` returns `listing.photos` already; `batch.$listingId.tsx` never renders them.
- Hooks already available and reusable: `useParcelsByFarmer`, `useActiveListings` (filterable client-side), `public_farmer_profiles` view, `harvest_subscriptions` queries. Need one new hook `useFarmerPublicProfile(id)` and a small aggregate hook `useFarmerProducerStats(id)` for yield-history/quality/orders count.

---

## 1. Journal photo upload (fix)

**`src/lib/hasat/queries.ts`**
- Add `uploadHarvestPhotos(userId, entryId, files)` mirroring `uploadParcelPhotos` against the `harvest-photos` bucket.
- Extend `useCreateEntry`'s mutation input type to `Omit<HarvestEntry,"id"> & { photoFile?: File }`.
- After the insert, if `photoFile` present: upload → `getPublicUrl` → `update harvest_entries.photo_urls` with `[url]` → return updated row.

**`src/routes/farmer.journal.new.tsx`**
- Replace `photoName: string | null` state with `photoFile: File | null` (derive display name from `photoFile.name`).
- Pass `photoFile: photoFile ?? undefined` into `createEntry.mutateAsync(...)`.

Verification: create entry with photo, confirm `harvest_entries.photo_urls` populated, confirm render in `ProvenanceTimeline` (already reads `e.photos`).

---

## 2. Batch page cover photos

**`src/routes/batch.$listingId.tsx`**: after the header, before the stock grid, add a horizontal snap-scroll carousel matching `buyer.producer.$id.tsx`'s "Aktif Ürünler" pattern (`h-48`, `object-cover`, `snap-x snap-mandatory`), guarded by `listing.photos?.length`. Shown to owner + non-owner.

---

## 3. Rebuild `buyer.producer.$id.tsx` on real data

### Data plumbing (new/adapted hooks in `src/lib/hasat/queries.ts`)

- `useFarmerPublicProfile(id)` → `public_farmer_profiles` single row (`id, name, city`).
- `useFarmerActiveListings(farmerId)` → `listings` where `farmer_id = id AND status = 'active'`, then batch-fetch listing photos as needed (listings table already carries `photo_urls`).
- Reuse `useParcelsByFarmer(id)`.
- `useFarmerProducerStats(id)` — single hook that fetches:
  - `parcels`: sum(area) → totalLand ("X dönüm").
  - `harvest_entries` (farmer_id=id, no cost/notes columns needed on the client, just `harvest_date, quantity, quality`): derive
    - **yieldHistory**: group by `year(harvest_date)`, sum quantity (unit-agnostic, generic label).
    - **avgQuality**: most-common `quality` grade (A/B/C) — modal, not numeric average.
  - `orders` count for this farmer (`orders` where `farmer_id = id`, `head: true, count: 'exact'`).
  - Response-time: keep simple static label `"Genellikle 24 saat içinde"` (real computation across offers + `offer_messages` is disproportionate).
- `useMyActiveSubscriptionWith(farmerId)` — current buyer's `harvest_subscriptions` with this farmer where `status = 'active'` (returns `next_harvest_date`, `estimated_qty`, primary crop) or null.
- Next-harvest fallback: when no subscription, use `crop_config.harvest_window_start_month/end_month` of the farmer's primary crop (from the most-common `parcels.crops[0]` across their parcels). Render as Turkish month range, e.g. `"Ekim – Kasım"`. If no crop info, hide the section body and show `—`.

### Component changes (`src/routes/buyer.producer.$id.tsx`)

- Remove `useHasat(...producers.find)`. Use hooks above; suspense/loading: show LoadingDots while `useFarmerPublicProfile` is loading; `notFound()` if it returns null.
- Header: real name + city from public profile. Keep GPS badge only if verifiable — otherwise drop the "GPS doğrulandı ✓" line (no such field in schema). **Drop it.**
- Trust badges strip: current code renders all five statically — this is fake. **Replace** with: render badges only for real signals we have (e.g. `certifications` for this farmer if any; if adding a real query is out-of-scope, remove the strip entirely). Plan: remove it — no fabrication.
- Stats grid: `Toplam Arazi` (sum area), `Tecrübe` **removed** (no source), `Ort. Kalite` (modal grade), `Yanıt Süresi` (static "Genellikle 24 sa"). Reduce to a 3-col grid.
- Remove the star-rating / rating / orders-count summary line AND the "0 Anlaşmazlık" pill (fake). Keep only the response-time chip.
- Verim Geçmişi: keep chart, feed from real `yieldHistory`. Y-axis label: generic "Miktar".
- Aktif Ürünler: feed from `useFarmerActiveListings`. Keep the exact existing carousel JSX. Click → `buyer/offer/$listingId` unchanged.
- Tarlalarım: feed from `useParcelsByFarmer` (already wired), just remove the fake `producer.` reference. Keep JSX.
- **Delete "Alıcı Yorumları" section entirely.**
- Hasat Aboneliği CTA: keep. Populate the two mini cards from `useMyActiveSubscriptionWith` if present, else from `crop_config` month-range fallback. CTA still links to `/buyer/subscription/$producerId`.

### Not touched, but flagged

- `buyer.subscription.$producerId.tsx` still reads the same fake `useHasat(...producers)` store and is broken for real farmer ids. Same fix (real producer profile) will eventually be needed there. Not part of this change per your instructions.

---

## Verification

- End-to-end journal photo: create entry with photo, inspect `harvest_entries.photo_urls`, confirm render on batch page timeline.
- Load `/buyer/producer/<real farmer id>`: page renders with real name, real listings/photos, real parcels, real yield chart, no reviews section, no fabricated numbers.
- `tsgo --noEmit` clean.