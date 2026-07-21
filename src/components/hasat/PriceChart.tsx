import { useId } from "react";
import { formatTRY } from "@/lib/hasat/format";

interface Props {
  data: { date: string; avgPrice: number }[];
  color?: string;
  height?: number;
  label?: string;
  unit?: string;
}

const DATE_FMT = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" });

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return DATE_FMT.format(d);
}

export function PriceChart({ data, color = "var(--saffron)", height = 180, label }: Props) {
  const gradId = useId().replace(/:/g, "");
  if (!data || data.length < 2) return null;
  const values = data.map((p) => p.avgPrice);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 8;
  const w = 100; // viewBox width; SVG scales via width="100%"
  const h = height;
  const step = (w - pad * 2) / (data.length - 1);
  const y = (v: number) => pad + (h - pad * 2) - ((v - min) / range) * (h - pad * 2);
  const pts = data.map((p, i) => `${pad + i * step},${y(p.avgPrice)}`);
  const line = pts.join(" ");
  const area = `${pad},${h - pad} ${pts.join(" ")} ${pad + (data.length - 1) * step},${h - pad}`;
  const last = data[data.length - 1];
  const first = data[0];
  const mid = data[Math.floor(data.length / 2)];

  return (
    <div className="w-full">
      {label ? (
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-hmuted">{label}</div>
      ) : null}
      <div className="flex flex-wrap items-baseline gap-3">
        <div>
          <div className="text-[10px] text-hmuted">Son</div>
          <div className="font-mono text-lg font-semibold" style={{ color }}>{formatTRY(last.avgPrice)}</div>
        </div>
        <div className="text-[10px] text-hmuted">
          Aralık {formatTRY(min)} – {formatTRY(max)}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        width="100%"
        height={h}
        className="mt-2 block"
        role="img"
        aria-label={label ?? "Fiyat grafiği"}
      >
        <defs>
          <linearGradient id={`g-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* grid: min / max */}
        <line x1={pad} x2={w - pad} y1={y(max)} y2={y(max)} stroke="var(--hmuted)" strokeOpacity="0.18" strokeWidth="0.4" />
        <line x1={pad} x2={w - pad} y1={y(min)} y2={y(min)} stroke="var(--hmuted)" strokeOpacity="0.18" strokeWidth="0.4" />
        <polygon points={area} fill={`url(#g-${gradId})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {/* last point marker */}
        <circle cx={pad + (data.length - 1) * step} cy={y(last.avgPrice)} r="1.6" fill={color} />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-hmuted">
        <span>{fmtDate(first.date)}</span>
        <span>{fmtDate(mid.date)}</span>
        <span>{fmtDate(last.date)}</span>
      </div>
    </div>
  );
}
