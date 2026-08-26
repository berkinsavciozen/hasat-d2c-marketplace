// F2 Recipe Automation — Step 09: deterministic "Image Director" prompt builder.
//
// PLAN DEVIATION (documented, see the Step 09 completion report): PROMPT 09's flow names an
// "Image Director" step producing a RecipeImageSpec. `recipeImageSpecSchema` (schemas.ts) has no
// prompt field and is almost entirely fixed defaults/Gate-A-decided constants (provider, modelId,
// chopFraction, cropAlignment, outputFormat/outputQuality, stripMetadata, geometryEngine,
// storageBucket) or values this stage-runner sets directly from the QA-approved draft/job
// (targetKind, recipeId, cropTargets — always ["16:9","1:1"] for a recipe_cover). The one genuinely
// content-dependent decision — what to actually ask Gemini to draw — is implemented here as a
// deterministic template over the draft's own fields, NOT a separate LLM agent call: the Writer
// draft already fully constrains subject matter (title/ingredients/description), so an extra
// content-generation hop would add cost, latency and another failure mode for a decision that is
// already fully determined by upstream, already-QA-approved content. This keeps the same
// swappable-seam shape (one function, one clear input/output) so a future step can promote it to a
// real agent-runner call without touching image-stage.ts's orchestration.
import type { ImageStageDraft } from "./context.ts";

const MAX_INGREDIENT_LINES = 8;

function ingredientLine(ingredient: ImageStageDraft["ingredients"][number]): string | null {
  const name = ingredient.freeTextName ?? ingredient.crop;
  return name ? name.trim() : null;
}

/**
 * Builds the Gemini image-generation prompt for a recipe cover photo. Food-photography styling
 * instructions are fixed (professional, natural light, no on-image text/logo/watermark — this
 * pipeline never asks the model to render text, since Turkish diacritics in model-rendered text
 * are exactly the kind of artifact `frame-suspicion.ts`'s human-review flag exists to catch, not
 * something to request in the first place); only the subject description varies per recipe.
 */
export function buildImagePrompt(draft: ImageStageDraft): string {
  const ingredientNames = draft.ingredients
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(ingredientLine)
    .filter((name): name is string => name !== null)
    .slice(0, MAX_INGREDIENT_LINES);

  const cuisineNote = draft.cuisine ? ` (${draft.cuisine} mutfagi)` : "";

  return [
    `Professional food photography of "${draft.title}"${cuisineNote}, plated and ready to serve.`,
    ingredientNames.length > 0
      ? `Visible key ingredients: ${ingredientNames.join(", ")}.`
      : null,
    "Overhead or 45-degree angle, natural daylight, shallow depth of field, appetizing styling on a simple rustic table setting.",
    "Square composition, the full dish centered with even margin on all sides so the frame can be safely cropped later.",
    "No text, no logos, no watermarks, no human hands or faces, no packaging labels.",
  ].filter((line): line is string => line !== null).join(" ");
}
