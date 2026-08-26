// F2 Recipe Automation — Step 08A: constrained revision boundary enforcement.
//
// The gap this closes (the exact finding PROMPT 08A is a corrective response to): revise-rules.ts
// TELLS the Reviser agent "fix only blocking issues and preserve everything else" (item 2), but
// until now nothing MECHANICALLY checked that the agent actually did that. A model can restate the
// instruction back to itself and still change an unrelated field (or an identity/server-owned one)
// and the old pipeline would accept it outright, as long as the result passed schema + Postgres
// validation — neither of which has any notion of "unrelated to what QA flagged".
//
// This module is the mechanical check, in two parts:
//   1. `computeAllowedChangeSurface` — turns a QA result's `blockingIssues` into an explicit,
//      deterministic set of draft locations the Reviser is permitted to touch. Never trusts
//      free-text interpretation: every issue's `field` string must match the SAME bracket-path
//      convention the Step 04 Postgres validation RPCs already emit (`title`, `ingredients`,
//      `ingredients[2]`, `ingredients[2].crop`, `steps[3]`, `steps[3].instruction` — see
//      20260819150000_f2s04_recipe_validation_rpcs.sql's own `format(...)` calls for the exact
//      convention this mirrors). A `field` that doesn't parse to a recognized, in-range, mutable
//      location grants NOTHING — and revise-stage.ts treats even ONE such issue in the set as
//      grounds to route the whole job to manual review rather than run the Reviser at all (better
//      to defer to a human than guess at what a blocking issue too vague to locate actually wants
//      changed).
//   2. `findOutOfScopeChanges` — diffs the Reviser's candidate draft against the EXACT previous
//      draft it was revising, field by field, and reports every change that falls outside the
//      surface computed in step 1. `revise-stage.ts` rejects the candidate outright if this reports
//      anything at all — no partial acceptance, no "fix the good parts and drop the rest".
//
// Deliberately conservative, not exhaustive: a handful of structural cases this does NOT attempt to
// reconcile (renumbering every step's stepNo after an ingredient-driven step removal; adding a
// brand-new ingredient or step at a specific, not-yet-existing index) fail CLOSED — rejected as
// out-of-scope — rather than guessing at a broader grant. See this file's own section comments for
// exactly which shapes are supported and why the rest are left as a documented limitation instead
// of guessed at.
import type { RecipeDraftPayload, RecipeIngredientDraft, RecipeQAIssue, RecipeStepDraft } from "../types.ts";

// ---------------------------------------------------------------------------------------------
// What may ever be granted, at all — independent of what any issue asks for.
// ---------------------------------------------------------------------------------------------

/** Content-editable top-level fields — grantable ONLY when a blocking issue names them. */
const MUTABLE_TOP_LEVEL_FIELDS = [
  "title",
  "description",
  "servings",
  "prepMinutes",
  "cookMinutes",
  "restMinutes",
  "difficulty",
  "cuisine",
  "dietTags",
  "allergenLabels",
  "requiredEquipment",
] as const;
type MutableTopLevelField = (typeof MUTABLE_TOP_LEVEL_FIELDS)[number];
const MUTABLE_TOP_LEVEL_FIELD_SET: ReadonlySet<string> = new Set(MUTABLE_TOP_LEVEL_FIELDS);

/**
 * Identity/pipeline-owned top-level fields — NEVER grantable, regardless of what any blocking issue
 * names. `jobId`/`briefId` are excluded from this list on purpose: revise-stage.ts already
 * server-forces both onto the parsed candidate BEFORE this module ever sees it (the same
 * "override then re-validate" pattern write-stage.ts/qa-stage.ts use), so diffing them here would
 * be redundant at best — and actively wrong given `loadDraftByVersion` always reconstructs
 * `previous.briefId` as `null` (recipe_drafts has no brief_id column; see context.ts), which would
 * make a raw comparison against the server-forced candidate value false-positive on every single
 * revision.
 */
const IMMUTABLE_TOP_LEVEL_FIELDS = [
  "coverPhotoUrl",
  "sourceType",
  "authorType",
  "visibility",
  "ownerId",
  "extractionConfidence",
] as const;

/** Content-editable ingredient item fields — grantable per-index when a blocking issue names them. */
const MUTABLE_INGREDIENT_FIELDS = [
  "crop",
  "freeTextName",
  "quantity",
  "unit",
  "note",
  "isKeyIngredient",
  "ingredientClass",
  "sortOrder",
] as const;
type MutableIngredientField = (typeof MUTABLE_INGREDIENT_FIELDS)[number];
const MUTABLE_INGREDIENT_FIELD_SET: ReadonlySet<string> = new Set(MUTABLE_INGREDIENT_FIELDS);

