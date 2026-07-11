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
import { useCreateCropRequest } from "@/lib/hasat/queries";
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
}

export function CropChips({ value, onChange, variant = "light" }: Props) {
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
                  background: active ? "var(--saffron)" : "rgba(255,255,255,0.05)",
                  borderColor: active ? "var(--saffron)" : "rgba(255,255,255,0.15)",
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
                background: active ? "var(--saffron)" : "transparent",
                color: active ? "var(--hwhite)" : undefined,
                borderColor: active ? "var(--saffron)" : undefined,
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
          aria-label="Ürününüzü bulamadınız mı? Talep edin"
        >
          + Ürününüzü bulamadınız mı? Talep edin
        </button>
      </div>

      <CropRequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} />
    </>
  );
}

function CropRequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateCropRequest();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Ürün adı gerekli");
    try {
      await create.mutateAsync({ cropName: trimmed, note });
      toast.success("Talebiniz alındı, teşekkürler.");
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
            Kataloğumuzda olmayan bir ürününüz mü var? Bize bildirin, ekleyelim.
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
              placeholder="Ek bilgi, üretim yeri, birim, vs."
              maxLength={500}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="rounded-xl bg-saffron px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {create.isPending ? "Gönderiliyor…" : "Gönder"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
