// Deno.test suite for slug.ts. Run with:
//   deno test supabase/functions/_shared/recipe-automation/writer/slug.test.ts
import assert from "node:assert/strict";
import { slugifyTitle } from "./slug.ts";

Deno.test("slugifyTitle: folds Turkish characters to ASCII and lowercases", () => {
  assert.equal(slugifyTitle("Fırında Kabak Musakka"), "firinda-kabak-musakka");
});

Deno.test("slugifyTitle: collapses non-alphanumeric runs into a single hyphen", () => {
  assert.equal(slugifyTitle("Şef'in Özel Çorbası!!"), "sef-in-ozel-corbasi");
});

Deno.test("slugifyTitle: trims leading/trailing hyphens", () => {
  assert.equal(slugifyTitle("  -- Kabak Yemeği -- "), "kabak-yemegi");
});

Deno.test("slugifyTitle: caps length at 80 characters", () => {
  const longTitle = "kabak ".repeat(30);
  const slug = slugifyTitle(longTitle);
  assert.ok(slug.length <= 80);
});

Deno.test("slugifyTitle: deterministic — same title always produces the same slug", () => {
  const title = "Zeytinyağlı Kabak Dolması";
  assert.equal(slugifyTitle(title), slugifyTitle(title));
});
