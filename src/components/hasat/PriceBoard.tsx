import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Star } from "lucide-react";
import { toast } from "sonner";
import {
  usePriceAlerts,
  useCreatePriceAlert,
  useTogglePriceAlert,
  type PriceBoardRow,
  type PriceBoardSource,
} from "@/lib/hasat/queries";
import { formatTRY } from "@/lib/hasat/format";

export type BoardRole = "farmer" | "buyer";




function TrendBadge({ source }: { source: PriceBoardSource }) {
  const changePct = source.changePct;
  if (changePct == null) {
    return (
      <span
        className="block text-[10px] text-hmuted"
        title="Karşılaştırma için önceki döneme ait veri yok"
      >
        yeni kaynak
      </span>
    );
  }
  const up = changePct > 0;
  const flat = changePct === 0;
  const color = flat ? "var(--hmuted)" : up ? "var(--sage)" : "var(--hred)";
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className="inline-flex items-center justify-end gap-0.5 font-mono text-[11px] font-semibold tabular-nums"
      style={{ color }}
    >
      {!flat && <Icon className="h-3 w-3 shrink-0" aria-hidden />}
      <span className="sr-only">{up ? "artış" : flat ? "değişim yok" : "azalış"}</span>%
      {Math.abs(changePct).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
    </span>
  );
}

function PriceCell({ source, unit }: { source: PriceBoardSource | null | undefined; unit: string | null }) {
  if (!source || source.price == null) {
    if (source?.kind === "hasat" && source.insufficient) {
      return <span className="text-[11px] text-hmuted">yetersiz veri</span>;
    }
    return <span className="text-[13px] text-hmuted">—</span>;
  }
  return (
    <span className="block">
      <span className="block whitespace-nowrap font-mono text-sm font-semibold tabular-nums">
        {formatTRY(source.price)}
        <span className="ml-0.5 text-[10px] font-normal text-hmuted">/{unit ?? "kg"}</span>
      </span>
      <TrendBadge source={source} />
    </span>
  );
}


export function WatchStar({ crop, size = "sm" }: { crop: string; size?: "sm" | "md" }) {
  const { data: alerts = [] } = usePriceAlerts();
  const createAlert = useCreatePriceAlert();
  const toggleAlert = useTogglePriceAlert();
  const existing = alerts.find((a) => a.crop.toLowerCase() === crop.toLowerCase());
  const active = !!existing?.active;
  const busy = createAlert.isPending || toggleAlert.isPending;

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (!existing) {
        await createAlert.mutateAsync({
          crop,
          target: 0,
          condition: "above",
          channels: { whatsapp: false, push: true, sms: false },
        });
        toast.success("Favorilere eklendi");
      } else {
        await toggleAlert.mutateAsync({ id: existing.id, active: !active });
        toast.success(active ? "Favorilerden çıkarıldı" : "Favorilere eklendi");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "İşlem başarısız");
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={active ? "Favorilerden çıkar" : "Favorilere ekle"}
      className={`grid shrink-0 place-items-center rounded-full hover:bg-muted disabled:opacity-50 ${
        size === "md" ? "h-12 w-12" : "h-9 w-9"
      }`}
    >
      <Star
        className={size === "md" ? "h-5 w-5" : "h-4 w-4"}
        style={{
          color: active ? "var(--primary)" : "var(--hmuted)",
          fill: active ? "var(--primary)" : "transparent",
        }}
      />
    </button>
  );
}

function cropHref(role: BoardRole) {
  return role === "farmer" ? "/farmer/prices/$crop" : "/buyer/prices/$crop";
}

type BoardColumn = { key: string; label: string; lastDate: string | null };

function shortLabel(label: string) {
  return label
    .replace(" Toptancı Hali", "")
    .replace(" Toptancı Hâli", "")
    .replace(" Hali", "")
    .trim();
}

function columnsFor(rows: PriceBoardRow[]): BoardColumn[] {
  const cols: BoardColumn[] = [{ key: "hasat", label: "Hasat", lastDate: null }];
  const index = new Map<string, BoardColumn>([["hasat", cols[0]]]);
  const track = (key: string, label: string, lastDate: string | null) => {
    const existing = index.get(key);
    if (!existing) {
      const col = { key, label, lastDate };
      index.set(key, col);
      cols.push(col);
      return;
    }
    if (lastDate && (!existing.lastDate || lastDate > existing.lastDate)) existing.lastDate = lastDate;
  };
  for (const r of rows) {
    track("hasat", "Hasat", r.hasat?.lastDate ?? null);
    for (const m of r.markets) track(m.key, shortLabel(m.label), m.lastDate ?? null);
    if (r.official) track("official", "Resmi", r.official.lastDate ?? null);
  }
  return cols;
}

function sourceByKey(row: PriceBoardRow, key: string): PriceBoardSource | null {
  if (key === "hasat") return row.hasat;
  if (key === "official") return row.official;
  return row.markets.find((m) => m.key === key) ?? null;
}

function formatShortDate(d: string | null) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

export function PriceBoard({ rows, role }: { rows: PriceBoardRow[]; role: BoardRole }) {
  if (rows.length === 0) return null;
  const cols = columnsFor(rows);

  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-left">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-hmuted">
            <th
              scope="col"
              className="sticky left-0 z-10 bg-background px-2 py-2 text-left font-medium"
            >
              Ürün
            </th>
            {cols.map((c) => {
              const d = formatShortDate(c.lastDate);
              return (
                <th key={c.key} scope="col" className="px-2 py-2 text-right font-medium">
                  <span className="block whitespace-nowrap">{c.label}</span>
                  {d && <span className="block text-[9px] font-normal normal-case">{d}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.crop} className="border-t border-border/70 hover:bg-muted/40">
              <td className="sticky left-0 z-10 bg-background py-2 pl-0 pr-2">
                <div className="flex min-w-0 items-center gap-0.5">
                  <WatchStar crop={r.crop} />
                  <Link
                    to={cropHref(role)}
                    params={{ crop: encodeURIComponent(r.crop) }}
                    className="truncate text-sm font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {r.displayName}
                  </Link>
                </div>
              </td>
              {cols.map((c) => (
                <td key={c.key} className="px-2 py-2 text-right align-middle">
                  <PriceCell source={sourceByKey(r, c.key)} unit={r.unit} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

