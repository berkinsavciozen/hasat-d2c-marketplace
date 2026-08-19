import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Clock, Filter, AlarmClock } from "lucide-react";
import {
  fetchRecipeList,
  formatTotalMinutes,
  totalRecipeMinutes,
  activeRecipeMinutes,
  needsAdvanceStart,
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
  type RecipeListItem,
} from "@/lib/hasat/recipes";
import { RepresentativePhoto } from "@/components/hasat/RepresentativePhoto";
import { MobileNudge } from "@/components/hasat/MobileNudge";
import { PUBLIC_BASE_URL } from "@/lib/hasat/constants";

const TITLE = "Tarifler | Hasat";
const DESCRIPTION =
  "Hasat'ın editoryal tarifleriyle mevsiminde, çiftçiden doğrudan malzeme kullanarak pişirin. Her tarifte hangi malzemenin Hasat'ta bulunabildiğini görün.";
const CANONICAL = `${PUBLIC_BASE_URL}/tarifler`;

export const Route = createFileRoute("/tarifler/")({
  loader: async () => {
    const recipes = await fetchRecipeList();
    return { recipes };
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: RecipeListPage,
});

const DURATION_BUCKETS = [
  { key: "30", label: "30 dk'dan az", max: 30 },
  { key: "60", label: "1 saate kadar", max: 60 },
  { key: "999", label: "1 saatten uzun", max: Infinity },
] as const;

function totalMinutes(r: RecipeListItem): number {
  return totalRecipeMinutes(r);
}

// Süre filtresi "aktif" süreye (hazırlık+pişirme) göre süzer, toplam süreye
// (dinlenme dahil) göre değil — bkz. activeRecipeMinutes yorumu. Rozet
// (needsAdvanceStart) filtrelenmeyen bekleme süresini ayrıca gösterir.
function filterMinutes(r: RecipeListItem): number {
  return activeRecipeMinutes(r);
}

function RecipeListPage() {
  const { recipes } = Route.useLoaderData();
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [duration, setDuration] = useState<(typeof DURATION_BUCKETS)[number]["key"] | null>(null);
  const [diet, setDiet] = useState<string | null>(null);
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [onlyWithAvailableIngredient, setOnlyWithAvailableIngredient] = useState(false);

  const toggleEquipment = (slug: string) => {
    setEquipment((prev) =>
      prev.includes(slug) ? prev.filter((e) => e !== slug) : [...prev, slug],
    );
  };

  const cuisines = useMemo(
    () => Array.from(new Set(recipes.map((r) => r.cuisine).filter((c): c is string => !!c))).sort(),
    [recipes],
  );
  const dietTags = useMemo(
    () => Array.from(new Set(recipes.flatMap((r) => r.diet_tags))).sort(),
    [recipes],
  );

  const filtered = recipes.filter((r) => {
    if (difficulty && r.difficulty !== difficulty) return false;
    if (cuisine && r.cuisine !== cuisine) return false;
    if (diet && !r.diet_tags.includes(diet)) return false;
    if (equipment.length > 0 && !equipment.every((e) => r.required_equipment.includes(e)))
      return false;
    if (duration) {
      const bucket = DURATION_BUCKETS.find((b) => b.key === duration)!;
      const prevMax =
        DURATION_BUCKETS[DURATION_BUCKETS.findIndex((b) => b.key === duration) - 1]?.max ?? 0;
      const mins = filterMinutes(r);
      if (!(mins > prevMax && mins <= bucket.max)) return false;
    }
    if (onlyWithAvailableIngredient && !((r.availableCount ?? 0) >= 1)) return false;
    return true;
  });

  return (
    <div className="min-h-screen pb-16">
      <header
        className="border-b px-4 py-5 md:px-8"
        style={{ background: "var(--dark)", color: "var(--hwhite)" }}
      >
        <Link to="/" className="text-xs opacity-70 hover:opacity-100">
          ← Hasat
        </Link>
        <h1 className="mt-2 font-serif text-2xl md:text-3xl">Tarifler</h1>
        <p className="mt-1 text-sm opacity-80">
          Mevsiminde, çiftçiden doğrudan malzemeyle pişirin.
        </p>
      </header>

      <div className="px-4 py-4 md:px-8 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 text-hmuted">
            <Filter className="h-3.5 w-3.5" /> Filtrele:
          </span>
          <select
            value={difficulty ?? ""}
            onChange={(e) => setDifficulty(e.target.value || null)}
            className="rounded-full border px-3 py-1.5 bg-card"
          >
            <option value="">Zorluk (hepsi)</option>
            {Object.entries(DIFFICULTY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={duration ?? ""}
            onChange={(e) => setDuration((e.target.value || null) as any)}
            className="rounded-full border px-3 py-1.5 bg-card"
          >
            <option value="">Süre (hepsi)</option>
            {DURATION_BUCKETS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          {dietTags.length > 0 && (
            <select
              value={diet ?? ""}
              onChange={(e) => setDiet(e.target.value || null)}
              className="rounded-full border px-3 py-1.5 bg-card"
            >
              <option value="">Diyet etiketi (hepsi)</option>
              {dietTags.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
          {cuisines.length > 1 && (
            <select
              value={cuisine ?? ""}
              onChange={(e) => setCuisine(e.target.value || null)}
              className="rounded-full border px-3 py-1.5 bg-card"
            >
              <option value="">Mutfak (hepsi)</option>
              {cuisines.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* F13-geniş: kontrollü ekipman listesi — dietTags/cuisine'in aksine
            veriden türetilmiyor (recipes.required_equipment henüz boş), sabit
            listeden render edilir ki filtre UI'ı veri dolmadan da kullanılabilir
            olsun. Çoklu seçim, diğer filtrelerle AND (üstteki `filtered`). */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-hmuted">Ekipman:</span>
          {Object.entries(EQUIPMENT_LABELS).map(([slug, label]) => {
            const active = equipment.includes(slug);
            return (
              <button
                key={slug}
                type="button"
                aria-pressed={active}
                onClick={() => toggleEquipment(slug)}
                className="rounded-full border px-3 py-1.5 transition"
                style={
                  active
                    ? { background: "color-mix(in oklab, var(--sage) 25%, transparent)" }
                    : undefined
                }
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* P23-M7-a: isim düzeltildi — bu filtre "tam alınabilir" değil, "en az bir
            malzemesi Hasat'ta" anlamına geliyor (gerçek isim, gerçek davranış).
            Gerçek "tam alınabilir" filtresi bugünkü arzda 0 tarif döner — bkz.
            Build/P23-Mobile.md → "Arz gerçeği ve 'Talep Et'". Fed by v_recipe_coverage. */}
        <label className="flex w-fit items-center gap-2 text-xs text-hmuted">
          <input
            type="checkbox"
            checked={onlyWithAvailableIngredient}
            onChange={(e) => setOnlyWithAvailableIngredient(e.target.checked)}
          />
          Malzemesi Hasat'ta olan tarifler
        </label>

        <MobileNudge text="Kitaptaki tarifi telefonla çekip defterine aktar — Hasat mobil uygulamasında" withInfoCta />

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-12 text-center text-hmuted">
            {onlyWithAvailableIngredient
              ? "Bu filtreyle eşleşen tarif yok — Hasat'taki arz henüz hiçbir malzemesini karşılamıyor."
              : equipment.length > 0
                ? "Bu ekipmanla eşleşen tarif yok."
                : "Bu filtrelerle eşleşen tarif yok."}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => (
              <Link
                key={r.id}
                to="/tarifler/$slug"
                params={{ slug: r.slug }}
                className="rounded-2xl border bg-card overflow-hidden hover:border-saffron transition"
              >
                <RepresentativePhoto
                  src={r.displayPhotoUrl}
                  isRepresentative={r.isRepresentativePhoto}
                  alt={r.title}
                  className="h-36 w-full"
                />
                <div className="p-3 space-y-1">
                  <div className="font-serif text-base leading-tight">{r.title}</div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-hmuted">
                    {totalMinutes(r) > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {formatTotalMinutes(totalMinutes(r))}
                      </span>
                    )}
                    {r.difficulty && (
                      <span>· {DIFFICULTY_LABELS[r.difficulty] ?? r.difficulty}</span>
                    )}
                    {r.cuisine && <span>· {r.cuisine}</span>}
                  </div>
                  {r.ingredientCount != null && r.availableCount != null && (
                    <div className="text-[11px] text-hmuted">
                      {r.ingredientCount} malzemeden {r.availableCount}'i Hasat'ta
                    </div>
                  )}
                  {needsAdvanceStart(r) && (
                    <div
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        background: "color-mix(in oklab, var(--gold) 25%, transparent)",
                      }}
                    >
                      <AlarmClock className="h-3 w-3" /> Önceden başlamak gerekir
                    </div>
                  )}
                  {r.diet_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {r.diet_tags.map((d) => (
                        <span
                          key={d}
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            background: "color-mix(in oklab, var(--sage) 25%, transparent)",
                          }}
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
