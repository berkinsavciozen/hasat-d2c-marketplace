import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowLeft, Camera, X } from "lucide-react";
import { useParcels, useCreateEntry } from "@/lib/hasat/queries";
import {
  WORK_TYPES,
  WORK_TO_STEP_KEY,
  type WorkTypeKey,
  encodeNotes,
  healthToQuality,
  ZERO_COSTS,
} from "@/lib/hasat/journal-meta";
import { toast } from "sonner";

export const Route = createFileRoute("/farmer/journal/new")({
  head: () => ({ meta: [{ title: "Yeni Kayıt — Hasat" }] }),
  component: NewEntry,
});

const HEALTH_LABELS = ["Kötü", "Zayıf", "Orta", "İyi", "Mükemmel"];

function NewEntry() {
  const navigate = useNavigate();
  const { data: parcels = [] } = useParcels();
  const createEntry = useCreateEntry();
  const fileRef = useRef<HTMLInputElement>(null);

  const [parcelId, setParcelId] = useState(parcels[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [work, setWork] = useState<WorkTypeKey>("gozlem");
  const [health, setHealth] = useState(4);
  const [qty, setQty] = useState<string>("");
  // Note: HarvestEntry.unit only allows g|kg|L. "adet" is a UI alias that submits as "g".
  const [unit, setUnit] = useState<"g" | "kg" | "adet">("g");
  const [notes, setNotes] = useState("");
  const [photoName, setPhotoName] = useState<string | null>(null);

  // sync default parcel once loaded
  if (!parcelId && parcels[0]) setParcelId(parcels[0].id);

  const parcel = parcels.find((p) => p.id === parcelId);
  const crop = parcel?.crops[0] ?? "Safran";

  const save = async () => {
    if (!parcelId) return toast.error("Lütfen bir parsel seçin");
    try {
      const submitUnit: "g" | "kg" | "L" = unit === "adet" ? "g" : unit;
      const quantity = qty.trim() ? Number(qty) || 0 : 0;
      await createEntry.mutateAsync({
        parcelId,
        date,
        crop,
        quantity,
        unit: submitUnit,
        quality: healthToQuality(health),
        photos: [],
        notes: encodeNotes({ work, health, text: notes }),
        costs: { ...ZERO_COSTS },
        pricePerUnit: 0,
      });
      toast.success("Kayıt eklendi ✓");
      navigate({ to: "/farmer/journal" });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      <div className="px-4 pt-5 pb-4 md:px-8 flex items-center gap-3" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <button onClick={() => navigate({ to: "/farmer/journal" })} className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-serif text-xl">Yeni Kayıt</h1>
      </div>

      <div className="p-4 md:p-8 space-y-6 max-w-2xl mx-auto pb-24">
        {/* Section 1 — Temel Bilgiler */}
        <section className="space-y-4">
          <h2 className="font-serif text-sm uppercase tracking-widest text-hmuted">Temel Bilgiler</h2>

          <div>
            <label className="text-xs text-hmuted">Parsel</label>
            {parcels.length === 0 ? (
              <div className="mt-1 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-hmuted">
                Önce bir parsel ekle
              </div>
            ) : (
              <div className="mt-2 -mx-4 md:mx-0 px-4 md:px-0 overflow-x-auto">
                <div className="flex gap-2 min-w-max md:flex-wrap">
                  {parcels.map((p) => {
                    const active = p.id === parcelId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setParcelId(p.id)}
                        className={`rounded-2xl border px-4 py-2.5 text-sm whitespace-nowrap transition ${
                          active ? "bg-saffron text-white border-saffron" : "border-border text-dark"
                        }`}
                        style={!active ? { background: "var(--cream)" } : undefined}
                      >
                        <div className="font-medium">{p.name}</div>
                        <div className={`text-[10px] mt-0.5 ${active ? "text-white/80" : "text-hmuted"}`}>
                          {p.crops[0] ?? "—"} · {p.area} dön.
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-hmuted">Tarih</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border bg-input px-3 py-2.5 outline-none focus:border-saffron"
            />
          </div>

          <div>
            <label className="text-xs text-hmuted">İşlem Türü</label>
            <div className="mt-2 -mx-4 md:mx-0 px-4 md:px-0 overflow-x-auto">
              <div className="flex gap-2 min-w-max md:flex-wrap">
                {WORK_TYPES.map((w) => {
                  const active = w.key === work;
                  return (
                    <button
                      key={w.key}
                      type="button"
                      onClick={() => setWork(w.key)}
                      className={`rounded-full border px-4 py-2 text-sm whitespace-nowrap transition ${
                        active ? "bg-sage text-white border-sage" : "border-border text-dark"
                      }`}
                      style={!active ? { background: "var(--cream)" } : undefined}
                    >
                      <span className="mr-1.5">{w.emoji}</span>
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Section 2 — Mahsul Durumu */}
        <section className="space-y-4">
          <h2 className="font-serif text-sm uppercase tracking-widest text-hmuted">Mahsul Durumu</h2>

          <div className="rounded-2xl border p-4" style={{ background: "var(--cream)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-hmuted">Mahsul Sağlığı</span>
              <span className="font-medium text-dark">{HEALTH_LABELS[health - 1]}</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xl">🥀</span>
              <div className="flex-1 grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((i) => {
                  const filled = i <= health;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setHealth(i)}
                      className="h-9 rounded-lg transition"
                      style={{
                        background: filled ? "var(--saffron)" : "color-mix(in oklab, var(--sage) 15%, transparent)",
                        border: filled ? "none" : "1px solid var(--border)",
                      }}
                      aria-label={`Sağlık ${i}`}
                    />
                  );
                })}
              </div>
              <span className="text-xl">🌸</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-hmuted">Miktar (opsiyonel)</label>
            <div className="mt-1 flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
                className="flex-1 rounded-xl border bg-input px-3 py-2.5 outline-none focus:border-saffron font-mono"
              />
              <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                {(["g", "kg", "adet"] as const).map((u) => {
                  const active = u === unit;
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      className={`px-3 py-2.5 text-sm transition ${
                        active ? "bg-saffron text-white" : "text-dark"
                      }`}
                      style={!active ? { background: "var(--cream)" } : undefined}
                    >
                      {u}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Section 3 — Notlar */}
        <section className="space-y-4">
          <h2 className="font-serif text-sm uppercase tracking-widest text-hmuted">Notlar</h2>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Bugün ne gözlemledin?"
            rows={4}
            className="w-full rounded-2xl border px-4 py-3 outline-none focus:border-saffron resize-none"
            style={{ background: "var(--cream)", borderColor: "var(--border)" }}
          />

          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)}
            />
            {photoName ? (
              <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm" style={{ background: "var(--cream)", borderColor: "var(--border)" }}>
                <Camera className="h-4 w-4 text-sage" />
                <span className="flex-1 truncate text-dark">{photoName}</span>
                <button type="button" onClick={() => { setPhotoName(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-hmuted hover:text-hred">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border border-dashed py-3 text-sm text-hmuted hover:border-saffron flex items-center justify-center gap-2"
              >
                <Camera className="h-4 w-4" /> Fotoğraf ekle
              </button>
            )}
          </div>
        </section>

        <button
          onClick={save}
          disabled={!parcelId || createEntry.isPending}
          className="w-full rounded-2xl bg-saffron py-4 text-white font-medium disabled:opacity-40"
        >
          {createEntry.isPending ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </>
  );
}
