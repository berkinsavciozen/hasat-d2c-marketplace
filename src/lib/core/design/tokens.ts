// hasat-core — BU DOSYAYI BURADA DÜZENLEME. Değişiklik hasat-core reposunda yapılır.
//
// Hasat design token'ları — tek kaynak.
//
// Kaynak: web reposundaki `src/styles.css` (Tailwind 4 CSS-first `@theme inline`
// + `:root`). Buradaki değerler o dosyadan birebir çıkarıldı (2026-07-28).
//
// ⚠️ Web'de CSS değişkenleri hâlâ `src/styles.css`'te tanımlıdır — Tailwind'in
// çalışma zamanı kaynağı odur. Bu dosya aynı değerlerin JS/TS tarafındaki
// (ve M5'te Nativewind/React Native tarafındaki) temsilidir. Bir rengi
// değiştirirken İKİSİ birden güncellenmelidir; `styles.css` Lovable'ın
// dokunduğu bir dosya olduğu için otomatik bağlanmadı (bkz. PR notu).

/** Hasat marka paleti — `styles.css` içindeki `:root` "Hasat palette" bloğu. */
export const brand = {
  saffron: "#C8833B",
  sage: "#6B8F5E",
  cream: "#F7F2E8",
  dark: "#1A1A14",
  hmuted: "#8A8678",
  gold: "#D4A843",
  lav: "#8B9BF0",
  hred: "#C0392B",
  hwhite: "#FDFAF5",
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
  primary: "#C8833B",
  primaryForeground: "#FDFAF5",
  secondary: "#F7F2E8",
  secondaryForeground: "#1A1A14",
  muted: "#E8E1D3",
  mutedForeground: "#8A8678",
  accent: "#D4A843",
  accentForeground: "#1A1A14",
  destructive: "#C0392B",
  destructiveForeground: "#FDFAF5",
  border: "#E1D9C7",
  input: "#FDFAF5",
  ring: "#C8833B",
} as const;

/**
 * Köşe yarıçapı ölçeği. Web'de `--radius: 0.625rem` (16px kök → 10px) ve
 * türevleri `calc()` ile üretiliyor; burada hem rem hem px karşılığı var.
 */
export const radius = {
  sm: { rem: 0.375, px: 6 }, // calc(var(--radius) - 4px)
  md: { rem: 0.5, px: 8 }, // calc(var(--radius) - 2px)
  lg: { rem: 0.625, px: 10 }, // var(--radius)
  xl: { rem: 0.875, px: 14 }, // calc(var(--radius) + 4px)
} as const;

/** Tipografi. Web'de `@theme inline` + `@layer base` içinde tanımlı. */
export const typography = {
  fontFamily: {
    sans: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    serif: 'Georgia, "Times New Roman", serif',
    mono: '"Courier New", ui-monospace, monospace',
  },
  /** h1–h4 serif + 700 (web `@layer base` kuralı). */
  heading: {
    family: 'Georgia, "Times New Roman", serif',
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
