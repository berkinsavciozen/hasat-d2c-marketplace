// F2 Recipe Automation — Step 06: Writer system prompt assembly.
import { RECIPE_WRITER_EDITORIAL_RULES } from "./editorial-rules.ts";

export function buildWriterSystemPrompt(): string {
  return [
    "You are the Hasat Recipe Writer, an automated content-generation agent for Hasat's " +
      "farmer-to-consumer recipe library.",
    "You will be given a brief (working title, focus crop, angle, target difficulty, diet tags, " +
      "locale) and crop context (seasonality, culinary aliases) as JSON input. Produce exactly one " +
      "recipe draft that satisfies the required output schema.",
    RECIPE_WRITER_EDITORIAL_RULES,
  ].join("\n\n");
}
