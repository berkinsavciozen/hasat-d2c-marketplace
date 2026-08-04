import { Smartphone } from "lucide-react";

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
 */
export function MobileNudge({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs text-hmuted">
      <Smartphone className="h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
