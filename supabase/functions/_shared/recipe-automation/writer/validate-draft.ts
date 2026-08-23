// F2 Recipe Automation — Step 06: Postgres structure/crop/unit/slug/coverage validation for a
// freshly-written draft, per PROMPT 06 item 6 ("Run Postgres structure/crop/unit/slug/coverage
// validations"). Every check here is a call to one of the Step 04 RPCs
// (20260819150000_f2s04_recipe_validation_rpcs.sql) — deterministic Postgres logic, not
// re-implemented in TypeScript, so the DB and the pipeline never independently drift on what
// "valid" means.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";
import type { RecipeDraftPayload, RecipeIngredientDraft, RecipeQAIssue } from "../types.ts";
import { slugifyTitle } from "./slug.ts";

interface RpcIssueResult {
  valid: boolean;
  issues: RecipeQAIssue[];
}

async function callValidationRpc(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<RpcIssueResult> {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    throw new RecipeAutomationError({
      code: "DRAFT_VALIDATION_RPC_FAILED",
      message: `${name} RPC failed`,
      stage: "write",
      retryable: true,
      details: { rpc: name, pgCode: (error as { code?: string }).code },
    });
  }
  const result = data as RpcIssueResult;
  return { valid: Boolean(result?.valid), issues: Array.isArray(result?.issues) ? result.issues : [] };
}

export interface DraftValidationResult {
  /** True iff no BLOCKING issue was found across structure/crop/slug checks. Coverage findings
   * are always non-blocking (warning) per validate_recipe_ingredient_coverage's own design — see
   * that RPC's header — so they never affect this flag, only the aggregated `issues` list. */
  valid: boolean;
  issues: RecipeQAIssue[];
  /** normalize_recipe_units' output — the SAME ingredients with only `unit` canonicalized. This
   * is what actually gets stored, not the agent's raw un-normalized units. */
  normalizedIngredients: RecipeIngredientDraft[];
  /** Derived via slugifyTitle(draft.title) and checked (format + live uniqueness) through
   * validate_recipe_slug. Not persisted on recipe_drafts (that table has no slug column — a slug
   * is only assigned at publish time) — this is purely an early, catch-it-at-draft-time signal. */
  candidateSlug: string;
}

export async function validateDraft(
  client: SupabaseClient,
  draft: RecipeDraftPayload,
): Promise<DraftValidationResult> {
  const draftJson = draft as unknown as Record<string, unknown>;

  const [structure, cropValues, coverage] = await Promise.all([
    callValidationRpc(client, "validate_recipe_structure", { p_draft: draftJson }),
    callValidationRpc(client, "validate_recipe_crop_values", { p_draft: draftJson }),
    callValidationRpc(client, "validate_recipe_ingredient_coverage", { p_draft: draftJson }),
  ]);

  const candidateSlug = slugifyTitle(draft.title);
  const slugResult = await callValidationRpc(client, "validate_recipe_slug", { p_slug: candidateSlug });

  const { data: normalized, error: normalizeError } = await client.rpc("normalize_recipe_units", {
    p_ingredients: draft.ingredients,
  });
  if (normalizeError) {
    throw new RecipeAutomationError({
      code: "DRAFT_VALIDATION_RPC_FAILED",
      message: "normalize_recipe_units RPC failed",
      stage: "write",
      retryable: true,
      details: { rpc: "normalize_recipe_units", pgCode: (normalizeError as { code?: string }).code },
    });
  }

  return {
    valid: structure.valid && cropValues.valid && slugResult.valid,
    issues: [...structure.issues, ...cropValues.issues, ...slugResult.issues, ...coverage.issues],
    normalizedIngredients: (normalized as RecipeIngredientDraft[] | null) ?? draft.ingredients,
    candidateSlug,
  };
}
