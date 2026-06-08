import type { ReactNode } from "react";

export function AIInsightBanner({ children, cta }: { children: ReactNode; cta?: ReactNode }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl p-3 text-sm"
      style={{ background: "color-mix(in oklab, var(--lav) 22%, transparent)", border: "1px solid color-mix(in oklab, var(--lav) 50%, transparent)" }}
    >
      <span className="text-lg leading-none">🤖</span>
      <div className="flex-1 text-foreground/90">{children}</div>
      {cta}
    </div>
  );
}
