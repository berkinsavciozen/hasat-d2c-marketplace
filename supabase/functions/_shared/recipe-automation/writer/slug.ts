// F2 Recipe Automation — Step 06: deterministic title -> candidate slug.
//
// `recipe_drafts` has no `slug` column (slugs are only assigned to `recipes` rows at publish
// time — see 20260819120000_f2s03_recipe_automation_schema.sql), so the Writer stage doesn't
// persist this value. It derives a CANDIDATE slug from the draft's title purely so
// `validate_recipe_slug` (format + live-uniqueness against `recipes.slug`) can catch an obviously
// bad or already-taken title early, at draft time, instead of only at publish time.
const TURKISH_ASCII_MAP: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i", ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
};

export function slugifyTitle(title: string): string {
  const asciiFolded = title
    .split("")
    .map((ch) => TURKISH_ASCII_MAP[ch] ?? ch)
    .join("")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip remaining combining diacritics

  return asciiFolded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
