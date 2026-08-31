import { useId, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCreateCropRequest } from "@/lib/hasat/queries";
import { TR_PROVINCES } from "@/lib/hasat/cities";
import { Button } from "@/components/ui/button";

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
  const idPrefix = useId();
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const quantityRef = useRef<HTMLInputElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const fieldId = (name: string) => `${idPrefix}-${name}`;

  const submit = async () => {
    if (create.isPending) return;
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
    } catch {
      toast.error("Talep oluşturulamadı. Bilgileriniz korundu; tekrar deneyin.");
    }
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && !create.isPending && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(event) => create.isPending && event.preventDefault()}
          onPointerDownOutside={(event) => create.isPending && event.preventDefault()}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current = document.activeElement as HTMLElement | null;
            (lockCropName ? quantityRef.current : firstFieldRef.current)?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
          className="fixed bottom-0 left-1/2 z-50 max-h-[90dvh] w-full -translate-x-1/2 overflow-y-auto overscroll-contain rounded-t-2xl bg-card p-5 shadow-lg outline-none md:bottom-auto md:top-1/2 md:max-w-md md:-translate-y-1/2 md:rounded-2xl"
        >
          <div className="flex items-center justify-between mb-4">
            <DialogPrimitive.Title className="font-serif text-lg">
              Ürün Talep Et
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                disabled={create.isPending}
                aria-label="Ürün talebi penceresini kapat"
                className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor={lockCropName ? undefined : fieldId("crop")}
                className="text-xs text-hmuted"
              >
                Ürün *
              </label>
              {lockCropName ? (
                <div className="mt-1 w-full rounded-lg border bg-muted px-3 py-2 text-sm min-h-[44px] flex items-center capitalize">
                  {cropName}
                </div>
              ) : (
                <input
                  ref={firstFieldRef}
                  id={fieldId("crop")}
                  value={cropName}
                  onChange={(e) => setCropName(e.target.value)}
                  placeholder="Ör. safran, zeytinyağı"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]"
                />
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label htmlFor={fieldId("quantity")} className="text-xs text-hmuted">
                  Miktar
                </label>
                <input
                  ref={quantityRef}
                  id={fieldId("quantity")}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  type="number"
                  min="0"
                  placeholder="Opsiyonel"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor={fieldId("unit")} className="text-xs text-hmuted">
                  Birim
                </label>
                <select
                  id={fieldId("unit")}
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
              <label htmlFor={fieldId("region")} className="text-xs text-hmuted">
                Bölge
              </label>
              <select
                id={fieldId("region")}
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
                <label htmlFor={fieldId("start")} className="text-xs text-hmuted">
                  Hedef tarih (başlangıç)
                </label>
                <input
                  id={fieldId("start")}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor={fieldId("end")} className="text-xs text-hmuted">
                  Bitiş
                </label>
                <input
                  id={fieldId("end")}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]"
                />
              </div>
            </div>

            <div>
              <label htmlFor={fieldId("price")} className="text-xs text-hmuted">
                Hedef fiyat (₺{quantity && unit ? `/${unit}` : ""})
              </label>
              <input
                id={fieldId("price")}
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                type="number"
                min="0"
                placeholder="Opsiyonel"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]"
              />
            </div>

            <div>
              <label htmlFor={fieldId("note")} className="text-xs text-hmuted">
                Not
              </label>
              <textarea
                id={fieldId("note")}
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

            <Button
              onClick={submit}
              loading={create.isPending}
              loadingLabel="Talep oluşturuluyor"
              className="w-full rounded-xl py-3 text-sm font-medium min-h-[48px]"
            >
              Talep Oluştur
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