/**
 * Content-editable step fields — grantable per-stepNo when a blocking issue names them.
 * `photoUrl` is deliberately EXCLUDED: revise-rules.ts item 9 requires it stay null always ("image
 * generation happens in a LATER pipeline stage, not by you"), so no issue may ever grant permission
 * to change it — `findOutOfScopeChanges` checks it unconditionally, the same way it checks the
 * always-immutable top-level fields.
 */
const MUTABLE_STEP_FIELDS = ["stepNo", "instruction", "timerSeconds"] as const;
type MutableStepField = (typeof MUTABLE_STEP_FIELDS)[number];
const MUTABLE_STEP_FIELD_SET: ReadonlySet<string> = new Set(MUTABLE_STEP_FIELDS);

// ---------------------------------------------------------------------------------------------
// 1. Parsing a QA issue's `field` into a deterministic target
// ---------------------------------------------------------------------------------------------

type ParsedTarget =
  | { kind: "top"; field: MutableTopLevelField }
  | { kind: "ingredientsWhole" }
  | { kind: "ingredientItem"; index: number }
  | { kind: "ingredientItemField"; index: number; field: MutableIngredientField }
  | { kind: "stepsWhole" }
  | { kind: "stepItem"; stepNo: number }
  | { kind: "stepItemField"; stepNo: number; field: MutableStepField }
  /** Cannot be mapped to a safe, in-scope location — grants NOTHING (see module header). */
  | { kind: "unresolvable" };

const INGREDIENT_ITEM_FIELD_RE = /^ingredients\[(\d+)\]\.([A-Za-z][A-Za-z0-9]*)$/;
const INGREDIENT_ITEM_RE = /^ingredients\[(\d+)\]$/;
const STEP_ITEM_FIELD_RE = /^steps\[(\d+)\]\.([A-Za-z][A-Za-z0-9]*)$/;
const STEP_ITEM_RE = /^steps\[(\d+)\]$/;

/**
 * Parses one QA issue's `field` string against the SAME bracket-path convention the Step 04
 * Postgres validation RPCs already emit (see this module's header). Anything that doesn't match —
 * free text, an unrecognized top-level name, an identity/pipeline field, an index-less bracket like
 * `steps[].stepNo` (the exact shape `STEP_NO_NOT_NUMBER` emits when a step's stepNo isn't even a
 * number to begin with, so there is no index to anchor on) — resolves to `"unresolvable"`.
 */
export function parseIssueFieldPath(field: string): ParsedTarget {
  const trimmed = field.trim();

  let match = INGREDIENT_ITEM_FIELD_RE.exec(trimmed);
  if (match) {
    const itemField = match[2];
    if (!MUTABLE_INGREDIENT_FIELD_SET.has(itemField)) return { kind: "unresolvable" };
    return { kind: "ingredientItemField", index: Number(match[1]), field: itemField as MutableIngredientField };
  }

  match = INGREDIENT_ITEM_RE.exec(trimmed);
  if (match) return { kind: "ingredientItem", index: Number(match[1]) };

  if (trimmed === "ingredients") return { kind: "ingredientsWhole" };

  match = STEP_ITEM_FIELD_RE.exec(trimmed);
  if (match) {
    const itemField = match[2];
    if (!MUTABLE_STEP_FIELD_SET.has(itemField)) return { kind: "unresolvable" };
    return { kind: "stepItemField", stepNo: Number(match[1]), field: itemField as MutableStepField };
  }

  match = STEP_ITEM_RE.exec(trimmed);
  if (match) return { kind: "stepItem", stepNo: Number(match[1]) };

  if (trimmed === "steps") return { kind: "stepsWhole" };

  // Index-less brackets — e.g. "steps[].stepNo", "ingredients[]" — a real shape the RPCs emit when
  // they can't identify WHICH item at all (STEP_NO_NOT_NUMBER), not a location this module can
  // safely resolve to one item.
  if (/^steps\[\]/.test(trimmed) || /^ingredients\[\]/.test(trimmed)) return { kind: "unresolvable" };

  if (MUTABLE_TOP_LEVEL_FIELD_SET.has(trimmed)) return { kind: "top", field: trimmed as MutableTopLevelField };

  // Covers every immutable top-level field name (sourceType, authorType, ...) too: an issue that
  // names one of those cannot be resolved to a safe target ANY more than free text can — see the
  // module header on why "identifies an off-limits field" and "doesn't parse at all" get the same
  // treatment here.
  return { kind: "unresolvable" };
}

