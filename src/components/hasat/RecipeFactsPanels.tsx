import {
  formatNutritionNumber,
  scaleNutrition,
  type AllergenPresentation,
  type NutritionPresentation,
  type NutritionValues,
} from "@/lib/hasat/recipeDetailPresentation";

const NUTRIENTS: Array<{
  key: keyof NutritionValues;
  label: string;
  unit: "kcal" | "g";
}> = [
  { key: "caloriesKcal", label: "Kalori", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "carbsG", label: "Karbonhidrat", unit: "g" },
  { key: "fatG", label: "Yağ", unit: "g" },
  { key: "fiberG", label: "Lif", unit: "g" },
];

function NutritionGrid({
  values,
  label,
  announce = false,
}: {
  values: NutritionValues;
  label: string;
  announce?: boolean;
}) {
  return (
    <div aria-live={announce ? "polite" : undefined} aria-atomic={announce ? "true" : undefined}>
      <h3 className="text-sm font-semibold">{label}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {NUTRIENTS.map((nutrient) => {
          const value = values[nutrient.key];
          return (
            <div key={nutrient.key} className="min-w-0 rounded-lg bg-background/70 p-2.5">
              <dt className="break-words text-[11px] text-hmuted">{nutrient.label}</dt>
              <dd className="mt-0.5 break-words text-sm font-semibold tabular-nums">
                {value === null ? "Bilgi yok" : `${formatNutritionNumber(value)} ${nutrient.unit}`}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function NutritionPanel({
  model,
  servings,
}: {
  model: NutritionPresentation;
  servings: number;
}) {
  return (
    <section className="space-y-3" aria-labelledby="nutrition-heading">
      <h2
        id="nutrition-heading"
        className="text-xs font-medium uppercase tracking-wider text-hmuted"
      >
        Besin değerleri
      </h2>
      <div className="min-w-0 space-y-4 rounded-xl border bg-card p-4">
        {model.state === "unavailable" ? (
          <p className="text-sm text-hmuted">{model.message}</p>
        ) : (
          <>
            <NutritionGrid values={model.perServing} label="1 porsiyon için" />
            {servings > 1 && (
              <NutritionGrid
                values={scaleNutrition(model.perServing, servings)}
                label={`${servings} porsiyon toplamı`}
                announce
              />
            )}
            <p className="break-words text-xs text-hmuted">{model.explanation}</p>
          </>
        )}
        <p className="break-words border-t pt-3 text-[11px] text-hmuted">
          Tahmini besin değerleridir; tıbbi veya diyetetik tavsiye değildir.
        </p>
      </div>
    </section>
  );
}

export function AllergenPanel({ model }: { model: AllergenPresentation }) {
  return (
    <section className="space-y-3" aria-labelledby="allergen-heading">
      <h2
        id="allergen-heading"
        className="text-xs font-medium uppercase tracking-wider text-hmuted"
      >
        Alerjen ve hassasiyet bilgisi
      </h2>
      <div className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
        <p className="break-words text-sm">{model.message}</p>
        {model.state === "reviewed_with_labels" && (
          <ul className="flex flex-wrap gap-2" aria-label="İşaretlenen alerjenler">
            {model.labels.map((label) => (
              <li
                key={label}
                className="max-w-full break-words rounded-full border px-2.5 py-1 text-xs font-medium"
              >
                {label}
              </li>
            ))}
          </ul>
        )}
        <p className="break-words border-t pt-3 text-[11px] text-hmuted">
          Bu bilgi tıbbi tavsiye değildir. Ürün etiketlerini ve mutfaktaki çapraz bulaşma riskini
          ayrıca kontrol edin.
        </p>
      </div>
    </section>
  );
}
