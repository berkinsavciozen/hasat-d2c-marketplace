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

async function fetchJournal(supa: any, userId: string) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const since31 = new Date(Date.now() - 31 * 86400_000).toISOString().slice(0, 10);
  const dow = (today.getUTCDay() + 6) % 7;
  const weekStart = new Date(today.getTime() - dow * 86400_000).toISOString().slice(0, 10);
  const monthStart = todayStr.slice(0, 8) + "01";

  const [recent, last3, allCrops] = await Promise.all([
    supa.from("harvest_entries").select("crop, quantity, unit, harvest_date")
      .eq("farmer_id", userId).gte("harvest_date", since31),
    supa.from("harvest_entries").select("crop, quantity, unit, harvest_date")
      .eq("farmer_id", userId).order("harvest_date", { ascending: false }).limit(3),
    supa.from("harvest_entries").select("crop").eq("farmer_id", userId),
  ]);

  const rows = (recent.data ?? []) as any[];
  const bucket = (since: string) => {
    const f = rows.filter((r) => (r.harvest_date ?? "") >= since);
    return { count: f.length, qty: f.reduce((s, r) => s + Number(r.quantity ?? 0), 0) };
  };
  const distinct = new Set(((allCrops.data ?? []) as any[]).map((r) => r.crop).filter(Boolean));

  return {
    today: bucket(todayStr),
    week: bucket(weekStart),
    month: bucket(monthStart),
    last_entries: (last3.data ?? []) as any[],
    distinct_crops: distinct.size,
  };
}

async function fetchPrices(supa: any, userId: string) {
  const since14 = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
  const alertsRes = await supa.from("price_alerts")
    .select("crop, target_price, condition")
    .eq("farmer_id", userId).eq("active", true);
  const alerts = (alertsRes.data ?? []) as any[];

  let crops: string[] = alerts.map((a) => a.crop).filter(Boolean);
  if (crops.length === 0) {
    const recent = await supa.from("harvest_entries").select("crop")
      .eq("farmer_id", userId).order("harvest_date", { ascending: false }).limit(5);
    crops = Array.from(new Set(((recent.data ?? []) as any[]).map((r) => r.crop).filter(Boolean)));
  }

  let tracked: any[] = [];
  if (crops.length > 0) {
    const pts = await supa.from("price_points")
      .select("crop, hal_price, d2c_price, delta_7d, recorded_date")
      .in("crop", crops).gte("recorded_date", since14)
      .order("recorded_date", { ascending: false });
    const byCrop = new Map<string, any[]>();
    for (const p of ((pts.data ?? []) as any[])) {
      if (!byCrop.has(p.crop)) byCrop.set(p.crop, []);
      byCrop.get(p.crop)!.push(p);
    }
    tracked = Array.from(byCrop.entries()).map(([crop, arr]) => {
      const latest = arr[0];
      return {
        crop,
        latest_d2c: Number(latest?.d2c_price ?? 0),
        latest_hal: Number(latest?.hal_price ?? 0),
        delta_7d: Number(latest?.delta_7d ?? 0),
        points: arr.length,
        latest_date: latest?.recorded_date ?? null,
      };
    });
  }
  return { alerts, tracked_crops: tracked };
}

async function fetchStorefront(supa: any, userId: string) {
  const [listingsRes, offersRes] = await Promise.all([
    supa.from("listings").select("status, crop, quantity, price_per_unit, created_at")
      .eq("farmer_id", userId).order("created_at", { ascending: false }),
    supa.from("offers").select("status, price_per_unit, quantity, listing_id, created_at")
      .eq("farmer_id", userId),
  ]);
  const ls = (listingsRes.data ?? []) as any[];
  const os = (offersRes.data ?? []) as any[];

  const lCount = (s: string) => ls.filter((l) => l.status === s).length;
  const oCount = (s: string) => os.filter((o) => o.status === s).length;
  const pending = os.filter((o) => o.status === "pending");
  const oldestPending = pending.reduce<string | null>(
    (m, o) => (!m || (o.created_at ?? "") < m ? o.created_at : m), null);
  const now = Date.now();
  const avgAge = pending.length
    ? +(pending.reduce((s, o) => s + (now - new Date(o.created_at).getTime()) / 86400_000, 0) / pending.length).toFixed(1)
    : 0;

  return {
    listings: {
      total: ls.length,
      active: lCount("active"),
      sold: lCount("sold"),
      expired: lCount("expired"),
      top: ls.filter((l) => l.status === "active").slice(0, 5).map((l) => ({
        crop: l.crop, quantity: Number(l.quantity ?? 0), price_per_unit: Number(l.price_per_unit ?? 0),
      })),
    },
    offers: {
      pending: oCount("pending"),
      accepted: oCount("accepted"),
      rejected: oCount("rejected"),
      countered: oCount("counter"),
      oldest_pending_at: oldestPending,
      avg_pending_age_days: avgAge,
    },
  };
}

