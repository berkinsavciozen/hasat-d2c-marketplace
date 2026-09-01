import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/hasat/common/SectionCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ADMIN_RECIPE_KEY_STORAGE } from "./admin.recipes";

export const Route = createFileRoute("/admin/recipes/plan/$batchId")({
  head: () => ({
    meta: [
      { title: "Admin — Plan İnceleme" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminRecipePlanBatchDetailPage,
});

// ---------------------------------------------------------------------------
// Types (mirrors ../../supabase/functions/_shared/recipe-automation/admin/plan-review.ts's
// response shapes — duplicated client-side rather than imported, same convention
// admin.recipes.index.tsx / admin.recipes.$jobId.tsx already use for their own job-shape types).
// ---------------------------------------------------------------------------

const REVIEW_STATUSES = ["pending_review", "approved", "rejected"] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const RECIPE_DIFFICULTY_VALUES = ["kolay", "orta", "zor"] as const;
type RecipeDifficulty = (typeof RECIPE_DIFFICULTY_VALUES)[number];

const RECIPE_TARGET_AUDIENCE_VALUES = ["bireysel", "horeca"] as const;
type RecipeTargetAudience = (typeof RECIPE_TARGET_AUDIENCE_VALUES)[number];

const RECIPE_MEAL_TYPE_VALUES = [
  "kahvalti",
  "ana_yemek",
  "aperatif_meze",
  "corba",
  "salata",
  "tatli",
  "icecek",
] as const;
type RecipeMealType = (typeof RECIPE_MEAL_TYPE_VALUES)[number];

const DIFFICULTY_LABELS: Record<RecipeDifficulty, string> = { kolay: "Kolay", orta: "Orta", zor: "Zor" };
const AUDIENCE_LABELS: Record<RecipeTargetAudience, string> = { bireysel: "Bireysel", horeca: "HoReCa" };
const MEAL_TYPE_LABELS: Record<RecipeMealType, string> = {
  kahvalti: "Kahvaltı",
  ana_yemek: "Ana Yemek",
  aperatif_meze: "Aperatif/Meze",
  corba: "Çorba",
  salata: "Salata",
  tatli: "Tatlı",
  icecek: "İçecek",
};

const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending_review: "Onay Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

const REVIEW_STATUS_STYLES: Record<ReviewStatus, string> = {
  pending_review: "bg-[color-mix(in_oklab,var(--saffron)_25%,transparent)] text-[color:var(--saffron)] font-semibold",
  approved: "bg-[color-mix(in_oklab,var(--sage)_25%,transparent)] text-[color:var(--sage)] font-semibold",
  rejected: "bg-[color-mix(in_oklab,var(--hred)_20%,transparent)] text-[color:var(--hred)]",
};

type PlanBriefItem = {
  id: string;
  briefId: string;
  workingTitle: string;
  focusCrop: string;
  angle: string | null;
  targetDifficulty: RecipeDifficulty | null;
  dietTags: string[];
  locale: string;
  audience: RecipeTargetAudience;
  mealType: RecipeMealType | null;
  selectionReason: string;
  excluded: boolean;
  exclusionReason: string | null;
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
};

type DiversityIssue = {
  code: string;
  field: string;
  severity: "info" | "warning" | "blocking";
  message: string;
  requiredChange: string | null;
};

type DiversityReport = { valid: boolean; issues: DiversityIssue[]; briefCount: number };

type PlanErrorPayload = { code: string; message: string };

type PlanBatchDetail = {
  id: string;
  targetCount: number;
  focusCrops: string[] | null;
  dietFocus: string[];
  locale: string;
  notes: string | null;
  plannerModel: string | null;
  plannedAt: string | null;
  reviewStatus: ReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  fannedOutAt: string | null;
  briefCount: number;
  excludedCount: number;
  createdAt: string;
  diversityReport: DiversityReport | null;
  planError: PlanErrorPayload | null;
  briefs: PlanBriefItem[];
};

type PlanReviewFailureReason = "not_found" | "wrong_state" | "already_promoted" | "diversity_invalid";

type PlanBriefMutationResult =
  | { ok: true; brief: PlanBriefItem }
  | { ok: false; reason: PlanReviewFailureReason };

type FannedOutJobSummary = {
  briefId: string;
  jobId: string;
  workingTitle: string;
  focusCrop: string;
  created: boolean;
  dispatched: boolean;
};

type ApprovePlanBatchResult =
  | { ok: true; batchId: string; jobs: FannedOutJobSummary[] }
  | { ok: false; reason: PlanReviewFailureReason; issues?: DiversityIssue[] };

type RejectPlanBatchResult = { ok: true } | { ok: false; reason?: PlanReviewFailureReason };

/** Only the fields an admin may change on a brief BEFORE it is promoted into a job — never
 * briefId/batchId/jobId (stable identity, backend rejects them anyway). */
type EditPlanBriefPatch = Partial<{
  workingTitle: string;
  focusCrop: string;
  angle: string | null;
  targetDifficulty: RecipeDifficulty | null;
  dietTags: string[];
  audience: RecipeTargetAudience;
  mealType: RecipeMealType | null;
  selectionReason: string;
}>;

const REASON_LABELS: Record<string, string> = {
  not_found: "Bulunamadı",
  wrong_state: "Beklenmeyen durum — sayfa güncel olmayabilir, yeniden yükleyin",
  already_promoted: "Bu brief zaten bir işe dönüştürülmüş",
  diversity_invalid: "Çeşitlilik kuralı ihlali",
};

class UnauthorizedActionError extends Error {}

/** POSTs to admin-recipe-plan-review-action and returns the parsed body for BOTH 2xx (`data`) and
 * non-2xx (`ok:false` reasons come back with 404/409/422 — see that function's FAILURE_STATUS map)
 * responses, since supabase-js only populates `data` on 2xx and otherwise hands back a
 * FunctionsHttpError whose `context` is the raw, unread Response. 401/403 is the one case worth
 * distinguishing so the caller can drop the stored key exactly like the GET queries below do. */
async function invokeAdminPlanAction<T>(adminKey: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-recipe-plan-review-action", {
    method: "POST",
    headers: { "x-admin-key": adminKey, "content-type": "application/json" },
    body,
  });
  if (!error) return data as T;

  const anyErr = error as { context?: Response; status?: number; message?: string };
  const status = anyErr.context?.status ?? anyErr.status;
  if (status === 401 || status === 403) throw new UnauthorizedActionError("unauthorized");

  if (anyErr.context && typeof anyErr.context.json === "function") {
    try {
      return (await anyErr.context.json()) as T;
    } catch {
      // fall through to throw below
    }
  }
  throw error;
}

type BriefForm = {
  workingTitle: string;
  focusCrop: string;
  angle: string;
  targetDifficulty: "" | RecipeDifficulty;
  dietTags: string;
  audience: RecipeTargetAudience;
  mealType: "" | RecipeMealType;
  selectionReason: string;
};

function briefToForm(brief: PlanBriefItem): BriefForm {
  return {
    workingTitle: brief.workingTitle,
    focusCrop: brief.focusCrop,
    angle: brief.angle ?? "",
    targetDifficulty: brief.targetDifficulty ?? "",
    dietTags: brief.dietTags.join(", "),
    audience: brief.audience,
    mealType: brief.mealType ?? "",
    selectionReason: brief.selectionReason,
  };
}

function diffForm(brief: PlanBriefItem, form: BriefForm): EditPlanBriefPatch {
  const patch: EditPlanBriefPatch = {};
  const workingTitle = form.workingTitle.trim();
  if (workingTitle && workingTitle !== brief.workingTitle) patch.workingTitle = workingTitle;
  const focusCrop = form.focusCrop.trim();
  if (focusCrop && focusCrop !== brief.focusCrop) patch.focusCrop = focusCrop;
  const angle = form.angle.trim() || null;
  if (angle !== (brief.angle ?? null)) patch.angle = angle;
  const targetDifficulty = form.targetDifficulty || null;
  if (targetDifficulty !== (brief.targetDifficulty ?? null)) patch.targetDifficulty = targetDifficulty;
  const dietTags = form.dietTags.split(",").map((t) => t.trim()).filter(Boolean);
  if (JSON.stringify(dietTags) !== JSON.stringify(brief.dietTags)) patch.dietTags = dietTags;
  if (form.audience !== brief.audience) patch.audience = form.audience;
  const mealType = form.mealType || null;
  if (mealType !== (brief.mealType ?? null)) patch.mealType = mealType;
  const selectionReason = form.selectionReason.trim();
  if (selectionReason && selectionReason !== brief.selectionReason) patch.selectionReason = selectionReason;
  return patch;
}

function BriefCard({
  brief,
  canMutate,
  isSaving,
  onSave,
  onExclude,
  onInclude,
}: {
  brief: PlanBriefItem;
  canMutate: boolean;
  isSaving: boolean;
  onSave: (briefId: string, patch: EditPlanBriefPatch) => void;
  onExclude: (briefId: string, reason: string | null) => void;
  onInclude: (briefId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<BriefForm>(() => briefToForm(brief));
  const [exclusionReasonDraft, setExclusionReasonDraft] = useState("");

  useEffect(() => {
    if (!editing) setForm(briefToForm(brief));
  }, [brief, editing]);

  const promoted = !!brief.jobId;
  const canEdit = canMutate && !promoted;

  function handleSave() {
    const patch = diffForm(brief, form);
    setEditing(false);
    if (Object.keys(patch).length === 0) return;
    onSave(brief.id, patch);
  }

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">{brief.workingTitle}</div>
          <div className="text-xs text-hmuted mt-0.5">{brief.focusCrop} · {brief.angle ?? "—"}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {promoted && (
            <span className="inline-block rounded-full px-2 py-0.5 text-xs bg-[color-mix(in_oklab,var(--sage)_20%,transparent)] text-[color:var(--sage)]">
              İşe dönüştürüldü
            </span>
          )}
          {brief.excluded && (
            <span className="inline-block rounded-full px-2 py-0.5 text-xs bg-muted text-hmuted">
              Hariç tutuldu
            </span>
          )}
        </div>
      </div>

      {!editing ? (
        <div className="text-sm space-y-1.5">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-hmuted">
            <span>Zorluk: {brief.targetDifficulty ? DIFFICULTY_LABELS[brief.targetDifficulty] : "—"}</span>
            <span>Hedef Kitle: {AUDIENCE_LABELS[brief.audience]}</span>
            <span>Öğün Türü: {brief.mealType ? MEAL_TYPE_LABELS[brief.mealType] : "—"}</span>
            <span>Dil: {brief.locale}</span>
          </div>
          {brief.dietTags.length > 0 && <div className="text-xs">Diyet: {brief.dietTags.join(", ")}</div>}
          <p className="text-xs text-hmuted">{brief.selectionReason}</p>
          {brief.excluded && (
            <p className="text-xs text-[color:var(--hred)]">
              Hariç tutma nedeni: {brief.exclusionReason ?? "—"}
            </p>
          )}
          <p className="text-[10px] text-hmuted font-mono">
            briefId: {brief.briefId}{brief.jobId ? ` · jobId: ${brief.jobId}` : ""}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs space-y-1">
            <span className="text-hmuted block">Başlık</span>
            <Input value={form.workingTitle} onChange={(e) => setForm((f) => ({ ...f, workingTitle: e.target.value }))} />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-hmuted block">Odak Ürün</span>
            <Input value={form.focusCrop} onChange={(e) => setForm((f) => ({ ...f, focusCrop: e.target.value }))} />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-hmuted block">Açı</span>
            <Input
              value={form.angle}
              onChange={(e) => setForm((f) => ({ ...f, angle: e.target.value }))}
              placeholder="opsiyonel"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-hmuted block">Zorluk</span>
            <select
              value={form.targetDifficulty}
              onChange={(e) => setForm((f) => ({ ...f, targetDifficulty: e.target.value as BriefForm["targetDifficulty"] }))}
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm bg-background"
            >
              <option value="">—</option>
              {RECIPE_DIFFICULTY_VALUES.map((d) => (
                <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-hmuted block">Hedef Kitle</span>
            <select
              value={form.audience}
              onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value as RecipeTargetAudience }))}
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm bg-background"
            >
              {RECIPE_TARGET_AUDIENCE_VALUES.map((a) => (
                <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-hmuted block">Öğün Türü</span>
            <select
              value={form.mealType}
              onChange={(e) => setForm((f) => ({ ...f, mealType: e.target.value as BriefForm["mealType"] }))}
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm bg-background"
            >
              <option value="">—</option>
              {RECIPE_MEAL_TYPE_VALUES.map((m) => (
                <option key={m} value={m}>{MEAL_TYPE_LABELS[m]}</option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1 sm:col-span-2">
            <span className="text-hmuted block">Diyet Etiketleri (virgülle ayır)</span>
            <Input value={form.dietTags} onChange={(e) => setForm((f) => ({ ...f, dietTags: e.target.value }))} />
          </label>
          <label className="text-xs space-y-1 sm:col-span-2">
            <span className="text-hmuted block">Seçim Gerekçesi</span>
            <Textarea
              rows={2}
              value={form.selectionReason}
              onChange={(e) => setForm((f) => ({ ...f, selectionReason: e.target.value }))}
            />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {!editing ? (
          <Button
            variant="outline"
            size="sm"
            disabled={!canEdit || isSaving}
            onClick={() => {
              setForm(briefToForm(brief));
              setEditing(true);
            }}
          >
            Düzenle
          </Button>
        ) : (
          <>
            <Button size="sm" disabled={isSaving} onClick={handleSave}>Kaydet</Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={() => {
                setForm(briefToForm(brief));
                setEditing(false);
              }}
            >
              Vazgeç
            </Button>
          </>
        )}

        {!brief.excluded ? (
          <div className="flex items-center gap-2">
            <Input
              value={exclusionReasonDraft}
              onChange={(e) => setExclusionReasonDraft(e.target.value)}
              placeholder="Hariç tutma nedeni (opsiyonel)"
              disabled={!canEdit}
              className="h-9 w-56"
            />
            <Button
              variant="destructive"
              size="sm"
              disabled={!canEdit || isSaving}
              onClick={() => onExclude(brief.id, exclusionReasonDraft.trim() || null)}
            >
              Hariç Tut
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" disabled={!canEdit || isSaving} onClick={() => onInclude(brief.id)}>
            Dahil Et
          </Button>
        )}
      </div>
    </div>
  );
}

function AdminRecipePlanBatchDetailPage() {
  const { batchId } = Route.useParams();
  const queryClient = useQueryClient();

  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [adminActor, setAdminActor] = useState("");
  const [savingBriefId, setSavingBriefId] = useState<string | null>(null);
  const [diversityIssues, setDiversityIssues] = useState<DiversityIssue[] | null>(null);
  const [approvedJobs, setApprovedJobs] = useState<FannedOutJobSummary[] | null>(null);

  useEffect(() => {
    setAdminKey(sessionStorage.getItem(ADMIN_RECIPE_KEY_STORAGE));
  }, []);

  const query = useQuery({
    queryKey: ["admin-recipe-plan-batch-detail", batchId, adminKey],
    enabled: !!adminKey,
    retry: false,
    queryFn: async (): Promise<PlanBatchDetail> => {
      const { data, error } = await supabase.functions.invoke(`admin-recipe-plan-batch-detail?batchId=${batchId}`, {
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
      return data as PlanBatchDetail;
    },
  });

  function handleActionError(error: unknown) {
    setSavingBriefId(null);
    if (error instanceof UnauthorizedActionError) {
      toast.error("Hatalı anahtar");
      sessionStorage.removeItem(ADMIN_RECIPE_KEY_STORAGE);
      setAdminKey(null);
      return;
    }
    const anyErr = error as { message?: string };
    toast.error(`İşlem hatası: ${anyErr.message ?? "bilinmiyor"}`);
  }

  const editMutation = useMutation({
    mutationFn: async (params: { briefId: string; patch: EditPlanBriefPatch }) =>
      invokeAdminPlanAction<PlanBriefMutationResult>(adminKey!, {
        action: "edit_brief",
        briefId: params.briefId,
        patch: params.patch,
        adminActor: adminActor.trim() || null,
      }),
    onSuccess: (result) => {
      setSavingBriefId(null);
      if (!result.ok) {
        toast.error(REASON_LABELS[result.reason] ?? "İşlem başarısız");
        return;
      }
      toast.success("Brief güncellendi");
      queryClient.invalidateQueries({ queryKey: ["admin-recipe-plan-batch-detail", batchId] });
    },
    onError: handleActionError,
  });

  const exclusionMutation = useMutation({
    mutationFn: async (params: { briefId: string; excluded: boolean; exclusionReason: string | null }) =>
      invokeAdminPlanAction<PlanBriefMutationResult>(adminKey!, {
        action: params.excluded ? "exclude_brief" : "include_brief",
        briefId: params.briefId,
        exclusionReason: params.excluded ? params.exclusionReason : undefined,
        adminActor: adminActor.trim() || null,
      }),
    onSuccess: (result) => {
      setSavingBriefId(null);
      if (!result.ok) {
        toast.error(REASON_LABELS[result.reason] ?? "İşlem başarısız");
        return;
      }
      toast.success(result.brief.excluded ? "Brief hariç tutuldu" : "Brief dahil edildi");
      queryClient.invalidateQueries({ queryKey: ["admin-recipe-plan-batch-detail", batchId] });
    },
    onError: handleActionError,
  });

  const approveMutation = useMutation({
    mutationFn: async () =>
      invokeAdminPlanAction<ApprovePlanBatchResult>(adminKey!, {
        action: "approve_batch",
        batchId,
        adminActor: adminActor.trim() || null,
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        if (result.reason === "diversity_invalid") {
          setDiversityIssues(result.issues ?? []);
          setApprovedJobs(null);
        } else {
          toast.error(REASON_LABELS[result.reason] ?? "İşlem başarısız");
        }
        return;
      }
      setDiversityIssues(null);
      setApprovedJobs(result.jobs);
      toast.success(`Batch onaylandı — ${result.jobs.length} iş oluşturuldu`);
      queryClient.invalidateQueries({ queryKey: ["admin-recipe-plan-batch-detail", batchId] });
      queryClient.invalidateQueries({ queryKey: ["admin-recipe-plan-batches"] });
    },
    onError: handleActionError,
  });

  const rejectMutation = useMutation({
    mutationFn: async () =>
      invokeAdminPlanAction<RejectPlanBatchResult>(adminKey!, {
        action: "reject_batch",
        batchId,
        adminActor: adminActor.trim() || null,
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(REASON_LABELS[result.reason ?? ""] ?? "İşlem başarısız");
        return;
      }
      toast.success("Batch reddedildi");
      queryClient.invalidateQueries({ queryKey: ["admin-recipe-plan-batch-detail", batchId] });
      queryClient.invalidateQueries({ queryKey: ["admin-recipe-plan-batches"] });
    },
    onError: handleActionError,
  });

  if (!adminKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-6 space-y-4 text-center">
          <h1 className="font-serif text-xl">Oturum yok</h1>
          <p className="text-sm text-hmuted">Önce plan listesinden anahtarınızı girin.</p>
          <Link to="/admin/recipes/plan" className="inline-block rounded-lg bg-primary text-primary-foreground py-2 px-4 text-sm font-medium">
            Plan listesine dön
          </Link>
        </div>
      </div>
    );
  }

  if (query.isLoading || !query.data) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-hmuted">Yükleniyor…</div>;
  }

  const d = query.data;
  const canMutate = d.reviewStatus === "pending_review";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <header>
          <Link to="/admin/recipes/plan" className="text-xs text-hmuted underline">← Plan listesi</Link>
          <h1 className="font-serif text-2xl mt-1">Plan #{batchId.slice(0, 8)}</h1>
          <p className="text-xs text-hmuted font-mono mt-1">
            {REVIEW_STATUS_LABELS[d.reviewStatus]} · {d.briefCount} brief ({d.excludedCount} hariç)
          </p>
        </header>

        {d.planError && (
          <div className="rounded-xl border border-[color:var(--hred)] bg-[color-mix(in_oklab,var(--hred)_8%,transparent)] p-4 text-sm">
            <div className="font-medium text-[color:var(--hred)]">{d.planError.code}</div>
            <div className="text-hmuted mt-1">{d.planError.message}</div>
          </div>
        )}

        <SectionCard title="Plan Bilgileri">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div><span className="text-hmuted">Hedef Sayı:</span> {d.targetCount}</div>
            <div><span className="text-hmuted">Dil:</span> {d.locale}</div>
            <div className="sm:col-span-2">
              <span className="text-hmuted">Odak Ürünler:</span> {d.focusCrops && d.focusCrops.length > 0 ? d.focusCrops.join(", ") : "—"}
            </div>
            <div className="sm:col-span-2">
              <span className="text-hmuted">Diyet Odağı:</span> {d.dietFocus.length > 0 ? d.dietFocus.join(", ") : "—"}
            </div>
            <div className="sm:col-span-2"><span className="text-hmuted">Not:</span> {d.notes ?? "—"}</div>
            <div><span className="text-hmuted">Planlayıcı Model:</span> {d.plannerModel ?? "—"}</div>
            <div>
              <span className="text-hmuted">Planlandı:</span>{" "}
              {d.plannedAt ? new Date(d.plannedAt).toLocaleString("tr-TR") : "—"}
            </div>
            <div>
              <span className="text-hmuted">Durum:</span>{" "}
              <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs", REVIEW_STATUS_STYLES[d.reviewStatus])}>
                {REVIEW_STATUS_LABELS[d.reviewStatus]}
              </span>
            </div>
            <div><span className="text-hmuted">İnceleyen:</span> {d.reviewedBy ?? "—"}</div>
            <div>
              <span className="text-hmuted">İncelendi:</span>{" "}
              {d.reviewedAt ? new Date(d.reviewedAt).toLocaleString("tr-TR") : "—"}
            </div>
            <div>
              <span className="text-hmuted">Dağıtıldı (fan-out):</span>{" "}
              {d.fannedOutAt ? new Date(d.fannedOutAt).toLocaleString("tr-TR") : "—"}
            </div>
          </div>
        </SectionCard>

        {d.diversityReport && (
          <SectionCard title="Plan Çeşitlilik Kontrolü (RPC)">
            <div className="text-sm">
              <div className={cn("font-medium", d.diversityReport.valid ? "text-[color:var(--sage)]" : "text-[color:var(--hred)]")}>
                {d.diversityReport.valid ? "Geçerli" : "Sorun bulundu"} · {d.diversityReport.briefCount} brief
              </div>
              {d.diversityReport.issues.length > 0 && (
                <ul className="text-xs mt-2 space-y-0.5">
                  {d.diversityReport.issues.map((issue, i) => (
                    <li key={i}>[{issue.severity}] {issue.code}: {issue.message}</li>
                  ))}
                </ul>
              )}
            </div>
          </SectionCard>
        )}

        <SectionCard title="Briefler">
          <div className="space-y-3">
            {d.briefs.map((brief) => (
              <BriefCard
                key={brief.id}
                brief={brief}
                canMutate={canMutate}
                isSaving={savingBriefId === brief.id && (editMutation.isPending || exclusionMutation.isPending)}
                onSave={(briefId, patch) => {
                  setSavingBriefId(briefId);
                  editMutation.mutate({ briefId, patch });
                }}
                onExclude={(briefId, reason) => {
                  setSavingBriefId(briefId);
                  exclusionMutation.mutate({ briefId, excluded: true, exclusionReason: reason });
                }}
                onInclude={(briefId) => {
                  setSavingBriefId(briefId);
                  exclusionMutation.mutate({ briefId, excluded: false, exclusionReason: null });
                }}
              />
            ))}
          </div>
        </SectionCard>

        {diversityIssues && (
          <div className="rounded-xl border border-[color:var(--hred)] bg-[color-mix(in_oklab,var(--hred)_8%,transparent)] p-4 text-sm space-y-2">
            <div className="font-medium text-[color:var(--hred)]">Onay reddedildi — çeşitlilik kuralı ihlali</div>
            <p className="text-hmuted text-xs">
              Bir düzenleme çeşitlilik kuralını bozmuş olabilir. Aşağıdaki brief'leri düzeltip tekrar onaylayın.
            </p>
            <ul className="text-xs space-y-0.5">
              {diversityIssues.map((issue, i) => (
                <li key={i}>[{issue.severity}] {issue.code}: {issue.message}</li>
              ))}
            </ul>
          </div>
        )}

        {approvedJobs && (
          <SectionCard title="Oluşturulan İşler">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-hmuted">
                  <tr className="border-b">
                    <th className="text-left py-2 pr-3">Başlık</th>
                    <th className="text-left py-2 px-3">Odak Ürün</th>
                    <th className="text-left py-2 px-3">Job ID</th>
                    <th className="text-left py-2 px-3">Oluşturuldu</th>
                    <th className="text-left py-2 pl-3">Dispatch Edildi</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedJobs.map((job) => (
                    <tr key={job.jobId} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <Link to="/admin/recipes/$jobId" params={{ jobId: job.jobId }} className="hover:underline">
                          {job.workingTitle}
                        </Link>
                      </td>
                      <td className="py-2 px-3">{job.focusCrop}</td>
                      <td className="py-2 px-3 font-mono text-xs">{job.jobId}</td>
                      <td className="py-2 px-3">{job.created ? "Evet" : "Zaten vardı"}</td>
                      <td className="py-2 pl-3">{job.dispatched ? "Evet" : "Hayır"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        <SectionCard title="Batch Onayı">
          <div className="space-y-3">
            <Input
              value={adminActor}
              onChange={(e) => setAdminActor(e.target.value)}
              placeholder="Adınız (opsiyonel — kayıt için)"
              className="text-sm max-w-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button disabled={!canMutate || approveMutation.isPending} onClick={() => approveMutation.mutate()}>
                Onayla
              </Button>
              <Button
                variant="destructive"
                disabled={!canMutate || rejectMutation.isPending}
                onClick={() => rejectMutation.mutate()}
              >
                Reddet
              </Button>
            </div>
            {!canMutate && (
              <p className="text-xs text-hmuted">
                Bu plan artık "{REVIEW_STATUS_LABELS[d.reviewStatus]}" durumunda — onay/red işlemi yapılamaz.
              </p>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
