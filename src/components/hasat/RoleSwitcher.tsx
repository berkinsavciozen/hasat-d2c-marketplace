import { useNavigate } from "@tanstack/react-router";
import { useHasat } from "@/lib/hasat/store";

export function RoleSwitcher() {
  const user = useHasat((s) => s.user);
  const setRole = useHasat((s) => s.setRole);
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div className="fixed bottom-3 left-3 z-50 flex items-center gap-1 rounded-full border bg-popover/95 px-2 py-1 text-[11px] shadow-lg backdrop-blur">
      <span className="px-1 text-hmuted">DEV</span>
      <button
        onClick={() => { setRole("farmer"); navigate({ to: "/farmer/home" }); }}
        className={`rounded-full px-2 py-0.5 ${user.role === "farmer" ? "bg-saffron text-white" : ""}`}
      >Çiftçi</button>
      <button
        onClick={() => { setRole("buyer"); navigate({ to: "/buyer/discover" }); }}
        className={`rounded-full px-2 py-0.5 ${user.role === "buyer" ? "bg-saffron text-white" : ""}`}
      >Alıcı</button>
      <button
        onClick={() => { setRole(null); navigate({ to: "/" }); }}
        className="rounded-full px-2 py-0.5 text-hmuted"
      >Çıkış</button>
    </div>
  );
}
