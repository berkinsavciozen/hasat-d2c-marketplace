import type { ReactNode } from "react";

export type LifecycleTone = "action" | "info" | "success" | "neutral" | "danger";

const TONE_CLASS: Record<LifecycleTone, string> = {
  action:
    "border-[color-mix(in_oklab,var(--saffron)_42%,var(--border))] bg-[color-mix(in_oklab,var(--saffron)_13%,transparent)] text-saffron",
  info: "border-[color-mix(in_oklab,var(--teal)_32%,var(--border))] bg-[color-mix(in_oklab,var(--teal)_10%,transparent)] text-teal",
  success:
    "border-[color-mix(in_oklab,var(--sage)_32%,var(--border))] bg-[color-mix(in_oklab,var(--sage)_12%,transparent)] text-sage",
  neutral: "border-border bg-muted text-hmuted",
  danger:
    "border-[color-mix(in_oklab,var(--hred)_32%,var(--border))] bg-[color-mix(in_oklab,var(--hred)_10%,transparent)] text-hred",
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
