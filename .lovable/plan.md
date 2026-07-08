## Goal

Close the parcel → listing → harvest-entry gap so the common path is automatic. Farmer creates a parcel with N crops → we auto-create N draft listings. Farmer logs a harvest entry → we auto-link it to the matching draft/active listing. Farmer publishes the draft from a new "Taslak" tab when ready.

## Gaps & edge cases surfaced by the audit

1. **Multi-crop parcels** — confirmed: `parcels.crops` is `text[]`. Trigger must loop with `FOREACH crop_name IN ARRAY NEW.crops` and insert one draft per crop. Skip if `NEW.crops` is null/empty.
2. **Existing parcels backfill** — the migration should run a one-time backfill: for every existing parcel × each crop that does not already have a listing with matching `(farmer_id, parcel_id, crop)`, insert a draft. Otherwise farmers who onboarded pre-migration see nothing in the new Taslak tab.
3. **Parcel update (`useUpdateParcel` edits `crops`)** — add an AFTER UPDATE trigger: for each crop in `NEW.crops` not present in `OLD.crops`, insert a draft listing (same logic as insert). Crops removed from the array: do NOT auto-delete listings — a listing may have harvest entries or active offers attached; leave them alone. This is safe because inactive drafts are cheap and invisible to buyers.
4. **Parcel delete** — today `parcels.id` is not a FK on `listings.parcel_id`? Let me note it in the migration: we should add `ON DELETE SET NULL` so deleting a parcel doesn't cascade-delete published listings with orders. Drafts with zero activity can be cleaned up in a separate follow-up; not in scope here.
5. **Harvest entry auto-link** — match on `(farmer_id, parcel_id, crop)`. The join table `listing_harvest_entries` has a composite PK / unique on `(listing_id, harvest_entry_id)` — use `ON CONFLICT DO NOTHING`. If multiple listings match the same (parcel, crop) (e.g. one draft + one active from a prior batch), link to ALL matches — the farmer can prune later; over-linking is safer than dropping data.
6. **Harvest entry with `parcel_id = NULL`** — some entries may lack a parcel. Trigger short-circuits when `NEW.parcel_id IS NULL`; the manual "Bu hasatı bir ürüne bağla" UI remains for those.
7. **Price seed** — plan says look up latest `price_feed` avg for that crop. Confirmed table exists. Use a scalar subquery with fallback `COALESCE((SELECT avg_price ... ORDER BY date DESC LIMIT 1), 0)`. Draft price is only a hint; farmer edits before publishing.
8. **Draft leakage to buyers** — verified: both anon and authenticated non-owner SELECT policies already require `status='active'`. Nothing to change. `useActiveListings` also filters client-side. Safe.
9. **`useUpdateListing` `status` patch** — already whitelisted (line 717). "Yayınla" button just calls `mutateAsync({ id, patch: { status: 'active' } })`.
10. **Draft with `quantity=0, price=0`** — `useListingStock` handles zero gracefully. Publishing with those values would create a broken listing; the "Yayınla" button should either (a) open the existing edit sheet pre-filled with the draft, or (b) block publish and require quantity>0 & price>0. **Recommendation: (a)** — reuse `ListingSheet` in edit mode, but change the primary button label to "Yayınla" when the source listing is a draft, and set `status='active'` in that save path. Cleaner UX, no duplicated form.
11. **"Geçmiş" tab semantics** — with drafts split out, rename to "Satıldı / Süresi Doldu" (or simpler: "Arşiv"). Proposal: **"Arşiv"** — short and covers both sold and expired. Open to "Satıldı / Süresi Doldu" if you prefer explicit.
12. **Ordering of drafts** — sort by `created_at DESC` (same as existing). Newest parcel's drafts appear first, which matches farmer's mental model right after creating the parcel.
13. **Empty-state for Taslak tab** — "Henüz taslak yok. Bir parsel oluşturduğunuzda, o parselin her ürünü için otomatik bir taslak ilan hazırlanır."
14. **`useCreateListing` still writes `status='active'`** — unchanged, correct.
15. **`enforce_offer_stock` / `enforce_harvest_date_lock`** — both only care about `status IN ('active','sold')`. Drafts are exempt from both. No change needed.
16. **RLS on INSERT via trigger** — trigger runs with `SECURITY DEFINER` so it bypasses RLS; safe to insert on behalf of the parcel owner. Set `search_path = public` per convention.

## Implementation

### Migration (single file)