// ---------------------------------------------------------------------------------------------
// Allowed-change surface
// ---------------------------------------------------------------------------------------------

export interface AllowedChangeSurface {
  topLevelFields: ReadonlySet<string>;
  ingredientsWhole: boolean;
  ingredientIndices: ReadonlySet<number>;
  ingredientItemFields: ReadonlyMap<number, ReadonlySet<string>>;
  stepsWhole: boolean;
  stepStepNos: ReadonlySet<number>;
  stepItemFields: ReadonlyMap<number, ReadonlySet<string>>;
}

export type AllowedChangeSurfaceResult =
  | { ok: true; surface: AllowedChangeSurface }
  /** At least one blocking issue's `field` could not be mapped to a safe target — the caller must
   * not run the Reviser at all; route to manual review instead (see module header). */
  | { ok: false; unresolvedIssue: RecipeQAIssue };

/**
 * Derives the allowed-change surface from a QA result's `blockingIssues` ONLY — never
 * `nonBlockingSuggestions`. This is the mechanical form of revise-rules.ts item 2 ("do not change
 * anything the blocking issues did not flag") and PROMPT 08A's own requirement 3 ("non-blocking
 * suggestions never grant mutation permission") — a non-blocking suggestion is simply never passed
 * to this function in the first place (see revise-stage.ts's call site).
 */
