import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, AlertTriangle, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParcels, useAuthUserId } from "@/lib/hasat/queries";
import { ZERO_COSTS } from "@/lib/hasat/journal-meta";
import type { ParsedJournal } from "./parseJournalEntry";

interface Props {
  initial: ParsedJournal;
  messageId: string;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; updated: boolean }
  | { kind: "error"; message: string };

interface ExistingRow {
  id: string;
  quantity: number;
  unit: "g" | "kg" | "L";
  quality: "A" | "B" | "C";
  notes: string | null;
  costs: any;
  parcel_id: string;
}

interface CostRow { label: string; amount: string }

const KNOWN_COST_KEYS = new Set(["labor", "fertilizer", "packaging", "transport", "other"]);

function initialCostRows(costs?: Record<string, number>): CostRow[] {
  if (!costs) return [];
  return Object.entries(costs)
    .filter(([, v]) => Number.isFinite(v) && v !== 0)
    .map(([k, v]) => ({ label: k, amount: String(v) }));
}

function buildCostsPayload(rows: CostRow[]): Record<string, number> {
  const out: Record<string, number> = { ...ZERO_COSTS };
  for (const r of rows) {
    const n = Number(r.amount);
    if (!Number.isFinite(n) || n === 0) continue;
    const key = r.label.trim().toLowerCase();
    if (KNOWN_COST_KEYS.has(key)) {
      out[key] = (out[key] ?? 0) + n;
    } else {
      out.other = (out.other ?? 0) + n;
    }
  }
  return out;
}

function resolveInitialParcel(
  initial: ParsedJournal,
  parcels: { id: string; name: string }[],
): string {
  if (!parcels.length) return "";
  if (initial.parcel_id && parcels.some((p) => p.id === initial.parcel_id)) return initial.parcel_id;
  if (initial.parcel_name) {
    const target = initial.parcel_name.trim().toLowerCase();
    const m = parcels.find((p) => p.name.trim().toLowerCase() === target);
    if (m) return m.id;
    const partial = parcels.find((p) => p.name.toLowerCase().includes(target));
    if (partial) return partial.id;
  }
  if (parcels.length === 1) return parcels[0].id;
  return "";
}

