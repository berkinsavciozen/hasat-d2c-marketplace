import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  ORDER_INTENT_SURFACES,
  isOrdersDisabledError,
  resolveOrderGate,
} from "./order-gate-core.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("fail-closed: yükleniyor, hata veya bozuk yanıt → callerAllowed=false", () => {
  assert.equal(resolveOrderGate({ isSuccess: false }).callerAllowed, false);
  assert.equal(resolveOrderGate({ isSuccess: true, data: null }).callerAllowed, false);
  assert.equal(resolveOrderGate({ isSuccess: true, data: {} }).callerAllowed, false);
  assert.equal(resolveOrderGate({ isSuccess: true, data: { callerAllowed: "true" } }).callerAllowed, false);
  assert.equal(resolveOrderGate({ isSuccess: true, data: { ordersEnabled: false, callerAllowed: false } }).callerAllowed, false);
});

test("allowlist geçişi: callerAllowed=true → izin", () => {
  assert.deepEqual(resolveOrderGate({ isSuccess: true, data: { ordersEnabled: false, callerAllowed: true } }), {
    ordersEnabled: false,
    callerAllowed: true,
  });
  assert.equal(resolveOrderGate({ isSuccess: true, data: { ordersEnabled: true, callerAllowed: true } }).callerAllowed, true);
});

test("surface değerleri backend sözleşmesiyle birebir", () => {
  const backend = ["recipe_product", "discover", "storefront", "producer", "offer_route", "subscription"];
  assert.deepEqual([...ORDER_INTENT_SURFACES].sort(), [...backend].sort());
  const mig = read("../../../supabase/migrations/20260928170656_ord_gate_storefront_mode.sql");
  for (const s of ORDER_INTENT_SURFACES) assert.ok(mig.includes(`'${s}'`), s);
});

test("route'larda kullanılan tüm surface değerleri geçerli", () => {
  const files = [
    "s.$slug.tsx",
    "buyer.discover.tsx",
    "buyer.producer.$id.tsx",
    "buyer.product.$farmerId.$crop.tsx",
    "buyer.offer.$listingId.tsx",
    "buyer.subscription.$producerId.tsx",
    "buyer.negotiation.$offerId.tsx",
    "buyer.pay.$offerId.tsx",
    "buyer.payment.tsx",
    "farmer.orders.index.tsx",
  ];
  for (const f of files) {
    const src = read(`../../routes/${f}`);
    const used = [...src.matchAll(/surface:\s*"([a-z_]+)"/g)].map((m) => m[1]);
    assert.ok(used.length > 0, `${f} olay kaydetmiyor`);
    for (const s of used) assert.ok((ORDER_INTENT_SURFACES as readonly string[]).includes(s), `${f}: ${s}`);
  }
  for (const f of ["buyer.negotiation.$offerId.tsx", "buyer.pay.$offerId.tsx", "buyer.payment.tsx", "farmer.orders.index.tsx"]) {
    assert.match(read(`../../routes/${f}`), /surface:\s*"offer_route"/, f);
  }
});

test("ORDERS_DISABLED eşlemesi", () => {
  assert.equal(isOrdersDisabledError({ message: "ORDERS_DISABLED" }), true);
  assert.equal(isOrdersDisabledError({ message: "other" }), false);
  assert.equal(isOrdersDisabledError(null), false);
});

test("Talep Et akışı kapıdan bağımsız kalır", () => {
  const modal = read("../../components/hasat/CropRequestModal.tsx");
  assert.ok(!modal.includes("order-gate"), "CropRequestModal kapıya bağlanmamalı");
  const product = read("../../routes/buyer.product.$farmerId.$crop.tsx");
  assert.match(product, /<CropRequestModal/);
  assert.match(product, /setRequestOpen\(true\)/);
  const discover = read("../../routes/buyer.discover.tsx");
  assert.match(discover, /<CropRequestModal/);
});
