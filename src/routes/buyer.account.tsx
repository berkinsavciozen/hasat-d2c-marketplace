import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { useHasat } from "@/lib/hasat/store";
import {
  useProfile,
  isEffectivelyPremium,
  useBuyerAddresses,
  useCreateAddress,
  useDeleteAddress,
  useSetDefaultAddress,
} from "@/lib/hasat/queries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bell, ChevronRight, Trash2, Star, Plus, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/buyer/account")({
  head: () => ({ meta: [{ title: "Hesap — Hasat" }] }),
  component: Account,
});

const TYPE_LABEL: Record<string, string> = {
  restoran: "Restoran", otel: "Otel", market: "Organik Market", ihracatci: "İhracatçı", bireysel: "Bireysel", diger: "Diğer",
};

function Account() {
  const navigate = useNavigate();
  const reset = useHasat((s) => s.reset);
  const localUser = useHasat((s) => s.user);
  const { data: profile } = useProfile();
  const { data: addresses = [] } = useBuyerAddresses();
  const create = useCreateAddress();
  const remove = useDeleteAddress();
  const setDefault = useSetDefaultAddress();

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");

  const displayName = profile?.name?.trim() || localUser?.company?.name || localUser?.name || "Alıcı";
  const premium = isEffectivelyPremium(profile);
  const buyerType = localUser?.company?.type ?? "diger";
  const needsName = !profile?.name?.trim();

  const logout = async () => {
    try { await supabase.auth.signOut(); }
    catch (e) { toast.error((e as Error).message); }
    finally { reset(); navigate({ to: "/" }); }
  };

  const onAdd = async () => {
    if (!label.trim() || !address.trim() || !city.trim()) {
      toast.error("Etiket, adres ve şehir gerekli");
      return;
    }
    try {
      await create.mutateAsync({ label: label.trim(), address: address.trim(), city: city.trim(), isDefault: addresses.length === 0 });
      toast.success("Adres eklendi");
      setLabel(""); setAddress(""); setCity(""); setShowForm(false);
    } catch (e) { toast.error((e as Error).message); }
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
              {displayName[0] ?? "A"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-serif text-lg truncate">{displayName}</div>
              <div className="text-xs text-hmuted">
                {buyerType === "bireysel" ? "👤 Bireysel" : TYPE_LABEL[buyerType]}
              </div>
            </div>
            <span className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{ background: premium ? "var(--gold)" : "var(--muted)", color: premium ? "var(--dark)" : "var(--hmuted)" }}>
              {premium ? "★ Premium" : "Ücretsiz"}
            </span>
          </div>
          {profile?.city && <div className="mt-3 text-xs text-hmuted">📍 {profile.city}</div>}
          {profile?.phone && <div className="mt-1 text-xs text-hmuted">📞 {profile.phone}</div>}
        </div>

        <Link
          to="/buyer/settings/notifs"
          className="flex items-center justify-between rounded-2xl bg-card border p-4 min-h-[56px]"
        >
          <div className="flex items-center gap-3">
            <Bell className="h-4 w-4 text-hmuted" />
            <span className="text-sm font-medium">Bildirim Tercihleri</span>
          </div>
          <ChevronRight className="h-4 w-4 text-hmuted" />
        </Link>

        <div className="rounded-2xl bg-card border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-serif text-base">Adreslerim</div>
            <button
              onClick={() => setShowForm((s) => !s)}
              className="inline-flex items-center gap-1 text-xs font-medium min-h-[40px] px-2"
              style={{ color: "var(--saffron)" }}
            >
              <Plus className="h-3.5 w-3.5" /> {showForm ? "Kapat" : "Ekle"}
            </button>
          </div>

          {showForm && (
            <div className="space-y-2 mb-3 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Etiket (Merkez Şube, Ev)" className="w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]" />
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adres" className="w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]" />
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Şehir" className="w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]" />
              <button
                onClick={onAdd}
                disabled={create.isPending}
                className="w-full rounded-lg py-2.5 text-sm font-medium min-h-[44px]"
                style={{ background: "var(--saffron)", color: "#fff" }}
              >
                {create.isPending ? "Ekleniyor…" : "Kaydet"}
              </button>
            </div>
          )}

          {addresses.length === 0 ? (
            <div className="text-xs text-hmuted">Kayıtlı adresiniz yok.</div>
          ) : (
            <div className="space-y-2">
              {addresses.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{a.label}</span>
                      {a.isDefault && (
                        <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: "var(--gold)", color: "var(--dark)" }}>
                          Varsayılan
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-hmuted truncate">{a.address}</div>
                    <div className="text-[11px] text-hmuted">{a.city}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!a.isDefault && (
                      <button
                        onClick={() => setDefault.mutate(a.id, {
                          onSuccess: () => toast.success("Varsayılan güncellendi"),
                          onError: (e) => toast.error((e as Error).message),
                        })}
                        aria-label="Varsayılan yap"
                        className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
                      >
                        <Star className="h-4 w-4 text-hmuted" />
                      </button>
                    )}
                    <button
                      onClick={() => remove.mutate(a.id, {
                        onSuccess: () => toast.success("Adres silindi"),
                        onError: (e) => toast.error((e as Error).message),
                      })}
                      aria-label="Sil"
                      className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
                    >
                      <Trash2 className="h-4 w-4 text-hred" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {localUser?.crops?.length ? (
          <div className="rounded-2xl bg-card border p-5">
            <div className="text-xs text-hmuted mb-2">İlgi Alanları</div>
            <div className="flex flex-wrap gap-2">
              {localUser.crops.map((c) => <span key={c} className="rounded-full bg-muted px-2.5 py-1 text-xs">{c}</span>)}
            </div>
          </div>
        ) : null}

        <button onClick={logout} className="w-full rounded-xl py-3 text-sm font-medium min-h-[48px]"
          style={{ background: "var(--hred)", color: "var(--hwhite)" }}>
          Çıkış Yap
        </button>
      </div>
    </>
  );
}
