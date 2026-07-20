import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Heart, MessageCircle, Plus, Search } from "lucide-react";
import {
  useCommunityPosts,
  useCommunityReplies,
  useCreatePost,
  useCreateReply,
  useAuthUserId,
  useLikedPostIds,
  useToggleLike,
  type CommunityPostRow,
} from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { slugifyFarmer } from "@/lib/hasat/vitrin";
import { toast } from "sonner";

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

function AuthorName({ post, className }: { post: Pick<CommunityPostRow, "authorId" | "authorName" | "authorRole">; className?: string }) {
  const name = post.authorName ?? "Üretici";
  if (post.authorRole === "farmer") {
    const slug = post.authorName ? slugifyFarmer(post.authorName) || post.authorId : post.authorId;
    return (
      <Link to="/s/$slug" params={{ slug }} className={`hover:underline ${className ?? ""}`}>
        {name}
      </Link>
    );
  }
  return <span className={className}>{name}</span>;
}

function maskIfFlagged(post: CommunityPostRow, viewerId: string | null): string {
  if (post.flaggedForReview && post.authorId !== viewerId) return "Bu gönderi incelemede.";
  return post.content;
}

function ReplyThread({ post }: { post: CommunityPostRow }) {
  const { data: replies = [], isLoading } = useCommunityReplies(post.id);
  const [draft, setDraft] = useState("");
  const createReply = useCreateReply();
  const viewerId = useAuthUserId();

  const submit = async () => {
    if (!draft.trim()) return;
    try {
      await createReply.mutateAsync({ postId: post.id, content: draft.trim(), parentAuthorId: post.authorId });
      setDraft("");
    } catch (e: any) {
      toast.error(e?.message ?? "Yanıtlanamadı");
    }
  };

  return (
    <div className="mt-3 border-t pt-3 space-y-3">
      {isLoading ? (
        <div className="text-xs text-hmuted">Yükleniyor…</div>
      ) : replies.length === 0 ? (
        <div className="text-xs text-hmuted italic">Henüz yorum yok</div>
      ) : (
        <ul className="space-y-2">
          {replies.map((r) => {
            const rname = r.authorName ?? "Üretici";
            return (
              <li key={r.id} className="flex gap-2 text-xs">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                  style={{ background: "var(--muted)" }}>{rname[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <AuthorName post={r} className="font-medium" />
                    <span className="text-[10px] text-hmuted">{relTime(r.createdAt)}</span>
                  </div>
                  <div className={`whitespace-pre-wrap break-words ${r.flaggedForReview && r.authorId !== viewerId ? "italic text-hmuted" : ""}`}>{maskIfFlagged(r, viewerId)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
          placeholder="Yanıt yaz…"
          className="text-xs h-9"
        />
        <button
          onClick={submit}
          disabled={!draft.trim() || createReply.isPending}
          className="rounded-lg px-3 text-xs font-medium disabled:opacity-40"
          style={{ background: "var(--saffron)", color: "var(--hwhite)" }}
        >
          {createReply.isPending ? "…" : "Yanıtla"}
        </button>
      </div>
    </div>
  );
}

export interface CommunityFeedProps {
  categories: string[];
  /** Fallback category used when composing from the "Tümü" tab. */
  defaultCategory?: string;
}

export function CommunityFeed({ categories, defaultCategory = "Genel" }: CommunityFeedProps) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(categories[0] ?? "Tümü");
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: posts = [], isLoading } = useCommunityPosts(cat);
  const { data: likedIds = new Set<string>() } = useLikedPostIds();
  const createPost = useCreatePost();
  const toggleLike = useToggleLike();
  const viewerId = useAuthUserId();

  const filtered = posts.filter((p) => {
    if (q === "") return true;
    const ql = q.toLowerCase();
    return p.content.toLowerCase().includes(ql) || (p.authorName ?? "").toLowerCase().includes(ql);
  });

  const publish = async () => {
    if (!draft.trim()) return;
    try {
      await createPost.mutateAsync({ content: draft.trim(), category: cat === "Tümü" ? defaultCategory : cat });
      setDraft("");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Gönderilemedi");
    }
  };

  return (
    <>
      <div className="p-4 md:p-8 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gönderilerde ara..." className="pl-9" />
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {categories.map((c) => (
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
          <div className="rounded-2xl border border-dashed p-10 text-center text-hmuted">
            <div className="text-4xl mb-2">🌾</div>
            {posts.length === 0 ? "Henüz gönderi yok. İlk gönderiyi sen paylaş!" : "Sonuç bulunamadı"}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => {
              const liked = likedIds.has(p.id);
              const name = p.authorName ?? "Üretici";
              const expanded = expandedId === p.id;
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-border bg-card p-4 cursor-pointer"
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold"
                      style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>{name[0]}</div>
                    <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                      <div className="text-sm font-medium"><AuthorName post={p} /></div>
                      <div className="text-[11px] text-muted-foreground">{p.authorCity ?? "—"} · {relTime(p.createdAt)}</div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--muted)" }}>{p.category}</span>
                  </div>
                  <p className={`text-sm mb-3 whitespace-pre-wrap ${p.flaggedForReview && p.authorId !== viewerId ? "italic text-hmuted" : ""}`}>{maskIfFlagged(p, viewerId)}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!viewerId || toggleLike.isPending) return;
                        toggleLike.mutate({ postId: p.id, liked });
                      }}
                      disabled={!viewerId || toggleLike.isPending}
                      className="flex items-center gap-1 disabled:opacity-40"
                    >
                      <Heart className="h-4 w-4" fill={liked ? "var(--hred)" : "none"} color={liked ? "var(--hred)" : "currentColor"} />
                      {p.likesCount}
                    </button>
                    <span className="flex items-center gap-1"><MessageCircle className="h-4 w-4" />{p.replyCount} yorum</span>
                  </div>
                  {expanded && <ReplyThread post={p} />}
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
