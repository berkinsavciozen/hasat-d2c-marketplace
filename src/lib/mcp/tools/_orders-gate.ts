import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ORD-GATE (vitrin modu): while platform_settings.orders_enabled is false the database rejects every
 * order-initiating write with message "ORDERS_DISABLED" (code P0001, hint "orders_disabled"). Tools map
 * that error to a fixed Turkish text instead of surfacing the raw code.
 */
export const ORDERS_DISABLED_TEXT =
  "Siparişler çok yakında. Hasat şu an kontrollü pilot vitrin modunda; teklif ve sipariş henüz açık değil.";

export function isOrdersDisabled(error: { message?: string } | null | undefined): boolean {
  return error?.message === "ORDERS_DISABLED";
}

export function ordersDisabledResult(): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  return { content: [{ type: "text", text: ORDERS_DISABLED_TEXT }], isError: true };
}

/** Best-effort order_intent_blocked event; never throws and never blocks the tool. */
export async function logOrderIntentBlocked(
  sb: SupabaseClient,
  listingId?: string | null,
): Promise<void> {
  try {
    await sb.rpc(
      "rpc_log_order_intent_blocked" as never,
      {
        p_surface: "mcp",
        p_platform: "web",
        p_listing_id: listingId ?? null,
      } as never,
    );
  } catch {
    // Olay kaydı aracı bozmamalı.
  }
}
