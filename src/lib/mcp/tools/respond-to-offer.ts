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

const ACCEPT_REASON_TEXT: Record<string, string> = {
  not_found: "Offer not found.",
  wrong_offer_status: "Offer can no longer be accepted (it is not pending or countered).",
};

export default defineTool({
  name: "respond_to_offer",
  title: "Respond to buyer's offer",
  description:
    "SENSITIVE — respond to a buyer's offer on your listing. action='accept' LOCKS the listing's stock via a DB trigger and creates an order; this cannot be reversed via this tool. action='decline' rejects it. action='counter' sends a counter-offer (çok partili tekliflerde counter_quantity kullanılamaz — yalnız fiyat karşı teklifi). Requires confirm=true.",
  inputSchema: {
    offer_id: z.string().uuid(),
    action: z.enum(["accept", "decline", "counter"]),
    counter_price: z.number().positive().optional().describe("Required when action='counter'."),
    counter_quantity: z.number().positive().optional(),
    confirm: z.literal(true).describe("Must be true — safety guard for irreversible actions."),
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

    if (input.action === "counter" && input.counter_price == null) {
      return {
        content: [{ type: "text", text: "counter_price is required when action='counter'." }],
        isError: true,
      };
    }

    if (input.action === "accept") {
      const { data: mine, error: rErr } = await sb
        .from("offers").select("id").eq("id", input.offer_id).eq("farmer_id", userId).maybeSingle();
      if (rErr) return { content: [{ type: "text", text: rErr.message }], isError: true };
      if (!mine) return { content: [{ type: "text", text: "Offer not found or not on your listing." }], isError: true };

      // Kabul + sipariş + timeline tek transaction'da (ORD-1 K1). Sıra/stok/snapshot DB trigger'larında.
      const { data: res, error } = await (sb.rpc as any)("rpc_accept_offer", { p_offer_id: input.offer_id });
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      if (!res?.ok) {
        const reason = String(res?.reason ?? "unknown");
        return { content: [{ type: "text", text: ACCEPT_REASON_TEXT[reason] ?? `Offer could not be accepted (${reason}).` }], isError: true };
      }
      const { data: offer } = await sb.from("offers").select().eq("id", input.offer_id).maybeSingle();
      const text = res.alreadyAccepted
        ? `Offer ${input.offer_id} was already accepted (order ${res.orderId}).`
        : `Accepted offer ${input.offer_id}; order ${res.orderId} created.`;
      return { content: [{ type: "text", text }], structuredContent: { offer, orderId: res.orderId, alreadyAccepted: !!res.alreadyAccepted } };
    }

    if (input.action === "decline") {
      const { data, error } = await sb.from("offers")
        .update({ status: "rejected" } as any)
        .eq("id", input.offer_id)
        .eq("farmer_id", userId)
        .select().single();
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return { content: [{ type: "text", text: `Declined offer ${data.id}` }], structuredContent: { offer: data } };
    }

    // counter
    const { data: current, error: rErr } = await sb
      .from("offers")
      .select("quantity, price_per_unit, delivery, delivery_date, note, negotiation_history")
      .eq("id", input.offer_id)
      .eq("farmer_id", userId)
      .single();
    if (rErr) return { content: [{ type: "text", text: rErr.message }], isError: true };

    if (input.counter_quantity != null && input.counter_quantity !== Number(current.quantity)) {
      const { count } = await sb
        .from("offer_items")
        .select("id", { count: "exact", head: true })
        .eq("offer_id", input.offer_id);
      if ((count ?? 0) >= 2) {
        return {
          content: [{ type: "text", text: "Çok partili tekliflerde yalnız fiyat karşı teklifi yapılabilir." }],
          isError: true,
        };
      }
    }

    const snapshot = {
      by: "farmer",
      at: new Date().toISOString(),
      quantity: Number(current.quantity),
      pricePerUnit: Number(current.price_per_unit),
      delivery: current.delivery ?? undefined,
      deliveryDate: current.delivery_date ?? undefined,
      note: current.note ?? undefined,
    };
    const prevHistory = Array.isArray((current as any).negotiation_history)
      ? (current as any).negotiation_history : [];
    const nextQty = input.counter_quantity ?? Number(current.quantity);

    const { data: updated, error: uErr } = await sb.from("offers").update({
      quantity: nextQty,
      price_per_unit: input.counter_price!,
      current_quantity: nextQty,
      current_price: input.counter_price!,
      ball_side: "buyer",
      status: "counter",
      negotiation_history: [...prevHistory, snapshot],
    } as any).eq("id", input.offer_id).select().single();
    if (uErr) return { content: [{ type: "text", text: uErr.message }], isError: true };

    await sb.from("offer_messages").insert({
      offer_id: input.offer_id,
      sender_role: "farmer",
      sender_id: userId,
      price: input.counter_price!,
      quantity: nextQty,
      note: null,
    });

    return { content: [{ type: "text", text: `Sent counter-offer on ${updated.id}` }], structuredContent: { offer: updated } };
  },
});
