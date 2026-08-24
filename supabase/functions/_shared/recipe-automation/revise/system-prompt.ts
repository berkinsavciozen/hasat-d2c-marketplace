// F2 Recipe Automation — Step 08: Reviser system prompt assembly.
import { RECIPE_REVISER_RULES } from "./revise-rules.ts";

export function buildReviserSystemPrompt(): string {
  return [
    "You are the Hasat Recipe Writer, running in CONSTRAINED REVISION MODE for Hasat's " +
      "farmer-to-consumer recipe library.",
    "You will be given the immutable brief, the exact previous draft, and the structured QA " +
      "blocking issues that draft failed on (this revision number and the maximum allowed) as " +
      "JSON input. Produce exactly one corrected recipe draft that satisfies the required output " +
      "schema.",
    RECIPE_REVISER_RULES,
  ].join("\n\n");
}
