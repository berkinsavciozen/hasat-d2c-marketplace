import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Sets the signed-in user's profiles.tier to 'premium'. The
// enforce_profile_self_update_restrictions trigger blocks self-updates to
// `tier` via the normal client path, so this runs server-side with the
// service-role admin client after verifying the caller via bearer auth.
export const activatePremium = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ tier: "premium" })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
