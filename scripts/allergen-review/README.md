# Allergen review manifest (Aşama A)

Read-only preparation for the launch allergen-review release gate. Generates a per-recipe manifest
of **candidate** allergen labels + rationale for every `visibility='public', status='published'`
recipe, for a human (Berkin) to review in Aşama B. See `generate-allergen-manifest.mjs`'s header
comment for the full constraint list; the short version:

- Never writes to `recipes` (no `allergens_reviewed*`/`allergen_labels` UPDATE, ever).
- Never asserts a final decision — every row is a candidate + rationale + ambiguity note.
- Two explicit, cited candidate sources only: deterministic Turkish keyword rules
  (`allergen-keywords.mjs`) and F2's `safetyReview.allergens.detectedLabels` (when reachable).
- Only the controlled taxonomy slugs ever go in `candidate_labels`; anything else goes to
  `taxonomy_out_of_scope_notes` instead.

## Run it

```sh
npm run allergen:manifest -- --out manifest.csv
# or directly:
node scripts/allergen-review/generate-allergen-manifest.mjs --format md --out manifest.md
```

Reads `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` from `.env` (same anon/public credentials the
app itself uses for the public recipe list — see `src/lib/hasat/recipes.ts`). Optionally reads
`SUPABASE_SERVICE_ROLE_KEY` (not committed anywhere) to additionally SELECT `recipe_qa_results`
for the F2 cross-reference; that table has no anon/authenticated RLS grant at all, so without a
service-role key this step is skipped and noted per-row — the rest of the manifest still runs.

## Output columns

`recipe_id, slug, title, current_allergen_labels, current_reviewed_status, ingredients_summary,
candidate_labels, candidate_rationale, ambiguity_notes, taxonomy_out_of_scope_notes`

## Re-running for Aşama B

Idempotent by construction (read-only) — re-run any time to get a fresh manifest against whatever
the public catalog looks like at that point. The row count in the summary line printed to stderr
should always equal the live `recipes` count for `visibility='public' AND status='published'`.
