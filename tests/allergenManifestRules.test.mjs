import test from "node:test";
import assert from "node:assert/strict";

import {
  TAXONOMY_KEYWORDS,
  shouldSuppressTaxonomyMatch,
} from "../scripts/allergen-review/allergen-keywords.mjs";

test("plant milk does not create a lactose candidate", () => {
  assert.equal(
    shouldSuppressTaxonomyMatch(
      "laktoz",
      "sut",
      "bitkisel sut badem yulaf veya soya sutu",
      "bitkisel sut badem yulaf veya soya sutu",
    ),
    true,
  );
});

test("ordinary milk remains a lactose candidate", () => {
  assert.equal(shouldSuppressTaxonomyMatch("laktoz", "sut", "sut", "sut 1 litre"), false);
});

test("certified gluten-free oats do not create a gluten candidate", () => {
  assert.equal(
    shouldSuppressTaxonomyMatch("gluten", "yulaf", "yulaf", "yulaf ezmesi glutensiz sertifikali"),
    true,
  );
});

test("ordinary oats remain a gluten candidate", () => {
  assert.equal(shouldSuppressTaxonomyMatch("gluten", "yulaf", "yulaf", "yulaf ezmesi"), false);
});

test("known formerly out-of-scope allergens are controlled", () => {
  for (const slug of ["agac-kuruyemisi", "hardal", "kereviz", "sulfit", "lupin"]) {
    assert.ok(TAXONOMY_KEYWORDS[slug]?.length, slug);
  }
});
