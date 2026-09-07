// Expo push dispatcher — sibling of send-sms/dispatch_sms (kural #101/#106).
// Called ONLY from dispatch_push() (SQL), never directly from a client.
//
// Deliberate design difference from send-sms: this function does NOT carry
// its own copy of the event->preference-column map. dispatch_push() already
// resolved eligibility (notif_prefs.<event>_push) and the recipient's
// device_tokens before calling this — repeating that logic here a second
// time is exactly the P20/P24 drift bug (two independently-maintained
// copies of the same event->channel mapping silently going out of sync,
// see send-sms's own "keep this map in sync" comment). This function is a
// pure sender: given tokens + title/body, it sends via Expo and cleans up
// tokens Expo reports as permanently invalid.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { tokens, title, body, event, data } = await req.json();
    if (!Array.isArray(tokens) || tokens.length === 0 || !body) {
      return new Response(JSON.stringify({ error: "tokens[] and body required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // device_tokens'ta yalnızca Expo formatlı token'lar olmalı (P23-M6,
    // rpc_register_device_token yalnızca Notifications.getExpoPushTokenAsync
    // çıktısını yazıyor) ama savunmacı bir filtre — Expo API'si tanımadığı
    // bir formatta tüm isteği reddedebiliyor.
    const validTokens: string[] = tokens.filter(
      (t: unknown): t is string => typeof t === "string" && t.startsWith("ExponentPushToken["),
    );
    if (validTokens.length === 0) {
      return new Response(JSON.stringify({ skipped: "no-valid-tokens" }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const messages = validTokens.map((to) => ({
      to,
      title: title ?? "Hasat",
      body,
      sound: "default",
      data: { event, ...(data ?? {}) },
    }));

    // Expo'nun "Enhanced Security" (opsiyonel) push erişim anahtarı — hesapta
    // etkin değilse EXPO_ACCESS_TOKEN secret'ı hiç ayarlanmaz, header atlanır.
    const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    };
    if (expoAccessToken) headers.Authorization = `Bearer ${expoAccessToken}`;

    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
    });
    const result = await resp.json();

    // Expo bazı geçersiz/eskimiş token'lar için hemen (aynı response'ta)
    // "DeviceNotRegistered" hatası döndürür — bu durumda ilgili token'ı
    // device_tokens'tan sil (kalıcı olarak geçersiz, tekrar denemenin anlamı
    // yok). Tam teslimat garantisi için Expo'nun ayrı "getReceipts" uç
    // noktasının ~15 dk sonra kontrol edilmesi gerekir — bu turda
    // uygulanmadı, yalnızca ticket-seviyesi anlık hata burada ele alınıyor.
    const tickets: ExpoTicket[] = result?.data ?? [];
    const staleTokens: string[] = [];
    tickets.forEach((ticket, i) => {
      if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
        staleTokens.push(validTokens[i]);
      }
    });

    if (staleTokens.length > 0) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabase.from("device_tokens").delete().in("token", staleTokens);
    }

    return new Response(
      JSON.stringify({ ok: resp.ok, status: resp.status, result, staleTokensRemoved: staleTokens.length }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
