// Twilio SMS dispatcher. Server-to-server only: called by public.dispatch_sms (pg_net) with an
// HMAC-signed body — see handler.ts. verify_jwt=false in config.toml; the signature is the gate.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createSendSmsHandler } from "./handler.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const handler = createSendSmsHandler({
  env: (name) => Deno.env.get(name),
  now: () => Date.now(),
  fetch: (input, init) => fetch(input, init),
  prefEnabled: async (userId, column) => {
    const { data, error } = await supabase
      .from("notif_prefs")
      .select(column)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return (data as Record<string, unknown> | null)?.[column] === true;
  },
  phone: async (userId) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    const phone = (data as { phone?: unknown } | null)?.phone;
    return typeof phone === "string" && phone.length > 0 ? phone : null;
  },
});

Deno.serve(handler);
