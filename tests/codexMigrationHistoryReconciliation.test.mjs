import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

const migrationsUrl = new URL("../supabase/migrations/", import.meta.url);

const expected = new Map([
  [
    "20260917102138_revoke_authenticated_execute_refresh_draft_nutrition_preview.sql",
    { bytes: 91, sha256: "966c96c7758bc4ce6b41ecf54d7e08af16c6d02a41b9af956092c48d0fb7d3b0" },
  ],
  [
    "20260917102142_revoke_authenticated_execute_refresh_draft_nutrition_preview.sql",
    { bytes: 91, sha256: "966c96c7758bc4ce6b41ecf54d7e08af16c6d02a41b9af956092c48d0fb7d3b0" },
  ],
  [
    "20260918091532_ux1b_private_step_photo_preservation.sql",
    { bytes: 7779, sha256: "ae8f94c7978db6e6a684e7982031197b809e316bf5c4973d7dc58df668795082" },
  ],
  [
    "20260921084620_ux1c0_disable_private_step_photo_writes.sql",
    { bytes: 1857, sha256: "387b63dc9f5a62e3db8ee633743d2d04337cfccfb32ff2c07292cb3018bb638a" },
  ],
  [
    "20260921093914_f2s18_nutrition_culinary_alias_fallback_and_admin_resolve.sql",
    { bytes: 24973, sha256: "477300bd7e67dae3f6055165b8de28f3a0ac4ee5c9862caa18146f1e286982cb" },
  ],
  [
    "20260921095505_f2s18_fix_measure_and_reference_not_null_columns.sql",
    { bytes: 7099, sha256: "17d3f6f23ff212c9b8be3a522fa9b2ff939af482825dc4dd719107cc3f0ae04e" },
  ],
]);

const retired = [
  "20260918090000_ux1b_private_step_photo_preservation.sql",
  "20260921081414_ux1c0_disable_private_step_photo_writes.sql",
  "20260921100000_f2s18_nutrition_culinary_alias_fallback_and_admin_resolve.sql",
  "20260921100100_f2s18_fix_measure_and_reference_not_null_columns.sql",
];

test("Codex-lane migration files match production history and stored statements", async () => {
  const files = await readdir(migrationsUrl);

  for (const [file, fingerprint] of expected) {
    assert.equal(files.filter((candidate) => candidate === file).length, 1, `${file} must exist once`);
    const source = await readFile(new URL(file, migrationsUrl));
    assert.equal(source.byteLength, fingerprint.bytes, `${file} byte count`);
    assert.equal(createHash("sha256").update(source).digest("hex"), fingerprint.sha256, `${file} SHA-256`);
  }

  for (const file of retired) assert.ok(!files.includes(file), `${file} must stay retired`);
});

test("the duplicate revoke is represented by two identical production-versioned files", async () => {
  const suffix = "_revoke_authenticated_execute_refresh_draft_nutrition_preview.sql";
  const files = (await readdir(migrationsUrl)).filter((file) => file.endsWith(suffix));
  assert.deepEqual(files.sort(), [
    "20260917102138_revoke_authenticated_execute_refresh_draft_nutrition_preview.sql",
    "20260917102142_revoke_authenticated_execute_refresh_draft_nutrition_preview.sql",
  ]);
  const sources = await Promise.all(files.map((file) => readFile(new URL(file, migrationsUrl))));
  assert.deepEqual(sources[0], sources[1]);
});
