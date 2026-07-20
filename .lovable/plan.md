Plan: Çiftçi onboarding turu implementasyonu

Kapsam: Sadece `src/` içinde çalışılacak; `supabase/` dokunulmayacak.

1. Yeni `OnboardingTour` component'i (`src/components/hasat/OnboardingTour.tsx`)
   - 5 adımlı spotlight/tooltip turu:
     1. AIBox — `data-tour="ai-box"`
     2. "Hasadını yaz" chat input çubuğu — `data-tour="chat-input"`
     3. WhatsApp linki — `data-tour="whatsapp"`
     4. Vitrin sekmesi — `data-tour="tab-storefront"`
     5. Fiyatlar sekmesi — `data-tour="tab-prices"`
   - Her adım: başlık, açıklama, ilerleme göstergesi (ProgressDots), "İleri" / "Atla" butonları.
   - Tamamlandığında veya "Atla"ya basıldığında `localStorage.setItem("hasat_onboarding_tour_done", "1")`.
   - Spotlight overlay: hedef element etrafında kesilmiş, geri kalanı koyu overlay; hedefe tıklanabilir.
   - Tooltip konumlandırma: `top`, `bottom`, `left`, `right`; viewport dışına taşmaması için clamp.

2. Tur adımlarının veri yapısı (`src/lib/hasat/onboarding-tour.ts`)
   - `TourStep` tipi ve `FARMER_TOUR_STEPS` sabiti.
   - `FARMER_TOUR_STORAGE_KEY` sabiti.

3. `farmer.home.tsx` entegrasyonu
   - `OnboardingTour` render et.
   - `AIBox`, `ChatInputBar`, WhatsApp linkine `data-tour` atributları ekle.
   - `useEffect` ile sayfa yüklenince `localStorage` flag kontrolü yap; flag set değilse `setTimeout` ile turu aç.
   - `hasat:tour:restart` custom event'ini dinleyip turu yeniden aç.

4. `farmer.tsx` shell entegrasyonu
   - Desktop sidebar ve mobile "Daha" sheet'e `HelpCircle` ikonlu "Nasıl Çalışır?" butonu/linki ekle.
   - Buton: `localStorage.removeItem(FARMER_TOUR_STORAGE_KEY)` yapıp, eğer zaten `/farmer/home` sayfasındaysa doğrudan `hasat:tour:restart` event'i dispatch et; değilse `navigate({ to: "/farmer/home" })` sonrası event dispatch et.
   - Vitrin ve Fiyatlar sekmelerine (desktop sidebar + mobile bottom bar) `data-tour` atributları ekle.

5. Stil ve erişilebilirlik
   - Mevcut token sistemini kullan: `--saffron`, `--gold`, `--dark`, `--hwhite`, `--card`, `--hmuted`.
   - Tüm interaktif tur butonları ve kapatma alanları minimum 48×48px dokunma hedefi.
   - Dialog rolü, aria-modal, aria-labelledby ile ekran okuyucu dostu yap.

6. Doğrulama
   - `npx tsgo --noEmit` ile tip kontrolü.
   - Tarayıcıda turu atla, bitir ve "Nasıl Çalışır?" ile yeniden başlatma akışlarını test et.