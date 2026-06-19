import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { useHasat } from "@/lib/hasat/store";
import { useProfile } from "@/lib/hasat/queries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/buyer/account")({
  head: () => ({ meta: [{ title: "Hesap — Hasat" }] }),
  component: Account,
});

const TYPE_LABEL: Record<string, string> = {
  restoran: "Restoran", otel: "Otel", market: "Organik Market", ihracatci: "İhracatçı", diger: "Diğer",
};

function Account() {
  const navigate = useNavigate();
  const user = useHasat((s) => s.user);
  const reset = useHasat((s) => s.reset);
  const { data: profile } = useProfile();
  const needsName = !profile?.name?.trim();

  const logout = async () => {
    try { await supabase.auth.signOut(); }
    catch (e) { toast.error((e as Error).message); }
    finally { reset(); navigate({ to: "/" }); }
  };

  return (
    <>
      <BuyerHeader title="Hesap" />
      <div className="p-4 md:p-8 max-w-2xl space-y-5">
        {needsName && (
          <div className="rounded-xl border border-saffron/40 bg-saffron/10 px-4 py-3 text-sm text-saffron">
            Profilinizi tamamlayın — alıcılar sizi tanısın.
          </div>
        )}
        <div className="rounded-2xl bg-card border p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-full text-xl font-bold text-white" style={{ background: "var(--gold)" }}>
              {user?.company?.name?.[0] ?? user?.name?.[0] ?? "A"}
            </div>
            <div className="flex-1">
              <div className="font-serif text-lg">{user?.company?.name ?? user?.name ?? "Alıcı"}</div>
              <div className="text-xs text-hmuted">{TYPE_LABEL[user?.company?.type ?? "diger"]}</div>
            </div>
            <span className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{ background: user?.premium ? "var(--gold)" : "var(--muted)", color: user?.premium ? "var(--dark)" : "var(--hmuted)" }}>
              {user?.premium ? "★ Premium" : "Ücretsiz"}
            </span>
          </div>
          {user?.company?.address && <div className="mt-3 text-xs text-hmuted">📍 {user.company.address}</div>}
          {user?.phone && <div className="mt-1 text-xs text-hmuted">📞 {user.phone}</div>}
        </div>

        {user?.crops?.length ? (
          <div className="rounded-2xl bg-card border p-5">
            <div className="text-xs text-hmuted mb-2">İlgi Alanları</div>
            <div className="flex flex-wrap gap-2">
              {user.crops.map((c) => <span key={c} className="rounded-full bg-muted px-2.5 py-1 text-xs">{c}</span>)}
            </div>
          </div>
        ) : null}

        <button onClick={logout} className="w-full rounded-xl py-3 text-sm font-medium"
          style={{ background: "var(--hred)", color: "var(--hwhite)" }}>
          Çıkış Yap
        </button>
      </div>
    </>
  );
}
