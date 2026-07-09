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
  name: "list_offers_on_my_listings",
  title: "List offers on my listings",
  description:
    "List all offers on the signed-in farmer's listings, in any status. RLS scopes results to your listings.",
  inputSchema: {
    status: z
      .enum(["accepted", "pending", "counter", "rejected", "completed", "any"])
      .default("any"),
    limit: z.number().int().min(1).max(100).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("offers")
      .select(
        "id, listing_id, buyer_id, status, ball_side, quantity, price_per_unit, current_quantity, current_price, payment_status, created_at",
      )
      .eq("farmer_id", ctx.getUserId()!)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status !== "any") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { offers: data ?? [] },
    };
  },
});
