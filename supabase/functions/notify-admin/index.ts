// Ops alert dispatcher — sends a fixed-recipient SMS to the platform owner (Berkin) via Twilio.
// Called from the app via supabase.functions.invoke('notify-admin', { body: { message } })
// Used for: new crop-type requests (farmer), catalog-gap signals (buyer crop_requests with no crop_config match).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BERKIN_PHONE = "+905421241011";
const MAX_MESSAGE_LEN = 300;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const body = message.slice(0, MAX_MESSAGE_LEN);

    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const token = Deno.env.get("TWILIO_AUTH_TOKEN");
    const msid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
    if (!sid || !token || !msid) {
      return new Response(JSON.stringify({ error: "Twilio secrets missing" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const form = new URLSearchParams({ To: BERKIN_PHONE, MessagingServiceSid: msid, Body: body });
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${sid}:${token}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      },
    );
    const text = await resp.text();
    return new Response(JSON.stringify({ ok: resp.ok, status: resp.status, body: text }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
