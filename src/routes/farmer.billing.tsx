import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { FarmerHeader } from "./farmer";
import { useHasat } from "@/lib/hasat/store";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const search = z.object({ plan: z.enum(["premium", "elite"]).catch("premium") });

export const Route = createFileRoute("/farmer/billing")({
  validateSearch: (s) => search.parse(s),
  component: Billing,
});

const PLANS: Record<"premium" | "elite", { name: string; price: string }> = {
  premium: { name: "Premium", price: "₺299/ay" },
  elite: { name: "Elite", price: "₺799/ay" },
};

function Billing() {
  const { plan } = Route.useSearch() as { plan: "premium" | "elite" };
  const navigate = useNavigate();
  const setPremium = useHasat((s) => s.setPremium);
  const [card, setCard] = useState({ num: "", exp: "", cvv: "", name: "" });
  const [done, setDone] = useState(false);

  const formatCard = (v: string) => v.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
  const formatExp = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  return (
    <>
      <FarmerHeader title="Ödeme" subtitle="Aboneliği tamamla" />
      <div className="p-4 md:p-8 max-w-xl space-y-5">
        <div className="rounded-xl p-5"
          style={{ background: "color-mix(in oklab, var(--saffron) 14%, var(--card))", border: "1px solid var(--saffron)" }}>
          <div className="text-xs opacity-70">Seçilen Plan</div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="font-serif text-2xl">{PLANS[plan].name}</div>
            <div className="font-mono text-lg" style={{ color: "var(--saffron)" }}>{PLANS[plan].price}</div>
          </div>
        </div>

        <div className="rounded-xl p-3 text-xs text-center"
          style={{ background: "color-mix(in oklab, var(--saffron) 18%, transparent)", color: "var(--saffron)" }}>
          🎁 İlk 30 gün ücretsiz dene — istediğin zaman iptal et
        </div>

        <Tabs defaultValue="cc">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="cc">Kredi Kartı</TabsTrigger>
            <TabsTrigger value="bank">Banka Havalesi</TabsTrigger>
          </TabsList>

          <TabsContent value="cc" className="space-y-3 mt-4">
            <div>
              <label className="text-xs text-muted-foreground">Kart Numarası</label>
              <Input value={card.num} onChange={(e) => setCard({ ...card, num: formatCard(e.target.value) })}
                placeholder="1234 5678 9012 3456" inputMode="numeric" className="mt-1 font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Son Kullanım</label>
                <Input value={card.exp} onChange={(e) => setCard({ ...card, exp: formatExp(e.target.value) })}
                  placeholder="MM/YY" className="mt-1 font-mono" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">CVV</label>
                <Input value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                  placeholder="123" className="mt-1 font-mono" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Kart Sahibi</label>
              <Input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })}
                placeholder="Ad Soyad" className="mt-1" />
            </div>
          </TabsContent>

          <TabsContent value="bank" className="mt-4 rounded-xl border border-border bg-card p-4 text-sm space-y-2">
            <div><span className="text-muted-foreground">Banka:</span> Ziraat Bankası</div>
            <div><span className="text-muted-foreground">IBAN:</span> <span className="font-mono">TR12 0001 0000 0000 0000 0000 00</span></div>
            <div><span className="text-muted-foreground">Alıcı:</span> Hasat Tarım A.Ş.</div>
            <div className="text-xs text-muted-foreground mt-2">Açıklamaya telefon numaranı yaz. Onay 1 iş günü içinde.</div>
          </TabsContent>
        </Tabs>

        <button onClick={() => setDone(true)}
          className="w-full rounded-xl py-3 text-sm font-medium"
          style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>
          Aboneliği Başlat ✓
        </button>
      </div>

      <Dialog open={done} onOpenChange={(o) => !o && (setPremium(true), navigate({ to: "/farmer/home" }))}>
        <DialogContent className="text-center">
          <DialogHeader>
            <DialogTitle className="flex flex-col items-center gap-3">
              <div className="text-5xl">⭐</div>
              <div className="font-serif text-2xl">Premium aktif!</div>
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tüm özelliklere erişimin var. Hoş geldin!</p>
          <button onClick={() => { setPremium(true); navigate({ to: "/farmer/home" }); }}
            className="w-full rounded-xl py-2.5 text-sm font-medium"
            style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>Devam</button>
        </DialogContent>
      </Dialog>
    </>
  );
}
