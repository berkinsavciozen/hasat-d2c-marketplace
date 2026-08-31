import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/hasat/common/SectionCard";
import { StatCard } from "@/components/hasat/common/StatCard";
import { cn } from "@/lib/utils";
import { ADMIN_RECIPE_KEY_STORAGE } from "./admin.recipes";

export const Route = createFileRoute("/admin/recipes/")({
  head: () => ({
    meta: [
      { title: "Admin — Tarif Otomasyonu" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminRecipeJobsPage,
});

const RECIPE_JOB_STAGES = ["plan", "write", "qa", "revise", "image", "finalize", "awaiting_approval", "publish"] as const;
const RECIPE_JOB_STATUSES = ["queued", "running", "retryable", "failed", "awaiting_approval", "approved", "rejected", "completed", "cancelled"] as const;

type RecipeJobStage = (typeof RECIPE_JOB_STAGES)[number];
type RecipeJobStatus = (typeof RECIPE_JOB_STATUSES)[number];

type RecipeJobListItem = {
  id: string;
  batchId: string;
  briefId: string;
  workingTitle: string;
  focusCrop: string | null;
  stage: RecipeJobStage;
  status: RecipeJobStatus;
  revisionCount: number;
  attempt: number;
  maxAttempts: number;
  lastError: { code: string; message: string } | null;
  latestQaScore: number | null;
  latestQaDecision: string | null;
  createdAt: string;
  updatedAt: string;
};

type JobsResponse = { jobs: RecipeJobListItem[]; total: number };

const STAGE_LABELS: Record<RecipeJobStage, string> = {
  plan: "Planlama",
  write: "Yazım",
  qa: "QA",
  revise: "Revizyon",
  image: "Görsel",
  finalize: "Finalize",
  awaiting_approval: "Onay Bekliyor",
  publish: "Yayın",
};

const STATUS_STYLES: Record<RecipeJobStatus, string> = {
  queued: "bg-[color-mix(in_oklab,var(--sage)_15%,transparent)] text-[color:var(--sage)]",
  running: "bg-[color-mix(in_oklab,var(--gold)_15%,transparent)] text-[color:var(--gold)]",
  retryable: "bg-[color-mix(in_oklab,var(--saffron)_18%,transparent)] text-[color:var(--saffron)]",
  failed: "bg-[color-mix(in_oklab,var(--hred)_15%,transparent)] text-[color:var(--hred)]",
  awaiting_approval: "bg-[color-mix(in_oklab,var(--saffron)_25%,transparent)] text-[color:var(--saffron)] font-semibold",
  approved: "bg-[color-mix(in_oklab,var(--sage)_25%,transparent)] text-[color:var(--sage)] font-semibold",
  rejected: "bg-[color-mix(in_oklab,var(--hred)_20%,transparent)] text-[color:var(--hred)]",
  completed: "bg-[color-mix(in_oklab,var(--sage)_20%,transparent)] text-[color:var(--sage)]",
  cancelled: "bg-muted text-hmuted",
};

const STATUS_LABELS: Record<RecipeJobStatus, string> = {
  queued: "Kuyrukta",
  running: "Çalışıyor",
  retryable: "Tekrar denenecek",
  failed: "Başarısız",
  awaiting_approval: "Onay Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  completed: "Tamamlandı",
  cancelled: "İptal",
};

function AdminRecipeJobsPage() {
  const [key, setKey] = useState("");
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<RecipeJobStage | "">("");
  const [statusFilter, setStatusFilter] = useState<RecipeJobStatus | "">("");

  useEffect(() => {
    const stored = sessionStorage.getItem(ADMIN_RECIPE_KEY_STORAGE);
    if (stored) setSubmittedKey(stored);
  }, []);

  const query = useQuery({
    queryKey: ["admin-recipe-jobs", submittedKey, stageFilter, statusFilter],
    enabled: !!submittedKey,
    retry: false,
    queryFn: async (): Promise<JobsResponse> => {
      const params = new URLSearchParams();
      if (stageFilter) params.set("stage", stageFilter);
      if (statusFilter) params.set("status", statusFilter);
      const { data, error } = await supabase.functions.invoke(
        `admin-recipe-jobs${params.toString() ? `?${params.toString()}` : ""}`,
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
      return data as JobsResponse;
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
          <h1 className="font-serif text-xl">Admin — Tarif Otomasyonu</h1>
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

  const jobs = query.data?.jobs ?? [];
  const awaitingCount = jobs.filter((j) => j.status === "awaiting_approval").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="font-serif text-2xl">Tarif Otomasyonu — İş Listesi</h1>
          <div className="flex items-center gap-4">
            <Link to="/admin/recipes/plan" className="text-xs text-hmuted underline">
              Plan İnceleme
            </Link>
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
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Toplam iş" accent="gold" value={query.data?.total ?? 0} />
          <StatCard label="Onay bekleyen" accent="saffron" value={awaitingCount} />
          <StatCard label="Başarısız" accent="hred" value={failedCount} />
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as RecipeJobStage | "")}
            className="rounded-lg border px-3 py-2 text-sm bg-background"
          >
            <option value="">Tüm aşamalar</option>
            {RECIPE_JOB_STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RecipeJobStatus | "")}
            className="rounded-lg border px-3 py-2 text-sm bg-background"
          >
            <option value="">Tüm durumlar</option>
            {RECIPE_JOB_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <SectionCard title="İşler">
          {query.isLoading ? (
            <div className="py-8 text-center text-sm text-hmuted">Yükleniyor…</div>
          ) : jobs.length === 0 ? (
            <div className="py-8 text-center text-sm text-hmuted">Henüz iş yok</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-hmuted">
                  <tr className="border-b">
                    <th className="text-left py-2 pr-3">Başlık</th>
                    <th className="text-left py-2 px-3">Aşama</th>
                    <th className="text-left py-2 px-3">Durum</th>
                    <th className="text-right py-2 px-3">Revizyon</th>
                    <th className="text-right py-2 px-3">Deneme</th>
                    <th className="text-right py-2 px-3">QA Skoru</th>
                    <th className="text-left py-2 px-3">Son Hata</th>
                    <th className="text-left py-2 pl-3">Güncelleme</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-2 pr-3">
                        <Link
                          to="/admin/recipes/$jobId"
                          params={{ jobId: job.id }}
                          className="font-medium hover:underline"
                        >
                          {job.workingTitle}
                        </Link>
                        {job.focusCrop && <div className="text-xs text-hmuted">{job.focusCrop}</div>}
                      </td>
                      <td className="py-2 px-3">{STAGE_LABELS[job.stage]}</td>
                      <td className="py-2 px-3">
                        <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs", STATUS_STYLES[job.status])}>
                          {STATUS_LABELS[job.status]}
                        </span>
                      </td>
                      <td className="text-right py-2 px-3 font-mono">{job.revisionCount} / 2</td>
                      <td className="text-right py-2 px-3 font-mono">{job.attempt} / {job.maxAttempts}</td>
                      <td className="text-right py-2 px-3 font-mono">
                        {job.latestQaScore != null ? job.latestQaScore.toFixed(0) : "—"}
                      </td>
                      <td className="py-2 px-3 text-xs max-w-[220px] truncate" title={job.lastError?.message ?? undefined}>
                        {job.lastError ? `${job.lastError.code}` : "—"}
                      </td>
                      <td className="py-2 pl-3 text-xs text-hmuted font-mono">
                        {new Date(job.updatedAt).toLocaleString("tr-TR")}
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
