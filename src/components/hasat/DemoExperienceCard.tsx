import { X } from "lucide-react";
import { DEMO_DISCLOSURE, getDemoSteps, type DemoRole } from "@/lib/hasat/demo-experience";

export function DemoExperienceCard({
  role,
  onDismiss,
  onOpen,
}: {
  role: DemoRole;
  onDismiss: () => void;
  onOpen?: () => void;
}) {
  const steps = getDemoSteps(role);

  return (
    <section
      aria-label={`${role === "farmer" ? "Çiftçi" : "Alıcı"} örnek akışı`}
      className="rounded-2xl border border-dashed border-saffron/50 bg-saffron/5 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex rounded-full border border-saffron/40 bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-saffron">
            {DEMO_DISCLOSURE}
          </div>
          <h2 className="mt-2 font-serif text-lg text-foreground">Hasat nasıl çalışır?</h2>
          <p className="mt-1 text-xs text-hmuted">
            Bu bilgiler yalnızca akışı anlatır; teklif, sipariş veya ödeme oluşturmaz.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Örnek akışı kapat"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border bg-background text-hmuted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {steps.map((step, index) => (
          <li key={step.id} className="rounded-xl border bg-background/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <span aria-hidden>{step.icon}</span>
              <span className="text-[10px] text-hmuted">
                {index + 1}/{steps.length}
              </span>
            </div>
            <div className="mt-2 text-xs font-semibold text-foreground">{step.title}</div>
            <p className="mt-1 text-[11px] leading-relaxed text-hmuted">{step.description}</p>
          </li>
        ))}
      </ol>

      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="mt-4 min-h-10 w-full rounded-xl border border-saffron/40 bg-background px-4 py-2 text-xs font-semibold text-saffron"
        >
          Örnek akışı adım adım incele
        </button>
      )}
    </section>
  );
}
