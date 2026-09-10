// Allergen review manifest — Aşama A (see generate-allergen-manifest.mjs header for the full task
// context). This module is the ENTIRE "yöntem" for the deterministic candidate source: a plain,
// versioned, inspectable Turkish keyword dictionary. No ML/LLM call happens here — this is
// intentionally the "kural tabanlı" half of the two allowed candidate sources (the other is F2's
// existing safetyReview.allergens.detectedLabels, cross-referenced separately in the main script).
//
// Matching is diacritic-insensitive: both ingredient text and these keywords are folded to plain
// ASCII lowercase (see `foldTurkish` in generate-allergen-manifest.mjs) before comparison, and
// matched as whole words/phrases (never a bare substring) to avoid false positives like "unlu"
// matching "un".
//
// Every keyword list below maps to exactly one controlled taxonomy slug. Anything that looks like
// an allergen but does not cleanly fit the current vocabulary is deliberately kept OUT of this
// object and instead listed in
// `OUT_OF_SCOPE_KEYWORDS` below, which never produces a `candidate_labels` value — only a
// `taxonomy_out_of_scope_notes` entry. This mirrors the precedent set by migration
// 20260904190000_t3a2_allergen_labels_taxonomy_remap.sql, which explicitly refused to map "ceviz"
// (walnut) onto the "findik-yerfistigi" (hazelnut/peanut) slug because it is a different species —
// same reasoning applied here up front, not just for existing bad data.

/** slug -> array of whole-word/phrase keywords (already ASCII-folded, lowercase). */
export const TAXONOMY_KEYWORDS = {
  gluten: [
    "bugday",
    "un",
    "ekmek",
    "bulgur",
    "irmik",
    "makarna",
    "sehriye",
    "eriste",
    "yulaf",
    "arpa",
    "cavdar",
    "kuskus",
    "tarhana",
    "galeta",
    "kraker",
    "bisküvi",
    "biskuvi",
    "simit",
    "lavas",
    "yufka",
    "pizza hamuru",
    "hamur",
  ],
  laktoz: [
    "sut",
    "peynir",
    "yogurt",
    "tereyagi",
    "krema",
    "kaymak",
    "lor",
    "kefir",
    "dondurma",
    "labne",
    "kasar",
  ],
  yumurta: ["yumurta"],
  "findik-yerfistigi": ["findik", "yer fistigi", "fistik ezmesi", "yer fistigi ezmesi"],
  "agac-kuruyemisi": [
    "ceviz",
    "badem",
    "kaju",
    "antep fistigi",
    "cam fistigi",
    "makademya",
    "pekan",
  ],
  soya: ["soya", "soya sosu", "soya fasulyesi", "tofu", "tempeh", "edamame", "misket soyasi"],
  susam: ["susam", "tahin", "susam yagi", "simit susami"],
  "deniz-urunu": [
    "balik",
    "somon",
    "ton baligi",
    "uskumru",
    "hamsi",
    "levrek",
    "cupra",
    "karides",
    "midye",
    "ahtapot",
    "kalamar",
    "yengec",
    "istiridye",
    "alabalik",
    "palamut",
    "sardalya",
    "deniz urunu",
    "balik sosu",
    "balik yagi",
  ],
  hardal: ["hardal"],
  kereviz: ["kereviz"],
  sulfit: ["sulfit", "kukurt dioksit", "sulfur dioksit"],
  lupin: ["lupin"],
};

/**
 * Keywords that name a real, common allergen but have no home in the controlled taxonomy today.
 * Matches here never populate `candidate_labels` — only `taxonomy_out_of_scope_notes`, per task
 * constraint #4 ("bu 7'nin dışında bir öneri üretme").
 */
export const OUT_OF_SCOPE_KEYWORDS = {
  // Intentionally empty today. Keep this explicit bucket for a newly discovered allergen term
  // that has not yet been admitted to the controlled product taxonomy.
};

/**
 * Bare words that are genuinely ambiguous without more context — never auto-mapped to a slug or
 * to an out-of-scope bucket. Surfaced only in `ambiguity_notes` so a human resolves them.
 * e.g. "fıstık" alone could mean peanut (findik-yerfistigi), pistachio, or pine nut (both
 * out-of-scope tree nuts) -- the qualified phrases above ("yer fistigi", "antep fistigi",
 * "cam fistigi") are unambiguous and are matched separately.
 */
export const AMBIGUOUS_KEYWORDS = ["fistik"];

/** Contextual exceptions that plain whole-word matching cannot safely express. */
export function shouldSuppressTaxonomyMatch(slug, keyword, foldedText, foldedContext = foldedText) {
  if (slug === "laktoz" && keyword === "sut") {
    const plantMilk =
      /(?:^|[^a-z])(?:bitkisel|badem|yulaf|soya|hindistan[^a-z]+cevizi)[^a-z]+sutu?(?:[^a-z]|$)/;
    if (plantMilk.test(` ${foldedContext} `)) return true;
  }
  if (slug === "gluten" && keyword === "yulaf") {
    const certifiedGlutenFree =
      foldedContext.includes("glutensiz") && foldedContext.includes("sertifikali");
    if (certifiedGlutenFree) return true;
  }
  return false;
}

function tokenize(foldedText) {
  return foldedText.split(/[^a-z]+/).filter(Boolean);
}

/**
 * Matches `foldedText` (already ASCII-folded/lowercased) against a keyword list. Single-word
 * keywords must match a whole token; multi-word keywords must appear as a whole phrase (word
 * boundaries on both ends). Returns the list of keywords that matched.
 */
export function matchKeywords(foldedText, keywords) {
  const tokens = new Set(tokenize(foldedText));
  const hits = [];
  for (const keyword of keywords) {
    if (keyword.includes(" ")) {
      const pattern = new RegExp(`(?:^|[^a-z])${keyword.replace(/ /g, "[^a-z]+")}(?:[^a-z]|$)`);
      if (pattern.test(` ${foldedText} `)) hits.push(keyword);
    } else if (tokens.has(keyword)) {
      hits.push(keyword);
    }
  }
  return hits;
}
