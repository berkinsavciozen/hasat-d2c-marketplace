## Amaç
Fiyat sayfasını borsa/finans hissiyle yenile: akıllı önceliklendirme, ürün detay sayfası, her fiyat kaynağı ayrı kartta. Backend hazır — `get_price_history_summary` ve `get_price_history_series` RPC'leri geriye dönük uyumlu `market_sources` / `market_series` alanları döner. Sadece `src/` altında çalışılacak.

## 1) `src/lib/hasat/queries.ts` — tip genişletmeleri (mantık değişmez)
- Yeni tipler:
  ```ts
  export interface MarketSourceSummary {
    sourceCode: string;
    displayName: string;
    region: string | null;
    avgPrice: number | null;
  }
  export interface MarketSourceSeries {
    sourceCode: string;
    displayName: string;
    region: string | null;
    series: PriceHistorySeriesPoint[];
  }
  ```
- `PriceHistorySummary`'e `marketSources: MarketSourceSummary[]` alanı ekle. `usePriceHistorySummary` içinde `row.market_sources` (yoksa `[]`) → camelCase map. `hasat`/`official` alanları AYNEN kalır.
- `PriceHistorySeries`'e `marketSources: MarketSourceSeries[]` alanı ekle. `usePriceHistorySeries` içinde `row.market_series` (yoksa `[]`) → her giriş için `series` dizisini mevcut `mapArr` ile normalize et. `hasat`/`official` aynen kalır.
- Yeni hook yok; sadece dönen obje şeması genişler. Kart/detay sayfaları bunu tüketir.

## 2) `PricesPageBody.tsx` — 3 katmanlı önceliklendirme
- Prop olarak `role: "farmer" | "buyer"` al (mevcut çağrı yerleri: `farmer.prices.tsx`, `buyer.prices.tsx` — geç).
- Kaynak listeleri:
  - **Aktif ilgi**:
    - farmer: `useFarmerListings()` → distinct `crop` (case-insensitive)
    - buyer: `useBuyerOrders()` → son ~10 siparişin distinct `crop`'ları
  - **İzleme**: `usePriceAlerts()` → distinct `crop` (aktif olanlar öncelik)
  - **Tüm piyasa**: `useCropsWithPriceData()` — yukarıdaki setlerden farkı
- Bölümler (üstten alta):
  1. "Ürünlerin" (farmer) / "İlgilendiğin Ürünler" (buyer) — boşsa gizle
  2. "İzleme Listesi" — boşsa gizle
  3. Arama çubuğu + "Tüm Piyasa" — accordion (`src/components/ui/accordion.tsx`) ile varsayılan **kapalı**; içi filtrelenmiş liste. Arama açıkken accordion otomatik açık ve tüm katmanlarda filtre uygulanır.
- Her `PriceSummaryCard` artık **tıklanabilir** (`<Link>`), rol'a göre `/farmer/prices/$crop` veya `/buyer/prices/$crop`. `WatchStar` içteki tıklamayı `stopPropagation` ile korur. Kart hâlâ özet: crop adı, hasat ortalama (varsa), üretici nokta göstergesi, mini sparkline (yalnızca `hasat` serisi ≥ 2 nokta). Kart üzerindeki resmi/market kaynak detayları kaldırılır — detay sayfasına taşınır. Küçük etiket: `market_sources.length` > 0 ise "+{n} kaynak".
- Tüm interaktif elemanlar min 48×48px.

## 3) Yeni detay sayfaları
- `src/routes/farmer.prices.$crop.tsx` ve `src/routes/buyer.prices.$crop.tsx`:
  - Route param `$crop` (URL-decoded). `FarmerHeader`/`BuyerHeader` — geri butonu `to: "/farmer/prices"` / `to: "/buyer/prices"`.
  - Ortak gövde: `CropDetailBody({ crop })` (yeni `src/components/hasat/CropDetailBody.tsx`).
