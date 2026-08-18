import { Apple, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Uygulama henüz App Store/Google Play'de yayınlanmadı. Bu yüzden rozetler
 * kasıtlı olarak statik (`<div>`, `href`/`onClick` yok) — yayınlanmamış bir
 * uygulamaya link vermek kırık/404 sonucu verir. Store canlı olduğunda
 * gerçek linkler ayrı bir turda eklenecek.
 */
function StoreBadge({
  icon: Icon,
  store,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  store: string;
  sub: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${store} — ${sub}`}
      className="inline-flex select-none items-center gap-2 rounded-xl px-3.5 py-2 opacity-60"
      style={{ background: "#14231C", color: "#fff", cursor: "default" }}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[9px] uppercase tracking-wide opacity-80">{sub}</span>
        <span className="text-xs font-medium">{store}</span>
      </span>
    </div>
  );
}

export function StoreBadges({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <StoreBadge icon={Apple} store="App Store" sub="Yakında" />
      <StoreBadge icon={PlayCircle} store="Google Play" sub="Yakında" />
    </div>
  );
}
