import {
  ALLERGEN_SLUGS,
  getNutritionState,
  getReviewedAllergens,
  type AllergenSlug,
  type RecipeFacts,
} from "./recipeFacts";

const TURKISH_NUMBER = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 1,
});

const ALLERGEN_LABELS: Record<AllergenSlug, string> = {
  gluten: "Gluten",
  laktoz: "Laktoz",
  yumurta: "Yumurta",
  "findik-yerfistigi": "Fındık / yer fıstığı",
  soya: "Soya",
  susam: "Susam",
  "deniz-urunu": "Deniz ürünü",
};

export type NutritionValues = {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
};

export type NutritionPresentation =
  | { state: "unavailable"; message: "Besin bilgisi henüz hazır değil." }
  | {
      state: "computed" | "partial" | "estimated";
      perServing: NutritionValues;
      coveragePct: number;
      explanation: string;
    };

export type AllergenPresentation =
  | { state: "unreviewed"; labels: null; message: "Alerjen bilgisi henüz doğrulanmadı." }
  | {
      state: "reviewed_without_labels";
      labels: [];
      message: "İşaretlenmiş alerjen bulunmuyor — içerikleri ve çapraz bulaşma riskini ayrıca kontrol edin.";
    }
  | { state: "reviewed_with_labels"; labels: string[]; message: "İşaretlenenler:" };

type RecipeWithServings = RecipeFacts & { servings: number | null };

const finiteNonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function buildNutritionPresentation(recipe: RecipeWithServings): NutritionPresentation {
  const state = getNutritionState(recipe);
  if (state === "unavailable" || (recipe.fiber_g !== null && !finiteNonnegative(recipe.fiber_g))) {
    return { state: "unavailable", message: "Besin bilgisi henüz hazır değil." };
  }

  const coveragePct =
    state === "partial"
      ? Math.min(99, Math.floor(recipe.nutrition_coverage_pct!))
      : state === "computed"
        ? 100
        : 0;
  const explanation =
    state === "computed"
      ? "Malzemelerin tamamı referans verilerle hesaplandı."
      : state === "partial"
        ? `Malzemelerin %${coveragePct} kadarı referans verilerle hesaplandı; kalan kısmı tahminidir.`
        : "Besin değerlerinin tamamı tahminidir.";

  return {
    state,
    coveragePct,
    explanation,
    perServing: {
      caloriesKcal: recipe.calories!,
      proteinG: recipe.protein_g!,
      carbsG: recipe.carbs_g!,
      fatG: recipe.fat_g!,
      fiberG: recipe.fiber_g,
    },
  };
}

export function scaleNutrition(values: NutritionValues, servings: number): NutritionValues {
  const multiplier = Number.isFinite(servings) && servings > 0 ? servings : 1;
  return {
    caloriesKcal: values.caloriesKcal * multiplier,
    proteinG: values.proteinG * multiplier,
    carbsG: values.carbsG * multiplier,
    fatG: values.fatG * multiplier,
    fiberG: values.fiberG === null ? null : values.fiberG * multiplier,
  };
}

export function formatNutritionNumber(value: number): string {
  return TURKISH_NUMBER.format(value);
}

function structuredNumber(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function toNutritionInformation(
  model: NutritionPresentation,
): Record<string, string> | undefined {
  if (model.state === "unavailable") return undefined;
  const values = model.perServing;
  return {
    "@type": "NutritionInformation",
    calories: `${structuredNumber(values.caloriesKcal)} calories`,
    proteinContent: `${structuredNumber(values.proteinG)} g`,
    carbohydrateContent: `${structuredNumber(values.carbsG)} g`,
    fatContent: `${structuredNumber(values.fatG)} g`,
    ...(values.fiberG === null ? {} : { fiberContent: `${structuredNumber(values.fiberG)} g` }),
  };
}

export function buildAllergenPresentation(recipe: RecipeFacts): AllergenPresentation {
  const reviewed = getReviewedAllergens(recipe);
  if (reviewed.reviewState === "unreviewed") {
    return { state: "unreviewed", labels: null, message: "Alerjen bilgisi henüz doğrulanmadı." };
  }
  if (reviewed.reviewState === "reviewed_without_labels") {
    return {
      state: "reviewed_without_labels",
      labels: [],
      message:
        "İşaretlenmiş alerjen bulunmuyor — içerikleri ve çapraz bulaşma riskini ayrıca kontrol edin.",
    };
  }
  return {
    state: "reviewed_with_labels",
    labels: reviewed.labels.map((slug) => ALLERGEN_LABELS[slug]),
    message: "İşaretlenenler:",
  };
}

export const CONTROLLED_ALLERGEN_LABELS = ALLERGEN_SLUGS.map((slug) => ALLERGEN_LABELS[slug]);
