import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("UX-1F-A stores only a digest in private RLS ledgers", async () => {
  const migration = await read(
    "../supabase/migrations/20260923071622_ux1f_a_secure_private_recipe_share.sql",
  );
  assert.match(migration, /create table private\.recipe_share_grants/);
  assert.match(migration, /create table private\.recipe_share_clone_operations/);
  assert.match(migration, /token_digest bytea not null unique/);
  assert.match(migration, /extensions\.gen_random_bytes\(32\)/);
  assert.match(migration, /sha256\(convert_to\(v_token, 'UTF8'\)\)/);
  assert.doesNotMatch(migration, /create table[\s\S]*?\btoken text\b/i);
  assert.match(migration, /alter table private\.recipe_share_grants enable row level security/);
  assert.match(
    migration,
    /revoke all on table private\.recipe_share_grants from public, anon, authenticated, service_role/,
  );
  assert.match(migration, /recipes_share_token_retired check \(share_token is null\)/);
});

test("UX-1F-A enforces owner state, expiry, fail-closed resolution and media-free snapshots", async () => {
  const migration = await read(
    "../supabase/migrations/20260923071622_ux1f_a_secure_private_recipe_share.sql",
  );
  assert.match(migration, /r\.owner_id = v_owner_id/);
  assert.match(migration, /r\.visibility = 'private'/);
  assert.match(migration, /r\.status = 'draft'/);
  assert.match(migration, /r\.author_type = 'kullanici'/);
  assert.match(migration, /interval '5 minutes'/);
  assert.match(migration, /interval '30 days'/);
  assert.match(migration, /recipe_share_invalid_or_inactive/);
  assert.match(migration, /revoke_reason = 'rotated'/);
  assert.doesNotMatch(
    migration.match(/create or replace function private\.resolve_recipe_share[\s\S]*?\nend;\n\$\$;/)?.[0] ?? "",
    /photo_url|cover_photo_url/,
  );
  assert.match(migration, /cloned_from_recipe_id[\s\S]*?'shared_clone'[\s\S]*?null/);
  assert.match(
    migration,
    /insert into public\.recipe_steps\(recipe_id, step_no, instruction, timer_seconds\)/,
  );
});

test("UX-1F-A clone operation keys bind canonical grant and source identity", async () => {
  const migration = await read(
    "../supabase/migrations/20260923071622_ux1f_a_secure_private_recipe_share.sql",
  );
  assert.match(migration, /primary key \(owner_id, operation_key\)/);
  assert.match(migration, /'contract_version', 1/);
  assert.match(migration, /'grant_id', v_grant\.id/);
  assert.match(migration, /'source_recipe_id', v_source\.id/);
  assert.match(migration, /recipe_share_idempotency_conflict/);
  assert.match(migration, /'replayed', true/);
  assert.match(migration, /'replayed', false/);
  assert.doesNotMatch(
    migration.match(/create table private\.recipe_share_clone_operations[\s\S]*?\n\);/)?.[0] ?? "",
    /references private\.recipe_share_grants|references public\.recipes/,
  );
});

test("UX-1F-A keeps privilege bridges private and public wrappers invoker-only", async () => {
  const migration = await read(
    "../supabase/migrations/20260923071622_ux1f_a_secure_private_recipe_share.sql",
  );
  const publicWrappers = migration.match(
    /create or replace function public\.rpc_create_recipe_share_grant[\s\S]*?comment on function/s,
  )?.[0];
  assert.ok(publicWrappers);
  assert.doesNotMatch(publicWrappers, /security definer/i);
  assert.match(publicWrappers, /security invoker set search_path = ''/i);
  assert.match(
    migration,
    /security definer\nset search_path = ''/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.rpc_resolve_recipe_share\(text\)[\s\S]*?from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.rpc_resolve_recipe_share\(text\) to authenticated/,
  );
  assert.match(migration, /drop function if exists public\.rpc_get_shared_recipe\(uuid\)/);
  assert.match(migration, /drop function if exists public\.rpc_clone_shared_recipe\(uuid\)/);
});

test("generated types expose only the new recipe-share RPC contract", async () => {
  const [generated, core] = await Promise.all([
    read("../src/integrations/supabase/types.ts"),
    read("../src/lib/core/db/types.ts"),
  ]);
  for (const source of [generated, core]) {
    assert.match(source, /rpc_create_recipe_share_grant/);
    assert.match(source, /rpc_list_recipe_share_grants/);
    assert.match(source, /rpc_rotate_recipe_share_grant/);
    assert.match(source, /rpc_revoke_recipe_share_grant/);
    assert.match(source, /rpc_resolve_recipe_share/);
    assert.match(source, /rpc_clone_shared_recipe/);
    assert.match(source, /p_operation_key: string; p_token: string/);
    assert.doesNotMatch(source, /rpc_generate_recipe_share_token/);
    assert.doesNotMatch(source, /rpc_get_shared_recipe/);
    assert.doesNotMatch(source, /rpc_revoke_recipe_share_token/);
  }
});

test("UX-1F-B handoff forbids token-bearing paths and defines coordinated cutover", async () => {
  const doc = await read("../docs/runbooks/ux1f-a-private-recipe-share.md");
  assert.match(doc, /\/tarif-paylasim#share=<token>/);
  assert.match(doc, /must never\ncontain the token/);
  assert.match(doc, /Disable the legacy share entry point/);
  assert.match(doc, /no new WARN\/ERROR/);
  assert.match(doc, /Do not restore old raw tokens/);
});
