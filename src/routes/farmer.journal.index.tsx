import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { FarmerHeader } from "./farmer";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Stepper } from "@/components/hasat/Stepper";
import { ProgressDots } from "@/components/hasat/ProgressDots";
import { useParcels, useEntries, useCreateParcel } from "@/lib/hasat/queries";
import {
  parseNotes,
  WORK_TYPE_MAP,
  monthLabel,
  shortDay,
  relativeTr,
  cropChipColor,
} from "@/lib/hasat/journal-meta";
import { toast } from "sonner";
import { formatCrop } from "@/lib/hasat/format";
import { AIBox } from "@/components/hasat/AIBox";
import { CropChips } from "@/components/hasat/CropChips";

export const Route = createFileRoute("/farmer/journal/")({
  head: () => ({ meta: [{ title: "Günlük — Hasat" }] }),
  component: Journal,
});

function LoadingDots() {
  const [i, setI] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setI((p) => (p % 3) + 1), 400);
    return () => clearInterval(t);
  }, []);
  return <div className="py-12"><ProgressDots current={i} total={3} /></div>;
}

function HealthDots({ value }: { value?: number }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="block h-1.5 w-1.5 rounded-full"
          style={{
            background: i <= value ? "var(--saffron)" : "color-mix(in oklab, var(--dark) 15%, transparent)",
          }}
        />
      ))}
    </div>
  );
}

