# Tema & UI temizlik planı (yalnızca `src/`)

Kapsam: sunum katmanı. Backend, DB, sorgu ve iş mantığı dokunulmuyor. `supabase/` klasörü hariç.

## 1) `--lav` → `--saffron` / `--gold` (yalnızca AI yüzeyleri)

AI ile ilgili yüzeylerdeki `var(--lav)` kullanımlarını mevcut sıcak palete taşı. Diğer `--lav` kullanımları (kargo durumu, coğrafi işaret rozeti, kapsama rozeti, lavanta ürün chipi, üretici/abonelik ipuçları) **dokunulmuyor** — bunlar AI değil.

Değiştirilecek dosyalar:
- `src/components/hasat/ai-chat/FarmerAIChat.tsx` — FAB arka planı (satır 218, 250, 345) ve mesaj balonu sol border (satır 61) `var(--gold)`; hover/aktif tonlar `var(--saffron)`.
- `src/components/hasat/ai-chat/JournalEntryCard.tsx` — kart border/background/etiket rengi (satır 186, 207–213, 360, 388) `var(--gold)` (yumuşak) + `var(--saffron)` (aksiyon).
- `src/components/hasat/AIBox.tsx` — Sparkles, sol border, skeleton, hover (satır 85–163) `var(--gold)` bazlı.
- `src/components/hasat/AIInsightBanner.tsx` — arka plan/border `var(--gold)`.
- `src/components/hasat/UpgradeModal.tsx` — Sparkles ikon rengi `var(--gold)` (satır 13).
- `src/routes/farmer.settings.tsx:260` — AI ayarı yanındaki Sparkles rengi `var(--gold)`.

`--lav` token'ı `styles.css` içinde kalır (AI dışı kullanımlar için).

## 2) WhatsApp yeşili (`#25D366`) yalnızca gerçek WhatsApp bağlamı

Denetim: `#25D366` şu an sadece `farmer.referral.tsx:67` (paylaş butonu) ve `FarmerAIChat.tsx:278` (WhatsApp iconu). Referral: `wa.me` bağlantısı — kalır. FarmerAIChat'teki `MessageCircle` ikonunun rengi zaten "WhatsApp'tan da yazabilirsin" satırında ve gerçek WhatsApp linkine ait — kalır. Ek bir yerde WhatsApp yeşili kullanımı yok. Değişiklik: **yok** (sadece doğrulama; başka yere sızmadığından emin olduk).

## 3) 48×48px minimum dokunma alanı

Tarama sonrası küçük interaktif elemanlar aşağıdaki yerlerde:
- `buyer.discover.tsx` — arama input (`py-2.5`), sıralama chip'leri (`py-1`), filtre chipleri (`py-1`), "Teklif Ver →" chip (`py-1.5`). Bunlara `min-h-[48px]` (chip'lerde `min-h-[44px]` yerine 48) + görsel dengesi için padding ayarı.
- `farmer.settings.notifs.tsx` — geri linki (`ChevronLeft`), Switch hücreleri. Switch bileşeni shadcn varsayılan yükseklikte küçük; hücreyi `min-h-[48px]` yaparak dokunma hedefi büyütülür.
- `login.tsx` — kanal seçim butonları (WA/SMS), OTP hane input'ları — `min-h-[48px]`.
- `NotificationBell.tsx`, `RoleSwitcher.tsx`, `BuyerHeader` sıralama/filtre chip'leri, üst nav ikon butonları.
- `FarmerAIChat.tsx` alt sekme/hızlı komut chip'leri.
- Herhangi bir `size="sm"` / `size="icon"` shadcn Button için görünürlüğü koruyup `min-h-[48px] min-w-[48px]` (icon buton) veya sadece `min-h-[48px]` ekle.

Yaklaşım: tek satır yardımcı sınıf ile (`min-h-[48px] min-w-[48px]` icon; sadece `min-h-[48px]` metin) noktasal ekleme. Global CSS'te `@utility touch-target` tanımlanmayacak — her yerde açıkça uygulanacak ki başkaları görsün.

