import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ALLERGEN_SLUGS } from "../src/lib/hasat/recipeFacts.ts";
import { TAXONOMY_KEYWORDS } from "../scripts/allergen-review/allergen-keywords.mjs";

const migrationUrl = new URL(
  "../supabase/migrations/20260910073732_allergen_nutrition_publish_gate.sql",
  import.meta.url,
);

test("manifest keyword taxonomy and public product taxonomy cannot drift", () => {
  assert.deepEqual(Object.keys(TAXONOMY_KEYWORDS), [...ALLERGEN_SLUGS]);
});

test("publish migration carries every controlled slug and both hard gates", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const slug of ALLERGEN_SLUGS) assert.match(sql, new RegExp(`'${slug}'`), slug);
  assert.match(sql, /recipe_jobs_finalize_recipe_facts/);
  assert.match(sql, /perform public\.calculate_recipe_nutrition\(new\.recipe_id\)/);
  assert.match(sql, /PUBLISH_ALLERGEN_LABELS_MISSING/);
  assert.match(sql, /PUBLISH_NUTRITION_INCOMPLETE/);
  assert.match(sql, /deferrable initially deferred/);
});