function Journal() {
  const navigate = useNavigate();
  const { data: parcels = [], isLoading: pLoading } = useParcels();
  const { data: entries = [], isLoading: eLoading } = useEntries();
  const createParcel = useCreateParcel();

  // Sorted entries (desc) + month groups
  const sorted = useMemo(
    () => [...entries].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    [entries],
  );

  const groups = useMemo(() => {
    const m = new Map<string, typeof sorted>();
    for (const e of sorted) {
      const ym = (e.date ?? "").slice(0, 7);
      if (!ym) continue;
      if (!m.has(ym)) m.set(ym, []);
      m.get(ym)!.push(e);
    }
    return Array.from(m.entries());
  }, [sorted]);

  const parcelById = useMemo(
    () => Object.fromEntries(parcels.map((p) => [p.id, p])),
    [parcels],
  );

  const lastDate = sorted[0]?.date;

  // Parsel sheet
  const [pName, setPName] = useState("");
  const [pArea, setPArea] = useState(2);
  const [pCrops, setPCrops] = useState<string[]>(["safran"]);
  const [gpsState, setGpsState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [open, setOpen] = useState(false);

  const startGps = () => {
    if (!navigator.geolocation) {
      setGpsState("error");
      return;
    }
    setGpsState("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsState("done");
      },
      () => setGpsState("error"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const saveParcel = async () => {
    try {
      await createParcel.mutateAsync({
        name: pName,
        area: pArea,
        crops: pCrops,
        location: coords
          ? { lat: coords.lat, lng: coords.lng, label: "" }
          : { lat: 0, lng: 0, label: "" },
      });
      setOpen(false);
      setPName(""); setPArea(2); setPCrops(["safran"]); setGpsState("idle"); setCoords(null);
      toast.success("Parsel eklendi");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const isLoading = pLoading || eLoading;

  return (
    <>
      <FarmerHeader title="Tarla Günlüğü">
        <p className="mt-2 text-sm text-hwhite/70">Günlük gözlemlerin, tek bir akışta.</p>
      </FarmerHeader>

      <div className="p-4 md:p-8 space-y-4 relative">
        <AIBox page="journal" />
        {/* Compact stats bar */}
        <div className="rounded-2xl border px-4 py-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1" style={{ background: "var(--cream)", borderColor: "var(--border)" }}>
          <div className="min-w-0 text-sm text-dark">
            <span className="font-mono font-medium">{entries.length}</span> kayıt
            <span className="mx-1.5 opacity-40">·</span>
            <span className="font-mono font-medium">{parcels.length}</span> parsel
            {lastDate && (
              <>
                <span className="mx-1.5 opacity-40">·</span>
                <span className="text-hmuted">Son: {relativeTr(lastDate)}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link to="/farmer/journal/customize" className="text-xs text-hmuted hover:text-saffron font-medium whitespace-nowrap">
              ⚙️ Rutin Bakımı Özelleştir
            </Link>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button className="shrink-0 text-xs text-saffron font-medium whitespace-nowrap">+ Parsel</button>
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
                  <div className="mt-1">
                    <CropChips value={pCrops} onChange={setPCrops} />
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
                    {gpsState === "done" && coords && (
                      <div className="rounded-lg bg-sage/15 px-3 py-2.5 text-sm text-sage">
                        ✓ Konum kaydedildi ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})
                      </div>
                    )}
                    {gpsState === "error" && (
                      <button type="button" onClick={startGps} className="w-full rounded-lg border border-dashed border-hred/40 py-3 text-sm text-hred hover:bg-hred/5">
                        Konum alınamadı — tekrar dene
                      </button>
                    )}
                  </div>
                </div>
                <button
                  onClick={saveParcel}
                  disabled={!pName.trim() || createParcel.isPending}
                  className="w-full rounded-xl bg-saffron py-3 text-white font-medium disabled:opacity-40"
                >
                  {createParcel.isPending ? "Kaydediliyor…" : "Parseli Kaydet ✓"}
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {isLoading ? (
          <LoadingDots />
        ) : sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-14 text-center" style={{ background: "var(--cream)", borderColor: "var(--border)" }}>
            <div className="text-4xl mb-2">🌱</div>
            <div className="font-serif text-xl text-dark">İlk hasat kaydını oluştur</div>
            <div className="text-sm text-hmuted mt-1">Sulama, gözlem, hasat — hepsi tek bir akışta.</div>
            <button
              onClick={() => navigate({ to: "/farmer/journal/new" })}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-saffron px-5 py-2.5 text-sm text-white font-medium"
            >
              <Plus className="h-4 w-4" /> Yeni Kayıt
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(([ym, rows]) => (
              <section key={ym}>
                <div className="sticky top-0 z-10 -mx-4 md:-mx-8 px-4 md:px-8 py-2 backdrop-blur" style={{ background: "color-mix(in oklab, var(--background) 85%, transparent)" }}>
                  <h3 className="font-serif text-sm uppercase tracking-widest text-hmuted">{monthLabel(ym)}</h3>
                </div>
                <ul className="mt-2 space-y-2">
                  {rows.map((e) => {
                    const meta = parseNotes(e.notes);
                    const wt = WORK_TYPE_MAP[meta.work];
                    const parcel = parcelById[e.parcelId];
                    const sd = shortDay(e.date);
                    const chip = cropChipColor(parcel?.crops[0] ?? e.crop);
                    return (
                      <li key={e.id}>
                        <Link
                          to="/farmer/journal/$entryId"
                          params={{ entryId: e.id }}
                          className="block rounded-2xl border px-4 py-3.5 hover:border-saffron transition"
                          style={{ background: "var(--cream)", borderColor: "var(--border)" }}
                        >
                          <div className="flex items-start gap-4">
                            {/* Date */}
                            <div className="text-center shrink-0 w-12">
                              <div className="font-serif text-2xl leading-none text-dark">{sd.day}</div>
                              <div className="text-[10px] uppercase tracking-widest text-hmuted mt-1">{sd.mon}</div>
                            </div>
                            {/* Body */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                                  style={{ background: chip.bg, color: chip.fg }}
                                >
                                  {formatCrop(parcel?.name ?? "—")}
                                </span>
                                <span className="text-xs text-dark/80">
                                  <span className="mr-1">{wt.emoji}</span>{wt.label}
                                </span>
                                {meta.tags
                                  .filter((t) => t.key !== "work" && t.key !== "category")
                                  .map((t, i) => (
                                    <span
                                      key={`${t.key}-${i}`}
                                      className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-hmuted"
                                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                                    >
                                      {t.key === "health" ? `health: ${t.value}` : `${t.key}: ${t.value}`}
                                    </span>
                                  ))}
                              </div>
                              {meta.text && (
                                <p className="mt-1.5 text-sm text-dark/70 truncate">{meta.text}</p>
                              )}
                            </div>

                            {/* Health */}
                            <div className="shrink-0 pt-2">
                              <HealthDots value={meta.health} />
                              {e.quantity > 0 && (
                                <div className="mt-1.5 text-right font-mono text-[11px] text-hmuted">
                                  {e.quantity}{e.unit}
                                </div>
                              )}
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <button
          onClick={() => navigate({ to: "/farmer/journal/new" })}
          className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-30 flex items-center gap-2 rounded-full bg-saffron px-5 py-3.5 text-white font-medium shadow-lg shadow-saffron/40 hover:scale-105 transition"
        >
          <Plus className="h-4 w-4" /> Yeni Kayıt
        </button>
      </div>
    </>
  );
}
