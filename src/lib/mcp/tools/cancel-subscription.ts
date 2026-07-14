import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { enforceMcpRateLimit } from "./_rate-limit";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "cancel_subscription",
  title: "Cancel subscription",
  description:
    "SENSITIVE — cancel one of the signed-in buyer's harvest subscriptions. Only the buyer who created the subscription can cancel it. Requires confirm=true.",
  inputSchema: {
    subscription_id: z.string().uuid(),
    confirm: z.literal(true).describe("Must be true — safety guard."),
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

    const { data, error } = await sb
      .from("harvest_subscriptions")
      .update({ status: "cancelled" } as any)
      .eq("id", input.subscription_id)
      .eq("buyer_id", userId)
      .select()
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) {
      return {
        content: [{ type: "text", text: "Subscription not found or not owned by you." }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: `Cancelled subscription ${data.id}` }],
      structuredContent: { subscription: data },
    };
  },
});
