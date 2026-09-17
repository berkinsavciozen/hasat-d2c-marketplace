import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";

const edgeUrl = new URL("../supabase/functions/estimate-recipe-from-photo/index.ts", import.meta.url);
const configUrl = new URL("../supabase/config.toml", import.meta.url);
const cloneMigrationUrl = new URL(
  "../supabase/migrations/20260910132550_t7a_f11_source_type_and_clone_rpc.sql",
  import.meta.url,
);
const aclMigrationUrl = new URL(
  "../supabase/migrations/20260910132725_t7a_f11_revoke_anon_execute_clone_recipe.sql",
  import.meta.url,
);
const importMapUrl = new URL(
  "../supabase/functions/estimate-recipe-from-photo/deno.json",
  import.meta.url,
);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("recovered UX-1A migration sources remain byte-faithful", async () => {
  const [cloneMigration, aclMigration] = await Promise.all([
    readFile(cloneMigrationUrl, "utf8"),
    readFile(aclMigrationUrl, "utf8"),
  ]);
  assert.equal(
    sha256(cloneMigration),
    "73b0fa21ad708151a0f72a85885de13f43609996bb8fd08ccf0f0512b86130eb",
  );
  assert.equal(
    sha256(aclMigration),
    "bb854e3e308871ef2c3d4a20f18b4da7a67c0d6d9073f90508e388870061cc87",
  );
});

test("T7a deployment inputs are explicit and reproducible", async () => {
  const [edge, config] = await Promise.all([readFile(edgeUrl, "utf8"), readFile(configUrl, "utf8")]);

  assert.match(
    edge,
    /import \{ createClient \} from "https:\/\/esm\.sh\/@supabase\/supabase-js@2\.45\.0";/,
  );
  assert.match(
    config,
    /\[functions\.estimate-recipe-from-photo\]\s*\nverify_jwt = true/,
  );
  await assert.rejects(access(importMapUrl));
});

test("T7a delegates owner/state binding to the authenticated atomic RPC", async () => {
  const edge = await readFile(edgeUrl, "utf8");

  assert.match(edge, /const userId = userIdFromAuth\(req\);/);
  assert.match(edge, /if \(!userId\) return json\(\{ error: "unauthorized" \}, 401\);/);
  assert.match(edge, /global: \{ headers: \{ Authorization: authHeader \} \}/);
  assert.match(edge, /userClient\.rpc\("rpc_create_private_recipe"/);
  assert.match(edge, /p_operation_type: "create_photo_estimate"/);
  assert.doesNotMatch(edge, /owner_id:\s*(?:body|parsed)\./);
  assert.doesNotMatch(edge, /visibility:\s*(?:body|parsed)\./);
  assert.doesNotMatch(edge, /status:\s*(?:body|parsed)\./);
});

test("clone migration is invoker-only, private-draft, independent, and intentionally non-idempotent", async () => {
  const [migration, acl] = await Promise.all([
    readFile(cloneMigrationUrl, "utf8"),
    readFile(aclMigrationUrl, "utf8"),
  ]);

  assert.match(migration, /security invoker/);
  assert.match(migration, /if auth\.uid\(\) is null then/);
  assert.match(
    migration,
    /v_source\.visibility <> 'public'.*v_source\.status <> 'published'.*v_source\.author_type = 'kullanici'/s,
  );
  assert.match(
    migration,
    /'draft', 'private', 'clone', auth\.uid\(\), 'kullanici', p_source_recipe_id/,
  );
  assert.match(migration, /insert into public\.recipe_ingredients/);
  assert.match(migration, /insert into public\.recipe_steps/);
  assert.match(
    migration,
    /create or replace function public\.rpc_clone_recipe\(p_source_recipe_id uuid\)/,
  );
  assert.doesNotMatch(migration, /on conflict|p_idempotency|idempotency_key/i);
  assert.doesNotMatch(migration, /create trigger|update public\.recipes\s+set/s);
  assert.match(migration, /revoke all on function public\.rpc_clone_recipe\(uuid\) from public/);
  assert.match(migration, /grant execute on function public\.rpc_clone_recipe\(uuid\) to authenticated/);
  assert.match(acl, /revoke execute on function public\.rpc_clone_recipe\(uuid\) from anon/);
});
