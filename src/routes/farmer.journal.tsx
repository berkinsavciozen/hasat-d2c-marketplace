import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useHasat } from "@/lib/hasat/store";
import { FarmerHeader } from "./_farmer";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Stepper } from "@/components/hasat/Stepper";
import { formatTRY } from "@/lib/hasat/format";

export const Route = createFileRoute("/farmer/journal")({
  head: () => ({ meta: [{ title: "Günlük — Hasat" }] }),
  component: Journal,
});

function Journal() {
  const parcels = useHasat((s) => s.parcels);
  const entries = useHasat((s) => s.entries);
  const addParcel = useHasat((s) => s.addParcel);

  const [year, setYear] = useState("2028");
  const yearEntries = entries.filter((e) => e.date.startsWith(year));
  const totalQty = yearEntries.reduce((s, e) => s + e.quantity, 0);
  const totalRev = yearEntries.reduce((s, e) => s + e.quantity * (e.pricePerUnit ?? 0), 0);

  // New parcel form
  const [pName, setPName] = useState("");
  const [pArea, setPArea] = useState(2);
  const [pCrops, setPCrops] = useState<string[]>(["Safran"]);
  const [gpsState, setGpsState] = useState<"idle" | "loading" | "done">("idle");
  const [open, setOpen] = useState(false);

  const startGps = () => {
    setGpsState("loading");
    setTimeout(() => setGpsState("done"), 1500);
  };

  const saveParcel = () => {
    addParcel({ name: pName, area: pArea, crops: pCrops, location: { lat: 41.25, lng: 32.69, label: "Karabük, Safranbolu" } });
    setOpen(false);
    setPName(""); setPArea(2); setPCrops(["Safran"]); setGpsState("idle");
  };

  return (
    <>
      <FarmerHeader title="Tarla Günlüğü">
        <div className="mt-4 flex gap-1 rounded-full bg-white/10 p-1 w-fit">
          {["2027", "2028", "2029"].map((y) => (
            <button key={y} onClick={() => setYear(y)}
              className={`rounded-full px-3 py-1 text-xs font-mono ${year === y ? "bg-saffron text-white" : "text-hwhite/70"}`}>
              {y}
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-[10px] uppercase text-hwhite/50">Toplam Hasat</div>
            <div className="font-mono text-lg">{totalQty}<span className="text-xs ml-0.5">g/kg</span></div>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-[10px] uppercase text-hwhite/50">Toplam Gelir</div>
            <div className="font-mono text-lg" style={{ color: "var(--gold)" }}>{formatTRY(totalRev)}</div>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-[10px] uppercase text-hwhite/50">Aktif Parsel</div>
            <div className="font-mono text-lg">{parcels.length}</div>
          </div>
        </div>
      </FarmerHeader>

      <div className="p-4 md:p-8 space-y-3 relative">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl">Parseller</h2>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button className="text-sm text-saffron">+ Yeni Parsel</button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh]">
              <div className="mx-auto h-1.5 w-12 rounded-full bg-muted -mt-2 mb-3" />
              <SheetHeader>
                <SheetTitle className="font-serif">Yeni Parsel</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 pb-6">
                <div>
                  <label className="text-xs text-hmuted">Parsel Adı</label>
                  <input value={pName} onChange={(e) => setPName(e.target.value)}
                    placeholder="Örn: Parsel C — Lavanta"
                    className="mt-1 w-full rounded-lg border bg-input px-3 py-2.5 outline-none focus:border-saffron" />
                </div>
                <div>
                  <label className="text-xs text-hmuted">Büyüklük (dönüm)</label>
                  <div className="mt-1">
                    <Stepper value={pArea} onChange={setPArea} step={0.5} min={0.5} unit="dönüm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-hmuted">Ürün</label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {["Safran", "Lavanta", "Tıbbi Bitkiler", "Fındık", "Zeytin", "Diğer"].map((c) => {
                      const active = pCrops.includes(c);
                      return (
                        <button key={c} type="button" onClick={() => setPCrops(active ? pCrops.filter(x => x !== c) : [...pCrops, c])}
                          className={`rounded-full px-3 py-1.5 text-xs border ${active ? "bg-saffron text-white border-saffron" : "border-border"}`}>
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-hmuted">Konum</label>
                  <div className="mt-1">
                    {gpsState === "idle" && (
                      <button type="button" onClick={startGps} className="w-full rounded-lg border border-dashed py-3 text-sm text-hmuted hover:border-saffron">
                        📍 GPS ile algıla
                      </button>
                    )}
                    {gpsState === "loading" && (
                      <div className="rounded-lg bg-muted/40 py-3 text-center text-sm text-hmuted">
                        <span className="inline-block animate-pulse">📡 Konum algılanıyor…</span>
                      </div>
                    )}
                    {gpsState === "done" && (
                      <div className="rounded-lg bg-sage/15 px-3 py-2.5 text-sm text-sage">
                        ✓ Karabük, Safranbolu — Doğrulandı
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={saveParcel}
                  disabled={!pName.trim()}
                  className="w-full rounded-xl bg-saffron py-3 text-white font-medium disabled:opacity-40"
                >
                  Parseli Kaydet ✓
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {parcels.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-12 text-center">
            <div className="text-4xl mb-2">🌱</div>
            <div className="font-serif text-lg">Henüz kayıt yok</div>
            <div className="text-sm text-hmuted">İlk hasatını ekleyerek başla</div>
            <Link to="/farmer/journal/new" className="mt-4 inline-block rounded-full bg-saffron px-4 py-2 text-sm text-white">Hasat Kaydet 📓</Link>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {parcels.map((p) => {
              const pe = entries.filter((e) => e.parcelId === p.id && e.date.startsWith(year));
              const lastDate = pe[0]?.date ?? "—";
              const yield_ = pe.reduce((s, e) => s + e.quantity, 0);
              const first = pe[0];
              return (
                <Link
                  key={p.id}
                  to={first ? "/farmer/journal/$entryId" : "/farmer/journal/new"}
                  params={first ? { entryId: first.id } : undefined}
                  className="rounded-2xl bg-card border p-4 hover:border-saffron transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-hmuted mt-0.5">{p.area} dönüm · {p.crops.join(", ")}</div>
                    </div>
                    <span className="text-2xl">🌸</span>
                  </div>
                  <div className="mt-3 flex justify-between text-xs">
                    <span className="text-hmuted">Son kayıt: {lastDate}</span>
                    <span className="font-mono">{yield_} {pe[0]?.unit ?? ""}</span>
                  </div>
                </Link>
              );
            })}
          </ul>
        )}

        <Link
          to="/farmer/journal/new"
          className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-30 flex items-center gap-2 rounded-full bg-saffron px-5 py-3.5 text-white font-medium shadow-lg shadow-saffron/40 hover:scale-105 transition"
        >
          <Plus className="h-4 w-4" /> Yeni Kayıt
        </Link>
      </div>
    </>
  );
}
