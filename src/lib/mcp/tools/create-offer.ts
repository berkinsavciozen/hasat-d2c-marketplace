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
  name: "create_offer",
  title: "Create offer",
  description: "Submit a new offer on an active listing as the signed-in buyer.",
  inputSchema: {
    listing_id: z.string().uuid(),
    quantity: z.number().positive(),
    offered_price: z.number().positive().describe("Per-unit price offered."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const userId = ctx.getUserId()!;
    const sb = supabaseForUser(ctx);
    const limited = await enforceMcpRateLimit(sb);
    if (limited) return limited;

    const { data: listing, error: lErr } = await sb
      .from("listings").select("id, farmer_id, status")
      .eq("id", input.listing_id).maybeSingle();
    if (lErr) return { content: [{ type: "text", text: lErr.message }], isError: true };
    if (!listing) return { content: [{ type: "text", text: "Listing not found." }], isError: true };
    if (listing.status !== "active") {
      return { content: [{ type: "text", text: "Listing is not active." }], isError: true };
    }

    const { data, error } = await sb.from("offers").insert({
      buyer_id: userId,
      farmer_id: listing.farmer_id,
      listing_id: listing.id,
      quantity: input.quantity,
      price_per_unit: input.offered_price,
      current_quantity: input.quantity,
      current_price: input.offered_price,
      ball_side: "farmer",
      payment_status: "unpaid",
      status: "pending",
    } as any).select().single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created offer ${data.id}` }],
      structuredContent: { offer: data },
    };
  },
});
