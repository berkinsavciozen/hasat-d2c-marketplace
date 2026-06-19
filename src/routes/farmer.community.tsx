import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FarmerHeader } from "./farmer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Heart, MessageCircle, Plus, Search } from "lucide-react";
import { useCommunityPosts, useCreatePost } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { toast } from "sonner";

export const Route = createFileRoute("/farmer/community")({ component: Community });

const CATS = ["Tümü", "Safran", "Pazar", "Hava", "Hastalık", "Diğer"];

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "şimdi";
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat önce`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR");
}

function Community() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Tümü");
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});

  const { data: posts = [], isLoading } = useCommunityPosts(cat);
  const createPost = useCreatePost();

  const filtered = posts.filter((p) => {
    if (q === "") return true;
    const ql = q.toLowerCase();
    return p.content.toLowerCase().includes(ql) || (p.authorName ?? "").toLowerCase().includes(ql);
  });

  const toggleLike = (id: string) => setLikedIds((s) => ({ ...s, [id]: !s[id] }));

  const publish = async () => {
    if (!draft.trim()) return;
    try {
      await createPost.mutateAsync({ content: draft.trim(), category: cat === "Tümü" ? "Diğer" : cat });
      setDraft("");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Gönderilemedi");
    }
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

        {isLoading ? (
          <LoadingDots />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <div className="text-4xl mb-2">🌾</div>
            {posts.length === 0 ? "İlk gönderiyi sen paylaş." : "Sonuç bulunamadı"}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => {
              const liked = !!likedIds[p.id];
              const name = p.authorName ?? "Üretici";
              return (
                <div key={p.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold"
                      style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>{name[0]}</div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{name}</div>
                      <div className="text-[11px] text-muted-foreground">{p.authorCity ?? "—"} · {relTime(p.createdAt)}</div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--muted)" }}>{p.category}</span>
                  </div>
                  <p className="text-sm mb-3 whitespace-pre-wrap">{p.content}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <button onClick={() => toggleLike(p.id)} className="flex items-center gap-1">
                      <Heart className="h-4 w-4" fill={liked ? "var(--hred)" : "none"} color={liked ? "var(--hred)" : "currentColor"} />
                      {p.likesCount + (liked ? 1 : 0)}
                    </button>
                    <button className="flex items-center gap-1"><MessageCircle className="h-4 w-4" />{p.commentsCount}</button>
                  </div>
                </div>
              );
            })}
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
            <button onClick={publish} disabled={!draft.trim() || createPost.isPending}
              className="w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>
              {createPost.isPending ? "Paylaşılıyor…" : "Paylaş"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
