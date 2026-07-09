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
  name: "respond_to_counter",
  title: "Respond to farmer's counter-offer",
  description:
    "SENSITIVE — respond to the farmer's counter-offer as the buyer. action='accept' LOCKS the listing's stock and creates an order; this cannot be reversed via this tool. action='decline' rejects it. Requires confirm=true.",
  inputSchema: {
    offer_id: z.string().uuid(),
    action: z.enum(["accept", "decline"]),
    confirm: z.literal(true).describe("Must be true — safety guard for irreversible action."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const userId = ctx.getUserId()!;
    const sb = supabaseForUser(ctx);

    const { data: offer, error: rErr } = await sb
      .from("offers")
      .select("id, buyer_id, farmer_id, status, ball_side")
      .eq("id", input.offer_id)
      .eq("buyer_id", userId)
      .maybeSingle();
    if (rErr) return { content: [{ type: "text", text: rErr.message }], isError: true };
    if (!offer) return { content: [{ type: "text", text: "Offer not found or not yours." }], isError: true };
    if (offer.status !== "counter") {
      return { content: [{ type: "text", text: "Offer is not in a counter state." }], isError: true };
    }

    if (input.action === "decline") {
      const { data, error } = await sb.from("offers")
        .update({ status: "rejected" } as any)
        .eq("id", input.offer_id).select().single();
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return { content: [{ type: "text", text: `Declined counter on ${data.id}` }], structuredContent: { offer: data } };
    }

    const { data: accepted, error: aErr } = await sb.from("offers")
      .update({ status: "accepted", ball_side: "buyer", payment_status: "unpaid" } as any)
      .eq("id", input.offer_id).select().single();
    if (aErr) return { content: [{ type: "text", text: aErr.message }], isError: true };

    const { data: existing } = await sb
      .from("orders").select("id").eq("offer_id", accepted.id).maybeSingle();
    if (!existing) {
      const { data: order, error: oErr } = await sb.from("orders").insert({
        offer_id: accepted.id,
        buyer_id: accepted.buyer_id,
        farmer_id: accepted.farmer_id,
        status: "preparing",
        order_ref: "",
      } as any).select("id").single();
      if (oErr) return { content: [{ type: "text", text: `Accepted but order creation failed: ${oErr.message}` }], isError: true };
      await sb.from("order_timeline").insert({
        order_id: order.id,
        step: "submitted",
        label: "Sipariş Alındı",
        completed_at: new Date().toISOString(),
      });
    }

    return { content: [{ type: "text", text: `Accepted counter on ${accepted.id}` }], structuredContent: { offer: accepted } };
  },
});
