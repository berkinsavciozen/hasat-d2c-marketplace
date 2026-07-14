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
  name: "create_harvest_entry",
  title: "Create harvest entry",
  description:
    "Log a new harvest journal entry for the signed-in farmer. Requires an existing parcel_id owned by the user.",
  inputSchema: {
    parcel_id: z.string().uuid().describe("Parcel UUID owned by the farmer."),
    crop: z.string().trim().min(1),
    quantity: z.number().positive(),
    unit: z.enum(["g", "kg", "L"]).default("kg"),
    harvest_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("ISO date YYYY-MM-DD."),
    quality: z.enum(["A", "B", "C"]).default("A"),
    notes: z.string().max(2000).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const limited = await enforceMcpRateLimit(sb);
    if (limited) return limited;
    const { data, error } = await sb
      .from("harvest_entries")
      .insert({
        farmer_id: ctx.getUserId()!,
        parcel_id: input.parcel_id,
        crop: input.crop,
        quantity: input.quantity,
        unit: input.unit,
        harvest_date: input.harvest_date,
        quality: input.quality,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created harvest entry ${data.id}` }],
      structuredContent: { entry: data },
    };
  },
});