```sql
-- 1. Extend enum
ALTER TYPE public.listing_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'active';

-- (Note: ADD VALUE cannot run in a transaction alongside functions using the value
-- in some Postgres versions. Split into two migrations if the runner complains;
-- start with just the ALTER TYPE, then a second migration with the rest.)

-- 2. Ensure parcel_id FK behavior on delete
ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_parcel_id_fkey,
  ADD CONSTRAINT listings_parcel_id_fkey
    FOREIGN KEY (parcel_id) REFERENCES public.parcels(id) ON DELETE SET NULL;

-- 3. Helper: create draft listings for a set of crops on a parcel
CREATE OR REPLACE FUNCTION public.create_draft_listings_for_parcel(
  _farmer_id uuid, _parcel_id uuid, _crops text[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text; seed_price numeric;
BEGIN
  IF _crops IS NULL THEN RETURN; END IF;
  FOREACH c IN ARRAY _crops LOOP
    IF c IS NULL OR btrim(c) = '' THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.listings
      WHERE farmer_id = _farmer_id AND parcel_id = _parcel_id AND crop = c
    ) THEN CONTINUE; END IF;
    seed_price := COALESCE(
      (SELECT price FROM public.price_feed WHERE crop = c ORDER BY date DESC LIMIT 1),
      0
    );
    INSERT INTO public.listings
      (farmer_id, parcel_id, crop, quantity, unit, price_per_unit, min_order, quality, status)
    VALUES
      (_farmer_id, _parcel_id, c, 0, 'g', seed_price, 10, 'A', 'draft');
  END LOOP;
END $$;

-- 4. Trigger: parcel INSERT
CREATE OR REPLACE FUNCTION public.tg_parcels_after_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.create_draft_listings_for_parcel(NEW.farmer_id, NEW.id, NEW.crops);
  RETURN NEW;
END $$;
CREATE TRIGGER parcels_after_insert_create_drafts
  AFTER INSERT ON public.parcels
  FOR EACH ROW EXECUTE FUNCTION public.tg_parcels_after_insert();

-- 5. Trigger: parcel UPDATE (only newly-added crops)
CREATE OR REPLACE FUNCTION public.tg_parcels_after_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE added text[];
BEGIN
  IF NEW.crops IS DISTINCT FROM OLD.crops THEN
    SELECT ARRAY(SELECT unnest(COALESCE(NEW.crops,'{}')) EXCEPT SELECT unnest(COALESCE(OLD.crops,'{}')))
      INTO added;
    PERFORM public.create_draft_listings_for_parcel(NEW.farmer_id, NEW.id, added);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER parcels_after_update_create_drafts
  AFTER UPDATE ON public.parcels
  FOR EACH ROW EXECUTE FUNCTION public.tg_parcels_after_update();

-- 6. Trigger: harvest_entries INSERT → auto-link
CREATE OR REPLACE FUNCTION public.tg_harvest_entries_after_insert_autolink()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.parcel_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.listing_harvest_entries (listing_id, harvest_entry_id)
  SELECT l.id, NEW.id
    FROM public.listings l
    WHERE l.farmer_id = NEW.farmer_id
      AND l.parcel_id = NEW.parcel_id
      AND l.crop = NEW.crop
      AND l.status IN ('draft','active')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER harvest_entries_after_insert_autolink
  AFTER INSERT ON public.harvest_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_harvest_entries_after_insert_autolink();

-- 7. Backfill: draft listing per (existing parcel × crop) not already covered
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, farmer_id, crops FROM public.parcels LOOP
    PERFORM public.create_draft_listings_for_parcel(r.farmer_id, r.id, r.crops);
  END LOOP;
END $$;

-- 8. Backfill: link existing harvest entries to matching listings
INSERT INTO public.listing_harvest_entries (listing_id, harvest_entry_id)
SELECT l.id, h.id
  FROM public.harvest_entries h
  JOIN public.listings l
    ON l.farmer_id = h.farmer_id
   AND l.parcel_id = h.parcel_id
   AND l.crop = h.crop
   AND l.status IN ('draft','active')
 WHERE h.parcel_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

Note: `ADD VALUE` to an enum may need to be its own migration in Supabase (cannot be used in the same tx as new functions that reference it). If the migration runner rejects it, split into two: (1) `ALTER TYPE ... ADD VALUE 'draft'`, (2) everything else.

### Type regen

After the migration, `Database["public"]["Enums"]["listing_status"]` gains `'draft'`. The `Listing.status` type in `src/lib/hasat/types.ts` widens to include `'draft'`.

### UI changes (`src/routes/farmer.storefront.tsx`)

- Tabs: `Ürünlerim` (active) | `Taslak` (draft) | `Arşiv` (sold/expired).
- Partition:
  ```ts
  const active = listings.filter(l => l.status === 'active');
  const drafts = listings.filter(l => l.status === 'draft');
  const archive = listings.filter(l => l.status === 'sold' || l.status === 'expired');
  ```
- New `DraftListingCard`:
  - Shows crop emoji, parcel name (join via existing `parcels` query or add lookup), `StockBadge` (already handles 0), coverage badge.
  - Primary button "Yayınla" → opens `ListingSheet` in edit mode with the draft pre-selected; save path detects draft origin and sets `status: 'active'` in the patch. Sheet primary CTA label becomes "Yayınla" when editing a draft.
  - Secondary "Kaldır" button (same delete flow) for users who don't want a given crop.
- Empty state for Taslak: helper copy as in gap #13.
- Draft cards should NOT show "📦 Parti" until published (or keep it — the batch view works for drafts too; keeping it is fine and lets farmers preview linked entries).

### Not changing
- `useCreateListing` still writes `status='active'`.
- Manual "Bu hasatı bir ürüne bağla" flow untouched.
- RLS untouched.
- `useActiveListings` untouched (already filters `status='active'`).

## Open questions for you

- **Archive tab name**: "Arşiv" or explicit "Satıldı / Süresi Doldu"?
- **Publish UX**: reuse edit sheet with relabeled CTA (my recommendation), or a dedicated inline "Yayınla" that requires the farmer to fill quantity+price in a compact dialog?
- **Removed crops on parcel edit**: leave associated draft listings intact (my recommendation) or auto-delete drafts with zero harvest links and zero offers?
- **Enum split migration**: OK to submit as two separate migrations if the runner rejects the single one?
