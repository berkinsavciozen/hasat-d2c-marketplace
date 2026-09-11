import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/hasat/common/SectionCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared read-only "admin recipe guidance" panels for the plan-batch admin screens
// (admin.recipes.plan.index.tsx — batch creation, admin.recipes.plan.$batchId.tsx — brief
// editing). Backed by the admin-recipe-guidance Edge Function, which itself only ever calls
// existing pipeline RPCs (search_existing_recipes, get_recent_recipe_mix, find_recipe_duplicates)
// the Planner/QA agents already use — see that function's own header. Purely additive/read-only:
// nothing here writes anything, and none of it changes what gets sent to the Writer — it only
// gives the human admin the same signal the agents already had, before they act on it.
//
// Types below mirror admin-recipe-guidance's own response shapes — duplicated client-side rather
// than imported, same convention every other admin.recipes.*.tsx route already uses for its own
// backend-shape types (see admin.recipes.plan.$batchId.tsx's own header comment).
// ---------------------------------------------------------------------------

type ExistingRecipeSummary = {
  id: string;
  slug: string;
  title: string;
  status: string;
  createdAt: string;
};

type ExistingRecipesForCrop = {
  crop: string;
  recipes: ExistingRecipeSummary[];
};

type RecentRecipeMixEntry = {
  crop: string;
  displayName: string;
  recipeCount: number;
  lastCreatedAt: string;
};

type CatalogGuidanceResponse = {
  existingByCrop: ExistingRecipesForCrop[];
  recentMix: RecentRecipeMixEntry[];
};

type DuplicateCandidate = {
  id: string;
  slug: string;
  title: string;
  matchReason: string;
  status: string;
  visibility: string;
};

class UnauthorizedGuidanceError extends Error {}

async function invokeGuidance<T>(adminKey: string, params: Record<string, string>): Promise<T> {
  const search = new URLSearchParams(params);
  const { data, error } = await supabase.functions.invoke(
    `admin-recipe-guidance?${search.toString()}`,
    {
      method: "GET",
      headers: { "x-admin-key": adminKey },
    },
  );
  if (!error) return data as T;

  const anyErr = error as { context?: Response; status?: number; message?: string };
  const status = anyErr.context?.status ?? anyErr.status;
  if (status === 401 || status === 403) throw new UnauthorizedGuidanceError("unauthorized");
  throw error;
}

const MATCH_REASON_LABELS: Record<string, string> = {
  exact_slug: "Aynı slug",
  exact_title: "Aynı başlık",
  title_word_overlap: "Başlıkta kelime çakışması",
  same_crop_and_title_word: "Aynı ürün + başlıkta kelime çakışması",
};

/**
 * "Katalogda Zaten Var" — verilen focusCrop(lar) için zaten yayında olan tarifleri ve son
 * dönemdeki genel crop dağılımını (Planner'ın kendi sinyali) gösterir. focusCrops boşsa hiçbir şey
 * çekmez (henüz seçilmiş bir ürün yoksa gösterecek bir şey de yoktur).
 */
