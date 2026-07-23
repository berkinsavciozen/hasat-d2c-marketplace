import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const DELIVERY_OPTIONS = [
  { id: "Kargo", label: "Kargo", desc: "3-5 iş günü" },
  { id: "Kargo (Alıcı Öder)", label: "Aynı Gün Kurye", desc: "Sadece İstanbul" },
  { id: "Üreticiden Teslim", label: "Üreticiden Teslim", desc: "Çiftlikten alın" },
];

export function DeliveryFields({
  delivery,
  onDeliveryChange,
  date,
  onDateChange,
}: {
  delivery: string;
  onDeliveryChange: (v: string) => void;
  date: string;
  onDateChange: (v: string) => void;
}) {
  return (
    <>
      <div>
        <label className="text-xs text-hmuted mb-2 block">Teslimat</label>
        <div className="space-y-2">
          {DELIVERY_OPTIONS.map((d) => {
            const on = delivery === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onDeliveryChange(d.id)}
                className="w-full text-left rounded-xl p-3 border flex items-center gap-3 transition"
                style={{
                  background: on ? "color-mix(in oklab, var(--saffron) 10%, var(--card))" : "var(--card)",
                  borderColor: on ? "var(--saffron)" : "var(--border)",
                }}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full border-2" style={{ borderColor: on ? "var(--saffron)" : "var(--hmuted)" }}>
                  {on && <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--saffron)" }} />}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{d.label}</div>
                  <div className="text-xs text-hmuted">{d.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs text-hmuted mb-2 block">Teslim Tarihi</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? format(new Date(date), "dd.MM.yyyy", { locale: tr }) : <span>Tarih seçin</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date ? new Date(date) : undefined}
              onSelect={(d) => onDateChange(d ? format(d, "yyyy-MM-dd") : "")}
              locale={tr}
              disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
