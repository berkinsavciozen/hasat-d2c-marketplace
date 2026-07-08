
# Audit: crop lists, city inputs, crop icons

## 1. Hardcoded crop lists / selectors

Every dropdown or chip-picker in the app currently reads from a locally-defined `CROPS` array — none of them read from `crop_config`.

| File | Line(s) | Current value | Used for |
|---|---|---|---|
| `src/routes/onboarding.farmer.tsx` | 31 | `["Safran","Lavanta","Tıbbi Bitkiler","Fındık","Zeytin","Diğer"]` | Onboarding step 2 "Ana Ürünler" chips |
| `src/routes/onboarding.buyer.tsx` | 23 | same 6-item list | Buyer onboarding "İlgilendiğiniz Ürünler" chips |
| `src/routes/farmer.settings.tsx` | 55 | same 6-item list | "Ana Ürünler" chips in the "+ Parsel Ekle" sheet |
| `src/routes/farmer.storefront.tsx` | 34 | `["Safran","Lavanta","Tıbbi Bitkiler","Fındık","Zeytinyağı"]` | "+ Yeni Ürün" listing-create dialog `<Select>` |
| `src/routes/farmer.journal.index.tsx` | 172 | inline `["Safran","Lavanta","Tıbbi Bitkiler","Fındık","Zeytin","Diğer"]` | Inline "+ Parsel" sheet on Journal page |
| `src/routes/farmer.journal.index.tsx` | 85, 117 | default `pCrops = ["Safran"]` | Default value for new-parcel form |
| `src/routes/farmer.community.tsx` | 18 | `["Tümü","Safran","Pazar","Hava","Hastalık","Diğer"]` | Community post category filter (mixes crop + topic — **not** the same taxonomy, leave alone) |

`src/routes/farmer.journal.new.tsx` already does it right — it drives the crop chip selector from `parcel.crops`, which reflects whatever was saved during parcel creation.

## 2. Crop icon / emoji mapping (5-item map, no fallback catalog)

Three separate copies of the same 5-key emoji map exist, and one page uses ad-hoc `.includes()` string matching:

| File | Line | Shape |
|---|---|---|
| `src/routes/farmer.storefront.tsx` | 33 | `Record<string,string>` → `?? "🌾"` |
| `src/routes/buyer.discover.tsx` | 21 | same map → `?? "🌾"` |
| `src/routes/s.$slug.tsx` | 23-25 | same map → `?? "🌾"` |
| `src/routes/buyer.producer.$id.tsx` | 95 | inline `l.crop.includes("Safran") ? "🌸" : includes("Lavanta") ? "💜" : "🌿"` |
| `src/lib/hasat/crop-config.ts` | 29-34 | `CATEGORY_GROUP_META` (4 category → emoji) — used by buyer discover grouping only |

All 4 files degrade to `🌾` (or `🌿` in `buyer.producer`) for the ~65 new crops, so nothing breaks visually — but every new crop shows the same generic wheat icon. `CATEGORY_GROUP_META` is also incomplete: the migration added `tahil`, `baklagil`, `yaglik`, `endustri_bitkisi`, `yumru`, `sebze`, `meyve` but the map only has 4 categories, so grouped views (e.g. `buyer.discover`) will label those with the raw slug.

## 3. City / il inputs

| File | Line(s) | Field | Current behavior |
|---|---|---|---|
| `src/routes/onboarding.farmer.tsx` | 19-30, 209-212 | `city` | ✅ Dropdown (81 provinces) — reference implementation |
| `src/routes/onboarding.buyer.tsx` | 37, 182 | `address` | Free-text `<Input>` (placeholder "Beyoğlu, İstanbul") — this is a full company address, arguably NOT just a province |
| `src/routes/farmer.settings.tsx` | 39, 160 | Profile `city` | Free-text `<Input>` — should be province dropdown |
| `src/routes/farmer.settings.tsx` | 449 | Parcel-create `nCity` ("Şehir / İlçe") | Free-text `<Input>` with placeholder "Karabük / Safranbolu" — value is written into `location_label` on the parcel |
| `src/routes/farmer.journal.index.tsx` | inline parcel sheet | — | Sheet has no city/location field at all |

Note: `parcels.location_label` is a general free-text location string (used for `"{city} — Ana Parsel"` naming in onboarding, and shown as-is elsewhere). It legitimately can hold "Şehir / İlçe / Mahalle". Treating it as a strict province dropdown loses expressiveness. See proposal below.

## 4. Proposed single source of truth

### 4a. Crops — read live from `crop_config`

Add to `src/lib/hasat/crop-config.ts`:

```ts
// Returns [{ crop, display_name, category_group, emoji }] sorted alphabetically
export function useCropOptions(): { data: CropOption[]; isLoading }
```

- Backed by the existing `useCropConfigs()` query (already cached 10 min).
- Each option's emoji: crop-specific override map (below) → else `CATEGORY_GROUP_META[category_group].emoji` → else `🌾`.
- Extend `CATEGORY_GROUP_META` to cover all 10 category_groups now in the DB:
  `tahil 🌾`, `baklagil 🫘`, `yaglik 🌻`, `endustri_bitkisi 🏭`, `yumru 🥔`, `sebze 🥬`, `meyve 🍎`, `sert_kabuklu 🌰`, `tibbi_bitki 🌿`, `baharat 🌶️`.
