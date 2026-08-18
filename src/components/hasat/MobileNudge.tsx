import { useState } from "react";
import { Check, Info, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StoreBadges } from "@/components/hasat/StoreBadges";

/**
 * P23-M7-a — web → mobil nudge. Web'deki alıcı, mobilde olup webde olmayan
 * bir yeteneği görsün diye. Kural (Berkin, 2026-08-04):
 *   - İçerik web deneyimini KISITLAMAZ — sayfanın geri kalanı aynı çalışır.
 *   - Tam sayfa interstitial YOK (Google mobil sıralama cezası + SEO huninin
 *     üst ağzı buradaki bir sayfa).
 *   - Kalıcı süreç kuralı: her mobil özellik eklendiğinde aynı turda web
 *     nudge karşılığı değerlendirilir (bkz. Build/P23-Mobile.md).
 * Bu yüzden inline, akışın içinde, kapatılamaz ama sayfayı hiç bloklamayan
 * küçük bir kart — banner/interstitial değil.
 *
 * `withInfoCta`: opsiyonel "i" butonu — yalnızca tıklanınca (otomatik AÇILMAZ)
 * mobil uygulamanın gerçek yeteneklerini ve web-only ödeme sınırını anlatan
 * kapatılabilir bir pop-up açar.
 */
export function MobileNudge({ text, withInfoCta }: { text: string; withInfoCta?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs text-hmuted">
        <Smartphone className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">{text}</span>
        {withInfoCta && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-full p-1 text-hmuted transition hover:bg-black/5 hover:text-foreground"
            aria-label="Mobil uygulama hakkında daha fazla bilgi"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {withInfoCta && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" style={{ color: "var(--saffron)" }} />
                Neden mobil?
              </DialogTitle>
              <DialogDescription>Hasat mobil uygulaması çok yakında yayında.</DialogDescription>
            </DialogHeader>

            <ul className="space-y-2 text-sm text-foreground">
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--sage)" }} />
                Teklifine yanıt geldiğinde anında bildirim alırsın.
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--sage)" }} />
                Tarifin malzemesinden doğrudan teklif oluşturursun.
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--sage)" }} />
                Siparişlerini tek bir ekrandan takip edersin.
              </li>
            </ul>

            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-hmuted">
              Şimdilik ödeme adımı yalnızca web'de — teklifini oluşturduktan sonra ödemeyi web'den
              tamamlarsın. Mobilde ödeme desteği için çalışmalar sürüyor.
            </p>

            <StoreBadges />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
