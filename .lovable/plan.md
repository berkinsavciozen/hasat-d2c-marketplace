## Onboarding Turu — Plan

### 1. Yeni component: `src/components/hasat/OnboardingTour.tsx`

Client-only, portal tabanlı spotlight + tooltip overlay.

**Props:**
- `steps: TourStep[]` — `{ selector: string; title: string; body: string; placement?: "top"|"bottom"|"left"|"right" }`
- `open: boolean`
- `onClose: () => void` (Atla veya son "Bitir" → localStorage flag set + `onClose()`)
- `storageKey?: string` (default: `"hasat_onboarding_tour_done"`)

**Davranış:**
- `useEffect` ile aktif adımın `document.querySelector(selector)` bounding rect'ini ölçer; window resize + scroll dinler.
- Sabit overlay: `position:fixed inset-0`, `background: rgba(0,0,0,0.55)`, `z-index: 60` (üstte, `FarmerAIChat` FAB'ı `z-40` civarı).
- Spotlight: hedef rect'i etrafında 8px padding'li `box-shadow: 0 0 0 9999px rgba(0,0,0,0.55)` ile "delik" efekti + `border: 2px solid var(--saffron)`, `border-radius: 12px`. Hedef bulunamazsa (`rect==null`) merkezî tooltip fallback.
- Tooltip kartı: `bg-card border rounded-2xl p-4 shadow-lg max-w-[320px]`, placement'a göre hedefin altına/üstüne konumlanır (viewport clamp).
- İçerik: başlık (`font-serif`), body (text-sm text-hmuted), `ProgressDots` (mevcut component — 5 nokta), butonlar:
  - "Atla" — sol, ghost, `min-h-[48px] min-w-[48px]`, saffron text
  - "İleri" (son adımda "Bitir") — sağ, `bg-saffron text-white rounded-full min-h-[48px] px-5`
- Hedef elemana geçici `scrollIntoView({ block: "center", behavior: "smooth" })`.
- Escape tuşu = Atla.

### 2. Adımlar (farmer.home odaklı)

`src/lib/hasat/onboarding-tour.ts` — adım tanımlarını export eder (test edilebilir + `farmer.tsx`'ten de tetiklemek için):

```ts
export const FARMER_TOUR_STEPS = [
  { selector: '[data-tour="ai-box"]', title: "Günün Özeti", body: "..." },
  { selector: '[data-tour="chat-input"]', title: "Hasadını Yaz", body: "..." },
  { selector: '[data-tour="whatsapp"]', title: "WhatsApp'tan Gönder", body: "..." },
  { selector: '[data-tour="tab-storefront"]', title: "Vitrin", body: "..." },
  { selector: '[data-tour="tab-prices"]', title: "Fiyatlar", body: "..." },
];
```

Bu selector'ları taşımak için `data-tour` attribute'ları eklenecek:
- `farmer.home.tsx`: `ChatInputBar`'daki chat button (`chat-input`), WhatsApp `<a>` (`whatsapp`), `AIBox` sarmalayıcı (`ai-box`) — AIBox'ı `<div data-tour="ai-box">` ile sar (component'e prop eklemeden).
- `farmer.tsx`: sidebar + mobile tabs'taki `to="/farmer/storefront"` ve `to="/farmer/prices"` linklerine `data-tour` attribute'u. `Link`'e `data-tour` geçmek TanStack Router'da `data-*` olarak DOM'a düşer.

### 3. Otomatik başlatma — `farmer.home.tsx`

```ts
const [tourOpen, setTourOpen] = useState(false);
useEffect(() => {
  if (typeof window === "undefined") return;
  if (localStorage.getItem("hasat_onboarding_tour_done")) return;
  // küçük gecikme: DOM + tabs mount olsun
  const t = setTimeout(() => setTourOpen(true), 600);
  return () => clearTimeout(t);
}, []);
```

`<OnboardingTour steps={FARMER_TOUR_STEPS} open={tourOpen} onClose={() => setTourOpen(false)} />` sayfanın sonunda render.

`isEmpty` ile bağlamıyoruz (kullanıcı isterse boş olmayan hesapta da görebilir; ilk-yükleme sınırı zaten localStorage flag'i).

### 4. "Nasıl Çalışır?" — `farmer.tsx` Daha menüsü

`moreItems` **link** dizisi değişmiyor (routing yok). Sheet içindeki `Ayarlar` linkinin üzerine ayrı bir `<button>` eklenir:

```tsx
<button
  onClick={() => {
    localStorage.removeItem("hasat_onboarding_tour_done");
    setMoreOpen(false);
    // Ana sayfaya git ki tur mount olsun
    // Router.navigate + custom event ile tetikle
    window.dispatchEvent(new CustomEvent("hasat:tour:restart"));
    navigate({ to: "/farmer/home" });
  }}
  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm min-h-[48px] text-hwhite/80 hover:bg-white/5"
>
  <HelpCircle className="h-4 w-4" />
  <span>Nasıl Çalışır?</span>
</button>
```

`farmer.home.tsx` `useEffect` içinde ek dinleyici: `hasat:tour:restart` → `setTourOpen(true)`.

Desktop sidebar için de sidebar footer'daki settings link'inin yanına küçük bir "Nasıl Çalışır?" satırı eklenir (aynı handler).

### 5. Stil / Erişim
- Tüm butonlar `min-h-[48px]`, tooltip kartındaki "İleri"/"Atla" için `min-w-[48px]`.
- Renkler: spotlight border + "İleri" `var(--saffron)`, progress dots mevcut `ProgressDots` (zaten saffron).
- Overlay `role="dialog"`, `aria-modal="true"`, `aria-labelledby` başlığa bağlanır.
- Escape / overlay click "Atla" gibi çalışır.

### 6. Doğrulama
- `bunx tsgo --noEmit`
- Yeni dosyalar: `OnboardingTour.tsx`, `onboarding-tour.ts`
- Değişen dosyalar: `farmer.home.tsx`, `farmer.tsx`
- `supabase/`'e dokunulmuyor.
