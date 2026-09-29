// Streaming AI chat proxy for in-app farmer chat.
// Forwards SSE chunks from Lovable AI Gateway to the browser.
// Auth: verified Supabase JWT (verify_jwt = true) + role "authenticated" and monthly quota — see handler.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createAiChatStreamHandler } from "./handler.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const handler = createAiChatStreamHandler({
  env: (name) => Deno.env.get(name),
  fetch: (input, init) => fetch(input, init),
  canSend: async (userId) => {
    const { data, error } = await supabase.rpc("can_send_ai_message", { _user_id: userId });
    if (error) throw error;
    return data === true;
  },
  increment: async (userId) => {
    const { error } = await supabase.rpc("increment_ai_usage", { _user_id: userId });
    if (error) throw error;
  },
});

Deno.serve(handler);
