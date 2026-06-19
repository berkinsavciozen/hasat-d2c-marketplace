// Twilio SMS dispatcher — checks notif_prefs opt-in then sends via Twilio API.
// Called from the app via supabase.functions.invoke('send-sms', { body: { userId, message, event } })
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// notif_prefs has per-event SMS columns; map incoming `event` to the right column.
const COL: Record<string, string> = {
  new_offer: "new_offer_sms",
  price_alert: "price_alert_sms",
  harvest_time: "harvest_time_sms",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { userId, message, event = "new_offer" } = await req.json();
    if (!userId || !message) {
      return new Response(JSON.stringify({ error: "userId and message required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const col = COL[event];
    if (!col) {
      return new Response(JSON.stringify({ skipped: "no-pref-mapping", event }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: prefs } = await supabase
      .from("notif_prefs")
      .select(col)
      .eq("user_id", userId)
      .maybeSingle();
    if (!prefs || !(prefs as Record<string, unknown>)[col]) {
      return new Response(JSON.stringify({ skipped: "opt-out" }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.phone) {
      return new Response(JSON.stringify({ skipped: "no-phone" }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const token = Deno.env.get("TWILIO_AUTH_TOKEN");
    const msid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
    if (!sid || !token || !msid) {
      return new Response(JSON.stringify({ error: "Twilio secrets missing" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const to = profile.phone.startsWith("+") ? profile.phone : "+" + profile.phone;
    const form = new URLSearchParams({ To: to, MessagingServiceSid: msid, Body: message });

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