- `CropDetailBody`:
  - Büyük başlık: `formatCrop(crop)` + `WatchStar`.
  - Zaman aralığı sekmeleri (Tabs, `src/components/ui/tabs.tsx`): **Son 3 Ay (13 hafta)**, **Son 6 Ay (26 hafta)**, **Son 1 Yıl (52 hafta)**. Seçime göre `usePriceHistorySeries(crop, weeks)` ve özet için `usePriceHistorySummary(crop)`.
  - **Her kaynak kendi kartında** (`SectionCard`), üst üste bindirme YOK, sıra:
    1. "Hasat Topluluk Fiyatı" — `summary.hasat` (yeterli veriyse ortalama+aralık+üretici sayısı) + `series.hasat` ≥ 2 nokta ise büyük `PriceChart`. Aksi halde bölüm hiç gösterilme.
    2. `summary.official` varsa "Resmi Hal Fiyatı — {officialSourceName}" — özet + `series.official` ≥ 2 nokta ise `PriceChart`. Yoksa gösterme.
    3. `summary.marketSources` her giriş için (şu an sadece "İzmir Toptancı Hali") ayrı kart: başlık `displayName` (varsa `region`), ortalama; eşleşen `series.marketSources.find(s => s.sourceCode === src.sourceCode)?.series` ≥ 2 nokta ise `PriceChart`. Kaynak/seri yoksa o kart hiç gösterilmez.
  - Hiçbir bölüm gösterilemiyorsa boş durum: "Bu ürün için henüz yeterli fiyat verisi yok."
- `src/components/hasat/PriceChart.tsx` — yeni:
  - Props: `data: { date: string; avgPrice: number }[]`, `color?: string`, `height?: number = 180`, `label?: string`.
  - Mevcut `Sparkline`'ın responsive/büyütülmüş versiyonu: SVG polyline + hafif dolgu (linearGradient), min/max/son değer chip'i, X ekseninde ilk/orta/son haftanın kısa TR tarihi (`toLocaleDateString("tr-TR", { day:"2-digit", month:"short" })`), Y ekseninde min/max için 2 grid çizgisi. `data.length < 2` ise `null` döner. İcat edilmiş nokta/interpolasyon YOK — RPC noktaları neyse o.
- Kısa/gün bazlı aralık YOK; sekmeler yalnızca haftalık bucket'a uyumlu 3/6/12 aylık pencereler.

## 4) Boş durum & dürüstlük kuralları
- `market_sources` boşsa o kaynak kartı hiç render edilmez.
- Herhangi bir seri `< 2` nokta ise grafik gösterilmez (kart varsa sadece ortalama gösterilir; ortalama da yoksa kart tamamen atlanır).
- Placeholder/mock veri yok.

## 5) Stil
- Mevcut tokenler (`--saffron`, `--gold`, `--sage`, `--hmuted`), `SectionCard`, `Tabs`, `Accordion`.
- Tüm butonlar / link kartları / sekmeler min 48px yükseklik.
- Detay sayfası mobilde tek kolon, `md:` üzerinde grafikler tam genişlik korunur.

## Değiştirilecek/oluşturulacak dosyalar
- `src/lib/hasat/queries.ts` (tip + map genişletme)
- `src/components/hasat/PricesPageBody.tsx` (yeniden düzen + link)
- `src/components/hasat/CropDetailBody.tsx` (yeni)
- `src/components/hasat/PriceChart.tsx` (yeni)
- `src/routes/farmer.prices.$crop.tsx` (yeni)
- `src/routes/buyer.prices.$crop.tsx` (yeni)
- `src/routes/farmer.prices.tsx` ve `src/routes/buyer.prices.tsx` (`PricesPageBody`'ye `role` prop'unu geç)

## Doğrulama
- `bunx tsgo --noEmit` temiz.
- Sadece `src/**` diff'i; `supabase/**` dokunulmaz.
