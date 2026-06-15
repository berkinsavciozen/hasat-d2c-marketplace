import type { Order } from "@/lib/hasat/types";

export function OrderTimeline({ order }: { order: Order }) {
  const activeIdx = order.timeline.findIndex((s) => s.key === order.status);
  return (
    <div className="space-y-3">
      {order.timeline.map((step, i) => {
        const done = !!step.doneAt && i < activeIdx;
        const active = i === activeIdx;
        const color = done ? "var(--sage)" : active ? "var(--saffron)" : "var(--hmuted)";
        return (
          <div key={step.key} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white ${active ? "animate-pulse" : ""}`}
                style={{ background: color }}
              >
                {done ? "✓" : i + 1}
              </span>
              {i < order.timeline.length - 1 && (
                <span className="w-0.5 grow my-1" style={{ background: done ? "var(--sage)" : "var(--border)", minHeight: 24 }} />
              )}
            </div>
            <div className="flex-1 pb-3">
              <div className="text-sm font-medium" style={{ color: active ? "var(--saffron)" : undefined }}>{step.label}</div>
              {step.doneAt && (
                <div className="text-[11px] text-hmuted">{new Date(step.doneAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</div>
              )}
              {active && !step.doneAt && <div className="text-[11px] text-saffron">Şu anda işleniyor...</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
