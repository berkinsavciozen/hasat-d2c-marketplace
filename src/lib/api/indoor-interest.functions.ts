import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const InterestType = z.enum(["danışmanlık", "ortaklık", "diğer"]);

const InputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .min(10)
    .max(20)
    .regex(/^[0-9+\s()-]+$/),
  city: z.string().trim().max(80).optional().nullable(),
  interest_type: InterestType,
  note: z.string().trim().max(500).optional().nullable(),
});

export const submitIndoorInterest = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      console.error("[indoor-interest] missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
      throw new Error("Sunucu yapılandırma hatası. Lütfen daha sonra tekrar deneyin.");
    }
    const client = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const cleanPhone = data.phone.replace(/[^\d+]/g, "");

    const { error } = await client.from("indoor_interest_leads").insert({
      name: data.name,
      phone: cleanPhone,
      city: data.city ?? null,
      interest_type: data.interest_type,
      note: data.note ?? null,
    });
    if (error) {
      console.error("[indoor-interest] insert failed", error);
      throw new Error("Başvurunuz kaydedilemedi. Lütfen tekrar deneyin.");
    }

    // Fire-and-forget SMS notify to Berkin. Failure must not block the save.
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const msid = process.env.TWILIO_MESSAGING_SERVICE_SID;
      const to = process.env.BERKIN_NOTIFY_PHONE;
      if (sid && token && msid && to) {
        const body = `🌱 Yeni indoor başvuru: ${data.name} / ${cleanPhone} / ${
          data.city ?? "-"
        } / ${data.interest_type}`;
        const form = new URLSearchParams({
          To: to.startsWith("+") ? to : "+" + to,
          MessagingServiceSid: msid,
          Body: body,
        });
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
        if (!resp.ok) {
          console.warn("[indoor-interest] sms failed", resp.status, await resp.text());
        }
      } else {
        console.warn("[indoor-interest] sms skipped — missing Twilio env or BERKIN_NOTIFY_PHONE");
      }
    } catch (e) {
      console.warn("[indoor-interest] sms error", e);
    }

    return { ok: true as const };
  });
