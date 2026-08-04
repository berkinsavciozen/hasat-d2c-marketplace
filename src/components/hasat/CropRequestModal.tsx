import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCreateCropRequest } from "@/lib/hasat/queries";
import { TR_PROVINCES } from "@/lib/hasat/cities";

/**
 * Shared "Talep Et" (request) form — used by both `/buyer/discover` (generic
 * catalog-gap request) and `/tarifler/$slug` (ingredient-driven request, P23-M4-b).
 * Originally lived only in buyer.discover.tsx; extracted here so both surfaces
 * write through the exact same `crop_requests` + matching/SMS path (kural #106 —
 * one source of truth, not two copies that can drift like the send-sms COL map did).
 */
export interface CropRequestModalProps {
  initialCrop: string;
  onClose: () => void;
  onSuccess?: () => void;
  /** Locks the ürün adı field — used when the request is tied to a specific
   * recipe ingredient, so the funnel attribution (recipe_rfq_links) always
   * points at the crop the user actually saw on the card, not a typo/edit. */
  lockCropName?: boolean;
  initialQuantity?: string;
  initialUnit?: "kg" | "g" | "L";
  /** When set, a `recipe_rfq_links` row is written linking the new request
   * back to this recipe — the funnel's "talep" step attribution (P23-M2-ek). */
  recipeId?: string;
  /** Tarım ürünü mü (crop_config'te var) yoksa platform-dışı mı (tuz, un) —
   * admin ısı haritasının iki grubu ayrı gösterebilmesi için (P23-M7-a). */
  ingredientClass?: "tarimsal" | "platform_disi" | null;
}

export function CropRequestModal({
  initialCrop,
  onClose,
  onSuccess,
  lockCropName = false,
  initialQuantity = "",
  initialUnit = "kg",
  recipeId,
  ingredientClass = null,
}: CropRequestModalProps) {
  const create = useCreateCropRequest();
  const [cropName, setCropName] = useState(initialCrop);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [unit, setUnit] = useState<"kg" | "g" | "L">(initialUnit);
  const [region, setRegion] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [note, setNote] = useState("");

  const submit = async () => {
    if (!cropName.trim()) {
      toast.error("Ürün adı gerekli");
      return;
    }
    try {
      const result = await create.mutateAsync({
        cropName: cropName.trim(),
        note: note.trim() || undefined,
        quantity: quantity ? Number(quantity) : null,
        unit: quantity ? unit : null,
        region: region || null,
        targetDateStart: startDate || null,
        targetDateEnd: endDate || null,
        targetPrice: targetPrice ? Number(targetPrice) : null,
        ingredientClass,
      });

      if (recipeId && result?.id) {
        const { error: linkError } = await supabase
          .from("recipe_rfq_links" as any)
          .insert({ recipe_id: recipeId, crop_request_id: result.id });
        if (linkError) console.error("[recipe_rfq_links] insert failed", linkError);
      }

      toast.success(
        "Talebiniz alındı — eşleşen üreticilere bildirim gönderildi. Bu ürün geldiğinde size de haber vereceğiz.",
      );
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-md rounded-t-2xl md:rounded-2xl bg-card p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="font-serif text-lg">Ürün Talep Et</div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-hmuted">Ürün *</label>
            {lockCropName ? (
              <div className="mt-1 w-full rounded-lg border bg-muted px-3 py-2 text-sm min-h-[44px] flex items-center capitalize">
                {cropName}
              </div>
            ) : (
              <input
                value={cropName}
                onChange={(e) => setCropName(e.target.value)}
                placeholder="Ör. safran, zeytinyağı"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]"
              />
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-hmuted">Miktar</label>
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                type="number"
                min="0"
                placeholder="Opsiyonel"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]"
              />
            </div>
            <div>
              <label className="text-xs text-hmuted">Birim</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as "kg" | "g" | "L")}
                className="mt-1 w-full rounded-lg border px-2 py-2 text-sm min-h-[44px] bg-card"
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="L">L</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-hmuted">Bölge</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="mt-1 w-full rounded-lg border px-2 py-2 text-sm min-h-[44px] bg-card"
            >
              <option value="">Farketmez</option>
              {TR_PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-hmuted">Hedef tarih (başlangıç)</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]"
              />
            </div>
            <div>
              <label className="text-xs text-hmuted">Bitiş</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-hmuted">
              Hedef fiyat (₺{quantity && unit ? `/${unit}` : ""})
            </label>
            <input
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              type="number"
              min="0"
              placeholder="Opsiyonel"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]"
            />
          </div>

          <div>
            <label className="text-xs text-hmuted">Not</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Kalite, teslim koşulu vb."
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm resize-none"
            />
          </div>

          <p className="text-[11px] text-hmuted">
            🔔 Bu ürün geldiğinde (bir çiftçi ilan açtığında) size otomatik haber veririz.
          </p>

          <button
            onClick={submit}
            disabled={create.isPending}
            className="w-full rounded-full py-3 text-sm font-medium min-h-[48px]"
            style={{ background: "var(--saffron)", color: "#fff" }}
          >
            {create.isPending ? "Gönderiliyor…" : "Talep Oluştur"}
          </button>
        </div>
      </div>
    </div>
  );
}
