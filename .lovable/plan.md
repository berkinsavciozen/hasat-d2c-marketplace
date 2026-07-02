# Farmer Panel — 5 Targeted Fixes

Small, surgical changes only. No logic beyond what's listed.

## B1 — Journal tag rendering (chips)

**File:** `src/lib/hasat/journal-meta.ts` + `src/routes/farmer.journal.index.tsx`

- Extend `parseNotes()` to extract **all** inline `[key:value]` tags (generic — covers `work:`, `category:`, `health:`, and any future key), returning `{ tags: {key,value}[], text }`. `text` is `notes` with every tag stripped and whitespace trimmed. Keep back-compat by still exposing `work` and `health` derived from the tag list.
- In `farmer.journal.index.tsx` list row, render each tag as a small chip next to the work-type label (health chip formatted as "health: N"). The `<p>` body already renders `meta.text` — now guaranteed clean of tags.

## B2 — Quality default 'A'

**File:** `src/components/hasat/ai-chat/parseJournalEntry.ts`

- In `mapQuality()` (or wherever the fallback lives), change default from `'C'` to `'A'` when quality is missing/null. Existing valid values ('A'/'B'/'C') pass through unchanged.

## B4 — Hasat Dönemi dynamic month chip

**File:** `src/components/hasat/SeasonBanner.tsx`

- Replace hardcoded `"HASAT DÖNEMİ — KASIM"` with `` `HASAT DÖNEMİ — ${new Date().toLocaleString('tr-TR',{month:'long'}).toLocaleUpperCase('tr-TR')}` ``. Use Turkish locale for uppercase (İ vs I).

## B5 — Crop slug display (underscores → Title Case)

**New helper:** add `formatCrop(slug: string)` in `src/lib/hasat/format.ts` — splits on `_`, title-cases each word using Turkish-aware casing (`toLocaleUpperCase('tr-TR')` for the first char), rejoins with spaces. Empty/undefined → `"—"`.

**Apply in farmer panel wherever a crop value is rendered as text:**
- `src/routes/farmer.storefront.tsx` (listing card title, delete dialog, alt text, edit sheet default)
- `src/routes/farmer.journal.index.tsx` (crop fallback in chip)
- `src/routes/farmer.journal.$entryId.tsx` (title `{entry.crop}`, AI banner)
- `src/routes/farmer.analytics.tsx` (top products list)
- `src/routes/farmer.prices.tsx` (crop labels)
- `src/routes/farmer.orders.index.tsx` (crop display in cards)

Do NOT touch stored values or query keys — display only.

## B6 — Certification expiry badges

**File:** `src/routes/farmer.settings.tsx` (certifications list around line 191)

- For each cert, compute status from `c.expires_at`:
  - past → red badge "Süresi Geçti" (`bg-hred/15 text-hred`)
  - within 30 days (future) → yellow badge "Yakında Sona Eriyor" (amber tokens)
  - valid (>30d) or null → no badge
- Render badge inline next to the "✓ {type}" chip. Keep existing "Süre: …" date line.

## Verification

- Read updated files back; no schema or query changes.
- Skim journal list and settings pages to confirm chips/badges render.
