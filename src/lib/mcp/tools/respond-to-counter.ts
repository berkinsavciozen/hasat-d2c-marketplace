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
    const limited = await enforceMcpRateLimit(sb);
    if (limited) return limited;

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

    // Kabul + sipariş + timeline tek transaction'da (ORD-1 K1). Sıra/stok/snapshot DB trigger'larında.
    const { data: res, error: aErr } = await (sb.rpc as any)("rpc_accept_offer", { p_offer_id: input.offer_id });
    if (aErr) return { content: [{ type: "text", text: aErr.message }], isError: true };
    if (!res?.ok) {
      const reason = String(res?.reason ?? "unknown");
      const text = reason === "wrong_offer_status"
        ? "Offer can no longer be accepted (it is not pending or countered)."
        : reason === "not_found" ? "Offer not found." : `Counter could not be accepted (${reason}).`;
      return { content: [{ type: "text", text }], isError: true };
    }
    const { data: accepted } = await sb.from("offers").select().eq("id", input.offer_id).maybeSingle();

    return {
      content: [{ type: "text", text: `Accepted counter on ${input.offer_id}; order ${res.orderId}.` }],
      structuredContent: { offer: accepted, orderId: res.orderId, alreadyAccepted: !!res.alreadyAccepted },
    };
  },
});
