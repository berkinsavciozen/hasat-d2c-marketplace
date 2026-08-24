// hasat-core — BU DOSYAYI BURADA DÜZENLEME. Değişiklik hasat-core reposunda yapılır.
//
// Hasat design token'ları — tek kaynak.
//
// Kaynak: web reposundaki `src/styles.css` (Tailwind 4 CSS-first `@theme inline`
// + `:root`). Buradaki değerler o dosyadan birebir çıkarıldı (2026-08-22,
// UI Group 5 Batch 1 / PR #47 sonrası).
//
// ⚠️ Web'de CSS değişkenleri hâlâ `src/styles.css`'te tanımlıdır — Tailwind'in
// çalışma zamanı kaynağı odur ve tasarım sisteminin KANONİK kaynağıdır. Bu
// dosya aynı değerlerin JS/TS tarafındaki (ve M5'te Nativewind/React Native
// tarafındaki) temsilidir. Bir rengi değiştirirken İKİSİ birden
// güncellenmelidir; `styles.css` Lovable'ın dokunduğu bir dosya olduğu için
// otomatik bağlanmadı (bkz. PR notu).
//
// 2026-08-22 senkronu — UI Group 5 Batch 1 (04.10 MVP UI Implementation
// Specification) şu onaylanmış kuralları getirdi ve buradaki değerler ona
// göre güncellendi:
//   • Birincil eylem/aktif navigasyon/focus = deep blue (#0D3B66).
//     Amber (saffron/gold) artık YALNIZCA keşif, editoryal ve dikkat içindir.
//   • Yeşil (sage) YALNIZCA doğrulanmış/başarılı/tamamlanmış durumlar içindir;
//     nötr veri ve devam-eden durumlar için yeni `teal` token'ı eklendi.
//   • WhatsApp marka yeşili artık ayrı bir token; Hasat doğrulama yeşiliyle
//     karıştırılmamalıdır.
//   • Inter = UI/gövde/sayılar, Manrope = kontrollü editoryal başlıklar.
//     Georgia ve Courier New kullanıcıya görünen yüzeylerden kaldırıldı.
//   • Radius ölçeği `calc()` türetmesinden açık değerlere geçti.

/** Hasat marka paleti — `styles.css` içindeki `:root` "Hasat palette" bloğu. */
export const brand = {
  /** Amber — yalnızca keşif / editoryal / dikkat. Birincil eylem DEĞİL. */
  saffron: "#C8833B",
  /** Yalnızca doğrulanmış / başarılı / tamamlanmış durumlar. */
  sage: "#6B8F5E",
  cream: "#F7F2E8",
  dark: "#1A1A14",
  hmuted: "#8A8678",
  /** Amber (ikincil) — ticari / editoryal aksan. */
  gold: "#D4A843",
  lav: "#8B9BF0",
  /** Yalnızca yıkıcı / hata / kullanılamaz. */
  hred: "#C0392B",
  hwhite: "#FDFAF5",
  /** Blue-teal — nötr veri, devam eden, bilgilendirici. Başarı değil, CTA değil. */
  teal: "#1F6E82",
  /** WhatsApp marka yeşili — `sage` doğrulama yeşilinden ayrıdır. */
  whatsapp: "#25D366",
} as const;

/**
 * Semantik (shadcn) token'lar — açık tema.
 * Koyu tema web'de henüz tanımlı değil (`.dark` varyantı var, değer seti yok).
 */
export const semanticLight = {
  background: "#F0EBE0",
  foreground: "#1A1A14",
  card: "#F7F2E8",
  cardForeground: "#1A1A14",
  popover: "#FDFAF5",
  popoverForeground: "#1A1A14",
  /** Deep blue — birincil eylem, aktif navigasyon, focus. */
  primary: "#0D3B66",
  primaryForeground: "#FDFAF5",
  secondary: "#F7F2E8",
  secondaryForeground: "#1A1A14",
  muted: "#E8E1D3",
  mutedForeground: "#8A8678",
  /** Nötr hover/vurgu yüzeyi (menü, dropdown, takvim) — marka rengi DEĞİL. */
  accent: "#E1E9EE",
  accentForeground: "#1A1A14",
  destructive: "#C0392B",
  destructiveForeground: "#FDFAF5",
  border: "#E1D9C7",
  input: "#FDFAF5",
  /** Focus halkası — `primary` ile aynı. */
  ring: "#0D3B66",
} as const;

