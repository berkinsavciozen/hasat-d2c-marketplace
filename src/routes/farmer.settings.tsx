import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FarmerHeader } from "./farmer";
import { useHasat } from "@/lib/hasat/store";
import { useParcels, useUpdateParcel, useDeleteParcel, useCertifications } from "@/lib/hasat/queries";
import { ProgressDots } from "@/components/hasat/ProgressDots";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Bell, ChevronRight, LogOut, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/farmer/settings")({ component: Settings });

function Settings() {
  const navigate = useNavigate();
  const user = useHasat((s) => s.user);
  const { data: parcels = [], isLoading: parcelsLoading } = useParcels();
  const { data: certs = [], isLoading: certsLoading } = useCertifications();
  const updateUser = useHasat((s) => s.updateUser);
  const updateParcel = useUpdateParcel();
  const deleteParcel = useDeleteParcel();
  const setRole = useHasat((s) => s.setRole);

  const [name, setName] = useState(user?.name ?? "");
  const [city, setCity] = useState(user?.city ?? "");
  const [editing, setEditing] = useState<string | null>(null);
  const [pName, setPName] = useState("");
  const [pArea, setPArea] = useState(0);

  const saveProfile = () => { updateUser({ name, city }); toast.success("Profil güncellendi"); };

  const openEdit = (id: string) => {
    const p = parcels.find((x) => x.id === id);
    if (!p) return;
    setEditing(id); setPName(p.name); setPArea(p.area);
  };

  const saveParcel = async () => {
    if (!editing) return;
    try {
      await updateParcel.mutateAsync({ id: editing, patch: { name: pName, area: pArea } });
      setEditing(null);
      toast.success("Parsel güncellendi");
    } catch (e) { toast.error((e as Error).message); }
  };

  const removeParcel = async (id: string) => {
    try {
      await deleteParcel.mutateAsync(id);
      toast.success("Parsel silindi");
    } catch (e) { toast.error((e as Error).message); }
  };

  const logout = async () => {
    try { await supabase.auth.signOut(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setRole(null); navigate({ to: "/" }); }
  };

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("tr-TR") : "—";

  return (
    <>
      <FarmerHeader title="Ayarlar" />
      <div className="p-4 md:p-8 max-w-2xl space-y-5">
        <Section title="Profil">
          <div className="flex items-center gap-3 mb-4">
            <div className="grid h-14 w-14 place-items-center rounded-full text-lg font-bold"
              style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>{name[0] ?? "?"}</div>
            <button className="text-xs text-muted-foreground underline">Değiştir</button>
          </div>
          <label className="text-xs text-muted-foreground">Ad Soyad</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 mb-3" />
          <label className="text-xs text-muted-foreground">Şehir</label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 mb-3" />
          <button onClick={saveProfile}
            className="rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>Kaydet</button>
        </Section>

        <Section title="Parsellerim">
          <div className="space-y-2">
            {parcels.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.area} dönüm · {p.location.label}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(p.id)} className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => { deleteParcel(p.id); toast.success("Parsel silindi"); }}
                    className="grid h-8 w-8 place-items-center rounded-md hover:bg-destructive/10 text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {parcels.length === 0 && <div className="text-xs text-muted-foreground py-4 text-center">Henüz parsel yok</div>}
          </div>
        </Section>

        <Section title="Sertifikalar">
          <div className="flex flex-wrap gap-2">
            {(user?.certs ?? []).length === 0 && <div className="text-xs text-muted-foreground">Sertifika eklenmemiş</div>}
            {(user?.certs ?? []).map((c) => (
              <span key={c} className="px-2 py-1 text-xs rounded-full" style={{ background: "color-mix(in oklab, var(--sage) 30%, transparent)" }}>
                ✓ {c}
              </span>
            ))}
          </div>
        </Section>

        <Link to="/farmer/settings/notifs"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:bg-muted/50">
          <Bell className="h-5 w-5" />
          <span className="flex-1 text-sm">Bildirim Tercihleri</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <Section title="Hesap">
          <button onClick={logout}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-destructive border border-destructive/40 hover:bg-destructive/10">
            <LogOut className="h-4 w-4" /> Çıkış Yap
          </button>
        </Section>
      </div>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Parseli Düzenle</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Parsel Adı</label>
              <Input value={pName} onChange={(e) => setPName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Alan (dönüm)</label>
              <Input type="number" value={pArea} onChange={(e) => setPArea(Number(e.target.value))} className="mt-1" />
            </div>
            <button onClick={saveParcel}
              className="w-full rounded-xl py-2.5 text-sm font-medium"
              style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>Kaydet</button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-medium text-sm mb-3">{title}</h3>
      {children}
    </div>
  );
}
