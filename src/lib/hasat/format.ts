const TRY = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});
const NUM = new Intl.NumberFormat("tr-TR");

export function formatTRY(n: number): string {
  return TRY.format(n).replace("₺", "₺");
}

export function formatNum(n: number): string {
  return NUM.format(n);
}

export function formatDelta(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function priceWithUnit(n: number, unit: string | null | undefined): string {
  return `${formatTRY(n)}/${unit ?? "kg"}`;
}

/**
 * Convert a crop slug (e.g. "safran_soğanı") to a display label ("Safran Soğanı").
 * Uses Turkish-aware casing so "i" → "İ" correctly.
 */
export function formatCrop(slug: string | null | undefined): string {
  if (!slug) return "—";
  return String(slug)
    .split("_")
    .map((w) => {
      const s = w.trim();
      if (!s) return "";
      return s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1).toLocaleLowerCase("tr-TR");
    })
    .filter(Boolean)
    .join(" ");
}

/**
 * Same crop-slug-to-label conversion as `formatCrop`, but fully lowercase —
 * for use where the name reads as part of an ingredient line ("1 bardak ceviz"),
 * not as a standalone heading. Title Case is only correct at a real sentence start.
 */
export function formatCropIngredient(slug: string | null | undefined): string {
  if (!slug) return "—";
  return String(slug)
    .split("_")
    .map((w) => w.trim().toLocaleLowerCase("tr-TR"))
    .filter(Boolean)
    .join(" ");
}
