import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type ClaimedEvent, createNotifyAdminHandler } from "./handler.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const handler = createNotifyAdminHandler({
  env: (name) => Deno.env.get(name),
  now: () => Date.now(),
  fetch: (input, init) => fetch(input, init),
  claim: async (eventId) => {
    const { data, error } = await supabase.rpc("claim_admin_sms_event", {
      p_event_id: eventId,
    });
    if (error) throw error;
    return data as ClaimedEvent;
  },
  complete: async (eventId, outcome, providerMessageId) => {
    const { data, error } = await supabase.rpc("complete_admin_sms_event", {
      p_event_id: eventId,
      p_outcome: outcome,
      p_provider_message_id: providerMessageId ?? null,
    });
    if (error) throw error;
    return data === true;
  },
});

Deno.serve(handler);
