import { createFileRoute, Link } from "@tanstack/react-router";
import { FarmerHeader } from "./farmer";
import { useHasat, type NotifChannel, type NotifEvent } from "@/lib/hasat/store";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/farmer/settings/notifs")({ component: Notifs });

const EVENTS: { key: NotifEvent; label: string }[] = [
  { key: "offer", label: "Yeni Teklif" },
  { key: "price", label: "Fiyat Alarmı" },
  { key: "harvest", label: "Hasat Zamanı" },
  { key: "community", label: "Topluluk" },
];

const CHANNELS: { key: NotifChannel; label: string }[] = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "push", label: "Push" },
  { key: "sms", label: "SMS" },
];

function Notifs() {
  const prefs = useHasat((s) => s.notifPrefs);
  const set = useHasat((s) => s.setNotifPref);

  return (
    <>
      <FarmerHeader title="Bildirim Tercihleri">
        <Link to="/farmer/settings" className="inline-flex items-center gap-1 mt-2 text-xs text-hwhite/70">
          <ChevronLeft className="h-3 w-3" /> Ayarlar
        </Link>
      </FarmerHeader>
      <div className="p-4 md:p-8 max-w-2xl">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[1fr_repeat(3,auto)] gap-x-4 px-4 py-3 border-b border-border bg-muted text-xs font-medium">
            <div>Olay</div>
            {CHANNELS.map((c) => <div key={c.key} className="text-center w-20">{c.label}</div>)}
          </div>
          {EVENTS.map((e) => (
            <div key={e.key} className="grid grid-cols-[1fr_repeat(3,auto)] gap-x-4 px-4 py-3 border-b last:border-b-0 border-border items-center text-sm">
              <div>{e.label}</div>
              {CHANNELS.map((c) => (
                <div key={c.key} className="w-20 grid place-items-center">
                  <Switch checked={prefs[e.key][c.key]} onCheckedChange={(v) => set(e.key, c.key, v)} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">Değişiklikler anında uygulanır.</p>
      </div>
    </>
  );
}
