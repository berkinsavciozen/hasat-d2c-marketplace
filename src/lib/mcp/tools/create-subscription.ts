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
  name: "create_subscription",
  title: "Create harvest subscription",
  description:
    "SENSITIVE — as the signed-in buyer, commit to an ongoing harvest subscription with a farmer. Cannot be reversed via this tool (use cancel_subscription). Requires confirm=true.",
  inputSchema: {
    farmer_id: z.string().uuid(),
    volume_commitment: z.number().positive().describe("Committed volume (in the farmer's default unit)."),
    price_lock: z.boolean().describe("If true, lock the per-unit price at locked_price."),
    locked_price: z.number().positive().optional().describe("Required when price_lock=true — per-unit locked price."),
    next_harvest_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("ISO date YYYY-MM-DD."),
    estimated_qty: z.number().positive().optional(),
    crop: z.string().min(1).optional().describe("Crop name for the subscription (e.g. 'safran')."),
    note: z.string().max(2000).optional().describe("Optional note for the farmer."),
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

    if (input.price_lock && input.locked_price == null) {
      return {
        content: [{ type: "text", text: "locked_price is required when price_lock=true." }],
        isError: true,
      };
    }

    const { data, error } = await sb.from("harvest_subscriptions").insert({
      buyer_id: userId,
      farmer_id: input.farmer_id,
      volume_commitment: input.volume_commitment,
      price_lock: input.price_lock,
      locked_price: input.price_lock ? input.locked_price ?? null : null,
      locked_at: input.price_lock ? new Date().toISOString() : null,
      next_harvest_date: input.next_harvest_date ?? null,
      estimated_qty: input.estimated_qty ?? null,
      crop: input.crop ?? null,
      note: input.note ?? null,
      // status omitted — DB default 'pending' requires farmer approval.
    } as any).select("*").single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created subscription ${data.id}` }],
      structuredContent: { subscription: data },
    };
  },
});
