import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "mark_transfer_sent",
  title: "Mark bank transfer sent",
  description:
    "SENSITIVE — as the buyer, signal to the farmer that you have sent the IBAN bank transfer for an accepted offer. This is a simulated payment bridge (no real payment gateway is connected yet). Requires confirm=true.",
  inputSchema: {
    order_id: z.string().uuid(),
    confirm: z.literal(true).describe("Must be true — safety guard."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const userId = ctx.getUserId()!;
    const sb = supabaseForUser(ctx);

    const { data: order, error: oErr } = await sb
      .from("orders").select("id, offer_id").eq("id", input.order_id).eq("buyer_id", userId).maybeSingle();
    if (oErr) return { content: [{ type: "text", text: oErr.message }], isError: true };
    if (!order) return { content: [{ type: "text", text: "Order not found or not yours." }], isError: true };

    const { data, error } = await sb.from("offers")
      .update({ payment_status: "pending_transfer" } as any)
      .eq("id", order.offer_id)
      .eq("buyer_id", userId)
      .eq("status", "accepted")
      .select().maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Offer is not in an accepted state." }], isError: true };

    return { content: [{ type: "text", text: `Marked transfer sent for order ${order.id}` }], structuredContent: { offer: data } };
  },
});
