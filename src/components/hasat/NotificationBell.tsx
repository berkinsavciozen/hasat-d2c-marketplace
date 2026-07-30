import { useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useNotifications,
  useUnreadCount,
  useMarkAllRead,
  useMarkOneRead,
  type NotificationRow,
} from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";

const ICON: Record<string, string> = {
  offer_received: "📬",
  offer_accepted: "✅",
  offer_countered: "↩️",
  order_status: "📦",
  crop_request_fulfilled: "🎉",
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "şimdi";
  if (m < 60) return `${m}dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}sa`;
  const d = Math.floor(h / 24);
  return `${d}g`;
}

function destFor(n: NotificationRow): string {
  switch (n.type) {
    case "offer_received":
    case "offer_countered":
      return "/farmer/orders";
    case "offer_accepted":
    case "order_status":
      return "/buyer/orders";
    case "crop_request_fulfilled":
      return "/tarifler";
    default:
      return "/";
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: count = 0 } = useUnreadCount();
  const { data: rows, isLoading } = useNotifications();
  const markAll = useMarkAllRead();
  const markOne = useMarkOneRead();
  const navigate = useNavigate();

  const badge = count > 9 ? "9+" : String(count);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative grid min-h-[48px] min-w-[48px] place-items-center rounded-full bg-white/10"
        aria-label="Bildirimler"
      >
        <Bell className="h-5 w-5" />
        {count > 0 ? (
          <span
            className="absolute -top-1 -right-1 grid min-w-[18px] h-[18px] place-items-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: "var(--saffron)" }}
          >
            {badge}
          </span>
        ) : null}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[380px] p-0 flex flex-col"
          style={{ background: "var(--dark)", color: "var(--hwhite)" }}
        >
          <SheetHeader className="px-4 pt-5 pb-3 text-left">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle className="text-hwhite font-serif text-lg">
                Bildirimler
              </SheetTitle>
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={count === 0 || markAll.isPending}
                className="text-xs underline opacity-80 disabled:opacity-30"
              >
                Tümünü okundu işaretle
              </button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-2 pb-6">
            {isLoading ? (
              <div className="grid place-items-center py-10">
                <LoadingDots />
              </div>
            ) : !rows || rows.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm opacity-60">
                Henüz bildirim yok.
              </div>
            ) : (
              <ul className="space-y-1">
                {rows.map((n) => {
                  const unread = !n.read_at;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (unread) markOne.mutate(n.id);
                          setOpen(false);
                          navigate({ to: destFor(n) });
                        }}
                        className="w-full text-left rounded-lg px-3 py-3 flex gap-3 hover:bg-white/5 transition"
                        style={
                          unread
                            ? {
                                background:
                                  "color-mix(in oklab, var(--cream) 14%, transparent)",
                              }
                            : undefined
                        }
                      >
                        <span className="text-xl leading-none mt-0.5">
                          {ICON[n.type] ?? "🔔"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-sm ${unread ? "font-semibold" : "opacity-90"}`}
                          >
                            {n.title}
                          </div>
                          {n.body ? (
                            <div className="text-xs opacity-60 mt-0.5 truncate">
                              {n.body}
                            </div>
                          ) : null}
                          <div className="text-[10px] opacity-50 mt-1">
                            {relTime(n.created_at)}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
