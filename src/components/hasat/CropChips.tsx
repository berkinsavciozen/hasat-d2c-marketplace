/**
 * Multi-select crop chip picker backed by the shared crop_config catalog.
 * Shows a skeleton row while the catalog loads.
 *
 * Extras:
 * - Renders a small "🏛️" badge for crops with an official price source
 *   (has_official_price_source), so farmers can see at a glance which
 *   crops are backed by e.g. HKS.
 * - Trailing "Ürününüzü bulamadınız mı? Talep edin" chip opens a small
 *   form that inserts into public.crop_requests.
 */
import { useState } from "react";
import { useCropOptions } from "@/lib/hasat/crop-config";
import { useCreateCropRequest, useCreateCropTypeRequest } from "@/lib/hasat/queries";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  variant?: "light" | "dark";
  /** "farmer" = kendi yetiştirdiği ürünü seçiyor (yeni ürün türü talebi gider); "buyer" = ilgilendiği ürünü seçiyor (mevcut alıcı RFQ akışına gider). */
  context: "farmer" | "buyer";
}

export function CropChips({ value, onChange, variant = "light", context }: Props) {
  const { options, isLoading } = useCropOptions();
  const [requestOpen, setRequestOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2" aria-label="Ürünler yükleniyor">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-7 w-20 animate-pulse rounded-full"
            style={{
              background:
                variant === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            }}
          />
        ))}
      </div>
    );
  }

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  const isDark = variant === "dark";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value.includes(o.value);
          const officialBadge = o.hasOfficialPriceSource ? (
            <span
              className="ml-1 text-[10px]"
              title={o.officialSourceName ?? "Resmi kaynak"}
              aria-label={`Resmi kaynak: ${o.officialSourceName ?? "resmi"}`}
            >
              🏛️
            </span>
          ) : null;
          if (isDark) {
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="rounded-full px-3 py-1.5 text-xs border transition"
                style={{
                  background: active ? "var(--primary)" : "rgba(255,255,255,0.05)",
                  borderColor: active ? "var(--primary)" : "rgba(255,255,255,0.15)",
                  color: "var(--hwhite)",
                }}
              >
                {o.emoji} {o.label}
                {officialBadge}
              </button>
            );
          }
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className="rounded-full border px-3 py-1.5 text-xs transition"
              style={{
                background: active ? "var(--primary)" : "transparent",
                color: active ? "var(--hwhite)" : undefined,
                borderColor: active ? "var(--primary)" : undefined,
              }}
            >
              {o.emoji} {o.label}
              {officialBadge}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setRequestOpen(true)}
          className="rounded-full border border-dashed px-3 py-1.5 text-xs transition"
          style={{
            color: isDark ? "var(--hwhite)" : undefined,
            borderColor: isDark ? "rgba(255,255,255,0.25)" : undefined,
            opacity: 0.85,
          }}
          aria-label={context === "farmer" ? "Yetiştirdiğiniz ürün listede yok mu? Talep edin" : "Aradığınız ürün listede yok mu? Talep edin"}
        >
          {context === "farmer" ? "+ Yetiştirdiğiniz ürün yok mu? Talep edin" : "+ Aradığınız ürün yok mu? Talep edin"}
        </button>
      </div>

      {context === "farmer" ? (
        <CropTypeRequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} />
      ) : (
        <CropRequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} />
      )}
    </>
  );
}

/** Buyer: ilgilendiği ürünü katalogda bulamadı — mevcut crop_requests (RFQ) akışına gider. */
function CropRequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateCropRequest();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Ürün adı gerekli");
    try {
      await create.mutateAsync({ cropName: trimmed, note });
      toast.success("Talebiniz alındı — uygun üreticiler bulununca haber vereceğiz.");
      setName("");
      setNote("");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Talep gönderilemedi");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ürün Talebi</DialogTitle>
          <DialogDescription>
            İlgilendiğiniz ürün kataloğumuzda yok mu? Talep gönderin, uygun üreticilerle sizi buluşturalım.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Ürün adı</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Kudret narı"
              maxLength={100}
            />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Not (opsiyonel)</div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ek bilgi, miktar, bölge, vs."
              maxLength={500}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {create.isPending ? "Gönderiliyor…" : "Gönder"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const UNIT_OPTIONS = ["g", "kg", "L", "adet"];

/** Farmer: yetiştirdiği ürün katalogda yok — yeni ürün türü talebi (crop_type_requests), Berkin'e anlık SMS gider. */
function CropTypeRequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateCropTypeRequest();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [category, setCategory] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [lifecycleNotes, setLifecycleNotes] = useState("");
  const [note, setNote] = useState("");

  const reset = () => {
    setName(""); setUnit("kg"); setCategory("");
    setStartMonth(""); setEndMonth(""); setLifecycleNotes(""); setNote("");
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Ürün adı gerekli");
    try {
      await create.mutateAsync({
        cropName: trimmed,
        suggestedDefaultUnit: unit,
        suggestedCategoryGroup: category || null,
        suggestedHarvestWindowStartMonth: startMonth ? Number(startMonth) : null,
        suggestedHarvestWindowEndMonth: endMonth ? Number(endMonth) : null,
        lifecycleNotes: lifecycleNotes || null,
        note: note || null,
      });
      toast.success("Talebiniz alındı, teşekkürler — inceleyip ekleyeceğiz.");
      reset();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Talep gönderilemedi");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni Ürün Türü Talebi</DialogTitle>
          <DialogDescription>
            Yetiştirdiğiniz ürün kataloğumuzda yok mu? Aşağıdaki bilgileri paylaşın, inceleyip ekleyelim.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Ürün adı *</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Kudret narı" maxLength={100} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1.5 text-xs font-medium text-hmuted">Birim</div>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full rounded-lg border bg-input px-3 py-2 text-sm">
                {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-hmuted">Kategori (opsiyonel)</div>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Örn. meyve, sebze, baharat" maxLength={50} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1.5 text-xs font-medium text-hmuted">Hasat ayı başlangıç (opsiyonel)</div>
              <Input value={startMonth} onChange={(e) => setStartMonth(e.target.value.replace(/\D/g, ""))} placeholder="1-12" maxLength={2} />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-hmuted">Hasat ayı bitiş (opsiyonel)</div>
              <Input value={endMonth} onChange={(e) => setEndMonth(e.target.value.replace(/\D/g, ""))} placeholder="1-12" maxLength={2} />
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Nasıl yetiştiriliyor? (opsiyonel)</div>
            <Textarea
              value={lifecycleNotes}
              onChange={(e) => setLifecycleNotes(e.target.value)}
              placeholder="Ekim/dikim, bakım, hasat, kurutma vb. adımları kısaca anlatın"
              maxLength={1000}
              rows={3}
            />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Ek not (opsiyonel)</div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {create.isPending ? "Gönderiliyor…" : "Gönder"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