export function computeAllowedChangeSurface(blockingIssues: readonly RecipeQAIssue[]): AllowedChangeSurfaceResult {
  const topLevelFields = new Set<string>();
  let ingredientsWhole = false;
  const ingredientIndices = new Set<number>();
  const ingredientItemFields = new Map<number, Set<string>>();
  let stepsWhole = false;
  const stepStepNos = new Set<number>();
  const stepItemFields = new Map<number, Set<string>>();

  for (const issue of blockingIssues) {
    const target = parseIssueFieldPath(issue.field);
    switch (target.kind) {
      case "top":
        topLevelFields.add(target.field);
        break;
      case "ingredientsWhole":
        ingredientsWhole = true;
        break;
      case "ingredientItem":
        ingredientIndices.add(target.index);
        break;
      case "ingredientItemField": {
        const set = ingredientItemFields.get(target.index) ?? new Set<string>();
        set.add(target.field);
        ingredientItemFields.set(target.index, set);
        break;
      }
      case "stepsWhole":
        stepsWhole = true;
        break;
      case "stepItem":
        stepStepNos.add(target.stepNo);
        break;
      case "stepItemField": {
        const set = stepItemFields.get(target.stepNo) ?? new Set<string>();
        set.add(target.field);
        stepItemFields.set(target.stepNo, set);
        break;
      }
      case "unresolvable":
        return { ok: false, unresolvedIssue: issue };
    }
  }

  return {
    ok: true,
    surface: {
      topLevelFields,
      ingredientsWhole,
      ingredientIndices,
      ingredientItemFields,
      stepsWhole,
      stepStepNos,
      stepItemFields,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// 2. Diffing the candidate against the previous draft
// ---------------------------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}

/**
 * Diffs `prev`/`cand` ingredient arrays against the surface. Two shapes are recognized:
 *   - same length: an in-place field change on item i is allowed iff index i has whole-item
 *     permission (`ingredientIndices`) or that specific field is granted for index i
 *     (`ingredientItemFields`).
 *   - `cand` exactly one item shorter than `prev`: allowed iff removing exactly one index r from
 *     `prev` reconstructs `cand` verbatim AND index r has whole-item permission — matches the
 *     accepted "remove the unused ingredient a blocking issue named" shape (revise-rules.ts item 2/
 *     PROMPT 08A's own required test), which the existing fixtures already exercise.
 * Any other length change (an addition, more than one removal, or any removal without whole-item
 * permission on the removed index) is out of scope UNLESS `ingredientsWhole` was granted (a
 * blocking issue named the bare "ingredients" array, e.g. INGREDIENTS_EMPTY/INGREDIENTS_NOT_ARRAY).
 */
function diffIngredients(
  prev: readonly RecipeIngredientDraft[],
  cand: readonly RecipeIngredientDraft[],
  surface: AllowedChangeSurface,
): string[] {
  if (deepEqual(prev, cand)) return [];
  if (surface.ingredientsWhole) return [];

  if (prev.length === cand.length) {
    const violations: string[] = [];
    for (let i = 0; i < prev.length; i++) {
      if (deepEqual(prev[i], cand[i])) continue;
      if (surface.ingredientIndices.has(i)) continue;
      const allowedFields = surface.ingredientItemFields.get(i);
      const prevItem = prev[i] as unknown as Record<string, unknown>;
      const candItem = cand[i] as unknown as Record<string, unknown>;
      for (const key of MUTABLE_INGREDIENT_FIELDS) {
        if (deepEqual(prevItem[key], candItem[key])) continue;
        if (allowedFields?.has(key)) continue;
        violations.push(`ingredients[${i}].${key}`);
      }
    }
    return violations;
  }

  if (cand.length === prev.length - 1) {
    for (let removedIndex = 0; removedIndex < prev.length; removedIndex++) {
      const reconstructed = [...prev.slice(0, removedIndex), ...prev.slice(removedIndex + 1)];
      if (deepEqual(reconstructed, cand)) {
        if (surface.ingredientIndices.has(removedIndex)) return [];
        return [`ingredients[${removedIndex}] removed without permission`];
      }
    }
  }

  return ["ingredients: structural change not recognized as a permitted single-item removal"];
}

/**
 * Diffs `prev`/`cand` step arrays against the surface. `photoUrl` is checked UNCONDITIONALLY on
 * every item — never grantable, per revise-rules.ts item 9 (see MUTABLE_STEP_FIELDS's own comment).
 * Only same-length in-place field changes are reconciled (matched by the step's ORIGINAL stepNo,
 * the same identity a blocking issue's `steps[N]`/`steps[N].field` target names) — length changes
 * are out of scope unless `stepsWhole` was granted. This deliberately does NOT attempt to reconcile
 * revise-rules.ts item 6's "renumber remaining steps after an ingredient-driven step removal" —
 * that shape fails CLOSED (rejected as out-of-scope) rather than guessed at; see this module's
 * header.
 */
function diffSteps(
  prev: readonly RecipeStepDraft[],
  cand: readonly RecipeStepDraft[],
  surface: AllowedChangeSurface,
): string[] {
  if (deepEqual(prev, cand)) return [];

  const violations: string[] = [];

  if (prev.length !== cand.length) {
    if (surface.stepsWhole) return [];
    return ["steps: length change requires a blocking issue targeting the whole 'steps' array"];
  }

  for (let i = 0; i < prev.length; i++) {
    if (deepEqual(prev[i], cand[i])) continue;
    const stepNo = prev[i].stepNo;

    if (!deepEqual(prev[i].photoUrl, cand[i].photoUrl)) {
      violations.push(`steps[${stepNo}].photoUrl`);
    }

    if (surface.stepsWhole) continue;
    const wholeItemAllowed = surface.stepStepNos.has(stepNo);
    const allowedFields = surface.stepItemFields.get(stepNo);
    const prevItem = prev[i] as unknown as Record<string, unknown>;
    const candItem = cand[i] as unknown as Record<string, unknown>;
    for (const key of MUTABLE_STEP_FIELDS) {
      if (deepEqual(prevItem[key], candItem[key])) continue;
      if (wholeItemAllowed) continue;
      if (allowedFields?.has(key)) continue;
      violations.push(`steps[${stepNo}].${key}`);
    }
  }

  return violations;
}

/**
 * Returns every change in `candidate` (relative to `previous`) that falls outside `surface` — an
 * empty array means the candidate is fully in-scope. `revise-stage.ts` rejects the candidate
 * outright if this returns anything at all (see this module's header).
 */
export function findOutOfScopeChanges(
  previous: RecipeDraftPayload,
  candidate: RecipeDraftPayload,
  surface: AllowedChangeSurface,
): string[] {
  const violations: string[] = [];

  for (const field of IMMUTABLE_TOP_LEVEL_FIELDS) {
    if (!deepEqual(previous[field], candidate[field])) violations.push(field);
  }

  for (const field of MUTABLE_TOP_LEVEL_FIELDS) {
    if (deepEqual(previous[field], candidate[field])) continue;
    if (surface.topLevelFields.has(field)) continue;
    violations.push(field);
  }

  violations.push(...diffIngredients(previous.ingredients, candidate.ingredients, surface));
  violations.push(...diffSteps(previous.steps, candidate.steps, surface));

  return violations;
}
