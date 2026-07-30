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
import { cn } from "@/lib/utils";

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

type FarmerActivation = { total_farmers: number; farmers_with_listing: number; median_hours_to_first_listing: number | null; pct_listing_within_7d: number | null };
type ListingOfferRate = { eligible_listings: number; listings_with_offer_14d: number; offer_rate_14d_pct: number | null; median_hours_to_first_offer: number | null };
type FarmerSellthrough = { eligible_listings: number; sold_within_30d: number; sellthrough_30d_pct: number | null };
type FarmerVerifiedPct = { active_farmer_count: number; verified_active_farmer_count: number; verified_pct: number | null };
type BuyerActivation = { total_buyers: number; buyers_with_order: number; median_days_to_first_order: number | null };
type HorecaFrequency = { horeca_buyers_with_2plus_orders: number; avg_weekly_order_frequency: number | null; median_weekly_order_frequency: number | null };
type SupplyDensity = { total_cells: number; dense_cells: number; dense_cell_pct: number | null };
type OfferConversion = { total_offers: number; converted_offers: number; conversion_pct: number | null; median_hours_offer_to_order: number | null };
type FarmerGmvRow = { month: string; active_farmers: number; total_gmv: number; gmv_per_active_farmer: number };
type FarmerRetentionRow = { cohort_month: string; cohort_farmers: number; retained_m1: number; retained_m3: number; m1_retention_pct: number | null; m3_retention_pct: number | null };
type BuyerAovRow = { segment: string; realized_order_count: number; aov: number | null };
type BuyerGmvRetRow = { cohort_month: string; cohort_buyers: number; m0_gmv_total: number; m1_gmv_total: number; m1_gmv_retention_pct: number | null };
type BuyerSellerRatioRow = { region: string; active_buyer_count: number; active_farmer_count: number; buyer_to_seller_ratio: number | null };
type PriceVsMarketRow = { crop: string; month: string; hasat_avg_price: number | null; market_avg_price: number | null; price_diff_pct: number | null };
type CropDemandHeatmapRow = {
  crop: string;
  crop_display_name: string;
  key_ingredient_recipe_count: number;
  requester_count: number;
  total_quantity_normalized: number | null;
  normalized_unit: string | null;
  regions: string[];
  requested_recipe_titles: string[];
  has_active_listing: boolean;
};

type KpiResponse = {
  north_star: NorthStar[] | null;
  dispute_rate: DisputeRow[] | null;
  full_acceptance_rate: FullAccRow[] | null;
  buyer_repeat_rate: RepeatRow[] | null;
  review_avg: ReviewRow[] | null;
  totals: { order_count: number; total_gmv: number };
  farmer_activation: FarmerActivation | null;
  listing_offer_rate: ListingOfferRate | null;
  farmer_sellthrough: FarmerSellthrough | null;
  farmer_verified_pct: FarmerVerifiedPct | null;
  buyer_activation: BuyerActivation | null;
  horeca_order_frequency: HorecaFrequency | null;
  supply_density: SupplyDensity | null;
  offer_conversion: OfferConversion | null;
  farmer_gmv: FarmerGmvRow[] | null;
  farmer_retention: FarmerRetentionRow[] | null;
  buyer_aov_segment: BuyerAovRow[] | null;
  buyer_gmv_retention: BuyerGmvRetRow[] | null;
  buyer_seller_ratio: BuyerSellerRatioRow[] | null;
  price_vs_market: PriceVsMarketRow[] | null;
  crop_demand_heatmap: CropDemandHeatmapRow[] | null;
};

const SEGMENT_LABELS: Record<string, string> = {
  bireysel: "Bireysel",
  restoran: "Restoran",
  otel: "Otel",
  organik_market: "Organik Market",
  "ihracatçı": "İhracatçı",
  ihracatci: "İhracatçı",
  bilinmiyor: "Bilinmiyor",
  genel: "Genel",
};

const ROLE_LABELS: Record<string, string> = {
  farmer: "Çiftçi",
  buyer: "Alıcı",
  general: "Genel",
};

type Tab = "genel" | "ciftci" | "alici" | "platform" | "talep";

