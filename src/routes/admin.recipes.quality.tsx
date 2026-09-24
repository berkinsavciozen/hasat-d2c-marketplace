import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/hasat/common/SectionCard";
import { StatCard } from "@/components/hasat/common/StatCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ALLERGEN_OPTIONS, type AllergenSlug } from "@/lib/hasat/recipeFacts";
import { EQUIPMENT_LABELS } from "@/lib/hasat/recipes";
import { ADMIN_RECIPE_KEY_STORAGE } from "./admin.recipes";

export const Route = createFileRoute("/admin/recipes/quality")({
  head: () => ({
    meta: [
      { title: "Admin — Tarif Veri Kalitesi" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminRecipeQualityPage,
});

// -----------------------------------------------------------------------------------------------
// Types (mirrors supabase/functions/_shared/recipe-automation/admin/quality.ts response shapes)
// -----------------------------------------------------------------------------------------------

// DQ-2: backend artık her tarif için tutarlılık sorunları döndürüyor. Hepsi opsiyonel — eski
// backend'e karşı da ekran eskisi gibi çalışır.
type QualityIssue = {
  code: string;
  severity: "kritik" | "uyari" | "bilgi";
  message: string;
  ingredientId?: string;
  suggestion?: {
    addAllergen?: string;
    removeAllergen?: string;
    addDietTag?: string;
    removeDietTag?: string;
    setCrop?: string;
  };
};

type QualityListItem = {
  id: string;
  slug: string;
  title: string;
  status: string;
  visibility: string;
  createdAt: string;
  hasEquipment: boolean;
  nutritionComplete: boolean;
  nutritionSource: string | null;
  nutritionCoveragePct: number | null;
  allergensReviewed: boolean;
  ingredientCount: number;
  unresolvedIngredientCount: number;
  qualityIssues?: QualityIssue[];
  criticalIssueCount?: number;
  warningIssueCount?: number;
  issueCount?: number;
};

type ListResponse = { recipes: QualityListItem[]; total: number };

type QualityIngredient = {
  id: string;
  sortOrder: number;
  crop: string | null;
  freeTextName: string | null;
  quantity: number | null;
  unit: string | null;
  nutritionFoodKey: string | null;
  nutritionExclusionReason: string | null;
  note?: string | null;
  ingredientClass?: string | null;
};

type FoodKeyOption = { foodKey: string; displayName: string };

type QualityDetail = {
  nutritionFoodKeyOptions: FoodKeyOption[];
  recipe: {
    id: string;
    slug: string;
    title: string;
    servings: number | null;
    allergenLabels: string[] | null;
    allergensReviewed: boolean;
    allergensReviewedAt: string | null;
    requiredEquipment: string[] | null;
    dietTags: string[];
    nutritionSource: string | null;
    nutritionCoveragePct: number | null;
    nutritionCalculatedAt: string | null;
    nutritionWarnings: string[];
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    fiberG: number | null;
    prepMinutes?: number | null;
    cookMinutes?: number | null;
    restMinutes?: number | null;
    coverPhotoUrl?: string | null;
  };
  ingredients: QualityIngredient[];
  issues?: QualityIssue[];
};

type ListMode = "incomplete" | "issues" | "all";

const LIST_MODES: { value: ListMode; label: string }[] = [
  { value: "incomplete", label: "Eksik veya hatalı" },
  { value: "issues", label: "Yalnız tutarsızlıklar" },
  { value: "all", label: "Tümü" },
];

const EQUIPMENT_SLUGS = Object.keys(EQUIPMENT_LABELS);

const EXCLUSION_REASON_LABELS: Record<string, string> = {
  serving_only_unquantified: "Sadece servis (miktarsız)",
  seasoning_to_taste_unquantified: "Tada göre baharat (miktarsız)",
  trace_flavoring_unquantified: "İz miktarda lezzetlendirici (miktarsız)",
};
const EXCLUSION_REASONS = Object.keys(EXCLUSION_REASON_LABELS);

function functionErrorMessage(error: unknown): string {
  const anyErr = error as { context?: { status?: number }; status?: number; message?: string };
  const status = anyErr.context?.status ?? anyErr.status;
  if (status === 401 || status === 403) return "Hatalı anahtar";
  return `Hata: ${anyErr.message ?? "bilinmiyor"}`;
}

// -----------------------------------------------------------------------------------------------

function AdminRecipeQualityPage() {
  const [key, setKey] = useState("");
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const [mode, setMode] = useState<ListMode>("incomplete");
  const [search, setSearch] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const stored = sessionStorage.getItem(ADMIN_RECIPE_KEY_STORAGE);
    if (stored) setSubmittedKey(stored);
  }, []);

  const logout = () => {
    sessionStorage.removeItem(ADMIN_RECIPE_KEY_STORAGE);
    setSubmittedKey(null);
    setKey("");
  };

  type InvokeMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  type InvokeBody = Record<string, unknown>;

  const invoke = async (path: string, options: { method: InvokeMethod; body?: InvokeBody }) => {
    if (!submittedKey) throw new Error("Oturum yok");
    const { data, error } = await supabase.functions.invoke(`admin-recipe-quality${path}`, {
      method: options.method,
      headers: { "x-admin-key": submittedKey, "content-type": "application/json" },
      body: options.body,
    });
    if (error) throw error;
    return data;
  };

  const listQuery = useQuery({
    queryKey: ["admin-recipe-quality", submittedKey, mode],
    enabled: !!submittedKey,
    retry: false,
    queryFn: async (): Promise<ListResponse> => {
      try {
        return (await invoke(`?mode=${mode}`, { method: "GET" })) as ListResponse;
      } catch (error) {
        toast.error(functionErrorMessage(error));
        const anyErr = error as { context?: { status?: number }; status?: number };
        const status = anyErr.context?.status ?? anyErr.status;
        if (status === 401 || status === 403) logout();
        throw error;
      }
    },
  });

  const detailQuery = useQuery({
    queryKey: ["admin-recipe-quality-detail", submittedKey, selectedRecipeId],
    enabled: !!submittedKey && !!selectedRecipeId,
    retry: false,
    queryFn: async (): Promise<QualityDetail> => {
      try {
        return (await invoke(`/${selectedRecipeId}`, { method: "GET" })) as QualityDetail;
      } catch (error) {
        toast.error(functionErrorMessage(error));
        throw error;
      }
    },
  });

  const refreshAfterSave = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-recipe-quality"] });
    queryClient.invalidateQueries({ queryKey: ["admin-recipe-quality-detail", submittedKey, selectedRecipeId] });
  };

  if (!submittedKey || listQuery.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!key.trim()) return;
            sessionStorage.setItem(ADMIN_RECIPE_KEY_STORAGE, key.trim());
            setSubmittedKey(key.trim());
          }}
          className="w-full max-w-sm rounded-2xl border bg-card p-6 space-y-4"
        >
          <h1 className="font-serif text-xl">Admin — Tarif Veri Kalitesi</h1>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Anahtar"
            autoFocus
            className="w-full rounded-lg border px-3 py-2 text-sm bg-background"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium"
          >
            Gir
          </button>
        </form>
      </div>
    );
  }

  const allRecipes = listQuery.data?.recipes ?? [];
  const missingEquipmentCount = allRecipes.filter((r) => !r.hasEquipment).length;
  const missingNutritionCount = allRecipes.filter((r) => !r.nutritionComplete).length;
  const unreviewedAllergensCount = allRecipes.filter((r) => !r.allergensReviewed).length;
  const criticalRecipesCount = allRecipes.filter((r) => (r.criticalIssueCount ?? 0) > 0).length;
  const warningRecipesCount = allRecipes.filter((r) => (r.warningIssueCount ?? 0) > 0).length;

  const searchTerm = search.trim().toLocaleLowerCase("tr");
  const recipes = allRecipes
    .filter((r) => !searchTerm || r.title.toLocaleLowerCase("tr").includes(searchTerm) || r.slug.includes(searchTerm))
    .sort((a, b) => {
      const crit = (b.criticalIssueCount ?? 0) - (a.criticalIssueCount ?? 0);
      if (crit !== 0) return crit;
      const warn = (b.warningIssueCount ?? 0) - (a.warningIssueCount ?? 0);
      if (warn !== 0) return warn;
      return b.createdAt.localeCompare(a.createdAt);
    });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl">Tarif Veri Kalitesi</h1>
            <p className="text-xs text-hmuted mt-1">Yayınlanan katalog — ekipman/besin/alerjen tamlığı ve tutarlılık</p>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/admin/recipes" className="text-xs text-hmuted underline">
              İş Listesi
            </Link>
            <button onClick={logout} className="text-xs text-hmuted underline">
              Çıkış
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Ekipman eksik" accent="saffron" value={missingEquipmentCount} />
          <StatCard label="Besin değeri eksik" accent="hred" value={missingNutritionCount} />
          <StatCard label="Alerjen incelenmemiş" accent="gold" value={unreviewedAllergensCount} />
          <StatCard label="Kritik tutarsızlık" accent="hred" value={criticalRecipesCount} />
          <StatCard label="Uyarı" accent="saffron" value={warningRecipesCount} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border p-0.5">
            {LIST_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === m.value ? "bg-primary text-primary-foreground" : "text-hmuted hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Başlıkta ara…"
            className="text-sm max-w-[240px]"
          />
        </div>

        <SectionCard title="Tarifler">
          {listQuery.isLoading ? (
            <div className="py-8 text-center text-sm text-hmuted">Yükleniyor…</div>
          ) : recipes.length === 0 ? (
            <div className="py-8 text-center text-sm text-hmuted">Kayıt yok</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-hmuted">
                  <tr className="border-b">
                    <th className="text-left py-2 pr-3">Başlık</th>
                    <th className="text-left py-2 px-3">Ekipman</th>
                    <th className="text-left py-2 px-3">Besin</th>
                    <th className="text-left py-2 px-3">Alerjen</th>
                    <th className="text-left py-2 px-3">Tutarsızlık</th>
                    <th className="text-right py-2 pl-3">Malzeme</th>
                  </tr>
                </thead>
                <tbody>
                  {recipes.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedRecipeId(r.id)}
                      className={cn(
                        "border-b last:border-0 hover:bg-muted/40 cursor-pointer",
                        selectedRecipeId === r.id && "bg-muted/60",
                      )}
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs text-hmuted font-mono">{r.slug}</div>
                      </td>
                      <td className="py-2 px-3">
                        <QualityBadge ok={r.hasEquipment} okLabel="Var" badLabel="Eksik" />
                      </td>
                      <td className="py-2 px-3">
                        <QualityBadge
                          ok={r.nutritionComplete}
                          okLabel="Tam"
                          badLabel={r.nutritionCoveragePct != null ? `%${r.nutritionCoveragePct}` : "Yok"}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <QualityBadge ok={r.allergensReviewed} okLabel="İncelendi" badLabel="Bekliyor" />
                      </td>
                      <td className="py-2 px-3">
                        <IssueCountBadges critical={r.criticalIssueCount ?? 0} warning={r.warningIssueCount ?? 0} />
                      </td>
                      <td className="text-right py-2 pl-3 font-mono text-xs">
                        {r.ingredientCount}
                        {r.unresolvedIngredientCount > 0 && (
                          <span className="text-[color:var(--hred)]"> ({r.unresolvedIngredientCount} çözümsüz)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {selectedRecipeId && (
          <RecipeQualityDetailPanel
            recipeId={selectedRecipeId}
            detail={detailQuery.data}
            isLoading={detailQuery.isLoading}
            invoke={invoke}
            onSaved={refreshAfterSave}
            onClose={() => setSelectedRecipeId(null)}
          />
        )}
      </div>
    </div>
  );
}

function QualityBadge({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-xs",
        ok
          ? "bg-[color-mix(in_oklab,var(--sage)_20%,transparent)] text-[color:var(--sage)]"
          : "bg-[color-mix(in_oklab,var(--hred)_15%,transparent)] text-[color:var(--hred)]",
      )}
    >
      {ok ? okLabel : badLabel}
    </span>
  );
}

function IssueCountBadges({ critical, warning }: { critical: number; warning: number }) {
  if (critical === 0 && warning === 0) return <span className="text-xs text-hmuted">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {critical > 0 && (
        <span className="inline-block rounded-full px-2 py-0.5 text-xs bg-[color-mix(in_oklab,var(--hred)_15%,transparent)] text-[color:var(--hred)]">
          {critical} kritik
        </span>
      )}
      {warning > 0 && (
        <span className="inline-block rounded-full px-2 py-0.5 text-xs bg-[color-mix(in_oklab,var(--saffron)_20%,transparent)] text-[color:var(--saffron)]">
          {warning} uyarı
        </span>
      )}
    </span>
  );
}

