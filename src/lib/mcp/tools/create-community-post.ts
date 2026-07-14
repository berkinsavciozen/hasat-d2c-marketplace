import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { looksLikePriceCoordination } from "@/lib/hasat/queries";
import { enforceMcpRateLimit } from "./_rate-limit";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "create_community_post",
  title: "Create community post",
  description:
    "Publish a new post to the Hasat community feed as the signed-in user. Posts that mention money together with coordination language are auto-flagged for moderator review.",
  inputSchema: {
    content: z.string().trim().min(1).max(2000),
    category: z.string().trim().min(1).default("Genel"),
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

    const { data, error } = await sb.from("community_posts").insert({
      author_id: userId,
      content: input.content,
      category: input.category,
      flagged_for_review: looksLikePriceCoordination(input.content),
    }).select().single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created community post ${data.id}` }],
      structuredContent: { post: data },
    };
  },
});
