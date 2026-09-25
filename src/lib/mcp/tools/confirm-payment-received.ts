import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { enforceMcpRateLimit } from "./_rate-limit";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "confirm_payment_received",
  title: "Confirm payment received",
  description:
    "SENSITIVE — as the farmer, confirm the buyer's bank transfer has arrived. Finalizes the order as paid. This cannot be reversed via this tool. Requires confirm=true.",
  inputSchema: {
    order_id: z.string().uuid(),
    confirm: z.literal(true).describe("Must be true — safety guard for irreversible action."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const userId = ctx.getUserId()!;
    const sb = supabaseForUser(ctx);
    const limited = await enforceMcpRateLimit(sb);
    if (limited) return limited;

    const { data: order, error: oErr } = await sb
      .from("orders").select("id, offer_id").eq("id", input.order_id).eq("farmer_id", userId).maybeSingle();
    if (oErr) return { content: [{ type: "text", text: oErr.message }], isError: true };
    if (!order) return { content: [{ type: "text", text: "Order not found or not owned by you." }], isError: true };

    // payment_status yalnız FIN-2 RPC'si ile değişir (doğrudan update OFFERS_PAYMENT_STATUS_CLIENT_WRITE_BLOCKED).
    const { data: res, error } = await (sb.rpc as any)("farmer_confirm_payment_received", { p_offer_id: order.offer_id });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!res?.ok) {
      const reason = String(res?.reason ?? "unknown");
      const text: Record<string, string> = {
        not_found: "Offer not found.",
        wrong_payment_status: "Offer is not awaiting transfer confirmation.",
      };
      return { content: [{ type: "text", text: text[reason] ?? `Could not confirm payment (${reason}).` }], isError: true };
    }

    const { data: offer } = await sb.from("offers").select().eq("id", order.offer_id).maybeSingle();

    return {
      content: [{ type: "text", text: `Confirmed payment for order ${order.id}` }],
      structuredContent: { offer, orderId: res.orderId ?? order.id },
    };
  },
});
