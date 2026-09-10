/**
 * T6-UI / F11-UI — "Tariflerim": kullanıcının kendi tarif taslakları.
 * Hem AI ile özelleştirme hem birebir kopyalama bu listeye düşer.
 * Bu ekranda YAYINLAMA aksiyonu yoktur (kapsam dışı) — sadece görüntüle/düzenle/sil.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil, Trash2, Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuthUserId } from "@/lib/hasat/queries";
import { useMyRecipeDrafts, useDeleteMyRecipeDraft } from "@/lib/hasat/myRecipes";

const TITLE = "Tariflerim | Hasat";
const DESCRIPTION =
  "Hasat tariflerinden oluşturduğun kendi taslakların — AI ile özelleştirdiklerin ve kopyaladıkların.";

export const Route = createFileRoute("/tariflerim/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyRecipesPage,
});

function MyRecipesPage() {
  const userId = useAuthUserId();
  const { data: drafts = [], isLoading } = useMyRecipeDrafts();
  const del = useDeleteMyRecipeDraft();

  return (
    <div className="min-h-screen pb-16">
      <header
        className="border-b px-4 py-6 md:px-8 md:py-10"
        style={{ background: "var(--primary)", color: "var(--hwhite)" }}
      >
        <Link to="/tarifler" className="text-xs opacity-70 hover:opacity-100">
          ← Tarifler
        </Link>
        <h1 className="mt-2 font-serif text-2xl md:text-3xl">Tariflerim</h1>
        <p className="mt-1 text-sm opacity-80">
          Kendine göre uyarladığın ve kopyaladığın tarifler. Sadece sen görürsün.
        </p>
      </header>

      <div className="mx-auto max-w-2xl space-y-3 px-4 py-5 md:px-8">
        {!userId && (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-hmuted">
            Taslaklarını görmek için giriş yapman gerekiyor.
            <div className="mt-3">
              <Link to="/login">
                <Button size="sm">Giriş yap</Button>
              </Link>
            </div>
          </div>
        )}

        {userId && isLoading && <p className="text-sm text-hmuted">Yükleniyor…</p>}

        {userId && !isLoading && drafts.length === 0 && (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-hmuted">
            Henüz taslağın yok. Bir tarifi{" "}
            <span className="inline-flex items-center gap-1 font-medium">
              <Sparkles className="h-3.5 w-3.5" /> AI ile özelleştir
            </span>{" "}
            ya da{" "}
            <span className="inline-flex items-center gap-1 font-medium">
              <Copy className="h-3.5 w-3.5" /> kendine kopyala
            </span>
            .
            <div className="mt-3">
              <Link to="/tarifler">
                <Button size="sm" variant="outline">
                  Tariflere göz at
                </Button>
              </Link>
            </div>
          </div>
        )}

        {drafts.map((d) => (
          <div key={d.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-medium">{d.title}</h2>
                {d.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-hmuted">{d.description}</p>
                )}
                <p className="mt-1 text-[11px] text-hmuted">
                  {new Date(d.created_at).toLocaleDateString("tr-TR")} · Taslak
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Link to="/tariflerim/$recipeId" params={{ recipeId: d.id }}>
                  <Button variant="ghost" size="icon" aria-label="Düzenle">
                    <Pencil />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Sil"
                  disabled={del.isPending}
                  onClick={() => {
                    if (!confirm("Bu taslak silinsin mi?")) return;
                    del.mutate(d.id, {
                      onSuccess: () => toast.success("Taslak silindi"),
                      onError: () => toast.error("Taslak silinemedi"),
                    });
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
