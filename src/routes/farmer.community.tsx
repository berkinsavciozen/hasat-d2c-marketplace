import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FarmerHeader } from "./farmer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Heart, MessageCircle, Plus, Search } from "lucide-react";

export const Route = createFileRoute("/farmer/community")({ component: Community });

const CATS = ["Tümü", "Safran", "Pazar", "Hava", "Hastalık", "Diğer"];

type Post = { id: string; name: string; city: string; time: string; body: string; likes: number; comments: number; cat: string; liked?: boolean };

const SEED: Post[] = [
  { id: "1", name: "Ali Demir", city: "Safranbolu", time: "2 saat önce", cat: "Safran", body: "Bu yıl safran verimi geçen yıla göre %20 arttı. Sulama programını paylaşabilirim isteyenlere.", likes: 24, comments: 8 },
  { id: "2", name: "Fatma Kaya", city: "Isparta", time: "5 saat önce", cat: "Pazar", body: "İstanbul'daki restoranlardan teklif alanlar nasıl iletişim kuruyor? Önerilerinizi bekliyorum.", likes: 12, comments: 15 },
  { id: "3", name: "Hasan Yıldız", city: "Tokat", time: "1 gün önce", cat: "Hava", body: "Önümüzdeki hafta don bekleniyor. Lavanta tarlaları için ne öneriyorsunuz?", likes: 18, comments: 6 },
  { id: "4", name: "Zeynep Acar", city: "Kastamonu", time: "2 gün önce", cat: "Hastalık", body: "Fındık yapraklarında sararma var. Daha önce yaşayan oldu mu?", likes: 9, comments: 11 },
  { id: "5", name: "Mehmet Öz", city: "Safranbolu", time: "3 gün önce", cat: "Safran", body: "ISO 3632 sertifikası alma süreci yaklaşık 3 ay sürdü. Belge listesini DM atabilirim.", likes: 31, comments: 4 },
];

function Community() {
  const [posts, setPosts] = useState<Post[]>(SEED);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Tümü");
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = posts.filter((p) =>
    (cat === "Tümü" || p.cat === cat) && (q === "" || p.body.toLowerCase().includes(q.toLowerCase()) || p.name.toLowerCase().includes(q.toLowerCase()))
  );

  const toggleLike = (id: string) =>
    setPosts((ps) => ps.map((p) => p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p));

  const publish = () => {
    if (!draft.trim()) return;
    setPosts((ps) => [{ id: Math.random().toString(36).slice(2), name: "Mehmet Yılmaz", city: "Karabük", time: "şimdi", body: draft, likes: 0, comments: 0, cat: "Diğer" }, ...ps]);
    setDraft(""); setOpen(false);
  };

  return (
    <>
      <FarmerHeader title="Topluluk" subtitle="Üreticilerle bilgi paylaş" />
      <div className="p-4 md:p-8 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gönderilerde ara..." className="pl-9" />
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {CATS.map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className="rounded-full px-3 py-1.5 text-xs whitespace-nowrap border transition"
              style={{
                background: cat === c ? "var(--saffron)" : "transparent",
                color: cat === c ? "var(--hwhite)" : "inherit",
                borderColor: cat === c ? "var(--saffron)" : "var(--border)",
              }}>{c}</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <div className="text-4xl mb-2">🔍</div>Sonuç bulunamadı
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold"
                    style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>{p.name[0]}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">{p.city} · {p.time}</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--muted)" }}>{p.cat}</span>
                </div>
                <p className="text-sm mb-3">{p.body}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <button onClick={() => toggleLike(p.id)} className="flex items-center gap-1">
                    <Heart className="h-4 w-4" fill={p.liked ? "var(--hred)" : "none"} color={p.liked ? "var(--hred)" : "currentColor"} />
                    {p.likes}
                  </button>
                  <button className="flex items-center gap-1"><MessageCircle className="h-4 w-4" />{p.comments}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="fixed bottom-24 md:bottom-6 right-4 z-30 grid h-14 w-14 place-items-center rounded-full shadow-lg"
            style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>
            <Plus className="h-6 w-6" />
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Yeni Gönderi</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} placeholder="Topluluğa ne söylemek istersin?" />
            <button onClick={publish} disabled={!draft.trim()}
              className="w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>Paylaş</button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
