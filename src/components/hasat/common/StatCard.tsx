import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Accent = "saffron" | "gold" | "sage" | "hred";

export function StatCard({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: ReactNode;
  accent?: Accent;
  className?: string;
}) {
  const accentVar = accent ? `var(--${accent})` : undefined;
  return (
    <div
      className={cn("rounded-xl border bg-card p-4", className)}
      style={accent ? { borderLeft: `3px solid ${accentVar}` } : undefined}
    >
      <div className="text-xs text-hmuted">{label}</div>
      <div className="mt-1 font-mono text-xl" style={accent ? { color: accentVar } : undefined}>
        {value}
      </div>
    </div>
  );
}
