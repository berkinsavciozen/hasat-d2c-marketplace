// F2 Recipe Automation — Step 06: narrow brief/crop-context loaders for the Writer stage.
//
// "Narrow read/RPC helpers" per PROMPT 06 — the Writer never gets a generic Supabase or SQL tool
// (see write-stage.ts: the agent itself is handed zero tools at all). These two functions are the
// entire read surface the write stage uses to build the agent's input: one in-memory transform of
// the already-claimed job row (no extra query), and one call to the single-purpose
// `get_crop_context` RPC (20260819150000_f2s04_recipe_validation_rpcs.sql) — never a raw table
// read of `crop_config`/`crop_culinary_meta`.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";
import type { RecipeDifficulty } from "../types.ts";

/**
 * The immutable RecipeBrief this job was promoted from. Step 03A's schema note applies here too:
 * a `recipe_generation_jobs` row IS a promoted brief — brief-only fields live directly on the job
 * row (`brief_id`/`working_title`/`focus_crop`/`angle`/`target_difficulty`/`diet_tags`/`locale`),
 * there is no separate `recipe_briefs` table. This function reads ONLY those fields off the
 * already-claimed row — it never issues a query of its own.
 */
export interface WriteStageBrief {
  jobId: string;
  batchId: string;
  briefId: string;
  workingTitle: string;
  /** Text crop slug, never a crop_id. Null when the brief has no single focus crop. */
  focusCrop: string | null;
  angle: string | null;
  targetDifficulty: RecipeDifficulty | null;
  dietTags: string[];
  locale: string;
}

export function briefFromJobRow(row: Record<string, unknown>): WriteStageBrief {
  return {
    jobId: String(row.id),
    batchId: String(row.batch_id),
    briefId: String(row.brief_id),
    workingTitle: String(row.working_title),
    focusCrop: (row.focus_crop as string | null) ?? null,
    angle: (row.angle as string | null) ?? null,
    targetDifficulty: (row.target_difficulty as RecipeDifficulty | null) ?? null,
    dietTags: Array.isArray(row.diet_tags) ? (row.diet_tags as string[]) : [],
    locale: typeof row.locale === "string" ? row.locale : "tr",
  };
}

/** Mirrors get_crop_context's jsonb return shape exactly (see the f2s04 migration) — not
 * re-derived or renamed, so the Writer's input is a direct pass-through of what the RPC reports. */
export interface CropContext {
  crop: string;
  found: boolean;
  displayName?: string;
  defaultUnit?: string;
  categoryGroup?: string;
  harvestWindowStartMonth?: number | null;
  harvestWindowEndMonth?: number | null;
  inSeason?: boolean;
  isEdible?: boolean;
  culinaryAliases?: string[];
}

/** Narrow RPC helper: calls ONLY get_crop_context(p_crop, p_month). No generic table read. */
export async function loadCropContext(client: SupabaseClient, crop: string): Promise<CropContext> {
  const { data, error } = await client.rpc("get_crop_context", { p_crop: crop, p_month: null });
  if (error) {
    throw new RecipeAutomationError({
      code: "CROP_CONTEXT_RPC_FAILED",
      message: "get_crop_context RPC failed",
      stage: "write",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return data as CropContext;
}
