import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatTRY } from "@/lib/hasat/format";

export function PhotoListingCard({
  photo,
  title,
  subtitle,
  price,
  unit,
  badge,
  onClick,
  disabled,
  className,
}: {
  photo?: string | null;
  title: ReactNode;
  subtitle?: ReactNode;
  price: number;
  unit: string;
  badge?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const clickable = !!onClick && !disabled;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "text-left rounded-2xl bg-card border overflow-hidden transition",
        clickable ? "cursor-pointer hover:border-saffron min-h-[48px]" : "",
        disabled ? "opacity-60 cursor-not-allowed" : "",
        className,
      )}
    >
      <div
        className="h-28 relative overflow-hidden"
        style={
          photo
            ? undefined
            : {
                background: `repeating-linear-gradient(45deg, color-mix(in oklab, var(--saffron) 30%, var(--dark)) 0 12px, color-mix(in oklab, var(--saffron) 20%, var(--dark)) 12px 24px)`,
              }
        }
      >
        {photo ? (
          <img
            src={photo}
            alt={typeof title === "string" ? title : "İlan görseli"}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55))" }}
        />
        {badge ? <div className="absolute top-2 left-2">{badge}</div> : null}
        <div className="absolute bottom-2 left-3 right-3 text-white">
          <div className="font-serif text-base leading-tight line-clamp-2">{title}</div>
          {subtitle ? <div className="text-[11px] opacity-80 truncate">{subtitle}</div> : null}
        </div>
      </div>
      <div className="p-4 flex items-center justify-between gap-2">
        <div style={{ fontFamily: "Courier New, monospace", color: "var(--saffron)" }} className="text-base truncate min-w-0">
          {formatTRY(price)}
          <span className="text-xs text-hmuted">/{unit}</span>
        </div>
      </div>
    </div>
  );
}