/**
 * Köşe yarıçapı ölçeği — artık `calc()` ile türetilmiyor, açık değerler.
 *
 * Web'de `--radius: 12px` birincil kontrol adımıdır ve `--radius-md` ona
 * bağlanmıştır; `--radius-sm` 4px olarak ezilmiştir. `lg`/`xl`/`2xl`/`3xl`
 * bilinçli olarak ezilmemiş, Tailwind'in kendi ölçeğine bırakılmıştır.
 *
 * ⚠️ Bu ölçek monoton DEĞİLDİR: `md` (12px, birincil kontrol adımı)
 * `lg`'den (8px, Tailwind varsayılanı) büyüktür. Bu bilinçli bir tercihtir —
 * `md` bir "boyut basamağı" değil, onaylanmış birincil kontrol yarıçapıdır.
 * Onaylanmış 4/8/12/16/24 merdiveni sm + lg + xl + 2xl + 3xl ile karşılanır.
 */
export const radius = {
  sm: { rem: 0.25, px: 4 }, // --radius-sm (açıkça ezildi)
  md: { rem: 0.75, px: 12 }, // --radius-md → var(--radius); birincil kontroller
  lg: { rem: 0.5, px: 8 }, // Tailwind varsayılanı (ezilmedi)
  xl: { rem: 0.75, px: 12 }, // Tailwind varsayılanı (ezilmedi)
  "2xl": { rem: 1, px: 16 }, // Tailwind varsayılanı (ezilmedi)
  "3xl": { rem: 1.5, px: 24 }, // Tailwind varsayılanı (ezilmedi)
} as const;

/** Tipografi. Web'de `@theme inline` + `@layer base` içinde tanımlı. */
export const typography = {
  fontFamily: {
    /** UI, gövde, form, metadata, sayılar. */
    sans: '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    /**
     * Tarihsel isim, yeniden bağlandı: yalnızca kontrollü alıcı/editoryal
     * başlıklar (Manrope). Gövde yazı tipi olarak kullanılmaz.
     */
    serif: '"Manrope", "Inter", ui-sans-serif, system-ui, sans-serif',
    /**
     * Tarihsel isim, yeniden bağlandı: fiyat/sayı gösterimi
     * (Inter + `font-variant-numeric: tabular-nums`). Gerçek monospace DEĞİL.
     */
    mono: '"Inter", ui-sans-serif, system-ui, sans-serif',
  },
  /**
   * h1–h4 yalnızca `font-weight: 700` alır. Web'deki eski "başlıklara zorla
   * serif uygula" kuralı UI Group 5 Batch 1'de KALDIRILDI; başlıklar artık
   * gövde ailesini (Inter) miras alır, Manrope ise `.font-serif` ile
   * bilinçli olarak tercih edilir. `family: null` "web bunu dayatmıyor"
   * demektir — `scale: null` ile aynı anlamda.
   */
  heading: {
    family: null,
    weight: 700,
  },
  /**
   * ⚠️ Web'de ÖZEL bir tipografi ölçeği YOK — Tailwind'in varsayılan
   * `text-*` ölçeği kullanılıyor. Uydurulmuş bir ölçek buraya yazılmadı;
   * mobil tarafta bir ölçek gerekirse M5'te bilinçli olarak tanımlanacak.
   */
  scale: null,
} as const;

/**
 * Boşluk (spacing). Web'de özelleştirilmemiş — Tailwind varsayılanı
 * (1 birim = 0.25rem = 4px) geçerli. Nativewind aynı ölçeği kullanır.
 */
export const spacing = {
  baseRem: 0.25,
  basePx: 4,
} as const;

export const tokens = {
  brand,
  semanticLight,
  radius,
  typography,
  spacing,
} as const;

export type BrandColor = keyof typeof brand;
export type SemanticColor = keyof typeof semanticLight;
