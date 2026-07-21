import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/hasat/common/StatCard";
import { SectionCard } from "@/components/hasat/common/SectionCard";
import { formatTRY } from "@/lib/hasat/format";

export const Route = createFileRoute("/admin/kpi")({
  head: () => ({
    meta: [
      { title: "Admin KPI" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminKpiPage,
});

type NorthStar = { month: string; total_gmv: number; dispute_free_gmv: number; dispute_free_share_pct: number };
type DisputeRow = { month: string; delivered_or_completed_orders: number; disputed_orders: number; dispute_rate_pct: number };
type FullAccRow = { month: string; delivered_or_completed_orders: number; fully_accepted_orders: number; full_acceptance_rate_pct: number };
type RepeatRow = { segment: string; active_buyers: number; repeat_buyers: number; repeat_buyer_rate_pct: number };
type ReviewRow = { reviewee_role: string | null; reviewee_id: string | null; review_count: number; avg_rating: number };
type KpiResponse = {
  north_star: NorthStar[] | null;
  dispute_rate: DisputeRow[] | null;
  full_acceptance_rate: FullAccRow[] | null;
  buyer_repeat_rate: RepeatRow[] | null;
  review_avg: ReviewRow[] | null;
  totals: { order_count: number; total_gmv: number };
};

const SEGMENT_LABELS: Record<string, string> = {
  bireysel: "Bireysel",
  restoran: "Restoran",
  otel: "Otel",
  organik_market: "Organik Market",
  "ihracatçı": "İhracatçı",
  ihracatci: "İhracatçı",
  genel: "Genel",
};

const ROLE_LABELS: Record<string, string> = {
  farmer: "Çiftçi",
  buyer: "Alıcı",
  general: "Genel",
};

function AdminKpiPage() {
  const [key, setKey] = useState("");
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-kpi", submittedKey],
    enabled: !!submittedKey,
    retry: false,
    queryFn: async (): Promise<KpiResponse> => {
      const { data, error } = await supabase.functions.invoke("admin-kpi", {
        method: "GET",
        headers: { "x-admin-key": submittedKey! },
      });
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status;
        if (status === 401) {
          toast.error("Hatalı anahtar");
          setSubmittedKey(null);
        }
        throw error;
      }
      return data as KpiResponse;
    },
  });

  if (!submittedKey || query.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <form
          onSubmit={(e) => { e.preventDefault(); if (key.trim()) setSubmittedKey(key.trim()); }}
          className="w-full max-w-sm rounded-2xl border bg-card p-6 space-y-4"
        >
          <h1 className="font-serif text-xl">Admin KPI</h1>
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

  if (query.isLoading || !query.data) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-hmuted">Yükleniyor…</div>;
  }

  const d = query.data;
  const lastNs = d.north_star?.[d.north_star.length - 1];
  const lastDispute = d.dispute_rate?.[d.dispute_rate.length - 1];
  const lastFull = d.full_acceptance_rate?.[d.full_acceptance_rate.length - 1];

  const fmtPct = (n: number | undefined | null) =>
    n == null ? "—" : `${Number(n).toFixed(1)}%`;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="font-serif text-2xl">Admin KPI Dashboard</h1>
          <button
            onClick={() => { setSubmittedKey(null); setKey(""); }}
            className="text-xs text-hmuted underline"
          >Çıkış</button>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Toplam GMV (tüm zamanlar)" value={formatTRY(d.totals?.total_gmv ?? 0)} accent="gold" />
          <StatCard label="Bu ay ihtilafsız pay" value={fmtPct(lastNs?.dispute_free_share_pct)} accent="sage" />
          <StatCard label="Bu ay tam kabul oranı" value={fmtPct(lastFull?.full_acceptance_rate_pct)} accent="saffron" />
        </div>

        <SectionCard title="North Star — Aylık GMV">
          {d.north_star && d.north_star.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.north_star}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatTRY(Number(v))} width={80} />
                  <Tooltip formatter={(v) => formatTRY(Number(v))} />
                  <Legend />
                  <Line type="monotone" dataKey="total_gmv" name="Toplam GMV" stroke="var(--gold)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="dispute_free_gmv" name="İhtilafsız GMV" stroke="var(--sage)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </SectionCard>

        <SectionCard title="İhtilaf & Tam Kabul Oranı (aylık %)">
          {(d.dispute_rate && d.dispute_rate.length > 0) || (d.full_acceptance_rate && d.full_acceptance_rate.length > 0) ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mergeByMonth(d.dispute_rate ?? [], d.full_acceptance_rate ?? [])}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                  <Legend />
                  <Line type="monotone" dataKey="dispute_rate_pct" name="İhtilaf oranı" stroke="var(--hred)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="full_acceptance_rate_pct" name="Tam kabul oranı" stroke="var(--sage)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
          {lastDispute ? (
            <div className="mt-2 text-xs text-hmuted">Son ay: {lastDispute.disputed_orders} ihtilaf / {lastDispute.delivered_or_completed_orders} sipariş</div>
          ) : null}
        </SectionCard>

        <SectionCard title="Alıcı Tekrar Oranı — Segment">
          {d.buyer_repeat_rate && d.buyer_repeat_rate.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.buyer_repeat_rate.map((r) => ({ ...r, label: SEGMENT_LABELS[r.segment] ?? r.segment }))}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                  <Bar dataKey="repeat_buyer_rate_pct" name="Tekrar oranı" fill="var(--saffron)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </SectionCard>

        <SectionCard title="Genel Değerlendirme Ortalaması">
          {d.review_avg && d.review_avg.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {d.review_avg.map((r, i) => (
                <div key={i} className="rounded-xl border p-4">
                  <div className="text-xs text-hmuted">{ROLE_LABELS[r.reviewee_role ?? "general"] ?? (r.reviewee_role ?? "Genel")}</div>
                  <div className="mt-1 font-mono text-xl">⭐ {Number(r.avg_rating ?? 0).toFixed(1)}</div>
                  <div className="text-xs text-hmuted">{r.review_count} değerlendirme</div>
                </div>
              ))}
            </div>
          ) : <EmptyState />}
        </SectionCard>
      </div>
    </div>
  );
}

function EmptyState() {
  return <div className="py-8 text-center text-sm text-hmuted">Henüz veri yok</div>;
}

function mergeByMonth(a: DisputeRow[], b: FullAccRow[]) {
  const map = new Map<string, { month: string; dispute_rate_pct?: number; full_acceptance_rate_pct?: number }>();
  for (const r of a) map.set(r.month, { month: r.month, dispute_rate_pct: r.dispute_rate_pct });
  for (const r of b) {
    const existing = map.get(r.month) ?? { month: r.month };
    existing.full_acceptance_rate_pct = r.full_acceptance_rate_pct;
    map.set(r.month, existing);
  }
  return Array.from(map.values()).sort((x, y) => x.month.localeCompare(y.month));
}
