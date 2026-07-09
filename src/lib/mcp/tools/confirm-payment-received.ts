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

    const { data: order, error: oErr } = await sb
      .from("orders").select("id, offer_id").eq("id", input.order_id).eq("farmer_id", userId).maybeSingle();
    if (oErr) return { content: [{ type: "text", text: oErr.message }], isError: true };
    if (!order) return { content: [{ type: "text", text: "Order not found or not owned by you." }], isError: true };

    const { data, error } = await sb.from("offers")
      .update({ payment_status: "paid" } as any)
      .eq("id", order.offer_id)
      .eq("farmer_id", userId)
      .eq("payment_status", "pending_transfer")
      .select().maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Offer is not awaiting transfer confirmation." }], isError: true };

    return { content: [{ type: "text", text: `Confirmed payment for order ${order.id}` }], structuredContent: { offer: data } };
  },
});
