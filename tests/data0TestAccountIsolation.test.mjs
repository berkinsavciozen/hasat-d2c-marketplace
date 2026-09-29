import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../supabase/migrations/20260929120000_data0_test_account_isolation.sql", import.meta.url),
  "utf8",
);

test("DATA-0 marks allowlisted principals without hard-coded generated IDs", () => {
  assert.match(sql, /add column if not exists is_test_account boolean not null default false/i);
  assert.match(sql, /from public\.orders_allowlist a where a\.user_id = p\.id/i);
  assert.doesNotMatch(sql, /5f225eb8|1833b9f9/i);
});

test("the administrative marker is not client writable", () => {
  assert.match(sql, /revoke insert \(is_test_account\), update \(is_test_account\)[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/i);
  assert.match(sql, /revoke all on function private\.is_test_account\(uuid\) from public/i);
});

test("storefront projections and listing RLS hide test farmers fail closed", () => {
  assert.match(sql, /create policy "DATA-0 isolate test listings"[\s\S]*as restrictive[\s\S]*for select/i);
  assert.match(sql, /not private\.is_test_account\(farmer_id\)[\s\S]*or private\.is_test_account\(auth\.uid\(\)\)/i);
  for (const view of ["public_farmer_profiles", "public_parcel_cards", "public_certifications"]) {
    assert.match(sql, new RegExp(`create or replace view public\\.${view}`));
  }
  assert.match(sql, /not p\.is_test_account or private\.is_test_account\(auth\.uid\(\)\)/i);
  assert.match(sql, /not pr\.is_test_account or private\.is_test_account\(auth\.uid\(\)\)/i);
});

test("all direct launch KPI sources exclude marked principals", () => {
  const views = [
    "v_kpi_order_base",
    "v_kpi_farmer_activation",
    "v_kpi_farmer_sellthrough",
    "v_kpi_farmer_verified_pct",
    "v_kpi_listing_offer_rate",
    "v_kpi_offer_conversion",
    "v_kpi_buyer_activation",
    "v_kpi_review_avg",
    "v_kpi_supply_density",
    "v_kpi_order_intent_blocked",
    "v_kpi_crop_demand_heatmap",
    "v_kpi_recipe_funnel",
    "v_kpi_recipe_funnel_by_recipe",
  ];
  for (const view of views) {
    const start = sql.indexOf(`create or replace view public.${view}`);
    assert.notEqual(start, -1, `${view} missing`);
    const next = sql.indexOf("create or replace view public.", start + 1);
    const body = sql.slice(start, next === -1 ? sql.length : next);
    assert.match(body, /is_test_account/i, `${view} lacks DATA-0 exclusion`);
  }
});

test("migration preserves the acceptance fixture and performs no deletes", () => {
  assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
  assert.doesNotMatch(sql, /\btruncate\s+(?:table\s+)?public\./i);
  assert.doesNotMatch(sql, /drop table|drop column/i);
});
