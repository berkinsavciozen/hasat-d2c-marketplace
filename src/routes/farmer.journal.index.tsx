import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, ChevronDown } from "lucide-react";
import { FarmerHeader } from "./farmer";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Stepper } from "@/components/hasat/Stepper";
import { ProgressDots } from "@/components/hasat/ProgressDots";
import {
  useParcels,
  useEntries,
  useCreateParcel,
  useCreateEntry,
  useExistingBatches,
  useActiveJournalPrefsDetailed,
  useLastPerformedFromJournal,
  useCropGlossary,
  type ActiveJournalPref,
} from "@/lib/hasat/queries";
import { useCropConfigMap, findCropConfig } from "@/lib/hasat/crop-config";
import type { Parcel } from "@/lib/hasat/types";
import {
  parseNotes,
  WORK_TYPE_MAP,
  WORK_TO_STEP_KEY,
  encodeNotes,
  ZERO_COSTS,
  type WorkTypeKey,
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
  const [activeTab, setActiveTab] = useState<"harvest" | "routine">("harvest");
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

        {/* Tab switcher */}
        <div className="flex gap-2 rounded-full border p-1" style={{ background: "var(--cream)", borderColor: "var(--border)" }}>
          <button
            onClick={() => setActiveTab("harvest")}
            className="flex-1 rounded-full py-2 text-sm font-medium transition"
            style={{
              background: activeTab === "harvest" ? "var(--saffron)" : "transparent",
              color: activeTab === "harvest" ? "white" : "var(--dark)",
            }}
          >
            Hasat Kayıtları
          </button>
          <button
            onClick={() => setActiveTab("routine")}
            className="flex-1 rounded-full py-2 text-sm font-medium transition"
            style={{
              background: activeTab === "routine" ? "var(--saffron)" : "transparent",
              color: activeTab === "routine" ? "white" : "var(--dark)",
            }}
          >
            🌱 Rutin Bakım
          </button>
        </div>

        {activeTab === "routine" && <RoutineTab parcels={parcels} />}

        {activeTab === "harvest" && (
        <>
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
                    <CropChips value={pCrops} onChange={setPCrops} context="farmer" />
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
        </>
        )}
      </div>
    </>
  );
}

// ============= Rutin Bakım sekmesi (P22-D) =============

type RowStatus = "overdue" | "soon" | "ok" | "none";

interface RoutineRow {
  key: string;
  pref: ActiveJournalPref;
  parcel: Parcel;
  crop: string;
  lastPerformed: string | null;
  nextDue: string | null;
  status: RowStatus;
}

function statusStyle(status: RowStatus): { bg: string; fg: string; label: (nextDue: string | null, lastPerformed: string | null) => string } {
  if (status === "overdue") {
    return {
      bg: "color-mix(in oklab, var(--hred) 15%, transparent)",
      fg: "var(--hred)",
      label: (nextDue) => {
        const days = nextDue ? Math.abs(Math.floor((new Date(nextDue).getTime() - Date.now()) / 86400000)) : 0;
        return `${days} gün gecikti`;
      },
    };
  }
  if (status === "soon") {
    return {
      bg: "color-mix(in oklab, var(--gold) 20%, transparent)",
      fg: "var(--dark)",
      label: (nextDue) => {
        const days = nextDue ? Math.max(0, Math.floor((new Date(nextDue).getTime() - Date.now()) / 86400000)) : 0;
        return days === 0 ? "Bugün sırası" : `${days} gün sonra`;
      },
    };
  }
  if (status === "ok") {
    return {
      bg: "color-mix(in oklab, var(--sage) 15%, transparent)",
      fg: "var(--sage)",
      label: (nextDue, lastPerformed) => {
        if (!nextDue) return lastPerformed ? `Son: ${relativeTr(lastPerformed)}` : "Olay bazlı";
        const days = Math.max(0, Math.floor((new Date(nextDue).getTime() - Date.now()) / 86400000));
        return `${days} gün sonra`;
      },
    };
  }
  return {
    bg: "color-mix(in oklab, var(--dark) 8%, transparent)",
    fg: "var(--hmuted)",
    label: () => "Henüz kayıt yok",
  };
}

