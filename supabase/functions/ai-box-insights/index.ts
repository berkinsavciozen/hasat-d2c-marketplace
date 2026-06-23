// AI insights box - non-streaming, returns 2-3 short Turkish insights for a farmer page.
// Auth: verify_jwt = true. user_id read from JWT sub claim.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function userIdFromAuth(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const tok = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : h.trim();
  const parts = tok.split(".");
  if (parts.length !== 3) return null;
  try {
    const pad = "=".repeat((4 - (parts[1].length % 4)) % 4);
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad;
    const payload = JSON.parse(atob(b64));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

async function fetchDashboard(supa: any, userId: string) {
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [profile, listingsAll, listingsActive, offersPending, ordersActive, entries30, notifs] = await Promise.all([
    supa.from("profiles").select("name, city, tier").eq("id", userId).maybeSingle(),
    supa.from("listings").select("id", { count: "exact", head: true }).eq("farmer_id", userId),
    supa.from("listings").select("id", { count: "exact", head: true }).eq("farmer_id", userId).eq("status", "active"),
    supa.from("offers").select("id, created_at, listing_id, listings!inner(farmer_id)")
      .eq("status", "pending").eq("listings.farmer_id", userId).order("created_at", { ascending: true }),
    supa.from("orders").select("id, status").eq("farmer_id", userId).in("status", ["pending", "preparing", "shipped"]),
    supa.from("harvest_entries").select("id", { count: "exact", head: true })
      .eq("farmer_id", userId).gte("harvest_date", since30),
    supa.from("notifications").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("read", false),
  ]);

  const pending = offersPending.data ?? [];
  return {
    profile: profile.data ?? null,
    listings_total: listingsAll.count ?? 0,
    listings_active: listingsActive.count ?? 0,
    offers_pending: pending.length,
    oldest_pending_offer_at: pending[0]?.created_at ?? null,
    orders_active: (ordersActive.data ?? []).length,
    orders_need_action: (ordersActive.data ?? []).filter((o: any) => o.status === "pending").length,
    entries_last_30d: entries30.count ?? 0,
    unread_notifications: notifs.count ?? 0,
  };
}

async function fetchAnalytics(supa: any, userId: string) {
  const since90 = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const [profile, entries, listings, orders] = await Promise.all([
    supa.from("profiles").select("tier").eq("id", userId).maybeSingle(),
    supa.from("harvest_entries").select("crop, quantity, quality")
      .eq("farmer_id", userId).gte("harvest_date", since90),
    supa.from("listings").select("quantity, price_per_unit").eq("farmer_id", userId).eq("status", "active"),
    supa.from("orders").select("id, total_amount, status, created_at")
      .eq("farmer_id", userId).eq("status", "delivered").gte("created_at", since90),
  ]);

  const byCrop = new Map<string, { qty: number; qSum: number; n: number }>();
  for (const e of (entries.data ?? []) as any[]) {
    const k = e.crop || "—";
    const cur = byCrop.get(k) ?? { qty: 0, qSum: 0, n: 0 };
    cur.qty += Number(e.quantity ?? 0);
    cur.qSum += e.quality === "A" ? 3 : e.quality === "B" ? 2 : 1;
    cur.n += 1;
    byCrop.set(k, cur);
  }
  const crops = Array.from(byCrop.entries()).map(([crop, v]) => ({
    crop, total_qty: v.qty, avg_quality: v.n ? +(v.qSum / v.n).toFixed(2) : 0, entries: v.n,
  }));
  const revenuePotential = (listings.data ?? []).reduce(
    (s: number, l: any) => s + Number(l.quantity ?? 0) * Number(l.price_per_unit ?? 0), 0);
  const completedOrders = orders.data ?? [];
  const orderTotal = completedOrders.reduce((s: number, o: any) => s + Number(o.total_amount ?? 0), 0);

  return {
    tier: profile.data?.tier ?? "free",
    crops_last_90d: crops,
    listings_revenue_potential: revenuePotential,
    completed_orders_90d: completedOrders.length,
    completed_orders_value: orderTotal,
  };
}

function isEmpty(pageType: string, ctx: any): boolean {
  if (pageType === "dashboard") {
    return ctx.listings_total === 0 && ctx.offers_pending === 0 && ctx.orders_active === 0 && ctx.entries_last_30d === 0;
  }
  if (pageType === "analytics") {
    return (ctx.crops_last_90d?.length ?? 0) === 0 && ctx.listings_revenue_potential === 0 && ctx.completed_orders_90d === 0;
  }
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const userId = userIdFromAuth(req);
  if (!userId) return json({ error: "unauthorized" }, 401);

  let body: { page_type?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const pageType = (body.page_type ?? "").trim();
  if (!pageType) return json({ error: "missing_page_type" }, 400);

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let ctx: any;
  try {
    if (pageType === "dashboard") ctx = await fetchDashboard(supa, userId);
    else if (pageType === "analytics") ctx = await fetchAnalytics(supa, userId);
    else ctx = {};
  } catch (e) {
    console.error("[ai-box-insights] context fetch error", e);
    return json({ insights: [], urgency: null, error: true });
  }

  if (isEmpty(pageType, ctx)) {
    return json({ insights: [], urgency: null, empty: true });
  }

  const systemPrompt = `Sen Hasat platformunun AI analiz motorusun. Türk çiftçilere kısa, öz, uygulanabilir Türkçe içgörüler üretiyorsun.
Cevabını JSON formatında döndür: { "insights": ["...", "...", "..."], "urgency": "..." veya null }

insights: 2-3 kısa cümle. Her biri bağımsız bir gözlem veya öneri. Gereksiz giriş/kapanış cümlesi yok.

urgency: Acil aksiyon gerektiren bir durum varsa tek cümle. Yoksa null.

Çiftçiye doğrudan hitap et (sen). Sade Türkçe, jargon yok. Maksimum 20 kelime per insight.
Sayfa bağlamı: ${pageType}. Veri: ${JSON.stringify(ctx)}`;

  try {
    const upstream = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Sayfa: ${pageType}. Yukarıdaki veriye göre içgörüleri üret.` },
        ],
        stream: false,
        response_format: { type: "json_object" },
      }),
    });

    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => "");
      console.error("[ai-box-insights] upstream", upstream.status, txt);
      return json({ insights: [], urgency: null, error: true });
    }
    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    let parsed: any;
    try { parsed = JSON.parse(content); } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    }
    if (!parsed || !Array.isArray(parsed.insights)) {
      return json({ insights: [], urgency: null, error: true });
    }
    return json({
      insights: parsed.insights.slice(0, 3).map((s: any) => String(s)).filter(Boolean),
      urgency: parsed.urgency ? String(parsed.urgency) : null,
    });
  } catch (e) {
    console.error("[ai-box-insights] ai error", e);
    return json({ insights: [], urgency: null, error: true });
  }
});
