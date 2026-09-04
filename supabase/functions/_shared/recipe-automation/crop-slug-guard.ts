// F2 Recipe Automation — Step 08B (+ its Step 06 equivalent): server-side correction for an
// invented, not-in-crop_config crop slug on a content agent's output. Shared by both
// `revise/revise-stage.ts` (the Reviser) and `writer/write-stage.ts` (the Writer) — see below for
// why this lives at the `recipe-automation/` root rather than under either stage's own folder.
//
// The gap this closes — found on job 67567ad5-5ee7-4dd9-a60d-6546687d811e ("Ayvalı Fırın Tavuk"),
// DIFFERENT from the Step 08A out-of-scope-change gap allowed-changes.ts closes: that job's QA
// result flagged INGREDIENT_INCONSISTENCY on the whole "ingredients" array (several ingredients —
// havuç, soğan, sarımsak, zeytinyağı — written as freeTextName when Hasat actually sells them as
// marketplace crops), an entirely IN-SCOPE request (field "ingredients" grants `ingredientsWhole`
// in allowed-changes.ts's surface — see that module — so nothing here is fighting Step 08A; this is
// the SAME "let the model change this" grant, just followed badly). revise-rules.ts item 4 (and
// writer/editorial-rules.ts item 2, the same instruction for the Writer) tells the agent to use
// "the EXACT crop slug given in the context" for a marketplace-ingredient crop match — but
// revise/context.ts never hands the Reviser ANY crop_config slug list at all, and writer/context.ts
// only ever calls `loadCropContext` for the brief's single `focusCrop`, never the full list either
// (see each module's own header). Asked to crop-match an ingredient with no real slug list to reach
// for, the agent invents one. `validate_recipe_crop_values` (correctly — its own logic is not
// touched here) rejects it as INGREDIENT_CROP_UNKNOWN, and without this module that sinks the WHOLE
// job at the calling stage's own `*_DRAFT_VALIDATION_FAILED` branch — a permanent, terminal
// `failed`, even though the requested change (or, for the Writer, a draft that was otherwise fine)
// was entirely within scope.
//
// Same "don't trust the model, override on the server" principle allowed-changes.ts already applies
// to out-of-scope fields, and both stage-runners already apply to jobId/briefId: rather than
// teaching the agent a full crop_config slug list (a heavier, prompt-surface change touching
// context.ts + the rules file for whichever stage — the rejected alternative; see revise/README.md)
// or rejecting the whole candidate outright, every ingredient `validate_recipe_crop_values` flags as
// INGREDIENT_CROP_UNKNOWN is force-corrected server-side: `crop` reverts to `null` and
// `freeTextName` is set to a readable form of the invented slug, satisfying the same `crop !== null
// || freeTextName !== null` schema invariant every other ingredient already meets. For the Reviser,
// QA can flag the still-unmatched ingredient again next pass as a fresh INGREDIENT_INCONSISTENCY
// blocking issue; for the Writer, the first QA pass does the same. This module does not pretend the
// crop match happened, it only stops an invented value from killing the job outright. Each caller
// re-runs `validate_recipe_crop_values` (via `validateDraft`) once against the corrected draft;
// that RPC's own logic decides what's valid, not this module — it is never re-derived here, only
// reacted to.
//
// Why shared, not duplicated: this module's own logic above ("that stays exactly one place,
// `validate_recipe_crop_values`, per this file's own module header" — see
// `sanitizeUnknownCropIngredients`'s docstring) already insists the crop_config validation logic
// live in exactly one place; the same principle applies to this module itself once a second caller
// needs it — one implementation both `writer/write-stage.ts` and `revise/revise-stage.ts` import,
// not two copies that could drift.
import type { RecipeDraftPayload, RecipeQAIssue } from "./types.ts";

const INGREDIENT_CROP_FIELD_RE = /^ingredients\[(\d+)\]\.crop$/;

/**
 * Turns an invented, not-in-crop_config slug into a readable `freeTextName` fallback (e.g.
 * "kirmizi-biber" -> "kirmizi biber"). Never returns an empty string for a non-empty input — the
 * schema's `nonEmptyTrimmedString` requires one, and INGREDIENT_CROP_UNKNOWN only ever fires when
 * the candidate's `crop` value is itself non-null/non-empty (see
 * `validate_recipe_crop_values`'s own `v_crop is not null` gate in
 * 20260819150000_f2s04_recipe_validation_rpcs.sql), so there is always something to humanize.
 */
function humanizeInventedCropSlug(slug: string): string {
  return slug.trim().replace(/[-_]+/g, " ").trim();
}

export interface CropSlugSanitizeResult {
  draft: RecipeDraftPayload;
  /** Ingredient indices (into `draft.ingredients`) forced from `crop` to `freeTextName` — empty
   * when none of `unknownCropIssues` named a locatable ingredient. Surfaced in the calling stage's
   * telemetry (revise-stage.ts's `forcedCropFallbackIndices`, mirroring `forcedRevertFields`; and
   * write-stage.ts's own `forcedCropFallbackIndices`, its Step 06 equivalent). */
  sanitizedIngredientIndices: number[];
}

/**
 * Forces every ingredient `unknownCropIssues` names as INGREDIENT_CROP_UNKNOWN from
 * `crop: <invented slug>` to `crop: null, freeTextName: <humanized slug>`. `unknownCropIssues` is
 * expected to be `validateDraft(...).issues` filtered to `code === "INGREDIENT_CROP_UNKNOWN"` —
 * this function trusts the exact field-path convention `validate_recipe_crop_values` emits
 * (`ingredients[N].crop`, the same convention `allowed-changes.ts`'s own `parseIssueFieldPath`
 * parses) and never itself queries `crop_config` or re-derives which crops are valid — that stays
 * exactly one place, `validate_recipe_crop_values`, per this file's own module header.
 */
export function sanitizeUnknownCropIngredients(
  draft: RecipeDraftPayload,
  unknownCropIssues: readonly RecipeQAIssue[],
): CropSlugSanitizeResult {
  const indices = new Set<number>();
  for (const issue of unknownCropIssues) {
    const match = INGREDIENT_CROP_FIELD_RE.exec(issue.field.trim());
    if (match) indices.add(Number(match[1]));
  }
  if (indices.size === 0) return { draft, sanitizedIngredientIndices: [] };

  const ingredients = draft.ingredients.map((ingredient, i) => {
    if (!indices.has(i) || ingredient.crop === null) return ingredient;
    return {
      ...ingredient,
      crop: null,
      freeTextName: ingredient.freeTextName ?? humanizeInventedCropSlug(ingredient.crop),
    };
  });

  return {
    draft: { ...draft, ingredients },
    sanitizedIngredientIndices: [...indices].filter((i) => draft.ingredients[i]?.crop !== null).sort((a, b) => a - b),
  };
}
