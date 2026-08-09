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

// Birime göre makul ondalık basamak — IEEE754 float toplama/çıkarma artığını
// (ör. `base - reserved` → 59.599999999999994) ekranda temizler. Hesaplanan
// değere dokunmaz, yalnızca gösterimi yuvarlar (P23-M7-g).
const QUANTITY_FRACTION_DIGITS: Record<string, number> = {
  g: 1,
  kg: 2,
  L: 2,
  adet: 0,
};
const QUANTITY_FORMATTERS = new Map<number, Intl.NumberFormat>();

function quantityFormatter(maximumFractionDigits: number): Intl.NumberFormat {
  let f = QUANTITY_FORMATTERS.get(maximumFractionDigits);
  if (!f) {
    f = new Intl.NumberFormat("tr-TR", { maximumFractionDigits });
    QUANTITY_FORMATTERS.set(maximumFractionDigits, f);
  }
  return f;
}

export function formatQuantity(qty: number | null | undefined, unit: string | null | undefined): string {
  if (qty == null || !Number.isFinite(qty)) return qty == null ? "" : String(qty);
  const digits = QUANTITY_FRACTION_DIGITS[unit ?? ""] ?? 2;
  return quantityFormatter(digits).format(qty);
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
