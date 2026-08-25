import type { ReactNode } from "react";

export type LifecycleTone = "action" | "info" | "success" | "neutral" | "danger";

const TONE_CLASS: Record<LifecycleTone, string> = {
  action: "border-amber-300/70 bg-amber-50 text-amber-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  neutral: "border-border bg-muted text-hmuted",
  danger: "border-red-200 bg-red-50 text-red-700",
};

export function LifecycleBadge({
  children,
  tone,
  className = "",
}: {
  children: ReactNode;
  tone: LifecycleTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${TONE_CLASS[tone]} ${className}`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
