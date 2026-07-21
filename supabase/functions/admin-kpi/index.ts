import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, content-type, authorization, apikey",
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

    const [northStar, disputeRate, fullAcc, repeat, reviewAvg, orderBase] = await Promise.all([
      safe(supabase.from("v_kpi_north_star").select("*").order("month", { ascending: true })),
      safe(supabase.from("v_kpi_dispute_rate").select("*").order("month", { ascending: true })),
      safe(supabase.from("v_kpi_full_acceptance_rate").select("*").order("month", { ascending: true })),
      safe(supabase.from("v_kpi_buyer_repeat_rate").select("*")),
      safe(supabase.from("v_kpi_review_avg").select("*").is("reviewee_id", null)),
      safe(supabase.from("v_kpi_order_base").select("amount,is_realized_sale").eq("is_realized_sale", true)),
    ]);

    const rows = (orderBase as Array<{ gmv: number | string | null }> | null) ?? [];
    const totals = {
      order_count: rows.length,
      total_gmv: rows.reduce((s, r) => s + (Number(r.gmv) || 0), 0),
    };

    return new Response(JSON.stringify({
      north_star: northStar,
      dispute_rate: disputeRate,
      full_acceptance_rate: fullAcc,
      buyer_repeat_rate: repeat,
      review_avg: reviewAvg,
      totals,
    }), { status: 200, headers: { ...CORS, "content-type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...CORS, "content-type": "application/json" },
    });
  }
});
