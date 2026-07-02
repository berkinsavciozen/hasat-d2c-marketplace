import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FarmerHeader } from "./farmer";
import { usePricePoints, usePriceAlerts, useCreatePriceAlert, useDeletePriceAlert } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { AIInsightBanner } from "@/components/hasat/AIInsightBanner";
import { TrustBadge } from "@/components/hasat/TrustBadge";
import { Sparkline } from "@/components/hasat/Sparkline";
import { Stepper } from "@/components/hasat/Stepper";
import { formatTRY, formatDelta, formatCrop } from "@/lib/hasat/format";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from "recharts";
import { toast } from "sonner";
import { AIBox } from "@/components/hasat/AIBox";

export const Route = createFileRoute("/farmer/prices")({
  head: () => ({ meta: [{ title: "Fiyat Takibi | Hasat" }] }),
  component: Prices,
});

const CROP_EMOJI: Record<string, string> = {
  Safran: "🌸", Lavanta: "💜", "Tıbbi Bitkiler": "🌿", Fındık: "🌰", Zeytinyağı: "🫒",
};

function Prices() {
  const { data: prices = [], isLoading: pricesLoading } = usePricePoints();
  const { data: priceAlerts = [], isLoading: alertsLoading } = usePriceAlerts();
  const deleteAlert = useDeletePriceAlert();
  const [selectedCrop, setSelectedCrop] = useState<string>("Safran");
  const [sheetOpen, setSheetOpen] = useState(false);

  if (pricesLoading) {
    return (
      <>
        <FarmerHeader title="Fiyat İstihbaratı" subtitle="" />
        <div className="px-4 md:px-8 py-12"><LoadingDots /></div>
      </>
    );
  }

  if (prices.length === 0) {
    return (
      <>
        <FarmerHeader title="Fiyat İstihbaratı" subtitle="" />
        <div className="px-4 md:px-8 py-12 text-center text-hwhite/70 text-sm">
          Henüz fiyat verisi yok.
        </div>
      </>
    );
  }

  const selected = prices.find((p) => p.crop === selectedCrop) ?? prices[0];
  const others = prices.filter((p) => p.crop !== selected.crop);


  // 7-day synthetic series for D2C
  const series = [0.94, 0.96, 0.97, 0.99, 1.0, 1.01, 1.0].map((m, i) => ({ day: i + 1, value: Math.round(selected.d2c * m) }));

  return (
    <>
      <FarmerHeader title="Fiyat İstihbaratı" subtitle={`Güncel: ${selected.date}`}>
        {/* Crop pill tabs */}
        <div className="mt-4 -mx-4 md:-mx-8 px-4 md:px-8 overflow-x-auto">
          <div className="flex gap-2 pb-1 snap-x">
            {prices.map((p) => {
              const active = p.crop === selected.crop;
              return (
                <button
                  key={p.crop}
                  onClick={() => setSelectedCrop(p.crop)}
                  className={`shrink-0 snap-start rounded-full px-3 py-1.5 text-xs font-medium ${active ? "bg-saffron text-white" : "bg-white/10 text-hwhite/80"}`}
                >
                  {CROP_EMOJI[p.crop] ?? "🌾"} {formatCrop(p.crop)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Featured price card */}
        <div className="mt-4 rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <PriceRow label="İstanbul Hal (toptan)" value={`${formatTRY(selected.hal)}/${unitFor(selected.crop)}`} delta={-(((selected.hal - selected.hal * 0.95) / selected.hal) * 100)} />
          <div className="my-2 rounded-xl p-3" style={{ background: "color-mix(in oklab, var(--saffron) 22%, transparent)", border: "1px solid color-mix(in oklab, var(--saffron) 60%, transparent)" }}>
            <div className="mb-1 flex items-center gap-2">
              <TrustBadge type="hasat" />
            </div>
            <PriceRow label="Hasat D2C Ortalaması" value={`${formatTRY(selected.d2c)}/${unitFor(selected.crop)}`} delta={selected.delta7d} accent />
          </div>
          <PriceRow label="AB İhracat Spot" value={`€${selected.export.toFixed(1)}/${unitFor(selected.crop)}`} delta={selected.delta7d * 0.6} />

        </div>

        {/* 7-day chart */}
        <div className="mt-4 rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="mb-1 flex items-center justify-between text-xs text-hwhite/60">
            <span>Son 7 gün — D2C</span>
            <span className="font-mono">{formatTRY(series[0].value)} → {formatTRY(series[series.length - 1].value)}</span>
          </div>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
                <Tooltip contentStyle={{ background: "var(--dark)", border: "1px solid var(--saffron)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--hwhite)" }} formatter={(v) => formatTRY(Number(v))} />
                <Line type="monotone" dataKey="value" stroke="var(--saffron)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--saffron)" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </FarmerHeader>

      <div className="px-4 md:px-8 py-5 space-y-3">
        <AIBox page="prices" />
        <div className="text-xs font-medium uppercase tracking-wider text-hmuted">Diğer Ürünler</div>
        {others.map((p) => (
          <button
            key={p.crop}
            onClick={() => setSelectedCrop(p.crop)}
            className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left hover:border-saffron/40"
          >
            <span className="text-xl">{CROP_EMOJI[p.crop] ?? "🌾"}</span>
            <div className="flex-1">
              <div className="text-sm font-medium">{formatCrop(p.crop)}</div>
              <div className="font-mono text-xs text-hmuted">{formatTRY(p.d2c)}/{unitFor(p.crop)}</div>
            </div>
            <Sparkline data={[p.d2c * 0.95, p.d2c * 0.97, p.d2c * 0.99, p.d2c, p.d2c * 1.01, p.d2c * 1.0, p.d2c * (1 + p.delta7d / 100)]} color="var(--gold)" width={70} height={28} />
            <div className={`text-xs font-medium ${p.delta7d >= 0 ? "text-sage" : "text-hred"}`}>{formatDelta(p.delta7d)}</div>
          </button>
        ))}

        <AIInsightBanner>
          {formatCrop(selected.crop)} fiyatı 7 günde {formatDelta(selected.delta7d)} değişti — vitrindeki listenizi güncellemek ister misiniz?
        </AIInsightBanner>

        {alertsLoading ? (
          <div className="mt-4"><LoadingDots /></div>
        ) : priceAlerts.length === 0 ? (
          <div className="mt-4 text-center text-xs text-hmuted">Henüz fiyat alarmı eklenmemiş.</div>
        ) : (
          <div className="mt-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-hmuted mb-1.5">Aktif alarmlar</div>
            <div className="flex flex-wrap gap-1.5">
              {priceAlerts.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-saffron/10 border border-saffron/30 px-2.5 py-1 text-[11px] text-saffron">
                  {formatCrop(a.crop)} {a.condition === "above" ? "≥" : "≤"} {formatTRY(a.target)}
                  <button onClick={() => deleteAlert.mutate(a.id)} className="ml-1 text-saffron/70 hover:text-saffron" aria-label="Alarmı kaldır">×</button>
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => setSheetOpen(true)}
          className="sticky bottom-24 md:bottom-4 mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-saffron py-3 text-sm font-medium text-white shadow-lg pb-safe"
        >
          <Bell className="h-4 w-4" /> + Fiyat Alarmı Kur
        </button>
      </div>

      <PriceAlarmSheet open={sheetOpen} onOpenChange={setSheetOpen} crops={prices.map((p) => p.crop)} defaultCrop={selected.crop} defaultPrice={selected.d2c} />
    </>
  );
}

function unitFor(crop: string) {
  if (crop === "Zeytinyağı") return "L";
  // price_points reference data is always per kg regardless of listing sell unit
  return "kg";
}

function PriceRow({ label, value, delta, accent }: { label: string; value: string; delta: number; accent?: boolean }) {
  const up = delta >= 0;
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className={`text-sm ${accent ? "text-hwhite" : "text-hwhite/80"}`}>{label}</div>
      <div className="flex items-center gap-2">
        <span className={`font-mono ${accent ? "text-base font-semibold text-hwhite" : "text-sm text-hwhite"}`}>{value}</span>
        <span className={`flex items-center text-[11px] font-medium ${up ? "text-sage" : "text-hred"}`}>
          {up ? <TrendingUp className="mr-0.5 h-3 w-3" /> : <TrendingDown className="mr-0.5 h-3 w-3" />}
          {formatDelta(delta)}
        </span>
      </div>
    </div>
  );
}

function PriceAlarmSheet({ open, onOpenChange, crops, defaultCrop, defaultPrice }: { open: boolean; onOpenChange: (b: boolean) => void; crops: string[]; defaultCrop: string; defaultPrice: number; }) {
  const createAlert = useCreatePriceAlert();
  const [crop, setCrop] = useState(defaultCrop);
  const [price, setPrice] = useState(defaultPrice);
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [channels, setChannels] = useState({ whatsapp: true, push: true, sms: false });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
        <SheetHeader>
          <SheetTitle className="font-serif text-xl">🔔 Fiyat Alarmı Kur</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Ürün</div>
            <Select value={crop} onValueChange={setCrop}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{crops.map((c) => <SelectItem key={c} value={c}>{formatCrop(c)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Hedef fiyat</div>
            <Stepper value={price} onChange={setPrice} step={5} unit="₺" />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Koşul</div>
            <div className="grid grid-cols-2 gap-2">
              {(["above", "below"] as const).map((d) => (
                <button key={d} type="button" onClick={() => setDirection(d)}
                  className={`rounded-xl border py-2.5 text-sm font-medium ${direction === d ? "bg-saffron text-white border-saffron" : "border-input text-hmuted"}`}>
                  {d === "above" ? "📈 Üzerinde" : "📉 Altında"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Bildirim kanalı</div>
            <div className="flex flex-wrap gap-2">
              {([
                { key: "whatsapp", label: "🟢 WhatsApp" },
                { key: "push", label: "🔔 Push" },
                { key: "sms", label: "💬 SMS" },
              ] as const).map(({ key, label }) => {
                const on = channels[key];
                return (
                  <button key={key} type="button" onClick={() => setChannels((c) => ({ ...c, [key]: !c[key] }))}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${on ? "bg-saffron text-white border-saffron" : "border-input text-hmuted"}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            disabled={createAlert.isPending}
            onClick={async () => {
              try {
                await createAlert.mutateAsync({ crop, target: price, condition: direction, channels });
                toast.success(`Alarm kuruldu: ${crop} ${direction === "above" ? "≥" : "≤"} ${formatTRY(price)}`);
                onOpenChange(false);
              } catch (e: any) {
                toast.error(e?.message ?? "Alarm kurulamadı");
              }
            }}
            className="w-full rounded-xl bg-saffron py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {createAlert.isPending ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
