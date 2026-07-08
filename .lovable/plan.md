# Add Individual ("Bireysel") Buyer Support

## Findings — where buyer-as-company is baked in

**DB (Supabase)**
- Enum `public.company_type`: `restoran | otel | organik_market | ihracatci | diger` — no `bireysel`.
- Table `public.buyer_profiles`: `company_name text NOT NULL`, `company_type company_type NOT NULL`.

**Onboarding — `src/routes/onboarding.buyer.tsx`**
- Step 1 forces `Şirket Adı` + one of 5 business tiles.
- Inserts `buyer_profiles { company_name, company_type }`; also writes `profiles.name = company`.
- Local `TYPES` const has no individual option.

**Types — `src/lib/hasat/types.ts`**
- `BuyerType = "restoran" | "otel" | "market" | "ihracatci"` (note: `market`, not `organik_market`; enum-to-type mapping happens in onboarding).
- `User.company?.type: BuyerType | "diger"` — no `bireysel`.
- `Offer.buyerType: BuyerType` (required, not optional).

**Farmer-facing displays**
- `src/routes/farmer.orders.index.tsx` — `BUYER_TYPE_LABEL` / `BUYER_TYPE_EMOJI` records keyed on `BuyerType`, rendered on every offer row (line 130). Individual buyers would fall through as `restoran` today due to the default in queries.
- `src/lib/hasat/queries.ts` line 514 — `buyerType: ((r.buyer?.buyer_type as BuyerType) ?? "restoran")`. Reads `profiles.buyer_type` (not `buyer_profiles.company_type`); if this column doesn't exist we should confirm before relying on it. **Open question — must verify with `read_query` before implementing.**

**Buyer-side**
- `src/routes/buyer.account.tsx` — `TYPE_LABEL` map, renders `user.company.name` / `.type` / `.address`. Needs a branch for individuals (show `profile.name`, no type badge, no address block, no "Organik Market" chip).

**Copy-only mentions (no change needed)**
- `terms.tsx`, `index.tsx`, `__root.tsx` — marketing text mentions "restoran, otel, butik alıcılar". Fine as-is; optionally add "ve bireysel gurmeler" later.

## Proposed plan

### 1. Onboarding UX (step 1 of `onboarding.buyer.tsx`)

Add a segmented toggle at the top of step 1:

```text
┌─────────────┬─────────────┐
│  Şirket     │  Bireysel   │  ← Tabs (default: Şirket)
└─────────────┴─────────────┘
```

- **Şirket** (default): unchanged — `Şirket Adı` + 5-tile business type grid.
- **Bireysel**: replace "Şirket Adı" label with **"Adınız Soyadınız"**, hide the business-type grid entirely. Step 2 (interests + monthly volume) stays as-is; step 3 relabels "Şirket Adresi (opsiyonel)" → "Adres (opsiyonel)".

On submit for individual path:
- `profiles.name = fullName`
- `buyer_profiles.company_name = fullName` (reuse the column; see §2 for rationale)
- `buyer_profiles.company_type = 'bireysel'`
- Local store: `user.company = { name: fullName, type: 'bireysel', address, volume }`

### 2. Database migration

Add `'bireysel'` to the enum; keep `company_name NOT NULL` and store the person's name there (simpler than adding a nullable path — the column is really "display name for the buyer entity"). One migration:

```sql
ALTER TYPE public.company_type ADD VALUE IF NOT EXISTS 'bireysel';
```

No column nullability changes. No data backfill needed.

### 3. TypeScript type updates

- `src/lib/hasat/types.ts`
  - `BuyerType = "restoran" | "otel" | "market" | "ihracatci" | "bireysel"`
  - `User.company.type: BuyerType | "diger"` — already permits extension.
- `src/lib/hasat/queries.ts` line 514 — change default from `"restoran"` to `"bireysel"` (safer neutral fallback) and verify the source column (`profiles.buyer_type` vs joining `buyer_profiles.company_type`); adjust the select if needed.

### 4. Display maps

- `src/routes/farmer.orders.index.tsx`
  - `BUYER_TYPE_LABEL`: add `bireysel: "Bireysel"`
  - `BUYER_TYPE_EMOJI`: add `bireysel: "👤"`
- `src/routes/buyer.account.tsx`
  - `TYPE_LABEL`: add `bireysel: "Bireysel"`
  - When `type === 'bireysel'`: hide address line only if empty; keep name; badge label reads "Bireysel Alıcı". No "İlgi Alanları" card change.

### 5. Farmer-facing copy for individual buyers

Recommend a **neutral "👤 Bireysel" badge** (parallel with existing tile pattern) rather than hiding the type entirely — farmers currently rely on the type chip for at-a-glance context, and an empty slot would look like a data bug. Name still shown next to it as today.

## Open items to confirm before build mode

1. Where does `queries.ts` line 514 actually read the buyer type from? The code reads `r.buyer?.buyer_type` but the column of record is `buyer_profiles.company_type`. Will verify with a quick `read_query` on the join shape before editing.
2. Confirm no RLS/CHECK constraint elsewhere references the enum values as a literal list (grep already clean, but will re-check after migration is drafted).

## Files that will change (build phase)

- `supabase/migrations/<new>.sql` (enum extension)
- `src/routes/onboarding.buyer.tsx` (tabs + conditional step 1)
- `src/routes/buyer.account.tsx` (label map + conditional render)
- `src/routes/farmer.orders.index.tsx` (label + emoji maps)
- `src/lib/hasat/types.ts` (extend `BuyerType`)
- `src/lib/hasat/queries.ts` (default fallback, possibly select shape)

No changes: `terms.tsx`, `index.tsx`, `__root.tsx`, `buyer.tsx` nav, storefront, negotiation routes (they don't key off buyer type).
