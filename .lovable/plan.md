## Hedef
Hasat'ın tema katmanını sadeleştirmek, dokunma hedeflerini erişilebilirlik standardına çıkarmak, tekrar eden UI parçalarını ortak componentlere ayırmak ve bildirim ayarları tablosunu mobilde okunur hale getirmek. Yalnızca `src/` altında çalışılacak; `supabase/` klasörüne dokunulmayacak.

---

## 1) AI vurgu renklerini `--lav`'dan `--gold`/`--saffron`'a taşı

`--lav` (lavanta) tokenı `styles.css`'te kalır (AI-dışı rozet/etiketlerde hâlâ meşru kullanımı var), ama AI yüzeylerinden temizlenir.

Dokunulacak dosyalar:
- `src/components/hasat/ai-chat/FarmerAIChat.tsx` — FAB arka planı, header sparkles ikonu, assistant mesaj balonu border'ı, gönder butonu → `var(--gold)` / `var(--saffron)`.
- `src/components/hasat/AIBox.tsx` — AI insight kartındaki lavanta arka plan/border → gold.
- `src/components/hasat/AIInsightBanner.tsx` — banner arka plan + border → gold.
- `src/components/hasat/ai-chat/JournalEntryCard.tsx` — AI-özet kart border ve badge → gold.
- `src/components/hasat/UpgradeModal.tsx` — sparkles ikon rengi → gold.
- `src/routes/farmer.settings.tsx` — üyelik/AI ikonu → gold.

WhatsApp yeşili (`#25D366`): audit sonucu sadece `farmer.referral.tsx` (wa.me davet linki) ve `FarmerAIChat.tsx` (WhatsApp ile devam et CTA'sı) içinde geçiyor — dokunulmaz. Başka yerde tespit edilirse kaldırılır.

## 2) 48×48px minimum dokunma alanı

Sistematik audit + hedefli düzeltmeler:
- `src/components/hasat/NotificationBell.tsx` — `h-9 w-9` → `min-h-[48px] min-w-[48px]`, ikon `h-5 w-5`.
- `src/routes/login.tsx` — WhatsApp/SMS kanal seçim butonlarına `min-h-[48px]`.
- `src/routes/buyer.discover.tsx` — arama input, filtre chip'leri, sıralama chip'leri, "Teklif Ver" pill → `min-h-[48px]`.
- `src/components/hasat/ai-chat/FarmerAIChat.tsx` — header ghost butonları (History/Plus/X) `min-h-[48px] min-w-[48px]`.
- `RoleSwitcher` dev-only floating switcher olduğu için kapsam dışı bırakılır (kullanıcıya sunulmuyor).

Diğer route'lar (`farmer.*`, `buyer.*`) hızlıca taranır; standart shadcn `Button` default (`h-10`) ve `size="lg"` (`h-11`) olan primary CTA'lar için className ile `min-h-[48px]` eklenir. Zaten `h-12+` olanlara dokunulmaz.

## 3) Ortak componentler — `src/components/hasat/common/`

Yeni dosyalar (mevcut kullanım yerleri değiştirilmez):
- `StatCard.tsx` — props: `label: string`, `value: ReactNode`, `accent?: "saffron" | "gold" | "sage" | "muted"`, `icon?: ReactNode`. `farmer.analytics.tsx`'teki StatCard pattern'ini genelleştirir.
- `SectionCard.tsx` — props: `title?: ReactNode`, `action?: ReactNode`, `children: ReactNode`, `className?: string`. Başlıklı bordered card wrapper.
- `PhotoListingCard.tsx` — props: `photo?: string | null`, `title: string`, `subtitle?: string`, `price?: string`, `badge?: ReactNode`, `onClick?: () => void`, `disabled?: boolean`. `buyer.discover.tsx` ListingCard'ın soyutlanmış hali; foto yokken saffron çizgili fallback pattern.
- `index.ts` — barrel export.

Sonraki fazlarda tüketicilere migre edilecek; bu fazda sadece dosyalar oluşur.

## 4) `farmer.settings.notifs.tsx` — mobil responsive

Mevcut tablo (`grid-cols-[1fr_repeat(3,auto)]`) desktop'ta kalır, `sm:` üzerinden gösterilir. Mobilde (`sm:hidden`) her olay için:

```text
┌─────────────────────────────────┐
│ Yeni Teklif                     │
├─────────────────────────────────┤
│ WhatsApp              [toggle]  │  ← min-h-[48px]
│ Push                  [toggle]  │
│ SMS                   [toggle]  │
└─────────────────────────────────┘
```

Kartlar `border border-border bg-card rounded-xl`, satırlar `divide-y`. Sadece o olayda tanımlı kanallar render edilir (`e.cols[c.key]` null ise satır atlanır). Ayrıca `EVENTS` dizisindeki duplicate "Hasat Zamanı" satırı temizlenir.

## Doğrulama
- `bunx tsgo --noEmit` sıfır hata.
- Görsel spot-check: preview'da AI FAB gold, notifs sayfası mobil viewport'ta dikey kartlar, NotificationBell parmak dokunuşuna yeter büyüklükte.

## Kapsam dışı
- Backend / DB / RLS / supabase functions.
- Ortak componentlerin mevcut sayfalara migrasyonu (sonraki faz).
- `--lav` tokenının kaldırılması (crop tag'lerde kullanımı sürüyor).