// -----------------------------------------------------------------------------------------------
// Detail panel — issues / meta / allergens / facts / nutrition ingredients + recalculate
// -----------------------------------------------------------------------------------------------

function RecipeQualityDetailPanel({
  recipeId,
  detail,
  isLoading,
  invoke,
  onSaved,
  onClose,
}: {
  recipeId: string;
  detail: QualityDetail | undefined;
  isLoading: boolean;
  invoke: (
    path: string,
    options: {
      method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
      body?: Record<string, unknown>;
    },
  ) => Promise<unknown>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const allergensMutation = useMutation({
    mutationFn: (body: { allergenLabels: string[]; reviewed: boolean }) =>
      invoke(`/${recipeId}/allergens`, { method: "PATCH", body }),
    onSuccess: () => {
      toast.success("Alerjenler kaydedildi");
      onSaved();
    },
    onError: (error) => toast.error(functionErrorMessage(error)),
  });

  const factsMutation = useMutation({
    mutationFn: (body: { requiredEquipment: string[]; dietTags: string[] }) =>
      invoke(`/${recipeId}/facts`, { method: "PATCH", body }),
    onSuccess: () => {
      toast.success("Ekipman/diyet etiketleri kaydedildi");
      onSaved();
    },
    onError: (error) => toast.error(functionErrorMessage(error)),
  });

  const metaMutation = useMutation({
    mutationFn: (body: { servings: number; prepMinutes: number | null; cookMinutes: number | null; restMinutes: number | null }) =>
      invoke(`/${recipeId}/meta`, { method: "PATCH", body }),
    onSuccess: () => {
      toast.success("Tarif bilgileri kaydedildi");
      onSaved();
    },
    onError: (error) => toast.error(functionErrorMessage(error)),
  });

  const ingredientMutation = useMutation({
    mutationFn: ({ ingredientId, body }: { ingredientId: string; body: Record<string, unknown> }) =>
      invoke(`/${recipeId}/ingredients/${ingredientId}`, { method: "PATCH", body }),
    onSuccess: () => {
      toast.success("Malzeme kaydedildi (besin değeri otomatik yeniden hesaplandı)");
      onSaved();
    },
    onError: (error) => toast.error(functionErrorMessage(error)),
  });

  const recalcMutation = useMutation({
    mutationFn: () => invoke(`/${recipeId}/recalculate-nutrition`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Besin değeri yeniden hesaplandı");
      onSaved();
    },
    onError: (error) => toast.error(functionErrorMessage(error)),
  });

  // Öneri uygulama sinyalleri: "Öneriyi uygula" ilgili formun state'ini günceller, kaydetmez.
  const [allergenSuggestion, setAllergenSuggestion] = useState<{ add?: string; remove?: string; nonce: number } | null>(null);
  const [dietTagSuggestion, setDietTagSuggestion] = useState<{ add?: string; remove?: string; nonce: number } | null>(null);
  const [cropSuggestion, setCropSuggestion] = useState<{ ingredientId: string; crop: string; nonce: number } | null>(null);
  const [highlightedIngredientId, setHighlightedIngredientId] = useState<string | null>(null);

  if (isLoading || !detail) {
    return (
      <SectionCard title="Tarif Detayı">
        <div className="py-8 text-center text-sm text-hmuted">Yükleniyor…</div>
      </SectionCard>
    );
  }

  const r = detail.recipe;
  const issues = detail.issues ?? [];
  const hasCoverNotHero = issues.some((i) => i.code === "COVER_NOT_HERO");

  const applySuggestion = (issue: QualityIssue) => {
    const s = issue.suggestion;
    if (!s) return;
    if (s.addAllergen || s.removeAllergen) {
      setAllergenSuggestion({ add: s.addAllergen, remove: s.removeAllergen, nonce: Date.now() });
    }
    if (s.addDietTag || s.removeDietTag) {
      setDietTagSuggestion({ add: s.addDietTag, remove: s.removeDietTag, nonce: Date.now() });
    }
    if (s.setCrop && issue.ingredientId) {
      setCropSuggestion({ ingredientId: issue.ingredientId, crop: s.setCrop, nonce: Date.now() });
    }
    toast.success("Öneri forma uygulandı — kaydetmek için ilgili bölümün Kaydet butonunu kullanın");
  };

  const scrollToIngredient = (ingredientId: string) => {
    setHighlightedIngredientId(ingredientId);
    document.getElementById(`ing-${ingredientId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-lg">{r.title}</h2>
        <button onClick={onClose} className="text-xs text-hmuted underline">
          Kapat
        </button>
      </div>

      {r.coverPhotoUrl && (
        <SectionCard title="Kapak Önizlemesi">
          <div className="relative w-full max-w-md overflow-hidden rounded-lg border" style={{ aspectRatio: "16 / 9" }}>
            <img src={r.coverPhotoUrl} alt={r.title} className="h-full w-full object-cover" />
            {hasCoverNotHero && (
              <span className="absolute left-2 top-2 rounded-full bg-[color-mix(in_oklab,var(--saffron)_90%,transparent)] px-2 py-0.5 text-xs font-medium text-white">
                kapak 16:9 değil
              </span>
            )}
          </div>
        </SectionCard>
      )}

      {issues.length > 0 && (
        <IssuesSection issues={issues} onApplySuggestion={applySuggestion} onShowIngredient={scrollToIngredient} />
      )}

      <MetaSection
        servings={r.servings}
        prepMinutes={r.prepMinutes ?? null}
        cookMinutes={r.cookMinutes ?? null}
        restMinutes={r.restMinutes ?? null}
        isSaving={metaMutation.isPending}
        onSave={(body) => metaMutation.mutate(body)}
      />

      <AllergenSection
        initialLabels={(r.allergenLabels ?? []) as AllergenSlug[]}
        initialReviewed={r.allergensReviewed}
        suggestion={allergenSuggestion}
        isSaving={allergensMutation.isPending}
        onSave={(labels, reviewed) => allergensMutation.mutate({ allergenLabels: labels, reviewed })}
      />

      <FactsSection
        initialEquipment={r.requiredEquipment ?? []}
        initialDietTags={r.dietTags}
        suggestion={dietTagSuggestion}
        isSaving={factsMutation.isPending}
        onSave={(equipment, dietTags) => factsMutation.mutate({ requiredEquipment: equipment, dietTags })}
      />

      <SectionCard
        title="Besin Değeri"
        action={
          <Button size="sm" variant="secondary" disabled={recalcMutation.isPending} onClick={() => recalcMutation.mutate()}>
            Yeniden hesapla
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-hmuted">
            <span>Kaynak: {r.nutritionSource ?? "—"}</span>
            <span>Kapsam: {r.nutritionCoveragePct != null ? `%${r.nutritionCoveragePct}` : "—"}</span>
            <span>
              Kalori/Protein/Karb/Yağ: {r.calories ?? "—"} / {r.proteinG ?? "—"} / {r.carbsG ?? "—"} / {r.fatG ?? "—"}
            </span>
            {r.nutritionCalculatedAt && (
              <span>Son hesaplama: {new Date(r.nutritionCalculatedAt).toLocaleString("tr-TR")}</span>
            )}
          </div>
          {r.nutritionWarnings.length > 0 && (
            <div className="text-xs text-[color:var(--saffron)]">Uyarılar: {r.nutritionWarnings.join(", ")}</div>
          )}

          <div className="space-y-3">
            {detail.ingredients.map((ing) => (
              <IngredientRow
                key={ing.id}
                ingredient={ing}
                foodKeyOptions={detail.nutritionFoodKeyOptions}
                isSaving={ingredientMutation.isPending}
                highlighted={highlightedIngredientId === ing.id}
                cropSuggestion={cropSuggestion?.ingredientId === ing.id ? cropSuggestion : null}
                onSave={(body) => ingredientMutation.mutate({ ingredientId: ing.id, body })}
              />
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// -----------------------------------------------------------------------------------------------
// DQ-2: Veri tutarlılığı — severity'ye göre sorun satırları; bilgi seviyesi katlanır
// -----------------------------------------------------------------------------------------------

const SEVERITY_STYLES: Record<QualityIssue["severity"], string> = {
  kritik: "text-[color:var(--hred)]",
  uyari: "text-[color:var(--saffron)]",
  bilgi: "text-hmuted",
};

const SEVERITY_DOT: Record<QualityIssue["severity"], string> = {
  kritik: "bg-[color:var(--hred)]",
  uyari: "bg-[color:var(--saffron)]",
  bilgi: "bg-[color:var(--info,var(--hmuted))]",
};

function IssuesSection({
  issues,
  onApplySuggestion,
  onShowIngredient,
}: {
  issues: QualityIssue[];
  onApplySuggestion: (issue: QualityIssue) => void;
  onShowIngredient: (ingredientId: string) => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const visible = issues.filter((i) => i.severity !== "bilgi");
  const infoIssues = issues.filter((i) => i.severity === "bilgi");

  const renderIssue = (issue: QualityIssue, idx: number) => (
    <li
      key={`${issue.code}-${idx}`}
      className={cn("flex flex-wrap items-center gap-2 text-xs", issue.ingredientId && "cursor-pointer")}
      onClick={() => issue.ingredientId && onShowIngredient(issue.ingredientId)}
    >
      <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", SEVERITY_DOT[issue.severity])} />
      <span className={SEVERITY_STYLES[issue.severity]}>{issue.message}</span>
      {issue.suggestion && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[11px]"
          onClick={(e) => {
            e.stopPropagation();
            onApplySuggestion(issue);
          }}
        >
          Öneriyi uygula
        </Button>
      )}
    </li>
  );

  return (
    <SectionCard title="Veri tutarlılığı">
      <ul className="space-y-2">{visible.map(renderIssue)}</ul>
      {infoIssues.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowInfo((v) => !v)} className="text-xs text-hmuted underline">
            {showInfo ? "Diğer notları gizle" : `Diğer notlar (${infoIssues.length})`}
          </button>
          {showInfo && <ul className="mt-2 space-y-2">{infoIssues.map(renderIssue)}</ul>}
        </div>
      )}
    </SectionCard>
  );
}

// -----------------------------------------------------------------------------------------------
// DQ-2: Tarif bilgileri — porsiyon + süreler, PATCH /meta
// -----------------------------------------------------------------------------------------------

function MetaSection({
  servings,
  prepMinutes,
  cookMinutes,
  restMinutes,
  isSaving,
  onSave,
}: {
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  restMinutes: number | null;
  isSaving: boolean;
  onSave: (body: { servings: number; prepMinutes: number | null; cookMinutes: number | null; restMinutes: number | null }) => void;
}) {
  const [servingsStr, setServingsStr] = useState(servings != null ? String(servings) : "");
  const [prepStr, setPrepStr] = useState(prepMinutes != null ? String(prepMinutes) : "");
  const [cookStr, setCookStr] = useState(cookMinutes != null ? String(cookMinutes) : "");
  const [restStr, setRestStr] = useState(restMinutes != null ? String(restMinutes) : "");

  useEffect(() => {
    setServingsStr(servings != null ? String(servings) : "");
    setPrepStr(prepMinutes != null ? String(prepMinutes) : "");
    setCookStr(cookMinutes != null ? String(cookMinutes) : "");
    setRestStr(restMinutes != null ? String(restMinutes) : "");
  }, [servings, prepMinutes, cookMinutes, restMinutes]);

  const parseMinutes = (v: string): number | null | undefined => {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isInteger(n) && n >= 0 ? n : undefined;
  };

  const save = () => {
    const servingsNum = Number(servingsStr);
    if (!Number.isInteger(servingsNum) || servingsNum <= 0) {
      toast.error("Porsiyon pozitif tam sayı olmalı");
      return;
    }
    const prep = parseMinutes(prepStr);
    const cook = parseMinutes(cookStr);
    const rest = parseMinutes(restStr);
    if (prep === undefined || cook === undefined || rest === undefined) {
      toast.error("Süreler boş ya da negatif olmayan tam sayı olmalı");
      return;
    }
    onSave({ servings: servingsNum, prepMinutes: prep, cookMinutes: cook, restMinutes: rest });
  };

  return (
    <SectionCard title="Tarif bilgileri">
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label className="text-xs text-hmuted">Porsiyon</label>
            <Input type="number" min={1} value={servingsStr} onChange={(e) => setServingsStr(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className="text-xs text-hmuted">Hazırlık (dk)</label>
            <Input type="number" min={0} value={prepStr} onChange={(e) => setPrepStr(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className="text-xs text-hmuted">Pişirme (dk)</label>
            <Input type="number" min={0} value={cookStr} onChange={(e) => setCookStr(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className="text-xs text-hmuted">Dinlenme (dk)</label>
            <Input type="number" min={0} value={restStr} onChange={(e) => setRestStr(e.target.value)} className="text-sm" />
          </div>
        </div>
        <p className="text-xs text-hmuted">Porsiyon değişince besin değeri kaydettikten sonra yeniden hesaplanır.</p>
        <Button size="sm" disabled={isSaving} onClick={save}>
          Kaydet
        </Button>
      </div>
    </SectionCard>
  );
}

function AllergenSection({
  initialLabels,
  initialReviewed,
  suggestion,
  isSaving,
  onSave,
}: {
  initialLabels: AllergenSlug[];
  initialReviewed: boolean;
  suggestion: { add?: string; remove?: string; nonce: number } | null;
  isSaving: boolean;
  onSave: (labels: string[], reviewed: boolean) => void;
}) {
  const [labels, setLabels] = useState<Set<string>>(new Set(initialLabels));
  const [reviewed, setReviewed] = useState(initialReviewed);

  useEffect(() => {
    setLabels(new Set(initialLabels));
    setReviewed(initialReviewed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLabels.join(","), initialReviewed]);

  useEffect(() => {
    if (!suggestion) return;
    setLabels((prev) => {
      const next = new Set(prev);
      if (suggestion.add) next.add(suggestion.add);
      if (suggestion.remove) next.delete(suggestion.remove);
      return next;
    });
  }, [suggestion]);

  return (
    <SectionCard title="Alerjen">
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ALLERGEN_OPTIONS.map((opt) => (
            <label key={opt.slug} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={labels.has(opt.slug)}
                onCheckedChange={(v) => {
                  setLabels((prev) => {
                    const next = new Set(prev);
                    if (v === true) next.add(opt.slug);
                    else next.delete(opt.slug);
                    return next;
                  });
                }}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
          <Checkbox checked={reviewed} onCheckedChange={(v) => setReviewed(v === true)} />
          İncelendi
        </label>
        <Button size="sm" disabled={isSaving} onClick={() => onSave(Array.from(labels), reviewed)}>
          Kaydet
        </Button>
      </div>
    </SectionCard>
  );
}

function FactsSection({
  initialEquipment,
  initialDietTags,
  suggestion,
  isSaving,
  onSave,
}: {
  initialEquipment: string[];
  initialDietTags: string[];
  suggestion: { add?: string; remove?: string; nonce: number } | null;
  isSaving: boolean;
  onSave: (equipment: string[], dietTags: string[]) => void;
}) {
  const [equipment, setEquipment] = useState<Set<string>>(new Set(initialEquipment));
  const [dietTags, setDietTags] = useState<string[]>(initialDietTags);
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    setEquipment(new Set(initialEquipment));
    setDietTags(initialDietTags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEquipment.join(","), initialDietTags.join(",")]);

  useEffect(() => {
    if (!suggestion) return;
    setDietTags((prev) => {
      let next = prev;
      if (suggestion.remove) next = next.filter((t) => t !== suggestion.remove);
      if (suggestion.add && !next.includes(suggestion.add)) next = [...next, suggestion.add];
      return next;
    });
  }, [suggestion]);

  const addTag = () => {
    const t = newTag.trim();
    if (!t || dietTags.includes(t)) return;
    setDietTags((prev) => [...prev, t]);
    setNewTag("");
  };

  return (
    <SectionCard title="Ekipman / Diyet Etiketleri">
      <div className="space-y-4">
        <div>
          <div className="text-xs font-medium text-hmuted mb-2">Gerekli ekipman</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {EQUIPMENT_SLUGS.map((slug) => (
              <label key={slug} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={equipment.has(slug)}
                  onCheckedChange={(v) => {
                    setEquipment((prev) => {
                      const next = new Set(prev);
                      if (v === true) next.add(slug);
                      else next.delete(slug);
                      return next;
                    });
                  }}
                />
                {EQUIPMENT_LABELS[slug]}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-hmuted mb-2">Diyet etiketleri</div>
          <div className="flex flex-wrap gap-2 mb-2">
            {dietTags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                {tag}
                <button
                  type="button"
                  onClick={() => setDietTags((prev) => prev.filter((t) => t !== tag))}
                  className="text-hmuted hover:text-foreground"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Örn. vejetaryen"
              className="text-sm max-w-[200px]"
            />
            <Button type="button" size="sm" variant="outline" onClick={addTag}>
              Ekle
            </Button>
          </div>
        </div>

        <Button size="sm" disabled={isSaving} onClick={() => onSave(Array.from(equipment), dietTags)}>
          Kaydet
        </Button>
      </div>
    </SectionCard>
  );
}

function IngredientRow({
  ingredient,
  foodKeyOptions,
  isSaving,
  highlighted,
  cropSuggestion,
  onSave,
}: {
  ingredient: QualityIngredient;
  foodKeyOptions: FoodKeyOption[];
  isSaving: boolean;
  highlighted: boolean;
  cropSuggestion: { crop: string; nonce: number } | null;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [crop, setCrop] = useState(ingredient.crop ?? "");
  const [freeTextName, setFreeTextName] = useState(ingredient.freeTextName ?? "");
  const [quantity, setQuantity] = useState(ingredient.quantity != null ? String(ingredient.quantity) : "");
  const [unit, setUnit] = useState(ingredient.unit ?? "");
  const [nutritionFoodKey, setNutritionFoodKey] = useState(ingredient.nutritionFoodKey ?? "");
  const [nutritionExclusionReason, setNutritionExclusionReason] = useState(ingredient.nutritionExclusionReason ?? "");
  const [note, setNote] = useState(ingredient.note ?? "");
  const [foodKeyOpen, setFoodKeyOpen] = useState(false);

  useEffect(() => {
    if (cropSuggestion) setCrop(cropSuggestion.crop);
  }, [cropSuggestion]);

  const selectedFoodKeyLabel = useMemo(
    () => foodKeyOptions.find((o) => o.foodKey === nutritionFoodKey)?.displayName,
    [foodKeyOptions, nutritionFoodKey],
  );

  const save = () => {
    onSave({
      crop: crop.trim() || null,
      freeTextName: freeTextName.trim() || null,
      quantity: quantity.trim() === "" ? null : Number(quantity),
      unit: unit.trim() || null,
      nutritionFoodKey: nutritionFoodKey || null,
      // A food key and an exclusion reason can never both be set (recipe_ingredients' own CHECK) —
      // picking a food key clears any exclusion reason client-side too, so Save can't submit both.
      nutritionExclusionReason: nutritionFoodKey ? null : (nutritionExclusionReason || null),
      note: note.trim() || null,
    });
  };

  return (
    <div
      id={`ing-${ingredient.id}`}
      className={cn(
        "rounded-lg border p-3 space-y-2 transition-shadow",
        highlighted && "ring-2 ring-[color:var(--saffron)]",
      )}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="text-xs text-hmuted">Crop (slug)</label>
          <Input value={crop} onChange={(e) => setCrop(e.target.value)} className="text-sm" />
        </div>
        <div>
          <label className="text-xs text-hmuted">Serbest metin adı</label>
          <Input value={freeTextName} onChange={(e) => setFreeTextName(e.target.value)} className="text-sm" />
        </div>
        <div>
          <label className="text-xs text-hmuted">Miktar</label>
          <Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="text-sm" />
        </div>
        <div>
          <label className="text-xs text-hmuted">Birim</label>
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} className="text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-hmuted block mb-1">Besin referansı (nutrition_food_key)</label>
          <Popover open={foodKeyOpen} onOpenChange={setFoodKeyOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={foodKeyOpen}
                className="w-full justify-between text-sm font-normal"
              >
                {nutritionFoodKey ? (selectedFoodKeyLabel ?? nutritionFoodKey) : "— seçilmedi —"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
              <Command>
                <CommandInput placeholder="Ara…" />
                <CommandList>
                  <CommandEmpty>Bulunamadı</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__none__"
                      onSelect={() => {
                        setNutritionFoodKey("");
                        setFoodKeyOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", nutritionFoodKey === "" ? "opacity-100" : "opacity-0")} />
                      — seçilmedi —
                    </CommandItem>
                    {foodKeyOptions.map((opt) => (
                      <CommandItem
                        key={opt.foodKey}
                        value={`${opt.displayName} ${opt.foodKey}`}
                        onSelect={() => {
                          setNutritionFoodKey(opt.foodKey);
                          setNutritionExclusionReason("");
                          setFoodKeyOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", nutritionFoodKey === opt.foodKey ? "opacity-100" : "opacity-0")} />
                        {opt.displayName}
                        <span className="ml-2 text-xs text-hmuted font-mono">{opt.foodKey}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <label className="text-xs text-hmuted block mb-1">Hariç tutma nedeni (nutrition_exclusion_reason)</label>
          <select
            value={nutritionExclusionReason}
            onChange={(e) => {
              setNutritionExclusionReason(e.target.value);
              if (e.target.value) setNutritionFoodKey("");
            }}
            disabled={!!nutritionFoodKey}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-background disabled:opacity-50"
          >
            <option value="">— seçilmedi —</option>
            {EXCLUSION_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {EXCLUSION_REASON_LABELS[reason]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-hmuted">Not</label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} className="text-sm" placeholder="Örn. damak tadına göre" />
      </div>

      <div className="flex justify-end">
        <Button size="sm" disabled={isSaving} onClick={save}>
          Kaydet
        </Button>
      </div>
    </div>
  );
}
