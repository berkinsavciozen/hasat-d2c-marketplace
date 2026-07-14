import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_my_subscriptions",
  title: "List my subscriptions",
  description:
    "List the signed-in buyer's harvest subscriptions (all statuses), newest first. Includes the linked farmer's public profile.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const userId = ctx.getUserId()!;
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("harvest_subscriptions")
      .select("*, farmer:profiles!harvest_subscriptions_farmer_id_fkey(id,name,city)")
      .eq("buyer_id", userId)
      .order("created_at", { ascending: false });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Found ${data?.length ?? 0} subscriptions` }],
      structuredContent: { subscriptions: data ?? [] },
    };
  },
});
