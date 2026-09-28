/** ORD-GATE saf mantık — React/Supabase bağımlılığı yok, test edilebilir. */
export const ORDERS_SOON_TEXT = "Siparişler çok yakında";
export const ORDERS_SOON_SUBTEXT =
  "Hasat şu an kontrollü pilot aşamasında. Ürünleri inceleyebilir ve 'Talep Et' ile ilgini bildirebilirsin.";

/** Backend'in (rpc_log_order_intent_blocked) kabul ettiği dondurulmuş web surface değerleri. */
export const ORDER_INTENT_SURFACES = [
  "storefront",
  "discover",
  "producer",
  "recipe_product",
  "offer_route",
  "subscription",
] as const;
export type OrderIntentSurface = (typeof ORDER_INTENT_SURFACES)[number];

export function isOrdersDisabledError(err: unknown): boolean {
  return (err as { message?: string } | null)?.message === "ORDERS_DISABLED";
}

/** rpc_get_order_gate yanıtını yorumlar. Başarılı değilse ya da alan eksikse fail-closed (false). */
export function resolveOrderGate(state: {
  isSuccess: boolean;
  data?: unknown;
}): { ordersEnabled: boolean; callerAllowed: boolean } {
  if (!state.isSuccess || !state.data || typeof state.data !== "object") {
    return { ordersEnabled: false, callerAllowed: false };
  }
  const d = state.data as { ordersEnabled?: unknown; callerAllowed?: unknown };
  return { ordersEnabled: d.ordersEnabled === true, callerAllowed: d.callerAllowed === true };
}
