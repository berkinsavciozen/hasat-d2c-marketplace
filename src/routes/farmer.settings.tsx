import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FarmerHeader } from "./farmer";
import { useHasat } from "@/lib/hasat/store";
import { useParcels, useUpdateParcel, useDeleteParcel, useCertifications, useProfile, useUpdateProfile, useUploadCertification, useDeleteCertification, getCertificationSignedUrl, useAIUsageThisMonth, CERT_TYPES, type CertType } from "@/lib/hasat/queries";
import { ProgressDots } from "@/components/hasat/ProgressDots";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Bell, ChevronRight, LogOut, Pencil, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TierBadge } from "@/components/hasat/TierBadge";
import { UpgradeModal } from "@/components/hasat/UpgradeModal";

export const Route = createFileRoute("/farmer/settings")({ component: Settings });

function Settings() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data: parcels = [], isLoading: parcelsLoading } = useParcels();
  const { data: certs = [], isLoading: certsLoading } = useCertifications();
  const updateParcel = useUpdateParcel();
  const deleteParcel = useDeleteParcel();
  const uploadCert = useUploadCertification();
  const deleteCert = useDeleteCertification();
  const [certSheet, setCertSheet] = useState(false);
  const [certType, setCertType] = useState<CertType>("organik");
  const [certExpires, setCertExpires] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const setRole = useHasat((s) => s.setRole);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pName, setPName] = useState("");
  const [pArea, setPArea] = useState(0);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? "");
    setCity(profile.city ?? "");
  }, [profile?.name, profile?.city]);

  const saveProfile = async () => {
    try {
      await updateProfile.mutateAsync({ name, city });
      toast.success("Profil güncellendi");
    } catch (e) { toast.error((e as Error).message); }
  };


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
          {!name.trim() && (
            <div className="mb-4 rounded-xl border border-saffron/40 bg-saffron/10 px-4 py-3 text-sm text-saffron">
              Profilinizi tamamlayın — alıcılar sizi tanısın.
            </div>
          )}
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
          {parcelsLoading ? (
            <div className="py-6"><ProgressDots current={2} total={3} /></div>
          ) : (
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
                    <button onClick={() => removeParcel(p.id)}
                      className="grid h-8 w-8 place-items-center rounded-md hover:bg-destructive/10 text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {parcels.length === 0 && <div className="text-xs text-muted-foreground py-4 text-center">Henüz parsel yok</div>}
            </div>
          )}
        </Section>

        <Section title="Sertifikalar">
          {certsLoading ? (
            <div className="py-4"><ProgressDots current={1} total={3} /></div>
          ) : (
            <div className="flex flex-col gap-2">
              {certs.length === 0 && (
                <div className="text-xs text-muted-foreground">Sertifika eklenmemiş</div>
              )}
              {certs.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <button
                    onClick={async () => {
                      if (!c.document_url) return;
                      try {
                        const url = await getCertificationSignedUrl(c.document_url);
                        window.open(url, "_blank");
                      } catch (e) { toast.error((e as Error).message); }
                    }}
                    className="px-2 py-1 text-xs rounded-full hover:opacity-80"
                    style={{ background: "color-mix(in oklab, var(--sage) 30%, transparent)" }}>
                    ✓ {c.type}
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="text-[11px] text-muted-foreground text-right">
                      <div>Doğrulandı: {fmtDate(c.verified_at)}</div>
                      <div>Süre: {fmtDate(c.expires_at)}</div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await deleteCert.mutateAsync({ id: c.id, document_url: c.document_url });
                          toast.success("Sertifika silindi");
                        } catch (e) { toast.error((e as Error).message); }
                      }}
                      className="grid h-8 w-8 place-items-center rounded-md hover:bg-destructive/10 text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button onClick={() => setCertSheet(true)}
                className="mt-2 self-start rounded-lg px-3 py-1.5 text-xs font-medium border border-border hover:bg-muted">
                + Sertifika Ekle
              </button>
            </div>
          )}
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

      <Sheet open={certSheet} onOpenChange={(o) => { if (!o) { setCertSheet(false); setCertFile(null); setCertExpires(""); } }}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Sertifika Ekle</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Tür</label>
              <select value={certType} onChange={(e) => setCertType(e.target.value as CertType)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {CERT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Bitiş Tarihi (opsiyonel)</label>
              <Input type="date" value={certExpires} onChange={(e) => setCertExpires(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Dosya (PDF/Resim)</label>
              <Input type="file" accept="application/pdf,image/*" onChange={(e) => setCertFile(e.target.files?.[0] ?? null)} className="mt-1" />
            </div>
            {uploadCert.isPending && <ProgressDots current={2} total={3} />}
            <button
              onClick={async () => {
                if (!certFile) { toast.error("Dosya seçin"); return; }
                try {
                  await uploadCert.mutateAsync({ type: certType, file: certFile, expiresAt: certExpires || null });
                  toast.success("Sertifika yüklendi");
                  setCertSheet(false); setCertFile(null); setCertExpires("");
                } catch (e) { toast.error((e as Error).message); }
              }}
              disabled={uploadCert.isPending}
              className="w-full rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>
              {uploadCert.isPending ? "Yükleniyor…" : "Yükle"}
            </button>
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
