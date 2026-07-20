import { createFileRoute, Link } from "@tanstack/react-router";
import { FarmerHeader } from "./farmer";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft } from "lucide-react";
import { useNotifPrefs, useUpdateNotifPrefs, type NotifPrefKey } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";

export const Route = createFileRoute("/farmer/settings/notifs")({ component: Notifs });

type Channel = "whatsapp" | "push" | "sms";
type EventDef = {
  label: string;
  cols: Partial<Record<Channel, NotifPrefKey>>;
};

const EVENTS: EventDef[] = [
  {
    label: "Yeni Teklif",
    cols: { whatsapp: "new_offer_whatsapp", push: "new_offer_push", sms: "new_offer_sms" },
  },
  {
    label: "Fiyat Alarmı",
    cols: { whatsapp: "price_alert_whatsapp", push: "price_alert_push", sms: "price_alert_sms" },
  },
  {
    label: "Hasat Zamanı",
    cols: { whatsapp: "harvest_time_whatsapp", push: "harvest_time_push", sms: "harvest_time_sms" },
  },
  {
    label: "Hasat Zamanı",
    cols: { whatsapp: "harvest_time_whatsapp", push: "harvest_time_push", sms: "harvest_time_sms" },
  },
  {
    label: "Teklif Kabul Edildi",
    cols: { sms: "offer_accepted_sms" },
  },
  {
    label: "Ödeme Onaylandı",
    cols: { sms: "payment_confirmed_sms" },
  },
  {
    label: "Topluluk",
    cols: { push: "community_push" },
  },
];

const CHANNELS: { key: Channel; label: string }[] = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "push", label: "Push" },
  { key: "sms", label: "SMS" },
];

function Notifs() {
  const { data: prefs, isLoading } = useNotifPrefs();
  const update = useUpdateNotifPrefs();

  return (
    <>
      <FarmerHeader title="Bildirim Tercihleri">
        <Link
          to="/farmer/settings"
          className="inline-flex items-center gap-1 mt-2 text-xs text-hwhite/70"
        >
          <ChevronLeft className="h-3 w-3" /> Ayarlar
        </Link>
      </FarmerHeader>
      <div className="p-4 md:p-8 max-w-2xl">
        {isLoading || !prefs ? (
          <div className="grid place-items-center py-10">
            <LoadingDots />
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[1fr_repeat(3,auto)] gap-x-4 px-4 py-3 border-b border-border bg-muted text-xs font-medium">
              <div>Olay</div>
              {CHANNELS.map((c) => (
                <div key={c.key} className="text-center w-20">
                  {c.label}
                </div>
              ))}
            </div>
            {EVENTS.map((e) => (
              <div
                key={e.label}
                className="grid grid-cols-[1fr_repeat(3,auto)] gap-x-4 px-4 py-3 border-b last:border-b-0 border-border items-center text-sm"
              >
                <div>{e.label}</div>
                {CHANNELS.map((c) => {
                  const col = e.cols[c.key];
                  return (
                    <div key={c.key} className="w-20 grid place-items-center">
                      {col ? (
                        <Switch
                          checked={prefs[col]}
                          disabled={update.isPending}
                          onCheckedChange={(v) => update.mutate({ [col]: v } as any)}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Değişiklikler anında kaydedilir.
        </p>
      </div>
    </>
  );
}
