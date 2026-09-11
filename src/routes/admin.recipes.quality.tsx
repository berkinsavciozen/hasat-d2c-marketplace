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
  };
  ingredients: QualityIngredient[];
};

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
  const [onlyIncomplete, setOnlyIncomplete] = useState(true);
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

  const invoke = async (path: string, options: { method: string; body?: unknown }) => {
    const { data, error } = await supabase.functions.invoke(`admin-recipe-quality${path}`, {
      method: options.method,
      headers: { "x-admin-key": submittedKey!, "content-type": "application/json" },
      body: options.body,
    });
    if (error) throw error;
    return data;
  };

  const listQuery = useQuery({
    queryKey: ["admin-recipe-quality", submittedKey, onlyIncomplete],
    enabled: !!submittedKey,
    retry: false,
    queryFn: async (): Promise<ListResponse> => {
      try {
        return (await invoke(onlyIncomplete ? "?incomplete=true" : "", { method: "GET" })) as ListResponse;
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

  const recipes = listQuery.data?.recipes ?? [];
  const missingEquipmentCount = recipes.filter((r) => !r.hasEquipment).length;
  const missingNutritionCount = recipes.filter((r) => !r.nutritionComplete).length;
  const unreviewedAllergensCount = recipes.filter((r) => !r.allergensReviewed).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl">Tarif Veri Kalitesi</h1>
            <p className="text-xs text-hmuted mt-1">Yayınlanan katalog — ekipman/besin/alerjen tamlığı</p>
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Ekipman eksik" accent="saffron" value={missingEquipmentCount} />
          <StatCard label="Besin değeri eksik" accent="hred" value={missingNutritionCount} />
          <StatCard label="Alerjen incelenmemiş" accent="gold" value={unreviewedAllergensCount} />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
          <Checkbox checked={onlyIncomplete} onCheckedChange={(v) => setOnlyIncomplete(v === true)} />
          Yalnız eksiği olanlar
        </label>

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

// -----------------------------------------------------------------------------------------------
// Detail panel — allergens / facts / nutrition ingredients + recalculate
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
  invoke: (path: string, options: { method: string; body?: unknown }) => Promise<unknown>;
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

  if (isLoading || !detail) {
    return (
      <SectionCard title="Tarif Detayı">
        <div className="py-8 text-center text-sm text-hmuted">Yükleniyor…</div>
      </SectionCard>
    );
  }

  const r = detail.recipe;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-lg">{r.title}</h2>
        <button onClick={onClose} className="text-xs text-hmuted underline">
          Kapat
        </button>
      </div>

      <AllergenSection
        initialLabels={(r.allergenLabels ?? []) as AllergenSlug[]}
        initialReviewed={r.allergensReviewed}
        isSaving={allergensMutation.isPending}
        onSave={(labels, reviewed) => allergensMutation.mutate({ allergenLabels: labels, reviewed })}
      />

      <FactsSection
        initialEquipment={r.requiredEquipment ?? []}
        initialDietTags={r.dietTags}
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
                onSave={(body) => ingredientMutation.mutate({ ingredientId: ing.id, body })}
              />
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function AllergenSection({
  initialLabels,
  initialReviewed,
  isSaving,
  onSave,
}: {
  initialLabels: AllergenSlug[];
  initialReviewed: boolean;
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
  isSaving,
  onSave,
}: {
  initialEquipment: string[];
  initialDietTags: string[];
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
  onSave,
}: {
  ingredient: QualityIngredient;
  foodKeyOptions: FoodKeyOption[];
  isSaving: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [crop, setCrop] = useState(ingredient.crop ?? "");
  const [freeTextName, setFreeTextName] = useState(ingredient.freeTextName ?? "");
  const [quantity, setQuantity] = useState(ingredient.quantity != null ? String(ingredient.quantity) : "");
  const [unit, setUnit] = useState(ingredient.unit ?? "");
  const [nutritionFoodKey, setNutritionFoodKey] = useState(ingredient.nutritionFoodKey ?? "");
  const [nutritionExclusionReason, setNutritionExclusionReason] = useState(ingredient.nutritionExclusionReason ?? "");
  const [foodKeyOpen, setFoodKeyOpen] = useState(false);

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
    });
  };

  return (
    <div className="rounded-lg border p-3 space-y-2">
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

      <div className="flex justify-end">
        <Button size="sm" disabled={isSaving} onClick={save}>
          Kaydet
        </Button>
      </div>
    </div>
  );
}
