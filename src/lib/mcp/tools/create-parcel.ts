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
  name: "create_parcel",
  title: "Create parcel",
  description:
    "Create a new parcel (field/plot) for the signed-in farmer. Triggers auto-draft-listing generation.",
  inputSchema: {
    name: z.string().trim().min(1),
    city: z.string().trim().min(1).describe("City / location label."),
    area: z.number().positive().describe("Area in decares (dönüm)."),
    crops: z.array(z.string().trim().min(1)).min(1),
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

    let farmId: string | null = null;
    const { data: existingFarm, error: fErr } = await sb
      .from("farms").select("id").eq("farmer_id", userId).limit(1).maybeSingle();
    if (fErr) return { content: [{ type: "text", text: fErr.message }], isError: true };
    if (existingFarm?.id) {
      farmId = existingFarm.id;
    } else {
      const { data: newFarm, error: nfErr } = await sb
        .from("farms").insert({ farmer_id: userId }).select("id").single();
      if (nfErr) return { content: [{ type: "text", text: nfErr.message }], isError: true };
      farmId = newFarm.id;
    }

    const { data, error } = await sb.from("parcels").insert({
      farmer_id: userId,
      farm_id: farmId,
      name: input.name,
      area: input.area,
      crops: input.crops,
      location_label: input.city,
      lat: 0,
      lng: 0,
    }).select().single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created parcel ${data.id}` }],
      structuredContent: { parcel: data },
    };
  },
});