export function ExistingCatalogPanel({
  adminKey,
  focusCrops,
}: {
  adminKey: string;
  focusCrops: string[];
}) {
  const normalizedCrops = [...new Set(focusCrops.map((c) => c.trim()).filter(Boolean))];

  const query = useQuery({
    queryKey: ["admin-recipe-guidance-catalog", adminKey, normalizedCrops],
    enabled: normalizedCrops.length > 0,
    retry: false,
    queryFn: () =>
      invokeGuidance<CatalogGuidanceResponse>(adminKey, {
        mode: "catalog",
        focusCrops: normalizedCrops.join(","),
      }),
  });

  if (normalizedCrops.length === 0) {
    return (
      <SectionCard title="Katalogda Zaten Var">
        <p className="text-xs text-hmuted">Bu bilgiyi görmek için önce odak ürün(ler) girin.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Katalogda Zaten Var">
      {query.isLoading ? (
        <p className="text-xs text-hmuted">Yükleniyor…</p>
      ) : query.isError ? (
        <p className="text-xs text-[color:var(--hred)]">Katalog bilgisi okunamadı.</p>
      ) : (
        <div className="space-y-4">
          {query.data!.existingByCrop.map((entry) => (
            <div key={entry.crop}>
              <div className="text-xs font-medium">{entry.crop}</div>
              {entry.recipes.length === 0 ? (
                <p className="text-xs text-hmuted mt-0.5">Bu ürün için yayında tarif yok.</p>
              ) : (
                <ul className="text-xs text-hmuted mt-1 space-y-0.5 list-disc list-inside">
                  {entry.recipes.map((r) => (
                    <li key={r.id}>{r.title}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {query.data!.recentMix.length > 0 && (
            <div>
              <div className="text-xs font-medium">Son 30 gün — genel ürün dağılımı</div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {query.data!.recentMix.map((m) => (
                  <span
                    key={m.crop}
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-[11px]",
                      normalizedCrops.includes(m.crop)
                        ? "bg-[color-mix(in_oklab,var(--saffron)_20%,transparent)] text-[color:var(--saffron)] font-medium"
                        : "bg-muted text-hmuted",
                    )}
                  >
                    {m.displayName} · {m.recipeCount}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

/**
 * "Wow-Factor Kontrol Listesi" — sabit, salt-okuma bir bilgi kutusu. Writer'ın editorial-rules.ts
 * madde 11-13'ünün (wow-factor öz-kontrolü, yaratıcı-ama-gerçekçi denge, anti-formülsel dil)
 * insan-okunur özeti: admin bir brief'i elle düzenlerken de AI'nın uyduğu standarda göre
 * düzenlesin diye. Backend gerekmez, hiçbir şey çağırmaz.
 */
export function WowFactorChecklist() {
  return (
    <SectionCard title="Wow-Factor Kontrol Listesi">
      <ul className="text-xs space-y-2">
        <li>
          <span className="font-medium">Wow-factor öz-kontrolü:</span> Bu brief sıradan bir ev
          yemeğinden farklı, akılda kalıcı tek bir unsur içeriyor mu (bir teknik, bir malzeme
          eşleşmesi, bir sunum fikri)? Yoksa açı/angle alanını buna göre netleştirin.
        </li>
        <li>
          <span className="font-medium">Yaratıcı ama gerçekçi denge:</span> Fikir sıra dışı olsun,
          ama bir ev mutfağında gerçekten yapılabilir kalsın — ulaşılması zor malzeme, profesyonel
          ekipman veya aşırı uzun/karmaşık bir süreç dayatmayın.
        </li>
        <li>
          <span className="font-medium">Anti-formülsel dil:</span> Başlık ve seçim gerekçesi klişe
          kalıplardan ("Enfes", "Nefis", "X'in Sırrı" gibi tekrarlayan formüllerden) kaçınsın; her
          brief kendi özgün açısıyla ifade edilsin.
        </li>
      </ul>
    </SectionCard>
  );
}

/**
 * "Benzerlik Kontrol Et" — admin workingTitle/focusCrop'u düzenledikten sonra, brief Writer'a
 * gitmeden ÖNCE find_recipe_duplicates'i canlı çağırıp olası bir tekrarı gösterir. On-demand: sayfa
 * yüklenirken otomatik çalışmaz, sadece butona basınca.
 */
export function DuplicateCheckButton({
  adminKey,
  workingTitle,
  focusCrop,
}: {
  adminKey: string;
  workingTitle: string;
  focusCrop: string;
}) {
  const [checked, setChecked] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);

  const canCheck = workingTitle.trim().length > 0;

  async function handleCheck() {
    if (!canCheck || loading) return;
    setLoading(true);
    try {
      const result = await invokeGuidance<{ duplicates: DuplicateCandidate[] }>(adminKey, {
        mode: "duplicates",
        workingTitle: workingTitle.trim(),
        ...(focusCrop.trim() ? { focusCrop: focusCrop.trim() } : {}),
      });
      setDuplicates(result.duplicates);
      setChecked(true);
    } catch (err) {
      toast.error(
        err instanceof UnauthorizedGuidanceError
          ? "Hatalı anahtar"
          : "Benzerlik kontrolü başarısız",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canCheck || loading}
        onClick={handleCheck}
      >
        {loading ? "Kontrol ediliyor…" : "Benzerlik Kontrol Et"}
      </Button>

      {checked &&
        (duplicates && duplicates.length > 0 ? (
          <div className="rounded-lg border border-[color:var(--saffron)] bg-[color-mix(in_oklab,var(--saffron)_8%,transparent)] p-2.5 text-xs space-y-1">
            <div className="font-medium text-[color:var(--saffron)]">Olası tekrar bulundu</div>
            <ul className="space-y-1">
              {duplicates.map((d) => (
                <li key={d.id}>
                  <span className="font-medium">{d.title}</span>{" "}
                  <span className="text-hmuted">
                    ({MATCH_REASON_LABELS[d.matchReason] ?? d.matchReason} · {d.status})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-[color:var(--sage)]">Olası tekrar bulunamadı.</p>
        ))}
    </div>
  );
}
