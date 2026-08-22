export function TierBadge({ tier }: { tier: "free" | "premium" | null | undefined }) {
  const isPremium = tier === "premium";
  const label = isPremium ? "Premium" : "Ücretsiz";
  const style = isPremium
    ? { background: "var(--gold)", color: "var(--dark)" }
    : { background: "color-mix(in oklab, var(--hmuted) 25%, transparent)", color: "var(--dark)" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={style}
    >
      {isPremium ? "✦ " : ""}{label}
    </span>
  );
}
