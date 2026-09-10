#!/usr/bin/env node
// Allergen review manifest generator — Aşama A (hazırlık) of the launch allergen-review gate.
//
// Context: before allergen filtering ships, every PUBLIC recipe needs a human-approved allergen
// review. This script is that gate's preparation step ONLY. It produces a manifest of CANDIDATE
// allergen labels + rationale for a human (Berkin) to review in Aşama B. It does not decide
// anything and it does not write anything.
//
// HARD CONSTRAINTS (see task dispatch — do not relax these without a new explicit instruction):
//   1. Zero production writes. This script only ever runs SELECT queries. It never touches
//      allergens_reviewed / allergens_reviewed_at / allergens_reviewed_by / allergen_labels or any
//      other `recipes` column.
//   2. No simulated human decision. Every row gets a CANDIDATE label + rationale + ambiguity note
//      — never a final "bu tarifte alerjen yok" style verdict. Aşama B (the real human sign-off,
//      writing allergens_reviewed=true) is a separate, later task.
//   3. Candidate generation method must be explicit, not a black box. Two sources are used, both
//      clearly labeled per-row in `candidate_rationale`:
//        a) deterministic keyword rules (./allergen-keywords.mjs) matched against each recipe's
//           real ingredient list (recipe_ingredients, resolved via crop_config/crop_culinary_meta
//           for platform crops, or free_text_name for off-platform ingredients);
//        b) F2's existing safetyReview.allergens.detectedLabels (recipe_qa_results, LLM-produced,
//           already-unreviewed by design — see qa-rules.ts) when reachable, cited as-is and never
//           treated as human-approved.
//   4. Only the controlled taxonomy slugs (imported from src/lib/hasat/recipeFacts.ts, the app's
//      own source of
//      truth) are ever placed in `candidate_labels`. Anything else goes to
//      `taxonomy_out_of_scope_notes` instead, verbatim, never invented into a made-up slug.
//
// Usage:
//   node --env-file=.env scripts/allergen-review/generate-allergen-manifest.mjs [--out FILE] [--format csv|md]
//
// Auth:
//   SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (both already in .env) are enough for the core
//   manifest — recipes/recipe_ingredients/crop_config are all queried with visibility='public'
//   AND status='published', the exact same public-read scope the app itself uses
//   (src/lib/hasat/recipes.ts). SUPABASE_SERVICE_ROLE_KEY is OPTIONAL and, if present, is used
//   ONLY to SELECT from recipe_qa_results for the F2 cross-reference in constraint 3b above
//   (that table has no anon/authenticated RLS grant at all — service_role is required to read it,
//   not just to write it). Missing it is a safe no-op: the manifest still generates, with a note
//   that the F2 cross-reference was skipped.
//
// Idempotent / repeatable by design (read-only) — this is exactly what Aşama B is expected to
// re-run for a fresh manifest against whatever the public catalog looks like at that time.

import { loadEnvFile } from "node:process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  TAXONOMY_KEYWORDS,
  OUT_OF_SCOPE_KEYWORDS,
  AMBIGUOUS_KEYWORDS,
  matchKeywords,
  shouldSuppressTaxonomyMatch,
} from "./allergen-keywords.mjs";

try {
  loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // .env already exported into the environment (e.g. CI) — nothing to load.
}

const { ALLERGEN_SLUGS, getReviewedAllergens } = await import("../../src/lib/hasat/recipeFacts.ts");

const PAGE_SIZE = 500;

function parseArgs(argv) {
  const args = { out: null, format: "csv" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--format") args.format = argv[++i];
  }
  if (!["csv", "md"].includes(args.format)) {
    throw new Error(`Unsupported --format "${args.format}" (expected csv or md)`);
  }
  return args;
}

