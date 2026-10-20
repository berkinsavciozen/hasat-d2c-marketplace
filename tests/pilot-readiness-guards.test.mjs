import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const migrationPath = "supabase/migrations/20261020143319_pilot_readiness_guards.sql";

test("new farmer signup is server-gated by an active farmer invite", async () => {
  const [migration, login, join] = await Promise.all([
    read(migrationPath),
    read("src/routes/login.tsx"),
    read("src/routes/join.tsx"),
  ]);

  assert.match(migration, /v_requested_role text := coalesce\([\s\S]*'buyer'\)/);
  assert.match(migration, /if v_role = 'farmer'::public\.user_role then/);
  assert.match(migration, /p\.referral_code = v_invite_code/);
  assert.match(migration, /p\.deleted_at is null/);
  assert.match(migration, /message = 'farmer_invite_required'/);
  assert.match(migration, /message = 'farmer_invite_invalid'/);
  assert.match(migration, /referred_by, tier, premium_until/);

  assert.match(login, /Davet kodu/);
  assert.match(login, /loadStoredFarmerInvite\(\)/);
  assert.match(login, /lookupReferralOwner\(normalizedInviteCode\)/);
  assert.match(login, /invite_code: normalizedInviteCode/);
  assert.match(login, /Mevcut üretici hesabınız varsa boş bırakabilirsiniz/);
  assert.match(join, /Yeni üretici kaydı için geçerli bir davet bağlantısı\s+gerekiyor/);
  assert.doesNotMatch(join, /yine de kayıt olabilirsin/);
});

test("active listings require complete commercial and traceability inputs", async () => {
  const migration = await read(migrationPath);

  for (const constraint of [
    "listings_active_quantity_positive",
    "listings_active_price_positive",
    "listings_active_min_order_valid",
    "listings_active_parcel_required",
    "listings_active_photo_required",
  ]) {
    assert.match(migration, new RegExp(constraint));
  }
  assert.match(migration, /status <> 'active'::public\.listing_status or quantity > 0/);
  assert.match(migration, /min_order > 0 and min_order <= quantity/);
  assert.match(migration, /coalesce\(cardinality\(photo_urls\), 0\) > 0/);
});

test("public showcase views expose SELECT only and use a security barrier", async () => {
  const migration = await read(migrationPath);

  assert.match(
    migration,
    /alter view public\.public_farmer_profiles set \(security_barrier = true\)/,
  );
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant select[\s\S]*to anon, authenticated/);
});

test("buyer demand records enforce paired quantity and unit plus sane ranges", async () => {
  const migration = await read(migrationPath);

  assert.match(migration, /crop_requests_quantity_unit_pair/);
  assert.match(migration, /quantity is null and unit is null/);
  assert.match(migration, /crop_requests_target_price_positive/);
  assert.match(migration, /crop_requests_date_range_valid/);
});