function AdminKpiPage() {
  const [key, setKey] = useState("");
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("genel");

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
        console.log(
          "[admin-kpi] invoke error:",
          JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
        );
        const anyErr = error as {
          context?: { status?: number; response?: { status?: number } } & Partial<Response>;
          status?: number;
          message?: string;
        };
        let status: number | undefined =
          anyErr.context?.status ??
          anyErr.status ??
          anyErr.context?.response?.status;
        if (!status && anyErr.context && typeof anyErr.context.status === "number") {
          status = anyErr.context.status;
        }
        if (!status && typeof anyErr.message === "string") {
          const m = anyErr.message.match(/\b(4\d{2}|5\d{2})\b/);
          if (m) status = Number(m[1]);
        }

        if (status === 401 || status === 403) {
          toast.error("Hatalı anahtar");
        } else if (status && status >= 500) {
          toast.error(`Sunucu hatası (${status}): ${anyErr.message ?? "bilinmiyor"}`);
        } else {
          toast.error(`Bağlantı hatası: ${anyErr.message ?? "bilinmiyor"}`);
        }
        setSubmittedKey(null);
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

        <nav className="flex gap-1 border-b overflow-x-auto">
          {([
            ["genel", "Genel"],
            ["ciftci", "Çiftçi"],
            ["alici", "Alıcı"],
            ["platform", "Platform"],
            ["talep", "Talep Isı Haritası"],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
                tab === id ? "border-primary text-primary" : "border-transparent text-hmuted hover:text-foreground"
              )}
            >{label}</button>
          ))}
        </nav>

        {tab === "genel" && <GenelTab d={d} />}
        {tab === "ciftci" && <CiftciTab d={d} />}
        {tab === "alici" && <AliciTab d={d} />}
        {tab === "platform" && <PlatformTab d={d} />}
        {tab === "talep" && <TalepTab d={d} />}
      </div>
    </div>
  );
}

function fmtPct(n: number | undefined | null) {
  return n == null ? "—" : `${Number(n).toFixed(1)}%`;
}
function fmtNum(n: number | undefined | null, digits = 1) {
  return n == null ? "—" : Number(n).toFixed(digits);
}

function GenelTab({ d }: { d: KpiResponse }) {
  const lastNs = d.north_star?.[d.north_star.length - 1];
  const lastDispute = d.dispute_rate?.[d.dispute_rate.length - 1];
  const lastFull = d.full_acceptance_rate?.[d.full_acceptance_rate.length - 1];

  return (
    <div className="space-y-6">
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
  );
}

