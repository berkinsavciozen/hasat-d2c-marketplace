import { createFileRoute, Link } from "@tanstack/react-router";
import { FarmerHeader } from "./farmer";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useNotifPrefs, useUpdateNotifPrefs, type NotifPrefKey } from "@/lib/hasat/queries";
import { NOTIF_CHANNELS, notifEventsForRole } from "@/lib/hasat/notif-events";
import { LoadingDots } from "@/components/hasat/LoadingDots";

export const Route = createFileRoute("/farmer/settings/notifs")({ component: Notifs });

const EVENTS = notifEventsForRole("farmer");

function Notifs() {
  const { data: prefs, isLoading } = useNotifPrefs();
  const update = useUpdateNotifPrefs();

  const onToggle = (col: NotifPrefKey, v: boolean) => {
    update.mutate({ [col]: v } as any, {
      onSuccess: () => toast.success("Tercih güncellendi"),
      onError: (e) => toast.error((e as Error).message ?? "Kaydedilemedi"),
    });
  };

  return (
    <>
      <FarmerHeader title="Bildirim Tercihleri">
        <Link
          to="/farmer/settings"
          className="inline-flex items-center gap-1 mt-2 text-xs text-hwhite/70 min-h-[48px]"
        >
          <ChevronLeft className="h-3 w-3" /> Ayarlar
        </Link>
      </FarmerHeader>
      <div className="max-w-2xl p-4 pb-32 md:p-8">
        <div className="mb-5 rounded-2xl border border-teal/20 bg-teal/10 p-4">
          <h2 className="text-sm font-semibold">Nasıl haber almak istersin?</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Her olay için yalnızca ihtiyacın olan kanalları açık bırakabilirsin.
          </p>
        </div>
        {isLoading || !prefs ? (
          <div className="grid place-items-center py-10">
            <LoadingDots />
          </div>
        ) : (
          <>
            {/* Desktop / tablet: table */}
            <div className="hidden sm:block rounded-xl border border-border bg-card overflow-hidden">
              <div className="grid grid-cols-[1fr_repeat(3,auto)] gap-x-4 px-4 py-3 border-b border-border bg-muted text-xs font-medium">
                <div>Olay</div>
                {NOTIF_CHANNELS.map((c) => (
                  <div key={c.key} className="text-center w-20">
                    {c.label}
                  </div>
                ))}
              </div>
              {EVENTS.map((e) => (
                <div
                  key={e.key}
                  className="grid grid-cols-[1fr_repeat(3,auto)] gap-x-4 px-4 py-3 border-b last:border-b-0 border-border items-center text-sm min-h-[48px]"
                >
                  <div>{e.label}</div>
                  {NOTIF_CHANNELS.map((c) => {
                    const col = e.cols[c.key];
                    const comingSoon = c.key === "whatsapp" && e.whatsappComingSoon;
                    return (
                      <div key={c.key} className="w-20 grid place-items-center">
                        {col ? (
                          comingSoon ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Switch checked={prefs[col]} disabled aria-label="Yakında" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                WhatsApp bildirimleri yakında aktif olacak
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Switch
                              checked={prefs[col]}
                              disabled={update.isPending}
                              onCheckedChange={(v) => onToggle(col, v)}
                            />
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Mobile: stacked cards */}
            <div className="sm:hidden space-y-3">
              {EVENTS.map((e) => (
                <div
                  key={e.key}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-border bg-muted text-sm font-medium">
                    {e.label}
                  </div>
                  <div className="divide-y divide-border">
                    {NOTIF_CHANNELS.map((c) => {
                      const col = e.cols[c.key];
                      if (!col) return null;
                      const comingSoon = c.key === "whatsapp" && e.whatsappComingSoon;
                      return (
                        <div
                          key={c.key}
                          className="flex items-center justify-between gap-3 px-4 py-2 min-h-[48px] text-sm"
                        >
                          <span className="flex items-center gap-2">
                            {c.label}
                            {comingSoon && (
                              <Badge variant="secondary" className="text-[10px]">
                                Yakında
                              </Badge>
                            )}
                          </span>
                          <Switch
                            checked={prefs[col]}
                            disabled={comingSoon || update.isPending}
                            onCheckedChange={comingSoon ? undefined : (v) => onToggle(col, v)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground mt-3">Değişiklikler anında kaydedilir.</p>
      </div>
    </>
  );
}