function foldTurkish(text) {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/i̇/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

async function fetchAllPages(client, table, columns, filters = (q) => q) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await filters(client.from(table).select(columns)).range(
      from,
      from + PAGE_SIZE - 1,
    );
    if (error) throw new Error(`${table} query failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function fetchInChunks(client, table, columns, idColumn, ids, extra = (q) => q) {
  const rows = [];
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await extra(client.from(table).select(columns).in(idColumn, chunk));
    if (error) throw new Error(`${table} query failed: ${error.message}`);
    rows.push(...data);
  }
  return rows;
}

/** Resolves one recipe_ingredients row to display text + a note on how confidently it was named. */
function describeIngredient(row, cropNames, cropAliases) {
  if (row.crop) {
    const display = cropNames.get(row.crop) ?? row.crop;
    const aliases = cropAliases.get(row.crop) ?? [];
    return {
      name: display,
      searchText: [display, row.crop, ...aliases].join(" "),
      note: row.note ?? "",
      source: "crop",
    };
  }
  if (row.free_text_name) {
    return {
      name: row.free_text_name,
      searchText: row.free_text_name,
      note: row.note ?? "",
      source: "free_text_name",
    };
  }
  return { name: "(adsız malzeme)", searchText: "", note: row.note ?? "", source: "missing" };
}

function buildCandidates(ingredientDescriptions) {
  const candidateHits = new Map(); // slug -> [{ ingredient, keyword }]
  const outOfScopeHits = new Map(); // category -> [{ ingredient, keyword }]
  const ambiguousHits = []; // { ingredient, keyword }

  const searchable = ingredientDescriptions.flatMap((d) => {
    const context = [d.searchText, d.note].filter(Boolean).join(" ");
    return [
      { label: d.name, text: d.searchText, context },
      ...(d.note ? [{ label: `not: "${d.note}"`, text: d.note, context }] : []),
    ];
  });

  for (const { label, text, context } of searchable) {
    if (!text) continue;
    const folded = foldTurkish(text);
    const foldedContext = foldTurkish(context);

    for (const [slug, keywords] of Object.entries(TAXONOMY_KEYWORDS)) {
      for (const keyword of matchKeywords(folded, keywords)) {
        if (shouldSuppressTaxonomyMatch(slug, keyword, folded, foldedContext)) continue;
        if (!candidateHits.has(slug)) candidateHits.set(slug, []);
        candidateHits.get(slug).push({ ingredient: label, keyword });
      }
    }
    for (const [category, keywords] of Object.entries(OUT_OF_SCOPE_KEYWORDS)) {
      for (const keyword of matchKeywords(folded, keywords)) {
        if (!outOfScopeHits.has(category)) outOfScopeHits.set(category, []);
        outOfScopeHits.get(category).push({ ingredient: label, keyword });
      }
    }
    for (const keyword of matchKeywords(folded, AMBIGUOUS_KEYWORDS)) {
      ambiguousHits.push({ ingredient: label, keyword });
    }
  }

  return { candidateHits, outOfScopeHits, ambiguousHits };
}

function formatRationale(candidateHits) {
  const parts = [];
  for (const slug of ALLERGEN_SLUGS) {
    const hits = candidateHits.get(slug);
    if (!hits || hits.length === 0) continue;
    const cited = hits.map((h) => `"${h.ingredient}" (kural: "${h.keyword}")`).join(", ");
    parts.push(`${slug} <- kural-tabanlı eşleşme: ${cited}`);
  }
  return parts.join("; ");
}

function formatOutOfScope(outOfScopeHits, f2OutOfScope) {
  const parts = [];
  for (const [category, hits] of outOfScopeHits) {
    const cited = hits.map((h) => `"${h.ingredient}" (kural: "${h.keyword}")`).join(", ");
    parts.push(`taksonomi dışı, insan kararına bırakıldı — ${category}: ${cited}`);
  }
  for (const label of f2OutOfScope) {
    parts.push(
      `taksonomi dışı, insan kararına bırakıldı — F2 QA'nın (LLM, insan onaysız) tespit ettiği ` +
        `"${label}" etiketi kontrollü taksonomiyle eşleşmiyor`,
    );
  }
  return parts.join("; ");
}

