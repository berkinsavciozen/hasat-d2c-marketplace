// Deno.test suite for job-detail.ts's DQ-2 §4 draft-quality loader. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/admin/
import assert from "node:assert/strict";
import { loadDraftQualityIssues } from "./job-detail.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

Deno.test("loadDraftQualityIssues: passes the checker's issues through the contract mapper", async () => {
  const client = new FakeSupabaseClient();
  const seen: Array<Record<string, unknown>> = [];
  client.onRpc("admin_recipe_draft_quality_issues", (args) => {
    seen.push(args);
    return {
      data: [
        { code: "ALLERGEN_MISSING", severity: "kritik", message: "gluten eksik", extra: "dropped" },
        { code: "TIME_MISMATCH", severity: "uyari", message: "süre tutmuyor" },
      ],
      error: null,
    };
  });

  const result = await loadDraftQualityIssues(asClient(client), "job-1");

  assert.deepEqual(seen, [{ p_job_id: "job-1" }]);
  assert.equal(result.failed, false);
  assert.deepEqual(result.issues, [
    { code: "ALLERGEN_MISSING", severity: "kritik", message: "gluten eksik" },
    { code: "TIME_MISMATCH", severity: "uyari", message: "süre tutmuyor" },
  ]);
});

Deno.test("loadDraftQualityIssues: null data (job has no draft) is null issues, not a failure", async () => {
  const client = new FakeSupabaseClient();
  client.onRpc("admin_recipe_draft_quality_issues", () => ({ data: null, error: null }));

  assert.deepEqual(await loadDraftQualityIssues(asClient(client), "job-1"), { issues: null, failed: false });
});

Deno.test("loadDraftQualityIssues: an RPC error is reported as failed instead of thrown", async () => {
  const client = new FakeSupabaseClient();
  client.onRpc("admin_recipe_draft_quality_issues", () => ({ data: null, error: { message: "boom", code: "XX000" } }));

  assert.deepEqual(await loadDraftQualityIssues(asClient(client), "job-1"), { issues: null, failed: true });
});
