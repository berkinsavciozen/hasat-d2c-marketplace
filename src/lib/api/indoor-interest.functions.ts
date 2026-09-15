import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/core/db/types";

const ContactTopic = z.enum(["farmer", "buyer", "partnership", "information", "other"]);

const InputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .min(10)
    .max(20)
    .regex(/^[0-9+\s()-]+$/),
  city: z.string().trim().max(80).optional().nullable(),
  topic: ContactTopic,
  note: z.string().trim().max(500).optional().nullable(),
});

const storedInterestType = {
  farmer: "danışmanlık",
  buyer: "danışmanlık",
  partnership: "ortaklık",
  information: "danışmanlık",
  other: "diğer",
} as const;

const contactTopicLabel = {
  farmer: "Çiftçiyim",
  buyer: "Alıcıyım",
  partnership: "İş birliği yapmak istiyorum",
  information: "Platform hakkında bilgi almak istiyorum",
  other: "Diğer",
} as const;

export const submitContactInquiry = createServerFn({ method: "POST" })
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

    const topicLabel = contactTopicLabel[data.topic];
    const storedNote = [`İletişim konusu: ${topicLabel}`, data.note].filter(Boolean).join("\n\n");
    const { error } = await client.from("indoor_interest_leads").insert({
      name: data.name,
      phone: cleanPhone,
      city: data.city ?? null,
      interest_type: storedInterestType[data.topic],
      note: storedNote,
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
        const body = `Yeni Hasat iletişim mesajı: ${data.name} / ${cleanPhone} / ${
          data.city ?? "-"
        } / ${topicLabel}`;
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
