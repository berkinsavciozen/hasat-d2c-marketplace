import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, x-client-info, content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < ab.length; i++) out |= ab[i] ^ bb[i];
  return out === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const provided = req.headers.get("x-admin-key") ?? "";
  const expected = Deno.env.get("ADMIN_DASHBOARD_KEY") ?? "";
  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...CORS, "content-type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const safe = async <T,>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> => {
      try {
        const { data, error } = await p;
        if (error) { console.error("view query error", error); return null; }
        return data;
      } catch (e) { console.error("view query threw", e); return null; }
    };

    const first = <T,>(arr: T[] | null): T | null => (arr && arr.length > 0 ? arr[0] : null);

    const [
      northStar, disputeRate, fullAcc, repeat, reviewAvg, orderBase,
      farmerActivation, listingOfferRate, farmerSellthrough, farmerVerifiedPct,
      buyerActivation, horecaOrderFrequency, supplyDensity, offerConversion,
      farmerGmv, farmerRetention, buyerAovSegment, buyerGmvRetention,
      buyerSellerRatio, priceVsMarket, cropDemandHeatmap,
    ] = await Promise.all([
      safe(supabase.from("v_kpi_north_star").select("*").order("month", { ascending: true })),
      safe(supabase.from("v_kpi_dispute_rate").select("*").order("month", { ascending: true })),
      safe(supabase.from("v_kpi_full_acceptance_rate").select("*").order("month", { ascending: true })),
      safe(supabase.from("v_kpi_buyer_repeat_rate").select("*")),
      safe(supabase.from("v_kpi_review_avg").select("*").is("reviewee_id", null)),
      safe(supabase.from("v_kpi_order_base").select("amount,is_realized_sale").eq("is_realized_sale", true)),
      // Tek satırlı özet view'lar
      safe(supabase.from("v_kpi_farmer_activation").select("*")),
      safe(supabase.from("v_kpi_listing_offer_rate").select("*")),
      safe(supabase.from("v_kpi_farmer_sellthrough").select("*")),
      safe(supabase.from("v_kpi_farmer_verified_pct").select("*")),
      safe(supabase.from("v_kpi_buyer_activation").select("*")),
      safe(supabase.from("v_kpi_horeca_order_frequency").select("*")),
      safe(supabase.from("v_kpi_supply_density").select("*")),
      safe(supabase.from("v_kpi_offer_conversion").select("*")),
      // Çok satırlı
      safe(supabase.from("v_kpi_farmer_gmv").select("*").order("month", { ascending: true })),
      safe(supabase.from("v_kpi_farmer_retention").select("*").order("cohort_month", { ascending: true })),
      safe(supabase.from("v_kpi_buyer_aov_segment").select("*")),
      safe(supabase.from("v_kpi_buyer_gmv_retention").select("*").order("cohort_month", { ascending: true })),
      safe(supabase.from("v_kpi_buyer_seller_ratio").select("*")),
      safe(supabase.from("v_kpi_price_vs_market").select("*")),
      // P23-M4-b: talep ısı haritası — çiftçi kazanım öncelik listesi.
      safe(supabase.from("v_kpi_crop_demand_heatmap").select("*")
        .order("requester_count", { ascending: false })
        .order("key_ingredient_recipe_count", { ascending: false })),
    ]);

    const rows = (orderBase as Array<{ amount: number | string | null }> | null) ?? [];
    const totals = {
      order_count: rows.length,
      total_gmv: rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    };

    return new Response(JSON.stringify({
      north_star: northStar,
      dispute_rate: disputeRate,
      full_acceptance_rate: fullAcc,
      buyer_repeat_rate: repeat,
      review_avg: reviewAvg,
      totals,
      // Tek satırlı: ilk satır objesi olarak dön
      farmer_activation: first(farmerActivation as unknown[] | null),
      listing_offer_rate: first(listingOfferRate as unknown[] | null),
      farmer_sellthrough: first(farmerSellthrough as unknown[] | null),
      farmer_verified_pct: first(farmerVerifiedPct as unknown[] | null),
      buyer_activation: first(buyerActivation as unknown[] | null),
      horeca_order_frequency: first(horecaOrderFrequency as unknown[] | null),
      supply_density: first(supplyDensity as unknown[] | null),
      offer_conversion: first(offerConversion as unknown[] | null),
      // Çok satırlı: array
      farmer_gmv: farmerGmv,
      farmer_retention: farmerRetention,
      buyer_aov_segment: buyerAovSegment,
      buyer_gmv_retention: buyerGmvRetention,
      buyer_seller_ratio: buyerSellerRatio,
      price_vs_market: priceVsMarket,
      crop_demand_heatmap: cropDemandHeatmap,
    }), { status: 200, headers: { ...CORS, "content-type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...CORS, "content-type": "application/json" },
    });
  }
});