Denetim listesi: `rg -n "py-1[^0-9]|py-1\.5|h-8|h-9|size=\"icon\"|size=\"sm\"" src/routes src/components/hasat` çıktısında geçen tüm interaktif düğümlerden gerçekten tıklanabilir olanlar. Salt dekoratif rozetler (TierBadge, StockBadge, TrustBadge, OrderChip) dokunulmaz — bunlar buton değil.

## 4) Ortak componentler — `src/components/hasat/common/`

Sadece oluştur, kullanım yerlerini değiştirme.

- `StatCard.tsx`
  ```tsx
  export function StatCard({
    label, value, accent, className
  }: { label: string; value: ReactNode; accent?: "saffron" | "gold" | "sage" | "hred"; className?: string })
  ```
  Yapı: `rounded-xl border bg-card p-4`. `accent` verilirse sol 3px border rengi veya value rengi `var(--<accent>)`.

- `SectionCard.tsx`
  ```tsx
  export function SectionCard({
    title, action, children, className
  }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string })
  ```
  Yapı: `rounded-2xl border bg-card`. Header: `flex items-center justify-between px-4 py-3 border-b`, title serif. Body: `p-4`.

- `PhotoListingCard.tsx`
  ```tsx
  export function PhotoListingCard({
    photo, title, subtitle, price, unit, badge, onClick, disabled
  }: {
    photo?: string; title: ReactNode; subtitle?: ReactNode;
    price: number; unit: string; badge?: ReactNode;
    onClick?: () => void; disabled?: boolean;
  })
  ```
  `buyer.discover.tsx`'teki `ListingCard`'ın yeniden kullanılabilir hali. Foto yoksa saffron çizgili fallback; overlay + serif başlık + `formatTRY` fiyat. Bu fazda **hiçbir yerde kullanılmıyor** — sonraki fazların hazır bulacağı bir bileşen.

Barrel: `src/components/hasat/common/index.ts` — üçünü re-export.

## 5) `farmer.settings.notifs.tsx` mobil düzen

Mevcut tablo `≥sm` breakpoint'inde aynı kalır. `<sm` (≤640px) için her olay bir kart:

```
┌─────────────────────────┐
│ Yeni Teklif             │
├─────────────────────────┤
│ WhatsApp        [ ⬤—— ]│
│ Push            [ ——⬤ ]│
│ SMS             [ ⬤—— ]│
└─────────────────────────┘
```

Uygulama: mevcut `<div className="rounded-xl border bg-card">…</div>` bloğunu `hidden sm:block` yap; onun altına `sm:hidden space-y-3` içinde her `EVENTS[i]` için kart. Kart içi her kanal satırı `flex items-center justify-between min-h-[48px] px-4 py-2`; kanal yoksa satır render edilmez. `Switch` aynı `useUpdateNotifPrefs` mutation'a bağlı, iş mantığı değişmiyor.

Not: EVENTS dizisinde "Hasat Zamanı" iki kez tekrar ediyor (satır 26–32). Sorulmadı, ama açıkça bug — planın parçası olarak **hayır**, kapsam dışı bırakıldı; istenirse ayrı bir fixte alırım.

## Doğrulama

- `tsgo` sonda temiz olmalı.
- Ekran: mobil (375px) ve masaüstü (1280px) genişlikte `/farmer/settings/notifs` görsel doğrulaması (Playwright screenshot) — mobilde kart, masaüstünde tablo görünsün.
- `rg` ile: AI dosyalarında `var(--lav)` referansı sıfır olmalı; AI-dışı dosyalarda dokunulmamış olmalı. `#25D366` sadece `farmer.referral.tsx` + `FarmerAIChat.tsx`'te olmalı.

## Kapsam dışı

- `styles.css` `--lav` token silinmez (AI-dışı kullanıcılar var).
- Backend, `supabase/` migration, RLS, MCP — dokunulmuyor.
- Yeni common componentlerin çağrı yerine göç ettirilmesi — bir sonraki faza.
