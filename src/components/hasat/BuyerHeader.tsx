import { NotificationBell } from "./NotificationBell";

export function BuyerHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="px-4 pt-5 pb-4 md:px-8 md:pt-8" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-2xl md:text-3xl truncate">{title}</h1>
          {subtitle ? <p className="text-sm text-hwhite/60 mt-0.5 truncate">{subtitle}</p> : null}
        </div>
        <NotificationBell />
      </div>
      {children}
    </div>
  );
}
