// Twilio inbound WhatsApp webhook → AI assistant for Hasat farmers.
// Public endpoint (no JWT verify). Always returns HTTP 200 TwiML.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

const ERR_GENERIC = "Şu an bir sorun yaşıyoruz. Lütfen birkaç dakika sonra tekrar deneyin.";
const ERR_NOT_REGISTERED = "Hasat uygulamasına kayıt olmak için: hasat.lovable.app";
const ERR_LIMIT = "Bu ay mesaj limitine ulaştınız. Sınırsız AI sohbeti için Hasat Premium'a geçin: hasat.lovable.app/premium";

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function twiml(text: string): Response {
  const body = text.length > 1600 ? text.slice(0, 1597) + "..." : text;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Message>${xmlEscape(body)}</Message></Response>`;
  return new Response(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

// Daily session ID — deterministic UUID from sha256(user_id:YYYY-MM-DD).
async function dailySessionId(userId: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const buf = new TextEncoder().encode(`${userId}:${day}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  const h = Array.from(hash.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function mapQuality(q: unknown): "A" | "B" | "C" {
  if (!q) return "A";
  const s = String(q).toLowerCase().trim();
  if (["a", "iyi", "good", "kaliteli"].includes(s)) return "A";
  if (["b", "orta", "medium"].includes(s)) return "B";
  if (["c", "düşük", "dusuk", "kötü", "kotu", "low"].includes(s)) return "C";
  return "A";
}

function phoneCandidates(from: string): string[] {
  const raw = from.replace(/^whatsapp:/i, "").trim();
  const noPlus = raw.replace(/^\+/, "");
  const withPlus = raw.startsWith("+") ? raw : `+${raw}`;
  return Array.from(new Set([raw, noPlus, withPlus]));
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return twiml(ERR_GENERIC);

    const form = await req.formData();
    const From = String(form.get("From") ?? "");
    const Body = String(form.get("Body") ?? "").trim();
    if (!From || !Body) return twiml(ERR_GENERIC);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // 1. Identify farmer
    const candidates = phoneCandidates(From);
    const { data: profile } = await sb
      .from("profiles")
      .select("id, name, city, tier")
      .in("phone", candidates)
      .eq("role", "farmer")
      .maybeSingle();
    if (!profile) return twiml(ERR_NOT_REGISTERED);

    const userId = profile.id as string;

    // 2. Usage gate
    const { data: canSend, error: canErr } = await sb.rpc("can_send_ai_message", { _user_id: userId });
    if (canErr) console.error("can_send_ai_message error:", canErr);
    if (canSend === false) return twiml(ERR_LIMIT);

    // 3. Context (best-effort, parallel)
    const [historyRes, harvestsRes, listingsRes, offersRes, parcelsRes] = await Promise.all([
      sb.from("ai_chat_messages").select("role, content, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
      sb.from("harvest_entries").select("crop, quantity, unit, quality, harvest_date").eq("farmer_id", userId).order("harvest_date", { ascending: false }).limit(5),
      sb.from("listings").select("crop, quantity, price_per_unit, unit").eq("farmer_id", userId).eq("status", "active"),
      sb.from("offers").select("created_at").eq("farmer_id", userId).eq("status", "pending").order("created_at", { ascending: true }),
      sb.from("parcels").select("id, name, crops").eq("farmer_id", userId),
    ]);

    const history = (historyRes.data ?? []).slice().reverse();
    const harvests = harvestsRes.data ?? [];
    const listings = listingsRes.data ?? [];
    const pendingOffers = offersRes.data ?? [];
    const parcels = parcelsRes.data ?? [];

    // 4. Build prompt
    const ctx: string[] = [];
    if (harvests.length) ctx.push(`Son hasatlar:\n${harvests.map((h: any) => `- ${h.harvest_date}: ${h.crop} ${h.quantity}${h.unit} (${h.quality})`).join("\n")}`);
    if (listings.length) ctx.push(`Aktif ilanlar:\n${listings.map((l: any) => `- ${l.crop} ${l.quantity}${l.unit} @ ${l.price_per_unit} TL`).join("\n")}`);
    if (pendingOffers.length) ctx.push(`Bekleyen teklifler: ${pendingOffers.length} (en eski: ${pendingOffers[0].created_at?.slice(0, 10)})`);
    if (parcels.length) ctx.push(`Parseller:\n${parcels.map((p: any) => `- ${p.name} (id: ${p.id}, ürünler: ${(p.crops ?? []).join(", ")})`).join("\n")}`);

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = `Sen Hasat platformunun AI asistanısın. Hasat, Türk çiftçiler için bir D2C tarım pazaryeri platformudur.
Görüşme dili: Türkçe. Her zaman sade, anlaşılır Türkçe kullan. Teknik jargon kullanma.
Çiftçinin adı: ${profile.name ?? "Çiftçi"}, şehri: ${profile.city ?? "—"}.
Görevlerin: fiyat bilgisi ver, sipariş durumunu açıkla, günlük kaydı eklemesine yardım et, iş önerileri sun.
Günlük kaydı eklemek isterse bilgileri topla ve cevabına [JOURNAL_ENTRY]{json}[/JOURNAL_ENTRY] bloğu ekle.
JSON alanları: crop, quantity (sayı), unit (kg|ton|adet), harvest_date (YYYY-MM-DD, bugün=${today}), quality (A|B|C, varsayılan A), parcel_name (parsel adı) veya parcel_id, notes.
Kısa ve net cevaplar ver. Maksimum 3 paragraf.

Bağlam:
${ctx.join("\n\n") || "(yok)"}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: Body },
    ];

    // 5. AI call
    let aiText = "";
    try {
      const aiRes = await fetch(AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": LOVABLE_API_KEY,
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({ model: AI_MODEL, messages }),
      });
      if (!aiRes.ok) {
        const t = await aiRes.text();
        console.error("AI gateway error", aiRes.status, t);
        return twiml(ERR_GENERIC);
      }
      const aiJson = await aiRes.json();
      aiText = aiJson?.choices?.[0]?.message?.content ?? "";
      if (!aiText) return twiml(ERR_GENERIC);
    } catch (e) {
      console.error("AI fetch threw:", e);
      return twiml(ERR_GENERIC);
    }

    // 6. Parse [JOURNAL_ENTRY]
    let reply = aiText;
    const journalRe = /\[JOURNAL_ENTRY\]([\s\S]*?)\[\/JOURNAL_ENTRY\]/;
    const m = aiText.match(journalRe);
    if (m) {
      reply = aiText.replace(journalRe, "").trim();
      let entry: any = null;
      try { entry = JSON.parse(m[1].trim()); } catch (e) { console.error("journal JSON parse:", e); }

      if (entry && entry.crop && entry.quantity != null && entry.unit && entry.harvest_date) {
        // resolve parcel
        let parcelId: string | null = null;
        if (entry.parcel_id && parcels.find((p: any) => p.id === entry.parcel_id)) {
          parcelId = entry.parcel_id;
        } else if (entry.parcel_name) {
          const want = String(entry.parcel_name).toLowerCase().trim();
          const hit = parcels.find((p: any) => String(p.name).toLowerCase().trim() === want);
          if (hit) parcelId = hit.id;
        }
        if (!parcelId && parcels.length === 1) parcelId = parcels[0].id;

        if (parcelId) {
          const ins = await sb.from("harvest_entries").insert({
            farmer_id: userId,
            parcel_id: parcelId,
            crop: String(entry.crop),
            quantity: Number(entry.quantity),
            unit: entry.unit,
            quality: mapQuality(entry.quality),
            harvest_date: entry.harvest_date,
            notes: entry.notes ?? null,
            costs: {},
          });
          if (ins.error) {
            console.error("harvest insert error:", ins.error);
          } else {
            reply = `${reply}\n\n✅ Günlük kaydınız oluşturuldu.`.trim();
          }
        } else {
          const list = parcels.map((p: any) => p.name).join(", ") || "(parsel bulunamadı)";
          reply = `Hangi parselden hasat ettiniz? Parsellerin: ${list}`;
        }
      }
    }

    // 7. Store both messages
    const sessionId = await dailySessionId(userId);
    const insMsgs = await sb.from("ai_chat_messages").insert([
      { user_id: userId, session_id: sessionId, role: "user", content: Body, source: "whatsapp", page_context: "whatsapp" },
      { user_id: userId, session_id: sessionId, role: "assistant", content: aiText, source: "whatsapp", page_context: "whatsapp" },
    ]);
    if (insMsgs.error) console.error("ai_chat_messages insert error:", insMsgs.error);

    // 8. Increment usage
    const { error: incErr } = await sb.rpc("increment_ai_usage", { _user_id: userId });
    if (incErr) console.error("increment_ai_usage error:", incErr);

    return twiml(reply);
  } catch (e) {
    console.error("whatsapp-ai-webhook fatal:", e);
    return twiml(ERR_GENERIC);
  }
});
