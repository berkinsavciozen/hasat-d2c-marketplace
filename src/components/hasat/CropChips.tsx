/**
 * Multi-select crop chip picker backed by the shared crop_config catalog.
 * Shows a skeleton row while the catalog loads.
 */
import { useCropOptions } from "@/lib/hasat/crop-config";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  variant?: "light" | "dark";
}

export function CropChips({ value, onChange, variant = "light" }: Props) {
  const { options, isLoading } = useCropOptions();

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2" aria-label="Ürünler yükleniyor">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-7 w-20 animate-pulse rounded-full"
            style={{
              background:
                variant === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            }}
          />
        ))}
      </div>
    );
  }

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value.includes(o.value);
        if (variant === "dark") {
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className="rounded-full px-3 py-1.5 text-xs border transition"
              style={{
                background: active ? "var(--saffron)" : "rgba(255,255,255,0.05)",
                borderColor: active ? "var(--saffron)" : "rgba(255,255,255,0.15)",
                color: "var(--hwhite)",
              }}
            >
              {o.emoji} {o.label}
            </button>
          );
        }
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className="rounded-full border px-3 py-1.5 text-xs transition"
            style={{
              background: active ? "var(--saffron)" : "transparent",
              color: active ? "var(--hwhite)" : undefined,
              borderColor: active ? "var(--saffron)" : undefined,
            }}
          >
            {o.emoji} {o.label}
          </button>
        );
      })}
    </div>
  );
}