function isEmpty(pageType: string, ctx: any): boolean {
  if (pageType === "dashboard") {
    return ctx.listings_total === 0 && ctx.offers_pending === 0 && ctx.orders_active === 0 && ctx.entries_last_30d === 0;
  }
  if (pageType === "analytics") {
    return (ctx.crops_last_90d?.length ?? 0) === 0 && ctx.listings_revenue_potential === 0 && ctx.completed_orders_90d === 0;
  }
  if (pageType === "journal") {
    return (ctx.today?.count ?? 0) === 0 && (ctx.week?.count ?? 0) === 0 && (ctx.month?.count ?? 0) === 0 && (ctx.last_entries?.length ?? 0) === 0;
  }
  if (pageType === "prices") {
    return (ctx.alerts?.length ?? 0) === 0 && (ctx.tracked_crops?.length ?? 0) === 0;
  }
  if (pageType === "storefront") {
    const o = ctx.offers ?? {};
    return (ctx.listings?.total ?? 0) === 0 && (o.pending ?? 0) === 0 && (o.accepted ?? 0) === 0 && (o.rejected ?? 0) === 0 && (o.countered ?? 0) === 0;
  }
  return false;
}

const PAGE_GOALS: Record<string, string> = {
  dashboard: "Genel durum özeti ve aksiyon önerileri.",
  analytics: "Üretim ve gelir analizleri.",
  journal: "Çiftçinin günlük tutma alışkanlığını özetle (bugün/hafta/ay). 1-2 kısa öneri ekle. urgency yalnızca bu hafta 0 kayıt varsa.",
  prices: "Takip edilen ürünlerde son fiyat hareketlerini yorumla. urgency: 7 günde |delta|>10% ya da bir alarm koşulu tetiklendiyse.",
  storefront: "Vitrin ve teklif durumunu değerlendir. urgency: 7 günden eski bekleyen teklif varsa.",
};

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
    else if (pageType === "journal") ctx = await fetchJournal(supa, userId);
    else if (pageType === "prices") ctx = await fetchPrices(supa, userId);
    else if (pageType === "storefront") ctx = await fetchStorefront(supa, userId);
    else ctx = {};
  } catch (e) {
    console.error("[ai-box-insights] context fetch error", e);
    return json({ insights: [], urgency: null, error: true });
  }

  if (isEmpty(pageType, ctx)) {
    return json({ insights: [], urgency: null, empty: true });
  }

  const goal = PAGE_GOALS[pageType] ?? "";
  const systemPrompt = `Sen Hasat platformunun AI analiz motorusun. Türk çiftçilere kısa, öz, uygulanabilir Türkçe içgörüler üretiyorsun.
Cevabını JSON formatında döndür: { "insights": ["...", "...", "..."], "urgency": "..." veya null }

insights: 2-3 kısa cümle. Her biri bağımsız bir gözlem veya öneri. Gereksiz giriş/kapanış cümlesi yok.

urgency: Acil aksiyon gerektiren bir durum varsa tek cümle. Yoksa null.

Çiftçiye doğrudan hitap et (sen). Sade Türkçe, jargon yok. Maksimum 20 kelime per insight.
Sayfa bağlamı: ${pageType}. Amaç: ${goal}
Veri: ${JSON.stringify(ctx)}`;

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
