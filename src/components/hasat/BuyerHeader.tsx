import { Bell } from "lucide-react";

export function BuyerHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="px-4 pt-5 pb-4 md:px-8 md:pt-8" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl">{title}</h1>
          {subtitle ? <p className="text-sm text-hwhite/60 mt-0.5">{subtitle}</p> : null}
        </div>
        <button className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
          <Bell className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  );
}
