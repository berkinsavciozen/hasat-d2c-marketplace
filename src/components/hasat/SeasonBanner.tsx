export function SeasonBanner() {
  const month = new Date()
    .toLocaleString("tr-TR", { month: "long" })
    .toLocaleUpperCase("tr-TR");
  return (
    <div
      className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold tracking-wide"
      style={{ background: "color-mix(in oklab, var(--saffron) 25%, var(--dark))", color: "var(--hwhite)" }}
    >
      <span>HASAT DÖNEMİ — {month}</span>
      <span>🌸</span>
    </div>
  );
}