function CiftciTab({ d }: { d: KpiResponse }) {
  const fa = d.farmer_activation;
  const lor = d.listing_offer_rate;
  const st = d.farmer_sellthrough;
  const vp = d.farmer_verified_pct;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Aktivasyon"
          accent="saffron"
          value={
            <div>
              <div>{fmtNum(fa?.median_hours_to_first_listing)} sa</div>
              <div className="text-xs text-hmuted mt-1">7g içinde ilan {fmtPct(fa?.pct_listing_within_7d)}</div>
            </div>
          }
        />
        <StatCard
          label="İlan → Teklif (14g)"
          accent="gold"
          value={
            <div>
              <div>{fmtPct(lor?.offer_rate_14d_pct)}</div>
              <div className="text-xs text-hmuted mt-1">medyan {fmtNum(lor?.median_hours_to_first_offer)} sa</div>
            </div>
          }
        />
        <StatCard
          label="Sell-through (30g)"
          accent="sage"
          value={fmtPct(st?.sellthrough_30d_pct)}
        />
        <StatCard
          label="Doğrulanmış üretici"
          accent="saffron"
          value={
            <div>
              <div>{fmtPct(vp?.verified_pct)}</div>
              <div className="text-xs text-hmuted mt-1">{vp?.verified_active_farmer_count ?? 0} / {vp?.active_farmer_count ?? 0}</div>
            </div>
          }
        />
      </div>

      <SectionCard title="Aylık GMV / Aktif Çiftçi">
        {d.farmer_gmv && d.farmer_gmv.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.farmer_gmv}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatTRY(Number(v))} width={80} />
                <Tooltip formatter={(v) => formatTRY(Number(v))} />
                <Line type="monotone" dataKey="gmv_per_active_farmer" name="GMV / aktif çiftçi" stroke="var(--gold)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyState />}
      </SectionCard>

      <SectionCard title="Kohort Retention (M1 / M3)">
        {d.farmer_retention && d.farmer_retention.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-hmuted">
                <tr className="border-b">
                  <th className="text-left py-2 pr-3">Kohort</th>
                  <th className="text-right py-2 px-3">Çiftçi</th>
                  <th className="text-right py-2 px-3">M1 %</th>
                  <th className="text-right py-2 pl-3">M3 %</th>
                </tr>
              </thead>
              <tbody>
                {d.farmer_retention.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{r.cohort_month}</td>
                    <td className="text-right py-2 px-3">{r.cohort_farmers}</td>
                    <td className="text-right py-2 px-3">{fmtPct(r.m1_retention_pct)}</td>
                    <td className="text-right py-2 pl-3">{fmtPct(r.m3_retention_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState />}
      </SectionCard>
    </div>
  );
}

function AliciTab({ d }: { d: KpiResponse }) {
  const ba = d.buyer_activation;
  const horeca = d.horeca_order_frequency;
  const aovRows = (d.buyer_aov_segment ?? []).filter((r) => r.segment !== "genel");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Aktivasyon (medyan gün)"
          accent="saffron"
          value={
            <div>
              <div>{fmtNum(ba?.median_days_to_first_order)} gün</div>
              <div className="text-xs text-hmuted mt-1">{ba?.buyers_with_order ?? 0} / {ba?.total_buyers ?? 0} alıcı</div>
            </div>
          }
        />
        <StatCard
          label="HoReCa haftalık sıklık"
          accent="gold"
          value={
            <div>
              <div>medyan {fmtNum(horeca?.median_weekly_order_frequency, 2)}</div>
              <div className="text-xs text-hmuted mt-1">ort {fmtNum(horeca?.avg_weekly_order_frequency, 2)}</div>
            </div>
          }
        />
        <StatCard
          label="HoReCa 2+ siparişli alıcı"
          accent="sage"
          value={horeca?.horeca_buyers_with_2plus_orders ?? 0}
        />
      </div>

      <SectionCard title="Segment AOV">
        {aovRows.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aovRows.map((r) => ({ ...r, label: SEGMENT_LABELS[r.segment] ?? r.segment }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatTRY(Number(v))} width={80} />
                <Tooltip formatter={(v) => formatTRY(Number(v))} />
                <Bar dataKey="aov" name="Ortalama sipariş tutarı" fill="var(--saffron)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyState />}
      </SectionCard>

      <SectionCard title="M0 → M1 GMV Retention">
        {d.buyer_gmv_retention && d.buyer_gmv_retention.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-hmuted">
                <tr className="border-b">
                  <th className="text-left py-2 pr-3">Kohort</th>
                  <th className="text-right py-2 px-3">Alıcı</th>
                  <th className="text-right py-2 px-3">M0 GMV</th>
                  <th className="text-right py-2 px-3">M1 GMV</th>
                  <th className="text-right py-2 pl-3">M1 %</th>
                </tr>
              </thead>
              <tbody>
                {d.buyer_gmv_retention.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{r.cohort_month}</td>
                    <td className="text-right py-2 px-3">{r.cohort_buyers}</td>
                    <td className="text-right py-2 px-3 font-mono">{formatTRY(Number(r.m0_gmv_total) || 0)}</td>
                    <td className="text-right py-2 px-3 font-mono">{formatTRY(Number(r.m1_gmv_total) || 0)}</td>
                    <td className="text-right py-2 pl-3">{fmtPct(r.m1_gmv_retention_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState />}
      </SectionCard>
    </div>
  );
}

function PlatformTab({ d }: { d: KpiResponse }) {
  const oc = d.offer_conversion;
  const sd = d.supply_density;
  const bsr = (d.buyer_seller_ratio ?? []).filter((r) => r.region !== "genel");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Teklif → Sipariş"
          accent="gold"
          value={
            <div>
              <div>{fmtPct(oc?.conversion_pct)}</div>
              <div className="text-xs text-hmuted mt-1">medyan {fmtNum(oc?.median_hours_offer_to_order)} sa</div>
            </div>
          }
        />
        <StatCard
          label="Tedarik yoğunluğu (il × ürün)"
          accent="sage"
          value={
            <div>
              <div>{fmtPct(sd?.dense_cell_pct)}</div>
              <div className="text-xs text-hmuted mt-1">{sd?.dense_cells ?? 0} / {sd?.total_cells ?? 0} hücre</div>
            </div>
          }
        />
        <StatCard
          label="Toplam teklif"
          accent="saffron"
          value={oc?.total_offers ?? 0}
        />
      </div>

      <SectionCard title="Alıcı : Satıcı Oranı (il)">
        {bsr.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bsr}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="region" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => Number(v).toFixed(2)} />
                <Bar dataKey="buyer_to_seller_ratio" name="Alıcı / Satıcı" fill="var(--gold)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyState />}
      </SectionCard>

      <SectionCard title="Hal Fiyatı Karşılaştırması">
        {d.price_vs_market && d.price_vs_market.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-hmuted">
                <tr className="border-b">
                  <th className="text-left py-2 pr-3">Ürün</th>
                  <th className="text-left py-2 px-3">Ay</th>
                  <th className="text-right py-2 px-3">Hasat</th>
                  <th className="text-right py-2 px-3">Hal</th>
                  <th className="text-right py-2 pl-3">Fark %</th>
                </tr>
              </thead>
              <tbody>
                {d.price_vs_market.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-3">{r.crop}</td>
                    <td className="py-2 px-3 font-mono text-xs">{r.month}</td>
                    <td className="text-right py-2 px-3 font-mono">{r.hasat_avg_price != null ? formatTRY(Number(r.hasat_avg_price)) : "—"}</td>
                    <td className="text-right py-2 px-3 font-mono">{r.market_avg_price != null ? formatTRY(Number(r.market_avg_price)) : "—"}</td>
                    <td className="text-right py-2 pl-3">{fmtPct(r.price_diff_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-hmuted">
            Henüz veri yok — yalnızca İzmir pilot ürünlerinde (domates/elma/patates) satır oluşur.
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/**
 * P23-M4-b — çiftçi kazanım öncelik listesi. `v_kpi_crop_demand_heatmap`
 * (service_role-only, kural #110) iki sinyali birleştiriyor: gerçek buyer
 * talebi (crop_requests, "Talep Et") ve tarif-korpusu sinyali (kaç yayınlanmış
 * tarifte bu crop temel malzeme). İkinci sinyal talep sayısı sıfır olsa bile
 * yüzeye çıkar — "zeytinyağı 9 tarifte temel malzeme ama aktif ilanı yok"
 * gibi bir satır kimse talep açmamış olsa da görünür.
 */
function TalepTab({ d }: { d: KpiResponse }) {
  const rows = d.crop_demand_heatmap ?? [];
  const gapRows = rows.filter((r) => !r.has_active_listing && (r.key_ingredient_recipe_count > 0 || r.requester_count > 0));
  const totalRequesters = rows.reduce((s, r) => s + r.requester_count, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Toplam talep eden alıcı" accent="saffron" value={totalRequesters} />
        <StatCard label="İzlenen crop sayısı" accent="gold" value={rows.length} />
        <StatCard
          label="Aktif ilanı olmayan öncelikli crop"
          accent="sage"
          value={gapRows.length}
        />
      </div>

      <SectionCard title="Çiftçi Kazanım Öncelik Listesi">
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-hmuted">
                <tr className="border-b">
                  <th className="text-left py-2 pr-3">Ürün</th>
                  <th className="text-right py-2 px-3">Talep eden</th>
                  <th className="text-right py-2 px-3">Toplam miktar</th>
                  <th className="text-left py-2 px-3">Bölgeler</th>
                  <th className="text-left py-2 px-3">Tarif korpusu</th>
                  <th className="text-left py-2 px-3">Talep eden tarifler</th>
                  <th className="text-center py-2 pl-3">Aktif ilan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isGap = !r.has_active_listing && (r.key_ingredient_recipe_count > 0 || r.requester_count > 0);
                  return (
                    <tr key={r.crop} className={cn("border-b last:border-0", isGap && "bg-[color-mix(in_oklab,var(--saffron)_10%,transparent)]")}>
                      <td className="py-2 pr-3 font-medium">{r.crop_display_name}</td>
                      <td className="text-right py-2 px-3 font-mono">{r.requester_count}</td>
                      <td className="text-right py-2 px-3 font-mono">
                        {r.total_quantity_normalized != null
                          ? `${fmtNum(r.total_quantity_normalized, 1)} ${r.normalized_unit ?? ""}`
                          : "—"}
                      </td>
                      <td className="py-2 px-3 text-xs">{r.regions.length > 0 ? r.regions.join(", ") : "—"}</td>
                      <td className="py-2 px-3 text-xs">
                        {r.key_ingredient_recipe_count > 0 ? `${r.key_ingredient_recipe_count} tarifte temel malzeme` : "—"}
                      </td>
                      <td className="py-2 px-3 text-xs max-w-[240px] truncate" title={r.requested_recipe_titles.join(", ")}>
                        {r.requested_recipe_titles.length > 0 ? r.requested_recipe_titles.join(", ") : "—"}
                      </td>
                      <td className="text-center py-2 pl-3">
                        {r.has_active_listing ? "✅" : <span className="font-semibold" style={{ color: "var(--saffron)" }}>Yok</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-hmuted">
          Turuncu satırlar: talep var (buyer talebi ve/veya tarif korpusunda temel malzeme) ama aktif ilan yok — çiftçi edinimi için öncelikli.
        </p>
      </SectionCard>
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
