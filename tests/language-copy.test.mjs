import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("harvest batch labels use farmer-friendly Turkish", async () => {
  const paths = [
    "src/routes/farmer.journal.index.tsx",
    "src/routes/farmer.journal.new.tsx",
    "src/routes/farmer.storefront.tsx",
    "src/routes/buyer.product.$farmerId.$crop.tsx",
    "src/components/hasat/OfferBatchBreakdown.tsx",
    "src/components/hasat/ai-chat/JournalEntryCard.tsx",
  ];
  const copy = (await Promise.all(paths.map(read))).join("\n");

  assert.match(copy, /Hasat partisi/);
  assert.doesNotMatch(
    copy,
    /Batch bilgisi|Hangi batch|Batch \(parti\)|Batch #|Yeni Batch|Batch adı/,
  );
});
