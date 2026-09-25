import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/hasat/common/SectionCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ADMIN_RECIPE_KEY_STORAGE } from "./admin.recipes";

export const Route = createFileRoute("/admin/recipes/$jobId")({
  head: () => ({
    meta: [
      { title: "Admin — Tarif İnceleme" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminRecipeJobDetailPage,
});

type DraftIngredient = {
  crop: string | null; freeTextName: string | null; quantity: number | null; unit: string | null;
  note: string | null; isKeyIngredient: boolean; sortOrder: number;
};

type QAIssue = { code: string; field: string; severity: "info" | "warning" | "blocking"; message: string; requiredChange: string | null };
type SafetyFinding = { flagged: boolean; notes: string | null };

type JobDetail = {
  job: {
    id: string; batchId: string; briefId: string; workingTitle: string; focusCrop: string | null;
    angle: string | null; targetDifficulty: string | null; dietTags: string[]; locale: string;
    stage: string; status: string; revisionCount: number; attempt: number; maxAttempts: number;
    lastError: { code: string; message: string } | null; recipeId: string | null;
    createdAt: string; updatedAt: string;
  };
  currentDraft: {
    id: string; version: number;
    payload: {
      title: string; description: string | null; servings: number | null; prepMinutes: number | null;
      cookMinutes: number | null; restMinutes: number | null; difficulty: string | null; cuisine: string | null;
      dietTags: string[]; allergenLabels: string[] | null;
      ingredients: DraftIngredient[];
      steps: Array<{ stepNo: number; instruction: string; photoUrl: string | null; timerSeconds: number | null }>;
    };
  } | null;
  validation: { valid: boolean; issues: QAIssue[]; candidateSlug: string } | null;
  latestQaResult: {
    decision: string; overallScore: number; scores: Record<string, number>;
    blockingIssues: QAIssue[]; nonBlockingSuggestions: QAIssue[];
    safetyReview: { temperature: SafetyFinding; timing: SafetyFinding; allergens: SafetyFinding & { detectedLabels: string[] }; requiresHumanReview: boolean };
    approvedForImaging: boolean; checkedAt: string;
  } | null;
  images: Array<{
    id: string; assetType: "source" | "hero" | "square" | "step"; stepNo: number | null;
    publicUrl: string; widthPx: number | null; heightPx: number | null;
    validationStatus: "pending" | "passed" | "failed" | "warning" | null;
    validationResults: Record<string, unknown> | null;
  }>;
  revisionHistory: Array<{ id: string; version: number; title: string; createdAt: string; qaResult: { decision: string; overallScore: number; blockingIssueCount: number } | null }>;
  stageRuns: Array<{ stage: string; status: string; attempt: number; startedAt: string; finishedAt: string | null; error: { code: string; message: string } | null }>;
  reviewHistory: Array<{ id: string; action: string; notes: string | null; adminActor: string | null; createdAt: string; fromStage: string; toStage: string; toStatus: string }>;
  nutritionPreview: {
    coveragePct: number;
    source: "computed" | "partial" | "unavailable";
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    fiberG: number | null;
    unresolved: Array<{ sortOrder: number; name: string; reason: string }>;
    computedAt: string;
  } | null;
  // DQ-2 §4 — admin-recipe-job-detail'in eski sürümü bu alanları döndürmez; undefined = yok say.
  draftQualityIssues?: DraftQualityIssue[] | null;
  draftQualityCheckFailed?: boolean;
};

type DraftQualityIssue = { code: string; severity: "kritik" | "uyari" | "bilgi"; message: string };

const DRAFT_ISSUE_STYLES: Record<DraftQualityIssue["severity"], { text: string; dot: string }> = {
  kritik: { text: "text-[color:var(--hred)]", dot: "bg-[color:var(--hred)]" },
  uyari: { text: "text-[color:var(--saffron)]", dot: "bg-[color:var(--saffron)]" },
  bilgi: { text: "text-hmuted", dot: "bg-[color:var(--hmuted)]" },
};

// F2-S18 — Besin Değeri Eksikliği, Sınıf A/C çözümleme (bkz. admin-recipe-nutrition-resolve).
type NutritionResolutionKind = "add_measure" | "alias_to_existing" | "new_reference" | "mark_unquantified";

type NutritionResolveForm = {
  tab: NutritionResolutionKind;
  scopeKind: "crop" | "food";
  scopeKey: string;
  unit: string;
  gramsPerUnit: string;
  targetKind: "crop" | "food";
  targetKey: string;
  foodKey: string;
  displayName: string;
  caloriesKcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
};

const EMPTY_RESOLVE_FORM: NutritionResolveForm = {
  tab: "add_measure",
  scopeKind: "crop",
  scopeKey: "",
  unit: "",
  gramsPerUnit: "",
  targetKind: "crop",
  targetKey: "",
  foodKey: "",
  displayName: "",
  caloriesKcal: "",
  proteinG: "",
  carbsG: "",
  fatG: "",
  fiberG: "",
};

const RESOLVE_TAB_LABEL: Record<NutritionResolutionKind, string> = {
  add_measure: "Ölçü ekle",
  alias_to_existing: "Mevcut malzemeyle eşle",
  new_reference: "Yeni malzeme ekle",
  mark_unquantified: "Miktar belirtilmemiş",
};

type Checklist = {
  temperatureReviewed: boolean;
  timingReviewed: boolean;
  allergensReviewed: boolean;
  contentReviewed: boolean;
  imagesReviewed: boolean;
};

const EMPTY_CHECKLIST: Checklist = {
  temperatureReviewed: false,
  timingReviewed: false,
  allergensReviewed: false,
  contentReviewed: false,
  imagesReviewed: false,
};

function AdminRecipeJobDetailPage() {
  const { jobId } = Route.useParams();
  const queryClient = useQueryClient();

  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Checklist>(EMPTY_CHECKLIST);
  const [notes, setNotes] = useState("");
  const [adminActor, setAdminActor] = useState("");
  const [criticalAcknowledged, setCriticalAcknowledged] = useState(false);
  const [resolvingSortOrder, setResolvingSortOrder] = useState<number | null>(null);
  const [resolveForm, setResolveForm] = useState<NutritionResolveForm>(EMPTY_RESOLVE_FORM);

  useEffect(() => {
    setAdminKey(sessionStorage.getItem(ADMIN_RECIPE_KEY_STORAGE));
  }, []);

  const query = useQuery({
    queryKey: ["admin-recipe-job-detail", jobId, adminKey],
    enabled: !!adminKey,
    retry: false,
    queryFn: async (): Promise<JobDetail> => {
      const { data, error } = await supabase.functions.invoke(`admin-recipe-job-detail?jobId=${jobId}`, {
        method: "GET",
        headers: { "x-admin-key": adminKey! },
      });
      if (error) {
        const anyErr = error as { context?: { status?: number }; status?: number; message?: string };
        const status = anyErr.context?.status ?? anyErr.status;
        if (status === 401 || status === 403) {
          toast.error("Hatalı anahtar");
          sessionStorage.removeItem(ADMIN_RECIPE_KEY_STORAGE);
          setAdminKey(null);
        } else {
          toast.error(`Bağlantı hatası: ${anyErr.message ?? "bilinmiyor"}`);
        }
        throw error;
      }
      return data as JobDetail;
    },
  });

  // Kritik uyarı onayı taslağa özeldir; yeni bir taslak versiyonu gelince yeniden istenir.
  const draftKey = query.data?.currentDraft ? `${query.data.currentDraft.id}:${query.data.currentDraft.version}` : null;
  useEffect(() => {
    setCriticalAcknowledged(false);
  }, [draftKey]);

  const actionMutation = useMutation({
    mutationFn: async (params: { action: "approve" | "reject" | "request_revision" | "retry_stage" }) => {
      const draft = query.data?.currentDraft;
      const body = {
        jobId,
        action: params.action,
        draftId: draft?.id ?? null,
        draftVersion: draft?.version ?? null,
        checklist,
        notes: notes.trim() || null,
        adminActor: adminActor.trim() || null,
      };
      const { data, error } = await supabase.functions.invoke("admin-recipe-review-action", {
        method: "POST",
        headers: { "x-admin-key": adminKey!, "content-type": "application/json" },
        body,
      });
      if (error) throw error;
      return data as { ok: boolean; reason?: string };
    },
    onSuccess: (data, variables) => {
      if (!data.ok) {
        const reasonLabel: Record<string, string> = {
          not_found: "İş bulunamadı",
          wrong_state: "İş beklenmeyen bir durumda — sayfa güncel olmayabilir",
          revision_limit_reached: "Revizyon sınırına (2) ulaşıldı",
          checklist_incomplete: "Kontrol listesi eksik — tüm maddeler onaylanmalı",
          nutrition_incomplete: "Besin değerleri tam değil — aşağıdaki 'Besin Değerleri' panelinden eksik malzemeleri kontrol edin",
        };
        toast.error(reasonLabel[data.reason ?? ""] ?? "İşlem başarısız");
        return;
      }
      const actionLabel: Record<string, string> = {
        approve: "Onaylandı",
        reject: "Reddedildi",
        request_revision: "Revizyon istendi",
        retry_stage: "Aşama yeniden kuyruklandı",
      };
      toast.success(actionLabel[variables.action] ?? "İşlem tamamlandı");
      setChecklist(EMPTY_CHECKLIST);
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["admin-recipe-job-detail", jobId] });
      queryClient.invalidateQueries({ queryKey: ["admin-recipe-jobs"] });
    },
    onError: async (error: unknown) => {
      const anyErr = error as { context?: Response; message?: string };
      let reason: string | undefined;
      if (anyErr.context && typeof anyErr.context.clone === "function") {
        try {
          const body = await anyErr.context.clone().json();
          reason = body?.reason ?? body?.error;
        } catch {
          // yanıt gövdesi JSON değilse yut — aşağıdaki genel mesaj gösterilir
        }
      }
      const reasonLabel: Record<string, string> = {
        not_found: "İş bulunamadı",
        wrong_state: "İş beklenmeyen bir durumda — sayfa güncel olmayabilir",
        revision_limit_reached: "Revizyon sınırına (2) ulaşıldı",
        checklist_incomplete: "Kontrol listesi eksik — tüm maddeler onaylanmalı",
        nutrition_incomplete: "Besin değerleri tam değil — aşağıdaki 'Besin Değerleri' panelinden eksik malzemeleri kontrol edin",
      };
      toast.error(
        (reason && reasonLabel[reason]) ?? `İşlem hatası: ${anyErr.message ?? "bilinmiyor"}`,
      );
    },
  });

  const RESOLVE_FAILURE_LABEL: Record<string, string> = {
    already_exists: "Bu ölçü/eşleşme zaten kayıtlı",
    ingredient_not_found: "Malzeme taslakta bulunamadı (isim eşleşmedi)",
  };

  const resolveMutation = useMutation({
    mutationFn: async (params: { ingredientLabel: string; resolution: Record<string, unknown> }) => {
      const { data, error } = await supabase.functions.invoke("admin-recipe-nutrition-resolve", {
        method: "POST",
        headers: { "x-admin-key": adminKey!, "content-type": "application/json" },
        body: {
          jobId,
          ingredientLabel: params.ingredientLabel,
          resolution: params.resolution,
          adminActor: adminActor.trim() || null,
        },
      });
      if (error) throw error;
      return data as { ok: boolean; reason?: string };
    },
    onSuccess: (data) => {
      if (!data.ok) {
        toast.error(RESOLVE_FAILURE_LABEL[data.reason ?? ""] ?? "Çözümleme başarısız");
        return;
      }
      toast.success("Çözümlendi — besin önizlemesi güncellendi");
      setResolvingSortOrder(null);
      setResolveForm(EMPTY_RESOLVE_FORM);
      queryClient.invalidateQueries({ queryKey: ["admin-recipe-job-detail", jobId] });
    },
    onError: async (error: unknown) => {
      const anyErr = error as { context?: Response; message?: string };
      let reason: string | undefined;
      if (anyErr.context && typeof anyErr.context.clone === "function") {
        try {
          const body = await anyErr.context.clone().json();
          reason = body?.reason ?? body?.error;
        } catch {
          // yanıt gövdesi JSON değilse yut — aşağıdaki genel mesaj gösterilir
        }
      }
      toast.error(
        (reason && RESOLVE_FAILURE_LABEL[reason]) ?? `Çözümleme hatası: ${anyErr.message ?? "bilinmiyor"}`,
      );
    },
  });

  function openResolvePanel(sortOrder: number, reason: string, ingredient: DraftIngredient | undefined) {
    const defaultTab: NutritionResolutionKind =
      reason === "quantity_or_unit_not_resolvable" && ingredient?.crop ? "add_measure" : "alias_to_existing";
    setResolvingSortOrder(sortOrder);
    setResolveForm({
      ...EMPTY_RESOLVE_FORM,
      tab: defaultTab,
      scopeKind: ingredient?.crop ? "crop" : "food",
      scopeKey: ingredient?.crop ?? "",
      unit: ingredient?.unit ?? "",
    });
  }

  function submitResolve(ingredientLabel: string) {
    const f = resolveForm;
    let resolution: Record<string, unknown> | null = null;

    if (f.tab === "add_measure") {
      const gramsPerUnit = Number(f.gramsPerUnit);
      if (!f.scopeKey.trim() || !f.unit.trim() || !Number.isFinite(gramsPerUnit) || gramsPerUnit <= 0) {
        toast.error("Hedef (crop/food), birim ve pozitif bir gram değeri gerekli");
        return;
      }
      resolution = {
        kind: "add_measure",
        scope: f.scopeKind === "crop" ? { crop: f.scopeKey.trim() } : { foodKey: f.scopeKey.trim() },
        unit: f.unit.trim(),
        gramsPerUnit,
      };
    } else if (f.tab === "alias_to_existing") {
      if (!f.targetKey.trim()) {
        toast.error("Hedef malzeme anahtarı gerekli");
        return;
      }
      resolution = { kind: "alias_to_existing", targetKind: f.targetKind, targetKey: f.targetKey.trim() };
    } else if (f.tab === "new_reference") {
      const macros = [f.caloriesKcal, f.proteinG, f.carbsG, f.fatG, f.fiberG].map(Number);
      if (!f.foodKey.trim() || !f.displayName.trim() || macros.some((m) => !Number.isFinite(m) || m < 0)) {
        toast.error("Anahtar, görünen ad ve 5 makro alanı (negatif olmayan sayı) gerekli");
        return;
      }
      resolution = {
        kind: "new_reference",
        foodKey: f.foodKey.trim(),
        displayName: f.displayName.trim(),
        caloriesKcal: macros[0],
        proteinG: macros[1],
        carbsG: macros[2],
        fatG: macros[3],
        fiberG: macros[4],
      };
    } else {
      resolution = { kind: "mark_unquantified" };
    }

    resolveMutation.mutate({ ingredientLabel, resolution });
  }

  if (!adminKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-6 space-y-4 text-center">
          <h1 className="font-serif text-xl">Oturum yok</h1>
          <p className="text-sm text-hmuted">Önce iş listesinden anahtarınızı girin.</p>
          <Link to="/admin/recipes" className="inline-block rounded-lg bg-primary text-primary-foreground py-2 px-4 text-sm font-medium">
            İş listesine dön
          </Link>
        </div>
      </div>
    );
  }

  if (query.isLoading || !query.data) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-hmuted">Yükleniyor…</div>;
  }

  const d = query.data;
  const draft = d.currentDraft?.payload;
  const checklistComplete = Object.values(checklist).every(Boolean);
  const awaitingHuman = d.job.status === "awaiting_approval";
  // QA/revise manuel incelemeye devrettiğinde iş stage='qa' / status='awaiting_approval'da bekler
  // (F2-S21): görsel/finalize yok, QA kararı 'approved' değil — yalnız ret anlamlı.
  const isQaHandoff = awaitingHuman && d.job.stage === "qa";
  const atPublishGate = awaitingHuman && d.job.stage === "awaiting_approval";
  const draftIssues = d.draftQualityIssues ?? [];
  const criticalIssueCount = draftIssues.filter((i) => i.severity === "kritik").length;
  // DQ-2 §4: yalnız UI kapısı — DB/publish tarafında kritik için gate yok.
  const criticalGateOpen = criticalIssueCount === 0 || criticalAcknowledged;
  const canApprove = atPublishGate && !!d.currentDraft && checklistComplete && criticalGateOpen;
  const canReject = atPublishGate || isQaHandoff;
  const canRequestRevision = atPublishGate && d.job.revisionCount < 2;
  const canRetry = d.job.status === "failed";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <Link to="/admin/recipes" className="text-xs text-hmuted underline">← İş listesi</Link>
            <h1 className="font-serif text-2xl mt-1">{d.job.workingTitle}</h1>
            <p className="text-xs text-hmuted font-mono mt-1">
              {d.job.stage} · {d.job.status} · rev {d.job.revisionCount}/2 · deneme {d.job.attempt}/{d.job.maxAttempts}
            </p>
          </div>
        </header>

        {d.job.lastError && (
          <div className="rounded-xl border border-[color:var(--hred)] bg-[color-mix(in_oklab,var(--hred)_8%,transparent)] p-4 text-sm">
            <div className="font-medium text-[color:var(--hred)]">{d.job.lastError.code}</div>
            <div className="text-hmuted mt-1">{d.job.lastError.message}</div>
          </div>
        )}

        {draft && (
          <SectionCard title="Tarif İçeriği">
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-medium">{draft.title}</div>
                {draft.description && <p className="text-hmuted mt-1">{draft.description}</p>}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-hmuted">
                {draft.servings != null && <span>{draft.servings} porsiyon</span>}
                {draft.prepMinutes != null && <span>Hazırlık {draft.prepMinutes} dk</span>}
                {draft.cookMinutes != null && <span>Pişirme {draft.cookMinutes} dk</span>}
                {draft.restMinutes != null && <span>Bekleme {draft.restMinutes} dk</span>}
                {draft.difficulty && <span>Zorluk: {draft.difficulty}</span>}
                {draft.cuisine && <span>Mutfak: {draft.cuisine}</span>}
              </div>
              {draft.allergenLabels && draft.allergenLabels.length > 0 && (
                <div className="text-xs">
                  <span className="font-medium text-[color:var(--hred)]">Alerjenler: </span>
                  {draft.allergenLabels.join(", ")}
                </div>
              )}

              <div>
                <div className="text-xs font-medium text-hmuted mb-1">Malzemeler</div>
                <ul className="text-sm space-y-0.5">
                  {draft.ingredients.map((ing, i) => (
                    <li key={i}>
                      {ing.quantity != null && `${ing.quantity} ${ing.unit ?? ""} `}
                      {ing.crop ?? ing.freeTextName}
                      {ing.isKeyIngredient && <span className="text-xs text-hmuted"> (anahtar)</span>}
                      {ing.note && <span className="text-xs text-hmuted"> — {ing.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-xs font-medium text-hmuted mb-1">Adımlar</div>
                <ol className="text-sm space-y-1 list-decimal list-inside">
                  {draft.steps.sort((a, b) => a.stepNo - b.stepNo).map((step) => (
                    <li key={step.stepNo}>
                      {step.instruction}
                      {step.timerSeconds != null && <span className="text-xs text-hmuted"> ({Math.round(step.timerSeconds / 60)} dk)</span>}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </SectionCard>
        )}

        <SectionCard title="Görseller">
          {d.images.length === 0 ? (
            <div className="py-4 text-center text-sm text-hmuted">Henüz görsel yok</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {d.images.filter((img) => img.assetType === "hero" || img.assetType === "square").map((img) => (
                <div key={img.id} className="space-y-1">
                  <img src={img.publicUrl} alt={img.assetType} className="w-full rounded-lg border object-cover aspect-video" />
                  <div className="flex items-center justify-between text-xs text-hmuted">
                    <span>{img.assetType === "hero" ? "16:9 kapak" : "1:1 kare"}</span>
                    {img.validationStatus && img.validationStatus !== "passed" && (
                      <span className={cn(
                        "rounded-full px-2 py-0.5",
                        img.validationStatus === "failed"
                          ? "bg-[color-mix(in_oklab,var(--hred)_20%,transparent)] text-[color:var(--hred)]"
                          : "bg-[color-mix(in_oklab,var(--saffron)_20%,transparent)] text-[color:var(--saffron)]",
                      )}>
                        {img.validationStatus === "failed" ? "Kare şüphesi" : img.validationStatus}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {d.latestQaResult && (
          <SectionCard title="QA Sonucu">
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg">{d.latestQaResult.overallScore.toFixed(0)}</span>
                <span className="text-xs text-hmuted">{d.latestQaResult.decision}</span>
              </div>
              {d.latestQaResult.blockingIssues.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-[color:var(--hred)] mb-1">Engelleyici sorunlar</div>
                  <ul className="text-xs space-y-0.5">
                    {d.latestQaResult.blockingIssues.map((issue, i) => (
                      <li key={i}>{issue.code}: {issue.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <div className="text-xs font-medium text-hmuted mb-1">Güvenlik incelemesi (otomatik bulgular)</div>
                <ul className="text-xs space-y-0.5">
                  <li>Sıcaklık: {d.latestQaResult.safetyReview.temperature.flagged ? "⚠️ İşaretlendi" : "Sorun yok"} {d.latestQaResult.safetyReview.temperature.notes}</li>
                  <li>Süre: {d.latestQaResult.safetyReview.timing.flagged ? "⚠️ İşaretlendi" : "Sorun yok"} {d.latestQaResult.safetyReview.timing.notes}</li>
                  <li>
                    Alerjen: {d.latestQaResult.safetyReview.allergens.flagged ? "⚠️ İşaretlendi" : "Sorun yok"}{" "}
                    {d.latestQaResult.safetyReview.allergens.detectedLabels.join(", ")}
                  </li>
                </ul>
              </div>
            </div>
          </SectionCard>
        )}

        {d.validation && (
          <SectionCard title="Postgres Doğrulama (RPC)">
            <div className="text-sm">
              <div className={cn("font-medium", d.validation.valid ? "text-[color:var(--sage)]" : "text-[color:var(--hred)]")}>
                {d.validation.valid ? "Geçerli" : "Sorun bulundu"}
              </div>
              {d.validation.issues.length > 0 && (
                <ul className="text-xs mt-2 space-y-0.5">
                  {d.validation.issues.map((issue, i) => (
                    <li key={i}>[{issue.severity}] {issue.code}: {issue.message}</li>
                  ))}
                </ul>
              )}
            </div>
          </SectionCard>
        )}

        <SectionCard title="Revizyon Geçmişi">
          {d.revisionHistory.length === 0 ? (
            <div className="py-2 text-sm text-hmuted">Yok</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {d.revisionHistory.map((v) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-xs">v{v.version}</td>
                    <td className="py-1.5 px-3">{v.title}</td>
                    <td className="py-1.5 pl-3 text-xs text-hmuted">
                      {v.qaResult ? `${v.qaResult.decision} · ${v.qaResult.overallScore.toFixed(0)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {d.nutritionPreview && (
          <SectionCard title="Besin Değerleri (önizleme)">
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-hmuted">
                <span>Kapsama: %{d.nutritionPreview.coveragePct}</span>
                <span>
                  Durum:{" "}
                  {d.nutritionPreview.source === "computed"
                    ? "Tam"
                    : d.nutritionPreview.source === "partial"
                      ? "Kısmi"
                      : "Hesaplanamadı"}
                </span>
              </div>
              {d.nutritionPreview.calories != null && (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>{d.nutritionPreview.calories} kcal</span>
                  <span>{d.nutritionPreview.proteinG}g protein</span>
                  <span>{d.nutritionPreview.carbsG}g karbonhidrat</span>
                  <span>{d.nutritionPreview.fatG}g yağ</span>
                </div>
              )}
              {d.nutritionPreview.unresolved.length > 0 && (
                <div className="rounded-lg border border-[color:var(--hred)] bg-[color-mix(in_oklab,var(--hred)_8%,transparent)] p-3 space-y-2">
                  <div className="font-medium text-[color:var(--hred)] text-xs mb-1">
                    Eşleşmeyen malzemeler (onaydan önce çözülmeli):
                  </div>
                  <ul className="text-xs space-y-2">
                    {d.nutritionPreview.unresolved.map((u) => {
                      const ingredient = draft?.ingredients.find((ing) => ing.sortOrder === u.sortOrder);
                      const isOpen = resolvingSortOrder === u.sortOrder;
                      return (
                        <li key={u.sortOrder} className="border-b border-[color:var(--hred)]/20 last:border-0 pb-2 last:pb-0">
                          <div className="flex items-center justify-between gap-2">
                            <span>
                              {u.name} —{" "}
                              {u.reason === "nutrition_reference_missing" ? "besin referansı eksik" : "miktar/birim çözülemedi"}
                              {ingredient?.unit && <span className="text-hmuted"> ({ingredient.quantity ?? "?"} {ingredient.unit})</span>}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-6 px-2 text-xs shrink-0"
                              onClick={() => (isOpen ? setResolvingSortOrder(null) : openResolvePanel(u.sortOrder, u.reason, ingredient))}
                            >
                              {isOpen ? "Kapat" : "Çözümle"}
                            </Button>
                          </div>

                          {isOpen && (
                            <div className="mt-2 space-y-2 rounded-lg border bg-background p-3 text-foreground">
                              <div className="flex flex-wrap gap-1">
                                {(["add_measure", "alias_to_existing", "new_reference", "mark_unquantified"] as NutritionResolutionKind[]).map((tab) => (
                                  <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setResolveForm((f) => ({ ...f, tab }))}
                                    className={cn(
                                      "rounded-full px-2.5 py-1 text-xs border",
                                      resolveForm.tab === tab ? "bg-primary text-primary-foreground border-primary" : "text-hmuted",
                                    )}
                                  >
                                    {RESOLVE_TAB_LABEL[tab]}
                                  </button>
                                ))}
                              </div>

                              {resolveForm.tab === "add_measure" && (
                                <div className="space-y-2">
                                  <p className="text-xs text-hmuted">Bu birim için 1 {resolveForm.unit || ingredient?.unit || "birim"} kaç gram?</p>
                                  <div className="flex gap-2">
                                    <select
                                      value={resolveForm.scopeKind}
                                      onChange={(e) => setResolveForm((f) => ({ ...f, scopeKind: e.target.value as "crop" | "food" }))}
                                      className="rounded-md border bg-transparent px-2 text-xs"
                                    >
                                      <option value="crop">crop</option>
                                      <option value="food">food key</option>
                                    </select>
                                    <Input
                                      value={resolveForm.scopeKey}
                                      onChange={(e) => setResolveForm((f) => ({ ...f, scopeKey: e.target.value }))}
                                      placeholder="ör. portakal"
                                      className="text-xs h-8"
                                    />
                                    <Input
                                      value={resolveForm.unit}
                                      onChange={(e) => setResolveForm((f) => ({ ...f, unit: e.target.value }))}
                                      placeholder="birim (ör. adet)"
                                      className="text-xs h-8 w-28"
                                    />
                                    <Input
                                      value={resolveForm.gramsPerUnit}
                                      onChange={(e) => setResolveForm((f) => ({ ...f, gramsPerUnit: e.target.value }))}
                                      placeholder="gram"
                                      inputMode="decimal"
                                      className="text-xs h-8 w-24"
                                    />
                                  </div>
                                </div>
                              )}

                              {resolveForm.tab === "alias_to_existing" && (
                                <div className="flex gap-2">
                                  <select
                                    value={resolveForm.targetKind}
                                    onChange={(e) => setResolveForm((f) => ({ ...f, targetKind: e.target.value as "crop" | "food" }))}
                                    className="rounded-md border bg-transparent px-2 text-xs"
                                  >
                                    <option value="crop">crop</option>
                                    <option value="food">food key</option>
                                  </select>
                                  <Input
                                    value={resolveForm.targetKey}
                                    onChange={(e) => setResolveForm((f) => ({ ...f, targetKey: e.target.value }))}
                                    placeholder="Bu aslında şuyla aynı — ör. ceviz veya cinnamon_ground"
                                    className="text-xs h-8"
                                  />
                                </div>
                              )}

                              {resolveForm.tab === "new_reference" && (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    value={resolveForm.foodKey}
                                    onChange={(e) => setResolveForm((f) => ({ ...f, foodKey: e.target.value }))}
                                    placeholder="foodKey (ör. tavuk_gogsu_fileto)"
                                    className="text-xs h-8 col-span-2"
                                  />
                                  <Input
                                    value={resolveForm.displayName}
                                    onChange={(e) => setResolveForm((f) => ({ ...f, displayName: e.target.value }))}
                                    placeholder="Görünen ad"
                                    className="text-xs h-8 col-span-2"
                                  />
                                  <Input value={resolveForm.caloriesKcal} onChange={(e) => setResolveForm((f) => ({ ...f, caloriesKcal: e.target.value }))} placeholder="kcal/100g" inputMode="decimal" className="text-xs h-8" />
                                  <Input value={resolveForm.proteinG} onChange={(e) => setResolveForm((f) => ({ ...f, proteinG: e.target.value }))} placeholder="protein g/100g" inputMode="decimal" className="text-xs h-8" />
                                  <Input value={resolveForm.carbsG} onChange={(e) => setResolveForm((f) => ({ ...f, carbsG: e.target.value }))} placeholder="karbonhidrat g/100g" inputMode="decimal" className="text-xs h-8" />
                                  <Input value={resolveForm.fatG} onChange={(e) => setResolveForm((f) => ({ ...f, fatG: e.target.value }))} placeholder="yağ g/100g" inputMode="decimal" className="text-xs h-8" />
                                  <Input value={resolveForm.fiberG} onChange={(e) => setResolveForm((f) => ({ ...f, fiberG: e.target.value }))} placeholder="lif g/100g" inputMode="decimal" className="text-xs h-8" />
                                </div>
                              )}

                              {resolveForm.tab === "mark_unquantified" && (
                                <p className="text-xs text-hmuted">
                                  Bu malzeme miktar/birim belirtilmeden (ör. "damak tadına göre") eklenecek — besin hesabından kapsam dışı bırakılır.
                                </p>
                              )}

                              <Button
                                type="button"
                                className="h-7 px-3 text-xs"
                                disabled={resolveMutation.isPending}
                                onClick={() => submitResolve(u.name)}
                              >
                                Kaydet
                              </Button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <p className="text-xs text-hmuted">
                Bu önizleme taslak üzerinden hesaplanır; yayın anında gerçek veriyle yeniden doğrulanır.
              </p>
            </div>
          </SectionCard>
        )}

        <SectionCard title="Onay Kontrol Listesi">
          <div className="space-y-3">
            {d.currentDraft && (d.draftQualityIssues !== undefined || d.draftQualityCheckFailed) && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="text-xs font-medium">Veri tutarlılığı</div>
                {d.draftQualityCheckFailed ? (
                  <p className="text-xs text-[color:var(--saffron)]">
                    Tutarlılık kontrolü çalıştırılamadı — alerjen, diyet ve ekipman tutarlılığını elle kontrol edin.
                  </p>
                ) : draftIssues.length === 0 ? (
                  <p className="text-xs text-hmuted">Tutarsızlık bulunmadı.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {draftIssues.map((issue, idx) => (
                      <li key={`${issue.code}-${idx}`} className="flex items-start gap-2 text-xs">
                        <span className={cn("mt-1 inline-block h-2 w-2 rounded-full shrink-0", DRAFT_ISSUE_STYLES[issue.severity].dot)} />
                        <span className={DRAFT_ISSUE_STYLES[issue.severity].text}>{issue.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {criticalIssueCount > 0 && atPublishGate && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer pt-1 text-[color:var(--hred)]">
                    <Checkbox
                      checked={criticalAcknowledged}
                      onCheckedChange={(v) => setCriticalAcknowledged(v === true)}
                    />
                    Kritik uyarıları gördüm, yine de onaylıyorum
                  </label>
                )}
              </div>
            )}

            {([
              ["temperatureReviewed", "Pişirme sıcaklıkları kontrol edildi"],
              ["timingReviewed", "Pişirme/bekleme süreleri kontrol edildi"],
              ["allergensReviewed", "Alerjenler kontrol edildi"],
              ["contentReviewed", "Tarif içeriği kontrol edildi"],
              ["imagesReviewed", "Her iki görsel de kontrol edildi"],
            ] as [keyof Checklist, string][]).map(([field, label]) => (
              <label key={field} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={checklist[field]}
                  onCheckedChange={(v) => setChecklist((c) => ({ ...c, [field]: v === true }))}
                  disabled={!atPublishGate}
                />
                {label}
              </label>
            ))}

            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Not (opsiyonel)"
              className="text-sm"
              rows={2}
            />
            <Input
              value={adminActor}
              onChange={(e) => setAdminActor(e.target.value)}
              placeholder="Adınız (opsiyonel — kayıt için)"
              className="text-sm"
            />

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                disabled={!canApprove || actionMutation.isPending}
                onClick={() => actionMutation.mutate({ action: "approve" })}
              >
                Onayla
              </Button>
              <Button
                variant="destructive"
                disabled={!canReject || actionMutation.isPending}
                onClick={() => actionMutation.mutate({ action: "reject" })}
              >
                Reddet
              </Button>
              <Button
                variant="outline"
                disabled={!canRequestRevision || actionMutation.isPending}
                onClick={() => actionMutation.mutate({ action: "request_revision" })}
              >
                Revizyon İste {d.job.revisionCount >= 2 && "(sınır doldu)"}
              </Button>
              <Button
                variant="secondary"
                disabled={!canRetry || actionMutation.isPending}
                onClick={() => actionMutation.mutate({ action: "retry_stage" })}
              >
                Aşamayı Yeniden Dene
              </Button>
            </div>
            {isQaHandoff && (
              <p className="text-xs text-hmuted">
                QA bu tarifi manuel incelemeye devretti. Görseller ve son kontrol henüz üretilmedi;
                bu aşamada yalnız reddedilebilir.
              </p>
            )}
            {atPublishGate && !checklistComplete && (
              <p className="text-xs text-hmuted">Onaylamak için kontrol listesindeki tüm maddeler işaretlenmelidir.</p>
            )}
            {atPublishGate && !criticalGateOpen && (
              <p className="text-xs text-hmuted">
                Taslakta {criticalIssueCount} kritik tutarlılık uyarısı var; onaylamak için uyarıları gördüğünüzü işaretleyin.
              </p>
            )}
          </div>
        </SectionCard>

        {d.reviewHistory.length > 0 && (
          <SectionCard title="İnceleme Geçmişi">
            <ul className="text-xs space-y-1.5">
              {d.reviewHistory.map((r) => (
                <li key={r.id} className="border-b last:border-0 pb-1.5">
                  <span className="font-medium">{r.action}</span> · {r.fromStage} → {r.toStage}/{r.toStatus}
                  {r.adminActor && <span className="text-hmuted"> · {r.adminActor}</span>}
                  <span className="text-hmuted"> · {new Date(r.createdAt).toLocaleString("tr-TR")}</span>
                  {r.notes && <div className="text-hmuted mt-0.5">{r.notes}</div>}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
