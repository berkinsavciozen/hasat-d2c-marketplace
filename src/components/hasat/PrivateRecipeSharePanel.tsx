import { useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PUBLIC_BASE_URL } from "@/lib/hasat/constants";
import { buildPrivateRecipeShareUrl } from "@/lib/hasat/recipeShareSecurity";
import {
  expiryFromNow,
  useCreateRecipeShareGrant,
  useRecipeShareGrants,
  useRevokeRecipeShareGrant,
  useRotateRecipeShareGrant,
} from "@/lib/hasat/recipeShare";

const DURATIONS = [
  { label: "5 dakika", value: 5 * 60_000 },
  { label: "1 saat", value: 60 * 60_000 },
  { label: "1 gün", value: 24 * 60 * 60_000 },
  { label: "7 gün", value: 7 * 24 * 60 * 60_000 },
  { label: "30 gün", value: 30 * 24 * 60 * 60_000 },
];

export function PrivateRecipeSharePanel({ recipeId }: { recipeId: string }) {
  const [duration, setDuration] = useState(DURATIONS[3].value);
  const grants = useRecipeShareGrants(recipeId);
  const create = useCreateRecipeShareGrant(recipeId);
  const rotate = useRotateRecipeShareGrant(recipeId);
  const revoke = useRevokeRecipeShareGrant(recipeId);

  const shareOnce = async (token: string) => {
    const url = buildPrivateRecipeShareUrl(PUBLIC_BASE_URL, token);
    try {
      if (navigator.share) await navigator.share({ title: "Özel tarifim", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Güvenli link kopyalandı");
      }
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") toast.error("Link paylaşılamadı");
    }
  };

  const createLink = () =>
    create.mutate(expiryFromNow(duration), {
      onSuccess: ({ token }) => void shareOnce(token),
      onError: () => toast.error("Link oluşturulamadı. Tekrar deneyebilirsin."),
    });
  const rotateLink = (grantId: string) =>
    rotate.mutate(
      { grantId, expiresAt: expiryFromNow(duration) },
      {
        onSuccess: ({ token }) => void shareOnce(token),
        onError: () => toast.error("Link yenilenemedi. Tekrar deneyebilirsin."),
      },
    );
  const revokeLink = (grantId: string) =>
    revoke.mutate(grantId, {
      onSuccess: () => toast.success("Link kapatıldı"),
      onError: () => toast.error("Link kapatılamadı. Tekrar deneyebilirsin."),
    });

  const active = (grants.data ?? []).filter((grant) => grant.status === "active");
  return (
    <section className="rounded-xl border bg-card p-4" aria-labelledby="private-share-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="private-share-title" className="text-sm font-semibold">
            Özel olarak paylaş
          </h2>
          <p className="mt-1 max-w-lg text-xs text-hmuted">
            Linki alan kişi giriş yaparak önizleyebilir ve özel taslak kopyasını Defterim’e
            ekleyebilir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-hmuted" htmlFor="share-duration">
            Süre
          </label>
          <select
            id="share-duration"
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            className="min-h-10 rounded-lg border bg-background px-2 text-sm"
          >
            {DURATIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" onClick={createLink} disabled={create.isPending}>
            <Share2 /> {create.isPending ? "Oluşturuluyor…" : "Paylaş"}
          </Button>
        </div>
      </div>
      {active.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Aktif paylaşım linkleri">
          {active.map((grant) => (
            <li
              key={grant.grant_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
            >
              <span>{new Date(grant.expires_at).toLocaleString("tr-TR")} tarihine kadar açık</span>
              <span className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => rotateLink(grant.grant_id)}
                  disabled={rotate.isPending}
                >
                  Yenile
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeLink(grant.grant_id)}
                  disabled={revoke.isPending}
                >
                  Kapat
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
