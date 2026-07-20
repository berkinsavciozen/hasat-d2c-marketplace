import type { Order } from "@/lib/hasat/types";
import { Check } from "lucide-react";

export function OrderTimeline({ order }: { order: Order }) {
  const steps = order.timeline;
  const activeIdx = Math.max(0, steps.findIndex((s) => s.key === order.status));
  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const done = i < activeIdx || !!step.doneAt;
        const active = i === activeIdx;
        const isLast = i === steps.length - 1;
        const circleBg = done ? "var(--sage)" : active ? "var(--saffron)" : "color-mix(in oklab, var(--hmuted) 25%, transparent)";
        const circleFg = done || active ? "var(--hwhite)" : "var(--hmuted)";
        const lineBg = done ? "var(--sage)" : "color-mix(in oklab, var(--hmuted) 20%, transparent)";
        return (
          <div key={step.key} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center min-w-[40px]">
              <div
                className={`grid h-10 w-10 place-items-center rounded-full text-sm font-bold shadow-sm ${active ? "ring-2 ring-offset-2 ring-offset-card" : ""}`}
                style={{
                  background: circleBg,
                  color: circleFg,
                  boxShadow: active ? "0 0 0 4px color-mix(in oklab, var(--saffron) 18%, transparent)" : undefined,
                }}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {!isLast && (
                <div className="w-0.5 flex-1 min-h-[28px] my-1" style={{ background: lineBg }} />
              )}
            </div>
            <div className={`flex-1 pb-5 pt-1 ${isLast ? "pb-1" : ""}`}>
              <div
                className={`text-sm ${active ? "font-semibold" : done ? "font-medium" : "font-normal"}`}
                style={{ color: active ? "var(--saffron)" : done ? "var(--dark)" : "var(--hmuted)" }}
              >
                {step.label}
              </div>
              {step.doneAt && (
                <div className="mt-0.5 text-[11px] text-hmuted">
                  {new Date(step.doneAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
              {active && !step.doneAt && (
                <div className="mt-0.5 text-[11px]" style={{ color: "var(--saffron)" }}>Şu anda işleniyor…</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
