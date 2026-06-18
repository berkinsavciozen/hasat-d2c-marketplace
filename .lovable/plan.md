## Phase 2 — Wire Journal / Parcels / Certifications to Supabase

Replace Zustand reads/writes in three farmer sections with real Supabase queries through TanStack Query. Zustand stays for non-migrated areas (offers, orders, listings, prices, buyer flows) — only the three sections below change.

### 1. New data hooks file: `src/lib/hasat/queries.ts`

Centralize query options + mutations so routes stay thin. All hooks read `auth.uid()` from `supabase.auth.getUser()` (RLS handles row scoping but we still need it for inserts).

Query keys:
- `['parcels', userId]`
- `['entries', userId]`
- `['entry', entryId]`
- `['certifications', userId]`

Hooks:
- `useParcels()` → `useQuery` selecting `*` from `parcels` ordered by `created_at`.
- `useCreateParcel()` → `useMutation`. Before insert, ensure a `farms` row exists for the farmer (`select id` then `insert` if missing — first parcel creates the farm). Insert `{ farmer_id, farm_id, name, area, crops, location_label, lat, lng }`. On success invalidate `['parcels']`.
- `useUpdateParcel()` / `useDeleteParcel()` → mutations by `id`; invalidate `['parcels']`.
- `useEntries()` → select `*` from `harvest_entries` ordered by `harvest_date desc`.
- `useEntry(id)` → select single by id (`maybeSingle`).
- `useCreateEntry()` → insert `{ farmer_id, parcel_id, crop, quantity, unit, quality, notes, costs, harvest_date, photo_urls: [] }`. Invalidate `['entries']`.
- `useDeleteEntry()` → delete by id. Invalidate `['entries']` + remove `['entry', id]`.
- `useCertifications()` → select `*` from `certifications`.

Each hook is `enabled: !!userId`. User id pulled via a small `useAuthUserId()` helper that subscribes to `supabase.auth.getSession()` once (or reads from existing Zustand `user.id` set by AuthBootstrap in Phase 1).

### 2. Map DB rows ↔ existing UI types

The journal UI uses `entry.date` (string), `entry.costs` (object), `entry.parcelId`, etc. DB columns are `harvest_date`, `costs` (jsonb), `parcel_id`. Add small mappers in `queries.ts`:
- `dbToEntry(row)` → `{ id, parcelId, date: harvest_date, crop, quantity, unit, quality, notes: notes ?? '', costs: (costs as any) ?? {labor:0,...}, photos: photo_urls ?? [], pricePerUnit: undefined }`
- `dbToParcel(row)` → `{ id, name, area, crops, location: { lat, lng, label: location_label } }`

This lets existing components keep using the current `Parcel` / `HarvestEntry` shapes without prop changes.

### 3. Routes to update

**`src/routes/farmer.journal.tsx`**
- Remove `useHasat` for `parcels`, `entries`, `addParcel`.
- Use `useParcels()` and `useEntries()`.
- New parcel sheet calls `useCreateParcel().mutateAsync(...)`; close sheet on success, toast on error.
- Loading: when either query `isLoading`, render centered `<ProgressDots current={1} total={3} />` with animated cycling (simple `useEffect` setInterval cycling 1→3) inside the parcel grid area.
- Empty state: keep existing 🌱 block when `parcels.length === 0` after load.

**`src/routes/farmer.journal.new.tsx`**
- Replace `useHasat` parcels/addEntry with `useParcels()` + `useCreateEntry()`.
- On save: `mutateAsync` then show success screen, navigate.
- Disable button while mutation pending.

**`src/routes/farmer.journal.$entryId.tsx`**
- Replace `useHasat` `entries` lookup with `useEntry(entryId)` for the current entry and `useEntries()` for the YoY chart (filter same parcel client-side).
- Replace `deleteEntry` with `useDeleteEntry().mutateAsync`.
- Loading: `ProgressDots` while `isLoading`. If `data === null` after load → existing "Kayıt bulunamadı" block.

**`src/routes/farmer.settings.tsx`**
- Parcels section: `useParcels()`, `useUpdateParcel()`, `useDeleteParcel()` instead of Zustand.
- Sertifikalar section: replace `user?.certs` with `useCertifications()`. Render each cert as a chip showing `type` + small line: `Doğrulandı: {verified_at|—}` and `Süre: {expires_at|—}` formatted via `toLocaleDateString('tr-TR')`. Keep existing "Sertifika eklenmemiş" empty state when list is empty after load.
- Loading: `ProgressDots` placeholder inside each section.

### 4. Zustand store cleanup

In `src/lib/hasat/store.ts`:
- Remove `seedParcels` and `seedEntries` defaults (set initial `parcels: []`, `entries: []`).
- Keep `addParcel`/`addEntry`/etc. action signatures intact for now (other code may still reference them) but they become no-ops scoped to local state — safer: leave actions untouched, just empty the seed arrays so no mock data leaks into the three migrated sections. Other consumers of `parcels`/`entries` from Zustand: a quick grep shows they're only the three migrated routes, so empty seeds are safe.

If grep finds other consumers, we'll convert them too in this same pass.

### 5. Out of scope (explicitly NOT touched)

- Buyer flows, offers, orders, listings, prices, subscriptions — still Zustand.
- Photo uploads to `harvest-photos` bucket — `photo_urls` inserted as `[]`.
- Cost editing in detail screen — read-only as today.
- `RoleSwitcher` FAB stays.

### Technical notes

- All Supabase calls wrapped in try/catch inside mutation `mutationFn`; errors surfaced via `sonner` `toast.error(err.message)` from the route's `onError`.
- RLS already scopes rows to the farmer; we still pass `farmer_id: userId` on inserts because the column is NOT NULL and policies likely require `farmer_id = auth.uid()`.
- `farms` row creation: small helper `ensureFarm(userId)` → `select id from farms where farmer_id = ? limit 1`; if none, `insert { farmer_id }` and return new id. Cached in a module-level `Map<userId, farmId>` to avoid re-querying within a session.

### Files touched

- new: `src/lib/hasat/queries.ts`
- edited: `src/routes/farmer.journal.tsx`, `src/routes/farmer.journal.new.tsx`, `src/routes/farmer.journal.$entryId.tsx`, `src/routes/farmer.settings.tsx`, `src/lib/hasat/store.ts` (empty seeds only)
