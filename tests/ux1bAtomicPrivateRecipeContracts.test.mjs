import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("OCR and T7a adapters use one authenticated transaction RPC", async () => {
  const [ocr, t7a] = await Promise.all([
    read("../supabase/functions/extract-recipe/index.ts"),
    read("../supabase/functions/estimate-recipe-from-photo/index.ts"),
  ]);
  for (const source of [ocr, t7a]) {
    assert.match(source, /userClient\.rpc\(\s*"rpc_create_private_recipe"/);
    assert.match(source, /userClient\.rpc\(\s*"rpc_get_private_recipe_operation"/);
    assert.match(source, /p_operation_key: operationKey/);
    assert.match(source, /p_input_hash: requestHash/);
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
  assert.match(
    migration,
    /public\.rpc_create_private_recipe\(\s*p_idempotency_key, 'create_ai_customize'/s,
  );
  assert.match(edge, /onConflict: "user_id,idempotency_key"/);
  assert.match(edge, /source\.status !== "published"/);
});

test("web data adapter uses versioned update and keyed clone without changing UI components", async () => {
  const adapter = await read("../src/lib/hasat/myRecipes.ts");
  assert.match(adapter, /private_edit_version/);
  assert.match(adapter, /rpc_update_private_recipe/);
  assert.match(adapter, /p_expected_version: loaded\.version/);
  assert.match(adapter, /operationKeys\.current\.acquire\(operationIdentity\)/);
  assert.match(adapter, /operationKeys\.current\.succeed\(operationIdentity, operationKey\)/);
  assert.match(adapter, /rpc_clone_recipe/);
  assert.doesNotMatch(adapter, /from\("recipe_ingredients"\)\s*\.delete\(\)/);
  assert.doesNotMatch(adapter, /from\("recipe_steps"\)\s*\.delete\(\)/);
});

test("migration constrains auth, ACL, states, limits, idempotency and optimistic concurrency", async () => {
  const migration = await read(
    "../supabase/migrations/20260917081905_ux1b_atomic_private_recipe_writes.sql",
  );
  assert.match(migration, /v_owner uuid := auth\.uid\(\)/);
  assert.match(migration, /'draft', 'private'.*v_owner, 'kullanici'/s);
  assert.match(migration, /jsonb_array_length\(v_ingredients\) > 60/);
  assert.match(migration, /jsonb_array_length\(v_steps\) > 40/);
  assert.match(migration, /private_recipe_idempotency_conflict/);
  assert.match(migration, /private_recipe_version_conflict/);
  assert.match(
    migration,
    /revoke all on function public\.rpc_create_private_recipe.*from public, anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.rpc_create_private_recipe.*to authenticated/,
  );
  assert.match(migration, /create table private\.private_recipe_operations/);
  assert.match(
    migration,
    /revoke all on table private\.private_recipe_operations from public, anon, authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /grant .* on table private\.private_recipe_operations to authenticated/i,
  );
  assert.match(
    migration,
    /create or replace function private\.claim_private_recipe_operation[\s\S]*security definer[\s\S]*set search_path = ''/i,
  );
  assert.match(migration, /v_owner uuid := auth\.uid\(\)/);
  assert.match(migration, /v_hash := encode\(sha256\(convert_to\(jsonb_build_object/i);
  assert.doesNotMatch(migration, /coalesce\(\s*p_(?:request|input)_hash,\s*md5/i);
});

test("UX-1B-M correction binds step photos to the authenticated recipe and canonical update hash", async () => {
  const migration = await read(
    "../supabase/migrations/20260918090000_ux1b_private_step_photo_preservation.sql",
  );
  assert.match(migration, /v_owner uuid := auth\.uid\(\)/);
  assert.match(migration, /app\.supabase_url/);
  assert.match(migration, /storage\.objects/);
  assert.match(migration, /o\.bucket_id = 'recipe-step-photos'/);
  assert.match(migration, /v_owner::text \|\| '\/' \|\| p_recipe_id::text \|\| '\/'/);
  assert.match(migration, /private_recipe_invalid_step_photo/);
  assert.match(migration, /'photo_url', v_photo/);
  assert.match(migration, /'payload', v_payload/);
  assert.match(
    migration,
    /insert into public\.recipe_steps\(recipe_id, step_no, instruction, photo_url, timer_seconds\)/,
  );
  assert.doesNotMatch(migration, /create or replace function public\.rpc_clone_recipe/);
  assert.match(migration, /UX-1C owns that separate media-model change/);
});

test("operation keys survive only matching retries and rotate after successful update/clone requests", async () => {
  const source = await read("../src/lib/hasat/retryOperationKey.ts");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
  const generated = ["key-1", "key-2", "key-3", "key-4", "key-5"];
  const store = module.createRetryOperationKeyStore(() => generated.shift());

  const updateOne = store.acquire("update:recipe-a:v1:payload-a");
  assert.equal(store.acquire("update:recipe-a:v1:payload-a"), updateOne, "retry reuses update key");
  store.succeed("update:recipe-a:v1:payload-a", updateOne);
  const updateTwo = store.acquire("update:recipe-a:v2:payload-b");
  assert.notEqual(updateTwo, updateOne, "second successful update starts with a new key");
  store.succeed("update:recipe-a:v2:payload-b", updateTwo);

  const cloneOne = store.acquire("clone:source-a");
  store.succeed("clone:source-a", cloneOne);
  const cloneTwo = store.acquire("clone:source-b");
  assert.notEqual(cloneTwo, cloneOne, "different source clone uses a new key in the same hook");
});
