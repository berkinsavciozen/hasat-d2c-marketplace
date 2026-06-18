import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ChevronDown, Plus } from "lucide-react";
import { useParcels, useCreateEntry } from "@/lib/hasat/queries";
import { Stepper } from "@/components/hasat/Stepper";
import { formatTRY } from "@/lib/hasat/format";
import { toast } from "sonner";

export const Route = createFileRoute("/farmer/journal/new")({
  head: () => ({ meta: [{ title: "Yeni Hasat — Hasat" }] }),
  component: NewEntry,
});

function NewEntry() {
  const navigate = useNavigate();
  const { data: parcels = [] } = useParcels();
  const createEntry = useCreateEntry();

  const [parcelId, setParcelId] = useState(parcels[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [qty, setQty] = useState(0);
  const [unit, setUnit] = useState<"g" | "kg" | "L">("g");
  const [quality, setQuality] = useState<"A" | "B" | "C">("A");
  const [notes, setNotes] = useState("");
  const [costsOpen, setCostsOpen] = useState(false);
  const [costs, setCosts] = useState({ labor: 0, fertilizer: 0, packaging: 0, transport: 0, other: 0 });
  const [saved, setSaved] = useState(false);

  const parcel = parcels.find((p) => p.id === parcelId);
  const crop = parcel?.crops[0] ?? "Safran";
  const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);

  const save = () => {
    addEntry({
      parcelId, date, crop, quantity: qty, unit, quality, photos: [], notes, costs,
      pricePerUnit: crop === "Safran" ? 345 : 180,
    });
    setSaved(true);
    setTimeout(() => navigate({ to: "/farmer/journal" }), 1800);
  };

  if (saved) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "var(--sage)", color: "white" }}>
        <div className="text-7xl mb-4">✅</div>
        <h1 className="font-serif text-3xl">Kaydedildi!</h1>
        <p className="mt-2 text-sm opacity-80">{parcel?.name} · {crop} · {qty}{unit}</p>
      </div>
    );
  }

  return (
    <>
      <div className="px-4 pt-5 pb-4 md:px-8 flex items-center gap-3" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <button onClick={() => navigate({ to: "/farmer/journal" })} className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-serif text-xl">Yeni Hasat Kaydı</h1>
      </div>

      <div className="p-4 md:p-8 space-y-4 max-w-2xl mx-auto">
        {/* Parsel & Tarih */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-hmuted">Parsel</label>
            <select value={parcelId} onChange={(e) => setParcelId(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-input px-3 py-2.5 outline-none focus:border-saffron">
              {parcels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-hmuted">Hasat Tarihi</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-input px-3 py-2.5 outline-none focus:border-saffron" />
          </div>
        </div>

        {/* Auto crop banner */}
        <div className="rounded-xl border px-3 py-2.5 flex items-center justify-between" style={{ background: "color-mix(in oklab, var(--sage) 15%, transparent)", borderColor: "color-mix(in oklab, var(--sage) 40%, transparent)" }}>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-sage font-semibold">Oto-Algılandı</div>
            <div className="text-sm">{crop}</div>
          </div>
          <span className="text-xl">🌸</span>
        </div>

        {/* Quantity stepper */}
        <div>
          <label className="text-xs text-hmuted">Miktar</label>
          <div className="mt-1">
            <Stepper value={qty} onChange={setQty} step={crop === "Safran" ? 10 : 1} unit={unit} units={["g", "kg", "L"]} onUnitChange={(u) => setUnit(u as "g" | "kg" | "L")} />
          </div>
        </div>

        {/* Quality */}
        <div>
          <label className="text-xs text-hmuted">Kalite</label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {([
              { k: "A", t: "En iyi" },
              { k: "B", t: "Orta" },
              { k: "C", t: "Standart" },
            ] as const).map(({ k, t }) => (
              <button key={k} onClick={() => setQuality(k)}
                className={`rounded-xl border py-3 ${quality === k ? "bg-saffron text-white border-saffron" : "bg-card"}`}>
                <div className="font-serif text-xl">{k}</div>
                <div className="text-[11px] opacity-70">{t}</div>
              </button>
            ))}
          </div>
        </div>

        {/* GPS */}
        <div className="rounded-xl bg-sage/15 px-3 py-2.5 text-sm text-sage">
          📍 Karabük, Safranbolu ✓ Doğrulandı
        </div>

        {/* Photos */}
        <div>
          <label className="text-xs text-hmuted">Fotoğraflar (maks. 4)</label>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="aspect-square rounded-lg bg-muted grid place-items-center text-2xl opacity-40">📷</div>
            ))}
            <button className="aspect-square rounded-lg border-2 border-dashed grid place-items-center text-hmuted hover:border-saffron">
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs text-hmuted">Notlar (opsiyonel)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            className="mt-1 w-full rounded-lg border bg-input px-3 py-2.5 outline-none focus:border-saffron" />
        </div>

        {/* Costs accordion */}
        <div className="rounded-xl bg-card border overflow-hidden">
          <button onClick={() => setCostsOpen(!costsOpen)} className="w-full flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium">Girdi Maliyetleri</span>
            <span className="flex items-center gap-2">
              {totalCost > 0 && <span className="rounded-full bg-hred/15 text-hred px-2 py-0.5 text-xs font-mono">{formatTRY(totalCost)}</span>}
              <ChevronDown className={`h-4 w-4 transition ${costsOpen ? "rotate-180" : ""}`} />
            </span>
          </button>
          {costsOpen && (
            <div className="border-t p-4 space-y-2.5">
              {([
                ["labor", "İşçilik"],
                ["fertilizer", "Gübre & İlaç"],
                ["packaging", "Ambalaj"],
                ["transport", "Nakliye"],
                ["other", "Diğer"],
              ] as const).map(([k, label]) => (
                <div key={k} className="flex items-center gap-3">
                  <label className="flex-1 text-sm">{label}</label>
                  <div className="relative">
                    <input type="number" value={costs[k] || ""} onChange={(e) => setCosts({ ...costs, [k]: Number(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-32 rounded-lg border bg-input pl-6 pr-2 py-1.5 text-right font-mono outline-none focus:border-saffron" />
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-hmuted">₺</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2.5 text-sm font-medium">
                <span>Toplam</span>
                <span className="font-mono text-hred">{formatTRY(totalCost)}</span>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={save}
          disabled={!parcelId || qty <= 0}
          className="w-full rounded-xl bg-saffron py-3.5 text-white font-medium disabled:opacity-40"
        >
          Kaydet ✓
        </button>
      </div>
    </>
  );
}
