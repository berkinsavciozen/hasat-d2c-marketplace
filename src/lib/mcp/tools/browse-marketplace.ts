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
  name: "browse_marketplace",
  title: "Browse marketplace",
  description:
    "Browse public active listings on the marketplace. Optionally filter by crop or seller city.",
  inputSchema: {
    crop: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional().describe("Seller's city (matches profiles.city)."),
    limit: z.number().int().min(1).max(50).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ crop, city, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);

    let farmerIds: string[] | null = null;
    if (city) {
      const { data: profs, error: pErr } = await sb
        .from("public_farmer_profiles" as any).select("id").ilike("city", city);
      if (pErr) return { content: [{ type: "text", text: pErr.message }], isError: true };
      farmerIds = (profs ?? []).map((p: any) => p.id);
      if (farmerIds.length === 0) {
        return { content: [{ type: "text", text: "[]" }], structuredContent: { listings: [] } };
      }
    }

    let q = sb
      .from("listings")
      .select("id, farmer_id, crop, quantity, unit, price_per_unit, min_order, quality, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (crop) q = q.ilike("crop", crop);
    if (farmerIds) q = q.in("farmer_id", farmerIds);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { listings: data ?? [] },
    };
  },
});