export function JournalEntryCard({ initial }: Props) {
  const userId = useAuthUserId();
  const { data: parcels = [] } = useParcels();
  const qc = useQueryClient();

  const [crop, setCrop] = useState(initial.crop);
  const [quantity, setQuantity] = useState<string>(String(initial.quantity));
  const [unit, setUnit] = useState<"g" | "kg" | "L">(initial.unit);
  const [quality, setQuality] = useState<"A" | "B" | "C">(initial.quality ?? "A");
  const [date, setDate] = useState<string>(initial.harvest_date);
  const [parcelId, setParcelId] = useState<string>("");
  const [notes, setNotes] = useState<string>(initial.notes ?? "");
  const [costRows, setCostRows] = useState<CostRow[]>(initialCostRows(initial.costs));
  const [costsOpen, setCostsOpen] = useState<boolean>((initial.costs && Object.keys(initial.costs).length > 0) ?? false);

  const [dismissed, setDismissed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [existing, setExisting] = useState<ExistingRow | null>(null);
  const [forceInsert, setForceInsert] = useState(false);
  const checkedKeyRef = useRef<string>("");

  // Resolve parcel once parcels arrive
  useEffect(() => {
    if (parcelId || !parcels.length) return;
    const resolved = resolveInitialParcel(initial, parcels);
    if (resolved) setParcelId(resolved);
  }, [parcels, parcelId, initial]);

  // Duplicate check + saved-state hydration
  useEffect(() => {
    if (!userId) return;
    const c = crop.trim();
    if (!c || !date) return;
    const key = `${c.toLowerCase()}|${date}`;
    if (checkedKeyRef.current === key) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("harvest_entries")
        .select("id, quantity, unit, quality, notes, costs, parcel_id")
        .eq("farmer_id", userId)
        .eq("crop", c)
        .eq("harvest_date", date)
        .maybeSingle();
      if (cancelled) return;
      checkedKeyRef.current = key;
      setExisting((data as ExistingRow | null) ?? null);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [userId, crop, date]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!crop.trim()) next.crop = "Ürün adı gerekli";
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) next.quantity = "Geçerli miktar girin";
    if (!date) next.date = "Tarih gerekli";
    if (!parcelId) next.parcel = "Parsel seçin";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const doInsert = async () => {
    if (!userId) return;
    if (!validate()) return;
    setSaveState({ kind: "saving" });
    const { error } = await supabase.from("harvest_entries").insert({
      farmer_id: userId,
      parcel_id: parcelId,
      crop: crop.trim(),
      quantity: Number(quantity),
      unit,
      quality,
      notes: notes.trim() || null,
      costs: buildCostsPayload(costRows) as any,
      harvest_date: date,
      photo_urls: [],
    });
    if (error) {
      setSaveState({ kind: "error", message: "Kayıt sırasında bir hata oluştu. Tekrar deneyin." });
      return;
    }
    qc.invalidateQueries({ queryKey: ["entries", userId] });
    setSaveState({ kind: "saved", updated: false });
  };

  const doUpdate = async () => {
    if (!userId || !existing) return;
    if (!validate()) return;
    setSaveState({ kind: "saving" });
    const { error } = await supabase.from("harvest_entries").update({
      quantity: Number(quantity),
      unit,
      quality,
      notes: notes.trim() || null,
      costs: buildCostsPayload(costRows) as any,
    }).eq("id", existing.id);
    if (error) {
      setSaveState({ kind: "error", message: "Kayıt sırasında bir hata oluştu. Tekrar deneyin." });
      return;
    }
    qc.invalidateQueries({ queryKey: ["entries", userId] });
    setSaveState({ kind: "saved", updated: true });
  };

  if (dismissed) return null;

  if (saveState.kind === "saved") {
    return (
      <div
        className="mt-2 rounded-xl border-l-2 px-3 py-2 text-sm flex items-center gap-2"
        style={{ borderLeftColor: "var(--gold)", background: "color-mix(in oklab, var(--gold) 10%, white)" }}
      >
        <Check className="h-4 w-4" style={{ color: "var(--sage, #16a34a)" }} />
        <span>{saveState.updated ? "Güncellendi" : "Kaydedildi"}</span>
        <Link
          to="/farmer/journal"
          className="ml-auto text-xs underline"
          style={{ color: "var(--saffron)" }}
        >
          Günlüğe git →
        </Link>
      </div>
    );
  }

  const saving = saveState.kind === "saving";

  return (
    <div
      className="mt-2 rounded-xl border-l-2 p-3 space-y-3 text-sm"
      style={{
        borderLeftColor: "var(--gold)",
        background: "color-mix(in oklab, var(--gold) 8%, white)",
        border: "1px solid color-mix(in oklab, var(--gold) 30%, transparent)",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--gold)" }}>
          Günlük Kaydı
        </span>
      </div>

      {existing && !forceInsert && (
        <div className="rounded-lg px-2.5 py-2 text-xs flex items-start gap-2"
          style={{ background: "color-mix(in oklab, #f59e0b 15%, white)", color: "#92400e" }}>
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Bu tarihte aynı ürün için bir kayıt var.</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Ürün" error={errors.crop} className="col-span-2">
          <input value={crop} onChange={(e) => setCrop(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Miktar" error={errors.quantity}>
          <input
            type="number" inputMode="decimal" value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputCls + " font-mono"}
          />
        </Field>
        <Field label="Birim">
          <Segmented value={unit} options={["g", "kg", "L"] as const} onChange={setUnit} />
        </Field>
        <Field label="Kalite">
          <Segmented value={quality} options={["A", "B", "C"] as const} onChange={setQuality} />
        </Field>
        <Field label="Tarih" error={errors.date}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Parsel" error={errors.parcel} className="col-span-2">
          <select value={parcelId} onChange={(e) => setParcelId(e.target.value)} className={inputCls}>
            <option value="">Parsel seçin</option>
            {parcels.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Not (opsiyonel)" className="col-span-2">
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)}
            rows={2} className={inputCls + " resize-none"}
          />
        </Field>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setCostsOpen((v) => !v)}
          className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={`h-3 w-3 transition ${costsOpen ? "rotate-0" : "-rotate-90"}`} />
          Maliyet ekle{costRows.length ? ` (${costRows.length})` : ""}
        </button>
        {costsOpen && (
          <div className="mt-2 space-y-1.5">
            {costRows.map((r, i) => (
              <div key={i} className="flex gap-1.5">
                <input
                  placeholder="Etiket (örn. labor)"
                  value={r.label}
                  onChange={(e) => setCostRows((rows) => rows.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  className={inputCls + " flex-1"}
                />
                <input
                  type="number" inputMode="decimal" placeholder="0"
                  value={r.amount}
                  onChange={(e) => setCostRows((rows) => rows.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                  className={inputCls + " w-24 font-mono"}
                />
                <button
                  type="button"
                  onClick={() => setCostRows((rows) => rows.filter((_, j) => j !== i))}
                  className="px-2 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setCostRows((rows) => [...rows, { label: "", amount: "" }])}
              className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Satır ekle
            </button>
          </div>
        )}
      </div>

      {saveState.kind === "error" && (
        <div className="text-xs rounded-md px-2.5 py-1.5" style={{ background: "color-mix(in oklab, #dc2626 12%, white)", color: "#991b1b" }}>
          {saveState.message}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {existing && !forceInsert ? (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={doUpdate}
              className="rounded-lg px-3 py-1.5 text-xs font-medium border disabled:opacity-50"
              style={{ borderColor: "var(--sage, #16a34a)", color: "var(--sage, #16a34a)" }}
            >
              Mevcut Kaydı Güncelle
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => { setForceInsert(true); doInsert(); }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ background: "var(--saffron)" }}
            >
              {saving ? "Kaydediliyor…" : "Yine de Kaydet"}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={doInsert}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ background: "var(--saffron)" }}
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => setDismissed(true)}
          className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          İptal
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--gold)]";

function Field({
  label, error, children, className,
}: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="mt-0.5">{children}</div>
      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </label>
  );
}

function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-md border overflow-hidden">
      {options.map((o) => {
        const active = o === value;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className="flex-1 px-2 py-1.5 text-xs transition"
            style={active
              ? { background: "var(--gold)", color: "white" }
              : { background: "white", color: "var(--dark)" }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
