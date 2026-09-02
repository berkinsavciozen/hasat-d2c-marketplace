import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/hasat/common/SectionCard";
import { StatCard } from "@/components/hasat/common/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ADMIN_RECIPE_KEY_STORAGE } from "./admin.recipes";

export const Route = createFileRoute("/admin/recipes/plan/")({
  head: () => ({
    meta: [
      { title: "Admin — Plan İnceleme" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminRecipePlanBatchesPage,
});

const REVIEW_STATUSES = ["pending_review", "approved", "rejected"] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

type PlanBatchListItem = {
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
};

type BatchesResponse = { batches: PlanBatchListItem[]; total: number };

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

// ---------------------------------------------------------------------------
// Manual batch creation (mirrors admin-recipe-plan-create/index.ts's own response shape —
// runPlanStage's RunPlanStageResult, forwarded as-is).
// ---------------------------------------------------------------------------

type RunPlanStageResult = {
  outcome: string;
  batchId?: string;
  briefCount?: number;
  errorCode?: string;
  issues?: unknown[];
};

type CreateBatchForm = {
  targetCount: string;
  focusCrops: string;
  dietFocus: string;
  notes: string;
};

const EMPTY_CREATE_FORM: CreateBatchForm = { targetCount: "", focusCrops: "", dietFocus: "", notes: "" };

function splitCsv(value: string): string[] | null {
  const items = value.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

const CREATE_OUTCOME_LABELS: Record<string, string> = {
  planned: "Plan oluşturuldu",
  already_planned: "Bu batch zaten planlanmış",
  invalid_batch_input: "Girdi geçersiz",
  batch_not_reviewable: "Batch onay bekleyen durumda değil",
  agent_call_failed: "Planlayıcı çağrısı başarısız oldu",
  invalid_output: "Planlayıcı çıktısı geçersiz",
  brief_count_mismatch: "Üretilen tarif sayısı hedeften farklı",
  structural_validation_failed: "Yapısal doğrulama başarısız",
  diversity_validation_failed: "Çeşitlilik doğrulaması başarısız",
};

// ---------------------------------------------------------------------------
// Automatic weekly schedule (mirrors admin-recipe-plan-schedule/index.ts's own response shape).
// ---------------------------------------------------------------------------

type SchedulePreset = "weekly" | "monthly" | "off" | "custom";
type ScheduleState = { schedule: string | null; active: boolean; preset: SchedulePreset };

const SCHEDULE_PRESET_LABELS: Record<SchedulePreset, string> = {
  weekly: "Haftalık — her Pazartesi 06:00",
  monthly: "Aylık — ayın 1'i, 06:00",
  off: "Kapalı",
  custom: "Özel (dashboard dışından ayarlanmış)",
};

const SCHEDULE_PRESET_CRON: Record<"weekly" | "monthly" | "off", string> = {
  weekly: "0 6 * * 1",
  monthly: "0 6 1 * *",
  off: "off",
};

class UnauthorizedActionError extends Error {}

/** POSTs/GETs an admin-recipe-plan-* function and returns the parsed body for both 2xx (`data`)
 * and non-2xx responses, since supabase-js only populates `data` on 2xx and otherwise hands back a
 * FunctionsHttpError whose `context` is the raw, unread Response — same helper shape
 * admin.recipes.plan.$batchId.tsx's own `invokeAdminPlanAction` uses, generalized over function
 * name/method so this page can call both admin-recipe-plan-create and admin-recipe-plan-schedule
 * with it. */
async function invokeAdminFn<T>(
  functionName: string,
  adminKey: string,
  options: { method: "GET" | "POST"; body?: Record<string, unknown> },
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    method: options.method,
    headers: { "x-admin-key": adminKey, "content-type": "application/json" },
    body: options.body,
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

function CreateBatchCard({ adminKey, onCreated }: { adminKey: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateBatchForm>(EMPTY_CREATE_FORM);
  const [result, setResult] = useState<RunPlanStageResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        targetCount: Number(form.targetCount),
        focusCrops: splitCsv(form.focusCrops),
        dietFocus: splitCsv(form.dietFocus) ?? [],
        notes: form.notes.trim() || null,
      };
      return invokeAdminFn<RunPlanStageResult>("admin-recipe-plan-create", adminKey, { method: "POST", body });
    },
    onSuccess: (data) => {
      setResult(data);
      const succeeded = data.outcome === "planned" || data.outcome === "already_planned";
      if (succeeded) {
        toast.success(CREATE_OUTCOME_LABELS[data.outcome] ?? data.outcome);
        setForm(EMPTY_CREATE_FORM);
        onCreated();
      } else {
        toast.error(CREATE_OUTCOME_LABELS[data.outcome] ?? data.outcome);
      }
    },
    onError: (err) => {
      toast.error(err instanceof UnauthorizedActionError ? "Hatalı anahtar" : "Plan oluşturma başarısız");
    },
  });

  const targetCountNum = Number(form.targetCount);
  const canSubmit =
    form.targetCount.trim() !== "" && Number.isInteger(targetCountNum) && targetCountNum > 0 && targetCountNum <= 25;
  const succeeded = result?.outcome === "planned" || result?.outcome === "already_planned";

  return (
    <SectionCard
      title="Yeni Plan Oluştur"
      action={
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Kapat" : "Aç"}
        </Button>
      }
    >
      {!open ? (
        <p className="text-xs text-hmuted">Elle yeni bir plan batch'i tetiklemek için açın.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit || mutation.isPending) return;
            setResult(null);
            mutation.mutate();
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs space-y-1">
              <span className="text-hmuted block">Hedef Tarif Sayısı *</span>
              <Input
                type="number"
                min={1}
                max={25}
                value={form.targetCount}
                onChange={(e) => setForm((f) => ({ ...f, targetCount: e.target.value }))}
                required
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-hmuted block">Odak Ürünler</span>
              <Input
                value={form.focusCrops}
                onChange={(e) => setForm((f) => ({ ...f, focusCrops: e.target.value }))}
                placeholder="opsiyonel, virgülle ayır"
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-hmuted block">Diyet Odağı</span>
              <Input
                value={form.dietFocus}
                onChange={(e) => setForm((f) => ({ ...f, dietFocus: e.target.value }))}
                placeholder="opsiyonel, virgülle ayır"
              />
            </label>
          </div>
          <label className="text-xs space-y-1 block">
            <span className="text-hmuted block">Not</span>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="opsiyonel"
            />
          </label>

          <Button type="submit" size="sm" disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? "Oluşturuluyor…" : "Plan Oluştur"}
          </Button>

          {result && (
            <div
              className={cn(
                "rounded-lg border px-3 py-2 text-xs",
                succeeded ? "border-[color:var(--sage)] text-[color:var(--sage)]" : "border-[color:var(--hred)] text-[color:var(--hred)]",
              )}
            >
              <div className="font-medium">{CREATE_OUTCOME_LABELS[result.outcome] ?? result.outcome}</div>
              {result.errorCode && <div className="mt-0.5 font-mono">{result.errorCode}</div>}
              {result.issues && result.issues.length > 0 && (
                <div className="mt-0.5 font-mono break-all">{JSON.stringify(result.issues)}</div>
              )}
              {result.batchId && succeeded && (
                <Link
                  to="/admin/recipes/plan/$batchId"
                  params={{ batchId: result.batchId }}
                  className="mt-1 inline-block underline font-medium"
                >
                  Batch'i görüntüle{result.briefCount != null ? ` (${result.briefCount} brief)` : ""}
                </Link>
              )}
            </div>
          )}
        </form>
      )}
    </SectionCard>
  );
}

function ScheduleCard({ adminKey }: { adminKey: string }) {
  const [pendingPreset, setPendingPreset] = useState<"weekly" | "monthly" | "off" | "">("");

  const query = useQuery({
    queryKey: ["admin-recipe-plan-schedule", adminKey],
    retry: false,
    queryFn: () => invokeAdminFn<ScheduleState>("admin-recipe-plan-schedule", adminKey, { method: "GET" }),
  });

  const mutation = useMutation({
    mutationFn: (preset: "weekly" | "monthly" | "off") =>
      invokeAdminFn<ScheduleState>("admin-recipe-plan-schedule", adminKey, {
        method: "POST",
        body: { cronExpression: SCHEDULE_PRESET_CRON[preset] },
      }),
    onSuccess: (data) => {
      toast.success(`Sıklık güncellendi: ${SCHEDULE_PRESET_LABELS[data.preset]}`);
      setPendingPreset("");
      query.refetch();
    },
    onError: (err) => {
      toast.error(err instanceof UnauthorizedActionError ? "Hatalı anahtar" : "Sıklık güncellenemedi");
    },
  });

  const current = query.data?.preset;
  const selectValue = pendingPreset || (current === "weekly" || current === "monthly" || current === "off" ? current : "");

  return (
    <SectionCard title="Otomatik Plan Sıklığı">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm min-w-[220px]">
          {query.isLoading
            ? "Yükleniyor…"
            : query.isError
              ? "Durum okunamadı"
              : `Şu an: ${SCHEDULE_PRESET_LABELS[query.data!.preset]}`}
        </div>
        <select
          value={selectValue}
          onChange={(e) => setPendingPreset(e.target.value as "weekly" | "monthly" | "off")}
          className="rounded-lg border px-3 py-2 text-sm bg-background"
        >
          <option value="" disabled>Seçin…</option>
          <option value="weekly">Haftalık</option>
          <option value="monthly">Aylık</option>
          <option value="off">Kapalı</option>
        </select>
        <Button
          type="button"
          size="sm"
          disabled={!pendingPreset || mutation.isPending}
          onClick={() => pendingPreset && mutation.mutate(pendingPreset)}
        >
          {mutation.isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </SectionCard>
  );
}

function AdminRecipePlanBatchesPage() {
  const queryClient = useQueryClient();
  const [key, setKey] = useState("");
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const [reviewStatusFilter, setReviewStatusFilter] = useState<ReviewStatus | "">("");

  useEffect(() => {
    const stored = sessionStorage.getItem(ADMIN_RECIPE_KEY_STORAGE);
    if (stored) setSubmittedKey(stored);
  }, []);

  const query = useQuery({
    queryKey: ["admin-recipe-plan-batches", submittedKey, reviewStatusFilter],
    enabled: !!submittedKey,
    retry: false,
    queryFn: async (): Promise<BatchesResponse> => {
      const params = new URLSearchParams();
      if (reviewStatusFilter) params.set("reviewStatus", reviewStatusFilter);
      const { data, error } = await supabase.functions.invoke(
        `admin-recipe-plan-batches${params.toString() ? `?${params.toString()}` : ""}`,
        { method: "GET", headers: { "x-admin-key": submittedKey! } },
      );
      if (error) {
        const anyErr = error as { context?: { status?: number }; status?: number; message?: string };
        const status = anyErr.context?.status ?? anyErr.status;
        if (status === 401 || status === 403) {
          toast.error("Hatalı anahtar");
          sessionStorage.removeItem(ADMIN_RECIPE_KEY_STORAGE);
        } else {
          toast.error(`Bağlantı hatası: ${anyErr.message ?? "bilinmiyor"}`);
        }
        setSubmittedKey(null);
        throw error;
      }
      return data as BatchesResponse;
    },
  });

  if (!submittedKey || query.isError) {
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
          <h1 className="font-serif text-xl">Admin — Plan İnceleme</h1>
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

  const batches = query.data?.batches ?? [];
  const pendingCount = batches.filter((b) => b.reviewStatus === "pending_review").length;
  const approvedCount = batches.filter((b) => b.reviewStatus === "approved").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <Link to="/admin/recipes" className="text-xs text-hmuted underline">← İş listesi</Link>
            <h1 className="font-serif text-2xl mt-1">Plan İnceleme — Batch Listesi</h1>
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem(ADMIN_RECIPE_KEY_STORAGE);
              setSubmittedKey(null);
              setKey("");
            }}
            className="text-xs text-hmuted underline"
          >
            Çıkış
          </button>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Toplam batch" accent="gold" value={query.data?.total ?? 0} />
          <StatCard label="Onay bekleyen" accent="saffron" value={pendingCount} />
          <StatCard label="Onaylanan" accent="sage" value={approvedCount} />
        </div>

        <CreateBatchCard
          adminKey={submittedKey}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["admin-recipe-plan-batches"] })}
        />

        <ScheduleCard adminKey={submittedKey} />

        <div className="flex flex-wrap gap-3">
          <select
            value={reviewStatusFilter}
            onChange={(e) => setReviewStatusFilter(e.target.value as ReviewStatus | "")}
            className="rounded-lg border px-3 py-2 text-sm bg-background"
          >
            <option value="">Tüm durumlar</option>
            {REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>{REVIEW_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <SectionCard title="Planlar">
          {query.isLoading ? (
            <div className="py-8 text-center text-sm text-hmuted">Yükleniyor…</div>
          ) : batches.length === 0 ? (
            <div className="py-8 text-center text-sm text-hmuted">Henüz plan yok</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-hmuted">
                  <tr className="border-b">
                    <th className="text-left py-2 pr-3">Hedef Sayı / Odak Ürünler</th>
                    <th className="text-left py-2 px-3">Diyet Odağı</th>
                    <th className="text-left py-2 px-3">Dil</th>
                    <th className="text-left py-2 px-3">Not</th>
                    <th className="text-left py-2 px-3">Planlayıcı Model</th>
                    <th className="text-left py-2 px-3">Planlandı</th>
                    <th className="text-left py-2 px-3">Durum</th>
                    <th className="text-right py-2 px-3">Brief / Hariç</th>
                    <th className="text-left py-2 pl-3">Oluşturuldu</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-2 pr-3">
                        <Link
                          to="/admin/recipes/plan/$batchId"
                          params={{ batchId: batch.id }}
                          className="font-medium hover:underline"
                        >
                          {batch.targetCount} tarif
                        </Link>
                        {batch.focusCrops && batch.focusCrops.length > 0 && (
                          <div className="text-xs text-hmuted">{batch.focusCrops.join(", ")}</div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-xs">
                        {batch.dietFocus.length > 0 ? batch.dietFocus.join(", ") : "—"}
                      </td>
                      <td className="py-2 px-3 text-xs font-mono">{batch.locale}</td>
                      <td className="py-2 px-3 text-xs max-w-[220px] truncate" title={batch.notes ?? undefined}>
                        {batch.notes ?? "—"}
                      </td>
                      <td className="py-2 px-3 text-xs font-mono">{batch.plannerModel ?? "—"}</td>
                      <td className="py-2 px-3 text-xs text-hmuted font-mono">
                        {batch.plannedAt ? new Date(batch.plannedAt).toLocaleString("tr-TR") : "—"}
                      </td>
                      <td className="py-2 px-3">
                        <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs", REVIEW_STATUS_STYLES[batch.reviewStatus])}>
                          {REVIEW_STATUS_LABELS[batch.reviewStatus]}
                        </span>
                      </td>
                      <td className="text-right py-2 px-3 font-mono">{batch.briefCount} / {batch.excludedCount}</td>
                      <td className="py-2 pl-3 text-xs text-hmuted font-mono">
                        {new Date(batch.createdAt).toLocaleString("tr-TR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
