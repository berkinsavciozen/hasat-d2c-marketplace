## P25 — Crop-agnostic düzeltmeler (UI-only)

DB/migration yok. Sadece 3 dosya değişecek.

### 1) `src/routes/farmer.journal.index.tsx`
- Satır 103: `useState<string[]>(["safran"])` → `useState<string[]>([])`
- Satır 135: `setPCrops(["safran"])` → `setPCrops([])`
- Etki: Yeni parsel formunda hiçbir ürün önceden seçili gelmez, çiftçi kendi seçer.

### 2) `src/routes/index.tsx`
- **Hero glass card (satır ~388–413):** Sabit Safran içeriği yerine `MarketplacePreview`'daki 4 item dizisini modül seviyesinde dışa taşı (veya lokal olarak hero component'ine kopyala) ve component ilk mount'ta `Math.floor(Math.random()*items.length)` ile bir item seçsin (`useState` init'inde). Görsel, crop adı, konum, üretici, miktar, fiyat, tarih hepsi seçilen item'dan gelecek. Timeline overlay (Sulandı/Fotoğraf/…) jenerik kalır.
- **`TurkeyMap` (satır ~842–853):** `useState<string>("safranbolu")` → `useState<string>(() => PINS[Math.floor(Math.random()*PINS.length)].id)`.
- **`AISection` ilk chat örneği (satır ~1048–1055):** "Safranımı ne zaman hasat etmeliyim?" ve cevabı jenerik hale getir. Öneri: soru "Bu hafta neye öncelik vermeliyim?", cevap ise crop adı geçmeyen, günlük kaydına dayalı jenerik bir yanıt (örn. "Son kaydına göre sulama 4 gün önce yapılmış, hava tahminine göre yarın kısa sulama öner. Ayrıca bu hafta yaprak kontrolü için 10 dk ayır."). İkinci mesaj çifti ("Bugün hasat yaptım, 320 gr safran çıktı.") crop-nötr yapılacak: "Bugün 5 kg hasat kaydettim." + karşılık.

### 3) `src/lib/hasat/journal-meta.ts` — `cropChipColor`
Fonksiyon şu an sync ve sadece crop name (string) alıyor; `category_group`'a erişim yok (o `useCropConfig` async). Büyük refactor'a girmeden çeşitlilik için: crop adının basit deterministik hash'ini alıp mevcut token paletinden (`--saffron`, `--lav`, `--sage`, `--dark`) bir renk seçen fallback ekle. Safran/lavanta/zeytin özel eşleşmeleri aynı kalır; diğer 65+ ürün gri yerine hash'e göre 4 renkten birine düşer. Signature değişmez, çağrı yerleri etkilenmez.

### Doğrulama
- `bunx tsgo --noEmit`
- Manuel: landing sayfasını 3–4 kere yenile → hero card, harita pini farklı çıkmalı; farmer journal'da "Parsel ekle" formunda ürün chip'i seçili gelmemeli.