type DateFilter = "today" | "week" | "all";

function RoutineTab({ parcels }: { parcels: Parcel[] }) {
  const { data: prefs = [], isLoading: prefsLoading } = useActiveJournalPrefsDetailed();
  const { data: lastPerformedMap = {}, isLoading: lastLoading } = useLastPerformedFromJournal();
  const { map: cropConfigMap } = useCropConfigMap();

  const [dateFilter, setDateFilter] = useState<DateFilter>("week");
  const [logRow, setLogRow] = useState<RoutineRow | null>(null);

  // Her (pref × parsel × parseldeki crop) kombinasyonu ayrı bir satır — crop her zaman açık.
  const rows: RoutineRow[] = useMemo(() => {
    const out: RoutineRow[] = [];
    for (const pref of prefs) {
      for (const parcel of parcels) {
        const cropsForRow = pref.entry_type.crop
          ? (parcel.crops.some((c) => c.toLowerCase() === pref.entry_type.crop!.toLowerCase()) ? [pref.entry_type.crop] : [])
          : parcel.crops;
        for (const crop of cropsForRow) {
          const key = `${pref.entry_type_id}:${parcel.id}:${crop}`;
          const lastPerformed = lastPerformedMap[key] ?? null;
          const freq = pref.frequency_days ?? pref.entry_type.default_frequency_days;
          let nextDue: string | null = null;
          let status: RowStatus = "none";
          if (lastPerformed && freq) {
            const d = new Date(lastPerformed);
            d.setDate(d.getDate() + freq);
            nextDue = d.toISOString().slice(0, 10);
            const daysUntil = Math.floor((d.getTime() - Date.now()) / 86400000);
            status = daysUntil < 0 ? "overdue" : daysUntil <= 2 ? "soon" : "ok";
          } else if (lastPerformed) {
            status = "ok";
          }
          out.push({ key, pref, parcel, crop, lastPerformed, nextDue, status });
        }
      }
    }
    return out;
  }, [prefs, parcels, lastPerformedMap]);

  // Tarih filtresi: gecikmiş ve hiç yapılmamış olanlar her zaman görünür (bunlar zaten "bekleyen").
  // Olay-bazlı (sıklığı olmayan) eylemler de her zaman görünür. Sıklığı olanlar seçili pencereye göre süzülür.
  const visibleRows = useMemo(() => {
    if (dateFilter === "all") return rows;
    const maxDays = dateFilter === "today" ? 0 : 7;
    return rows.filter((r) => {
      if (r.status === "overdue" || r.status === "none") return true;
      if (!r.nextDue) return true;
      const daysUntil = Math.floor((new Date(r.nextDue).getTime() - Date.now()) / 86400000);
      return daysUntil <= maxDays;
    });
  }, [rows, dateFilter]);

  // Parsel bazlı gruplama — her parselin altında o parseldeki eylemler, crop etiketiyle.
  const groupedByParcel = useMemo(() => {
    const m = new Map<string, { parcel: Parcel; rows: RoutineRow[] }>();
    for (const row of visibleRows) {
      if (!m.has(row.parcel.id)) m.set(row.parcel.id, { parcel: row.parcel, rows: [] });
      m.get(row.parcel.id)!.rows.push(row);
    }
    // parcels dizisindeki sırayı (created_at asc) koru
    return parcels
      .map((p) => m.get(p.id))
      .filter((g): g is { parcel: Parcel; rows: RoutineRow[] } => !!g && g.rows.length > 0);
  }, [visibleRows, parcels]);

  const farmerCrops = useMemo(() => {
    const s = new Set<string>();
    for (const p of parcels) for (const c of p.crops ?? []) s.add(c.toLowerCase());
    return Array.from(s);
  }, [parcels]);

  const isLoading = prefsLoading || lastLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link to="/farmer/journal/customize" className="text-xs text-hmuted hover:text-saffron font-medium whitespace-nowrap">
          ⚙️ Rutin Bakımı Özelleştir
        </Link>
        <div className="flex gap-1 rounded-full border p-0.5" style={{ borderColor: "var(--border)" }}>
          {([["today", "Bugün"], ["week", "Bu Hafta"], ["all", "Tümü"]] as [DateFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setDateFilter(key)}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{ background: dateFilter === key ? "var(--saffron)" : "transparent", color: dateFilter === key ? "white" : "var(--dark)" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-sm text-hmuted">Yükleniyor…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-14 text-center" style={{ background: "var(--cream)", borderColor: "var(--border)" }}>
          <div className="text-4xl mb-2">🌱</div>
          <div className="font-serif text-xl text-dark">Henüz bir bakım eylemi takip etmiyorsun</div>
          <div className="text-sm text-hmuted mt-1">Sulama, gübreleme, ilaçlama — takip etmek istediklerini seç.</div>
          <Link
            to="/farmer/journal/customize"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-saffron px-5 py-2.5 text-sm text-white font-medium"
          >
            ⚙️ Rutin Bakımı Özelleştir
          </Link>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-10 text-center text-sm text-hmuted" style={{ background: "var(--cream)", borderColor: "var(--border)" }}>
          Bekleyen bakım eylemi yok 🎉
        </div>
      ) : (
        <div className="space-y-5">
          {groupedByParcel.map(({ parcel, rows: parcelRows }) => (
            <section key={parcel.id}>
              <h3 className="font-serif text-sm uppercase tracking-widest text-hmuted mb-2">
                📍 {parcel.name}
              </h3>
              <ul className="space-y-2">
                {parcelRows.map((row) => {
                  const st = statusStyle(row.status);
                  return (
                    <li
                      key={row.key}
                      className="flex items-center gap-3 rounded-2xl border px-4 py-3.5"
                      style={{ background: "var(--cream)", borderColor: "var(--border)" }}
                    >
                      <div className="text-2xl shrink-0 w-8 text-center">{row.pref.entry_type.icon ?? "•"}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-dark truncate">{row.pref.entry_type.name}</span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ background: cropChipColor(row.crop).bg, color: cropChipColor(row.crop).fg }}
                          >
                            {formatCrop(row.crop)}
                          </span>
                        </div>
                        <div className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: st.bg, color: st.fg }}>
                          {st.label(row.nextDue, row.lastPerformed)}
                        </div>
                      </div>
                      <button
                        onClick={() => setLogRow(row)}
                        className="shrink-0 rounded-full bg-saffron px-3 py-1.5 text-xs font-medium text-white"
                      >
                        ✓ Yaptım
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Crop bilgi panelleri */}
      {farmerCrops.length > 0 && (
        <div className="space-y-2 pt-2">
          {farmerCrops.map((crop) => (
            <CropInfoPanel key={crop} crop={crop} cropConfigMap={cropConfigMap} />
          ))}
        </div>
      )}

      {logRow && (
        <LogRoutineEntrySheet row={logRow} cropConfigMap={cropConfigMap} onClose={() => setLogRow(null)} />
      )}
    </div>
  );
}

/** "✓ Yaptım" → günlüğe (harvest_entries) yeni bir kayıt ekler, birden fazla batch varsa hangisine bağlanacağını sorar. */
function LogRoutineEntrySheet({ row, cropConfigMap, onClose }: { row: RoutineRow; cropConfigMap: Map<string, any>; onClose: () => void }) {
  const { data: batches = [], isLoading: batchesLoading } = useExistingBatches(row.parcel.id, row.crop);
  const createEntry = useCreateEntry();
  const [listingId, setListingId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (batches.length === 0) { setListingId(""); return; }
    const preferred = batches[batches.length - 1].id;
    setListingId((prev) => (prev && batches.some((b) => b.id === prev) ? prev : preferred));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches.map((b) => b.id).join("|")]);

  const cfg = findCropConfig(cropConfigMap, row.crop);
  // Bağlanacak batch varsa birim ONUNKİYLE eşleşmeli (aynı crop+parsel'de g/kg karışık batch'ler olabilir,
  // bkz. P21 mixed-unit bug'ı) — batch yoksa crop'un kanonik birimine düşülür.
  const selectedBatch = batches.find((b) => b.id === listingId);
  const unit: "g" | "kg" | "L" = selectedBatch?.unit ?? (cfg?.default_unit === "kg" ? "kg" : "g");
  const workTypeKey = row.pref.entry_type.work_type_key as WorkTypeKey;

  const submit = async () => {
    try {
      await createEntry.mutateAsync({
        parcelId: row.parcel.id,
        date: new Date().toISOString().slice(0, 10),
        crop: row.crop,
        quantity: 0,
        unit,
        quality: "A",
        photos: [],
        notes: encodeNotes({ work: workTypeKey, text: note }),
        costs: { ...ZERO_COSTS },
        pricePerUnit: 0,
        step_key: WORK_TO_STEP_KEY[workTypeKey] ?? null,
        listingId: batches.length > 1 && listingId ? listingId : null,
        journalEntryTypeId: row.pref.entry_type_id,
      } as any);
      toast.success("Günlüğe eklendi ✓");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh]">
        <div className="mx-auto h-1.5 w-12 rounded-full bg-muted -mt-2 mb-3" />
        <SheetHeader>
          <SheetTitle className="font-serif">{row.pref.entry_type.name}</SheetTitle>
        </SheetHeader>
        <div className="mt-1 text-sm text-hmuted">
          {row.parcel.name} · {formatCrop(row.crop)}
        </div>
        <div className="mt-4 space-y-4 pb-6">
          {batchesLoading ? (
            <div className="text-sm text-hmuted">Batch bilgisi yükleniyor…</div>
          ) : batches.length > 1 ? (
            <div>
              <label className="text-xs text-hmuted">Hangi batch (parti)?</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {batches.map((b) => {
                  const active = b.id === listingId;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setListingId(b.id)}
                      className="rounded-full border px-3 py-1.5 text-xs"
                      style={{
                        background: active ? "var(--saffron)" : "var(--cream)",
                        color: active ? "white" : "var(--dark)",
                        borderColor: active ? "var(--saffron)" : "var(--border)",
                      }}
                    >
                      {b.batchName ?? `${b.quantity} ${b.unit}`}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div>
            <label className="text-xs text-hmuted">Not (opsiyonel)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Örn: yaprak sararması gözlendi"
              rows={3}
              className="mt-1 w-full rounded-lg border bg-input px-3 py-2.5 text-sm outline-none focus:border-saffron"
            />
          </div>
          <button
            onClick={submit}
            disabled={createEntry.isPending}
            className="w-full rounded-xl bg-saffron py-3 text-white font-medium disabled:opacity-40"
          >
            {createEntry.isPending ? "Kaydediliyor…" : "Kaydet ✓"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CropInfoPanel({ crop, cropConfigMap }: { crop: string; cropConfigMap: Map<string, any> }) {
  const [open, setOpen] = useState(false);
  const { data: glossary = [] } = useCropGlossary(crop);
  const cfg = findCropConfig(cropConfigMap, crop);
  const steps = cfg?.lifecycle_steps ?? [];
  const orderedGlossary = steps
    .map((s) => glossary.find((g) => g.term === s.label))
    .filter((g): g is { term: string; explanation: string } => !!g);

  if (orderedGlossary.length === 0) return null;

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--cream)", borderColor: "var(--border)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-dark"
      >
        <span>ℹ️ {formatCrop(crop)} Hakkında</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {orderedGlossary.map((g) => (
            <div key={g.term}>
              <div className="text-xs font-medium text-saffron">{g.term}</div>
              <p className="text-sm text-dark/80 mt-0.5">{g.explanation}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
