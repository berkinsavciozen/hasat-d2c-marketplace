## Phase 2 bug fixes

### 1. New `useProfile` / `useUpdateProfile` hooks (`src/lib/hasat/queries.ts`)
- `useProfile()` → `select id, name, city, crop, role from profiles where id = auth.uid()` (maybeSingle), keyed `["profile", userId]`.
- `useUpdateProfile()` → `update profiles set name, city where id = auth.uid()`, invalidates `["profile", userId]`.

### 2. Settings profile form (`src/routes/farmer.settings.tsx`)
- Replace `useHasat.user` reads with `useProfile()`. Initialize `name`/`city` state from `profile?.name` / `profile?.city` via a `useEffect` once data loads (so inputs aren't permanently empty).
- `saveProfile` → call `useUpdateProfile().mutateAsync({ name, city })` then toast. Drop `useHasat.updateUser`.

### 3. Certifications query
- Verified RLS allows `auth.uid() = farmer_id` SELECT and a public read policy. Query is correct, but onboarding may have inserted with a stale `farmer_id`. Add an explicit `.order('verified_at', { ascending: false, nullsFirst: false })` and log the error/data length to surface RLS/data issues; ensure `useAuthUserId` has resolved before querying (the `enabled: !!userId` guard already exists). No schema change needed; if rows still don't show, the data simply isn't tied to the current user.

### 4. Journal year selector + entries list (`src/routes/farmer.journal.tsx`)
- `dbToEntry` already returns `r.harvest_date` directly — keep as-is.
- Derive year tabs from actual entries: `years = unique(entries.map(e => e.date.slice(0,4))).sort().reverse()`. Default `year` to first available, or current year if none. Remove hardcoded `["2027","2028","2029"]`.
- Below the parcel grid, render a "Hasat Kayıtları" section: entries filtered to selected year, grouped by `parcelId` (using parcel name lookup), each group ordered by `date desc`. Each row links to `/farmer/journal/$entryId` and shows date, crop, quantity+unit, quality. Empty-state line when no entries for that year.

### 5. Sidebar/header location (`src/routes/farmer.tsx`)
- Replace mocked `<FarmPill city="Karabük" area={5} crop="Safran" />` and the `useHasat.user` read in the sidebar profile card with `useProfile()` data: `city = profile?.city ?? "—"`, `crop = profile?.crop ?? "—"`, `area = sum(parcels.area)` from `useParcels()`. Fall back gracefully while loading.

### Out of scope
- No DB migrations. No changes to onboarding inserts. No store removal — `useHasat.user` stays for non-migrated screens but is no longer the source of truth in Settings/sidebar.

### Files touched
- `src/lib/hasat/queries.ts` (add hooks)
- `src/routes/farmer.settings.tsx`
- `src/routes/farmer.journal.tsx`
- `src/routes/farmer.tsx`
