/**
 * T6-UI / F11-UI — taslak düzenleme ekranı. Hem "AI ile özelleştir" hem
 * "Kendime kopyala" akışının varış noktası. Yayınlama aksiyonu yoktur.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecipeDraftEditor } from "@/components/hasat/RecipeDraftEditor";
import { useAuthUserId } from "@/lib/hasat/queries";
import { PUBLIC_BASE_URL } from "@/lib/hasat/constants";
import {
  draftValidationErrors,
  useMyRecipeDraft,
  useUpdateMyRecipeDraft,
  type RecipeDraft,
} from "@/lib/hasat/myRecipes";
import { useGenerateRecipeShareLink, useRevokeRecipeShareLink } from "@/lib/hasat/recipeShare";

export const Route = createFileRoute("/tariflerim/$recipeId")({
  head: () => ({
    meta: [
      { title: "Taslağı düzenle | Hasat" },
      { name: "description", content: "Kendi tarif taslağını düzenle." },
      { property: "og:title", content: "Taslağı düzenle | Hasat" },
      { property: "og:description", content: "Kendi tarif taslağını düzenle." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditDraftPage,
});

function EditDraftPage() {
  const { recipeId } = Route.useParams();
  const navigate = useNavigate();
  const userId = useAuthUserId();
  const { data, isLoading } = useMyRecipeDraft(recipeId);
  const update = useUpdateMyRecipeDraft(recipeId);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);

  useEffect(() => {
    if (!data) return;
    setDraft({
      title: data.title,
      description: data.description,
      servings: data.servings,
      prepMinutes: data.prepMinutes,
      cookMinutes: data.cookMinutes,
      restMinutes: data.restMinutes,
      difficulty: data.difficulty,
      ingredients: data.ingredients,
      steps: data.steps,
    });
  }, [data]);

  const handleSave = () => {
    if (!draft) return;
    const errors = draftValidationErrors(draft);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    update.mutate(draft, {
      onSuccess: () => {
        toast.success("Taslak kaydedildi");
        navigate({ to: "/tariflerim" });
      },
      onError: () => toast.error("Taslak kaydedilemedi"),
    });
  };

  return (
    <div className="min-h-screen pb-24">
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-5 md:px-8">
        <Link to="/tariflerim" className="text-xs text-hmuted hover:underline">
          ← Tariflerim
        </Link>

        {!userId && <p className="text-sm text-hmuted">Bu sayfa için giriş yapman gerekiyor.</p>}
        {userId && isLoading && <p className="text-sm text-hmuted">Yükleniyor…</p>}
        {userId && !isLoading && !data && (
          <p className="text-sm text-hmuted">Bu taslak bulunamadı.</p>
        )}

        {data && draft && (
          <>
            <div>
              <h1 className="font-serif text-2xl">Taslağı düzenle</h1>
              {data.clonedFromSlug && (
                <p className="mt-1 text-xs text-hmuted">
                  Kaynak:{" "}
                  <Link
                    to="/tarifler/$slug"
                    params={{ slug: data.clonedFromSlug }}
                    className="underline"
                  >
                    {data.clonedFromTitle ?? data.clonedFromSlug}
                  </Link>
                </p>
              )}
            </div>

            <ShareSection recipeId={recipeId} shareToken={data.shareToken} />

            <RecipeDraftEditor draft={draft} onChange={setDraft} />

            <div className="sticky bottom-0 -mx-4 border-t bg-background px-4 py-3 md:mx-0 md:px-0">
              <Button className="w-full" onClick={handleSave} disabled={update.isPending}>
                {update.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Sahip — özel tarifi bir link ile paylaş / paylaşımı durdur (F18). */
function ShareSection({ recipeId, shareToken }: { recipeId: string; shareToken: string | null }) {
  const generate = useGenerateRecipeShareLink();
  const revoke = useRevokeRecipeShareLink();

  const shareLink = (token: string) => `${PUBLIC_BASE_URL}/tarif-paylasim/${token}`;

  const handleShare = (token: string) => {
    const url = shareLink(token);
    const share = async () => {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        try {
          await (navigator as any).share({ title: "Tarifim", url });
          return;
        } catch {
          // Kullanıcı share sheet'i iptal etti — sessizce yut.
          return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Tarif linki kopyalandı");
      } catch {
        toast.error("Kopyalanamadı");
      }
    };
    share();
  };

  const handleShareClick = () => {
    if (shareToken) {
      handleShare(shareToken);
      return;
    }
    generate.mutate(recipeId, {
      onSuccess: (token) => handleShare(token),
      onError: () => toast.error("Paylaşım linki oluşturulamadı"),
    });
  };

  const handleRevoke = () => {
    revoke.mutate(recipeId, {
      onSuccess: () => toast.success("Paylaşım durduruldu"),
      onError: () => toast.error("Paylaşım durdurulamadı"),
    });
  };

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Bu tarifi paylaş</div>
          <p className="mt-0.5 text-xs text-hmuted">
            {shareToken
              ? "Bu link ile paylaşılıyor — link elindeki herkes tarifi görüp defterine kaydedebilir."
              : "Bir link üret, sadece linki bilenler görebilsin."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={generate.isPending}
            onClick={handleShareClick}
          >
            <Share2 /> {generate.isPending ? "Hazırlanıyor…" : "Paylaş"}
          </Button>
          {shareToken && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={revoke.isPending}
              onClick={handleRevoke}
            >
              Paylaşımı durdur
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
