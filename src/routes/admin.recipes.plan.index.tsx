import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/hasat/common/SectionCard";
import { StatCard } from "@/components/hasat/common/StatCard";
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

function AdminRecipePlanBatchesPage() {
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
