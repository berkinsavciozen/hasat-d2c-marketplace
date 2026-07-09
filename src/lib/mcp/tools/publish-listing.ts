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
  name: "publish_listing",
  title: "Publish listing",
  description:
    "Publish a draft listing: set status=active with the given quantity and unit price. Only the listing's owner can publish (enforced by RLS).",
  inputSchema: {
    listing_id: z.string().uuid(),
    quantity: z.number().positive(),
    price_per_unit: z.number().positive(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("listings")
      .update({
        status: "active",
        quantity: input.quantity,
        price_per_unit: input.price_per_unit,
      })
      .eq("id", input.listing_id)
      .eq("farmer_id", ctx.getUserId()!)
      .select()
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) {
      return {
        content: [{ type: "text", text: "Listing not found or not owned by you." }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: `Published listing ${data.id}` }],
      structuredContent: { listing: data },
    };
  },
});
