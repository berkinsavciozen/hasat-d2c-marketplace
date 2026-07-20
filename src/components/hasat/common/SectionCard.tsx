import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card overflow-hidden", className)}>
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b">
        <h3 className="font-serif text-base leading-tight">{title}</h3>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