- Add a small crop-specific override map for the marquee crops that deserve their own icon (keeps existing 5 + a couple more): `safran 🌸`, `lavanta 💜`, `zeytin 🫒`, `zeytinyağı 🫒`, `fındık 🌰`, `üzüm 🍇`, `elma 🍎`, `domates 🍅`, `mısır 🌽`, `çilek 🍓`, `gül 🌹`, `buğday 🌾`, `çay 🍵`. Everything else falls back through the category emoji.

Replace all `CROP_EMOJI` usages and the ad-hoc `.includes()` in `buyer.producer.$id.tsx` with one shared helper `cropEmoji(cropSlug, cropMap)` exported from `crop-config.ts`. Delete the 3 duplicate `CROP_EMOJI` constants.

Replace every hardcoded `CROPS` array with `useCropOptions()`:
- `onboarding.farmer.tsx` chips
- `onboarding.buyer.tsx` chips
- `farmer.settings.tsx` parcel-create chips
- `farmer.storefront.tsx` listing-create `<Select>`
- `farmer.journal.index.tsx` inline parcel-create chips (also change the `["Safran"]` default to `[]` — no reason to pre-check a crop)

Because `crop_config` values are lowercase slugs (`buğday`, `kuru_fasulye`, `safran_soğanı`) but existing parcels/listings store the Turkish display forms (`"Safran"`, `"Lavanta"`, `"Fındık"`), we need a decision:

**Assumption:** new selections write the `display_name` (e.g. `"Buğday"`, `"Kuru Fasulye"`) to `listings.crop` / `parcels.crops[]`, matching how existing data looks. `crop_config` lookups already normalize via `normalizeCropKey`, and `findCropConfig(map, "Buğday")` resolves via the display_name key registered in `useCropConfigMap`. This keeps existing rows working with no data migration. Flag if you want to move to slug-based storage instead — that's a separate follow-up.

### 4b. Cities — one exported list

Move the 81-province array from `onboarding.farmer.tsx` to a new file `src/lib/hasat/cities.ts`:

```ts
export const TR_PROVINCES: readonly string[] = [ ...81 provinces alphabetical... ];
```

Reuse everywhere a **province** is meant:
- `onboarding.farmer.tsx` (already the reference — just imports it now)
- `farmer.settings.tsx` profile `city` field → convert `<Input>` to `<Select>` from `TR_PROVINCES`

Leave as free-text (intentional):
- `onboarding.buyer.tsx` "Şirket Adresi" — this is a full postal address, not a province. Optionally split into `province` (dropdown) + `addressLine` (free text) as a UX improvement, but current behavior is defensible.
- `farmer.settings.tsx` parcel-create "Şehir / İlçe" (`nCity` → `location_label`) — the label explicitly asks for city + district. Recommended: split into two fields — `province` (dropdown, required) + `district` (free-text, optional) — then join to `location_label`. If you'd rather keep it a single field, convert to the province dropdown and drop "/ İlçe" from the label.
- `farmer.journal.index.tsx` parcel sheet has no location field; leave as-is or add the same split.

### 4c. `farmer.community.tsx` categories

`CATS = ["Tümü","Safran","Pazar","Hava","Hastalık","Diğer"]` mixes crops with post topics. This is a taxonomy for community post filtering, not a crop selector. Leave alone unless you specifically want community post filters to key off `crop_config` too.

## Deliverables when this is approved (build phase)

1. `src/lib/hasat/cities.ts` — export `TR_PROVINCES`.
2. `src/lib/hasat/crop-config.ts` — add `useCropOptions()`, `cropEmoji()`, extend `CATEGORY_GROUP_META` to 10 groups, add crop-specific emoji override map.
3. Delete 3 duplicate `CROP_EMOJI` maps and 5 hardcoded `CROPS` arrays.
4. Wire `useCropOptions()` into: onboarding.farmer, onboarding.buyer, farmer.settings, farmer.storefront, farmer.journal.index.
5. Convert farmer.settings profile `city` to `<Select>` from `TR_PROVINCES`.
6. Decide (open question): split parcel `Şehir / İlçe` into two fields, or convert to province-only dropdown?
7. Show loading state (skeleton chips) while `useCropOptions()` loads, since `crop_config` is a network fetch.
8. Run `tsgo` typecheck.

## Open questions for you

1. **Parcel "Şehir / İlçe" field** — split into province dropdown + district free-text, or collapse to just the province dropdown?
2. **Buyer onboarding "Şirket Adresi"** — leave as free-text, or add a province dropdown alongside?
3. **Crop storage format** — keep writing display names (`"Buğday"`) as today, or switch new writes to slugs (`"buğday"`)? Recommendation: keep display names; slug migration is a separate task.
4. **Community filter chips** — leave the mixed crop/topic list, or replace with `crop_config`-driven crop filters?
