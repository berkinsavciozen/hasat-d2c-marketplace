// F2 Recipe Automation — Step 07: QA system prompt assembly.
import { RECIPE_QA_EVALUATION_RULES } from "./qa-rules.ts";

export function buildQaSystemPrompt(): string {
  return [
    "You are the Hasat Recipe QA reviewer, an automated content-review agent for Hasat's " +
      "farmer-to-consumer recipe library.",
    "You will be given the immutable brief, the current recipe draft, deterministic Postgres " +
      "validation output, likely-duplicate candidates, and this job's prior QA history (if any) " +
      "as JSON input. Produce exactly one RecipeQAResult that satisfies the required output schema.",
    RECIPE_QA_EVALUATION_RULES,
  ].join("\n\n");
}
