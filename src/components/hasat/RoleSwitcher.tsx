import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useHasat } from "@/lib/hasat/store";
import { ChevronDown, X } from "lucide-react";

export function RoleSwitcher() {
  const user = useHasat((s) => s.user);
  const setRole = useHasat((s) => s.setRole);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!import.meta.env.DEV) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 left-3 md:bottom-4 md:right-4 md:left-auto z-[60] h-9 rounded-full bg-popover/85 px-3 text-[11px] font-medium shadow-lg border backdrop-blur flex items-center gap-1.5 text-foreground/80 hover:bg-popover"
        aria-label="Dev role switcher"
      >
        <span className="text-saffron">⚙</span> DEV
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-3 md:bottom-4 z-[60] flex items-center gap-1 rounded-full border bg-popover/95 px-2 py-1 text-[11px] shadow-lg backdrop-blur">
      <span className="px-1 text-hmuted">DEV</span>
      <button
        onClick={() => { setRole("farmer"); navigate({ to: "/farmer/home" }); }}
        className={`rounded-full px-2 py-0.5 ${user?.role === "farmer" ? "bg-saffron text-white" : ""}`}
      >Çiftçi</button>
      <button
        onClick={() => { setRole("buyer"); navigate({ to: "/buyer/discover" }); }}
        className={`rounded-full px-2 py-0.5 ${user?.role === "buyer" ? "bg-saffron text-white" : ""}`}
      >Alıcı</button>
      <button
        onClick={() => { setRole(null); navigate({ to: "/" }); }}
        className="rounded-full px-2 py-0.5 text-hmuted"
      >Çıkış</button>
      <button onClick={() => setOpen(false)} className="ml-1 grid h-5 w-5 place-items-center rounded-full text-hmuted hover:bg-muted" aria-label="Kapat">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
