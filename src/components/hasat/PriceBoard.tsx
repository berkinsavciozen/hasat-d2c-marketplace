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

/** Satırda öne çıkarılacak kaynak: önce Hasat, yoksa ilk hal, yoksa resmi. */
export function primarySource(row: PriceBoardRow): PriceBoardSource | null {
  if (row.hasat.price != null) return row.hasat;
  const market = row.markets.find((m) => m.price != null);
  if (market) return market;
  if (row.official?.price != null) return row.official;
  return null;
}

function secondarySources(row: PriceBoardRow, primary: PriceBoardSource | null): PriceBoardSource[] {
  const all: PriceBoardSource[] = [...row.markets];
  if (row.official) all.push(row.official);
  return all.filter((s) => s.price != null && s.key !== primary?.key);
}

function TrendBadge({ changePct }: { changePct: number | null }) {
  if (changePct == null) {
    return <span className="text-[11px] text-hmuted">—</span>;
  }
  const up = changePct > 0;
  const flat = changePct === 0;
  const color = flat ? "var(--hmuted)" : up ? "var(--teal)" : "var(--destructive)";
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className="inline-flex items-center gap-0.5 font-mono text-[11px] font-medium tabular-nums"
      style={{ color }}
    >
      {!flat && <Icon className="h-3 w-3" aria-hidden />}
      %{Math.abs(changePct).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
    </span>
  );
}

function PriceCell({ source, unit }: { source: PriceBoardSource | null | undefined; unit: string | null }) {
  if (!source || source.price == null) {
    if (source?.kind === "hasat" && source.insufficient) {
      return <span className="text-[11px] text-hmuted">yetersiz veri</span>;
    }
    return <span className="text-[11px] text-hmuted">—</span>;
  }
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="font-mono text-sm font-semibold tabular-nums">{formatTRY(source.price)}</span>
      <span className="text-[10px] text-hmuted">/{unit ?? "kg"}</span>
      <TrendBadge changePct={source.changePct} />
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

function MobileRow({ row, role }: { row: PriceBoardRow; role: BoardRole }) {
  const primary = primarySource(row);
  const others = secondarySources(row, primary);
  return (
    <div className="flex items-center gap-1 border-b last:border-b-0">
      <WatchStar crop={row.crop} />
      <Link
        to={cropHref(role)}
        params={{ crop: encodeURIComponent(row.crop) }}
        className="min-w-0 flex-1 py-2.5 pr-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{row.displayName}</span>
          <PriceCell source={primary} unit={row.unit} />
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="truncate text-[10px] uppercase tracking-wide text-hmuted">
            {primary ? primary.label : row.hasat.insufficient ? "Hasat: yetersiz veri" : "Veri yok"}
          </span>
          {others.length > 0 && (
            <span className="flex min-w-0 shrink items-center gap-2 overflow-hidden text-[10px] text-hmuted">
              {others.slice(0, 2).map((s) => (
                <span key={s.key} className="whitespace-nowrap">
                  {s.label.replace(" Toptancı Hali", "")}{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {formatTRY(s.price!)}
                  </span>
                </span>
              ))}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

function columnsFor(rows: PriceBoardRow[]) {
  const cols: { key: string; label: string }[] = [{ key: "hasat", label: "Hasat" }];
  const seen = new Set<string>(["hasat"]);
  for (const r of rows) {
    for (const m of r.markets) {
      if (!seen.has(m.key)) {
        seen.add(m.key);
        cols.push({ key: m.key, label: m.label.replace(" Toptancı Hali", " Hali") });
      }
    }
    if (r.official && !seen.has("official")) {
      seen.add("official");
      cols.push({ key: "official", label: "Resmi" });
    }
  }
  return cols;
}

function sourceByKey(row: PriceBoardRow, key: string): PriceBoardSource | null {
  if (key === "hasat") return row.hasat;
  if (key === "official") return row.official;
  return row.markets.find((m) => m.key === key) ?? null;
}

export function PriceBoard({ rows, role }: { rows: PriceBoardRow[]; role: BoardRole }) {
  if (rows.length === 0) return null;
  const cols = columnsFor(rows);

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      {/* Mobil: kompakt liste */}
      <div className="md:hidden">
        {rows.map((r) => (
          <MobileRow key={r.crop} row={r} role={role} />
        ))}
      </div>

      {/* Masaüstü: kaynak kolonlu tablo */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wide text-hmuted">
              <th className="px-3 py-2 font-medium">Ürün</th>
              {cols.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.crop} className="border-b last:border-b-0 hover:bg-muted/40">
                <td className="px-1 py-1.5">
                  <div className="flex items-center gap-1">
                    <WatchStar crop={r.crop} />
                    <Link
                      to={cropHref(role)}
                      params={{ crop: encodeURIComponent(r.crop) }}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {r.displayName}
                    </Link>
                  </div>
                </td>
                {cols.map((c) => (
                  <td key={c.key} className="px-3 py-1.5">
                    <PriceCell source={sourceByKey(r, c.key)} unit={r.unit} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
