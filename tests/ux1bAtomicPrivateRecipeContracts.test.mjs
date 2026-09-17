import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("OCR and T7a adapters use one authenticated transaction RPC", async () => {
  const [ocr, t7a] = await Promise.all([
    read("../supabase/functions/extract-recipe/index.ts"),
    read("../supabase/functions/estimate-recipe-from-photo/index.ts"),
  ]);
  for (const source of [ocr, t7a]) {
    assert.match(source, /userClient\.rpc\("rpc_create_private_recipe"/);
    assert.match(source, /userClient\.rpc\("rpc_get_private_recipe_operation"/);
    assert.match(source, /p_operation_key: operationKey/);
    assert.match(source, /p_request_hash: requestHash/);
    assert.doesNotMatch(source, /from\("recipe_ingredients"\)\.insert/);
    assert.doesNotMatch(source, /from\("recipe_steps"\)\.insert/);
    assert.doesNotMatch(source, /from\("recipes"\)\.delete/);
  }
  assert.match(ocr, /"create_text" : "create_photo"/);
  assert.match(t7a, /p_operation_type: "create_photo_estimate"/);
});

test("T6 compatibility adapter is owner-scoped and delegates to the common primitive", async () => {
  const [migration, edge] = await Promise.all([
    read("../supabase/migrations/20260917081905_ux1b_atomic_private_recipe_writes.sql"),
    read("../supabase/functions/customize-recipe/index.ts"),
  ]);
  assert.match(migration, /add primary key \(user_id, idempotency_key\)/);
  assert.match(migration, /public\.rpc_create_private_recipe\(\s*p_idempotency_key, 'create_ai_customize'/s);
  assert.match(edge, /onConflict: "user_id,idempotency_key"/);
  assert.match(edge, /source\.status !== "published"/);
});

test("web data adapter uses versioned update and keyed clone without changing UI components", async () => {
  const adapter = await read("../src/lib/hasat/myRecipes.ts");
  assert.match(adapter, /private_edit_version/);
  assert.match(adapter, /rpc_update_private_recipe/);
  assert.match(adapter, /p_expected_version: loaded\.version/);
  assert.match(adapter, /p_operation_key: operationKey\.current/);
  assert.match(adapter, /rpc_clone_recipe/);
  assert.doesNotMatch(adapter, /from\("recipe_ingredients"\)\s*\.delete\(\)/);
  assert.doesNotMatch(adapter, /from\("recipe_steps"\)\s*\.delete\(\)/);
});

test("migration constrains auth, ACL, states, limits, idempotency and optimistic concurrency", async () => {
  const migration = await read("../supabase/migrations/20260917081905_ux1b_atomic_private_recipe_writes.sql");
  assert.match(migration, /v_owner uuid := auth\.uid\(\)/);
  assert.match(migration, /'draft', 'private'.*v_owner, 'kullanici'/s);
  assert.match(migration, /jsonb_array_length\(v_ingredients\) > 60/);
  assert.match(migration, /jsonb_array_length\(v_steps\) > 40/);
  assert.match(migration, /private_recipe_idempotency_conflict/);
  assert.match(migration, /private_recipe_version_conflict/);
  assert.match(migration, /revoke all on function public\.rpc_create_private_recipe.*from public, anon/);
  assert.match(migration, /grant execute on function public\.rpc_create_private_recipe.*to authenticated/);
  assert.doesNotMatch(migration, /security definer/i);
});