function formatAmbiguity({ ambiguousHits, ingredientsEmpty, f2Available, f2ConflictNote }) {
  const parts = [];
  if (ingredientsEmpty) {
    parts.push("malzeme listesi boş/eksik — aday etiket üretilemedi, insan incelemesi gerekli");
  }
  for (const { ingredient, keyword } of ambiguousHits) {
    parts.push(
      `"${ingredient}" içindeki "${keyword}" belirsiz (tür belirtilmemiş, hangi taksonomi ` +
        `slug'ına ya da taksonomi dışına düştüğü netleşmiyor) — insan kararına bırakıldı`,
    );
  }
  if (!f2Available) {
    parts.push(
      "F2 QA safetyReview.allergens.detectedLabels referansı bu çalıştırmada erişilemedi (SUPABASE_SERVICE_ROLE_KEY yok)",
    );
  }
  if (f2ConflictNote) {
    parts.push(f2ConflictNote);
  }
  return parts.join("; ");
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  return lines.join("\n") + "\n";
}

function toMarkdown(headers, rows) {
  const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const row of rows) {
    lines.push(
      `| ${headers
        .map((h) =>
          String(row[h] ?? "")
            .replace(/\|/g, "\\|")
            .replace(/\n/g, " "),
        )
        .join(" | ")} |`,
    );
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY in the environment (.env).");
  }
  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const f2Client = serviceRoleKey
    ? createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  process.stderr.write("Public + published tarifler okunuyor (salt-okunur)...\n");
  const recipes = await fetchAllPages(
    anonClient,
    "recipes",
    "id, slug, title, allergen_labels, allergens_reviewed, allergens_reviewed_at",
    (q) => q.eq("visibility", "public").eq("status", "published").order("slug"),
  );
  process.stderr.write(`${recipes.length} public+published tarif bulundu.\n`);

  const recipeIds = recipes.map((r) => r.id);

  const ingredients = recipeIds.length
    ? await fetchInChunks(
        anonClient,
        "recipe_ingredients",
        "recipe_id, crop, free_text_name, quantity, unit, note, sort_order",
        "recipe_id",
        recipeIds,
        (q) => q.order("sort_order"),
      )
    : [];

  const cropSlugs = [...new Set(ingredients.map((i) => i.crop).filter(Boolean))];
  const cropRows = cropSlugs.length
    ? await fetchInChunks(anonClient, "crop_config", "crop, display_name", "crop", cropSlugs)
    : [];
  const cropNames = new Map(cropRows.map((c) => [c.crop, c.display_name]));

  let cropAliases = new Map();
  if (cropSlugs.length) {
    const { data, error } = await anonClient
      .from("crop_culinary_meta")
      .select("crop, culinary_aliases")
      .in("crop", cropSlugs);
    if (!error && data) {
      cropAliases = new Map(data.map((c) => [c.crop, c.culinary_aliases ?? []]));
    }
    // A missing/inaccessible crop_culinary_meta table is a safe no-op: aliases simply stay empty,
    // matching still runs on display_name/free_text_name/note.
  }

  let f2ByRecipe = new Map();
  if (f2Client && recipeIds.length) {
    process.stderr.write(
      "F2 QA safetyReview.allergens.detectedLabels referansı okunuyor (service-role, salt-okunur)...\n",
    );
    const { data, error } = await f2Client
      .from("recipe_qa_results")
      .select("recipe_id, safety_review, created_at")
      .in("recipe_id", recipeIds)
      .not("recipe_id", "is", null)
      .order("created_at", { ascending: false });
    if (error) {
      process.stderr.write(
        `F2 QA referansı okunamadı (${error.message}) — bu çalıştırma F2 karşılaştırması olmadan devam ediyor.\n`,
      );
    } else {
      for (const row of data) {
        if (!f2ByRecipe.has(row.recipe_id)) f2ByRecipe.set(row.recipe_id, row); // first = latest (desc order)
      }
    }
  }

  const ingredientsByRecipe = new Map();
  for (const ing of ingredients) {
    if (!ingredientsByRecipe.has(ing.recipe_id)) ingredientsByRecipe.set(ing.recipe_id, []);
    ingredientsByRecipe.get(ing.recipe_id).push(ing);
  }

  const manifestRows = recipes.map((recipe) => {
    const recipeIngredients = ingredientsByRecipe.get(recipe.id) ?? [];
    const descriptions = recipeIngredients.map((i) =>
      describeIngredient(i, cropNames, cropAliases),
    );
    const { candidateHits, outOfScopeHits, ambiguousHits } = buildCandidates(descriptions);

    const f2Result = f2ByRecipe.get(recipe.id);
    const f2Detected = f2Result?.safety_review?.allergens?.detectedLabels ?? [];
    const f2InScope = [];
    const f2OutOfScope = [];
    let f2ConflictNote = "";
    for (const raw of f2Detected) {
      const folded = foldTurkish(String(raw));
      const matchedSlug = ALLERGEN_SLUGS.find((slug) => foldTurkish(slug) === folded);
      if (matchedSlug) {
        f2InScope.push(matchedSlug);
        if (!candidateHits.has(matchedSlug)) candidateHits.set(matchedSlug, []);
        candidateHits
          .get(matchedSlug)
          .push({ ingredient: "F2 QA (LLM, insan onaysız)", keyword: raw });
      } else {
        f2OutOfScope.push(String(raw));
      }
    }
    if (
      f2Detected.length &&
      candidateHits.size === 0 &&
      f2OutOfScope.length === f2Detected.length
    ) {
      f2ConflictNote =
        `F2 QA "${f2OutOfScope.join(", ")}" tespit etti ama kural motoru malzeme listesinde ` +
        `hiçbir eşleşme bulamadı — çapraz kontrol edin`;
    }

    const ingredientsSummary = recipeIngredients.length
      ? descriptions
          .map((d, idx) => {
            const row = recipeIngredients[idx];
            const qty = [row.quantity, row.unit].filter((v) => v !== null && v !== "").join(" ");
            return qty ? `${d.name} (${qty})` : d.name;
          })
          .join("; ")
      : "(malzeme listesi boş)";

    const reviewed = getReviewedAllergens(recipe);
    const currentReviewedStatus =
      reviewed.reviewState === "unreviewed"
        ? "unreviewed"
        : `${reviewed.reviewState} (reviewed_at=${recipe.allergens_reviewed_at})`;

    return {
      recipe_id: recipe.id,
      slug: recipe.slug,
      title: recipe.title,
      current_allergen_labels: (recipe.allergen_labels ?? []).join("|") || "(null)",
      current_reviewed_status: currentReviewedStatus,
      ingredients_summary: ingredientsSummary,
      candidate_labels: [...candidateHits.keys()].sort().join("|") || "(aday yok)",
      candidate_rationale: formatRationale(candidateHits) || "(kural eşleşmesi yok)",
      ambiguity_notes:
        formatAmbiguity({
          ambiguousHits,
          ingredientsEmpty: recipeIngredients.length === 0,
          f2Available: Boolean(f2Client),
          f2ConflictNote,
        }) || "(yok)",
      taxonomy_out_of_scope_notes: formatOutOfScope(outOfScopeHits, f2OutOfScope) || "(yok)",
    };
  });

  const headers = [
    "recipe_id",
    "slug",
    "title",
    "current_allergen_labels",
    "current_reviewed_status",
    "ingredients_summary",
    "candidate_labels",
    "candidate_rationale",
    "ambiguity_notes",
    "taxonomy_out_of_scope_notes",
  ];
  const output =
    args.format === "md" ? toMarkdown(headers, manifestRows) : toCsv(headers, manifestRows);

  if (args.out) {
    writeFileSync(args.out, output, "utf8");
    process.stderr.write(`Manifest yazıldı: ${args.out}\n`);
  } else {
    process.stdout.write(output);
  }

  process.stderr.write(
    `Özet: ${manifestRows.length} satır üretildi (production'daki public+published tarif sayısı: ${recipes.length}). ` +
      `F2 QA referansı: ${f2Client ? "kullanıldı" : "atlandı (SUPABASE_SERVICE_ROLE_KEY yok)"}. Hiçbir yazma işlemi yapılmadı.\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`HATA: ${err.stack ?? err.message}\n`);
  process.exitCode = 1;
});
