import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { createElement } from "react";
import { supabase } from "@/integrations/supabase/client";

/** ORD-GATE (vitrin modu) — sipariş başlatan işlemler sunucuda kapalı olabilir. */
export const ORDERS_SOON_TEXT = "Siparişler çok yakında";
export const ORDERS_SOON_SUBTEXT =
  "Hasat şu an kontrollü pilot aşamasında. Ürünleri inceleyebilir ve 'Talep Et' ile ilgini bildirebilirsin.";

export type OrderIntentSurface =
  | "storefront"
  | "discover"
  | "producer"
  | "recipe_product"
  | "offer_route"
  | "subscription"
  | "negotiation"
  | "farmer_offers"
  | "payment";

export function isOrdersDisabledError(err: unknown): boolean {
  return (err as { message?: string } | null)?.message === "ORDERS_DISABLED";
}

function useSessionUserId(): string | null {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => alive && setUid(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUid(s?.user.id ?? null));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return uid;
}

/** Fail-closed: yüklenirken ya da hata olursa callerAllowed=false. */
export function useOrderGate(): { ordersEnabled: boolean; callerAllowed: boolean; isLoading: boolean } {
  const uid = useSessionUserId();
  const q = useQuery({
    queryKey: ["order-gate", uid],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("rpc_get_order_gate");
      if (error) throw error;
      const d = (data ?? {}) as { ordersEnabled?: boolean; callerAllowed?: boolean };
      return { ordersEnabled: d.ordersEnabled === true, callerAllowed: d.callerAllowed === true };
    },
  });
  return {
    ordersEnabled: q.data?.ordersEnabled ?? false,
    callerAllowed: q.isSuccess ? q.data.callerAllowed : false,
    isLoading: q.isLoading,
  };
}

/** Best-effort olay kaydı; hata yutulur. */
export async function logOrderIntentBlocked(args: {
  surface: OrderIntentSurface;
  listingId?: string | null;
  recipeId?: string | null;
  crop?: string | null;
}): Promise<void> {
  try {
    await (supabase.rpc as any)("rpc_log_order_intent_blocked", {
      p_surface: args.surface,
      p_platform: "web",
      p_listing_id: args.listingId ?? null,
      p_recipe_id: args.recipeId ?? null,
      p_crop: args.crop ?? null,
    });
  } catch {
    // yut
  }
}

/** Kutu gösterildiğinde sayfa gösterimi başına bir kez loglar. */
export function useLogOrderIntentOnce(
  active: boolean,
  args: Parameters<typeof logOrderIntentBlocked>[0],
) {
  const done = useRef(false);
  useEffect(() => {
    if (!active || done.current) return;
    done.current = true;
    void logOrderIntentBlocked(args);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

/** Pasif "Siparişler çok yakında" kutusu (buton yok). */
export function OrdersSoonBox({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return createElement(
    "div",
    {
      role: "status",
      className: `rounded-xl border border-primary/20 bg-primary/5 ${compact ? "p-2.5" : "p-4"} text-primary ${className}`,
    },
    createElement(
      "div",
      { className: "flex items-center gap-2 text-sm font-semibold" },
      createElement(Clock, { className: "h-4 w-4 shrink-0" }),
      ORDERS_SOON_TEXT,
    ),
    compact ? null : createElement("p", { className: "mt-1 text-xs text-hmuted" }, ORDERS_SOON_SUBTEXT),
  );
}
