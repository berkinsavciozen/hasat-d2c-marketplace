import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, Plus, Settings } from "lucide-react";
import { toast } from "sonner";
import { FarmerHeader } from "./farmer";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  useJournalThemes,
  useJournalEntryTypes,
  useFarmerJournalPrefs,
  useToggleJournalPref,
  useCreateCustomEntryType,
  useParcels,
} from "@/lib/hasat/queries";

export const Route = createFileRoute("/farmer/journal/customize")({
  head: () => ({ meta: [{ title: "Rutin Bakımı Özelleştir — Hasat" }] }),
  component: CustomizePage,
});

type FreqOption = { label: string; value: number | null };

const FREQ_OPTIONS: FreqOption[] = [
  { label: "Her gün", value: 1 },
  { label: "3 günde bir", value: 3 },
  { label: "Haftada bir", value: 7 },
  { label: "2 haftada bir", value: 14 },
  { label: "Ayda bir", value: 30 },
  { label: "Sadece olay bazlı, hatırlatma yok", value: null },
];

function CustomizePage() {
  const { data: themes = [], isLoading: themesLoading } = useJournalThemes();
  const { data: parcels = [] } = useParcels();
  const { data: prefs = {} } = useFarmerJournalPrefs();

  const farmerCrops = useMemo(() => {
    const s = new Set<string>();
    for (const p of parcels) for (const c of p.crops ?? []) s.add(c.toLowerCase());
    return s;
  }, [parcels]);

  const visibleThemes = useMemo(
    () => themes.filter((t) => !t.crop || farmerCrops.has(t.crop.toLowerCase())),
    [themes, farmerCrops],
  );

  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const themeId = activeThemeId ?? visibleThemes[0]?.id ?? null;

  const { data: entryTypes = [], isLoading: typesLoading } = useJournalEntryTypes(themeId);
  const visibleTypes = useMemo(
    () => entryTypes.filter((t) => !t.crop || farmerCrops.has(t.crop.toLowerCase())),
    [entryTypes, farmerCrops],
  );

  const togglePref = useToggleJournalPref();
  const createCustom = useCreateCustomEntryType();

  // Frequency/note sheet state (opens when toggling ON)
  const [freqSheet, setFreqSheet] = useState<{
    entry_type_id: string;
    name: string;
    default_frequency_days: number | null;
  } | null>(null);
  const [pickedFreq, setPickedFreq] = useState<number | null>(null);
  const [note, setNote] = useState("");

  // Add-custom sheet state
  const [addOpen, setAddOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cIcon, setCIcon] = useState("🌿");
  const [cFreq, setCFreq] = useState<number | null>(7);

  const openFreqSheet = (t: (typeof visibleTypes)[number]) => {
    setFreqSheet({
      entry_type_id: t.id,
      name: t.name,
      default_frequency_days: t.default_frequency_days,
    });
    setPickedFreq(t.default_frequency_days ?? null);
    setNote(prefs[t.id]?.threshold_note ?? "");
  };

  const handleToggle = async (t: (typeof visibleTypes)[number], next: boolean) => {
    if (next) {
      openFreqSheet(t);
    } else {
      try {
        await togglePref.mutateAsync({ entry_type_id: t.id, is_active: false });
      } catch (err) {
        toast.error((err as Error).message);
      }
    }
  };

  const saveFreq = async () => {
    if (!freqSheet) return;
    try {
      await togglePref.mutateAsync({
        entry_type_id: freqSheet.entry_type_id,
        is_active: true,
        frequency_days: pickedFreq,
        threshold_note: note.trim() || null,
      });
      toast.success("Takip listesine eklendi");
      setFreqSheet(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const saveCustom = async () => {
    if (!themeId || !cName.trim()) return;
    try {
      await createCustom.mutateAsync({
        theme_id: themeId,
        name: cName.trim(),
        icon: cIcon.trim() || null,
        default_frequency_days: cFreq,
      });
      toast.success("Kendi eyleminiz eklendi ve aktif");
      setAddOpen(false);
      setCName("");
      setCIcon("🌿");
      setCFreq(7);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      <FarmerHeader title="Rutin Bakımı Özelleştir">
        <div className="mt-2 flex items-center gap-2">
          <Link
            to="/farmer/journal"
            className="inline-flex items-center gap-1 text-sm text-hwhite/70 hover:text-hwhite"
          >
            <ChevronLeft className="h-4 w-4" /> Günlüğe dön
          </Link>
        </div>
        <p className="mt-2 text-sm text-hwhite/70">
          Takip etmek istediğin bakım eylemlerini seç. Aktif olanlar için hatırlatma ve geçmiş kaydı
          tutulur.
        </p>
      </FarmerHeader>

      <div className="p-4 md:p-8 space-y-4">
        {/* Theme tabs */}
        {themesLoading ? (
          <div className="text-sm text-hmuted">Yükleniyor…</div>
        ) : visibleThemes.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed p-6 text-center text-sm text-hmuted"
            style={{ background: "var(--cream)", borderColor: "var(--border)" }}
          >
            Henüz kategori yok.
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
            {visibleThemes.map((t) => {
              const active = t.id === themeId;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveThemeId(t.id)}
                  className="shrink-0 rounded-xl border px-4 py-2 text-sm transition"
                  style={{
                    background: active ? "var(--primary)" : "var(--cream)",
                    color: active ? "white" : "var(--dark)",
                    borderColor: active ? "var(--primary)" : "var(--border)",
                  }}
                >
                  <span className="mr-1.5">{t.icon ?? "•"}</span>
                  {t.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Entry types list */}
        {themeId && (
          <div className="space-y-2">
            {typesLoading ? (
              <div className="text-sm text-hmuted py-6 text-center">Yükleniyor…</div>
            ) : visibleTypes.length === 0 ? (
              <div
                className="rounded-2xl border border-dashed p-6 text-center text-sm text-hmuted"
                style={{ background: "var(--cream)", borderColor: "var(--border)" }}
              >
                Bu kategoride henüz eylem yok. Aşağıdan kendi eylemini ekle.
              </div>
            ) : (
              visibleTypes.map((t) => {
                const pref = prefs[t.id];
                const isOn = !!pref?.is_active;
                const freq = pref?.frequency_days ?? t.default_frequency_days;
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-2xl border px-4 py-3.5"
                    style={{ background: "var(--cream)", borderColor: "var(--border)" }}
                  >
                    <div className="text-2xl shrink-0 w-8 text-center">{t.icon ?? "•"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium text-dark truncate">{t.name}</div>
                        {!t.is_preset && (
                          <span
                            className="rounded-full border px-1.5 py-0.5 text-[10px] text-hmuted"
                            style={{ borderColor: "var(--border)" }}
                          >
                            Özel
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-hmuted mt-0.5">
                        {isOn
                          ? freq
                            ? `Her ${freq} günde bir hatırlatma`
                            : "Olay bazlı, hatırlatma yok"
                          : t.default_frequency_days
                            ? `Önerilen: her ${t.default_frequency_days} günde bir`
                            : "Kapalı"}
                        {pref?.threshold_note ? ` · ${pref.threshold_note}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {isOn && (
                        <button
                          onClick={() => openFreqSheet(t)}
                          className="rounded-xl border p-1.5 text-hmuted hover:text-primary hover:border-primary transition"
                          style={{ borderColor: "var(--border)" }}
                          aria-label="Sıklığı ayarla"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                      )}
                      <Switch checked={isOn} onCheckedChange={(v) => handleToggle(t, v)} />
                    </div>
                  </div>
                );
              })
            )}

            <button
              onClick={() => setAddOpen(true)}
              className="w-full rounded-xl border border-dashed py-3.5 text-sm text-hmuted hover:border-primary hover:text-primary transition inline-flex items-center justify-center gap-2"
              style={{ borderColor: "var(--border)" }}
            >
              <Plus className="h-4 w-4" /> Kendi Bakım Eylemini Ekle
            </button>
          </div>
        )}
      </div>

      {/* Frequency + note sheet */}
      <Sheet open={!!freqSheet} onOpenChange={(o) => !o && setFreqSheet(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh]">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-muted -mt-2 mb-3" />
          <SheetHeader>
            <SheetTitle>Ne sıklıkla hatırlatalım?</SheetTitle>
          </SheetHeader>
          <div className="mt-1 text-sm text-hmuted">{freqSheet?.name}</div>
          <div className="mt-4 space-y-2 pb-6">
            {freqSheet?.default_frequency_days ? (
              <button
                onClick={() => setPickedFreq(freqSheet.default_frequency_days)}
                className="w-full rounded-xl border px-4 py-3 text-left text-sm transition"
                style={{
                  background:
                    pickedFreq === freqSheet.default_frequency_days
                      ? "color-mix(in oklab, var(--primary) 10%, transparent)"
                      : "var(--cream)",
                  borderColor:
                    pickedFreq === freqSheet.default_frequency_days
                      ? "var(--primary)"
                      : "var(--border)",
                }}
              >
                ⭐ Önerilen (her {freqSheet.default_frequency_days} günde bir)
              </button>
            ) : null}
            {FREQ_OPTIONS.map((opt) => {
              const selected =
                pickedFreq === opt.value && opt.value !== freqSheet?.default_frequency_days;
              return (
                <button
                  key={String(opt.value)}
                  onClick={() => setPickedFreq(opt.value)}
                  className="w-full rounded-xl border px-4 py-3 text-left text-sm transition"
                  style={{
                    background: selected
                      ? "color-mix(in oklab, var(--primary) 10%, transparent)"
                      : "var(--cream)",
                    borderColor: selected ? "var(--primary)" : "var(--border)",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
            <div className="pt-2">
              <label className="text-xs text-hmuted">Not / eşik (opsiyonel)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Örn: yaprak sararırsa"
                className="mt-1 w-full rounded-xl border bg-input px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              onClick={saveFreq}
              disabled={togglePref.isPending}
              className="mt-2 w-full rounded-xl bg-primary py-3 text-white font-medium disabled:opacity-40"
            >
              {togglePref.isPending ? "Kaydediliyor…" : "Kaydet ✓"}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add custom entry-type sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh]">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-muted -mt-2 mb-3" />
          <SheetHeader>
            <SheetTitle>Kendi Bakım Eylemini Ekle</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4 pb-6">
            <div>
              <label className="text-xs text-hmuted">Eylem adı</label>
              <input
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="Örn: Toprak pH ölçümü"
                className="mt-1 w-full rounded-xl border bg-input px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="text-xs text-hmuted">İkon (emoji)</label>
              <input
                value={cIcon}
                onChange={(e) => setCIcon(e.target.value)}
                maxLength={4}
                className="mt-1 w-24 rounded-lg border bg-input px-3 py-2.5 text-center text-xl outline-none focus:border-saffron"
              />
            </div>
            <div>
              <label className="text-xs text-hmuted">Sıklık</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {FREQ_OPTIONS.map((opt) => {
                  const selected = cFreq === opt.value;
                  return (
                    <button
                      key={String(opt.value)}
                      onClick={() => setCFreq(opt.value)}
                      className="rounded-xl border px-3 py-2.5 text-left text-sm transition"
                      style={{
                        background: selected
                          ? "color-mix(in oklab, var(--primary) 10%, transparent)"
                          : "var(--cream)",
                        borderColor: selected ? "var(--primary)" : "var(--border)",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              onClick={saveCustom}
              disabled={!cName.trim() || createCustom.isPending}
              className="w-full rounded-xl bg-primary py-3 text-white font-medium disabled:opacity-40"
            >
              {createCustom.isPending ? "Kaydediliyor…" : "Ekle & Aktifleştir ✓"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
