import { useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PUBLIC_BASE_URL } from "@/lib/hasat/constants";
import { buildPrivateRecipeShareUrl } from "@/lib/hasat/recipeShareSecurity";
import { RECIPE_SHARE_DURATIONS } from "@/lib/hasat/recipeShareExpiry";
import {
  deliverPrivateRecipeShareUrl,
  runPrivateRecipeShareAction,
  type PendingPrivateRecipeShareDelivery,
  type PrivateRecipeShareAttemptResult,
} from "@/lib/hasat/privateRecipeShareDelivery";
import {
  expiryFromNow,
  useCreateRecipeShareGrant,
  useRecipeShareGrants,
  useRevokeRecipeShareGrant,
  useRotateRecipeShareGrant,
} from "@/lib/hasat/recipeShare";

export function PrivateRecipeSharePanel({ recipeId }: { recipeId: string }) {
  const [duration, setDuration] = useState(RECIPE_SHARE_DURATIONS[3].value);
  const grants = useRecipeShareGrants(recipeId);
  const create = useCreateRecipeShareGrant(recipeId);
  const rotate = useRotateRecipeShareGrant(recipeId);
  const revoke = useRevokeRecipeShareGrant(recipeId);
  const actionPendingRef = useRef(false);
  const activeRecipeIdRef = useRef(recipeId);
  const pendingDeliveryRef = useRef<PendingPrivateRecipeShareDelivery>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    activeRecipeIdRef.current = recipeId;
    pendingDeliveryRef.current = null;
  }, [recipeId]);

  const shareOnce = async (token: string): Promise<PrivateRecipeShareAttemptResult> => {
    try {
      const url = buildPrivateRecipeShareUrl(PUBLIC_BASE_URL, token);
      const result = await deliverPrivateRecipeShareUrl(url, navigator);
      if (result === "copied") toast.success("Güvenli link kopyalandı");
      return result;
    } catch {
      toast.error("Link paylaşılamadı");
      return "failed";
    }
  };

  const runGrantAction = async (
    actionKey: string,
    grantAction: () => Promise<{ token: string }>,
    errorMessage: string,
  ) => {
    if (actionPendingRef.current) return;
    actionPendingRef.current = true;
    setActionPending(true);
    try {
      const attempt = await runPrivateRecipeShareAction({
        actionKey,
        pendingDelivery: pendingDeliveryRef.current,
        grantAction,
        deliverToken: shareOnce,
      });
      if (activeRecipeIdRef.current === recipeId) {
        pendingDeliveryRef.current = attempt.pendingDelivery;
      }
    } catch {
      toast.error(errorMessage);
    } finally {
      actionPendingRef.current = false;
      setActionPending(false);
    }
  };

  const createLink = () =>
    void runGrantAction(
      `create:${recipeId}`,
      () => create.mutateAsync(expiryFromNow(duration)),
      "Link oluşturulamadı. Tekrar deneyebilirsin.",
    );
  const rotateLink = (grantId: string) =>
    void runGrantAction(
      `rotate:${grantId}`,
      () => rotate.mutateAsync({ grantId, expiresAt: expiryFromNow(duration) }),
      "Link yenilenemedi. Tekrar deneyebilirsin.",
    );
  const revokeLink = (grantId: string) =>
    !actionPendingRef.current &&
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
            {RECIPE_SHARE_DURATIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" onClick={createLink} disabled={actionPending}>
            <Share2 /> {actionPending ? "Oluşturuluyor…" : "Paylaş"}
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
                  disabled={actionPending}
                >
                  Yenile
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeLink(grant.grant_id)}
                  disabled={actionPending || revoke.isPending}
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
