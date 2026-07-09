import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function idempotentCreateOrder(sb: ReturnType<typeof supabaseForUser>, offerRow: any) {
  const { data: existing } = await sb
    .from("orders").select("id").eq("offer_id", offerRow.id).maybeSingle();
  if (existing) return;
  const { data: order, error } = await sb.from("orders").insert({
    offer_id: offerRow.id,
    buyer_id: offerRow.buyer_id,
    farmer_id: offerRow.farmer_id,
    status: "preparing",
    order_ref: "",
  } as any).select("id").single();
  if (error) throw error;
  await sb.from("order_timeline").insert({
    order_id: order.id,
    step: "submitted",
    label: "Sipariş Alındı",
    completed_at: new Date().toISOString(),
  });
}

export default defineTool({
  name: "respond_to_offer",
  title: "Respond to buyer's offer",
  description:
    "SENSITIVE — respond to a buyer's offer on your listing. action='accept' LOCKS the listing's stock via a DB trigger and creates an order; this cannot be reversed via this tool. action='decline' rejects it. action='counter' sends a counter-offer. Requires confirm=true.",
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

    if (input.action === "counter" && input.counter_price == null) {
      return {
        content: [{ type: "text", text: "counter_price is required when action='counter'." }],
        isError: true,
      };
    }

    if (input.action === "accept") {
      const { data, error } = await sb.from("offers")
        .update({ status: "accepted", ball_side: "buyer", payment_status: "unpaid" } as any)
        .eq("id", input.offer_id)
        .eq("farmer_id", userId)
        .select().single();
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      try {
        await idempotentCreateOrder(sb, data);
      } catch (e: any) {
        return { content: [{ type: "text", text: `Accepted but order creation failed: ${e.message}` }], isError: true };
      }
      return { content: [{ type: "text", text: `Accepted offer ${data.id}` }], structuredContent: { offer: data } };
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
