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
  name: "list_recent_harvests",
  title: "List recent harvests",
  description:
    "List the signed-in farmer's most recent harvest journal entries (crop, quantity, quality, date).",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(10),
    crop: z.string().trim().min(1).optional().describe("Optional crop name filter."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, crop }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("harvest_entries")
      .select("id, crop, quantity, unit, quality, harvest_date, parcel_id, notes")
      .eq("farmer_id", ctx.getUserId()!)
      .is("journal_entry_type_id", null)
      .order("harvest_date", { ascending: false })
      .limit(limit);
    if (crop) q = q.ilike("crop", crop);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { entries: data ?? [] },
    };
  },
});
