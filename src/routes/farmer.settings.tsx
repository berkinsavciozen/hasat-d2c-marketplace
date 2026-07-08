import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FarmerHeader } from "./farmer";
import { useHasat } from "@/lib/hasat/store";
import { useParcels, useCreateParcel, useUpdateParcel, useDeleteParcel, useCertifications, useProfile, useUpdateProfile, useUploadCertification, useDeleteCertification, getCertificationSignedUrl, useAIUsageThisMonth, CERT_TYPES, type CertType } from "@/lib/hasat/queries";
import { ProgressDots } from "@/components/hasat/ProgressDots";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Bell, ChevronRight, LogOut, Pencil, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TierBadge } from "@/components/hasat/TierBadge";
import { UpgradeModal } from "@/components/hasat/UpgradeModal";
import { PhotoUploader } from "@/components/hasat/PhotoUploader";
import { vitrinUrl, copyVitrinLink } from "@/lib/hasat/vitrin";
import { TR_PROVINCES } from "@/lib/hasat/cities";
import { CropChips } from "@/components/hasat/CropChips";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/farmer/settings")({ component: Settings });

function Settings() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data: parcels = [], isLoading: parcelsLoading } = useParcels();
  const { data: certs = [], isLoading: certsLoading } = useCertifications();
  const updateParcel = useUpdateParcel();
  const createParcel = useCreateParcel();
  const deleteParcel = useDeleteParcel();
  const uploadCert = useUploadCertification();
  const deleteCert = useDeleteCertification();
  const [certSheet, setCertSheet] = useState(false);
  const [certType, setCertType] = useState<CertType>("organik");
  const [certExpires, setCertExpires] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { data: aiUsage } = useAIUsageThisMonth();
  const setRole = useHasat((s) => s.setRole);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [iban, setIban] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pName, setPName] = useState("");
  const [pArea, setPArea] = useState(0);
  const [pPhotos, setPPhotos] = useState<string[]>([]);
  const [pPhotoFiles, setPPhotoFiles] = useState<File[]>([]);

  // New parcel sheet state
  const [newParcelOpen, setNewParcelOpen] = useState(false);
  const [nName, setNName] = useState("");
  const [nProvince, setNProvince] = useState("");
  const [nDistrict, setNDistrict] = useState("");
  const [nArea, setNArea] = useState(0);
  const [nCrops, setNCrops] = useState<string[]>([]);
  const [nPhotoFiles, setNPhotoFiles] = useState<File[]>([]);

  const resetNewParcel = () => {
    setNName(""); setNProvince(""); setNDistrict(""); setNArea(0); setNCrops([]); setNPhotoFiles([]);
  };

  const addParcel = async () => {
    if (!nName.trim()) { toast.error("Parsel adı girin"); return; }
    try {
      await createParcel.mutateAsync({
        name: nName.trim(),
        area: nArea,
        crops: nCrops,
        location: { label: [nProvince, nDistrict.trim()].filter(Boolean).join(" / "), lat: 0, lng: 0 },
        photoFiles: nPhotoFiles,
      });
      toast.success("Parsel eklendi");
      setNewParcelOpen(false);
      resetNewParcel();
    } catch (e) { toast.error((e as Error).message); }
  };

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? "");
    setCity(profile.city ?? "");
    setIban(profile.iban ?? "");
    setBankAccountName(profile.bank_account_name ?? "");
  }, [profile?.name, profile?.city, profile?.iban, profile?.bank_account_name]);

  const saveProfile = async () => {
    try {
      await updateProfile.mutateAsync({ name, city });
      toast.success("Profil güncellendi");
    } catch (e) { toast.error((e as Error).message); }
  };

  const saveBank = async () => {
    const cleaned = iban.replace(/\s+/g, "").toUpperCase();
    if (cleaned && !/^TR\d{24}$/.test(cleaned)) {
      toast.error("Geçerli bir TR IBAN girin (TR + 24 rakam)");
      return;
    }
    try {
      await updateProfile.mutateAsync({
        iban: cleaned || null,
        bank_account_name: bankAccountName.trim() || null,
      });
      toast.success("Banka bilgileri güncellendi");
    } catch (e) { toast.error((e as Error).message); }
  };


  const openEdit = (id: string) => {
    const p = parcels.find((x) => x.id === id);
    if (!p) return;
    setEditing(id); setPName(p.name); setPArea(p.area);
    setPPhotos(p.photos ?? []); setPPhotoFiles([]);
  };

  const saveParcel = async () => {
    if (!editing) return;
    try {
      await updateParcel.mutateAsync({ id: editing, patch: { name: pName, area: pArea }, existingPhotos: pPhotos, photoFiles: pPhotoFiles });
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
            <div className="flex flex-col gap-1">
              <button className="text-xs text-muted-foreground underline text-left">Değiştir</button>
              <TierBadge tier={profile?.tier ?? "free"} />
            </div>
          </div>
          <label className="text-xs text-muted-foreground">Ad Soyad</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 mb-3" />
          <label className="text-xs text-muted-foreground">Şehir</label>
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger className="mt-1 mb-3"><SelectValue placeholder="İl seçin" /></SelectTrigger>
            <SelectContent>{TR_PROVINCES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <button onClick={saveProfile}
            className="rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>Kaydet</button>

          <div className="mt-4 border-t pt-4">
            <button
              onClick={() => copyVitrinLink(profile ?? undefined)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Vitrin Linkini Kopyala
            </button>
            <div className="mt-2 truncate font-mono text-[11px] text-hmuted">
              {vitrinUrl(profile ?? undefined)}
            </div>
          </div>
        </Section>

        <Section title="Banka Bilgileri">
          <p className="mb-3 text-xs text-hmuted">
            Alıcılar, teklifiniz kabul edildiğinde bu IBAN'a havale yaparak ödeme yapar.
          </p>
          <label className="text-xs text-muted-foreground">IBAN</label>
          <Input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="TR00 0000 0000 0000 0000 0000 00"
            className="mt-1 mb-3 font-mono"
          />
          <label className="text-xs text-muted-foreground">Hesap Sahibi Adı</label>
          <Input
            value={bankAccountName}
            onChange={(e) => setBankAccountName(e.target.value)}
            placeholder="Ad Soyad"
            className="mt-1 mb-3"
          />
          <button onClick={saveBank}
            disabled={updateProfile.isPending}
            className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>
            {updateProfile.isPending ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </Section>



        <Section title="AI Asistan">
          {(() => {
            const isPremium = profile?.tier === "premium";
            const count = aiUsage?.count ?? 0;
            const pct = Math.min(100, (count / 50) * 100);
            const color = count <= 35 ? "#16a34a" : count <= 45 ? "#d97706" : "#dc2626";
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4" style={{ color: "var(--lav)" }} />
                    <span>Üyelik</span>
                  </div>
                  <TierBadge tier={profile?.tier ?? "free"} />
                </div>
                {isPremium ? (
                  <div className="text-sm font-medium" style={{ color: "var(--sage, #4f8a4f)" }}>
                    ✓ Sınırsız AI sohbeti
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span>Bu ay AI mesajları</span>
                      <span className="text-muted-foreground">{count} / 50 mesaj</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setUpgradeOpen(true)}
                      className="text-sm font-medium underline"
                      style={{ color: "var(--saffron)" }}
                    >
                      Premium'a Geç →
                    </button>
                  </>
                )}
              </div>
            );
          })()}
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
              <button onClick={() => setNewParcelOpen(true)}
                className="mt-2 self-start rounded-lg px-3 py-1.5 text-xs font-medium border border-border hover:bg-muted">
                + Parsel Ekle
              </button>
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
              {certs.map((c) => {
                const expiryBadge = (() => {
                  if (!c.expires_at) return null;
                  const now = Date.now();
                  const exp = new Date(c.expires_at).getTime();
                  if (isNaN(exp)) return null;
                  const days = Math.floor((exp - now) / 86400000);
                  if (days < 0) {
                    return (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-hred/15 text-hred">
                        Süresi Geçti
                      </span>
                    );
                  }
                  if (days <= 30) {
                    return (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "color-mix(in oklab, var(--gold) 20%, transparent)", color: "var(--gold)" }}>
                        Yakında Sona Eriyor
                      </span>
                    );
                  }
                  return null;
                })();
                return (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center gap-2">
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
                    {expiryBadge}
                  </div>
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
                );
              })}
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
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[92vh] overflow-y-auto">
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
            <div>
              <label className="text-xs text-muted-foreground">Fotoğraflar (en fazla 5)</label>
              <div className="mt-1">
                <PhotoUploader
                  value={pPhotos}
                  files={pPhotoFiles}
                  onChange={(v, f) => { setPPhotos(v); setPPhotoFiles(f); }}
                  max={5}
                />
              </div>
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
      <Sheet open={newParcelOpen} onOpenChange={(o) => { if (!o) { setNewParcelOpen(false); resetNewParcel(); } }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[92vh] overflow-y-auto">
          <SheetHeader><SheetTitle>Yeni Parsel</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Parsel Adı</label>
              <Input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Ana Parsel" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">İl</label>
              <Select value={nProvince} onValueChange={setNProvince}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="İl seçin" /></SelectTrigger>
                <SelectContent>{TR_PROVINCES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">İlçe / Mahalle (opsiyonel)</label>
              <Input value={nDistrict} onChange={(e) => setNDistrict(e.target.value)} placeholder="Safranbolu" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Alan (dönüm)</label>
              <Input type="number" value={nArea} onChange={(e) => setNArea(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Ana Ürünler</label>
              <div className="mt-2">
                <CropChips value={nCrops} onChange={setNCrops} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fotoğraflar (en fazla 5)</label>
              <div className="mt-1">
                <PhotoUploader
                  value={[]}
                  files={nPhotoFiles}
                  onChange={(_v, f) => setNPhotoFiles(f)}
                  max={5}
                />
              </div>
            </div>
            <button
              onClick={addParcel}
              disabled={createParcel.isPending}
              className="w-full rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--saffron)", color: "var(--hwhite)" }}
            >
              {createParcel.isPending ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
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
