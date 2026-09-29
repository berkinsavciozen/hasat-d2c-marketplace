// DECOMMISSIONED — 2026-09-29 kapatıldı (vitrin lansmanı). Yeniden açılırken X-Twilio-Signature
// doğrulaması (HMAC-SHA1, TWILIO_AUTH_TOKEN, Twilio'da ayarlı birebir URL) ZORUNLU; önceki gövde git
// geçmişinde.
//
// The previous body (Twilio inbound WhatsApp → AI assistant) did not verify the Twilio signature, so
// anyone who knew a farmer's phone number could read that farmer's context and create records in
// their name. Every request now gets 410; no database, AI or Twilio call is made and no secret is
// read. config.toml keeps verify_jwt=false for this function (the stub does nothing).
Deno.serve(() => new Response(JSON.stringify({ status: "decommissioned" }), { status: 410, headers: { "content-type": "application/json" } }));
