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
